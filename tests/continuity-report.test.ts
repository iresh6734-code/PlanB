import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContinuityReport, reportHtml } from '../src/app-shell/continuity-report.js';

const now = new Date('2026-11-14T10:00:00.000Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const capture = { id: 'capture:secreta123', name: 'Agencia Norte', source: 'hubspot', environment: 'production', accountId: '987654', capturedAt: ago(18), counts: { contacts: 25, companies: 8, deals: 12, tasks: 18 }, records: 63, relations: 40, pipelines: 1, fields: 30 } as const;
const real = { captures: [{ id: 'capture:secreta123', at: ago(18), bytes: 1 }], reports: [], jobs: [], latestCapture: capture, latestCaptureAt: ago(18), stale: true,
  readiness: { status: 'untested', captureId: 'capture:secreta123', reportId: null, testedAt: null, issues: [] }, runtime: false, connected: false,
  session: { id: 's', captureId: 'c', startedAt: ago(10) }, schedule: { enabled: true, intervalMinutes: 60, lastAttempt: null }, recoveryCopy: null } as never;

test('el caso real: copia antigua, sin probar, sin copia cifrada y capturas detenidas, cada cosa con su veredicto', () => {
  const report = buildContinuityReport(real, now, '0.6.0');
  assert.deepEqual(report.items.map(item => item.verdict), ['warn', 'missing', 'missing', 'warn']);
  assert.match(report.items[0].text, /de hace 18 días\), con 63 registros, 40 relaciones y 30 campos\./);
  assert.equal(report.items[3].text, 'Detenidas: hay una sesión de continuidad abierta.');
  assert.equal(report.source, 'HubSpot · producción, solo lectura');
  assert.deepEqual(report.counts, [{ label: 'Clientes', value: 25 }, { label: 'Empresas', value: 8 }, { label: 'Oportunidades', value: 12 }, { label: 'Tareas', value: 18 }]);
  assert.equal(report.window.gaps, 0); assert.equal(report.window.idle, 14);
  assert.equal(report.alerts.length, 4);
});

test('todo demostrado: copia del día, simulacro superado, copia cifrada confirmada y capturas activas', () => {
  const report = buildContinuityReport({ ...(real as object), captures: [{ id: 'c', at: ago(0.01), bytes: 1 }], latestCapture: { ...capture, capturedAt: ago(0.01) }, latestCaptureAt: ago(0.01), stale: false, session: null, connected: true,
    readiness: { status: 'passed', captureId: 'c', reportId: 'r', testedAt: ago(0.01), issues: [] },
    reports: [{ id: 'r', captureId: 'c', startedAt: ago(0.02), completedAt: ago(0.01), passed: true, isolated: true, checks: [{ label: 'a', passed: true, detail: '' }, { label: 'b', passed: true, detail: '' }], durationMs: 1, dataSource: 'x', limitations: [] }],
    recoveryCopy: { exportedAt: ago(0.5), confirmedAt: ago(0.4), current: true } } as never, now, '0.6.0');
  assert.deepEqual(report.items.map(item => item.verdict), ['ok', 'ok', 'ok', 'ok']);
  assert.match(report.items[1].text, /2 de 2 comprobaciones, en un proceso aislado\./);
  assert.deepEqual(report.alerts, []);
});

test('el HTML no lleva nombres, identificadores, scripts ni recursos externos, y escapa el texto', () => {
  const html = reportHtml(buildContinuityReport(real, now, '0.6.0<script>'));
  for (const secret of ['Agencia Norte', 'secreta123', '987654']) assert.equal(html.includes(secret), false, 'no incluye ' + secret);
  assert.equal(/<script|https?:\/\/|<link|src=/i.test(html), false);
  assert.match(html, /v0\.6\.0&lt;script&gt;/);
  assert.match(html, /<title>Plan B · Parte de continuidad<\/title>/);
  assert.match(html, /Lo que este parte no acredita/);
  assert.match(html, /14<\/b>días sin intentos/);
});

test('sin copia: todo pendiente y sin contenido inventado', () => {
  const report = buildContinuityReport({ ...(real as object), captures: [], latestCapture: null, latestCaptureAt: null, stale: true, readiness: { status: 'empty', captureId: null, reportId: null, testedAt: null, issues: [] } } as never, now, '0.6.0');
  assert.equal(report.items[0].text, 'Todavía no hay ninguna captura.'); assert.equal(report.items[1].text, 'No hay copia que probar.');
  assert.equal(report.counts, null); assert.equal(report.source, null);
});
