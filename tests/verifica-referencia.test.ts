import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrapCompany, checkReference } from '../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport, reportToJson, verifyReport, type ReportInput } from '../shared/verifica/report.js';
import { RULE_IDS } from '../shared/verifica/model.js';

const reportFor = (traps: boolean, change: (input: ReportInput) => ReportInput = input => input) => {
  const company = buildTrapCompany({ traps });
  const input = change({ asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });
  return { company, report: buildVerificaReport(input) };
};

test('Verifica · la empresa con trampas: detecta las seis con sus cifras', () => {
  const { company, report } = reportFor(true);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), [...RULE_IDS]);
});

test('Verifica · la misma empresa sin trampas: ningún falso aviso', () => {
  const { company, report } = reportFor(false);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), []);
});

test('Verifica · ningún nombre, correo ni identificador del CRM sale en el informe', () => {
  for (const traps of [true, false]) {
    const { company, report } = reportFor(traps);
    const json = reportToJson(report);
    const leaked = company.forbidden.filter(text => json.includes(text));
    assert.deepEqual(leaked, [], 'filtrados: ' + leaked.slice(0, 5).join(', '));
    assert.ok(report.findings.flatMap(f => f.items).length > 0, 'el informe sí lleva referencias seudonimizadas');
  }
});

test('Verifica · huella: determinista, comprobable y rota por cualquier retoque', () => {
  const first = reportFor(true).report, second = reportFor(true).report;
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(verifyReport(first), true);
  const touched = structuredClone(first);
  touched.findings[0]!.figures.createdAmount! -= 1;
  assert.equal(verifyReport(touched), false);
  assert.ok(first.findings.every(f => f.captures.length > 0 && f.captures.every(c => /^[0-9a-f]{64}$/.test(c))), 'cada cifra cita la huella de su captura');
  const otherSalt = reportFor(true, input => ({ ...input, salt: 'otra sal secreta del vendedor' })).report;
  assert.notEqual(otherSalt.findings[0]!.items[0]!.ref, first.findings[0]!.items[0]!.ref);
  assert.deepEqual(otherSalt.findings.map(f => f.figures), first.findings.map(f => f.figures));
});

test('Verifica · sin historial, sin facturas o sin segunda captura dice «sin comprobar» en vez de inventar', () => {
  const { report } = reportFor(true, input => ({ ...input, previous: null, invoices: null, latest: { ...input.latest, historyAvailable: false } }));
  const by = (rule: string) => report.findings.find(f => f.rule === rule)!;
  for (const rule of ['close-date-pushed', 'won-without-invoice', 'bulk-deletion']) {
    assert.equal(by(rule).basis, 'unverified', rule);
    assert.equal(by(rule).alarm, false, rule);
  }
  assert.equal(by('window-inflation').figures.raisedCount, 0, 'sin historial no se cuentan subidas');
  assert.equal(by('window-inflation').alarm, true, 'lo creado en la ventana sigue siendo observado');
  const topics = report.notVerified.map(n => n.rule);
  for (const rule of ['window-inflation', 'close-date-pushed', 'won-without-invoice', 'bulk-deletion', 'declared-renewal']) assert.ok(topics.includes(rule as never), rule);
});

test('Verifica · con 24 meses de facturas la renovación pasa a observada y se compara con la declarada', () => {
  const { report } = reportFor(false, input => {
    const twoYears = Date.parse(input.asOf) - 710 * 86_400_000;
    // Solo la mitad de los clientes facturó también el año anterior: renovación observada del 50 %.
    const older = input.latest.companies.filter((_, i) => i % 2 === 0).map(c => ({ id: 'old-' + c.id, companyId: c.id, amount: 500, issuedAt: new Date(twoYears).toISOString(), dealRef: null }));
    const extra = input.latest.companies.filter((_, i) => i % 2 === 1).map(c => ({ id: 'old2-' + c.id, companyId: 'baja-' + c.id, amount: 500, issuedAt: new Date(twoYears).toISOString(), dealRef: null }));
    return { ...input, invoices: [...input.invoices!, ...older, ...extra] };
  });
  const renewal = report.findings.find(f => f.rule === 'declared-renewal')!;
  assert.equal(renewal.basis, 'observed');
  assert.equal(renewal.figures.observedRatePct, 49);
  assert.equal(renewal.alarm, true, 'declara 92 % y se observa 49 %');
  assert.ok(!report.notVerified.some(n => n.rule === 'declared-renewal'));
});
