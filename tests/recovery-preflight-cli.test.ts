import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { Store } from '../server/store.js';
import { encodePortable } from '../server/crypto.js';

const parent = resolve('tests/.tmp'); fs.mkdirSync(parent, { recursive: true });
const folder = fs.mkdtempSync(join(parent, 'backup041-cli-')), password = 'solo-fixture-cli041-2026';
const store = new Store(':memory:'), snapshot = makeFixture(); store.importSnapshot(snapshot);
store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
const data = store.bundle(); store.close();
const plain = join(folder, 'plain.json'), encrypted = join(folder, 'encrypted.json');
fs.writeFileSync(plain, JSON.stringify(data)); fs.writeFileSync(encrypted, encodePortable(data, password));
after(() => { for (const file of [plain, encrypted]) fs.unlinkSync(file); fs.rmdirSync(folder); });
const run = (args: string[], input = '') => spawnSync(process.execPath, ['--require', './scripts/block-external.cjs', '--import', 'tsx', 'scripts/check-recovery-copy.ts', ...args], { encoding: 'utf8', windowsHide: true, input, timeout: 30_000 });

test('default CLI only displays help and requires an explicit file', () => {
  const result = run([]); assert.equal(result.status, 0); assert.match(result.stdout, /Sin --file solo muestra esta ayuda/);
});
test('plain fictitious file is inspected without modifying its bytes', () => {
  const before = fs.readFileSync(plain); const result = run(['--file', plain]);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'valid'); assert.deepEqual(fs.readFileSync(plain), before);
});
test('encrypted file consumes password from stdin and never echoes it', () => {
  const result = run(['--file', encrypted, '--password-stdin'], password + '\n');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).encrypted, true);
  assert.ok(!(result.stdout + result.stderr).includes(password));
});
test('wrong password and mismatched target give code 1 with safe structured results', () => {
  const wrong = run(['--file', encrypted, '--password-stdin'], 'wrong-fixture-password\n');
  assert.equal(wrong.status, 1); assert.equal(JSON.parse(wrong.stdout).issues[0].code, 'DECRYPT_FAILED');
  const target = run(['--file', plain, '--account', 'other-portal', '--data', 'test']);
  assert.equal(target.status, 1); assert.equal(JSON.parse(target.stdout).status, 'incompatible');
});
test('password arguments, repeated flags, missing files and incomplete targets fail without reflecting values', () => {
  for (const args of [
    ['--file', plain, '--password', 'PRIVATE-ARG-CANARY'], ['--file', plain, '--file', plain],
    ['--file', join(folder, 'missing.json')], ['--file', plain, '--account', 'demo'], ['--file', folder],
  ]) { const result = run(args); assert.equal(result.status, 2); assert.ok(!result.stderr.includes('PRIVATE-ARG-CANARY')); assert.ok(!result.stderr.includes(folder)); }
});
