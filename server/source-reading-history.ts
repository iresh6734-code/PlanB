import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sourceHistoryBinding, sourceHistoryCursor, sourceHistoryKey, sourceHistoryQuery, sourceHistoryResponse, SOURCE_READING_HISTORY_NOTICE, SOURCE_READING_HISTORY_PATH as PATH, type SourceHistoryBinding } from '../shared/source-reading-history.js';
import { readSourceReadingJournal } from './source-reading-journal.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

export interface SourceHistoryOptions {
  /** Trusted host binding, synchronous and local. Never grant a scope by echoing client filters. */
  scopeForRequest: (request: FastifyRequest) => SourceHistoryBinding | null;
}
const registrations = new WeakMap<FastifyInstance, { store: Store; scope: SourceHistoryOptions['scopeForRequest'] }>();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const changed = () => new AppError(409, 'El contexto o historial cambió. Actualiza la consulta local.', { code: 'SOURCE_HISTORY_CHANGED' });
const unavailable = () => new AppError(503, 'No se pudo comprobar el historial local. Se conserva sin repararlo.', { code: 'SOURCE_HISTORY_UNAVAILABLE' });
const forbidden = () => new AppError(403, 'La fuente solicitada no pertenece al ámbito autorizado.', { code: 'SOURCE_HISTORY_SCOPE' });

/** Explicit opt-in for fixture-only local history. No main/App mount, provider access or writes. */
export function registerSourceReadingHistory(app: FastifyInstance, store: Store, options: SourceHistoryOptions) {
  const prior = registrations.get(app);
  if (prior) { if (prior.store !== store || prior.scope !== options.scopeForRequest) throw Error('History already registered with another binding'); return; }
  if (typeof options.scopeForRequest !== 'function') throw Error('Explicit source history binding required');
  const capture = getLocalAuthorizationCapture(app);
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.split('?')[0] === PATH) {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const vary = String(reply.getHeader('Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean);
      if (!vary.some(value => value.toLowerCase() === 'cookie')) vary.push('Cookie'); reply.header('Vary', vary.join(', '));
    }
    return payload;
  });
  app.get(PATH, { exposeHeadRoute: false }, request => {
    const authorized = capture(request.headers.cookie);
    const check = () => { if (!authorized()) throw new AppError(401, 'Desbloquea tu copia local para continuar.'); };
    check(); const query = sourceHistoryQuery.parse(request.query);
    const context = () => {
      check(); let current: ReturnType<typeof workspaceSearchIdentity>;
      try { current = workspaceSearchIdentity(store); } catch { check(); throw unavailable(); }
      check();
      if (!current || current.contextRevision !== query.contextRevision) throw changed();
      if (!current.isTestData) throw forbidden(); return current;
    };
    const initial = context();
    const scope = () => {
      check(); let raw: unknown;
      try { raw = options.scopeForRequest(request); } catch { context(); throw unavailable(); }
      // A rejected Promise from a mistaken host callback must not become an
      // unhandled rejection; asynchronous bindings are never adopted.
      if (raw instanceof Promise) { void raw.catch(() => undefined); context(); throw unavailable(); }
      context(); if (raw === null) throw forbidden();
      let parsed: ReturnType<typeof sourceHistoryBinding.safeParse>;
      try { parsed = sourceHistoryBinding.safeParse(raw); } catch { context(); throw unavailable(); }
      context(); if (!parsed.success) throw unavailable();
      if (parsed.data.instanceId !== initial.instanceId || parsed.data.contextRevision !== initial.contextRevision) throw changed(); return parsed.data;
    };
    const binding = scope();
    const selected = sourceHistoryKey.parse({ provider: query.provider, accountId: query.accountId, objectType: query.objectType, mode: query.mode,
      target: query.mode === 'lookup' ? { kind: query.role, remoteId: query.remoteId } : null });
    const filterRevision = hash(selected);
    if (filterRevision !== hash(binding.source)) throw forbidden();
    let offset = 0, cursor: ReturnType<typeof sourceHistoryCursor.parse> | null = null;
    if (query.cursor) {
      try {
        const bytes = Buffer.from(query.cursor, 'base64url'); if (bytes.toString('base64url') !== query.cursor) throw Error();
        cursor = sourceHistoryCursor.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      } catch { throw new AppError(422, 'El cursor del historial no es válido.', { code: 'SOURCE_HISTORY_CURSOR' }); }
      if (cursor.instanceId !== initial.instanceId || cursor.contextRevision !== initial.contextRevision || cursor.scopeRevision !== binding.scopeRevision
        || cursor.filterRevision !== filterRevision || cursor.limit !== query.limit) throw changed(); offset = cursor.offset;
    }
    const journal = readSourceReadingJournal(store); context(); if (journal.status !== 'ready') throw unavailable();
    if (journal.instanceId !== initial.instanceId || cursor && cursor.journalRevision !== journal.revision) throw changed();
    const matched = journal.entries.filter(entry => hash({ provider: entry.reading.provider, accountId: entry.reading.accountId,
      objectType: entry.reading.objectType, mode: entry.reading.mode, target: entry.reading.target }) === filterRevision);
    if (offset > matched.length) throw new AppError(422, 'El cursor no corresponde a una página del historial.', { code: 'SOURCE_HISTORY_CURSOR' });
    const page = matched.slice(offset, offset + query.limit), nextOffset = offset + page.length;
    const nextCursor = nextOffset < matched.length ? Buffer.from(JSON.stringify(sourceHistoryCursor.parse({
      format: 'planb-source-history-cursor-v1', instanceId: initial.instanceId, contextRevision: initial.contextRevision,
      scopeRevision: binding.scopeRevision, filterRevision, journalRevision: journal.revision, offset: nextOffset, limit: query.limit,
    }))).toString('base64url') : null;
    const result = sourceHistoryResponse.parse({ format: 'planb-source-reading-history-v1', storageOnly: true, notice: SOURCE_READING_HISTORY_NOTICE,
      instanceId: initial.instanceId, contextRevision: initial.contextRevision, scopeRevision: binding.scopeRevision, source: selected,
      journalRevision: journal.revision, provenance: journal.provenance,
      entries: page.map(({ sequence, receiptId, readingDigest, savedAt, reading }) => ({ sequence, receiptId, readingDigest, savedAt,
        startedAt: reading.startedAt, completedAt: reading.completedAt, coverage: reading.coverage, stoppedBy: reading.stoppedBy,
        storedRecords: reading.coverage === 'unavailable' ? null : reading.records.length, pages: reading.pages, requests: reading.requests,
        skipped: reading.skipped, retryAfterSeconds: reading.retryAfterSeconds })),
      page: { offset, limit: query.limit, total: matched.length, nextCursor },
    });
    const finalBinding = scope(); if (hash(finalBinding) !== hash(binding)) throw changed();
    const finalJournal = readSourceReadingJournal(store); context();
    if (finalJournal.status !== 'ready') throw unavailable();
    if (finalJournal.revision !== journal.revision || finalJournal.instanceId !== journal.instanceId) throw changed();
    check(); return result;
  });
  registrations.set(app, { store, scope: options.scopeForRequest });
}
