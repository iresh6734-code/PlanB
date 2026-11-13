import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// QA052 · SAFE049: ¿esta copia cubre la referencia aportada? Oráculo propio, generado desde las operaciones que ejecutamos
// (índices de nuestra secuencia), nunca desde prefix/canonical de producción. Fuentes bajo prueba = QA056_ROOT o QA052_ROOT.
// Un fallo imprime solo semilla / índice / categoría; ningún bundle ni valor.
// QA056: semillas, secuencias y oráculo son los de QA052 SIN CAMBIOS; solo se añade la variable QA056_ROOT. Se repite porque Store (dependencia
// compartida de este banco: importSnapshot/saveRecord/bundle/restoreBundle) cambió con INTEGRITY055; backup-coverage.ts conserva su hash.
const OVERRIDE = process.env.QA056_ROOT ?? process.env.QA052_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = (relative: string) => import(pathToFileURL(path.join(ROOT, relative)).href);
const { compareBackupCoverage } = await load('server/backup-coverage.ts') as typeof import('../server/backup-coverage.js');
const { encodePortable } = await load('server/crypto.ts') as typeof import('../server/crypto.js');
const { Store } = await load('server/store.ts') as typeof import('../server/store.js');
const { makeFixture, makeDemoSpec } = await load('shared/fixtures.ts') as typeof import('../shared/fixtures.js');

type B = any;
const PW_REF = 'qa052-referencia-fixture-01', PW_COPY = 'qa052-copia-fixture-0002';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const compare = (reference: unknown, backup: unknown, passwords: { referencePassword?: string; backupPassword?: string } = {}): any =>
  compareBackupCoverage({ reference: typeof reference === 'string' ? reference : JSON.stringify(reference), backup: typeof backup === 'string' ? backup : JSON.stringify(backup), ...passwords });
// Orden de claves invertido en todos los objetos (los arrays conservan su orden): variación admitida por contrato.
const reverseKeys = (value: any): any => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)])) : value;
const restamp = (bundle: B, iso: string) => ({ ...clone(bundle), exportedAt: iso });

function liveStore(snapshot = makeFixture()) {
  const store = new Store(':memory:');
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  store.activate();
  return store;
}
const exportOf = (store: InstanceType<typeof Store>): B => clone(store.bundle());
/** Fork independiente: un Store nuevo restaurado desde el export (misma historia, ramas distintas después). */
function fork(bundle: B) { const store = new Store(':memory:'); store.restoreBundle(clone(bundle)); return store; }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Cadena válida de operaciones: exports[k] es la copia tras k operaciones y cada operación añade exactamente un cambio al historial. */
function sequence(seed: number, length: number) {
  const next = rng(seed), store = liveStore(), exports: B[] = [exportOf(store)], log: string[] = [];
  const tasks = store.records('tasks').map(r => r.id);
  for (let k = 1; k <= length; k++) {
    const r = next();
    if (r < 0.45) { const id = 'contact-' + (1 + Math.floor(next() * 4)); store.saveRecord('contacts', { phone: '6' + seed + '-' + k }, id); log.push('update:' + id); }
    else if (r < 0.75) { store.saveRecord('contacts', { firstname: 'G' + seed + 'x' + k, email: 'g' + seed + 'x' + k + '@example.invalid' } as any); log.push('create'); }
    else { const id = tasks[Math.floor(next() * tasks.length)]; store.saveRecord('tasks', { subject: 'S' + seed + 'x' + k }, id); log.push('update:' + id); }
    exports.push(exportOf(store));
  }
  store.close();
  return { exports, log };
}
const rng = mulberry32;
function check<T>(category: string, seed: number, index: number, run: () => T): T {
  try { return run(); } catch (error) { throw new Error('semilla=' + seed + ' índice=' + index + ' categoría=' + category + ' :: ' + (error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'excepción')); }
}
const SEEDS = [1, 2, 3, 5, 8, 13], LENGTH = 6;

test('1-5,9 · propiedades generativas: reflexividad, orden de claves, prefijo contado desde nuestra secuencia, inversa y fechas', () => {
  for (const seed of SEEDS) {
    const { exports } = sequence(seed, LENGTH);
    assert.equal(exports.length, LENGTH + 1);
    for (let j = 0; j <= LENGTH; j++) {
      const ref = exports[j];
      check('reflexividad', seed, j, () => { const r = compare(ref, ref); assert.equal(r.status, 'matches-reference'); assert.equal(r.missingLocalChanges, 0); assert.equal(r.byteIdentical, true); });
      check('claves-y-fecha', seed, j, () => { const r = compare(ref, reverseKeys(restamp(ref, '2099-01-01T00:00:00.000Z'))); assert.equal(r.status, 'matches-reference'); assert.equal(r.byteIdentical, false); });
      if (j === LENGTH) check('dos-cifrados', seed, j, () => { const r = compare(encodePortable(ref, PW_REF), encodePortable(ref, PW_COPY), { referencePassword: PW_REF, backupPassword: PW_COPY }); assert.equal(r.status, 'matches-reference'); assert.equal(r.byteIdentical, false); });
      for (let i = 0; i < j; i++) {
        const copy = exports[i], expected = j - i;
        check('prefijo', seed, i * 10 + j, () => { const r = compare(ref, copy); assert.equal(r.status, 'missing-local-changes'); assert.equal(r.missingLocalChanges, expected); assert.equal(r.differences.snapshotChanged, false); });
        check('prefijo-fechas-invertidas', seed, i * 10 + j, () => {
          // El archivo "más nuevo" por fecha es el que tiene menos historia: la fecha no ordena nada.
          const r = compare(restamp(ref, '2000-01-01T00:00:00.000Z'), restamp(copy, '2099-01-01T00:00:00.000Z')); assert.equal(r.status, 'missing-local-changes'); assert.equal(r.missingLocalChanges, expected);
        });
        if (i === 0 && j === LENGTH) check('prefijo-cifrado', seed, i * 10 + j, () => { const r = compare(encodePortable(ref, PW_REF), encodePortable(copy, PW_COPY), { referencePassword: PW_REF, backupPassword: PW_COPY }); assert.equal(r.status, 'missing-local-changes'); assert.equal(r.missingLocalChanges, expected); });
        check('inversa', seed, i * 10 + j, () => { const r = compare(copy, ref); assert.equal(r.status, 'different-revision'); assert.equal(r.missingLocalChanges, null); });
      }
    }
  }
});

test('4 · reversión A→B→A: los valores finales coinciden pero la historia adicional sigue sin estar cubierta', () => {
  const store = liveStore(), original = store.record('contacts', 'contact-3')!.values.phone as string, e0 = exportOf(store);
  store.saveRecord('contacts', { phone: 'valor-intermedio' }, 'contact-3'); const e1 = exportOf(store);
  store.saveRecord('contacts', { phone: original }, 'contact-3'); const e2 = exportOf(store); store.close();
  assert.deepEqual(e2.records, e0.records, 'precondición: los registros activos vuelven a ser idénticos');
  const r = compare(e2, e0);
  assert.equal(r.status, 'missing-local-changes'); assert.equal(r.missingLocalChanges, 2, 'dos operaciones, aunque 0 registros distintos');
  assert.deepEqual([r.differences.missingRecordsInBackup, r.differences.extraRecordsInBackup, r.differences.changedRecords], [0, 0, 0]);
  assert.equal(compare(e2, e1).missingLocalChanges, 1); assert.notEqual(compare(e2, e0).status, 'matches-reference');
});

test('5 · bifurcación: dos ramas con igual número de operaciones son revisiones distintas y no fabrican un prefijo', () => {
  const { exports } = sequence(77, 3), base = exports[3];
  const a = fork(base), b = fork(base);
  a.saveRecord('contacts', { phone: 'rama-A' }, 'contact-5'); const A1 = exportOf(a);
  a.saveRecord('contacts', { phone: 'rama-A2' }, 'contact-5'); const A2 = exportOf(a);
  b.saveRecord('contacts', { phone: 'rama-B' }, 'contact-5'); const B1 = exportOf(b);
  a.close(); b.close();
  assert.equal(compare(A1, base).status, 'missing-local-changes', 'control: la base sí es prefijo de la rama A');
  assert.equal(compare(A1, base).missingLocalChanges, 1);
  for (const [ref, copy, label] of [[A1, B1, 'mismo número'], [A2, B1, 'rama más larga'], [B1, A2, 'rama más corta'], [B1, A1, 'orden contrario']] as [B, B, string][]) {
    const r = compare(ref, copy); assert.equal(r.status, 'different-revision', label); assert.equal(r.missingLocalChanges, null, label);
  }
});

test('6 · mismos registros con contexto distinto no es la misma revisión, ni siquiera cuando la copia es un prefijo', () => {
  const store = liveStore(); const created = store.saveRecord('contacts', { firstname: 'Ctx', email: 'ctx@example.invalid' } as any);
  const e1 = exportOf(store); store.saveRecord('contacts', { phone: 'c-1' }, 'contact-1'); const e2 = exportOf(store); store.close();
  const variants: [string, (b: B) => void, string][] = [
    ['sesión', b => { b.sessionId = 'otra-sesion'; }, 'sessionChanged'],
    ['generación', b => { b.generation.prompt = 'otro encargo'; }, 'generationChanged'],
    ['nombre de captura', b => { b.snapshot.name += ' (otra)'; }, 'snapshotChanged'],
    ['configuración', b => { b.spec.title += ' (otra)'; }, 'specChanged'],
    ['watermark', b => { b.returnState.watermark = b.changes[0].id; }, 'returnStateChanged'],
    ['mapping', b => { b.returnState.mapping = { ['contacts:' + created.id]: '555' }; }, 'returnStateChanged'],
  ];
  for (const [label, mutate, flag] of variants) {
    const bumped = clone(e2); mutate(bumped);
    assert.equal(compare(bumped, bumped).status, 'matches-reference', label + ': precondición, la variante es una copia válida de sí misma');
    const same = compare(e2, bumped);
    assert.equal(same.status, 'different-revision', label); assert.equal(same.missingLocalChanges, null, label); assert.equal(same.differences[flag], true, label + ' marca ' + flag);
    assert.deepEqual([same.differences.missingRecordsInBackup, same.differences.extraRecordsInBackup, same.differences.changedRecords], [0, 0, 0], label + ': los registros no cambian');
    const shorter = clone(e1); mutate(shorter);
    const prefix = compare(e2, shorter); assert.equal(prefix.status, 'different-revision', label + ': un prefijo de otro contexto no cuenta'); assert.equal(prefix.missingLocalChanges, null, label);
  }
  assert.equal(compare(e2, e1).missingLocalChanges, 1, 'control: sin cambio de contexto, el prefijo sí cuenta');
});

test('7 · mismo identificador de captura con contenido alterado no concede cobertura', () => {
  const store = liveStore(); const base = exportOf(store); store.close();
  const altered = clone(base);
  for (const list of [altered.snapshot.records, altered.records]) list.find((r: any) => r.id === 'contact-20').values.phone = 'alterado';
  assert.equal(altered.snapshot.id, base.snapshot.id); assert.equal(altered.snapshot.capturedAt, base.snapshot.capturedAt);
  assert.equal(compare(altered, altered).status, 'matches-reference', 'precondición: la alterada es restaurable');
  const r = compare(base, altered);
  assert.equal(r.sameCapture, true); assert.equal(r.status, 'different-revision'); assert.equal(r.differences.snapshotChanged, true); assert.equal(r.differences.changedRecords, 1);
  assert.equal(r.missingLocalChanges, null);
});

test('8 · límites de portal, clase, origen, entorno y captura impiden afirmar cobertura y no inventan una identidad', () => {
  const store = liveStore(); const before = exportOf(store); store.saveRecord('contacts', { phone: 'lim' }, 'contact-1'); const base = exportOf(store); store.close();
  const variants: [string, (b: B) => B][] = [
    ['otro portal', b => { b.snapshot.source.accountId = 'otro-portal'; b.returnState.accountId = 'otro-portal'; return b; }],
    ['otro origen', b => { b.snapshot.source.kind = 'hubspot'; return b; }],
    ['entorno declarado frente a ausente', b => { b.snapshot.source.environment = 'test'; return b; }],
    ['tipo de cuenta declarado frente a ausente', b => { b.snapshot.source.accountType = 'STANDARD'; return b; }],
    ['otra captura (fecha)', b => { b.snapshot.capturedAt = '2026-01-02T03:04:05.000Z'; return b; }],
    ['otra captura (id)', b => { b.snapshot.id += '-otra'; return b; }],
  ];
  for (const [label, mutate] of variants) {
    const copy = mutate(clone(base)), copyBefore = mutate(clone(before));
    assert.equal(compare(copy, copy).status, 'matches-reference', label + ': precondición, la copia alterada es válida');
    for (const [ref, backup] of [[base, copy], [copy, base]] as [B, B][]) {
      const r = compare(ref, backup); assert.equal(r.status, 'incompatible', label);
      assert.equal(r.missingLocalChanges, null, label); assert.equal(r.differences, null, label + ': no fabrica recuentos entre contextos distintos');
    }
    assert.equal(compare(copyBefore, copyBefore).status, 'matches-reference', label + ': precondición del prefijo');
    const prefixLike = compare(base, copyBefore); assert.equal(prefixLike.status, 'incompatible', label + ' + prefijo'); assert.equal(prefixLike.missingLocalChanges, null);
  }
  // Clase de datos: producción (v3 + cifrado) frente a ensayo.
  const prod = clone(base); prod.format = 'planb-continuity-v3'; prod.snapshot.version = 3; prod.spec.version = 3;
  Object.assign(prod.snapshot.source, { kind: 'hubspot', isTestData: false, environment: 'production', accountType: 'STANDARD' });
  const mixed = compare(encodePortable(prod, PW_REF), base, { referencePassword: PW_REF }); assert.equal(mixed.status, 'incompatible'); assert.equal(mixed.sameSource, false); assert.equal(mixed.missingLocalChanges, null);
  assert.equal(compare(prod, prod).status, 'invalid', 'producción en claro no es una copia válida y no se compara');
  // Dos copias sin entorno ni tipo declarados comparten identidad: ausente = ausente, no un valor inventado.
  assert.equal(compare(base, clone(base)).sameSource, true);
});

test('10 · recuentos completos con 10.000 registros: la diferencia del último registro se detecta', () => {
  const snapshot = makeFixture(), baseCount = snapshot.records.length, extra = 10_000 - baseCount;
  for (let n = 0; n < extra; n++) snapshot.records.push({ entity: 'contacts', id: 'bulk-' + n, values: { firstname: 'B' + n, email: 'b' + n + '@example.invalid' } } as any);
  (snapshot.manifest.expectedCounts as any).contacts += extra;
  const store = liveStore(snapshot), big = exportOf(store); store.close();
  assert.equal(big.records.length, 10_000); assert.equal(big.snapshot.records.length, 10_000);
  const last = big.records.length - 1, lastId = big.records[last].id;
  const touch = (b: B, fn: (list: any[], i: number) => void) => { for (const list of [b.snapshot.records, b.records]) fn(list, list.findIndex((r: any) => r.id === lastId)); return b; };
  const changed = touch(clone(big), (list, i) => { list[i].values.phone = 'ultimo-distinto'; });
  const removed = touch(clone(big), (list, i) => { list.splice(i, 1); }); removed.snapshot.manifest.expectedCounts.contacts -= 1;
  assert.equal(compare(big, big).status, 'matches-reference', 'precondición: el paquete grande es válido');
  assert.equal(compare(changed, changed).status, 'matches-reference'); assert.equal(compare(removed, removed).status, 'matches-reference');
  const a = compare(big, changed); assert.equal(a.status, 'different-revision'); assert.deepEqual([a.differences.changedRecords, a.differences.missingRecordsInBackup, a.differences.extraRecordsInBackup], [1, 0, 0]);
  const b = compare(big, removed); assert.equal(b.status, 'different-revision'); assert.deepEqual([b.differences.missingRecordsInBackup, b.differences.extraRecordsInBackup], [1, 0]);
  const c = compare(removed, big); assert.deepEqual([c.differences.missingRecordsInBackup, c.differences.extraRecordsInBackup], [0, 1]);
  assert.equal(a.reference.records, 10_000);
});

test('11 · el orden de los arrays sí es significativo: reordenar registros no se declara igual (límite documentado)', () => {
  const store = liveStore(); const base = exportOf(store); store.close();
  const swapped = clone(base); [swapped.records[0], swapped.records[1]] = [swapped.records[1], swapped.records[0]];
  assert.equal(compare(swapped, swapped).status, 'matches-reference', 'precondición: el reordenado se restaura');
  const r = compare(base, swapped); assert.notEqual(r.status, 'matches-reference');
  assert.deepEqual([r.differences.missingRecordsInBackup, r.differences.extraRecordsInBackup, r.differences.changedRecords], [0, 0, 0], 'el contenido es el mismo; solo cambia el orden');
});

// ---------------------------------------------------------------- CLI de cobertura
const REAL = fs.realpathSync(ROOT), GUARD = path.join(REAL, 'scripts', 'block-external.cjs'), CLI = path.join(REAL, 'scripts', 'check-backup-coverage.ts');
const SCRATCH = fs.mkdtempSync(path.join(REAL, 'tests', '.tmp', 'qa052-cli-coverage-'));
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }));
function cli(args: string[], input?: string) {
  const env: Record<string, string> = {}; for (const key of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]!;
  const run = spawnSync(process.execPath, ['--require', GUARD, '--import', 'tsx', CLI, ...args], { cwd: REAL, env, input: input ?? '', encoding: 'utf8', timeout: 90_000, windowsHide: true });
  const err = (run.stderr ?? '').split(/\r?\n/).filter(line => line && !/ExperimentalWarning|trace-warnings/.test(line)).join('\n');
  return { code: run.status, out: run.stdout ?? '', err, all: (run.stdout ?? '') + err };
}
const put = (name: string, content: string | Buffer) => { const file = path.join(SCRATCH, name); fs.writeFileSync(file, content); return file; };
const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const listing = () => fs.readdirSync(SCRATCH).sort();

test('12 · CLI: ayuda por defecto, uso incorrecto = 2 sin eco, contraseñas solo por stdin JSON acotado', () => {
  const help = cli([]); assert.equal(help.code, 0); assert.match(help.out, /Sin argumentos solo muestra ayuda/); assert.equal(help.err, '');
  assert.equal(cli(['--help']).code, 0);
  const canary = 'QA052-COV-ARGV-CANARY-4408', a = put('a.json', '{}');
  for (const args of [['--reference', a], ['--backup', a], ['--reference', a, '--backup', a, '--reference', a], ['--reference', a, '--backup', a, '--password', canary], ['--reference', a, '--backup', a, '--unknown' + canary], ['--reference', '--backup', a], ['--reference', a, '--backup']]) {
    const run = cli(args); assert.equal(run.code, 2, args.join(' ')); assert.equal(run.out, ''); assert.ok(!run.all.includes(canary), 'sin eco de argumentos');
  }
  const base = ['--reference', a, '--backup', a, '--passwords-stdin'];
  for (const [label, stdin] of [['vacío', ''], ['no JSON', 'x'], ['array', '[]'], ['clave extra', '{"otra":"x"}'], ['no cadena', '{"reference":1}'], ['contraseña de 201', JSON.stringify({ reference: 'x'.repeat(201) })], ['más de 4096 bytes', JSON.stringify({ reference: 'x'.repeat(5000) })]] as const) {
    const run = cli(base, stdin); assert.equal(run.code, 2, label); assert.equal(run.out, '', label);
  }
});

test('13 · CLI: códigos 0/1, contraseñas distintas para referencia y copia, y sin filtración de canarios ni de contraseñas', () => {
  const store = liveStore(), PRIV = ['QA052-COV-NOMBRE-5512', 'qa052.cov.5512@example.invalid', 'QA052-COV-LIBRE-5512'];
  store.saveRecord('contacts', { firstname: PRIV[0], email: PRIV[1], phone: PRIV[2] } as any); const e1 = exportOf(store);
  store.saveRecord('contacts', { phone: 'QA052-COV-OTRO-5512' }, 'contact-2'); const e2 = exportOf(store); store.close();
  e1.snapshot.source.description = e2.snapshot.source.description = 'QA052-COV-ORIGEN-5512'; // mismo contexto en ambas, para que e1 siga siendo prefijo de e2
  const ref = put('ref.json', encodePortable(e2, PW_REF)), copy = put('copia.json', encodePortable(e1, PW_COPY)), plainRef = put('ref-claro.json', JSON.stringify(e2)), same = put('copia-igual.json', encodePortable(e2, PW_COPY));
  const before = Object.fromEntries(listing().map(n => [n, digest(path.join(SCRATCH, n))])), names = listing();
  const stdin = JSON.stringify({ reference: PW_REF, backup: PW_COPY });
  const missing = cli(['--reference', ref, '--backup', copy, '--passwords-stdin'], stdin);
  assert.equal(missing.code, 1, missing.all); const missingJson = JSON.parse(missing.out); assert.equal(missingJson.status, 'missing-local-changes'); assert.equal(missingJson.missingLocalChanges, 1);
  const swapped = cli(['--reference', ref, '--backup', copy, '--passwords-stdin'], JSON.stringify({ reference: PW_COPY, backup: PW_REF }));
  assert.equal(swapped.code, 1); assert.equal(JSON.parse(swapped.out).status, 'invalid', 'las contraseñas no se confunden entre archivos');
  assert.equal(JSON.parse(cli(['--reference', ref, '--backup', copy]).out).status, 'invalid', 'sin contraseñas: inválido, no error de uso');
  const equal = cli(['--reference', ref, '--backup', same, '--passwords-stdin'], stdin);
  assert.equal(equal.code, 0, equal.all); const eq = JSON.parse(equal.out); assert.equal(eq.status, 'matches-reference'); assert.equal(eq.byteIdentical, false, 'dos cifrados del mismo contenido: revisión igual, bytes distintos'); assert.equal(eq.sameInputFile, false);
  const one = cli(['--reference', plainRef, '--backup', plainRef]); assert.equal(one.code, 0); assert.equal(JSON.parse(one.out).sameInputFile, true, 'misma ruta dos veces = misma entrada, no dos copias');
  const clone2 = put('ref-claro-copia.json', fs.readFileSync(plainRef)); const bytes = JSON.parse(cli(['--reference', plainRef, '--backup', clone2]).out);
  assert.equal(bytes.byteIdentical, true); assert.equal(bytes.sameInputFile, false, 'mismos bytes en otra ruta: identidad de bytes, no de entrada ni custodia externa');
  const outputs = [missing, swapped, equal, one].map(r => r.all).join('\n');
  for (const secret of [...PRIV, 'QA052-COV-OTRO-5512', 'QA052-COV-ORIGEN-5512', PW_REF, PW_COPY, 'enc1:']) assert.ok(!outputs.includes(secret), 'sin filtración de ' + secret.slice(0, 10) + '…');
  assert.deepEqual(listing().filter(n => !before[n] && !['ref-claro-copia.json'].includes(n)), [], 'no se crean ficheros'); assert.ok(names.every(n => before[n]));
  for (const [n, hash] of Object.entries(before)) assert.equal(digest(path.join(SCRATCH, n)), hash, n + ' intacto');
});

test('14 · CLI: archivos inexistentes, directorios, sobre el límite y enlaces', () => {
  const ok = put('ok.json', JSON.stringify(exportOf(liveStore())));
  assert.equal(cli(['--reference', ok, '--backup', path.join(SCRATCH, 'no-existe.json')]).code, 2);
  assert.equal(cli(['--reference', ok, '--backup', SCRATCH]).code, 2);
  const big = path.join(SCRATCH, 'grande.bin'), fd = fs.openSync(big, 'w'); fs.ftruncateSync(fd, 32 * 1024 * 1024 + 1); fs.closeSync(fd);
  assert.equal(cli(['--reference', ok, '--backup', big]).code, 2); fs.rmSync(big);
  const link = path.join(SCRATCH, 'enlace.json');
  let linked = true; try { fs.symlinkSync(ok, link); } catch { linked = false; }
  if (!linked) { process.stderr.write('QA052: symlink no disponible en este equipo (límite de entorno, no defecto): rechazo de enlaces SIN VERIFICAR\n'); return; }
  const viaLink = cli(['--reference', ok, '--backup', link]); assert.equal(viaLink.code, 2, 'los archivos enlazados se rechazan'); assert.equal(viaLink.out, '');
});

// ================================================================ QA056 · interacción con INTEGRITY055 (Store/Recovery cambiaron)
// compareBackupCoverage no lee Recovery, pero sí compara returnState y la revisión completa. La normalización de «sending» al restaurar cambia el plan
// de la copia restaurada: eso debe verse como diferencia (nunca como cobertura equivalente) y la normalización debe ser un punto fijo (estable al repetir).
const { Recovery, simulatedRemote } = await load('server/recovery.ts') as typeof import('../server/recovery.js');
test('SAFE-F1 (QA056) · una copia restaurada desde un plan con envío en vuelo NO se declara equivalente a la original; restaurar de nuevo es estable', async () => {
  const store = liveStore();
  let original: B;
  try {
    store.saveRecord('contacts', { phone: '611 000 566' }, 'contact-1'); store.saveRecord('contacts', { firstname: 'Alta56', email: 'alta56@example.invalid' } as any);
    const engine = new Recovery(store), plan = await engine.preview({ ...simulatedRemote(store), source: 'hubspot' as const }); engine.approve(plan.id);
    original = exportOf(store);
  } finally { store.close(); }
  original.returnState.plan.status = 'approved'; original.returnState.plan.operations[0].status = 'sending';
  assert.equal(compare(original, original).status, 'matches-reference', 'control: consigo misma es equivalente');
  const first = fork(original), restoredOnce = exportOf(first); first.close();
  assert.ok(restoredOnce.returnState.plan.operations.some((op: B) => op.status === 'uncertain') && restoredOnce.returnState.plan.operations.every((op: B) => op.status !== 'sending'), 'precondición: la restauración normalizó el envío en vuelo');
  const forward = compare(original, restoredOnce), backward = compare(restoredOnce, original);
  for (const [label, r] of [['original→restaurada', forward], ['restaurada→original', backward]] as const) {
    assert.notEqual(r.status, 'matches-reference', label + ': la normalización del plan no puede pasar por cobertura equivalente (status=' + r.status + ')');
    assert.equal(r.differences.returnStateChanged, true, label + ': la diferencia del plan debe señalarse');
    assert.equal(r.differences.changedRecords, 0); assert.equal(r.differences.snapshotChanged, false);
  }
  // Punto fijo: restaurar la copia ya normalizada y volver a exportar no cambia nada (salvo la fecha de exportación).
  const second = fork(restoredOnce), restoredTwice = exportOf(second); second.close();
  const stable = compare(restoredOnce, restoredTwice); assert.equal(stable.status, 'matches-reference', 'la normalización es idempotente'); assert.equal(stable.missingLocalChanges, 0);
});
