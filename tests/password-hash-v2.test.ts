// CLAUDE-PASSWORD-HASH-V2 · Contraseña local con parámetros versionados y actualización transparente del formato anterior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import Fastify from 'fastify';
import { CURRENT, hashPassword, verifyPassword } from '../server/password-hash.js';
import { registerSecurity } from '../server/security.js';
import { Store } from '../server/store.js';

const PASSWORD = 'contrasena-de-prueba-larga';
const legacy = (password: string) => { const salt = randomBytes(16); return { salt: salt.toString('base64'), hash: scryptSync(password, salt, 32).toString('base64') }; };

test('las contraseñas nuevas guardan versión y parámetros; se verifican y no piden actualización', () => {
  const stored = hashPassword(PASSWORD);
  assert.deepEqual([stored.v, stored.N, stored.r, stored.p], [CURRENT.v, CURRENT.N, CURRENT.r, CURRENT.p]);
  assert.deepEqual(verifyPassword(PASSWORD, stored), { ok: true, upgrade: false });
  assert.deepEqual(verifyPassword(PASSWORD + 'x', stored), { ok: false, upgrade: false });
  assert.notEqual(hashPassword(PASSWORD).salt, stored.salt, 'sal nueva en cada guardado');
});

test('el formato anterior se acepta y pide actualización solo si la contraseña es correcta', () => {
  const old = legacy(PASSWORD);
  assert.deepEqual(verifyPassword(PASSWORD, old), { ok: true, upgrade: true });
  assert.deepEqual(verifyPassword('otra-contrasena-distinta', old), { ok: false, upgrade: false });
});

test('solo se admiten los perfiles cerrados: nada dañado, alterado o de versión desconocida pasa ni lanza', () => {
  const good = hashPassword(PASSWORD), old = legacy(PASSWORD);
  const cases: [string, unknown][] = [
    ['nulo', null], ['sal corta', { salt: 'x', hash: good.hash }], ['hash corto', { ...good, hash: 'AAAA' }],
    ['N = 0', { ...good, N: 0 }], ['N enorme', { ...good, N: 2 ** 24 }], ['r negativo', { ...good, r: -1 }], ['p no entero', { ...good, p: 1.5 }],
    // CODEX-PASSWORD-REVIEW-393: parámetros enteros que scrypt rechaza (N no potencia de 2) y versión desconocida con la derivación correcta.
    ['N no potencia de 2', { ...good, N: 3 }], ['N alterado pero válido', { ...good, N: 16384 }], ['versión desconocida', { ...good, v: 3 }],
    ['anterior con campos extra', { ...old, N: 16384 }], ['campo de más', { ...good, extra: 1 }], ['base64 inválido', { ...good, salt: '¡¡¡¡' }],
  ];
  for (const [name, broken] of cases) assert.deepEqual(verifyPassword(PASSWORD, broken), { ok: false, upgrade: false }, name);
});

test('el endpoint de acceso responde 401, sin cookie ni escritura, ante un registro v2 dañado', async t => {
  const store = new Store(':memory:'), app = Fastify();
  app.setErrorHandler((error: Error & { status?: number }, _request, reply) => { reply.code(error.status ?? 500).send({ error: error.message }); });
  registerSecurity(app, store);
  t.after(async () => { await app.close(); store.close(); });
  const damaged = { ...hashPassword(PASSWORD), N: 3 };
  store.set('password', damaged);
  const response = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: PASSWORD } });
  assert.equal(response.statusCode, 401, response.body);
  assert.equal(response.headers['set-cookie'], undefined, 'sin sesión');
  assert.deepEqual(store.get('password', null), damaged, 'el registro queda intacto');
});

test('el desbloqueo real sustituye el formato anterior por el actual y sigue abriendo después', async t => {
  const store = new Store(':memory:'), app = Fastify();
  app.setErrorHandler((error: Error & { status?: number }, _request, reply) => { reply.code(error.status ?? 500).send({ error: error.message }); });
  registerSecurity(app, store);
  t.after(async () => { await app.close(); store.close(); });
  store.set('password', legacy(PASSWORD));
  const wrong = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: 'otra-contrasena-distinta' } });
  assert.equal(wrong.statusCode, 401);
  assert.equal(store.get<{ v?: number }>('password', {}).v, undefined, 'un intento fallido no toca nada');
  const ok = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: PASSWORD } });
  assert.equal(ok.statusCode, 200, ok.body);
  const upgraded = store.get<{ v?: number; N?: number }>('password', {});
  assert.equal(upgraded.v, CURRENT.v); assert.equal(upgraded.N, CURRENT.N);
  const again = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: PASSWORD } });
  assert.equal(again.statusCode, 200, 'con el formato nuevo sigue abriendo');
  const setupStore = new Store(':memory:'), setupApp = Fastify();
  registerSecurity(setupApp, setupStore);
  t.after(async () => { await setupApp.close(); setupStore.close(); });
  const setup = await setupApp.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: PASSWORD } });
  assert.equal(setup.statusCode, 200);
  assert.equal(setupStore.get<{ v?: number }>('password', {}).v, CURRENT.v, 'la configuración inicial ya guarda el formato actual');
});
