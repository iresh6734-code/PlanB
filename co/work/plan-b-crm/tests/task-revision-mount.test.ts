import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerTaskRevision } from '../server/task-revision.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { TaskRevisionView, TaskRevisionResult } from '../shared/task-revision.js';

const headers = { host: '127.0.0.1:4610', origin: 'http://127.0.0.1:4610' };
const url = '/api/v7/task-revision/task-2';
async function fixture(enabled = true, runtime = false) {
  const root = resolve('tests/.tmp', 'revision160-' + randomUUID());
  const f = await createBaseApp({ root, staticDir: root + '/none', dbPath: ':memory:', taskRevisions: enabled, runtime });
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-04T14:00:00Z', prompt: '', approved: false });
  f.store.activate(); return f;
}

test('base app opt-in mounts usable revision routes without manual registration', async () => {
  const f = await fixture(); try {
    const response = await f.app.inject({ url, headers });
    assert.equal(response.statusCode, 200);
    const view = TaskRevisionView.parse(response.json());
    assert.equal(view.record.id, 'task-2'); assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.vary, 'Cookie');
  } finally { await f.app.close(); }
});

test('default opt-out preserves existing apps and explicit registration consumers', async () => {
  const f = await fixture(false); try {
    assert.equal((await f.app.inject({ url, headers })).statusCode, 404);
  } finally { await f.app.close(); }
});

test('mounted writes share host, origin and session enforcement with base app', async () => {
  const f = await fixture(); try {
    const setup = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-mount160' } });
    assert.equal(setup.statusCode, 200);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    assert.equal((await f.app.inject({ url, headers })).statusCode, 401);
    const read = await f.app.inject({ url, headers: { ...headers, cookie } });
    assert.equal(read.statusCode, 200);
    const payload = { expectedRevision: read.json().revision, values: { subject: 'Intento' } };
    for (const bad of [headers, { ...headers, cookie, host: 'other.example' }, { ...headers, cookie, origin: 'https://other.example' }]) {
      const result = await f.app.inject({ method: 'PATCH', url, headers: bad, payload });
      assert.equal(result.statusCode, bad === headers ? 401 : 403);
    }
    assert.equal(f.store.changesCount, 0);
    await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie }, payload: {} });
    assert.equal((await f.app.inject({ method: 'PATCH', url, headers: { ...headers, cookie }, payload })).statusCode, 401);
  } finally { await f.app.close(); }
});

test('two mounted writes from one revision produce one change, stale replay does not write', async () => {
  const f = await fixture(); try {
    const view = TaskRevisionView.parse((await f.app.inject({ url, headers })).json());
    const results = await Promise.all(['Primera', 'Segunda'].map(subject => f.app.inject({ method: 'PATCH', url, headers, payload: { expectedRevision: view.revision, values: { subject } } })));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const winner = TaskRevisionResult.parse(results.find(r => r.statusCode === 200)!.json());
    assert.equal(f.store.changesCount, 1);
    const replay = await f.app.inject({ method: 'PATCH', url, headers, payload: { expectedRevision: view.revision, values: { subject: winner.current.record.values.subject } } });
    assert.equal(replay.statusCode, 409); assert.equal(replay.json().details.code, 'TASK_REVISION_CHANGED');
    assert.equal(f.store.changesCount, 1);
  } finally { await f.app.close(); }
});

test('mounted no-op preserves revision and history, legacy writes still invalidate a revision', async () => {
  const f = await fixture(); try {
    const view = TaskRevisionView.parse((await f.app.inject({ url, headers })).json());
    const noOp = await f.app.inject({ method: 'PATCH', url, headers, payload: { expectedRevision: view.revision, values: { subject: view.record.values.subject } } });
    assert.equal(noOp.statusCode, 200); assert.equal(noOp.json().changed, false); assert.equal(f.store.changesCount, 0);
    const legacy = await f.app.inject({ method: 'PATCH', url: '/api/records/tasks/task-2', headers, payload: { values: { subject: 'Cambio legacy' } } });
    assert.equal(legacy.statusCode, 200);
    const conflict = await f.app.inject({ method: 'PATCH', url, headers, payload: { expectedRevision: view.revision, values: { subject: 'Viejo' } } });
    assert.equal(conflict.statusCode, 409); assert.equal(f.store.changesCount, 1);
  } finally { await f.app.close(); }
});

test('repeated registration is safe for the same Store and rejects another Store', async () => {
  const f = await fixture(), other = await fixture(false); try {
    registerTaskRevision(f.app, f.store); registerTaskRevision(f.app, f.store);
    assert.throws(() => registerTaskRevision(f.app, other.store), /another Store/);
    const view = await f.app.inject({ url, headers }); assert.equal(view.statusCode, 200);
    assert.equal(view.json().instanceId, f.store.get('instanceId', null));
  } finally { await f.app.close(); await other.app.close(); }
});

test('independent runtime opts in to local revisions without enabling external services', async () => {
  const f = await fixture(true, true); try {
    assert.equal((await f.app.inject({ url, headers })).statusCode, 200);
    const state = (await f.app.inject({ url: '/api/v2/state', headers })).json();
    assert.equal(state.runtime, true); assert.equal(state.aiConfigured, false);
    const reconnect = await f.app.inject({ method: 'POST', url: '/api/disconnect', headers, payload: { disconnected: false } });
    assert.equal(reconnect.statusCode, 403);
  } finally { await f.app.close(); }
});

test('opted-in base app serves the contract over real loopback HTTP', async () => {
  const f = await fixture(); try {
    await f.app.listen({ host: '127.0.0.1', port: 0 });
    const address = f.app.server.address(); assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;
    const setup = await fetch(base + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'fiction-only-http160' }) });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(base + url)).status, 401);
    const read = await fetch(base + url, { headers: { cookie } }); assert.equal(read.status, 200);
    const view = TaskRevisionView.parse(await read.json());
    const request = { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: view.revision, values: { subject: 'Guardado HTTP' } }) };
    assert.equal((await fetch(base + url, request)).status, 200);
    assert.equal((await fetch(base + url, request)).status, 409);
    assert.equal(f.store.changesCount, 1);
  } finally { await f.app.close(); }
});
