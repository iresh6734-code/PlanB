import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createBaseApp } from '../server/app.js';
import { readCheckRevision, registerHubspotReadCheckApi, storeReadCheckEvidence, type ReadCheckApiHandle, type ReadCheckConfig } from '../server/hubspot-read-check-api.js';
import { LIVE_MAX_BODY_BYTES } from '../server/hubspot-read-check-transport.js';
import { parseReadCheckApiState, READ_CHECK_ROUTE, type ReadCheckApiState } from '../shared/hubspot-read-check-api.js';

// Unidad 212. La API REGISTRADA sobre createBaseApp REAL (Store real, hooks de host/Origin/sesión reales, HTTP en 127.0.0.1) contra un PROVEEDOR FICTICIO de loopback.
// El fetch de proveedor se redirige de https://api.hubapi.com al servidor ficticio; todo lo demás es el servidor real de Plan B. NO es una comprobación real: no se llama a HubSpot
// ni se lee ninguna credencial; el portal 12345 es inventado. Un arnés con el módulo registrado acredita el contrato local, no el montaje en la factoría principal.
const TOKEN = 'pat-ficticio-9876543210-secreto', PORTAL = '12345', CANARY = 'canario-registro@ejemplo.invalid', T0 = Date.parse('2026-11-05T12:00:00.000Z');
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const ID = '/account-info/2026-09/details', O = (entity: string) => '/crm/objects/2026-09/' + entity, OBJECTS = ['contacts', 'companies', 'deals', 'tasks'];
interface Seen { method: string; path: string; authorization: string | undefined }
async function provider(routes: Record<string, Handler | undefined>) {
  const seen: Seen[] = [], sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => { seen.push({ method: req.method!, path: req.url!, authorization: req.headers.authorization }); (routes[new URL(req.url!, 'http://x').pathname] ?? routes['*'] ?? ((_q, r) => { r.statusCode = 404; r.end('{}'); }))(req, res); });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); const port = (server.address() as AddressInfo).port;
  return { seen, set: (next: Record<string, Handler | undefined>) => { for (const key of Object.keys(routes)) delete routes[key]; Object.assign(routes, next); },
    fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(String(input).replace('https://api.hubapi.com', 'http://127.0.0.1:' + port), init)) as typeof fetch,
    stop: () => new Promise<void>(ok => { for (const socket of sockets) socket.destroy(); server.close(() => ok()); }) };
}
const json = (body: unknown, code = 200): Handler => (_q, r) => { r.statusCode = code; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(body)); };
const status = (code: number, headers: Record<string, string> = {}): Handler => (_q, r) => { r.statusCode = code; for (const [k, v] of Object.entries(headers)) r.setHeader(k, v); r.end('{"detalle":"' + CANARY + '"}'); };
const identity = (type = 'SANDBOX', portalId: number = Number(PORTAL)) => json({ portalId, accountType: type, uiDomain: CANARY });
const objects = (over: Record<string, Handler | undefined> = {}) => Object.fromEntries(OBJECTS.map(e => [O(e), over[O(e)] ?? json({ results: [{ id: '1', properties: { email: CANARY } }] })]));
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function rig(routes: Record<string, Handler | undefined>, options: { password?: boolean; timeoutMs?: number; allowProduction?: boolean; config?: ReadCheckConfig | null; throwConfig?: boolean; authorization?: (cookie?: string) => () => boolean } = {}) {
  const prov = await provider(routes), { app, store, security } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  let config: ReadCheckConfig | null = options.config === undefined ? { token: TOKEN, accountId: PORTAL, mode: 'test' } : options.config, now = T0, throwConfig = !!options.throwConfig;
  const handle: ReadCheckApiHandle = registerHubspotReadCheckApi(app, { captureAuthorization: options.authorization ?? security.captureAuthorization, config: () => { if (throwConfig) throw new Error('LEER /ruta/interna/secreta con ' + TOKEN); return config; }, evidence: storeReadCheckEvidence(store), fetch: prov.fetch, now: () => now, timeoutMs: options.timeoutMs, allowProduction: options.allowProduction });
  await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port, host = base.replace('http://', '');
  let cookie = '';
  if (options.password) { const r = await fetch(base + '/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password: 'contraseña-ficticia-212' }) }); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; }
  const headers = (extra: Record<string, string> = {}) => ({ ...(cookie ? { Cookie: cookie } : {}), ...extra });
  const lock = async () => (await fetch(base + '/api/v2/auth/lock', { method: 'POST', headers: headers({ 'Content-Type': 'application/json', Origin: base }), body: '{}' })).status;
  const login = async () => { const r = await fetch(base + '/api/v2/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ password: 'contraseña-ficticia-212' }) }); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; return r.status; };
  const get = async () => { const r = await fetch(base + READ_CHECK_ROUTE, { headers: headers() }); return { code: r.status, text: await r.text() }; };
  const state = async () => { const r = await get(); return parseReadCheckApiState(JSON.parse(r.text)) as ReadCheckApiState; };
  const post = async (body: unknown = { portalId: PORTAL, authorizedReads: 5 }, extra: Record<string, string> = { Origin: base }) => { const r = await fetch(base + READ_CHECK_ROUTE, { method: 'POST', headers: headers({ 'Content-Type': 'application/json', ...extra }), body: JSON.stringify(body) }); const text = await r.text(); return { code: r.status, text, json: JSON.parse(text) as ReadCheckApiState }; };
  const cancel = async () => { const r = await fetch(base + READ_CHECK_ROUTE, { method: 'DELETE', headers: headers({ Origin: base }) }); return { code: r.status, json: await r.json() as ReadCheckApiState }; };
  return { app, store, prov, base, host, handle, get, state, post, cancel, lock, login, setConfig: (next: ReadCheckConfig | null) => { config = next; }, setNow: (value: number) => { now = value; }, setThrow: (value: boolean) => { throwConfig = value; }, close: async () => { await app.close(); await prov.stop(); } };
}
type Rig = Awaited<ReturnType<typeof rig>>;
const using = async (routes: Record<string, Handler | undefined>, fn: (r: Rig) => Promise<void>, options?: Parameters<typeof rig>[1]) => { const r = await rig(routes, options); try { await fn(r); } finally { await r.close(); } };
const FIVE = [ID, ...OBJECTS.map(e => O(e) + '?limit=1&properties=hs_object_id')];
const clean = (text: string) => { for (const secret of [TOKEN, CANARY, 'Bearer', 'authorization', 'uiDomain', 'ruta/interna']) assert.ok(!text.toLowerCase().includes(secret.toLowerCase()), 'la respuesta pública no contiene «' + secret + '»'); };

test('SIN CONFIGURACIÓN: GET y POST dan un resultado útil y NINGUNA petición al proveedor', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    const s = await r.state(); assert.equal(s.configured, false); assert.equal(s.view.state, 'not_configured'); assert.equal(s.portal, null); assert.equal(s.consent.allowed, false);
    const p = await r.post(); assert.equal(p.code, 409); assert.equal(p.json.issue, 'NOT_CONFIGURED'); assert.equal(r.prov.seen.length, 0);
  }, { config: null });
});

test('ABRIR/RECARGAR/CONSULTAR el resultado guardado (GET) = CERO tráfico al proveedor, aunque haya configuración y evidencia; solo la acción explícita lo genera', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    for (let i = 0; i < 5; i++) { const s = await r.state(); assert.equal(s.configured, true); assert.equal(s.view.state, 'saved_unchecked'); assert.equal(s.evidence, null); }
    assert.equal(r.prov.seen.length, 0, 'configuración guardada ≠ lectura comprobada: ni una petición al abrir');
    const p = await r.post(); assert.equal(p.code, 200); assert.equal(r.prov.seen.length, 5);
    for (let i = 0; i < 5; i++) await r.get(); assert.equal(r.prov.seen.length, 5, 'consultar lo guardado no repite lecturas');
  });
});

test('POST feliz: 5 GET exactos (identidad y luego cuatro objetos de un elemento), la credencial solo viaja en la cabecera al proveedor y la respuesta pública cumple el contrato y no filtra nada', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    const p = await r.post(); assert.equal(p.code, 200); assert.equal(p.json.started, true); clean(p.text);
    assert.deepEqual(r.prov.seen.map(x => x.method + ' ' + x.path), FIVE.map(x => 'GET ' + x)); assert.ok(r.prov.seen.every(x => x.authorization === 'Bearer ' + TOKEN));
    const s = await r.state(); assert.equal(s.view.state, 'read_verified'); assert.equal(s.view.fresh, true); assert.equal(s.evidence!.state, 'read_verified'); assert.equal(s.evidence!.portalId, PORTAL); assert.equal(s.evidence!.environment, 'rehearsal');
    assert.deepEqual(s.evidence!.objects.map(o => [o.entity, o.outcome]), OBJECTS.map(e => [e, 'readable'])); assert.equal(s.evidence!.requests, 5); assert.equal(s.evidence!.truncated, 0); assert.equal(s.evidence!.blocked, 0);
    assert.equal(s.invalidated, null); assert.equal(s.consent.writes, 0); assert.equal(s.consent.reads, 5);
    assert.deepEqual(Object.keys(s).sort(), ['configured', 'consent', 'evidence', 'format', 'invalidated', 'issue', 'message', 'portal', 'running', 'view']);   // lista blanca
    // lo guardado no lleva credencial: ni la clave interna del almacén
    clean(JSON.stringify(r.store.get('hubspotReadCheck', null)));
  });
});

test('DOBLE CLIC y SEGUNDA PESTAÑA: con la identidad retenida, la segunda solicitud recibe 202 «ya en curso», sin lecturas nuevas; al terminar hay exactamente cinco GET', async () => {
  const hold = gate(); let identityCalls = 0;
  await using({ [ID]: async (_q, res) => { identityCalls++; await hold.promise; identity()(_q, res); }, ...objects() }, async r => {
    const first = r.post(); await sleep(150);
    const [second, third] = await Promise.all([r.post(), r.post()]);
    for (const x of [second, third]) { assert.equal(x.code, 202); assert.equal(x.json.issue, 'ALREADY_RUNNING'); assert.equal(x.json.started, false); assert.ok(x.json.running); assert.equal(x.json.view.state, 'checking'); }
    assert.equal((await r.state()).view.state, 'checking', 'GET durante la comprobación: «comprobando», sin lecturas');
    assert.equal(identityCalls, 1); hold.release(); const done = await first; assert.equal(done.code, 200); assert.equal(r.prov.seen.length, 5, 'nunca diez lecturas');
    const again = await r.post(); assert.equal(again.code, 200); assert.equal(r.prov.seen.length, 10, 'una acción explícita NUEVA sí hace otra comprobación completa');
  });
});

test('IDENTIDAD RECHAZADA (401): un solo GET, «credencial rechazada», sin leer objetos; 403 de identidad y 500 también paran en uno; sin reintento', async () => {
  for (const [code, expected] of [[401, 'rejected'], [403, 'insufficient_permissions'], [500, 'unavailable']] as const) {
    await using({ [ID]: status(code, { 'retry-after': '30' }), ...objects() }, async r => {
      const p = await r.post(); assert.equal(p.code, 200); assert.equal(r.prov.seen.length, 1); assert.equal(p.json.evidence!.state, expected); assert.deepEqual(p.json.evidence!.objects, []); clean(p.text);
      assert.notEqual(p.json.view.state, 'read_verified'); await sleep(300); assert.equal(r.prov.seen.length, 1, 'sin reintento automático');
    });
  }
});

test('PORTAL DISTINTO / CUENTA NO DE ENSAYO: se detiene tras la identidad (1 GET) y la respuesta no revela el otro portal', async () => {
  for (const route of [identity('SANDBOX', 99999), identity('STANDARD'), identity('APP_DEVELOPER')]) {
    await using({ [ID]: route, ...objects() }, async r => {
      const p = await r.post(); assert.equal(r.prov.seen.length, 1); assert.ok(['identity_mismatch', 'account_type_mismatch'].includes(p.json.evidence!.state)); assert.ok(!p.text.includes('99999')); clean(p.text);
    });
  }
});

test('RESPUESTAS SUPERIORES A 64 KiB: en la identidad se detiene tras 1 GET sin entregar prefijo; en un objeto ese objeto queda «malformed» y se declara la respuesta truncada; el tope exacto se acepta', async () => {
  const pad = (value: object, bytes: number) => JSON.stringify(value).padEnd(bytes, ' ');
  const raw = (text: string): Handler => (_q, r) => { r.statusCode = 200; r.setHeader('content-type', 'application/json'); r.end(text); };
  await using({ [ID]: raw(pad({ portalId: 12345, accountType: 'SANDBOX' }, LIVE_MAX_BODY_BYTES) + 'SUFIJO_INVALIDO'), ...objects() }, async r => {
    const p = await r.post(); assert.equal(r.prov.seen.length, 1); assert.equal(p.json.evidence!.state, 'unavailable'); assert.equal(p.json.evidence!.truncated, 1); assert.notEqual(p.json.view.state, 'read_verified');
  });
  await using({ [ID]: identity(), ...objects({ [O('contacts')]: raw(pad({ results: [] }, LIVE_MAX_BODY_BYTES) + 'SUFIJO_INVALIDO') }) }, async r => {
    const p = await r.post(); assert.equal(r.prov.seen.length, 5); assert.equal(p.json.evidence!.state, 'partial'); assert.equal(p.json.evidence!.truncated, 1);
    assert.equal(p.json.evidence!.objects.find(o => o.entity === 'contacts')!.outcome, 'malformed'); assert.equal(p.json.evidence!.objects.filter(o => o.outcome === 'readable').length, 3);
  });
  await using({ [ID]: raw(pad({ portalId: 12345, accountType: 'SANDBOX' }, LIVE_MAX_BODY_BYTES)), ...objects({ [O('tasks')]: raw(pad({ results: [] }, LIVE_MAX_BODY_BYTES)) }) }, async r => {
    const p = await r.post(); assert.equal(p.json.evidence!.state, 'read_verified'); assert.equal(p.json.evidence!.truncated, 0);
  });
});

test('PERMISOS PARCIALES (403 en un objeto): «lectura parcial» con el detalle de lo que SÍ se leyó; no es conexión completa y ofrece volver a comprobar solo por decisión explícita', async () => {
  await using({ [ID]: identity(), ...objects({ [O('deals')]: status(403) }) }, async r => {
    const p = await r.post(); assert.equal(p.json.evidence!.state, 'partial'); assert.equal(p.json.view.state, 'partial'); assert.equal(p.json.evidence!.objects.find(o => o.entity === 'deals')!.outcome, 'forbidden');
    assert.deepEqual(p.json.evidence!.objects.filter(o => o.outcome === 'readable').map(o => o.entity), ['contacts', 'companies', 'tasks']); clean(p.text);
    assert.equal(r.prov.seen.length, 5); await sleep(200); assert.equal(r.prov.seen.length, 5);
  });
});

test('SESIÓN BLOQUEADA y ORIGEN: sin cookie 401; con cookie pero sin Origin o con Origin externo ⇒ 403; ninguna de esas solicitudes llega al proveedor', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    const noSession = await fetch(r.base + READ_CHECK_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: r.base }, body: JSON.stringify({ portalId: PORTAL, authorizedReads: 5 }) }); assert.equal(noSession.status, 401);
    assert.equal((await fetch(r.base + READ_CHECK_ROUTE)).status, 401, 'el GET también exige sesión');
    assert.equal((await r.post(undefined, {})).code, 403, 'sin Origin'); assert.equal((await r.post(undefined, { Origin: 'http://evil.example' })).code, 403, 'Origin externo'); assert.equal((await r.post(undefined, { Origin: 'https://' + r.host })).code, 403, 'otro esquema');
    assert.equal((await r.post(undefined, { Origin: 'http://localhost:1' })).code, 403, 'otro puerto');
    const ok = await r.post(); assert.equal(ok.code, 200); assert.equal(r.prov.seen.length, 5, 'solo la solicitud válida generó tráfico');
    const del = await fetch(r.base + READ_CHECK_ROUTE, { method: 'DELETE', headers: { Cookie: '' } }); assert.equal(del.status, 401);
  }, { password: true });
});

test('CONSENTIMIENTO: sin portalId/authorizedReads exactos, con campos de más o con OTRO portal ⇒ rechazo sin tráfico (el portal que autorizó la persona debe ser el configurado AHORA)', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    for (const body of [{}, { portalId: PORTAL }, { portalId: PORTAL, authorizedReads: 4 }, { portalId: PORTAL, authorizedReads: 5, token: 'x' }, { portalId: 'abc', authorizedReads: 5 }]) assert.equal((await r.post(body)).code, 422, JSON.stringify(body));
    const other = await r.post({ portalId: '99999', authorizedReads: 5 }); assert.equal(other.code, 409); assert.equal(other.json.issue, 'PORTAL_MISMATCH'); assert.equal(r.prov.seen.length, 0);
  });
});

test('CAMBIO DE CONFIGURACIÓN con la respuesta RETENIDA: no sale ninguna petición más, el resultado se DESCARTA (no se publica), la evidencia anterior pasa a historia y no acredita la configuración nueva', async () => {
  const hold = gate();
  await using({ [ID]: async (_q, res) => { await hold.promise; identity()(_q, res); }, ...objects() }, async r => {
    const pending = r.post(); await sleep(150); assert.equal(r.prov.seen.length, 1);
    r.setConfig({ token: 'pat-OTRA-credencial-1234567890', accountId: PORTAL, mode: 'test' });          // otra credencial, mismo portal
    assert.equal((await r.state()).view.state, 'saved_unchecked', 'mientras tanto el estado ya no es «comprobando» la configuración nueva');
    hold.release(); const done = await pending; assert.equal(done.code, 409); assert.equal(done.json.issue, 'CONFIG_CHANGED');
    assert.equal(r.prov.seen.length, 1, 'tras el cambio no se hizo ninguna lectura de objetos con la credencial antigua'); await sleep(200); assert.equal(r.prov.seen.length, 1);
    const s = await r.state(); assert.equal(s.evidence, null); assert.equal(s.view.state, 'saved_unchecked'); assert.equal(r.store.get('hubspotReadCheck', null), null, 'nada publicado');
  });
});

test('CAMBIO SILENCIOSO de configuración (nadie consulta el estado ni avisa): la puerta previa a CADA petición lo detecta; tras la identidad no sale ninguna lectura de objetos y nada se publica', async () => {
  const hold = gate();
  await using({ [ID]: async (_q, res) => { await hold.promise; identity()(_q, res); }, ...objects() }, async r => {
    const pending = r.post(); await sleep(150); assert.equal(r.prov.seen.length, 1);
    r.setConfig({ token: 'pat-OTRA-credencial-1234567890', accountId: '67890', mode: 'test' });          // sin GET, sin POST, sin invalidate(): solo cambia lo guardado
    hold.release(); const done = await pending; assert.equal(done.code, 409); assert.equal(done.json.issue, 'CONFIG_CHANGED');
    assert.equal(r.prov.seen.length, 1, 'la credencial antigua no se usa para leer objetos'); assert.equal(r.store.get('hubspotReadCheck', null), null);
  });
});

test('EVIDENCIA ANTERIOR + CAMBIO de credencial o de portal: pasa a «invalidada» (historia con su fecha), jamás acredita lo nuevo; volver a la configuración antigua NO la resucita como verificada de forma automática', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    assert.equal((await r.post()).code, 200); const before = await r.state(); assert.equal(before.view.state, 'read_verified');
    r.setConfig({ token: 'pat-credencial-nueva-1234567', accountId: PORTAL, mode: 'test' });
    let s = await r.state(); assert.equal(s.evidence, null); assert.equal(s.view.state, 'saved_unchecked'); assert.ok(s.invalidated); assert.equal(s.invalidated!.checkedAt, before.evidence!.checkedAt); assert.equal(s.invalidated!.portalId, PORTAL);
    r.setConfig({ token: TOKEN, accountId: '67890', mode: 'test' });                                       // otro portal
    s = await r.state(); assert.equal(s.evidence, null); assert.equal(s.portal!.id, '67890'); assert.notEqual(s.view.state, 'read_verified');
    r.setConfig({ token: TOKEN, accountId: PORTAL, mode: 'test' });                                          // misma credencial y portal que la comprobación: es la misma revisión
    s = await r.state(); assert.equal(s.view.state, 'read_verified', 'la revisión coincide de nuevo: es evidencia de ESA misma configuración (y sigue con su fecha)');
    assert.equal(readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test' }), readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test' }));
    assert.notEqual(readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test' }), readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test', version: '2' }), 'un sello nuevo del propietario invalida aunque la credencial no cambie');
  });
});

test('CADUCIDAD (15 min): pasado el plazo la vista vuelve a «configuración guardada · sin comprobar», conserva la fecha y el alcance de la última observación y no acredita acceso vigente', async () => {
  await using({ [ID]: identity(), ...objects({ [O('tasks')]: status(403) }) }, async r => {
    await r.post(); const fresh = await r.state(); assert.equal(fresh.view.fresh, true);
    r.setNow(T0 + 14 * 60_000); assert.equal((await r.state()).view.fresh, true);
    r.setNow(T0 + 15 * 60_000 + 1); const stale = await r.state();
    assert.equal(stale.view.state, 'saved_unchecked'); assert.equal(stale.view.fresh, false); assert.match(stale.view.detail, /caducó/);
    assert.equal(stale.evidence!.checkedAt, fresh.evidence!.checkedAt); assert.deepEqual(stale.evidence!.objects, fresh.evidence!.objects, 'conserva qué se leyó entonces'); assert.equal(r.prov.seen.length, 5, 'caducar no genera tráfico');
  });
});

test('ENDPOINT CAÍDO y RECUPERACIÓN: el fallo se declara «servicio no disponible» sin reintento automático; volver a comprobar es una acción explícita que sí puede recuperar', async () => {
  await using({ '*': status(503) }, async r => {
    const down = await r.post(); assert.equal(down.json.evidence!.state, 'unavailable'); assert.equal(r.prov.seen.length, 1); await sleep(300); assert.equal(r.prov.seen.length, 1);
    r.prov.set({ [ID]: identity(), ...objects() });
    assert.equal((await r.state()).view.state, 'unavailable', 'el estado no se recupera solo');
    const up = await r.post(); assert.equal(up.json.evidence!.state, 'read_verified'); assert.equal(r.prov.seen.length, 6);
  });
});

test('TIEMPO AGOTADO: un proveedor mudo cierra el recorrido dentro del plazo, queda «sin respuesta útil», la ranura se libera y la siguiente acción explícita funciona', async () => {
  await using({ '*': () => { /* nunca responde */ } }, async r => {
    const t = Date.now(), p = await r.post(); assert.ok(Date.now() - t < 6000); assert.equal(p.json.evidence!.state, 'unavailable'); assert.equal(p.json.evidence!.accountType, null); assert.equal(r.prov.seen.length, 1);
    assert.equal(r.handle.running(), false); assert.equal((await r.state()).running, null);
    r.prov.set({ [ID]: identity(), ...objects() }); assert.equal((await r.post()).json.evidence!.state, 'read_verified');
  }, { timeoutMs: 1000 });
});

test('CANCELAR (DELETE): aborta la comprobación en curso, descarta su resultado y libera la ranura; sin Origin válido no cancela', async () => {
  const hold = gate();
  await using({ [ID]: async (_q, res) => { await hold.promise; identity()(_q, res); }, ...objects() }, async r => {
    const pending = r.post(); await sleep(150);
    assert.equal((await fetch(r.base + READ_CHECK_ROUTE, { method: 'DELETE' })).status, 403); assert.ok((await r.state()).running, 'un DELETE sin Origin no cancela');
    const c = await r.cancel(); assert.equal(c.code, 200); const done = await pending; assert.equal(done.code, 409); assert.equal(done.json.issue, 'CANCELLED');
    hold.release(); await sleep(200); assert.equal(r.prov.seen.length, 1); assert.equal((await r.state()).evidence, null);
    assert.equal(r.handle.cancel(), false, 'nada que cancelar');
  });
});

test('PRODUCCIÓN: una conexión de producción se rechaza SIN tráfico (esta API solo comprueba cuentas de ensayo salvo decisión expresa)', async () => {
  await using({ [ID]: identity('STANDARD'), ...objects() }, async r => {
    const s = await r.state(); assert.equal(s.portal!.mode, 'production'); assert.equal(s.consent.allowed, false); assert.ok(s.consent.reason);
    const p = await r.post(); assert.equal(p.code, 403); assert.equal(p.json.issue, 'PRODUCTION_NOT_AUTHORIZED'); assert.equal(r.prov.seen.length, 0);
  }, { config: { token: TOKEN, accountId: PORTAL, mode: 'production_readonly' } });
});

test('CONFIGURACIÓN ILEGIBLE: el error (con ruta y credencial dentro) no sale en ninguna respuesta, no hay tráfico y se recupera al poder leerla', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    r.setThrow(true); const g = await r.get(); assert.equal(g.code, 200); clean(g.text); const s = parseReadCheckApiState(JSON.parse(g.text))!; assert.equal(s.issue, 'CONFIG_UNREADABLE'); assert.equal(s.view.label, 'Configuración no legible');
    const p = await r.post(); assert.equal(p.code, 503); clean(p.text); assert.equal(r.prov.seen.length, 0);
    r.setThrow(false); assert.equal((await r.post()).code, 200);
  });
});

test('EVIDENCIA GUARDADA ILEGIBLE o con credencial de más: el servicio lo declara (EVIDENCE_UNREADABLE) sin acreditar nada y sin tráfico', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    r.store.set('hubspotReadCheck', { format: 'planb-hubspot-read-check-stored-v1', configRevision: 'x', evidence: { token: TOKEN } });
    const s = await r.state(); assert.equal(s.issue, 'EVIDENCE_UNREADABLE'); assert.equal(s.evidence, null); assert.notEqual(s.view.state, 'read_verified'); assert.equal(r.prov.seen.length, 0);
  });
});

test('invalidate(): una llamada del propietario de la configuración aborta lo que esté en vuelo y su resultado no se publica', async () => {
  const hold = gate();
  await using({ [ID]: async (_q, res) => { await hold.promise; identity()(_q, res); }, ...objects() }, async r => {
    const pending = r.post(); await sleep(150); r.handle.invalidate(); hold.release(); const done = await pending;
    assert.equal(done.code, 409); assert.equal(done.json.issue, 'CONFIG_CHANGED'); assert.equal(r.prov.seen.length, 1); assert.equal(r.store.get('hubspotReadCheck', null), null);
  });
});

// ── R2 (dictamen independiente de 212) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const nothingPublished = (r: Rig) => assert.equal(r.store.get('hubspotReadCheck', null), null, 'nada publicado');

test('R2·F1 REVOCAR LA SESIÓN con la identidad retenida: no salen las lecturas de objetos, no se publica nada y la respuesta de la sesión revocada no expone evidencia (401)', async () => {
  const entered = gate(), release = gate();
  await using({ [ID]: async (_q, res) => { entered.release(); await release.promise; identity()(_q, res); }, ...objects() }, async r => {
    const started = r.post(); await entered.promise;
    assert.equal(await r.lock(), 200); assert.equal((await r.get()).code, 401, 'el servidor ya revocó la sesión original');
    release.release(); const done = await started;
    assert.equal(done.code, 401); assert.ok(!/read_verified|evidence|objects|portal/i.test(done.text), 'la respuesta de la sesión revocada no lleva estado ni evidencia'); clean(done.text);
    await sleep(300); assert.deepEqual(r.prov.seen.map(x => x.path), [ID], 'ninguna lectura adicional tras revocar'); nothingPublished(r);
  }, { password: true });
});

test('R2·F1 REVOCAR antes de PUBLICAR la última respuesta: se leyeron las cinco, pero no se persiste ni se devuelve el resultado; desbloquear con una sesión NUEVA no reactiva el recorrido antiguo', async () => {
  const lastEntered = gate(), lastRelease = gate();
  await using({ [ID]: identity(), ...objects({ [O('tasks')]: async (_q, res) => { lastEntered.release(); await lastRelease.promise; json({ results: [] })(_q, res); } }) }, async r => {
    const started = r.post(); await lastEntered.promise; assert.equal(r.prov.seen.length, 5);
    assert.equal(await r.lock(), 200); lastRelease.release(); const done = await started;
    assert.equal(done.code, 401); assert.ok(!/read_verified|objects/i.test(done.text)); nothingPublished(r);
    assert.equal(await r.login(), 200); const s = await r.state(); assert.equal(s.evidence, null, 'la sesión nueva no recibe el resultado del recorrido antiguo'); assert.equal(s.running, null); nothingPublished(r); assert.equal(r.prov.seen.length, 5);
  }, { password: true });
});

test('R2·F1 una SEGUNDA sesión que se une a una comprobación en curso no hereda el resultado si la primera se revoca; sus POST propios siguen su propia autorización', async () => {
  const entered = gate(), release = gate();
  await using({ [ID]: async (_q, res) => { entered.release(); await release.promise; identity()(_q, res); }, ...objects() }, async r => {
    const first = r.post(); await entered.promise; const second = await r.post(); assert.equal(second.code, 202);
    assert.equal(await r.lock(), 200); release.release(); assert.equal((await first).code, 401); await sleep(300); assert.equal(r.prov.seen.length, 1); nothingPublished(r);
    assert.equal(await r.login(), 200); const retry = await r.post(); assert.equal(retry.code, 200); assert.equal(r.prov.seen.length, 6, 'una acción explícita nueva de la sesión nueva sí comprueba');
  }, { password: true });
});

test('R2·F1 la dependencia de autorización es OBLIGATORIA y falla CERRADO: sin ella no se registra; si lanza o devuelve false no hay tráfico y se responde 401', async () => {
  const { app } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try { assert.throws(() => registerHubspotReadCheckApi(app, { config: () => null, evidence: { load: () => null, save: () => undefined } } as unknown as Parameters<typeof registerHubspotReadCheckApi>[1]), /captureAuthorization es obligatoria/); } finally { await app.close(); }
  for (const authorization of [() => { throw new Error('boom ' + TOKEN); }, () => () => false, () => () => { throw new Error('x'); }, () => (() => 'yes') as unknown as () => boolean]) {
    await using({ [ID]: identity(), ...objects() }, async r => { const p = await r.post(); assert.equal(p.code, 401); clean(p.text); assert.equal(r.prov.seen.length, 0); }, { authorization });
  }
});

const validEvidence = (over: Record<string, unknown> = {}) => ({
  checkedAt: new Date(T0 - 1000).toISOString(), freshUntil: new Date(T0 + 899_000).toISOString(), state: 'read_verified', environment: 'rehearsal', accountType: 'SANDBOX', portalId: PORTAL,
  objects: OBJECTS.map(entity => ({ entity, outcome: 'readable', httpStatus: 200 })), retryAfterSeconds: null, requests: 5, truncated: 0, blocked: 0, durationMs: 1000, message: 'Respuesta ficticia de comprobación.', ...over,
});
const seed = (r: Rig, evidence: unknown, revision = readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test' })) => r.store.set('hubspotReadCheck', { format: 'planb-hubspot-read-check-stored-v1', configRevision: revision, evidence });

test('R2·F2/F3 EVIDENCIA INCOHERENTE no se acredita: otro portal, otro entorno, cero peticiones, objetos que faltan o repetidos, positiva con objeto no legible o truncada, ventana distinta de 15 min y observación FUTURA; cada una se declara «inconsistente» (≠ falta de evidencia) y no genera tráfico', async () => {
  const variants: [string, Record<string, unknown>][] = [
    ['otro portal', { portalId: '98765' }], ['otro entorno', { environment: 'real' }], ['cero peticiones y sin objetos', { requests: 0, objects: [] }], ['cuatro peticiones', { requests: 4 }], ['falta un objeto', { objects: validEvidence().objects.slice(0, 3) }],
    ['objeto repetido', { objects: [...validEvidence().objects.slice(0, 3), validEvidence().objects[0]] }], ['positiva con un objeto prohibido', { objects: validEvidence().objects.map((o, i) => i === 2 ? { ...o, outcome: 'forbidden', httpStatus: 403 } : o) }],
    ['positiva con respuesta truncada', { truncated: 1 }], ['positiva con petición bloqueada', { blocked: 1 }], ['ventana de una hora', { freshUntil: new Date(T0 + 3_599_000).toISOString() }], ['ventana de un minuto', { freshUntil: new Date(T0 - 940_000).toISOString() }],
    ['observación futura', { checkedAt: new Date(T0 + 3_600_000).toISOString(), freshUntil: new Date(T0 + 4_500_000).toISOString() }], ['sin tipo de cuenta', { accountType: null }], ['parcial sin ningún objeto legible', { state: 'partial', objects: validEvidence().objects.map(o => ({ ...o, outcome: 'forbidden', httpStatus: 403 })) }],
  ];
  for (const [name, change] of variants) await using({ [ID]: identity(), ...objects() }, async r => {
    seed(r, validEvidence(change)); const s = await r.state();
    assert.notEqual(s.view.state, 'read_verified', name); assert.equal(s.view.fresh, false, name); assert.equal(s.evidence, null, name); assert.equal(s.issue, 'EVIDENCE_INCONSISTENT', name); assert.equal(s.invalidated, null, name + ': no es historia de otra revisión, es evidencia malformada'); assert.equal(r.prov.seen.length, 0, name);
  });
});

test('R2·F2 CONTROLES válidos: la positiva exacta, una parcial coherente y una de otro estado se sirven; la positiva caducada conserva fecha; el historial de OTRA revisión sigue siendo historia válida; y malformada ≠ ausente', async () => {
  await using({ [ID]: identity(), ...objects() }, async r => {
    seed(r, validEvidence()); let s = await r.state(); assert.equal(s.view.state, 'read_verified'); assert.equal(s.view.fresh, true); assert.equal(s.issue, null); assert.ok(s.evidence);
    seed(r, validEvidence({ state: 'partial', objects: validEvidence().objects.map((o, i) => i === 1 ? { ...o, outcome: 'forbidden', httpStatus: 403 } : o) })); s = await r.state(); assert.equal(s.view.state, 'partial'); assert.equal(s.issue, null);
    seed(r, validEvidence({ state: 'rejected', requests: 1, objects: [], accountType: null, portalId: null, environment: 'unknown' })); s = await r.state(); assert.equal(s.evidence!.state, 'rejected'); assert.equal(s.issue, null);
    seed(r, validEvidence()); r.setNow(T0 + 20 * 60_000); s = await r.state(); assert.equal(s.view.fresh, false); assert.equal(s.view.state, 'saved_unchecked'); assert.equal(s.evidence!.checkedAt, validEvidence().checkedAt); assert.equal(s.issue, null, 'caducada pero coherente');
    r.setNow(T0); seed(r, validEvidence(), 'f'.repeat(64)); s = await r.state(); assert.equal(s.evidence, null); assert.ok(s.invalidated); assert.equal(s.invalidated!.portalId, PORTAL); assert.equal(s.issue, null, 'historia válida de otra revisión');
    r.store.set('hubspotReadCheck', { format: 'planb-hubspot-read-check-stored-v1', configRevision: readCheckRevision({ token: TOKEN, accountId: PORTAL, mode: 'test' }), evidence: { basura: true } }); s = await r.state(); assert.equal(s.issue, 'EVIDENCE_UNREADABLE'); assert.equal(s.evidence, null);
    r.store.set('hubspotReadCheck', null); s = await r.state(); assert.equal(s.issue, null); assert.equal(s.evidence, null); assert.equal(s.view.state, 'saved_unchecked', 'ausente: sin incidencia');
  });
});

test('R2·F4 RETRY-AFTER inesperado: 0.4, 0, -5, no numérico y enorme se normalizan; el registro escrito SIEMPRE se lee con el contrato público; un solo GET, cero reintentos; el valor válido de control se conserva', async () => {
  for (const [header, expected] of [['0.4', null], ['0', null], ['-5', null], ['abc', null], ['99999', 3600], ['30', 30], ['2.2', 2]] as const) {
    await using({ [ID]: status(429, { 'retry-after': header }), ...objects() }, async r => {
      const p = await r.post(); assert.equal(p.code, 200, header); assert.equal(p.json.issue, null, header); assert.equal(r.prov.seen.length, 1, header); await sleep(100); assert.equal(r.prov.seen.length, 1, 'sin reintento');
      assert.equal(p.json.evidence!.state, 'unavailable'); assert.equal(p.json.evidence!.retryAfterSeconds, expected, 'Retry-After ' + header);
      const next = parseReadCheckApiState(JSON.parse((await r.get()).text)); assert.ok(next && next.evidence && next.evidence.retryAfterSeconds === expected && next.issue === null, 'el registro escrito se lee con el contrato público');
    });
  }
});
