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
      options.e2e = { filters: validateE2eFilters(filters) };
    } else options.base.push(arg);
  }
  validateBase(options.base);
  return options;
}
const BASE_OPTIONS = new Set(['--skip-api', '--skip-types', '--tests', '--known']);
const isOwnOrBaseOption = arg => arg === '--perf' || arg === '--mobile' || arg === '--e2e' || BASE_OPTIONS.has(arg);

/**
 * R2 (revisión 462): el paso E2E solo admite SELECCIONAR pruebas. Así lo que el informe llama «E2E aislados» es siempre una
 * ejecución completa del arnés con su compilación y configuración: nada de --no-build (reutilizar un build ajeno),
 * --config/-c (otra configuración), --list (listar sin ejecutar) ni otras opciones de Playwright.
 * Admite: archivos tests/e2e/…/*.spec.ts (con :línea opcional), -g/--grep TEXTO, --grep-invert TEXTO, --grep=…,
 * --grep-invert=… y --project=NOMBRE.
 */
export function validateE2eFilters(filters) {
  const out = [];
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i], path = filter.replace(/\\/g, '/');
    if (/^tests\/e2e\/[\w./-]+\.spec\.ts(:\d+)?$/.test(path) && !path.includes('..')) { out.push(path); continue; }
    if (filter === '-g' || filter === '--grep' || filter === '--grep-invert') {
      const value = filters[i + 1];
      if (value === undefined || value.startsWith('-') || !value.trim()) throw new UsageError(filter + ' necesita un texto.');
      out.push(filter, value); i++; continue;
    }
    if (/^--(grep|grep-invert)=.+$/.test(filter) || /^--project=[\w-]+$/.test(filter)) { out.push(filter); continue; }
    throw new UsageError('Filtro de E2E no admitido: ' + filter + '. Solo archivos tests/e2e/*.spec.ts, -g/--grep, --grep-invert y --project=NOMBRE; '
      + 'no se admiten --no-build, --config, --list ni otras opciones de Playwright.');
  }
  return out;
}

/**
 * R2 (462): pruebas ejecutadas según el resumen final de Playwright (reportero «list»). Un listado (--list), una selección
 * vacía o una salida sin resumen no acreditan ejecución: el paso no puede darse por correcto.
 */
export function e2eEvidence(output) {
  const text = String(output ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  const count = label => { const m = new RegExp('(\\d+) ' + label + '\\b').exec(text); return m ? Number(m[1]) : 0; };
  const evidence = { passed: count('passed'), failed: count('failed'), flaky: count('flaky'), skipped: count('skipped') };
  evidence.executed = evidence.passed + evidence.failed + evidence.flaky > 0;
  return evidence;
}

/** Puertos del arnés E2E, leídos de su configuración (127.0.0.1:NNNN). Si no se puede leer, los conocidos. */
export function e2ePorts(repo = REPO) {
  try {
    const config = readFileSync(join(repo, 'tools', 'e2e', 'playwright.isolated.config.ts'), 'utf8');
    const ports = [...new Set([...config.matchAll(/127\.0\.0\.1:(\d{2,5})/g)].map(m => Number(m[1])))];
    if (ports.length) return ports.sort((a, b) => a - b);
  } catch { /* configuración no disponible */ }
  return [4337, 4341];
}

/** Puertos de la lista que ya están escuchando en 127.0.0.1 (arnés ocupado por otra ejecución). */
export async function busyPorts(ports) {
  const { connect } = await import('node:net');
  const probe = port => new Promise(done => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = busy => { socket.destroy(); done(busy); };
    socket.setTimeout(700, () => finish(false)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
  });
  const results = await Promise.all(ports.map(async port => [port, await probe(port)]));
  return results.filter(([, busy]) => busy).map(([port]) => port);
}

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
export async function runFull(options, { outDir, exec = defaultExec, log = console.log, repo = REPO, probe = busyPorts } = {}) {
  mkdirSync(outDir, { recursive: true });
  const steps = planSteps(options, repo), requested = steps.filter(step => step.requested);
  const report = { startedAt: new Date().toISOString(), steps: {} };
  let index = 0;
  for (const step of steps) {
    if (!step.requested) { report.steps[step.id] = { label: step.label, status: NOT_RUN }; continue; }
    log(++index + '/' + requested.length + ' · ' + step.label + '…');
    const logFile = join(outDir, step.id + '.log');
    // R2 (462): el arnés E2E usa una carpeta y unos puertos fijos. Si otra ejecución lo tiene en marcha, no se lanza (pisaría
    // tests/.tmp/e2e-build) y el paso queda «con problemas» explicando por qué.
    if (step.id === 'e2e') {
      const ports = e2ePorts(repo), busy = await probe(ports);
      if (busy.length) {
        const reason = 'arnés E2E ocupado: puertos ' + busy.join(', ') + ' en uso; no se ha ejecutado para no pisar tests/.tmp/e2e-build';
        report.steps.e2e = { label: step.label, status: FAILED, exitCode: null, seconds: 0, summary: [reason], log: null, filters: options.e2e?.filters ?? [], reason };
        log('    ' + FAILED + ' · ' + reason);
        continue;
      }
    }
    let result;
    try { result = await exec(step, logFile); }
    catch (error) { result = { code: null, output: error instanceof Error ? error.message : String(error), seconds: 0, timedOut: false }; }
    let status = result.timedOut ? TIMED_OUT : result.code === 0 ? OK : FAILED;
    const entry = { label: step.label, status, exitCode: result.code ?? null, seconds: Math.round((result.seconds ?? 0) * 10) / 10,
      summary: summarize(result.output), log: logFile };
    if (step.id === 'base') { const base = readBaseReport(result.output); entry.report = base?.report ?? null; entry.reportDir = base?.dir ?? null; }
    if (step.id === 'e2e') {
      entry.filters = options.e2e?.filters ?? [];
      // R2 (462): «correcto» exige que Playwright haya ejecutado al menos una prueba y que ninguna falle.
      entry.tests = e2eEvidence(result.output);
      if (status === OK && (!entry.tests.executed || entry.tests.failed > 0 || entry.tests.passed === 0)) {
        status = entry.status = FAILED;
        entry.reason = entry.tests.failed > 0 ? entry.tests.failed + ' pruebas fallidas' : 'no consta ninguna prueba ejecutada (código 0 sin resumen de pruebas pasadas)';
      }
    }
    report.steps[step.id] = entry;
    log('    ' + status + ' · ' + entry.seconds + ' s' + (entry.reason ? ' · ' + entry.reason : '') + (status === OK ? '' : ' (ver ' + logFile + ')'));
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
