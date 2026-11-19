// CLAUDE-NAV-GROUP-RETURN · La cabecera de un grupo del menú lleva a su primer apartado si estás en otro, y solo pliega si ya estás en él.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { headerPress, navigationGroups } from '../src/app-shell/navigation.js';

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
