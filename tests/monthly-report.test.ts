import test from 'node:test';
import assert from 'node:assert/strict';
import type { DrillReport, Job } from '../shared/operations.js';
import { formatHours, monthStats, monthlyReport, monthlyReportHtml, previousMonth } from '../src/app-shell/monthly-report.js';

const NOW = new Date('2026-11-19T11:30:00Z');
const job = (status: Job['status'], createdAt: string): Job => ({ id: 'j-' + createdAt, kind: 'capture', status, createdAt, updatedAt: createdAt, message: '', progress: 1 });
const report = (passed: boolean, completedAt: string) => ({ id: 'r-' + completedAt, captureId: 'cap-secreta', startedAt: completedAt, completedAt, passed, isolated: true, checks: [], durationMs: 1, dataSource: 'demo', limitations: [] }) as DrillReport;
const status = {
  captures: [
    { id: 'cap-secreta', at: '2026-11-19T10:00:00Z', bytes: 1 }, { id: 'c3', at: '2026-11-19T09:00:00Z', bytes: 1 }, { id: 'c2', at: '2026-11-18T10:00:00Z', bytes: 1 },
    { id: 'c1', at: '2026-10-31T23:30:00Z', bytes: 1 }, { id: 'c0', at: '2026-10-20T10:00:00Z', bytes: 1 }, { id: 'roto', at: 'no-es-fecha', bytes: 1 },
  ],
  jobs: [job('failed', '2026-11-10T08:00:00Z'), job('succeeded', '2026-10-05T08:00:00Z'), job('succeeded', '2026-10-06T08:00:00Z')],
  reports: [report(true, '2026-11-18T12:00:00Z'), report(false, '2026-10-21T12:00:00Z')],
};

test('informe mensual: el mes se corta en hora de Madrid y cuenta días, fallos, simulacros y el mayor hueco', () => {
  const nov = monthStats(status, '2026-11', NOW);
  assert.equal(nov.partial, true); assert.equal(nov.daysInScope, 19);
  assert.equal(nov.captures, 4, 'la captura del 31-oct a las 23:30 UTC ya es 1 de noviembre en Madrid');
  assert.equal(nov.daysCovered, 3); assert.equal(nov.failedCaptures, 1); assert.equal(nov.drillsPassed, 1); assert.equal(nov.drillsFailed, 0);
  assert.equal(nov.longestGapHours, 418.5); assert.equal(nov.longestGap?.from, '2026-10-31T23:30:00.000Z');
  const oct = monthStats(status, '2026-10', NOW);
  assert.equal(oct.partial, false); assert.equal(oct.daysInScope, 31); assert.equal(oct.daysCovered, 1);
  assert.equal(oct.captures, 2, 'si hay más trabajos completados que capturas conservadas, manda el mayor'); assert.equal(oct.drillsFailed, 1);
  assert.equal(oct.longestGapHours, 277.5);
  assert.equal(monthStats(status, '2026-12', NOW).daysInScope, 0);
});

test('informe mensual: titular, veredicto y notas; sin capturas queda «pendiente»', () => {
  const full = monthlyReport(status, NOW);
  assert.equal(full.current.month, '2026-11'); assert.equal(full.previous.month, '2026-10');
  assert.equal(full.verdict, 'warn'); assert.equal(full.headline, '3 de 19 días con copia en noviembre de 2026 (mes en curso).');
  assert.deepEqual(full.notes, ['1 captura no se completó este mes.', 'El mayor hueco sin copia fue de 17 días.']);
  const empty = monthlyReport({ captures: [], jobs: [], reports: [] }, NOW);
  assert.equal(empty.verdict, 'missing'); assert.equal(empty.headline, 'Sin capturas en noviembre de 2026 por ahora.');
  assert.equal(previousMonth('2026-01'), '2025-12'); assert.equal(previousMonth('2026-11'), '2026-10');
  assert.equal(formatHours(0.25), '15 min'); assert.equal(formatHours(1.5), '1,5 h'); assert.equal(formatHours(72), '3 días');
});

test('informe mensual: la página no lleva identificadores ni scripts', () => {
  const html = monthlyReportHtml(monthlyReport(status, NOW), '0.3<b>');
  assert.ok(!html.includes('cap-secreta')); assert.ok(!/<script|https?:\/\//i.test(html));
  assert.ok(html.includes('0.3&lt;b&gt;')); assert.match(html, /Este mes frente al anterior/);
});
