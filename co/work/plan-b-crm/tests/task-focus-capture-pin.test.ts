import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { contextKey, sameTaskCapture } from '../shared/local-task-focus.js';
import { createContextualTaskRevisionClient } from '../src/task-revision-context-client.js';

async function fixture(t: TestContext) {
  const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: 'none', taskRevisions: true });
  t.after(() => app.close());
  const snapshot = makeFixture('agency');
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  store.activate();

  let changeState: (body: Record<string, unknown>) => void = () => {};
  const requests: { url: string; method: string }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    const method = init?.method === 'PATCH' ? 'PATCH' : 'GET';
    requests.push({ url: url.pathname, method });
    const response = await app.inject({ url: url.pathname, method, headers: { host: '127.0.0.1' } });
    let body = response.body;
    if (url.pathname === '/api/v2/state') {
      const state = response.json();
      changeState(state);
      body = JSON.stringify(state);
    }
    return new Response(body, { status: response.statusCode, headers: { 'content-type': String(response.headers['content-type']) } });
  };

  const client = createContextualTaskRevisionClient({ fetch: transport });
  async function open() {
    const result = await client.read('task-2');
    assert.equal(result.kind, 'read');
    return result.opened;
  }
  return { client, open, requests, alter: (fn: typeof changeState) => { changeState = fn; }, changes: () => store.changesCount };
}

test('un servidor anterior sin huella permite abrir y verificar con la identidad que publicaba', async t => {
  const f = await fixture(t);
  f.alter(state => { delete state.workspaceSearchContext; });
  const opened = await f.open();
  assert.equal(opened.context.contextRevision, undefined);
  const result = await f.client.verify(opened, { notes: 'Texto ficticio' });
  assert.equal(result.kind, 'read');
  assert.equal(result.evidence, 'unchanged');
  assert.equal(f.changes(), 0);
});

test('perder la huella observada impide guardar y comprobar incluso con la misma identidad pública', async t => {
  const f = await fixture(t);
  const opened = await f.open();
  assert.match(opened.context.contextRevision ?? '', /^[a-f0-9]{64}$/);
  f.alter(state => { delete state.workspaceSearchContext; });
  const unpinned = await f.open();
  assert.equal(contextKey(opened.context), contextKey(unpinned.context));
  assert.equal(sameTaskCapture(opened.context, unpinned.context), false);
  assert.deepEqual(await f.client.save(opened, { notes: 'Texto ficticio' }), { kind: 'context-changed' });
  assert.deepEqual(await f.client.verify(opened, { notes: 'Texto ficticio' }), { kind: 'context-changed' });
  assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 0);
  assert.equal(f.changes(), 0);
});

test('un estado activo con huella nula, inválida o de otra copia no abre una tarea', async t => {
  const f = await fixture(t);
  for (const value of [null, {}, { contextRevision: 'f'.repeat(64) }]) {
    f.alter(state => { state.workspaceSearchContext = value; });
    assert.deepEqual(await f.client.read('task-2'), { kind: 'context-changed' });
  }
  f.alter(state => {
    const pin = state.workspaceSearchContext as Record<string, unknown>;
    pin.accountId = 'otra-cuenta-ficticia';
  });
  assert.deepEqual(await f.client.read('task-2'), { kind: 'context-changed' });
  assert.equal(f.requests.filter(request => request.url.startsWith('/api/v7/task-revision/')).length, 0);
});
