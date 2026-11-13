import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerTaskRevision } from '../server/task-revision.js';
import { TaskRevisionView, TaskRevisionResult } from '../shared/task-revision.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1', origin: 'http://127.0.0.1' }, route = '/api/v7/task-revision/task-2';
async function fixture(mode: 'omitted' | 'off' | 'on', runtime = false) {
  const root = path.resolve('tests/.tmp/mount162-' + randomUUID());
  const f = await createBaseApp({ root, dbPath: ':memory:', staticDir: root + '/none', runtime, ...(mode === 'omitted' ? {} : { taskRevisions: mode === 'on' }) });
  const snapshot = makeFixture('agency'); snapshot.capturedAt = '2026-11-04T14:00:00Z'; snapshot.captureStartedAt = snapshot.capturedAt;
  f.store.importSnapshot(snapshot); f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T14:01:00Z', approved: false }); f.store.activate(); return f;
}

test('162: omitted and false stay opt-out; explicit true mounts for both app profiles', async () => {
  for (const runtime of [false, true]) for (const mode of ['omitted', 'off', 'on'] as const) {
    const f = await fixture(mode, runtime); try {
      const result = await f.app.inject({ url: route, headers }); assert.equal(result.statusCode, mode === 'on' ? 200 : 404, mode + '/runtime=' + runtime);
      if (mode === 'on') assert.equal(TaskRevisionView.parse(result.json()).record.id, 'task-2');
      assert.equal(f.store.changesCount, 0);
    } finally { await f.app.close(); }
  }
});

test('162: explicit opt-out consumers can still register before serving; repeat after ready stays safe', async () => {
  const f = await fixture('off'); try {
    registerTaskRevision(f.app, f.store); await f.app.ready(); registerTaskRevision(f.app, f.store);
    assert.equal((await f.app.inject({ url: route, headers })).statusCode, 200); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('162: a second Store is rejected without rebinding routes or changing either history', async () => {
  const a = await fixture('on'), b = await fixture('off'); try {
    const before = TaskRevisionView.parse((await a.app.inject({ url: route, headers })).json());
    assert.throws(() => registerTaskRevision(a.app, b.store), /another Store/);
    const after = TaskRevisionView.parse((await a.app.inject({ url: route, headers })).json()); assert.deepEqual(after, before);
    const write = await a.app.inject({ method: 'PATCH', url: route, headers, payload: { expectedRevision: before.revision, values: { notes: 'Only store A changes162' } } });
    assert.equal(write.statusCode, 200); assert.equal(a.store.changesCount, 1); assert.equal(b.store.changesCount, 0);
    assert.equal(b.store.record('tasks', 'task-2')!.values.notes === 'Only store A changes162', false);
  } finally { await a.app.close(); await b.app.close(); }
});

test('162: separate opted-in apps retain separate identities and reject each other revisions', async () => {
  const a = await fixture('on'), b = await fixture('on'); try {
    const av = TaskRevisionView.parse((await a.app.inject({ url: route, headers })).json()), bv = TaskRevisionView.parse((await b.app.inject({ url: route, headers })).json());
    assert.equal(av.captureId, bv.captureId); assert.equal(av.capturedAt, bv.capturedAt); assert.deepEqual(av.record, bv.record); assert.notEqual(av.instanceId, bv.instanceId); assert.notEqual(av.revision, bv.revision);
    const rejected = await b.app.inject({ method: 'PATCH', url: route, headers, payload: { expectedRevision: av.revision, values: { notes: 'Wrong installation162' } } });
    assert.equal(rejected.statusCode, 409); assert.equal(rejected.json().details.code, 'TASK_REVISION_CHANGED'); assert.equal(a.store.changesCount, 0); assert.equal(b.store.changesCount, 0);
  } finally { await a.app.close(); await b.app.close(); }
});

test('162: mounted no-op obeys return-busy guard and does not mislabel it as revision conflict', async () => {
  const f = await fixture('on'); try {
    const current = TaskRevisionView.parse((await f.app.inject({ url: route, headers })).json()), payload = { expectedRevision: current.revision, values: { subject: current.record.values.subject } };
    f.store.set('returnBusy', true); const blocked = await f.app.inject({ method: 'PATCH', url: route, headers, payload }); assert.equal(blocked.statusCode, 409); assert.notEqual(blocked.json().details?.code, 'TASK_REVISION_CHANGED'); assert.equal(f.store.changesCount, 0);
    f.store.set('returnBusy', false); const noOp = TaskRevisionResult.parse((await f.app.inject({ method: 'PATCH', url: route, headers, payload })).json()); assert.equal(noOp.changed, false); assert.equal(noOp.current.revision, current.revision); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('162: protected mounted reads and writes retain cache and origin policy without exposing record', async () => {
  const f = await fixture('on'); try {
    const setup = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-review-mount162' } }); assert.equal(setup.statusCode, 200); const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const blocked = await f.app.inject({ url: route, headers }); assert.equal(blocked.statusCode, 401); assert.equal(blocked.headers['cache-control'], 'no-store'); assert.equal(blocked.headers.vary, 'Cookie'); assert.equal(Object.hasOwn(blocked.json(), 'record'), false);
    const read = TaskRevisionView.parse((await f.app.inject({ url: route, headers: { ...headers, cookie } })).json());
    for (const bad of [{ ...headers, cookie, origin: 'http://foreign.invalid' }, { ...headers, cookie, host: 'foreign.invalid' }]) {
      const rejected = await f.app.inject({ method: 'PATCH', url: route, headers: bad, payload: { expectedRevision: read.revision, values: { notes: 'Must not reach store162' } } }); assert.equal(rejected.statusCode, 403);
    }
    assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('162: real HTTP concurrency has one winner and rejects stale no-op replay', async () => {
  const f = await fixture('on'); try {
    await f.app.listen({ host: '127.0.0.1', port: 0 }); const address = f.app.server.address(); assert.ok(address && typeof address !== 'string'); const base = 'http://127.0.0.1:' + address.port;
    const before = TaskRevisionView.parse(await fetch(base + route).then(r => r.json()));
    const replies = await Promise.all(Array.from({ length: 24 }, (_, n) => fetch(base + route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: before.revision, values: { notes: 'Writer162-' + n } }) }).then(async r => ({ status: r.status, body: await r.json() }))));
    assert.equal(replies.filter(r => r.status === 200).length, 1); assert.equal(replies.filter(r => r.status === 409).length, 23); for (const r of replies.filter(r => r.status === 409)) assert.equal(r.body.details.code, 'TASK_REVISION_CHANGED');
    const winner = TaskRevisionResult.parse(replies.find(r => r.status === 200)!.body); assert.equal(winner.changed, true); assert.equal(f.store.changesCount, 1); assert.equal(f.store.record('tasks', 'task-2')!.values.notes, winner.current.record.values.notes);
    const replay = await fetch(base + route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: before.revision, values: { notes: winner.current.record.values.notes } }) }); assert.equal(replay.status, 409); assert.equal(f.store.changesCount, 1);
  } finally { await f.app.close(); }
});
