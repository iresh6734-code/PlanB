import { sourceReading, type SourceReading, type SourceRecord, type SourceStop, MAX_READING_RECORDS, SOURCE_READING_FORMAT } from '../shared/source-reading.js';
import { defaultZendeskPolicy, isZendeskCursor, normalizeZendeskTicket, parseZendeskTicketBody, parseZendeskTicketsPage, ZENDESK_KIND, type ZendeskPolicy } from '../shared/zendesk-source.js';
import { createSourceReadTransport, type TransportResult } from './source-read-transport.js';

// LECTOR DE TICKETS DE ZENDESK (unidad Claude B · CLAUDE-SOURCE-ZENDESK). Solo lectura, con paginación por cursor (GET /api/v2/tickets, `page[size]` ≤ 100, `page[after]`) y consulta por ID
// (GET /api/v2/tickets/{id}). La adaptación de datos está en `shared/zendesk-source.ts`; aquí solo hay orden de llamadas, límites y la regla de cobertura. El cursor siguiente se CONSTRUYE a
// partir de `meta.after_cursor` validado: nunca se sigue una URL que venga en la respuesta. No hay reintentos: ante un 429 se informa `Retry-After` y se detiene.
//
// MODOS. `live` construye https://{subdominio}.zendesk.com y produce el proveedor `zendesk`; en esta unidad NO se ejecuta contra Zendesk (solo se prueba con un fetch simulado, sin red).
// `local-test` apunta a un servidor de bucle local, produce el proveedor `zendesk-fixture` y exige una cuenta `fixture-*`: una lectura de ensayo jamás se presenta como Zendesk real.
const subdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const loopbackPattern = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;
const ticketsPath = '/api/v2/tickets', ticketPath = /^\/api\/v2\/tickets\/[1-9]\d{0,15}$/;

export type ZendeskMode = { kind: 'live'; subdomain: string } | { kind: 'local-test'; origin: string; accountId: string };
export interface ZendeskLimits { pageSize: number; maxPages: number; maxRecords: number; maxBodyBytes: number; requestTimeoutMs: number; totalTimeoutMs: number }
export const defaultZendeskLimits: ZendeskLimits = { pageSize: 100, maxPages: 5, maxRecords: MAX_READING_RECORDS, maxBodyBytes: 2 * 1024 * 1024, requestTimeoutMs: 10_000, totalTimeoutMs: 60_000 };

export interface ZendeskSourceOptions {
  mode: ZendeskMode;
  /** Token OAuth de acceso (Bearer). Se pide en cada petición y no se guarda ni se muestra. Las claves de API están marcadas como obsoletas por Zendesk y no se admiten. */
  credential: () => string;
  fetch?: typeof fetch;
  now?: () => number;
  limits?: Partial<ZendeskLimits>;
  policy?: Partial<ZendeskPolicy>;
}
export interface ZendeskSource {
  readonly provider: string;
  readonly accountId: string;
  readTickets(options?: { signal?: AbortSignal }): Promise<SourceReading>;
  readTicket(id: string | number, options?: { signal?: AbortSignal }): Promise<SourceReading>;
}

function resolveAccount(mode: ZendeskMode): { origin: string; provider: string; accountId: string } {
  if (mode.kind === 'live') {
    if (!subdomainPattern.test(mode.subdomain)) throw new Error('SUBDOMINIO_NO_VALIDO');
    return { origin: 'https://' + mode.subdomain + '.zendesk.com', provider: 'zendesk', accountId: mode.subdomain };
  }
  if (!loopbackPattern.test(mode.origin)) throw new Error('ORIGEN_DE_ENSAYO_NO_LOCAL');
  if (!/^fixture-[a-z0-9-]{1,48}$/.test(mode.accountId)) throw new Error('CUENTA_DE_ENSAYO_NO_VALIDA');
  return { origin: mode.origin, provider: 'zendesk-fixture', accountId: mode.accountId };
}

function listPath(pageSize: number, cursor: string | null) {
  return ticketsPath + '?page[size]=' + pageSize + '&sort=id' + (cursor ? '&page[after]=' + encodeURIComponent(cursor) : '');
}
function allowQuery(params: URLSearchParams, pathname: string) {
  const names = [...params.keys()];
  if (pathname !== ticketsPath) return names.length === 0;
  if (new Set(names).size !== names.length) return false;
  for (const [name, value] of params) {
    if (name === 'page[size]') { if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) return false; }
    else if (name === 'page[after]') { if (!isZendeskCursor(value)) return false; }
    else if (name === 'sort') { if (value !== 'id') return false; }
    else return false;
  }
  return params.has('page[size]');
}

export function createZendeskSource(options: ZendeskSourceOptions): ZendeskSource {
  const account = resolveAccount(options.mode);
  const limits = { ...defaultZendeskLimits, ...options.limits }, policy: ZendeskPolicy = { ...defaultZendeskPolicy, ...options.policy };
  if (!Number.isInteger(limits.pageSize) || limits.pageSize < 1 || limits.pageSize > 100 || !Number.isInteger(limits.maxPages) || limits.maxPages < 1 || limits.maxPages > 20
    || !Number.isInteger(limits.maxRecords) || limits.maxRecords < 1 || limits.maxRecords > MAX_READING_RECORDS || limits.maxBodyBytes > 8 * 1024 * 1024) throw new Error('LIMITES_NO_VALIDOS');
  const clock = options.now ?? Date.now, stamp = () => new Date(clock()).toISOString();
  const allowOrigin = options.mode.kind === 'live' ? (origin: string) => origin === account.origin && /^https:\/\/[a-z0-9-]+\.zendesk\.com$/.test(origin) : (origin: string) => origin === account.origin && loopbackPattern.test(origin);
  const transport = (maxRequests: number, signal?: AbortSignal) => createSourceReadTransport({
    origin: account.origin, allowOrigin, allowPath: path => path === ticketsPath || ticketPath.test(path), allowQuery,
    credential: () => { const token = options.credential(); return { name: 'authorization', value: 'Bearer ' + token }; },
    fetch: options.fetch, maxRequests, maxBodyBytes: limits.maxBodyBytes, requestTimeoutMs: limits.requestTimeoutMs, totalTimeoutMs: limits.totalTimeoutMs, signal,
  });

  function build(parts: {
    mode: 'listing' | 'lookup'; target: { kind: typeof ZENDESK_KIND; remoteId: string } | null; startedAt: string; pages: number; requests: number; records: SourceRecord[]; stop: SourceStop | null;
    skipped: { unknownValue: number; malformed: number; duplicates: number }; retry: number | null;
  }): SourceReading {
    const skippedTotal = parts.skipped.unknownValue + parts.skipped.malformed + parts.skipped.duplicates;
    const coverage = parts.stop === null && skippedTotal === 0 ? 'complete' : parts.pages === 0 ? 'unavailable' : 'partial';
    return sourceReading.parse({
      format: SOURCE_READING_FORMAT, provider: account.provider, accountId: account.accountId, objectType: 'ticket', mode: parts.mode, target: parts.target,
      startedAt: parts.startedAt, completedAt: stamp(), coverage, stoppedBy: parts.stop, pages: parts.pages, requests: parts.requests,
      records: coverage === 'unavailable' ? [] : parts.records, skipped: parts.skipped, retryAfterSeconds: parts.retry,
    });
  }

  async function readTickets(call: { signal?: AbortSignal } = {}): Promise<SourceReading> {
    const startedAt = stamp(), http = transport(limits.maxPages, call.signal);
    const byId = new Map<string, SourceRecord>(), skipped = { unknownValue: 0, malformed: 0, duplicates: 0 }, seen = new Set<string>();
    let cursor: string | null = null, pages = 0, stop: SourceStop | null = null, retry: number | null = null;
    for (;;) {
      if (pages >= limits.maxPages) { stop = 'page-budget'; break; }
      const result: TransportResult = await http.get(listPath(limits.pageSize, cursor));
      if (!result.ok) { stop = result.failure; retry = result.retryAfterSeconds; break; }
      const page = parseZendeskTicketsPage(result.body);
      if (!page) { stop = 'malformed'; break; }
      pages++;
      for (const raw of page.tickets) {
        const item = normalizeZendeskTicket(raw, account, policy);
        if (item.kind === 'unknown-value') { skipped.unknownValue++; continue; }
        if (item.kind === 'malformed') { skipped.malformed++; continue; }
        const previous = byId.get(item.record.remoteId);
        if (previous) { skipped.duplicates++; if ((item.record.updatedAt ?? '') > (previous.updatedAt ?? '')) byId.set(item.record.remoteId, item.record); continue; }
        if (byId.size >= limits.maxRecords) { stop = 'record-budget'; continue; }
        byId.set(item.record.remoteId, item.record);
      }
      if (stop) break;
      if (!page.hasMore) break;                                        // ÚNICO camino hacia `complete`: fin explícito de la paginación
      if (!page.afterCursor) { stop = 'missing-pagination'; break; }
      if (seen.has(page.afterCursor) || page.afterCursor === cursor) { stop = 'cursor-loop'; break; }
      seen.add(page.afterCursor); cursor = page.afterCursor;
    }
    return build({ mode: 'listing', target: null, startedAt, pages, requests: http.stats().requests, records: [...byId.values()], stop, skipped, retry });
  }

  async function readTicket(id: string | number, call: { signal?: AbortSignal } = {}): Promise<SourceReading> {
    const remoteId = String(id);
    if (!/^[1-9]\d{0,15}$/.test(remoteId) || !Number.isSafeInteger(Number(remoteId))) throw new Error('ID_DE_TICKET_NO_VALIDO');
    const startedAt = stamp(), http = transport(1, call.signal), target = { kind: ZENDESK_KIND, remoteId };
    const skipped = { unknownValue: 0, malformed: 0, duplicates: 0 };
    const result = await http.get(ticketsPath + '/' + remoteId);
    const requests = http.stats().requests;
    if (!result.ok) return build({ mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: result.failure, skipped, retry: result.retryAfterSeconds });
    const raw = parseZendeskTicketBody(result.body);
    const item = raw ? normalizeZendeskTicket(raw, account, policy) : ({ kind: 'malformed' } as const);
    if (item.kind === 'record' && item.record.remoteId === remoteId) return build({ mode: 'lookup', target, startedAt, pages: 1, requests, records: [item.record], stop: null, skipped, retry: null });
    if (item.kind === 'unknown-value') return build({ mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: 'unsupported-value', skipped: { ...skipped, unknownValue: 1 }, retry: null });
    return build({ mode: 'lookup', target, startedAt, pages: 0, requests, records: [], stop: 'malformed', skipped, retry: null });
  }

  return { provider: account.provider, accountId: account.accountId, readTickets, readTicket };
}
