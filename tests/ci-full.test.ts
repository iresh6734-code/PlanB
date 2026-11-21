// CLAUDE-CI-STEPS · Orquestación de la CI completa con pasos opcionales y un único informe.
// La ejecución de cada paso se inyecta: estas pruebas no lanzan navegadores, no compilan y no ejecutan la batería.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { FAILED, NOT_RUN, OK, TIMED_OUT, TIMEOUTS, busyPorts, e2eEvidence, e2ePorts, parseFullArgs, planSteps, readBaseReport, runFull, summarize, validateE2eFilters } from '../tools/ci/full.mjs';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { UsageError } from '../tools/ci/run.mjs';

type Step = ReturnType<typeof planSteps>[number];
type Result = { code: number | null; output: string; seconds: number; timedOut: boolean };

function outDir(t: test.TestContext) {
  fs.mkdirSync(path.resolve('tests/.tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('tests/.tmp/ci-full-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Ejecutor falso: registra cada paso pedido y devuelve lo indicado por id (por defecto, correcto). */
function fakeExec(results: Partial<Record<string, Partial<Result> | (() => never)>> = {}) {
  const calls: { step: Step; logFile: string }[] = [];
  const exec = async (step: Step, logFile: string): Promise<Result> => {
    calls.push({ step, logFile });
    const value = results[step.id];
    if (typeof value === 'function') value();
    // El paso E2E, por defecto, informa como Playwright de pruebas pasadas (R2 462: sin eso no puede ser «correcto»).
    return { code: 0, output: step.id === 'e2e' ? 'Running 3 tests\n  3 passed (12s)' : step.id + ' terminado', seconds: 1.234, timedOut: false, ...(value as Partial<Result> | undefined) };
  };
  return { exec, calls };
}
const quiet = () => {};
const freePorts = async () => [] as number[]; // arnés libre: no sondea puertos reales
const accept = () => ({});

test('sin opciones solo se ejecuta la CI de siempre; los opcionales figuran como «no ejecutado»', async t => {
  const dir = outDir(t), { exec, calls } = fakeExec();
  const { ok, code, report } = await runFull(parseFullArgs([], accept), { outDir: dir, exec, log: quiet, probe: freePorts });
  assert.deepEqual(calls.map(call => call.step.id), ['base']);
  assert.equal(ok, true); assert.equal(code, 0);
  for (const id of ['perf', 'mobile', 'e2e']) assert.equal(report.steps[id].status, NOT_RUN);
  assert.equal(report.steps.base.status, OK);
  assert.equal(report.steps.base.seconds, 1.2);
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
  assert.deepEqual(Object.keys(written.steps), ['base', 'perf', 'mobile', 'e2e'], 'un único informe con los cuatro pasos en orden');
  assert.equal(written.ok, true);
});

test('cada paso pedido se ejecuta en orden, con su orden exacta, su entorno y su tope', async t => {
  const dir = outDir(t), { exec, calls } = fakeExec();
  const options = parseFullArgs(['--skip-api', '--e2e', 'tests/e2e/ux.spec.ts', '-g', 'menú', '--mobile', '--perf'], accept);
  await runFull(options, { outDir: dir, exec, log: quiet, repo: '/repo', probe: freePorts });
  assert.deepEqual(calls.map(call => call.step.id), ['base', 'perf', 'mobile', 'e2e']);
  const [base, perf, mobile, e2e] = calls.map(call => call.step);
  const norm = (args: string[]) => args.map(arg => arg.replace(/\\/g, '/'));
  assert.deepEqual(norm(base.args), ['/repo/tools/ci/run.mjs', '--skip-api'], 'las opciones de run.mjs se reenvían tal cual');
  assert.deepEqual(norm(perf.args), ['/repo/node_modules/tsx/dist/cli.mjs', '/repo/tools/perf/measure.ts', '--check']);
  assert.equal(perf.env.NODE_ENV, 'test', 'la medida usa la clave de pruebas');
  assert.deepEqual(norm(mobile.args), ['/repo/node_modules/tsx/dist/cli.mjs', '/repo/tools/visual/mobile-scan.mts', '--self-test']);
  assert.deepEqual(norm(e2e.args), ['/repo/tools/e2e/isolated.mjs', 'tests/e2e/ux.spec.ts', '-g', 'menú']);
  assert.deepEqual([base.timeoutMs, perf.timeoutMs, mobile.timeoutMs, e2e.timeoutMs], [TIMEOUTS.base, TIMEOUTS.perf, TIMEOUTS.mobile, TIMEOUTS.e2e]);
  for (const step of [base, perf, mobile, e2e])
    assert.ok(!norm(step.args).some((arg: string) => /^\/repo\/(dist|build)(\/|$)/.test(arg)), 'ningún paso apunta a dist/ ni build/ del repositorio');
  assert.deepEqual(calls.map(call => path.basename(call.logFile)), ['base.log', 'perf.log', 'mobile.log', 'e2e.log']);
});

test('un paso que falla no impide los siguientes; el código final es 1 y cada estado queda en el informe', async t => {
  const dir = outDir(t);
  const { exec, calls } = fakeExec({ base: { code: 1, output: 'CI local: CON PROBLEMAS' }, mobile: { code: null, timedOut: true, output: 'sin respuesta' } });
  const { ok, code, report } = await runFull(parseFullArgs(['--perf', '--mobile', '--e2e'], accept), { outDir: dir, exec, log: quiet, probe: freePorts });
  assert.deepEqual(calls.map(call => call.step.id), ['base', 'perf', 'mobile', 'e2e']);
  assert.equal(ok, false); assert.equal(code, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(report.steps).map(([id, step]: [string, any]) => [id, step.status])),
    { base: FAILED, perf: OK, mobile: TIMED_OUT, e2e: OK });
  assert.equal(report.steps.base.exitCode, 1);
  assert.equal(report.steps.mobile.exitCode, null);
  assert.deepEqual(report.steps.e2e.filters, []);
});

test('solo cuenta un código 0: cualquier otro código, o un error al lanzar el paso, es «con problemas»', async t => {
  for (const result of [{ code: 2 }, { code: 3 }, { code: null }]) {
    const { exec } = fakeExec({ perf: result });
    const { code, report } = await runFull(parseFullArgs(['--perf'], accept), { outDir: outDir(t), exec, log: quiet, probe: freePorts });
    assert.equal(code, 1); assert.equal(report.steps.perf.status, FAILED);
  }
  const { exec } = fakeExec({ e2e: () => { throw new Error('spawn ENOENT'); } });
  const { code, report } = await runFull(parseFullArgs(['--e2e'], accept), { outDir: outDir(t), exec, log: quiet, probe: freePorts });
  assert.equal(code, 1);
  assert.equal(report.steps.e2e.status, FAILED);
  assert.deepEqual(report.steps.e2e.summary, ['spawn ENOENT']);
});

test('el informe incluye el informe de run.mjs cuando su salida dice dónde lo dejó', async t => {
  const dir = outDir(t), baseDir = path.join(dir, 'base-run');
  fs.mkdirSync(baseDir);
  fs.writeFileSync(path.join(baseDir, 'report.json'), JSON.stringify({ ok: true, steps: { unit: { summary: { tests: 3 } } } }));
  const { exec } = fakeExec({ base: { output: '1/3 · Tipos…\n\nCI local: CORRECTA · informe en ' + baseDir + '\n' } });
  const { report } = await runFull(parseFullArgs([], accept), { outDir: dir, exec, log: quiet, probe: freePorts });
  assert.equal(report.steps.base.reportDir, baseDir);
  assert.equal(report.steps.base.report.steps.unit.summary.tests, 3);
  assert.equal(readBaseReport('sin la línea final'), null);
  assert.equal(readBaseReport('informe en ' + path.join(dir, 'no-existe')), null);
});

test('la salida resumida quita colores, líneas vacías y recorta', () => {
  const long = 'x'.repeat(300);
  const output = '\x1b[32m✔ correcto\x1b[0m\n\n  \n' + Array.from({ length: 20 }, (_, i) => 'línea ' + i).join('\r\n') + '\n' + long;
  const summary = summarize(output);
  assert.equal(summary.length, 12);
  assert.equal(summary[0], 'línea 9');
  assert.equal(summary.at(-1)!.length, 240);
  assert.ok(summary.at(-1)!.endsWith('…'));
  assert.deepEqual(summarize('\x1b[31m✖ fallo\x1b[0m'), ['✖ fallo']);
  assert.deepEqual(summarize(''), []);
});

test('línea de órdenes: opciones repetidas, filtros de --e2e y opciones de run.mjs validadas antes de ejecutar', () => {
  assert.deepEqual(parseFullArgs(['--e2e', 'tests/e2e/a.spec.ts', '--project=chromium', '--perf'], accept).e2e, { filters: ['tests/e2e/a.spec.ts', '--project=chromium'] });
  assert.deepEqual(parseFullArgs(['--e2e', '--skip-types'], accept), { perf: false, mobile: false, e2e: { filters: [] }, base: ['--skip-types'] });
  assert.deepEqual(parseFullArgs(['--tests', 'tests/x-*.test.ts', '--e2e', 'tests/e2e/b.spec.ts'], accept).base, ['--tests', 'tests/x-*.test.ts']);
  for (const argv of [['--perf', '--perf'], ['--mobile', '--mobile'], ['--e2e', '--e2e']])
    assert.throws(() => parseFullArgs(argv, accept), (error: unknown) => error instanceof UsageError && /repetida/.test((error as Error).message));
  // Validación real de run.mjs (sin ejecutar nada): una opción desconocida o un patrón no admitido son errores de uso.
  assert.throws(() => parseFullArgs(['--perf', '--no-existe']), UsageError);
  assert.throws(() => parseFullArgs(['--tests', 'tests/**/*.test.ts']), UsageError);
  assert.throws(() => parseFullArgs(['--tests']), UsageError);
  assert.equal(parseFullArgs(['--skip-api', '--mobile']).mobile, true);
});

// ── R2 · revisión 462 ───────────────────────────────────────────────────────────────────────────────────────

test('R2 (462): un listado o una selección vacía no dan el paso E2E por correcto aunque Playwright salga con 0', async t => {
  const listing = 'Listing tests:\n  [chromium] › ux.spec.ts:3:1 › abre la app\nTotal: 1 test in 1 file';
  for (const output of [listing, 'Running 0 tests using 1 worker\n', 'Error: No tests found', '']) {
    const { exec } = fakeExec({ e2e: { code: 0, output } });
    const { code, report } = await runFull(parseFullArgs(['--e2e'], accept), { outDir: outDir(t), exec, log: quiet, probe: freePorts });
    assert.equal(code, 1, JSON.stringify(output));
    assert.equal(report.steps.e2e.status, FAILED);
    assert.match(report.steps.e2e.reason, /no consta ninguna prueba ejecutada/);
    assert.equal(report.steps.e2e.tests.executed, false);
  }
  // Ejecución real con pruebas pasadas: correcto, con el recuento en el informe.
  const { exec } = fakeExec({ e2e: { code: 0, output: '\x1b[32m  5 passed\x1b[0m (40.1s)\n  1 skipped' } });
  const { code, report } = await runFull(parseFullArgs(['--e2e'], accept), { outDir: outDir(t), exec, log: quiet, probe: freePorts });
  assert.equal(code, 0);
  assert.equal(report.steps.e2e.status, OK);
  assert.deepEqual(report.steps.e2e.tests, { passed: 5, failed: 0, flaky: 0, skipped: 1, executed: true });
});

test('R2 (462): una prueba fallida nunca es correcta, aunque el proceso devolviera 0', async t => {
  const { exec } = fakeExec({ e2e: { code: 0, output: '  4 passed\n  1 failed\n' } });
  const { report } = await runFull(parseFullArgs(['--e2e'], accept), { outDir: outDir(t), exec, log: quiet, probe: freePorts });
  assert.equal(report.steps.e2e.status, FAILED);
  assert.equal(report.steps.e2e.reason, '1 pruebas fallidas');
  assert.deepEqual(e2eEvidence('  1 flaky\n  2 passed'), { passed: 2, failed: 0, flaky: 1, skipped: 0, executed: true });
});

test('R2 (462): el paso E2E solo admite seleccionar pruebas; --no-build, --config, --list y otras opciones se rechazan antes de ejecutar', () => {
  assert.deepEqual(validateE2eFilters(['tests/e2e/ux.spec.ts', 'tests\\e2e\\sub\\b.spec.ts:12', '-g', 'menú', '--grep-invert', 'lento', '--grep=ficha', '--project=chromium']),
    ['tests/e2e/ux.spec.ts', 'tests/e2e/sub/b.spec.ts:12', '-g', 'menú', '--grep-invert', 'lento', '--grep=ficha', '--project=chromium']);
  for (const bad of [['--no-build'], ['--config', 'otra.config.ts'], ['-c', 'x'], ['--list'], ['--reporter=dot'], ['--update-snapshots'], ['--headed'],
    ['a.spec.ts'], ['tests/e2e/../../dist/x.spec.ts'], ['tests/unit.test.ts'], ['-g'], ['--grep', '--project=chromium'], ['--project=../x']])
    assert.throws(() => validateE2eFilters(bad), (error: unknown) => error instanceof UsageError, JSON.stringify(bad));
  // Por la línea de órdenes completa, sin ejecutar nada.
  assert.throws(() => parseFullArgs(['--e2e', '--no-build'], accept), UsageError);
  assert.throws(() => parseFullArgs(['--e2e', '--list', '--perf'], accept), UsageError);
  assert.throws(() => parseFullArgs(['--e2e', 'tests/e2e/ux.spec.ts', '--config=otra.ts'], accept), UsageError);
});

test('R2 (462): con el arnés ocupado el paso E2E no se lanza y explica por qué', async t => {
  const { exec, calls } = fakeExec();
  const seen: number[][] = [];
  const probe = async (ports: number[]) => { seen.push(ports); return [4341]; };
  const { code, report } = await runFull(parseFullArgs(['--perf', '--e2e'], accept), { outDir: outDir(t), exec, log: quiet, probe });
  assert.deepEqual(calls.map(call => call.step.id), ['base', 'perf'], 'el arnés no se ejecuta');
  assert.equal(code, 1);
  assert.equal(report.steps.e2e.status, FAILED);
  assert.match(report.steps.e2e.reason, /arnés E2E ocupado: puertos 4341 en uso/);
  assert.deepEqual(seen, [e2ePorts()]);
  assert.deepEqual(e2ePorts(), [4337, 4341], 'puertos leídos de tools/e2e/playwright.isolated.config.ts');
});

test('R2 (462): el sondeo de puertos distingue uno en uso de uno libre', async t => {
  const net = await import('node:net');
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const used = (server.address() as { port: number }).port;
  const free = await new Promise<number>(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); }); });
  assert.deepEqual(await busyPorts([used, free]), [used]);
});
