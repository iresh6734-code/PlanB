import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { daysBetween, doneOption, overdueTasks } from '../src/app-shell/focus.js';

// «Despachar vencidas» (fase 2 del plan Faro 2): lógica pura.
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const records = structuredClone(snapshot.records) as CrmRecord[];

test('doneOption reconoce «Completada» como estado hecho', () => {
  assert.deepEqual(doneOption(spec), { key: 'status', id: 'completed', label: 'Completada' });
});

test('doneOption devuelve null si ninguna opción significa hecha', () => {
  const other = structuredClone(spec); other.entities.find(entity => entity.id === 'tasks')!.fields.find(field => field.key === 'status')!.options = [{ id: 'a', label: 'Abierta' }, { id: 'b', label: 'Bloqueada' }];
  assert.equal(doneOption(other), null);
});

test('overdueTasks: solo abiertas y anteriores a hoy, de la más antigua a la más reciente', () => {
  const list = overdueTasks(spec, records, '2026-11-10');
  assert.ok(list.length > 0);
  for (const task of list) { assert.ok(String(task.values.due_date) < '2026-11-10'); assert.notEqual(task.values.status, 'completed'); }
  const dates = list.map(task => String(task.values.due_date)); assert.deepEqual(dates, [...dates].sort());
  const expected = records.filter(record => record.entity === 'tasks' && String(record.values.due_date) < '2026-11-10' && record.values.status !== 'completed').length;
  assert.equal(list.length, expected);
});

test('overdueTasks: una tarea de hoy no está vencida y una sin fecha legible se ignora', () => {
  const extra = [{ entity: 'tasks', id: 'hoy', values: { subject: 'Hoy', due_date: '2026-11-10', status: 'pending' } }, { entity: 'tasks', id: 'mal', values: { subject: 'Mal', due_date: 'pronto', status: 'pending' } }] as CrmRecord[];
  assert.deepEqual(overdueTasks(spec, extra, '2026-11-10'), []);
});

test('daysBetween cuenta días de calendario', () => {
  assert.equal(daysBetween('2026-11-02', '2026-11-13'), 11);
  assert.equal(daysBetween('2026-11-13', '2026-11-13'), 0);
});
