import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planLarge } from '../shared/operational-large.js';
import { compareAlternatives, explainConflict, planSchedule, whatWouldMakeItWork } from '../shared/operational-planner.js';
import { traceViolations } from '../shared/operational-properties.js';
import { chooseAlternative, createRehearsal, decisionDraft, reopenRehearsal } from '../shared/operational-rehearsal.js';
import { whatToCheckFirst } from '../shared/operational-sensitivity.js';
import { servicesHypotheses, servicesObjectives, servicesOptions, servicesWeek } from '../shared/operational-services.js';
import { simulatePlan } from '../shared/operational-simulation.js';
import { applySuppositions, operationalModel, operationalRevision } from '../shared/operational-twin.js';
import { oracleBestKey } from './operational-oracle.js';

const projections = (result: { commitments: { commitmentId: string; projection: string }[] }) => Object.fromEntries(result.commitments.map(item => [item.commitmentId, item.projection]));

test('el segundo caso usa el mismo contrato y no importa nada que no sea la API pública del núcleo', () => {
  const model = servicesWeek();
  assert.ok(operationalModel.safeParse(model).success);
  assert.deepEqual([model.resources.length, model.jobs.length, model.commitments.length, model.materials.length], [3, 7, 4, 3]);
  assert.ok(model.resources.every(item => item.kind === 'person') && model.jobs.every(job => job.kind === 'task'), 'vocabulario de servicios, no de instalaciones');
  const source = fs.readFileSync(new URL('../shared/operational-services.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from '(.+?)'/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./operational-twin.js', './operational-planner.js', './operational-sensitivity.js']);
  assert.ok(!/function\s+(simulate|plan|search|place)/.test(source), 'la fixture no reimplementa el motor');
});

test('plan declarado: el lanzamiento de la web no llega porque la aprobación del cliente llega el jueves', () => {
  const model = servicesWeek(), result = simulatePlan(model, model.currentPlan!.plan);
  assert.deepEqual(traceViolations(model, result), []);
  assert.deepEqual(projections(result), { 'h-web-a': 'late', 'h-informe-b': 'on-time', 'h-migracion-c': 'indeterminate', 'h-soporte-d': 'on-time' });
  const web = result.commitments[0];
  assert.equal(web.completionAt, '2026-11-16T10:00:00.000Z');
  assert.deepEqual(web.chain.map(step => [step.jobId, step.boundBy]), [['a-qa', [{ code: 'dependency', jobId: 'a-desarrollo' }]], ['a-desarrollo', [{ code: 'material', materialId: 'in-aprobacion-a' }]]]);
  // Los accesos sin confirmar no se dan por disponibles: la migración queda indeterminada.
  assert.deepEqual(result.commitments[2].causes, [{ code: 'unknown-material', materialId: 'in-accesos-c' }]);
});

test('conflicto de un solo compromiso, alternativas y condiciones salen del mismo motor', () => {
  const model = servicesWeek(), revision = operationalRevision(model);
  const conflict = explainConflict(model, [], servicesOptions);
  assert.deepEqual([conflict.feasible, conflict.conflict!.commitmentIds, conflict.conflict!.minimality, conflict.conflict!.materials], ['no', ['h-web-a'], 'verified-irreducible', ['in-aprobacion-a']]);
  assert.deepEqual(conflict.indeterminate.map(item => item.commitmentId), ['h-migracion-c']);
  assert.deepEqual(conflict.relaxations.map(item => `${item.supposition.id}:${item.effect}`), ['o-horas-omar:resolves', 'o-maqueta-previa:resolves', 'o-mover-web:resolves', 'o-repartir-desarrollo:resolves']);
  assert.deepEqual(conflict.dueChanges, [{ commitmentId: 'h-web-a', neededDueAt: '2026-11-16T10:00:00.000Z', minutesBeyondDue: 3960, proven: true }]);

  const alternatives = compareAlternatives(model, [], servicesOptions, servicesObjectives);
  assert.deepEqual(alternatives.alternatives.map(item => [item.id, item.result.key.missedByTier[0], Object.values(item.costs).join()]), [
    ['alt-sin-cambios', 1, '0,0,0,0'], ['alt-o-horas-omar', 0, '120,0,0,0'], ['alt-o-maqueta-previa', 0, '0,0,1,0'], ['alt-o-mover-web', 0, '0,1,0,0'], ['alt-o-repartir-desarrollo', 0, '0,0,0,1'],
  ]);
  assert.ok(alternatives.search.complete);
  for (const item of alternatives.alternatives) {
    const branch = item.suppositionIds.length ? applySuppositions(model, servicesOptions.filter(option => item.suppositionIds.includes(option.id))) : model;
    assert.deepEqual(traceViolations(branch, item.result.simulation), [], item.id);
  }
  const conditions = whatWouldMakeItWork(model, [], 'h-web-a', [], servicesOptions);
  assert.deepEqual(conditions.conditions.find(item => item.type === 'material-by'), { type: 'material-by', materialId: 'in-aprobacion-a', latestAt: '2026-11-11T14:00:00.000Z', currentAt: '2026-11-12T08:00:00.000Z', proven: true });
  assert.equal(operationalRevision(model), revision);
});

test('el planificador coincide con el oráculo exhaustivo también en este caso', () => {
  // El oráculo necesita datos conocidos: se ensaya con los accesos disponibles el lunes o el jueves.
  for (const availableAt of ['2026-11-09T08:00:00Z', '2026-11-12T08:00:00Z']) for (const extra of [[], [servicesOptions[0]], [servicesOptions[3]]]) {
    const model = applySuppositions(servicesWeek(), [{ id: 'h-accesos', type: 'material-availability', materialId: 'in-accesos-c', availableAt }, ...extra]);
    for (const objectives of [servicesObjectives, { tiers: [] }, { tiers: [['h-migracion-c'], ['h-web-a']] }]) {
      const result = planSchedule(model, objectives), viaLarge = planLarge(model, objectives);
      assert.ok(result.search.complete);
      assert.deepEqual([...result.key.missedByTier, result.key.penaltyMinutes], oracleBestKey(model, objectives.tiers).key, `${availableAt} ${extra.map(item => item.id)} ${JSON.stringify(objectives.tiers)}`);
      assert.deepEqual(viaLarge.key, result.key);
    }
  }
});

test('qué comprobar antes de decidir y registro de ensayo, sin cambios en el núcleo', () => {
  const model = servicesWeek();
  const considered = [{ id: 'sin-cambios', suppositions: [] }, ...servicesOptions.map(option => ({ id: option.id, suppositions: [option] }))];
  const sensitivity = whatToCheckFirst(model, [], considered, servicesObjectives, servicesHypotheses);
  // Si el cliente aprueba el miércoles, no hace falta hacer nada; si aprueba el jueves, hay que elegir una respuesta. Los accesos de C no cambian esta decisión.
  assert.deepEqual([sensitivity.mostDecisive, sensitivity.optimality], ['aprobacion-a', 'proven-within-model']);
  assert.deepEqual(sensitivity.ranking.map(row => [row.hypothesisId, row.decisionChanges]), [['aprobacion-a', true], ['accesos-c', false]]);
  assert.ok(sensitivity.ranking[0].byValue[0].best.includes('sin-cambios') && !sensitivity.ranking[0].byValue[1].best.includes('sin-cambios'));

  const compared = compareAlternatives(model, [], servicesOptions, servicesObjectives);
  const record = chooseAlternative(createRehearsal({
    id: '3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a', createdAt: '2026-11-09T08:10:00Z', model, commitmentId: 'h-web-a', scenario: [], options: servicesOptions, objectives: servicesObjectives, alternatives: compared.alternatives,
  }), 'alt-o-maqueta-previa');
  assert.deepEqual([record.hypothetical, reopenRehearsal(record, model).canConfirm], [true, true]);
  const request = decisionDraft(record, model, { contextRevision: 'a'.repeat(64), operationId: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', owner: 'Inés (ficción)', nextStep: 'Pedir al cliente A que confirme que vale la maqueta anterior.', dueAt: '2026-11-09T15:00:00Z' });
  assert.deepEqual([request.decision.type, request.expectedRevision], ['assign', model.commitments[0].revision]);
});
