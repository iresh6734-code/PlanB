import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope, type TaskIntentServiceOptions } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { CLAIM_INDEX_KEY, CLAIM_PREFIX } from '../server/task-intent-claims.js';
import { KEY_PREFIX, decodeRecord } from '../shared/task-intent-journal.js';
import { TaskIntentCheck, TaskIntentDetail, TaskIntentExecution, TaskIntentList, TASK_INTENTS_PATH as PATH } from '../shared/task-intents.js';

// Independent review319. Real Fastify/SQLite/writer; app.inject counts requests separately
// from writer calls and persisted rows. No browser, providers, or installed-runtime claims.
process.env.NODE_ENV = 'test';
const headers = { host: '127.0.0.1' }, at = '2026-11-09T15:00:00.000Z';
const barrier = () => {
  let release!: () => void, enter!: () => void;
  return { held: new Promise<void>(resolve => { release = resolve; }), seen: new Promise<void>(resolve => { enter = resolve; }),
    release: () => release(), enter: () => enter() };
};
async function fixture(t: TestContext, options: TaskIntentServiceOptions = {}) {
  const f = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  t.after(() => f.app.close());
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false });
  f.store.activate();
  let calls = 0, posts = 0;
  f.app.addHook('onRequest', async request => { if (request.method === 'POST' && request.url === PATH + '/attempts') posts++; });
  registerTaskIntents(f.app, f.store, { ...options, now: () => at, writer: (...args) => { calls++; return (options.writer ?? writeTaskRevision)(...args); } });
  const scope = () => currentTaskIntentScope(f.store);
  const request = () => ({ ...scope(), attemptId: randomUUID(), taskId: 'task-2',
    expectedRevision: readTaskRevision(f.store, 'task-2').revision, values: { notes: 'fiction-319-change' } });
  const post = (body: unknown, cookie?: string) => f.app.inject({ method: 'POST', url: PATH + '/attempts',
    headers: { ...headers, ...(cookie ? { cookie } : {}) }, payload: body as any });
  const get = (suffix = '', cookie?: string) => f.app.inject({ url: PATH + suffix + '?' + new URLSearchParams({ identity: JSON.stringify(scope().identity), contextRevision: scope().contextRevision }),
    headers: { ...headers, ...(cookie ? { cookie } : {}) } });
  const decide = (id: string, action: 'accept' | 'abandon', body: Record<string, unknown>, cookie?: string) => f.app.inject({ method: 'POST', url: PATH + '/' + id + '/' + action,
    headers: { ...headers, ...(cookie ? { cookie } : {}) }, payload: { ...scope(), ...body } });
  const phase = (id: string) => { const raw = f.store.get<string | null>(KEY_PREFIX + id, null); if (!raw) return null;
    const parsed = decodeRecord(raw, KEY_PREFIX + id); assert.equal(parsed.ok, true); return parsed.ok ? parsed.record.phase : null; };
  return { ...f, scope, request, post, get, decide, phase, calls: () => calls, posts: () => posts };
}
const rows = (f: Awaited<ReturnType<typeof fixture>>) => JSON.stringify(['meta', 'records', 'changes'].map(table => f.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()));
const execute = (r: { statusCode: number; json(): unknown }) => { assert.equal(r.statusCode, 200); return TaskIntentExecution.parse(r.json()); };

test('319 · pre-dispatch and post-effect storage failures expose distinct closed codes', async t => {
  const before = await fixture(t), request = before.request(), original = before.store.set.bind(before.store), baseline = rows(before);
  before.store.set = (key, value) => { if (key.startsWith(CLAIM_PREFIX)) throw Error('fiction initial persistence failure'); original(key, value); };
  const initial = await before.post(request);
  assert.equal(initial.statusCode, 503); assert.equal(before.calls(), 0); assert.equal(before.store.changesCount, 0); assert.equal(rows(before), baseline);
  let after!: Awaited<ReturnType<typeof fixture>>;
  after = await fixture(t, { afterWrite() { after.store.set(CLAIM_INDEX_KEY, { broken: 'fiction after effect' }); } });
  const uncertain = await after.post(after.request());
  assert.equal(uncertain.statusCode, 503); assert.equal(after.calls(), 1); assert.equal(after.store.changesCount, 1);
  const a = initial.json().details?.code, b = uncertain.json().details?.code;
  assert.equal(typeof a, 'string'); assert.equal(typeof b, 'string');
  assert.notEqual(a, b, 'The accepted contract requires a distinct code before dispatch; the same 503 code cannot prove that zero writes occurred.');
});

test('319 · lost initial COMMIT acknowledgement preserves the pending ID and never reaches the writer', async t => {
  const f = await fixture(t), request = f.request(), original = f.store.transaction.bind(f.store); let lost = false;
  f.store.transaction = <T>(fn: () => T): T => { const result = original(fn); if (!lost && f.phase(request.attemptId) === 'attempt') { lost = true; throw Error('fiction lost initial COMMIT receipt'); } return result; };
  try { assert.equal((await f.post(request)).statusCode, 503); } finally { f.store.transaction = original; }
  assert.equal(lost, true); assert.equal(f.calls(), 0); assert.equal(f.store.changesCount, 0);
  const before = rows(f), list = TaskIntentList.parse((await f.get()).json());
  assert.equal(list.entries.length, 1); assert.equal(list.entries[0]!.attemptId, request.attemptId); assert.equal(list.entries[0]!.phase, 'attempt');
  assert.equal(TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json()).evidence, 'unchanged');
  assert.equal(execute(await f.post(request)).replayed, true); assert.equal(f.calls(), 0); assert.equal(f.posts(), 2); assert.equal(rows(f), before);
});

test('319 · lost settlement COMMIT acknowledgement retains the real receipt without reconstructing the task result', async t => {
  const f = await fixture(t), request = f.request(), original = f.store.transaction.bind(f.store); let lost = false;
  f.store.transaction = <T>(fn: () => T): T => { const result = original(fn); if (!lost && f.phase(request.attemptId) === 'settled') { lost = true; throw Error('fiction lost settlement COMMIT receipt'); } return result; };
  let result;
  try { result = execute(await f.post(request)); } finally { f.store.transaction = original; }
  assert.equal(lost, true); assert.equal(result.operation.outcome, 'acknowledged'); assert.equal(result.operation.acknowledgement?.changed, true);
  assert.equal(result.writeResult, null); assert.equal(result.writeResultOmitted, 'not-retained'); assert.equal(f.calls(), 1); assert.equal(f.store.changesCount, 1);
  const before = rows(f), replay = execute(await f.post(request)); assert.equal(replay.replayed, true);
  assert.deepEqual(replay.operation.acknowledgement, result.operation.acknowledgement); assert.equal(rows(f), before); assert.equal(f.calls(), 1);
});

test('319 · check is pure while a real effect is pending settlement; both human decisions reject the live attempt', async t => {
  const gate = barrier(), f = await fixture(t, { afterWrite: async () => { gate.enter(); await gate.held; } }), request = f.request();
  const pending = f.post(request);
  try {
    await gate.seen; assert.equal(f.calls(), 1); assert.equal(f.store.changesCount, 1);
    const before = rows(f), checked = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check')).json());
    assert.equal(checked.evidence, 'applied'); assert.equal(checked.operation.phase, 'attempt'); assert.equal(rows(f), before);
    assert.equal((await f.decide(request.attemptId, 'accept', { expectedSeq: 1, expectedTaskRevision: checked.taskRevision })).statusCode, 409);
    assert.equal((await f.decide(request.attemptId, 'abandon', { expectedSeq: 1, confirmed: true })).statusCode, 409);
    assert.equal(rows(f), before);
  } finally { gate.release(); }
  assert.equal(execute(await pending).operation.outcome, 'acknowledged'); assert.equal(f.calls(), 1); assert.equal(f.posts(), 1);
});

test('319 · blocking after the real effect revokes the old response; a new session reads and accepts without another writer', async t => {
  const gate = barrier(), f = await fixture(t, { afterWrite: async () => { gate.enter(); await gate.held; } });
  const setup = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-319-password' } });
  assert.equal(setup.statusCode, 200); const cookie = String(setup.headers['set-cookie']).split(';')[0]!, request = f.request(), pending = f.post(request, cookie);
  let fresh = '';
  try {
    await gate.seen; assert.equal(f.calls(), 1); assert.equal(f.store.changesCount, 1);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie } })).statusCode, 200);
    const login = await f.app.inject({ method: 'POST', url: '/api/v2/auth/login', headers, payload: { password: 'fiction-only-319-password' } });
    assert.equal(login.statusCode, 200); fresh = String(login.headers['set-cookie']).split(';')[0]!;
  } finally { gate.release(); }
  const revoked = await pending; assert.equal(revoked.statusCode, 401); assert.ok(!revoked.body.includes('fiction-319-change'));
  const before = rows(f), checked = TaskIntentCheck.parse((await f.get('/' + request.attemptId + '/check', fresh)).json());
  assert.equal(checked.evidence, 'applied'); assert.equal(checked.operation.phase, 'attempt'); assert.equal(rows(f), before);
  const accepted = await f.decide(request.attemptId, 'accept', { expectedSeq: checked.operation.seq, expectedTaskRevision: checked.taskRevision }, fresh);
  assert.equal(accepted.statusCode, 200); const detail = TaskIntentDetail.parse(accepted.json());
  assert.equal(detail.operation.outcome, 'accepted-read'); assert.equal(detail.operation.provenance, 'person-accepted-read');
  assert.equal(detail.operation.acknowledgement, null); assert.equal(f.calls(), 1); assert.equal(f.store.changesCount, 1); assert.equal(f.posts(), 1);
});

// Appended after the first five probes. The accepted208 classifier counts quarantine
// before context attribution; public metadata must not turn a known malformed row into0.
test('319 · quarantine counts an unreadable installation entry without claiming or repairing it', async t => {
  const f = await fixture(t), id = randomUUID(), key = KEY_PREFIX + id, raw = 'fiction malformed journal row';
  f.store.set(key, raw); const before = rows(f);
  assert.equal(decodeRecord(raw, key).ok, false);
  const response = await f.get(); assert.equal(response.statusCode, 200); const list = TaskIntentList.parse(response.json());
  assert.equal(rows(f), before); assert.equal(f.store.get(key, null), raw); assert.equal(f.calls(), 0);
  assert.ok(!response.body.includes(id)); assert.ok(!response.body.includes(raw));
  assert.equal(list.status, 'read'); assert.equal(list.entries.length, 0);
  assert.equal(list.quarantined, 1, 'A complete installation inventory contains one malformed208 row, not zero.');
});

test('319 · quarantine does not hide a readable A4 operation or expose the corrupt row', async t => {
  const f = await fixture(t), request = f.request(); execute(await f.post(request));
  const id = randomUUID(), key = KEY_PREFIX + id, raw = 'fiction second malformed journal row';
  f.store.set(key, raw); const before = rows(f);
  assert.equal(decodeRecord(raw, key).ok, false);
  const response = await f.get(); assert.equal(response.statusCode, 200); const list = TaskIntentList.parse(response.json());
  assert.equal(rows(f), before); assert.equal(f.store.get(key, null), raw); assert.equal(f.calls(), 1); assert.equal(f.store.changesCount, 1);
  assert.ok(!response.body.includes(id)); assert.ok(!response.body.includes(raw)); assert.ok(!response.body.includes('fiction-319-change'));
  assert.equal(list.status, 'read'); assert.equal(list.entries.length, 1); assert.equal(list.entries[0]!.attemptId, request.attemptId);
  assert.equal(list.quarantined, 1, 'One validA4 operation and one corrupt208 row must remain separately visible as metadata.');
});
