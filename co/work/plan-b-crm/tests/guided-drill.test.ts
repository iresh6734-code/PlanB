import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceDrill, drillSummary, nextStep, startDrill, DRILL_STEPS, type DrillSignal } from '../src/app-shell/guided-drill.js';

const base: DrillSignal = { page: 'home', entity: 'contacts', query: '', searchOpen: false, recordOpen: null };
const at = (seconds: number) => 1_000_000 + seconds * 1000;

test('recorrido completo en orden: cada paso se marca con su hora y al final queda terminado', () => {
  let state = startDrill(at(0));
  state = advanceDrill(state, { ...base, page: 'workspace' }, at(10));
  assert.deepEqual(Object.keys(state.done), ['open']); assert.equal(nextStep(state)!.id, 'find');
  state = advanceDrill(state, { ...base, page: 'workspace', query: 'lu' }, at(25));
  state = advanceDrill(state, { ...base, page: 'workspace', query: 'lu', recordOpen: 'contacts' }, at(40));
  state = advanceDrill(state, { ...base, page: 'today' }, at(70));
  assert.equal(state.finishedAt, null);
  state = advanceDrill(state, { ...base, page: 'export' }, at(95));
  assert.equal(state.finishedAt, at(95)); assert.equal(nextStep(state), null);
  const summary = drillSummary(state, at(200));
  assert.equal(summary.complete, true); assert.equal(summary.doneCount, 5); assert.equal(summary.elapsed, '1 min 35 s');
  assert.equal(summary.lines[2], '✓ Abre su ficha y mira lo relacionado (40 s)');
});

test('los pasos son acumulativos: buscar o abrir una ficha sin pasar por la lista de clientes no cuenta', () => {
  let state = startDrill(at(0));
  state = advanceDrill(state, { ...base, page: 'workspace', entity: 'deals', query: 'norte', recordOpen: 'deals' }, at(5));
  assert.deepEqual(state.done, {}, 'otra lista no es la de clientes');
  state = advanceDrill(state, { ...base, page: 'workspace', query: 'n' }, at(8));
  assert.deepEqual(Object.keys(state.done), ['open'], 'una sola letra no es una búsqueda');
  state = advanceDrill(state, { ...base, page: 'workspace', recordOpen: 'contacts' }, at(9));
  assert.equal(state.done.record, undefined, 'la ficha cuenta después de encontrar');
  state = advanceDrill(state, { ...base, page: 'home', searchOpen: true }, at(12));
  assert.equal(state.done.find, at(12), 'el buscador global también vale para encontrar');
});

test('Hoy y Exportar valen en cualquier orden; sin cambios devuelve el mismo objeto', () => {
  let state = startDrill(at(0));
  state = advanceDrill(state, { ...base, page: 'export' }, at(3));
  state = advanceDrill(state, { ...base, page: 'today' }, at(4));
  assert.deepEqual(Object.keys(state.done).sort(), ['export', 'today']);
  const same = advanceDrill(state, { ...base, page: 'today' }, at(6));
  assert.equal(same, state);
});

test('resumen a medias: dice qué falta, cuánto va y qué no demuestra', () => {
  const state = advanceDrill(startDrill(at(0)), { ...base, page: 'workspace' }, at(20));
  const summary = drillSummary(state, at(65));
  assert.equal(summary.complete, false); assert.equal(summary.doneCount, 1); assert.equal(summary.elapsed, '1 min 05 s');
  assert.equal(summary.lines[1], '· Encuentra a un cliente — sin hacer');
  assert.match(summary.limit, /Probar mi Plan B/);
  assert.equal(DRILL_STEPS.length, 5);
});
