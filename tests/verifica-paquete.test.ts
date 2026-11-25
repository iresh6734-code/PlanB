// Plan B Verifica · paquete del comprador (Mega Plan 3, fase 1), sin red: se verifica sin conexión y cualquier retoque se ve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport } from '../shared/verifica/report.js';
import { buildAnswers, questionsFor } from '../shared/verifica/preguntas.js';
import { buildPackage, packageToJson, verifyPackage, PACKAGE_NOTICE } from '../shared/verifica/paquete.js';
import { equivalenceFingerprint, type EquivalenceReport } from '../shared/verifica/equivalence.js';

const company = buildTrapCompany({ traps: true });
const report = buildVerificaReport({ asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });
const answers = buildAnswers(report, [{ question: questionsFor(report)[0].id, text: 'Lo explicamos así.', answeredAt: '2026-11-24T09:00:00Z' }]);
const pkg = buildPackage({ engagement: '0b8f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e11', createdAt: '2026-11-24T10:00:00Z', ledgerHead: { sequence: 7, fingerprint: 'a'.repeat(64) },
  documents: [{ kind: 'report', fingerprint: report.fingerprint, content: report }, { kind: 'answers', fingerprint: answers.fingerprint, content: answers }] });

test('Verifica · paquete: íntegro, con la cabeza del expediente y el aviso de lo que acredita la huella', () => {
  const check = verifyPackage(JSON.parse(packageToJson(pkg)));
  assert.ok(check.intact, JSON.stringify(check.checks));
  assert.deepEqual(check.checks.map(c => c.kind), ['package', 'report', 'answers']);
  assert.deepEqual(pkg.ledgerHead, { sequence: 7, fingerprint: 'a'.repeat(64) });
  assert.equal(pkg.notice, PACKAGE_NOTICE);
  const json = packageToJson(pkg);
  for (const banned of [company.salt, ...company.latest.companies.slice(0, 30).map(c => c.name)]) assert.ok(!json.includes(banned), 'sin sal ni nombres');
});

test('Verifica · paquete: un retoque, un documento quitado o unas respuestas sueltas se detectan', () => {
  const touched = structuredClone(pkg);
  (touched.documents[0].content as typeof report).findings[0].summary += ' (retocado)';
  const a = verifyPackage(touched);
  assert.ok(!a.intact);
  assert.equal(a.checks.find(c => c.kind === 'report')?.ok, false);
  const removed = { ...structuredClone(pkg), documents: [structuredClone(pkg.documents[1])] };
  const b = verifyPackage(removed);
  assert.equal(b.checks[0].ok, false, 'la huella del paquete cambia al quitar un documento');
  assert.ok(b.checks.some(c => c.problem === 'Contestan a un informe que no está en el paquete.'));
  assert.equal(verifyPackage({ format: 'otro' }).intact, false);
});

test('Verifica · paquete: aceptación 3 · los valores ficticios de la empresa trampa nunca salen del paquete', () => {
  const json = packageToJson(pkg);
  // Nada que identifique a la empresa trampa: ni nombres de empresas del censo, ni importes, ni la sal, ni IDs del portal.
  for (const banned of [company.salt, ...company.latest.companies.slice(0, 30).map(c => c.name), company.latest.companies[0].id]) {
    assert.ok(!json.includes(String(banned)), 'el paquete no debe llevar: ' + banned);
  }
  // Y un paquete con equivalencia tampoco: el informe de equivalencia va con huellas, no con datos.
  const eqContent = { format: 'planb-verifica-equivalence-v1', verdict: 'no-differences-in-scope', asOf: '2026-11-24',
    closing: { at: '2026-11-24T09:00:00Z', fingerprint: 'd'.repeat(64), detail: 'cierre', watch: null },
    target: { provider: 'otro', exportedAt: '2026-11-24T09:30:00Z', fingerprint: 'e'.repeat(64), detail: 'exportación' },
    map: { fingerprint: 'f'.repeat(64), confirmedBy: 'persona', confirmedAt: '2026-11-24T08:00:00Z' },
    verdictReasons: [], objects: [], findings: [], notCovered: [], limits: [] } as unknown as EquivalenceReport;
  const eqFingerprint = equivalenceFingerprint(eqContent);
  const withEq = buildPackage({ engagement: '0b8f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e11', createdAt: '2026-11-24T10:00:00Z', ledgerHead: { sequence: 8, fingerprint: 'b'.repeat(64) },
    documents: [{ kind: 'report', fingerprint: report.fingerprint, content: report },
      { kind: 'equivalence', fingerprint: eqFingerprint, content: { ...eqContent, fingerprint: eqFingerprint } }] });
  const eqJson = packageToJson(withEq);
  for (const banned of [company.salt, ...company.latest.companies.slice(0, 30).map(c => c.name)]) assert.ok(!eqJson.includes(banned), 'sin sal ni nombres con equivalencia');
  assert.ok(verifyPackage(JSON.parse(eqJson)).intact, 'el paquete con equivalencia se verifica sin conexión');
});
