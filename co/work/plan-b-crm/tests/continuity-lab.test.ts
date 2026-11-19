import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContinuityScenario as evaluate, type ContinuityLabInput } from '../shared/continuity-lab.js';

const minute = 60_000, now = Date.UTC(2026, 9, 29, 12);
function fixture(): ContinuityLabInput {
  const scope = { spaceId: 'synthetic-space', sourceKey: 'synthetic-source', captureId: 'synthetic-capture' };
  return {
    scope, evaluatedAt: now, scenario: 'crm-outage', outageDurationMs: 8 * 60 * minute,
    objectives: { maxDataAgeMs: 60 * minute, maxRecoveryMs: 10 * minute, maxEvidenceAgeMs: 24 * 60 * minute },
    snapshot: { scope: { ...scope }, capturedAt: now - 60 * minute, verifiedAt: now - 59 * minute },
    localRuntime: 'available', recoveryKit: 'available',
    backup: { scope: { ...scope }, createdAt: now - 58 * minute, verifiedAt: now - 57 * minute },
    localDrill: { scope: { ...scope }, startedAt: now - 55 * minute, completedAt: now - 45 * minute, outcome: 'passed' },
    restoreDrill: { scope: { ...scope }, startedAt: now - 30 * minute, completedAt: now - 25 * minute, outcome: 'passed' },
    workload: { scope: { ...scope }, tasks: [] },
  };
}

test('same evidence yields deterministic results without modifying frozen inputs', () => {
  const input = fixture();
  const freeze = (value: any) => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); };
  freeze(input);
  const a = evaluate(input), b = evaluate(input);
  assert.deepEqual(a, b); assert.equal(a.status, 'ready'); assert.equal(a.snapshotAgeMs, 60 * minute);
  assert.equal(a.measuredRecoveryMs, 10 * minute); assert.deepEqual(a.nextActions, []);
  a.scope.spaceId = 'changed-result'; assert.equal(input.scope.spaceId, 'synthetic-space');
});

test('older snapshot and longer measured drill miss independent objectives', () => {
  const input = fixture(); input.objectives.maxDataAgeMs--; input.objectives.maxRecoveryMs--;
  const result = evaluate(input); assert.equal(result.status, 'at-risk');
  assert.deepEqual(result.checks.filter(c => c.status === 'fail').map(c => c.code), ['data-age', 'recovery-time']);
  assert.equal(result.nextActions.length, 2);
});

test('unavailable runtime blocks, unknown runtime cannot claim readiness', () => {
  const input = fixture(); input.localRuntime = 'unavailable'; assert.equal(evaluate(input).status, 'blocked');
  input.localRuntime = 'unknown'; assert.equal(evaluate(input).status, 'unproven');
});

test('missing evidence remains unknown rather than reporting a zero recovery time or zero tasks', () => {
  const input = fixture(); input.snapshot = null; input.localDrill = null; input.workload = null;
  const result = evaluate(input); assert.equal(result.status, 'unproven');
  assert.equal(result.snapshotAgeMs, null); assert.equal(result.measuredRecoveryMs, null); assert.equal(result.exposure, null);
});

for (const key of ['spaceId', 'sourceKey', 'captureId'] as const) {
  test('evidence from another ' + key + ' cannot make this snapshot ready', () => {
    for (const field of ['snapshot', 'localDrill', 'workload'] as const) {
      const input = fixture(); input[field]!.scope[key] = 'another';
      const result = evaluate(input); assert.equal(result.status, 'unproven', field);
      if (field === 'snapshot') assert.equal(result.snapshotAgeMs, null);
      if (field === 'localDrill') assert.equal(result.measuredRecoveryMs, null);
      if (field === 'workload') assert.equal(result.exposure, null);
    }
  });
}

test('future capture, verification before capture and future verification cannot count as evidence', () => {
  for (const mutation of [
    (i: ContinuityLabInput) => { i.snapshot!.capturedAt = now + 1; },
    (i: ContinuityLabInput) => { i.snapshot!.verifiedAt = i.snapshot!.capturedAt - 1; },
    (i: ContinuityLabInput) => { i.snapshot!.verifiedAt = now + 1; },
  ]) {
    const input = fixture(); mutation(input); const result = evaluate(input);
    assert.equal(result.status, 'unproven'); assert.equal(result.snapshotAgeMs, null); assert.equal(result.measuredRecoveryMs, null);
  }
});

test('drill must follow verification, finish coherently and remain within evidence lifetime', () => {
  for (const mutation of [
    (i: ContinuityLabInput) => { i.localDrill!.startedAt = i.snapshot!.verifiedAt - 1; },
    (i: ContinuityLabInput) => { i.localDrill!.completedAt = i.localDrill!.startedAt - 1; },
    (i: ContinuityLabInput) => { i.localDrill!.completedAt = now + 1; },
    (i: ContinuityLabInput) => { i.objectives.maxEvidenceAgeMs = now - i.localDrill!.completedAt - 1; },
  ]) {
    const input = fixture(); mutation(input); const result = evaluate(input);
    assert.equal(result.status, 'unproven'); assert.equal(result.measuredRecoveryMs, null);
  }
  const boundary = fixture(); boundary.objectives.maxEvidenceAgeMs = now - boundary.localDrill!.completedAt;
  assert.equal(evaluate(boundary).status, 'ready');
});

test('failed applicable drill blocks even when another check is unknown', () => {
  const input = fixture(); input.localDrill!.outcome = 'failed'; input.workload = null;
  const result = evaluate(input); assert.equal(result.status, 'blocked'); assert.equal(result.measuredRecoveryMs, null);
});

test('device-loss requires restoration evidence; local drill success alone is insufficient', () => {
  const input = fixture(); input.scenario = 'device-loss'; input.localRuntime = 'unavailable';
  assert.equal(evaluate(input).status, 'ready'); assert.equal(evaluate(input).measuredRecoveryMs, 5 * minute);
  input.restoreDrill = null; assert.equal(evaluate(input).status, 'unproven');
  input.recoveryKit = 'unavailable'; assert.equal(evaluate(input).status, 'blocked');
});

test('restore cannot predate backup verification or use backup from another capture', () => {
  for (const mutation of [
    (i: ContinuityLabInput) => { i.restoreDrill!.startedAt = i.backup!.verifiedAt - 1; },
    (i: ContinuityLabInput) => { i.backup!.scope.captureId = 'older-capture'; },
    (i: ContinuityLabInput) => { i.backup = null; },
    (i: ContinuityLabInput) => { i.backup!.createdAt = i.snapshot!.capturedAt - 1; },
    (i: ContinuityLabInput) => { i.backup!.verifiedAt = now + 1; },
    (i: ContinuityLabInput) => { i.backup!.verifiedAt = i.backup!.createdAt - 1; },
  ]) {
    const input = fixture(); input.scenario = 'device-loss'; mutation(input);
    assert.equal(evaluate(input).status, 'unproven'); assert.equal(evaluate(input).measuredRecoveryMs, null);
  }
});

test('outage exposure separates overdue, due during outage, undated and finished tasks at exact boundaries', () => {
  const input = fixture(), end = now + input.outageDurationMs;
  input.workload!.tasks = [
    { id: 'overdue', status: 'open', dueAt: now - 1 },
    { id: 'start', status: 'open', dueAt: now },
    { id: 'end', status: 'open', dueAt: end },
    { id: 'after', status: 'open', dueAt: end + 1 },
    { id: 'undated', status: 'open', dueAt: null },
    { id: 'done', status: 'done', dueAt: now },
  ];
  assert.deepEqual(evaluate(input).exposure, { overdueTasks: 1, tasksDueDuringOutage: 2, tasksWithoutDate: 1, openTasks: 5 });
  input.outageDurationMs++;
  assert.equal(evaluate(input).exposure!.tasksDueDuringOutage, 3);
});

test('explicit empty inventory differs from missing inventory', () => {
  const input = fixture(); assert.equal(evaluate(input).exposure!.openTasks, 0);
  input.workload = null; assert.equal(evaluate(input).exposure, null); assert.equal(evaluate(input).status, 'unproven');
});

test('malformed numeric values, unsupported scenarios and empty identities are rejected', () => {
  for (const bad of [NaN, Infinity, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    const input = fixture(); input.evaluatedAt = bad; assert.throws(() => evaluate(input), RangeError);
  }
  const zero = fixture(); zero.objectives.maxRecoveryMs = 0; assert.throws(() => evaluate(zero), RangeError);
  const duration = fixture(); duration.outageDurationMs = 31 * 86_400_000; assert.throws(() => evaluate(duration), RangeError);
  const invalid = fixture(); invalid.scenario = 'anything' as any; assert.throws(() => evaluate(invalid), TypeError);
  const identity = fixture(); identity.scope.spaceId = ' '; assert.throws(() => evaluate(identity), TypeError);
});

test('duplicate tasks, invalid dates and excessive inventory cannot inflate results', () => {
  const input = fixture(); input.workload!.tasks = [{ id: 'one', status: 'open', dueAt: null }, { id: 'one', status: 'done', dueAt: null }];
  assert.throws(() => evaluate(input), TypeError);
  input.workload!.tasks = [{ id: 'one', status: 'open', dueAt: NaN }]; assert.throws(() => evaluate(input), RangeError);
  input.workload!.tasks = Array.from({ length: 10_001 }, (_, n) => ({ id: String(n), status: 'open', dueAt: null }));
  assert.throws(() => evaluate(input), RangeError);
});

test('every non-passing check has a concrete next step and results explain inference limits', () => {
  const input = fixture(); input.snapshot = null; input.recoveryKit = 'unknown'; input.scenario = 'device-loss';
  const result = evaluate(input);
  assert.ok(result.checks.filter(c => c.status !== 'pass').every(c => c.nextAction));
  assert.ok(result.limitations.some(s => s.includes('no equivale a pérdida')));
  assert.ok(result.limitations.some(s => s.includes('no garantiza')));
});
