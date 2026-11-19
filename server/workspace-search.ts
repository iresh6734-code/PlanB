import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { entityNames, type AppSpec, type CrmRecord } from '../shared/model.js';
import { prepareWorkspaceSearch, searchWorkspace, type PreparedSearchRecord, type PreparedWorkspaceSearch, type WorkspaceSearchContext } from '../shared/workspace-search.js';
import { AppError, type Store } from './store.js';

const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const querySchema = z.object({ q: z.string().trim().min(2).max(160), entities: z.string().min(1).max(80).optional(), offset: z.coerce.number().int().min(0).max(10000).default(0), limit: z.coerce.number().int().min(1).max(50).default(25), revision: revisionSchema.optional(), contextRevision: revisionSchema.optional() }).strict();
function identityForReadyStore(store: Store): WorkspaceSearchContext | null {
  const instance = z.string().uuid().safeParse(store.get('instanceId', null));
  if (!instance.success) return null;
  const snapshot = store.snapshot!;
  const contextRevision = createHash('sha256').update(JSON.stringify({ instanceId: instance.data, snapshot,
    generation: store.generation, sessionId: store.get('sessionId', null) })).digest('hex');
  return { instanceId: instance.data, captureId: snapshot.id + ':' + snapshot.capturedAt,
    accountId: snapshot.source.accountId, capturedAt: snapshot.capturedAt, isTestData: snapshot.source.isTestData, contextRevision };
}

// CLAUDE-SEARCH-PERF-R · Reutilizar lo que solo depende de filas que no han cambiado.
// La clave sale del texto ALMACENADO de cada fila, como recoveryCache en store.ts, venga el cambio de esta conexión, de otra o de
// otro proceso. Fila sellada (`enc1:` + base64(IV 12 B · etiqueta GCM 16 B · cuerpo)): IV y etiqueta, más la longitud. El IV es
// aleatorio en cada escritura y la etiqueta autentica el cuerpo con ese IV, así que otro contenido da otra clave. Fila en claro
// (base en memoria o heredada): el texto entero. Aquí solo se guardan esas claves, la identidad pública, la revisión y el índice
// normalizado de la última copia leída (con el JSON de cada registro como clave de reutilización); nunca texto cifrado completo.
const ROW_KEY = "CASE WHEN substr(value,1,5)='enc1:' THEN substr(value,1,48)||'#'||octet_length(value) ELSE value END";
const IDENTITY_KEYS = ['instanceId', 'snapshot', 'spec', 'generation', 'reconciliation', 'sessionId'] as const;
interface SearchCache {
  identity?: { stored: (string | null)[]; ready: boolean; value: WorkspaceSearchContext | null };
  data?: { contextRevision: string; stored: string[]; spec: AppSpec; records: CrmRecord[]; revision: string; prepared: PreparedWorkspaceSearch; byContent: Map<string, PreparedSearchRecord> };
}
const caches = new WeakMap<Store, SearchCache>();
const cacheFor = (store: Store) => { let cache = caches.get(store); if (!cache) caches.set(store, cache = {}); return cache; };
const sameText = (a: readonly (string | null)[], b: readonly (string | null)[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Clave de las filas de meta que deciden `ready` y la identidad, leída en una sola consulta. */
function storedIdentityRows(store: Store): (string | null)[] {
  const rows = store.db.prepare('SELECT key,' + ROW_KEY + ' AS k FROM meta WHERE key IN (' + IDENTITY_KEYS.map(() => '?').join(',') + ')').all(...IDENTITY_KEYS) as { key: string; k: string }[];
  const byKey = new Map(rows.map(row => [row.key, row.k]));
  return IDENTITY_KEYS.map(key => byKey.get(key) ?? null);
}
/** Clave del spec y de los registros, en el mismo orden que Store.records(). */
function storedDataRows(store: Store): string[] {
  const spec = store.db.prepare('SELECT ' + ROW_KEY + ' AS k FROM meta WHERE key=?').get('spec') as { k: string } | undefined;
  return [spec?.k ?? '', ...(store.db.prepare('SELECT ' + ROW_KEY + ' AS k FROM records ORDER BY rowid').all() as { k: string }[]).map(row => row.k)];
}

/** Igual que `store.ready ? identityForReadyStore(store) : null`, sin volver a analizar la captura si sus filas no cambiaron. */
function cachedIdentity(store: Store): { ready: boolean; identity: WorkspaceSearchContext | null } {
  const cache = cacheFor(store), stored = storedIdentityRows(store);
  if (!cache.identity || !sameText(cache.identity.stored, stored)) {
    const ready = store.ready;
    cache.identity = { stored, ready, value: ready ? identityForReadyStore(store) : null };
  }
  return { ready: cache.identity.ready, identity: cache.identity.value ? { ...cache.identity.value } : null };
}

/** Computed synchronously with the state that exposes it, before compacting its snapshot. Never writes on a read. */
export function workspaceSearchIdentity(store: Store): WorkspaceSearchContext | null {
  return cachedIdentity(store).identity;
}

function requireSearchIdentity(store: Store): WorkspaceSearchContext {
  const { ready, identity } = cachedIdentity(store);
  if (!ready) throw new AppError(409, 'Activa una copia verificada antes de buscar.');
  if (!identity) throw new AppError(409, 'No se pudo identificar esta instalación. Actualiza el espacio antes de buscar.');
  return identity;
}

export function readWorkspaceVersion(store: Store): number {
  const row = store.db.prepare('PRAGMA main.data_version').get();
  if (typeof row?.data_version !== 'number') throw new AppError(503, 'No se pudo comprobar la versión de la copia.');
  return row.data_version;
}

function readSearchData(store: Store, identity: WorkspaceSearchContext, version: number) {
  const cache = cacheFor(store), key = storedDataRows(store);
  // Los registros se siguen leyendo por Store.records() en cada petición actual (su lectura y sus errores no cambian, 207).
  const spec = store.spec!, records = store.records();
  // En esta secuencia síncrona solo otra conexión puede confirmar una escritura. Comprobar su versión antes de usar la caché
  // evita combinar la identidad anterior con los registros nuevos sin volver a recorrer todas las filas.
  if (readWorkspaceVersion(store) !== version) {
    caches.delete(store);
    throw new AppError(409, 'La copia cambió durante la lectura. Reintenta la búsqueda.');
  }
  const hit = cache.data;
  if (hit && hit.contextRevision === identity.contextRevision && sameText(hit.stored, key))
    return { spec: hit.spec, records: hit.records, prepared: hit.prepared, source: { ...identity, revision: hit.revision } };
  // Misma revisión que JSON.stringify({contextRevision, spec, records}): un array se serializa como sus elementos unidos por comas.
  const parts = records.map(record => JSON.stringify(record));
  const revision = createHash('sha256').update('{"contextRevision":' + JSON.stringify(identity.contextRevision) + ',"spec":' + JSON.stringify(spec)
    + ',"records":[' + parts.join(',') + ']}').digest('hex');
  // Tras editar unas fichas solo se normalizan esas: un registro con el MISMO JSON bajo el MISMO spec reutiliza su índice.
  // La clave es el contenido leído en esta petición, no la posición de la fila, así que no depende de escrituras concurrentes.
  const reusable = hit && hit.stored[0] === key[0] ? hit.byContent : undefined;
  const reused = new Map<PreparedSearchRecord, string>();
  const prepared = prepareWorkspaceSearch(spec, records, (_record, index) => {
    const item = reusable?.get(parts[index]); if (item) reused.set(item, parts[index]); return item;
  });
  const indexOf = new Map(records.map((record, index) => [record, index]));
  const byContent = new Map<string, PreparedSearchRecord>();
  for (const item of prepared.items) {
    const index = indexOf.get(item.record);
    byContent.set(reused.get(item) ?? parts[index!], item);
  }
  cache.data = { contextRevision: identity.contextRevision, stored: key, spec, records, revision, prepared, byContent };
  return { spec, records, prepared, source: { ...identity, revision } };
}
export function registerWorkspaceSearch(app: FastifyInstance, store: Store) {
  app.get('/api/v2/search', async request => {
    const query = querySchema.parse(request.query);
    const version = readWorkspaceVersion(store), identity = requireSearchIdentity(store);
    if (query.contextRevision && query.contextRevision !== identity.contextRevision) throw new AppError(409, 'La copia cambió. Actualiza el espacio de trabajo antes de buscar.');
    const data = readSearchData(store, identity, version);
    if (query.revision && query.revision !== data.source.revision) throw new AppError(409, 'La copia cambió durante la búsqueda. Actualiza los resultados antes de continuar.');
    const entities = query.entities ? z.array(z.enum(entityNames)).min(1).max(4).refine(values => new Set(values).size === values.length).parse(query.entities.split(',')) : undefined;
    try { return { source: data.source, ...searchWorkspace({ spec: data.spec, records: data.records, prepared: data.prepared, query: query.q, entities, offset: query.offset, limit: query.limit }) }; }
    catch (error) { if (error instanceof RangeError || error instanceof TypeError) throw new AppError(422, error.message); throw error; }
  });
  // Opening uses current full values, never the clipped search preview. Reject a stale query atomically before returning a record.
  app.get('/api/v2/search-record', async request => {
    const query = z.object({ entity: z.enum(entityNames), id: z.string().min(1).max(500), captureId: z.string().min(1).max(800), revision: revisionSchema }).strict().parse(request.query);
    const version = readWorkspaceVersion(store), identity = requireSearchIdentity(store);
    const changedCopy = 'La copia cambió. Actualiza la búsqueda antes de abrir el registro.';
    if (query.captureId !== identity.captureId) throw new AppError(409, changedCopy);
    const data = readSearchData(store, identity, version);
    if (query.revision !== data.source.revision) throw new AppError(409, changedCopy);
    const record = data.records.find(record => record.entity === query.entity && record.id === query.id);
    if (!record) throw new AppError(404, 'El registro ya no está disponible en esta copia.');
    const definition = data.spec.entities.find(entity => entity.id === record.entity)!;
    const related = definition.fields.flatMap(field => {
      if (field.type !== 'reference' || !field.referenceEntity) return [];
      const value = record.values[field.key];
      if (value === undefined || value === null || value === '') return [];
      const found = data.records.find(item => item.entity === field.referenceEntity && item.id === String(value));
      return found ? [found] : [];
    });
    return { source: data.source, record, related };
  });
}
