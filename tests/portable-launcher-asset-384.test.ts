import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { createBaseApp } from '../server/app.js';
import { runtimeZip } from '../server/exporter.js';
import { bundleRevision, confirmRecoveryCopy, recoveryCopyStatus, rememberExport } from '../server/recovery-copy.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'planb-launcher-asset-384-'));
  mkdirSync(path.join(root, 'dist'));
  mkdirSync(path.join(root, 'runtime-assets', 'node_modules'), { recursive: true });
  writeFileSync(path.join(root, 'runtime.mjs'), '// runtime ficticio');
  writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>Plan B de ensayo</title>');
  return root;
}

function prepare(store: Store) {
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), {
    provider: 'demo', model: null, prompt: '', generatedAt: snapshot.capturedAt, approved: false,
  });
  store.activate();
  return store.bundle();
}

// Read an exact entry through the central directory of these small, non-ZIP64 test archives.
function zipEntry(zip: Buffer, name: string): Buffer | undefined {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  let offset = zip.readUInt32LE(end + 16);
  for (let remaining = zip.readUInt16LE(end + 10); remaining > 0; remaining--) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const nameLength = zip.readUInt16LE(offset + 28);
    const filename = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (filename === name) {
      const local = zip.readUInt32LE(offset + 42);
      assert.equal(zip.readUInt32LE(local), 0x04034b50);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
      const compression = zip.readUInt16LE(offset + 10);
      if (compression === 0) return data;
      assert.equal(compression, 8);
      return inflateRawSync(data);
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
}

test('384 · la API no adjunta un ZIP sin iniciador ni cambia una custodia confirmada', async t => {
  const root = fixtureRoot();
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root, staticDir: path.join(root, 'dist') });
  t.after(() => app.close());
  const bundle = prepare(store);
  const revision = bundleRevision(bundle);
  rememberExport(store, bundle, 'copia anterior ficticia');
  confirmRecoveryCopy(store, revision);
  const before = structuredClone(recoveryCopyStatus(store));
  assert.equal(before?.current, true);
  assert.ok(before?.confirmedAt);

  const reply = await app.inject({
    method: 'POST', url: '/api/v2/export/package', payload: { password: 'copia-ficticia-384', revision },
  });
  assert.equal(reply.statusCode, 503);
  assert.match(reply.json().error, /iniciador launch\.cjs/);
  assert.equal(reply.headers['content-disposition'], undefined);
  const legacy = await app.inject({ url: '/api/export/package' });
  assert.equal(legacy.statusCode, 503);
  assert.equal(legacy.headers['content-disposition'], undefined);
  assert.deepEqual(recoveryCopyStatus(store), before);
});

test('384 · el ZIP incluye el iniciador exacto de la distribución o de scripts', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const bundle = prepare(store);
  const root = fixtureRoot();
  const nodeFixture = path.join(root, 'fixture-node.exe');
  const header = Buffer.alloc(68);
  header.write('MZ');
  header.writeUInt32LE(64, 60);
  header.write('PE\0\0', 64);
  writeFileSync(nodeFixture, header);

  mkdirSync(path.join(root, 'scripts'));
  writeFileSync(path.join(root, 'scripts', 'launch.cjs'), '// iniciador de desarrollo');
  writeFileSync(path.join(root, 'launch.cjs'), '// iniciador de distribución');
  const packaged = await runtimeZip(bundle, root, undefined, nodeFixture);
  assert.equal(zipEntry(packaged, 'launch.cjs')?.toString(), '// iniciador de distribución');
  assert.match(zipEntry(packaged, 'ABRIR PLAN B.cmd')?.toString() ?? '', /launch\.cjs runtime\.mjs/);

  writeFileSync(path.join(root, 'launch.cjs'), '');
  const fallback = await runtimeZip(bundle, root, undefined, nodeFixture);
  assert.equal(zipEntry(fallback, 'launch.cjs')?.toString(), '// iniciador de desarrollo');
});
