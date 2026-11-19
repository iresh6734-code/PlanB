import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, download, NO_RESPONSE } from '../src/api.js';

test('APIs preserve the HTTP status when an error response has no usable JSON', async t => {
  for (const body of ['<h1>Gateway</h1>', '', 'null', '{"error":{"text":"incorrect"}}']) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 409 }));
    await assert.rejects(api('/v2/state'), (error: unknown) => error instanceof ApiError
      && error.status === 409 && error.message === 'No se pudo completar la operación.');
    fetch.mock.restore();
  }
});

test('an unreadable ZIP error preserves the status and never starts a download', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<h1>Unavailable</h1>', { status: 503 }));
  const makeUrl = t.mock.method(URL, 'createObjectURL');
  await assert.rejects(download('/v2/export/package', 'plan-b.zip', {}), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.message === 'No se pudo descargar el archivo.');
  assert.equal(makeUrl.mock.callCount(), 0);
});

test('the client only locks on a local session error and preserves JSON error details', async t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'window', prior);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let locks = 0;
  events.addEventListener('planb:locked', () => { locks++; });
  let response = new Response('', { status: 401 });
  t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(api('/v2/state'), { status: 401 });
  assert.equal(locks, 0);

  const details = { field: 'revision' };
  response = Response.json({ error: 'Desbloquea primero tu copia local.', details }, { status: 401 });
  await assert.rejects(download('/v2/export/package', 'plan-b.zip'), {
    status: 401, message: 'Desbloquea primero tu copia local.', details,
  });
  assert.equal(locks, 1);
  response = Response.json({ error: 'Desbloquea primero tu copia local.' }, { status: 401 });
  await assert.rejects(api('/v2/state'), { status: 401 });
  assert.equal(locks, 2);
});

test('a successful HTTP response with invalid JSON is a protocol error', async t => {
  let response = new Response('<h1>Unexpected HTML</h1>');
  t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(api('/v2/state'), (error: unknown) =>
    error instanceof ApiError && error.status === 502);
  response = Response.json({ ready: true });
  assert.deepEqual(await api('/v2/state'), { ready: true });
});

test('cancellation while reading a response body remains cancellation', async t => {
  for (const status of [200, 409]) {
    const controller = new AbortController();
    const response = new Response('', { status });
    const reason = new DOMException('cancelled by caller', 'AbortError');
    const read = t.mock.method(response, 'json', async () => { controller.abort(reason); throw reason; });
    const fetch = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(api('/v2/state', { signal: controller.signal }), error => error === reason);
    assert.equal(read.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('absence of an HTTP response keeps the network message', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('failed to fetch'); });
  await assert.rejects(api('/v2/state'), { status: 0, message: NO_RESPONSE });
});
