// Verifica · fase 2: sala limpia y copia custodiada sobre la empresa con trampas, sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrapCompany, checkReference } from '../shared/verifica/empresa-con-trampas.js';
import { CleanRoomError, findLeaks, releaseReport, runCleanRoom } from '../shared/verifica/clean-room.js';
import { CustodyError, custodyFingerprint, newCustodyKey, openCustody, sealCustody, type CustodyEnvelope } from '../shared/verifica/custody.js';
import { RULE_IDS } from '../shared/verifica/model.js';
import { buildVerificaReport, fingerprintOf, reportToJson, verifyReport, type ReportInput, type VerificaReport } from '../shared/verifica/report.js';
import { runCli } from '../scripts/verifica-sala-limpia.js';

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const inputOf = (traps: boolean) => {
  const company = buildTrapCompany({ traps });
  const input: Omit<ReportInput, 'salt'> = { asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations };
  return { company, input };
};

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  assert.ok(error instanceof CustodyError, String(error));
  return error.code;
};

test('Verifica · sala limpia: el informe sale con las seis alarmas, sin nada del CRM, y la copia lo reproduce', async () => {
  const { company, input } = inputOf(true);
  const { report, custody, key } = await runCleanRoom(input);
  assert.equal(verifyReport(report), true);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), [...RULE_IDS]);
  const outside = reportToJson(report) + JSON.stringify(custody);
  assert.deepEqual(company.forbidden.filter(text => outside.includes(text)), [], 'ni el informe ni la copia cifrada llevan textos del CRM');
  assert.ok(!outside.includes(key), 'la llave no va con el informe ni con la copia');
  assert.equal(custody.reportFingerprint, report.fingerprint);
  assert.match(custodyFingerprint(custody), /^[0-9a-f]{64}$/);

  const opened = await openCustody(JSON.parse(JSON.stringify(custody)), key);
  assert.equal(opened.reproduces, true);
  assert.equal(opened.rebuilt.fingerprint, report.fingerprint);
  assert.equal(fingerprintOf(opened.input.latest), fingerprintOf(company.latest), 'la copia trae la captura entera');
  assert.equal(opened.input.salt.length, 64, 'y la sal, para deshacer un seudónimo si hay disputa');
});

test('Verifica · la sala limpia usa una sal nueva cada vez: mismas cifras, otros seudónimos', async () => {
  const { input } = inputOf(true);
  const [a, b] = await Promise.all([runCleanRoom(input), runCleanRoom(input)]);
  assert.deepEqual(a.report.findings.map(f => f.figures), b.report.findings.map(f => f.figures));
  assert.notEqual(a.report.findings[0]!.items[0]!.ref, b.report.findings[0]!.items[0]!.ref);
  assert.notEqual(a.key, b.key);
});

test('Verifica · la copia no se abre con otra llave, ni retocada, ni atada a otro informe', async () => {
  const { input } = inputOf(false);
  const { custody, key } = await runCleanRoom(input);
  assert.equal(await codeOf(openCustody(custody, newCustodyKey())), 'WRONG_KEY_OR_TAMPERED');
  const flipped = custody.data.slice(0, 100) + (custody.data[100] === 'A' ? 'B' : 'A') + custody.data.slice(101);
  assert.equal(await codeOf(openCustody({ ...custody, data: flipped }, key)), 'WRONG_KEY_OR_TAMPERED');
  assert.equal(await codeOf(openCustody({ ...custody, reportFingerprint: '0'.repeat(64) }, key)), 'WRONG_KEY_OR_TAMPERED', 'la huella del informe va autenticada');
  assert.equal(await codeOf(openCustody({ ...custody, asOf: '2027-01-01T00:00:00.000Z' }, key)), 'WRONG_KEY_OR_TAMPERED');
  assert.equal(await codeOf(openCustody(custody, 'vfk1-corta')), 'BAD_KEY');
  assert.equal(await codeOf(openCustody({ format: 'otra cosa' }, key)), 'MALFORMED');
  assert.equal(await codeOf(openCustody({ ...custody, data: custody.data + '!' }, key)), 'MALFORMED');
});

test('Verifica · no se sella una copia con un informe que no sale de ella', async () => {
  const { input } = inputOf(true);
  const full = { ...input, salt: 'una sal de prueba bastante larga' };
  const other = buildVerificaReport({ ...full, salt: 'otra sal de prueba bastante larga' });
  await assert.rejects(sealCustody(full, other, newCustodyKey()), /no corresponde/);
  const ok: CustodyEnvelope = await sealCustody(full, buildVerificaReport(full), newCustodyKey());
  assert.equal(ok.reportFingerprint, buildVerificaReport(full).fingerprint);
});

test('Verifica · la barrera para el informe si lleva un nombre, correo, NIF o ID del CRM, sin decir cuál', () => {
  const { company, input } = inputOf(true);
  const full: ReportInput = { ...input, salt: 'una sal de prueba bastante larga' };
  const report = buildVerificaReport(full);
  assert.deepEqual(findLeaks(report, full), []);
  const touched = structuredClone(report);
  touched.findings[0]!.items[0]!.note = 'de Cliente Ficticio 3 S.L., escribir a persona7@cliente7.example';
  touched.findings[1]!.items[0]!.ref = company.latest.deals[0]!.id;
  assert.equal(findLeaks(touched, full).length, 3);

  // Un nombre del CRM que coincide con una frase del informe también la para: mejor parar de más que dejar salir algo.
  const title = report.findings.find(f => f.rule === 'declared-renewal')!.title;
  const named: ReportInput = { ...full, latest: { ...full.latest, deals: full.latest.deals.map((d, i) => i === 0 ? { ...d, name: title } : d) } };
  const error = (() => { try { releaseReport(named); return null; } catch (e) { return e; } })();
  assert.ok(error instanceof CleanRoomError);
  assert.equal(error.leaks, 1);
  assert.ok(!error.message.includes(title), 'el mensaje no repite el texto encontrado');
  assert.ok(verifyReport(releaseReport(full)));
});

test('Verifica · script de sala limpia: escribe informe, copia y llave por separado, sin imprimir la llave ni sobrescribir', async () => {
  const company = buildTrapCompany({ traps: true });
  const names = new Map(company.latest.companies.map(c => [c.id, c.name]));
  const csv = ['Núm.;Fecha;Contacto;Base imponible;Referencia', ...company.invoices.map(f => [f.id, f.issuedAt.slice(8, 10) + '/' + f.issuedAt.slice(5, 7) + '/' + f.issuedAt.slice(0, 4), '"' + names.get(f.companyId!) + '"', f.amount.toFixed(2).replace('.', ','), f.dealRef ?? ''].join(';'))].join('\n');
  const files = new Map<string, string>([
    ['antes.json', JSON.stringify(company.previous)], ['ahora.json', JSON.stringify(company.latest)],
    ['facturas.csv', csv], ['declara.json', JSON.stringify(company.declarations)],
  ]);
  const run = async (argv: string[], store = files) => {
    let out = '', err = '';
    const code = await runCli(argv, {
      out: t => { out += t; }, err: t => { err += t; },
      readText: async path => { const text = store.get(path); if (text === undefined) throw new Error('no existe'); return text; },
      writeNew: async (path, text) => { if (store.has(path)) throw new Error('ya existe'); store.set(path, text); },
    });
    return { code, out, err };
  };
  const base = ['--previous', 'antes.json', '--latest', 'ahora.json', '--invoices', 'facturas.csv', '--declarations', 'declara.json'];

  const ok = await run([...base, '--report', 'informe.json', '--custody', 'copia.json', '--key-out', 'llave.txt']);
  assert.equal(ok.code, 0, ok.err);
  const report = JSON.parse(files.get('informe.json')!) as VerificaReport;
  const key = files.get('llave.txt')!.trim();
  assert.equal(verifyReport(report), true);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.ok(!(ok.out + ok.err).includes(key), 'la llave no se imprime');
  assert.ok(ok.out.includes(report.fingerprint));
  const opened = await openCustody(JSON.parse(files.get('copia.json')!), key);
  assert.equal(opened.reproduces, true);
  assert.equal(opened.input.invoices?.length, company.invoices.length);

  const before = files.size;
  assert.equal((await run([...base, '--report', 'informe.json', '--custody', 'otra-copia.json', '--key-out', 'otra-llave.txt'])).code, 1, 'no sobrescribe el informe');
  assert.equal(files.size, before, 'y no deja una copia ni una llave sueltas');
  for (const argv of [
    [...base, '--report', 'a.json', '--custody', 'b.json'],
    [...base, '--report', 'a.json', '--custody', 'b.json', '--key-out', 'a.json'],
    ['--previous', 'ahora.json', '--latest', 'antes.json', '--report', 'a.json', '--custody', 'b.json', '--key-out', 'c.txt'],
    ['--previous', 'antes.json', '--latest', 'facturas.csv', '--report', 'a.json', '--custody', 'b.json', '--key-out', 'c.txt'],
  ]) assert.equal((await run(argv)).code, 2, argv.join(' '));
  files.set('mal.json', JSON.stringify({ renewalRate: 92 }));
  assert.equal((await run(['--previous', 'antes.json', '--latest', 'ahora.json', '--declarations', 'mal.json', '--report', 'a.json', '--custody', 'b.json', '--key-out', 'c.txt'])).code, 2);
  assert.equal(files.size, before + 1, 'ninguna llamada fallida escribe nada');

  // Si la barrera para el informe, no sale nada; solo con --show-leaks dice aquí qué texto lo ha parado.
  const title = report.findings.find(f => f.rule === 'declared-renewal')!.title;
  const leaky = new Map(files);
  leaky.set('ahora.json', JSON.stringify({ ...company.latest, deals: company.latest.deals.map((d, i) => i === 0 ? { ...d, name: title } : d) }));
  const out = ['--report', 'x.json', '--custody', 'y.json', '--key-out', 'z.txt'];
  const blocked = await run([...base, ...out], leaky);
  assert.equal(blocked.code, 1);
  assert.ok(!blocked.err.includes(title) && !blocked.out.includes(title));
  assert.ok(!['x.json', 'y.json', 'z.txt'].some(p => leaky.has(p)));
  const shown = await run([...base, ...out, '--show-leaks'], leaky);
  assert.equal(shown.code, 1);
  assert.ok(shown.err.includes(fold(title)));
});
