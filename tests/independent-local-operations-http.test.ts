import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocalOperations, runLocalReview, LocalOperationsError } from '../src/local-operations-client.js';

const revision = 'b'.repeat(64), key = '10000000-0000-4000-8000-000000000001';
const receipt = { ok: true, replayed: false, review: { id: key, revision, at: '2026-11-02T12:00:00Z', tasks: 1, overdue: 0, needsReview: 0, stale: false } };
const encode = (s: string) => new TextEncoder().encode(s);
async function transport(response: Response, run: (events: string[], requests: RequestInit[]) => Promise<void>) {
  const previous = globalThis.fetch, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget(), events: string[] = [], requests: RequestInit[] = [];
  target.addEventListener('planb:locked', () => events.push('locked'));
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  globalThis.fetch = async (_url, init) => { requests.push(init ?? {}); return response; };
  try { await run(events, requests); } finally {
    globalThis.fetch = previous;
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
  }
}
const review = () => runLocalReview(revision, key, new AbortController().signal);
function chunked(bytes: Uint8Array, width = 65_536) {
  let offset = 0, canceled = false, pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; if (offset === bytes.length) controller.close(); else { controller.enqueue(bytes.slice(offset, offset + width)); offset += Math.min(width, bytes.length - offset); } },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  return { stream, observed: () => ({ offset, canceled, pulls }) };
}

test('401 rejects GET and POST before pulling even an unending body; cancellation rejection is contained', async () => {
  for (const call of [() => loadLocalOperations(new AbortController().signal), review]) {
    let pulls = 0, cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ pull() { pulls++; return new Promise(() => {}); }, cancel() { cancels++; return Promise.reject(new Error('cancel failure')); } }, { highWaterMark: 0 });
    await transport(new Response(stream, { status: 401 }), async events => {
      await assert.rejects(call(), (e: unknown) => e instanceof LocalOperationsError && e.status === 401);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(events, ['locked']); assert.equal(pulls, 0); assert.equal(cancels, 1); assert.equal(stream.locked, false);
    });
  }
});

test('null-body 401 still emits exactly one lock event', async () => {
  await transport(new Response(null, { status: 401 }), async events => {
    await assert.rejects(review(), (e: unknown) => e instanceof LocalOperationsError && e.status === 401);
    assert.deepEqual(events, ['locked']);
  });
});

test('exactly 1,000,000 bytes preserve a successful receipt; a lying Content-Length cannot reject it', async () => {
  const json = JSON.stringify(receipt), stream = chunked(encode(json + ' '.repeat(1_000_000 - encode(json).byteLength)));
  await transport(new Response(stream.stream, { headers: { 'Content-Length': '999999999' } }), async events => {
    let actual: unknown;
    await assert.doesNotReject(async () => { actual = await review(); });
    assert.deepEqual(actual, receipt); assert.deepEqual(events, []); assert.equal(stream.observed().canceled, false);
  });
});

test('one byte over the limit cancels before EOF even with Content-Length zero', async () => {
  const json = JSON.stringify(receipt), stream = chunked(encode(json + ' '.repeat(1_000_001 - encode(json).byteLength)));
  await transport(new Response(stream.stream, { headers: { 'Content-Length': '0' } }), async events => {
    await assert.rejects(review(), /tamaño permitido/);
    assert.deepEqual(events, []); assert.equal(stream.observed().canceled, true); assert.equal(stream.observed().pulls, 16); assert.equal(stream.stream.locked, false);
  });
});

test('budget counts UTF-8 bytes, not JavaScript character length', async () => {
  const json = JSON.stringify({ error: 'é'.repeat(510_000) });
  assert.ok(json.length < 1_000_000); assert.ok(encode(json).byteLength > 1_000_000);
  const stream = chunked(encode(json));
  await transport(new Response(stream.stream, { status: 422 }), async events => {
    await assert.rejects(review(), /tamaño permitido/); assert.equal(stream.observed().canceled, true); assert.deepEqual(events, []);
  });
});

test('streaming decoder reconstructs four-byte characters when every byte is separate', async () => {
  const message = 'Copia 🧭 íntegra: mañana';
  const stream = chunked(encode(JSON.stringify({ error: message })), 1);
  await transport(new Response(stream.stream, { status: 409 }), async events => {
    await assert.rejects(review(), (e: unknown) => e instanceof LocalOperationsError && e.status === 409 && e.message === message);
    assert.deepEqual(events, []); assert.equal(stream.stream.locked, false);
  });
});

test('broken stream preserves its failure, releases reader, and never manufactures a receipt or lock', async () => {
  const failure = new Error('fixture connection interrupted'); let sent = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (!sent) { sent = true; controller.enqueue(encode('{"ok":true,')); } else controller.error(failure); } }, { highWaterMark: 0 });
  await transport(new Response(stream), async events => {
    await assert.rejects(review(), e => e === failure); assert.deepEqual(events, []); assert.equal(stream.locked, false);
  });
});

test('an oversized POST reply never automatically retries the potentially saved review', async () => {
  const stream = chunked(new Uint8Array(2_000_000).fill(0x20));
  await transport(new Response(stream.stream), async (events, requests) => {
    await assert.rejects(review(), /tamaño permitido/);
    assert.equal(requests.length, 1); assert.equal(requests[0].method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].body as string), { revision, idempotencyKey: key });
    assert.ok(stream.observed().offset < 2_000_000); assert.equal(stream.observed().canceled, true); assert.deepEqual(events, []);
  });
});

test('successful reply is streamed even when Response.text is unusable', async () => {
  const response = Response.json(receipt); response.text = async () => { throw new Error('unbounded text path used'); };
  await transport(response, async events => { assert.deepEqual(await review(), receipt); assert.deepEqual(events, []); });
});

test('non-401 empty and HTML errors remain incompatible responses without lock events', async () => {
  for (const response of [new Response(null, { status: 503 }), new Response('<h1>Unavailable</h1>', { status: 502 })])
    await transport(response, async events => { await assert.rejects(review(), /respuesta compatible/); assert.deepEqual(events, []); });
});
