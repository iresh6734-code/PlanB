import { sourceReading, type SourceReading, type SourceRecord, type SourceStop, MAX_READING_RECORDS, SOURCE_READING_FORMAT } from '../shared/source-reading.js';
import { defaultPipedrivePolicy, normalizePipedriveRecord, parsePipedriveItemBody, pipedriveUpdateOrder, parsePipedrivePage, PIPEDRIVE_OBJECTS, pipedriveCursorPattern, type PipedriveObject, type PipedrivePolicy } from '../shared/pipedrive-source.js';
import { createSourceReadTransport, type TransportResult } from './source-read-transport.js';

// LECTOR DE PIPEDRIVE (unidad Claude B · CLAUDE-SOURCE-PIPEDRIVE). Solo lectura, API v2 con paginación por cursor (`cursor`, `limit`; `additional_data.next_cursor`, null = fin) sobre
// /api/v2/{deals,persons,organizations,activities} y consulta por ID solo de oportunidades (/api/v2/deals/{id}). Reutiliza el modelo neutro `SourceReading` y el transporte común de lectura (ambos de la unidad
// Zendesk, sin modificarlos): aquí solo hay orden de llamadas, límites y la regla de cobertura. El cursor siguiente se CONSTRUYE (codificado) desde un valor validado: nunca se sigue una URL de la
// respuesta; la credencial va SIEMPRE en una cabecera (`x-api-token` o `Authorization: Bearer`), jamás en la URL. Sin reintentos: un 429 se informa y se detiene.
//
// MODOS. `live` construye https://{dominio}.pipedrive.com y produce el proveedor `pipedrive`; NO se ejecuta contra Pipedrive en esta unidad (solo con un fetch simulado). `local-test` apunta a un bucle local,
// produce `pipedrive-fixture` y exige una cuenta `fixture-*`: una lectura de ensayo jamás se presenta como Pipedrive real. El `accountId` live es el dominio CONFIGURADO, no una identidad observada.
const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const loopbackPattern = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;
const itemPath = /^\/api\/v2\/deals\/[1-9]\d{0,15}$/;
const listPaths: Record<string, PipedriveObject> = Object.fromEntries((Object.keys(PIPEDRIVE_OBJECTS) as PipedriveObject[]).map(key => [PIPEDRIVE_OBJECTS[key].path, key]));

export type PipedriveMode = { kind: 'live'; companyDomain: string } | { kind: 'local-test'; origin: string; accountId: string };
export interface PipedriveLimits { pageSize: number; maxPages: number; maxRecords: number; maxBodyBytes: number; requestTimeoutMs: number; totalTimeoutMs: number }
export const defaultPipedriveLimits: PipedriveLimits = { pageSize: 100, maxPages: 5, maxRecords: MAX_READING_RECORDS, maxBodyBytes: 2 * 1024 * 1024, requestTimeoutMs: 10_000, totalTimeoutMs: 60_000 };
export type PipedriveCredential = { scheme: 'api-token' | 'bearer'; token: string };

export interface PipedriveSourceOptions {
  mode: PipedriveMode;
  /** Se pide en cada petición; no se guarda ni se muestra. `api-token` va en `x-api-token`; `bearer` (OAuth) en `Authorization`. Nunca en la URL. */
  credential: () => PipedriveCredential;
  fetch?: typeof fetch;
  now?: () => number;
  limits?: Partial<PipedriveLimits>;
  policy?: Partial<PipedrivePolicy>;
}
export interface PipedriveSource {
  readonly provider: string;
  readonly accountId: string;
  read(object: PipedriveObject, options?: { signal?: AbortSignal }): Promise<SourceReading>;
  readDeal(id: string | number, options?: { signal?: AbortSignal }): Promise<SourceReading>;
}

function resolveAccount(mode: PipedriveMode): { origin: string; provider: string; accountId: string } {
  if (mode.kind === 'live') {
    if (!domainPattern.test(mode.companyDomain)) throw new Error('DOMINIO_NO_VALIDO');
    return { origin: 'https://' + mode.companyDomain + '.pipedrive.com', provider: 'pipedrive', accountId: mode.companyDomain };
  }
  if (!loopbackPattern.test(mode.origin)) throw new Error('ORIGEN_DE_ENSAYO_NO_LOCAL');
  if (!/^fixture-[a-z0-9-]{1,48}$/.test(mode.accountId)) throw new Error('CUENTA_DE_ENSAYO_NO_VALIDA');
  return { origin: mode.origin, provider: 'pipedrive-fixture', accountId: mode.accountId };
}

function listPath(object: PipedriveObject, pageSize: number, cursor: string | null) {
  return PIPEDRIVE_OBJECTS[object].path + '?limit=' + pageSize + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
}
function allowQuery(params: URLSearchParams, pathname: string) {
  const object = listPaths[pathname]; const names = [...params.keys()];
  if (!object) return names.length === 0;
  if (new Set(names).size !== names.length || !params.has('limit')) return false;
  for (const [name, value] of params) {
    if (name === 'limit') { if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > PIPEDRIVE_OBJECTS[object].maxPage) return false; }
    else if (name === 'cursor') { if (!pipedriveCursorPattern.test(value)) return false; }
    else return false;
  }
  return true;
}

export function createPipedriveSource(options: PipedriveSourceOptions): PipedriveSource {
  const account = resolveAccount(options.mode);
  const limits = { ...defaultPipedriveLimits, ...options.limits }, policy: PipedrivePolicy = { ...defaultPipedrivePolicy, ...options.policy };
  if (!Number.isInteger(limits.pageSize) || limits.pageSize < 1 || limits.pageSize > 500 || !Number.isInteger(limits.maxPages) || limits.maxPages < 1 || limits.maxPages > 20
    || !Number.isInteger(limits.maxRecords) || limits.maxRecords < 1 || limits.maxRecords > MAX_READING_RECORDS || limits.maxBodyBytes > 8 * 1024 * 1024) throw new Error('LIMITES_NO_VALIDOS');
  const clock = options.now ?? Date.now, stamp = () => new Date(clock()).toISOString();
  const allowOrigin = options.mode.kind === 'live' ? (origin: string) => origin === account.origin && /^https:\/\/[a-z0-9-]+\.pipedrive\.com$/.test(origin) : (origin: string) => origin === account.origin && loopbackPattern.test(origin);
  const transport = (maxRequests: number, signal?: AbortSignal) => createSourceReadTransport({
    origin: account.origin, allowOrigin, allowPath: path => path in listPaths || itemPath.test(path), allowQuery,
    credential: () => { const credential = options.credential(); return credential.scheme === 'bearer' ? { name: 'authorization', value: 'Bearer ' + credential.token } : { name: 'x-api-token', value: credential.token }; },
    fetch: options.fetch, maxRequests, maxBodyBytes: limits.maxBodyBytes, requestTimeoutMs: limits.requestTimeoutMs, totalTimeoutMs: limits.totalTimeoutMs, signal,
  });

  function build(parts: {
    object: PipedriveObject; mode: 'listing' | 'lookup'; target: { kind: 'sale'; remoteId: string } | null; startedAt: string; pages: number; requests: number; records: SourceRecord[]; stop: SourceStop | null;
    skipped: { unknownValue: number; malformed: number; duplicates: number }; retry: number | null;
  }): SourceReading {
    const skippedTotal = parts.skipped.unknownValue + parts.skipped.malformed + parts.skipped.duplicates;
    const coverage = parts.stop === null && skippedTotal === 0 ? 'complete' : parts.pages === 0 ? 'unavailable' : 'partial';
    return sourceReading.parse({
      format: SOURCE_READING_FORMAT, provider: account.provider, accountId: account.accountId, objectType: parts.object, mode: parts.mode, target: parts.target,
      startedAt: parts.startedAt, completedAt: stamp(), coverage, stoppedBy: parts.stop, pages: parts.pages, requests: parts.requests,
      records: coverage === 'unavailable' ? [] : parts.records, skipped: parts.skipped, retryAfterSeconds: parts.retry,
    });
  }

  async function read(object: PipedriveObject, call: { signal?: AbortSignal } = {}): Promise<SourceReading> {
    const startedAt = stamp(), http = transport(limits.maxPages, call.signal), pageSize = Math.min(limits.pageSize, PIPEDRIVE_OBJECTS[object].maxPage);
    const byId = new Map<string, { record: SourceRecord; order: string }>(), skipped = { unknownValue: 0, malformed: 0, duplicates: 0 }, seen = new Set<string>();
    let cursor: string | null = null, pages = 0, stop: SourceStop | null = null, retry: number | null = null;
    for (;;) {
      if (pages >= limits.maxPages) { stop = 'page-budget'; break; }
      const result: TransportResult = await http.get(listPath(object, pageSize, cursor));
      if (!result.ok) { stop = result.failure; retry = result.retryAfterSeconds; break; }
      const page = parsePipedrivePage(result.body);
      if (!page) { stop = 'malformed'; break; }
      pages++;
      for (const raw of page.data) {
        const item = normalizePipedriveRecord(object, raw, account, policy);
        if (item.kind === 'unknown-value') { skipped.unknownValue++; continue; }
        if (item.kind === 'malformed') { skipped.malformed++; continue; }
        const previous = byId.get(item.record.remoteId);
        const order = pipedriveUpdateOrder(raw);   // R3: instante público + precisión submilisegundo; solo elige el duplicado más reciente
        if (previous) { skipped.duplicates++; if (order > previous.order) byId.set(item.record.remoteId, { record: item.record, order }); continue; }
        if (byId.size >= limits.maxRecords) { stop = 'record-budget'; continue; }
        byId.set(item.record.remoteId, { record: item.record, order });
      }
      if (stop) break;
      if (page.nextCursor === null) break;                                  // ÚNICO camino hacia `complete`: next_cursor null explícito
      if (seen.has(page.nextCursor) || page.nextCursor === cursor) { stop = 'cursor-loop'; break; }
      seen.add(page.nextCursor); cursor = page.nextCursor;
    }
    return build({ object, mode: 'listing', target: null, startedAt, pages, requests: http.stats().requests, records: [...byId.values()].map(entry => entry.record), stop, skipped, retry });
  }

  async function readDeal(id: string | number, call: { signal?: AbortSignal } = {}): Promise<SourceReading> {
    const remoteId = String(id);
    if (!/^[1-9]\d{0,15}$/.test(remoteId) || !Number.isSafeInteger(Number(remoteId))) throw new Error('ID_DE_OPORTUNIDAD_NO_VALIDO');
    const startedAt = stamp(), http = transport(1, call.signal), target = { kind: 'sale' as const, remoteId };
    const skipped = { unknownValue: 0, malformed: 0, duplicates: 0 };
    const result = await http.get('/api/v2/deals/' + remoteId);
    const requests = http.stats().requests;
    if (!result.ok) return build({ object: 'deal', mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: result.failure, skipped, retry: result.retryAfterSeconds });
    const raw = parsePipedriveItemBody(result.body);
    const item = raw ? normalizePipedriveRecord('deal', raw, account, policy) : ({ kind: 'malformed' } as const);
    if (item.kind === 'record' && item.record.remoteId === remoteId) return build({ object: 'deal', mode: 'lookup', target, startedAt, pages: 1, requests, records: [item.record], stop: null, skipped, retry: null });
    if (item.kind === 'unknown-value') return build({ object: 'deal', mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: 'unsupported-value', skipped: { ...skipped, unknownValue: 1 }, retry: null });
    return build({ object: 'deal', mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: 'malformed', skipped, retry: null });
  }

  return { provider: account.provider, accountId: account.accountId, read, readDeal };
}
