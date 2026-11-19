import test from 'node:test';
import assert from 'node:assert/strict';
import { runCrmCapture, CaptureReadError, CaptureRunnerError, type RunnerOptions } from '../shared/crm-capture-runner.js';
import { CaptureContractError } from '../shared/crm-capture-contract.js';

const binding = { tenantId: 'tenant-a', portalId: 'portal-a', generation: 1 };
type Item = { id: string; label?: string };
const done = (ids: string[] = []) => ({ items: ids.map(id => ({ id })), nextCursor: null });
function options(overrides: Partial<RunnerOptions<Item>> = {}): RunnerOptions<Item> {
  return { binding: { ...binding }, entities: ['contacts'], getBinding: async () => ({ ...binding }), readPage: async () => done(['one']), requestTimeoutMs: 500, deadlineMs: 2000, ...overrides };
}
const never = <T>(): Promise<T> => new Promise(() => {});
async function runnerCode(promise: Promise<unknown>, expected: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof CaptureRunnerError && error.code === expected);
}

test('runner acceptance: interleaved page retries reset attempt per page and never repeat accepted pages', async () => {
  const calls: string[] = [], waits: number[] = [];
  const result = await runCrmCapture(options({ entities: ['contacts', 'companies'], sleep: async ms => { waits.push(ms); }, readPage: async r => {
    calls.push(`${r.entity}:${r.cursor}:${r.attempt}`);
    if (r.entity === 'contacts' && r.cursor === null && r.attempt === 1) throw new CaptureReadError(429, 0);
    if (r.entity === 'contacts' && r.cursor === null) return { items: [{ id: 'shared' }], nextCursor: 'p2' };
    if (r.entity === 'contacts') return done(['second']);
    return done(['shared']);
  } }));
  assert.deepEqual(calls, ['contacts:null:1', 'contacts:null:2', 'contacts:p2:1', 'companies:null:1']);
  assert.deepEqual(waits, [0]);
  assert.equal(result.attempts, 4);
  assert.equal(result.retries, 1);
  assert.equal(result.summary.totalRecords, 3);
});

for (const status of [401, 403, 404, 400]) {
  test(`runner acceptance: ${status} cannot spend a retry or expose transport detail`, async () => {
    let calls = 0, sleeps = 0;
    await runnerCode(runCrmCapture(options({ readPage: async () => { calls++; throw new CaptureReadError(status); }, sleep: async () => { sleeps++; } })), 'READ_FAILED');
    assert.equal(calls, 1); assert.equal(sleeps, 0);
  });
}

test('runner acceptance: retry exhaustion is bounded and counts only actual reads', async () => {
  let calls = 0; const delays: number[] = [];
  await runnerCode(runCrmCapture(options({ maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 3, sleep: async ms => { delays.push(ms); }, readPage: async () => { calls++; throw new CaptureReadError(503); } })), 'RETRY_EXHAUSTED');
  assert.equal(calls, 3); assert.deepEqual(delays, [2, 3]);
});

test('runner acceptance: Retry-After is clamped while invalid input uses exponential backoff', async () => {
  let calls = 0; const delays: number[] = [];
  const result = await runCrmCapture(options({ maxAttempts: 4, baseDelayMs: 2, maxDelayMs: 5, sleep: async ms => { delays.push(ms); }, readPage: async () => {
    calls++; if (calls === 1) throw new CaptureReadError(429, 5000); if (calls === 2) throw new CaptureReadError(503, NaN); return done(['one']);
  } }));
  assert.deepEqual(delays, [5, 4]); assert.equal(result.retries, 2);
});

test('runner acceptance: an identity change after a read prevents a publishable result', async () => {
  let current = { ...binding }, calls = 0;
  await runnerCode(runCrmCapture(options({ getBinding: async () => ({ ...current }), readPage: async () => { calls++; current = { ...binding, generation: 2 }; return done(['one']); } })), 'BINDING_CHANGED');
  assert.equal(calls, 1);
});

test('runner acceptance: changing identity during retry sleep prevents a second request', async () => {
  let current = { ...binding }, calls = 0;
  await runnerCode(runCrmCapture(options({ getBinding: async () => ({ ...current }), sleep: async () => { current = { ...binding, portalId: 'other' }; }, readPage: async () => { calls++; throw new CaptureReadError(429, 0); } })), 'BINDING_CHANGED');
  assert.equal(calls, 1);
});

test('runner acceptance: pre-aborted capture performs no reads', async () => {
  const abort = new AbortController(); abort.abort(); let calls = 0;
  await runnerCode(runCrmCapture(options({ signal: abort.signal, readPage: async () => { calls++; return done(); } })), 'CANCELLED');
  assert.equal(calls, 0);
});

test('runner acceptance: cancellation settles even when transport never cooperates', { timeout: 2000 }, async () => {
  const abort = new AbortController(); let signal: AbortSignal | undefined;
  const result = runCrmCapture(options({ signal: abort.signal, readPage: async r => { signal = r.signal; queueMicrotask(() => abort.abort()); return never(); } }));
  await runnerCode(result, 'CANCELLED');
  assert.equal(signal?.aborted, true);
});

test('runner acceptance: request timeout aborts its signal and never retries', { timeout: 2000 }, async () => {
  let calls = 0, signal: AbortSignal | undefined;
  await runnerCode(runCrmCapture(options({ requestTimeoutMs: 20, readPage: async r => { calls++; signal = r.signal; return never(); } })), 'TIMEOUT');
  assert.equal(calls, 1); assert.equal(signal?.aborted, true);
});

test('runner acceptance: a hanging identity lookup is also bounded', { timeout: 2000 }, async () => {
  let calls = 0;
  await runnerCode(runCrmCapture(options({ requestTimeoutMs: 20, getBinding: () => never(), readPage: async () => { calls++; return done(); } })), 'TIMEOUT');
  assert.equal(calls, 0);
});

test('runner acceptance: deadline stops a noncooperative retry sleep', { timeout: 2000 }, async () => {
  let calls = 0;
  await runnerCode(runCrmCapture(options({ deadlineMs: 30, requestTimeoutMs: 1000, sleep: () => never(), readPage: async () => { calls++; throw new CaptureReadError(503); } })), 'DEADLINE');
  assert.equal(calls, 1);
});

test('runner acceptance: abort during retry sleep stops without another read', { timeout: 2000 }, async () => {
  let calls = 0; const abort = new AbortController();
  await runnerCode(runCrmCapture(options({ signal: abort.signal, sleep: async () => { abort.abort(); return never(); }, readPage: async () => { calls++; throw new CaptureReadError(503); } })), 'CANCELLED');
  assert.equal(calls, 1);
});

test('runner acceptance: mutation of request or caller options cannot switch the capture', async () => {
  let calls = 0;
  const config = options({ readPage: async request => {
    calls++; assert.ok(Object.isFrozen(request)); assert.ok(Object.isFrozen(request.binding));
    assert.throws(() => { request.binding.portalId = 'evil'; }, TypeError);
    config.binding.portalId = 'mutated';
    (config.entities as string[]).push('tasks');
    config.readPage = async () => { throw Error('must not use replaced transport'); };
    config.getBinding = async () => ({ ...binding, tenantId: 'must not use replacement' });
    return request.cursor === null ? { items: [{ id: 'first' }], nextCursor: 'next' } : done(['second']);
  } });
  const result = await runCrmCapture(config);
  assert.equal(calls, 2); assert.equal(result.summary.totalRecords, 2);
  assert.deepEqual(result.summary.binding, binding);
});

test('runner acceptance: result owns page arrays and item envelopes', async () => {
  const item = { id: 'one', label: 'original' }; const items = [item];
  const result = await runCrmCapture(options({ readPage: async () => ({ items, nextCursor: null }) }));
  item.id = 'changed'; items.push({ id: 'two', label: 'late' });
  assert.equal(result.records.contacts?.length, 1); assert.equal(result.records.contacts?.[0].id, 'one');
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.records));
  assert.ok(Object.isFrozen(result.records.contacts)); assert.ok(Object.isFrozen(result.records.contacts?.[0]));
});

test('runner acceptance: secret transport error is sanitized with no cause', async () => {
  await assert.rejects(runCrmCapture(options({ readPage: async () => { throw Error('secret-token https://private.example.test'); } })), (error: any) => {
    assert.ok(error instanceof CaptureRunnerError); assert.equal(error.code, 'READ_FAILED');
    assert.ok(!String(error).includes('secret-token')); assert.ok(!String(error).includes('private.example')); assert.equal(error.cause, undefined); return true;
  });
});

test('runner acceptance: duplicate records never become a partial success or a retry', async () => {
  let calls = 0;
  await assert.rejects(runCrmCapture(options({ readPage: async r => { calls++; return { items: [{ id: 'same' }], nextCursor: r.cursor === null ? 'next' : null }; } })), (error: unknown) => error instanceof CaptureContractError && error.code === 'DUPLICATE_ID');
  assert.equal(calls, 2);
});

test('runner acceptance: global record limit is applied before returning any entity', async () => {
  await assert.rejects(runCrmCapture(options({ entities: ['contacts', 'companies'], maxRecords: 1 })), (error: unknown) => error instanceof CaptureContractError && error.code === 'LIMIT_EXCEEDED');
});

test('runner acceptance: oversized pages are rejected before cloning payloads', async () => {
  let payloadReads = 0;
  const items = Array.from({ length: 4 }, (_, index) => ({ id: String(index), get label() { payloadReads++; return 'opaque'; } }));
  await assert.rejects(runCrmCapture(options({ maxRecords: 1, readPage: async () => ({ items, nextCursor: null }) })), (error: unknown) => error instanceof CaptureContractError && error.code === 'LIMIT_EXCEEDED');
  assert.equal(payloadReads, 0, 'enforce the remaining quota before copying every payload');
});

for (const limits of [{ maxAttempts: 0 }, { maxAttempts: 11 }, { requestTimeoutMs: 0 }, { deadlineMs: Infinity }, { baseDelayMs: -1 }, { baseDelayMs: 3, maxDelayMs: 2 }]) {
  test(`runner acceptance: malformed options ${JSON.stringify(limits)} fail before transport`, async () => {
    let calls = 0;
    await runnerCode(runCrmCapture(options({ ...limits, readPage: async () => { calls++; return done(); } })), 'INVALID_OPTIONS');
    assert.equal(calls, 0);
  });
}
