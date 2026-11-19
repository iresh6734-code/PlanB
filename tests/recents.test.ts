// F5 · Recientes y anclados: solo tipo e ID por copia, sin duplicados, con tope, y nada roto si el almacenamiento falla o está manipulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_SHORTCUTS, PINNED_MAX, RECENT_MAX, movePinned, readShortcuts, rememberOpened, shortcutRefs, shortcutsKey, togglePin, writeShortcuts, type RecordRef } from '../src/app-shell/recents.js';
import { shownNote } from '../src/app-shell/ask.js';

const ref = (id: string, entity: RecordRef['entity'] = 'contacts'): RecordRef => ({ entity, id });
const memory = () => { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

test('abrir una ficha la pone primera en recientes, sin repetir y con tope', () => {
  let state = EMPTY_SHORTCUTS;
  for (let n = 0; n < RECENT_MAX + 3; n++) state = rememberOpened(state, ref('c' + n));
  assert.equal(state.recent.length, RECENT_MAX);
  assert.deepEqual(state.recent[0], ref('c' + (RECENT_MAX + 2)));
  state = rememberOpened(state, ref('c5'));
  assert.deepEqual(state.recent.slice(0, 2), [ref('c5'), ref('c' + (RECENT_MAX + 2))]);
  assert.equal(state.recent.filter(item => item.id === 'c5').length, 1);
  // Volver a abrir la misma no cambia nada (no hay escritura innecesaria) y una ficha nueva no se recuerda.
  assert.equal(rememberOpened(state, ref('c5')), state);
  assert.equal(rememberOpened(state, ref('new')), state);
  // El mismo ID en otro tipo es otra ficha.
  assert.deepEqual(rememberOpened(state, ref('c5', 'deals')).recent[0], ref('c5', 'deals'));
});

test('anclar y desanclar; con el tope lleno no expulsa a ninguna', () => {
  let state = EMPTY_SHORTCUTS;
  const first = togglePin(state, ref('a'));
  assert.equal(first.pinned, true); state = first.shortcuts;
  const off = togglePin(state, ref('a'));
  assert.equal(off.pinned, false); assert.equal(off.full, false); assert.deepEqual(off.shortcuts.pinned, []);
  for (let n = 0; n < PINNED_MAX; n++) state = togglePin(state, ref('p' + n)).shortcuts;
  const full = togglePin(state, ref('extra'));
  assert.equal(full.full, true); assert.equal(full.shortcuts, state); assert.equal(state.pinned.length, PINNED_MAX);
  assert.equal(togglePin(state, ref('p3')).shortcuts.pinned.length, PINNED_MAX - 1);
});

test('mover un anclado respeta los extremos', () => {
  let state = EMPTY_SHORTCUTS;
  for (const id of ['a', 'b', 'c']) state = togglePin(state, ref(id)).shortcuts;
  assert.deepEqual(movePinned(state, ref('c'), -1).pinned.map(item => item.id), ['a', 'c', 'b']);
  assert.equal(movePinned(state, ref('a'), -1), state);
  assert.equal(movePinned(state, ref('c'), 1), state);
  assert.equal(movePinned(state, ref('zz'), 1), state);
});

test('para mostrar: anclados primero y los recientes ya anclados no se repiten', () => {
  let state = EMPTY_SHORTCUTS;
  for (const id of ['r1', 'r2', 'r3']) state = rememberOpened(state, ref(id));
  state = togglePin(state, ref('r2')).shortcuts;
  assert.deepEqual(shortcutRefs(state).map(item => (item.pinned ? 'P:' : 'R:') + item.ref.id), ['P:r2', 'R:r3', 'R:r1']);
});

test('se guarda por copia y se limpia lo que no tiene la forma esperada', () => {
  const store = memory();
  let state = rememberOpened(EMPTY_SHORTCUTS, ref('c1'));
  state = togglePin(state, ref('d1', 'deals')).shortcuts;
  assert.equal(writeShortcuts('copia-1', state, store), true);
  assert.deepEqual(readShortcuts('copia-1', store), state);
  assert.deepEqual(readShortcuts('copia-2', store), EMPTY_SHORTCUTS);
  // Solo tipo e ID: ningún nombre ni valor del registro.
  assert.deepEqual(JSON.parse(store.data.get(shortcutsKey('copia-1'))!), { recent: [{ entity: 'contacts', id: 'c1' }], pinned: [{ entity: 'deals', id: 'd1' }] });
  store.setItem(shortcutsKey('rota'), JSON.stringify({ recent: [{ entity: 'contacts', id: 'ok' }, { entity: 'nope', id: 'x' }, { entity: 'contacts', id: 'ok' }, { entity: 'tasks', id: 5 }, 'texto', null], pinned: 'no' }));
  assert.deepEqual(readShortcuts('rota', store), { recent: [ref('ok')], pinned: [] });
  store.setItem(shortcutsKey('json'), '{no es json');
  assert.deepEqual(readShortcuts('json', store), EMPTY_SHORTCUTS);
  assert.deepEqual(readShortcuts('sin', null), EMPTY_SHORTCUTS);
  assert.equal(writeShortcuts('x', state, { setItem: () => { throw new Error('lleno'); } }), false);
  assert.equal(shortcutsKey('a/b c'), 'planb:records:shortcuts:abc');
});

test('la paleta explica cuántas respuestas muestra', () => {
  const records = (n: number) => Array.from({ length: n }, (_, i) => ({ entity: 'deals' as const, id: 'd' + i, values: {} }));
  assert.equal(shownNote({ matched: 3, records: records(3) }, false), '');
  assert.equal(shownNote({ matched: 30, records: records(5) }, true), ', se muestran las 5 primeras');
  assert.equal(shownNote({ matched: 40, records: records(40) }, false), ', se muestran 12; afina la pregunta para ver el resto');
  assert.equal(shownNote({ matched: 40, records: records(20) }, true), ', se muestran 12; afina la pregunta para ver el resto');
});
