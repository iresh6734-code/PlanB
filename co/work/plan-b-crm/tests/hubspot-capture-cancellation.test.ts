import test from 'node:test';
import assert from 'node:assert/strict';
import { importHubspot } from '../server/hubspot.js';
import { Store } from '../server/store.js';
import { Continuity } from '../server/continuity.js';
import { makeFixture } from '../shared/fixtures.js';

const base = { token: 'synthetic-token-no-access', accountId: '123', confirmedTestAccount: true };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

test('cancelled before capture does not contact the provider', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
  await assert.rejects(importHubspot({ ...base, signal: controller.signal }, fetcher));
  assert.equal(calls, 0);
});

test('cancel during Retry-After stops promptly without a retry', async () => {
  const controller = new AbortController(), entered = deferred<void>(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; entered.resolve(); return new Response('', { status: 429, headers: { 'Retry-After': '5' } }); };
  const result = importHubspot({ ...base, signal: controller.signal }, fetcher);
  await entered.promise; await new Promise(resolve => setImmediate(resolve)); controller.abort();
  const settled = await Promise.race([result.then(() => 'resolved', () => 'rejected'), new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 350))]);
  assert.equal(settled, 'rejected'); assert.equal(calls, 1);
});

test('a late 404 from an uncooperative transport after cancellation cannot trigger a legacy fallback', async () => {
  const controller = new AbortController(), pending = deferred<Response>(), entered = deferred<void>(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; entered.resolve(); return pending.promise; };
  const result = importHubspot({ ...base, signal: controller.signal }, fetcher);
  await entered.promise; controller.abort(); pending.resolve(new Response('', { status: 404 }));
  await assert.rejects(result); assert.equal(calls, 1);
});

test('cancelling a real local capture job retains the previous copy and releases the job', async () => {
  const store = new Store(':memory:'), snapshot = makeFixture('agency');
  store.importSnapshot(snapshot); store.addCapture(snapshot);
  const before = JSON.stringify({ snapshot: store.snapshot, records: store.records(), captures: store.captures() });
  const entered = deferred<void>(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; entered.resolve(); return new Response('', { status: 429, headers: { 'Retry-After': '5' } }); };
  const continuity = new Continuity(store, '.', false, options => importHubspot(options, fetcher));
  continuity.connection = () => ({ ...base, mode: 'test', selectedFields: {} });
  try {
    const job = continuity.capture(); await entered.promise; continuity.jobs.cancel(job.id);
    await Promise.race([continuity.jobs.stop(), new Promise<never>((_, reject) => setTimeout(() => reject(Error('job remained busy')), 800))]);
    assert.equal(continuity.jobs.list().find(item => item.id === job.id)?.status, 'cancelled');
    assert.equal(JSON.stringify({ snapshot: store.snapshot, records: store.records(), captures: store.captures() }), before);
    assert.equal(calls, 1);
  } finally { await continuity.jobs.stop(); store.close(); }
});
