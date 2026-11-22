import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4590' };

function copy(name: string, accountId: string) {
  const store = new Store(':memory:');
  try {
    const snapshot = makeFixture('agency');
    snapshot.capturedAt = '2026-11-19T08:00:00.000Z';
    snapshot.name = name;
    snapshot.source.accountId = accountId;
    snapshot.records.find(record => record.entity === 'contacts' && record.id === 'contact-1')!.values.firstname = name;
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '',
      generatedAt: snapshot.capturedAt, approved: false });
    store.activate();
    return store.bundle();
  } finally {
    store.close();
  }
}

async function fixture(t: TestContext) {
  const base = path.resolve(tmpdir());
  const root = mkdtempSync(path.join(base, 'planb-state-459-'));
  const dbPath = path.join(root, 'planb.sqlite');
  writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  let action: (() => void) | undefined;
  let reads = 0;
  const { app, store } = await createBaseApp({
    root, dbPath, staticDir: path.join(root, 'no-assets'),
    hubspotConfigured: () => { reads++; action?.(); return false; },
  });
  const writer = new Store(dbPath);
  t.after(async () => {
    writer.close();
    await app.close();
    assert.equal(path.dirname(root), base);
    assert.match(path.basename(root), /^planb-state-459-/);
    rmSync(root, { recursive: true, force: true });
  });
  const original = copy('Copia anterior', 'cuenta-ficticia-a');
  const replacement = copy('Copia restaurada', 'cuenta-ficticia-b');
  store.restoreBundle(original);
  return {
    app, store, writer, original, replacement,
    reads: () => reads,
    duringRead: (next?: () => void) => { action = next; },
  };
}

for (const url of ['/api/state', '/api/v2/state']) {
  test(`459 · ${url} vuelve a leer tras restaurar con el mismo ID y fecha`, async t => {
    const f = await fixture(t);
    const initial = await f.app.inject({ url, headers });
    assert.equal(initial.statusCode, 200);
    assert.equal(f.reads(), 1);
    const previous = initial.json();
    const writes = f.store.db.prepare('SELECT total_changes() AS n').get()?.n;
    f.duringRead(() => {
      f.duringRead();
      f.writer.restoreBundle(f.replacement);
    });
    const fetched = await f.app.inject({ url, headers });
    assert.equal(fetched.statusCode, 200);
    const current = fetched.json();
    assert.equal(current.snapshot.id, previous.snapshot.id);
    assert.equal(current.snapshot.capturedAt, previous.snapshot.capturedAt);
    assert.equal(current.workspaceSearchContext.accountId, current.snapshot.source.accountId);
    assert.equal(current.snapshot.name, 'Copia restaurada');
    assert.equal(current.spec.title, 'Copia restaurada');
    assert.equal(current.snapshot.source.accountId, 'cuenta-ficticia-b');
    assert.notEqual(current.workspaceSearchContext.contextRevision, previous.workspaceSearchContext.contextRevision);
    assert.equal(current.ready, true);
    assert.equal(f.reads(), 3, 'una lectura inicial y dos intentos de la segunda petición');
    assert.equal(f.store.db.prepare('SELECT total_changes() AS n').get()?.n, writes);
    assert.equal(f.store.changesCount, 0);
    if (url === '/api/v2/state') {
      assert.deepEqual(current.snapshot.records, []);
      assert.deepEqual(current.snapshot.links, []);
    } else {
      assert.equal(current.snapshot.records.find((record: { id: string }) => record.id === 'contact-1').values.firstname, 'Copia restaurada');
    }
  });
}

test('459 · dos cambios durante el estado devuelven 409 y la siguiente lectura funciona', async t => {
  const f = await fixture(t);
  let restoringOriginal = false;
  f.duringRead(() => {
    f.writer.restoreBundle(restoringOriginal ? f.original : f.replacement);
    restoringOriginal = !restoringOriginal;
  });
  const conflict = await f.app.inject({ url: '/api/v2/state', headers });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().snapshot, undefined);
  assert.equal(conflict.json().workspaceSearchContext, undefined);
  assert.equal(f.reads(), 2);
  f.duringRead();
  const fresh = await f.app.inject({ url: '/api/v2/state', headers });
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.json().workspaceSearchContext.accountId, 'cuenta-ficticia-a');
  assert.equal(f.reads(), 3);
});
