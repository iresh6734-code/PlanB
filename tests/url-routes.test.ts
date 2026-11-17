// CLAUDE-URL-ROUTES · Cada apartado y cada ficha tienen una dirección propia que vuelve al mismo lugar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathOf, placeOf, samePlace } from '../src/app-shell/routes.js';
import { PAGES } from '../src/app-shell/session.js';

test('todo apartado tiene una dirección distinta que vuelve al mismo apartado', () => {
  const seen = new Set<string>();
  for (const page of PAGES) {
    if (page === 'workspace') continue;
    const path = pathOf({ page });
    assert.ok(path.startsWith('/') && !seen.has(path), page + ' → ' + path); seen.add(path);
    assert.deepEqual(placeOf(path), { page });
  }
  for (const entity of ['contacts', 'companies', 'deals', 'tasks'] as const) {
    const path = pathOf({ page: 'workspace', entity });
    assert.ok(!seen.has(path)); seen.add(path);
    assert.deepEqual(placeOf(path), { page: 'workspace', entity });
  }
});

test('las fichas llevan su ID codificado y vuelven exactas, también con caracteres especiales', () => {
  for (const id of ['contact-1', 'local-6f1c', 'segment/1', 'a b?c#d', 'récord"1']) {
    const path = pathOf({ page: 'workspace', entity: 'deals', recordId: id });
    assert.ok(!path.slice('/oportunidades/'.length).includes('/'), 'un solo segmento: ' + path);
    assert.deepEqual(placeOf(path), { page: 'workspace', entity: 'deals', recordId: id });
  }
});

test('direcciones ajenas, la raíz o mal formadas no abren ningún apartado', () => {
  for (const path of ['/', '', '/team', '/team/x', '/api/v2/state', '/clientes/a/b', '/desconocido', '/clientes/%E0%A4%A', '/clientes/' + 'x'.repeat(250)]) {
    assert.equal(placeOf(path), null, path);
  }
  assert.deepEqual(placeOf('/continuidad/'), { page: 'continuity' }, 'la barra final no importa');
});

test('samePlace compara por dirección', () => {
  assert.equal(samePlace({ page: 'home' }, { page: 'home' }), true);
  assert.equal(samePlace({ page: 'workspace', entity: 'deals' }, { page: 'workspace', entity: 'deals', recordId: 'x' }), false);
  assert.equal(samePlace(null, { page: 'home' }), false);
});
