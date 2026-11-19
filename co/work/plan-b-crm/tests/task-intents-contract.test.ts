import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_INTENT_REQUEST_BYTES, TASK_INTENT_RESPONSE_BYTES, TaskIntentAccept, TaskIntentAbandon,
  TaskIntentCheck, TaskIntentDetail, TaskIntentExecute, TaskIntentExecution, TaskIntentIdentity,
  TaskIntentList, TaskIntentSummary, taskIntentJsonBytes,
} from '../shared/task-intents.js';

const hash = 'a'.repeat(64), nextHash = 'b'.repeat(64);
const at = '2026-11-09T10:00:00.000Z';
const identity = {
  instanceId: '15a98fa1-c4dc-4c40-9454-3d01dcc42d91', snapshotId: 'capture-a', capturedAt: at,
  captureStartedAt: null, accountId: '', generatedAt: at,
};
const scope = { identity, contextRevision: hash };
const request = {
  ...scope, attemptId: '2d027035-753b-4a8d-8127-ac1596197f32', taskId: 'task-a',
  expectedRevision: hash, values: { status: 'completed' },
};
const pending = {
  attemptId: request.attemptId, taskId: request.taskId, scope, seq: 1, phase: 'attempt',
  outcome: null, provenance: null, createdAt: at, updatedAt: at, detailAvailable: true, acknowledgement: null,
};
const confirmed = {
  ...pending, seq: 2, phase: 'settled', outcome: 'acknowledged', provenance: 'server-ack',
  acknowledgement: { changed: true, resultingRevision: nextHash },
};
const record = { entity: 'tasks', id: 'task-a', values: { status: 'completed' } };
const result = {
  ok: true, changed: true,
  current: { format: 'planb-task-revision-v1', revision: nextHash, instanceId: identity.instanceId,
    captureId: identity.snapshotId, capturedAt: identity.capturedAt, record },
};
const execution = {
  format: 'planb-task-intent-execution-v1', created: true, replayed: false, operation: confirmed,
  writeResult: result, writeResultOmitted: null,
};

test('execute preserves explicit null and empty identity fields and rejects extra fields', () => {
  assert.deepEqual(TaskIntentExecute.parse(request), request);
  assert.equal(TaskIntentIdentity.safeParse({ ...identity, instanceId: null }).success, false);
  assert.equal(TaskIntentExecute.safeParse({ ...request, credential: 'synthetic-secret' }).success, false);
  assert.equal(TaskIntentExecute.safeParse({ ...request, attemptId: 'task-a' }).success, false);
});

test('patch supports the existing revision contract and enforces aggregate UTF8 request bytes', () => {
  assert.equal(TaskIntentExecute.safeParse({ ...request, values: {} }).success, false);
  assert.equal(TaskIntentExecute.safeParse({ ...request, values: { status: Infinity } }).success, false);
  const large = { ...request, values: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['field' + i, '漢'.repeat(12000)])) };
  assert.ok(taskIntentJsonBytes(large) > TASK_INTENT_REQUEST_BYTES);
  assert.equal(TaskIntentExecute.safeParse(large).success, false);
});

test('summary rejects forged provenance and incompatible phase/outcome', () => {
  assert.equal(TaskIntentSummary.safeParse(pending).success, true);
  assert.equal(TaskIntentSummary.safeParse(confirmed).success, true);
  for (const value of [
    { ...pending, provenance: 'server-ack' }, { ...pending, outcome: 'acknowledged' },
    { ...confirmed, outcome: 'accepted-read' }, { ...confirmed, phase: 'attempt' },
    { ...confirmed, outcome: 'abandoned', provenance: null },
    { ...pending, detailAvailable: false },
  ]) assert.equal(TaskIntentSummary.safeParse(value).success, false);
});

test('execution requires a matching task, copy, revision and compact acknowledgement', () => {
  assert.equal(TaskIntentExecution.safeParse(execution).success, true);
  for (const current of [
    { ...result.current, record: { ...record, id: 'homonym' } },
    { ...result.current, captureId: 'other-copy' },
    { ...result.current, revision: hash },
  ]) assert.equal(TaskIntentExecution.safeParse({ ...execution, writeResult: { ...result, current } }).success, false);
  assert.equal(TaskIntentExecution.safeParse({ ...execution, replayed: true }).success, false);
});

test('large successful record uses an explicit compact receipt without truncating values', () => {
  const bigRecord = { ...record, values: { ...record.values, legacy: 'x'.repeat(600000) } };
  const large = { ...execution, writeResult: { ...result, current: { ...result.current, record: bigRecord } } };
  assert.ok(taskIntentJsonBytes(large) > TASK_INTENT_RESPONSE_BYTES);
  assert.equal(TaskIntentExecution.safeParse(large).success, false);
  const compact = { ...execution, writeResult: null, writeResultOmitted: 'response-too-large' };
  assert.equal(TaskIntentExecution.safeParse(compact).success, true);
  assert.equal(TaskIntentExecution.safeParse({ ...compact, operation: pending }).success, false);
  assert.equal(bigRecord.values.legacy.length, 600000);
});

test('confirmed no-op and replay retain the actual unchanged receipt', () => {
  const value = {
    ...execution, created: false, replayed: true,
    operation: { ...confirmed, acknowledgement: { changed: false, resultingRevision: nextHash } },
    writeResult: { ...result, changed: false },
  };
  assert.equal(TaskIntentExecution.safeParse(value).success, true);
  assert.equal(TaskIntentExecution.safeParse({ ...value, writeResultOmitted: 'not-retained' }).success, false);
});

test('list distinguishes unavailable from empty and rejects cross-context entries and duplicates', () => {
  const list = { format: 'planb-task-intent-list-v1', scope, status: 'read', entries: [], quarantined: 0, otherContexts: 0, nextCursor: null };
  assert.equal(TaskIntentList.safeParse(list).success, true);
  const unavailable = { ...list, status: 'unavailable', quarantined: null, otherContexts: null };
  assert.equal(TaskIntentList.safeParse(unavailable).success, true);
  assert.equal(TaskIntentList.safeParse({ ...unavailable, quarantined: 0 }).success, false);
  assert.equal(TaskIntentList.safeParse({ ...list, entries: [pending, pending] }).success, false);
  assert.equal(TaskIntentList.safeParse({ ...list, entries: [{ ...pending, scope: { ...scope, contextRevision: nextHash } }] }).success, false);
});

test('detail preserves exact base keys and requires an explicit payload omission reason', () => {
  const detail = { format: 'planb-task-intent-detail-v1', operation: pending,
    payload: { baseline: { status: 'open' }, values: request.values, expectedRevision: hash }, payloadIssue: null };
  assert.equal(TaskIntentDetail.safeParse(detail).success, true);
  assert.equal(TaskIntentDetail.safeParse({ ...detail, payload: { ...detail.payload, baseline: { other: 'open' } } }).success, false);
  assert.equal(TaskIntentDetail.safeParse({ ...detail, payload: null }).success, false);
  assert.equal(TaskIntentDetail.safeParse({ ...detail, payload: null, payloadIssue: 'response-too-large' }).success, true);
  assert.equal(TaskIntentDetail.safeParse({ ...detail, operation: { ...confirmed, detailAvailable: false }, payload: null, payloadIssue: 'detail-expired' }).success, true);
});

test('read evidence rejects missing records, another task and false evidence on unreadable payload', () => {
  const check = { format: 'planb-task-intent-check-v1', operation: pending, evidence: 'applied', readAt: at, taskRevision: nextHash, record, reason: null };
  assert.equal(TaskIntentCheck.safeParse(check).success, true);
  assert.equal(TaskIntentCheck.safeParse({ ...check, record: { ...record, id: 'other' } }).success, false);
  assert.equal(TaskIntentCheck.safeParse({ ...check, record: null }).success, false);
  const unavailable = { ...check, evidence: 'unavailable', record: null, taskRevision: null, reason: 'response-too-large' };
  assert.equal(TaskIntentCheck.safeParse(unavailable).success, true);
  assert.equal(TaskIntentCheck.safeParse({ ...unavailable, evidence: 'applied' }).success, false);
});

test('accept and abandon require observed versions and explicit human confirmation', () => {
  assert.equal(TaskIntentAccept.safeParse({ ...scope, expectedSeq: 1, expectedTaskRevision: nextHash }).success, true);
  assert.equal(TaskIntentAccept.safeParse({ ...scope, expectedSeq: 0, expectedTaskRevision: nextHash }).success, false);
  assert.equal(TaskIntentAbandon.safeParse({ ...scope, expectedSeq: 1, confirmed: true }).success, true);
  assert.equal(TaskIntentAbandon.safeParse({ ...scope, expectedSeq: 1, confirmed: false }).success, false);
});

test('expired detail cannot support applied, unchanged or diverged evidence', () => {
  const check = { format: 'planb-task-intent-check-v1',
    operation: { ...confirmed, detailAvailable: false },
    readAt: at, taskRevision: nextHash, record, reason: null };
  for (const evidence of ['applied', 'unchanged', 'diverged'])
    assert.equal(TaskIntentCheck.safeParse({ ...check, evidence }).success, false, evidence);
});

test('expired-detail reason requires metadata saying the detail expired', () => {
  const check = { format: 'planb-task-intent-check-v1', operation: pending,
    evidence: 'unavailable', readAt: at, taskRevision: null, record: null, reason: 'detail-expired' };
  assert.equal(TaskIntentCheck.safeParse(check).success, false);
  assert.equal(TaskIntentCheck.safeParse({ ...check, operation: { ...confirmed, detailAvailable: false } }).success, true);
});

test('other honest read failures remain possible with or without retained detail', () => {
  const check = { format: 'planb-task-intent-check-v1', operation: pending,
    evidence: 'unavailable', readAt: at, taskRevision: null, record: null, reason: 'read-failed' };
  for (const operation of [pending, { ...confirmed, detailAvailable: false }]) {
    for (const reason of ['read-failed', 'response-too-large'])
      assert.equal(TaskIntentCheck.safeParse({ ...check, operation, reason }).success, true, reason);
    assert.equal(TaskIntentCheck.safeParse({ ...check, operation, evidence: 'missing', reason: 'task-missing' }).success, true);
  }
});
