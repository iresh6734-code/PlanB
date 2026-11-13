import nodeTest, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { createTaskRevisionClient } from '../src/task-revision-client.js';
import { createContextualTaskRevisionClient, type ContextualTaskRevision } from '../src/task-revision-context-client.js';

const base = 'http://127.0.0.1:4830';
const test = (name: string, run: (t: TestContext) => Promise<void>) => nodeTest(name, { timeout: 10_000 }, run);
type Request = { method: string; path: string; init?: RequestInit };
const gate = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; };
async function fixture(enabled = true) {
  const root = path.resolve('tests/.tmp/context183-' + randomUUID()), f = await createBaseApp({ root, staticDir: root + '/none', dbPath: ':memory:', taskRevisions: enabled });
  const snapshot = makeFixture('agency'); f.store.importSnapshot(snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-04T17:00:00Z', approved: false }); f.store.activate();
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input), base); assert.equal(url.origin, base);
    requests.push({ method: init?.method ?? 'GET', path: url.pathname, init });
    const response = await f.app.inject({ method: (init?.method ?? 'GET') as 'GET' | 'PATCH', url: url.pathname, headers: { host: '127.0.0.1:4830', 'content-type': 'application/json' }, ...(init?.body ? { payload: String(init.body) } : {}) });
    return new Response(response.body, { status: response.statusCode, headers: { 'content-type': response.headers['content-type'] as string ?? 'application/json' } });
  };
  return { ...f, requests, transport, client: createContextualTaskRevisionClient({ base, fetch: transport }), close: () => f.app.close() };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const opened = async (f: Fixture): Promise<ContextualTaskRevision> => { const read = await f.client.read('task-2'); assert.equal(read.kind, 'read'); if (read.kind !== 'read') throw Error('No contextual task'); return read.opened; };
function changeContext(f: Fixture, field: string) {
  if (field === 'instance') f.store.set('instanceId', randomUUID());
  else if (field === 'generation') f.store.set('generation', { ...f.store.generation!, generatedAt: '2026-11-04T17:01:00Z' });
  else { const snapshot = structuredClone(f.store.snapshot!); if (field === 'account') snapshot.source.accountId = 'another-fiction-account'; if (field === 'capture-start') snapshot.captureStartedAt = '2026-11-04T16:59:00Z'; if (field === 'capture') snapshot.id += '-new'; if (field === 'captured-at') snapshot.capturedAt = '2026-11-04T17:02:00Z'; f.store.set('snapshot', snapshot); }
}

test('183: read/save preserve full context, changed/unchanged and the new revision', async () => {
  const f = await fixture(); try {
    const view = await opened(f); assert.equal(view.context.accountId, 'demo-agency'); assert.equal(view.schema?.entity.id, 'tasks');
    const saved = await f.client.save(view, { notes: 'Contextual revision183' }); assert.equal(saved.kind, 'changed'); if (saved.kind !== 'changed') throw Error('No acknowledgement');
    assert.notEqual(saved.current.revision, view.current.revision); assert.equal(f.store.changesCount, 1);
    const next = { ...view, current: saved.current }, noop = await f.client.save(next, { notes: 'Contextual revision183' }); assert.equal(noop.kind, 'unchanged'); if (noop.kind !== 'unchanged') throw Error('No no-op'); assert.equal(noop.current.revision, saved.current.revision); assert.equal(f.store.changesCount, 1);
    assert.equal((await f.client.save(view, { notes: 'Obsolete revision183' })).kind, 'conflict'); assert.equal(f.store.changesCount, 1);
    assert(f.requests.every(r => r.method === 'GET' || r.path.startsWith('/api/v7/task-revision/')));
    for (const r of f.requests.filter(r => !r.path.startsWith('/api/v7/task-revision/'))) { assert.equal(r.init?.cache, 'no-store'); assert.equal(r.init?.credentials, 'same-origin'); assert.equal(r.init?.redirect, 'error'); }
  } finally { await f.close(); }
});

test('183: each full-context identity change refuses save and prevents evidence from another copy', async () => {
  for (const field of ['instance', 'account', 'generation', 'capture-start', 'capture', 'captured-at']) {
    const f = await fixture(); try { const view = await opened(f); changeContext(f, field);
      assert.equal((await f.client.save(view, { notes: 'Do not send183' })).kind, 'context-changed', field);
      assert.equal((await f.client.verify(view, { notes: 'Do not send183' })).kind, 'context-changed', field);
      assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 0); assert.equal(f.store.changesCount, 0);
      if (['account', 'generation', 'capture-start'].includes(field)) { const weaker = createTaskRevisionClient({ base, fetch: f.transport }); assert.equal((await weaker.read('task-2', view.current)).kind, 'read', '166 intentionally checks a smaller identity'); }
    } finally { await f.close(); }
  }
});

test('183: context changed after a revision response discards that response and its missing result', async () => {
  for (const missing of [false, true]) { const f = await fixture(); try {
    const view = await opened(f); let changed = false;
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { const r = await f.transport(input, init); if (String(input).includes('/api/v7/task-revision/') && !changed) { changed = true; changeContext(f, 'generation'); return missing ? Response.json({ error: 'Not in this capture' }, { status: 404 }) : r; } return r; } });
    const verdict = missing ? await client.verify(view, { notes: 'Verify183' }) : await client.read('task-2'); assert.equal(verdict.kind, 'context-changed'); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 0);
  } finally { await f.close(); } }
});

test('183: a concurrent edit after preflight still conflicts; the old token is never refreshed', async () => {
  const f = await fixture(); try { const view = await opened(f); let raced = false;
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { if (init?.method === 'PATCH' && !raced) { raced = true; f.store.saveRecord('tasks', { notes: 'Another editor183' }, 'task-2'); } return f.transport(input, init); } });
    assert.equal((await client.save(view, { notes: 'Stale editor183' })).kind, 'conflict'); assert.equal(f.store.record('tasks', 'task-2')!.values.notes, 'Another editor183'); assert.equal(f.store.changesCount, 1);
    assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1); assert.equal(JSON.parse(f.requests.find(r => r.method === 'PATCH')!.init!.body as string).expectedRevision, view.current.revision);
  } finally { await f.close(); }
});

test('183: lost acknowledgement stays uncertain and verification only reads, preserving observed revision', async () => {
  const f = await fixture(); try { const view = await opened(f), client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { const r = await f.transport(input, init); if (init?.method === 'PATCH') { await r.arrayBuffer(); throw Error('Lost after real commit183'); } return r; } });
    assert.equal((await client.save(view, { notes: 'Committed183' })).kind, 'uncertain'); const start = f.requests.length, checked = await client.verify(view, { notes: 'Committed183' }); assert.equal(checked.kind, 'read'); if (checked.kind !== 'read') throw Error('No evidence'); assert.equal(checked.evidence, 'applied'); assert.notEqual(checked.opened.current.revision, view.current.revision);
    assert(f.requests.slice(start).every(r => r.method === 'GET')); assert.equal(f.store.changesCount, 1); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1);
    assert.equal((await f.client.save(view, { notes: 'Another explicit old attempt183' })).kind, 'conflict');
  } finally { await f.close(); }
});

test('183: unchanged and diverged verification do not become acknowledgements or writes', async () => {
  const f = await fixture(); try { const view = await opened(f), first = await f.client.verify(view, { notes: 'My intention183' }); assert.equal(first.kind, 'read'); if (first.kind === 'read') assert.equal(first.evidence, 'unchanged');
    f.store.saveRecord('tasks', { notes: 'Other intention183' }, 'task-2'); const second = await f.client.verify(view, { notes: 'My intention183' }); assert.equal(second.kind, 'read'); if (second.kind === 'read') assert.equal(second.evidence, 'diverged'); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 0);
  } finally { await f.close(); }
});

test('183: malformed views, mismatched context and pre-aborted saves cannot dispatch', async () => {
  const f = await fixture(); try { const view = await opened(f), n = f.requests.length, bad = structuredClone(view); bad.current.record.id = 'not-the-reviewed-task'; bad.context.instanceId = randomUUID();
    assert.equal((await f.client.save(bad, { notes: 'No183' })).kind, 'not-sent');
    assert.equal((await f.client.save(view, {})).kind, 'not-sent');
    const c = new AbortController(); c.abort(); assert.equal((await f.client.save(view, { notes: 'No183' }, c.signal)).kind, 'not-sent'); assert.equal(f.requests.length, n);
    const malformed = structuredClone(view); malformed.current.revision = 'invalid'; assert.equal((await f.client.verify(malformed, { notes: 'No183' })).kind, 'unknown'); assert.equal(f.requests.length, n);
  } finally { await f.close(); }
});

test('183: caller mutations during preflight cannot replace the reviewed revision, patch or identity', async () => {
  const f = await fixture(), entered = gate(), release = gate(); try { const view = await opened(f), revision = view.current.revision, values = { notes: 'Frozen intention183' }; let held = false;
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { const r = await f.transport(input, init); if (String(input).endsWith('/api/v2/state') && !held) { held = true; entered.release(); await release.promise; } return r; } });
    const pending = client.save(view, values); await entered.promise; view.context.accountId = 'caller-mutated'; view.current.revision = 'a'.repeat(64); view.current.record.id = 'task-3'; values.notes = 'Caller replaced intention183'; release.release(); assert.equal((await pending).kind, 'changed'); const sent = f.requests.find(r => r.method === 'PATCH')!; assert.equal(sent.path, '/api/v7/task-revision/task-2'); assert.deepEqual(JSON.parse(sent.init!.body as string), { expectedRevision: revision, values: { notes: 'Frozen intention183' } });
  } finally { release.release(); await f.close(); }
});

test('183: expected context is frozen before asynchronous reads', async () => {
  const f = await fixture(), entered = gate(), release = gate(); try { const view = await opened(f); let held = false;
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { const r = await f.transport(input, init); if (String(input).endsWith('/api/v2/state') && !held) { held = true; entered.release(); await release.promise; } return r; } });
    const read = client.read('task-2', view.context); await entered.promise; view.context.accountId = 'mutated-expected'; release.release(); assert.equal((await read).kind, 'read');
  } finally { release.release(); await f.close(); }
});

test('183: canceling during context preflight prevents PATCH; canceling after dispatch stays uncertain', async () => {
  for (const phase of ['preflight', 'sent']) { const f = await fixture(); try { const view = await opened(f), c = new AbortController();
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { const r = await f.transport(input, init); if (phase === 'preflight' && String(input).endsWith('/api/v2/state')) c.abort(); if (phase === 'sent' && init?.method === 'PATCH') c.abort(); return r; } });
    const result = await client.save(view, { notes: 'Canceled183' }, c.signal); assert(phase === 'preflight' ? ['not-sent', 'preflight-failed'].includes(result.kind) : result.kind === 'uncertain'); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, phase === 'preflight' ? 0 : 1); assert.equal(f.store.changesCount, phase === 'preflight' ? 0 : 1);
  } finally { await f.close(); } }
});

test('183: missing route has no legacy fallback; missing task and locked reads remain distinct', async () => {
  const f = await fixture(false); try { const r = await f.client.read('task-2'); assert.equal(r.kind, 'failed'); if (r.kind === 'failed') assert.equal(r.status, 404); assert.equal(f.requests.filter(r => r.path.startsWith('/api/records/')).length, 0); } finally { await f.close(); }
  const g = await fixture(); try { const view = await opened(g), missing = structuredClone(view); missing.current.record.id = 'fiction-missing183'; assert.equal((await g.client.verify(missing, { notes: 'No183' })).kind, 'missing');
    const locked = createContextualTaskRevisionClient({ base, fetch: async () => Response.json({ error: 'Fiction locked' }, { status: 401 }) }); const save = await locked.save(view, { notes: 'No183' }); assert.equal(save.kind, 'preflight-failed'); if (save.kind === 'preflight-failed') assert.equal(save.status, 401); assert.equal((await locked.verify(view, { notes: 'No183' })).kind, 'locked');
  } finally { await g.close(); }
});

test('183: incompatible state, deactivation and stalled preflight never authorize a write', async () => {
  const f = await fixture(); try { const view = await opened(f);
    const malformed = createContextualTaskRevisionClient({ base, fetch: async () => Response.json({ invalid: 'https://secret.invalid/example' }) }); const save = await malformed.save(view, { notes: 'No183' }); assert.equal(save.kind, 'preflight-failed'); assert(!JSON.stringify(save).includes('secret.invalid'));
    const stalled = createContextualTaskRevisionClient({ base, contextTimeoutMs: 15, fetch: async () => new Promise<Response>(() => {}) }); assert.equal((await stalled.save(view, { notes: 'No183' })).kind, 'preflight-failed');
    f.store.set('generation', { ...f.store.generation!, approved: false }); assert.equal((await f.client.save(view, { notes: 'No183' })).kind, 'context-changed'); assert.equal((await f.client.read('task-2')).kind, 'unavailable'); assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 0);
    assert.throws(() => createContextualTaskRevisionClient({ contextTimeoutMs: 0 }));
  } finally { await f.close(); }
});

test('183: post-dispatch HTTP rejections stay distinct from preflight failures and uncertainty', async () => {
  for (const status of [401, 409, 422]) { const f = await fixture(); try { const view = await opened(f);
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => {
      if (init?.method === 'PATCH') {
        if (status === 401) { const setup = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: { host: '127.0.0.1:4830', 'content-type': 'application/json' }, payload: { password: 'fiction-only-context183' } }); assert.equal(setup.statusCode, 200); }
        if (status === 409) f.store.set('returnBusy', true);
      }
      return f.transport(input, init);
    } });
    const result = await client.save(view, status === 422 ? { not_a_field183: 'No183' } : { notes: 'No183' }); assert.equal(result.kind, 'rejected'); if (result.kind === 'rejected') assert.equal(result.status, status);
    assert.equal(f.requests.filter(r => r.method === 'PATCH').length, 1); assert.equal(f.store.changesCount, 0);
  } finally { await f.close(); } }
});

test('185: the server revision rejects generation or account changes after observed context preflight', async () => {
  for (const field of ['generation', 'account']) { const f = await fixture(); try { const view = await opened(f);
    const client = createContextualTaskRevisionClient({ base, fetch: async (input, init) => { if (init?.method === 'PATCH') changeContext(f, field); return f.transport(input, init); } });
    const result = await client.save(view, { notes: 'Window control183' });
    //185 extends128's fingerprint to the active generation timestamp; the snapshot already includes account.
    assert.equal(result.kind, 'conflict'); assert.equal(f.store.changesCount, 0);
    assert.equal((await client.verify(view, { notes: 'Window control183' })).kind, 'context-changed');
  } finally { await f.close(); } }
});
