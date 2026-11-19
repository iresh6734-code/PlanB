import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import os from 'node:os';
import test from 'node:test';
import { checkMigrationFiles, checkMigrationObjects, MIGRATION_BUDGET } from '../shared/migration-budget.js';
import { createMigrationDemo } from '../shared/migration-demo.js';
import { buildMigrationReport, renderMigrationHtml, renderMigrationJson } from '../shared/migration-report.js';
import { canonicalJson, compareMigration, countersAddUp, parseInstant, sha256Hex, type MigrationExport } from '../shared/migration-verifier.js';

// Verificador de migraciones · parte Node de la validación (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-VISUAL): SHA-256 y canonización contra VECTORES PUBLICADOS, presupuesto de entrada y MEDIDAS reales de tiempo y
// tamaño. La parte de navegador (HTML a 1440/390/320 y coherencia servidor/navegador) está en tests/e2e/migration-report-visual.spec.ts. Todo es ficción; el motor sigue interno.
const GENERATED = '2026-11-08T10:00:00.000Z';

test('SHA-256 contra VECTORES PUBLICADOS (FIPS 180-4 / NIST) y contra node:crypto en los bordes de bloque, Unicode, controles y sustitutos aislados', () => {
  const published: Array<[string, string]> = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
    ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ];
  for (const [input, expected] of published) assert.equal(sha256Hex(input), expected, input.slice(0, 20) + '… (' + input.length + ')');
  const samples = ['é', 'á漢字🚀', '👩‍👩‍👧‍👦', '\u0000\u0001\u001f\u007f', '  ', '😀', '\ud800', '\udc00x', 'à', 'Å', 'ﬃ', '﻿', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(119), 'x'.repeat(120), 'ñ'.repeat(40_000)];
  for (const text of samples) assert.equal(sha256Hex(text), createHash('sha256').update(text, 'utf8').digest('hex'), JSON.stringify(text.slice(0, 12)) + ' (' + text.length + ')');
  for (let length = 0; length <= 200; length++) { const text = 'abé'.repeat(Math.ceil(length / 3)).slice(0, length); assert.equal(sha256Hex(text), createHash('sha256').update(text, 'utf8').digest('hex'), 'longitud ' + length); }
});

test('CANONIZACIÓN: orden de claves independiente de la inserción, valores JSON estándar, escapes, claves propias __proto__/constructor y estabilidad entre ejecuciones', () => {
  assert.equal(canonicalJson({ b: [3, { z: 1, a: null }], a: 'x' }), '{"a":"x","b":[3,{"a":null,"z":1}]}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson(JSON.parse('{"b":2,"a":1}')));
  assert.equal(canonicalJson([-0, 0, 1e21, 1.5, -2.25e-7, true, false, null]), '[0,0,1e+21,1.5,-2.25e-7,true,false,null]');
  assert.equal(canonicalJson({ s: 'línea\n"cita"\\\t\u0001 é漢🚀' }), JSON.stringify({ s: 'línea\n"cita"\\\t\u0001 é漢🚀' }), 'cadenas: exactamente los escapes de JSON.stringify');
  const own = JSON.parse('{"__proto__":{"v":1},"constructor":"c","toString":2,"a":0}'); assert.equal(canonicalJson(own), '{"__proto__":{"v":1},"a":0,"constructor":"c","toString":2}'); assert.equal(({} as Record<string, unknown>).v, undefined);
  assert.equal(canonicalJson({ a: undefined, b: [undefined] }), '{"b":[null]}');
  const demo = createMigrationDemo(); assert.equal(canonicalJson(demo.source), canonicalJson(JSON.parse(JSON.stringify(demo.source))), 'ida y vuelta por JSON'); assert.equal(sha256Hex(canonicalJson(demo.map)), sha256Hex(canonicalJson(JSON.parse(JSON.stringify(demo.map)))));
});

test('FECHAS Y ZONAS en la capa del verificador: horas ambiguas, inexistentes, desfases y días de calendario se resuelven igual que en las pruebas del motor (casos de ambos lados del cambio de hora)', () => {
  const ms = (iso: string) => Date.parse(iso);
  const cases: Array<[string, string | null, unknown]> = [
    ['2026-03-29 01:59:59', 'Europe/Madrid', { ok: true, ms: ms('2026-03-29T00:59:59Z') }], ['2026-03-29 02:00:00', 'Europe/Madrid', { ok: false, reason: 'local-time-nonexistent' }], ['2026-03-29 03:00:00', 'Europe/Madrid', { ok: true, ms: ms('2026-03-29T01:00:00Z') }],
    ['2026-10-25 01:59:59', 'Europe/Madrid', { ok: true, ms: ms('2026-10-24T23:59:59Z') }], ['2026-10-25 02:00:00', 'Europe/Madrid', { ok: false, reason: 'local-time-ambiguous' }], ['2026-10-25 02:59:59', 'Europe/Madrid', { ok: false, reason: 'local-time-ambiguous' }], ['2026-10-25 03:00:00', 'Europe/Madrid', { ok: true, ms: ms('2026-10-25T02:00:00Z') }],
    ['2026-03-08 02:30:00', 'America/New_York', { ok: false, reason: 'local-time-nonexistent' }], ['2026-11-01 01:30:00', 'America/New_York', { ok: false, reason: 'local-time-ambiguous' }], ['2026-11-01 02:30:00', 'America/New_York', { ok: true, ms: ms('2026-11-01T07:30:00Z') }],
    ['2026-07-01 12:00:00', 'Asia/Kolkata', { ok: true, ms: ms('2026-07-01T06:30:00Z') }], ['2026-07-01 12:00:00', 'Asia/Kathmandu', { ok: true, ms: ms('2026-07-01T06:15:00Z') }], ['2026-07-01 12:00:00', 'UTC', { ok: true, ms: ms('2026-07-01T12:00:00Z') }],
    ['2026-07-01 12:00:00+02:00', null, { ok: true, ms: ms('2026-07-01T10:00:00Z') }], ['2026-07-01 12:00:00', null, { ok: false, reason: 'timezone-missing' }], ['2026-02-29 12:00:00', 'UTC', { ok: false, reason: 'unparseable' }], ['2024-02-29 12:00:00', 'UTC', { ok: true, ms: ms('2024-02-29T12:00:00Z') }],
  ];
  for (const [value, zone, expected] of cases) assert.deepEqual(parseInstant(value, zone), expected, value + ' · ' + zone);
});

const rows = (n: number, prefix: string, tweak: (i: number) => Record<string, string | number | boolean | null>) => Array.from({ length: n }, (_, i) => ({ id: prefix + i, values: { email: 'persona' + i + '@example.test', first_name: 'Nombre' + (i % 97), last_name: 'Apellido' + (i % 89), phone: '+34 600 ' + String(100000 + i), created_at: '2026-03-10T09:00:00Z', ...tweak(i) } }));
function volume(n: number): ReturnType<typeof createMigrationDemo> {
  const d = createMigrationDemo(); const contact = d.source.objects.find(o => o.objectType === 'contact')!, person = d.target.objects.find(o => o.objectType === 'person')!;
  contact.rows = rows(n, 's', () => ({ company_id: null, marketing_opt_in: true, nickname: null })); contact.declaredTotal = n;
  person.rows = rows(Math.floor(n * 0.97), 't', i => ({ name_first: 'Nombre' + (i % 97), name_last: i % 10 === 0 ? 'Cambiado' : 'Apellido' + (i % 89), name_first_: undefined as never, org_id: null, add_time: '2026-03-10 10:00:00', newsletter: 'true', nickname: null, phone: '+34 600 ' + String(100000 + i) })).map(row => ({ id: row.id, values: Object.fromEntries(Object.entries(row.values).filter(([k, v]) => v !== undefined && !['first_name', 'last_name', 'created_at'].includes(k))) as Record<string, string | number | boolean | null> }));
  person.declaredTotal = person.rows.length; d.source.objects = [contact]; d.target.objects = [person];
  d.map.objects = [{ ...d.map.objects[0]!, relations: [] }]; return d;
}

test('PRESUPUESTO: se rechaza ANTES de procesar (tamaños sin parsear, después forma y recuentos) con motivo explícito, sin truncar; las entradas normales pasan y se devuelven ya analizadas', () => {
  const demo = createMigrationDemo(), text = { source: JSON.stringify(demo.source), target: JSON.stringify(demo.target), map: JSON.stringify(demo.map) };
  const ok = checkMigrationFiles(text); assert.equal(ok.ok, true); if (ok.ok) { assert.equal(ok.measured.sourceRows, 13 + 4 + 8); assert.ok(ok.parsed && ok.measured.totalBytes === ok.measured.sourceBytes + ok.measured.targetBytes + ok.measured.mapBytes); assert.deepEqual(ok.parsed!.map, JSON.parse(text.map)); }
  assert.equal(checkMigrationFiles({ ...text, source: new TextEncoder().encode(text.source) }).ok, true, 'también bytes UTF-8');
  const big = 'x'.repeat(MIGRATION_BUDGET.maxExportBytes + 1);
  for (const [files, code, which] of [
    [{ ...text, source: big }, 'FILE_TOO_LARGE', 'source'], [{ ...text, target: big }, 'FILE_TOO_LARGE', 'target'], [{ ...text, map: 'x'.repeat(MIGRATION_BUDGET.maxMapBytes + 1) }, 'FILE_TOO_LARGE', 'map'],
    [{ ...text, source: 'x'.repeat(MIGRATION_BUDGET.maxExportBytes - 1), target: 'x'.repeat(MIGRATION_BUDGET.maxExportBytes - 1) }, 'TOTAL_TOO_LARGE', 'set'],
    [{ ...text, source: '{no json' }, 'NOT_JSON', 'source'], [{ ...text, target: new Uint8Array([0xff, 0xfe, 0x00]) }, 'NOT_JSON', 'target'], [{ ...text, map: '[]' }, 'BAD_SHAPE', 'map'], [{ ...text, source: '{"objects":[{"rows":5}]}' }, 'BAD_SHAPE', 'source'],
    [{ ...text, source: JSON.stringify({ objects: Array.from({ length: MIGRATION_BUDGET.maxObjectsPerExport + 1 }, () => ({ rows: [] })) }) }, 'TOO_MANY_OBJECTS', 'source'],
    [{ ...text, source: JSON.stringify({ objects: [{ rows: [{ id: 'a', values: Object.fromEntries(Array.from({ length: MIGRATION_BUDGET.maxFieldsPerRow + 1 }, (_, i) => ['f' + i, 1])) }] }] }) }, 'TOO_MANY_FIELDS', 'source'],
    [{ ...text, target: JSON.stringify({ objects: [{ rows: [{ id: 'a', values: { v: 'x'.repeat(MIGRATION_BUDGET.maxStringLength + 1) } }] }] }) }, 'STRING_TOO_LONG', 'target'],
  ] as const) { const verdict = checkMigrationFiles(files as never); assert.equal(verdict.ok, false, code + ' ' + which); if (!verdict.ok) { assert.equal(verdict.code, code); assert.equal(verdict.which, which); assert.ok(verdict.message.length > 10); assert.equal((verdict as { parsed?: unknown }).parsed, undefined, 'nada analizado se devuelve al rechazar'); } }
  const rowsOver = { objects: [{ rows: Array.from({ length: MIGRATION_BUDGET.maxTotalRows / 2 + 1 }, () => ({ id: 'a', values: {} })) }] }; const over = checkMigrationObjects(rowsOver, rowsOver, {}); assert.equal(over.ok, false); if (!over.ok) assert.equal(over.code, 'TOO_MANY_ROWS');
  assert.equal(checkMigrationObjects(rowsOver, { objects: [] }, {}).ok, true, 'justo por debajo del tope del conjunto');
  const early = checkMigrationFiles({ source: big, target: '{ESTO NO SE ANALIZA}', map: '{ESTO TAMPOCO}' }); assert.equal(early.ok, false); if (!early.ok) assert.equal(early.code, 'FILE_TOO_LARGE', 'el tamaño se mira antes de intentar analizar nada');
});

test('MEDIDAS REALES de tiempo y tamaño (este equipo, Node): el motor y el informe con 1 000, 10 000 y 50 000 filas por lado, sin promesa de capacidad universal; los contadores suman y el resultado es reproducible', () => {
  const lines: string[] = [];
  for (const n of [1000, 10_000, 50_000]) {
    const d = volume(n); const bytes = JSON.stringify(d.source).length + JSON.stringify(d.target).length;
    const t0 = performance.now();
    const c = compareMigration(d.source, d.target, d.map); const t1 = performance.now(); const report = buildMigrationReport(c, { generatedAt: GENERATED }); const json = renderMigrationJson(report), html = renderMigrationHtml(report); const t2 = performance.now();
    assert.equal(countersAddUp(c), true); assert.equal(c.objects[0]!.counts.absent + c.objects[0]!.counts.identical + c.objects[0]!.counts.changed + c.objects[0]!.counts.uncertain + c.objects[0]!.counts.doubtful + c.objects[0]!.counts.missingKey + c.objects[0]!.counts.notFound, n);
    assert.equal(json, renderMigrationJson(buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED })), 'reproducible a este volumen');
    lines.push('MEDIDA ' + n + ' filas/lado · entrada ' + (bytes / 1024 / 1024).toFixed(1) + ' MiB · comparar ' + Math.round(t1 - t0) + ' ms · informe+JSON+HTML ' + Math.round(t2 - t1) + ' ms · JSON ' + (json.length / 1024).toFixed(0) + ' KiB · HTML ' + (html.length / 1024).toFixed(0) + ' KiB');
    assert.ok(t2 - t0 < 60_000, n + ' filas por lado dentro de un minuto (cota de regresión, no promesa)');
  }
  console.log(lines.join('\n') + '\nENTORNO Node ' + process.version + ' · ' + os.cpus()[0]?.model + ' · ' + os.cpus().length + ' hilos · ' + process.platform);
});

test('COHERENCIA DE BYTES entre ejecuciones del mismo proceso y tras una ida y vuelta por JSON de las entradas: mismo informe, mismas huellas', () => {
  const d = createMigrationDemo(), a = renderMigrationJson(buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED }));
  const copy = { source: JSON.parse(JSON.stringify(d.source)) as MigrationExport, target: JSON.parse(JSON.stringify(d.target)) as MigrationExport, map: JSON.parse(JSON.stringify(d.map)) };
  assert.equal(a, renderMigrationJson(buildMigrationReport(compareMigration(copy.source, copy.target, copy.map), { generatedAt: GENERATED })));
  assert.equal(renderMigrationHtml(buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED })), renderMigrationHtml(buildMigrationReport(compareMigration(copy.source, copy.target, copy.map), { generatedAt: GENERATED })));
});

test('HTML · CARACTERES DE CONTROL Y DE DIRECCIÓN: se muestran como «‹U+XXXX›» (no reordenan ni suplantan IDs); tabulador, salto de línea, texto bidireccional y emoji legítimos se conservan; el JSON conserva el dato tal cual', () => {
  const d = createMigrationDemo(), contact = d.source.objects.find(o => o.objectType === 'contact')!;
  const tricky = ['a‮b', 'c⁦d⁩', 'e‏f‎g', 'h؜i', 'j\u0007k\u0000l\u001fm\u007fn\u009fo'];
  contact.rows.push(...tricky.map((id, i) => ({ id, values: { email: 'x' + i + '@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } }))); contact.declaredTotal = contact.rows.length;
  const report = buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED }), html = renderMigrationHtml(report), json = renderMigrationJson(report);
  assert.doesNotMatch(html, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/, 'ningún carácter de control ni de dirección sin neutralizar');
  for (const code of ['202E', '2066', '2069', '200F', '200E', '061C', '0007', '0000', '001F', '007F', '009F']) assert.ok(html.includes('‹U+' + code + '›'), 'U+' + code);
  assert.ok(json.includes('\\u202e') || json.includes('‮'), 'el JSON conserva el dato original');
  const legit = createMigrationDemo(); legit.source.objects.find(o => o.objectType === 'contact')!.rows.push({ id: 'שלום עולם 👩‍👩‍👧‍👦\tcon\ttabs', values: { email: 'legit@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } });
  const legitHtml = renderMigrationHtml(buildMigrationReport(compareMigration(legit.source, legit.target, legit.map), { generatedAt: GENERATED })); assert.ok(legitHtml.includes('שלום עולם 👩‍👩‍👧‍👦\tcon\ttabs'), 'texto bidireccional, emoji y tabuladores legítimos se conservan');
});

test('R2 · REPRESENTACIÓN INYECTIVA: un ID con el carácter real U+202E y otro con «‹U+202E›» LITERAL se distinguen en el HTML; el JSON y las huellas conservan ambos datos; ningún delimitador de la notación procede del texto', () => {
  const d = createMigrationDemo(), contact = d.source.objects.find(o => o.objectType === 'contact')!;
  const real = 'id-‮-final', literal = 'id-‹U+202E›-final', nested = 'id-‹U+2039›U+202E‹U+203A›-final', other = 'id-U+202E-final';
  const row = (id: string, i: number) => ({ id, values: { email: 'inyectiva' + i + '@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } });
  contact.rows.push(...[real, literal, nested, other].map(row)); contact.declaredTotal = contact.rows.length;
  const c = compareMigration(d.source, d.target, d.map), report = buildMigrationReport(c, { generatedAt: GENERATED }), html = renderMigrationHtml(report), json = renderMigrationJson(report);
  const list = html.match(/<details><summary>Ausentes en el destino[^]*?<\/details>/)![0], rendered = Array.from(list.matchAll(/<code>([^]*?)<\/code>/g), m => m[1]!).filter(id => id.startsWith('id-'));
  assert.equal(rendered.length, 4); assert.equal(new Set(rendered).size, 4, 'cuatro IDs distintos, cuatro representaciones distintas: ' + rendered.join(' | '));
  assert.ok(rendered.includes('id-‹U+202E›-final'), 'el carácter real se muestra con la notación'); assert.ok(rendered.includes('id-‹U+2039›U+202E‹U+203A›-final'), 'el literal se muestra con sus propios delimitadores escritos: no se confunde con el carácter real');
  for (const text of rendered) { const marks = text.match(/‹|›/g) ?? []; assert.ok(marks.length % 2 === 0); for (const m of text.matchAll(/‹([^›]*)›/g)) assert.match(m[1]!, /^U\+[0-9A-F]{4}$/, 'toda notación es una referencia de carácter'); }
  assert.ok(report.objects[0]!.absent.items.includes(real) && report.objects[0]!.absent.items.includes(literal) && report.objects[0]!.absent.items.includes(nested), 'el informe conserva los datos originales');
  assert.ok(json.includes(literal) && json.includes(String.fromCharCode(0x202e)), 'el JSON conserva el carácter real y el literal');
  const demo = createMigrationDemo(); assert.notEqual(sha256Hex(canonicalJson(d.source)), sha256Hex(canonicalJson(demo.source)), 'la huella depende de los IDs originales'); const other2 = JSON.parse(JSON.stringify(d.source)); other2.objects.find((o: { objectType: string }) => o.objectType === 'contact').rows.find((r: { id: string }) => r.id === real).id = 'id-x'; assert.notEqual(sha256Hex(canonicalJson(other2)), sha256Hex(canonicalJson(d.source)), 'cambiar el carácter real cambia la huella');
});
