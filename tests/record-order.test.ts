// V1 · Orden y filtro de la lista en el servidor: lógica pura de shared/record-order.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CrmRecord, Entity, Field } from '../shared/model.js';
import { compareByField, facetCounts, formatRecordSort, matchesField, orderRecords, parseRecordSort, recordLabel } from '../shared/record-order.js';

const field = (key: string, type: Field['type'], extra: Partial<Field> = {}): Field => ({ key, label: key, type, required: false, readOnly: false, options: [], referenceEntity: null, ...extra });
const rec = (id: string, values: CrmRecord['values'], entity: CrmRecord['entity'] = 'deals'): CrmRecord => ({ id, entity, values });
const ids = (list: CrmRecord[]) => list.map(record => record.id);
const none = () => undefined;

test('orden: «campo:asc|desc» de ida y vuelta, y nada más', () => {
  assert.deepEqual(parseRecordSort('amount:desc'), { key: 'amount', dir: -1 });
  assert.equal(formatRecordSort({ key: 'amount', dir: 1 }), 'amount:asc');
  for (const bad of ['', 'amount', 'amount:up', '1x:asc', 'a b:asc', 'amount:asc:desc']) assert.equal(parseRecordSort(bad), null, bad);
});

test('números por valor y fechas por instante; los vacíos siempre al final', () => {
  const list = [rec('a', { n: '9' }), rec('b', { n: 10 }), rec('c', { n: '' }), rec('d', { n: 2 })];
  assert.deepEqual(ids([...list].sort(compareByField(field('n', 'number'), 1, none))), ['d', 'a', 'b', 'c']);
  assert.deepEqual(ids([...list].sort(compareByField(field('n', 'number'), -1, none))), ['b', 'a', 'd', 'c']);
  const dates = [rec('x', { d: '2026-12-01' }), rec('y', { d: null }), rec('z', { d: '2026-02-15' })];
  assert.deepEqual(ids([...dates].sort(compareByField(field('d', 'date'), 1, none))), ['z', 'x', 'y']);
  assert.deepEqual(ids([...dates].sort(compareByField(field('d', 'date'), -1, none))), ['x', 'z', 'y']);
});

test('listas por el orden de sus opciones y referencias por el nombre enlazado', () => {
  const stage = field('s', 'enum', { options: [{ id: 'lead', label: 'Zeta' }, { id: 'won', label: 'Alfa' }] });
  assert.deepEqual(ids([rec('1', { s: 'won' }), rec('2', { s: 'lead' })].sort(compareByField(stage, 1, none))), ['2', '1']);
  const company = field('c', 'reference', { referenceEntity: 'companies' });
  const names: Record<string, string> = { c1: 'Óptica Sur', c2: 'Agencia Norte' };
  const sorted = [rec('1', { c: 'c1' }), rec('2', { c: 'c2' }), rec('3', {})].sort(compareByField(company, 1, (_, id) => names[id]));
  assert.deepEqual(ids(sorted), ['2', '1', '3']);
});

test('texto en español con números naturales y sin distinguir mayúsculas ni tildes', () => {
  const list = [rec('a', { t: 'Cliente 10' }), rec('b', { t: 'cliente 9' }), rec('c', { t: 'Álvaro' })];
  assert.deepEqual(ids(list.sort(compareByField(field('t', 'text'), 1, none))), ['c', 'b', 'a']);
});

test('filtros: igualdad exacta y pertenencia en selección múltiple; recuento por opción', () => {
  assert.ok(matchesField(rec('a', { m: 'rojo; verde' }), field('m', 'multiselect'), 'verde'));
  assert.ok(!matchesField(rec('a', { m: 'rojo' }), field('m', 'multiselect'), 'ro'));
  assert.ok(matchesField(rec('a', { b: true }), field('b', 'boolean'), 'true'));
  const status = field('status', 'enum', { options: [{ id: 'open', label: 'Abierta' }, { id: 'done', label: 'Hecha' }] });
  const entity: Entity = { id: 'tasks', label: 'Tareas', singular: 'tarea', displayField: 'subject', columns: ['subject'], fields: [field('subject', 'text'), status] };
  const list = [rec('1', { status: 'open', subject: 'B' }, 'tasks'), rec('2', { status: 'done', subject: 'A' }, 'tasks'), rec('3', { status: 'open', subject: 'A' }, 'tasks'), rec('4', { status: 'constructor' }, 'tasks')];
  assert.deepEqual(ids(orderRecords(list, entity, { status: 'open' }, { key: 'subject', dir: 1 }, none)), ['3', '1']);
  assert.deepEqual(facetCounts(list, status), { open: 2, done: 1 });
});

test('nombre visible igual que en la App: principal + apellido en clientes, o el id', () => {
  const contacts = { displayField: 'firstname' } as Entity;
  assert.equal(recordLabel(rec('c1', { firstname: 'Lucía', lastname: 'Mora' }, 'contacts'), contacts), 'Lucía Mora');
  assert.equal(recordLabel(rec('c2', {}, 'contacts'), contacts), 'c2');
});
