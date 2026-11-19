import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { isUnresolved } from '../shared/task-save-outcome.js';
import { loadTask, type Transport } from '../src/local-task-focus-client.js';
import { createTaskSaveOutcomes, legacyStrategy, type Submission, type SubmitInput } from '../src/task-save-outcome.js';

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const started = (submission: Submission) => { assert.equal(submission.kind, 'started'); return submission as Extract<Submission, { kind: 'started' }>; };
async function bounded(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(Error('fixture barrier not reached')), 5000); })]); }
  finally { clearTimeout(timer); }
}

test('regression147: an older not-sent retry cannot bypass a newer unresolved attempt or overwrite its saved value', async () => {
  const { app, store } = await createBaseApp({ root: '.', staticDir: 'none', dbPath: ':memory:' });
  const snapshot = makeFixture('agency'); store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-03T07:00:00Z', prompt: '', approved: false }); store.activate();
  const base: Transport = { base: 'http://127.0.0.1', fetch: async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1');
    const response = await app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'PATCH', url: url.pathname + url.search,
      headers: { host: '127.0.0.1', ...Object.fromEntries(new Headers(init?.headers).entries()) }, payload: init?.body ? String(init.body) : undefined });
    return new Response(response.body, { status: response.statusCode, headers: { 'Content-Type': 'application/json' } });
  } };
  const loaded = await loadTask('task-2', new AbortController().signal, base); assert.equal(loaded.kind, 'ok');
  if (loaded.kind !== 'ok' || !loaded.schema) throw Error('Invalid fixture');
  const barrier = gate(), firstWrite = gate(); let failRead = true, dispatched = 0;
  const controlled: Transport = { ...base, fetch: async (url, init) => {
    if (failRead && (init?.method ?? 'GET') === 'GET') { failRead = false; return Response.json({ error: 'Synthetic preflight failure' }, { status: 503 }); }
    if (init?.method === 'PATCH') { dispatched++; if (dispatched === 1) firstWrite.release(); await barrier.promise; }
    return base.fetch(url, init);
  } };
  const owner = createTaskSaveOutcomes({ strategy: legacyStrategy(controlled) });
  const input = (notes: string): SubmitInput => ({ taskId: loaded.record.id, taskLabel: 'Fiction147 task', baseline: loaded.record,
    entity: loaded.schema!.entity, context: loaded.context, patch: { notes } });
  try {
    const old = started(owner.submit(input('retry-old147'))), oldResult = await old.done;
    assert.equal(oldResult.status, 'not_sent'); assert.equal(dispatched, 0); assert.equal(store.changesCount, 0);
    const fresh = started(owner.submit(input('fresh147'))); await bounded(firstWrite.promise);
    assert.equal(owner.submit(input('third147')).kind, 'busy', 'control: submit itself respects exclusion');
    const unchanged = JSON.stringify(owner.list());
    const retry = owner.retry(old.attemptId);
    assert.equal(retry.kind, 'busy', 'retry and submit share the same exclusion');
    if (retry.kind !== 'busy') throw Error('Retry did not refuse the duplicate');
    assert.equal(retry.existing.attemptId, fresh.attemptId); assert.equal(JSON.stringify(owner.list()), unchanged);
    assert.equal(owner.get(old.attemptId)!.supersededBy, null); assert.equal(owner.list().filter(isUnresolved).length, 1);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(dispatched, 1); assert.equal(store.changesCount, 0);
    barrier.release(); assert.equal((await fresh.done).status, 'confirmed'); await owner.whenIdle();
    assert.equal(store.changesCount, 1); assert.equal(store.record('tasks', 'task-2')!.values.notes, 'fresh147');
    // Once the newer operation settles an explicit retry may start, but the real preflight must detect its now-stale baseline.
    const later = started(owner.retry(old.attemptId)), conflict = await later.done; await owner.whenIdle();
    assert.equal(conflict.status, 'not_sent'); assert.equal(conflict.detail.kind, 'conflict');
    assert.equal(dispatched, 1); assert.equal(store.changesCount, 1); assert.equal(store.record('tasks', 'task-2')!.values.notes, 'fresh147');
  } finally { barrier.release(); await owner.whenIdle(); await app.close(); }
});
