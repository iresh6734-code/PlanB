// Plan B Verifica · lo que la página dice de un vistazo (src/verifica/summary.ts, dirección «Dictamen», 23/11/2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceReport } from '../src/verifica/VerificaReport.js';
import { conclusion, highlights, keyFigure, sourcesText, traceText } from '../src/verifica/summary.js';
import type { VerificaReport } from '../shared/verifica/report.js';

const traps = referenceReport('traps');
const clean = referenceReport('clean');
const finding = (report: VerificaReport, rule: string) => report.findings.find(f => f.rule === rule)!;

test('Verifica · la conclusión nombra lo creado o subido en la ventana y cuántas veces es lo habitual', () => {
  const { headline, rule } = conclusion(traps);
  const inflation = finding(traps, 'window-inflation');
  assert.equal(rule, 'window-inflation');
  assert.ok(headline.includes(new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(inflation.figures.totalAmount!)));
  assert.match(headline, /: \d+(,\d)? veces lo habitual\.$/);
  assert.ok(!headline.includes('cartera abierta'), 'lo creado en la ventana puede estar ya ganado o perdido: no es un % de la cartera abierta');
});

test('Verifica · sin alarmas la conclusión lo dice tal cual y no hay cifras clave', () => {
  assert.deepEqual(conclusion(clean), { headline: 'Ninguna de las 6 comprobaciones se sale de lo normal.', rule: null });
  assert.deepEqual(highlights(clean), []);
});

test('Verifica · las cifras clave no repiten la de la conclusión y salen de hallazgos que se salen de lo normal', () => {
  const items = highlights(traps);
  assert.equal(items.length, 3);
  assert.ok(items.every(item => item.rule !== 'window-inflation'));
  assert.ok(items.every(item => finding(traps, item.rule).alarm));
  assert.deepEqual(items.map(item => item.rule), ['won-without-invoice', 'owner-concentration', 'close-date-pushed']);
});

test('Verifica · la cifra clave de cada hallazgo sale de sus figures', () => {
  assert.match(keyFigure(finding(traps, 'owner-concentration'))!, /^\d+(,\d)? %$/);
  assert.match(keyFigure(finding(traps, 'bulk-deletion'))!, /^−\d+$/);
  assert.match(keyFigure(finding(traps, 'declared-renewal'))!, /^\d+ de \d+$/);
  const unverified = { ...finding(traps, 'close-date-pushed'), figures: {} };
  assert.equal(keyFigure(unverified), null, 'sin cifras no se inventa una');
});

test('Verifica · de dónde sale cada hallazgo se dice con fechas, no con huellas', () => {
  const both = finding(traps, 'won-without-invoice');
  const text = traceText(both.captures, traps.sources);
  assert.match(text, /^Sale de la captura del \d+ de \w+ de \d{4} y las facturas\.$/);
  assert.ok(!/[0-9a-f]{12}/.test(text));
  assert.equal(traceText(['0'.repeat(64)], traps.sources), 'Sale de una fuente que no está en el informe.');
  const deletion = finding(traps, 'bulk-deletion');
  assert.match(traceText(deletion.captures, traps.sources), /^Sale de las capturas del \d+ de \w+ de \d{4} y del \d+ de \w+ de \d{4}\.$/);
  assert.match(sourcesText(traps), /^Observado en 2 capturas del CRM y [\d.]+ facturas\.$/);
});
