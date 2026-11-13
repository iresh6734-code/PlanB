import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { buildRescuePlan, compareBudgets, validBudget } from '../shared/rescue-plan.js';
import { mkdirSync } from 'node:fs';
import { RescueRoom } from '../server/rescue-room.js';
import { TMP, clock, track, viewOf } from './helpers/rescue-room-harness.js';
// Plan por tiempo disponible sobre la cola existente. Expectativas escritas a mano; no reimplementan el algoritmo.
const spec = makeDemoSpec(makeFixture('agency'));
const task = (id: string, values: Record<string, string | null>): CrmRecord => ({ entity: 'tasks', id, values: { subject: 'T ' + id, status: 'pending', due_date: '2026-11-05', ...values } });
const EVAL = Date.parse('2026-11-02T07:00:00.000Z'); // 08:00 en Madrid (CET)
const queue = (records: CrmRecord[], at = EVAL, limit = 200) => buildResponseQueue({ spec, records, evaluatedAt: at, horizonHours: 24, limit });

test('estado desconocido, vencimiento ausente o inválido y completadas: cada caso cae donde la cola dice y el plan lo explica', () => {
  const q = queue([task('a', { due_date: '2026-10-30' }), task('b', { due_date: '2026-11-02' }), task('c', { due_date: null }), task('d', { due_date: 'no-es-fecha' }), task('e', { status: 'otro' }), task('f', { status: 'completed' }), task('g', { due_date: '2026-12-01' })]);
  assert.deepEqual(q.items.map(i => i.id), ['a', 'b', 'e', 'c', 'd', 'g'], 'vencida, hoy, revisión (con fecha antes que sin ella o inválida) y más tarde');
  assert.equal(q.summary.completedTasks, 1); assert.equal(q.summary.unknownStatusTasks, 1);
  const plan = buildRescuePlan(q, { budgetMinutes: 120, estimates: { a: 30, b: 30, c: 30, d: 30, e: 30, g: 30 } });
  assert.equal(plan.excluded.find(x => x.id === 'e')!.reason, 'unknown-status', 'un estado que no se puede confirmar no se planifica');
  assert.ok(plan.included.map(x => x.id).includes('c') && plan.included.map(x => x.id).includes('d'), 'una fecha ausente o inválida va a revisión pero cabe si hay estimación');
  assert.ok(!plan.included.some(x => x.id === 'f'), 'una tarea completada no entra');
});

test('estimación ausente o fuera de rango es desconocida, nunca 0; presupuesto inválido se rechaza', () => {
  const q = queue([task('a', {}), task('b', {}), task('c', {})]);
  const plan = buildRescuePlan(q, { budgetMinutes: 60, estimates: { a: 0, b: 4, c: 481 } });
  assert.equal(plan.included.length, 0); assert.equal(plan.unknownEstimates, 3); assert.ok(plan.excluded.every(e => e.reason === 'no-estimate'));
  for (const bad of [0, -5, 1.5, 481, Number.NaN, Infinity]) assert.throws(() => buildRescuePlan(q, { budgetMinutes: bad, estimates: {} }), RangeError, String(bad));
  assert.equal(validBudget(480), true); assert.equal(validBudget('60'), false);
  assert.equal(buildRescuePlan(q, { budgetMinutes: 60, estimates: { a: 5 } }).included.length, 1, 'el mínimo declarado de 5 min es válido');
});

test('regla voraz: respeta el orden de negocio, una tarea posterior más corta puede entrar y un bloqueo manual se declara como tal', () => {
  const q = queue([task('a', { due_date: '2026-10-30' }), task('b', { due_date: '2026-10-31' }), task('c', { due_date: '2026-11-02' })]);
  const plan = buildRescuePlan(q, { budgetMinutes: 50, estimates: { a: 30, b: 30, c: 20 } });
  assert.deepEqual(plan.included.map(e => [e.id, e.startMinute, e.endMinute]), [['a', 0, 30], ['c', 30, 50]]);
  assert.equal(plan.excluded.find(e => e.id === 'b')!.reason, 'exceeds-remaining'); assert.equal(plan.remainingMinutes, 0);
  const blocked = buildRescuePlan(q, { budgetMinutes: 50, estimates: { a: 30, b: 30, c: 20 }, blocked: { a: 'Espera la firma del cliente' } });
  assert.equal(blocked.excluded.find(e => e.id === 'a')!.reason, 'blocked-by-operator'); assert.match(blocked.excluded.find(e => e.id === 'a')!.detail, /declaración manual, no una dependencia inferida/);
});

test('comparar 30 y 60 minutos muestra un cambio causal con el mismo fixture, reloj y estimaciones', () => {
  const q = queue([task('a', { due_date: '2026-10-30' }), task('b', { due_date: '2026-10-31' }), task('c', { due_date: '2026-11-02' })]);
  const c = compareBudgets(q, 30, 60, { a: 20, b: 15, c: 25 });
  assert.deepEqual(c.a.included.map(e => e.id), ['a']); assert.deepEqual(c.b.included.map(e => e.id), ['a', 'b', 'c']);
  assert.deepEqual(c.onlyInB, ['b', 'c']); assert.deepEqual(c.onlyInA, []); assert.equal(c.deltaMinutes, 40);
});

test('fechas: un día civil sin hora y el cambio de día en Madrid se comparan por día, no por instante', () => {
  const day = [task('x', { due_date: '2026-11-01' })];
  const justBefore = queue(day, Date.parse('2026-11-01T22:30:00Z')), justAfter = queue(day, Date.parse('2026-11-01T23:30:00Z'));
  assert.equal(justBefore.items[0].bucket, 'due-in-window', '23:30 del 1/11 en Madrid: el día aún es hoy');
  assert.equal(justAfter.items[0].bucket, 'overdue', '00:30 del 2/11 en Madrid: el día ya pasó');
  assert.equal(queue([task('y', { due_date: '2026-02-30' })]).items[0].due.kind, 'invalid', 'una fecha imposible no se adapta a medianoche');
});

test('más de 200 tareas abiertas: el plan solo considera las 200 visibles y lo declara; el resumen cuenta todas', () => {
  const records = Array.from({ length: 250 }, (_, i) => task('t' + String(i).padStart(3, '0'), { due_date: '2026-11-0' + (1 + i % 9) }));
  const q = queue(records); assert.equal(q.summary.totalQueued, 250); assert.equal(q.items.length, 200); assert.equal(q.summary.truncated, true);
  const plan = buildRescuePlan(q, { budgetMinutes: 480, estimates: Object.fromEntries(records.map(r => [r.id, 5])) });
  assert.equal(plan.notConsidered, 50); assert.equal(plan.considered, 200); assert.ok(plan.included.length <= 96, '480 min / 5 min ⇒ como máximo 96 tareas');
  assert.ok(plan.limitations.some(l => /200/.test(l)));
});

test('inventario de 10.000 registros: recuentos completos, tiempos medidos y sin garantía inventada', { timeout: 120_000 }, () => {
  mkdirSync(TMP, { recursive: true });
  const room = track(RescueRoom.create(TMP, { clock, extraTasks: 9938 }));
  const t0 = performance.now(), v = viewOf(room), ms = Math.round(performance.now() - t0);
  assert.equal(v.capture.records, 10_000); assert.equal(v.queue.summary.totalTasks, 18 + 9938);
  assert.equal(v.queue.summary.returned, 200); assert.equal(v.queue.summary.truncated, true); assert.ok(v.queue.summary.totalQueued > 9900, 'el resumen no deriva de los 200 visibles');
  console.log('RESCUE106-MEDIDA view() con 10.000 registros: ' + ms + ' ms (medida de esta máquina, sin garantía)');
  assert.ok(ms < 30_000, 'tope generoso para detectar regresiones graves, no una promesa de rendimiento');
  room.close();
});
