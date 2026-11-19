import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope } from '../server/task-intents-service.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { TASK_INTENTS_PATH } from '../shared/task-intents.js';
import { createContextualTaskRevisionClient } from '../src/task-revision-context-client.js';

const generatedAt = '2026-11-10T10:00:00.000Z';
const revisionPath = '/api/v7/task-revision/task-2';
const replacementNotes = 'Valor de la segunda copia ficticia';

async function fixture(t: TestContext) {
  const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: 'none', taskRevisions: true });
  t.after(() => app.close());
  registerTaskIntents(app, store);
  const snapshot = makeFixture('agency');
  const apply = (copy: typeof snapshot, replace: boolean) => {
    store.importSnapshot(copy, replace);
    store.saveGeneration(makeDemoSpec(copy), { provider: 'demo', model: null, generatedAt, prompt: '', approved: false });
    store.activate();
  };
  apply(snapshot, false);
  const before = currentTaskIntentScope(store);
  const headers = { host: '127.0.0.1' };
  let afterRevision: (() => void) | null = null;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    assert.equal(init?.method ?? 'GET', 'GET');
    const response = await app.inject({ url: url.pathname + url.search, headers });
    if (url.pathname === revisionPath && afterRevision && response.statusCode === 200) {
      const action = afterRevision;
      afterRevision = null;
      action();
    }
    return new Response(response.body, { status: response.statusCode, headers: { 'content-type': String(response.headers['content-type']) } });
  };
  const replace = () => {
    const copy = structuredClone(snapshot);
    copy.records.find(row => row.entity === 'tasks' && row.id === 'task-2')!.values.notes = replacementNotes;
    apply(copy, true);
    const current = currentTaskIntentScope(store);
    assert.deepEqual(current.identity, before.identity);
    assert.notEqual(current.contextRevision, before.contextRevision);
    assert.equal(store.changesCount, 0, 'el valor pertenece a la captura importada');
  };
  const originalScopeStatus = async () => {
    const query = new URLSearchParams({ identity: JSON.stringify(before.identity), contextRevision: before.contextRevision });
    return (await app.inject({ url: TASK_INTENTS_PATH + '?' + query, headers })).statusCode;
  };
  return {
    client: createContextualTaskRevisionClient({ fetch: transport }),
    replace,
    replaceAfterRead: () => { afterRevision = replace; },
    originalScopeStatus,
    changes: () => store.changesCount,
  };
}

test('332 · la ficha descarta una lectura si cambia el pin entre tarea y estado aunque coincida la identidad visible', async t => {
  const f = await fixture(t);
  f.replaceAfterRead();
  const result = await f.client.read('task-2');
  assert.equal(await f.originalScopeStatus(), 409);
  assert.equal(f.changes(), 0);
  assert.equal(result.kind, 'context-changed');
});

test('332 · verificar no toma una coincidencia de otra copia como evidencia del intento', async t => {
  const f = await fixture(t);
  const opened = await f.client.read('task-2');
  assert.equal(opened.kind, 'read');
  f.replace();
  const result = await f.client.verify(opened.opened, { notes: replacementNotes });
  assert.equal(await f.originalScopeStatus(), 409);
  assert.equal(f.changes(), 0);
  assert.equal(result.kind, 'context-changed');
});

test('332 · la misma copia permite abrir y comprobar por lectura sin nuevo efecto', async t => {
  const f = await fixture(t);
  const opened = await f.client.read('task-2');
  assert.equal(opened.kind, 'read');
  const result = await f.client.verify(opened.opened, { notes: replacementNotes });
  assert.equal(await f.originalScopeStatus(), 200);
  assert.equal(result.kind, 'read');
  assert.equal(result.evidence, 'unchanged');
  assert.equal(f.changes(), 0);
});
