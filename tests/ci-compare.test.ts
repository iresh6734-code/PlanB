// CLAUDE-CI-LOCAL · La CI local lee la salida real de node:test y separa fallos nuevos, conocidos y resueltos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { compareFailures, parseTestOutput, validateKnown } from '../tools/ci/compare.mjs';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { matchesPattern, unitOutputBroken, unsupportedPattern } from '../tools/ci/run.mjs';

type Failure = { file: string | null; name: string };
const TMP = path.resolve('tests/.tmp');

/** Ejecuta node:test de verdad sobre un archivo de pruebas sintético y devuelve su salida. */
function realOutput(t: test.TestContext, body: string): string {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'ci-compare-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sample.test.mjs');
  fs.writeFileSync(file, "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" + body);
  // Sin NODE_TEST_CONTEXT: dentro de otra ejecución de node:test, el hijo informaría al padre en lugar de imprimir su resumen.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=spec', file], { encoding: 'utf8', timeout: 60_000, env });
  return run.stdout + run.stderr;
}

test('lee el resumen y los fallos de una ejecución real de node:test, sin duración y sin duplicados', t => {
  const output = realOutput(t, [
    "test('pasa', () => {});",
    "test('falla · con «comillas» (y paréntesis)', () => { assert.equal(1, 2); });",
    "test('padre', async t => { await t.test('hija', () => { throw new Error('x'); }); await t.test('otra', () => {}); });",
    "test('pendiente', { todo: true }, () => {});",
  ].join('\n'));
  const { summary, failures } = parseTestOutput(output) as { summary: Record<string, number>; failures: Failure[] };
  assert.equal(summary.fail, 3, 'el resumen de node:test cuenta la prueba fallida, la hija y también su padre');
  assert.equal(summary.todo, 1);
  const names = failures.map(f => f.name).sort();
  assert.deepEqual(names, ['falla · con «comillas» (y paréntesis)', 'hija'], 'solo pruebas hoja, nombre exacto sin «(…ms)»');
  assert.ok(failures.every(f => f.file && f.file.endsWith('/sample.test.mjs') && !f.file.includes('\\')), 'archivo con barras normales');
});

test('una salida sin sección de fallos no inventa fallos', () => {
  const { summary, failures } = parseTestOutput('ℹ tests 3\nℹ pass 3\nℹ fail 0\n') as { summary: Record<string, number>; failures: Failure[] };
  assert.deepEqual(failures, []);
  assert.equal(summary.pass, 3);
});

test('la sección de fallos de Windows (barras invertidas) se normaliza', () => {
  const text = ['ℹ fail 2', '✖ failing tests:', '', 'test at tests\\a.test.ts:3:1', '✖ uno (1.5ms)', '', 'test at tests\\a.test.ts:9:1', '✖ uno (2ms)', 'test at tests\\b.test.ts:1:1', '✖ dos (0.1ms)'].join('\r\n');
  const { failures } = parseTestOutput(text) as { failures: Failure[] };
  assert.deepEqual(failures, [{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/b.test.ts', name: 'dos' }]);
});

test('compara: nuevos, conocidos, resueltos e inestables; mismo nombre en otro archivo es nuevo', () => {
  const known = validateKnown({ failures: [
    { file: 'tests/a.test.ts', name: 'uno', cause: 'c', owner: 'o' },
    { file: 'tests\\c.test.ts', name: 'resuelto', cause: 'c', owner: 'o' },
    { file: 'tests/d.test.ts', name: 'a veces', cause: 'c', owner: 'o', flaky: true },
  ] });
  const result = compareFailures([
    { file: 'tests/a.test.ts', name: 'uno' },
    { file: 'tests/b.test.ts', name: 'uno' },
    { file: null, name: 'sin archivo' },
  ], known);
  assert.deepEqual(result.unexpected, [{ file: 'tests/b.test.ts', name: 'uno' }, { file: null, name: 'sin archivo' }]);
  assert.deepEqual(result.expected.map((f: Failure) => f.file + ' ' + f.name), ['tests/a.test.ts uno']);
  assert.deepEqual(result.resolved.map((f: Failure) => f.name), ['resuelto']);
  assert.deepEqual(result.flakyPassed.map((f: Failure) => f.name), ['a veces']);
  assert.equal(result.ok, false);
  // Todo lo conocido estable sigue fallando y no hay nada nuevo: correcta, aunque el inestable haya pasado.
  assert.equal(compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/c.test.ts', name: 'resuelto' }], known).ok, true);
  // Un conocido estable que ya pasa hace fallar la CI hasta retirarlo: si no, su regresión posterior pasaría inadvertida.
  const fixed = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }], known);
  assert.deepEqual(fixed.unexpected, []);
  assert.equal(fixed.ok, false);
  // Un fallo nuevo basta para fallar, aunque todo lo conocido siga como estaba.
  const fresh = compareFailures([{ file: 'tests/a.test.ts', name: 'uno' }, { file: 'tests/c.test.ts', name: 'resuelto' }, { file: 'tests/e.test.ts', name: 'nuevo' }], known);
  assert.deepEqual(fresh.resolved, []);
  assert.equal(fresh.ok, false);
});

test('un fallo sin su línea «test at» no hereda el archivo del anterior', () => {
  const text = ['✖ failing tests:', 'test at tests\\a.test.ts:3:1', '✖ uno (1ms)', '✖ huérfano (1ms)'].join('\n');
  const { failures } = parseTestOutput(text) as { failures: Failure[] };
  assert.deepEqual(failures, [{ file: 'tests/a.test.ts', name: 'uno' }, { file: null, name: 'huérfano' }]);
  const known = validateKnown({ failures: [{ file: 'tests/a.test.ts', name: 'huérfano', cause: 'c', owner: 'o', flaky: true }] });
  assert.equal(compareFailures(failures, known).unexpected.some((f: Failure) => f.name === 'huérfano'), true, 'sin archivo nunca coincide con un conocido');
});

test('salida real: un archivo que no llega a cargar cuenta como fallo ligado a su archivo', t => {
  const broken = realOutput(t, "throw new Error('no carga');\n");
  const parsedBroken = parseTestOutput(broken) as { summary: Record<string, number>; failures: Failure[] };
  assert.ok((parsedBroken.summary.fail ?? 0) >= 1, 'node:test cuenta el archivo que no carga');
  assert.equal(parsedBroken.failures.length, 1);
  assert.ok(parsedBroken.failures[0].file?.endsWith('/sample.test.mjs'), 'el fallo de carga queda ligado a su archivo');
  assert.equal(unitOutputBroken(parsedBroken.summary, parsedBroken.failures.length, 1), '', 'se compara como un fallo más, no se oculta');
});

test('--tests rechaza patrones que la comparación no sabría reproducir', () => {
  for (const bad of ['tests/**/*.test.ts', 'tests/a?.test.ts', 'tests/{a,b}.test.ts', './tests/a.test.ts', 'tests\\a.test.ts', 'tests/[ab].test.ts']) {
    assert.equal(unsupportedPattern(bad), true, bad);
  }
  for (const good of ['tests/*.test.ts', 'tests/store-*.test.ts', 'tests/a.test.ts']) assert.equal(unsupportedPattern(good), false, good);
});

test('la lista de conocidos exige archivo, nombre, causa y responsable, sin repetidos', () => {
  assert.throws(() => validateKnown({}), /lista «failures»/);
  assert.throws(() => validateKnown({ failures: [{ file: 'tests/a.test.ts', name: 'uno', owner: 'o' }] }), /falta «cause»/);
  assert.throws(() => validateKnown({ failures: [{ file: 'tests/a.test.ts', name: 'uno', cause: ' ', owner: 'o' }] }), /falta «cause»/);
  assert.throws(() => validateKnown({ failures: [
    { file: 'tests/a.test.ts', name: 'uno', cause: 'c', owner: 'o' }, { file: 'tests\\a.test.ts', name: 'uno', cause: 'c', owner: 'o' },
  ] }), /repetido/);
});

test('el archivo real de fallos conocidos es válido y cada causa está explicada', () => {
  const known = validateKnown(JSON.parse(fs.readFileSync('tools/ci/known-failures.json', 'utf8'))) as { file: string; cause: string }[];
  for (const entry of known) {
    assert.ok(fs.existsSync(entry.file), 'el archivo de un fallo conocido existe: ' + entry.file);
    assert.ok(entry.cause.length >= 20, 'causa con contenido: ' + entry.file);
  }
});

test('--tests limita los conocidos al mismo patrón que se ejecuta', () => {
  assert.equal(matchesPattern('tests/store-records-cache.test.ts', 'tests/store-*.test.ts'), true);
  assert.equal(matchesPattern('tests/zendesk-source.test.ts', 'tests/store-*.test.ts'), false);
  assert.equal(matchesPattern('tests/e2e/x.test.ts', 'tests/*.test.ts'), false, '* no cruza carpetas');
  assert.equal(matchesPattern('tests/a.test.ts', 'tests/a.test.ts'), true);
});

test('nunca da por buena una batería cuya salida no cuadra', () => {
  assert.equal(unitOutputBroken({}, 0, 0), 'sin resumen de node:test');
  assert.equal(unitOutputBroken({ tests: 0, fail: 0 }, 0, 0), 'no se ejecutó ninguna prueba');
  assert.equal(unitOutputBroken({ tests: 10, fail: 2 }, 0, 1), 'informa de fallos pero no los lista');
  assert.match(unitOutputBroken({ tests: 10, fail: 0, cancelled: 1 }, 0, 1), /canceladas/);
  assert.match(unitOutputBroken({ tests: 10, fail: 0 }, 0, 1), /código 1 sin fallos listados/);
  assert.equal(unitOutputBroken({ tests: 10, fail: 2 }, 2, 1), '', 'fallos listados: se comparan con los conocidos');
  assert.equal(unitOutputBroken({ tests: 10, fail: 0, cancelled: 0 }, 0, 0), '');
});
