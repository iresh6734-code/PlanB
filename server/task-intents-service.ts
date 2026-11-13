import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TaskIntentScope, TaskIntentExecute, TaskIntentSummary, TaskIntentExecution, TaskIntentDetail,
  TaskIntentCheck, TaskIntentList, TaskIntentListQuery, TaskIntentAccept, TaskIntentAbandon,
  TASK_INTENT_RESPONSE_BYTES, taskIntentJsonBytes,
} from '../shared/task-intents.js';
import { TaskRevisionResult } from '../shared/task-revision.js';
import { validateRecord } from '../shared/model.js';
import { encodeRecord, decodeRecord, KEY_PREFIX, MAX_RECORD_BYTES, MAX_RECORDS, type IntentRecord } from '../shared/task-intent-journal.js';
import { contextKey } from '../shared/local-task-focus.js';
import { createTaskIntentClaims, fingerprintTaskIntent, type TaskIntentClaim, type ClaimDescriptor, type ClaimWriteResult } from './task-intent-claims.js';
import { readTaskRevision, writeTaskRevision } from './task-revision.js';
import { workspaceSearchIdentity } from './workspace-search.js';
import { AppError, type Store } from './store.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const issue = (status: number, code: string) => new AppError(status,
  status === 401 ? 'Desbloquea tu copia local para continuar.'
    : status === 404 ? 'El intento no está disponible en esta copia.'
      : status === 503 ? 'No se pudo comprobar el intento. Se conserva sin reenviarlo.'
        : 'El intento o la copia cambiaron. Actualiza y revisa antes de decidir.', { code });
const unavailable = () => issue(503, 'TASK_INTENT_STORAGE_UNAVAILABLE');
const sameScope = (a: TaskIntentScope, b: TaskIntentScope) => JSON.stringify(a) === JSON.stringify(b);
const norm = (value: unknown) => value === undefined || value === '' ? null : value;
const cursorSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().min(1).max(10000), limit: z.number().int().min(1).max(25) }).strict();

/** Current ready context, independently computed from Store, never authorized by client fields. */
export function currentTaskIntentScope(store: Store): TaskIntentScope {
  const search = workspaceSearchIdentity(store), snapshot = store.snapshot, generation = store.generation;
  if (!search || !snapshot || !generation) throw issue(409, 'TASK_INTENT_CONTEXT_CHANGED');
  if (!search.isTestData) throw issue(403, 'TASK_INTENT_FICTION_ONLY');
  return TaskIntentScope.parse({ identity: { instanceId: search.instanceId, snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt, captureStartedAt: snapshot.captureStartedAt ?? null,
    accountId: snapshot.source.accountId ?? null, generatedAt: generation.generatedAt }, contextRevision: search.contextRevision });
}

export interface TaskIntentServiceOptions {
  now?: () => string;
  /** Dependency injection for isolated crash/barrier tests. No environment switches or public endpoints. */
  afterPersist?: () => void | Promise<void>;
  afterWrite?: () => void | Promise<void>;
  writer?: typeof writeTaskRevision;
}

/** One service per protected host/Store. It never dispatches during list/detail/check or startup. */
export function createTaskIntentService(store: Store, options: TaskIntentServiceOptions = {}) {
  const claims = createTaskIntentClaims(store), active = new Set<string>();
  const writer = options.writer ?? writeTaskRevision, now = options.now ?? (() => new Date().toISOString());
  function time(previous?: string) {
    const value = z.iso.datetime().parse(now());
    return previous && Date.parse(value) < Date.parse(previous) ? previous : value;
  }
  function guard(scope: TaskIntentScope, authorized: () => boolean) {
    if (!authorized()) throw issue(401, 'TASK_INTENT_LOCKED');
    let current: TaskIntentScope;
    try { current = currentTaskIntentScope(store); } catch (error) { if (!authorized()) throw issue(401, 'TASK_INTENT_LOCKED'); throw error; }
    if (!authorized()) throw issue(401, 'TASK_INTENT_LOCKED');
    if (!sameScope(current, scope)) throw issue(409, 'TASK_INTENT_CONTEXT_CHANGED');
  }
  function summary(claim: TaskIntentClaim): TaskIntentSummary {
    return TaskIntentSummary.parse({ attemptId: claim.descriptor.attemptId, taskId: claim.descriptor.taskId,
      scope: { identity: claim.descriptor.identity, contextRevision: claim.descriptor.contextRevision },
      seq: claim.seq, phase: claim.phase, outcome: claim.outcome, provenance: claim.provenance,
      createdAt: claim.createdAt, updatedAt: claim.updatedAt, detailAvailable: claim.hasDetail, acknowledgement: claim.receipt });
  }
  function load(id: string, scope: TaskIntentScope, authorized: () => boolean) {
    guard(scope, authorized);
    const state = claims.inspect();
    if (state.status === 'unavailable') throw unavailable();
    const claim = state.claims.find(c => c.descriptor.attemptId === id);
    if (!claim || !sameScope(summary(claim).scope, scope)) throw issue(404, 'TASK_INTENT_NOT_FOUND');
    let record: IntentRecord | null = null, raw: string | null = null;
    if (claim.hasDetail) {
      raw = store.get<string | null>(KEY_PREFIX + id, null);
      const parsed = raw === null ? null : decodeRecord(raw, KEY_PREFIX + id);
      if (!parsed?.ok) throw unavailable(); record = parsed.record;
    }
    guard(scope, authorized); return { claim, record, raw };
  }
  function requireWrite(result: ClaimWriteResult, beforeDispatch = false) {
    if (result.status === 'ok') return;
    if (result.issue === 'claim-capacity' || result.issue === 'intent-capacity') throw issue(409, 'TASK_INTENT_CAPACITY');
    if (result.status === 'conflict') throw issue(409, 'TASK_INTENT_CHANGED');
    if (beforeDispatch) throw new AppError(503,
      'Esta petición no envió la tarea. El intento puede haberse conservado: compruébalo antes de iniciar otro.',
      { code: 'TASK_INTENT_NOT_DISPATCHED' });
    throw unavailable();
  }
  function execution(id: string, scope: TaskIntentScope, authorized: () => boolean, created: boolean, writeResult: z.infer<typeof TaskRevisionResult> | null = null) {
    const operation = summary(load(id, scope, authorized).claim);
    const value = { format: 'planb-task-intent-execution-v1' as const, created, replayed: !created, operation,
      writeResult, writeResultOmitted: writeResult ? null : 'not-retained' as 'not-retained' | 'response-too-large' | null };
    if (writeResult && taskIntentJsonBytes(value) > TASK_INTENT_RESPONSE_BYTES) {
      value.writeResult = null; value.writeResultOmitted = 'response-too-large';
    }
    guard(scope, authorized); return TaskIntentExecution.parse(value);
  }
  async function execute(input: unknown, authorized: () => boolean) {
    const request = TaskIntentExecute.parse(input), scope = TaskIntentScope.parse({ identity: request.identity, contextRevision: request.contextRevision });
    return executeParsed(request, scope, authorized);
  }
  async function executeParsed(request: TaskIntentExecute, scope: TaskIntentScope, authorized: () => boolean) {
    guard(scope, authorized);
    const { values, ...fields } = request;
    const descriptor: ClaimDescriptor = { ...fields, fingerprint: fingerprintTaskIntent(request) };
    const found = claims.lookup(descriptor); guard(scope, authorized);
    if (found.kind === 'unavailable') throw unavailable();
    if (found.kind === 'wrong-scope') throw issue(404, 'TASK_INTENT_NOT_FOUND');
    if (found.kind === 'reused') throw issue(409, 'TASK_INTENT_REUSED');
    if (found.kind === 'expired') throw new AppError(409, 'El detalle venció. Este intento no se vuelve a enviar.',
      { code: 'TASK_INTENT_DETAIL_EXPIRED', replayed: true, operation: summary(found.claim) });
    if (found.kind === 'replay') return execution(request.attemptId, scope, authorized, false);
    const before = readTaskRevision(store, request.taskId);
    if (before.revision !== request.expectedRevision) throw issue(409, 'TASK_REVISION_CHANGED');
    const proposed = { ...before.record, values: { ...before.record.values, ...values } };
    const errors = validateRecord(store.spec!, proposed, before.record);
    for (const field of store.spec!.entities.find(e => e.id === 'tasks')!.fields) {
      const value = proposed.values[field.key];
      if (field.type === 'reference' && value && field.referenceEntity && !store.record(field.referenceEntity, String(value))) errors[field.key] = 'El registro relacionado no existe.';
    }
    if (Object.keys(errors).length) throw new AppError(422, 'Revisa los campos señalados.', errors);
    const at = time(), baseline = Object.fromEntries(Object.keys(values).map(key => [key, before.record.values[key] ?? null]));
    const record: IntentRecord = { v: 1, id: request.attemptId, installId: scope.identity.instanceId,
      contextKey: contextKey(scope.identity), taskId: request.taskId, phase: 'attempt', outcome: null, provenance: null,
      patch: values, baseline, revision: request.expectedRevision, createdAt: at, updatedAt: at, evidence: null, seq: 1 };
    const raw = encodeRecord(record);
    if (Buffer.byteLength(raw, 'utf8') > MAX_RECORD_BYTES) throw issue(413, 'TASK_INTENT_TOO_LARGE');
    const persisted = claims.writeIntent(descriptor, raw, null, { assertCurrent: () => guard(scope, authorized) });
    guard(scope, authorized); requireWrite(persisted, true);
    active.add(request.attemptId);
    try {
      try { await options.afterPersist?.(); } catch { return execution(request.attemptId, scope, authorized, true); }
      guard(scope, authorized);
      if (readTaskRevision(store, request.taskId).revision !== request.expectedRevision) throw issue(409, 'TASK_REVISION_CHANGED');
      try {
        const result = TaskRevisionResult.parse(writer(store, request.taskId, { expectedRevision: request.expectedRevision, values: structuredClone(values) }));
        if (result.current.record.id !== request.taskId || result.current.instanceId !== scope.identity.instanceId
          || result.current.captureId !== scope.identity.snapshotId || result.current.capturedAt !== scope.identity.capturedAt) throw unavailable();
        await options.afterWrite?.(); guard(scope, authorized);
        const settled: IntentRecord = { ...record, seq: 2, phase: 'settled', outcome: 'acknowledged', provenance: 'server-ack', updatedAt: time(at) };
        const saved = claims.writeIntent(descriptor, encodeRecord(settled), raw, {
          assertCurrent: () => guard(scope, authorized), receipt: { changed: result.changed, resultingRevision: result.current.revision },
        });
        if (saved.status !== 'ok') return execution(request.attemptId, scope, authorized, true);
        return execution(request.attemptId, scope, authorized, true, result);
      } catch { return execution(request.attemptId, scope, authorized, true); }
    } finally { active.delete(request.attemptId); }
  }
  // Installation-wide quarantine, like classify208: corrupt rows have no trustworthy context.
  // Valid unclaimed legacy rows are never adopted or returned as A4 operations.
  function inventory(claimIds: ReadonlySet<string>) {
    try {
      const sizes = store.db.prepare('SELECT key,length(CAST(value AS BLOB)) AS size FROM meta WHERE substr(key,1,?)=? ORDER BY key LIMIT ?')
        .all(KEY_PREFIX.length, KEY_PREFIX, MAX_RECORDS + 1) as { key: string; size: number }[];
      if (sizes.length > MAX_RECORDS || sizes.some(row => row.size > MAX_RECORD_BYTES * 8 + 4096)
        || sizes.reduce((n, row) => n + row.size, 0) > 64 * 1024 * 1024) return null;
      const hash = createHash('sha256'); let quarantined = 0;
      for (const row of sizes) {
        const encoded = store.db.prepare('SELECT value FROM meta WHERE key=?').get(row.key) as { value: string } | undefined;
        if (!encoded) return null;
        hash.update(JSON.stringify([row.key, encoded.value]));
        // A failure to decrypt means this inventory could not be read completely.
        const value = store.decode<unknown>(encoded.value);
        const decoded = typeof value === 'string' ? decodeRecord(value, row.key) : null;
        if (!decoded?.ok) quarantined++;
        // 208 has no full A4 descriptor/pin. An otherwise valid row without a claim
        // cannot be attributed to this inventory, even when its ID looks familiar.
        else if (!claimIds.has(decoded.record.id)) return null;
      }
      return { quarantined, revision: hash.digest('hex') };
    } catch { return null; }
  }
  const storageStamp = () => ({
    local: (store.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n,
    external: (store.db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version,
  });
  function list(input: unknown, authorized: () => boolean) {
    const query = TaskIntentListQuery.parse(input), scope = TaskIntentScope.parse({ identity: query.identity, contextRevision: query.contextRevision });
    guard(scope, authorized);
    const unreadable = () => TaskIntentList.parse({ format: 'planb-task-intent-list-v1', scope, status: 'unavailable', entries: [], quarantined: null, otherContexts: null, nextCursor: null });
    let stamp: ReturnType<typeof storageStamp>;
    try { stamp = storageStamp(); } catch { guard(scope, authorized); return unreadable(); }
    const state = claims.inspect(), journal = state.status === 'unavailable' ? null : inventory(new Set(state.claims.map(c => c.descriptor.attemptId))); guard(scope, authorized);
    if (state.status === 'unavailable' || journal === null) return unreadable();
    const all = state.claims.map(summary), selected = all.filter(c => sameScope(c.scope, scope)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.attemptId.localeCompare(b.attemptId));
    const revision = digest({ selected, journalRevision: journal.revision, otherContexts: all.length - selected.length }); let offset = 0;
    if (query.cursor) {
      let cursor: z.infer<typeof cursorSchema>;
      try { const bytes = Buffer.from(query.cursor, 'base64url'); if (bytes.toString('base64url') !== query.cursor) throw Error(); cursor = cursorSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
      catch { throw issue(422, 'TASK_INTENT_CURSOR_INVALID'); }
      if (cursor.revision !== revision || cursor.limit !== query.limit) throw issue(409, 'TASK_INTENT_LIST_CHANGED'); offset = cursor.offset;
      if (offset >= selected.length) throw issue(422, 'TASK_INTENT_CURSOR_INVALID');
    }
    const entries = selected.slice(offset, offset + query.limit), next = offset + entries.length;
    const nextCursor = next < selected.length ? Buffer.from(JSON.stringify({ revision, offset: next, limit: query.limit })).toString('base64url') : null;
    guard(scope, authorized);
    let after: ReturnType<typeof storageStamp>;
    try { after = storageStamp(); } catch { guard(scope, authorized); return unreadable(); }
    guard(scope, authorized);
    if (stamp.local !== after.local || stamp.external !== after.external) throw issue(409, 'TASK_INTENT_LIST_CHANGED');
    return TaskIntentList.parse({ format: 'planb-task-intent-list-v1', scope, status: 'read', entries, quarantined: journal.quarantined, otherContexts: all.length - selected.length, nextCursor });
  }
  function detail(id: string, input: unknown, authorized: () => boolean) {
    const scope = TaskIntentScope.parse(input), { claim, record } = load(id, scope, authorized);
    const value = { format: 'planb-task-intent-detail-v1' as const, operation: summary(claim),
      payload: record ? { baseline: record.baseline, values: record.patch, expectedRevision: claim.descriptor.expectedRevision } : null,
      payloadIssue: record ? null : 'detail-expired' as 'detail-expired' | 'response-too-large' | null };
    if (taskIntentJsonBytes(value) > TASK_INTENT_RESPONSE_BYTES) { value.payload = null; value.payloadIssue = 'response-too-large'; }
    guard(scope, authorized); return TaskIntentDetail.parse(value);
  }
  function check(id: string, input: unknown, authorized: () => boolean) {
    const scope = TaskIntentScope.parse(input), { claim, record } = load(id, scope, authorized);
    const base = { format: 'planb-task-intent-check-v1' as const, operation: summary(claim), readAt: time() };
    const unavailableRead = (reason: 'detail-expired' | 'read-failed' | 'response-too-large' | 'task-missing') => TaskIntentCheck.parse({ ...base,
      evidence: reason === 'task-missing' ? 'missing' : 'unavailable', reason, record: null, taskRevision: null });
    if (!record) return unavailableRead('detail-expired');
    let current: ReturnType<typeof readTaskRevision>;
    try { current = readTaskRevision(store, claim.descriptor.taskId); }
    catch (error) { guard(scope, authorized); return unavailableRead(error instanceof AppError && error.status === 404 ? 'task-missing' : 'read-failed'); }
    guard(scope, authorized);
    const keys = Object.keys(record.patch), matches = (values: Record<string, unknown>) => keys.every(key => norm(current.record.values[key]) === norm(values[key]));
    const evidence = matches(record.patch) ? 'applied' : matches(record.baseline) ? 'unchanged' : 'diverged';
    const value = { ...base, evidence, reason: null, record: current.record, taskRevision: current.revision };
    return taskIntentJsonBytes(value) > TASK_INTENT_RESPONSE_BYTES ? unavailableRead('response-too-large') : TaskIntentCheck.parse(value);
  }
  function decide(id: string, input: unknown, authorized: () => boolean, accept: boolean) {
    const body = accept ? TaskIntentAccept.parse(input) : TaskIntentAbandon.parse(input);
    const scope = TaskIntentScope.parse({ identity: body.identity, contextRevision: body.contextRevision });
    const { claim, record, raw } = load(id, scope, authorized);
    if (active.has(id)) throw issue(409, 'TASK_INTENT_IN_PROGRESS');
    if (!record || raw === null || claim.phase !== 'attempt' || record.seq !== body.expectedSeq) throw issue(409, 'TASK_INTENT_CHANGED');
    let observedRevision: string | null = null;
    if (accept) {
      const evidence = check(id, scope, authorized); observedRevision = evidence.taskRevision;
      if (evidence.evidence !== 'applied' || observedRevision !== (body as z.infer<typeof TaskIntentAccept>).expectedTaskRevision) throw issue(409, 'TASK_INTENT_EVIDENCE_CHANGED');
    }
    const at = time(record.updatedAt);
    const next: IntentRecord = { ...record, seq: record.seq + 1, updatedAt: at, phase: 'settled',
      outcome: accept ? 'accepted-read' : 'abandoned', provenance: accept ? 'person-accepted-read' : null,
      evidence: accept ? { kind: 'applied', at } : record.evidence };
    const saved = claims.writeIntent(claim.descriptor, encodeRecord(next), raw, { assertCurrent() {
      guard(scope, authorized);
      if (accept && readTaskRevision(store, record.taskId).revision !== observedRevision) throw issue(409, 'TASK_INTENT_EVIDENCE_CHANGED');
    } });
    guard(scope, authorized);
    if (saved.status !== 'ok' && accept && readTaskRevision(store, record.taskId).revision !== observedRevision) throw issue(409, 'TASK_INTENT_EVIDENCE_CHANGED');
    requireWrite(saved); return detail(id, scope, authorized);
  }
  return { execute, list, detail, check, accept: (id: string, body: unknown, auth: () => boolean) => decide(id, body, auth, true),
    abandon: (id: string, body: unknown, auth: () => boolean) => decide(id, body, auth, false) };
}
