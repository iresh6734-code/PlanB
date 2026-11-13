import assert from 'node:assert/strict';
import test from 'node:test';
import { companyCounts, companyNewPriority, companyObjectives, companyOptions, companyPerturbations, companyWeek } from '../shared/operational-company.js';
import { fridayCase, fridayObjectives } from '../shared/operational-fixtures.js';
import { compareOptionsLarge, focusConflict, improvePlan, planLarge, planLargeSteps, projectModel, suppositionsFor } from '../shared/operational-large.js';
import { planSchedule, runCancellable, type PlanResult } from '../shared/operational-planner.js';
import { traceViolations } from '../shared/operational-properties.js';
import { generateScenario, scenarioKinds } from '../shared/operational-scenarios.js';
import { simulatePlan } from '../shared/operational-simulation.js';
import { OperationalInputError, applySuppositions, operationalLimits, operationalModel, operationalRevision, sourceRefKey, type OperationalPlan } from '../shared/operational-twin.js';

const flat = (result: PlanResult) => [...result.key.missedByTier, result.key.penaltyMinutes];
const less = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const offTime = (result: { commitments: { commitmentId: string; projection: string }[] }) => Object.fromEntries(result.commitments.filter(item => item.projection !== 'on-time').map(item => [item.commitmentId, item.projection]));

test('la empresa de ficción tiene 12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos y 8 tickets, todo con procedencia', () => {
  const model = companyWeek(), kind = (value: string) => model.jobs.filter(job => job.kind === value).length;
  assert.deepEqual(
    { installations: kind('installation'), technicians: model.resources.filter(item => item.kind === 'technician').length, warehouses: model.resources.filter(item => item.kind === 'warehouse').length, orders: kind('order'), tickets: kind('ticket') },
    companyCounts,
  );
  assert.deepEqual(companyCounts, { installations: 12, technicians: 3, warehouses: 2, orders: 20, tickets: 8 });
  assert.ok(operationalModel.safeParse(model).success);
  assert.ok(model.jobs.length <= operationalLimits.jobs && model.commitments.length <= operationalLimits.commitments);
  assert.equal(model.commitments.length, 27);
  assert.equal(operationalRevision(model), operationalRevision(companyWeek()));
  // Todo dato conocido declara de dónde sale; la ficción se reconoce por sus proveedores y cuentas.
  const facts = [...model.jobs.flatMap(job => [job.duration, job.travel]), ...model.materials.map(item => item.availableAt), ...model.resources.map(item => item.windows)];
  assert.deepEqual(facts.filter(fact => fact.state !== 'known').length, 1);
  assert.deepEqual(model.jobs.find(job => job.id === 't07')!.duration, { state: 'unknown', reason: 'not-provided' });
  const sources = [...model.jobs, ...model.materials, ...model.resources].flatMap(item => item.source ? [item.source] : []);
  assert.ok(sources.length >= 45 && sources.every(source => source.provider.endsWith('-fixture') && source.accountId.startsWith('fixture-')));
  assert.equal(new Set(model.jobs.map(job => sourceRefKey(job.source!))).size, 40);
  // Mismo ID remoto en dos cuentas: dos pedidos distintos.
  const [five, six] = ['o05', 'o06'].map(id => model.jobs.find(job => job.id === id)!.source!);
  assert.deepEqual([five.remoteId, six.remoteId, five.accountId === six.accountId], ['2005', '2005', false]);
  // Dependencias explícitas instalación←pedido, un vínculo candidato, ventanas, habilidades, desplazamientos y material.
  assert.ok(model.jobs.filter(job => job.kind === 'installation').every(job => job.dependencies[0].basis === 'explicit' && job.dependencies[0].jobId === job.id.replace('i', 'o')));
  assert.deepEqual(model.jobs.flatMap(job => job.dependencies.filter(entry => entry.basis === 'candidate').map(entry => `${job.id}?${entry.jobId}`)), ['i11?o15']);
  assert.ok(model.jobs.filter(job => job.kind === 'installation').every(job => job.travel.state === 'known' && job.travel.value >= 30 && job.skills.length === 1));
  assert.deepEqual(model.jobs.filter(job => job.materials.length).map(job => job.id), ['i02', 'i05', 'i07', 'i10']);
});

test('plan declarado: solo la instalación 07 llega tarde, y se ve por qué', () => {
  const model = companyWeek(), result = simulatePlan(model, model.currentPlan!.plan);
  assert.deepEqual(traceViolations(model, result), []);
  assert.deepEqual(offTime(result), { 'c-i07': 'late', 'c-t07': 'indeterminate' });
  const focus = result.commitments.find(item => item.commitmentId === 'c-i07')!;
  assert.equal(focus.completionAt, '2026-11-16T11:30:00.000Z');
  assert.deepEqual(focus.chain.map(step => `${step.jobId}@${step.resourceId}`), ['t03@tech-ana', 'i07@tech-ana', 'i08@tech-ana']);
  assert.deepEqual(focus.chain[2].boundBy, [{ code: 'earliest-start' }]);
  // El ticket sin duración no se da por atendido ni por incumplido.
  assert.deepEqual(result.commitments.find(item => item.commitmentId === 'c-t07')!.causes, [{ code: 'unknown-duration' }]);
  // La fecha de los paneles se observó hace tres días: queda señalada, no rejuvenecida.
  assert.ok(result.jobs.find(item => item.jobId === 'i10')!.caveats.some(item => item.code === 'stale-evidence' && item.subject === 'mat-paneles'));
  assert.ok(result.jobs.find(item => item.jobId === 'i11')!.caveats.some(item => item.code === 'candidate-dependency' && item.field === 'o15'));
});

test('conflicto enfocado: Residencia Norte y Hotel Faro no caben juntos, verificado en la proyección y válido para toda la empresa', () => {
  const model = companyWeek(), result = focusConflict(model, [], 'c-i07', companyOptions, { seed: 1 });
  assert.equal(result.verdict, 'conflict');
  assert.deepEqual(result.examined, ['c-i07', 'c-i08']);
  assert.ok(result.includesFocus);
  assert.equal(result.relaxationScope, 'examined-commitments-only');
  const conflict = result.conflict!.conflict!;
  assert.deepEqual([conflict.commitmentIds, conflict.minimality], [['c-i07', 'c-i08'], 'verified-irreducible']);
  assert.deepEqual([conflict.resources, conflict.materials], [['tech-ana', 'tech-cruz'], ['mat-bomba']]);
  assert.deepEqual(result.conflict!.relaxations.map(item => `${item.supposition.id}:${item.effect}:${item.authorization}`), [
    'o-extra-cruz:resolves:unconfirmed', 'o-bomba-alt:resolves:unconfirmed', 'o-mover-i07:resolves:unconfirmed', 'o-dividir-i07:resolves:unconfirmed',
  ]);
  assert.deepEqual(result.conflict!.dueChanges.map(item => [item.commitmentId, item.neededDueAt, item.proven]), [['c-i07', '2026-11-16T11:00:00.000Z', true], ['c-i08', '2026-11-16T07:30:00.000Z', true]]);
  // Comprobación independiente con el planificador exacto sobre la proyección.
  const projected = projectModel(model, ['c-i07', 'c-i08']), both = planSchedule(projected, { tiers: [['c-i07', 'c-i08']] });
  assert.deepEqual([both.search.complete, both.key.missedByTier[0]], [true, 1]);
  for (const id of ['c-i07', 'c-i08']) assert.equal(planSchedule(projectModel(model, [id]), { tiers: [[id]] }).key.missedByTier[0], 0);
  // Ningún plan encontrado para la empresa entera cumple los dos (los demás trabajos solo quitan capacidad).
  for (const seed of [1, 2, 3]) assert.ok(planLarge(model, { tiers: [['c-i07', 'c-i08']] }, { seed }).key.missedByTier[0] >= 1);

  // Un compromiso con datos pendientes no recibe un conflicto inventado; uno inexistente se rechaza.
  const pending = focusConflict(model, [], 'c-t07', [], { seed: 1 });
  assert.deepEqual([pending.verdict, pending.conflict, pending.missingData], ['indeterminate', null, [{ code: 'unknown-duration' }]]);
  assert.throws(() => focusConflict(model, [], 'no-existe', []), OperationalInputError);
  // Sin presupuesto para probarlo, no se declara conflicto.
  const starved = focusConflict(model, [], 'c-i07', [], { seed: 1, nodeBudget: 3 });
  assert.deepEqual([starved.verdict, starved.conflict], ['no-small-conflict', null]);
});

test('la proyección conserva lo que el compromiso necesita y nada más', () => {
  const model = companyWeek(), before = JSON.stringify(model), projected = projectModel(model, ['c-i07', 'c-i11']);
  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(projected.jobs.map(job => job.id).sort(), ['i07', 'i11', 'o07', 'o11', 't03']);
  assert.deepEqual(projected.commitments.map(item => item.id), ['c-i07', 'c-i11']);
  assert.deepEqual(projected.jobs.find(job => job.id === 'i11')!.dependencies, [{ jobId: 'o11', basis: 'explicit' }], 'el vínculo candidato hacia un trabajo omitido se retira');
  assert.equal(projected.resources.length, 5);
  assert.deepEqual(projected.currentPlan!.plan.sequences.map(entry => entry.jobIds), [['i07', 't03'], ['i11'], [], ['o07', 'o11'], []]);
  assert.deepEqual(suppositionsFor(projected, [...companyOptions, companyPerturbations.reopen, companyPerturbations.technicianOut, { id: 'x', type: 'move-due', commitmentId: 'c-i01', dueAt: '2026-11-12T15:00:00Z' }]).map(item => item.id),
    ['o-extra-cruz', 'o-bomba-alt', 'o-mover-i07', 'o-dividir-i07', 'p-ana-baja']);
  assert.throws(() => projectModel(model, ['no-existe']), OperationalInputError);
});

test('la mejora local nunca empeora, es reproducible por semilla y se declara «best-found»', () => {
  const model = companyWeek();
  // Un plan de partida deliberadamente malo: cada cola del plan declarado, al revés.
  const reversed: OperationalPlan = { sequences: model.currentPlan!.plan.sequences.map(entry => ({ resourceId: entry.resourceId, jobIds: [...entry.jobIds].reverse() })) };
  for (const [name, start] of [['declarado', model.currentPlan!.plan], ['invertido', reversed]] as const) {
    const zero = improvePlan(model, companyObjectives, start, { evaluations: 0 });
    assert.deepEqual(simulatePlan(model, start).commitments, zero.simulation.commitments, `${name}: sin evaluaciones devuelve el plan de partida`);
    for (const seed of [1, 2, 3]) {
      const improved = improvePlan(model, companyObjectives, start, { seed });
      assert.ok(!less(flat(zero), flat(improved)), `${name} semilla ${seed}: empeoró`);
      assert.deepEqual(traceViolations(model, improved.simulation), []);
      assert.deepEqual([improved.search.optimality, improved.search.complete, improved.kind, improved.requiresConfirmation], ['best-found', false, 'proposal', true]);
      assert.equal(JSON.stringify(improvePlan(model, companyObjectives, start, { seed })), JSON.stringify(improved));
    }
  }
  const bad = improvePlan(model, companyObjectives, reversed, { evaluations: 0 }), better = improvePlan(model, companyObjectives, reversed, { seed: 1 });
  assert.ok(bad.key.missedByTier.reduce((a, b) => a + b) >= 10 && better.key.missedByTier.reduce((a, b) => a + b) <= 3, `${JSON.stringify(bad.key)} → ${JSON.stringify(better.key)}`);
});

test('la mejora local coincide con la simulación en 84 escenarios medianos y nunca empeora el plan testigo', () => {
  for (const kind of scenarioKinds) for (let seed = 1; seed <= 12; seed++) {
    const scenario = generateScenario(seed, kind, 'medium'), model = scenario.suppositions.length ? applySuppositions(scenario.model, scenario.suppositions) : scenario.model;
    const start = improvePlan(model, scenario.objectives, scenario.witnessPlan, { evaluations: 0 }), improved = improvePlan(model, scenario.objectives, scenario.witnessPlan, { seed, evaluations: 800 });
    assert.ok(!less(flat(start), flat(improved)), `${kind} ${seed}`);
    assert.deepEqual(traceViolations(model, improved.simulation), [], `${kind} ${seed}`);
  }
});

test('ensayar la semana completa: cada perturbación deja un plan válido, hipotético y sin dar por bueno lo desconocido', () => {
  const model = companyWeek(), revision = operationalRevision(model);
  const base = planLarge(model, companyObjectives, { seed: 1 });
  assert.deepEqual(offTime(base.simulation), { 'c-i08': 'late', 'c-t07': 'indeterminate' });
  assert.deepEqual([base.hypothetical, base.search.optimality], [false, 'best-found']);
  const outcomes: Record<string, Record<string, string>> = {};
  for (const [name, perturbation] of Object.entries(companyPerturbations)) {
    const branch = applySuppositions(model, [perturbation]), result = planLarge(branch, companyObjectives, { seed: 1 });
    assert.deepEqual(traceViolations(branch, result.simulation), [], name);
    assert.deepEqual([result.hypothetical, result.baseRevision, result.simulation.hypothetical], [true, revision, true]);
    outcomes[name] = offTime(result.simulation);
    assert.equal(outcomes[name]['c-t07'], 'indeterminate');
  }
  assert.equal(operationalRevision(model), revision);
  assert.equal(outcomes.materialDelay['c-i07'], 'late', 'con la bomba el viernes la instalación 07 ya no llega');
  assert.equal(outcomes.technicianOut['c-i07'], 'late');
  assert.equal(outcomes.reopen['c-i04'], 'late', 'la reapertura del jueves cae después de la fecha del miércoles');
  // Caída de la cuenta A: lo que acreditaba queda indeterminado (no incumplido), y lo de la cuenta B sigue en pie.
  const down = Object.entries(outcomes.sourceDown);
  assert.ok(down.length >= 10 && down.every(([, projection]) => projection === 'indeterminate'));
  assert.ok(!('c-i04' in outcomes.sourceDown) && !('c-o14' in outcomes.sourceDown));
});

test('comparar opciones en la empresa completa: cada una salva al Hotel Faro pidiendo algo distinto', () => {
  const model = companyWeek(), result = compareOptionsLarge(model, [], companyOptions, companyObjectives, { seed: 1 });
  assert.deepEqual([result.combinations, result.optimality, result.kind], ['singles-only', 'best-found', 'proposal']);
  assert.deepEqual(result.alternatives.map(item => item.id), ['alt-sin-cambios', 'alt-o-extra-cruz', 'alt-o-bomba-alt', 'alt-o-mover-i07', 'alt-o-dividir-i07']);
  assert.deepEqual(result.discarded, []);
  for (const item of result.alternatives.slice(1)) {
    assert.equal(item.authorization, 'unconfirmed');
    assert.deepEqual(item.versusBaseline.filter(delta => delta.effect !== 'same').map(delta => `${delta.commitmentId}:${delta.effect}`), ['c-i08:improves'], item.id);
    assert.deepEqual(offTime(item.result.simulation), { 'c-t07': 'indeterminate' });
    assert.ok(item.result.hypothetical);
  }
  assert.deepEqual(result.alternatives.map(item => Object.values(item.costs).join()), ['0,0,0,0', '480,0,0,0', '0,0,1,0', '0,1,0,0', '0,0,0,1']);
  // Prioridad nueva de un cliente: con el Hotel Faro por delante, quien se retrasa es la Residencia Norte.
  const swapped = planLarge(model, companyNewPriority, { seed: 1 });
  assert.deepEqual(offTime(swapped.simulation), { 'c-i07': 'late', 'c-t07': 'indeterminate' });
});

test('en tamaño pequeño el camino de tamaño real devuelve el resultado exacto, y en grande se puede cancelar', async () => {
  const small = fridayCase(), exact = planSchedule(small, fridayObjectives), viaLarge = planLarge(small, fridayObjectives);
  assert.deepEqual([viaLarge.search.complete, viaLarge.search.optimality, flat(viaLarge)], [true, 'proven-within-model', flat(exact)]);
  let pauses = 0;
  const started = Date.now();
  const cancelled = await runCancellable(planLargeSteps(companyWeek(), companyObjectives, { shouldStop: () => pauses >= 2 }), async () => { pauses += 1; });
  assert.deepEqual([cancelled.search.stoppedBy, cancelled.search.complete], ['cancelled', false]);
  assert.ok(Date.now() - started < 3000);
});
