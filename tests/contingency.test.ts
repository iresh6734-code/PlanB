// R1 · Modo contingencia: solo hora de inicio y pasos marcados, reloj hh:mm, filtro de lo urgente y salida limpia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTINGENCY_KEY, LAST_INCIDENT_KEY, endContingency, inContingencyScope, markStep, readContingency, readLastIncident, startContingency } from '../src/app-shell/contingency.js';
import { durationText, elapsedLabel, teamMessage } from '../src/app-shell/contingency-text.js';

const memory = () => { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; };
const at = (iso: string) => new Date(iso);

test('activar guarda solo la hora de inicio y repetirlo conserva la hora original', () => {
  const store = memory();
  assert.equal(readContingency(store), null);
  const first = startContingency(at('2026-11-19T09:42:00Z'), store);
  assert.deepEqual(first, { startedAt: '2026-11-19T09:42:00.000Z', steps: [] });
  assert.deepEqual(JSON.parse(store.data.get(CONTINGENCY_KEY)!), { startedAt: '2026-11-19T09:42:00.000Z', steps: [] });
  assert.equal(startContingency(at('2026-11-19T10:30:00Z'), store).startedAt, first.startedAt);
});

test('los pasos se marcan una vez, en el orden de la lista, y un almacenamiento manipulado no rompe nada', () => {
  const store = memory();
  assert.equal(markStep('team', store), null, 'sin contingencia no hay pasos');
  startContingency(at('2026-11-19T09:42:00Z'), store);
  markStep('queue', store); markStep('copy', store); markStep('queue', store);
  assert.deepEqual(readContingency(store)?.steps, ['copy', 'queue']);
  store.setItem(CONTINGENCY_KEY, JSON.stringify({ startedAt: '2026-11-19T09:42:00Z', steps: ['copy', 'hack', 7] }));
  assert.deepEqual(readContingency(store)?.steps, ['copy']);
  for (const raw of ['{', 'null', '{"startedAt":"ayer"}', '{"steps":[]}']) { store.setItem(CONTINGENCY_KEY, raw); assert.equal(readContingency(store), null, raw); }
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => undefined };
  assert.equal(readContingency(broken), null);
  assert.doesNotThrow(() => startContingency(at('2026-11-19T09:42:00Z'), broken));
});

test('el reloj cuenta horas y minutos desde el inicio y nunca va hacia atrás', () => {
  assert.equal(elapsedLabel('2026-11-19T09:42:00Z', at('2026-11-19T09:42:59Z')), '00:00');
  assert.equal(elapsedLabel('2026-11-19T09:42:00Z', at('2026-11-19T10:54:10Z')), '01:12');
  assert.equal(elapsedLabel('2026-11-19T09:42:00Z', at('2026-11-23T09:42:00Z')), '96:00');
  assert.equal(elapsedLabel('2026-11-19T09:42:00Z', at('2026-11-19T09:00:00Z')), '00:00');
  assert.equal(durationText('2026-11-19T09:42:00Z', '2026-11-19T09:42:20Z'), 'menos de 1 min');
  assert.equal(durationText('2026-11-19T09:42:00Z', '2026-11-19T10:00:00Z'), '18 min');
  assert.equal(durationText('2026-11-19T09:42:00Z', '2026-11-19T11:42:00Z'), '2 h');
  assert.equal(durationText('2026-11-19T09:42:00Z', '2026-11-19T10:54:00Z'), '1 h 12 min');
});

test('Hoy en contingencia: solo lo vencido y lo que vence en 24 horas', () => {
  assert.deepEqual((['overdue', 'due-in-window', 'needs-review', 'later'] as const).filter(inContingencyScope), ['overdue', 'due-in-window']);
});

test('terminar borra el modo y guarda solo el intervalo para el expediente', () => {
  const store = memory();
  assert.equal(endContingency(at('2026-11-19T11:00:00Z'), store), null);
  startContingency(at('2026-11-19T09:42:00Z'), store); markStep('team', store);
  const window = endContingency(at('2026-11-19T10:54:00Z'), store);
  assert.deepEqual(window, { startedAt: '2026-11-19T09:42:00.000Z', endedAt: '2026-11-19T10:54:00.000Z' });
  assert.equal(readContingency(store), null);
  assert.equal(store.data.has(CONTINGENCY_KEY), false);
  assert.deepEqual(readLastIncident(store), window);
  assert.deepEqual(Object.keys(JSON.parse(store.data.get(LAST_INCIDENT_KEY)!)).sort(), ['endedAt', 'startedAt']);
  // Un reloj atrasado al cerrar no produce un intervalo negativo.
  startContingency(at('2026-11-19T12:00:00Z'), store);
  assert.equal(endContingency(at('2026-11-19T11:00:00Z'), store)?.endedAt, '2026-11-19T12:00:00.000Z');
  store.setItem(LAST_INCIDENT_KEY, JSON.stringify({ startedAt: '2026-11-19T12:00:00Z', endedAt: '2026-11-19T11:00:00Z' }));
  assert.equal(readLastIncident(store), null);
});

test('el mensaje al equipo lleva horas, no datos de clientes', () => {
  const text = teamMessage('2026-11-19T09:42:00Z', '2026-11-19T09:15:00Z');
  assert.match(text, /desde las 10:42/);
  assert.match(text, /copia que usamos es de las 10:15/);
  assert.doesNotMatch(teamMessage('2026-11-19T09:42:00Z', null), /copia que usamos/);
});
