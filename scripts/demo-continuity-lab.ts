import { evaluateContinuityScenario, type ContinuityLabInput } from '../shared/continuity-lab.js';

// Fictitious inputs only. No files, credentials, servers, provider calls or CRM data are read.
const now = Date.UTC(2026, 9, 29, 12), minute = 60_000;
const scope = { spaceId: 'demo-space', sourceKey: 'demo-source', captureId: 'demo-capture' };
const input: ContinuityLabInput = {
  scope, evaluatedAt: now, scenario: 'crm-outage', outageDurationMs: 8 * 60 * minute,
  objectives: { maxDataAgeMs: 60 * minute, maxRecoveryMs: 15 * minute, maxEvidenceAgeMs: 24 * 60 * minute },
  snapshot: { scope, capturedAt: now - 45 * minute, verifiedAt: now - 44 * minute },
  localRuntime: 'available', recoveryKit: 'available',
  backup: { scope, createdAt: now - 43 * minute, verifiedAt: now - 42 * minute },
  localDrill: { scope, startedAt: now - 40 * minute, completedAt: now - 35 * minute, outcome: 'passed' },
  restoreDrill: null,
  workload: { scope, tasks: [
    { id: 'demo-overdue', dueAt: now - minute, status: 'open' },
    { id: 'demo-today', dueAt: now + 60 * minute, status: 'open' },
    { id: 'demo-undated', dueAt: null, status: 'open' },
  ] },
};
console.log(JSON.stringify({
  synthetic: true,
  scenarios: [
    evaluateContinuityScenario(input),
    evaluateContinuityScenario({ ...input, scenario: 'device-loss' }),
    evaluateContinuityScenario({ ...input, objectives: { ...input.objectives, maxDataAgeMs: 30 * minute } }),
  ],
}, null, 2));
