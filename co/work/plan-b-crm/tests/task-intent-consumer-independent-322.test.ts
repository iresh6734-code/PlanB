import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerTaskIntents } from '../server/task-intents-api.js';
import { currentTaskIntentScope } from '../server/task-intents-service.js';
import { readTaskRevision, writeTaskRevision } from '../server/task-revision.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { TaskContext } from '../shared/local-task-focus.js';
import { TASK_INTENTS_PATH } from '../shared/task-intents.js';
import { createTaskIntentsClient } from '../src/local-task-intents-client.js';
import { createTaskSaveIntentStrategy } from '../src/task-save-intent-strategy.js';

const at = '2026-11-10T11:00:00.000Z';
const headers = { host: '127.0.0.1' };

async function fixture(t: TestContext) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  t.after(() => app.close());
  const snapshot = makeFixture('agency');
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: at, approved: false });
  store.activate();

  let posts = 0;
  let writes = 0;
  app.addHook('onRequest', async request => {
    if (request.method === 'POST' && request.url === TASK_INTENTS_PATH + '/attempts') posts++;
  });
  registerTaskIntents(app, store, {
    now: () => at,
    writer: (...args) => {
      writes++;
      return writeTaskRevision(...args);
    },
  });
  const scope = currentTaskIntentScope(store);
  const transport = (cookie?: string): typeof fetch => async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    // Fastify inject deliberately ignores the fetch signal, as an already
    // dispatched transport can. The server, writer and history are real.
    const response = await app.inject({
      method: init?.method === 'POST' ? 'POST' : 'GET',
      url: url.pathname + url.search,
      headers: { ...headers, ...(cookie ? { cookie } : {}), ...(init?.body ? { 'content-type': 'application/json' } : {}) },
      payload: init?.body as string | undefined,
    });
    return new Response(response.body, { status: response.statusCode });
  };
  const request = () => ({
    scope,
    attemptId: randomUUID(),
    taskId: 'task-2',
    expectedRevision: readTaskRevision(store, 'task-2').revision,
    values: { notes: 'Tarea ficticia de revisión 322' },
  });
  return { app, store, scope, request, transport, counts: () => ({ posts, writes, history: store.changesCount }) };
}

function lockEvents(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  let count = 0;
  target.addEventListener('planb:locked', () => { count++; });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return () => count;
}

async function login(f: Awaited<ReturnType<typeof fixture>>, action: 'setup' | 'login') {
  const response = await f.app.inject({
    method: 'POST', url: '/api/v2/auth/' + action, headers,
    payload: { password: 'fiction-only-322-password' },
  });
  assert.equal(response.statusCode, 200);
  const cookie = String(response.headers['set-cookie']).split(';')[0]!;
  assert.ok(cookie.includes('='));
  return cookie;
}

test('322 · abortar dentro de onDispatch impide el POST, el escritor y el historial', async t => {
  const f = await fixture(t);
  const controller = new AbortController();
  const transport = f.transport();
  const requests: Promise<Response>[] = [];
  const client = createTaskIntentsClient({
    fetch: (input, init) => {
      const response = transport(input, init);
      requests.push(response);
      return response;
    },
  });
  const result = await client.execute(f.request(), { onDispatch: () => controller.abort() }, controller.signal);
  await Promise.all(requests);
  const journal = await createTaskIntentsClient({ fetch: transport }).list(f.scope);
  assert.equal(journal.kind, 'ok');
  assert.deepEqual(
    { result: result.kind, transports: requests.length, ...f.counts(), attempts: journal.value.entries.length },
    { result: 'not-dispatched', transports: 0, posts: 0, writes: 0, history: 0, attempts: 0 },
  );
});

test('322 · un 401 real tras vencer la consulta anterior no bloquea la sesión nueva', async t => {
  const f = await fixture(t);
  const events = lockEvents(t);
  const oldCookie = await login(f, 'setup');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let oldResponse: Promise<Response> | undefined;
  const old = createTaskIntentsClient({
    readTimeoutMs: 25,
    fetch: (input, init) => {
      oldResponse = held.then(() => f.transport(oldCookie)(input, init));
      return oldResponse;
    },
  });
  try {
    const expired = await old.list(f.scope);
    assert.equal(expired.kind, 'unavailable');
    assert.equal(expired.cause, 'timeout');
    const locked = await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie: oldCookie } });
    assert.equal(locked.statusCode, 200);
    const fresh = await login(f, 'login');
    assert.equal((await createTaskIntentsClient({ fetch: f.transport(fresh) }).list(f.scope)).kind, 'ok');
    assert.equal(events(), 0);
  } finally {
    release();
    assert.equal((await oldResponse)?.status, 401);
  }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(events(), 0);
});

test('322 · un 401 real de la consulta vigente conserva el evento de bloqueo', async t => {
  const f = await fixture(t);
  const events = lockEvents(t);
  await login(f, 'setup');
  const result = await createTaskIntentsClient({ fetch: f.transport() }).list(f.scope);
  assert.equal(result.kind, 'locked');
  assert.equal(events(), 1);
});

test('322 · el adaptador no verifica una tarea con el intento válido de otra', async t => {
  const f = await fixture(t);
  const transport = f.transport();
  const input = f.request();
  const executed = await createTaskIntentsClient({ fetch: transport }).execute(input);
  assert.equal(executed.kind, 'execution');
  const baseline = readTaskRevision(f.store, 'task-1');
  const context: TaskContext = {
    ...f.scope.identity,
    snapshotName: 'Captura ficticia',
    ready: true,
    runtime: false,
    isTestData: true,
  };
  const adapter = createTaskSaveIntentStrategy({ fetch: transport, contextRevision: () => f.scope.contextRevision }).asSaveStrategy();
  const verified = await adapter.verify({
    taskId: baseline.record.id,
    baseline: baseline.record,
    patch: input.values,
    revision: baseline.revision,
    attemptId: input.attemptId,
    context,
  });
  assert.deepEqual(f.counts(), { posts: 1, writes: 1, history: 1 });
  assert.equal(verified.kind, 'unknown', 'la lectura de task-2 no acredita un resultado para task-1');
});
