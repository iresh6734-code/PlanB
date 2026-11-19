import assert from 'node:assert/strict';
import test from 'node:test';
import { fridayCase, fridayObjectives } from '../shared/operational-fixtures.js';
import { explainConflict, planSchedule, whatWouldMakeItWork } from '../shared/operational-planner.js';
import { operationalLimits, operationalModel, type Supposition } from '../shared/operational-twin.js';

test('325 · la falta de horario se propaga al compromiso que depende del trabajo', () => {
  const model = fridayCase('healthy');
  const technician = model.resources.find(resource => resource.id === 'tech-cruz')!;
  technician.windows = { state: 'unknown', reason: 'not-provided' };
  const target = model.jobs.find(job => job.id === 'inst-norte')!;
  const prerequisite = model.jobs.find(job => job.commitmentId === 'c-pedido-sur')!;
  target.dependencies.push({ jobId: prerequisite.id, basis: 'confirmed' });
  const input = operationalModel.parse(model);
  const conflict = explainConflict(input, [], []);
  const conditions = whatWouldMakeItWork(input, [], 'c-inst-norte', [], []);
  assert.deepEqual({
    prerequisite: conflict.indeterminate.some(entry => entry.commitmentId === 'c-pedido-sur'),
    dependent: conflict.indeterminate.some(entry => entry.commitmentId === 'c-inst-norte'),
    conditions: conditions.alreadyWorks,
    conflict: conflict.conflict?.commitmentIds ?? null,
  }, {
    prerequisite: true,
    dependent: true,
    conditions: 'unknown',
    conflict: null,
  });
});

test('325 · un horizonte inferior a un minuto se rechaza en el contrato de entrada', () => {
  const model = fridayCase();
  model.clock.horizonEnd = new Date(Date.parse(model.clock.now) + 30_000).toISOString();
  assert.equal(operationalModel.safeParse(model).success, false);
});

test('325 · el máximo de supuestos admitido permite pedir condiciones sin lanzar ZodError', () => {
  const base = fridayCase();
  const at = base.materials.find(material => material.id === 'mat-bomba')!.availableAt;
  assert.equal(at.state, 'known');
  const scenario: Supposition[] = Array.from({ length: operationalLimits.suppositions }, (_, index) => ({
    id: 'fecha-de-bomba-' + index,
    type: 'material-availability',
    materialId: 'mat-bomba',
    availableAt: at.value,
  }));
  assert.doesNotThrow(() => {
    const result = whatWouldMakeItWork(base, scenario, 'c-inst-norte', ['c-inst-urgente', 'c-pedido-sur'], []);
    assert.equal(result.alreadyWorks, 'no');
  });
});

test('325 · con un minuto exacto el contrato y el planificador aceptan el horizonte', () => {
  const model = fridayCase();
  model.clock.horizonEnd = new Date(Date.parse(model.clock.now) + 60_000).toISOString();
  const input = operationalModel.parse(model);
  assert.equal(planSchedule(input, fridayObjectives).simulation.complete, true);
});

test('325 · invertir el orden de entrada conserva la incertidumbre de una cadena dependiente', () => {
  const model = fridayCase('healthy');
  model.resources.find(resource => resource.id === 'tech-cruz')!.windows = { state: 'unknown', reason: 'not-provided' };
  const target = model.jobs.find(job => job.id === 'inst-norte')!;
  const prerequisite = model.jobs.find(job => job.commitmentId === 'c-pedido-sur')!;
  target.dependencies.push({ jobId: prerequisite.id, basis: 'confirmed' });
  const project = (jobs: typeof model.jobs) => {
    const input = operationalModel.parse({ ...model, jobs });
    const result = planSchedule(input, fridayObjectives);
    const outcome = result.simulation.commitments.find(commitment => commitment.commitmentId === 'c-inst-norte')!;
    return { projection: outcome.projection, causes: outcome.chain.flatMap(step => step.causes.map(cause => cause.code)) };
  };
  for (const jobs of [model.jobs, [...model.jobs].reverse()]) {
    const result = project(jobs);
    assert.equal(result.projection, 'indeterminate');
    assert.ok(result.causes.includes('unknown-capacity'));
    assert.ok(!result.causes.includes('ordering-deadlock'));
  }
});
