import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { createContextualTaskRevisionClient } from '../src/task-revision-context-client.js';

const initialDate = '2026-11-04T17:00:00Z', laterDate = '2026-11-04T17:01:00Z';
async function fixture() {
  const root = path.resolve('tests/.tmp/generation185-' + randomUUID()), f = await createBaseApp({ root, staticDir: root + '/none', dbPath: ':memory:', taskRevisions: true });
  const s = makeFixture('agency'); f.store.importSnapshot(s); f.store.saveGeneration(makeDemoSpec(s), { provider: 'demo', model: null, prompt: '', generatedAt: initialDate, approved: false }); f.store.activate(); return { ...f, close: () => f.app.close() };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const dataDigest = (f: Fixture) => createHash('sha256').update(JSON.stringify(['records', 'changes'].map(t => f.store.db.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()))).digest('hex');
function activateAgain(f: Fixture, generatedAt: string) { f.store.saveGeneration(structuredClone(f.store.spec!), { ...f.store.generation!, generatedAt, approved: false }); assert(f.store.candidate); f.store.activate(); }

test('185: normal activation of identical specification with new generation changes the task revision without editing records', async () => {
  const f = await fixture(); try { const before = readTaskRevision(f.store, 'task-2'), digest = dataDigest(f), oldSpec = JSON.stringify(f.store.spec), oldSnapshot = JSON.stringify(f.store.snapshot);
    activateAgain(f, laterDate); const after = readTaskRevision(f.store, 'task-2'); assert.equal(JSON.stringify(f.store.spec), oldSpec); assert.equal(JSON.stringify(f.store.snapshot), oldSnapshot); assert.equal(dataDigest(f), digest); assert.equal(f.store.changesCount, 0); assert.equal(f.store.generation!.generatedAt, laterDate); assert.notEqual(after.revision, before.revision);
  } finally { await f.close(); }
});

test('185: old generation rejects both a write and a no-op; the fresh revision still supports exact no-op and change', async () => {
  const f = await fixture(); try { const before = readTaskRevision(f.store, 'task-2'); activateAgain(f, laterDate); const digest = dataDigest(f);
    for (const values of [{ notes: 'Old generation185' }, { subject: before.record.values.subject }]) { const response = await f.app.inject({ method: 'PATCH', url: '/api/v7/task-revision/task-2', headers: { host: '127.0.0.1:4831' }, payload: { expectedRevision: before.revision, values } }); assert.equal(response.statusCode, 409); assert.equal(response.json().details.code, 'TASK_REVISION_CHANGED'); assert.equal(dataDigest(f), digest); }
    const fresh = readTaskRevision(f.store, 'task-2'), noop = writeTaskRevision(f.store, 'task-2', { expectedRevision: fresh.revision, values: { subject: fresh.record.values.subject } }); assert.equal(noop.changed, false); assert.equal(noop.current.revision, fresh.revision); assert.equal(dataDigest(f), digest);
    const saved = writeTaskRevision(f.store, 'task-2', { expectedRevision: fresh.revision, values: { notes: 'Explicit fresh generation185' } }); assert.equal(saved.changed, true); assert.notEqual(saved.current.revision, fresh.revision); assert.equal(f.store.changesCount, 1);
  } finally { await f.close(); }
});

test('185: staged generation does not invalidate the still-active version; activation does', async () => {
  const f = await fixture(); try { const before = readTaskRevision(f.store, 'task-2'); f.store.saveGeneration(structuredClone(f.store.spec!), { ...f.store.generation!, generatedAt: laterDate, approved: false }); assert(f.store.candidate); assert.equal(f.store.generation!.generatedAt, initialDate); assert.equal(readTaskRevision(f.store, 'task-2').revision, before.revision);
    f.store.activate(); assert.notEqual(readTaskRevision(f.store, 'task-2').revision, before.revision); assert.equal(f.store.changesCount, 0);
  } finally { await f.close(); }
});

test('185: activation that reuses the exact generation date and schema does not invent a new context identity', async () => {
  const f = await fixture(); try { const before = readTaskRevision(f.store, 'task-2'); activateAgain(f, initialDate); const after = readTaskRevision(f.store, 'task-2'); assert.equal(after.revision, before.revision); assert.equal(f.store.changesCount, 0);
    const saved = writeTaskRevision(f.store, 'task-2', { expectedRevision: before.revision, values: { notes: 'Same identity185' } }); assert.equal(saved.changed, true);
  } finally { await f.close(); }
});

test('185: real activation between contextual preflight and PATCH rejects the original intention without refreshing its token', async () => {
  const f = await fixture(); try { const requests: { method: string; path: string }[] = []; let activateAtPatch = false;
    const transport: typeof fetch = async (input, init) => { const url = new URL(String(input), 'http://127.0.0.1:4831'); requests.push({ method: init?.method ?? 'GET', path: url.pathname }); if (init?.method === 'PATCH' && activateAtPatch) { activateAtPatch = false; activateAgain(f, laterDate); }
      const response = await f.app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'PATCH', url: url.pathname, headers: { host: '127.0.0.1:4831', 'content-type': 'application/json' }, ...(init?.body ? { payload: String(init.body) } : {}) }); return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } }); };
    const client = createContextualTaskRevisionClient({ base: 'http://127.0.0.1:4831', fetch: transport }), opened = await client.read('task-2'); assert.equal(opened.kind, 'read'); if (opened.kind !== 'read') throw Error('No view185');
    activateAtPatch = true; const saved = await client.save(opened.opened, { notes: 'Before activation185' }); assert.equal(saved.kind, 'conflict'); assert.equal(f.store.changesCount, 0); assert.equal(requests.filter(r => r.method === 'PATCH').length, 1); assert.equal((await client.verify(opened.opened, { notes: 'Before activation185' })).kind, 'context-changed');
  } finally { await f.close(); }
});
