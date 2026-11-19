import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4399' };
const preview = (keeper: string, duplicate: string) => '/api/v2/records/merge-preview?entity=contacts&keeper=' + encodeURIComponent(keeper) + '&duplicate=' + encodeURIComponent(duplicate);

async function setup() {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/f8-no-static'), runtime: false });
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  const duplicate = store.saveRecord('contacts', { firstname: 'Lucía', lastname: 'Martín', email: 'lucia.trabajo@example.com', phone: '611 111 111', service: 'brand' });
  const inject = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return { app, store, inject, keeperId: 'contact-1', duplicateId: duplicate.id };
}

test('merging copies only the chosen values into the keeper, sets the duplicate aside and can be undone', async () => {
  const { app, store, inject, keeperId, duplicateId } = await setup();
  try {
    const duplicateBefore = store.record('contacts', duplicateId);
    const changesBefore = store.changesCount;
    const seen = (await inject('GET', preview(keeperId, duplicateId))).json();
    assert.deepEqual([seen.keeper.label, seen.duplicate.label], ['Lucía Martín', 'Lucía Martín']);
    assert.ok(seen.fields.some((field: { key: string }) => field.key === 'phone'));
    const text = (key: string) => { const field = seen.fields.find((item: { key: string }) => item.key === key); return [field.keeperText, field.duplicateText]; };
    assert.deepEqual(text('service'), ['Diseño web', 'Identidad de marca']);
    assert.deepEqual(text('company_id'), ['Estudio Arce', '']);
    const merged = await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: ['phone'], seen: seen.seen });
    assert.equal(merged.statusCode, 200, merged.body);
    assert.equal(store.record('contacts', keeperId)!.values.phone, '611 111 111');
    assert.deepEqual(store.record('contacts', duplicateId), duplicateBefore);
    const changes = store.changes().slice(changesBefore);
    assert.deepEqual(changes.map(change => [change.operation, change.recordId]), [['update', keeperId]]);
    const list = (await inject('GET', '/api/v2/records/merges')).json();
    assert.equal(list.merges.length, 1);
    assert.deepEqual(list.merges[0].fields, ['Teléfono']);
    assert.equal((await inject('GET', preview(keeperId, duplicateId))).statusCode, 409);
    const undone = await inject('POST', '/api/v2/records/merges/' + list.merges[0].id + '/undo', {});
    assert.equal(undone.statusCode, 200, undone.body);
    assert.equal(store.record('contacts', keeperId)!.values.phone, '600 000 001');
    assert.deepEqual((await inject('GET', '/api/v2/records/merges')).json().merges, []);
    assert.equal((await inject('POST', '/api/v2/records/merges/' + list.merges[0].id + '/undo', {})).statusCode, 404);
  } finally { await app.close(); }
});

test('a stale view or an invalid choice writes nothing', async () => {
  const { app, store, inject, keeperId, duplicateId } = await setup();
  try {
    const seen = (await inject('GET', preview(keeperId, duplicateId))).json().seen;
    const before = store.db.prepare('SELECT * FROM changes').all();
    assert.equal((await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: ['phone'], seen: { ...seen, keeper: 'x-00000000' } })).statusCode, 409);
    assert.equal((await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: ['company_id'], seen })).statusCode, 422);
    assert.equal((await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId: keeperId, take: [], seen })).statusCode, 422);
    assert.equal((await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: [], seen, extra: 1 })).statusCode, 422);
    assert.deepEqual(store.db.prepare('SELECT * FROM changes').all(), before);
    assert.deepEqual((await inject('GET', '/api/v2/records/merges')).json().merges, []);
  } finally { await app.close(); }
});

test('setting aside without taking values writes no change; release and restore close the entry', async () => {
  const { app, store, inject, keeperId, duplicateId } = await setup();
  try {
    const changes = store.changesCount;
    const seen = (await inject('GET', preview(keeperId, duplicateId))).json().seen;
    const merged = (await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: [], seen })).json();
    assert.equal(merged.change, null);
    assert.equal(store.changesCount, changes);
    assert.equal((await inject('POST', '/api/v2/records/merges/' + merged.merge.id + '/release', {})).statusCode, 200);
    assert.deepEqual((await inject('GET', '/api/v2/records/merges')).json().merges, []);
    const again = (await inject('GET', preview(keeperId, duplicateId))).json().seen;
    await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: [], seen: again });
    assert.equal((await inject('GET', '/api/v2/records/merges')).json().merges.length, 1);
    store.set('copyEpoch', 'otra-copia');
    assert.deepEqual((await inject('GET', '/api/v2/records/merges')).json().merges, []);
  } finally { await app.close(); }
});

test('undo refuses when the keeper changed after the merge', async () => {
  const { app, store, inject, keeperId, duplicateId } = await setup();
  try {
    const seen = (await inject('GET', preview(keeperId, duplicateId))).json().seen;
    const merged = (await inject('POST', '/api/v2/records/merge', { entity: 'contacts', keeperId, duplicateId, take: ['phone'], seen })).json();
    store.saveRecord('contacts', { phone: '622 222 222' }, keeperId);
    const refused = await inject('POST', '/api/v2/records/merges/' + merged.merge.id + '/undo', {});
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.json().details.code, 'RECORD_CHANGED');
    assert.equal(store.record('contacts', keeperId)!.values.phone, '622 222 222');
    assert.equal((await inject('GET', '/api/v2/records/merges')).json().merges.length, 1);
  } finally { await app.close(); }
});
