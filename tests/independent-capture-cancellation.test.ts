import test from 'node:test';
import assert from 'node:assert/strict';
import { importHubspot } from '../server/hubspot.js';
import { AppError } from '../server/store.js';

const options = { token: 'fiction-only-no-provider-access', accountId: '123', confirmedTestAccount: true };
function pending<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('abort while JSON is pending rejects with the cancellation reason and never reports account success', async () => {
  const controller = new AbortController(), entered = pending<void>(), body = pending<unknown>(), reason = new Error('fixture-json-abort');
  let calls = 0; const progress: string[] = [];
  const fetcher: typeof fetch = async () => {
    calls++; const response = new Response('unused');
    response.json = async () => { entered.resolve(); return body.promise; }; return response;
  };
  const result = importHubspot({ ...options, signal: controller.signal, progress: m => progress.push(m) }, fetcher);
  await entered.promise; controller.abort(reason); body.resolve({ portalId: 123, accountType: 'SANDBOX' });
  await assert.rejects(result, e => e === reason); assert.equal(calls, 1); assert.deepEqual(progress, []);
});

test('transport failure delivered after abort preserves the explicit reason instead of a generic provider error', async () => {
  const controller = new AbortController(), entered = pending<void>(), response = pending<Response>(), reason = new Error('fixture-fetch-abort'); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; entered.resolve(); return response.promise; };
  const result = importHubspot({ ...options, signal: controller.signal }, fetcher);
  await entered.promise; controller.abort(reason); response.reject(new Error('late transport failure'));
  await assert.rejects(result, e => e === reason); assert.equal(calls, 1);
});

test('cancel in a 503 backoff discards its body, contains cancel rejection and schedules no retry', async () => {
  const controller = new AbortController(), discarded = pending<void>(), reason = new Error('fixture-backoff-abort'); let calls = 0, canceled = 0, pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { canceled++; discarded.resolve(); return Promise.reject(Error('synthetic cancel rejection')); } }, { highWaterMark: 0 });
  const fetcher: typeof fetch = async () => { calls++; return new Response(stream, { status: 503, headers: { 'Retry-After': '5' } }); };
  const result = importHubspot({ ...options, signal: controller.signal }, fetcher);
  await discarded.promise; await new Promise(resolve => setImmediate(resolve)); controller.abort(reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome: unknown = await Promise.race([result.then(() => 'unexpected success', e => e), new Promise<string>(resolve => { timer = setTimeout(() => resolve('cancel did not settle within 350ms'), 350); })]);
    assert.ok(outcome instanceof Error && outcome.name === 'AbortError' && outcome.cause === reason);
  } finally { clearTimeout(timer); }
  assert.equal(calls, 1); assert.equal(canceled, 1); assert.equal(pulls, 0);
});

test('abort in progress callback stops before the next metadata request', async () => {
  const controller = new AbortController(), reason = new Error('fixture-progress-abort'); let calls = 0, progress = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ portalId: 123, accountType: 'SANDBOX' }); };
  await assert.rejects(importHubspot({ ...options, signal: controller.signal, progress: () => { progress++; controller.abort(reason); } }, fetcher), e => e === reason);
  assert.equal(calls, 1); assert.equal(progress, 1);
});

test('a late successful response after abort is canceled without reading JSON', async () => {
  const controller = new AbortController(), entered = pending<void>(), response = pending<Response>(), reason = new Error('fixture-late-success');
  let calls = 0, reads = 0, canceled = 0;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled++; } }, { highWaterMark: 0 });
  const fetcher: typeof fetch = async () => { calls++; entered.resolve(); return response.promise; };
  const result = importHubspot({ ...options, signal: controller.signal }, fetcher);
  await entered.promise; controller.abort(reason);
  const late = new Response(stream); late.json = async () => { reads++; return { portalId: 123, accountType: 'SANDBOX' }; }; response.resolve(late);
  await assert.rejects(result, e => e === reason); assert.equal(calls, 1); assert.equal(reads, 0); assert.equal(canceled, 1);
});

test('an uncanceled 429 still retries and preserves a later permission failure', async () => {
  const paths: string[] = [], methods: string[] = []; let discarded = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { discarded = true; } }, { highWaterMark: 0 });
  const fetcher: typeof fetch = async (url, init) => {
    paths.push(new URL(String(url)).pathname); methods.push(init?.method ?? 'GET');
    if (paths.length === 1) return new Response(stream, { status: 429, headers: { 'Retry-After': '1' } });
    if (paths.length === 2) return Response.json({ portalId: 123, accountType: 'SANDBOX' });
    return new Response('', { status: 403 });
  };
  await assert.rejects(importHubspot({ ...options, signal: new AbortController().signal }, fetcher), e => e instanceof AppError && e.status === 403);
  assert.equal(paths.length, 3); assert.equal(paths[0], paths[1]); assert.match(paths[2], /pipelines/); assert.equal(discarded, true); assert.deepEqual(methods, ['GET', 'GET', 'GET']);
});
