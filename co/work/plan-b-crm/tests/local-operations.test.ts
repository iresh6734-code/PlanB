import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import Fastify from 'fastify';
import { Store, AppError } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { inspectLocalOperations, registerLocalOperations } from '../server/local-operations.js';
import { LocalOperationsSchema } from '../shared/local-operations.js';

const NOW = Date.parse('2026-11-02T08:00:00Z');
const clock = () => NOW;
function source(active = false) {
  const store = new Store(':memory:'); store.set('instanceId', randomUUID());
  const snapshot = makeFixture('agency'); store.importSnapshot(snapshot);
  if (active) { store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); store.activate(); }
  return store;
}
const digest = (store: Store) => createHash('sha256').update(JSON.stringify(['meta', 'records', 'changes'].map(table => store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))).digest('hex');
async function appFor(store: Store) {
  const app = Fastify(); app.setErrorHandler((error, _req, reply) => reply.code(error instanceof AppError ? error.status : 500).send({ error: error instanceof Error ? error.message : 'Error inesperado' }));
  registerLocalOperations(app, store, clock); await app.ready(); return app;
}

test('imported copy exposes actual task inventory before activation without mutating it', () => {
  const store = source(), before = digest(store);
  try { const result = inspectLocalOperations(store, clock); assert.equal(result.context.phase, 'imported'); assert.equal(store.spec, null); assert.equal(result.counts?.tasks, 18); assert.ok(result.tasks.length > 0); assert.equal(result.reviewable, true); assert.equal(digest(store), before); } finally { store.close(); }
});
test('empty copy has unknown counts and a concrete next step', () => {
  const store = new Store(':memory:'); store.set('instanceId', randomUUID());
  try { const result = inspectLocalOperations(store, clock); assert.equal(result.counts, null); assert.equal(result.reviewable, false); assert.equal(result.context.phase, 'empty'); } finally { store.close(); }
});
test('active source and instance identity affect revision; no simulation-agent gate', () => {
  const store = source(true);
  try { const first = inspectLocalOperations(store, clock); assert.equal(first.context.phase, 'active'); assert.ok(first.counts!.tasks > 0); store.set('instanceId', randomUUID()); assert.notEqual(inspectLocalOperations(store, clock).revision, first.revision); } finally { store.close(); }
});
test('synthetic production-shaped stored copy is readable without enabling simulation agents', () => {
  const store = source(true);
  try { const snapshot = structuredClone(store.snapshot!); snapshot.source.isTestData = false; store.set('snapshot', snapshot); const value = inspectLocalOperations(store, clock); assert.equal(value.context.isTestData, false); assert.equal(value.reviewable, true); assert.equal(value.counts?.tasks, 18); } finally { store.close(); }
});
test('complete counts remain explicit when more than 200 tasks exist', () => {
  const store = source();
  try { const template = store.records().find(r => r.entity === 'tasks' && r.values.status !== 'completed')!;
    store.transaction(() => { for (let i = 0; i < 300; i++) store.db.prepare('INSERT INTO records(entity,id,value) VALUES(?,?,?)').run('tasks', 'scale-' + i, JSON.stringify({ ...template, id: 'scale-' + i })); });
    const value = inspectLocalOperations(store, clock); assert.equal(value.counts?.tasks, 318); assert.equal(value.tasks.length, 200); assert.ok(value.counts!.queued > 200); assert.ok(value.limitations.some(text => text.includes('200')));
  } finally { store.close(); }
});
test('capture content change with identical id/date invalidates revision', () => {
  const store = source();
  try { const a = inspectLocalOperations(store, clock), snap = structuredClone(store.snapshot!); snap.name += ' revisada'; store.set('snapshot', snap); assert.notEqual(inspectLocalOperations(store, clock).revision, a.revision); } finally { store.close(); }
});
test('long captured names stay readable without changing source bytes or truncating IDs', async () => {
  for (const name of ['N'.repeat(100), 'N'.repeat(101), 'N'.repeat(501), '🙂'.repeat(400), 'N'.repeat(98) + '🙂'.repeat(3)]) {
    const store = new Store(':memory:'); store.set('instanceId', randomUUID());
    const snapshot = makeFixture('agency'); snapshot.name = name; store.importSnapshot(snapshot);
    const app = await appFor(store), before = digest(store);
    try {
      const result = await app.inject('/api/v7/local-operations'); assert.equal(result.statusCode, 200, name.length.toString());
      const value = LocalOperationsSchema.parse(result.json()); assert.equal(value.counts?.tasks, 18); assert.ok(value.tasks.length > 0);
      assert.ok(value.context.name.length <= 500); assert.equal(value.context.captureId, snapshot.id);
      assert.equal(value.context.name.includes('\uFFFD'), false); assert.equal(store.snapshot!.name, name); assert.equal(digest(store), before);
      for (let i = 0; i < value.context.name.length; i++) { const code = value.context.name.charCodeAt(i); if (code >= 0xD800 && code <= 0xDBFF) { const next = value.context.name.charCodeAt(++i); assert.ok(next >= 0xDC00 && next <= 0xDFFF); } }
    } finally { await app.close(); store.close(); }
  }
});
test('GET is read-only and explicitly prevents caching', async () => {
  const store = source(), app = await appFor(store), before = digest(store);
  try { const r = await app.inject('/api/v7/local-operations'); assert.equal(r.statusCode, 200); LocalOperationsSchema.parse(r.json()); assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(digest(store), before); } finally { await app.close(); store.close(); }
});
test('review stores one receipt and replays identical request, without CRM changes', async () => {
  const store = source(), app = await appFor(store);
  try { const current = inspectLocalOperations(store, clock), payload = { revision: current.revision, idempotencyKey: randomUUID() }; const count = store.changesCount;
    const a = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload }); const b = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload });
    assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200); assert.equal(a.json().replayed, false); assert.equal(b.json().replayed, true); assert.equal(a.json().review.id, b.json().review.id); assert.equal(store.changesCount, count); assert.equal(inspectLocalOperations(store, clock).lastReview?.id, a.json().review.id);
  } finally { await app.close(); store.close(); }
});
test('changed source rejects new obsolete review and marks prior receipt stale', async () => {
  const store = source(), app = await appFor(store);
  try { const initial = inspectLocalOperations(store, clock), payload = { revision: initial.revision, idempotencyKey: randomUUID() }; await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload });
    store.set('snapshot', { ...store.snapshot!, name: 'Otra revisión' }); const before = digest(store);
    const result = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload: { ...payload, idempotencyKey: randomUUID() } }); assert.equal(result.statusCode, 409); assert.equal(digest(store), before); assert.equal(inspectLocalOperations(store, clock).lastReview?.stale, true);
    const replay = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload }); assert.equal(replay.json().review.stale, true); assert.equal(digest(store), before);
  } finally { await app.close(); store.close(); }
});
test('same key is never accepted for another revision or installation', async () => {
  const store = source(), app = await appFor(store);
  try { const payload = { revision: inspectLocalOperations(store, clock).revision, idempotencyKey: randomUUID() }; await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload }); store.set('instanceId', randomUUID()); const before = digest(store);
    const r = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload: { ...payload, revision: inspectLocalOperations(store, clock).revision } }); assert.equal(r.statusCode, 422); assert.equal(digest(store), before);
  } finally { await app.close(); store.close(); }
});
test('invalid history is preserved and missing identity fails closed', () => {
  const store = source();
  try { store.set('localOperations:reviews:v1', [{ malformed: true }]); const before = digest(store); const value = inspectLocalOperations(store, clock); assert.equal(value.reviewable, false); assert.equal(value.counts?.tasks, 18); assert.match(value.unavailableReason!, /historial/); assert.equal(digest(store), before); store.set('instanceId', 'invalid'); assert.throws(() => inspectLocalOperations(store, clock), /instalación/); } finally { store.close(); }
});
test('schema rejects count/list mismatch and malformed review body has no effects', async () => {
  const store = source(), app = await appFor(store), before = digest(store);
  try { const value = inspectLocalOperations(store, clock); assert.equal(LocalOperationsSchema.safeParse({ ...value, tasks: [] }).success, false); const r = await app.inject({ method: 'POST', url: '/api/v7/local-operations/reviews', payload: { revision: 'invalid', idempotencyKey: randomUUID() } }); assert.equal(r.statusCode, 422); assert.equal(digest(store), before); } finally { await app.close(); store.close(); }
});
