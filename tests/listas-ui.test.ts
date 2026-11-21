// B4.5 · Listas: barra inferior solo de la lista, vistas a 0 al final y columnas con proporción.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Runtime, View, setupGlobals, type HostNode } from './helpers/independent-interface-harness.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { columnPlan } from '../src/app-shell/record-columns.js';
import type { Field } from '../shared/model.js';

const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const noop = () => {};

async function render(entityName: string) {
  const restore = setupGlobals();
  const rt = new Runtime(path.resolve('.'), {
    'saved-views-sync': { loadSavedViews: async () => null, storeSavedViews: async () => null },
    'lazy-pages': { PipelineCard: () => null, PipelineStats: () => null, RescheduleBar: () => null },
    ProBadge: { ProBadge: () => null }, BulkBar: { BulkBar: () => null },
    index: { EmptyArt: () => null, EmptyState: () => null, ErrorState: () => null, Skeleton: () => null },
  });
  const { RecordsPage } = rt.load('src/app-shell/RecordsPage.tsx');
  const entity = spec.entities.find(item => item.id === entityName)!;
  const rows = snapshot.records.filter(record => record.entity === entityName);
  const v = new View(rt, RecordsPage, {
    state: { snapshot, spec, disconnected: true, changes: 2, runtime: false, ready: true }, spec, entity, entityName, rows, records: snapshot.records,
    total: rows.length, offset: 0, setOffset: noop, query: '', setQuery: noop, pipeline: '', setPipeline: noop, selected: null, setSelected: noop,
    recordsLoading: false, recordsError: '', moveDeal: async () => null, saveField: async () => null,
  });
  await v.settle();
  return { v, done: () => { v.unmount(); restore(); } };
}
const inside = (parent: HostNode, child: HostNode): boolean => parent.children.some(node => typeof node !== 'string' && (node === child || inside(node, child)));
const smartViews = (v: View) => v.all({ tag: 'button', className: /^gx-view$/ });

test('la barra inferior de la lista solo lleva dónde se guarda y la paginación: ni servicios, ni cobertura, ni el recuento repetido', async () => {
  const { v, done } = await render('contacts');
  try {
    const footer = v.maybe({ tag: 'footer' })!;
    assert.deepEqual(v.all({ tag: 'button', where: node => inside(footer, node) }).map(button => v.textOf(button)), ['Anterior', 'Siguiente']);
    const text = v.textOf(footer);
    assert.match(text, /Guardado en este ordenador/);
    assert.doesNotMatch(text, /Modo independiente|Copia local activa|cobertura|servicios|cambios? locales?/i);
  } finally { done(); }
});

test('las vistas rápidas a 0 van al final y atenuadas; elegida, una vista a 0 deja de atenuarse', async () => {
  const tasks = await render('tasks');
  try {
    const views = smartViews(tasks.v);
    const zero = views.map(button => button.props['data-zero'] === 'true');
    assert.ok(zero.includes(true) && zero.includes(false), 'el escenario tiene vistas con y sin registros');
    assert.equal(zero.indexOf(true), zero.lastIndexOf(false) + 1, 'ninguna vista con registros queda detrás de una a 0');
  } finally { tasks.done(); }
  const contacts = await render('contacts');
  try {
    const first = smartViews(contacts.v)[0], label = contacts.v.textOf(first);
    assert.equal(first.props['data-zero'], 'true');
    contacts.v.click(first); await contacts.v.settle();
    const chosen = smartViews(contacts.v).find(button => contacts.v.textOf(button) === label)!;
    assert.equal(chosen.props['aria-pressed'], true);
    assert.equal(chosen.props['data-zero'], undefined);
  } finally { contacts.done(); }
});

test('las columnas reparten el ancho según su dato y la tabla con pocas columnas no se estira', async () => {
  const { v, done } = await render('companies');
  try {
    const entity = spec.entities.find(item => item.id === 'companies')!;
    const widths = v.all({ tag: 'col' }).filter(col => !col.props.className).map(col => col.props.style.width);
    assert.equal(widths.length, entity.columns.length);
    assert.deepEqual(widths, columnPlan(entity.columns, entity.fields, entity.displayField).map(column => column.width));
    assert.equal(v.maybe({ className: /table-container/ })!.props['data-narrow'], 'true');
  } finally { done(); }
});

test('columnPlan: nombre, correo y web pesan doble; los importes se alinean a la derecha', () => {
  const field = (key: string, type: Field['type'], label = key) => ({ key, label, type }) as Field;
  const plan = columnPlan(['name', 'email', 'website', 'phone', 'amount', 'ghost'], [field('name', 'text'), field('email', 'email'), field('website', 'text', 'Sitio web'), field('phone', 'text', 'Teléfono'), field('amount', 'number', 'Importe')], 'name');
  assert.deepEqual(plan.map(column => [column.key, column.weight, column.align, column.width]), [
    ['name', 2, 'start', '25%'], ['email', 2, 'start', '25%'], ['website', 2, 'start', '25%'], ['phone', 1, 'start', '12.5%'], ['amount', 1, 'end', '12.5%'],
  ]);
});
