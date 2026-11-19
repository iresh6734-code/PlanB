#!/usr/bin/env node
// Runs only the unit tests that stay inside this Node process: no ports, no child processes,
// no browser, no Windows key store and no outbound network (scripts/block-external.cjs).
//   node tools/safe-tests.mjs --list            dry run: what would run and what is skipped, and why
//   node tools/safe-tests.mjs [texto ...]       runs the safe tests whose name contains any texto
//   node tools/safe-tests.mjs --stop            stops at the first failure
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const UNSAFE_RULES = Object.freeze([
  { id: 'port', why: 'abre un puerto', re: /\.listen\(|createServer\(|withServer\(|freePort\(/ },
  { id: 'process', why: 'lanza procesos', re: /child_process|\bspawn(Sync)?\(|\bfork\(|\bexecFile(Sync)?\(|\bexecSync\(|ChildProcess/ },
  { id: 'browser', why: 'usa un navegador', re: /playwright|puppeteer|chromium\./i },
  { id: 'system', why: 'consulta el sistema', re: /Get-CimInstance|powershell(\.exe)?['"\s]|wmic/i },
  { id: 'keystore', why: 'toca el almacén de claves de Windows', re: /dpapi|ProtectedData/i },
]);

const HELPER_IMPORT = /from\s+['"](\.\/helpers\/[^'"]+)['"]|import\(\s*['"](\.\/helpers\/[^'"]+)['"]\s*\)/g;

/** Reasons a test source (plus the helpers it imports) is not safe; empty means safe. */
export function unsafeReasons(source, readHelper = () => '') {
  const seen = new Set(), texts = [source];
  for (const match of source.matchAll(HELPER_IMPORT)) {
    const rel = match[1] ?? match[2];
    if (!seen.has(rel)) { seen.add(rel); texts.push(readHelper(rel)); }
  }
  const all = texts.join('\n');
  return UNSAFE_RULES.filter(rule => rule.re.test(all)).map(rule => rule.id);
}

function readHelperFrom(testsDir) {
  return rel => {
    const base = path.join(testsDir, rel);
    for (const candidate of [base, base + '.ts', base + '.mjs', base + '.cjs', base.replace(/\.js$/, '.ts')]) {
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) { try { return readFileSync(candidate, 'utf8'); } catch { /* sigue */ } }
    }
    return '';
  };
}

/** Classifies every tests/*.test.ts in a stable order. */
export function classify(testsDir = path.join(ROOT, 'tests')) {
  const readHelper = readHelperFrom(testsDir);
  return readdirSync(testsDir).filter(name => name.endsWith('.test.ts')).sort().map(name => {
    const reasons = unsafeReasons(readFileSync(path.join(testsDir, name), 'utf8'), readHelper);
    return { name, safe: reasons.length === 0, reasons };
  });
}

export function selectSafe(entries, filters = []) {
  const wanted = filters.map(f => f.toLowerCase());
  return entries.filter(e => e.safe && (wanted.length === 0 || wanted.some(f => e.name.toLowerCase().includes(f))));
}

function runOne(name) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [
    '--require', path.join(ROOT, 'scripts', 'block-external.cjs'),
    '--require', path.join(ROOT, 'tests', 'setup-unit-env.cjs'),
    '--import', 'tsx', '--test', path.join('tests', name),
  ], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const out = (result.stdout ?? '') + (result.stderr ?? '');
  return { name, ok: result.status === 0, ms: Date.now() - started, out };
}

function main(argv) {
  const list = argv.includes('--list'), stop = argv.includes('--stop');
  const filters = argv.filter(a => !a.startsWith('--'));
  const entries = classify();
  const safe = selectSafe(entries, filters);
  if (list) {
    const skipped = entries.filter(e => !e.safe);
    console.log('Seguras: ' + entries.filter(e => e.safe).length + ' · Fuera: ' + skipped.length + ' · Seleccionadas: ' + safe.length);
    for (const e of safe) console.log('  ✓ ' + e.name);
    for (const e of skipped) console.log('  · ' + e.name + ' — ' + e.reasons.map(id => UNSAFE_RULES.find(r => r.id === id).why).join(', '));
    return 0;
  }
  if (safe.length === 0) { console.log('Ninguna prueba segura coincide.'); return 1; }
  const failed = [];
  for (const e of safe) {
    const r = runOne(e.name);
    console.log((r.ok ? 'ok   ' : 'FAIL ') + e.name + ' (' + r.ms + ' ms)');
    if (!r.ok) {
      failed.push(e.name);
      console.log(r.out.split(/\r?\n/).filter(l => /^not ok|AssertionError|expected|actual|Error/.test(l.trim())).slice(0, 15).map(l => '     ' + l).join('\n'));
      if (stop) break;
    }
  }
  console.log('\n' + (safe.length - failed.length) + ' de ' + safe.length + ' archivos correctos' + (failed.length ? ' · fallan: ' + failed.join(', ') : ''));
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
