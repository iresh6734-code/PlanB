import assert from 'node:assert/strict';
import test from 'node:test';
import { fridayCase, fridayObjectives, fridayOptions, fridayPerturbations } from '../shared/operational-fixtures.js';
import {
  compareAlternatives, explainConflict, explainConflictSteps, planSchedule, planScheduleSteps, runCancellable, whatWouldMakeItWork, type Objectives, type PlanResult,
} from '../shared/operational-planner.js';
import { simulatePlan } from '../shared/operational-simulation.js';
import { OperationalInputError, applySuppositions, operationalLimits, operationalModel, operationalRevision, operationalTwinFormat, type OperationalModel, type Supposition, type TwinModel } from '../shared/operational-twin.js';
import { oracleBestKey } from './operational-oracle.js';

const clone = <T>(value: T): T => structuredClone(value);
const flat = (result: PlanResult) => [...result.key.missedByTier, result.key.penaltyMinutes];
const less = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const projections = (result: PlanResult) => Object.fromEntries(result.simulation.commitments.map(item => [item.commitmentId, item.projection]));
const three = ['c-inst-norte', 'c-inst-urgente', 'c-pedido-sur'];
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const inner of Object.values(value)) deepFreeze(inner); }
  return value;
}

// GENERADOR de casos pequeños con semilla fija. Está aquí, separado del oráculo (tests/operational-oracle.ts) y del motor.
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NOW = Date.parse('2026-11-09T07:00:00Z');
const at = (minute: number) => new Date(NOW + minute * 60_000).toISOString().replace('.000Z', 'Z');
function instance(seed: number, sizes: { jobs?: number } = {}): { model: OperationalModel; objectives: Objectives } {
  const next = random(seed), int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1)), pick = <T>(list: T[]) => list[int(0, list.length - 1)];
  const provenance = { basis: 'declared' as const, by: 'Generador de pruebas', declaredAt: at(-30) };
  const known = <T>(value: T) => ({ state: 'known' as const, value, provenance });
  const windows = () => Array.from({ length: int(1, 3) }, () => { const start = int(0, 50) * 10; return { start: at(start), end: at(Math.min(720, start + int(6, 24) * 10)) }; });
  const commitments = Array.from({ length: int(2, 3) }, (_, index) => ({ id: `c${index}`, revision: 'a'.repeat(64), title: `Compromiso ${index}`, dueAt: at((seed % 2 ? int(12, 70) : int(55, 72)) * 10) }));
  const count = sizes.jobs ?? int(3, 6);
  const model = operationalModel.parse({
    format: operationalTwinFormat, clock: { now: at(0), timeZone: 'Europe/Madrid', horizonEnd: at(720) }, rules: { staleAfterMinutes: 1440 },
    resources: [
      { id: 'r0', title: 'R0', kind: 'technician', source: null, executesJobs: true, skills: pick([['a'], ['a', 'b']]), windows: known(windows()) },
      { id: 'r1', title: 'R1', kind: 'technician', source: null, executesJobs: true, skills: pick([['b'], ['a', 'b']]), windows: known(windows()) },
    ],
    materials: [0, 1].map(index => ({ id: `m${index}`, title: `Material ${index}`, source: null, warehouseId: null, availableAt: known(at(int(-6, 30) * 10)) })),
    commitments,
    jobs: Array.from({ length: count }, (_, index) => ({
      id: `j${index}`, title: `Trabajo ${index}`, kind: 'job', source: null, commitmentId: next() < 0.1 ? null : pick(commitments).id,
      duration: known(int(2, 15) * 10), travel: known(pick([0, 10, 20])), skills: pick([[], ['a'], ['b']]), materials: pick([[], [], ['m0'], ['m1']]),
      earliestStart: next() < 0.3 ? at(int(0, 30) * 10) : null,
      dependencies: index > 0 && next() < 0.3 ? [{ jobId: `j${int(0, index - 1)}`, basis: next() < 0.8 ? 'confirmed' : 'candidate' }] : [],
    })),
    currentPlan: null,
  });
  return { model, objectives: { tiers: pick([[], [['c0']], [['c1'], ['c0']]]) } };
}

test('el planificador coincide con el oráculo exhaustivo independiente en 160 casos pequeños', () => {
  let nonTrivial = 0, evaluated = 0;
  for (let seed = 1; seed <= 160; seed++) {
    const { model, objectives } = instance(seed), result = planSchedule(model, objectives), oracle = oracleBestKey(model, objectives.tiers);
    assert.ok(result.search.complete, `semilla ${seed}: búsqueda incompleta`);
    assert.equal(result.search.optimality, 'proven-within-model');
    assert.deepEqual(flat(result), oracle.key, `semilla ${seed}`);
    // El orden de exploración (semilla) no cambia el óptimo cuando la exploración es completa.
    assert.deepEqual(flat(planSchedule(model, objectives, { seed })), oracle.key, `semilla ${seed} con desempate sembrado`);
    if (oracle.key.some(value => value > 0)) nonTrivial += 1;
    evaluated += oracle.evaluated;
  }
  assert.ok(nonTrivial >= 40, `solo ${nonTrivial} casos con algún incumplimiento: el contraste sería trivial`);
  assert.ok(160 - nonTrivial >= 20, 'también hay casos sanos');
  assert.ok(evaluated > 20_000);
  console.log(`oráculo: ${evaluated} planes evaluados; ${nonTrivial} casos con incumplimiento y ${160 - nonTrivial} sanos`);
});

test('la fixture y cada rama suya coinciden con el oráculo', () => {
  const cases: [string, TwinModel][] = [['infeasible', fridayCase()], ['healthy', fridayCase('healthy')]];
  for (const option of fridayOptions) cases.push([option.id, applySuppositions(fridayCase(), [option])]);
  for (const item of [fridayPerturbations.materialDelay, fridayPerturbations.technicianOut, fridayPerturbations.reopen]) cases.push([item.id, applySuppositions(fridayCase(), [item])]);
  for (const [name, model] of cases) for (const objectives of [fridayObjectives, { tiers: [] }, { tiers: [['c-inst-urgente'], ['c-pedido-sur']] }]) {
    const result = planSchedule(model, objectives);
    assert.ok(result.search.complete);
    assert.deepEqual(flat(result), oracleBestKey(model, objectives.tiers).key, `${name} ${JSON.stringify(objectives.tiers)}`);
  }
});

test('añadir una restricción nunca habilita un plan mejor', () => {
  for (let seed = 200; seed < 260; seed++) {
    const { model, objectives } = instance(seed), base = flat(planSchedule(model, objectives));
    const variants: OperationalModel[] = [];
    const dependency = clone(model);
    const last = dependency.jobs[dependency.jobs.length - 1];
    last.dependencies = [...last.dependencies.filter(entry => entry.jobId !== 'j0'), { jobId: 'j0', basis: 'confirmed' }];
    variants.push(dependency);
    const fewerHours = clone(model);
    if (fewerHours.resources[0].windows.state === 'known') fewerHours.resources[0].windows.value.pop();
    variants.push(fewerHours);
    const laterMaterial = clone(model);
    if (laterMaterial.materials[0].availableAt.state === 'known') laterMaterial.materials[0].availableAt.value = at(400);
    variants.push(laterMaterial);
    const lateStart = clone(model);
    lateStart.jobs[0].earliestStart = at(350);
    variants.push(lateStart);
    variants.forEach((variant, index) => assert.ok(!less(flat(planSchedule(variant, objectives)), base), `semilla ${seed}, restricción ${index}`));
  }
});

test('caso inviable: conflicto irreducible verificado, restricciones activas y relajaciones sin autorizar', () => {
  const model = deepFreeze(fridayCase()), result = explainConflict(model, [], fridayOptions);
  assert.equal(result.feasible, 'no');
  assert.deepEqual(result.conflict!.commitmentIds, three);
  assert.equal(result.conflict!.minimality, 'verified-irreducible');
  assert.ok(result.search.complete);
  // Verificación independiente con el oráculo: los tres juntos no caben; quitando cualquiera, sí.
  assert.ok(oracleBestKey(model, [three]).key[0] > 0);
  for (const removed of three) assert.equal(oracleBestKey(model, [three.filter(id => id !== removed)]).key[0], 0, `sin ${removed} debe caber`);
  assert.deepEqual(result.conflict!.resources, ['tech-ana', 'tech-cruz']);
  assert.deepEqual(result.conflict!.materials, ['mat-bomba']);
  assert.deepEqual(result.conflict!.chains.map(item => item.commitmentId), three);
  assert.ok(result.conflict!.chains.every(item => item.chain.length > 0));
  assert.deepEqual(result.indeterminate, []);
  assert.deepEqual(result.relaxations.map(item => [item.supposition.id, item.effect, item.authorization]), [
    ['o-extra-cruz', 'resolves', 'unconfirmed'], ['o-bomba-alt', 'resolves', 'unconfirmed'], ['o-mover-norte', 'resolves', 'unconfirmed'], ['o-dividir-norte', 'resolves', 'unconfirmed'],
  ]);
  // Cada fecha mínima es exacta: con ella el conflicto cabe y un minuto antes no.
  const keep: Objectives = { tiers: [three] };
  for (const change of result.dueChanges) {
    assert.ok(change.proven && change.neededDueAt && change.minutesBeyondDue! > 0);
    const move = (dueAt: string): Supposition[] => [{ id: 'm', type: 'move-due', commitmentId: change.commitmentId, dueAt }];
    assert.equal(planSchedule(applySuppositions(model, move(change.neededDueAt!)), keep).key.missedByTier[0], 0, change.commitmentId);
    assert.equal(planSchedule(applySuppositions(model, move(new Date(Date.parse(change.neededDueAt!) - 60_000).toISOString())), keep).key.missedByTier[0], 1, change.commitmentId);
  }
  // Una relajación inútil se dice inútil.
  const useless: Supposition = { id: 'o-sabado-beto', type: 'add-capacity', resourceId: 'tech-beto', start: '2026-11-14T07:00:00Z', end: '2026-11-14T15:00:00Z' };
  assert.deepEqual(explainConflict(model, [], [useless]).relaxations.map(item => item.effect), ['does-not-resolve']);
});

test('caso sano: sin conflicto, sin alternativas innecesarias y sin incumplimientos', () => {
  const model = deepFreeze(fridayCase('healthy'));
  const conflict = explainConflict(model, [], fridayOptions);
  assert.deepEqual([conflict.feasible, conflict.conflict, conflict.indeterminate, conflict.dueChanges, conflict.relaxations], ['yes', null, [], [], []]);
  const plan = planSchedule(model, fridayObjectives);
  assert.deepEqual(flat(plan), [0, 0, 0]);
  assert.deepEqual(plan.simulation.commitments.flatMap(item => [...item.causes, ...item.caveats]), []);
  const alternatives = compareAlternatives(model, [], fridayOptions, fridayObjectives);
  assert.deepEqual(alternatives.alternatives.map(item => item.id), ['alt-sin-cambios']);
  assert.equal(whatWouldMakeItWork(model, [], 'c-inst-norte', three, fridayOptions).alreadyWorks, 'yes');
});

test('alternativas no dominadas: cada una pide algo distinto y ninguna se presenta como autorizada', () => {
  const model = deepFreeze(fridayCase()), before = operationalRevision(model);
  const result = compareAlternatives(model, [], fridayOptions, fridayObjectives);
  assert.equal(operationalRevision(model), before);
  assert.deepEqual(result.alternatives.map(item => [item.id, item.result.key.missedByTier, item.costs]), [
    ['alt-sin-cambios', [0, 1], { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 0, splits: 0 }],
    ['alt-o-extra-cruz', [0, 0], { extraCapacityMinutes: 60, renegotiatedDates: 0, alternativeMaterials: 0, splits: 0 }],
    ['alt-o-bomba-alt', [0, 0], { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 1, splits: 0 }],
    ['alt-o-mover-norte', [0, 0], { extraCapacityMinutes: 0, renegotiatedDates: 1, alternativeMaterials: 0, splits: 0 }],
    ['alt-o-dividir-norte', [0, 0], { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 0, splits: 1 }],
  ]);
  // Las once combinaciones restantes piden más sin lograr más: quedan descartadas por dominadas, no ocultas.
  assert.deepEqual(result.discarded.map(item => item.reason), Array(11).fill('dominated'));
  assert.equal(result.alternatives.length + result.discarded.length, 16);
  assert.ok(result.search.complete);
  for (const item of result.alternatives) {
    assert.equal(item.authorization, 'unconfirmed');
    assert.equal(item.result.kind, 'proposal');
    assert.equal(item.result.requiresConfirmation, true);
    assert.equal(item.result.hypothetical, item.id !== 'alt-sin-cambios');
    assert.equal(item.result.baseRevision, before);
    assert.equal(item.result.simulation.hypothetical, item.id !== 'alt-sin-cambios');
  }
  assert.deepEqual(result.alternatives.slice(1).map(item => item.versusBaseline.filter(delta => delta.effect !== 'same').map(delta => `${delta.commitmentId}:${delta.effect}`)), Array(4).fill(['c-inst-urgente:improves']));
  // La fecha movida queda señalada en la proyección: «en plazo» lo es respecto a una fecha supuesta.
  const moved = result.alternatives[3].result.simulation.commitments[0];
  assert.ok(moved.projection === 'on-time' && moved.caveats.some(item => item.code === 'assumed' && item.suppositionId === 'o-mover-norte'));
});

test('la prioridad la elige la persona: cambiarla cambia qué se incumple, y se ve lo que empeora', () => {
  const model = fridayCase();
  const norte = planSchedule(model, fridayObjectives), urgente = planSchedule(model, { tiers: [['c-inst-urgente', 'c-pedido-sur']] });
  assert.deepEqual([projections(norte)['c-inst-norte'], projections(norte)['c-inst-urgente']], ['on-time', 'late']);
  assert.deepEqual([projections(urgente)['c-inst-norte'], projections(urgente)['c-inst-urgente'], projections(urgente)['c-pedido-sur']], ['late', 'on-time', 'on-time']);
  assert.throws(() => planSchedule(model, { tiers: [['no-existe']] }), OperationalInputError);
  assert.throws(() => planSchedule(model, { tiers: [['c-inst-norte'], ['c-inst-norte']] }), OperationalInputError);
});

test('«qué tendría que cambiar»: condiciones concretas y exactas dentro del modelo', () => {
  const model = fridayCase(), result = whatWouldMakeItWork(model, [], 'c-inst-norte', three, fridayOptions);
  assert.equal(result.alreadyWorks, 'no');
  assert.deepEqual(result.keeping, ['c-inst-urgente', 'c-pedido-sur']);
  assert.deepEqual(result.conditions.map(item => item.type === 'option' ? item.suppositionId : item.type), ['due-at-least', 'material-by', 'o-extra-cruz', 'o-bomba-alt', 'o-mover-norte', 'o-dividir-norte']);
  const material = result.conditions.find(item => item.type === 'material-by')!;
  assert.ok(material.type === 'material-by' && material.proven);
  assert.deepEqual([material.materialId, material.latestAt, material.currentAt], ['mat-bomba', '2026-11-11T11:30:00.000Z', '2026-11-12T07:00:00.000Z']);
  const arrival = (availableAt: string): Supposition[] => [{ id: 'm', type: 'material-availability', materialId: 'mat-bomba', availableAt }];
  assert.equal(planSchedule(applySuppositions(model, arrival('2026-11-11T11:30:00Z')), { tiers: [three] }).key.missedByTier[0], 0);
  assert.equal(planSchedule(applySuppositions(model, arrival('2026-11-11T11:31:00Z')), { tiers: [three] }).key.missedByTier[0], 1);
  assert.equal(oracleBestKey(applySuppositions(model, arrival('2026-11-11T11:30:00Z')), [three]).key[0], 0);
  assert.equal(oracleBestKey(applySuppositions(model, arrival('2026-11-11T11:31:00Z')), [three]).key[0], 1);
  assert.throws(() => whatWouldMakeItWork(model, [], 'no-existe', [], []), OperationalInputError);
});

test('con datos desconocidos no hay conflicto ni viabilidad inventados: se dice qué falta', () => {
  const model = fridayCase(), scenario = [fridayPerturbations.sourceDown];
  const plan = planSchedule(applySuppositions(model, scenario), fridayObjectives);
  assert.deepEqual([projections(plan)['c-inst-norte'], projections(plan)['c-pedido-sur']], ['indeterminate', 'indeterminate']);
  assert.equal(plan.key.missedByTier[0], 1, 'lo indeterminado no cuenta como cumplido');
  const conflict = explainConflict(model, scenario, fridayOptions);
  assert.equal(conflict.feasible, 'yes');
  assert.equal(conflict.conflict, null);
  assert.deepEqual(conflict.indeterminate, [
    { commitmentId: 'c-inst-norte', causes: [{ code: 'unknown-material', materialId: 'mat-bomba', jobId: 'inst-norte' }, { code: 'depends-on', jobId: 'inst-norte' }] },
    { commitmentId: 'c-pedido-sur', causes: [{ code: 'unknown-duration', jobId: 'pedido-sur' }] },
  ]);
  const conditions = whatWouldMakeItWork(model, scenario, 'c-inst-norte', [], fridayOptions);
  assert.deepEqual([conditions.alreadyWorks, conditions.conditions], ['unknown', []]);
  assert.ok(conditions.missingData.some(cause => cause.code === 'unknown-material' && cause.materialId === 'mat-bomba'));

  const noHours = clone(model);
  noHours.resources[1].windows = { state: 'unknown', reason: 'not-provided' };
  const unknownCapacity = planSchedule(noHours, fridayObjectives);
  assert.equal(projections(unknownCapacity)['c-pedido-sur'], 'indeterminate');
  assert.deepEqual(explainConflict(noHours, [], []).indeterminate, [{ commitmentId: 'c-pedido-sur', causes: [{ code: 'unknown-capacity', jobId: 'pedido-sur', resourceId: 'tech-cruz' }] }]);
});

// Diez trabajos apretados sobre dos recursos: espacio grande y ningún plan perfecto, para forzar presupuesto y cancelación.
function crowded(): OperationalModel {
  const { model } = instance(7, { jobs: 6 }), base = clone(model);
  const provenance = { basis: 'declared' as const, by: 'Generador de pruebas', declaredAt: at(-30) };
  base.resources.forEach(item => { item.skills = ['a', 'b']; item.windows = { state: 'known', value: [{ start: at(0), end: at(720) }], provenance }; });
  base.commitments = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, revision: 'a'.repeat(64), title: `Compromiso ${index}`, dueAt: at(100 + index) }));
  base.jobs = Array.from({ length: 10 }, (_, index) => ({
    id: `j${index}`, title: `Trabajo ${index}`, kind: 'job', source: null, commitmentId: `c${index}`, duration: { state: 'known' as const, value: 61 + index * 7, provenance },
    travel: { state: 'known' as const, value: 0, provenance }, skills: [], materials: [], earliestStart: null, dependencies: [],
  }));
  return operationalModel.parse(base);
}

test('presupuesto agotado: exploración incompleta, sin afirmar optimalidad ni minimalidad', () => {
  const model = crowded(), result = planSchedule(model, { tiers: [] }, { nodeBudget: 40 });
  assert.deepEqual([result.search.complete, result.search.stoppedBy, result.search.optimality], [false, 'node-budget', 'best-found']);
  assert.ok(result.search.nodes <= 41);
  assert.ok(result.plan.sequences.length > 0, 'devuelve el mejor plan encontrado');
  assert.deepEqual(simulatePlan(model, result.plan).commitments, result.simulation.commitments);
  const conflict = explainConflict(model, [], [], { nodeBudget: 60 });
  assert.ok(conflict.feasible === 'unknown' || conflict.conflict?.minimality === 'explanatory');
  assert.equal(conflict.search.complete, false);
  assert.equal(conflict.search.optimality, 'best-found');
  const alternatives = compareAlternatives(fridayCase(), [], fridayOptions, fridayObjectives, { nodeBudget: 16 });
  assert.equal(alternatives.search.optimality, 'best-found');
});

test('la búsqueda cede el control y se puede cancelar sin perder lo explorado', async () => {
  const model = crowded();
  let pauses = 0;
  const started = Date.now();
  const result = await runCancellable(planScheduleSteps(model, { tiers: [] }, { shouldStop: () => pauses >= 3 }), async () => { pauses += 1; });
  assert.ok(pauses >= 3);
  assert.deepEqual([result.search.complete, result.search.stoppedBy, result.search.optimality], [false, 'cancelled', 'best-found']);
  assert.ok(result.search.nodes < 2000, `nodos ${result.search.nodes}`);
  assert.ok(Date.now() - started < 5000);
  assert.ok(result.simulation.commitments.length === 10);
  const conflict = await runCancellable(explainConflictSteps(model, [], [], { shouldStop: () => true }));
  assert.equal(conflict.search.stoppedBy, 'cancelled');
  assert.notEqual(conflict.conflict?.minimality, 'verified-irreducible');
});

test('ninguna operación modifica sus entradas ni produce efectos: todo es propuesta', () => {
  const model = deepFreeze(fridayCase()), options = deepFreeze(clone(fridayOptions)), scenario = deepFreeze([clone(fridayPerturbations.materialDelay)]);
  const snapshot = JSON.stringify(model);
  const outputs = [
    planSchedule(model, deepFreeze(clone(fridayObjectives))), compareAlternatives(model, scenario, options, fridayObjectives),
    explainConflict(model, scenario, options), whatWouldMakeItWork(model, scenario, 'c-inst-norte', three, options),
  ];
  assert.equal(JSON.stringify(model), snapshot);
  for (const output of outputs) assert.equal(output.kind, 'proposal');
  const again = compareAlternatives(model, scenario, options, fridayObjectives);
  assert.equal(JSON.stringify(again), JSON.stringify(outputs[1]), 'misma entrada, mismo resultado');
});

// ── R2 (revisión independiente 325) ──────────────────────────────────────────────────────────────────────────────────────────────────
test('R2 · F1: la falta de horario de un predecesor de otro compromiso deja indeterminado al que depende, y la falta REAL de capacidad sigue siendo conflicto', () => {
  const dependent = (windows: OperationalModel['resources'][number]['windows']) => {
    const model = clone(fridayCase('healthy'));
    model.resources.find(item => item.id === 'tech-cruz')!.windows = windows;
    model.jobs.find(job => job.id === 'inst-norte')!.dependencies.push({ jobId: 'pedido-sur', basis: 'confirmed' });
    return operationalModel.parse(model);
  };
  // Horario DESCONOCIDO del único técnico capaz del pedido: Norte y Sur quedan sin determinar, con la causa y sin conflicto inventado.
  const unknown = dependent({ state: 'unknown', reason: 'not-provided' }), conflict = explainConflict(unknown, [], fridayOptions);
  assert.equal(conflict.conflict, null);
  assert.deepEqual(conflict.indeterminate.map(item => item.commitmentId), ['c-inst-norte', 'c-pedido-sur']);
  assert.deepEqual(conflict.indeterminate[0].causes, [{ code: 'unknown-capacity', jobId: 'pedido-sur', resourceId: 'tech-cruz' }]);
  const conditions = whatWouldMakeItWork(unknown, [], 'c-inst-norte', [], fridayOptions);
  assert.deepEqual([conditions.alreadyWorks, conditions.conditions, conditions.unexplored], ['unknown', [], []]);
  assert.deepEqual(conditions.missingData, [{ code: 'unknown-capacity', jobId: 'pedido-sur', resourceId: 'tech-cruz' }]);
  const plan = planSchedule(unknown, fridayObjectives);
  assert.deepEqual([projections(plan)['c-inst-norte'], projections(plan)['c-pedido-sur']], ['indeterminate', 'indeterminate']);
  // Horario CONOCIDO y sin huecos: no es falta de dato sino de capacidad, y debe poder salir como conflicto.
  const none = dependent({ state: 'known', value: [], provenance: unknown.currentPlan!.provenance }), real = explainConflict(none, [], []);
  assert.equal(real.feasible, 'no');
  assert.deepEqual(real.indeterminate, []);
  assert.ok(real.conflict!.commitmentIds.includes('c-pedido-sur'));
  assert.equal(whatWouldMakeItWork(none, [], 'c-inst-norte', [], []).alreadyWorks, 'no');
  // Un compromiso que NO depende de lo desconocido sigue siendo determinado.
  assert.ok(!conflict.indeterminate.some(item => item.commitmentId === 'c-cuadro-este' || item.commitmentId === 'c-inst-urgente'));
});

test('R2 · F2: el contrato rechaza lo que el motor no puede simular (menos de un minuto de horizonte) y acepta un minuto exacto', () => {
  const horizon = (ms: number) => { const model = clone(fridayCase()); model.clock.horizonEnd = new Date(Date.parse(model.clock.now) + ms).toISOString(); return model; };
  for (const ms of [0, 1, 30_000, 59_999]) assert.equal(operationalModel.safeParse(horizon(ms)).success, false, `${ms} ms`);
  for (const ms of [60_000, 61_000, 90_000]) {
    const parsed = operationalModel.parse(horizon(ms)), plan = planSchedule(parsed, fridayObjectives);
    assert.ok(plan.simulation.complete && plan.search.complete, `${ms} ms`);
    assert.ok(plan.simulation.commitments.every(item => item.projection !== 'on-time'), 'en un minuto no cabe nada');
  }
});

test('R2 · F3: con la rama en el máximo de supuestos, lo que no se puede explorar se dice y nada lanza un error sin tipo', () => {
  const base = fridayCase(), at = '2026-11-12T07:00:00Z';
  const full: Supposition[] = Array.from({ length: operationalLimits.suppositions }, (_, index) => ({ id: `fecha-${index}`, type: 'material-availability', materialId: 'mat-bomba', availableAt: at }));
  const conditions = whatWouldMakeItWork(base, full, 'c-inst-norte', three, fridayOptions);
  assert.equal(conditions.alreadyWorks, 'no');
  assert.deepEqual(conditions.unexplored, [
    { type: 'material-by', id: 'mat-bomba', reason: 'supposition-limit' },
    ...fridayOptions.map(option => ({ type: 'option' as const, id: option.id, reason: 'supposition-limit' as const })),
  ]);
  assert.deepEqual(conditions.conditions.map(item => item.type), ['due-at-least'], 'lo que no necesita un supuesto más sí se calcula');
  assert.equal(conditions.search.complete, false, 'no se presenta como comprobación completa');
  const conflict = explainConflict(base, full, fridayOptions);
  assert.equal(conflict.feasible, 'no');
  assert.deepEqual(conflict.relaxations.map(item => item.effect), ['not-explored', 'not-explored', 'not-explored', 'not-explored']);
  assert.equal(conflict.search.complete, false);
  const alternatives = compareAlternatives(base, full, fridayOptions, fridayObjectives);
  assert.deepEqual(alternatives.alternatives.map(item => item.id), ['alt-sin-cambios']);
  assert.deepEqual([...new Set(alternatives.discarded.map(item => item.reason))], ['not-explored']);
  assert.deepEqual([alternatives.discarded.length, alternatives.search.complete, alternatives.search.optimality], [15, false, 'best-found']);
  // Con un supuesto de margen todo se explora como antes.
  const roomy = whatWouldMakeItWork(base, full.slice(1), 'c-inst-norte', three, fridayOptions);
  assert.deepEqual(roomy.unexplored, []);
  assert.ok(roomy.conditions.some(item => item.type === 'material-by'));
  // Pasarse del máximo es un error propio, no un ZodError.
  assert.throws(() => applySuppositions(base, [...full, { id: 'una-mas', type: 'material-availability', materialId: 'mat-bomba', availableAt: at }]), (error: unknown) => error instanceof OperationalInputError && error.code === 'limit');
});
