import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { createTaskIntentClaims, fingerprintTaskIntent, type ClaimDescriptor } from '../server/task-intent-claims.js';
import { createIntentJournal, encodeRecord, KEY_PREFIX, type IntentRecord } from '../shared/task-intent-journal.js';
import { contextKey } from '../shared/local-task-focus.js';
import { TaskIntentSummary } from '../shared/task-intents.js';

process.env.NODE_ENV = 'test';
const at = '2026-11-09T10:00:00.000Z', revision = 'a'.repeat(64), pin = 'b'.repeat(64);
function setup(t: TestContext) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const identity = { instanceId: randomUUID(), snapshotId: 'fiction-313', capturedAt: at,
    captureStartedAt: null, accountId: '', generatedAt: at };
  const patch = { status: 'completed' }, id = randomUUID();
  const request = { attemptId: id, identity, contextRevision: pin, taskId: 'task-313', expectedRevision: revision, values: patch };
  const descriptor: ClaimDescriptor = { ...request, fingerprint: fingerprintTaskIntent(request) };
  // The descriptor is strict; field values stay exclusively in the intent.
  delete (descriptor as any).values;
  const record: IntentRecord = { v: 1, id, installId: identity.instanceId, contextKey: contextKey(identity),
    taskId: request.taskId, phase: 'attempt', outcome: null, provenance: null, patch,
    baseline: { status: 'open' }, revision, createdAt: at, updatedAt: at, evidence: null, seq: 1 };
  return { store, identity, descriptor, record, raw: encodeRecord(record), claims: createTaskIntentClaims(store) };
}
const rows = (store: Store) => JSON.stringify(store.db.prepare('SELECT key,value FROM meta ORDER BY key').all());

test('two journals with one ID dispatch once; a recreated journal classifies and never replays it', async t => {
  const f = setup(t), options = { assertCurrent() {} };
  const make = () => createIntentJournal({ storage: f.claims.storage(f.descriptor, options), now: () => at, newId: () => f.record.id });
  const input = { id: f.record.id, current: { installId: f.identity.instanceId, contextKey: f.record.contextKey },
    taskId: f.record.taskId, patch: f.record.patch, baseline: f.record.baseline, revision };
  let dispatch!: () => void, release!: () => void, sends = 0;
  const started = new Promise<void>(resolve => { dispatch = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  const first = make().attempt(input, async () => { sends++; dispatch(); await finish; return { kind: 'unknown' as const }; });
  try {
    await started;
    const before = rows(f.store);
    const duplicate = await make().attempt(input, async () => { sends++; return { kind: 'ack' as const }; });
    assert.equal(duplicate.journaled, false); assert.equal(sends, 1); assert.equal(rows(f.store), before);
    const rebooted = make(); await rebooted.boot(input.current);
    assert.equal(rows(f.store), before); assert.equal(sends, 1);
    assert.equal(f.claims.lookup(f.descriptor).kind, 'replay');
  } finally { release(); await first; }
});

test('lost settlement COMMIT acknowledgement preserves the actual receipt and rejects a stale settlement', t => {
  const f = setup(t), options = { assertCurrent() {} };
  assert.equal(f.claims.writeIntent(f.descriptor, f.raw, null, options).status, 'ok');
  const settled: IntentRecord = { ...f.record, seq: 2, phase: 'settled', outcome: 'acknowledged', provenance: 'server-ack' };
  const raw = encodeRecord(settled), original = f.store.transaction.bind(f.store);
  f.store.transaction = fn => { original(fn); throw new Error('fiction lost settlement receipt'); };
  assert.equal(f.claims.writeIntent(f.descriptor, raw, f.raw, { ...options, receipt: { changed: false, resultingRevision: revision } }).issue, 'commit-uncertain');
  f.store.transaction = original;
  const before = rows(f.store), found = f.claims.lookup(f.descriptor);
  assert.equal(found.kind, 'replay');
  if (found.kind === 'replay') { assert.equal(found.claim.outcome, 'acknowledged'); assert.deepEqual(found.claim.receipt, { changed: false, resultingRevision: revision }); }
  assert.equal(f.claims.writeIntent(f.descriptor, raw, f.raw, options).status, 'conflict');
  assert.equal(rows(f.store), before);
});

test('a mismatched patch cannot initialize claims and wrong-scope lookup exposes no receipt', t => {
  const f = setup(t), before = rows(f.store), options = { assertCurrent() {} };
  const incompatible = encodeRecord({ ...f.record, patch: { status: 'other' } });
  assert.equal(f.claims.writeIntent(f.descriptor, incompatible, null, options).status, 'failed');
  assert.equal(rows(f.store), before); assert.equal(f.claims.inspect().status, 'uninitialized');
  assert.equal(f.claims.writeIntent(f.descriptor, f.raw, null, options).status, 'ok');
  assert.deepEqual(f.claims.lookup({ ...f.descriptor, identity: { ...f.identity, accountId: null } }), { kind: 'wrong-scope', issue: 'wrong-scope' });
});

test('claim receipts project to the accepted public summary before and after explicit detail removal', t => {
  const f = setup(t), options = { assertCurrent() {} };
  assert.equal(f.claims.writeIntent(f.descriptor, f.raw, null, options).status, 'ok');
  const raw = encodeRecord({ ...f.record, seq: 2, phase: 'settled', outcome: 'acknowledged', provenance: 'server-ack' });
  assert.equal(f.claims.writeIntent(f.descriptor, raw, f.raw, { ...options, receipt: { changed: true, resultingRevision: 'c'.repeat(64) } }).status, 'ok');
  for (const hasDetail of [true, false]) {
    if (!hasDetail) assert.equal(f.claims.removeIntent(f.descriptor, raw, options).status, 'ok');
    const found = f.claims.lookup(f.descriptor);
    assert.equal(found.kind, hasDetail ? 'replay' : 'expired');
    if (found.kind !== 'replay' && found.kind !== 'expired') assert.fail('missing persisted claim');
    const c = found.claim;
    const summary = TaskIntentSummary.parse({ attemptId: c.descriptor.attemptId, taskId: c.descriptor.taskId,
      scope: { identity: c.descriptor.identity, contextRevision: c.descriptor.contextRevision }, seq: c.seq,
      phase: c.phase, outcome: c.outcome, provenance: c.provenance, createdAt: c.createdAt, updatedAt: c.updatedAt,
      detailAvailable: c.hasDetail, acknowledgement: c.receipt });
    assert.equal(summary.acknowledgement?.changed, true); assert.equal(summary.detailAvailable, hasDetail);
  }
  assert.equal(f.store.get(KEY_PREFIX + f.record.id, null), null);
});
