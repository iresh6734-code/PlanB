// CLAUDE-NAV-GROUP-RETURN · La cabecera de un grupo del menú lleva a su primer apartado si estás en otro, y solo pliega si ya estás en él.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { headerPress, navigationGroups } from '../src/app-shell/navigation.js';
import path from 'node:path';
import { Runtime, View, setupGlobals } from './helpers/independent-interface-harness.js';

const groups = navigationGroups({ runtime: false, testData: true, ready: true });
const group = (id: string) => groups.find(g => g.id === id)!;

test('desde otro apartado del mismo grupo, la cabecera vuelve al primero', () => {
  assert.equal(headerPress(group('today'), 'agents', 'contacts'), 'go', 'desde Propuestas, «Hoy» vuelve a la cola de Hoy');
  assert.equal(headerPress(group('continuity'), 'export', 'contacts'), 'go', 'desde Exportar, «Continuidad» vuelve a su inicio');
  assert.equal(headerPress(group('clients'), 'workspace', 'deals'), 'go', 'desde Oportunidades, «Clientes» vuelve a Clientes');
});

test('en el primer apartado, la cabecera pliega o despliega', () => {
  assert.equal(headerPress(group('today'), 'today', 'contacts'), 'toggle');
  assert.equal(headerPress(group('clients'), 'workspace', 'contacts'), 'toggle');
  assert.equal(headerPress(group('continuity'), 'continuity', 'contacts'), 'toggle');
});

test('fuera del grupo o en un grupo sin apartados, la cabecera lleva a él', () => {
  assert.equal(headerPress(group('today'), 'home', 'contacts'), 'go');
  assert.equal(headerPress(group('home'), 'home', 'contacts'), 'go', 'Inicio no tiene apartados');
});

test('el menú lateral usa la regla y deja el grupo desplegado al ir a su primer apartado', () => {
  const sidebar = fs.readFileSync('src/app-shell/Sidebar.tsx', 'utf8');
  assert.ok(sidebar.includes("headerPress(group, page, entityName) === 'toggle'"));
  assert.ok(sidebar.includes('(go(group.target), setOpen(previous => new Set([...previous, group.id])))'));
});

test('A4 el punto de preparación va junto a «Continuidad», con el tono del veredicto y oculto al lector', () => {
  const sidebar = fs.readFileSync('src/app-shell/Sidebar.tsx', 'utf8');
  assert.match(sidebar, /group\.id === 'continuity' && signals\.readiness/);
  assert.match(sidebar, /className="gx-ready-dot" data-tone=\{signals\.readiness\.tone\} aria-hidden="true"/, 'no cambia el nombre accesible del botón');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /readiness: readinessDot/, 'App entrega el veredicto al menú');
  assert.match(app, /readinessFor\(state, continuityStatus, new Date\(\)\)/, 'con el estado ya leído, sin otra lectura');
});

test('B3.1 Sidebar abre Configurar Plan B en Continuidad, conserva los pasos y no monta Propuestas ni Abrir aplicación', () => {
  const restore = setupGlobals();
  const rt = new Runtime(path.resolve('.'), { components: { Brand: () => null }, version: { APP_VERSION: 'test' } });
  const { Sidebar } = rt.load('src/app-shell/Sidebar.tsx');
  let opened = 0;
  const view = new View(rt, Sidebar, {
    state: { runtime: false, ready: true, snapshot: { source: { isTestData: true } } },
    page: 'prepare', entityName: 'contacts', selected: false,
    signals: { overdue: null }, step: 0, preparationOpen: true,
    setPage() {}, setSelected() {}, setPreparationOpen() {}, setGlobalSearch() {}, setModal() {}, openEntity() {},
    openPreparation() { opened++; },
  });
  try {
    const setup = view.find({ tag: 'button', text: 'Configurar Plan B' });
    assert.equal(view.find({ tag: 'button', where: n => n.props['aria-controls'] === 'nav-group-continuity' }).props['aria-expanded'], true);
    assert.equal(setup.props['aria-expanded'], true);
    assert.equal(view.all({ tag: 'nav', label: 'Secciones de preparación' }).length, 1);
    assert.equal(view.all({ tag: 'button', text: 'Propuestas' }).length, 0);
    assert.equal(view.all({ tag: 'button', text: 'Abrir aplicación' }).length, 0);
    assert.equal(view.all({ tag: 'button', text: 'Copia de equipo' }).length, 0);
    view.click(view.find({ tag: 'button', text: '2Procesos' }));
    assert.equal(opened, 1);
    assert.equal(view.all({ tag: 'button', className: /\bprimary\b/ }).length, 0);
  } finally { view.unmount(); restore(); }
});
