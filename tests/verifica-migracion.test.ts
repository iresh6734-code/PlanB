import assert from 'node:assert/strict';
import test from 'node:test';
import { countersAddUp } from '../shared/migration-verifier.js';
import { CleanRoomError } from '../shared/verifica/clean-room.js';
import { buildMigratedCompany, checkEquivalence, MIGRATION_AS_OF, MIGRATION_SALT } from '../shared/verifica/empresa-migrada.js';
import { buildWatchedCompany } from '../shared/verifica/empresa-vigilada.js';
import { equivalenceToJson, parseEquivalenceReport, verifyEquivalenceReport, EquivalenceFormatError } from '../shared/verifica/equivalence.js';
import { buildEquivalence, EquivalenceInputError, equivalenceWorkList, findEquivalenceLeaks, releaseEquivalence } from '../shared/verifica/migration.js';
import { fingerprintOf, pseudonymizer } from '../shared/verifica/report.js';
import { buildWatchReport, watchReportToJson } from '../shared/verifica/watch.js';
import { migrationExampleFiles, watchExampleFiles } from '../scripts/verifica-ejemplo.js';
import { runCli } from '../scripts/verifica-migracion.js';

const inputOf = (m: ReturnType<typeof buildMigratedCompany>) => ({ asOf: m.asOf, closing: m.closing, target: m.target, map: m.map, salt: m.salt, watch: m.watch });

test('la empresa migrada con trampas da exactamente las diferencias sembradas', () => {
  const m = buildMigratedCompany({ traps: true });
  assert.deepEqual(m.expected.findings, { 'contacts:absent': 12, 'contacts:doubtful': 2, 'deals:changed': 5, 'deals:uncertain': 3, 'deals:relation-broken': 4, 'companies:extra': 3 });
  const { report, comparison } = releaseEquivalence(inputOf(m));
  assert.deepEqual(checkEquivalence(report, m.expected), []);
  assert.equal(report.verdict, 'differences-found');
  assert.ok(countersAddUp(comparison));
  const kinds = new Map(report.findings.map(f => [f.object + ':' + f.kind, f]));
  assert.equal(kinds.get('deals:changed')!.alarm, true);
  assert.equal(kinds.get('deals:uncertain')!.alarm, false, 'una fecha que no se entiende no es una diferencia confirmada');
  assert.equal(kinds.get('contacts:doubtful')!.figures.targets, 4, 'los dos candidatos de cada contacto duplicado');
  assert.match(kinds.get('deals:changed')!.summary, /amount → value/);
  assert.ok(report.notCovered.some(line => line.includes('ownerId')) && report.notCovered.some(line => line.includes('taxId')), 'dice qué campos del cierre no se comparan');
});

test('la empresa migrada sin trampas no tiene diferencias en lo que compara el mapa', () => {
  const m = buildMigratedCompany({ traps: false });
  const { report } = releaseEquivalence(inputOf(m));
  assert.deepEqual(checkEquivalence(report, m.expected), []);
  assert.equal(report.verdict, 'no-differences-in-scope');
  assert.deepEqual(report.findings, []);
  assert.ok(report.objects.every(o => o.intact === o.closing && o.target === o.closing));
});

test('la captura del cierre es la última del parte de vigilancia, con los mismos seudónimos', () => {
  for (const traps of [true, false]) {
    const m = buildMigratedCompany({ traps });
    const { report } = buildEquivalence(inputOf(m));
    assert.equal(report.closing.fingerprint, m.watch.closing.to);
    assert.equal(report.closing.watch, m.watch.fingerprint);
    const pseudonym = pseudonymizer(m.salt);
    const ids = new Set(m.closing.deals.map(d => pseudonym('deal', d.id)));
    assert.ok(report.findings.filter(f => f.object === 'deals').every(f => f.items.every(item => ids.has(item.ref))));
  }
  const m = buildMigratedCompany({ traps: true });
  const touched = structuredClone(m.watch);
  touched.closing.alerts = [];
  assert.throws(() => buildEquivalence({ ...inputOf(m), watch: touched }), (e: unknown) => e instanceof EquivalenceInputError && e.code === 'WATCH_TAMPERED');
  const other = buildWatchedCompany({ traps: false });
  const otherWatch = buildWatchReport({ signing: other.signing, captures: other.captures, asOf: other.asOf, salt: other.salt });
  assert.throws(() => buildEquivalence({ ...inputOf(m), watch: otherWatch }), (e: unknown) => e instanceof EquivalenceInputError && e.code === 'WATCH_MISMATCH');
});

test('el informe lleva huella, solo seudónimos y la barrera lo para si se cuela un texto del CRM', () => {
  const m = buildMigratedCompany({ traps: true });
  const { report } = releaseEquivalence(inputOf(m));
  const json = equivalenceToJson(report);
  for (const text of m.forbidden) assert.ok(!json.toLowerCase().includes(text.toLowerCase()), 'no sale ' + text);
  assert.equal(verifyEquivalenceReport(report), true);
  assert.deepEqual(parseEquivalenceReport(JSON.parse(json)), report);

  const touched = structuredClone(report);
  touched.objects[1]!.intact += 12;
  assert.equal(verifyEquivalenceReport(touched), false);
  touched.findings[0]!.summary = 'Faltan, entre otros, ' + m.closing.contacts[5]!.name;
  assert.ok(findEquivalenceLeaks(touched, m.closing).includes(m.closing.contacts[5]!.name.toLowerCase()));
  assert.throws(() => parseEquivalenceReport({ ...JSON.parse(json), format: 'planb-verifica-watch-v1' }), EquivalenceFormatError);
  assert.throws(() => parseEquivalenceReport({ ...JSON.parse(json), findings: [{ ...JSON.parse(json).findings[0], kind: 'ok' }] }), EquivalenceFormatError);
  // Un ID del cierre que coincide con un texto del informe: la barrera de la sala limpia también se aplica aquí.
  const closing = { ...m.closing, deals: [{ ...m.closing.deals[0]!, id: 'planb-verifica-equivalence-v1' }, ...m.closing.deals.slice(1)] };
  assert.throws(() => releaseEquivalence({ ...inputOf(m), closing, watch: null }), CleanRoomError);
});

test('con el destino exportado a medias, lo que no se encuentra no se da por perdido', () => {
  const m = buildMigratedCompany({ traps: true });
  const target = structuredClone(m.target);
  const persons = target.objects.find(o => o.objectType === 'persons')!;
  persons.coverage = 'partial';
  const { report } = releaseEquivalence({ ...inputOf(m), target });
  const contacts = report.findings.filter(f => f.object === 'contacts').map(f => f.kind + ':' + f.figures.records);
  assert.deepEqual(contacts, ['doubtful:2', 'not-concluded:12']);
  assert.equal(report.verdict, 'differences-found', 'las diferencias confirmadas de otros objetos siguen ahí');
  assert.match(report.target.detail, /parcial en persons/);
  // Un mapa que no cubre los contactos lo dice, en vez de callarlo.
  const map = { ...m.map, objects: m.map.objects.filter(o => o.sourceObject !== 'contacts') };
  assert.ok(releaseEquivalence({ ...inputOf(m), map }).report.notCovered.includes('Contactos: no está en el mapa.'));
});

test('la lista de trabajo lleva los IDs reales y escapa lo que una hoja de cálculo ejecutaría', () => {
  const m = buildMigratedCompany({ traps: true });
  const { comparison } = buildEquivalence(inputOf(m));
  const lines = equivalenceWorkList(comparison).trimEnd().split('\r\n');
  assert.equal(lines[0], 'objeto;tipo;id_cierre;id_destino;detalle');
  assert.equal(lines.length - 1, 12 + 2 + 5 + 3 + 4 + 3);
  const absent = lines.filter(line => line.startsWith('contacts;no-llego;')).map(line => line.split(';')[2]);
  assert.equal(absent.length, 12);
  assert.ok(absent.every(id => m.closing.contacts.some(c => c.id === id)));
  const odd = structuredClone(comparison);
  odd.objects[0]!.findings.extra = ['=HYPERLINK("x")'];
  assert.ok(equivalenceWorkList(odd).includes(`;"'=HYPERLINK(""x"")";`));
});

test('script de migración: comprueba el parte, escribe el informe y la lista, y nunca sobrescribe', async () => {
  const files = new Map([...migrationExampleFiles(true)]);
  const watched = buildWatchedCompany({ traps: true });
  assert.equal(files.get('cierre.json'), watchExampleFiles(true).get('semana-5.json'), 'cierre.json es la última semana');
  files.set('parte.json', watchReportToJson(buildWatchReport({ signing: watched.signing, captures: watched.captures, asOf: watched.asOf, salt: watched.salt })));
  files.set('sal.txt', MIGRATION_SALT + '\n');
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
  const base = ['--closing', 'cierre.json', '--target', 'destino.json', '--map', 'mapa.json', '--salt', 'sal.txt', '--watch', 'parte.json'];

  const first = await run([...base, '--report', 'equivalencia.json', '--work-list', 'lista.csv', '--as-of', MIGRATION_AS_OF]);
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /Hay diferencias/);
  assert.match(first.out, /última del parte de vigilancia/);
  assert.ok(!first.out.includes(MIGRATION_SALT), 'la sal no se imprime');
  const report = parseEquivalenceReport(JSON.parse(written.get('equivalencia.json')!));
  assert.equal(verifyEquivalenceReport(report), true);
  assert.deepEqual(checkEquivalence(report, buildMigratedCompany({ traps: true }).expected), []);
  assert.equal(report.closing.fingerprint, fingerprintOf(JSON.parse(files.get('cierre.json')!)));
  assert.ok(written.get('lista.csv')!.includes('contacts;no-llego;'));
  assert.ok(!first.out.includes('no-llego'), 'la lista no se imprime');

  assert.equal((await run([...base, '--report', 'equivalencia.json', '--as-of', MIGRATION_AS_OF])).code, 1, 'no sobrescribe');
  const wrongMap = await run(['--closing', 'cierre.json', '--target', 'destino.json', '--map', 'parte.json', '--salt', 'sal.txt', '--report', 'otro.json']);
  assert.equal(wrongMap.code, 2);
  const missingSalt = await run([...base.slice(0, 6), '--salt', 'sal-nueva.txt', '--watch', 'parte.json', '--report', 'otro.json']);
  assert.equal(missingSalt.code, 2, 'con --watch hace falta la sal de la vigilancia');
  assert.equal(written.has('otro.json'), false);
});
