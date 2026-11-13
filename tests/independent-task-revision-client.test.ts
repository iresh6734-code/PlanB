import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { createTaskRevisionClient } from '../src/task-revision-client.js';
import type { TaskRevisionView } from '../shared/task-revision.js';

const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function fixture() {
  const f = await createBaseApp({ root: '.', staticDir: 'none', dbPath: ':memory:', taskRevisions: true });
  const s = makeFixture('agency'); f.store.importSnapshot(s); f.store.saveGeneration(makeDemoSpec(s), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T15:00:00Z', approved: false }); f.store.activate();
  const requests: { path: string; method: string; body: string | null }[] = [];
  const transport: typeof fetch = async (input, init) => { const path = new URL(String(input), 'http://127.0.0.1').pathname, method = init?.method ?? 'GET'; requests.push({ path, method, body: init?.body ? String(init.body) : null }); const r = await f.app.inject({ url: path, method: method as 'GET' | 'PATCH', headers: { host: '127.0.0.1', ...(init?.body ? { 'content-type': 'application/json' } : {}) }, ...(init?.body ? { payload: String(init.body) } : {}) }); return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } }); };
  const client = createTaskRevisionClient({ fetch: transport }), read = await client.read('task-2'); assert.equal(read.kind, 'read'); if (read.kind !== 'read') throw Error('Fixture missing');
  return { ...f, client, view: read.current, requests, transport };
}

test('171: caller mutations cannot rewrite the submitted intention or acknowledgement identity', async () => {
  const f = await fixture(), entered = gate(), held = gate(); try {
    const reviewed = structuredClone(f.view), values = { notes: 'Original intention171' };
    const client = createTaskRevisionClient({ fetch: async (input, init) => { const response = await f.transport(input, init); entered.release(); await held.promise; return response; } });
    const pending = client.save(reviewed, values); await entered.promise; reviewed.instanceId = '8dc7e5b9-2462-468e-b581-15a18e267001'; reviewed.record.id = 'task-3'; values.notes = 'Mutated after dispatch171'; held.release(); const result = await pending;
    assert.equal(result.kind, 'changed'); if (result.kind === 'changed') { assert.equal(result.current.instanceId, f.view.instanceId); assert.equal(result.current.record.id, 'task-2'); }
    assert.equal(f.store.record('tasks', 'task-2')!.values.notes, 'Original intention171'); assert.equal(f.store.changesCount, 1); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1);
  } finally { held.release(); await f.app.close(); }
});

test('171: expected read identity is captured before a late response', async () => {
  const f = await fixture(), held = gate(), entered = gate(); try {
    const expected = { instanceId: f.view.instanceId, captureId: f.view.captureId, capturedAt: f.view.capturedAt };
    const client = createTaskRevisionClient({ fetch: async (input, init) => { const response = await f.transport(input, init); entered.release(); await held.promise; return response; } });
    const pending = client.read('task-2', expected); await entered.promise; expected.captureId = 'Other capture171'; held.release(); assert.equal((await pending).kind, 'read'); assert.equal(f.store.changesCount, 0);
  } finally { held.release(); await f.app.close(); }
});

test('171: incorrect values and no-op transition cannot turn an applied write into confirmation', async () => {
  for (const variant of ['value', 'changed-revision', 'no-op-revision'] as const) {
    const f = await fixture(); try {
      const noop = variant === 'no-op-revision', client = createTaskRevisionClient({ fetch: async (input, init) => { const r = await f.transport(input, init), body = await r.json(); if (variant === 'value') body.current.record.values.notes = 'Unrelated acknowledgement171'; else body.current.revision = noop ? '0'.repeat(64) : f.view.revision; return Response.json(body); } });
      const result = await client.save(f.view, noop ? { subject: f.view.record.values.subject } : { notes: 'Expected171' });
      assert.equal(result.kind, 'uncertain', variant); assert.equal(f.store.changesCount, noop ? 0 : 1); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1);
    } finally { await f.app.close(); }
  }
});

test('171: abort after the server commits cannot accept a late success or resend', async () => {
  const f = await fixture(), held = gate(), entered = gate(); try {
    const controller = new AbortController(), client = createTaskRevisionClient({ fetch: async (input, init) => { const r = await f.transport(input, init); entered.release(); await held.promise; return r; } });
    const pending = client.save(f.view, { notes: 'Applied before abort171' }, controller.signal); await entered.promise; controller.abort(); const result = await pending; assert.equal(result.kind, 'uncertain'); held.release(); await new Promise(r => setImmediate(r));
    const observed = await f.client.read('task-2', f.view); assert.equal(observed.kind, 'read'); if (observed.kind === 'read') assert.equal(observed.current.record.values.notes, 'Applied before abort171');
    assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1); assert.equal(f.store.changesCount, 1); assert.equal((await f.client.save(f.view, { notes: 'Applied before abort171' })).kind, 'conflict'); assert.equal(f.store.changesCount, 1);
  } finally { held.release(); await f.app.close(); }
});

test('171: malformed rejection bodies keep HTTP semantics without assuming revision conflict', async () => {
  const f = await fixture(); try {
    for (const status of [401, 409, 422]) { const client = createTaskRevisionClient({ fetch: async () => new Response('<html>fixture171</html>', { status, headers: { 'content-type': 'text/html' } }) }); const result = await client.save(f.view, { notes: 'Rejected before store171' }); assert.equal(result.kind, 'rejected'); if (result.kind === 'rejected') assert.equal(result.status, status); }
    const serverFailure = createTaskRevisionClient({ fetch: async () => Response.json({ error: 'After unknown server state171' }, { status: 500 }) }); assert.equal((await serverFailure.save(f.view, { notes: 'Unknown171' })).kind, 'uncertain'); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('171: stalled body times out and cancels its reader even after headers arrive', async () => {
  const f = await fixture(); try {
    let canceled = false;
    const client = createTaskRevisionClient({ timeoutMs: 20, fetch: async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { canceled = true; } }), { headers: { 'content-type': 'application/json' } }) });
    assert.equal((await client.save(f.view, { notes: 'Stalled body171' })).kind, 'uncertain'); await new Promise(r => setImmediate(r)); assert.equal(canceled, true); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('171: invalid UTF8 and an excessive declared length never produce a valid read', async () => {
  const f = await fixture(); try {
    const prefix = new TextEncoder().encode(JSON.stringify(f.view)), corrupted = new Uint8Array(prefix.length + 1); corrupted.set(prefix); corrupted[prefix.length] = 0xff;
    const bad = createTaskRevisionClient({ fetch: async () => new Response(corrupted, { headers: { 'content-type': 'application/json' } }) }); assert.equal((await bad.read('task-2')).kind, 'failed');
    let canceled = false, pulls = 0;
    const huge = createTaskRevisionClient({ maxResponseBytes: 128, fetch: async () => new Response(new ReadableStream<Uint8Array>({ pull(c) { pulls++; c.enqueue(new Uint8Array(1)); }, cancel() { canceled = true; } }), { headers: { 'content-type': 'application/json', 'content-length': '129' } }) }); assert.equal((await huge.read('task-2')).kind, 'failed'); assert.equal(canceled, true); assert.ok(pulls <= 1); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});

test('171: request options prohibit redirects and legacy fallback while preserving exact ID encoding', async () => {
  const f = await fixture(); try {
    const seen: string[] = [], client = createTaskRevisionClient({ fetch: async (input, init) => { seen.push(String(input)); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.credentials, 'same-origin'); return Response.json({ error: 'No route' }, { status: 404 }); } });
    const read = await client.read('id/with ?space#171'); assert.equal(read.kind, 'failed'); assert.deepEqual(seen, ['/api/v7/task-revision/id%2Fwith%20%3Fspace%23171']); const result = await client.save(f.view, { notes: 'No legacy171' }); assert.equal(result.kind, 'rejected'); assert.equal(seen.length, 2); assert.ok(seen.every(s => s.startsWith('/api/v7/task-revision/'))); assert.equal(f.store.changesCount, 0);
  } finally { await f.app.close(); }
});
