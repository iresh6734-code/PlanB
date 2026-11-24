// Plan B Verifica · preguntas al vendedor y comparación entre emisiones (Mega Plan 3, fase 3), sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport, type VerificaReport } from '../shared/verifica/report.js';
import { buildAnswers, questionsFor, verifyAnswers, answerProblem, QUESTION_TEXT } from '../shared/verifica/preguntas.js';
import { compareReports } from '../shared/verifica/comparacion.js';
import { RULE_IDS } from '../shared/verifica/model.js';

const reportOf = (traps: boolean, over: Partial<Parameters<typeof buildVerificaReport>[0]> = {}): VerificaReport => {
  const c = buildTrapCompany({ traps });
  return buildVerificaReport({ asOf: c.asOf, previous: c.previous, latest: c.latest, invoices: c.invoices, declarations: c.declarations, salt: c.salt, ...over });
};

test('Verifica · preguntas: una fija por cada hallazgo en alarma, citando solo seudónimos', () => {
  const report = reportOf(true), company = buildTrapCompany({ traps: true });
  const questions = questionsFor(report);
  assert.equal(questions.length, report.findings.filter(f => f.alarm).length);
  assert.ok(questions.length > 0);
  for (const q of questions) assert.equal(q.text, QUESTION_TEXT[q.rule], 'texto fijo por regla');
  assert.deepEqual(Object.keys(QUESTION_TEXT).sort(), [...RULE_IDS].sort(), 'cada regla tiene su pregunta');
  const names = [...company.latest.companies.map(c => c.name), ...company.latest.contacts.map(c => c.name), ...company.latest.owners.map(o => o.name)];
  const json = JSON.stringify(questions);
  assert.deepEqual(names.filter(n => json.includes(n)), [], 'ningún nombre del CRM');
  assert.deepEqual(questionsFor(reportOf(false)).length, reportOf(false).findings.filter(f => f.alarm).length);
});

test('Verifica · respuestas: quedan como declarado, atadas al informe, y un retoque rompe su huella', () => {
  const report = reportOf(true);
  const [first, second] = questionsFor(report);
  const doc = buildAnswers(report, [
    { question: second.id, text: '  Segunda  ', answeredAt: '2026-11-24T10:00:00Z' },
    { question: first.id, text: 'Primera', answeredAt: '2026-11-24T09:00:00Z' },
    { question: 'no-existe' as never, text: 'fuera', answeredAt: '2026-11-24T09:00:00Z' },
  ]);
  assert.equal(doc.basis, 'declared');
  assert.equal(doc.report, report.fingerprint);
  assert.deepEqual(doc.answers.map(a => a.question), [first.id, second.id], 'en el orden de las preguntas, sin las que no existen');
  assert.equal(doc.answers[1].text, 'Segunda');
  assert.ok(verifyAnswers(doc));
  assert.ok(!verifyAnswers({ ...doc, answers: [{ ...doc.answers[0], text: 'Otra cosa' }, doc.answers[1]] }));
  assert.match(answerProblem('   ') ?? '', /vacía/);
  assert.match(answerProblem('x'.repeat(4001)) ?? '', /4000/);
  assert.equal(answerProblem('Bien'), null);
});

test('Verifica · comparación: qué cifra cambió, qué fuente lo explica y qué sigue sin comprobar', () => {
  const company = buildTrapCompany({ traps: true });
  const before = reportOf(true, { invoices: null });
  const after = reportOf(true);
  const comparison = compareReports(before, after);
  assert.equal(comparison.from.fingerprint, before.fingerprint);
  assert.equal(comparison.to.fingerprint, after.fingerprint);
  const invoices = comparison.sources.find(s => s.role === 'invoices');
  assert.ok(invoices?.changed && invoices.before === null && invoices.after !== null, 'entró el libro de facturas');
  const won = comparison.findings.find(f => f.rule === 'won-without-invoice');
  assert.ok(won, 'cambia el hallazgo de ganadas sin factura');
  assert.deepEqual(won!.explainedBy, ['invoices']);
  assert.ok(comparison.notVerified.removed.length > 0, 'algo que no se podía comprobar ya se comprueba');
  const same = compareReports(after, after);
  assert.equal(same.findings.length, 0);
  assert.equal(same.unchanged, after.findings.length);
  assert.ok(company);
});
