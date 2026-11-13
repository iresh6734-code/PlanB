import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { projectCommitmentEvidence, type CommitmentDefinition } from '../shared/commitments.js';
import { isReadingFresh, readingObservations, sourceReading, type SourceReading } from '../shared/source-reading.js';
import { createSourceReadTransport } from '../server/source-read-transport.js';
import { createZendeskSource, type ZendeskSourceOptions } from '../server/zendesk-source.js';
import { normalizeZendeskTicket, parseZendeskTicketsPage } from '../shared/zendesk-source.js';

// Adaptador de tickets de Zendesk: SOLO respuestas sintéticas y servidores de bucle local. Ninguna prueba toca la red, una cuenta ni una credencial reales: el token de las pruebas es una cadena
// inventada que además se comprueba que no aparece en ninguna salida. Una prueba sintética acredita IMPLEMENTACIÓN, no acceso a Zendesk.
const NOW = Date.parse('2026-11-08T10:00:00.000Z'), TOKEN = 'TEST-TOKEN-0f3a9c1d';
type Hit = { method: string; url: string; headers: http.IncomingHttpHeaders };
type Handler = (req: http.IncomingMessage, res: http.ServerResponse, hits: Hit[]) => void;

async function serve(handler: Handler) {
  const hits: Hit[] = [], sockets = new Set<import('node:net').Socket>();
  const server = http.createServer((req, res) => { hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers }); handler(req, res, hits); });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  return { origin, hits, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const ticket = (id: number, status = 'open', extra: Record<string, unknown> = {}) => ({ id, status, subject: 'Asunto con datos personales de Ana', priority: 'normal', updated_at: '2026-11-08T09:30:00Z', external_id: null, ...extra });
const page = (tickets: unknown[], hasMore: boolean, after: string | null = null) => ({ tickets, meta: { has_more: hasMore, after_cursor: after, before_cursor: null }, links: { next: 'https://evil.example/steal?x=1', prev: null } });
const source = (origin: string, extra: Partial<ZendeskSourceOptions> = {}, accountId = 'fixture-support-a') => createZendeskSource({ mode: { kind: 'local-test', origin, accountId }, credential: () => TOKEN, now: () => NOW, ...extra });
async function withServer<T>(handler: Handler, body: (s: Awaited<ReturnType<typeof serve>>) => Promise<T>) { const s = await serve(handler); try { return await body(s); } finally { await s.close(); } }
const keyOf = (r: { provider: string; accountId: string; kind: string; remoteId: string }) => JSON.stringify([r.provider, r.accountId, r.kind, r.remoteId]);
const definition = (links: CommitmentDefinition['links']): CommitmentDefinition => ({ id: 'caso', title: 'Caso', dueAt: new Date(NOW + 3_600_000).toISOString(), links });

test('LECTURA COMPLETA: tres páginas por cursor, cada observación conserva proveedor, cuenta, rol, ID remoto, instante y cobertura; solo GET con la cabecera prevista y la URL se construye', async () => {
  await withServer((req, res) => {
    const after = new URL(req.url!, 'http://x').searchParams.get('page[after]');
    if (!after) send(res, 200, page([ticket(1), ticket(2, 'hold')], true, 'c1'));
    else if (after === 'c1') send(res, 200, page([ticket(3, 'solved')], true, 'c2'));
    else send(res, 200, page([ticket(4, 'new')], false, null));
  }, async server => {
    const reading = await source(server.origin).readTickets();
    assert.equal(sourceReading.safeParse(reading).success, true);
    assert.equal(reading.coverage, 'complete'); assert.equal(reading.stoppedBy, null); assert.equal(reading.pages, 3); assert.equal(reading.requests, 3);
    assert.deepEqual(reading.records.map(r => [r.remoteId, r.condition]), [['1', 'clear'], ['2', 'blocked'], ['3', 'completed'], ['4', 'clear']]);
    const observations = readingObservations(reading);
    assert.equal(observations.length, 4);
    for (const o of observations) { assert.equal(o.reference.provider, 'zendesk-fixture'); assert.equal(o.reference.accountId, 'fixture-support-a'); assert.equal(o.reference.kind, 'support'); assert.equal(o.observedAt, new Date(NOW).toISOString()); assert.equal(o.coverage, 'complete'); }
    assert.deepEqual(observations.map(o => o.reference.remoteId), ['1', '2', '3', '4']);
    assert.deepEqual(server.hits.map(h => h.method), ['GET', 'GET', 'GET']);
    assert.equal(server.hits[0]!.url, '/api/v2/tickets?page[size]=100&sort=id');
    assert.equal(server.hits[1]!.url, '/api/v2/tickets?page[size]=100&sort=id&page[after]=c1');
    assert.ok(server.hits.every(h => h.url.startsWith('/api/v2/tickets?')), 'ninguna petición salió hacia la URL `links.next` de la respuesta');
    for (const hit of server.hits) { assert.equal(hit.headers.authorization, 'Bearer ' + TOKEN); assert.equal(hit.headers.accept, 'application/json'); assert.equal(hit.headers['content-length'], undefined); assert.equal(hit.headers['transfer-encoding'], undefined); }
  });
});

test('ETIQUETA: no copia el asunto (datos personales) salvo que se pida, y entonces lo limpia y lo recorta; los estados se leen en español', async () => {
  await withServer((_req, res) => send(res, 200, page([ticket(7, 'hold', { priority: 'urgent', subject: 'Línea 1\n\u0007línea 2 ' + 'x'.repeat(200) })], false)), async server => {
    const plain = await source(server.origin).readTickets(); assert.equal(plain.records[0]!.label, 'Ticket de soporte #7 · en espera · prioridad urgente'); assert.ok(!JSON.stringify(plain).includes('Línea 1'));
    const withSubject = await source(server.origin, { policy: { includeSubject: true } }).readTickets(); const label = withSubject.records[0]!.label;
    assert.match(label, /^Ticket de soporte #7 · en espera · prioridad urgente · Línea 1 línea 2 x+…$/); assert.ok(label.length <= 160 && !/[\u0000-\u001f]/.test(label));
  });
});

test('UNA PÁGINA VACÍA NO PRUEBA INVENTARIO: solo `has_more: false` explícito cierra la lectura; sin meta o con indicador no booleano la respuesta se rechaza, y has_more con lista vacía obliga a seguir', async () => {
  await withServer((_req, res) => send(res, 200, page([], false)), async server => {
    const empty = await source(server.origin).readTickets(); assert.equal(empty.coverage, 'complete'); assert.deepEqual(readingObservations(empty), [], 'fin explícito y sin tickets: completo y vacío');
  });
  for (const body of [{ tickets: [] }, { tickets: [], meta: {} }, { tickets: [], meta: { has_more: 'false' } }, { meta: { has_more: false } }, [], null, 'texto']) {
    await withServer((_req, res) => send(res, 200, JSON.stringify(body)), async server => {
      const reading = await source(server.origin).readTickets();
      assert.equal(reading.coverage, 'unavailable', JSON.stringify(body)); assert.equal(reading.stoppedBy, 'malformed'); assert.deepEqual(reading.records, []);
    });
  }
  let n = 0;
  await withServer((_req, res) => { n++; send(res, 200, page([], true, 'cursor-' + n)); }, async server => {
    const reading = await source(server.origin, { limits: { maxPages: 3 } }).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, 'page-budget'); assert.equal(reading.pages, 3); assert.equal(server.hits.length, 3, 'una página vacía con has_more no cierra: se sigue hasta el presupuesto');
  });
});

test('PAGINACIÓN INCOMPLETA: presupuesto de páginas, de registros, cursor repetido, cursor ausente o con forma no válida dan lectura PARCIAL y observaciones parciales, nunca completas', async () => {
  let n = 0;
  await withServer((_req, res) => { n++; send(res, 200, page([ticket(n * 10 + 1), ticket(n * 10 + 2)], true, 'k' + n)); }, async server => {
    const reading = await source(server.origin, { limits: { maxPages: 2 } }).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, 'page-budget'); assert.equal(reading.records.length, 4); assert.equal(server.hits.length, 2);
    assert.ok(readingObservations(reading).every(o => o.coverage === 'partial'));
  });
  await withServer((_req, res) => send(res, 200, page([ticket(1), ticket(2), ticket(3)], true, 'k1')), async server => {
    const reading = await source(server.origin, { limits: { maxRecords: 2 } }).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, 'record-budget'); assert.equal(reading.records.length, 2);
  });
  for (const [name, body, stop] of [['cursor repetido', page([ticket(1)], true, 'same'), 'cursor-loop'], ['sin cursor', page([ticket(1)], true, null), 'missing-pagination']] as const) {
    let calls = 0;
    await withServer((_req, res) => { calls++; send(res, 200, calls === 1 ? body : { ...body, tickets: [ticket(2)] }); }, async server => {
      const reading = await source(server.origin).readTickets(); assert.equal(reading.coverage, 'partial', name); assert.equal(reading.stoppedBy, stop, name);
    });
  }
  for (const cursor of ['con espacio', 'https://evil.example/x', '../..', 'a'.repeat(513), 123]) {
    let calls = 0;
    await withServer((_req, res) => { calls++; send(res, 200, calls === 1 ? page([ticket(1)], true, 'ok1') : { tickets: [ticket(2)], meta: { has_more: true, after_cursor: cursor } }); }, async server => {
      const reading = await source(server.origin).readTickets(); assert.equal(reading.coverage, 'partial', String(cursor)); assert.equal(reading.stoppedBy, 'malformed'); assert.equal(server.hits.length, 2);
    });
  }
});

test('PERMISOS Y ACCESO: 403 y 401 en la primera página = no disponible; 403 tardío = parcial con lo ya leído; el cuerpo de error ni se lee ni se copia; consulta por ID no disponible = observación sin condición', async () => {
  for (const [status, stop] of [[403, 'forbidden'], [401, 'unauthorized'], [404, 'not-found'], [500, 'server-error'], [418, 'client-error']] as const) {
    await withServer((_req, res) => send(res, status, { error: 'SECRETO-DEL-PROVEEDOR ' + TOKEN }), async server => {
      const listing = await source(server.origin).readTickets(); assert.equal(listing.coverage, 'unavailable'); assert.equal(listing.stoppedBy, stop); assert.deepEqual(readingObservations(listing), []);
      const lookup = await source(server.origin).readTicket(55); const [observation] = readingObservations(lookup);
      assert.equal(lookup.coverage, 'unavailable'); assert.equal(observation!.coverage, 'unavailable'); assert.equal(observation!.condition, null); assert.equal(observation!.reference.remoteId, '55'); assert.equal(observation!.reference.kind, 'support');
      assert.ok(!JSON.stringify([listing, lookup, observation]).includes('SECRETO') && !JSON.stringify([listing, lookup]).includes(TOKEN));
    });
  }
  let calls = 0;
  await withServer((_req, res) => { calls++; if (calls === 1) send(res, 200, page([ticket(1), ticket(2)], true, 'c1')); else send(res, 403, {}); }, async server => {
    const reading = await source(server.origin).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, 'forbidden'); assert.equal(reading.records.length, 2); assert.ok(readingObservations(reading).every(o => o.coverage === 'partial'), 'lo leído se conserva como parcial');
    assert.equal(server.hits.length, 2);
  });
});

test('LÍMITE DE PETICIONES: 429 informa Retry-After en segundos (acotado), no se reintenta y una fecha o un valor absurdo no se interpretan', async () => {
  for (const [header, expected] of [['7', 7], ['99999', 3600], ['Wed, 21 Oct 2026 07:28:00 GMT', null], ['-3', null], [undefined, null]] as const) {
    await withServer((_req, res) => send(res, 429, {}, header === undefined ? {} : { 'retry-after': header }), async server => {
      const reading = await source(server.origin).readTickets();
      assert.equal(reading.coverage, 'unavailable'); assert.equal(reading.stoppedBy, 'rate-limited'); assert.equal(reading.retryAfterSeconds, expected, String(header)); assert.equal(server.hits.length, 1, 'sin reintento');
    });
  }
  let calls = 0;
  await withServer((_req, res) => { calls++; if (calls === 1) send(res, 200, page([ticket(1)], true, 'c1')); else send(res, 429, {}, { 'retry-after': '30' }); }, async server => {
    const reading = await source(server.origin).readTickets(); assert.equal(reading.coverage, 'partial'); assert.equal(reading.retryAfterSeconds, 30); assert.equal(server.hits.length, 2);
  });
});

test('TIEMPO: una petición sin respuesta vence por tiempo (no disponible) y el tiempo total corta una lectura lenta dejándola parcial', async () => {
  await withServer(() => undefined, async server => {
    const reading = await source(server.origin, { limits: { requestTimeoutMs: 80 } }).readTickets(); assert.equal(reading.coverage, 'unavailable'); assert.equal(reading.stoppedBy, 'timeout');
  });
  let n = 0;
  await withServer((_req, res) => { n++; setTimeout(() => send(res, 200, page([ticket(n)], true, 'k' + n)), 60); }, async server => {
    const reading = await source(server.origin, { limits: { totalTimeoutMs: 150, requestTimeoutMs: 1000, maxPages: 10 } }).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, 'timeout'); assert.ok(reading.records.length >= 1 && reading.records.length < 10); assert.ok(readingObservations(reading).every(o => o.coverage === 'partial'));
  });
});

test('RESPUESTA TRUNCADA, EXCESO DE BYTES Y CUERPO ILEGIBLE: nunca se entrega un prefijo; el tope rechaza la respuesta entera y un cuerpo del tamaño exacto del tope es válido', async () => {
  await withServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000' }); res.write('{"tickets":[{"id":1,"status":"open"}'); setTimeout(() => res.destroy(), 20); }, async server => {
    const reading = await source(server.origin).readTickets(); assert.equal(reading.coverage, 'unavailable'); assert.equal(reading.stoppedBy, 'truncated'); assert.deepEqual(reading.records, []);
  });
  const body = JSON.stringify(page([ticket(1)], false)), size = Buffer.byteLength(body);
  await withServer((_req, res) => send(res, 200, body), async server => {
    const exact = await source(server.origin, { limits: { maxBodyBytes: size } }).readTickets(); assert.equal(exact.coverage, 'complete', 'EXACTAMENTE el tope es válido');
    const over = await source(server.origin, { limits: { maxBodyBytes: size - 1 } }).readTickets(); assert.equal(over.coverage, 'unavailable'); assert.equal(over.stoppedBy, 'oversize'); assert.deepEqual(over.records, []);
  });
  await withServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write(body.slice(0, 10)); setTimeout(() => res.end(body.slice(10) + ' '.repeat(2000)), 10); }, async server => {
    const chunked = await source(server.origin, { limits: { maxBodyBytes: 500 } }).readTickets(); assert.equal(chunked.stoppedBy, 'oversize', 'sin Content-Length también se corta al superar el tope');
  });
  await withServer((_req, res) => send(res, 200, '{"tickets":[{"id":1,'), async server => { assert.equal((await source(server.origin).readTickets()).stoppedBy, 'malformed'); });
  await withServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>página de error</html>'); }, async server => { assert.equal((await source(server.origin).readTickets()).stoppedBy, 'malformed', 'no es JSON'); });
});

test('REDIRECCIONES: no se siguen (la credencial no viaja a otro sitio) y la lectura queda no disponible', async () => {
  await withServer((_req, res) => send(res, 200, {}), async target => {
    await withServer((_req, res) => { res.writeHead(302, { location: target.origin + '/api/v2/tickets?page[size]=100&sort=id' }); res.end(); }, async first => {
      const reading = await source(first.origin).readTickets(); assert.equal(reading.coverage, 'unavailable'); assert.equal(reading.stoppedBy, 'redirect'); assert.equal(first.hits.length, 1); assert.equal(target.hits.length, 0);
    });
  });
});

test('TRANSPORTE ACOTADO: solo `get`; destino, ruta, consulta, credenciales en la URL y presupuesto se rechazan SIN llamar a la red; las cabeceras y el método salen fijos', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  const make = (maxRequests = 2) => createSourceReadTransport({
    origin: 'https://acme.zendesk.com', allowOrigin: o => o === 'https://acme.zendesk.com', allowPath: p => p === '/api/v2/tickets', allowQuery: params => [...params.keys()].every(k => k === 'page[size]'),
    credential: () => ({ name: 'authorization', value: 'Bearer ' + TOKEN }), fetch: fake, maxRequests, maxBodyBytes: 1000, requestTimeoutMs: 1000, totalTimeoutMs: 5000,
  });
  const t = make(); assert.deepEqual(Object.keys(t).sort(), ['get', 'stats'], 'la API no ofrece escritura');
  for (const target of ['/api/v2/users', '/api/v2/tickets?page[size]=5&cursor=x', '//evil.example/api/v2/tickets', 'https://evil.example/api/v2/tickets', '/api/v2/tickets#frag', '/api/v2/tickets/../users', '/api/v2/tickets\\x', 'api/v2/tickets', '/api/v2/tickets x', '']) {
    const result = await t.get(target); assert.deepEqual([result.ok, (result as { failure?: string }).failure], [false, 'blocked'], target);
  }
  assert.equal(calls.length, 0, 'nada llegó a fetch'); assert.ok(t.stats().blocked.length >= 8 && t.stats().blocked.every(code => !code.includes('evil') && !code.includes(TOKEN)));
  assert.equal((await t.get('/api/v2/tickets?page[size]=5')).ok, true); assert.equal((await t.get('/api/v2/tickets?page[size]=6')).ok, true);
  assert.equal((await t.get('/api/v2/tickets?page[size]=7') as { failure: string }).failure, 'budget'); assert.equal(calls.length, 2);
  const init = calls[0]!.init; assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); assert.equal(init.redirect, 'manual'); assert.deepEqual(Object.keys(init.headers as object).sort(), ['accept', 'authorization']);
  assert.throws(() => createSourceReadTransport({ ...{ origin: 'https://evil.example', allowOrigin: (o: string) => o === 'https://acme.zendesk.com', allowPath: () => true, allowQuery: () => true, credential: () => ({ name: 'authorization' as const, value: 'x' }), maxRequests: 1, maxBodyBytes: 1, requestTimeoutMs: 1, totalTimeoutMs: 1 } }), /ORIGEN_NO_PERMITIDO/);
  for (const bad of [() => ({ name: 'cookie' as never, value: 'x' }), () => ({ name: 'authorization' as const, value: 'a\r\nHost: evil' }), () => ({ name: 'authorization' as const, value: '' }), () => { throw new Error('sin credencial ' + TOKEN); }]) {
    const before: number = calls.length; const bare = createSourceReadTransport({ origin: 'https://acme.zendesk.com', allowOrigin: () => true, allowPath: () => true, allowQuery: () => true, credential: bad, fetch: fake, maxRequests: 1, maxBodyBytes: 100, requestTimeoutMs: 100, totalTimeoutMs: 100 });
    const result = await bare.get('/api/v2/tickets?page[size]=1'); assert.deepEqual([result.ok, (result as { failure?: string }).failure], [false, 'unauthorized']); assert.equal(calls.length, before, 'sin credencial válida no sale ninguna petición');
  }
});

test('MODOS Y NOMBRES: `live` solo construye https://{subdominio}.zendesk.com (probado con un fetch simulado, sin red) y `local-test` nunca produce el proveedor `zendesk`', async () => {
  const urls: string[] = [];
  const fake = (async (url: string) => { urls.push(url); return new Response(JSON.stringify(page([ticket(9)], false)), { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  const live = createZendeskSource({ mode: { kind: 'live', subdomain: 'acme-demo' }, credential: () => TOKEN, fetch: fake, now: () => NOW });
  const reading = await live.readTickets(); assert.deepEqual(urls, ['https://acme-demo.zendesk.com/api/v2/tickets?page[size]=100&sort=id']); assert.equal(reading.provider, 'zendesk'); assert.equal(reading.accountId, 'acme-demo');
  for (const bad of ['evil.com/x', 'a.b', '', 'ACME', '-x', 'x-', 'a'.repeat(64), 'acme.zendesk.com', 'acme/../x', 'acme@evil']) assert.throws(() => createZendeskSource({ mode: { kind: 'live', subdomain: bad }, credential: () => TOKEN }), /SUBDOMINIO_NO_VALIDO/, bad);
  for (const origin of ['http://example.com:80', 'https://127.0.0.1:1', 'http://127.0.0.1', 'http://127.0.0.1:80/x', 'http://acme.zendesk.com:80', 'http://127.0.0.1.evil.com:80']) assert.throws(() => createZendeskSource({ mode: { kind: 'local-test', origin, accountId: 'fixture-a' }, credential: () => TOKEN }), /ORIGEN_DE_ENSAYO_NO_LOCAL/, origin);
  for (const accountId of ['acme', 'Fixture-a', 'fixture-', 'fixture-a b']) assert.throws(() => createZendeskSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:1', accountId }, credential: () => TOKEN }), /CUENTA_DE_ENSAYO_NO_VALIDA/, accountId);
  await withServer((_req, res) => send(res, 200, page([ticket(1)], false)), async server => { const local = await source(server.origin).readTickets(); assert.equal(local.provider, 'zendesk-fixture'); assert.ok(readingObservations(local).every(o => o.reference.provider !== 'zendesk')); });
  for (const limits of [{ pageSize: 101 }, { pageSize: 0 }, { maxPages: 21 }, { maxRecords: 501 }, { maxBodyBytes: 9 * 1024 * 1024 }]) assert.throws(() => createZendeskSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:1', accountId: 'fixture-a' }, credential: () => TOKEN, limits }), /LIMITES_NO_VALIDOS/);
});

test('VALORES DESCONOCIDOS, REGISTROS ILEGIBLES Y DUPLICADOS: se omiten con contador y la lectura es PARCIAL; un estado futuro nunca se toma por sano', async () => {
  await withServer((_req, res) => send(res, 200, page([ticket(1), ticket(2, 'deleted'), ticket(3, 'custom-stage'), { status: 'open' }, { id: '4', status: 'open' }, { id: 1.5, status: 'open' }, 'texto', null, ticket(5, 'open', { updated_at: '2026-11-08T08:00:00Z' }), ticket(5, 'solved', { updated_at: '2026-11-08T09:00:00Z' })], false)), async server => {
    const reading = await source(server.origin).readTickets();
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.stoppedBy, null); assert.deepEqual(reading.skipped, { unknownValue: 2, malformed: 5, duplicates: 1 });
    assert.deepEqual(reading.records.map(r => [r.remoteId, r.condition]), [['1', 'clear'], ['5', 'completed']], 'se conserva el duplicado más reciente');
    assert.ok(readingObservations(reading).every(o => o.coverage === 'partial'));
  });
  await withServer((_req, res) => send(res, 200, { ticket: ticket(77, 'archived-x') }), async server => {
    const lookup = await source(server.origin).readTicket(77); assert.equal(lookup.coverage, 'unavailable'); assert.equal(lookup.stoppedBy, 'unsupported-value'); assert.equal(readingObservations(lookup)[0]!.condition, null);
  });
  await withServer((_req, res) => send(res, 200, { ticket: ticket(78) }), async server => { const lookup = await source(server.origin).readTicket(77); assert.equal(lookup.stoppedBy, 'malformed', 'otro ID del pedido: no se acepta'); });
  await withServer((_req, res) => send(res, 200, { ticket: ticket(77) }), async server => {
    const ok = await source(server.origin).readTicket('77'); assert.equal(ok.coverage, 'complete'); assert.equal(ok.mode, 'lookup'); assert.equal(server.hits[0]!.url, '/api/v2/tickets/77'); assert.equal(readingObservations(ok)[0]!.coverage, 'complete');
  });
  for (const bad of ['0', '-1', '1.5', '1e3', 'abc', '7/../x', '12345678901234567', '']) await assert.rejects(source('http://127.0.0.1:1').readTicket(bad), /ID_DE_TICKET_NO_VALIDO/, bad);
  assert.equal(normalizeZendeskTicket(ticket(1, 'open', { id: Number.MAX_SAFE_INTEGER + 2 }), { provider: 'zendesk-fixture', accountId: 'fixture-a' }).kind, 'malformed');
  assert.equal(parseZendeskTicketsPage({ tickets: [], meta: { has_more: false, after_cursor: 'x y' } }), null);
});

test('LA POLÍTICA ES EXPLÍCITA: `hold` bloquea por defecto, la lista de estados bloqueantes se puede cambiar y solved/closed son «completado» sin demostrar el compromiso', () => {
  const account = { provider: 'zendesk-fixture', accountId: 'fixture-a' }, condition = (status: string, policy?: Parameters<typeof normalizeZendeskTicket>[2]) => { const r = normalizeZendeskTicket(ticket(1, status), account, policy); return r.kind === 'record' ? r.record.condition : r.kind; };
  assert.deepEqual(['new', 'open', 'pending', 'hold', 'solved', 'closed', 'otro'].map(s => condition(s)), ['clear', 'clear', 'clear', 'blocked', 'completed', 'completed', 'unknown-value']);
  assert.deepEqual(['pending', 'hold', 'solved'].map(s => condition(s, { blockedStatuses: ['pending'], includeSubject: false })), ['blocked', 'clear', 'completed']);
});

test('AISLAMIENTO: el mismo ID de ticket en dos cuentas es dos referencias distintas, y el adaptador no vincula nada por ID ni por nombre ni por la referencia externa que guarda el proveedor', async () => {
  const body = page([ticket(42, 'hold', { external_id: 'PEDIDO-4821', subject: 'Instalación Almacén Norte' })], false);
  await withServer((_req, res) => send(res, 200, body), async server => {
    const a = await source(server.origin, {}, 'fixture-support-a').readTickets(), b = await source(server.origin, {}, 'fixture-support-b').readTickets();
    const [oa] = readingObservations(a), [ob] = readingObservations(b);
    assert.notEqual(keyOf(oa!.reference), keyOf(ob!.reference)); assert.equal(oa!.reference.remoteId, ob!.reference.remoteId);
    assert.equal(a.records[0]!.externalRef, 'PEDIDO-4821', 'se conserva como dato'); assert.ok(!('links' in a) && !('links' in a.records[0]!));
    const only = projectCommitmentEvidence(definition([{ reference: oa!.reference, basis: 'explicit' }]), [oa!, ob!], NOW)[2]!;
    assert.equal(only.state, 'observed'); assert.equal(only.observation!.reference.accountId, 'fixture-support-a');
    const ambiguous = projectCommitmentEvidence(definition([{ reference: oa!.reference, basis: 'candidate' }, { reference: ob!.reference, basis: 'candidate' }]), [oa!, ob!], NOW)[2]!;
    assert.equal(ambiguous.state, 'ambiguous'); assert.equal(ambiguous.observation, null, 'un candidato jamás aporta observación');
    assert.deepEqual(projectCommitmentEvidence(definition([]), [oa!, ob!], NOW).map(e => e.state), ['missing', 'missing', 'missing'], 'sin vínculo declarado, nada se atribuye');
  });
});

test('EL RADAR LO LEE COMO ES: bloqueo observado, lectura parcial, no disponible y fuente vieja se proyectan a estados distintos con el contrato aceptado', async () => {
  await withServer((req, res) => { const id = req.url!.match(/tickets\/(\d+)/)?.[1]; if (id === '3') return send(res, 403, {}); if (id) return send(res, 200, { ticket: ticket(Number(id), id === '1' ? 'hold' : 'open') }); return send(res, 200, page([ticket(10)], true, 'm1')); }, async server => {
    const s = source(server.origin), blocked = readingObservations(await s.readTicket(1))[0]!, clear = readingObservations(await s.readTicket(2))[0]!, down = readingObservations(await s.readTicket(3))[0]!;
    const partial = readingObservations(await source(server.origin, { limits: { maxPages: 1 } }).readTickets())[0]!;
    const state = (observation: typeof blocked, at = NOW) => projectCommitmentEvidence(definition([{ reference: observation.reference, basis: 'explicit' }]), [observation], at)[2]!;
    assert.deepEqual([state(blocked), state(clear), state(down), state(partial)].map(e => [e.state, e.observation!.condition]), [['observed', 'blocked'], ['observed', 'clear'], ['unavailable', null], ['partial', 'clear']]);
    assert.equal(state(blocked, NOW + 25 * 3_600_000).state, 'stale', 'la misma lectura caduca con el reloj del Radar');
    const reading = await s.readTicket(2);
    assert.equal(isReadingFresh(reading, NOW), true); assert.equal(isReadingFresh(reading, NOW + 25 * 3_600_000), false); assert.equal(isReadingFresh(reading, NOW - 1), false, 'una lectura del futuro no es reciente');
  });
});

test('CANCELACIÓN: una señal ya cancelada no sale a la red y una cancelada durante la petición cierra la lectura como cancelada', async () => {
  await withServer(() => undefined, async server => {
    const done = new AbortController(); done.abort();
    const before = await source(server.origin).readTickets({ signal: done.signal }); assert.equal(before.stoppedBy, 'aborted'); assert.equal(server.hits.length, 0); assert.equal(before.requests, 0);
    const live = new AbortController(), pending = source(server.origin, { limits: { requestTimeoutMs: 5000 } }).readTickets({ signal: live.signal }); setTimeout(() => live.abort(), 50);
    const during = await pending; assert.equal(during.coverage, 'unavailable'); assert.equal(during.stoppedBy, 'aborted');
  });
});

test('CREDENCIAL: se pide en cada petición, sin credencial no sale nada, y el token no aparece en ninguna lectura, bloqueo ni error', async () => {
  let asked = 0;
  await withServer((_req, res) => send(res, 200, page([ticket(1)], false)), async server => {
    const reading = await source(server.origin, { credential: () => { asked++; return TOKEN; } }).readTickets(); assert.equal(asked, 1);
    const none = await source(server.origin, { credential: () => { throw new Error('no hay token ' + TOKEN); } }).readTickets(); assert.equal(none.stoppedBy, 'unauthorized'); assert.equal(none.requests, 0); assert.equal(server.hits.length, 1);
    assert.ok(!JSON.stringify([reading, none]).includes(TOKEN));
  });
});

test('LA LECTURA SE AUTOVALIDA: el esquema rechaza completa con omitidos, no disponible con registros, parcial sin explicación y registros de otra cuenta', () => {
  const base: SourceReading = { format: 'planb-source-reading-v1', provider: 'zendesk-fixture', accountId: 'fixture-a', objectType: 'ticket', mode: 'listing', target: null, startedAt: new Date(NOW).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1, records: [], skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null };
  const record = { provider: 'zendesk-fixture', accountId: 'fixture-a', objectType: 'ticket', remoteId: '1', kind: 'support' as const, condition: 'clear' as const, updatedAt: null, label: 'x', externalRef: null, related: [] };
  assert.equal(sourceReading.safeParse(base).success, true);
  for (const bad of [{ ...base, skipped: { ...base.skipped, unknownValue: 1 } }, { ...base, stoppedBy: 'timeout' }, { ...base, pages: 0 }, { ...base, coverage: 'unavailable', pages: 0, records: [record] }, { ...base, coverage: 'partial' }, { ...base, records: [{ ...record, accountId: 'fixture-b' }] }, { ...base, records: [record, record] }, { ...base, completedAt: new Date(NOW - 1).toISOString() }, { ...base, mode: 'lookup' }, { ...base, target: { kind: 'support', remoteId: '1' } }, { ...base, records: [{ ...record, condition: null }] }, { ...base, extra: 1 }]) assert.equal(sourceReading.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 120));
});

test('CONTENT-LENGTH MENTIROSO: si lo declarado no coincide con lo recibido la respuesta se rechaza entera como truncada, aunque el cuerpo sea un JSON válido', async () => {
  const fake = (async () => new Response('{"tickets":[],"meta":{"has_more":false}}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '9999' } })) as unknown as typeof fetch;
  const reading = await createZendeskSource({ mode: { kind: 'live', subdomain: 'acme-demo' }, credential: () => TOKEN, fetch: fake, now: () => NOW }).readTickets();
  assert.equal(reading.coverage, 'unavailable'); assert.equal(reading.stoppedBy, 'truncated'); assert.deepEqual(reading.records, []);
});

// ───────────────────────────── R2 · frontera del esquema y límites propios del transporte ─────────────────────────────
// Banco con `fetch` y `ReadableStream` SINTÉTICOS gobernados por barreras: un `fetch` o un `reader.read` que ignoran la señal no pueden dejar la lectura colgada ni publicar un resultado completo tardío. Cada barrera
// se libera SIEMPRE en `finally`; el plazo de observación (150 ms) es distinto del del transporte (30–40 ms).
const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const synthetic = (fetcher: typeof fetch, limits: Partial<{ requestTimeoutMs: number; totalTimeoutMs: number; maxPages: number }> = {}) => createZendeskSource({ mode: { kind: 'live', subdomain: 'fixture-only' }, credential: () => TOKEN, fetch: fetcher, now: () => NOW, limits: { requestTimeoutMs: 30, totalTimeoutMs: 400, ...limits } });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); const safety = setTimeout(() => release(), 800); return { promise, release: () => { clearTimeout(safety); release(); } }; };
async function noUnhandled<T>(body: () => Promise<T>) { const seen: unknown[] = [], on = (reason: unknown) => { seen.push(reason); }; process.on('unhandledRejection', on); try { const value = await body(); await tick(60); assert.deepEqual(seen, [], 'ninguna promesa abandonada produjo un rechazo no atendido'); return value; } finally { process.off('unhandledRejection', on); } }
const lookupBase = (): SourceReading => ({ format: 'planb-source-reading-v1', provider: 'zendesk-fixture', accountId: 'fixture-one', objectType: 'ticket', mode: 'lookup', target: { kind: 'support', remoteId: '7' }, startedAt: new Date(NOW).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1,
  records: [{ provider: 'zendesk-fixture', accountId: 'fixture-one', objectType: 'ticket', remoteId: '7', kind: 'support', condition: 'blocked', updatedAt: null, label: 'Ticket #7', externalRef: null, related: [] }], skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null });

test('R2 · FRONTERA DEL ESQUEMA: un registro de otro ID, de otro rol o de otro tipo de objeto NO se acepta ni se convierte en observación; los casos legítimos se conservan', () => {
  assert.equal(sourceReading.safeParse(lookupBase()).success, true);
  const otherId = lookupBase(); otherId.records[0]!.remoteId = '8';
  const otherRole = lookupBase(); otherRole.records[0]!.kind = 'sale';
  const otherType = lookupBase(); otherType.records[0]!.objectType = 'organization';
  for (const [name, reading] of [['otro ID', otherId], ['otro rol', otherRole], ['otro tipo de objeto', otherType]] as const) {
    assert.equal(sourceReading.safeParse(reading).success, false, name); assert.throws(() => readingObservations(reading), Error, name + ': no se proyecta');
  }
  const unavailable: SourceReading = { ...lookupBase(), coverage: 'unavailable', stoppedBy: 'forbidden', pages: 0, records: [] }; assert.equal(sourceReading.safeParse(unavailable).success, true, 'consulta no disponible sin registro');
  assert.equal(readingObservations(unavailable)[0]!.reference.remoteId, '7');
  const emptyListing: SourceReading = { ...lookupBase(), mode: 'listing', target: null, records: [] }; assert.equal(sourceReading.safeParse(emptyListing).success, true, 'listado vacío con fin explícito');
  const context: SourceReading = { ...emptyListing, objectType: 'organization', records: [{ provider: 'zendesk-fixture', accountId: 'fixture-one', objectType: 'organization', remoteId: '3', kind: null, condition: null, updatedAt: null, label: 'Organización #3', externalRef: null, related: [] }] };
  assert.equal(sourceReading.safeParse(context).success, true, 'objeto de contexto sin rol'); assert.deepEqual(readingObservations(context), [], 'un objeto de contexto no se proyecta al Radar');
});

test('R2 · UN FETCH QUE IGNORA LA SEÑAL no publica nada tardío: éxito tras abortar y éxito tras el plazo se descartan con su categoría', async () => {
  await noUnhandled(async () => {
    const caller = new AbortController();
    const abortedLate = synthetic((async () => { await tick(15); return jsonResponse({ ticket: ticket(7, 'hold') }); }) as typeof fetch).readTicket(7, { signal: caller.signal }); caller.abort();
    const a = await abortedLate; assert.equal(a.coverage, 'unavailable'); assert.equal(a.stoppedBy, 'aborted'); assert.deepEqual(a.records, []); assert.deepEqual(readingObservations(a).map(o => o.coverage), ['unavailable']);
    const timedOut = await synthetic((async () => { await tick(100); return jsonResponse({ ticket: ticket(7, 'hold') }); }) as typeof fetch).readTicket(7); assert.equal(timedOut.coverage, 'unavailable'); assert.equal(timedOut.stoppedBy, 'timeout'); assert.deepEqual(timedOut.records, []);
  });
});

test('R2 · UN CUERPO QUE SIGUE ENTREGANDO TRAS ABORTAR no se publica', async () => {
  await noUnhandled(async () => {
    const caller = new AbortController(); let done = false;
    const fetcher = (async () => new Response(new ReadableStream({ pull(controller) { if (done) return; done = true; caller.abort(); controller.enqueue(new TextEncoder().encode(JSON.stringify({ ticket: ticket(7, 'hold') }))); controller.close(); } }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const r = await synthetic(fetcher).readTicket(7, { signal: caller.signal }); assert.equal(r.coverage, 'unavailable'); assert.equal(r.stoppedBy, 'aborted'); assert.deepEqual(r.records, []);
  });
});

test('R2 · FETCH RETENIDO: la lectura vence en su plazo (no espera a que se libere el transporte), la respuesta tardía se descarta, su cuerpo se cancela y no hay rechazo no atendido', async () => {
  await noUnhandled(async () => {
    const barrier = gate(); let cancelled = false, settled = false;
    try {
      const pending = synthetic((async () => { await barrier.promise; return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ ticket: ticket(7, 'hold') }))); c.close(); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }); }) as typeof fetch).readTicket(7).then(r => { settled = true; return r; });
      await tick(150); assert.equal(settled, true, 'resolvió dentro del plazo aunque fetch siga retenido'); const r = await pending; assert.equal(r.stoppedBy, 'timeout'); assert.equal(r.coverage, 'unavailable');
    } finally { barrier.release(); }
    await tick(40); assert.equal(cancelled, true, 'el cuerpo de la respuesta tardía se canceló');
  });
});

test('R2 · CUERPO RETENIDO: reader.read que ignora la señal tampoco cuelga la lectura; se cancela sin esperar una limpieza no cooperativa', async () => {
  await noUnhandled(async () => {
    const barrier = gate(); let cancelCalls = 0, settled = false;
    try {
      const fetcher = (async () => new Response(new ReadableStream({ async start(controller) { await barrier.promise; try { controller.enqueue(new TextEncoder().encode(JSON.stringify({ ticket: ticket(7, 'hold') }))); controller.close(); } catch { /* cancelado */ } }, cancel() { cancelCalls++; return new Promise<void>(() => undefined); } }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
      const pending = synthetic(fetcher).readTicket(7).then(r => { settled = true; return r; });
      await tick(150); assert.equal(settled, true, 'resolvió aunque el cuerpo siga retenido y su cancelación nunca termine'); const r = await pending; assert.equal(r.stoppedBy, 'timeout'); assert.equal(r.coverage, 'unavailable'); assert.ok(cancelCalls >= 1, 'se pidió cancelar el cuerpo');
    } finally { barrier.release(); }
  });
});

test('R2 · PLAZO TOTAL: una lectura paginada lenta o con una página retenida termina parcial dentro del plazo total, con lo ya leído marcado parcial', async () => {
  await noUnhandled(async () => {
    let calls = 0; const started = Date.now();
    const slow = await synthetic((async () => { calls++; await tick(45); return jsonResponse(page([ticket(calls)], true, 'p' + calls)); }) as typeof fetch, { requestTimeoutMs: 1000, totalTimeoutMs: 110, maxPages: 10 }).readTickets();
    assert.equal(slow.coverage, 'partial'); assert.equal(slow.stoppedBy, 'timeout'); assert.ok(slow.records.length >= 1 && slow.records.length < 10); assert.ok(readingObservations(slow).every(o => o.coverage === 'partial')); assert.ok(Date.now() - started < 600, 'acotada por el plazo total');
    const barrier = gate(); let second = 0;
    try {
      const stalled = await synthetic((async () => { second++; if (second === 1) return jsonResponse(page([ticket(1)], true, 'q1')); await barrier.promise; return jsonResponse(page([ticket(2)], false)); }) as typeof fetch, { requestTimeoutMs: 1000, totalTimeoutMs: 110, maxPages: 10 }).readTickets();
      assert.equal(stalled.coverage, 'partial'); assert.equal(stalled.stoppedBy, 'timeout'); assert.deepEqual(stalled.records.map(r => r.remoteId), ['1']);
    } finally { barrier.release(); }
  });
});

test('R2 · ERROR TARDÍO: un fetch que rechaza después del plazo no produce rechazo no atendido ni cambia el resultado; una señal ya abortada no sale a la red', async () => {
  await noUnhandled(async () => {
    let calls = 0;
    const late = await synthetic((async () => { calls++; await tick(90); throw new Error('error tardío ' + TOKEN); }) as typeof fetch).readTicket(7); assert.equal(late.stoppedBy, 'timeout'); assert.ok(!JSON.stringify(late).includes(TOKEN));
    const before = new AbortController(); before.abort(); calls = 0;
    const pre = await synthetic((async () => { calls++; return jsonResponse({ ticket: ticket(7, 'hold') }); }) as typeof fetch).readTicket(7, { signal: before.signal }); assert.equal(pre.stoppedBy, 'aborted'); assert.equal(calls, 0); assert.equal(pre.requests, 0);
  });
});

test('R2 · SIN OYENTES ACUMULADOS: tras muchas lecturas (con éxito, plazo y aborto) la señal del llamador no conserva oyentes', async () => {
  const caller = new AbortController(); const source = synthetic((async () => jsonResponse({ ticket: ticket(7, 'hold') })) as typeof fetch);
  for (let i = 0; i < 40; i++) assert.equal((await source.readTicket(7, { signal: caller.signal })).coverage, 'complete');
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0, 'ninguno tras lecturas completas');
  const slow = synthetic((async () => { await tick(60); return jsonResponse({ ticket: ticket(7, 'hold') }); }) as typeof fetch);
  for (let i = 0; i < 5; i++) assert.equal((await slow.readTicket(7, { signal: caller.signal })).stoppedBy, 'timeout');
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0, 'ninguno tras plazos'); const pending = slow.readTicket(7, { signal: caller.signal }); caller.abort(); await pending;
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0, 'ninguno tras abortar');
});

// ───────────────────────────── R3 · excepción síncrona de fetch y puerta tras `credential` ─────────────────────────────
test('R3 · EXCEPCIÓN SÍNCRONA DE FETCH: se clasifica como fallo de transporte igual que un rechazo asíncrono, sin filtrar su mensaje ni la credencial, sin dejar oyentes, y los errores de validación de entradas siguen lanzando', async () => {
  const privateMessage = 'synthetic-private-message ' + TOKEN, caller = new AbortController();
  for (const [name, fetcher] of [['síncrona', (() => { throw new Error(privateMessage); }) as unknown as typeof fetch], ['asíncrona (control)', (async () => { throw new Error(privateMessage); }) as unknown as typeof fetch]] as const) {
    const source = synthetic(fetcher);
    const one = await source.readTicket(7, { signal: caller.signal }); assert.equal(one.coverage, 'unavailable', name); assert.equal(one.stoppedBy, 'network', name); assert.deepEqual(one.records, []); assert.equal(one.requests, 1, name + ': la petición sí se invocó');
    const many = await source.readTickets({ signal: caller.signal }); assert.equal(many.coverage, 'unavailable', name); assert.equal(many.stoppedBy, 'network', name);
    for (const reading of [one, many]) assert.ok(!JSON.stringify(reading).includes('synthetic-private-message') && !JSON.stringify(reading).includes(TOKEN), name + ': sin el mensaje privado ni la credencial');
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0, name + ': sin oyentes acumulados');
  }
  assert.throws(() => createZendeskSource({ mode: { kind: 'live', subdomain: 'evil.com/x' }, credential: () => TOKEN, fetch: (() => { throw new Error('no debe llamarse'); }) as unknown as typeof fetch }), /SUBDOMINIO_NO_VALIDO/, 'la validación de creación no se oculta bajo una lectura falsa');
  await assert.rejects(synthetic((() => { throw new Error('no debe llamarse'); }) as unknown as typeof fetch).readTicket('abc'), /ID_DE_TICKET_NO_VALIDO/, 'ni la del ID de entrada');
});

test('R3 · TRAS CREDENCIAL: si el callback aborta la señal o agota el plazo total, no se cuenta la petición ni se invoca fetch', async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return jsonResponse({ ticket: ticket(7, 'hold') }); }) as typeof fetch;
  const controller = new AbortController();
  const aborting = createZendeskSource({ mode: { kind: 'live', subdomain: 'fixture-only' }, credential: () => { controller.abort(); return TOKEN; }, fetch: fetcher, now: () => NOW });
  const a = await aborting.readTicket(7, { signal: controller.signal }); assert.equal(a.coverage, 'unavailable'); assert.equal(a.stoppedBy, 'aborted'); assert.equal(a.requests, 0, 'ninguna petición contada'); assert.equal(calls, 0, 'fetch no se invocó'); assert.deepEqual(readingObservations(a).map(o => o.coverage), ['unavailable']);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const slowCredential = createZendeskSource({ mode: { kind: 'live', subdomain: 'fixture-only' }, credential: () => { const end = performance.now() + 45; while (performance.now() < end) { /* un callback local lento que consume el plazo total */ } return TOKEN; }, fetch: fetcher, now: () => NOW, limits: { requestTimeoutMs: 1000, totalTimeoutMs: 30 } });
  const t = await slowCredential.readTicket(7); assert.equal(t.coverage, 'unavailable'); assert.equal(t.stoppedBy, 'timeout'); assert.equal(t.requests, 0); assert.equal(calls, 0);
  const listing = await createZendeskSource({ mode: { kind: 'live', subdomain: 'fixture-only' }, credential: () => { controller.abort(); return TOKEN; }, fetch: fetcher, now: () => NOW }).readTickets({ signal: controller.signal }); assert.equal(listing.stoppedBy, 'aborted'); assert.equal(calls, 0);
  const control = await synthetic(fetcher).readTicket(7); assert.equal(control.coverage, 'complete', 'control: sin cancelación la lectura se completa'); assert.equal(calls, 1);
});
