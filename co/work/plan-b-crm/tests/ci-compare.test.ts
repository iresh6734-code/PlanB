// CLAUDE-CI-LOCAL · La CI local lee la salida real de node:test y separa fallos nuevos, conocidos, resueltos y sin resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { compareFailures, eventFile, parseResults, parseTestOutput, validateKnown } from '../tools/ci/compare.mjs';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { CHILD_ENV_KEEP, UsageError, childEnvironment, matchesPattern, parseArgs, unitOutputBroken, unsupportedPattern } from '../tools/ci/run.mjs';

type Failure = { file: string | null; name: string };
const TMP = path.resolve('tests/.tmp');
const RUNNER = path.resolve('tools/ci/run.mjs');

function scratch(t: test.TestContext, prefix: string): string {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Entorno sin NODE_TEST_CONTEXT: dentro de otra ejecución de node:test, el hijo informaría al padre en lugar de imprimir su resumen. */
const cleanEnv = (extra: Record<string, string> = {}) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')), ...extra });

const REPORTER = pathToFileURL(path.resolve('tools/ci/compare.mjs')).href;
/** Ejecuta node:test de verdad sobre un archivo sintético con los dos reporteros de la CI; devuelve la salida y las pasadas. */
function realRun(t: test.TestContext, body: string): { output: string; passed: Set<string>; file: string } {
  const dir = scratch(t, 'ci-compare-'), file = path.join(dir, 'sample.test.mjs'), results = path.join(dir, 'results.jsonl');
  fs.writeFileSync(file, "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" + body);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=' + REPORTER, '--test-reporter-destination=' + results, file], { encoding: 'utf8', timeout: 60_000, env: cleanEnv() });
  const { passed } = parseResults(fs.existsSync(results) ? fs.readFileSync(results, 'utf8') : '', process.cwd()) as { passed: Set<string> };
  return { output: run.stdout + run.stderr, passed, file: path.relative(process.cwd(), file).replace(/\\/g, '/') };
}
const realOutput = (t: test.TestContext, body: string) => realRun(t, body).output;

const known = (entries: object[]) => validateKnown({ failures: entries });

test('lee el resumen, los fallos y las pasadas ejecutadas de una salida real de node:test', t => {
  const { output, passed, file } = realRun(t, [
    "test('pasa', () => {});",
    "test('falla · con «comillas» (y paréntesis)', () => { assert.equal(1, 2); });",
    "test('padre', async t => { await t.test('hija', () => { throw new Error('x'); }); await t.test('otra', () => {}); });",
    "test('pendiente', { todo: true }, () => {});",
    "test('omitida', { skip: true }, () => {});",
  ].join('\n'));
  const { summary, failures } = parseTestOutput(output) as { summary: Record<string, number>; failures: Failure[] };
  assert.equal(summary.fail, 3, 'el resumen de node:test cuenta la prueba fallida, la hija y también su padre');
  assert.equal(summary.todo, 1);
  assert.equal(summary.skipped, 1);
  assert.deepEqual(failures.map(f => f.name).sort(), ['falla · con «comillas» (y paréntesis)', 'hija'], 'solo pruebas hoja, nombre exacto sin «(…ms)»');
  assert.ok(failures.every(f => f.file && f.file.endsWith('/sample.test.mjs') && !f.file.includes('\\')), 'archivo con barras normales');
  assert.deepEqual([...passed].sort(), [file + '::otra', file + '::pasa'], 'pasadas con su archivo; las omitidas y pendientes no cuentan');
});

test('una salida sin sección de fallos no inventa fallos', () => {
  const { summary, failures } = parseTestOutput('ℹ tests 3\nℹ pass 3\nℹ fail 0\n') as { summary: Record<string, number>; failures: Failure[] };
  assert.deepEqual(failures, []);
  assert.equal(summary.pass, 3);
});

test('la sección de fallos de Windows (barras invertidas) se normaliza y no repite', () => {
  const text = ['ℹ fail 2', '✖ failing tests:', '', 'test at tests\\a.test.ts:3:1', '✖ uno (1.5ms)', '', 'test at tests\\a.test.ts:9:1', '✖ uno (2ms)', 'test at tests\\b.test.ts:1:1', '✖ dos (0.1ms)'].join('\r\n');
  const { failures } = parseTestOutput(text) as { failures: Failure[] };
  assert.deepEqual(failures, [{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/b.test.ts', name: 'dos' }]);
});

test('compara nuevos, conocidos, resueltos, inestables y sin resultado, cada caso aislado', () => {
  const list = known([
    { file: 'tests/a.test.ts', name: 'uno', cause: 'c', owner: 'o' },
    { file: 'tests\\c.test.ts', name: 'resuelto', cause: 'c', owner: 'o' },
    { file: 'tests/d.test.ts', name: 'a veces', cause: 'c', owner: 'o', flaky: true },
  ]);
  const all = new Set(['tests/c.test.ts::resuelto', 'tests/d.test.ts::a veces']);
  const result = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/b.test.ts', name: 'uno' }, { file: null, name: 'sin archivo' }], list, all);
  assert.deepEqual(result.unexpected, [{ file: 'tests/b.test.ts', name: 'uno' }, { file: null, name: 'sin archivo' }], 'mismo nombre en otro archivo es nuevo');
  assert.deepEqual(result.expected.map((f: Failure) => f.file + ' ' + f.name), ['tests/a.test.ts uno']);
  assert.deepEqual(result.resolved.map((f: Failure) => f.name), ['resuelto']);
  assert.deepEqual(result.flakyPassed.map((f: Failure) => f.name), ['a veces']);
  assert.equal(result.ok, false);

  const stable = [{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/c.test.ts', name: 'resuelto' }];
  assert.equal(compareFailures(stable, list, new Set(['tests/d.test.ts::a veces'])).ok, true, 'todo lo estable sigue fallando y el inestable pasó: correcta');
  const fixed = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }], list, all);
  assert.equal(fixed.ok, false, 'un conocido estable que se ejecutó y pasa hace fallar hasta retirarlo');
  const fresh = compareFailures([...stable, { file: 'tests/e.test.ts', name: 'nuevo' }], list, new Set(['tests/d.test.ts::a veces']));
  assert.deepEqual(fresh.resolved, []);
  assert.equal(fresh.ok, false, 'un fallo nuevo basta para fallar');
  const silent = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }], list, new Set());
  assert.deepEqual(silent.noResult.map((f: Failure) => f.name).sort(), ['a veces', 'resuelto'], 'sin pasar ni fallar no acredita nada');
  assert.deepEqual(silent.resolved, []);
  assert.equal(silent.ok, false);
  assert.throws(() => compareFailures([], list), /conjunto de pruebas que pasaron/);
  // CODEX-CI-R2-390: una homónima que pasa en OTRO archivo no acredita la conocida.
  const twin = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/c.test.ts', name: 'resuelto' }], list, new Set(['tests/otro.test.ts::a veces']));
  assert.deepEqual(twin.noResult.map((f: Failure) => f.file + ' ' + f.name), ['tests/d.test.ts a veces']);
  assert.deepEqual(twin.flakyPassed, []);
  assert.equal(twin.ok, false);
});

test('las rutas del reportero (ruta o URL file:) se reducen a la ruta relativa del repositorio', () => {
  assert.equal(eventFile('D:\\repo\\tests\\a.test.ts', 'D:\\repo'), 'tests/a.test.ts');
  assert.equal(eventFile('file:///D:/repo/tests/a%20b.test.ts', 'D:\\repo'), 'tests/a b.test.ts');
  assert.equal(eventFile('d:/REPO/tests/a.test.ts', 'D:\\repo'), 'tests/a.test.ts', 'sin distinguir mayúsculas en la raíz');
  assert.equal(eventFile('/otro/sitio/x.test.ts', 'D:\\repo'), '/otro/sitio/x.test.ts', 'fuera del repositorio se conserva');
});

test('un fallo sin su línea «test at» no hereda el archivo del anterior', () => {
  const text = ['✖ failing tests:', 'test at tests\\a.test.ts:3:1', '✖ uno (1ms)', '✖ huérfano (1ms)'].join('\n');
  const { failures } = parseTestOutput(text) as { failures: Failure[] };
  assert.deepEqual(failures, [{ file: 'tests/a.test.ts', name: 'uno' }, { file: null, name: 'huérfano' }]);
  const list = known([{ file: 'tests/a.test.ts', name: 'huérfano', cause: 'c', owner: 'o', flaky: true }]);
  assert.equal(compareFailures(failures, list, new Set()).unexpected.some((f: Failure) => f.name === 'huérfano'), true, 'sin archivo nunca coincide con un conocido');
});

test('salida real: un archivo que no llega a cargar cuenta como fallo ligado a su archivo', t => {
  const parsed = parseTestOutput(realOutput(t, "throw new Error('no carga');\n")) as { summary: Record<string, number>; failures: Failure[] };
  assert.ok((parsed.summary.fail ?? 0) >= 1, 'node:test cuenta el archivo que no carga');
  assert.equal(parsed.failures.length, 1);
  assert.ok(parsed.failures[0].file?.endsWith('/sample.test.mjs'));
  assert.equal(unitOutputBroken(parsed.summary, parsed.failures.length, 1), '', 'se compara como un fallo más, no se oculta');
});

test('la lista de conocidos exige archivo, nombre, causa y responsable, sin repetidos', () => {
  assert.throws(() => validateKnown({}), /lista «failures»/);
  assert.throws(() => known([{ file: 'tests/a.test.ts', name: 'uno', owner: 'o' }]), /falta «cause»/);
  assert.throws(() => known([{ file: 'tests/a.test.ts', name: 'uno', cause: ' ', owner: 'o' }]), /falta «cause»/);
  assert.throws(() => known([{ file: 'tests/a.test.ts', name: 'uno', cause: 'c', owner: 'o' }, { file: 'tests\\a.test.ts', name: 'uno', cause: 'c', owner: 'o' }]), /repetido/);
});

test('el archivo real de fallos conocidos es válido y cada causa está explicada', () => {
  const list = validateKnown(JSON.parse(fs.readFileSync('tools/ci/known-failures.json', 'utf8'))) as { file: string; cause: string }[];
  for (const entry of list) {
    assert.ok(fs.existsSync(entry.file), 'el archivo de un fallo conocido existe: ' + entry.file);
    assert.ok(entry.cause.length >= 20, 'causa con contenido: ' + entry.file);
  }
});

test('--tests limita los conocidos al mismo patrón y rechaza lo que no sabría reproducir', () => {
  assert.equal(matchesPattern('tests/store-records-cache.test.ts', 'tests/store-*.test.ts'), true);
  assert.equal(matchesPattern('tests/zendesk-source.test.ts', 'tests/store-*.test.ts'), false);
  assert.equal(matchesPattern('tests/e2e/x.test.ts', 'tests/*.test.ts'), false, '* no cruza carpetas');
  for (const bad of ['tests/**/*.test.ts', 'tests/a?.test.ts', 'tests/{a,b}.test.ts', './tests/a.test.ts', 'tests\\a.test.ts', 'tests/[ab].test.ts']) assert.equal(unsupportedPattern(bad), true, bad);
  for (const good of ['tests/*.test.ts', 'tests/store-*.test.ts', 'tests/a.test.ts']) assert.equal(unsupportedPattern(good), false, good);
});

test('nunca da por buena una batería cuya salida no cuadra', () => {
  assert.equal(unitOutputBroken({}, 0, 0), 'sin resumen de node:test');
  assert.equal(unitOutputBroken({ tests: 0, fail: 0 }, 0, 0), 'no se ejecutó ninguna prueba');
  assert.match(unitOutputBroken({ tests: 3, pass: 0, fail: 0, skipped: 3 }, 0, 0), /solo omitidas o pendientes/);
  assert.match(unitOutputBroken({ tests: 2, pass: 0, fail: 0, todo: 2 }, 0, 0), /solo omitidas o pendientes/);
  assert.equal(unitOutputBroken({ tests: 10, pass: 8, fail: 2 }, 0, 1), 'informa de fallos pero no los lista');
  assert.match(unitOutputBroken({ tests: 10, pass: 9, fail: 0, cancelled: 1 }, 0, 1), /canceladas/);
  assert.match(unitOutputBroken({ tests: 10, pass: 10, fail: 0 }, 0, 1), /código 1 sin fallos listados/);
  assert.equal(unitOutputBroken({ tests: 10, pass: 8, fail: 2 }, 2, 1), '');
  assert.equal(unitOutputBroken({ tests: 4, pass: 1, fail: 0, skipped: 3 }, 0, 0), '', 'mezcla con un resultado ejecutado');
});

test('el entorno de los hijos es una lista explícita: no hereda secretos ni configuración', () => {
  const parent = { Path: '/bin', SystemRoot: '/w', TEMP: '/t', USERPROFILE: '/u', LOCALAPPDATA: '/l', PLANB_HUBSPOT_TOKEN: 'pat-x', GOOGLE_WORKSPACE_CLIENT_SECRET: 's',
    DATABASE_URL: 'postgres://real', NODE_OPTIONS: '--require x', PLANB_DATA_DIR: '/datos', CI_CANARY_356: 'ajeno', NODE_TEST_CONTEXT: 'child' };
  const env = childEnvironment(parent, { NODE_ENV: 'test' }) as Record<string, string>;
  assert.deepEqual(Object.keys(env).sort(), ['LOCALAPPDATA', 'NODE_ENV', 'Path', 'SystemRoot', 'TEMP', 'USERPROFILE'].sort());
  assert.ok((CHILD_ENV_KEEP as string[]).every(k => k === k.toLowerCase() && !/planb|hubspot|google|token|secret|node_options|database/.test(k)));
});

test('la línea de órdenes se valida antes de ejecutar nada', () => {
  for (const [argv, message] of [[['--rapido'], /desconocida/], [['--tests'], /necesita un valor/], [['--tests', '--skip-api'], /necesita un valor/],
    [['--skip-api', '--skip-api'], /repetida/], [['--tests', 'tests/**/*.ts'], /solo admite/], [['--known', 'no-existe.json'], /No existe/]] as [string[], RegExp][]) {
    assert.throws(() => parseArgs(argv), (e: unknown) => e instanceof UsageError && message.test((e as Error).message), argv.join(' '));
  }
  assert.equal(parseArgs(['--skip-types', '--tests', 'tests/a.test.ts']).subset, true);
});

// ---- CLI real: código de salida e informe ---------------------------------------------------------------------------

type Cli = { code: number | null; out: string; report: { ok: boolean; steps: { unit: { broken: string | null; unexpected: Failure[]; noResult: Failure[] } } } | null };

/** Ejecuta tools/ci/run.mjs sobre pruebas sintéticas propias (sin tipos ni inventario) y lee su informe. */
function ci(t: test.TestContext, files: Record<string, string>, knownEntries: object[] = [], env: Record<string, string> = {}): Cli {
  const dir = scratch(t, 'ci-cli-'), rel = path.relative(process.cwd(), dir).replace(/\\/g, '/');
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" + body);
  const knownFile = path.join(dir, 'known.json');
  fs.writeFileSync(knownFile, JSON.stringify({ failures: knownEntries.map(e => ({ cause: 'causa sintética de la prueba de CI', owner: 'prueba', ...e })) }));
  const run = spawnSync(process.execPath, [RUNNER, '--skip-types', '--skip-api', '--tests', rel + '/*.test.mjs', '--known', knownFile], { encoding: 'utf8', timeout: 180_000, env: cleanEnv(env) });
  const out = run.stdout + run.stderr, at = /informe en (.+)$/m.exec(run.stdout)?.[1]?.trim();
  return { code: run.status, out, report: at ? JSON.parse(fs.readFileSync(path.join(at, 'report.json'), 'utf8')) : null };
}

test('CLI real: éxito y fallo nuevo dan el código de salida correcto', t => {
  const ok = ci(t, { 'a.test.mjs': "test('pasa', () => {});" });
  assert.equal(ok.code, 0, ok.out); assert.equal(ok.report?.ok, true);
  const bad = ci(t, { 'a.test.mjs': "test('pasa', () => {});\ntest('rompe', () => { assert.equal(1, 2); });" });
  assert.equal(bad.code, 1, bad.out); assert.deepEqual(bad.report?.steps.unit.unexpected.map(f => f.name), ['rompe']);
  assert.ok(bad.report!.steps.unit.unexpected[0].file!.endsWith('/a.test.mjs'), 'el informe liga el fallo a su archivo');
});

test('CLI real: un fallo conocido que sigue fallando da verde; uno que ya no se ejecuta da rojo', t => {
  // La lista se escribe con la ruta del archivo antes de ejecutar, como haría quien la mantiene.
  const dir = scratch(t, 'ci-cli-known-'), rel = path.relative(process.cwd(), dir).replace(/\\/g, '/');
  fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('pasa', () => {});\ntest('rompe', () => { assert.equal(1, 2); });");
  const list = path.join(dir, 'known.json');
  fs.writeFileSync(list, JSON.stringify({ failures: [{ file: rel + '/a.test.mjs', name: 'rompe', cause: 'causa sintética de la prueba de CI', owner: 'prueba' }] }));
  const green = spawnSync(process.execPath, [RUNNER, '--skip-types', '--skip-api', '--tests', rel + '/*.test.mjs', '--known', list], { encoding: 'utf8', timeout: 180_000, env: cleanEnv() });
  assert.equal(green.status, 0, green.stdout + green.stderr);
  fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import test from 'node:test';\ntest('pasa', () => {});\ntest('rompe', { skip: true }, () => {});");
  const silent = spawnSync(process.execPath, [RUNNER, '--skip-types', '--skip-api', '--tests', rel + '/*.test.mjs', '--known', list], { encoding: 'utf8', timeout: 180_000, env: cleanEnv() });
  assert.equal(silent.status, 1, 'un conocido omitido no acredita que pase');
  assert.match(silent.stdout, /SIN RESULTADO/);
});

test('CLI real: solo omitidas, solo pendientes y una mezcla con resultado', t => {
  const skipped = ci(t, { 'a.test.mjs': "test('omitida', { skip: true }, () => {});" });
  assert.equal(skipped.code, 1, skipped.out); assert.match(skipped.report?.steps.unit.broken ?? '', /solo omitidas o pendientes/);
  const todo = ci(t, { 'a.test.mjs': "test('pendiente', { todo: true }, () => {});" });
  assert.equal(todo.code, 1, todo.out); assert.match(todo.report?.steps.unit.broken ?? '', /solo omitidas o pendientes/);
  const mixed = ci(t, { 'a.test.mjs': "test('pasa', () => {});\ntest('omitida', { skip: true }, () => {});\ntest('pendiente', { todo: true }, () => {});" });
  assert.equal(mixed.code, 0, mixed.out);
});

test('CLI real: el hijo no recibe una variable que solo tiene el proceso padre', t => {
  const canary = ci(t, { 'a.test.mjs': "test('sin canario', () => { assert.equal(process.env.CI_CANARY_356, undefined); assert.equal(process.env.PLANB_HUBSPOT_TOKEN, undefined); assert.equal(process.env.NODE_ENV, 'test'); });" },
    [], { CI_CANARY_356: 'ajeno', PLANB_HUBSPOT_TOKEN: 'pat-ficticio' });
  assert.equal(canary.code, 0, canary.out);
});

test('CLI real: argumentos inválidos salen con código 2 sin ejecutar nada', () => {
  const run = spawnSync(process.execPath, [RUNNER, '--tests', 'tests/**/*.ts'], { encoding: 'utf8', timeout: 60_000, env: cleanEnv() });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Uso: node tools\/ci\/run\.mjs/);
  assert.doesNotMatch(run.stdout, /1\/3/, 'no llega a empezar ningún paso');
});

test('el tope de tiempo termina también los procesos nietos (en Windows, todo el árbol)', { timeout: 30_000 }, async t => {
  // @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
  const { run } = await import('../tools/ci/run.mjs');
  const dir = scratch(t, 'ci-timeout-'), log = path.join(dir, 'run.log');
  // El hijo lanza un nieto que escribe sin parar; sin terminar el árbol, la tubería no se cerraría nunca.
  const grand = "setInterval(()=>process.stdout.write('.'),50)";
  const parent = "const {spawn}=require('node:child_process');spawn(process.execPath,['-e'," + JSON.stringify(grand) + "],{stdio:'inherit'});setInterval(()=>{},1000)";
  const started = Date.now();
  const result = await run(['-e', parent], { log, timeoutMs: 1500 }) as { timedOut: boolean; seconds: number };
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 20_000, 'el paso termina poco después del tope: ' + (Date.now() - started) + ' ms');
});

test('CLI real (CODEX-CI-R2-390): una conocida omitida no se da por pasada aunque pase su homónima de otro archivo', t => {
  const dir = scratch(t, 'ci-cli-twin-'), rel = path.relative(process.cwd(), dir).replace(/\\/g, '/');
  const header = "import test from 'node:test';\n";
  const runWith = (aBody: string, flaky: boolean) => {
    fs.writeFileSync(path.join(dir, 'a.test.mjs'), header + aBody);
    fs.writeFileSync(path.join(dir, 'b.test.mjs'), header + "test('mismo título', () => {});\ntest('otra', () => {});");
    const list = path.join(dir, 'known.json');
    fs.writeFileSync(list, JSON.stringify({ failures: [{ file: rel + '/a.test.mjs', name: 'mismo título', cause: 'causa sintética de la prueba de CI', owner: 'prueba', ...(flaky ? { flaky: true } : {}) }] }));
    const run = spawnSync(process.execPath, [RUNNER, '--skip-types', '--skip-api', '--tests', rel + '/*.test.mjs', '--known', list], { encoding: 'utf8', timeout: 180_000, env: cleanEnv() });
    const at = /informe en (.+)$/m.exec(run.stdout)?.[1]?.trim();
    const unit = at ? JSON.parse(fs.readFileSync(path.join(at, 'report.json'), 'utf8')).steps.unit : null;
    return { code: run.status, unit, out: run.stdout + run.stderr };
  };
  for (const flaky of [true, false]) {
    const skipped = runWith("test('mismo título', { skip: true }, () => {});", flaky);
    assert.equal(skipped.code, 1, (flaky ? 'inestable' : 'estable') + ': ' + skipped.out);
    assert.deepEqual(skipped.unit.noResult.map((f: Failure) => f.name), ['mismo título'], 'A queda sin resultado');
    assert.deepEqual(skipped.unit.flakyPassed, []); assert.deepEqual(skipped.unit.resolved, []);
  }
  const ran = runWith("test('mismo título', () => {});", true);
  assert.equal(ran.code, 0, ran.out);
  assert.deepEqual(ran.unit.flakyPassed.map((f: Failure) => f.name), ['mismo título'], 'ejecutada y aprobada en su archivo: inestable que pasó');
});
