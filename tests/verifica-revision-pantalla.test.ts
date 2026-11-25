// Plan B Verifica · el mega plan 4 en la pantalla (siguiente paso, revisión de hallazgos, entrega revisada, alcance del cierre
// y huella recibida aparte en el visor), sin red: solo lo que pintan los componentes con datos del contrato de Codex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextStep, ReviewContent } from '../src/verifica/Revision.js';
import { ExpedienteContent, PackageView } from '../src/verifica/Expediente.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport } from '../shared/verifica/report.js';
import { reviewView, type EngagementWorkflow, type FindingDecision } from '../shared/verifica/revision.js';
import { buildAnswers, questionsFor } from '../shared/verifica/preguntas.js';
import { buildPackage } from '../shared/verifica/paquete.js';
import { nextLedgerEntry, verifyLedger, CLOSURE_OUTSIDE } from '../shared/verifica/expediente.js';

const AT = '2026-11-25T10:00:00.000Z';
const ID = '0b8f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e11';
const noop = () => {};
const c = buildTrapCompany({ traps: true });
const report = buildVerificaReport({ asOf: c.asOf, previous: c.previous, latest: c.latest, invoices: c.invoices, declarations: c.declarations, salt: c.salt });
const answers = buildAnswers(report, [{ question: questionsFor(report)[0].id, text: 'Pedidos firmados en octubre.', answeredAt: AT }]);
const fresh = reviewView(report, {}, answers.answers);

test('Verifica · siguiente paso: dice qué toca, cuántos hallazgos quedan y si la última entrega quedó atrás', () => {
  const workflow: EngagementWorkflow = { next: 'review-findings', missing: [], review: fresh, recentDecisions: [], reviewedPackage: null,
    delivery: { fingerprint: 'd'.repeat(64), at: AT, report: 'e'.repeat(64), state: 'report-changed', changedRules: ['won-without-invoice'] } };
  const html = renderToStaticMarkup(createElement(NextStep, { workflow }));
  assert.match(html, /Revisa los hallazgos que se salen de lo normal o no se pudieron comprobar\. Quedan \d+\./);
  assert.match(html, /quedó atrás: hay otra emisión del informe\. Cambian 1 hallazgo\./);
  assert.match(html, /data-next="review-findings"/);
  const missing = renderToStaticMarkup(createElement(NextStep, { workflow: { ...workflow, next: 'complete-sources', review: null, delivery: null, missing: ['Falta la captura anterior.'] } }));
  assert.match(missing, /Completa las fuentes[^<]*<\/p><ul class="vf-next-list"><li>Falta la captura anterior\.<\/li>/);
  assert.equal(renderToStaticMarkup(createElement(NextStep, { workflow: undefined })), '', 'sin estado no se pinta nada');
});

test('Verifica · revisión: una decisión por hallazgo, la respuesta del vendedor solo donde la hay y las últimas decisiones', () => {
  assert.ok(fresh.findings.length > 0, 'la empresa con trampas tiene hallazgos que revisar');
  const controls = { busy: null, errors: {}, onDecide: noop };
  const recent: FindingDecision[] = [{ format: 'verifica-revision-v1', engagement: ID, sequence: 1, at: AT, rule: fresh.findings[0].rule, report: report.fingerprint,
    evidence: fresh.findings[0].evidence, decision: 'request-information', statement: null, previous: null, fingerprint: 'f'.repeat(64) }];
  const html = renderToStaticMarkup(createElement(ReviewContent, { review: fresh, recent, controls }));
  assert.match(html, new RegExp('0 de ' + fresh.findings.length + ' revisados'));
  assert.equal(html.match(/class="vf-question vf-review"/g)?.length, fresh.findings.length);
  assert.equal(html.match(/>Por revisar</g)?.length, fresh.findings.length);
  const withStatement = fresh.findings.filter(f => f.statement).length;
  assert.equal(html.match(/>Revisada la respuesta del vendedor</g)?.length ?? 0, withStatement, 'solo donde el vendedor respondió');
  assert.match(html, /Últimas decisiones \(1\)/);
  assert.match(html, /Pide información<\/li>/);
  assert.equal(html.match(/class="pb-primary"/g), null, 'ninguna decisión es la acción principal de la página');
  const names = c.latest.companies.slice(0, 30).map(x => x.name);
  assert.deepEqual(names.filter(n => html.includes(n)), [], 'ningún nombre del CRM');
  const reopened = renderToStaticMarkup(createElement(ReviewContent, { review: { ...fresh, findings: [{ ...fresh.findings[0], state: 'reopened' }] }, recent: [], controls }));
  assert.match(reopened, /cambió su evidencia o la respuesta del vendedor/);
});

test('Verifica · entrega revisada y cierre: el paquete dice si lleva la revisión y el cierre enseña qué borra antes de pedir el nombre', () => {
  const first = nextLedgerEntry(null, ID, AT, { event: 'report-issued', refs: [{ kind: 'report', method: 'planb-verifica-report-v1', fingerprint: report.fingerprint }] });
  const entries = [first];
  const scope = { fingerprint: 'a'.repeat(64), rows: 9, byKind: { source: 4, ledger: 3, record: 1, records: 1 }, outside: [...CLOSURE_OUTSIDE] };
  const ready = { ...fresh, ready: true, findings: fresh.findings.map(f => ({ ...f, state: 'reviewed' as const })) };
  const base = { entries, verification: verifyLedger(entries, { engagement: ID }), anchors: [], closureScope: scope };
  const controls = { busy: false, error: null };
  const render = (review: typeof fresh) => renderToStaticMarkup(createElement(ExpedienteContent, { name: 'Distribuidora del norte', loadError: null, issued: true,
    view: { ...base, workflow: { next: 'prepare-package', missing: [], review, recentDecisions: [], reviewedPackage: null, delivery: null } },
    pkg: { ...controls, onBuild: noop }, close: { ...controls, onClose: noop } }));
  assert.match(render(ready), /Entrega revisada: lleva la huella de la revisión vigente/);
  assert.match(render(fresh), new RegExp('Quedan ' + fresh.findings.length + ' hallazgos? por revisar: el paquete saldrá sin revisión ligada'));
  const html = render(ready);
  assert.match(html, /Se borrarán 9 datos:<\/strong> fuentes \(4\), actas de lectura \(2\), entradas del expediente \(3\)\. Alcance <code title="a{64}">a{12}<\/code>/);
  assert.match(html, /No se borra, porque no está en este equipo o ya salió de él: la copia custodiada y su llave/);
  assert.match(html, /disabled="">Cerrar y borrar<\/button>/);
});

test('Verifica · visor: la huella recibida aparte distingue el paquete anunciado de uno rehecho, y uno dañado no abre documentos', () => {
  const pkg = buildPackage({ engagement: ID, createdAt: AT, ledgerHead: { sequence: 3, fingerprint: 'c'.repeat(64) },
    documents: [{ kind: 'report', fingerprint: report.fingerprint, content: report }] });
  const origin = { kind: 'opened' as const, name: 'paquete.json' };
  const html = renderToStaticMarkup(createElement(PackageView, { pkg, origin, onOpenDocument: noop }));
  assert.match(html, /El paquete está íntegro/);
  assert.match(html, /Huella que te dieron por separado/);
  assert.match(html, />Abrir<\/button>/);
  const damaged = structuredClone(pkg);
  (damaged.documents[0].content as typeof report).findings[0].summary += ' (retocado)';
  const broken = renderToStaticMarkup(createElement(PackageView, { pkg: damaged, origin, onOpenDocument: noop }));
  assert.match(broken, /El paquete no está íntegro/);
  assert.match(broken, /No se abren mientras el paquete no esté íntegro/);
  assert.doesNotMatch(broken, />Abrir<\/button>/, 'un documento dañado no se abre');
  const odd = renderToStaticMarkup(createElement(PackageView, { pkg: { ...pkg, documents: [null, 'texto'] } as unknown as typeof pkg, origin, onOpenDocument: noop }));
  assert.match(odd, /Documento no válido/, 'un paquete mal formado se enseña sin romper el visor');
});
