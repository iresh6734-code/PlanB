import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { registerTaskRevision } from '../server/task-revision.js';

const host = { host: '127.0.0.1:4609', origin: 'http://127.0.0.1:4609' }, base = '/api/v7/task-revision/task-2';
async function fixture(active = true) {
  const root = path.resolve('tests/.tmp/task128-' + randomUUID());
  const f = await createBaseApp({ root, staticDir: path.join(root, 'none'), dbPath: ':memory:' }); const snap = makeFixture('agency'); f.store.importSnapshot(snap);
  if (active) { f.store.saveGeneration(makeDemoSpec(snap), { provider: 'demo', model: null, generatedAt: '2026-11-02T08:00:00Z', prompt: '', approved: false }); f.store.activate(); }
  registerTaskRevision(f.app, f.store); return f;
}
test('guarded actual base app: host, origin and session checks cover reads and writes', async () => {
  const { app } = await fixture(); try {
    const setup = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: host, payload: { password: 'fictional-test-password-128' } }); assert.equal(setup.statusCode, 200);
    assert.equal((await app.inject({ url: base, headers: host })).statusCode, 401);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    assert.equal((await app.inject({ url: base, headers: { ...host, cookie, host: 'evil.example' } })).statusCode, 403);
    assert.equal((await app.inject({ url: base, headers: { ...host, cookie, origin: 'http://evil.example' } })).statusCode, 403);
    const get = await app.inject({ url: base, headers: { ...host, cookie } }); assert.equal(get.statusCode, 200); assert.equal(get.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ method: 'PATCH', url: base, headers: host, payload: { expectedRevision: get.json().revision, values: { subject: 'x' } } })).statusCode, 401);
    await app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...host, cookie } }); assert.equal((await app.inject({ url: base, headers: { ...host, cookie } })).statusCode, 401);
  } finally { await app.close(); }
});
test('competing writes with the same revision produce one success and one conflict', async () => {
  const { app, store } = await fixture(); try { const get = await app.inject({ url: base, headers: host }), rev = get.json().revision, initial = store.changesCount;
    const replies = await Promise.all(['Primera', 'Segunda'].map(subject => app.inject({ method: 'PATCH', url: base, headers: host, payload: { expectedRevision: rev, values: { subject } } })));
    assert.deepEqual(replies.map(r => r.statusCode).sort(), [200, 409]); assert.equal(store.changesCount, initial + 1);
    const success = replies.find(r => r.statusCode === 200)!.json(); assert.equal(store.record('tasks', 'task-2')!.values.subject, success.current.record.values.subject);
  } finally { await app.close(); }
});
test('same-state replay is a conflict after a successful write; no automatic retry or duplicate history', async () => {
  const { app, store } = await fixture(); try { const rev = (await app.inject({ url: base, headers: host })).json().revision, initial = store.changesCount;
    const request = { method: 'PATCH' as const, url: base, headers: host, payload: { expectedRevision: rev, values: { subject: 'Guardado' } } };
    assert.equal((await app.inject(request)).statusCode, 200); const replay = await app.inject(request); assert.equal(replay.statusCode, 409); assert.equal(store.changesCount, initial + 1);
  } finally { await app.close(); }
});
test('lost response after a successful write can be resolved by reading, without applying it twice', async () => {
  const { app, store } = await fixture(); try {
    const first = (await app.inject({ url: base, headers: host })).json(), initial = store.changesCount;
    const applied = await app.inject({ method: 'PATCH', url: base, headers: host, payload: { expectedRevision: first.revision, values: { subject: 'Solicitud con acuse perdido' } } });
    assert.equal(applied.statusCode, 200); // the transport drops this response after the server committed
    const observed = (await app.inject({ url: base, headers: host })).json(); assert.equal(observed.record.values.subject, 'Solicitud con acuse perdido');
    assert.notEqual(observed.revision, first.revision); assert.equal(store.changesCount, initial + 1);
    const retry = await app.inject({ method: 'PATCH', url: base, headers: host, payload: { expectedRevision: first.revision, values: { subject: 'Solicitud con acuse perdido' } } });
    assert.equal(retry.statusCode, 409); assert.equal(store.changesCount, initial + 1);
  } finally { await app.close(); }
});
test('a no-op revision does not add another local change', async () => {
  const { app, store } = await fixture(); try { const first = (await app.inject({ url: base, headers: host })).json(), before = store.changesCount;
    const r = await app.inject({ method: 'PATCH', url: base, headers: host, payload: { expectedRevision: first.revision, values: { subject: first.record.values.subject } } });
    assert.equal(r.statusCode, 200); assert.equal(r.json().changed, false); assert.equal(r.json().current.revision, first.revision); assert.equal(store.changesCount, before);
  } finally { await app.close(); }
});
test('rejects malformed body, unknown record and not activated store', async () => {
  const f = await fixture(false); try { assert.equal((await f.app.inject({ url: base, headers: host })).statusCode, 409); } finally { await f.app.close(); }
  const { app, store } = await fixture(); try { const before = store.changesCount, rev = (await app.inject({ url: base, headers: host })).json().revision;
    for (const payload of [{ expectedRevision: rev, values: {} }, { expectedRevision: 'fake', values: { subject: 'x' } }, { expectedRevision: rev, values: { subject: 'x' }, extra: 1 }]) assert.equal((await app.inject({ method: 'PATCH', url: base, headers: host, payload })).statusCode, 422);
    assert.equal((await app.inject({ url: '/api/v7/task-revision/missing', headers: host })).statusCode, 404); assert.equal(store.changesCount, before);
  } finally { await app.close(); }
});
