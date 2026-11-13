import assert from 'node:assert/strict';
import test from 'node:test';
import { fridayCase, fridayObjectives, fridayOptions } from '../shared/operational-fixtures.js';
import { compareOptionsLarge, focusConflict, projectModel } from '../shared/operational-large.js';
import { explainConflict } from '../shared/operational-planner.js';
import { whatToCheckFirst, type Hypothesis } from '../shared/operational-sensitivity.js';
import { operationalLimits, operationalModel, type Supposition } from '../shared/operational-twin.js';

const focusId = 'c-inst-norte';
const materialHypothesis: Hypothesis = {
  id: 'fecha-de-bomba',
  question: '¿Cuándo llega la bomba?',
  target: { type: 'material-availability', materialId: 'mat-bomba' },
  values: ['2026-11-10T07:00:00Z', '2026-11-13T07:00:00Z'],
};
const scenarioAtLimit: Supposition[] = Array.from({ length: operationalLimits.suppositions }, (_, index) => ({
  id: 'bomba-' + index,
  type: 'material-availability',
  materialId: 'mat-bomba',
  availableAt: '2026-11-12T07:00:00Z',
}));

test('330 · un compromiso indeterminado impide afirmar que todo encaja', () => {
  const model = fridayCase('healthy');
  model.jobs.find(job => job.id === 'cuadro-este')!.duration = { state: 'unknown', reason: 'not-provided' };
  const result = focusConflict(operationalModel.parse(model), [], focusId, []);
  const projections = Object.fromEntries(result.plan.simulation.commitments.map(row => [row.commitmentId, row.projection]));
  assert.equal(projections[focusId], 'on-time');
  assert.equal(projections['c-cuadro-este'], 'indeterminate');
  assert.notEqual(result.verdict, 'fits-with-everything');
});

test('330 · la inviabilidad de un compromiso se prueba aunque no haya rivales', () => {
  const model = projectModel(fridayCase('healthy'), [focusId]);
  model.commitments[0]!.dueAt = model.clock.now;
  const input = operationalModel.parse(model);
  const exact = explainConflict(input, [], []);
  assert.equal(exact.feasible, 'no');
  assert.deepEqual(exact.conflict?.commitmentIds, [focusId]);
  assert.equal(exact.conflict?.minimality, 'verified-irreducible');
  const result = focusConflict(input, [], focusId, []);
  assert.equal(result.verdict, 'conflict');
  assert.deepEqual(result.conflict?.conflict?.commitmentIds, [focusId]);
  assert.equal(result.includesFocus, true);
});

test('330 · el límite de supuestos deja la opción sin explorar y no afirma una comparación probada', () => {
  const result = compareOptionsLarge(fridayCase(), scenarioAtLimit, [fridayOptions[1]!], fridayObjectives);
  assert.equal(result.baseline.search.complete, true, 'el plan base sí se examinó');
  assert.deepEqual(result.discarded, [{ suppositionIds: [fridayOptions[1]!.id], reason: 'not-explored' }]);
  assert.equal(result.optimality, 'best-found');
});

test('330 · no hay prueba de sensibilidad si el límite impide evaluar todos los valores', () => {
  const result = whatToCheckFirst(fridayCase(), scenarioAtLimit, [{ id: 'actual', suppositions: [] }], fridayObjectives, [materialHypothesis]);
  const cells = result.ranking.flatMap(row => row.byValue.flatMap(value => value.cells));
  assert.equal(cells.length, 2);
  assert.ok(cells.every(cell => cell.key === null && !cell.proven));
  assert.equal(result.optimality, 'best-found');
  assert.equal(result.mostDecisive, null);
});

test('330 · los controles completos conservan viabilidad y prueba de sensibilidad', () => {
  const model = fridayCase('healthy');
  assert.equal(focusConflict(model, [], focusId, []).verdict, 'fits-with-everything');
  const result = whatToCheckFirst(model, [], [{ id: 'actual', suppositions: [] }], fridayObjectives, [materialHypothesis]);
  const cells = result.ranking.flatMap(row => row.byValue.flatMap(value => value.cells));
  assert.ok(cells.every(cell => cell.applicable && cell.proven && cell.key !== null));
  assert.equal(result.optimality, 'proven-within-model');
});
