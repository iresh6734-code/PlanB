import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4399' }, route = '/api/v2/captures/compare';
async function setup(runtime = false) { return createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/diff040-no-static'), runtime }); }
function captures(store: Awaited<ReturnType<typeof setup>>['store']) {
  const from = makeFixture(); from.capturedAt = '2026-10-28T12:00:00.000Z'; const to = structuredClone(from); to.capturedAt = '2026-10-29T12:00:00.000Z';
  to.records.find(r => r.entity === 'contacts')!.values.phone = '600 000 040';
  return { from, to, fromId: store.addCapture(from), toId: store.addCapture(to) };
}
const url = (from: string, to: string, extra = '') => route + '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + extra;

test('saved captures can be compared without activating a copy; response identifies both inputs', async () => {
  const { app, store } = await setup();
  try {
    const data = captures(store); assert.equal(store.ready, false);
    const response = await app.inject({ method: 'GET', url: url(data.fromId, data.toId), headers });
    assert.equal(response.statusCode, 200); assert.equal(response.headers['cache-control'], 'no-store');
    const result = response.json(); assert.equal(result.from.captureId, data.fromId); assert.equal(result.to.captureId, data.toId);
    assert.match(result.from.contentHash, /^[a-f0-9]{64}$/); assert.notEqual(result.to.contentHash, result.from.contentHash);
    assert.equal(result.records.counts.contacts.changed, 1); assert.equal(result.records.totalDifferences, 1);
  } finally { await app.close(); }
});

test('authentication, revocation, local Host and Origin policy apply to historical data', async () => {
  const { app, store } = await setup();
  try {
    const data = captures(store), target = url(data.fromId, data.toId);
    const setupResponse = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'solo-fixture-diff040-2026' } });
    assert.equal(setupResponse.statusCode, 200); const cookie = String(setupResponse.headers['set-cookie']).split(';')[0];
    assert.equal((await app.inject({ method: 'GET', url: target, headers })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: target, headers: { ...headers, cookie } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: target, headers: { host: 'external.invalid', cookie } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: target, headers: { ...headers, cookie, origin: 'https://external.invalid' } })).statusCode, 403);
    await app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie } });
    assert.equal((await app.inject({ method: 'GET', url: target, headers: { ...headers, cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test('invalid queries and unknown captures have distinct 422/404 responses', async () => {
  const { app, store } = await setup();
  try {
    const data = captures(store), target = url(data.fromId, data.toId);
    for (const bad of [route, route + '?from=x', target + '&limit=201', target + '&offset=-1', target + '&offset=1.5', target + '&portal=other', target + '&limit=1&limit=2', target + '&from=another']) {
      assert.equal((await app.inject({ method: 'GET', url: bad, headers })).statusCode, 422, bad);
    }
    assert.equal((await app.inject({ method: 'GET', url: url('missing', data.toId), headers })).statusCode, 404);
  } finally { await app.close(); }
});

test('different portals are rejected instead of producing misleading additions and absences', async () => {
  const { app, store } = await setup();
  try {
    const a = makeFixture(), b = structuredClone(a); b.source.accountId = 'another-demo-portal'; b.capturedAt = new Date(Date.parse(a.capturedAt) + 1).toISOString();
    const from = store.addCapture(a), to = store.addCapture(b);
    const response = await app.inject({ method: 'GET', url: url(from, to), headers }); assert.equal(response.statusCode, 409);
  } finally { await app.close(); }
});

test('comparison preserves all stored tables, active generation and local change history', async () => {
  const { app, store } = await setup();
  try {
    const data = captures(store); store.importSnapshot(data.from);
    store.saveGeneration(makeDemoSpec(data.from), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
    store.saveRecord('contacts', { phone: 'edición local ajena a las capturas' }, 'contact-1');
    const tables = () => Object.fromEntries(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table, store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
    const before = tables(); const response = await app.inject({ method: 'GET', url: url(data.fromId, data.toId), headers });
    assert.equal(response.statusCode, 200); assert.deepEqual(tables(), before);
    assert.equal(store.record('contacts', 'contact-1')!.values.phone, 'edición local ajena a las capturas');
    assert.equal(store.snapshot!.capturedAt, data.from.capturedAt);
    assert.notEqual(response.json().records.items[0].fields.find((f: any) => f.key === 'phone').before.value, 'edición local ajena a las capturas');
  } finally { await app.close(); }
});

test('identity/content mismatches and corrupted-but-readable capture bodies are rejected', async () => {
  const { app, store } = await setup();
  try {
    const data = captures(store), wrong = structuredClone(data.to); wrong.capturedAt = '2026-10-29T13:00:00.000Z';
    store.db.prepare('UPDATE captures SET payload=? WHERE id=?').run(store.encode(wrong), data.toId);
    assert.equal((await app.inject({ method: 'GET', url: url(data.fromId, data.toId), headers })).statusCode, 422);
    wrong.capturedAt = data.to.capturedAt; wrong.manifest.complete = false;
    store.db.prepare('UPDATE captures SET payload=? WHERE id=?').run(store.encode(wrong), data.toId);
    assert.equal((await app.inject({ method: 'GET', url: url(data.fromId, data.toId), headers })).statusCode, 422);
  } finally { await app.close(); }
});

test('portable runtime permits offline historical comparison without promoting either capture', async () => {
  const { app, store } = await setup(true);
  try {
    const data = captures(store); assert.equal(store.disconnected, true);
    const response = await app.inject({ method: 'GET', url: url(data.toId, data.fromId, '&limit=1'), headers });
    assert.equal(response.statusCode, 200); assert.equal(response.json().chronological, false);
    assert.equal(store.snapshot, null); assert.equal(store.disconnected, true);
  } finally { await app.close(); }
});
