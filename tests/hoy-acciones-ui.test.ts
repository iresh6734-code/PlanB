import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Runtime, View, setupGlobals, type HostNode } from './helpers/independent-interface-harness.js';

// B4.4 · Hoy: una sola acción rellena, «Despachar» junto al filtro Vencidas, estado y fecha en una celda y el filtro que pide Agenda.
const root = path.resolve('.');
const task = (id: string, bucket: string, due: string, dueKind = 'date') => ({ id, label: 'Llamar · Cliente ' + id, bucket, due, dueKind, reasons: [], nextAction: '' });
const operations = (phase: 'imported' | 'active') => ({
  format: 'planb-local-operations-v1', revision: 'a'.repeat(64), evaluatedAt: '2026-11-20T08:00:00.000Z',
  context: { instanceId: '00000000-0000-4000-8000-000000000001', phase, name: 'Copia ficticia', captureId: 'c1', capturedAt: null, isTestData: true },
  reviewable: true, unavailableReason: null,
  counts: { records: 3, tasks: 3, completed: 0, open: 3, unknownStatus: 0, overdue: 2, upcoming: 1, needsReview: 0, queued: 3, returned: 3 },
  tasks: [task('a', 'overdue', '2020-01-10'), task('b', 'overdue', '2020-01-12'), task('c', 'due-in-window', '2099-01-01T15:00:00Z', 'instant')],
  limitations: [], lastReview: null,
});

async function mount(phase: 'imported' | 'active', props: Record<string, unknown> = {}) {
  const restore = setupGlobals();
  const rt = new Runtime(root, {
    'local-operations-client': { loadLocalOperations: async () => operations(phase), loadLocalWorkQueue: async () => { throw new Error('sin cola'); }, runLocalReview: async () => { throw new Error('sin revisión'); }, LocalOperationsError: class extends Error {} },
    'local-task-focus-client': { readContext: async () => ({ context: null }) },
    ContinuityDay: { ContinuityDay: () => null }, LocalTaskFocus: { LocalTaskFocus: () => null },
    TaskOutcomesHost: { useTaskOutcomes: () => null }, useContingency: { useContingency: () => false },
  });
  const { LocalOperations } = rt.load('src/LocalOperations.tsx');
  const view = new View(rt, LocalOperations, { view: 'today', onOpenTasks() {}, onOpenDeals() {}, onOpenProposals() {}, onPrepare() {}, ...props });
  await view.settle();
  return { view, close() { view.unmount(); restore(); } };
}
const filled = (view: View) => view.all({ tag: 'button', where: node => /\bprimary\b/.test(String(node.props.className ?? '')) });
const contains = (parent: HostNode, child: HostNode): boolean => parent.children.some(node => typeof node !== 'string' && (node === child || contains(node, child)));

test('B4.4 · Hoy importada: «Continuar preparación» es la única acción rellena; «Organizar mi jornada» pasa a secundaria', async () => {
  const { view, close } = await mount('imported', { onDispatch() {} });
  try {
    assert.deepEqual(filled(view).map(button => view.textOf(button)), ['Continuar preparación']);
    assert.match(String(view.find({ tag: 'button', text: 'Organizar mi jornada' }).props.className), /\bsecondary\b/);
    assert.equal(view.maybe({ tag: 'button', text: 'Despachar' }), null, 'sin copia activa no se despacha');
  } finally { close(); }
});

test('B4.4 · Hoy activa: una acción rellena y «Despachar» va junto al filtro Vencidas, no entre las acciones de la cola', async () => {
  let dispatched = 0;
  const { view, close } = await mount('active', { onDispatch() { dispatched++; } });
  try {
    assert.deepEqual(filled(view).map(button => view.textOf(button)), ['Organizar mi jornada']);
    const dispatch = view.find({ tag: 'button', text: 'Despachar' });
    assert.equal(dispatch.props['aria-label'], 'Despachar las 2 tareas vencidas de la copia, una a una');
    assert.ok(contains(view.find({ role: 'group', label: 'Filtrar las tareas mostradas' }), dispatch));
    view.click(dispatch); assert.equal(dispatched, 1);
  } finally { close(); }
});

test('B4.4 · Hoy: tres columnas; la fecha lleva el tono y los días de retraso, sin etiqueta de estado repetida', async () => {
  const { view, close } = await mount('active');
  try {
    assert.equal(view.all({ role: 'columnheader' }).length, 3);
    assert.equal(view.all({ className: /\boc-chip\b/ }).length, 0, 'el estado ya lo dice el título del grupo');
    const dues = view.all({ className: 'oc-due' });
    assert.deepEqual(dues.map(due => due.props['data-tone']), ['danger', 'danger', 'warn']);
    assert.match(view.textOf(dues[0]), /^10 ene · \d+ d$/);
  } finally { close(); }
});

test('B4.4 · el enlace de Agenda abre Hoy filtrado por Vencidas y la petición se consume una vez', async () => {
  let handled = 0;
  const { view, close } = await mount('active', { filterRequest: 'overdue', onFilterHandled() { handled++; } });
  try {
    assert.equal(handled, 1);
    assert.equal(view.find({ tag: 'button', className: 'oc-filter', text: /^Vencidas/ }).props['aria-pressed'], true);
    assert.equal(view.all({ tag: 'li', role: 'row' }).length, 2, 'solo las vencidas');
  } finally { close(); }
});
