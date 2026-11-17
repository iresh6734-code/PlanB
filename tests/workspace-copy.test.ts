import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from '../shared/fixtures.js';
import { summarizeCapture } from '../server/assessment.js';
import { describeCapture, workspaceCopy } from '../src/app-shell/workspace-copy.js';

const active = { ...makeFixture(), capturedAt: '2026-11-14T09:30:00Z' };
const latest = { ...active, capturedAt: '2026-11-15T10:30:00Z', records: active.records.slice(0, 1) };
function withProof(snapshot: typeof active) {
  const id = snapshot.id + ':' + snapshot.capturedAt;
  return {
    latestCapture: summarizeCapture(id, snapshot),
    readiness: { status: 'passed' as const, captureId: id, reportId: 'report-1', testedAt: snapshot.capturedAt, issues: [] },
  };
}

test('una prueba de otra fecha con el mismo ID de origen no acredita la copia activa', () => {
  const status = withProof(latest);
  const result = workspaceCopy({ snapshot: active, ready: true }, status);
  assert.equal(result.latestIsDifferent, true);
  assert.equal(result.activeId, active.id + ':' + active.capturedAt);
  assert.equal(result.activeReadiness, null);
  assert.equal(result.activeCaptureRecords, null);
  assert.equal(result.latestReadiness, status.readiness);
  assert.equal(result.latest?.records, 1);
  assert.equal(result.latest?.capturedAt, latest.capturedAt);
});

test('solo se atribuye la prueba si la identidad exacta coincide y la copia está activa', () => {
  const status = withProof(active);
  assert.equal(workspaceCopy({ snapshot: active, ready: true }, status).activeReadiness, status.readiness);
  assert.equal(workspaceCopy({ snapshot: active, ready: true }, status).activeCaptureRecords, active.records.length);
  assert.equal(workspaceCopy({ snapshot: active, ready: false }, status).activeReadiness, null);
  assert.equal(workspaceCopy({ snapshot: active, ready: true }, null).activeReadiness, null);
  const misbound = { ...status, readiness: withProof(latest).readiness };
  assert.equal(workspaceCopy({ snapshot: active, ready: true }, misbound).latestReadiness, null);
});

test('la fecha se muestra en Madrid y la antigüedad respeta el umbral de 75 minutos', () => {
  const at = '2026-11-15T09:30:00Z';
  const now = Date.parse(at) + 75 * 60_000;
  const copy = describeCapture(at, now);
  assert.match(copy.date ?? '', /10:30/);
  assert.equal(copy.stale, false);
  assert.equal(describeCapture(at, now + 1).stale, true);
  assert.deepEqual(describeCapture('invalida', now), { date: null, age: null, stale: false });
});
