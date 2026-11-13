import assert from 'node:assert/strict';
import test from 'node:test';
import { companyDay, companyObjectives, companyOptions, companyWeek } from '../shared/operational-company.js';
import { fridayCase, fridayObjectives, fridayOptions } from '../shared/operational-fixtures.js';
import { compareOptionsLarge } from '../shared/operational-large.js';
import { planSchedule } from '../shared/operational-planner.js';
import { whatToCheckFirst, type ConsideredAlternative, type Hypothesis } from '../shared/operational-sensitivity.js';
import { OperationalInputError, applySuppositions, type OperationalModel } from '../shared/operational-twin.js';

const alternatives: ConsideredAlternative[] = [{ id: 'sin-cambios', suppositions: [] }, ...fridayOptions.map(option => ({ id: option.id, suppositions: [option] }))];
// La fixture del viernes con dos datos AUSENTES: cuándo estaría la bomba equivalente y cuánto dura montar el cuadro Este.
function withGaps(): OperationalModel {
  const model = structuredClone(fridayCase());
  model.materials[1].availableAt = { state: 'unknown', reason: 'not-provided' };
  model.jobs[4].duration = { state: 'unknown', reason: 'not-provided' };
  return model;
}
const hypotheses: Hypothesis[] = [
  { id: 'cuadro', question: '¿Cuánto dura montar el cuadro Este?', target: { type: 'job-duration', jobId: 'cuadro-este' }, values: [300, 420] },
  { id: 'bomba-alt', question: '¿Cuándo estaría la bomba equivalente?', target: { type: 'material-availability', materialId: 'mat-bomba-alt' }, values: ['2026-11-10T07:00:00Z', '2026-11-13T07:00:00Z'] },
];

test('el dato que más cambia la decisión es la fecha de la bomba equivalente, no la duración del cuadro', () => {
  const model = withGaps(), before = JSON.stringify(model);
  const result = whatToCheckFirst(model, [], alternatives, fridayObjectives, hypotheses);
  assert.equal(JSON.stringify(model), before);
  assert.deepEqual([result.kind, result.hypothetical, result.method, result.probabilities, result.optimality], ['proposal', true, 'one-at-a-time', 'none', 'proven-within-model']);
  assert.deepEqual(result.priorityCommitments, ['c-inst-norte']);
  assert.equal(result.mostDecisive, 'bomba-alt');
  assert.deepEqual(result.ranking.map(row => [row.hypothesisId, row.decisionChanges, row.viabilityFlips]), [['bomba-alt', true, 1], ['cuadro', false, 0]]);
  const [bomba, cuadro] = result.ranking, cell = (row: typeof bomba, value: number, id: string) => row.byValue[value].cells.find(item => item.alternativeId === id)!;
  // Si la bomba equivalente está el martes, usarla es una de las mejores respuestas; si llega el viernes, deja de serlo y la instalación Norte no llega con ella.
  assert.ok(bomba.byValue[0].best.includes('o-bomba-alt'));
  assert.ok(!bomba.byValue[1].best.includes('o-bomba-alt'));
  assert.deepEqual([cell(bomba, 0, 'o-bomba-alt').priority, cell(bomba, 1, 'o-bomba-alt').priority], [{ 'c-inst-norte': 'on-time' }, { 'c-inst-norte': 'late' }]);
  // Las demás alternativas no dependen de ese dato.
  for (const id of ['sin-cambios', 'o-extra-cruz', 'o-mover-norte', 'o-dividir-norte']) assert.deepEqual(cell(bomba, 0, id).key, cell(bomba, 1, id).key, id);
  // La duración del cuadro no cambia cuál es la mejor respuesta ni la llegada de la instalación prioritaria.
  assert.deepEqual(cuadro.byValue[0].best, cuadro.byValue[1].best);
  // Mientras se varía un dato, el otro sigue ausente: no se inventa.
  assert.ok(cell(bomba, 0, 'sin-cambios').key!.missedByTier[1] >= 1, 'el cuadro sin duración sigue sin darse por cumplido');
});

test('cada celda es reproducible con el planificador y ningún dato se rellena sin declararlo', () => {
  const model = withGaps(), result = whatToCheckFirst(model, [], alternatives, fridayObjectives, hypotheses);
  const row = result.ranking.find(item => item.hypothesisId === 'bomba-alt')!;
  for (const [index, value] of (['2026-11-10T07:00:00Z', '2026-11-13T07:00:00Z'] as const).entries()) {
    const direct = planSchedule(applySuppositions(model, [fridayOptions[1], { id: 'h', type: 'material-availability', materialId: 'mat-bomba-alt', availableAt: value }]), fridayObjectives);
    assert.deepEqual(row.byValue[index].cells.find(item => item.alternativeId === 'o-bomba-alt')!.key, direct.key);
  }
  // Una alternativa que hace desaparecer el trabajo de la hipótesis queda como «no aplicable», no como cero.
  const split = whatToCheckFirst(model, [], [{ id: 'dividir', suppositions: [fridayOptions[3]] }, { id: 'sin-cambios', suppositions: [] }], fridayObjectives,
    [{ id: 'norte', question: '¿Cuánto dura la instalación Norte?', target: { type: 'job-duration', jobId: 'inst-norte' }, values: [480, 720] }]);
  assert.deepEqual(split.ranking[0].byValue.map(entry => entry.cells.map(item => item.applicable)), [[false, true], [false, true]]);
  assert.deepEqual(split.ranking[0].byValue.map(entry => entry.best), [['sin-cambios'], ['sin-cambios']]);
  // Una duración posible mucho mayor sí cambia la llegada: el valor declarado se usa tal cual.
  const long = whatToCheckFirst(model, [], [{ id: 'sin-cambios', suppositions: [] }], fridayObjectives,
    [{ id: 'norte', question: '¿Cuánto dura la instalación Norte?', target: { type: 'job-duration', jobId: 'inst-norte' }, values: [480, 900] }]);
  assert.deepEqual(long.ranking[0].byValue.map(entry => entry.cells[0].priority['c-inst-norte'] === 'on-time'), [true, false]);
  assert.deepEqual([long.ranking[0].viabilityFlips, long.mostDecisive], [1, 'norte']);
  // Sin nada que cambie, no se señala ningún dato como decisivo.
  const none = whatToCheckFirst(fridayCase('healthy'), [], [{ id: 'sin-cambios', suppositions: [] }], fridayObjectives,
    [{ id: 'cuadro', question: '¿Cuánto dura el cuadro?', target: { type: 'job-duration', jobId: 'cuadro-este' }, values: [200, 300] }]);
  assert.equal(none.mostDecisive, null);
});

test('límites y entradas inválidas', () => {
  const model = withGaps(), bad = (run: () => unknown) => assert.throws(run, OperationalInputError);
  bad(() => whatToCheckFirst(model, [], [], fridayObjectives, hypotheses));
  bad(() => whatToCheckFirst(model, [], alternatives, fridayObjectives, [{ ...hypotheses[0], values: [300] } as Hypothesis]));
  bad(() => whatToCheckFirst(model, [], alternatives, fridayObjectives, [hypotheses[0], hypotheses[0]]));
  bad(() => whatToCheckFirst(model, [], alternatives, fridayObjectives, [{ ...hypotheses[0], values: [300, 0.5] } as Hypothesis]));
  bad(() => whatToCheckFirst(model, [], [alternatives[0], alternatives[0]], fridayObjectives, hypotheses));
});

test('en la empresa completa: comprobar la bomba equivalente decide más que la duración del ticket 07, sin afirmar prueba', () => {
  const model = structuredClone(companyWeek());
  model.materials[1].availableAt = { state: 'unknown', reason: 'not-provided' };
  const considered: ConsideredAlternative[] = [{ id: 'sin-cambios', suppositions: [] }, { id: 'o-bomba-alt', suppositions: [companyOptions[1]] }, { id: 'o-mover-i07', suppositions: [companyOptions[2]] }];
  const result = whatToCheckFirst(model, [], considered, companyObjectives, [
    { id: 'a-ticket-07', question: '¿Cuánto dura el ticket de producción solar?', target: { type: 'job-duration', jobId: 't07' }, values: [45, 240] },
    { id: 'bomba-alt', question: '¿Cuándo estaría la bomba equivalente?', target: { type: 'material-availability', materialId: 'mat-bomba-alt' }, values: [companyDay(10, 7), companyDay(13, 7)] },
  ], { seed: 1 });
  assert.deepEqual([result.mostDecisive, result.optimality], ['bomba-alt', 'best-found']);
  assert.deepEqual(result.ranking.map(row => row.hypothesisId), ['bomba-alt', 'a-ticket-07']);
  assert.ok(result.ranking[0].viabilityFlips >= 1);
  assert.equal(result.ranking[1].viabilityFlips, 0);

  // Con planes sin prueba, una opción que no mejora no se llama «dominada»: se dice que no se encontró un plan mejor.
  const earlyHour = { id: 'o-hora-viernes', type: 'add-capacity' as const, resourceId: 'tech-cruz', start: companyDay(13, 6), end: companyDay(13, 7) };
  const options = compareOptionsLarge(companyWeek(), [], [earlyHour], companyObjectives, { seed: 1 });
  assert.deepEqual(options.discarded, [{ suppositionIds: ['o-hora-viernes'], reason: 'no-better-plan-found' }]);
});
