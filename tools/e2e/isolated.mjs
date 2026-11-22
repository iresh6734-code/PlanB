#!/usr/bin/env node
// Pruebas de navegador sin tocar el piloto (CLAUDE-E2E-ADAPT, 18/11/2026).
//   node tools/e2e/isolated.mjs [--no-build] [filtros de Playwright…]
// 1. Compila la App y los servidores como `npm run build`, pero en tests/.tmp/e2e-build (dist/ y build/ del repositorio,
//    que usa el piloto, no se tocan; el guion lo comprueba antes y después).
// 2. Ejecuta Playwright con tools/e2e/playwright.isolated.config.ts: servidores arrancados desde esa carpeta, red
//    exterior bloqueada y datos nuevos. Sale con el código de Playwright.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), work = join(repo, 'tests', '.tmp', 'e2e-build');
const args = process.argv.slice(2), build = !args.includes('--no-build'), filters = args.filter(a => a !== '--no-build');
const run = (command, list, options = {}) => { const r = spawnSync(command, list, { cwd: repo, stdio: 'inherit', shell: process.platform === 'win32', ...options }); if (r.status !== 0) process.exit(r.status ?? 1); };
const stamp = path => existsSync(path) ? statSync(path).mtimeMs : null;
const pilot = [join(repo, 'dist', 'index.html'), join(repo, 'build', 'server.mjs')], before = pilot.map(stamp);

if (build) {
  rmSync(work, { recursive: true, force: true }); mkdirSync(join(work, 'build'), { recursive: true });
  run('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(work, 'dist'), '--emptyOutDir', '--logLevel', 'warn']);
  const entries = { 'server/main.ts': 'server', 'server/runtime.ts': 'runtime', 'server/drill-worker.ts': 'drill' };
  for (const [entry, name] of Object.entries(entries)) run('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--outfile=' + join(work, 'build', name + '.mjs'), '--log-level=warning']);
} else if (!existsSync(join(work, 'build', 'server.mjs'))) { console.error('No hay compilación aislada: ejecuta sin --no-build.'); process.exit(2); }

if (pilot.map(stamp).some((value, i) => value !== before[i])) { console.error('dist/ o build/ del piloto cambiaron: se detiene.'); process.exit(3); }
const result = spawnSync('npx', ['playwright', 'test', '-c', 'tools/e2e/playwright.isolated.config.ts', ...filters], { cwd: repo, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
