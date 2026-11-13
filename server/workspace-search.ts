import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { entityNames } from '../shared/model.js';
import { searchWorkspace, type WorkspaceSearchContext } from '../shared/workspace-search.js';
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

/** Computed synchronously with the state that exposes it, before compacting its snapshot. Never writes on a read. */
export function workspaceSearchIdentity(store: Store): WorkspaceSearchContext | null {
  return store.ready ? identityForReadyStore(store) : null;
}

function requireSearchIdentity(store: Store): WorkspaceSearchContext {
  if (!store.ready) throw new AppError(409, 'Activa una copia verificada antes de buscar.');
  const identity = identityForReadyStore(store);
  if (!identity) throw new AppError(409, 'No se pudo identificar esta instalación. Actualiza el espacio antes de buscar.');
  return identity;
}

function readSearchData(store: Store, identity: WorkspaceSearchContext) {
  const spec = store.spec!, records = store.records();
  const revision = createHash('sha256').update(JSON.stringify({ contextRevision: identity.contextRevision, spec, records })).digest('hex');
  return { spec, records, source: { ...identity, revision } };
}
export function registerWorkspaceSearch(app: FastifyInstance, store: Store) {
  app.get('/api/v2/search', async request => {
    const query = querySchema.parse(request.query), identity = requireSearchIdentity(store);
    if (query.contextRevision && query.contextRevision !== identity.contextRevision) throw new AppError(409, 'La copia cambió. Actualiza el espacio de trabajo antes de buscar.');
    const data = readSearchData(store, identity);
    if (query.revision && query.revision !== data.source.revision) throw new AppError(409, 'La copia cambió durante la búsqueda. Actualiza los resultados antes de continuar.');
    const entities = query.entities ? z.array(z.enum(entityNames)).min(1).max(4).refine(values => new Set(values).size === values.length).parse(query.entities.split(',')) : undefined;
    try { return { source: data.source, ...searchWorkspace({ spec: data.spec, records: data.records, query: query.q, entities, offset: query.offset, limit: query.limit }) }; }
    catch (error) { if (error instanceof RangeError || error instanceof TypeError) throw new AppError(422, error.message); throw error; }
  });
  // Opening uses current full values, never the clipped search preview. Reject a stale query atomically before returning a record.
  app.get('/api/v2/search-record', async request => {
    const query = z.object({ entity: z.enum(entityNames), id: z.string().min(1).max(500), captureId: z.string().min(1).max(800), revision: revisionSchema }).strict().parse(request.query);
    const identity = requireSearchIdentity(store);
    const changedCopy = 'La copia cambió. Actualiza la búsqueda antes de abrir el registro.';
    if (query.captureId !== identity.captureId) throw new AppError(409, changedCopy);
    const data = readSearchData(store, identity);
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
