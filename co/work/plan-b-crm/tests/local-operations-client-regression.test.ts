import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalOperations, runLocalReview, LocalOperationsError } from '../src/local-operations-client.js';

const signal = () => new AbortController().signal;
const revision = 'a'.repeat(64);
const key = '00000000-0000-4000-8000-000000000001';
const originalFetch = globalThis.fetch;
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
async function usingResponse(response: Response, fn: (events: string[]) => Promise<void>) {
  const events: string[] = [], target = new EventTarget();
  target.addEventListener('planb:locked', () => events.push('locked'));
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true, writable: true });
  globalThis.fetch = async () => response;
  try { await fn(events); } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('401 without JSON locks Hoy even when the response body is empty', async () => {
  await usingResponse(new Response('', { status: 401 }), async events => {
    await assert.rejects(loadLocalOperations(signal()), (e: unknown) => e instanceof LocalOperationsError && e.status === 401);
    assert.deepEqual(events, ['locked']);
  });
});
test('401 with HTML locks Agentes without interpreting its body as a successful review', async () => {
  await usingResponse(new Response('<h1>Unauthorized</h1>', { status: 401 }), async events => {
    await assert.rejects(runLocalReview(revision, key, signal()), (e: unknown) => e instanceof LocalOperationsError && e.status === 401);
    assert.deepEqual(events, ['locked']);
  });
});
test('a response exceeding one million bytes is stopped while streaming', async () => {
  let pulls = 0, canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(400_000).fill(0x61)); if (pulls === 8) controller.close(); },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  await usingResponse(new Response(body), async events => {
    await assert.rejects(loadLocalOperations(signal()), /tamaño permitido/);
    assert.equal(canceled, true); assert.ok(pulls <= 3, 'the unread remainder is never accumulated'); assert.deepEqual(events, []);
  });
});
test('a JSON validation error remains a 422 without a lock event', async () => {
  await usingResponse(new Response('{"error":"Revisa la copia"}', { status: 422 }), async events => {
    await assert.rejects(runLocalReview(revision, key, signal()), (e: unknown) => e instanceof LocalOperationsError && e.status === 422 && e.message === 'Revisa la copia');
    assert.deepEqual(events, []);
  });
});
test('valid JSON survives UTF-8 characters split across response chunks', async () => {
  const body = { ok: true, replayed: false, review: { id: key, revision, at: '2026-11-02T09:00:00Z', tasks: 1, overdue: 0, needsReview: 0, stale: false } };
  const bytes = new TextEncoder().encode(JSON.stringify({ error: 'Copia inválida' }));
  const marker = bytes.indexOf(0xc3);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.slice(0, marker + 1)); controller.enqueue(bytes.slice(marker + 1)); controller.close(); } });
  await usingResponse(new Response(stream, { status: 422 }), async () => {
    await assert.rejects(runLocalReview(revision, key, signal()), (e: unknown) => e instanceof LocalOperationsError && e.message === 'Copia inválida');
  });
  const valid = new TextEncoder().encode(JSON.stringify(body));
  await usingResponse(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(valid.slice(0, 5)); controller.enqueue(valid.slice(5)); controller.close(); } })), async () => {
    assert.equal((await runLocalReview(revision, key, signal())).review.revision, revision);
  });
});
