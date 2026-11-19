import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { daysBetween, doneOption, loadFocusReview, overdueTasks } from '../src/app-shell/focus.js';

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

const today = '2026-11-10';
const task = (id: number, due = '2026-11-15'): CrmRecord => ({
  id: String(id), entity: 'tasks', values: { due_date: due, status: 'pending' },
});

test('la revisión limita las peticiones y declara cuántas tareas quedaron fuera', async () => {
  const offsets: number[] = [];
  const controller = new AbortController();
  const review = await loadFocusReview(spec, today, async (offset, limit, signal) => {
    offsets.push(offset);
    assert.equal(limit, 100);
    assert.equal(signal, controller.signal);
    return { records: Array.from({ length: limit }, (_, index) => task(offset + index)), related: [], total: 350 };
  }, controller.signal);
  assert.deepEqual(offsets, [0, 100, 200]);
  assert.deepEqual(review, { tasks: [], related: [], scanned: 300, total: 350, complete: false });
});

test('las páginas repetidas y los totales cambiantes no certifican una revisión completa', async () => {
  const old = task(1, '2026-11-04'), late = task(2, '2026-11-05');
  const repeated = { ...old, values: { ...old.values, due_date: '2099-01-01' } };
  const signal = new AbortController().signal;
  const changing = await loadFocusReview(spec, today, async offset => {
    if (offset === 0) return { records: [old], related: [], total: 2 };
    return { records: [late], related: [], total: 1 };
  }, signal);
  assert.deepEqual(changing, { tasks: [old, late], related: [], scanned: 2, total: 2, complete: false });

  const duplicates = await loadFocusReview(spec, today, async offset => {
    if (offset === 0) return { records: [old], related: [], total: 2 };
    return { records: [repeated, late], related: [], total: 2 };
  }, signal);
  assert.deepEqual(duplicates, { tasks: [old, late], related: [], scanned: 2, total: 2, complete: false });
});

test('una lectura completa mantiene las vencidas ordenadas y sus relaciones', async () => {
  const first = task(1, '2026-11-02'), last = task(2, '2026-11-04');
  const related = records.filter(record => record.entity === 'contacts').slice(0, 1);
  const review = await loadFocusReview(spec, today, async () => ({
    records: [last, task(3), first], related, total: 3,
  }), new AbortController().signal);
  assert.deepEqual(review, { tasks: [first, last], related, scanned: 3, total: 3, complete: true });
});

test('cancelar una lectura descarta incluso la página que ignora la señal', async () => {
  const controller = new AbortController();
  const offsets: number[] = [];
  const read = loadFocusReview(spec, today, async (offset) => {
    offsets.push(offset);
    controller.abort();
    return { records: [task(1)], related: [], total: 350 };
  }, controller.signal);
  await assert.rejects(read, { name: 'AbortError' });
  assert.deepEqual(offsets, [0]);
});
