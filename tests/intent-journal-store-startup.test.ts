import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

process.env.NODE_ENV = 'test';

const brokenKey = 'task-intent:legacy-broken';
const brokenValue = '{incomplete-fiction-232: "dañado"\n';
const legacyKey = 'task-intent:legacy-readable';
const legacyValue = 'texto ficticio de una fila heredada';
const headers = { host: '127.0.0.1:19232' };

function fixture() {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'journal-startup-232-'));
  writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  return { root, dbPath: path.join(root, 'fixture.sqlite'), staticDir: path.join(root, 'none') };
}

function rawValue(store: Store, key: string) {
  return (store.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string }).value;
}

test('a malformed legacy journal row preserves its bytes and leaves the active local workspace available across restarts', async () => {
  const options = fixture();
  const initial = new Store(options.dbPath);
  const snapshot = makeFixture('agency');
  let previousChanges;
  try {
    initial.importSnapshot(snapshot);
    initial.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-05T12:00:00Z', prompt: '', approved: false });
    initial.activate();
    initial.saveRecord('contacts', { phone: 'ficcion-232' }, 'contact-1');
    previousChanges = initial.changes();
    const insert = initial.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)');
    insert.run(legacyKey, JSON.stringify(legacyValue));
    insert.run(brokenKey, brokenValue);
  } finally {
    initial.close();
  }

  let migrated: string | undefined;
  for (let restart = 0; restart < 2; restart++) {
    const { app, store } = await createBaseApp(options);
    try {
      const state = await app.inject({ url: '/api/v2/state', headers });
      const contacts = await app.inject({ url: '/api/records/contacts', headers });
      assert.equal(state.statusCode, 200);
      assert.equal(contacts.statusCode, 200);
      assert.equal(state.json().ready, true);
      assert.equal(state.json().snapshot.id, snapshot.id);
      assert.equal(state.json().changes, 1);
      assert.equal(contacts.json().records.find((record: { id: string }) => record.id === 'contact-1').values.phone, 'ficcion-232');
      assert.deepEqual(store.changes(), previousChanges);
      assert.equal(rawValue(store, brokenKey), brokenValue);
      assert.throws(() => store.get(brokenKey, null), SyntaxError);
      assert.equal(store.get(legacyKey, null), legacyValue);
      const encrypted = rawValue(store, legacyKey);
      assert.match(encrypted, /^enc1:/);
      if (migrated) assert.equal(encrypted, migrated);
      migrated = encrypted;
      assert.doesNotMatch(state.body + contacts.body, /incomplete-fiction-232|legacy-broken/);
    } finally {
      await app.close();
    }
  }
});

test('malformed metadata outside the journal namespace still rejects startup', () => {
  const options = fixture();
  const store = new Store(options.dbPath);
  try {
    store.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('task-intent-other:legacy-broken', brokenValue);
  } finally {
    store.close();
  }
  assert.throws(() => new Store(options.dbPath), SyntaxError);
});
