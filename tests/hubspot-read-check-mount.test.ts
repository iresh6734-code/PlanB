import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { mountHubspotReadCheck } from '../server/hubspot-read-check-mount.js';
import { seal, localKey } from '../server/crypto.js';
import { READ_CHECK_ROUTE } from '../shared/hubspot-read-check-api.js';
import { readCheckRevision } from '../server/hubspot-read-check-api.js';

process.env.NODE_ENV = 'test';

const headers = { host: '127.0.0.1:12180', origin: 'http://127.0.0.1:12180' };
const accountId = '12345', token = 'fictitious-mount218-token';
const routes = ['/account-info/2026-09/details', ...['contacts', 'companies', 'deals', 'tasks'].map(name => '/crm/objects/2026-09/' + name)];

async function rig(t: TestContext) {
  const parent = resolve('tests/.tmp/mount218-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'case-'));
  writeFileSync(join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const { app, store, security } = await createBaseApp({ root, dbPath: join(root, 'planb.sqlite'), staticDir: join(root, 'no-assets') });
  t.after(() => app.close());
  const seen: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.hubapi.com');
    seen.push(url.pathname);
    return Response.json(url.pathname === routes[0] ? { portalId: accountId, accountType: 'SANDBOX' } : { results: [] });
  });
  store.set('jobs', [{ id: 'fictional-active-job', status: 'running', kind: 'capture' }]);
  const beforeJobs = JSON.stringify(store.get('jobs', []));
  const handle = mountHubspotReadCheck(app, store, security);
  assert.equal(JSON.stringify(store.get('jobs', [])), beforeJobs, 'montar la lectura no altera trabajos activos');
  const setConnection = (mode?: 'test' | 'production_readonly') => {
    const value = { accountId, token, ...(mode ? { mode } : {}) };
    const encrypted = seal(JSON.stringify(value), localKey(root));
    store.set('hubspotConnection', encrypted);
    return encrypted;
  };
  const setup = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fictitious mount218 password' } });
  assert.equal(setup.statusCode, 200);
  const auth = { ...headers, cookie: String(setup.headers['set-cookie']).split(';')[0] };
  const get = () => app.inject({ url: READ_CHECK_ROUTE, headers: auth });
  const post = () => app.inject({ method: 'POST', url: READ_CHECK_ROUTE, headers: auth, payload: { portalId: accountId, authorizedReads: 5 } });
  return { app, store, seen, handle, setConnection, get, post, auth };
}

test('montaje sin conexión: estado local sin tráfico ni cambios en trabajos', async t => {
  const r = await rig(t), response = await r.get();
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().configured, false);
  assert.deepEqual(r.seen, []);
  assert.equal((await r.post()).statusCode, 409);
  assert.deepEqual(r.seen, []);
});

test('la conexión cifrada heredada recibe el modo test y solo la acción explícita produce cinco GET', async t => {
  const r = await rig(t), encoded = r.setConnection();
  assert.equal((await r.get()).json().portal.id, accountId);
  assert.deepEqual(r.seen, []);
  const response = await r.post();
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().view.state, 'read_verified');
  assert.deepEqual(r.seen, routes);
  const revision = createHash('sha256').update(encoded).digest('hex');
  const stored = r.store.get<{ configRevision: string }>('hubspotReadCheck', {} as never);
  assert.equal(stored.configRevision, readCheckRevision({ token, accountId, mode: 'test', version: revision }));
  await r.get();
  assert.deepEqual(r.seen, routes);
});

test('volver a guardar la misma credencial invalida su evidencia anterior', async t => {
  const r = await rig(t), first = r.setConnection('test');
  assert.equal((await r.post()).json().view.state, 'read_verified');
  const second = r.setConnection('test');
  assert.notEqual(first, second);
  const response = await r.get(), state = response.json();
  assert.equal(state.view.fresh, false);
  assert.equal(state.evidence, null);
  assert.equal(state.invalidated.portalId, accountId);
  assert.deepEqual(r.seen, routes);
});

test('producción y configuración ilegible se rechazan sin consultar al proveedor', async t => {
  const r = await rig(t);
  r.setConnection('production_readonly');
  assert.equal((await r.post()).statusCode, 403);
  assert.deepEqual(r.seen, []);
  r.store.set('hubspotConnection', 'enc1:damaged-test-value');
  const response = await r.post();
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().issue, 'CONFIG_UNREADABLE');
  assert.deepEqual(r.seen, []);
  assert.equal(response.payload.includes(token), false);
});

