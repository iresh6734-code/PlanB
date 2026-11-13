import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { checkHubspotRead } from '../server/hubspot-read-check.js';
import { READ_CHECK_TTL_MS, viewOfReadCheck, type ReadCheckResult } from '../shared/hubspot-read-check.js';
// Comprobación de lectura de HubSpot contra un SERVIDOR HTTP FICTICIO local. Estas pruebas cubren el transporte y la clasificación de respuestas;
// NO son evidencia de una conexión real: no se llama a HubSpot, no se lee ninguna credencial y el «portal» 12345 es inventado.
const TOKEN = 'pat-ficticio-0123456789-secreto', PORTAL = '12345';
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
interface Fake { port: number; seen: { method: string; path: string; auth: string | undefined }[]; fetcher: typeof fetch; stop: () => Promise<void> }
async function fake(routes: Record<string, Handler | undefined>): Promise<Fake> {
  const seen: Fake['seen'] = [], sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname; seen.push({ method: req.method!, path: req.url!, auth: req.headers.authorization });
    (routes[path] ?? routes['*'] ?? ((_q, r) => { r.statusCode = 404; r.end('{}'); }))(req, res);
  });
  server.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); const port = (server.address() as AddressInfo).port;
  const fetcher = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(String(input).replace('https://api.hubapi.com', 'http://127.0.0.1:' + port), init)) as typeof fetch;
  return { port, seen, fetcher, stop: () => new Promise<void>(ok => { for (const s of sockets) s.destroy(); server.close(() => ok()); }) };
}
const json = (body: unknown, code = 200): Handler => (_q, r) => { r.statusCode = code; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(body)); };
const status = (code: number, headers: Record<string, string> = {}): Handler => (_q, r) => { r.statusCode = code; for (const [k, v] of Object.entries(headers)) r.setHeader(k, v); r.end('{}'); };
const identity = (type = 'STANDARD', portalId: number | string = Number(PORTAL)) => json({ portalId, accountType: type, timeZone: 'Europe/Madrid' });
const objects = (over: Record<string, Handler | undefined> = {}) => ({ '/crm/objects/2026-09/contacts': json({ results: [] }), '/crm/objects/2026-09/companies': json({ results: [] }), '/crm/objects/2026-09/deals': json({ results: [] }), '/crm/objects/2026-09/tasks': json({ results: [] }), ...over });
const prod = { token: TOKEN, accountId: PORTAL, mode: 'production_readonly' as const }, rehearsal = { token: TOKEN, accountId: PORTAL, mode: 'test' as const };
const NOW = Date.parse('2026-11-04T12:00:00.000Z'), clock = () => NOW;
const states = (r: ReadCheckResult) => r.objects.map(o => o.entity + ':' + o.outcome).join(' ');
const view = (r: ReadCheckResult | null, now: number, extra: { configured?: boolean; checking?: boolean } = {}) => viewOfReadCheck({ configured: extra.configured ?? true, checking: extra.checking, last: r, now });

test('cuenta real, todo legible: read_verified con respuesta del proveedor, entorno real, instante y caducidad; solo GET; la credencial viaja únicamente en la cabecera y no aparece en el resultado', async () => {
  const f = await fake({ '/account-info/2026-09/details': identity(), ...objects() });
  try {
    const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock });
    assert.deepEqual({ s: r.state, e: r.evidence, env: r.environment, a: r.accountId, t: r.accountType }, { s: 'read_verified', e: 'provider_response', env: 'real', a: PORTAL, t: 'STANDARD' });
    assert.equal(r.checkedAt, '2026-11-04T12:00:00.000Z'); assert.equal(Date.parse(r.freshUntil) - Date.parse(r.checkedAt), READ_CHECK_TTL_MS);
    assert.equal(states(r), 'contacts:readable companies:readable deals:readable tasks:readable');
    assert.ok(f.seen.every(x => x.method === 'GET'), 'solo lecturas'); assert.ok(f.seen.every(x => x.auth === 'Bearer ' + TOKEN)); assert.equal(f.seen.length, 5);
    assert.ok(!JSON.stringify(r).includes(TOKEN), 'sin secreto en el resultado');
    assert.equal(view(r, NOW + 60_000).label, 'Lectura comprobada · cuenta real');
  } finally { await f.stop(); }
});

test('cuenta de ENSAYO (DEVELOPER_TEST/SANDBOX) se distingue de una cuenta real y de la simulación local', async () => {
  for (const type of ['DEVELOPER_TEST', 'SANDBOX']) {
    const f = await fake({ '/account-info/2026-09/details': identity(type), ...objects() });
    try { const r = await checkHubspotRead(rehearsal, { fetcher: f.fetcher, now: clock }); assert.deepEqual({ s: r.state, env: r.environment }, { s: 'read_verified', env: 'rehearsal' }); assert.match(view(r, NOW).label, /cuenta de ensayo/); } finally { await f.stop(); }
  }
});

test('el modo y el tipo de cuenta deben coincidir: STANDARD con modo ensayo y SANDBOX/APP_DEVELOPER con modo real ⇒ account_type_mismatch, sin leer objetos', async () => {
  for (const [conn, type] of [[rehearsal, 'STANDARD'], [prod, 'SANDBOX'], [prod, 'APP_DEVELOPER']] as const) {
    const f = await fake({ '/account-info/2026-09/details': identity(type), ...objects() });
    try { const r = await checkHubspotRead(conn, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'account_type_mismatch'); assert.equal(f.seen.length, 1, 'no se leyó ningún objeto'); } finally { await f.stop(); }
  }
});

test('portal distinto ⇒ identity_mismatch; el identificador de la OTRA cuenta no se devuelve', async () => {
  const f = await fake({ '/account-info/2026-09/details': identity('STANDARD', 99999), ...objects() });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'identity_mismatch'); assert.equal(r.accountId, null); assert.ok(!JSON.stringify(r).includes('99999')); assert.equal(f.seen.length, 1); } finally { await f.stop(); }
});

test('credencial caducada o revocada (401) en la identidad ⇒ rejected, y no se intenta leer nada más', async () => {
  const f = await fake({ '/account-info/2026-09/details': status(401), ...objects() });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.deepEqual({ s: r.state, e: r.evidence }, { s: 'rejected', e: 'provider_response' }); assert.equal(f.seen.length, 1); } finally { await f.stop(); }
});

test('EXPIRACIÓN durante la comprobación: la identidad responde y el primer objeto da 401 ⇒ rejected, el resto «not_attempted» (no se sigue insistiendo)', async () => {
  const f = await fake({ '/account-info/2026-09/details': identity(), ...objects({ '/crm/objects/2026-09/contacts': status(401) }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'rejected'); assert.equal(states(r), 'contacts:rejected companies:not_attempted deals:not_attempted tasks:not_attempted'); assert.equal(f.seen.length, 2); } finally { await f.stop(); }
});

test('PERMISOS: un objeto denegado ⇒ partial (con cuáles); todos denegados ⇒ insufficient_permissions; identidad denegada ⇒ insufficient_permissions', async () => {
  let f = await fake({ '/account-info/2026-09/details': identity(), ...objects({ '/crm/objects/2026-09/deals': status(403) }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'partial'); assert.match(r.message, /3 de 4/); assert.match(r.message, /deals/); assert.equal(view(r, NOW).label, 'Lectura parcial · cuenta real'); } finally { await f.stop(); }
  const none = Object.fromEntries(['contacts', 'companies', 'deals', 'tasks'].map(e => ['/crm/objects/2026-09/' + e, status(403)]));
  f = await fake({ '/account-info/2026-09/details': identity(), ...none });
  try { assert.equal((await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock })).state, 'insufficient_permissions'); } finally { await f.stop(); }
  f = await fake({ '/account-info/2026-09/details': status(403) });
  try { assert.equal((await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock })).state, 'insufficient_permissions'); assert.equal(f.seen.length, 1); } finally { await f.stop(); }
});

test('LÍMITE DE USO (429) y fallos del servicio (5xx) ⇒ unavailable/partial, sin afirmar nada del acceso; Retry-After acotado e informado; sin reintento automático', async () => {
  let f = await fake({ '/account-info/2026-09/details': status(429, { 'retry-after': '99999' }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.deepEqual({ s: r.state, ra: r.retryAfterSeconds }, { s: 'unavailable', ra: 3600 }); assert.match(r.message, /no está comprobado/); assert.equal(f.seen.length, 1); } finally { await f.stop(); }
  f = await fake({ '/account-info/2026-09/details': identity(), ...objects({ '/crm/objects/2026-09/tasks': status(429, { 'retry-after': '7' }), '/crm/objects/2026-09/deals': status(503) }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.deepEqual({ s: r.state, ra: r.retryAfterSeconds }, { s: 'partial', ra: 7 }); assert.equal(states(r), 'contacts:readable companies:readable deals:unavailable tasks:unavailable'); } finally { await f.stop(); }
  f = await fake({ '/account-info/2026-09/details': status(500) });
  try { assert.equal((await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock })).state, 'unavailable'); } finally { await f.stop(); }
});

test('TIEMPO AGOTADO: un servidor que no responde ⇒ unavailable dentro del plazo (no se queda colgado) y sin evidencia del proveedor', async () => {
  const f = await fake({ '*': () => { /* nunca responde */ } });
  try { const t = Date.now(), r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock, timeoutMs: 250 }); assert.deepEqual({ s: r.state, e: r.evidence }, { s: 'unavailable', e: 'none' }); assert.ok(Date.now() - t < 3000); } finally { await f.stop(); }
});

test('RESPUESTA PARCIAL o malformada: cuerpo cortado a mitad, JSON sin los campos esperados o sin «results» ⇒ nunca se interpreta como acceso comprobado', async () => {
  const truncated: Handler = (_q, r) => { r.writeHead(200, { 'content-type': 'application/json', 'content-length': '200' }); r.write('{"portalId":12345,"acc'); setTimeout(() => r.socket?.destroy(), 20); };
  let f = await fake({ '/account-info/2026-09/details': truncated });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'unavailable'); } finally { await f.stop(); }
  f = await fake({ '/account-info/2026-09/details': json({ hola: 1 }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'unavailable'); assert.match(r.message, /formato esperado/); assert.equal(f.seen.length, 1); } finally { await f.stop(); }
  f = await fake({ '/account-info/2026-09/details': identity(), ...objects({ '/crm/objects/2026-09/companies': json({ sinResultados: true }), '/crm/objects/2026-09/deals': truncated }) });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'partial'); assert.equal(states(r), 'contacts:readable companies:malformed deals:malformed tasks:readable'); } finally { await f.stop(); }
});

test('una REDIRECCIÓN no se sigue (la credencial no viaja a otro destino): unavailable y el destino de la redirección no recibe ninguna petición', async () => {
  const target = await fake({ '*': identity() });
  const f = await fake({ '/account-info/2026-09/details': (_q, r) => { r.statusCode = 302; r.setHeader('location', 'http://127.0.0.1:' + target.port + '/robado'); r.end(); } });
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock }); assert.equal(r.state, 'unavailable'); assert.equal(target.seen.length, 0); } finally { await f.stop(); await target.stop(); }
});

test('sin secretos ni detalles de la petición: si el transporte falla con un error que contiene la credencial, el resultado no la contiene; una configuración inválida no llama a nadie', async () => {
  const boom = (async () => { throw new Error('fallo con ' + TOKEN + ' en https://api.hubapi.com/x?token=' + TOKEN); }) as typeof fetch;
  const r = await checkHubspotRead(prod, { fetcher: boom, now: clock }); assert.equal(r.state, 'unavailable'); assert.ok(!JSON.stringify(r).includes(TOKEN));
  let calls = 0; const counting = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
  assert.equal((await checkHubspotRead({ token: 'x', accountId: PORTAL, mode: 'production_readonly' }, { fetcher: counting })).state, 'unavailable');
  assert.equal((await checkHubspotRead({ token: TOKEN, accountId: 'abc', mode: 'test' }, { fetcher: counting })).state, 'unavailable'); assert.equal(calls, 0);
});

test('cancelación: una señal ya abortada ⇒ unavailable sin evidencia ni peticiones al servidor', async () => {
  const f = await fake({ '/account-info/2026-09/details': identity(), ...objects() }), c = new AbortController(); c.abort();
  try { const r = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock, signal: c.signal }); assert.deepEqual({ s: r.state, e: r.evidence }, { s: 'unavailable', e: 'none' }); assert.equal(f.seen.length, 0); } finally { await f.stop(); }
});

test('lo que se MUESTRA: sin configurar, guardada sin comprobar, en curso, comprobada reciente, caducada ⇒ vuelve a «sin comprobar»; una credencial guardada no equivale a acceso actual', async () => {
  const f = await fake({ '/account-info/2026-09/details': identity(), ...objects() });
  try {
    const ok = await checkHubspotRead(prod, { fetcher: f.fetcher, now: clock });
    assert.equal(view(null, NOW, { configured: false }).state, 'not_configured');
    const unchecked = view(null, NOW); assert.deepEqual({ s: unchecked.state, f: unchecked.fresh }, { s: 'saved_unchecked', f: false });
    assert.equal(view(ok, NOW, { checking: true }).state, 'checking');
    const edge = view(ok, NOW + READ_CHECK_TTL_MS); assert.deepEqual({ s: edge.state, f: edge.fresh }, { s: 'read_verified', f: true });
    const old = view(ok, NOW + READ_CHECK_TTL_MS + 1); assert.deepEqual({ s: old.state, f: old.fresh }, { s: 'saved_unchecked', f: false }); assert.match(old.detail, /caducó/);
    assert.equal(view(ok, NOW, { configured: false }).state, 'not_configured', 'sin credencial no se muestra una comprobación anterior');
  } finally { await f.stop(); }
});
