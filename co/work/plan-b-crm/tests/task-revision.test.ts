import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Store, AppError } from '../server/store.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';

const rowHash = (store: Store) => createHash('sha256').update(JSON.stringify(['meta','records','changes'].map(table => store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()))).digest('hex');
function fixture() { const store = new Store(':memory:'); store.set('instanceId', randomUUID()); const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T08:00:00Z', prompt: '', approved: false }); store.activate(); return store; }
const change = (store: Store, id: string, revision: string, subject: string) => writeTaskRevision(store, id, { expectedRevision: revision, values: { subject } });
const status = (wanted: number) => (error: unknown) => error instanceof AppError && error.status === wanted;

test('current task is read without modifying any table', () => {
  const store = fixture(); try { const before = rowHash(store), r = readTaskRevision(store, 'task-2'); assert.equal(r.record.id, 'task-2'); assert.equal(r.record.entity, 'tasks'); assert.match(r.revision, /^[a-f0-9]{64}$/); assert.equal(rowHash(store), before); } finally { store.close(); }
});
test('two editors: first save persists exactly one change; stale second is rejected', () => {
  const store = fixture(); try { const a = readTaskRevision(store, 'task-2'), b = readTaskRevision(store, 'task-2'), initial = store.changesCount;
    const saved = change(store, 'task-2', a.revision, 'Primera edición'); assert.equal(saved.changed, true); assert.equal(saved.current.record.values.subject, 'Primera edición'); assert.notEqual(saved.current.revision, a.revision); assert.equal(store.changesCount, initial + 1);
    const before = rowHash(store); assert.throws(() => change(store, 'task-2', b.revision, 'Otra edición'), status(409)); assert.equal(rowHash(store), before); assert.equal(store.record('tasks', 'task-2')!.values.subject, 'Primera edición');
  } finally { store.close(); }
});
test('ABA: change away and back still invalidates the old review', () => {
  const store = fixture(); try { const first = readTaskRevision(store, 'task-2'), original = String(first.record.values.subject);
    const next = change(store, 'task-2', first.revision, 'Otro asunto'); const back = change(store, 'task-2', next.current.revision, original);
    assert.equal(back.current.record.values.subject, original); assert.notEqual(back.current.revision, first.revision); assert.throws(() => change(store, 'task-2', first.revision, 'Obsoleta'), status(409));
  } finally { store.close(); }
});
test('an identical no-op creates no CRM history; unrelated task edits do not invalidate it', () => {
  const store = fixture(); try { const first = readTaskRevision(store, 'task-2'), before = rowHash(store); const result = writeTaskRevision(store, 'task-2', { expectedRevision: first.revision, values: { subject: first.record.values.subject } });
    assert.equal(result.changed, false); assert.equal(rowHash(store), before); store.saveRecord('tasks', { subject: 'Otra tarea' }, 'task-3'); assert.equal(readTaskRevision(store, 'task-2').revision, first.revision);
  } finally { store.close(); }
});
test('a changed capture with the same nominal identity or a changed installation invalidates the review', () => {
  const store = fixture(); try { const first = readTaskRevision(store, 'task-2'), snapshot = structuredClone(store.snapshot!); snapshot.name += ' nueva'; store.set('snapshot', snapshot);
    assert.throws(() => change(store, 'task-2', first.revision, 'No escribir'), status(409)); const second = readTaskRevision(store, 'task-2'); store.set('instanceId', randomUUID()); assert.throws(() => change(store, 'task-2', second.revision, 'No escribir'), status(409));
  } finally { store.close(); }
});
test('a different task or active specification cannot reuse the reviewed token', () => {
  const store = fixture(); try { const first = readTaskRevision(store, 'task-2'); assert.throws(() => change(store, 'task-3', first.revision, 'No escribir'), status(409));
    const spec = structuredClone(store.spec!); spec.description += ' cambio'; store.set('spec', spec); assert.throws(() => change(store, 'task-2', first.revision, 'No escribir'), status(409));
  } finally { store.close(); }
});
test('missing record and inactive copy are blocked without replacing the record', () => {
  const store = fixture(); try { assert.throws(() => readTaskRevision(store, 'missing'), status(404)); const review = readTaskRevision(store, 'task-2'); store.set('generation', { ...store.generation!, approved: false }); const before = rowHash(store); assert.throws(() => change(store, 'task-2', review.revision, 'No escribir'), status(409)); assert.equal(rowHash(store), before); } finally { store.close(); }
});
test('recovery protection blocks both mutations and no-op acknowledgements', () => {
  const store = fixture(); try { const review = readTaskRevision(store, 'task-2'); store.set('returnBusy', true); const before = rowHash(store);
    assert.throws(() => change(store, 'task-2', review.revision, 'No escribir'), status(409)); assert.throws(() => writeTaskRevision(store, 'task-2', { expectedRevision: review.revision, values: { subject: review.record.values.subject } }), status(409)); assert.equal(rowHash(store), before);
  } finally { store.close(); }
});
test('invalid field or value is rejected without writes', () => {
  const store = fixture(); try { const review = readTaskRevision(store, 'task-2'), before = rowHash(store); assert.throws(() => writeTaskRevision(store, 'task-2', { expectedRevision: review.revision, values: { campo_inventado: 'x' } }), status(422)); assert.equal(rowHash(store), before); } finally { store.close(); }
});
test('capture identifiers accepted by the existing model are returned without truncation', () => {
  const store = fixture(); try { for (const id of ['', 'x'.repeat(1001)]) { const snapshot = structuredClone(store.snapshot!); snapshot.id = id; store.set('snapshot', snapshot); assert.equal(readTaskRevision(store, 'task-2').captureId, id); } } finally { store.close(); }
});
