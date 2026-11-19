import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { checkHeadline, checkValue, parseReturnCheck } from '../src/app-shell/return-check-client.js';

function seed(store: Store) {
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  store.saveRecord('contacts', { phone: '611 222 333' }, 'contact-1');
  store.saveRecord('contacts', { phone: '611 444 555' }, 'contact-2');
}
async function returned(store: Store) {
  const engine = new Recovery(store), plan = await engine.preview(simulatedRemote(store));
  engine.approve(plan.id);
  const done = await engine.apply(plan.id, simulatedRemote(store));
  assert.equal(done.status, 'complete');
  return { engine, plan: done };
}
const remoteRecords = (store: Store) => store.get<CrmRecord[]>('simulatedRemote', []);
const frozen = (store: Store) => JSON.stringify([store.get('recoveryPlan', null), store.records(), store.changes(), store.get('returnWatermark:simulation', 0)]);

test('checking a finished return rereads every sent record and only reads', async () => {
  const store = new Store(':memory:');
  try {
    seed(store);
    const { engine, plan } = await returned(store);
    const before = frozen(store), sentToRemote = JSON.stringify(remoteRecords(store));
    const clean = await engine.check(plan.id, simulatedRemote(store));
    assert.deepEqual(clean.summary, { same: 2, changed: 0, missing: 0, notSent: 0, skipped: 0 });
    assert.ok(clean.items.every(item => item.state === 'same' && item.checked === 1));
    store.set('simulatedRemote', remoteRecords(store).flatMap(record => record.id === 'contact-1' ? [{ ...record, values: { ...record.values, phone: '699 000 000' } }] : record.id === 'contact-2' ? [] : [record]));
    const after = await engine.check(plan.id, simulatedRemote(store));
    assert.deepEqual(after.summary, { same: 0, changed: 1, missing: 1, notSent: 0, skipped: 0 });
    const changed = after.items.find(item => item.state === 'changed')!;
    assert.equal(changed.remoteId, 'contact-1');
    assert.deepEqual(changed.fields.map(field => [field.field, field.sent, field.now]), [['phone', '611 222 333', '699 000 000']]);
    assert.equal(after.items.find(item => item.state === 'missing')!.remoteId, 'contact-2');
    assert.equal(frozen(store), before, 'la comprobación no guarda el plan ni toca la copia');
    assert.notEqual(JSON.stringify(remoteRecords(store)), sentToRemote);
  } finally { store.close(); }
});

test('checking refuses another destination, a plan with nothing sent and a return in progress', async () => {
  const store = new Store(':memory:');
  try {
    seed(store);
    const engine = new Recovery(store), plan = await engine.preview(simulatedRemote(store));
    await assert.rejects(engine.check(plan.id, simulatedRemote(store)), (error: { status?: number; message: string }) => error.status === 409 && /nada enviado/.test(error.message));
    engine.approve(plan.id);
    await engine.apply(plan.id, simulatedRemote(store));
    await assert.rejects(engine.check(plan.id, { ...simulatedRemote(store), source: 'hubspot' }), { status: 409 });
    await assert.rejects(engine.check('otro-plan', simulatedRemote(store)), { status: 404 });
    store.set('returnBusy', true);
    await assert.rejects(engine.check(plan.id, simulatedRemote(store)), (error: { status?: number; message: string }) => error.status === 409 && /en curso/.test(error.message));
  } finally { store.close(); }
});

test('the check route answers with the simulated destination and the client reads it', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/t6-no-static'), runtime: false });
  try {
    seed(store);
    const { plan } = await returned(store);
    const call = (payload: object) => app.inject({ method: 'POST', url: '/api/v2/return/check', headers: { host: '127.0.0.1:4399' }, payload });
    const response = await call({ planId: plan.id, simulation: true });
    assert.equal(response.statusCode, 200, response.body);
    const check = parseReturnCheck(response.json());
    assert.equal(check.source, 'simulation');
    assert.equal(checkHeadline(check), '2 siguen igual');
    assert.equal((await call({ planId: plan.id, simulation: true, extra: 1 })).statusCode, 422);
  } finally { await app.close(); }
});

test('the client never trusts a malformed check and words values plainly', () => {
  const good = { planId: 'p', source: 'hubspot', checkedAt: '2026-11-19T10:00:00.000Z', summary: { same: 1, changed: 1, missing: 1, notSent: 2, skipped: 0 },
    items: [{ operationId: 'o', entity: 'contacts', label: 'Lucía', kind: 'update', remoteId: '1', state: 'changed', checked: 1, fields: [{ field: 'phone', label: 'Teléfono', sent: '1', now: null }] }] };
  assert.equal(checkHeadline(parseReturnCheck(good)), '1 sigue igual · 1 cambió después · 1 ya no aparece · 2 no se enviaron');
  for (const bad of [null, { ...good, source: 'otro' }, { ...good, summary: { ...good.summary, same: -1 } }, { ...good, items: [{ ...good.items[0], state: 'raro' }] },
    { ...good, items: [{ ...good.items[0], entity: 'people' }] }, { ...good, items: [{ ...good.items[0], fields: [{ field: 'phone', label: 'T', sent: {}, now: null }] }] }])
    assert.throws(() => parseReturnCheck(bad), /comprobación legible/);
  assert.deepEqual([checkValue(null), checkValue(''), checkValue(true), checkValue(3)], ['vacío', 'vacío', 'Sí', '«3»']);
});
