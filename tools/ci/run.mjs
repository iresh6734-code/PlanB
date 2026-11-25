#!/usr/bin/env node
// CI local de Plan B (CLAUDE-CI-LOCAL).
//
//   node tools/ci/run.mjs                                   tipos + batería unitaria + inventario de la API
//   node tools/ci/run.mjs --skip-api                        sin comprobar docs/api.md
//   node tools/ci/run.mjs --skip-types                      sin tsc (para ejecuciones focalizadas)
//   node tools/ci/run.mjs --tests "tests/store-*.test.ts"   solo un subconjunto (los conocidos se filtran igual)
//   node tools/ci/run.mjs --known otra-lista.json           otra lista de fallos conocidos
//
// La batería se ejecuta con NODE_ENV=test y un entorno de variables acotado, y sus fallos se comparan con
// tools/ci/known-failures.json. Código 0 solo si: tipos correctos, ningún fallo nuevo, ningún conocido estable
// que ya pase, ningún conocido sin resultado, salida interpretable con al menos una prueba ejecutada y
// docs/api.md al día. Código 2 si la línea de órdenes no es válida. Registros e informe en tests/.tmp/ci/<fecha>/.
// No usa red exterior ni servicios: todo corre en este equipo.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareFailures, parseResults, parseTestOutput, validateKnown } from './compare.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Variables que los procesos hijos pueden heredar: las del sistema y del perfil de Windows que Node, PowerShell
 * (DPAPI) y los procesos de prueba necesitan para funcionar. Nada de PLANB_*, HUBSPOT_*, GOOGLE_*, DATABASE_URL,
 * NODE_OPTIONS ni otros valores del entorno de quien lanza la CI (CODEX-CI-REVIEW-356 F2).
 */
export const CHILD_ENV_KEEP = ['path', 'pathext', 'systemroot', 'systemdrive', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir',
  'userprofile', 'appdata', 'localappdata', 'homedrive', 'homepath', 'username', 'userdomain', 'computername',
  'programdata', 'programfiles', 'programfiles(x86)', 'programw6432', 'commonprogramfiles', 'commonprogramfiles(x86)',
  'psmodulepath', 'number_of_processors', 'processor_architecture', 'processor_identifier', 'os', 'lang', 'tz'];

/** Entorno de un proceso hijo: solo las variables permitidas más las propias del paso. */
export function childEnvironment(parent, extra = {}) {
  const base = Object.fromEntries(Object.entries(parent).filter(([key]) => CHILD_ENV_KEEP.includes(key.toLowerCase())));
  return { ...base, ...extra };
}

export class UsageError extends Error {}

/** Valida la línea de órdenes antes de ejecutar nada. */
export function parseArgs(argv) {
  const flags = new Set(['--skip-api', '--skip-types']), withValue = new Set(['--tests', '--known']);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!flags.has(arg) && !withValue.has(arg)) throw new UsageError('Opción desconocida: ' + arg);
    if (arg in options) throw new UsageError('Opción repetida: ' + arg);
    if (withValue.has(arg)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--') || !next.trim()) throw new UsageError(arg + ' necesita un valor.');
      options[arg] = next; i++;
    } else options[arg] = true;
  }
  const pattern = options['--tests'] ?? 'tests/*.test.ts';
  if (unsupportedPattern(pattern)) throw new UsageError('--tests solo admite * dentro de un nombre (p. ej. "tests/store-*.test.ts").');
  const known = resolve(REPO, options['--known'] ?? join('tools', 'ci', 'known-failures.json'));
  if (!existsSync(known)) throw new UsageError('No existe la lista de fallos conocidos: ' + known);
  return { pattern, subset: '--tests' in options, known, skipApi: !!options['--skip-api'], skipTypes: !!options['--skip-types'] };
}

export function run(args, { env = {}, log, timeoutMs = 0 }) {
  return new Promise(done => {
    const started = Date.now(), file = createWriteStream(log);
    const child = spawn(process.execPath, args, { cwd: REPO, env: childEnvironment(process.env, env), windowsHide: true, detached: process.platform !== 'win32' });
    let output = '', timedOut = false;
    // Texto UTF-8 por flujo: un carácter partido entre dos trozos no corrompe «✖» ni «ℹ».
    for (const stream of [child.stdout, child.stderr]) { stream.setEncoding('utf8'); stream.on('data', chunk => { output += chunk; file.write(chunk); }); }
    // En Windows, kill() solo termina el proceso directo y sus hijos siguen escribiendo en la tubería: se termina el árbol entero.
    const killTree = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else process.kill(-child.pid, 'SIGKILL'); } catch { /* ya terminado */ } child.kill('SIGKILL'); };
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; killTree(); }, timeoutMs) : null;
    child.on('close', code => { if (timer) clearTimeout(timer); file.end(); done({ code, output, timedOut, seconds: (Date.now() - started) / 1000 }); });
  });
}

async function main(argv) {
  const options = parseArgs(argv);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const outDir = join(REPO, 'tests', '.tmp', 'ci', stamp);
  mkdirSync(outDir, { recursive: true });
  const known = validateKnown(JSON.parse(readFileSync(options.known, 'utf8')));
  const report = { startedAt: new Date().toISOString(), pattern: options.pattern, steps: {} };
  let ok = true;

  if (options.skipTypes) { console.log('1/3 · Tipos: omitido (--skip-types)'); report.steps.types = { skipped: true }; }
  else {
    console.log('1/3 · Tipos (tsc --noEmit)…');
    const types = await run([join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', 'tsconfig.json'], { log: join(outDir, 'tsc.log') });
    report.steps.types = { ok: types.code === 0, seconds: types.seconds };
    console.log(types.code === 0 ? '    correcto' : '    ERRORES de tipos (ver tsc.log)');
    ok &&= types.code === 0;
  }

  console.log('2/3 · Batería unitaria con NODE_ENV=test (' + options.pattern + ')…');
  // El patrón lo expande node:test, no la shell (evita el límite de línea de Windows).
  // Reportero fijado y sin colores, para que la salida sea siempre la que compare.mjs sabe leer. Tope de 60 min.
  // Dos reporteros: «spec» para la persona y los fallos, y el estructurado de compare.mjs para atribuir cada pasada a su archivo.
  const resultsFile = join(outDir, 'results.jsonl');
  const unit = await run([join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=' + pathToFileURL(join(REPO, 'tools', 'ci', 'compare.mjs')).href, '--test-reporter-destination=' + resultsFile, options.pattern],
    { env: { NODE_ENV: 'test', NO_COLOR: '1', FORCE_COLOR: '0' }, log: join(outDir, 'unit.log'), timeoutMs: 60 * 60_000 });
  const parsed = parseTestOutput(unit.output);
  const scoped = options.subset ? known.filter(entry => matchesPattern(entry.file, options.pattern)) : known;
  const { passed, failedEvents } = parseResults(existsSync(resultsFile) ? readFileSync(resultsFile, 'utf8') : '', REPO);
  const comparison = compareFailures(parsed.failures, scoped, passed);
  const s = parsed.summary;
  console.log('    ' + (s.tests ?? '?') + ' pruebas · ' + (s.pass ?? '?') + ' correctas · ' + (s.fail ?? '?') + ' fallos · '
    + (s.cancelled ?? 0) + ' canceladas · ' + (s.skipped ?? 0) + ' omitidas · ' + (s.todo ?? 0) + ' pendientes · ' + Math.round(unit.seconds) + ' s');
  console.log('    conocidos que siguen fallando: ' + comparison.expected.length + ' · inestables que esta vez pasan: ' + comparison.flakyPassed.length);
  const list = (title, items, mark) => { if (!items.length) return; console.log('    ' + title); for (const f of items) console.log('      ' + mark + ' ' + (f.file ?? '(sin archivo)') + ' › ' + f.name); };
  list('conocidos que YA PASAN: retíralos de known-failures.json (si no, una regresión posterior pasaría inadvertida):', comparison.resolved, '✔');
  list('conocidos SIN RESULTADO (omitidos, renombrados o retirados): revisa la lista:', comparison.noResult, '?');
  list('FALLOS NUEVOS:', comparison.unexpected, '✖');
  const unitBroken = unit.timedOut ? 'superó el tope de 60 minutos' : unitOutputBroken(s, parsed.failures.length, unit.code);
  if (unitBroken) console.log('    La batería no terminó de forma interpretable: ' + unitBroken + ' (ver unit.log).');
  report.steps.unit = { seconds: unit.seconds, exitCode: unit.code, summary: s, broken: unitBroken || null,
    unexpected: comparison.unexpected, expected: comparison.expected, resolved: comparison.resolved, flakyPassed: comparison.flakyPassed, noResult: comparison.noResult,
    failedEvents };
  ok &&= comparison.ok && !unitBroken;

  if (options.skipApi) { console.log('3/3 · Inventario de la API: omitido (--skip-api)'); report.steps.api = { skipped: true }; }
  else {
    console.log('3/3 · Inventario de la API (docs/api.md al día)…');
    const api = await run([join(REPO, 'tools', 'api', 'inventory.mjs'), '--check'], { log: join(outDir, 'api.log') });
    report.steps.api = { ok: api.code === 0, seconds: api.seconds };
    console.log(api.code === 0 ? '    al día' : '    DESACTUALIZADO o fallido (ver api.log; regenera con node tools/api/inventory.mjs)');
    ok &&= api.code === 0;
  }

  report.ok = ok;
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n' + (ok ? 'CI local: CORRECTA' : 'CI local: CON PROBLEMAS') + ' · informe en ' + outDir);
  return ok ? 0 : 1;
}

/** Motivo por el que la salida de la batería no es fiable, o '' si lo es. */
export function unitOutputBroken(summary, listedFailures, exitCode) {
  if (summary.tests === undefined) return 'sin resumen de node:test';
  if (summary.tests === 0) return 'no se ejecutó ninguna prueba';
  // Las omitidas y pendientes cuentan en «tests»: hace falta al menos un resultado ejecutado (CODEX-CI-REVIEW-356 F1).
  if ((summary.pass ?? 0) === 0 && listedFailures === 0) return 'ninguna prueba se ejecutó con resultado (solo omitidas o pendientes)';
  if ((summary.fail ?? 0) > 0 && listedFailures === 0) return 'informa de fallos pero no los lista';
  if ((summary.cancelled ?? 0) > 0) return summary.cancelled + ' pruebas canceladas';
  if (exitCode !== 0 && listedFailures === 0) return 'terminó con código ' + exitCode + ' sin fallos listados';
  return '';
}

/** Verdadero si el patrón usa algo que matchesPattern no reproduce (**, ?, [], {}, ./ inicial o barras invertidas). */
export function unsupportedPattern(pattern) {
  return /\*\*|[?[\]{}\\]/.test(pattern) || pattern.startsWith('./');
}

/** Coincidencia de un archivo con el patrón de --tests (solo admite * dentro de un segmento, como node:test aquí). */
export function matchesPattern(file, pattern) {
  const regex = new RegExp('^' + pattern.replace(/\\/g, '/').split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  return regex.test(file);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof UsageError) console.error('Uso: node tools/ci/run.mjs [--skip-api] [--skip-types] [--tests PATRÓN] [--known ARCHIVO]');
    process.exitCode = 2;
  });
}
