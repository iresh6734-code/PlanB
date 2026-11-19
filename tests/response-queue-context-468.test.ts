import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { CrmSnapshot } from '../shared/model.js';

const route = '/api/v2/continuity/response-queue';
const headers = { host: '127.0.0.1:4590' };
const queue = (revision: string) => route + '?contextRevision=' + encodeURIComponent(revision);

function bundle(snapshot: CrmSnapshot) {
  const store = new Store(':memory:');
  try {
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), {
      provider: 'demo', model: null, prompt: '', generatedAt: snapshot.capturedAt, approved: false,
    });
    store.activate();
    return store.bundle();
  } finally {
    store.close();
  }
}

test('radar anclado: una sustitución con el mismo ID y fecha exige actualizar el contexto', async t => {
  const root = resolve('tests/.tmp/response-queue-context-468-no-assets');
  const { app, store } = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  t.after(() => app.close());
  const get = (url: string) => app.inject({ url, headers });

  const first = makeFixture('agency');
  const replacement = structuredClone(first);
  replacement.source.accountId = 'otro-portal-ficticio';
  const task = replacement.records.find(record => record.entity === 'tasks' && record.values.status !== 'completed')!;
  task.values.subject = 'Tarea del portal actualizado';

  store.restoreBundle(bundle(first));
  const previous = (await get('/api/v2/state')).json().workspaceSearchContext;
  const original = await get(queue(previous.contextRevision));
  assert.equal(original.statusCode, 200);
  const originalSource = original.json().source;
  assert.equal(originalSource.contextRevision, previous.contextRevision);
  assert.equal(originalSource.accountId, first.source.accountId);

  store.restoreBundle(bundle(replacement));
  const writes = store.db.prepare('SELECT total_changes() AS n').get()?.n;
  const stale = await get(queue(previous.contextRevision));
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().details.code, 'RESPONSE_QUEUE_CONTEXT_CHANGED');
  assert.equal(stale.json().items, undefined);
  assert.equal(stale.json().source, undefined);

  const current = (await get('/api/v2/state')).json().workspaceSearchContext;
  assert.equal(current.captureId, previous.captureId);
  assert.notEqual(current.contextRevision, previous.contextRevision);
  const fresh = await get(queue(current.contextRevision) + '&limit=200');
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.json().source.contextRevision, current.contextRevision);
  assert.equal(fresh.json().source.accountId, replacement.source.accountId);
  assert.equal(fresh.json().items.find((item: { id: string }) => item.id === task.id)?.label, task.values.subject);
  const unpinned = await get(route);
  assert.equal(unpinned.statusCode, 200);
  assert.equal(unpinned.json().source.contextRevision, current.contextRevision);
  assert.equal(store.db.prepare('SELECT total_changes() AS n').get()?.n, writes);
});

test('radar anclado: rechaza un contexto mal formado y uno repetido', async t => {
  const root = resolve('tests/.tmp/response-queue-context-468-no-assets');
  const { app } = await createBaseApp({ root, dbPath: ':memory:', staticDir: root });
  t.after(() => app.close());
  const context = 'a'.repeat(64);
  for (const url of [queue('inválido'), queue(context) + '&contextRevision=' + context]) {
    assert.equal((await app.inject({ url, headers })).statusCode, 422);
  }
});
