import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Fastify from 'fastify';
import { createBaseApp } from '../server/app.js';
import { getLocalAuthorizationCapture } from '../server/security.js';

const headers = { host: '127.0.0.1:12300', origin: 'http://127.0.0.1:12300' };
const password = 'contraseña ficticia del arnés 214';
async function fixture(t: TestContext) {
  const { app, store, security } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  t.after(() => app.close());
  const establish = async (action: 'setup' | 'login') => {
    const response = await app.inject({ method: 'POST', url: '/api/v2/auth/' + action, headers, payload: { password } });
    assert.equal(response.statusCode, 200);
    assert.equal(typeof response.headers['set-cookie'], 'string');
    return String(response.headers['set-cookie']).split(';')[0];
  };
  const status = (cookie: string) => app.inject({ url: '/api/v2/auth/status', headers: { ...headers, cookie } });
  return { app, store, capture: security.captureAuthorization, establish, status };
}

test('bloquear la sesión original invalida su autorización sin afectar una sesión distinta', async t => {
  const f = await fixture(t);
  const first = await f.establish('setup'), other = await f.establish('login');
  const stillFirst = f.capture(first), stillOther = f.capture(other);
  assert.equal(stillFirst(), true);
  assert.equal(stillOther(), true);
  const response = await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { ...headers, cookie: first } });
  assert.equal(response.statusCode, 200);
  assert.equal((await f.status(first)).json().authenticated, false);
  assert.equal(stillFirst(), false);
  assert.equal(stillOther(), true);
  const replacement = await f.establish('login');
  assert.equal(f.capture(replacement)(), true);
  assert.equal(stillFirst(), false);
});

test('la comprobación durante un recorrido no amplía la caducidad por inactividad', async t => {
  const f = await fixture(t);
  const initial = Date.parse('2026-11-05T10:00:00Z');
  let now = initial;
  t.mock.method(Date, 'now', () => now);
  const cookie = await f.establish('setup'), authorized = f.capture(cookie);
  assert.equal(authorized(), true);
  now = initial + 29 * 60_000;
  assert.equal(authorized(), true);
  now = initial + 30 * 60_000 + 1;
  assert.equal(authorized(), false);
  assert.equal((await f.status(cookie)).json().authenticated, false);
});

test('activar la protección invalida la autorización anónima ya capturada', async t => {
  const f = await fixture(t);
  const anonymous = f.capture();
  assert.equal(anonymous(), true);
  const valid = await f.establish('setup');
  assert.equal(anonymous(), false);
  assert.equal(f.capture()(), false);
  assert.equal(f.capture('planb_session=' + '0'.repeat(64))(), false);
  assert.equal(f.capture(valid)(), true);
});

test('una lectura fallida de protección invalida de forma permanente la captura afectada', async t => {
  const f = await fixture(t);
  const cookie = await f.establish('setup'), original = f.capture(cookie);
  assert.equal(original(), true);
  const read = f.store.get.bind(f.store);
  const mock = t.mock.method(f.store, 'get', (key: string, fallback: unknown) => {
    if (key === 'password') throw new Error('lectura de prueba fallida');
    return read(key, fallback);
  });
  const failedAtStart = f.capture(cookie);
  assert.equal(failedAtStart(), false);
  assert.equal(original(), false);
  mock.mock.restore();
  assert.equal(original(), false);
  assert.equal(failedAtStart(), false);
  assert.equal(f.capture(cookie)(), true);
});

test('una solicitud sin sesión válida no adquiere permiso al iniciar sesión después', async t => {
  const f = await fixture(t);
  await f.establish('setup');
  const rejected = f.capture();
  assert.equal(rejected(), false);
  const valid = await f.establish('login');
  assert.equal(f.capture(valid)(), true);
  assert.equal(rejected(), false);
});

test('cerrar el almacén invalida también una autorización previamente vigente', async t => {
  const f = await fixture(t);
  const cookie = await f.establish('setup');
  const authorized = f.capture(cookie);
  assert.equal(authorized(), true);
  await f.app.close();
  assert.equal(authorized(), false);
  assert.equal(f.capture(cookie)(), false);
});

test('la captura de autorización exige que la instancia tenga registrado el guard', async t => {
  const bare = Fastify();
  t.after(() => bare.close());
  assert.throws(() => getLocalAuthorizationCapture(bare), { code: 'FST_ERR_DEC_UNDECLARED' });
});

test('una ruta protegida puede volver a comprobar su sesión sin renovarla ni compartirla con otra instancia', async t => {
  const f = await fixture(t), other = await fixture(t);
  const startedAt = Date.parse('2026-11-06T09:00:00Z');
  let now = startedAt;
  t.mock.method(Date, 'now', () => now);
  const capture = getLocalAuthorizationCapture(f.app);
  const fromOther = getLocalAuthorizationCapture(other.app);
  f.app.get('/api/authorization-fixture', async (request, reply) => {
    const authorized = capture(request.headers.cookie);
    assert.equal(authorized(), true);
    now = startedAt + 30 * 60_000 + 1;
    if (!authorized()) return reply.code(401).send({ error: 'Sesión de prueba vencida' });
    return { result: 'private-fixture' };
  });
  const first = await f.establish('setup'), second = await other.establish('setup');
  assert.equal(capture(first)(), true);
  assert.equal(fromOther(second)(), true);
  assert.equal(capture(second)(), false);
  assert.equal(fromOther(first)(), false);
  now = startedAt + 29 * 60_000;
  const response = await f.app.inject({ url: '/api/authorization-fixture', headers: { ...headers, cookie: first } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.body.includes('private-fixture'), false);
  assert.equal((await f.status(first)).json().authenticated, false);
});
