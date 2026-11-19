import assert from 'node:assert/strict';
import test from 'node:test';
import { compareAlternatives, whatWouldMakeItWork } from '../shared/operational-planner.js';
import { chooseAlternative, createRehearsal, decisionDraft, reopenRehearsal } from '../shared/operational-rehearsal.js';
import { servicesObjectives, servicesOptions, servicesWeek } from '../shared/operational-services.js';
import { operationalModel, type Supposition } from '../shared/operational-twin.js';

const web = 'h-web-a';
const approval = 'in-aprobacion-a';
const due = '2026-11-13T16:00:00.000Z';

function earlierApproval(availableAt: string): Supposition {
  return { id: 'approval-379', type: 'material-availability', materialId: approval, availableAt };
}

test('379 · la última aprobación demostrable deja cuatro horas exactas para QA', () => {
  const model = servicesWeek();
  const lastPossible = '2026-11-11T14:00:00Z';
  const oneMinuteLater = '2026-11-11T14:01:00Z';
  // Con 14 h de desarrollo, quedan 2 h el miércoles, 8 el jueves y 4 el viernes.
  // Las 4 h de QA ocupan el resto del viernes. Aquí se ensaya el límite por ambos lados.
  const questions = whatWouldMakeItWork(model, [], web, [], servicesOptions);
  const deadline = questions.conditions.find(item => item.type === 'material-by' && item.materialId === approval);
  assert.ok(deadline && deadline.type === 'material-by');
  assert.equal(Date.parse(deadline.latestAt), Date.parse(lastPossible));
  assert.equal(deadline.proven, true);

  const atLimit = compareAlternatives(model, [earlierApproval(lastPossible)], [], servicesObjectives);
  assert.equal(atLimit.search.complete, true);
  const onTime = atLimit.alternatives[0].result.simulation.commitments.find(item => item.commitmentId === web);
  assert.equal(onTime?.projection, 'on-time');
  assert.equal(onTime?.completionAt, due);

  const missed = whatWouldMakeItWork(model, [earlierApproval(oneMinuteLater)], web, [], []);
  assert.equal(missed.search.complete, true);
  assert.equal(missed.alreadyWorks, 'no');
});

test('379 · cambiar solo la fecha del hito no sustituye una aprobación desconocida', () => {
  const fixture = servicesWeek();
  const model = operationalModel.parse({
    ...fixture,
    materials: fixture.materials.map(item => item.id === approval
      ? { ...item, availableAt: { state: 'unknown', reason: 'not-provided' } }
      : item),
  });
  const move = servicesOptions.find(option => option.type === 'move-due');
  assert.ok(move);
  const result = whatWouldMakeItWork(model, [move], web, [], []);
  assert.equal(result.alreadyWorks, 'unknown');
  assert.ok(result.missingData.some(cause => cause.code === 'unknown-material' && cause.materialId === approval));
  assert.deepEqual(result.conditions, []);
});

test('379 · la revisión de un insumo vuelve histórico el ensayo elegido', () => {
  const model = servicesWeek();
  const { alternatives } = compareAlternatives(model, [], servicesOptions, servicesObjectives);
  const rehearsal = chooseAlternative(createRehearsal({
    id: '7aac0a18-352b-4686-8091-e41660af078e',
    createdAt: '2026-11-09T08:10:00Z',
    model,
    commitmentId: web,
    scenario: [],
    options: servicesOptions,
    objectives: servicesObjectives,
    alternatives,
  }), 'alt-o-maqueta-previa');
  assert.equal(reopenRehearsal(rehearsal, model).canConfirm, true);

  const updated = operationalModel.parse({
    ...model,
    materials: model.materials.map(item => item.id === approval && item.availableAt.state === 'known'
      ? { ...item, availableAt: { ...item.availableAt, value: '2026-11-11T14:00:00Z' } }
      : item),
  });
  assert.deepEqual(updated.commitments, model.commitments);
  const reopened = reopenRehearsal(rehearsal, updated);
  assert.equal(reopened.state, 'historical');
  assert.deepEqual(reopened.reasons, ['base-revision-changed']);
  assert.equal(reopened.canConfirm, false);
  assert.throws(() => decisionDraft(rehearsal, updated, {
    contextRevision: 'a'.repeat(64),
    operationId: '6c98d35b-b79f-4543-8a9e-d4c44c7569c4',
    owner: 'Inés (ficción)',
    nextStep: 'Confirmar disponibilidad.',
    dueAt: '2026-11-09T15:00:00Z',
  }), /ensayo es histórico/);
});
