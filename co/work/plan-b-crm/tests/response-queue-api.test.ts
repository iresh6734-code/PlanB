import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const path = '/api/v2/continuity/response-queue', headers = { host: '127.0.0.1:4399' };
async function setup(runtime = false) {
  const instance = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/ops039-no-static'), runtime });
  return instance;
}
function activate(store: Awaited<ReturnType<typeof setup>>['store']) {
  const snapshot = makeFixture(); store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
  return snapshot;
}

test('endpoint refuses an unprepared copy, then serves provenance and counts from the active local copy', async () => {
  const { app, store } = await setup();
  try {
    assert.equal((await app.inject({ method: 'GET', url: path, headers })).statusCode, 409);
    const snapshot = activate(store);
    const response = await app.inject({ method: 'GET', url: path + '?horizonHours=8&limit=2', headers });
    assert.equal(response.statusCode, 200); assert.equal(response.headers['cache-control'], 'no-store');
    const result = response.json(); assert.equal(result.source.captureId, snapshot.id + ':' + snapshot.capturedAt);
    assert.equal(result.source.accountId, snapshot.source.accountId); assert.equal(result.source.view, 'active-local-records');
    assert.equal(result.summary.totalTasks, snapshot.records.filter(r => r.entity === 'tasks').length);
    assert.equal(result.items.length, 2); assert.equal(result.summary.truncated, true); assert.match(result.source.revision, /^[a-f0-9]{64}$/);
  } finally { await app.close(); }
});

test('local session protection, host and origin guards apply to the new endpoint', async () => {
  const { app, store } = await setup();
  try {
    activate(store);
    const configured = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'solo-fixture-ops039-2026' } });
    assert.equal(configured.statusCode, 200); const cookie = String(configured.headers['set-cookie']).split(';')[0];
    assert.equal((await app.inject({ method: 'GET', url: path, headers })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: path, headers: { ...headers, cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: path, headers: { host: 'external.invalid', cookie } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: path, headers: { ...headers, cookie, origin: 'https://external.invalid' } })).statusCode, 403);
    await app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie } });
    assert.equal((await app.inject({ method: 'GET', url: path, headers: { ...headers, cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test('query validation refuses unbounded/ambiguous requests and client-supplied source/time overrides', async () => {
  const { app, store } = await setup();
  try {
    activate(store);
    for (const query of ['horizonHours=0', 'horizonHours=721', 'limit=201', 'limit=-1', 'limit=1.5', 'limit=abc', 'limit=1&limit=2', 'accountId=another', 'evaluatedAt=0']) {
      const response = await app.inject({ method: 'GET', url: path + '?' + query, headers }); assert.equal(response.statusCode, 422, query);
    }
  } finally { await app.close(); }
});

test('GET does not mutate data, change log or metadata; revision changes after a genuine local edit', async () => {
  const { app, store } = await setup();
  try {
    activate(store);
    const rows = () => ({ records: store.db.prepare('SELECT * FROM records ORDER BY entity,id').all(), changes: store.db.prepare('SELECT * FROM changes ORDER BY id').all(), meta: store.db.prepare('SELECT * FROM meta ORDER BY key').all() });
    const before = rows(), first = (await app.inject({ method: 'GET', url: path, headers })).json();
    const again = (await app.inject({ method: 'GET', url: path + '?limit=1', headers })).json();
    assert.deepEqual(rows(), before); assert.equal(first.source.revision, again.source.revision);
    const one = store.records('tasks')[0]; store.saveRecord('tasks', { subject: 'Edición sintética local' }, one.id);
    const after = (await app.inject({ method: 'GET', url: path + '?limit=200', headers })).json();
    assert.notEqual(after.source.revision, first.source.revision);
    if (one.values.status !== 'completed') assert.equal(after.items.find((x: any) => x.id === one.id).label, 'Edición sintética local');
  } finally { await app.close(); }
});

test('portable runtime can query priorities offline and a pending candidate does not replace the active source', async () => {
  const { app, store } = await setup(true);
  try {
    const active = activate(store);
    // Importing directly into Store resets its connection flag; the fixture then enters offline mode explicitly.
    store.set('disconnected', true); assert.equal(store.disconnected, true);
    const candidate = makeFixture('distribution'); store.importSnapshot(candidate);
    const result = await app.inject({ method: 'GET', url: path, headers }); assert.equal(result.statusCode, 200);
    assert.equal(result.json().source.captureId, active.id + ':' + active.capturedAt);
    assert.equal(store.candidate!.snapshot.name, candidate.name);
    assert.equal(store.disconnected, true);
  } finally { await app.close(); }
});

test('revision binds the capture generation even when snapshot ID, configuration and records are identical', async () => {
  const { app, store } = await setup();
  try {
    const original = activate(store);
    const first = (await app.inject({ method: 'GET', url: path, headers })).json();
    const newer = structuredClone(original); newer.capturedAt = new Date(Date.parse(original.capturedAt) + 1000).toISOString();
    store.importSnapshot(newer);
    store.saveGeneration(makeDemoSpec(newer), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
    store.activate();
    const after = (await app.inject({ method: 'GET', url: path, headers })).json();
    assert.equal(first.source.snapshotId, after.source.snapshotId);
    assert.notEqual(first.source.captureId, after.source.captureId);
    assert.notEqual(first.source.revision, after.source.revision);
  } finally { await app.close(); }
});
