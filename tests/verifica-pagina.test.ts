import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerificaReportView, readReportText, referenceReport, type ReportOrigin, type Variant } from '../src/verifica/VerificaReport.js';
import { checkCustody } from '../src/verifica/custody-check.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { runCleanRoom } from '../shared/verifica/clean-room.js';
import { newCustodyKey } from '../shared/verifica/custody.js';
import { reportToJson, verifyReport, type VerificaReport } from '../shared/verifica/report.js';

const renderWith = (report: VerificaReport, origin: ReportOrigin) => renderToStaticMarkup(createElement(VerificaReportView, { report, origin }));
const render = (variant: Variant) => {
  const report = referenceReport(variant);
  return { report, html: renderWith(report, { kind: 'reference', variant }) };
};

test('Verifica · la página pinta los seis hallazgos, la huella y el aviso de empresa ficticia', () => {
  const { report, html } = render('traps');
  assert.equal(html.match(/class="vf-finding"/g)?.length, 6);
  assert.equal(html.match(/data-alarm="true"/g)?.length, 6);
  assert.match(html, /6 de 6 comprobaciones se salen de lo normal/);
  assert.ok(html.includes(report.fingerprint), 'la huella completa del informe');
  assert.match(html, /Coincide con el contenido/);
  assert.match(html, /Empresa ficticia/);
});

test('Verifica · sin trampas no hay ningún sello de alarma', () => {
  const { html } = render('clean');
  assert.equal(html.match(/data-alarm="true"/g), null);
  assert.match(html, /Ninguna de las 6 comprobaciones/);
});

test('Verifica · un solo botón relleno y ningún nombre del CRM en la página', () => {
  for (const variant of ['traps', 'clean'] as const) {
    const { html } = render(variant);
    assert.equal(html.match(/class="vf-primary"/g)?.length, 1);
    const leaked = buildTrapCompany({ traps: variant === 'traps' }).forbidden.filter(text => html.includes(text));
    assert.deepEqual(leaked, [], 'filtrados: ' + leaked.slice(0, 5).join(', '));
  }
});

test('Verifica · un informe abierto de un archivo: sin aviso de ficción ni variantes, y su único botón relleno es comprobar la copia', () => {
  const { report: reference, html: referenceHtml } = render('traps');
  assert.ok(!referenceHtml.includes('copia custodiada'), 'el ejemplo no tiene copia que comprobar');
  const opened = readReportText(reportToJson(reference));
  assert.ok(typeof opened !== 'string');
  const html = renderWith(opened, { kind: 'opened', name: 'informe.json' });
  assert.ok(!html.includes('Empresa ficticia') && !html.includes('vf-switch'));
  assert.match(html, /informe\.json · abierto en este navegador/);
  assert.equal(html.match(/class="vf-primary"/g)?.length, 1);
  assert.match(html, /class="vf-primary"[^>]*disabled=""[^>]*>Comprobar la copia</);
  assert.match(html, /type="password"/);
  assert.equal(html.split(opened.fingerprint).length - 1, 1, 'la huella del informe sale una sola vez');
});

test('Verifica · abrir un informe: rechaza lo que no lo es y señala el que se ha tocado', () => {
  const report = referenceReport('traps');
  assert.equal(readReportText('no es json'), 'no es un archivo JSON válido');
  for (const broken of [{}, { ...report, format: 'otro' }, { ...report, findings: [report.findings[0], report.findings[0]] }, { ...report, findings: [{ ...report.findings[0], items: [{ ref: 7 }] }] }]) {
    assert.equal(readReportText(JSON.stringify(broken)), 'no es un informe de Verifica');
  }
  const touched = structuredClone(report);
  touched.findings[0]!.figures.moved = 0;
  const opened = readReportText(JSON.stringify(touched));
  assert.ok(typeof opened !== 'string' && !verifyReport(opened));
  assert.match(renderWith(opened, { kind: 'opened', name: 'x.json' }), /No coincide: el informe se ha tocado/);
});

test('Verifica · comprobar la copia custodiada en el navegador', async () => {
  const company = buildTrapCompany({ traps: true });
  const input = { asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations };
  const { report, custody, key } = await runCleanRoom(input);
  const other = await runCleanRoom(input);
  const text = JSON.stringify(custody);

  const ok = await checkCustody(report, text, key);
  assert.equal(ok.ok, true, ok.message);
  assert.match(ok.custodyFingerprint ?? '', /^[0-9a-f]{64}$/);
  assert.match((await checkCustody(other.report, text, key)).message, /de otro informe/);
  assert.match((await checkCustody(report, text, newCustodyKey())).message, /la llave no es la de esta copia/);
  assert.match((await checkCustody(report, text, 'clave')).message, /forma esperada/);
  assert.match((await checkCustody(report, '{"a":1}', key)).message, /no es una copia custodiada/);
  assert.match((await checkCustody(report, 'basura', key)).message, /no es una copia custodiada/);
  const touched = structuredClone(report);
  touched.findings[0]!.summary = 'Todo en orden.';
  const result = await checkCustody(touched, text, key);
  assert.equal(result.ok, false);
  assert.match(result.message, /se ha tocado después/);
});
