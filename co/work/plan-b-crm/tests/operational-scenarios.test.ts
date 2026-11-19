import assert from 'node:assert/strict';
import test from 'node:test';
import { planSchedule } from '../shared/operational-planner.js';
import { checkScenario, realEngine, shrinkScenario, traceViolations, type Engine } from '../shared/operational-properties.js';
import { generateScenario, scenarioKinds, type GeneratedScenario } from '../shared/operational-scenarios.js';
import { simulatePlan } from '../shared/operational-simulation.js';
import { applySuppositions, operationalModel, type TwinModel } from '../shared/operational-twin.js';
import { oracleBestKey } from './operational-oracle.js';

const SEEDS = Array.from({ length: 40 }, (_, at) => at + 1);
const branched = (scenario: GeneratedScenario): TwinModel => scenario.suppositions.length ? applySuppositions(scenario.model, scenario.suppositions) : scenario.model;
const allKnown = (model: TwinModel) => model.jobs.every(job => job.duration.state === 'known' && job.travel.state === 'known') && model.materials.every(item => item.availableAt.state === 'known');

// Motores DEFECTUOSOS sembrados: envuelven al real alterando lo que ve. Sirven para comprobar que el comprobador detecta fallos y que el minimizador los reduce.
const rewired = (edit: (model: any) => void): Engine => ({
  ...realEngine,
  simulate: (model, plan) => { const copy = structuredClone(model); edit(copy); return simulatePlan(copy, plan); },
});
const ignoresMaterials = rewired(model => { for (const item of model.materials) if (item.availableAt.state === 'known') item.availableAt.value = model.clock.now; });
const confirmsCandidates = rewired(model => { for (const job of model.jobs) for (const entry of job.dependencies) entry.basis = 'confirmed'; });
const inventsDurations = rewired(model => { for (const job of model.jobs) if (job.duration.state !== 'known') job.duration = { state: 'known', value: 30, provenance: model.jobs[0].travel.provenance }; });
const forgetsStaleness = rewired(model => { model.rules.staleAfterMinutes = 60 * 24 * 30; });

test('el generador es reproducible, válido y cubre las siete clases', () => {
  for (const kind of scenarioKinds) {
    const first = generateScenario(11, kind), again = generateScenario(11, kind);
    assert.equal(JSON.stringify(first), JSON.stringify(again), kind);
    assert.notEqual(JSON.stringify(first.model), JSON.stringify(generateScenario(12, kind).model), kind);
    assert.ok(operationalModel.safeParse(first.model).success);
    const medium = generateScenario(11, kind, 'medium');
    assert.ok(medium.model.jobs.length >= 8 && medium.model.resources.length === 3, `${kind}: ${medium.model.jobs.length} trabajos`);
  }
  const touched = (kind: typeof scenarioKinds[number]) => SEEDS.filter(seed => { const item = generateScenario(seed, kind); return item.suppositions.length > 0 || Object.keys(item.touched).length > 0; }).length;
  for (const kind of scenarioKinds.filter(value => value !== 'healthy')) assert.ok(touched(kind) >= 20, `${kind}: solo ${touched(kind)} de 40 casos alteran algo`);
});

test('el motor real cumple todas las propiedades en 280 escenarios pequeños y 42 medianos', () => {
  const tally: Record<string, { cases: number; trouble: number }> = {};
  for (const kind of scenarioKinds) {
    tally[kind] = { cases: 0, trouble: 0 };
    for (const [size, seeds] of [['small', SEEDS], ['medium', SEEDS.slice(0, 6)]] as const) for (const seed of seeds) {
      const scenario = generateScenario(seed, kind, size);
      assert.deepEqual(checkScenario(scenario), [], `${kind} ${size} semilla ${seed}`);
      tally[kind].cases += 1;
      if (simulatePlan(branched(scenario), scenario.witnessPlan).commitments.some(item => item.projection !== 'on-time')) tally[kind].trouble += 1;
    }
  }
  // Las clases sanas no producen ninguna alerta; las de perturbación sí producen casos con problemas (si no, no ejercitarían nada).
  for (const kind of ['healthy', 'stale-source', 'ambiguous-links', 'late-confirmation'] as const) assert.equal(tally[kind].trouble, 0, kind);
  for (const kind of ['material-delay', 'capacity-loss', 'partial-source'] as const) assert.ok(tally[kind].trouble >= 15, `${kind}: ${tally[kind].trouble}`);
  console.log(`escenarios: ${Object.entries(tally).map(([kind, value]) => `${kind} ${value.trouble}/${value.cases} con algo fuera de plazo o indeterminado`).join(' · ')}`);
});

test('en los escenarios pequeños con datos conocidos el planificador coincide con el oráculo exhaustivo', () => {
  let compared = 0, missed = 0;
  for (const kind of ['healthy', 'material-delay', 'capacity-loss', 'stale-source', 'ambiguous-links', 'late-confirmation'] as const) for (const seed of SEEDS.slice(0, 20)) {
    const scenario = generateScenario(seed, kind), model = branched(scenario);
    if (!allKnown(model)) continue;
    const result = planSchedule(model, scenario.objectives), oracle = oracleBestKey(model, scenario.objectives.tiers);
    assert.ok(result.search.complete);
    assert.deepEqual([...result.key.missedByTier, result.key.penaltyMinutes], oracle.key, `${kind} semilla ${seed}`);
    compared += 1;
    if (oracle.key.some(value => value > 0)) missed += 1;
  }
  assert.ok(compared >= 100 && missed >= 10, `${compared} comparados, ${missed} con incumplimiento`);
});

test('cada motor defectuoso sembrado es detectado por la propiedad que le corresponde', () => {
  const detects = (engine: Engine, kind: typeof scenarioKinds[number], property: string) => SEEDS.filter(seed => checkScenario(generateScenario(seed, kind), engine).some(item => item.property === property)).length;
  assert.ok(detects(ignoresMaterials, 'material-delay', 'P2-material-gating') >= 5);
  assert.ok(detects(confirmsCandidates, 'ambiguous-links', 'P10-false-alert') >= 5);
  assert.ok(detects(inventsDurations, 'partial-source', 'P5-pending-evidence') >= 5);
  assert.ok(detects(forgetsStaleness, 'stale-source', 'P13-caveat') >= 5);
  // Un resultado manipulado a mano también cae: doble ocupación y «en plazo» sin terminar.
  const scenario = generateScenario(3, 'healthy', 'medium'), run = simulatePlan(scenario.model, scenario.witnessPlan), forged = structuredClone(run);
  const starts = forged.events.filter(event => event.type === 'job-start' && event.resourceId === forged.events.find(item => item.type === 'job-start')!.resourceId);
  assert.ok(starts.length >= 2);
  forged.events.splice(forged.events.indexOf(starts[1]), 1);
  forged.events.splice(forged.events.indexOf(starts[0]) + 1, 0, starts[1]);
  assert.ok(traceViolations(scenario.model, forged).some(item => item.property === 'P1-double-booking'));
  const lying = structuredClone(run);
  lying.jobs[0].status = 'not-completed';
  assert.ok(traceViolations(scenario.model, lying).some(item => item.property === 'P6-on-time'));
  assert.deepEqual(traceViolations(scenario.model, run), []);
});

test('un contraejemplo se reduce al caso mínimo que sigue fallando, de forma reproducible', () => {
  const fails = (candidate: GeneratedScenario) => checkScenario(candidate, ignoresMaterials).some(item => item.property === 'P2-material-gating');
  const original = SEEDS.map(seed => generateScenario(seed, 'material-delay', 'medium')).find(fails)!;
  assert.ok(original && original.model.jobs.length >= 8);
  const before = JSON.stringify(original), reduced = shrinkScenario(original, fails);
  assert.equal(JSON.stringify(original), before, 'el original no se modifica');
  const { model, suppositions, witnessPlan } = reduced.scenario;
  assert.deepEqual([model.jobs.length, model.materials.length, model.resources.length, model.commitments.length, suppositions.length], [1, 1, 1, 1, 1]);
  assert.deepEqual(model.jobs[0].dependencies, []);
  assert.equal((model.resources[0].windows as { value: unknown[] }).value.length, 1);
  assert.deepEqual(witnessPlan.sequences.map(entry => entry.jobIds.length), [1]);
  assert.ok(reduced.steps >= 10);
  // Sigue siendo un caso válido, falla con el motor defectuoso y pasa con el real: es una regresión lista para guardar.
  assert.ok(operationalModel.safeParse(model).success);
  assert.ok(fails(reduced.scenario));
  assert.deepEqual(checkScenario(reduced.scenario), []);
  assert.equal(JSON.stringify(shrinkScenario(original, fails).scenario), JSON.stringify(reduced.scenario));
  // La secuencia reproducible que viola la propiedad: el trabajo arranca antes de la llegada supuesta de su material.
  const run = ignoresMaterials.simulate(applySuppositions(model, suppositions), witnessPlan), arrival = suppositions[0];
  assert.ok(arrival.type === 'material-availability' && Date.parse(run.jobs[0].startAt!) < Date.parse(arrival.availableAt));
  console.log(`contraejemplo: de ${original.model.jobs.length} trabajos a 1 en ${reduced.steps} reducciones (${reduced.attempts} intentos)`);
});

test('el minimizador no acepta reducciones que dejan de fallar ni devuelve casos inválidos', () => {
  const scenario = generateScenario(5, 'capacity-loss', 'medium');
  const untouched = shrinkScenario(scenario, () => false);
  assert.equal(untouched.steps, 0);
  assert.equal(JSON.stringify(untouched.scenario), JSON.stringify(scenario));
  // Predicado «quedan al menos tres trabajos»: reduce hasta exactamente tres.
  const three = shrinkScenario(scenario, candidate => candidate.model.jobs.length >= 3);
  assert.equal(three.scenario.model.jobs.length, 3);
  assert.ok(operationalModel.safeParse(three.scenario.model).success);
  const throwing = shrinkScenario(scenario, candidate => { if (candidate.model.jobs.length < scenario.model.jobs.length) throw new Error('fallo del predicado'); return true; });
  assert.equal(throwing.scenario.model.jobs.length, scenario.model.jobs.length);
});
