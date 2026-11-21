import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEV_ONLY_FILES, isDevOnly } from '../scripts/dev-only-files.mjs';

// A0-L: el ensayo de recuperación escribe en tests/.tmp de la carpeta del código y no viaja en el kit ni en la entrega.
const repo = process.cwd();
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => { const full = path.join(dir, name); return statSync(full).isDirectory() ? walk(full) : [full]; });

test('A0-L: la lista existe entera y reconoce rutas absolutas y relativas, sin arrastrar vecinos', () => {
  for (const file of DEV_ONLY_FILES) assert.ok(existsSync(path.join(repo, file)), file);
  assert.equal(isDevOnly(repo, path.join(repo, 'server', 'recovery-rehearsal.ts')), true);
  assert.equal(isDevOnly(repo, 'server/recovery-rehearsal-worker.ts'), true);
  for (const kept of ['server', 'server/recovery.ts', 'server/relay-rehearsal-mount.ts', 'server/rescue-room.ts', 'scripts/rehearse-rescue-capsule.ts']) assert.equal(isDevOnly(repo, path.join(repo, kept)), false, kept);
});

test('A0-L: ningún código que viaja importa el ensayo, así que quitarlo no rompe el kit ni la entrega', () => {
  const shipped = ['server', 'shared', 'src'].flatMap(dir => walk(path.join(repo, dir))).filter(file => /\.(tsx?|mjs|cjs)$/.test(file) && !isDevOnly(repo, file));
  const importers = shipped.filter(file => /from\s+['"][^'"]*recovery-rehearsal(-worker)?(\.js|\.ts)?['"]|import\(\s*['"][^'"]*recovery-rehearsal/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(importers.map(file => path.relative(repo, file).split(path.sep).join('/')), []);
});
