import assert from 'node:assert/strict';
import test from 'node:test';
import { commitmentDecisionRequest } from '../shared/commitments.js';
import { fridayCase, fridayObjectives, fridayOptions, fridayPerturbations } from '../shared/operational-fixtures.js';
import { compareAlternatives } from '../shared/operational-planner.js';
import {
  chooseAlternative, createRehearsal, decisionDraft, exportRehearsal, linkDecision, rehearsalRecord, reopenRehearsal, type RehearsalRecord,
} from '../shared/operational-rehearsal.js';
import { OperationalInputError, operationalEngineVersion, operationalRevision, type OperationalModel } from '../shared/operational-twin.js';

const ID = '7b0d8a52-6c1e-4f0a-9a57-2f6f3f1c9d10', OPERATION = '0c9f4a1e-3b7d-4e58-8f21-5a6b7c8d9e0f', OTHER = '11111111-2222-4333-8444-555555555555';
const CONTEXT = 'd'.repeat(64);
const fails = (run: () => unknown, code: string) => assert.throws(run, (error: unknown) => error instanceof OperationalInputError && error.code === code);
function draft(model: OperationalModel = fridayCase()): RehearsalRecord {
  const scenario = [fridayPerturbations.reopen], compared = compareAlternatives(model, scenario, fridayOptions, fridayObjectives);
  return createRehearsal({ id: ID, createdAt: '2026-11-09T07:05:00Z', model, commitmentId: 'c-inst-norte', scenario, options: fridayOptions, objectives: fridayObjectives, alternatives: compared.alternatives });
}
const step = { contextRevision: CONTEXT, operationId: OPERATION, owner: 'Marta (ficción)', nextStep: 'Llamar al almacén Sur y confirmar la bomba equivalente antes de las 12:00.', dueAt: '2026-11-09T11:00:00Z' };

test('un ensayo guarda qué se comparó, sobre qué revisión y con qué motor, y siempre es hipotético', () => {
  const model = fridayCase(), record = draft(model);
  assert.deepEqual([record.format, record.kind, record.hypothetical, record.engineVersion], ['planb-operational-rehearsal-v1', 'rehearsal', true, operationalEngineVersion]);
  assert.deepEqual([record.baseRevision, record.evaluatedAt], [operationalRevision(model), model.clock.now]);
  assert.deepEqual(record.focus, { commitmentId: 'c-inst-norte', commitmentRevision: model.commitments[0].revision });
  assert.deepEqual(record.compared.map(item => item.alternativeId), ['alt-sin-cambios', 'alt-o-extra-cruz', 'alt-o-bomba-alt', 'alt-o-mover-norte', 'alt-o-dividir-norte']);
  assert.ok(record.compared.every(item => item.optimality === 'proven-within-model'));
  assert.deepEqual([record.chosen, record.decision], [null, null]);
  // Exportar y reabrir conserva todo; un registro sin la marca de hipótesis no es un ensayo.
  const exported = exportRehearsal(record), reopened = reopenRehearsal(JSON.parse(exported), model);
  assert.deepEqual(reopened.record, record);
  assert.deepEqual([reopened.state, reopened.reasons, reopened.canConfirm, reopened.status], ['current', [], false, 'simulation-only']);
  for (const tamper of [{ hypothetical: false }, { kind: 'decision' }, { hypothetical: undefined }, { baseRevision: 'abc' }, { extra: 1 }]) {
    assert.equal(rehearsalRecord.safeParse({ ...JSON.parse(exported), ...tamper }).success, false, JSON.stringify(tamper));
  }
  fails(() => createRehearsal({ id: ID, createdAt: '2026-11-09T07:05:00Z', model, commitmentId: 'no-existe', scenario: [], options: [], objectives: fridayObjectives, alternatives: [] }), 'unknown-target');
});

test('elegir, preparar UNA decisión con el contrato de compromisos y anotar la aceptada', () => {
  const model = fridayCase(), record = draft(model);
  fails(() => decisionDraft(record, model, step), 'not-confirmable');
  fails(() => chooseAlternative(record, 'alt-inventada'), 'unknown-target');
  const chosen = chooseAlternative(record, 'alt-o-bomba-alt');
  assert.deepEqual(chosen.chosen, { alternativeId: 'alt-o-bomba-alt', suppositionIds: ['o-bomba-alt'] });
  assert.equal(record.chosen, null, 'elegir devuelve un registro nuevo');
  assert.equal(reopenRehearsal(chosen, model).canConfirm, true);
  assert.deepEqual(chooseAlternative(chosen, null).chosen, null);

  const request = decisionDraft(chosen, model, step);
  assert.deepEqual(request, { contextRevision: CONTEXT, expectedRevision: model.commitments[0].revision, operationId: OPERATION, decision: { type: 'assign', owner: step.owner, nextStep: step.nextStep, dueAt: step.dueAt } });
  assert.ok(commitmentDecisionRequest.safeParse(request).success, 'es una petición válida del contrato existente, de un solo compromiso');
  assert.equal(JSON.stringify(decisionDraft(chosen, model, step)), JSON.stringify(request), 'preparar no cambia nada: se puede repetir');
  assert.throws(() => decisionDraft(chosen, model, { ...step, nextStep: '   ' }));

  const accepted = { operationId: OPERATION, commitmentId: 'c-inst-norte', expectedRevision: model.commitments[0].revision };
  const linked = linkDecision(chosen, accepted);
  assert.deepEqual(linked.decision, accepted);
  // Repetir la misma anotación no crea un segundo efecto; otra decisión distinta se rechaza.
  assert.equal(linkDecision(linked, accepted), linked);
  fails(() => linkDecision(linked, { ...accepted, operationId: OTHER }), 'decision-recorded');
  fails(() => chooseAlternative(linked, 'alt-o-mover-norte'), 'decision-recorded');
  fails(() => decisionDraft(linked, model, step), 'not-confirmable');
  fails(() => linkDecision(record, accepted), 'not-confirmable');
  fails(() => linkDecision(chosen, { ...accepted, expectedRevision: 'e'.repeat(64) }), 'stale-rehearsal');
  // Simulación, decisión y resultado observado no se confunden: el registro sigue siendo un ensayo hipotético con una referencia a la decisión.
  const view = reopenRehearsal(JSON.parse(exportRehearsal(linked)), model);
  assert.deepEqual([view.status, view.canConfirm, view.record.hypothetical, view.record.kind], ['decision-recorded', false, true, 'rehearsal']);
  assert.ok(!('observed' in view.record) && !('outcome' in view.record));
});

test('una revisión nueva vuelve histórico el ensayo: conserva lo comparado y ya no sirve para confirmar', () => {
  const model = fridayCase(), chosen = chooseAlternative(draft(model), 'alt-o-mover-norte'), stored = exportRehearsal(chosen);
  // El material llegó antes de lo observado: cambia la revisión del modelo.
  const changed = structuredClone(model);
  changed.materials[0].availableAt = { ...changed.materials[0].availableAt, value: '2026-11-11T07:00:00Z' } as typeof changed.materials[0]['availableAt'];
  const stale = reopenRehearsal(JSON.parse(stored), changed);
  assert.deepEqual([stale.state, stale.reasons, stale.canConfirm], ['historical', ['base-revision-changed'], false]);
  assert.deepEqual(stale.record, chosen, 'lo que la persona comparaba se conserva íntegro');
  fails(() => decisionDraft(chosen, changed, step), 'stale-rehearsal');

  const newCommitment = structuredClone(model);
  newCommitment.commitments[0].revision = 'f'.repeat(64);
  assert.deepEqual(reopenRehearsal(chosen, newCommitment).reasons, ['base-revision-changed', 'commitment-revision-changed']);
  const gone = structuredClone(model);
  gone.jobs = gone.jobs.filter(job => job.commitmentId !== 'c-inst-norte');
  gone.commitments = gone.commitments.filter(item => item.id !== 'c-inst-norte');
  gone.currentPlan = null;
  assert.deepEqual(reopenRehearsal(chosen, gone).reasons, ['base-revision-changed', 'commitment-missing']);
  assert.deepEqual(reopenRehearsal({ ...chosen, engineVersion: 'planb-operational-engine-0.0.9' }, model).reasons, ['engine-version-changed']);
  // Reabrir contra el modelo vigente original sigue siendo vigente, y reabrir no altera el registro guardado.
  assert.equal(reopenRehearsal(JSON.parse(stored), model).state, 'current');
  assert.equal(exportRehearsal(reopenRehearsal(JSON.parse(stored), changed).record), stored);
});
