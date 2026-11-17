import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const { workspacePaths, cleanEnvironment, matchesExisting, ensureWorkspace, CRM_ORIGIN, PILOT_ORIGIN } = require('../scripts/start-full-workspace.cjs');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

async function closeServer(server) {
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'planb-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime');
  const data = path.join(root, 'data');
  await Promise.all([mkdir(runtime), mkdir(data)]);
  return { runtime, data };
}

async function stopFixtureProcess(pid) {
  try { process.kill(pid, 'SIGKILL'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await delay(30);
  }
  throw new Error('El proceso de ensayo sigue activo.');
}

async function writeFixtureRuntime(runtime) {
  const lockFile = new URL('../server/instance.ts', import.meta.url).href;
  await writeFile(path.join(runtime, 'block-external.cjs'), '');
  await writeFile(path.join(runtime, 'server.mjs'), `
    import { createServer } from 'node:http';
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { setTimeout } from 'node:timers/promises';
    import { lockInstance } from ${JSON.stringify(lockFile)};
    const data = process.env.PLANB_DATA_DIR;
    const port = Number(process.env.PLANB_PORT);
    lockInstance(data);
    const instanceId = 'crm-fixture';
    const receipt = join(data, '.endpoint.json');
    await setTimeout(450);
    createServer((request, response) => {
      if (request.url === '/api/health') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ok: true, instanceId }));
      } else {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><title>Plan B de ensayo</title>');
      }
    }).listen(port, '127.0.0.1', async () => {
      writeFileSync(receipt, '{');
      await setTimeout(400);
      writeFileSync(receipt, JSON.stringify({ pid: process.pid, instanceId, url: 'http://127.0.0.1:' + port }));
    });
  `);
}

test('el arranque reutiliza la base CRM propia y separa su carpeta de ejecución', () => {
  const root = path.resolve('checkout-fixture'), paths = workspacePaths(root);
  assert.equal(paths.data, path.join(root, 'planb-local-ux-2026-10-27', 'data', 'local'));
  assert.equal(paths.runtime, path.join(root, 'planb-local-crm-completo-2026-10-29', 'runtime'));
  assert.notEqual(paths.data, paths.runtime);
  assert.equal(CRM_ORIGIN, 'http://127.0.0.1:4331');
  assert.equal(PILOT_ORIGIN, 'http://localhost:4334');
});
test('no hereda secretos, proveedores o configuración de otras instancias', () => {
  const env = { PATH: 'node-path', SystemRoot: 'system', TEMP: 'temp', PLANB_DATA_DIR: 'other', PLANB_TEAM_DEMO: '1', NODE_OPTIONS: '--require other', NODE_ENV: 'test', HUBSPOT_CLIENT_ID: 'private', GOOGLE_CLOUD_PROJECT: 'other', OPENAI_BASE_URL: 'other', ANTHROPIC_API_KEY: 'private', AWS_ACCESS_KEY_ID: 'private', DATABASE_URL: 'private', AUTH_TOKEN: 'private', AZURE_TENANT_ID: 'other' };
  assert.deepEqual(cleanEnvironment(env), { PATH: 'node-path', SystemRoot: 'system', TEMP: 'temp' });
  assert.equal(env.PLANB_TEAM_DEMO, '1');
});
test('no reutiliza un servicio ajeno, sin identidad o en otro origen', () => {
  const state = { ok: true, instanceId: 'crm-current' }, endpoint = { instanceId: 'crm-current', url: CRM_ORIGIN };
  assert(matchesExisting(state, endpoint));
  for (const [health, expected] of [[null, endpoint], [{ ok: false, instanceId: 'crm-current' }, endpoint], [{ ok: true }, endpoint], [state, null], [state, { ...endpoint, instanceId: 'other' }], [state, { ...endpoint, url: 'https://example.invalid' }], [{ ok: true, instanceId: '' }, { ...endpoint, instanceId: '' }]]) assert.equal(matchesExisting(health, expected), false);
});

test('espera el recibo completo, reutiliza el CRM y recupera el bloqueo tras un cierre forzado', async t => {
  const folders = await fixture(t);
  const reservation = createServer();
  const origin = await listen(reservation);
  await closeServer(reservation);
  await writeFixtureRuntime(folders.runtime);
  const endpoint = path.join(folders.data, '.endpoint.json');
  const lock = path.join(folders.data, '.instance');
  const options = { ...folders, origin, timeout: 8_000 };
  let activePid;
  try {
    const first = await ensureWorkspace(options);
    activePid = first.pid;
    assert.equal(first.reused, false);
    assert.equal(JSON.parse(await readFile(endpoint, 'utf8')).pid, activePid);
    assert.equal((await ensureWorkspace(options)).reused, true);
    assert.equal(Number(await readFile(lock, 'utf8')), activePid);
    await stopFixtureProcess(activePid);
    assert.equal(Number(await readFile(lock, 'utf8')), activePid);
    activePid = undefined;
    const restarted = await ensureWorkspace(options);
    activePid = restarted.pid;
    assert.equal(restarted.reused, false);
    assert.equal(JSON.parse(await readFile(endpoint, 'utf8')).pid, activePid);
    assert.equal(Number(await readFile(lock, 'utf8')), activePid);
  } finally {
    if (activePid) await stopFixtureProcess(activePid);
  }
});

test('una respuesta ajena en el puerto no provoca un arranque', async t => {
  const folders = await fixture(t);
  const server = createServer((request, response) => {
    response.writeHead(404).end('Otro servicio');
  });
  const origin = await listen(server);
  t.after(() => closeServer(server));
  await assert.rejects(ensureWorkspace({ ...folders, origin }), /no coincide con el recibo/);
  await assert.rejects(readFile(path.join(folders.runtime, 'crm.log')), { code: 'ENOENT' });
});

test('un puerto que acepta conexiones pero no atiende no provoca un segundo arranque', async t => {
  const folders = await fixture(t);
  const server = createServer(() => {});
  const origin = await listen(server);
  t.after(() => closeServer(server));
  await assert.rejects(ensureWorkspace({ ...folders, origin }), /no respondió a tiempo/);
  await assert.rejects(readFile(path.join(folders.runtime, 'crm.log')), { code: 'ENOENT' });
});

test('el recibo y la salud válidos no bastan si falta la portada', async t => {
  const folders = await fixture(t);
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      response.end(JSON.stringify({ ok: true, instanceId: 'crm-fixture' }));
    } else {
      response.writeHead(500).end('Error de portada');
    }
  });
  const origin = await listen(server);
  t.after(() => closeServer(server));
  await writeFile(path.join(folders.data, '.endpoint.json'), JSON.stringify({ origin, url: origin, instanceId: 'crm-fixture' }));
  await assert.rejects(ensureWorkspace({ ...folders, origin }), /su portada no está disponible/);
  await assert.rejects(readFile(path.join(folders.runtime, 'crm.log')), { code: 'ENOENT' });
});
