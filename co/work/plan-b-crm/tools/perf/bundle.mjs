// CLAUDE-PERF-BUDGETS · Tamaño del paquete inicial del cliente.
//
//   node tools/perf/bundle.mjs            compila con Vite en tests/.tmp/perf-build/dist y mide
//   node tools/perf/bundle.mjs --no-build mide la última compilación de esa carpeta
//   node tools/perf/bundle.mjs --json | --check
//
// Nunca escribe en dist/ ni build/ (las carpetas que sirve el piloto). No usa red ni dependencias nuevas.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PERF_BUILD = join(ROOT, 'tests', '.tmp', 'perf-build', 'dist');

export function build(outDir = PERF_BUILD) {
  const target = resolve(outDir);
  for (const forbidden of [join(ROOT, 'dist'), join(ROOT, 'build')])
    if (target === forbidden || target.startsWith(forbidden + '\\') || target.startsWith(forbidden + '/')) throw new Error('No se compila en ' + forbidden);
  const result = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', target, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('La compilación con Vite falló (código ' + result.status + ')');
  return target;
}

const gzip = buffer => gzipSync(buffer, { level: 9 }).length;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/**
 * Lo que el navegador descarga antes de pintar: el script de entrada, los módulos que precarga y las hojas de estilo
 * enlazadas en index.html. Los trozos de carga diferida se cuentan aparte.
 */
export function analyze(dir = PERF_BUILD) {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) throw new Error('No hay compilación en ' + dir + '. Ejecuta node tools/perf/bundle.mjs');
  const html = readFileSync(index, 'utf8');
  const refs = new Set();
  for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) refs.add(match[1]);
  for (const match of html.matchAll(/<link[^>]*rel="(?:stylesheet|modulepreload)"[^>]*href="([^"]+)"/g)) refs.add(match[1]);
  for (const match of html.matchAll(/<link[^>]*href="([^"]+)"[^>]*rel="(?:stylesheet|modulepreload)"/g)) refs.add(match[1]);
  const initial = [...refs].filter(ref => !/^https?:/.test(ref)).map(ref => {
    const path = join(dir, ref.replace(/^\//, ''));
    const content = readFileSync(path);
    return { file: relative(dir, path).replace(/\\/g, '/'), kind: ref.endsWith('.css') ? 'css' : 'js', bytes: content.length, gzip: gzip(content) };
  });
  const initialSet = new Set(initial.map(item => item.file));
  const lazy = files(join(dir, 'assets')).filter(path => /\.(js|css)$/.test(path)).map(path => relative(dir, path).replace(/\\/g, '/'))
    .filter(file => !initialSet.has(file)).map(file => {
      const content = readFileSync(join(dir, file));
      return { file, kind: file.endsWith('.css') ? 'css' : 'js', bytes: content.length, gzip: gzip(content) };
    });
  const sum = (list, key, kind) => list.filter(item => !kind || item.kind === kind).reduce((total, item) => total + item[key], 0);
  const largestLazy = lazy.filter(item => item.kind === 'js').sort((a, b) => b.bytes - a.bytes)[0] ?? null;
  return {
    dir,
    totals: {
      initialJs: sum(initial, 'bytes', 'js'), initialJsGzip: sum(initial, 'gzip', 'js'),
      initialCss: sum(initial, 'bytes', 'css'), initialCssGzip: sum(initial, 'gzip', 'css'),
      initialGzip: sum(initial, 'gzip'), lazyJs: sum(lazy, 'bytes', 'js'), largestLazyJs: largestLazy?.bytes ?? 0
    },
    initial, largestLazy, lazyCount: lazy.length
  };
}

/** Totales que superan su presupuesto en bytes. */
export function overBundleBudget(result, budgets) {
  return Object.entries(budgets).flatMap(([name, limit]) => {
    const value = result.totals[name];
    if (value === undefined) return [name + ': sin medida'];
    return value > limit ? [name + ': ' + value + ' B > presupuesto ' + limit + ' B'] : [];
  });
}

const kb = bytes => (bytes / 1024).toFixed(1) + ' KB';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--no-build')) build();
  const result = analyze();
  const budgets = JSON.parse(readFileSync(join(ROOT, 'tools', 'perf', 'budgets.json'), 'utf8')).bundle;
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('Plan B · paquete inicial (' + relative(ROOT, result.dir) + ')');
    for (const item of result.initial) console.log('  ' + item.kind.padEnd(4) + kb(item.bytes).padStart(10) + '  gzip ' + kb(item.gzip).padStart(9) + '  ' + item.file);
    for (const [name, value] of Object.entries(result.totals)) console.log('  ' + name.padEnd(14) + kb(value).padStart(10) + (budgets[name] ? '  presupuesto ' + kb(budgets[name]) : ''));
    if (result.largestLazy) console.log('  Trozo diferido más grande: ' + result.largestLazy.file + ' (' + kb(result.largestLazy.bytes) + ')');
  }
  if (process.argv.includes('--check')) {
    const failures = overBundleBudget(result, budgets);
    if (failures.length) { console.error('Presupuestos superados:\n  ' + failures.join('\n  ')); process.exitCode = 1; }
    else console.log('Paquete dentro de presupuesto.');
  }
}
