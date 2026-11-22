// Menú en cinco lugares. El Laboratorio se aparcó el 22/11/2026 (fase 0 de Verifica).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPage, groupOfPage, itemActive, navigationGroups, type NavContext } from '../src/app-shell/navigation.js';
import { PAGES } from '../src/app-shell/session.js';

const ctx = (over: Partial<NavContext> = {}): NavContext => ({ runtime: false, testData: true, ready: true, ...over });
const ids = (context: NavContext) => navigationGroups(context).map(g => g.id);
const allItems = (context: NavContext) => navigationGroups(context).flatMap(g => g.items.map(i => i.id));

test('cinco lugares de primer nivel y ningún Laboratorio, con datos de prueba o reales', () => {
  for (const testData of [true, false]) assert.deepEqual(ids(ctx({ testData })), ['home', 'today', 'clients', 'continuity', 'settings']);
  for (const page of ['radar', 'date-check', 'outage-lab']) assert.ok(!(PAGES as readonly string[]).includes(page), page);
});

test('con datos reales no se ofrece el proveedor de IA', () => {
  assert.ok(!allItems(ctx({ testData: false })).includes('provider'));
  assert.ok(allItems(ctx()).includes('provider'), 'con datos de prueba sí se ofrece');
});

test('la copia independiente no ofrece Hoy, Propuestas, Integraciones, copia de equipo ni Preparación', () => {
  const runtime = ctx({ runtime: true, testData: false });
  assert.deepEqual(ids(runtime), ['home', 'clients', 'continuity']);
  for (const id of ['today', 'agents', 'integrations', 'prepare', 'provider', 'plan']) assert.ok(!allItems(runtime).includes(id), id);
  assert.equal(fallbackPage('plan', runtime), 'home');
  assert.equal(groupOfPage('plan'), 'settings');
  assert.ok(allItems(ctx({ testData: false })).includes('plan'), 'Plan y licencia también con datos reales');
});

test('cada apartado de la App pertenece a un grupo, y el grupo existe cuando el apartado se puede abrir', () => {
  for (const page of PAGES) {
    const group = groupOfPage(page);
    assert.ok(group, page);
    if (fallbackPage(page, ctx()) === null) assert.ok(ids(ctx()).includes(group), page + ' → ' + group);
  }
  assert.equal(groupOfPage('changes'), 'continuity');
  assert.equal(groupOfPage('agents'), 'today');
  assert.equal(groupOfPage('integrations'), 'settings');
});

test('un apartado recordado que ya no existe en esta copia vuelve a Inicio', () => {
  assert.equal(fallbackPage('today', ctx({ runtime: true })), 'home');
  assert.equal(fallbackPage('changes', ctx({ runtime: true })), null);
});

test('una entrada de registros solo está activa con su tipo abierto', () => {
  const clients = navigationGroups(ctx()).find(g => g.id === 'clients')!;
  const deals = clients.items.find(i => i.id === 'deals')!;
  assert.equal(itemActive(deals, 'workspace', 'deals'), true);
  assert.equal(itemActive(deals, 'workspace', 'contacts'), false);
  assert.equal(itemActive(deals, 'home', 'deals'), false);
});

test('B3.1 Propuestas sale de Hoy y Configurar Plan B pertenece a Continuidad', () => {
  for (const testData of [true, false]) {
    const groups = navigationGroups(ctx({ testData }));
    assert.ok(!groups.flatMap(g => g.items).some(item => item.id === 'agents'));
    const setup = groups.find(g => g.id === 'continuity')!.items.find(item => item.id === 'prepare');
    assert.equal(setup?.label, 'Configurar Plan B');
    assert.equal(groupOfPage('prepare'), 'continuity');
    assert.ok(!groups.find(g => g.id === 'settings')!.items.some(item => item.id === 'prepare'));
  }
});
