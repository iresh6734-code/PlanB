import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { Store } from '../server/store.js';

const headers = { host: '127.0.0.1:4609' };
const url = '/api/v7/task-revision/task-2';
const expectedReads = { snapshot: 1, spec: 1, generation: 1, reconciliation: 1 };

async function fixture() {
  const root = path.resolve('tests/.tmp/task206-inject');
  const f = await createBaseApp({ dbPath: ':memory:', root, staticDir: path.join(root, 'no-assets'), taskRevisions: true });
  f.store.set('instanceId', '7ff364f8-2e33-40dc-8fef-4b3018ccc206');
  const snapshot = makeFixture('agency');
  snapshot.capturedAt = '2026-11-05T12:00:00.000Z';
  f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), {
    provider: 'demo', model: null, generatedAt: '2026-11-05T14:00:00.000Z', prompt: '', approved: false,
  });
  f.store.activate();
  f.store.set('sessionId', 'fixture-session-206');
  await f.app.ready();
  // Let Continuity's initial maintenance tick finish before counting route reads.
  await new Promise<void>(resolve => setImmediate(resolve));
  return f;
}

function observeActiveReads(store: Store) {
  const get = store.get.bind(store);
  const reads = { snapshot: 0, spec: 0, generation: 0, reconciliation: 0 };
  store.get = <T>(key: string, fallback: T): T => {
    if (Object.hasOwn(reads, key)) reads[key as keyof typeof reads]++;
    return get(key, fallback);
  };
  return reads;
}

test('206 GET decodes active metadata once and returns the original compatible token', async t => {
  const { app, store } = await fixture();
  try {
    const reads = observeActiveReads(store);
    const reply = await app.inject({ method: 'GET', url, headers });
    assert.equal(reply.statusCode, 200);
    const view = reply.json();
    assert.equal(view.record.id, 'task-2');
    assert.match(view.revision, /^[a-f0-9]{64}$/);
    t.diagnostic('compatible-token-206 ' + view.revision);
    assert.deepEqual(reads, expectedReads);
    assert.equal(store.changesCount, 0);
  } finally { await app.close(); }
});

test('206 unchanged PATCH reuses the schema it checked and adds no history', async () => {
  const { app, store } = await fixture();
  try {
    const previous = await app.inject({ method: 'GET', url, headers });
    assert.equal(previous.statusCode, 200);
    const view = previous.json();
    const reads = observeActiveReads(store);
    const reply = await app.inject({ method: 'PATCH', url, headers, payload: {
      expectedRevision: view.revision, values: { subject: view.record.values.subject },
    } });
    assert.equal(reply.statusCode, 200);
    assert.deepEqual(reply.json(), { ok: true, changed: false, current: view });
    assert.deepEqual(reads, expectedReads);
    assert.equal(store.changesCount, 0);
  } finally { await app.close(); }
});

test('206 generation approval and reconciliation still gate both reads and writes', async () => {
  const { app, store } = await fixture();
  try {
    const previous = await app.inject({ method: 'GET', url, headers });
    assert.equal(previous.statusCode, 200);
    const view = previous.json();
    const generation = store.generation!, reconciliation = store.reconciliation!;
    for (const entry of [
      { key: 'generation', original: generation, invalid: { ...generation, approved: false } },
      { key: 'reconciliation', original: reconciliation, invalid: { ...reconciliation, complete: false } },
    ]) {
      store.set(entry.key, entry.invalid);
      assert.equal((await app.inject({ method: 'GET', url, headers })).statusCode, 409);
      assert.equal((await app.inject({ method: 'PATCH', url, headers, payload: {
        expectedRevision: view.revision, values: { subject: 'No debe guardarse' },
      } })).statusCode, 409);
      store.set(entry.key, entry.original);
    }
    assert.deepEqual((await app.inject({ method: 'GET', url, headers })).json(), view);
    assert.equal(store.changesCount, 0);
  } finally { await app.close(); }
});
