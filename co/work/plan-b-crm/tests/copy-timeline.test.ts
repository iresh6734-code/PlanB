import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCopyTimeline, type TimelineSource } from '../src/app-shell/copy-timeline.js';

const now = new Date(2026, 10, 13, 15, 0); // 13 nov 2026, hora local
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const base = (over: Partial<TimelineSource> = {}): TimelineSource => ({ captures: [], reports: [], jobs: [], recoveryCopy: null, ...over });
const report = (day: number, passed: boolean) => ({ id: 'r' + day, captureId: 'c', startedAt: at(day, 9), completedAt: at(day, 9), passed, isolated: true, checks: [{ label: 'a', passed: true, detail: '' }, { label: 'b', passed, detail: '' }], durationMs: 1, dataSource: 'x', limitations: [] });

test('sin capturas: todo es «antes», sin huecos ni eventos inventados', () => {
  const timeline = buildCopyTimeline(base(), now);
  assert.equal(timeline.days.length, 14);
  assert.ok(timeline.days.every(day => day.state === 'before'));
  assert.equal(timeline.summary.gaps, 0); assert.equal(timeline.summary.longestGap, null); assert.deepEqual(timeline.events, []);
});

test('huecos solo entre la primera captura y ayer; hoy sin captura queda pendiente', () => {
  const timeline = buildCopyTimeline(base({ captures: [{ id: '3', at: at(12), bytes: 1 }, { id: '2', at: at(8, 14), bytes: 1 }, { id: '1', at: at(8, 9), bytes: 1 }, { id: '0', at: at(5), bytes: 1 }] }), now);
  const state = Object.fromEntries(timeline.days.map(day => [day.date.getDate(), day.state]));
  assert.equal(state[4], 'before'); assert.equal(state[5], 'covered'); assert.equal(state[6], 'gap'); assert.equal(state[7], 'gap');
  assert.equal(state[8], 'covered'); assert.equal(state[11], 'gap'); assert.equal(state[12], 'covered'); assert.equal(state[13], 'pending');
  assert.equal(timeline.days.find(day => day.date.getDate() === 8)!.captures, 2);
  assert.equal(timeline.summary.covered, 3); assert.equal(timeline.summary.gaps, 5);
  assert.equal(timeline.summary.longestGap!.length, 3); assert.equal(timeline.summary.longestGap!.from.getDate(), 9); assert.equal(timeline.summary.longestGap!.to.getDate(), 11);
});

test('pruebas, exportación, confirmación y trabajos fallidos aparecen en su día y como eventos, del más reciente al más antiguo', () => {
  const timeline = buildCopyTimeline(base({
    captures: [{ id: '1', at: at(10), bytes: 1 }, { id: '2', at: at(12), bytes: 1 }],
    reports: [report(10, true), report(12, false)],
    jobs: [{ id: 'j', kind: 'capture', status: 'failed', createdAt: at(11), updatedAt: at(11), message: 'Sin conexión', progress: 0 }, { id: 'k', kind: 'drill', status: 'succeeded', createdAt: at(10), updatedAt: at(10), message: '', progress: 100 }],
    recoveryCopy: { exportedAt: at(12, 11), confirmedAt: at(12, 12), records: 63, changes: 2, current: false },
  }), now);
  const day = (n: number) => timeline.days.find(item => item.date.getDate() === n)!;
  assert.equal(day(10).drill, 'pass'); assert.equal(day(12).drill, 'fail'); assert.equal(day(12).exported, true); assert.equal(day(11).failures, 1); assert.equal(day(11).state, 'gap');
  assert.deepEqual(timeline.events.map(event => event.kind), ['confirm', 'export', 'capture-last', 'drill-fail', 'job-fail', 'capture-first', 'drill-pass']);
  assert.equal(timeline.events.find(event => event.kind === 'export')!.detail, '63 registros · 2 cambios locales');
  assert.equal(timeline.events.find(event => event.kind === 'confirm')!.detail, 'Corresponde a otra revisión');
  assert.equal(timeline.events.find(event => event.kind === 'job-fail')!.label, 'Captura fallida');
  assert.equal(timeline.events.filter(event => event.kind === 'drill-pass').length, 1, 'un trabajo de prueba con éxito no duplica el informe');
});

test('un día con una prueba superada y otra fallida cuenta como superada; fechas inválidas se ignoran', () => {
  const timeline = buildCopyTimeline(base({ captures: [{ id: 'x', at: 'no-es-fecha', bytes: 1 }, { id: '1', at: at(13, 8), bytes: 1 }], reports: [report(13, false), report(13, true)] }), now);
  const today = timeline.days[timeline.days.length - 1];
  assert.equal(today.state, 'covered'); assert.equal(today.drill, 'pass');
  assert.equal(timeline.events.filter(event => event.kind.startsWith('capture')).length, 1, 'una sola captura: solo «primera»');
});

import { captureAutomation } from '../src/app-shell/copy-timeline.js';
const auto = (over: Record<string, unknown> = {}) => captureAutomation({ runtime: false, connected: true, session: null, schedule: { enabled: true, intervalMinutes: 60, lastAttempt: null }, operations: { lastAttempt: null, lastSuccess: null, error: null, paused: false }, recoveryIntegrity: { state: 'none' }, ...over } as never);

test('capturas automáticas: mismas condiciones que el servidor, con el primer motivo que aplica', () => {
  assert.deepEqual(auto(), { active: true, reason: null, lastAttempt: null });
  assert.equal(auto({ connected: false }).reason, 'Los servicios están en pausa');
  assert.equal(auto({ schedule: { enabled: false, intervalMinutes: 60, lastAttempt: '2026-11-01T10:00:00.000Z' } }).reason, 'Las capturas automáticas están desactivadas');
  assert.equal(auto({ connected: false, session: { id: 's', captureId: 'c', startedAt: at(1) } }).reason, 'Hay una sesión de continuidad abierta');
  assert.equal(auto({ runtime: true, connected: false }).reason, 'Este paquete no hace capturas');
  assert.equal(auto({ recoveryIntegrity: { state: 'invalid' } }).reason, 'El plan de recuperación no es válido');
  assert.equal(auto({ operations: { lastAttempt: at(9), lastSuccess: null, error: null, paused: true } }).lastAttempt, at(9), 'el último intento sale de operaciones');
});

test('en pausa: los días sin intentos tras la última actividad son «idle», no huecos; antes del último intento siguen siendo huecos', () => {
  const source = base({ captures: [{ id: '1', at: at(3), bytes: 1 }] });
  const paused = buildCopyTimeline(source, now, 14, { active: false, reason: 'Los servicios están en pausa', lastAttempt: at(6, 18) });
  const state = Object.fromEntries(paused.days.map(day => [day.date.getDate(), day.state]));
  assert.equal(state[3], 'covered'); assert.equal(state[4], 'gap'); assert.equal(state[6], 'gap', 'el día del último intento sin captura es un hueco');
  assert.equal(state[7], 'idle'); assert.equal(state[13], 'idle', 'hoy, en pausa, tampoco es «pendiente»');
  assert.equal(paused.summary.gaps, 3); assert.equal(paused.summary.idle, 7); assert.equal(paused.summary.longestGap!.length, 3);
  assert.equal(paused.summary.lastCaptureDays, 10); assert.equal(paused.summary.automation!.reason, 'Los servicios están en pausa');
  const active = buildCopyTimeline(source, now, 14, { active: true, reason: null, lastAttempt: at(6, 18) });
  assert.equal(active.summary.idle, 0); assert.equal(active.summary.gaps, 9, 'con las capturas activas, cada día sin captura es un hueco');
  const neverTried = buildCopyTimeline(source, now, 14, { active: false, reason: 'Las capturas automáticas están desactivadas', lastAttempt: null });
  assert.equal(neverTried.summary.gaps, 0); assert.equal(neverTried.summary.idle, 10, 'sin intentos registrados, todo lo posterior a la última captura es «idle»');
});
