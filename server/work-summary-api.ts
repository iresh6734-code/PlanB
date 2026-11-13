import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SnapshotSchema } from '../shared/model.js';
import { contextKey } from '../shared/local-task-focus.js';
import { classify, KEY_PREFIX, MAX_RECORDS, type Current, type StoredEntry } from '../shared/task-intent-journal.js';
import { WORK_SUMMARY_FORMAT, WORK_SUMMARY_ROUTE, WorkSummarySchema, type WorkSummary } from '../shared/work-summary.js';
import { getLocalAuthorizationCapture } from './security.js';
import type { Store } from './store.js';
import { storeIntentStorage } from './task-intent-storage.js';
import { workspaceSearchIdentity } from './workspace-search.js';

export interface WorkSummaryApiOptions {
  /** True only when the host has actually connected its durable attempt writer for this scope.
   * An empty journal, installed model, or readable database is NOT evidence of coverage.
   * Until A4 is mounted the host must return false. No request can supply this decision. */
  covers(current: Readonly<Current>): boolean | Promise<boolean>;
  clock?: () => number;
  /** Alternate reader must refer to this same server-owned journal. Primarily useful for controlled adapters/tests. */
  readEntries?: () => Promise<StoredEntry[]>;
}

interface ScopeRead {
  scope: WorkSummary['scope']; current: Current | null; revision: string;
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
const entriesSchema = z.array(z.object({ key: z.string().startsWith(KEY_PREFIX), raw: z.string().nullable(), unreadable: z.boolean().optional() }).strict()).max(MAX_RECORDS);
const LOCKED = { error: 'Desbloquea tu copia local para continuar.' };
const CHANGED = { error: 'La copia o su trabajo local cambió durante la consulta. Actualiza el contexto.' };

function readScope(store: Store): ScopeRead {
  // total_changes catches our connection's writes, including A→B→A. data_version catches commits from other connections.
  // A conservative conflict on an unrelated write is preferable to publishing a stale journal count.
  const own = store.db.prepare('SELECT total_changes() AS n').get() as { n: number };
  const external = store.db.prepare('PRAGMA data_version').get() as { data_version: number };
  const stamp = own.n + ':' + external.data_version;
  const instanceId = z.string().uuid().parse(store.get('instanceId', null));
  if (!store.ready) return { scope: { kind: 'none', context: null }, current: null, revision: 'none:' + instanceId + ':' + stamp };
  const workspace = workspaceSearchIdentity(store);
  if (!workspace) throw new Error('unreadable-workspace');
  const snapshot = SnapshotSchema.parse(store.snapshot), generation = store.generation;
  if (!generation || !Number.isFinite(Date.parse(generation.generatedAt))) throw new Error('unreadable-generation');
  // Same canonical snapshot pin as continuity-evidence. Generation remains part of the journal's full context key.
  const encoded = JSON.stringify(canonical(snapshot));
  if (Buffer.byteLength(encoded) > 32 * 1024 * 1024) throw new Error('snapshot-limit');
  return {
    scope: { kind: 'active-copy', context: 'capture:' + createHash('sha256').update(encoded).digest('hex') },
    current: { installId: instanceId, contextKey: contextKey({ instanceId, snapshotId: snapshot.id, capturedAt: snapshot.capturedAt,
      captureStartedAt: snapshot.captureStartedAt ?? null, accountId: snapshot.source.accountId ?? null, generatedAt: generation.generatedAt }) },
    revision: workspace.contextRevision + ':' + stamp,
  };
}

/** Read-only adapter for contract 255 and journal 208. Requires createBaseApp security.
 * Does not register itself in main, enable the A4 writer, prune, send, or settle any attempt.
 * Captures original authorization and checks it plus workspace identity after all awaited reads and body preparation.
 */
export function registerWorkSummaryApi(app: FastifyInstance, store: Store, options: WorkSummaryApiOptions): void {
  if (typeof options?.covers !== 'function') throw new Error('La cobertura del escritor debe declararse explícitamente.');
  const captureAuthorization = getLocalAuthorizationCapture(app);
  const readEntries = options.readEntries ?? (() => storeIntentStorage(store).readAll());
  const provenance: WorkSummary['provenance'] = store.filename === ':memory:' ? 'memory-only' : 'durable';
  const clock = options.clock ?? Date.now;
  const at = () => new Date(clock()).toISOString();
  const unavailable = (scope: WorkSummary['scope']): WorkSummary => ({ format: WORK_SUMMARY_FORMAT, status: 'unavailable', scope,
    at: new Date().toISOString(), origin: 'work-journal', provenance, coverage: 'none', counts: null, quarantine: null });
  app.get(WORK_SUMMARY_ROUTE, {
    exposeHeadRoute: false,
    onSend: async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const vary = String(reply.getHeader('vary') ?? '').split(',').map(value => value.trim()).filter(Boolean);
      if (!vary.some(value => value.toLowerCase() === 'cookie')) vary.push('Cookie');
      reply.header('Vary', vary.join(', ')); return payload;
    },
  }, async (request, reply) => {
    const originalAuthorization = captureAuthorization(request.headers.cookie);
    const authorized = () => { try { return originalAuthorization() === true; } catch { return false; } };
    const error = (code: number, body: { error: string }) => authorized() ? reply.code(code).send(body) : reply.code(401).send(LOCKED);
    if (!authorized()) return reply.code(401).send(LOCKED);
    if (!z.object({}).strict().safeParse(request.query).success || Number(request.headers['content-length'] ?? 0) !== 0 || request.headers['transfer-encoding']) {
      return error(422, { error: 'Esta consulta no admite parámetros ni cuerpo.' });
    }
    let initial: ScopeRead;
    try { initial = readScope(store); }
    catch { return authorized() ? reply.code(503).send(unavailable({ kind: 'none', context: null })) : reply.code(401).send(LOCKED); }
    const publish = (code: number, body: WorkSummary) => {
      // Parsing precedes the final identity and authorization checks; no waits remain after those checks.
      const parsed = WorkSummarySchema.parse(body);
      if (!authorized()) return reply.code(401).send(LOCKED);
      let latest: ScopeRead;
      try { latest = readScope(store); } catch { return error(503, { error: 'No se pudo comprobar la copia local.' }); }
      if (!authorized()) return reply.code(401).send(LOCKED);
      if (latest.revision !== initial.revision) return reply.code(409).send(CHANGED);
      return reply.code(code).send(parsed);
    };
    try {
      const base: WorkSummary = { format: WORK_SUMMARY_FORMAT, status: 'read', scope: initial.scope, at: at(), origin: 'work-journal', provenance,
        coverage: 'none', counts: null, quarantine: null };
      if (!initial.current) return publish(200, base);
      const covered = await options.covers(Object.freeze({ ...initial.current }));
      if (covered !== true && covered !== false) throw new Error('invalid-coverage');
      if (!covered) return publish(200, base);
      // Bound before decrypting native rows, even if a manually altered database bypassed the writer's quota.
      if (!options.readEntries) {
        const row = store.db.prepare('SELECT count(*) AS n FROM meta WHERE substr(key,1,?)=?').get(KEY_PREFIX.length, KEY_PREFIX) as { n: number };
        if (row.n > MAX_RECORDS) throw new Error('journal-limit');
      }
      const entries = entriesSchema.parse(await readEntries());
      if (new Set(entries.map(entry => entry.key)).size !== entries.length) throw new Error('duplicate-journal-keys');
      const classified = classify(entries, initial.current);
      const count = (cls: (typeof classified)[number]['cls']) => classified.filter(entry => entry.cls === cls).length;
      const unreadable = count('quarantined');
      return publish(200, { ...base, at: at(), coverage: unreadable ? 'partial' : 'complete',
        counts: { drafts: count('restorable-draft'), unknownOutcome: count('unknown-outcome'), settled: count('settled'), otherContext: count('other-context') }, quarantine: { unreadable } });
    } catch {
      return publish(503, unavailable(initial.scope));
    }
  });
}
