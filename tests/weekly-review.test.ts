import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { Change, CrmRecord } from '../shared/model.js';
import { nextStepTask, postponeCounts, reviewHeadline, reviewText, weeklyReview } from '../src/app-shell/weekly-review.js';

const spec = makeDemoSpec(makeFixture('agency'));
const now = new Date('2026-11-20T10:00:00Z');
const task = (id: string, due: string | null, status = 'pending', deal: string | null = null): CrmRecord => ({ id, entity: 'tasks', values: { subject: 'Tarea ' + id, due_date: due, status, contact_id: null, deal_id: deal, notes: '' } });
const deal = (id: string, stage: string, amount: number | null = 1000): CrmRecord => ({ id, entity: 'deals', values: { dealname: 'Op ' + id, amount, dealstage: stage, company_id: null, contact_id: null, service: 'web', closedate: '2026-12-01' } });
let seq = 0;
const change = (before: CrmRecord | null, after: CrmRecord, at: string): Change => ({ id: ++seq, at, entity: after.entity, recordId: after.id, operation: before ? 'update' : 'create', before, after });
const nameOf = (record: CrmRecord) => String(record.values.subject ?? record.values.dealname);
const review = (tasks: CrmRecord[], deals: CrmRecord[], changes: Change[], tasksComplete = true) => weeklyReview({ spec, tasks, deals, changes, now, tasksComplete, nameOf });

test('revisión: hechas y ganadas salen del diario de los últimos siete días, una vez y sin las deshechas', () => {
  const a = task('a', '2026-11-18'), b = task('b', '2026-11-10'), c = task('c', '2026-11-19');
  const changes = [
    change(a, task('a', '2026-11-18', 'completed'), '2026-11-18T09:00:00Z'),
    change(task('a', '2026-11-18', 'completed'), a, '2026-11-18T09:05:00Z'),
    change(a, task('a', '2026-11-18', 'completed'), '2026-11-19T08:00:00Z'),
    change(b, task('b', '2026-11-10', 'completed'), '2026-11-13T22:30:00Z'),   // 13/11 en Madrid: fuera de la ventana
    change(c, task('c', '2026-11-19', 'completed'), '2026-11-19T10:00:00Z'),   // luego se deshizo: hoy sigue pendiente
    change(deal('d1', 'negotiation', 5000), deal('d1', 'won', 5000), '2026-11-17T12:00:00Z'),
    change(deal('d2', 'won'), deal('d2', 'won', 2000), '2026-11-17T12:00:00Z'),
  ];
  const result = review([task('a', '2026-11-18', 'completed'), task('b', '2026-11-10', 'completed'), c], [deal('d1', 'won', 5000), deal('d2', 'won', 2000)], changes);
  assert.equal(result.from, '2026-11-14');
  assert.equal(result.to, '2026-11-20');
  assert.deepEqual(result.done.map(item => item.id), ['a']);
  assert.equal(result.done[0].at, '2026-11-19T08:00:00Z');
  assert.deepEqual(result.won.map(item => [item.id, item.amount]), [['d1', 5000]]);
});

test('revisión: tres aplazamientos hacia delante la llevan a «pospuestas» y sale de «vencidas»', () => {
  const moves = (id: string, days: string[]) => days.slice(1).map((day, index) => change(task(id, days[index]), task(id, day), '2026-11-0' + (index + 1) + 'T10:00:00Z'));
  const changes = [...moves('p', ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-08']), ...moves('q', ['2026-11-01', '2026-11-04', '2026-11-02', '2026-11-06'])];
  assert.equal(postponeCounts(changes, 'due_date').get('p'), 3);
  assert.equal(postponeCounts(changes, 'due_date').get('q'), 2, 'mover hacia atrás no cuenta');
  const result = review([task('p', '2026-11-08'), task('q', '2026-11-06'), task('r', '2026-11-19'), task('s', '2026-11-25'), task('t', '2026-11-01', 'completed')], [], changes);
  assert.deepEqual(result.postponed.map(item => [item.record.id, item.postponed]), [['p', 3]]);
  assert.deepEqual(result.overdue.map(item => [item.record.id, item.late]), [['q', 14], ['r', 1]]);
});

test('revisión: oportunidades abiertas sin tarea pendiente, por importe; sin todas las tareas no se afirma', () => {
  const deals = [deal('x', 'proposal', 300), deal('y', 'negotiation', 9000), deal('z', 'contact', null), deal('w', 'won'), deal('v', 'contact')];
  const tasks = [task('t1', '2026-11-25', 'pending', 'v'), task('t2', '2026-11-10', 'completed', 'x')];
  const result = review(tasks, deals, []);
  assert.deepEqual(result.noNext?.map(item => item.record.id), ['y', 'x', 'z']);
  assert.equal(result.noNext?.[0].stage, spec.stages.find(stage => stage.id === 'negotiation')!.label);
  assert.equal(result.pending, 3);
  assert.equal(review(tasks, deals, [], false).noNext, null);
});

test('revisión: el seguimiento de una oportunidad hereda sus enlaces, queda abierto y lleva fecha', () => {
  const op: CrmRecord = { ...deal('y', 'negotiation'), values: { ...deal('y', 'negotiation').values, contact_id: 'c1' } };
  const values = nextStepTask(spec, op, 'Op y', '2026-11-23');
  assert.equal(values?.deal_id, 'y');
  assert.equal(values?.contact_id, 'c1');
  assert.equal(values?.subject, 'Seguimiento: Op y');
  assert.equal(values?.due_date, '2026-11-23');
  assert.equal(values?.status, 'pending');
  assert.equal(nextStepTask(spec, op, 'Op y', 'mañana'), null);
  assert.equal(nextStepTask(spec, task('t', null), 'T', '2026-11-23'), null);
});

test('revisión: el texto copiado resume por secciones y no lleva identificadores internos', () => {
  const late = task('id-interno-7', '2026-11-17');
  const result = review([late], [deal('id-op-9', 'proposal', 1200)], []);
  const text = reviewText(result, 'Agencia');
  assert.match(text, /^Agencia · revisión del 14 nov al 20 nov/);
  assert.match(text, /Vencidas \(1\)\n- Tarea id-interno-7 · 3 días/);
  assert.match(text, /Oportunidades sin próximo paso \(1\)/);
  assert.doesNotMatch(text.replace(/Tarea id-interno-7|Op id-op-9/g, ''), /id-/);
  assert.equal(reviewHeadline(result), '0 tareas hechas · 2 cosas por decidir.');
});
