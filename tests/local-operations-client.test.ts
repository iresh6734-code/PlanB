import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { inspectLocalOperations } from '../server/local-operations.js';
import { makeFixture } from '../shared/fixtures.js';
import { loadLocalOperations, runLocalReview, LocalOperationsError } from '../src/local-operations-client.js';

function value() { const store = new Store(':memory:'); store.set('instanceId', randomUUID()); store.importSnapshot(makeFixture()); try { return inspectLocalOperations(store); } finally { store.close(); } }
async function transport(fn: typeof fetch, run: () => Promise<void>) { const before = globalThis.fetch; globalThis.fetch = fn; try { await run(); } finally { globalThis.fetch = before; } }
test('rejects non-JSON, invalid shape and count mismatch', async () => {
  const valid = value();
  for (const raw of ['<html>not ready</html>', JSON.stringify({ ok: true }), JSON.stringify({ ...valid, tasks: [] })])
    await transport(async () => new Response(raw), async () => { await assert.rejects(loadLocalOperations(new AbortController().signal), /compatible/); });
});
test('does not accept an ignored abort as a successful read', async () => {
  const valid = value(), controller = new AbortController();
  await transport(async () => { controller.abort(); return Response.json(valid); }, async () => { await assert.rejects(loadLocalOperations(controller.signal), { name: 'AbortError' }); });
});
test('typed conflict is surfaced rather than a success receipt', async () => {
  await transport(async () => Response.json({ error: 'La copia cambió.' }, { status: 409 }), async () => {
    await assert.rejects(runLocalReview('a'.repeat(64), randomUUID(), new AbortController().signal), (error: unknown) => error instanceof LocalOperationsError && error.status === 409);
  });
});
test('mutation sends stable revision and idempotency key; mismatched receipt rejected', async () => {
  const current = value(), key = randomUUID(); let calls = 0;
  await transport(async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), { revision: current.revision, idempotencyKey: key }); calls++;
    return Response.json({ ok: true, replayed: calls > 1, review: { id: randomUUID(), revision: current.revision, at: current.evaluatedAt, tasks: 18, overdue: 2, needsReview: 0, stale: false } });
  }, async () => { await runLocalReview(current.revision, key, new AbortController().signal); const r = await runLocalReview(current.revision, key, new AbortController().signal); assert.equal(r.replayed, true); });
  await transport(async () => Response.json({ ok: true, replayed: false, review: { id: randomUUID(), revision: '0'.repeat(64), at: current.evaluatedAt, tasks: 18, overdue: 0, needsReview: 0, stale: false } }), async () => { await assert.rejects(runLocalReview(current.revision, key, new AbortController().signal), /confirmar/); });
});
