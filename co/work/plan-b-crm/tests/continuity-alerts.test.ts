import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuityAlerts, type AlertSource } from '../src/app-shell/continuity-alerts.js';
import { captureAutomation } from '../src/app-shell/copy-timeline.js';
import { buildContinuityReport, reportHtml } from '../src/app-shell/continuity-report.js';
import { CopyTimeline } from '../src/app-shell/CopyTimeline.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const now = new Date('2026-11-13T16:00:00.000Z');
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const healthy = (over: Partial<AlertSource> = {}): AlertSource => ({
  captures: [{ id: 'c', at: ago(0.5), bytes: 1 }], latestCaptureAt: ago(0.5), stale: false,
  readiness: { status: 'passed', captureId: 'c', reportId: 'r', testedAt: ago(1), issues: [] },
  runtime: false, connected: true, session: null, schedule: { enabled: true, intervalMinutes: 60, lastAttempt: ago(0.5) },
  operations: { lastAttempt: ago(0.5), lastSuccess: ago(0.5), error: null, paused: false },
  recoveryCopy: { exportedAt: ago(2), confirmedAt: ago(1), current: true }, recoveryIntegrity: { state: 'none', code: null, message: null }, ...over,
});
const ids = (source: AlertSource) => continuityAlerts(source, now).map(alert => alert.id);

test('copia al día, probada, con capturas activas y copia cifrada confirmada: ningún aviso', () => {
  assert.deepEqual(ids(healthy()), []);
});

test('sin copia: un único aviso para prepararla (salvo en el paquete portátil)', () => {
  assert.deepEqual(ids(healthy({ captures: [], latestCaptureAt: null })), ['no-copy']);
  assert.deepEqual(ids(healthy({ captures: [], latestCaptureAt: null, runtime: true })), []);
});

test('el caso real de 4331: copia de 17 días, sesión abierta, sin probar y sin copia cifrada', () => {
  const alerts = continuityAlerts(healthy({ latestCaptureAt: ago(17 * 24), captures: [{ id: 'c', at: ago(17 * 24), bytes: 1 }], stale: true, session: { id: 's', captureId: 'c', startedAt: ago(100) }, connected: false,
    readiness: { status: 'untested', captureId: 'c', reportId: null, testedAt: null, issues: [] }, recoveryCopy: null }), now);
  assert.deepEqual(alerts.map(alert => alert.id), ['stale', 'stopped', 'drill', 'recovery'], 'lo grave primero, después el orden de la lista');
  assert.equal(alerts[0].tone, 'danger'); assert.equal(alerts[0].title, 'La copia tiene 17 días'); assert.equal(alerts[0].action.target, 'copias');
  assert.equal(alerts[1].detail, 'Hay una sesión de continuidad abierta.');
  assert.equal(alerts[3].action.target, 'export');
});

test('antigüedad: aviso a partir de lo que el servidor marca como antiguo; grave desde 7 días', () => {
  assert.deepEqual(ids(healthy({ latestCaptureAt: ago(3), stale: true })), ['stale']);
  assert.equal(continuityAlerts(healthy({ latestCaptureAt: ago(3), stale: true }), now)[0].title, 'La copia tiene 3 horas');
  assert.equal(continuityAlerts(healthy({ latestCaptureAt: ago(30), stale: true }), now)[0].tone, 'warn');
  assert.equal(continuityAlerts(healthy({ latestCaptureAt: ago(7 * 24), stale: true }), now)[0].tone, 'danger');
});

test('prueba: fallida es grave; sin probar, caducada o bloqueada es aviso', () => {
  const drill = (status: 'failed' | 'untested' | 'expired' | 'blocked') => continuityAlerts(healthy({ readiness: { status, captureId: 'c', reportId: null, testedAt: null, issues: [] } }), now)[0];
  assert.equal(drill('failed').tone, 'danger'); assert.equal(drill('expired').title, 'La prueba de la copia ha caducado'); assert.equal(drill('blocked').detail, 'Faltan datos para el simulacro.'); assert.equal(drill('untested').tone, 'warn');
});

test('copia cifrada: desfasada o sin confirmar; plan de recuperación inválido es lo primero', () => {
  assert.equal(continuityAlerts(healthy({ recoveryCopy: { exportedAt: ago(5), confirmedAt: ago(4), current: false } }), now)[0].title, 'La copia cifrada está desfasada');
  assert.equal(continuityAlerts(healthy({ recoveryCopy: { exportedAt: ago(5), current: true } }), now)[0].action.label, 'Confirmar');
  assert.deepEqual(ids(healthy({ recoveryIntegrity: { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: 'x' } as never })), ['integrity'], 'sin repetir el mismo motivo como «capturas detenidas»');
});

const configured = { accountId: '4242', mode: 'test', accountType: 'NOT_VERIFIED', verifiedAt: null, selectedFields: {} } as const;
const captureError = { at: ago(1), message: 'detalle interno del ensayo', action: 'acción interna del ensayo' };
const sources = (over: Partial<AlertSource>) => ({
  ...healthy(over), latestCapture: null, reports: [], jobs: [],
});
const report = (source: ReturnType<typeof sources>) =>
  buildContinuityReport(source, now, '0.6.0');
const timeline = (status: ReturnType<typeof sources>) =>
  renderToStaticMarkup(createElement(CopyTimeline, { status, now }));

test('programación habilitada sin conexión: cronología, avisos y parte muestran el requisito', () => {
  const source = sources({ connection: null });
  assert.equal(captureAutomation(source).active, false);
  assert.deepEqual(ids(source), ['stopped']);
  assert.match(timeline(source), /Falta configurar la conexión para capturar/);
  assert.doesNotMatch(timeline(source), /Capturas automáticas activas/);
  assert.deepEqual(report(source).items[3], {
    label: 'Capturas automáticas',
    verdict: 'warn',
    text: 'Detenidas: falta configurar la conexión para capturar.',
  });
});

test('un fallo reciente avisa sin desactivar la programación y se retira tras un éxito posterior', () => {
  const operations = { lastAttempt: ago(1), lastSuccess: ago(2), error: captureError, paused: false };
  const source = sources({ connection: configured, operations });
  assert.equal(captureAutomation(source).active, true);
  assert.deepEqual(ids(source), ['capture-failed']);
  assert.match(timeline(source), /Capturas programadas · la última captura no se completó/);
  const failed = report(source);
  assert.equal(failed.items[3].verdict, 'warn');
  assert.doesNotMatch(reportHtml(failed), /detalle interno|acción interna|4242/);
  const recovered = sources({ connection: configured, operations: { ...operations, lastSuccess: ago(0.5) } });
  assert.deepEqual(ids(recovered), []);
  assert.equal(report(recovered).items[3].verdict, 'ok');
  assert.match(timeline(recovered), /Capturas automáticas activas/);
});
