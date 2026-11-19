import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { localKey } from '../server/crypto.js';

// Con NODE_ENV=test (tests/setup-unit-env.cjs) ninguna carpeta llega a DPAPI/powershell.exe.
test('modo de pruebas: una carpeta nueva recibe una clave de pruebas, también en Windows', t => {
  const folder = mkdtempSync(join(tmpdir(), 'planb-key-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const key = localKey(folder);
  const stored = JSON.parse(readFileSync(join(folder, '.planb-key'), 'utf8'));
  assert.equal(stored.kind, 'test');
  assert.deepEqual(Buffer.from(stored.data, 'base64'), key);
  assert.equal(key.length, 32);
});

test('modo de pruebas: una carpeta protegida por Windows se rechaza sin abrir DPAPI', t => {
  const folder = mkdtempSync(join(tmpdir(), 'planb-key-dpapi-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(join(folder, '.planb-key'), JSON.stringify({ kind: 'dpapi', data: 'AAAA' }));
  assert.throws(() => localKey(folder), /modo de pruebas no abre esa protección/);
});
