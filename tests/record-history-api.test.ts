import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4399' };
const route = (id: string, capture?: string, extra = '') => '/api/v2/records/contacts/' + encodeURIComponent(id) + '/then' + (capture ? '?capture=' + encodeURIComponent(capture) + extra : extra);

async function setup() {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/r3-no-static'), runtime: false });
  const older = makeFixture(); older.capturedAt = '2026-11-01T09:00:00.000Z';
  const newer = structuredClone(older); newer.capturedAt = '2026-11-18T09:00:00.000Z';
  const contact = older.records.find(record => record.entity === 'contacts')!;
  contact.values.phone = '600 000 001';
  newer.records.find(record => record.id === contact.id)!.values.phone = '600 000 002';
  const olderId = store.addCapture(older), newerId = store.addCapture(newer);
  store.importSnapshot(newer);
  store.saveGeneration(makeDemoSpec(newer), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  store.saveRecord('contacts', { ...store.record('contacts', contact.id)!.values, phone: '600 000 003' }, contact.id);
  return { app, store, id: contact.id, olderId, newerId };
}
const tables = (store: Awaited<ReturnType<typeof setup>>['store']) => Object.fromEntries(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table, store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));

test('«Ver cómo estaba» compares the latest capture by default and any kept capture on request, without writing', async () => {
  const { app, store, id, olderId, newerId } = await setup();
  try {
    const before = tables(store);
    const latest = await app.inject({ method: 'GET', url: route(id), headers });
    assert.equal(latest.statusCode, 200);
    const body = latest.json();
    assert.deepEqual(body.captures.map((item: { captureId: string }) => item.captureId), [newerId, olderId]);
    assert.equal(body.capture.captureId, newerId);
    assert.equal(body.capture.isTestData, true);
    const phone = body.result.fields.find((field: { key: string }) => field.key === 'phone');
    assert.deepEqual([phone.then.value, phone.now.value], ['600 000 002', '600 000 003']);
    const old = (await app.inject({ method: 'GET', url: route(id, olderId), headers })).json();
    assert.equal(old.capture.captureId, olderId);
    assert.equal(old.result.fields.find((field: { key: string }) => field.key === 'phone').then.value, '600 000 001');
    assert.deepEqual(tables(store), before);
    assert.equal(store.snapshot!.capturedAt, '2026-11-18T09:00:00.000Z');
    assert.equal(store.record('contacts', id)!.values.phone, '600 000 003');
  } finally { await app.close(); }
});

test('unknown records and captures are 404; malformed queries 422; another portal 409', async () => {
  const { app, store, id, newerId } = await setup();
  try {
    assert.equal((await app.inject({ method: 'GET', url: route('no-existe'), headers })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: route(id, 'demo:2020-01-01T00:00:00.000Z'), headers })).statusCode, 404);
    for (const bad of [route(id, newerId, '&restore=1'), route(id, newerId, '&capture=otra'), '/api/v2/records/planetas/' + id + '/then']) {
      assert.equal((await app.inject({ method: 'GET', url: bad, headers })).statusCode, 422, bad);
    }
    const foreign = makeFixture(); foreign.source.accountId = 'otro-portal'; foreign.capturedAt = '2026-11-19T09:00:00.000Z';
    const foreignId = store.addCapture(foreign);
    assert.equal((await app.inject({ method: 'GET', url: route(id, foreignId), headers })).statusCode, 409);
  } finally { await app.close(); }
});

test('a capture whose body no longer matches its identity is refused', async () => {
  const { app, store, id, olderId } = await setup();
  try {
    const tampered = store.capture(olderId); tampered.capturedAt = '2026-11-02T09:00:00.000Z';
    store.db.prepare('UPDATE captures SET payload=? WHERE id=?').run(store.encode(tampered), olderId);
    assert.equal((await app.inject({ method: 'GET', url: route(id, olderId), headers })).statusCode, 422);
  } finally { await app.close(); }
});
