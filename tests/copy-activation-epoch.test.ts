import assert from 'node:assert/strict';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

async function setup(t: test.TestContext) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  t.after(() => app.close());
  const snapshot = makeFixture('agency');
  const generate = (data: typeof snapshot) => store.saveGeneration(makeDemoSpec(data), {
    provider: 'demo', model: null, prompt: '', generatedAt: data.capturedAt, approved: false,
  });
  store.importSnapshot(snapshot);
  generate(snapshot);
  store.activate();
  store.set('sessionId', 'fixture-428');
  const epoch = store.copyEpoch();
  const review = async () => {
    const response = await app.inject({ url: '/api/v4/activation-review' });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const activate = (revision: string) => app.inject({
    method: 'POST',
    url: '/api/v4/activate-reviewed',
    payload: { reviewed: true, revision },
  });
  return { store, snapshot, epoch, generate, review, activate };
}

test('428 · sustituir registros renueva la época incluso si coinciden captura y sesión', async t => {
  const { store, snapshot, epoch, generate, review, activate } = await setup(t);
  const next = structuredClone(snapshot);
  next.records.find(record => record.id === 'contact-1')!.values.phone = '910000428';
  store.importSnapshot(next);
  generate(next);
  const pending = await review();
  assert.equal(pending.replacesRecords, true);
  assert.equal(store.get('copyEpoch', ''), epoch, 'preparar y revisar no cambian la copia activa');
  const response = await activate(pending.revision);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(store.snapshot?.id, snapshot.id);
  assert.equal(store.snapshot?.capturedAt, snapshot.capturedAt);
  assert.equal(store.get('sessionId', ''), 'fixture-428');
  assert.equal(store.record('contacts', 'contact-1')?.values.phone, '910000428');
  assert.equal(store.changesCount, 0);
  const activeEpoch = store.get('copyEpoch', '');
  assert.ok(activeEpoch);
  assert.notEqual(activeEpoch, epoch, 'la nueva copia debe invalidar las confirmaciones anteriores');
});

test('428 · una activación rechazada revierte la nueva época y permite volver a confirmar', async t => {
  const { store, snapshot, epoch, generate, review, activate } = await setup(t);
  const next = structuredClone(snapshot);
  next.records.find(record => record.id === 'contact-1')!.values.phone = '920000428';
  store.importSnapshot(next);
  generate(next);
  const pending = await review();
  const before = { candidate: store.candidate, records: store.records(), changes: store.changes() };
  store.db.exec("CREATE TEMP TRIGGER refuse_428 BEFORE INSERT ON meta WHEN NEW.key = 'generation' BEGIN SELECT RAISE(ABORT, 'fixture-428'); END");
  const rejected = await activate(pending.revision);
  assert.equal(rejected.statusCode, 500, rejected.body);
  assert.deepEqual({ candidate: store.candidate, records: store.records(), changes: store.changes() }, before);
  assert.equal(store.get('copyEpoch', ''), epoch);
  store.db.exec('DROP TRIGGER refuse_428');
  const current = await review();
  const confirmed = await activate(current.revision);
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.notEqual(store.get('copyEpoch', ''), epoch);
  assert.equal(store.record('contacts', 'contact-1')?.values.phone, '920000428');
});

test('428 · activar solo el esquema conserva la época y los registros', async t => {
  const { store, snapshot, epoch, generate, review, activate } = await setup(t);
  generate(snapshot);
  const pending = await review();
  assert.equal(pending.replacesRecords, false);
  const records = store.records();
  const response = await activate(pending.revision);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(store.get('copyEpoch', ''), epoch);
  assert.deepEqual(store.records(), records);
});
