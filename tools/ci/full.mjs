#!/usr/bin/env node
// CI local completa: la CI de siempre más pasos opcionales, en un único informe (CLAUDE-CI-STEPS, mejora E1).
//
//   node tools/ci/full.mjs                              igual que tools/ci/run.mjs (tipos + batería + API)
//   node tools/ci/full.mjs --perf                       + presupuestos de rendimiento (tools/perf/measure.ts --check)
//   node tools/ci/full.mjs --mobile                     + autotest del escáner móvil (sin servidor; abre Chromium sin interfaz)
//   node tools/ci/full.mjs --e2e [filtros…]             + E2E aislados (tools/e2e/isolated.mjs; compila en tests/.tmp/e2e-build)
//   node tools/ci/full.mjs --skip-types --tests "tests/store-*.test.ts" --perf
//
// Las opciones de run.mjs (--skip-api, --skip-types, --tests, --known) se reenvían tal cual y se validan antes de ejecutar
// nada. Cada paso pedido se ejecuta aunque falle uno anterior, para que el informe salga completo; los no pedidos figuran
// como «no ejecutado». Código 0 solo si todos los pasos ejecutados terminan bien; 1 si alguno falla o se agota su tiempo;
// 2 si la línea de órdenes no es válida. Registros e informe en tests/.tmp/ci/<fecha>-completa/.
// No modifica run.mjs (reservado por CODEX-CI-FAILURE-EVIDENCE-421) ni los arneses que llama.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError, parseArgs as parseBaseArgs, run as runNode } from './run.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const NOT_RUN = 'no ejecutado', OK = 'correcto', FAILED = 'con problemas', TIMED_OUT = 'tiempo agotado';
/** Topes por paso. La base ya lleva su propio tope de 60 minutos para la batería. */
export const TIMEOUTS = { base: 0, perf: 20 * 60_000, mobile: 15 * 60_000, e2e: 180 * 60_000 };
export const USAGE = 'Uso: node tools/ci/full.mjs [--perf] [--mobile] [--e2e [filtros…]] [opciones de tools/ci/run.mjs]';

/** Separa las opciones propias de las que se reenvían a run.mjs y valida ambas antes de ejecutar nada. */
export function parseFullArgs(argv, validateBase = parseBaseArgs) {
  const options = { perf: false, mobile: false, e2e: null, base: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--perf' || arg === '--mobile') {
      const key = arg.slice(2);
      if (options[key]) throw new UsageError('Opción repetida: ' + arg);
      options[key] = true;
    } else if (arg === '--e2e') {
      if (options.e2e) throw new UsageError('Opción repetida: --e2e');
      // Los filtros de Playwright (archivos, -g «nombre», --project=…) siguen a --e2e hasta la siguiente opción propia o de run.mjs.
      const filters = [];
      while (i + 1 < argv.length && !isOwnOrBaseOption(argv[i + 1])) filters.push(argv[++i]);
      options.e2e = { filters };
    } else options.base.push(arg);
  }
  validateBase(options.base);
  return options;
}
const BASE_OPTIONS = new Set(['--skip-api', '--skip-types', '--tests', '--known']);
const isOwnOrBaseOption = arg => arg === '--perf' || arg === '--mobile' || arg === '--e2e' || BASE_OPTIONS.has(arg);

/** Los cuatro pasos, en orden, con su orden exacta. Ninguno escribe en dist/ ni build/. */
export function planSteps(options, repo = REPO) {
  const tsx = join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return [
    { id: 'base', label: 'CI de siempre (tools/ci/run.mjs)', requested: true,
      args: [join(repo, 'tools', 'ci', 'run.mjs'), ...options.base], env: {}, timeoutMs: TIMEOUTS.base },
    { id: 'perf', label: 'Presupuestos de rendimiento (tools/perf/measure.ts --check)', requested: options.perf,
      args: [tsx, join(repo, 'tools', 'perf', 'measure.ts'), '--check'], env: { NODE_ENV: 'test', NO_COLOR: '1' }, timeoutMs: TIMEOUTS.perf },
    { id: 'mobile', label: 'Autotest del escáner móvil (tools/visual/mobile-scan.mts --self-test)', requested: options.mobile,
      args: [tsx, join(repo, 'tools', 'visual', 'mobile-scan.mts'), '--self-test'], env: { NO_COLOR: '1' }, timeoutMs: TIMEOUTS.mobile },
    { id: 'e2e', label: 'E2E aislados (tools/e2e/isolated.mjs)', requested: !!options.e2e,
      args: [join(repo, 'tools', 'e2e', 'isolated.mjs'), ...(options.e2e?.filters ?? [])], env: { NO_COLOR: '1', FORCE_COLOR: '0' }, timeoutMs: TIMEOUTS.e2e },
  ];
}

/** Últimas líneas con contenido, sin códigos de color y recortadas: lo que entra en el informe. */
export function summarize(output, lines = 12, width = 240) {
  return String(output ?? '').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map(line => line.trimEnd()).filter(line => line.trim())
    .slice(-lines).map(line => line.length > width ? line.slice(0, width - 1) + '…' : line);
}

/** Informe de run.mjs, si su salida dice dónde lo dejó y existe. */
export function readBaseReport(output) {
  const match = /informe en (.+?)\s*$/m.exec(String(output ?? ''));
  if (!match) return null;
  const file = join(match[1].trim(), 'report.json');
  try { return existsSync(file) ? { dir: match[1].trim(), report: JSON.parse(readFileSync(file, 'utf8')) } : null; }
  catch { return null; }
}

/**
 * Ejecuta los pasos pedidos y escribe un único informe. `exec(step, logFile)` debe devolver
 * { code, output, seconds, timedOut }; por defecto lanza `node` con el entorno acotado de run.mjs.
 */
export async function runFull(options, { outDir, exec = defaultExec, log = console.log, repo = REPO } = {}) {
  mkdirSync(outDir, { recursive: true });
  const steps = planSteps(options, repo), requested = steps.filter(step => step.requested);
  const report = { startedAt: new Date().toISOString(), steps: {} };
  let index = 0;
  for (const step of steps) {
    if (!step.requested) { report.steps[step.id] = { label: step.label, status: NOT_RUN }; continue; }
    log(++index + '/' + requested.length + ' · ' + step.label + '…');
    const logFile = join(outDir, step.id + '.log');
    let result;
    try { result = await exec(step, logFile); }
    catch (error) { result = { code: null, output: error instanceof Error ? error.message : String(error), seconds: 0, timedOut: false }; }
    const status = result.timedOut ? TIMED_OUT : result.code === 0 ? OK : FAILED;
    const entry = { label: step.label, status, exitCode: result.code ?? null, seconds: Math.round((result.seconds ?? 0) * 10) / 10,
      summary: summarize(result.output), log: logFile };
    if (step.id === 'base') { const base = readBaseReport(result.output); entry.report = base?.report ?? null; entry.reportDir = base?.dir ?? null; }
    if (step.id === 'e2e') entry.filters = options.e2e?.filters ?? [];
    report.steps[step.id] = entry;
    log('    ' + status + ' · ' + entry.seconds + ' s' + (status === OK ? '' : ' (ver ' + logFile + ')'));
  }
  report.ok = requested.every(step => report.steps[step.id].status === OK);
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  return { ok: report.ok, code: report.ok ? 0 : 1, report };
}

function defaultExec(step, logFile) {
  return runNode(step.args, { env: step.env, log: logFile, timeoutMs: step.timeoutMs });
}

async function main(argv) {
  const options = parseFullArgs(argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid + '-completa';
  const outDir = join(REPO, 'tests', '.tmp', 'ci', stamp);
  const { ok, code, report } = await runFull(options, { outDir });
  console.log('\nResumen:');
  for (const [id, step] of Object.entries(report.steps)) console.log('  ' + id.padEnd(7) + step.status + (step.seconds !== undefined ? ' · ' + step.seconds + ' s' : ''));
  console.log('\n' + (ok ? 'CI completa: CORRECTA' : 'CI completa: CON PROBLEMAS') + ' · informe en ' + outDir);
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof UsageError) console.error(USAGE);
    process.exitCode = 2;
  });
}
