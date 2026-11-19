import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { candidateSourceSelection } from '../scripts/prepare-release-candidate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'tests/.tmp');
function fixture(t) {
  fs.mkdirSync(base, { recursive: true });
  const folder = fs.mkdtempSync(path.join(base, 'font423-'));
  t.after(() => {
    assert.ok(path.resolve(folder).startsWith(path.resolve(base) + path.sep));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const source = path.join(folder, 'original');
  const put = (name, bytes) => { const p = path.join(source, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
  put('package.json', '{"type":"module"}');
  put('tsconfig.json', '{}');
  put('vite.config.ts', 'export default {};');
  put('playwright.config.ts', 'export default {};');
  put('index.html', '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>');
  put('src/main.ts', 'import "./font.css";document.body.textContent="Fuente local";');
  put('src/font.css', '@font-face{font-family:Local;src:url("./assets/fonts/local.woff2") format("woff2")}body{font-family:Local}');
  const font = fs.readFileSync(path.join(root, 'src/assets/fonts/inter-latin-var.woff2'));
  assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2');
  put('src/assets/fonts/local.woff2', font);
  put('src/assets/fonts/OFL.txt', 'Aviso de prueba de captura, no licencia de sustitución.');
  return { source, folder, put, font };
}

test('423 · captura activos binarios y avisos de src/assets, conservando las exclusiones privadas', t => {
  const f = fixture(t);
  f.put('src/assets/icon.PNG', Buffer.from([0, 255, 1]));
  f.put('src/assets/.private', 'canario que no se captura');
  f.put('src/assets/data/secret.txt', 'canario que no se captura');
  f.put('src/notes.txt', 'auxiliar fuera de assets');
  const selection = candidateSourceSelection(f.source);
  for (const file of ['src/assets/fonts/local.woff2', 'src/assets/fonts/OFL.txt', 'src/assets/icon.PNG']) assert.ok(selection.files.includes(file), file);
  assert.ok(!selection.files.includes('src/assets/.private'));
  assert.ok(!selection.files.includes('src/assets/data/secret.txt'));
  assert.ok(!selection.files.includes('src/notes.txt'));
  assert.ok(selection.excludedPaths.some(e => e.path === 'src/notes.txt' && e.reason === 'unlisted-extension'));
});

test('423 · Vite sobre la captura emite el WOFF2 real, sin dejar la URL original sin resolver', t => {
  const f = fixture(t), captured = path.join(f.folder, 'captured'), output = path.join(f.folder, 'dist');
  for (const file of candidateSourceSelection(f.source).files) {
    const dest = path.join(captured, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(f.source, file), dest);
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp'].includes(key.toLowerCase())));
  const run = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', path.join(captured, 'vite.config.ts'), '--outDir', output],
    { cwd: captured, env, encoding: 'utf8', timeout: 60_000, windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const assets = fs.readdirSync(path.join(output, 'assets'));
  const emitted = assets.filter(name => name.endsWith('.woff2'));
  assert.equal(emitted.length, 1, 'La compilación no debe dar por completa una captura sin la fuente');
  assert.deepEqual(fs.readFileSync(path.join(output, 'assets', emitted[0])), f.font);
  const css = assets.filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(output, 'assets', name), 'utf8')).join('\n');
  assert.ok(css.includes('/assets/' + emitted[0]));
  assert.ok(!css.includes('./assets/fonts/local.woff2'));
  assert.doesNotMatch(run.stderr, /didn't resolve/);
});
