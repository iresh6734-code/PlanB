import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerificaReportView, referenceReport } from '../src/verifica/VerificaReport.js';
import { WatchReportView, referenceWatch } from '../src/verifica/WatchReport.js';
import type { ReportOrigin, Variant } from '../src/verifica/Masthead.js';
import { NOT_A_DOCUMENT, readDocumentText } from '../src/verifica/documents.js';
import { buildWatchedCompany } from '../shared/verifica/empresa-vigilada.js';
import { buildWatchReport, watchReportToJson, type WatchReport } from '../shared/verifica/watch.js';
import { checkCustody } from '../src/verifica/custody-check.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { runCleanRoom } from '../shared/verifica/clean-room.js';
import { newCustodyKey } from '../shared/verifica/custody.js';
import { reportToJson, verifyReport, type VerificaReport } from '../shared/verifica/report.js';
import { EquivalencePending, EquivalenceReportView } from '../src/verifica/EquivalenceReport.js';
import { referenceEquivalence } from '../src/verifica/reference-equivalence.js';
import { buildMigratedCompany } from '../shared/verifica/empresa-migrada.js';
import { equivalenceToJson, type EquivalenceReport } from '../shared/verifica/equivalence.js';
import { releaseEquivalence } from '../shared/verifica/migration.js';

const renderWith = (report: VerificaReport, origin: ReportOrigin) => renderToStaticMarkup(createElement(VerificaReportView, { report, origin }));
const readReportText = (text: string) => { const doc = readDocumentText(text); return typeof doc === 'string' ? doc : doc.kind === 'report' ? doc.report : 'es un parte'; };
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
    assert.equal(html.match(/class="pb-primary"/g)?.length, 1);
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
  assert.equal(html.match(/class="pb-primary"/g)?.length, 1);
  assert.match(html, /class="pb-primary"[^>]*disabled=""[^>]*>Comprobar la copia</);
  assert.match(html, /type="password"/);
  assert.equal(html.split(opened.fingerprint).length - 1, 1, 'la huella del informe sale una sola vez');
});

test('Verifica · abrir un informe: rechaza lo que no lo es y señala el que se ha tocado', () => {
  const report = referenceReport('traps');
  assert.equal(readReportText('no es json'), 'no es un archivo JSON válido');
  for (const broken of [{}, { ...report, format: 'otro' }, { ...report, findings: [report.findings[0], report.findings[0]] }, { ...report, findings: [{ ...report.findings[0], items: [{ ref: 7 }] }] }]) {
    assert.equal(readReportText(JSON.stringify(broken)), NOT_A_DOCUMENT);
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

const renderWatch = (report: WatchReport, origin: ReportOrigin) => renderToStaticMarkup(createElement(WatchReportView, { report, origin }));

test('Verifica · parte de vigilancia: cada trampa sale en su semana, la retenida se señala y el cierre suma lo perdido', () => {
  const report = referenceWatch('traps');
  const html = renderWatch(report, { kind: 'reference', variant: 'traps', doc: 'watch' });
  assert.equal(html.match(/class="vf-capture-status"/g)?.length, 5, 'firma y cuatro capturas: la de la semana 3 falta');
  assert.equal(html.match(/data-tone="held"/g)?.length, 3);
  assert.equal(html.match(/class="vf-alert"/g)?.length, 3, 'contactos borrados, semana sin captura y cartera vaciada');
  assert.match(html, /3 avisos en 4 capturas semanales\. 3 retenidas/);
  assert.ok(!html.includes('Ahora mismo'), 'a la fecha del parte no falta ninguna captura');
  assert.match(html, /Al cierre: la firma frente a la captura del/);
  assert.equal(html.match(/class="pb-primary"/g)?.length, 1);
  assert.match(html, /aria-current="page"><span class="vf-step-n">05<\/span><span class="vf-step-text"><span class="vf-step-label">Vigilancia</, 'el paso de vigilancia es la página actual');
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.ok(html.includes(report.fingerprint) && /Coincide con el contenido/.test(html));
  const leaked = buildWatchedCompany({ traps: true }).forbidden.filter(text => html.includes(text));
  assert.deepEqual(leaked, [], 'filtrados: ' + leaked.slice(0, 5).join(', '));
});

test('Verifica · parte de vigilancia sin trampas: ni avisos ni retenidas', () => {
  const html = renderWatch(referenceWatch('clean'), { kind: 'reference', variant: 'clean', doc: 'watch' });
  assert.equal(html.match(/data-alarm="true"/g), null);
  assert.match(html, /Ninguna de las 5 capturas semanales se sale de lo normal/);
  assert.match(html, /nada se sale de lo normal/);
  assert.ok(!html.includes('Ahora mismo'));
});

test('Verifica · abrir un parte de vigilancia: se reconoce, no tiene botón relleno y señala si se ha tocado', () => {
  const report = referenceWatch('traps');
  const doc = readDocumentText(watchReportToJson(report));
  assert.ok(typeof doc !== 'string' && doc.kind === 'watch');
  const html = renderWatch(doc.report, { kind: 'opened', name: 'parte.json' });
  assert.equal(html.match(/class="pb-primary"/g), null);
  assert.ok(!html.includes('Empresa ficticia') && !html.includes('vf-docs'));
  assert.equal(html.split(report.fingerprint).length - 1, 1, 'la huella del parte sale una sola vez');
  const touched = structuredClone(report);
  touched.entries[2]!.alerts = [];
  const opened = readDocumentText(JSON.stringify(touched));
  assert.ok(typeof opened !== 'string' && opened.kind === 'watch');
  assert.match(renderWatch(opened.report, { kind: 'opened', name: 'x.json' }), /No coincide: el parte se ha tocado/);
  assert.equal(readDocumentText(JSON.stringify({ ...report, entries: 'nada' })), NOT_A_DOCUMENT);
});

test('Verifica · parte de vigilancia con la captura atrasada: el aviso va arriba, una sola vez', () => {
  const company = buildWatchedCompany({ traps: false });
  const asOf = new Date(Date.parse(company.asOf) + 20 * 86_400_000).toISOString();
  const report = buildWatchReport({ signing: company.signing, captures: company.captures, asOf, salt: company.salt });
  const html = renderWatch(report, { kind: 'opened', name: 'parte.json' });
  assert.match(html, /Ahora mismo/);
  assert.equal(html.split(report.overdue!.summary).length - 1, 1);
  assert.match(html, /1 aviso en 5 capturas semanales\./);
});

const renderEquivalence = (report: EquivalenceReport, origin: ReportOrigin) => renderToStaticMarkup(createElement(EquivalenceReportView, { report, origin }));

test('Verifica · informe de equivalencia: tabla por objeto, diferencias arriba y lo abierto en la segunda página', () => {
  const report = referenceEquivalence('traps');
  const html = renderEquivalence(report, { kind: 'reference', variant: 'traps', doc: 'migration' });
  assert.match(html, /Hay diferencias en 4 puntos; 2 más no se pueden concluir\./);
  assert.equal(html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr>/g)?.length, 3);
  assert.equal(html.match(/data-short="true"/g)?.length, 2, 'contactos y oportunidades no llegaron enteros');
  assert.equal(html.match(/data-alarm="true"/g)?.length, 4);
  assert.equal(html.match(/data-alarm="false"/g)?.length, 2);
  assert.ok(html.indexOf('Contactos: no llegaron') < html.indexOf('vf-pending') && html.indexOf('Contactos: ambiguos') > html.indexOf('vf-pending'));
  assert.equal(html.match(/class="pb-primary"[^>]*>Descargar informe de equivalencia</g)?.length, 1);
  assert.equal(html.match(/class="pb-primary"/g)?.length, 1);
  assert.match(html, /aria-current="page"><span class="vf-step-n">06<\/span><span class="vf-step-text"><span class="vf-step-label">Después del cierre</, 'el paso de después del cierre es la página actual');
  assert.match(html, /<h1>Hay diferencias en 4 puntos; 2 más no se pueden concluir\.<\/h1>/, 'el veredicto es la conclusión');
  assert.equal(html.split(report.fingerprint).length - 1, 1, 'la huella del informe sale una sola vez');
  assert.ok(html.includes('la última del parte de vigilancia ' + report.closing.watch!.slice(0, 12)));
  assert.ok(!html.includes(report.closing.detail) && !html.includes(report.target.detail), 'los recuentos solo salen en la tabla');
  const leaked = buildMigratedCompany({ traps: true }).forbidden.filter(text => html.includes(text));
  assert.deepEqual(leaked, [], 'filtrados: ' + leaked.slice(0, 5).join(', '));
});

test('Verifica · informe de equivalencia sin trampas: ninguna diferencia, sin prometer más de lo que compara el mapa', () => {
  const html = renderEquivalence(referenceEquivalence('clean'), { kind: 'reference', variant: 'clean', doc: 'migration' });
  assert.match(html, /Sin diferencias en lo que compara el mapa\./);
  assert.equal(html.match(/data-alarm=/g), null);
  assert.equal(html.match(/data-short="true"/g), null);
  assert.match(html, /Oportunidades: ownerId, createdAt\./);
  assert.ok(!html.replace('nunca acredita que la migración esté íntegra', '').includes('íntegr'), 'nunca dice que la migración es íntegra');
});

test('Verifica · abrir un informe de equivalencia: se reconoce, no tiene botón relleno y señala si se ha tocado', () => {
  const report = referenceEquivalence('traps');
  const doc = readDocumentText(equivalenceToJson(report));
  assert.ok(typeof doc !== 'string' && doc.kind === 'migration');
  const html = renderEquivalence(doc.report, { kind: 'opened', name: 'equivalencia.json' });
  assert.equal(html.match(/class="pb-primary"/g), null);
  assert.ok(!html.includes('Empresa ficticia') && !html.includes('vf-docs'));
  const touched = structuredClone(report);
  touched.objects[1]!.intact = touched.objects[1]!.closing;
  const opened = readDocumentText(JSON.stringify(touched));
  assert.ok(typeof opened !== 'string' && opened.kind === 'migration');
  assert.match(renderEquivalence(opened.report, { kind: 'opened', name: 'x.json' }), /No coincide: el informe se ha tocado/);
  assert.equal(readDocumentText(JSON.stringify({ ...report, objects: 'nada' })), NOT_A_DOCUMENT);
  const waiting = renderToStaticMarkup(createElement(EquivalencePending, { origin: { kind: 'reference', variant: 'traps', doc: 'migration' }, failed: false }));
  assert.match(waiting, /Preparando el ejemplo/);
  assert.equal(waiting.match(/class="pb-primary"/g), null, 'nada que descargar hasta que llega');
});

test('Verifica · informe de equivalencia con el destino a medias: el resumen dice por qué no se puede concluir', () => {
  const m = buildMigratedCompany({ traps: false });
  const target = structuredClone(m.target);
  target.objects.find(o => o.objectType === 'persons')!.coverage = 'partial';
  const { report } = releaseEquivalence({ asOf: m.asOf, closing: m.closing, target, map: m.map, salt: m.salt, watch: m.watch });
  assert.equal(report.verdict, 'inconclusive');
  const html = renderEquivalence(report, { kind: 'opened', name: 'equivalencia.json' });
  assert.match(html, /<h1>No se puede concluir\.<\/h1>/);
  assert.match(html, /class="vf-lede">[^<]*Exportación parcial o muestra en: contacts\./, 'la frase de resumen dice por qué');
});
