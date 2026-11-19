import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildMigrationReport, REPORT_LIST_CAP, renderMigrationHtml, renderMigrationJson } from '../shared/migration-report.js';
import { createMigrationDemo, migrationDemoExpectations } from '../shared/migration-demo.js';
import {
  canonicalJson, compareMigration, countersAddUp, isCalendarDay, MigrationInputError, migrationExport, migrationMap, parseInstant, sha256Hex,
  type MigrationComparison, type MigrationExport,
} from '../shared/migration-verifier.js';

// Verificador de migraciones: motor y informe PUROS, con exportaciones FICTICIAS HubSpot/Pipedrive. Sin red, sin proveedor, sin credenciales. El oráculo de las cifras está escrito a mano en
// `migrationDemoExpectations` (independiente del motor). Esta unidad es un motor interno: no hay pantalla ni endpoint, y estas pruebas no acreditan migraciones reales.
const GENERATED = '2026-11-08T10:00:00.000Z';
const clone = <T>(value: T): T => structuredClone(value);
const demo = () => createMigrationDemo();
const run = (mutate?: (d: ReturnType<typeof demo>) => void, options?: { includeValues?: boolean }) => { const d = demo(); mutate?.(d); return compareMigration(d.source, d.target, d.map, options); };
const object = (c: MigrationComparison, name: string) => c.objects.find(o => o.sourceObject === name)!;
const objectOf = (d: { source: MigrationExport; target: MigrationExport }, side: 'source' | 'target', name: string) => d[side].objects.find(o => o.objectType === name)!;

test('SHA-256 PURO coincide con node:crypto (vacío, límites de bloque, Unicode y entrada grande) y el JSON canónico ordena claves', () => {
  for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'Inés 🙂 «ñ» € ' + 'x'.repeat(1000), 'z'.repeat(300_000)]) assert.equal(sha256Hex(text), createHash('sha256').update(text, 'utf8').digest('hex'), text.slice(0, 12) + ':' + text.length);
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: undefined, e: null }], z: 'x' }), '{"a":[{"d":2,"e":null}],"b":1,"z":"x"}'); assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test('FECHAS: con zona explícita es un instante exacto; sin zona exige la del volcado; hora local inexistente o ambigua y fechas imposibles NO se adivinan', () => {
  const ms = (iso: string) => Date.parse(iso);
  assert.deepEqual(parseInstant('2026-03-10T09:00:00Z', null), { ok: true, ms: ms('2026-03-10T09:00:00Z') });
  assert.deepEqual(parseInstant('2026-03-10 10:00:00+01:00', null), { ok: true, ms: ms('2026-03-10T09:00:00Z') });
  assert.deepEqual(parseInstant('2026-03-10T10:00:00+0100', null), { ok: true, ms: ms('2026-03-10T09:00:00Z') });
  assert.deepEqual(parseInstant('2026-03-10 10:00:00', 'Europe/Madrid'), { ok: true, ms: ms('2026-03-10T09:00:00Z') }, 'invierno: UTC+1');
  assert.deepEqual(parseInstant('2026-07-10 10:00', 'Europe/Madrid'), { ok: true, ms: ms('2026-07-10T08:00:00Z') }, 'verano: UTC+2');
  assert.deepEqual(parseInstant('2026-07-10 10:00:00', 'UTC'), { ok: true, ms: ms('2026-07-10T10:00:00Z') });
  assert.deepEqual(parseInstant('2026-07-10 06:00:00', 'America/New_York'), { ok: true, ms: ms('2026-07-10T10:00:00Z') });
  assert.deepEqual(parseInstant('2026-07-10 10:00:00', null), { ok: false, reason: 'timezone-missing' });
  assert.deepEqual(parseInstant('2026-10-25 02:30:00', 'Europe/Madrid'), { ok: false, reason: 'local-time-ambiguous' });
  assert.deepEqual(parseInstant('2026-03-29 02:30:00', 'Europe/Madrid'), { ok: false, reason: 'local-time-nonexistent' });
  assert.deepEqual(parseInstant('2026-10-25 01:59:59', 'Europe/Madrid'), { ok: true, ms: ms('2026-10-24T23:59:59Z') });
  for (const bad of ['2026-02-30T10:00:00Z', '2026-13-01 10:00:00', '2026-01-01 24:00:00', 'ayer', '', '1700000000', '2026-01-01', '2026-01-01T10:00:00+99', '2026-01-01T10:00:00+99:99']) assert.equal(parseInstant(bad, 'UTC').ok, false, bad);
});

test('LAS EXPORTACIONES Y EL MAPA SE VALIDAN: IDs repetidos, zona inválida, objetos repetidos, $id sin declarar equivalencia y declararla sin usarla se rechazan', () => {
  const d = demo();
  const dup = clone(d.source); dup.objects[0]!.rows.push(clone(dup.objects[0]!.rows[0]!)); assert.equal(migrationExport.safeParse(dup).success, false);
  assert.equal(migrationExport.safeParse({ ...clone(d.source), timezone: 'Marte/Olympus' }).success, false);
  const twice = clone(d.source); twice.objects.push(clone(twice.objects[0]!)); assert.equal(migrationExport.safeParse(twice).success, false);
  assert.equal(migrationExport.safeParse({ ...clone(d.source), extra: 1 }).success, false);
  const byId = clone(d.map); byId.objects[0]!.matchKey = [{ source: '$id', target: '$id', normalize: 'exact' }]; assert.equal(migrationMap.safeParse(byId).success, false, 'IDs iguales entre proveedores no son clave sin declararlo');
  byId.objects[0]!.acknowledgeIdEquivalence = true; assert.equal(migrationMap.safeParse(byId).success, true);
  const idle = clone(d.map); idle.objects[0]!.acknowledgeIdEquivalence = true; assert.equal(migrationMap.safeParse(idle).success, false);
  const repeated = clone(d.map); repeated.objects.push(clone(repeated.objects[0]!)); assert.equal(migrationMap.safeParse(repeated).success, false);
  assert.equal(migrationMap.safeParse({ ...clone(d.map), objects: [] }).success, false);
});

test('ENTRADAS INCOHERENTES: otro proveedor o cuenta que el mapa, objetos que faltan o relaciones hacia objetos no mapeados lanzan un error con código', () => {
  const codeOf = (fn: () => unknown) => { try { fn(); } catch (error) { assert.ok(error instanceof MigrationInputError); return error.code; } return 'NO_LANZA'; };
  const d = demo();
  assert.equal(codeOf(() => compareMigration({ ...d.source, provider: 'otro-fixture' }, d.target, d.map)), 'MAP_SOURCE_MISMATCH');
  assert.equal(codeOf(() => compareMigration(d.source, { ...d.target, accountId: 'fixture-otra' }, d.map)), 'MAP_TARGET_MISMATCH');
  assert.equal(codeOf(() => compareMigration({ nada: 1 }, d.target, d.map)), 'SOURCE_INVALID');
  assert.equal(codeOf(() => compareMigration(d.source, d.target, { nada: 1 })), 'MAP_INVALID');
  const missing = clone(d.target); missing.objects = missing.objects.filter(o => o.objectType !== 'person'); assert.equal(codeOf(() => compareMigration(d.source, missing, d.map)), 'TARGET_OBJECT_MISSING');
  const noSource = clone(d.source); noSource.objects = noSource.objects.filter(o => o.objectType !== 'contact'); assert.equal(codeOf(() => compareMigration(noSource, d.target, d.map)), 'SOURCE_OBJECT_MISSING');
  const dangling = clone(d.map); dangling.objects = dangling.objects.filter(o => o.sourceObject !== 'company'); assert.equal(codeOf(() => compareMigration(d.source, d.target, dangling)), 'RELATION_OBJECT_MISSING');
  const crossed = clone(d.map); crossed.objects[0]!.relations[0]!.targetObject = 'person'; assert.equal(codeOf(() => compareMigration(d.source, d.target, crossed)), 'RELATION_OBJECT_MISMATCH');
});

test('CIFRAS DEL ESCENARIO: cada objeto produce exactamente el oráculo escrito a mano y los contadores SUMAN las filas de entrada', () => {
  const c = run();
  assert.equal(c.verdict, 'differences-found'); assert.equal(countersAddUp(c), true);
  for (const [name, expected] of Object.entries(migrationDemoExpectations)) {
    const o = object(c, name), counts = o.counts;
    assert.deepEqual({ identical: counts.identical, changed: counts.changed, uncertain: counts.uncertain, absent: counts.absent, notFound: counts.notFound, doubtful: counts.doubtful, missingKey: counts.missingKey, matchedTargets: counts.matchedTargets, extra: counts.extra, unverifiedExtra: counts.unverifiedExtra, doubtfulTargets: counts.doubtfulTargets, unmatchedTargetKeyless: counts.unmatchedTargetKeyless },
      { identical: expected.identical, changed: expected.changed, uncertain: expected.uncertain, absent: expected.absent, notFound: expected.notFound, doubtful: expected.doubtful, missingKey: expected.missingKey, matchedTargets: expected.matchedTargets, extra: expected.extra, unverifiedExtra: expected.unverifiedExtra, doubtfulTargets: expected.doubtfulTargets, unmatchedTargetKeyless: expected.unmatchedTargetKeyless }, name);
    assert.deepEqual({ total: o.relations.total, ok: o.relations.ok, broken: o.relations.broken, inconclusive: o.relations.inconclusive }, expected.relations, name + ' · relaciones');
  }
  assert.deepEqual(run(), c, 'determinista');
});

test('CLASIFICACIÓN: ausentes, cambios relevantes (con su campo), dudosos CON candidatos sin resolver, sin clave, sobrantes y el mismo ID en otra persona NO empareja', () => {
  const contact = object(run(), 'contact');
  assert.deepEqual(contact.findings.absent, ['1005']);
  assert.deepEqual(contact.findings.changed.map(x => [x.sourceId, x.targetId, x.changes.map(ch => [ch.field, ch.kind])]), [
    ['1003', 'p-3', [['phone → phone', 'different']]], ['1004', 'p-4', [['last_name → name_last', 'different'], ['created_at → add_time', 'different']]], ['1012', 'p-12', [['created_at → add_time', 'missing-in-target']]],
  ]);
  assert.deepEqual(contact.findings.doubtful, [
    { sourceId: '1006', reason: 'multiple-candidates', candidates: ['p-6a', 'p-6b'] }, { sourceId: '1007', reason: 'duplicate-source-key', candidates: ['p-7'] }, { sourceId: '1008', reason: 'duplicate-source-key', candidates: ['p-7'] },
  ]);
  assert.deepEqual(contact.findings.missingKey, ['1009']); assert.deepEqual(contact.findings.keylessTargets, ['p-100']);
  assert.deepEqual(contact.findings.extra.sort(), ['501', 'p-99'], 'el 501 del destino es OTRA persona (jose): sobrante, no pareja de ines');
  assert.deepEqual(contact.findings.uncertain.map(x => [x.sourceId, x.changes[0]!.reason]), [['1011', 'local-time-ambiguous']]);
  const deals = object(run(), 'deal');
  assert.deepEqual(deals.findings.uncertain.map(x => [x.sourceId, x.changes[0]!.reason]), [['d5', 'unmapped-value']]); assert.deepEqual(deals.findings.changed.map(x => x.sourceId), ['d6']); assert.deepEqual(deals.findings.absent, ['d8']);
  assert.deepEqual(object(run(), 'company').findings.changed.map(x => x.sourceId), ['co2']);
});

test('IGUALDAD DE ID ENTRE PROVEEDORES: no es correspondencia. Solo si la persona declara que comparten identificador se usa $id, y entonces corresponde por ID', () => {
  const byEmail = object(run(), 'contact');
  assert.ok(!byEmail.findings.changed.some(x => x.sourceId === '501') && byEmail.counts.identical === 4);
  const c = run(d => { const m = d.map.objects[0]!; m.matchKey = [{ source: '$id', target: '$id', normalize: 'exact' }]; m.acknowledgeIdEquivalence = true; });
  const contact = object(c, 'contact');
  assert.ok(contact.findings.changed.some(x => x.sourceId === '501' && x.targetId === '501'), 'con $id declarado, el 501 de origen se empareja con el 501 del destino (que es jose)');
  assert.equal(countersAddUp(c), true);
});

test('COBERTURA PARCIAL: con el destino parcial «no encontrado» NO es «ausente», con el origen parcial «sobrante» NO es sobrante y un total declarado incoherente degrada la cobertura', () => {
  const partialTarget = run(d => { objectOf(d, 'target', 'person').coverage = 'partial'; objectOf(d, 'target', 'person').declaredTotal = null; });
  const contact = object(partialTarget, 'contact');
  assert.equal(contact.counts.absent, 0); assert.equal(contact.counts.notFound, 1); assert.deepEqual(contact.findings.notFound, ['1005']); assert.equal(countersAddUp(partialTarget), true);
  assert.equal(contact.counts.extra, 2, 'el origen es completo: los sobrantes siguen siéndolo');
  const sample = run(d => { objectOf(d, 'source', 'contact').coverage = 'sample'; objectOf(d, 'source', 'contact').declaredTotal = null; });
  assert.equal(object(sample, 'contact').counts.extra, 0); assert.equal(object(sample, 'contact').counts.unverifiedExtra, 2); assert.equal(object(sample, 'contact').counts.absent, 1, 'con el destino completo, ausente sí');
  const lying = run(d => { objectOf(d, 'target', 'person').declaredTotal = 99; });
  assert.equal(object(lying, 'contact').coverage.targetEffective, 'partial'); assert.equal(object(lying, 'contact').counts.absent, 0); assert.ok(object(lying, 'contact').fieldIssues.some(i => /total declarado/.test(i)));
  const clean = demo(); const only = compareMigration(clean.source, clean.target, clean.map); assert.equal(only.verdict, 'differences-found');
  const html = renderMigrationHtml(buildMigrationReport(partialTarget, { generatedAt: GENERATED })); assert.match(html, /no significa que el proveedor no lo tenga/);
});

test('RELACIONES: rota por falta, por apuntar a otro registro o a uno inexistente; sin concluir si depende de algo no emparejado o el destino es parcial', () => {
  const deals = object(run(), 'deal').relations.findings.map(f => [f.sourceId, f.state, f.reason]);
  assert.deepEqual(deals, [['d2', 'broken', 'relation-missing'], ['d3', 'broken', 'relation-mismatch'], ['d4', 'broken', 'dangling-target-reference'], ['d7', 'inconclusive', 'dependency-unresolved']]);
  const partialOrgs = run(d => { objectOf(d, 'target', 'organization').coverage = 'partial'; objectOf(d, 'target', 'organization').declaredTotal = null; });
  assert.deepEqual(object(partialOrgs, 'deal').relations.findings.filter(f => f.sourceId === 'd4').map(f => [f.state, f.reason]), [['inconclusive', 'target-reference-unverifiable']], 'con organizaciones parciales, un destino inexistente no se afirma roto');
  const brokenSource = run(d => { objectOf(d, 'source', 'deal').rows[0]!.values.company_id = 'co-inexistente'; });
  assert.ok(object(brokenSource, 'deal').relations.findings.some(f => f.sourceId === 'd1' && f.reason === 'source-reference-missing'));
});

test('CAMPOS: opcional ausente no cuenta, obligatorio ausente sí, irrelevante se ignora, valores no interpretables y sin traducción quedan sin concluir, nunca iguales', () => {
  const noise = run(d => { const m = d.map.objects[0]!; objectOf(d, 'source', 'contact').rows[0]!.values.nickname = 'Anita'; m.fields.find(f => f.source === 'nickname')!.required = false; });
  assert.equal(object(noise, 'contact').findings.changed.some(x => x.sourceId === '1001'), false, 'campo opcional presente solo en el origen y ausente en el destino: no cuenta');
  const required = run(d => { objectOf(d, 'source', 'contact').rows[0]!.values.nickname = 'Anita'; d.map.objects[0]!.fields.find(f => f.source === 'nickname')!.required = true; });
  assert.ok(object(required, 'contact').findings.changed.some(x => x.sourceId === '1001' && x.changes[0]!.kind === 'missing-in-target'));
  const irrelevant = run(d => { d.map.objects[0]!.fields.find(f => f.source === 'phone')!.relevant = false; }); assert.equal(object(irrelevant, 'contact').counts.changed, 2, 'carla ya no cambia: el teléfono es irrelevante');
  const bad = run(d => { objectOf(d, 'source', 'deal').rows[0]!.values.amount = 'mucho'; });
  assert.deepEqual(object(bad, 'deal').findings.uncertain.filter(x => x.sourceId === 'd1').map(x => x.changes[0]!.reason), ['unparseable']);
  const noZone = run(d => { d.target.timezone = null; });
  assert.ok(object(noZone, 'contact').findings.uncertain.some(x => x.sourceId === '1001' && x.changes[0]!.reason === 'timezone-missing'), 'sin zona del destino, las fechas locales no se adivinan');
  const tolerant = run(d => { d.map.objects[0]!.fields.find(f => f.source === 'created_at')!.toleranceSeconds = 3600; }); assert.ok(!object(tolerant, 'contact').findings.changed.some(x => x.sourceId === '1004' && x.changes.some(ch => ch.field.startsWith('created_at'))), 'la tolerancia de 1 h absorbe la diferencia horaria de diego');
  const money = run(d => { objectOf(d, 'source', 'deal').rows[5]!.values.amount = '1250'; }); assert.equal(object(money, 'deal').counts.changed, 0, 'texto numérico y número son el mismo importe');
});

test('LO AMBIGUO NO SE RESUELVE: los dudosos no cuentan como iguales ni como cambiados, ni emparejan el destino aunque haya un candidato único; y el veredicto no es «sin diferencias»', () => {
  const d = demo(); const c = compareMigration(d.source, d.target, d.map);
  const contact = object(c, 'contact');
  assert.equal(contact.counts.doubtful, 3); assert.equal(contact.counts.identical + contact.counts.changed + contact.counts.uncertain + contact.counts.absent + contact.counts.doubtful + contact.counts.missingKey, 13);
  const gina = contact.findings.doubtful.filter(x => x.reason === 'duplicate-source-key'); assert.equal(gina.length, 2); assert.deepEqual(gina[0]!.candidates, ['p-7']);
  assert.ok(!contact.findings.changed.concat(contact.findings.uncertain).some(x => ['1006', '1007', '1008'].includes(x.sourceId)));
  assert.notEqual(c.verdict, 'no-differences-in-scope');
});

test('VEREDICTO: solo «sin diferencias en el alcance confirmado» con exportaciones completas y nada dudoso o sin concluir; jamás afirma «migración íntegra»', () => {
  const d = demo();
  const clean = { source: clone(d.source), target: clone(d.target), map: clone(d.map) };
  const keep = new Set(['1001', '1002']);
  clean.source.objects = [{ ...objectOf(d, 'source', 'contact'), rows: objectOf(d, 'source', 'contact').rows.filter(r => keep.has(r.id)), declaredTotal: 2 }];
  clean.target.objects = [{ ...objectOf(d, 'target', 'person'), rows: objectOf(d, 'target', 'person').rows.filter(r => r.id === 'p-1' || r.id === 'p-2'), declaredTotal: 2 }];
  clean.map.objects = [{ ...clone(d.map.objects[0]!), relations: [] }];
  const c = compareMigration(clean.source, clean.target, clean.map); assert.equal(c.verdict, 'no-differences-in-scope'); assert.equal(object(c, 'contact').counts.identical, 2);
  const report = buildMigrationReport(c, { generatedAt: GENERATED }), html = renderMigrationHtml(report), json = renderMigrationJson(report);
  assert.equal(report.headline, 'Sin diferencias en el alcance confirmado'); assert.match(report.scope, /No acredita que la migración sea íntegra/);
  for (const text of [html, json]) assert.ok(!/migración (es )?íntegra(?! ni)/i.test(text.replace(/No acredita que la migración sea íntegra/g, '')), 'solo aparece negada');
  const partial = clone(clean.source); partial.objects[0]!.coverage = 'sample'; assert.equal(compareMigration(partial, clean.target, clean.map).verdict, 'inconclusive', 'una muestra nunca da «sin diferencias»');
  const part = clone(clean.target); part.objects[0]!.coverage = 'partial'; assert.equal(compareMigration(clean.source, part, clean.map).verdict, 'inconclusive');
  assert.equal(compareMigration(d.source, d.target, d.map).verdict, 'differences-found');
});

test('INFORME REPRODUCIBLE: mismas entradas y mismo instante → mismos bytes (JSON y HTML); solo cambia lo que se pide; la procedencia lleva las huellas de las entradas', () => {
  const d = demo(), c = compareMigration(d.source, d.target, d.map), a = buildMigrationReport(c, { generatedAt: GENERATED }), b = buildMigrationReport(compareMigration(clone(d.source), clone(d.target), clone(d.map)), { generatedAt: GENERATED });
  assert.equal(renderMigrationJson(a), renderMigrationJson(b)); assert.equal(renderMigrationHtml(a), renderMigrationHtml(b)); assert.ok(renderMigrationJson(a).endsWith('}\n'));
  const later = renderMigrationJson(buildMigrationReport(c, { generatedAt: '2026-11-09T10:00:00.000Z' })); assert.equal(later.replace('2026-11-09T10:00:00.000Z', GENERATED), renderMigrationJson(a));
  const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
  assert.equal(a.provenance.source.sha256, sha(d.source)); assert.equal(a.provenance.target.sha256, sha(d.target)); assert.equal(a.provenance.map.sha256, sha(d.map));
  const reorderedSource = clone(d.source); reorderedSource.objects[0]!.rows = [...reorderedSource.objects[0]!.rows].reverse();
  assert.equal(renderMigrationJson(buildMigrationReport(compareMigration(reorderedSource, d.target, d.map), { generatedAt: GENERATED })).includes('"absent"'), true);
  assert.deepEqual(compareMigration(reorderedSource, d.target, d.map).objects.map(o => o.counts), c.objects.map(o => o.counts), 'el orden de las filas no cambia las cifras');
  const altered = clone(d.source); altered.objects[0]!.rows[0]!.values.first_name = 'Anita'; assert.notEqual(compareMigration(altered, d.target, d.map).provenance.source.sha256, c.provenance.source.sha256);
  for (const bad of ['', 'ayer', '2026-11-08T10:00:00+01:00', '2026-11-08']) assert.throws(() => buildMigrationReport(c, { generatedAt: bad }), /generatedAt/);
  assert.equal(JSON.parse(renderMigrationJson(a)).countersAddUp, true);
});

test('PRIVACIDAD Y SEGURIDAD DEL HTML: sin valores de campos por defecto, todo escapado, sin scripts ni recursos externos y con política CSP restrictiva; con includeValues se muestran recortados y escapados', () => {
  const d = demo(); d.source.objects[0]!.rows[0]!.id = '<script>alert(1)</script>"&\'`'; d.target.objects[0]!.rows[0]!.values.name_first = 'Zed';
  const hostile = compareMigration(d.source, d.target, d.map), html = renderMigrationHtml(buildMigrationReport(hostile, { generatedAt: GENERATED })), json = renderMigrationJson(buildMigrationReport(hostile, { generatedAt: GENERATED }));
  assert.ok(!html.includes('<script') && !/<script|javascript:|onerror=|https?:\/\//i.test(html.replace('&#60;script&#62;', '')), 'sin scripts ni URLs'); assert.ok(html.includes('&#60;script&#62;alert(1)&#60;/script&#62;&#34;&#38;&#39;&#96;'));
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/); assert.match(html, /<meta name="viewport"/); assert.match(html, /prefers-color-scheme:dark/);
  for (const secret of ['Moral', 'carla@example.test', '600 999 003', 'Zed']) assert.ok(!html.includes(secret) && !json.includes(secret), 'sin valores: ' + secret);
  const withValues = compareMigration(d.source, d.target, d.map, { includeValues: true }), shown = renderMigrationHtml(buildMigrationReport(withValues, { generatedAt: GENERATED }));
  assert.ok(shown.includes('Moral') && shown.includes('Zed')); d.source.objects[0]!.rows[2]!.values.last_name = '<img src=x onerror=alert(1)>' + 'x'.repeat(200);
  const escaped = renderMigrationHtml(buildMigrationReport(compareMigration(d.source, d.target, d.map, { includeValues: true }), { generatedAt: GENERATED })); assert.ok(!escaped.includes('<img') && escaped.includes('&#60;img'));
  assert.ok(!/x{81}/.test(escaped), 'los valores se recortan a 80');
});

test('LISTAS ACOTADAS CON CIFRAS EXACTAS: con 250 ausentes el informe lista 200 y lo dice, pero el recuento es 250 y los contadores siguen sumando; un millar de filas no cuelga el motor', () => {
  const d = demo(); const contact = objectOf(d, 'source', 'contact'); contact.rows = Array.from({ length: 250 }, (_, i) => ({ id: 's' + i, values: { email: 'u' + i + '@example.test', first_name: 'U', last_name: 'X', phone: '1', company_id: 'co1', created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } })); contact.declaredTotal = 250;
  const c = compareMigration(d.source, d.target, d.map), report = buildMigrationReport(c, { generatedAt: GENERATED }), o = report.objects.find(x => x.sourceObject === 'contact')!;
  assert.equal(o.absent.total, 250); assert.equal(o.absent.items.length, REPORT_LIST_CAP); assert.equal(o.absent.truncated, true); assert.equal(report.countersAddUp, true); assert.match(renderMigrationHtml(report), /primeros 200 de 250/);
  const started = Date.now(), big = demo(), rows = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: prefix + i, values: { email: 'u' + i + '@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } }));
  const bs = objectOf(big, 'source', 'contact'), bt = objectOf(big, 'target', 'person'); bs.rows = rows(20_000, 's'); bs.declaredTotal = 20_000; bt.rows = rows(20_000, 't').map(r => ({ ...r, values: { ...r.values, name_first: 'A', name_last: 'B', org_id: null, add_time: '2026-03-10 10:00:00', newsletter: 'true' } })); bt.declaredTotal = 20_000;
  const r = compareMigration(big.source, big.target, big.map); assert.equal(object(r, 'contact').counts.identical, 20_000); assert.ok(Date.now() - started < 8000, 'rendimiento razonable');
});

test('ENTRADA HOSTIL: claves tipo prototipo, valores enormes o tipos raros no rompen el motor ni contaminan objetos', () => {
  const d = demo(); objectOf(d, 'source', 'contact').rows[0]!.values['__proto__x'] = 'x'; assert.doesNotThrow(() => compareMigration(d.source, d.target, d.map));
  assert.equal(migrationExport.safeParse({ ...clone(d.source), objects: [{ objectType: 'contact', coverage: 'complete', declaredTotal: 1, rows: [{ id: '1', values: { a: 'x'.repeat(2001) } }] }] }).success, false);
  assert.equal(migrationExport.safeParse({ ...clone(d.source), objects: [{ objectType: 'contact', coverage: 'complete', declaredTotal: 1, rows: [{ id: '1', values: { a: { b: 1 } } }] }] }).success, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('EL MAPA Y LAS ENTRADAS NO SE MODIFICAN: comparar no cambia sus argumentos', () => {
  const d = demo(), before = [canonicalJson(d.source), canonicalJson(d.target), canonicalJson(d.map)]; compareMigration(d.source, d.target, d.map, { includeValues: true });
  assert.deepEqual([canonicalJson(d.source), canonicalJson(d.target), canonicalJson(d.map)], before);
  const a = createMigrationDemo(), b = createMigrationDemo(); a.source.objects[0]!.rows.pop(); assert.notEqual(canonicalJson(a.source), canonicalJson(b.source), 'cada llamada devuelve copias independientes');
});

test('SOLO LO DUDOSO YA IMPIDE «SIN DIFERENCIAS»: con exportaciones completas y una clave repetida en el origen sin candidatos en el destino, el veredicto es «no se puede concluir»', () => {
  const d = demo(), contact = objectOf(d, 'source', 'contact');
  const twin = (id: string) => ({ id, values: { email: 'repetida@example.test', first_name: 'R', last_name: 'R', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } });
  const only = { source: clone(d.source), target: clone(d.target), map: { ...clone(d.map), objects: [{ ...clone(d.map.objects[0]!), relations: [] }] } };
  only.source.objects = [{ ...contact, rows: [twin('x1'), twin('x2')], declaredTotal: 2 }]; only.target.objects = [{ ...objectOf(d, 'target', 'person'), rows: [], declaredTotal: 0 }];
  const c = compareMigration(only.source, only.target, only.map);
  assert.equal(object(c, 'contact').counts.doubtful, 2); assert.equal(object(c, 'contact').counts.doubtfulTargets, 0); assert.equal(c.verdict, 'inconclusive');
});

test('EL INFORME NO CONFÍA EN SÍ MISMO: si los contadores de una comparación manipulada no suman las filas de entrada, el JSON lo declara falso y el HTML avisa', () => {
  const c = clone(run()); c.objects[0]!.counts.identical += 1;
  const report = buildMigrationReport(c, { generatedAt: GENERATED });
  assert.equal(report.countersAddUp, false); assert.match(renderMigrationHtml(report), /NO suman las filas de entrada/); assert.equal(JSON.parse(renderMigrationJson(report)).countersAddUp, false);
});

// ───────────────────────────── R2 · propiedades propias, días de calendario reales y avisos de recorte ─────────────────────────────
// Entradas obtenidas con JSON.parse (objetos «de fichero»): el motor no puede leer nada de Object.prototype ni de sus propios mapas por herencia.
const AT = '2026-11-08T10:00:00.000Z';
function minimal(options: { left?: string; right?: string; type?: 'text' | 'date'; valueMap?: Record<string, string> } = {}) {
  const file = (provider: string, id: string, value: string) => JSON.parse(JSON.stringify({ format: 'planb-migration-export-v1', provider, accountId: 'fixture-account', exportedAt: AT, timezone: 'UTC', objects: [{ objectType: 'contacts', coverage: 'complete', declaredTotal: 1, rows: [{ id, values: { key: 'k', value } }] }] })) as MigrationExport;
  const source = file('source-fixture', 's1', options.left ?? 'a'), target = file('target-fixture', 't1', options.right ?? 'a');
  const map = JSON.parse(JSON.stringify({ format: 'planb-migration-map-v1', sourceProvider: 'source-fixture', sourceAccountId: 'fixture-account', targetProvider: 'target-fixture', targetAccountId: 'fixture-account', confirmedBy: 'Persona ficticia declarada', confirmedAt: AT,
    objects: [{ sourceObject: 'contacts', targetObject: 'contacts', acknowledgeIdEquivalence: false, matchKey: [{ source: 'key', target: 'key', normalize: 'exact' }], fields: [{ source: 'value', target: 'value', type: options.type ?? 'text', normalize: 'exact', required: true, relevant: true, ...(options.valueMap ? { valueMap: options.valueMap } : {}) }], relations: [] }] })) as ReturnType<typeof createMigrationDemo>['map'];
  return { source, target, map };
}
const counts = (c: MigrationComparison) => c.objects[0]!.counts;

test('R2 · PROPIEDADES PROPIAS: una clave, un campo o una traducción llamados constructor/toString que NO existen no inventan correspondencias, campos presentes ni traducciones', () => {
  const keyed = minimal(); keyed.map.objects[0]!.matchKey = [{ source: 'constructor', target: 'constructor', normalize: 'exact' }]; keyed.map.objects[0]!.fields = [];
  const k = compareMigration(keyed.source, keyed.target, keyed.map); assert.equal(counts(k).missingKey, 1); assert.equal(counts(k).matchedTargets, 0); assert.equal(counts(k).identical, 0); assert.equal(counts(k).unmatchedTargetKeyless, 1); assert.equal(k.verdict, 'inconclusive');
  for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const field = minimal(); field.map.objects[0]!.fields[0]!.source = name; field.map.objects[0]!.fields[0]!.target = name;
    const c = compareMigration(field.source, field.target, field.map); assert.equal(c.verdict, 'inconclusive', name); assert.equal(c.objects[0]!.fieldIssues.length, 2, name + ': avisa de la ausencia en ambos lados'); assert.notEqual(c.verdict, 'no-differences-in-scope');
  }
  for (const inherited of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
    const translated = minimal({ left: inherited, right: String((Object.prototype as unknown as Record<string, unknown>)[inherited]), valueMap: {} });
    const c = compareMigration(translated.source, translated.target, translated.map); assert.equal(counts(c).uncertain, 1, inherited + ': valor sin traducción'); assert.equal(counts(c).identical, 0); assert.equal(c.verdict, 'inconclusive');
    assert.equal(c.objects[0]!.findings.uncertain[0]!.changes[0]!.reason, 'unmapped-value', inherited);
  }
});

test('R2 · CONTROL POSITIVO: las propiedades PROPIAS llamadas constructor/toString siguen siendo claves, campos y traducciones legítimos', () => {
  for (const name of ['constructor', 'toString']) {
    const key = minimal(); for (const side of [key.source, key.target]) side.objects[0]!.rows[0]!.values[name] = 'identidad-ficticia'; key.map.objects[0]!.matchKey = [{ source: name, target: name, normalize: 'exact' }];
    assert.equal(compareMigration(key.source, key.target, key.map).verdict, 'no-differences-in-scope', name + ' como clave');
    const field = minimal(); for (const side of [field.source, field.target]) side.objects[0]!.rows[0]!.values[name] = 'igual'; field.map.objects[0]!.fields[0]!.source = name; field.map.objects[0]!.fields[0]!.target = name;
    const same = compareMigration(field.source, field.target, field.map); assert.equal(same.verdict, 'no-differences-in-scope', name + ' como campo'); field.target.objects[0]!.rows[0]!.values[name] = 'otro'; assert.equal(counts(compareMigration(field.source, field.target, field.map)).changed, 1, name + ' detecta su diferencia');
    const mapped = minimal({ left: name, right: 'traducido', valueMap: { [name]: 'traducido' } }); assert.equal(compareMigration(mapped.source, mapped.target, mapped.map).verdict, 'no-differences-in-scope', name + ' como traducción propia');
  }
});

test('R2 · RELACIONES Y DATOS HOSTILES: una relación cuyo campo no es propio no cuenta, y una clave __proto__ en los datos no rompe el motor ni contamina nada', () => {
  const d = createMigrationDemo(); d.map.objects[0]!.relations[0]!.sourceField = 'constructor';
  const c = compareMigration(d.source, d.target, d.map); assert.equal(object(c, 'contact').relations.total, 0, 'sin campo propio no hay relación que comprobar'); assert.equal(object(c, 'contact').relations.broken, 0);
  const hostile = minimal(); const raw = JSON.stringify(hostile.source).replace('"key":"k"', '"key":"k","__proto__":{"polluted":"sí"}'); const source = JSON.parse(raw) as MigrationExport;
  assert.doesNotThrow(() => compareMigration(source, hostile.target, hostile.map)); assert.equal(({} as Record<string, unknown>).polluted, undefined); assert.equal((Object.prototype as unknown as Record<string, unknown>).polluted, undefined);
});

test('R2 · DÍAS DE CALENDARIO REALES: el 30 de febrero, el 29 de febrero de un año no bisiesto o el 31 de abril son «sin concluir» aunque ambos lados coincidan; los bisiestos y límites válidos siguen iguales; nunca se convierten en otra fecha', () => {
  for (const impossible of ['2026-02-30', '2025-02-29', '2026-04-31', '2100-02-29', '2026-06-31', '2026-09-31', '2026-11-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32']) {
    const same = minimal({ type: 'date', left: impossible, right: impossible }), c = compareMigration(same.source, same.target, same.map);
    assert.equal(c.verdict, 'inconclusive', impossible); assert.equal(counts(c).uncertain, 1, impossible); assert.equal(counts(c).identical, 0, impossible); assert.equal(counts(c).changed, 0, impossible); assert.equal(c.objects[0]!.findings.uncertain[0]!.changes[0]!.reason, 'unparseable', impossible);
    const oneSide = minimal({ type: 'date', left: impossible, right: '2026-03-01' }), d = compareMigration(oneSide.source, oneSide.target, oneSide.map); assert.equal(counts(d).uncertain, 1, impossible + ' en un lado'); assert.equal(counts(d).changed, 0, 'no se presenta como una diferencia confirmada');
  }
  for (const valid of ['2024-02-29', '2000-02-29', '2026-02-28', '2026-04-30', '2026-12-31', '2026-01-01', '0400-02-29']) { const same = minimal({ type: 'date', left: valid, right: valid }); assert.equal(compareMigration(same.source, same.target, same.map).verdict, 'no-differences-in-scope', valid); }
  const different = minimal({ type: 'date', left: '2026-02-28', right: '2026-03-01' }); assert.equal(counts(compareMigration(different.source, different.target, different.map)).changed, 1, 'dos días válidos distintos siguen siendo una diferencia');
  assert.equal(isCalendarDay('2024-02-29'), true); assert.equal(isCalendarDay('2023-02-29'), false); assert.equal(isCalendarDay('2026-4-1'), false); assert.equal(isCalendarDay('2026-04-01T00:00:00Z'), false);
});

test('R2 · HTML DECLARA TODOS LOS RECORTES: con más de 200 dudosos o más de 200 relaciones rotas muestra «primeros 200 de N» y el JSON conserva el recuento exacto', () => {
  const doubtful = minimal(); doubtful.source.objects[0]!.rows = Array.from({ length: 250 }, (_, i) => ({ id: 's' + i, values: { key: 'duplicate', value: 'a' } })); doubtful.source.objects[0]!.declaredTotal = 250; doubtful.target.objects[0]!.rows[0]!.values.key = 'duplicate';
  const cd = compareMigration(doubtful.source, doubtful.target, doubtful.map), rd = buildMigrationReport(cd, { generatedAt: GENERATED }), htmlD = renderMigrationHtml(rd);
  assert.equal(rd.objects[0]!.doubtful.total, 250); assert.equal(rd.objects[0]!.doubtful.items.length, REPORT_LIST_CAP); assert.equal(rd.objects[0]!.doubtful.truncated, true); assert.equal(countersAddUp(cd), true);
  const doubtSection = htmlD.slice(htmlD.indexOf('Dudosos, sin resolver'), htmlD.indexOf('</details>', htmlD.indexOf('Dudosos, sin resolver'))); assert.match(doubtSection, /Se muestran los primeros 200 de 250; el recuento es exacto\./);
  const rel = createMigrationDemo(), contacts = rel.source.objects.find(o => o.objectType === 'contact')!, persons = rel.target.objects.find(o => o.objectType === 'person')!;
  contacts.rows = Array.from({ length: 250 }, (_, i) => ({ id: 'c' + i, values: { email: 'u' + i + '@example.test', first_name: 'U', last_name: 'X', phone: '1', company_id: 'co1', created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } })); contacts.declaredTotal = 250;
  persons.rows = contacts.rows.map(row => ({ id: 'p' + row.id, values: { email: row.values.email, name_first: 'U', name_last: 'X', phone: '1', org_id: null, add_time: '2026-03-10 10:00:00', newsletter: 'true', nickname: null } })); persons.declaredTotal = 250;
  const cr = compareMigration(rel.source, rel.target, rel.map), rr = buildMigrationReport(cr, { generatedAt: GENERATED }), htmlR = renderMigrationHtml(rr), contact = rr.objects.find(o => o.sourceObject === 'contact')!;
  assert.equal(contact.relations.broken, 250); assert.equal(contact.relations.findings.total, 250); assert.equal(contact.relations.findings.items.length, REPORT_LIST_CAP); assert.equal(contact.relations.findings.truncated, true); assert.equal(rr.countersAddUp, true);
  const relSection = htmlR.slice(htmlR.indexOf('Relaciones rotas o sin concluir'), htmlR.indexOf('</details>', htmlR.indexOf('Relaciones rotas o sin concluir'))); assert.match(relSection, /Se muestran los primeros 200 de 250; el recuento es exacto\./);
  const shown = new Set(contact.relations.findings.items.map(item => item.sourceId)), hidden = contacts.rows.map(row => row.id).find(id => !shown.has(id))!;
  assert.ok(hidden, 'hay elementos recortados'); assert.equal(htmlR.includes('<code>' + hidden + '</code>'), false, 'no se muestran detalles de lo recortado');
});
