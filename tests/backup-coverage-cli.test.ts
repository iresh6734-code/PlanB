import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { encodePortable } from '../server/crypto.js';

const root = process.cwd(), cli = path.join(root, 'scripts/check-backup-coverage.ts');
function invoke(args: string[], input = '') {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^GOOGLE_|^HUBSPOT_|^OPENAI_|^ANTHROPIC_|^PLANB_|NODE_OPTIONS/i.test(key)));
  return spawnSync(process.execPath, ['--require', path.join(root, 'scripts/block-external.cjs'), '--import', 'tsx', cli, ...args], { cwd: root, env, input, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
}
function fixture() {
  const folder = path.join(root, 'tests/.tmp/coverage049-' + randomUUID()); fs.mkdirSync(folder, { recursive: true });
  const s = new Store(':memory:'), snap = makeFixture();
  s.importSnapshot(snap); s.saveGeneration(makeDemoSpec(snap), { provider: 'demo', model: null, generatedAt: '2026-10-30T08:00:00Z', prompt: '', approved: false }); s.activate();
  return { folder, store: s, write: (name: string, text: string) => { const target = path.join(folder, name); fs.writeFileSync(target, text, { flag: 'wx' }); return target; } };
}
const sha = (filename: string) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

test('CLI defaults to help and rejects implicit paths, repeated/unknown flags and password arguments safely', () => {
  assert.equal(invoke([]).status, 0); assert.match(invoke(['--help']).stdout, /referencia/);
  for (const args of [['--password', 'SECRET-ARGV-049'], ['--reference'], ['--reference', 'x'], ['--reference', 'x', '--reference', 'y', '--backup', 'z']]) {
    const result = invoke(args); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('SECRET-ARGV-049'));
  }
});

test('CLI compares explicit files, flags same file and preserves both input bytes', () => {
  const f = fixture();
  try {
    const reference = f.write('reference.json', JSON.stringify(f.store.bundle())), copy = f.write('copy.json', fs.readFileSync(reference, 'utf8'));
    const before = [sha(reference), sha(copy)], args = ['--reference', reference, '--backup', copy];
    const first = invoke(args); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).sameInputFile, false);
    const same = invoke(['--reference', reference, '--backup', reference]); assert.equal(same.status, 0); assert.equal(JSON.parse(same.stdout).sameInputFile, true);
    assert.deepEqual([sha(reference), sha(copy)], before); assert.deepEqual(fs.readdirSync(f.folder).sort(), ['copy.json', 'reference.json']);
  } finally { f.store.close(); }
});

test('CLI returns 1 when a valid backup does not cover the reference changes', () => {
  const f = fixture();
  try {
    const backup = f.write('old.json', JSON.stringify(f.store.bundle())); f.store.saveRecord('contacts', { phone: 'canary-cli-049' }, 'contact-1');
    const reference = f.write('reference.json', JSON.stringify(f.store.bundle())), result = invoke(['--reference', reference, '--backup', backup]);
    assert.equal(result.status, 1, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'missing-local-changes'); assert.equal(JSON.parse(result.stdout).missingLocalChanges, 1);
    assert.ok(!result.stdout.includes('canary-cli-049'));
  } finally { f.store.close(); }
});

test('CLI only accepts passwords by bounded stdin JSON and does not echo malformed inputs', () => {
  const f = fixture();
  try {
    const referencePassword = 'fiction-cli-reference-049', backupPassword = 'fiction-cli-backup-049', data = f.store.bundle();
    const reference = f.write('reference.json', encodePortable(data, referencePassword)), backup = f.write('backup.json', encodePortable(data, backupPassword));
    const args = ['--reference', reference, '--backup', backup, '--passwords-stdin'];
    const result = invoke(args, JSON.stringify({ reference: referencePassword, backup: backupPassword }));
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'matches-reference');
    assert.ok(!result.stdout.includes(referencePassword)); assert.ok(!result.stdout.includes(backupPassword));
    const wrong = invoke(args, JSON.stringify({ reference: referencePassword, backup: 'WRONG-SECRET-049' }));
    assert.equal(wrong.status, 1); assert.ok(!wrong.stdout.includes('WRONG-SECRET-049'));
    for (const input of ['SECRET-JSON-049', JSON.stringify({ unexpected: 'SECRET-JSON-049' }), JSON.stringify({ backup: 'x'.repeat(201) }), 'x'.repeat(4097), '[]']) {
      const failed = invoke(args, input); assert.equal(failed.status, 2); assert.equal(failed.stdout, ''); assert.ok(!failed.stderr.includes('SECRET-JSON-049'));
    }
  } finally { f.store.close(); }
});

test('CLI refuses missing, directory and oversized inputs without path disclosure or writing outputs', () => {
  const f = fixture();
  try {
    const reference = f.write('reference.json', JSON.stringify(f.store.bundle())), oversized = f.write('oversized.json', '{}');
    fs.truncateSync(oversized, 32 * 1024 * 1024 + 1);
    for (const backup of [path.join(f.folder, 'PRIVATE-PATH-049'), f.folder, oversized]) {
      const result = invoke(['--reference', reference, '--backup', backup]); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes(f.folder));
    }
    assert.deepEqual(fs.readdirSync(f.folder).sort(), ['oversized.json', 'reference.json']);
  } finally { f.store.close(); }
});
