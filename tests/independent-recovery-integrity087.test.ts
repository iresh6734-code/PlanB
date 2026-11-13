import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { INVALID_RECOVERY_MESSAGE } from '../shared/recovery-integrity.js';

function seed(s: Store) {
  const snapshot = makeFixture();
  s.importSnapshot(snapshot);
  s.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null,
    generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  s.activate();
  s.saveRecord('contacts', { phone: 'independent-fiction087' }, 'contact-1');
  return s;
}
const raw = (s: Store) => (s.db.prepare("SELECT value FROM meta WHERE key='recoveryPlan'").get() as {value:string}).value;
const replace = (s: Store, value: string) => s.db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);

test('322: file reopen preserves undecodable plan bytes and history without permitting a new local effect', () => {
  const parent = path.resolve('tests/.tmp'); fs.mkdirSync(parent, { recursive: true });
  for (const bad of ['PRIVATE_322_NOT_JSON', 'enc1:AA==']) {
    const folder = fs.mkdtempSync(path.join(parent, 'recovery322-'));
    const file = path.join(folder, 'planb.sqlite');
    const original = seed(new Store(file));
    const records = original.records(), changes = original.changes();
    replace(original, bad); original.close();
    const reopened = new Store(file);
    try {
      assert.equal(raw(reopened), bad);
      assert.equal(reopened.recoveryIntegrity().state, 'invalid');
      assert.equal(reopened.recoveryState().plan, null);
      assert.throws(() => reopened.saveRecord('contacts', { phone: 'must-not-apply' }, 'contact-1'),
        (e: any) => e.status === 409 && e.message === INVALID_RECOVERY_MESSAGE);
      assert.deepEqual(reopened.records(), records);
      assert.deepEqual(reopened.changes(), changes);
      assert.equal(raw(reopened), bad);
    } finally { reopened.close(); }
  }
});

test('322: valid plan snapshots cannot mutate the cache; direct raw ABA revalidates after corruption', async () => {
  const s = seed(new Store(':memory:'));
  try {
    const plan = await new Recovery(s).preview(simulatedRemote(s));
    const encoded = raw(s);
    const copy = s.recoveryState();
    assert.ok(copy.plan);
    copy.plan.operations.length = 0;
    copy.integrity.state = 'invalid';
    assert.deepEqual(s.recoveryState().plan, plan);
    replace(s, 'PRIVATE_322_CORRUPT');
    assert.equal(s.recoveryIntegrity().state, 'invalid');
    replace(s, encoded);
    assert.equal(s.recoveryIntegrity().state, 'valid');
    assert.deepEqual(s.recoveryState().plan, plan);
    assert.equal(raw(s), encoded);
  } finally { s.close(); }
});

test('322: malformed raw plan is diagnosed through HTTP without leaking it or adding any history', async () => {
  const root = fs.mkdtempSync(path.join(path.resolve('tests/.tmp'), 'recovery322-http-'));
  const { app, store } = await createBaseApp({ root, dbPath: ':memory:', staticDir: path.join(root, 'empty') });
  try {
    seed(store);
    const secret = 'PRIVATE_322_RAW_MUST_NOT_APPEAR';
    replace(store, secret);
    const before = store.changes();
    const headers = { host: '127.0.0.1:4430', origin: 'http://127.0.0.1:4430' };
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({ url: '/api/v2/changes', headers });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().recoveryIntegrity.state, 'invalid');
      assert.equal(response.json().plan, null);
      assert.equal(response.json().changes.length, 1);
      assert.equal(response.body.includes(secret), false);
    }
    const rejected = await app.inject({ method: 'POST', url: '/api/v2/return/preview', headers, payload: {} });
    assert.equal(rejected.statusCode, 409);
    assert.equal(rejected.body.includes(secret), false);
    assert.deepEqual(store.changes(), before);
    assert.equal(raw(store), secret);
  } finally { await app.close(); }
});
