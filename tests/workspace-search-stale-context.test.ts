import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const headers = { host: '127.0.0.1:4391' };

function activate(store: Store, profile: 'agency' | 'distribution', firstName?: string) {
  const snapshot = makeFixture(profile);
  snapshot.capturedAt = profile === 'agency' ? '2026-11-05T12:00:00.000Z' : '2026-11-05T12:30:00.000Z';
  if (firstName) snapshot.records.find(record => record.entity === 'contacts' && record.id === 'contact-1')!.values.firstname = firstName;
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), {
    provider: 'demo', model: null, generatedAt: '2026-11-05T14:00:00.000Z', prompt: '', approved: false,
  });
  store.activate();
  store.set('sessionId', 'fixture-search-session-207');
}

async function fixture() {
  const root = path.resolve('tests/.tmp/search207-inject');
  const result = await createBaseApp({ root, staticDir: path.join(root, 'no-assets'), dbPath: ':memory:', runtime: true });
  result.store.set('instanceId', '7ff364f8-2e33-40dc-8fef-4b3018ccc207');
  activate(result.store, 'agency');
  await result.app.ready();
  await new Promise<void>(resolve => setImmediate(resolve));
  return result;
}

function observeReads(store: Store, unavailable = false) {
  const original = store.records.bind(store);
  let reads = 0;
  store.records = (...args) => {
    reads++;
    if (unavailable) throw new Error('Synthetic unavailable records');
    return original(...args);
  };
  return () => reads;
}

function openUrl(captureId: string, revision: string) {
  return '/api/v2/search-record?' + new URLSearchParams({ entity: 'contacts', id: 'contact-1', captureId, revision });
}

test('207 a previous context cannot enumerate records in the replacement capture', async () => {
  const { app, store } = await fixture();
  try {
    const previous = await app.inject({ url: '/api/v2/search?q=contact-1', headers });
    assert.equal(previous.statusCode, 200);
    activate(store, 'distribution');
    const reads = observeReads(store);
    const stale = await app.inject({ url: '/api/v2/search?q=contact-1&contextRevision=' + previous.json().source.contextRevision, headers });
    assert.equal(stale.statusCode, 409);
    assert.match(stale.json().error, /Actualiza el espacio de trabajo/);
    assert.equal(reads(), 0);
    assert.equal(store.changesCount, 0);
  } finally { await app.close(); }
});

for (const operation of ['búsqueda fría', 'búsqueda caliente', 'abrir ficha'] as const) {
  test('207 · cambiar de copia durante la lectura devuelve 409 en ' + operation, async t => {
    const base = path.resolve(tmpdir());
    const root = mkdtempSync(path.join(base, 'planb-search-207-'));
    t.after(() => {
      assert.equal(path.dirname(root), base);
      assert.match(path.basename(root), /^planb-search-207-/);
      rmSync(root, { recursive: true, force: true });
    });
    const dbPath = path.join(root, 'planb.sqlite');
    writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
    const { app, store } = await createBaseApp({ root, staticDir: path.join(root, 'no-assets'), dbPath, runtime: true });
    const writer = new Store(dbPath);
    try {
      activate(store, 'agency', 'Original207');
      const initial = await app.inject({ url: operation === 'búsqueda fría' ? '/api/v2/state' : '/api/v2/search?q=Original207', headers });
      assert.equal(initial.statusCode, 200);
      const source = operation === 'búsqueda fría' ? initial.json().workspaceSearchContext : initial.json().source;
      const read = store.records.bind(store);
      let activated = false;
      store.records = (...args) => {
        if (!activated) {
          activate(writer, 'distribution', 'Reemplazo207');
          activated = true;
        }
        return read(...args);
      };
      const query = operation === 'búsqueda fría' ? 'Reemplazo207' : 'Original207';
      const url = operation === 'abrir ficha' ? openUrl(source.captureId, source.revision)
        : `/api/v2/search?q=${query}&contextRevision=${source.contextRevision}`;
      const response = await app.inject({ url, headers });
      assert.ok(activated);
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().items, undefined);
      assert.equal(response.json().record, undefined);
      const fresh = await app.inject({ url: '/api/v2/search?q=Reemplazo207', headers });
      assert.equal(fresh.statusCode, 200);
      assert.notEqual(fresh.json().source.contextRevision, source.contextRevision);
      assert.ok(fresh.json().items.some((item: { label: string }) => item.label.includes('Reemplazo207')));
      assert.equal(store.changesCount, 0);
    } finally {
      writer.close();
      await app.close();
    }
  });
}

test('207 opening from another capture returns the context conflict even if records cannot be read', async () => {
  const { app, store } = await fixture();
  try {
    const previous = await app.inject({ url: '/api/v2/search?q=contact-1', headers });
    assert.equal(previous.statusCode, 200);
    const { captureId, revision } = previous.json().source;
    activate(store, 'distribution');
    const reads = observeReads(store, true);
    const stale = await app.inject({ url: openUrl(captureId, revision), headers });
    assert.equal(stale.statusCode, 409);
    assert.match(stale.json().error, /Actualiza la búsqueda antes de abrir el registro/);
    assert.equal(reads(), 0);
    assert.equal(store.changesCount, 0);
  } finally { await app.close(); }
});

test('207 current context and capture still require a matching record revision', async t => {
  const { app, store } = await fixture();
  try {
    const before = await app.inject({ url: '/api/v2/search?q=contact-1', headers });
    assert.equal(before.statusCode, 200);
    const { captureId, revision, contextRevision } = before.json().source;
    const open = await app.inject({ url: openUrl(captureId, revision), headers });
    assert.equal(open.statusCode, 200);
    assert.equal(open.json().record.id, 'contact-1');
    t.diagnostic(`compatible-search-207 ${contextRevision} ${revision}`);
    store.saveRecord('contacts', { firstname: 'Edición ficticia 207' }, 'contact-1');
    const reads = observeReads(store);
    assert.equal((await app.inject({ url: openUrl(captureId, revision), headers })).statusCode, 409);
    assert.equal((await app.inject({ url: `/api/v2/search?q=contact-1&contextRevision=${contextRevision}&revision=${revision}`, headers })).statusCode, 409);
    assert.equal(reads(), 2);
    const next = await app.inject({ url: `/api/v2/search?q=contact-1&contextRevision=${contextRevision}`, headers });
    assert.equal(next.statusCode, 200);
    assert.equal(next.json().source.contextRevision, contextRevision);
    assert.notEqual(next.json().source.revision, revision);
    assert.equal(store.changesCount, 1);
  } finally { await app.close(); }
});
