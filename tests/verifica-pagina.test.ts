import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerificaReportView, referenceReport, type Variant } from '../src/verifica/VerificaReport.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';

const render = (variant: Variant) => {
  const report = referenceReport(variant);
  return { report, html: renderToStaticMarkup(createElement(VerificaReportView, { report, variant })) };
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
