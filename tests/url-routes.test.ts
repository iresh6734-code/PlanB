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

// R2 · Revisión 411 de Codex: la ficha pedida por enlace solo se abre si la persona sigue en esa lista.
import { pendingStillWanted } from '../src/app-shell/routes.js';
test('R2 · la lectura pendiente de una ficha se retira al irse a otro lugar', () => {
  const pending = { entity: 'contacts' as const, id: 'contact-1' };
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'contacts' }), true, 'sin abandonar el enlace, se abre');
  assert.equal(pendingStillWanted(pending, { page: 'home', entity: 'contacts' }), false, 'Inicio la retira');
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'companies' }), false, 'otro tipo de registro la retira');
  assert.equal(pendingStillWanted(pending, { page: 'continuity', entity: 'contacts' }), false);
});

test('R2 · App retira la lectura al navegar y Atrás/Adelante la sustituye por la del destino', async () => {
  const app = (await import('node:fs')).readFileSync('src/App.tsx', 'utf8');
  assert.ok(app.includes("if (pendingRecord && !pendingStillWanted(pendingRecord, { page, entity: entityName, selected: selected === 'new' ? 'new' : selectedId ?? null })) setPendingRecord(null)"), 'la regla recibe también la ficha abierta (R3)');
  assert.match(app, /setPendingRecord\(place\.page === 'workspace' && place\.entity && place\.recordId \? \{ entity: place\.entity, id: place\.recordId \} : null\)/);
  // El resultado y el error de la lectura solo actúan si sigue activa (la limpieza del efecto la desactiva).
  assert.match(app, /\.then\(result => \{ if \(!active\) return;/);
  assert.match(app, /\.catch\(\(\) => \{ if \(active\) setError/);
});

test('R3 · abrir otra ficha o una nueva en la misma lista también retira la lectura (revisión 427)', () => {
  const pending = { entity: 'contacts' as const, id: 'contact-1' };
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'contacts', selected: null }), true, 'lista sin ficha abierta: sigue');
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'contacts', selected: 'contact-1' }), true, 'la propia ficha pedida: sigue');
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'contacts', selected: 'contact-2' }), false, 'abrió a Pablo: se retira');
  assert.equal(pendingStillWanted(pending, { page: 'workspace', entity: 'contacts', selected: 'new' }), false, 'abrió una ficha nueva: se retira');
});
