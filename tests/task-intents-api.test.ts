import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope, type TaskIntentServiceOptions } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { CLAIM_PREFIX, CLAIM_INDEX_KEY, createTaskIntentClaims } from '../server/task-intent-claims.js';
import { KEY_PREFIX, encodeRecord, type IntentRecord } from '../shared/task-intent-journal.js';
import { contextKey } from '../shared/local-task-focus.js';
import { TaskIntentExecution, TaskIntentList, TaskIntentDetail, TaskIntentCheck, TASK_INTENTS_PATH as PATH } from '../shared/task-intents.js';

process.env.NODE_ENV = 'test';
const headers = { host: '127.0.0.1' }, at = '2026-11-09T11:00:00.000Z';
async function fixture(t: TestContext, options: TaskIntentServiceOptions = {}, dbPath = ':memory:') {
  const f = await createBaseApp({ dbPath, root: '.', staticDir: 'none' }); t.after(() => f.app.close());
  if (!f.store.ready) {
    const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
    f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false }); f.store.activate();
  }
  let writers = 0;
  registerTaskIntents(f.app, f.store, { now: () => at, ...options, writer: options.writer ?? ((...args) => { writers++; return writeTaskRevision(...args); }) });
  const scope = () => currentTaskIntentScope(f.store);
  const request = (values: Record<string, string> = { notes: 'fiction-316-edited' }) => ({ ...scope(), attemptId: randomUUID(), taskId: 'task-2', expectedRevision: readTaskRevision(f.store, 'task-2').revision, values });
  const post = (body: unknown, cookie?: string) => f.app.inject({ method: 'POST', url: PATH + '/attempts', headers: { ...headers, ...(cookie ? { cookie } : {}) }, payload: body as any });
  const get = (suffix = '', extra: Record<string, string> = {}, cookie?: string) => f.app.inject({ url: PATH + suffix + '?' + new URLSearchParams({ identity: JSON.stringify(scope().identity), contextRevision: scope().contextRevision, ...extra }), headers: { ...headers, ...(cookie ? { cookie } : {}) } });
  const decision = (id: string, action: string, body: Record<string, unknown>, cookie?: string) => f.app.inject({ method: 'POST', url: PATH + '/' + id + '/' + action, headers: { ...headers, ...(cookie ? { cookie } : {}) }, payload: { ...scope(), ...body } });
  const setup = async () => { const r = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-316-password' } }); assert.equal(r.statusCode, 200); return String(r.headers['set-cookie']).split(';')[0]!; };
  return { ...f, scope, request, post, get, decision, setup, writers: () => writers };
}
const dbRows = (f: { store: Awaited<ReturnType<typeof createBaseApp>>['store'] }) => JSON.stringify(['meta', 'records', 'changes'].map(table => f.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()));
const okExecution = (r: { statusCode: number; json(): unknown }) => { assert.equal(r.statusCode, 200, JSON.stringify(r.json())); return TaskIntentExecution.parse(r.json()); };

test('execute persists an ack, replay dispatches zero more times, and all GETs are pure', async t => {
  const f = await fixture(t), request = f.request();
  const first = okExecution(await f.post(request)); assert.equal(first.created, true); assert.equal(first.operation.outcome, 'acknowledged'); assert.equal(first.writeResult?.changed, true);
  assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
  const before = dbRows(f), replay = okExecution(await f.post(request));
  assert.equal(replay.replayed, true); assert.equal(replay.writeResult, null); assert.equal(replay.operation.acknowledgement?.changed, true);
  const list = await f.get(); assert.equal(list.statusCode, 200); assert.equal(TaskIntentList.parse(list.json()).entries.length, 1);
  assert.equal(TaskIntentDetail.parse((await f.get('/' + request.attemptId)).json()).operation.attemptId, request.attemptId);
  assert.equal(TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()).evidence, 'applied');
  assert.equal(dbRows(f), before); assert.equal(f.writers(), 1); assert.equal(list.headers['cache-control'], 'no-store'); assert.match(String(list.headers.vary), /Cookie/);
});

test('same ID with other values or scope never dispatches; stale revision creates no intent', async t => {
  const f = await fixture(t), request = f.request(); okExecution(await f.post(request)); const before = dbRows(f);
  assert.equal((await f.post({ ...request, values: { notes: 'other' } })).statusCode, 409);
  assert.equal((await f.post({ ...request, identity: { ...request.identity, generatedAt: '2026-11-10T11:00:00.000Z' } })).statusCode, 409);
  assert.equal((await f.post({ ...request, attemptId: randomUUID() })).statusCode, 409);
  assert.equal(dbRows(f), before); assert.equal(f.writers(), 1);
});

test('no-op retains changed:false and adds zero history', async t => {
  const f = await fixture(t), current = f.store.record('tasks', 'task-2')!;
  const result = okExecution(await f.post(f.request({ notes: String(current.values.notes) })));
  assert.equal(result.operation.acknowledgement?.changed, false); assert.equal(result.writeResult?.changed, false); assert.equal(f.store.changesCount, 0);
});

test('field validation rejects before intent or writer and preserves all original values', async t => {
  const f = await fixture(t), before = dbRows(f);
  const invalid: Record<string, string>[] = [{ subject: '' }, { notes: 'x'.repeat(10001) }, { contact_id: 'missing-fiction-reference' }];
  for (const values of invalid) {
    const result = await f.post(f.request(values)); assert.equal(result.statusCode, 422); assert.equal(dbRows(f), before);
  }
  assert.equal(f.writers(), 0);
});

test('failure to persist has zero writer calls and no partial claim', async t => {
  const f = await fixture(t), request = f.request(), original = f.store.set.bind(f.store), before = dbRows(f);
  f.store.set = (key, value) => { if (key.startsWith(CLAIM_PREFIX)) throw Error('fiction persistence failure'); original(key, value); };
  const r = await f.post(request); assert.equal(r.statusCode, 503); assert.equal(f.writers(), 0); assert.equal(dbRows(f), before);
});

test('R2: only the new attempt stopped before writer gets NOT_DISPATCHED, never a post-effect failure', async t => {
  const before = await fixture(t), request = before.request(), original = before.store.set.bind(before.store);
  before.store.set = (key, value) => { if (key.startsWith(CLAIM_PREFIX)) throw Error('fiction before dispatch'); original(key, value); };
  const initial = await before.post(request); assert.equal(initial.statusCode, 503);
  assert.equal(initial.json().details.code, 'TASK_INTENT_NOT_DISPATCHED'); assert.equal(before.writers(), 0); assert.equal(before.store.changesCount, 0);
  let after!: Awaited<ReturnType<typeof fixture>>;
  after = await fixture(t, { afterWrite() { after.store.set(CLAIM_INDEX_KEY, { broken: true }); } });
  const result = await after.post(after.request()); assert.equal(result.statusCode, 503);
  assert.equal(result.json().details.code, 'TASK_INTENT_STORAGE_UNAVAILABLE'); assert.equal(after.writers(), 1); assert.equal(after.store.changesCount, 1);
});

test('interruption after durable intent and before writer leaves unknown; replay and check do not dispatch', async t => {
  const f = await fixture(t, { afterPersist() { throw Error('fiction stop before dispatch'); } }), request = f.request();
  const result = okExecution(await f.post(request)); assert.equal(result.operation.phase, 'attempt'); assert.equal(f.writers(), 0);
  assert.equal(TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()).evidence, 'unchanged');
  okExecution(await f.post(request)); assert.equal(f.writers(), 0); assert.equal(f.store.changesCount, 0);
});

test('lost acknowledgement after real writer is checked and accepted atomically without replay', async t => {
  const f = await fixture(t, { afterWrite() { throw Error('fiction lost effect receipt'); } }), request = f.request();
  const result = okExecution(await f.post(request)); assert.equal(result.operation.phase, 'attempt'); assert.equal(f.store.changesCount, 1);
  const checked = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()); assert.equal(checked.evidence, 'applied');
  assert.equal((await f.decision(request.attemptId, 'accept', { expectedSeq: 2, expectedTaskRevision: checked.taskRevision })).statusCode, 409);
  assert.equal((await f.decision(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: 'a'.repeat(64) })).statusCode, 409);
  const original = f.store.set.bind(f.store), writes: unknown[] = [];
  f.store.set = (key, value) => { if (key === KEY_PREFIX + request.attemptId) writes.push(JSON.parse(String(value))); original(key, value); };
  const accepted = await f.decision(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: checked.taskRevision }); assert.equal(accepted.statusCode, 200);
  assert.equal(writes.length, 1); assert.equal((writes[0] as any).outcome, 'accepted-read'); assert.equal((writes[0] as any).evidence.kind, 'applied');
  const detail = TaskIntentDetail.parse(accepted.json()); assert.equal(detail.operation.provenance, 'person-accepted-read'); assert.equal(detail.operation.acknowledgement, null);
  const persisted = f.store.get<string>(KEY_PREFIX + request.attemptId, ''); assert.match(persisted, /accepted-read/); assert.match(persisted, /applied/);
  okExecution(await f.post(request)); assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
});

test('failure during settlement preserves uncertainty and exactly one task change', async t => {
  const f = await fixture(t), request = f.request(), original = f.store.set.bind(f.store);
  f.store.set = (key, value) => { if (key === KEY_PREFIX + request.attemptId && typeof value === 'string' && value.includes('"phase":"settled"')) throw Error('fiction settlement failure'); original(key, value); };
  assert.equal(okExecution(await f.post(request)).operation.phase, 'attempt');
  assert.equal(TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()).evidence, 'applied');
  okExecution(await f.post(request)); assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
});

test('accept rechecks the task revision inside the claim write boundary', async t => {
  const f = await fixture(t, { afterWrite() { throw Error('fiction lost ack'); } }), request = f.request(); okExecution(await f.post(request));
  const checked = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()), raw = f.store.get(KEY_PREFIX + request.attemptId, null);
  const original = f.store.transaction.bind(f.store); let injected = false;
  f.store.transaction = fn => {
    if (!injected) { injected = true; const record = f.store.record('tasks', 'task-2')!; record.values.notes = 'fiction concurrent edit'; f.store.db.prepare("UPDATE records SET value=? WHERE entity='tasks' AND id='task-2'").run(f.store.encode(record)); }
    return original(fn);
  };
  try { assert.equal((await f.decision(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: checked.taskRevision })).statusCode, 409); }
  finally { f.store.transaction = original; }
  assert.equal(f.store.get(KEY_PREFIX + request.attemptId, null), raw); assert.equal(f.writers(), 1);
});

test('a missing task produces missing evidence and cannot be accepted as applied', async t => {
  const f = await fixture(t, { afterPersist() { throw Error('fiction before writer'); } }), request = f.request(); okExecution(await f.post(request));
  assert.equal((await f.decision(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: request.expectedRevision })).statusCode, 409);
  f.store.db.prepare("DELETE FROM records WHERE entity='tasks' AND id='task-2'").run();
  const checked = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()); assert.equal(checked.evidence, 'missing'); assert.equal(checked.record, null);
  assert.equal((await f.decision(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: request.expectedRevision })).statusCode, 409); assert.equal(f.writers(), 0);
});

test('two requests with one ID cannot duplicate writer and live operations cannot be abandoned', async t => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, { afterPersist: async () => { entered(); await barrier; } }), request = f.request();
  const first = f.post(request);
  try {
    await started; const replay = okExecution(await f.post(request)); assert.equal(replay.operation.phase, 'attempt');
    assert.equal((await f.decision(request.attemptId, 'abandon', { expectedSeq: 1, confirmed: true })).statusCode, 409);
    assert.equal(f.writers(), 0);
  } finally { release(); }
  okExecution(await first); assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
});

test('blocking original session during barrier prevents dispatch, even after another login', async t => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, { afterPersist: async () => { entered(); await barrier; } }), cookie = await f.setup(), request = f.request();
  const first = f.post(request, cookie);
  try {
    await started;
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie } })).statusCode, 200);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v2/auth/login', headers, payload: { password: 'fiction-only-316-password' } })).statusCode, 200);
  } finally { release(); }
  assert.equal((await first).statusCode, 401); assert.equal(f.writers(), 0); assert.equal(f.store.changesCount, 0);
});

test('generation change during barrier rejects old scope without writer or payload disclosure', async t => {
  let f!: Awaited<ReturnType<typeof fixture>>;
  f = await fixture(t, { afterPersist() { f.store.set('generation', { ...f.store.generation!, generatedAt: '2026-11-10T11:00:00.000Z' }); } });
  const r = await f.post(f.request()); assert.equal(r.statusCode, 409); assert.equal(f.writers(), 0); assert.ok(!r.body.includes('fiction-316-edited'));
});

test('abandon is an explicit versioned human decision and cannot overwrite settled result', async t => {
  const f = await fixture(t, { afterPersist() { throw Error('before writer'); } }), request = f.request(); okExecution(await f.post(request));
  assert.equal((await f.decision(request.attemptId, 'abandon', { expectedSeq: 1, confirmed: false })).statusCode, 422);
  const r = await f.decision(request.attemptId, 'abandon', { expectedSeq: 1, confirmed: true }); assert.equal(r.statusCode, 200); assert.equal(TaskIntentDetail.parse(r.json()).operation.outcome, 'abandoned');
  assert.equal((await f.decision(request.attemptId, 'abandon', { expectedSeq: 2, confirmed: true })).statusCode, 409); assert.equal(f.writers(), 0);
});

test('large valid record produces a compact confirmed receipt, not truncated fields', async t => {
  const f = await fixture(t), snapshot = f.store.snapshot!, entity = snapshot.entities.find(e => e.id === 'tasks')!;
  const field = entity.fields.find(field => field.key === 'notes')!, record = snapshot.records.find(r => r.entity === 'tasks' && r.id === 'task-2')!;
  // Each field is within the existing 10,000-character validator; aggregate UTF-8 exceeds 512 KiB.
  for (let i = 0; i < 50; i++) { entity.fields.push({ ...field, key: 'extra_' + i, label: 'Fiction field ' + i }); record.values['extra_' + i] = '漢'.repeat(4000); }
  f.store.importSnapshot(snapshot, true);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false }); f.store.activate();
  const result = okExecution(await f.post(f.request({ status: 'completed' })));
  assert.equal(result.operation.outcome, 'acknowledged'); assert.equal(result.writeResult, null); assert.equal(result.writeResultOmitted, 'response-too-large');
  assert.equal(result.operation.acknowledgement?.changed, true); assert.equal(f.store.changesCount, 1); assert.equal(f.store.record('tasks', 'task-2')!.values.extra_0!.toString().length, 4000);
  const checked = TaskIntentCheck.parse((await f.get('/' + result.operation.attemptId + '/check')).json()); assert.equal(checked.evidence, 'unavailable'); assert.equal(checked.reason, 'response-too-large');
});

test('corrupt ledger reads are unknown, never zero, and do not repair rows', async t => {
  const f = await fixture(t); okExecution(await f.post(f.request())); f.store.set(CLAIM_INDEX_KEY, { broken: true }); const before = dbRows(f);
  const r = await f.get(); assert.equal(r.statusCode, 200); const list = TaskIntentList.parse(r.json()); assert.equal(list.status, 'unavailable'); assert.equal(list.quarantined, null); assert.equal(list.otherContexts, null); assert.equal(dbRows(f), before);
});

test('R2: readable corrupt 208 rows count in installation quarantine, with or without A4 claims', async t => {
  for (const withClaim of [false, true]) {
    const f = await fixture(t); if (withClaim) okExecution(await f.post(f.request()));
    f.store.set(KEY_PREFIX + 'legacy-corrupt', 'fiction-invalid-208'); const before = dbRows(f);
    const value = TaskIntentList.parse((await f.get()).json()); assert.equal(value.status, 'read'); assert.equal(value.quarantined, 1);
    assert.equal(value.entries.length, withClaim ? 1 : 0); assert.equal(dbRows(f), before);
    assert.ok(!JSON.stringify(value).includes('fiction-invalid-208')); assert.ok(!JSON.stringify(value).includes('legacy-corrupt'));
  }
});

test('R2: valid 208 rows without a claim have unknown attribution and are never silently adopted', async t => {
  for (const id of ['legacy-valid', randomUUID()]) {
    const f = await fixture(t), request = f.request();
    const record: IntentRecord = { v: 1, id, installId: request.identity.instanceId, contextKey: contextKey(request.identity), taskId: request.taskId,
      phase: 'attempt', outcome: null, provenance: null, patch: request.values, baseline: { notes: 'fiction old baseline' }, revision: request.expectedRevision,
      createdAt: at, updatedAt: at, evidence: null, seq: 1 };
    f.store.set(KEY_PREFIX + id, encodeRecord(record)); const before = dbRows(f);
    const value = TaskIntentList.parse((await f.get()).json()); assert.equal(value.status, 'unavailable'); assert.equal(value.quarantined, null);
    assert.equal(value.otherContexts, null); assert.deepEqual(value.entries, []); assert.equal(dbRows(f), before); assert.equal(f.writers(), 0);
  }
});

test('R2: an incomplete over-capacity inventory is unknown and does not repair or truncate rows', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 201; i++) f.store.set(KEY_PREFIX + 'legacy-' + i, 'fiction-invalid-208');
  const before = dbRows(f), value = TaskIntentList.parse((await f.get()).json());
  assert.equal(value.status, 'unavailable'); assert.equal(value.quarantined, null); assert.equal(dbRows(f), before);
  const large = await fixture(t); large.store.set(KEY_PREFIX + 'large-multibyte-row', '漢'.repeat(550000));
  const prior = dbRows(large), unknown = TaskIntentList.parse((await large.get()).json());
  assert.equal(unknown.status, 'unavailable'); assert.equal(unknown.quarantined, null); assert.equal(dbRows(large), prior);
});

test('R2: enumeration or decryption failure never becomes a zero quarantine count', async t => {
  for (const mode of ['enumerate', 'decode']) {
    const f = await fixture(t), marker = 'fiction-inventory-read-failure'; f.store.set(KEY_PREFIX + 'legacy-corrupt', marker);
    const before = dbRows(f);
    if (mode === 'enumerate') {
      const prepare = f.store.db.prepare.bind(f.store.db);
      f.store.db.prepare = sql => { if (sql.startsWith('SELECT key,length(CAST(value AS BLOB)) AS size')) throw Error('fiction failed enumeration'); return prepare(sql); };
    } else {
      const decode = f.store.decode.bind(f.store);
      f.store.decode = <T>(encoded: string): T => { if (encoded === JSON.stringify(marker)) throw Error('fiction failed decryption'); return decode<T>(encoded); };
    }
    const result = await f.get(); assert.equal(result.statusCode, 200); const value = TaskIntentList.parse(result.json());
    assert.equal(value.status, 'unavailable'); assert.equal(value.quarantined, null); assert.equal(dbRows(f), before);
    assert.ok(!result.body.includes('fiction failed'));
  }
});

test('R2: quarantine changes invalidate the cursor even if the A4 summaries are unchanged', async t => {
  const f = await fixture(t); okExecution(await f.post(f.request({ notes: 'first' }))); okExecution(await f.post(f.request({ notes: 'second' })));
  const page = TaskIntentList.parse((await f.get('', { limit: '1' })).json()); assert.ok(page.nextCursor);
  f.store.set(KEY_PREFIX + 'new-corrupt-row', 'fiction-invalid-208');
  assert.equal((await f.get('', { limit: '1', cursor: page.nextCursor })).statusCode, 409);
  const next = TaskIntentList.parse((await f.get()).json()); assert.equal(next.entries.length, 2); assert.equal(next.quarantined, 1);
});

test('R2: a context change while inspecting an unclaimed row retires the old inventory', async t => {
  const f = await fixture(t), marker = 'fiction-inventory-context-change'; f.store.set(KEY_PREFIX + 'legacy-corrupt', marker);
  const original = f.store.decode.bind(f.store); let changed = false;
  f.store.decode = <T>(encoded: string): T => {
    if (!changed && encoded === JSON.stringify(marker)) { changed = true; f.store.set('generation', { ...f.store.generation!, generatedAt: '2026-11-10T11:00:00.000Z' }); }
    return original<T>(encoded);
  };
  const result = await f.get(); assert.equal(changed, true); assert.equal(result.statusCode, 409); assert.ok(!result.body.includes('entries'));
});

test('expired detail keeps its receipt, refuses replay and cannot supply comparison evidence', async t => {
  const f = await fixture(t), request = f.request(), result = okExecution(await f.post(request));
  const claims = createTaskIntentClaims(f.store), state = claims.inspect(); assert.equal(state.status, 'ready');
  if (state.status !== 'ready') assert.fail('missing claims');
  const claim = state.claims[0]!, raw = f.store.get<string>(KEY_PREFIX + request.attemptId, '');
  assert.equal(claims.removeIntent(claim.descriptor, raw, { assertCurrent() {} }).status, 'ok'); const before = dbRows(f);
  const replay = await f.post(request); assert.equal(replay.statusCode, 409); assert.equal(replay.json().details.code, 'TASK_INTENT_DETAIL_EXPIRED');
  assert.equal(TaskIntentDetail.parse((await f.get('/' + request.attemptId)).json()).payloadIssue, 'detail-expired');
  const check = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()); assert.equal(check.evidence, 'unavailable'); assert.equal(check.reason, 'detail-expired');
  assert.equal(result.operation.acknowledgement?.changed, true); assert.equal(f.writers(), 1); assert.equal(dbRows(f), before);
});

test('local pagination is invalidated by a new operation and copy changes expose only the other-context count', async t => {
  const f = await fixture(t);
  okExecution(await f.post(f.request({ notes: 'fiction one' }))); okExecution(await f.post(f.request({ notes: 'fiction two' })));
  const list = TaskIntentList.parse((await f.get('', { limit: '1' })).json()); assert.ok(list.nextCursor); assert.equal(list.entries.length, 1);
  assert.equal(TaskIntentList.parse((await f.get('', { limit: '1', cursor: list.nextCursor })).json()).entries.length, 1);
  okExecution(await f.post(f.request({ notes: 'fiction three' })));
  assert.equal((await f.get('', { limit: '1', cursor: list.nextCursor })).statusCode, 409);
  const oldId = list.entries[0]!.attemptId; f.store.set('generation', { ...f.store.generation!, generatedAt: '2026-11-10T11:00:00.000Z' });
  const next = TaskIntentList.parse((await f.get()).json()); assert.equal(next.entries.length, 0); assert.equal(next.otherContexts, 3);
  const detail = await f.get('/' + oldId); assert.equal(detail.statusCode, 404); assert.ok(!detail.body.includes('fiction one'));
});

test('actual loopback HTTP serves the same strict durable execution and body cap', async t => {
  const f = await fixture(t); await f.app.listen({ host: '127.0.0.1', port: 0 });
  const address = f.app.server.address(); assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port;
  const response = await fetch(origin + PATH + '/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f.request()), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); assert.equal(TaskIntentExecution.parse(await response.json()).operation.outcome, 'acknowledged');
  const oversized = await fetch(origin + PATH + '/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f.request(), values: { notes: 'x'.repeat(270000) } }), signal: AbortSignal.timeout(5000) });
  assert.equal(oversized.status, 413); assert.equal(f.writers(), 1); assert.equal(f.store.changesCount, 1);
});

test('strict queries, request byte cap, HEAD and authentication reject without a writer', async t => {
  const f = await fixture(t), request = f.request();
  assert.equal((await f.post({ ...request, credential: 'fiction' })).statusCode, 422);
  assert.equal((await f.post({ ...request, values: { notes: 'x'.repeat(270000) } })).statusCode, 413);
  assert.equal((await f.get('', { unexpected: 'true' })).statusCode, 422);
  assert.equal((await f.app.inject({ method: 'HEAD', url: PATH, headers })).statusCode, 404);
  await f.setup(); assert.equal((await f.post(request)).statusCode, 401); assert.equal(f.writers(), 0);
});

test('file reopen retains an uncertain attempt and all recovery reads/replays add zero effects', async t => {
  fs.mkdirSync(path.resolve('tests/.tmp'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/a4-http316-file-')), data = path.join(root, 'data'); fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  const file = path.join(data, 'planb.sqlite'), first = await fixture(t, { afterWrite() { throw Error('fiction lost receipt'); } }, file), request = first.request();
  okExecution(await first.post(request)); assert.equal(first.store.changesCount, 1); const shutdown = JSON.parse(dbRows(first));
  assert.equal(first.store.get('returnBusy', null), false); await first.app.close();
  const next = await fixture(t, {}, file), before = dbRows(next), reopened = JSON.parse(before);
  // Existing Recovery construction reseals returnBusy:false. No A4 entry or task may change on startup.
  const oldMeta = new Map<string, string>(shutdown[0].map((r: any) => [r.key, r.value]));
  const newMeta = new Map<string, string>(reopened[0].map((r: any) => [r.key, r.value]));
  const changed = [...new Set([...oldMeta.keys(), ...newMeta.keys()])].filter(key => oldMeta.get(key) !== newMeta.get(key));
  assert.deepEqual(changed, ['returnBusy']); assert.equal(next.store.get('returnBusy', null), false);
  assert.deepEqual(reopened.slice(1), shutdown.slice(1));
  assert.equal(TaskIntentList.parse((await next.get()).json()).entries[0]!.phase, 'attempt');
  assert.equal(TaskIntentCheck.parse((await next.get('/' + request.attemptId + '/check')).json()).evidence, 'applied');
  okExecution(await next.post(request)); assert.equal(next.writers(), 0); assert.equal(next.store.changesCount, 1); assert.equal(dbRows(next), before);
  const inspection = createTaskIntentClaims(next.store).inspect(); assert.equal(inspection.status, 'ready');
});
