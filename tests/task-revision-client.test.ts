import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { createTaskRevisionClient } from '../src/task-revision-client.js';

async function fixture() {
  const root = resolve('tests/.tmp/revision166-' + randomUUID());
  const f = await createBaseApp({ root, staticDir: root + '/none', dbPath: ':memory:', taskRevisions: true });
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T15:00:00Z', approved: false }); f.store.activate();
  const requests: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1:4690').pathname; requests.push((init?.method ?? 'GET') + ' ' + url);
    const r = await f.app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'PATCH', url, headers: { host: '127.0.0.1:4690', 'content-type': 'application/json' }, ...(init?.body ? { payload: String(init.body) } : {}) });
    return new Response(r.body, { status: r.statusCode, headers: { 'content-type': 'application/json' } });
  };
  return { ...f, requests, transport, client: createTaskRevisionClient({ fetch: transport }), close: () => f.app.close() };
}
const opened = async (f: Awaited<ReturnType<typeof fixture>>) => { const r = await f.client.read('task-2'); assert.equal(r.kind, 'read'); if (r.kind !== 'read') throw Error('No view'); return r.current; };

test('real server contract distinguishes a changed write, a no-op and a stale conflict', async () => {
  const f = await fixture(); try {
    const view = await opened(f), saved = await f.client.save(view, { subject: 'Trabajo revisado' });
    assert.equal(saved.kind, 'changed'); if (saved.kind !== 'changed') throw Error('No acknowledgement');
    assert.equal((await f.client.save(saved.current, { subject: 'Trabajo revisado' })).kind, 'unchanged');
    assert.equal((await f.client.save(view, { subject: 'Edición obsoleta' })).kind, 'conflict');
    assert.equal(f.store.changesCount, 1);
    assert.ok(f.requests.every(r => r.includes('/api/v7/task-revision/')));
  } finally { await f.close(); }
});

test('simultaneous editors through the client preserve exactly one write', async () => {
  const f = await fixture(); try {
    const view = await opened(f), outcomes = await Promise.all(['Uno', 'Dos'].map(subject => f.client.save(view, { subject })));
    assert.deepEqual(outcomes.map(r => r.kind).sort(), ['changed', 'conflict']); assert.equal(f.store.changesCount, 1);
  } finally { await f.close(); }
});

test('lost acknowledgement remains uncertain; checking only reads and cannot prove authorship', async () => {
  const f = await fixture(); try {
    const view = await opened(f);
    const client = createTaskRevisionClient({ fetch: async (input, init) => { const r = await f.transport(input, init); if (init?.method === 'PATCH') throw Error('Lost response after commit'); return r; } });
    assert.equal((await client.save(view, { notes: 'Trabajo conservado' })).kind, 'uncertain');
    const read = await client.read('task-2', view); assert.equal(read.kind, 'read');
    if (read.kind === 'read') assert.equal(read.current.record.values.notes, 'Trabajo conservado');
    assert.equal(f.requests.filter(r => r.startsWith('PATCH')).length, 1); assert.equal(f.store.changesCount, 1);
  } finally { await f.close(); }
});

test('recovery rejection 409 remains distinct from a revision conflict', async () => {
  const f = await fixture(); try {
    const view = await opened(f); f.store.set('returnBusy', true);
    const result = await f.client.save(view, { notes: 'Durante devolución' });
    assert.equal(result.kind, 'rejected'); if (result.kind === 'rejected') assert.equal(result.status, 409);
    assert.equal(f.store.changesCount, 0);
  } finally { await f.close(); }
});

test('same task ID from another installation is not evidence for the original copy', async () => {
  const first = await fixture(), second = await fixture(); try {
    const view = await opened(first);
    assert.equal((await second.client.read('task-2', view)).kind, 'context-changed');
    assert.equal((await second.client.save(view, { notes: 'Otra copia' })).kind, 'conflict');
    assert.equal(second.store.changesCount, 0);
  } finally { await first.close(); await second.close(); }
});

test('invalid input and pre-cancellation send nothing; locked server rejects without legacy fallback', async () => {
  const f = await fixture(); try {
    const view = await opened(f), before = f.requests.length, controller = new AbortController(); controller.abort();
    assert.equal((await f.client.save(view, { notes: 'Cancelada' }, controller.signal)).kind, 'not-sent');
    assert.equal((await f.client.save(view, {})).kind, 'not-sent'); assert.equal(f.requests.length, before);
    await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: { host: '127.0.0.1:4690' }, payload: { password: 'fiction-only-client166' } });
    const result = await f.client.save(view, { notes: 'Sin sesión' }); assert.equal(result.kind, 'rejected');
    if (result.kind === 'rejected') assert.equal(result.status, 401);
    assert.equal(f.store.changesCount, 0);
  } finally { await f.close(); }
});

test('plausible but mismatched acknowledgements cannot confirm the save', async () => {
  for (const variant of ['id', 'instance', 'capture', 'value', 'changed']) {
    const f = await fixture(); try {
      const view = await opened(f);
      const client = createTaskRevisionClient({ fetch: async (input, init) => {
        const response = await f.transport(input, init), body = await response.json();
        if (variant === 'id') body.current.record.id = 'task-3';
        if (variant === 'instance') body.current.instanceId = randomUUID();
        if (variant === 'capture') body.current.capturedAt = '2020-01-01T00:00:00.000Z';
        if (variant === 'value') body.current.record.values.notes = 'Otro valor';
        if (variant === 'changed') body.changed = false;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      } });
      assert.equal((await client.save(view, { notes: 'Valor previsto' })).kind, 'uncertain', variant);
      assert.equal(f.store.changesCount, 1); assert.equal(f.requests.filter(r => r.startsWith('PATCH')).length, 1);
    } finally { await f.close(); }
  }
});

test('response size is bounded while streaming and excess bytes cancel the body', async () => {
  let cancelled = false, chunks = 0;
  const client = createTaskRevisionClient({ maxResponseBytes: 256, fetch: async () => new Response(new ReadableStream({ pull(controller) { chunks++; controller.enqueue(new Uint8Array(128)); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await client.read('task-2')).kind, 'failed'); assert.equal(cancelled, true); assert.ok(chunks < 10);
});

test('timeout bounds a transport that ignores cancellation; after dispatch it remains uncertain', async () => {
  const f = await fixture(); try {
    const view = await opened(f), client = createTaskRevisionClient({ timeoutMs: 10, fetch: async () => new Promise<Response>(() => {}) });
    assert.equal((await client.read('task-2')).kind, 'failed');
    assert.equal((await client.save(view, { notes: 'Sin acuse' })).kind, 'uncertain');
  } finally { await f.close(); }
});

test('a malformed or wrong-ID read never opens another task', async () => {
  const f = await fixture(); try {
    const view = await opened(f);
    for (const body of [{ format: 'planb-task-revision-v1' }, { ...view, record: { ...view.record, id: 'task-3' } }]) {
      const client = createTaskRevisionClient({ fetch: async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) });
      assert.equal((await client.read('task-2')).kind, 'failed');
    }
    const missing = await f.client.read('missing'); assert.equal(missing.kind, 'failed'); if (missing.kind === 'failed') assert.equal(missing.status, 404);
  } finally { await f.close(); }
});

test('native fetch client works with real loopback HTTP and the mounted server', async () => {
  const f = await fixture(); try {
    await f.app.listen({ host: '127.0.0.1', port: 0 }); const address = f.app.server.address(); assert.ok(address && typeof address !== 'string');
    const client = createTaskRevisionClient({ base: 'http://127.0.0.1:' + address.port });
    const read = await client.read('task-2'); assert.equal(read.kind, 'read'); if (read.kind !== 'read') throw Error('No view');
    assert.equal((await client.save(read.current, { notes: 'HTTP cliente' })).kind, 'changed');
    assert.equal((await client.save(read.current, { notes: 'HTTP cliente' })).kind, 'conflict'); assert.equal(f.store.changesCount, 1);
  } finally { await f.close(); }
});
