#!/usr/bin/env node
// CI local de Plan B (CLAUDE-CI-LOCAL).
//
//   node tools/ci/run.mjs                       tipos + batería unitaria + inventario de la API
//   node tools/ci/run.mjs --skip-api            sin comprobar docs/api.md
//   node tools/ci/run.mjs --tests "tests/store-*.test.ts"   solo un subconjunto de pruebas
//
// La batería se ejecuta con NODE_ENV=test (lo que `npm test` todavía no hace) y sus fallos se comparan con
// tools/ci/known-failures.json. Termina con código 1 solo si hay errores de tipos, fallos nuevos o un
// docs/api.md desactualizado. Los registros y el informe quedan en tests/.tmp/ci/<fecha>/ (ignorado por Git).
// No usa red exterior ni servicios: todo corre en este equipo.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFailures, parseTestOutput, validateKnown } from './compare.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(label, args, { env = {}, log, timeoutMs = 0 }) {
  return new Promise(done => {
    const started = Date.now(), file = createWriteStream(log);
    // Sin NODE_TEST_CONTEXT: si la CI se lanzara desde otra ejecución de node:test, el hijo no imprimiría su resumen.
    const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'));
    const child = spawn(process.execPath, args, { cwd: REPO, env: { ...base, ...env }, windowsHide: true });
    let output = '', timedOut = false;
    // Texto UTF-8 por flujo: un carácter partido entre dos trozos no corrompe «✖» ni «ℹ».
    for (const stream of [child.stdout, child.stderr]) { stream.setEncoding('utf8'); stream.on('data', chunk => { output += chunk; file.write(chunk); }); }
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.on('close', code => { if (timer) clearTimeout(timer); file.end(); done({ label, code, output, timedOut, seconds: (Date.now() - started) / 1000 }); });
  });
}

async function main(argv) {
  const value = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(REPO, 'tests', '.tmp', 'ci', stamp);
  mkdirSync(outDir, { recursive: true });
  const known = validateKnown(JSON.parse(readFileSync(join(REPO, 'tools', 'ci', 'known-failures.json'), 'utf8')));
  const pattern = value('--tests') ?? 'tests/*.test.ts';
  if (unsupportedPattern(pattern)) throw new Error('--tests solo admite * dentro de un nombre (p. ej. "tests/store-*.test.ts").');
  const report = { startedAt: new Date().toISOString(), pattern, steps: {} };
  let ok = true;

  console.log('1/3 · Tipos (tsc --noEmit)…');
  const types = await run('tipos', [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', 'tsconfig.json'], { log: join(outDir, 'tsc.log') });
  report.steps.types = { ok: types.code === 0, seconds: types.seconds };
  console.log(types.code === 0 ? '    correcto' : '    ERRORES de tipos (ver tsc.log)');
  ok &&= types.code === 0;

  console.log('2/3 · Batería unitaria con NODE_ENV=test (' + pattern + ')…');
  // El patrón va entre comillas lógicas: lo expande node:test, no la shell (evita el límite de línea de Windows).
  // Reportero fijado y sin colores, para que la salida sea siempre la que compare.mjs sabe leer. Tope de 60 min.
  const unit = await run('pruebas', [join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', '--test-reporter=spec', pattern],
    { env: { NODE_ENV: 'test', NO_COLOR: '1', FORCE_COLOR: '0' }, log: join(outDir, 'unit.log'), timeoutMs: 60 * 60_000 });
  const parsed = parseTestOutput(unit.output);
  const scoped = value('--tests') ? known.filter(entry => matchesPattern(entry.file, pattern)) : known;
  const comparison = compareFailures(parsed.failures, scoped);
  report.steps.unit = { seconds: unit.seconds, exitCode: unit.code, summary: parsed.summary, ...comparison };
  const s = parsed.summary;
  console.log('    ' + (s.tests ?? '?') + ' pruebas · ' + (s.pass ?? '?') + ' correctas · ' + (s.fail ?? '?') + ' fallos · ' + Math.round(unit.seconds) + ' s');
  console.log('    conocidos que siguen fallando: ' + comparison.expected.length + ' · inestables que esta vez pasan: ' + comparison.flakyPassed.length);
  if (comparison.resolved.length) {
    console.log('    conocidos que YA PASAN: retíralos de known-failures.json (si no, una regresión posterior pasaría inadvertida):');
    for (const f of comparison.resolved) console.log('      ✔ ' + f.file + ' › ' + f.name);
  }
  if (comparison.unexpected.length) {
    console.log('    FALLOS NUEVOS:');
    for (const f of comparison.unexpected) console.log('      ✖ ' + (f.file ?? '(sin archivo)') + ' › ' + f.name);
  }
  // Nunca «correcta» si la salida no cuadra: sin resumen, fallos o cancelaciones sin lista, o salida con error sin fallos listados.
  const unitBroken = unit.timedOut ? 'superó el tope de 60 minutos' : unitOutputBroken(s, parsed.failures.length, unit.code);
  if (unitBroken) console.log('    La batería no terminó de forma interpretable: ' + unitBroken + ' (ver unit.log).');
  ok &&= comparison.ok && !unitBroken;

  if (argv.includes('--skip-api')) {
    console.log('3/3 · Inventario de la API: omitido (--skip-api)');
    report.steps.api = { skipped: true };
  } else {
    console.log('3/3 · Inventario de la API (docs/api.md al día)…');
    const api = await run('api', [join(REPO, 'tools', 'api', 'inventory.mjs'), '--check'], { log: join(outDir, 'api.log') });
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
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
}
