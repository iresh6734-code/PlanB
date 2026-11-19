import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Fastify from 'fastify';
import { publishEndpoint } from '../server/endpoint.js';
import { Store } from '../server/store.js';

function fixture(t: TestContext) {
  const parent = path.resolve('tests/.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'bound343-'));
  const file = path.join(root, '.endpoint.json');
  const instanceId = randomUUID();
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const store = new Store(path.join(root, 'planb.sqlite'));
  store.set('instanceId', instanceId);
  const app = Fastify();
  t.after(async () => {
    try { await app.close(); } finally { store.close(); }
  });
  return { app, file, instanceId, store };
}

test('343 · descubre el puerto asignado por el sistema al pedir 0', async t => {
  const { app, file, instanceId, store } = fixture(t);
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  publishEndpoint(app, store, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { pid: process.pid, url: origin, instanceId });
});

test('343 · conserva el recibo para un puerto conocido', async t => {
  const { app, file, instanceId, store } = fixture(t);
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  publishEndpoint(app, store, Number(new URL(origin).port));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { pid: process.pid, url: origin, instanceId });
});

test('343 · no anuncia un puerto si todavía no hay listener', t => {
  const { app, file, store } = fixture(t);
  assert.throws(() => publishEndpoint(app, store, 0), /escuchando/);
  assert.equal(fs.existsSync(file), false);
});
