import assert from 'node:assert/strict';
import test from 'node:test';
import { fridayCase, fridayObjectives, fridayOptions, fridayPerturbations } from '../shared/operational-fixtures.js';
import { planSchedule } from '../shared/operational-planner.js';
import { comparePlans, simulatePlan, type SimulationResult } from '../shared/operational-simulation.js';
import { OperationalInputError, applySuppositions, operationalRevision, type OperationalModel, type OperationalPlan, type TwinModel } from '../shared/operational-twin.js';

const clone = <T>(value: T): T => structuredClone(value);
const current = (model: TwinModel) => simulatePlan(model, model.currentPlan!.plan);
const commitment = (result: SimulationResult, id: string) => result.commitments.find(item => item.commitmentId === id)!;
const outcome = (result: SimulationResult, id: string) => result.jobs.find(item => item.jobId === id)!;
const edit = (change: (model: any) => void, variant: 'infeasible' | 'healthy' = 'infeasible'): OperationalModel => { const model = clone(fridayCase(variant)); change(model); return model; };
const job = (model: any, id: string) => model.jobs.find((item: { id: string }) => item.id === id);

// Invariantes comprobados sobre la TRAZA, no sobre el estado interno del motor.
function assertTraceInvariants(model: TwinModel, result: SimulationResult) {
  const now = Date.parse(model.clock.now), minute = (iso: string) => (Date.parse(iso) - now) / 60_000;
  const busy = new Map<string, string | null>();
  result.events.forEach((event, at) => {
    assert.equal(event.seq, at);
    if (at) assert.ok(result.events[at - 1].minute <= event.minute, 'los eventos avanzan en el tiempo');
    if (event.type === 'job-start') { assert.equal(busy.get(event.resourceId!) ?? null, null, `${event.resourceId} ocupa dos trabajos a la vez`); busy.set(event.resourceId!, event.jobId!); }
    if (event.type === 'job-resume' || event.type === 'job-interrupt') assert.equal(busy.get(event.resourceId!), event.jobId);
    if (event.type === 'job-finish') { assert.equal(busy.get(event.resourceId!), event.jobId); busy.set(event.resourceId!, null); }
  });
  for (const item of result.jobs) {
    if (item.startMinute === null) { assert.notEqual(item.status, 'finished'); continue; }
    const source = model.jobs.find(entry => entry.id === item.jobId)!, resource = model.resources.find(entry => entry.id === item.resourceId)!;
    for (const materialId of source.materials) {
      const fact = model.materials.find(entry => entry.id === materialId)!.availableAt;
      assert.equal(fact.state, 'known', 'material sin fecha conocida no habilita un trabajo');
      if (fact.state === 'known') assert.ok(minute(fact.value) <= item.startMinute, `${item.jobId} empieza antes de tener ${materialId}`);
    }
    for (const dependency of source.dependencies) if (dependency.basis !== 'candidate') {
      const before = result.jobs.find(entry => entry.jobId === dependency.jobId)!;
      assert.ok(before.finishMinute !== null && before.finishMinute <= item.startMinute, `${item.jobId} empieza antes de terminar ${dependency.jobId}`);
    }
    assert.ok(source.skills.every(skill => resource.skills.includes(skill)));
    assert.equal(resource.windows.state, 'known');
    if (resource.windows.state === 'known') assert.ok(resource.windows.value.some(value => minute(value.start) <= item.startMinute! && item.startMinute! < minute(value.end)), `${item.jobId} empieza fuera de franja`);
    if (source.earliestStart) assert.ok(minute(source.earliestStart) <= item.startMinute);
    if (item.finishMinute !== null && source.duration.state === 'known' && source.travel.state === 'known') assert.ok(item.finishMinute - item.startMinute >= source.duration.value + source.travel.value);
  }
  for (const item of result.commitments) {
    assert.ok(['on-time', 'late', 'not-completed', 'indeterminate'].includes(item.projection));
    if (item.projection === 'on-time') assert.ok(model.jobs.filter(entry => entry.commitmentId === item.commitmentId).every(entry => outcome(result, entry.id).status === 'finished'));
  }
  assert.equal(result.kind, 'projection');
  assert.ok(!JSON.stringify(result).includes('"fulfilled"') && !JSON.stringify(result).includes('"cumplido"'));
}

test('el plan actual no cabe: la instalación Norte llega tarde y la cadena causal sale de la traza', () => {
  const model = fridayCase(), result = current(model);
  assertTraceInvariants(model, result);
  const norte = commitment(result, 'c-inst-norte');
  assert.equal(norte.projection, 'late');
  assert.equal(norte.completionAt, '2026-11-16T11:30:00.000Z');
  assert.equal(norte.latenessMinutes, 4110);
  assert.deepEqual(norte.chain.map(step => [step.jobId, step.boundBy.map(entry => `${entry.code}:${entry.jobId ?? entry.materialId ?? ''}`)]), [
    ['ticket-norte', ['resource-busy:inst-norte', 'dependency:inst-norte']],
    ['inst-norte', ['resource-busy:inst-urgente']],
    ['inst-urgente', ['earliest-start:']],
  ]);
  assert.deepEqual(result.commitments.filter(item => item.projection !== 'on-time').map(item => item.commitmentId), ['c-inst-norte']);
  // Evidencia que sostiene el diagnóstico: cada dato usado conserva su procedencia.
  const evidence = outcome(result, 'inst-norte').evidence;
  assert.deepEqual(evidence.map(item => `${item.subject}.${item.field}:${item.provenance.basis}`), ['inst-norte.duration:declared', 'inst-norte.travel:declared', 'mat-bomba.availableAt:observed', 'tech-ana.windows:observed']);
  assert.equal(result.hypothetical, false);
  assert.equal(result.modelRevision, operationalRevision(model));
  assert.equal(result.evaluatedAt, model.clock.now);
});

test('caso sano: todo en plazo, sin causas ni salvedades (sin falsas alertas)', () => {
  const model = fridayCase('healthy'), result = current(model);
  assertTraceInvariants(model, result);
  assert.deepEqual(result.commitments.map(item => item.projection), ['on-time', 'on-time', 'on-time', 'on-time']);
  assert.deepEqual(result.commitments.flatMap(item => [...item.causes, ...item.caveats]), []);
  assert.deepEqual(result.jobs.flatMap(item => [...item.causes, ...item.caveats]), []);
  assert.ok(result.complete);
});

test('misma entrada, misma secuencia; el orden del plan en la entrada no altera el resultado', () => {
  const model = fridayCase(), first = current(model), second = current(clone(model));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const reversed: OperationalPlan = { sequences: [...model.currentPlan!.plan.sequences].reverse() };
  assert.deepEqual(simulatePlan(model, reversed).events, first.events);
});

test('un trabajo que no cabe en una franja se interrumpe y se reanuda', () => {
  const result = current(fridayCase());
  const types = result.events.filter(event => event.jobId === 'inst-urgente').map(event => `${event.type}@${event.at}`);
  assert.deepEqual(types, ['job-start@2026-11-12T07:00:00.000Z', 'job-interrupt@2026-11-12T15:00:00.000Z', 'job-resume@2026-11-13T07:00:00.000Z', 'job-finish@2026-11-13T07:30:00.000Z']);
  assert.ok(result.events.some(event => event.type === 'material-arrival' && event.materialId === 'mat-bomba' && event.at === '2026-11-12T07:00:00.000Z'));
});

test('dato desconocido o contradictorio: ni cero ni ilimitado, y la incertidumbre se propaga', () => {
  const noDuration = current(edit(model => { job(model, 'inst-norte').duration = { state: 'unknown', reason: 'not-provided' }; }));
  assert.deepEqual([outcome(noDuration, 'inst-norte').status, outcome(noDuration, 'inst-norte').causes], ['indeterminate', [{ code: 'unknown-duration' }]]);
  assert.deepEqual([outcome(noDuration, 'ticket-norte').status, outcome(noDuration, 'ticket-norte').causes], ['indeterminate', [{ code: 'depends-on', jobId: 'inst-norte' }]]);
  assert.equal(commitment(noDuration, 'c-inst-norte').projection, 'indeterminate');
  assert.equal(outcome(noDuration, 'inst-norte').startAt, null);

  const noMaterial = current(edit(model => { model.materials[0].availableAt = { state: 'unknown', reason: 'source-partial' }; }));
  assert.deepEqual(outcome(noMaterial, 'inst-norte').causes, [{ code: 'unknown-material', materialId: 'mat-bomba' }]);
  assert.equal(commitment(noMaterial, 'c-inst-norte').projection, 'indeterminate');

  const noHours = current(edit(model => { model.resources[1].windows = { state: 'unknown', reason: 'not-provided' }; }));
  assert.deepEqual([outcome(noHours, 'pedido-sur').status, outcome(noHours, 'pedido-sur').causes], ['indeterminate', [{ code: 'unknown-capacity', resourceId: 'tech-cruz' }]]);
  assert.equal(commitment(noHours, 'c-pedido-sur').projection, 'indeterminate');

  const contradictory = current(edit(model => {
    const fact = job(model, 'cuadro-este').duration;
    job(model, 'cuadro-este').duration = { state: 'contradictory', claims: [{ value: 300, provenance: fact.provenance }, { value: 90, provenance: model.currentPlan.provenance }] };
  }));
  assert.deepEqual(outcome(contradictory, 'cuadro-este').causes, [{ code: 'contradictory-duration' }]);
  assert.equal(commitment(contradictory, 'c-cuadro-este').projection, 'indeterminate');

  const empty = current(edit(model => { model.commitments.push({ ...model.commitments[0], id: 'c-sin-trabajos' }); }));
  assert.deepEqual([commitment(empty, 'c-sin-trabajos').projection, commitment(empty, 'c-sin-trabajos').causes], ['indeterminate', [{ code: 'no-jobs' }]]);
});

test('un vínculo candidato no crea dependencia; uno confirmado sí', () => {
  const base = current(fridayCase());
  const candidate = current(edit(model => { job(model, 'cuadro-este').dependencies = [{ jobId: 'pedido-sur', basis: 'candidate' }]; }));
  assert.equal(outcome(candidate, 'cuadro-este').finishAt, outcome(base, 'cuadro-este').finishAt);
  assert.deepEqual(outcome(candidate, 'cuadro-este').caveats, [{ code: 'candidate-dependency', subject: 'cuadro-este', field: 'pedido-sur' }]);
  const confirmed = current(edit(model => { job(model, 'cuadro-este').dependencies = [{ jobId: 'pedido-sur', basis: 'confirmed' }]; }));
  assert.equal(outcome(confirmed, 'cuadro-este').startAt, '2026-11-13T07:00:00.000Z');
  assert.deepEqual(outcome(confirmed, 'cuadro-este').boundBy, [{ code: 'dependency', jobId: 'pedido-sur' }]);
  assert.equal(outcome(confirmed, 'cuadro-este').waitedForCapacity, true);
  assert.equal(commitment(confirmed, 'c-cuadro-este').projection, 'late');
});

test('ciclos y órdenes imposibles devuelven un resultado explícito', () => {
  const cycle = current(edit(model => { job(model, 'inst-norte').dependencies = [{ jobId: 'ticket-norte', basis: 'confirmed' }]; }));
  for (const id of ['inst-norte', 'ticket-norte']) {
    assert.equal(outcome(cycle, id).status, 'blocked');
    assert.deepEqual(outcome(cycle, id).causes, [{ code: 'dependency-cycle', jobIds: ['inst-norte', 'ticket-norte'] }]);
  }
  assert.equal(commitment(cycle, 'c-inst-norte').projection, 'not-completed');
  assert.equal(commitment(cycle, 'c-inst-urgente').projection, 'on-time');

  const model = fridayCase();
  const deadlock = simulatePlan(model, { sequences: [{ resourceId: 'tech-ana', jobIds: ['ticket-norte', 'inst-norte'] }, { resourceId: 'tech-cruz', jobIds: ['pedido-sur', 'inst-urgente'] }] });
  assert.equal(outcome(deadlock, 'ticket-norte').status, 'blocked');
  assert.ok(outcome(deadlock, 'ticket-norte').causes.some(cause => cause.code === 'ordering-deadlock'));
  assert.equal(outcome(deadlock, 'inst-norte').status, 'blocked');
  assert.deepEqual([outcome(deadlock, 'cuadro-este').status, outcome(deadlock, 'cuadro-este').causes], ['unassigned', [{ code: 'not-in-plan' }]]);
  assertTraceInvariants(model, deadlock);

  const skills = simulatePlan(model, { sequences: [{ resourceId: 'tech-beto', jobIds: ['inst-norte'] }] });
  assert.deepEqual([outcome(skills, 'inst-norte').status, outcome(skills, 'inst-norte').causes], ['invalid-assignment', [{ code: 'skills-not-covered', resourceId: 'tech-beto' }]]);
  assert.equal(outcome(skills, 'ticket-norte').status, 'unassigned');
  assert.throws(() => simulatePlan(model, { sequences: [{ resourceId: 'tech-ana', jobIds: ['inst-norte', 'inst-norte'] }] }), OperationalInputError);
  assert.throws(() => simulatePlan(model, { sequences: [{ resourceId: 'nadie', jobIds: [] }] }), OperationalInputError);
});

test('evidencia antigua, fuente parcial y supuestos quedan señalados y no se rejuvenecen', () => {
  const stale = current(edit(model => { model.materials[0].availableAt.provenance.observedAt = '2026-11-07T06:00:00Z'; }));
  assert.deepEqual(outcome(stale, 'inst-norte').caveats, [{ code: 'stale-evidence', subject: 'mat-bomba', field: 'availableAt' }]);
  assert.ok(commitment(stale, 'c-inst-norte').caveats.some(item => item.code === 'stale-evidence'));
  const future = current(edit(model => { model.materials[0].availableAt.provenance.observedAt = '2026-11-09T08:00:00Z'; }));
  assert.deepEqual(outcome(future, 'inst-norte').caveats.map(item => item.code), ['stale-evidence']);
  const partial = current(edit(model => { model.materials[0].availableAt.provenance.coverage = 'partial'; }));
  assert.deepEqual(outcome(partial, 'inst-norte').caveats, [{ code: 'partial-source', subject: 'mat-bomba', field: 'availableAt' }]);

  const branch = applySuppositions(fridayCase(), [fridayPerturbations.materialDelay, fridayOptions[2]]), result = current(branch);
  assert.equal(result.hypothetical, true);
  assert.equal(result.baseRevision, operationalRevision(fridayCase()));
  assert.notEqual(result.modelRevision, result.baseRevision);
  assert.deepEqual(outcome(result, 'inst-norte').caveats, [{ code: 'assumed', subject: 'mat-bomba', field: 'availableAt', suppositionId: 'p-bomba-tarde' }]);
  assert.ok(commitment(result, 'c-inst-norte').caveats.some(item => item.code === 'assumed' && item.field === 'dueAt' && item.suppositionId === 'o-mover-norte'));
  assertTraceInvariants(branch, result);
});

test('las perturbaciones del ensayo respetan los invariantes y no alteran el origen ni otras ramas', () => {
  const model = fridayCase(), before = JSON.stringify(current(model)), revision = operationalRevision(model);
  const branches = Object.values(fridayPerturbations).map(item => applySuppositions(model, [item]));
  const frozen = branches.map(item => JSON.stringify(item));
  const results = branches.map(item => { const result = current(item); assertTraceInvariants(item, result); return result; });
  assert.equal(JSON.stringify(current(model)), before);
  assert.equal(operationalRevision(model), revision);
  assert.deepEqual(branches.map(item => JSON.stringify(item)), frozen);
  const [delay, absence, outage, reopen] = results;
  assert.equal(outcome(delay, 'inst-norte').boundBy.some(entry => entry.code === 'material') || outcome(delay, 'inst-norte').boundBy.some(entry => entry.code === 'resource-busy'), true);
  assert.ok(commitment(absence, 'c-inst-urgente').completionMinute! > commitment(current(model), 'c-inst-urgente').completionMinute!);
  assert.deepEqual(['c-inst-norte', 'c-pedido-sur'].map(id => commitment(outage, id).projection), ['indeterminate', 'indeterminate']);
  assert.ok(reopen.events.some(event => event.type === 'job-reopen' && event.jobId === 'cuadro-este--p-reabre' && event.at === '2026-11-10T07:00:00.000Z'));
  assert.ok(commitment(reopen, 'c-cuadro-este').projection !== 'on-time' || commitment(reopen, 'c-cuadro-este').completionMinute! > commitment(current(model), 'c-cuadro-este').completionMinute!);
});

test('una reapertura sin sitio en el plan no se da por resuelta', () => {
  const branch = applySuppositions(fridayCase(), [fridayPerturbations.reopen]);
  const withoutSlot = current(branch);
  assert.equal(outcome(withoutSlot, 'cuadro-este--p-reabre').status, 'unassigned');
  assert.equal(commitment(withoutSlot, 'c-cuadro-este').projection, 'not-completed');
  const plan = clone(branch.currentPlan!.plan);
  plan.sequences[2].jobIds.push('cuadro-este--p-reabre');
  const placed = simulatePlan(branch, plan);
  assert.equal(outcome(placed, 'cuadro-este--p-reabre').finishAt, '2026-11-10T09:15:00.000Z');
  assert.deepEqual(outcome(placed, 'cuadro-este--p-reabre').boundBy, [{ code: 'earliest-start' }]);
  assert.equal(commitment(placed, 'c-cuadro-este').projection, 'on-time');
});

test('al agotar el límite de eventos la simulación es incompleta y no concluye lo pendiente', () => {
  const model = fridayCase(), result = simulatePlan(model, model.currentPlan!.plan, { eventLimit: 6 });
  assert.deepEqual([result.complete, result.stoppedBy], [false, 'event-limit']);
  assert.ok(result.jobs.some(item => item.status === 'indeterminate' && item.causes.some(cause => cause.code === 'event-limit')));
  assert.ok(result.commitments.every(item => item.projection !== 'late' && item.projection !== 'not-completed'));
  assert.ok(result.commitments.some(item => item.projection === 'indeterminate'));
});

test('comparar planes muestra lo que mejora y lo que empeora; ninguna mejora es gratuita', () => {
  const model = fridayCase(), before = current(model);
  const after = planSchedule(model, fridayObjectives).simulation;
  assertTraceInvariants(model, after);
  assert.deepEqual(comparePlans(before, after).filter(item => item.effect !== 'same').map(item => [item.commitmentId, item.before, item.after, item.effect]), [
    ['c-inst-norte', 'late', 'on-time', 'improves'], ['c-inst-urgente', 'on-time', 'late', 'worsens'],
  ]);
  assert.deepEqual(comparePlans(before, before).map(item => item.effect), ['same', 'same', 'same', 'same']);
  const unknown = current(edit(model2 => { job(model2, 'inst-norte').duration = { state: 'unknown', reason: 'not-provided' }; }));
  assert.equal(comparePlans(before, unknown)[0].effect, 'unknown');
});
