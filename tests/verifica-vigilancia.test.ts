import assert from 'node:assert/strict';
import test from 'node:test';
import { CleanRoomError } from '../shared/verifica/clean-room.js';
import { buildWatchedCompany, checkWatch, WATCH_CLOSING_AT } from '../shared/verifica/empresa-vigilada.js';
import { fingerprintOf, pseudonymizer } from '../shared/verifica/report.js';
import { buildWatchReport, findWatchLeaks, parseWatchReport, releaseWatchReport, verifyWatchReport, WatchInputError, watchReportToJson, watchSchedule } from '../shared/verifica/watch.js';
import { watchExampleFiles } from '../scripts/verifica-ejemplo.js';
import { runCli } from '../scripts/verifica-vigilancia.js';

const DAY = 86_400_000;
const later = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();

test('la empresa vigilada con trampas da exactamente los avisos sembrados y retiene desde el borrado', () => {
  const company = buildWatchedCompany({ traps: true });
  const report = releaseWatchReport(company);
  assert.deepEqual(checkWatch(report, company.expected), []);
  assert.deepEqual(report.entries.map(e => e.status), ['signing', 'accepted', 'retained', 'retained', 'retained']);
  assert.match(report.entries[2]!.shrink ?? '', /^Contactos \d+ → \d+$/);
  const drain = report.entries[3]!.alerts.find(a => a.kind === 'pipeline-drained')!;
  assert.equal(drain.items.length, drain.figures.drainedCount);
  assert.ok(drain.figures.drainedPct! >= 10, 'la cartera sale en más de un 10 %');
});

test('la empresa vigilada sana no da ningún aviso y acepta todas las capturas', () => {
  const company = buildWatchedCompany({ traps: false });
  const report = releaseWatchReport(company);
  assert.deepEqual(checkWatch(report, company.expected), []);
  assert.deepEqual(report.entries.flatMap(e => e.alerts), []);
  assert.deepEqual(report.closing.alerts, []);
  assert.ok(report.entries.slice(1).every(e => e.status === 'accepted' && e.shrink === null));
});

test('aceptar la huella de una captura retenida la convierte en la base de las siguientes', () => {
  const company = buildWatchedCompany({ traps: true });
  const retained = fingerprintOf(company.captures[1]);
  const report = buildWatchReport({ ...company, accepted: [retained] });
  assert.deepEqual(report.entries.map(e => e.status), ['signing', 'accepted', 'accepted', 'accepted', 'accepted']);
  assert.ok(report.entries[2]!.shrink, 'aunque se acepte, el parte sigue diciendo qué encogió');
  assert.equal(report.entries[3]!.shrink, null);
  // Los avisos no dependen de la aceptación: dicen qué cambió cada semana.
  assert.deepEqual(report.entries.map(e => e.alerts), buildWatchReport(company).entries.map(e => e.alerts));
});

test('la captura que no llega se avisa en el parte y en el calendario', () => {
  const company = buildWatchedCompany({ traps: false });
  const lastAt = company.captures.at(-1)!.capturedAt;
  assert.equal(buildWatchReport({ ...company, asOf: later(lastAt, 10) }).overdue, null);
  const late = buildWatchReport({ ...company, asOf: later(lastAt, 18) }).overdue;
  assert.equal(late?.kind, 'capture-missing');
  assert.deepEqual(late?.figures, { gapDays: 18, missedWeeks: 2 });
  assert.deepEqual(watchSchedule(lastAt, later(lastAt, 10)), { nextDue: later(lastAt, 7), late: false });
  assert.equal(watchSchedule(lastAt, later(lastAt, 10.5)).late, true);
});

test('el parte lleva huella, solo seudónimos y la barrera lo para si se cuela un texto del CRM', () => {
  const company = buildWatchedCompany({ traps: true });
  const report = releaseWatchReport(company);
  const json = watchReportToJson(report);
  for (const text of company.forbidden) assert.ok(!json.toLowerCase().includes(text.toLowerCase()), 'no sale ' + text);
  assert.equal(verifyWatchReport(report), true);
  assert.deepEqual(parseWatchReport(JSON.parse(json)), report);
  assert.equal(report.closing.to, fingerprintOf(company.captures.at(-1)));

  // Mismo seudónimo que el informe de la sala limpia con la misma sal: las partes pueden cruzar referencias.
  const drain = report.closing.alerts.find(a => a.kind === 'pipeline-drained')!;
  const ids = company.signing.deals.map(d => d.id);
  const pseudonym = pseudonymizer(company.salt);
  assert.ok(drain.items.every(item => ids.some(id => pseudonym('deal', id) === item.ref)));

  const touched = structuredClone(report);
  touched.closing.alerts[0]!.summary = 'Faltan 90 contactos, entre ellos ' + company.signing.contacts[200]!.name;
  assert.equal(verifyWatchReport(touched), false);
  assert.ok(findWatchLeaks(touched, company).includes(company.signing.contacts[200]!.name.toLowerCase()));
  // Una captura cuyo ID coincide con un texto del parte: la barrera de la sala limpia se aplica también aquí.
  assert.throws(() => releaseWatchReport({ ...company, signing: { ...company.signing, deals: [{ ...company.signing.deals[0]!, id: 'planb-verifica-watch-v1' }, ...company.signing.deals.slice(1)] } }), CleanRoomError);
});

test('el parte rechaza capturas fuera de orden y JSON que no es un parte', () => {
  const company = buildWatchedCompany({ traps: false });
  assert.throws(() => buildWatchReport({ ...company, captures: [{ ...company.captures[0]!, capturedAt: later(company.signing.capturedAt, -1) }] }), WatchInputError);
  assert.throws(() => buildWatchReport({ ...company, asOf: later(company.signing.capturedAt, 1) }), WatchInputError);
  assert.equal(WATCH_CLOSING_AT, company.asOf);
  const json = JSON.parse(watchReportToJson(buildWatchReport(company)));
  assert.throws(() => parseWatchReport({ ...json, format: 'planb-verifica-report-v1' }), WatchInputError);
  assert.throws(() => parseWatchReport({ ...json, entries: [{ ...json.entries[0], status: 'retained' }] }), WatchInputError);
});

test('script de vigilancia: crea la sal una vez, la reutiliza, escribe el parte y nunca sobrescribe', async () => {
  const files = watchExampleFiles(true);
  const written = new Map<string, string>();
  const run = async (argv: string[]) => {
    let out = '', err = '';
    const code = await runCli(argv, {
      out: t => { out += t; }, err: t => { err += t; },
      readText: async path => { const text = written.get(path) ?? files.get(path); if (text === undefined) throw new Error('no existe'); return text; },
      writeNew: async (path, text) => { if (written.has(path) || files.has(path)) throw new Error('existe'); written.set(path, text); },
      now: () => new Date('2027-03-01T00:00:00Z'),
    });
    return { code, out, err };
  };
  const weeks = ['semana-1.json', 'semana-2.json', 'semana-4.json', 'semana-5.json'].flatMap(name => ['--capture', name]);
  const base = ['--signing', 'firma.json', ...weeks, '--salt', 'sal.txt'];

  const first = await run([...base, '--report', 'parte-1.json', '--as-of', WATCH_CLOSING_AT]);
  assert.equal(first.code, 0, first.err);
  const salt = written.get('sal.txt')!.trim();
  assert.match(salt, /^[0-9a-f]{64}$/);
  assert.ok(!first.out.includes(salt), 'la sal no se imprime');
  assert.match(first.out, /RETENIDA/);
  assert.match(first.out, /AVISO · Semana sin captura/);
  const report = parseWatchReport(JSON.parse(written.get('parte-1.json')!));
  assert.equal(verifyWatchReport(report), true);

  // Segunda ejecución: misma sal, mismas referencias; aceptar la semana 2 libera las siguientes.
  const accept = report.entries[2]!.fingerprint;
  const second = await run([...base, '--report', 'parte-2.json', '--as-of', WATCH_CLOSING_AT, '--accept', accept]);
  assert.equal(second.code, 0, second.err);
  const again = parseWatchReport(JSON.parse(written.get('parte-2.json')!));
  assert.deepEqual(again.closing.alerts, report.closing.alerts);
  assert.deepEqual(again.entries.map(e => e.status), ['signing', 'accepted', 'accepted', 'accepted', 'accepted']);

  assert.equal((await run([...base, '--report', 'parte-1.json', '--as-of', WATCH_CLOSING_AT])).code, 1, 'no sobrescribe');
  const clock = await run([...base, '--report', 'parte-3.json']);
  assert.equal(clock.code, 0, 'sin --as-of usa el reloj y avisa de las semanas sin captura');
  assert.match(clock.out, /AVISO · La captura que tocaba el 2027-01-01 no llegó/);
  assert.equal((await run(['--signing', 'firma.json', '--salt', 'sal.txt', '--report', 'x.json', '--as-of', '2026-11-01'])).code, 2);
  assert.equal((await run([...base, '--report', 'x.json', '--accept', 'abc'])).code, 2);
  assert.equal((await run(['--signing', 'firma.json', '--salt', 'firma.json', '--report', 'x.json'])).code, 2);
});
