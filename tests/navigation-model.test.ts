// CLAUDE-UI-NAV-LAB · Menú en cinco lugares y Laboratorio solo con datos de prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAB_PAGES, fallbackPage, groupOfPage, itemActive, labVisible, navigationGroups, type NavContext } from '../src/app-shell/navigation.js';
import { PAGES } from '../src/app-shell/session.js';

const ctx = (over: Partial<NavContext> = {}): NavContext => ({ runtime: false, testData: true, ready: true, ...over });
const ids = (context: NavContext) => navigationGroups(context).map(g => g.id);
const allItems = (context: NavContext) => navigationGroups(context).flatMap(g => g.items.map(i => i.id));

test('cinco lugares de primer nivel; el Laboratorio aparte y solo con datos de prueba', () => {
  assert.deepEqual(ids(ctx()), ['home', 'today', 'clients', 'continuity', 'settings', 'lab']);
  assert.deepEqual(ids(ctx({ testData: false })), ['home', 'today', 'clients', 'continuity', 'settings']);
  assert.ok(navigationGroups(ctx()).filter(g => g.id !== 'lab').length <= 5);
  assert.equal(labVisible({ testData: false }), false);
});

test('con datos reales ninguna entrada lleva al Laboratorio ni al proveedor de IA', () => {
  const items = allItems(ctx({ testData: false }));
  for (const page of LAB_PAGES) assert.ok(!items.includes(page), page);
  assert.ok(!items.includes('provider'));
  assert.ok(allItems(ctx()).includes('provider'), 'con datos de prueba sí se ofrece');
});

test('la copia independiente no ofrece Hoy, Propuestas, Integraciones, copia de equipo ni Preparación', () => {
  const runtime = ctx({ runtime: true, testData: false });
  assert.deepEqual(ids(runtime), ['home', 'clients', 'continuity']);
  for (const id of ['today', 'agents', 'integrations', 'team-sync', 'prepare', 'provider', 'plan']) assert.ok(!allItems(runtime).includes(id), id);
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
  assert.equal(fallbackPage('radar', ctx({ testData: false })), 'home');
  assert.equal(fallbackPage('date-check', ctx({ testData: false })), 'home');
  assert.equal(fallbackPage('outage-lab', ctx({ testData: false })), 'home');
  assert.equal(fallbackPage('radar', ctx()), null);
  assert.equal(fallbackPage('today', ctx({ runtime: true })), 'home');
  assert.equal(fallbackPage('changes', ctx({ runtime: true })), null);
});

test('E1: «¿Y si cae…?» vive en el Laboratorio y no necesita copia activa', () => {
  const lab = navigationGroups(ctx({ ready: false })).find(g => g.id === 'lab')!;
  const item = lab.items.find(i => i.id === 'outage-lab')!;
  assert.deepEqual(item.target, { kind: 'page', page: 'outage-lab' });
  assert.notEqual(item.needsReady, true, 'solo usa casos ficticios');
  assert.equal(groupOfPage('outage-lab'), 'lab');
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

test('B3.1 Copia de equipo solo se ofrece con servicio configurado, nunca en la independiente', () => {
  assert.ok(!allItems(ctx()).includes('team-sync'));
  assert.ok(allItems(ctx({ teamConfigured: true })).includes('team-sync'));
  assert.ok(!allItems(ctx({ teamConfigured: true, runtime: true })).includes('team-sync'));
});
