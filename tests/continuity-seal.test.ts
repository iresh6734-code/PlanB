import test from 'node:test';
import assert from 'node:assert/strict';
import type { DrillReport } from '../shared/operations.js';
import { continuitySeal, sealHtml, sealSvg, SEAL_DISCLAIMER } from '../src/app-shell/continuity-seal.js';
import { monthlyReport, monthlyReportHtml } from '../src/app-shell/monthly-report.js';

const NOW = new Date('2026-11-19T11:30:00Z');
const HOUR = 3_600_000;
const captures: { id: string; at: string; bytes: number }[] = [];
for (let time = Date.UTC(2026, 7, 1, 10); time <= Date.parse('2026-11-19T10:00:00Z'); time += 12 * HOUR) captures.push({ id: 'c' + time, at: new Date(time).toISOString(), bytes: 1000 });
captures.reverse();
const drill = (completedAt: string, passed = true) => ({ id: 'r-' + completedAt, captureId: captures[0].id, startedAt: completedAt, completedAt, passed, isolated: true, checks: [], durationMs: 1, dataSource: 'demo', limitations: [] }) as DrillReport;
const status = (reports: DrillReport[], extra: Partial<{ stale: boolean; captures: typeof captures }> = {}) => ({ captures, jobs: [], reports, stale: false, ...extra });
const ready = { done: 5, total: 5 };

test('sello: «Constante» con tres meses seguidos comprobados y todo al día', () => {
  const seal = continuitySeal(status([drill('2026-08-10T09:00:00Z'), drill('2026-09-10T09:00:00Z'), drill('2026-10-10T09:00:00Z'), drill('2026-11-15T09:00:00Z')]), ready, NOW);
  assert.equal(seal.level, 'constant');
  assert.equal(seal.label, 'Constante');
  assert.equal(seal.streak, 4);
  assert.equal(seal.next, null);
  assert.ok(seal.criteria.every(item => item.met));
  assert.deepEqual(seal.months.map(item => item.month), ['2026-11', '2026-10', '2026-09', '2026-08']);
});

test('sello: un mes sin simulacro rompe la racha y queda en «Comprobado» con el criterio que falta', () => {
  const seal = continuitySeal(status([drill('2026-08-10T09:00:00Z'), drill('2026-10-10T09:00:00Z'), drill('2026-11-15T09:00:00Z')]), ready, NOW);
  assert.equal(seal.level, 'checked');
  assert.equal(seal.streak, 2);
  assert.equal(seal.next?.id, 'months');
  assert.match(seal.next!.detail, /2 meses seguidos/);
});

test('sello: el mes en curso todavía sin simulacro no rompe la racha de los anteriores', () => {
  const seal = continuitySeal(status([drill('2026-08-10T09:00:00Z'), drill('2026-09-10T09:00:00Z'), drill('2026-10-25T09:00:00Z')]), ready, NOW);
  assert.equal(seal.months[0].ok, false);
  assert.equal(seal.streak, 3);
  assert.equal(seal.level, 'constant', 'el simulacro del 25-oct sigue dentro de los 30 días');
});

test('sello: sin captura no hay sello; con la copia vieja o pasos pendientes queda «En preparación»', () => {
  assert.equal(continuitySeal(status([], { captures: [] }), { done: 0, total: 5 }, NOW).level, 'none');
  const stale = continuitySeal(status([drill('2026-11-15T09:00:00Z')], { stale: true }), ready, NOW);
  assert.equal(stale.level, 'preparing');
  assert.equal(stale.next?.id, 'fresh');
  const steps = continuitySeal(status([drill('2026-11-15T09:00:00Z')]), { done: 3, total: 5, missing: ['Poner contraseña', 'Exportar copia cifrada'] }, NOW);
  assert.equal(steps.level, 'preparing');
  assert.equal(steps.next?.id, 'steps');
  assert.match(steps.next!.detail, /3 de 5 pasos: falta poner contraseña, exportar copia cifrada/);
  const failedOnly = continuitySeal(status([drill('2026-11-15T09:00:00Z', false)]), ready, NOW);
  assert.equal(failedOnly.next?.id, 'drill', 'un simulacro con fallos no cuenta');
});

test('sello: un hueco de más de 24 h este mes impide «Comprobado»', () => {
  const holed = captures.filter(item => item.at < '2026-11-05' || item.at > '2026-11-08');
  const seal = continuitySeal(status([drill('2026-11-15T09:00:00Z')], { captures: holed }), ready, NOW);
  assert.equal(seal.level, 'preparing');
  assert.equal(seal.criteria.find(item => item.id === 'gaps')?.met, false);
});

test('sello: la referencia es estable para lo mismo y cambia con el nivel', () => {
  const reports = [drill('2026-11-15T09:00:00Z')];
  const a = continuitySeal(status(reports), ready, NOW), b = continuitySeal(status(reports), ready, NOW);
  assert.equal(a.reference, b.reference);
  assert.match(a.reference, /^PB-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.notEqual(continuitySeal(status(reports, { stale: true }), ready, NOW).reference, a.reference);
});

test('sello: la insignia y el bloque del informe escapan y llevan la advertencia fija', () => {
  const svg = sealSvg({ level: 'checked', label: '<Comprobado>' });
  assert.match(svg, /&lt;COMPROBADO&gt;/);
  assert.doesNotMatch(svg, /<COMPROBADO>/);
  const seal = continuitySeal(status([drill('2026-11-15T09:00:00Z')]), ready, NOW);
  const block = sealHtml(seal);
  assert.ok(block.includes(SEAL_DISCLAIMER.replace(/'/g, '&#39;')));
  assert.match(SEAL_DISCLAIMER, /No es una certificación/);
  const report = monthlyReport(status([drill('2026-11-15T09:00:00Z')]), NOW);
  assert.ok(monthlyReportHtml(report, '0.3.0', block).includes('<section class="seal">'));
  assert.ok(!monthlyReportHtml(report, '0.3.0').includes('<section class="seal">'));
});
