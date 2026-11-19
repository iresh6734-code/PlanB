import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { CliUsageError, parseArgs, readSecret, runCli, type Readable as CliReadable } from '../scripts/hubspot-read-check.js';
import { guardedReadFetch, LIVE_MAX_BODY_BYTES } from '../server/hubspot-read-check-transport.js';
// Script de comprobación REAL de lectura de HubSpot (portal de ensayo): estas pruebas usan SOLO respuestas sintéticas (servidor HTTP local ficticio, fetch simulado y un subproceso con la red externa bloqueada).
// NO son una comprobación real: no se llama a HubSpot, no se lee ninguna credencial y el portal 12345 es inventado. La comprobación real sigue pendiente de ID de portal y autorización expresa.
const TOKEN = 'pat-ficticio-9876543210-secreto', PORTAL = '12345', CANARY = 'canario-cuerpo@ejemplo.invalid', OK_ARGS = ['--portal', PORTAL, '--authorized-reads', '5'];
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
interface Fake { seen: { method: string; path: string }[]; fetch: typeof fetch; port: number; stop: () => Promise<void> }
async function fake(routes: Record<string, Handler | undefined>): Promise<Fake> {
  const seen: Fake['seen'] = [], sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => { seen.push({ method: req.method!, path: req.url! }); (routes[new URL(req.url!, 'http://x').pathname] ?? routes['*'] ?? ((_q, r) => { r.statusCode = 404; r.end('{}'); }))(req, res); });
  server.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); const port = (server.address() as AddressInfo).port;
  return { seen, port, fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(String(input).replace('https://api.hubapi.com', 'http://127.0.0.1:' + port), init)) as typeof fetch, stop: () => new Promise<void>(ok => { for (const s of sockets) s.destroy(); server.close(() => ok()); }) };
}
const json = (body: unknown, code = 200): Handler => (_q, r) => { r.statusCode = code; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(body)); };
const status = (code: number, headers: Record<string, string> = {}): Handler => (_q, r) => { r.statusCode = code; for (const [k, v] of Object.entries(headers)) r.setHeader(k, v); r.end('{"detalle":"' + CANARY + '"}'); };
const ID = '/account-info/2026-09/details', O = (e: string) => '/crm/objects/2026-09/' + e;
const identity = (type = 'SANDBOX', portalId: number = Number(PORTAL)) => json({ portalId, accountType: type, uiDomain: CANARY });
const objects = (over: Record<string, Handler | undefined> = {}) => Object.fromEntries(['contacts', 'companies', 'deals', 'tasks'].map(e => [O(e), over[O(e)] ?? json({ results: [{ id: '1', properties: { email: CANARY } }] })]));
async function run(argv: string[], fetcher: typeof fetch, stdinText: string | null = TOKEN + '\n', extra: { isTTY?: boolean } = {}) {
  let out = '', err = ''; const stdin = Object.assign(stdinText === null ? Readable.from([]) : Readable.from([stdinText]), extra) as unknown as CliReadable;
  const code = await runCli(argv, { stdin, out: t => { out += t; }, err: t => { err += t; }, fetch: fetcher, now: () => Date.parse('2026-11-04T12:00:00.000Z') });
  return { code, out, err, all: out + err };
}
const neverFetch = () => { const calls: string[] = []; return { calls, fetch: (async (input: unknown) => { calls.push(String(input)); return new Response('{}'); }) as typeof fetch }; };
const clean = (all: string) => { assert.ok(!all.includes(TOKEN), 'la credencial no aparece'); assert.ok(!all.includes(CANARY), 'ningún cuerpo de respuesta aparece'); assert.ok(!/bearer|authorization/i.test(all), 'ninguna cabecera sensible'); };

test('USO: sin portal, sin la autorización expresa o con otra cifra no se hace NINGUNA petición; un argumento que parezca credencial no se repite; la entrada de terminal se rechaza', async () => {
  for (const argv of [[], ['--portal', PORTAL], ['--authorized-reads', '5'], ['--portal', 'abc', '--authorized-reads', '5'], ['--portal', PORTAL, '--authorized-reads', '6'], ['--portal', PORTAL, '--authorized-reads', '5', '--timeout-ms', '999999'], ['--portal', PORTAL, '--authorized-reads', '5', '--timeout-ms', '10']]) {
    const f = neverFetch(), r = await run(argv, f.fetch); assert.equal(r.code, 2, JSON.stringify(argv)); assert.equal(f.calls.length, 0); assert.ok(r.err.length > 0);
  }
  for (const secretArgv of [[...OK_ARGS, '--token', TOKEN], [...OK_ARGS, TOKEN], ['--portal', PORTAL, '--authorized-reads', '5', '--password=' + TOKEN]]) {
    const f = neverFetch(), r = await run(secretArgv, f.fetch); assert.equal(r.code, 2); assert.equal(f.calls.length, 0); assert.ok(!r.all.includes(TOKEN), 'el argumento no se repite en el error'); assert.match(r.err, /entrada estándar/);
  }
  const tty = neverFetch(), t = await run(OK_ARGS, tty.fetch, TOKEN, { isTTY: true }); assert.equal(t.code, 2); assert.equal(tty.calls.length, 0); assert.ok(!t.all.includes(TOKEN));
});

test('ENTRADA ESTÁNDAR: vacía, con espacios, con varias líneas o enorme ⇒ uso incorrecto sin peticiones y sin repetir su contenido', async () => {
  for (const bad of ['', '\n', 'corta', 'con espacios dentro 123456', TOKEN + '\n' + TOKEN, 'x'.repeat(5000)]) {
    const f = neverFetch(), r = await run(OK_ARGS, f.fetch, bad); assert.equal(r.code, 2); assert.equal(f.calls.length, 0); assert.ok(!r.all.includes(TOKEN)); assert.ok(!r.all.includes('con espacios'));
  }
  assert.equal(await readSecret(Readable.from([TOKEN + '\r\n']) as unknown as CliReadable), TOKEN);
  assert.throws(() => parseArgs(['--portal']), CliUsageError);
});

test('portal de ensayo correcto y todo legible ⇒ ACCESO CONFIRMADO, exit 0, 5 GET exactos; ni credencial, ni cabeceras, ni cuerpos de respuesta en la salida', async () => {
  const f = await fake({ [ID]: identity(), ...objects() });
  try {
    const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 0, r.all); clean(r.all); assert.match(r.out, /ACCESO DE LECTURA CONFIRMADO \(cuenta de ensayo\)/); assert.match(r.out, /Peticiones realizadas: 5 de 5/); assert.match(r.out, /clientes: acceso confirmado/); assert.match(r.out, /No demuestra sincronización continua, ni permisos de escritura/);
    assert.deepEqual(f.seen.map(x => x.method + ' ' + x.path), ['GET ' + ID, ...['contacts', 'companies', 'deals', 'tasks'].map(e => 'GET ' + O(e) + '?limit=1&properties=hs_object_id')]);
    const j = await run([...OK_ARGS, '--json'], f.fetch); assert.equal(j.code, 0); clean(j.all); const v = JSON.parse(j.out); assert.deepEqual({ r: v.resultado, e: v.entorno, p: v.peticiones, b: v.peticionesBloqueadas }, { r: 'confirmado', e: 'rehearsal', p: 5, b: 0 }); assert.deepEqual(Object.keys(v).sort(), ['comprobadoEn', 'entorno', 'objetos', 'peticiones', 'peticionesBloqueadas', 'portalEsperado', 'reintentarEnSegundos', 'respuestasTruncadas', 'resultado', 'tipoDeCuenta', 'validoHasta'], 'lista blanca de campos');
  } finally { await f.stop(); }
});

test('PORTAL DISTINTO y CUENTA NO ADMITIDA (STANDARD, APP_DEVELOPER): se detiene tras la identidad, 1 sola petición, sin leer objetos y sin mostrar el otro portal', async () => {
  for (const [route, re] of [[identity('SANDBOX', 99999), /otro portal/], [identity('STANDARD'), /no es de ensayo/], [identity('APP_DEVELOPER'), /no es de ensayo/]] as const) {
    const f = await fake({ [ID]: route, ...objects() });
    try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.match(r.out, /DETENIDO/); assert.match(r.out, re); assert.equal(f.seen.length, 1); assert.ok(!r.all.includes('99999')); assert.ok(!/ACCESO DE LECTURA CONFIRMADO/.test(r.out)); clean(r.all); } finally { await f.stop(); }
  }
});

test('CREDENCIAL INVÁLIDA (401), identidad denegada (403), servicio caído (500) y límite (429): 1 petición, sin reintento ni lectura de objetos; cada caso con su mensaje', async () => {
  for (const [code, re] of [[401, /CREDENCIAL RECHAZADA/], [403, /PERMISOS INSUFICIENTES/], [500, /ERROR: HubSpot respondió/], [429, /ERROR: HubSpot respondió/]] as const) {
    const f = await fake({ [ID]: status(code, { 'retry-after': '30' }), ...objects() });
    try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.match(r.out, re); assert.equal(f.seen.length, 1, 'sin reintento'); clean(r.all); if (code === 429) assert.match(r.out, /esperar 30 s/); } finally { await f.stop(); }
  }
});

test('PERMISOS PARCIALES y expiración durante la lectura: se dice qué objeto no es legible; 401 a mitad detiene el resto', async () => {
  let f = await fake({ [ID]: identity(), ...objects({ [O('deals')]: status(403) }) });
  try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.match(r.out, /ACCESO PARCIAL/); assert.match(r.out, /oportunidades: permisos insuficientes/); assert.match(r.out, /clientes: acceso confirmado/); clean(r.all); } finally { await f.stop(); }
  f = await fake({ [ID]: identity(), ...objects({ [O('contacts')]: status(401) }) });
  try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.match(r.out, /CREDENCIAL RECHAZADA/); assert.match(r.out, /empresas: desconocido \(no se comprobó\)/); assert.equal(f.seen.length, 2); } finally { await f.stop(); }
  f = await fake({ [ID]: identity(), ...objects({ [O('contacts')]: status(403), [O('companies')]: status(403), [O('deals')]: status(403), [O('tasks')]: status(403) }) });
  try { const r = await run(OK_ARGS, f.fetch); assert.match(r.out, /PERMISOS INSUFICIENTES/); assert.equal(f.seen.length, 5); } finally { await f.stop(); }
});

test('TIEMPO AGOTADO (--timeout-ms 1000): «resultado desconocido», no se queda colgado, 1 petición y sin reintento', async () => {
  const f = await fake({ '*': () => { /* nunca responde */ } });
  try { const t = Date.now(), r = await run([...OK_ARGS, '--timeout-ms', '1000'], f.fetch); assert.equal(r.code, 1); assert.match(r.out, /RESULTADO DESCONOCIDO/); assert.ok(Date.now() - t < 6000); assert.equal(f.seen.length, 1); clean(r.all); } finally { await f.stop(); }
});

test('RESPUESTA INVÁLIDA o cortada, y FALLO DE RED: nunca se presentan como acceso confirmado ni filtran la credencial (ni siquiera si el error de red la contiene)', async () => {
  const truncated: Handler = (_q, r) => { r.writeHead(200, { 'content-type': 'application/json', 'content-length': '300' }); r.write('{"portalId":12345,"acc'); setTimeout(() => r.socket?.destroy(), 20); };
  for (const route of [json({ hola: CANARY }), (_q: IncomingMessage, r: ServerResponse) => { r.statusCode = 200; r.end('<html>' + CANARY + '</html>'); }, truncated]) {
    const f = await fake({ [ID]: route as Handler, ...objects() });
    try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.ok(!/ACCESO DE LECTURA CONFIRMADO/.test(r.out)); assert.equal(f.seen.length, 1); clean(r.all); } finally { await f.stop(); }
  }
  const f = await fake({ [ID]: identity(), ...objects({ [O('tasks')]: truncated, [O('deals')]: json({ sinResultados: CANARY }) }) });
  try { const r = await run(OK_ARGS, f.fetch); assert.match(r.out, /ACCESO PARCIAL/); assert.match(r.out, /oportunidades: error \(respuesta no válida\)/); clean(r.all); } finally { await f.stop(); }
  const boom = (async () => { throw new Error('ECONNRESET con ' + TOKEN + ' en https://api.hubapi.com/x?access_token=' + TOKEN); }) as typeof fetch, r = await run(OK_ARGS, boom);
  assert.equal(r.code, 1); assert.match(r.out, /RESULTADO DESCONOCIDO/); clean(r.all);
});

test('TOPE DE LECTURA: una respuesta mayor que el tope se corta y se trata como inválida (nunca como acceso); se informa de la truncada', async () => {
  const big: Handler = (_q, r) => { r.statusCode = 200; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ results: [], relleno: 'x'.repeat(LIVE_MAX_BODY_BYTES * 2) })); };
  const f = await fake({ [ID]: identity(), ...objects({ [O('contacts')]: big }) });
  try { const r = await run([...OK_ARGS, '--json'], f.fetch); const v = JSON.parse(r.out); assert.equal(v.respuestasTruncadas, 1); assert.equal(v.objetos[0].resultado, 'malformed'); assert.equal(v.resultado, 'partial'); } finally { await f.stop(); }
});

test('REDIRECCIÓN: no se sigue; el destino de la redirección no recibe ninguna petición', async () => {
  const target = await fake({ '*': identity() }), f = await fake({ [ID]: (_q, r) => { r.statusCode = 302; r.setHeader('location', 'http://127.0.0.1:' + target.port + '/robado'); r.end(); } });
  try { const r = await run(OK_ARGS, f.fetch); assert.equal(r.code, 1); assert.equal(target.seen.length, 0); assert.match(r.out, /DESCONOCIDO/); } finally { await f.stop(); await target.stop(); }
});

test('TRANSPORTE PROTEGIDO: presupuesto de 5, cada ruta una vez (sin repetir), solo GET, sin cuerpo, solo api.hubapi.com, consulta y cabeceras exactas; lo bloqueado no llega al fetch real', async () => {
  const reached: string[] = [], real = (async (input: unknown, init?: RequestInit) => { reached.push((init?.method ?? 'GET') + ' ' + String(input)); return new Response('{}', { status: 200 }); }) as typeof fetch;
  const g = guardedReadFetch(real), H = { Authorization: 'Bearer x', Accept: 'application/json' }, B = 'https://api.hubapi.com', Q = '?limit=1&properties=hs_object_id';
  const blocked = async (url: string, init: RequestInit = { headers: H }) => { await assert.rejects(g.fetch(url, init), /PETICION_NO_PERMITIDA/); };
  await blocked(B + '/crm/objects/2026-09/contacts' + Q, { method: 'POST', headers: H }); await blocked(B + '/crm/objects/2026-09/contacts' + Q, { method: 'PUT', headers: H }); await blocked(B + '/crm/objects/2026-09/contacts' + Q, { method: 'DELETE', headers: H });
  await blocked(B + '/crm/objects/2026-09/contacts' + Q, { headers: H, body: '{}' }); await blocked('https://otro.example/crm/objects/2026-09/contacts' + Q); await blocked('http://api.hubapi.com/crm/objects/2026-09/contacts' + Q);
  await blocked(B + '/crm/objects/2026-09/contacts'); await blocked(B + '/crm/objects/2026-09/contacts' + Q + '&after=2'); await blocked(B + '/crm/objects/2026-09/contacts?limit=100&properties=hs_object_id'); await blocked(B + '/crm/objects/2026-09/notes' + Q); await blocked(B + '/account-info/2026-09/details?x=1');
  await blocked(B + '/crm/objects/2026-09/contacts' + Q, { headers: { ...H, Cookie: 'a=b' } }); await blocked(B + '/crm/objects/2026-09/contacts' + Q, { headers: H, redirect: 'follow' }); await blocked('no es una url');
  assert.deepEqual(reached, [], 'nada de lo anterior llegó al fetch real'); assert.equal(g.stats().requests, 0);
  const r2 = guardedReadFetch(real); await r2.fetch(B + '/account-info/2026-09/details', { headers: H }); await assert.rejects(r2.fetch(B + '/account-info/2026-09/details', { headers: H }), /PETICION_NO_PERMITIDA/); assert.deepEqual(r2.stats().blocked, ['repeticion'], 'una repetición (reintento) se bloquea antes de agotar el presupuesto'); reached.length = 0;
  for (const p of ['/account-info/2026-09/details', ...['contacts', 'companies', 'deals', 'tasks'].map(e => '/crm/objects/2026-09/' + e + Q)]) await g.fetch(B + p, { headers: H });
  assert.equal(g.stats().requests, 5); await blocked(B + '/crm/objects/2026-09/contacts' + Q); await blocked(B + '/account-info/2026-09/details'); assert.equal(reached.length, 5, 'ni repetición ni sexta petición'); assert.equal(g.stats().blocked.length, 16);
  assert.ok(!JSON.stringify(g.stats()).includes('Bearer') && !JSON.stringify(g.stats()).includes('otro.example'), 'lo bloqueado se describe con motivos fijos, no con la URL ni cabeceras');
});

test('SUBPROCESO real con la red externa BLOQUEADA: sin autorización ⇒ exit 2; credencial como argumento ⇒ exit 2 sin repetirla; con todo ⇒ la red bloqueada da «desconocido» (exit 1) y la credencial nunca sale', async () => {
  const go = (args: string[], stdin: string) => new Promise<{ code: number | null; out: string; err: string }>(ok => {
    const p = spawn(process.execPath, ['--require', join(resolve('.'), 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/hubspot-read-check.ts', ...args], { cwd: resolve('.'), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout!.on('data', d => { out += d; }); p.stderr!.on('data', d => { err += d; }); p.on('exit', code => ok({ code, out, err })); p.stdin!.end(stdin);
  });
  const a = await go(['--portal', PORTAL], TOKEN + '\n'); assert.equal(a.code, 2); assert.match(a.err, /authorized-reads 5/); clean(a.out + a.err);
  const b = await go([...OK_ARGS, '--token', TOKEN], ''); assert.equal(b.code, 2); clean(b.out + b.err);
  const c = await go(OK_ARGS, TOKEN + '\n'); assert.equal(c.code, 1); assert.match(c.out, /RESULTADO DESCONOCIDO/); assert.match(c.out, /Peticiones realizadas: 1 de 5/); clean(c.out + c.err.replace(/\(node:\d+\)[^\n]*\n?/g, '').replace(/\(Use `node --trace-warnings[^\n]*\n?/g, ''));
});

// ── F1 de la revisión 178 (R2): una respuesta que supera el tope se rechaza ENTERA; un prefijo JSON completo + relleno no se entrega como documento válido ──
const CAP = LIVE_MAX_BODY_BYTES, IDENT_BODY = { portalId: Number(PORTAL), accountType: 'DEVELOPER_TEST' }, OBJ_BODY = { results: [] };
const padTo = (value: object, bytes: number) => JSON.stringify(value).padEnd(bytes, ' '); // JSON completo + espacios: sigue siendo JSON válido si no se añade nada más
const synthetic = (over: Record<string, string> = {}) => { const paths: string[] = []; return { paths, fetch: (async (input: Parameters<typeof fetch>[0]) => { const p = new URL(String(input)).pathname; paths.push(p); return new Response(over[p] ?? JSON.stringify(p === ID ? IDENT_BODY : OBJ_BODY), { headers: { 'content-type': 'application/json' } }); }) as typeof fetch }; };
async function asJson(over: Record<string, string>) { const s = synthetic(over), r = await run([...OK_ARGS, '--json'], s.fetch); clean(r.all); return { code: r.code, v: JSON.parse(r.out), paths: s.paths }; }

test('F1·IDENTIDAD con prefijo JSON completo + espacios + sufijo inválido al superar el tope: NO confirmado, se detiene tras 1 GET (ningún objeto) y se informa de la respuesta truncada', async () => {
  const r = await asJson({ [ID]: padTo(IDENT_BODY, CAP) + 'SUFIJO_INVALIDO' });
  assert.equal(r.code, 1); assert.deepEqual(r.paths, [ID], 'sin leer objetos'); assert.equal(r.v.respuestasTruncadas, 1); assert.equal(r.v.peticiones, 1);
  assert.equal(r.v.resultado, 'unavailable'); assert.deepEqual(r.v.objetos, []); assert.equal(r.v.tipoDeCuenta, null, 'el prefijo no se interpreta: no se reconoce ni el tipo de cuenta');
});

test('F1·OBJETO con prefijo JSON completo + espacios + sufijo inválido: ese objeto NO es legible, los demás se comprueban solos; no hay acceso completo', async () => {
  for (const entity of ['contacts', 'companies', 'deals', 'tasks']) {
    const r = await asJson({ [O(entity)]: padTo(OBJ_BODY, CAP) + 'SUFIJO_INVALIDO' });
    assert.equal(r.code, 1, entity); assert.equal(r.v.respuestasTruncadas, 1, entity); assert.equal(r.paths.length, 5, 'las demás lecturas siguen su curso');
    assert.equal(r.v.resultado, 'partial', entity); const mine = r.v.objetos.find((o: { objeto: string }) => o.objeto === entity); assert.notEqual(mine.resultado, 'readable'); assert.equal(mine.resultado, 'malformed');
    assert.equal(r.v.objetos.filter((o: { resultado: string }) => o.resultado === 'readable').length, 3);
  }
});

test('F1·CONTROLES del límite: EXACTAMENTE el tope (JSON + espacios) se acepta; UN byte más se rechaza aunque el documento completo sea JSON válido; JSON incompleto y respuestas normales siguen igual', async () => {
  const exact = await asJson({ [ID]: padTo(IDENT_BODY, CAP), [O('contacts')]: padTo(OBJ_BODY, CAP) });
  assert.equal(Buffer.byteLength(padTo(IDENT_BODY, CAP)), CAP); assert.equal(exact.code, 0); assert.equal(exact.v.resultado, 'confirmado'); assert.equal(exact.v.respuestasTruncadas, 0); assert.equal(exact.paths.length, 5);
  const plusOne = await asJson({ [ID]: padTo(IDENT_BODY, CAP + 1) });
  assert.equal(plusOne.code, 1); assert.equal(plusOne.v.respuestasTruncadas, 1); assert.deepEqual(plusOne.paths, [ID], 'un documento válido pero mayor que el tope no se acepta');
  const objPlusOne = await asJson({ [O('tasks')]: padTo(OBJ_BODY, CAP + 1) });
  assert.equal(objPlusOne.v.respuestasTruncadas, 1); assert.equal(objPlusOne.v.objetos.find((o: { objeto: string }) => o.objeto === 'tasks').resultado, 'malformed');
  const incomplete = await asJson({ [ID]: '{"portalId":12345,"accountType":"DEVELOPER_' }); assert.equal(incomplete.code, 1); assert.equal(incomplete.v.respuestasTruncadas, 0, 'incompleto pero dentro del tope: no es truncamiento por tope'); assert.deepEqual(incomplete.paths, [ID]);
  const normal = await asJson({}); assert.equal(normal.code, 0); assert.equal(normal.v.respuestasTruncadas, 0); assert.equal(normal.paths.length, 5);
});

test('F1·TRANSPORTE: al superar el tope la respuesta entregada no tiene NINGÚN byte legible (ni con cortes de bloque en el límite ni con content-length declarado mayor), y se cancela la lectura del origen', async () => {
  const enc = new TextEncoder(), prefix = enc.encode(padTo(IDENT_BODY, CAP)); let cancelled = 0, pulled = 0;
  const streamed = (chunks: Uint8Array[]) => (async () => new Response(new ReadableStream<Uint8Array>({ pull(c) { pulled++; const next = chunks.shift(); if (next) c.enqueue(next); else c.close(); }, cancel() { cancelled++; } }), { status: 200 })) as typeof fetch;
  const H = { Authorization: 'Bearer x', Accept: 'application/json' }, URL_ID = 'https://api.hubapi.com' + ID;
  // el límite cae justo entre dos bloques: el primero llena el tope, el segundo lleva el sufijo inválido
  const g1 = guardedReadFetch(streamed([prefix, enc.encode('SUFIJO_INVALIDO'), enc.encode('MAS')])), r1 = await g1.fetch(URL_ID, { headers: H });
  await assert.rejects(r1.text(), /RESPUESTA_EXCEDE_TOPE/, 'el cuerpo no se puede leer: no se entrega el prefijo'); assert.equal(g1.stats().truncated, 1); assert.equal(cancelled, 1, 'se cancela la lectura del origen'); assert.ok(pulled <= 3);
  // el límite cae en mitad de un bloque
  const g2 = guardedReadFetch(streamed([prefix.subarray(0, CAP - 5), enc.encode('0123456789')])), r2 = await g2.fetch(URL_ID, { headers: H }); await assert.rejects(r2.json()); assert.equal(g2.stats().truncated, 1);
  // content-length declarado mayor que el tope: se rechaza sin leer el cuerpo
  let declaredCancelled = 0; // cuerpo real pequeño y válido, pero la cabecera declara más que el tope: se rechaza sin depender de cuántos bytes lleguen
  const declared = (async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(JSON.stringify(IDENT_BODY))); c.close(); }, cancel() { declaredCancelled++; } }), { status: 200, headers: { 'content-length': String(CAP + 1) } })) as typeof fetch;
  const g3 = guardedReadFetch(declared), r3 = await g3.fetch(URL_ID, { headers: H }); await assert.rejects(r3.text()); assert.equal(g3.stats().truncated, 1); assert.ok(declaredCancelled <= 1);
  // exactamente el tope en varios bloques: se entrega completo
  const g4 = guardedReadFetch(streamed([prefix.subarray(0, 100), prefix.subarray(100)])), r4 = await g4.fetch(URL_ID, { headers: H }); assert.equal((await r4.text()).length, CAP); assert.equal(g4.stats().truncated, 0);
});
