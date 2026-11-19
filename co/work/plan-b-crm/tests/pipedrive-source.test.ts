import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { projectCommitmentEvidence, type CommitmentDefinition } from '../shared/commitments.js';
import { readingObservations, sourceReading } from '../shared/source-reading.js';
import { normalizePipedriveRecord, parsePipedrivePage } from '../shared/pipedrive-source.js';
import { createPipedriveSource, type PipedriveSourceOptions } from '../server/pipedrive-source.js';

// Adaptador de Pipedrive (API v2): SOLO respuestas sintéticas y servidores de bucle local. Ninguna prueba toca la red, una cuenta ni una credencial reales: el token es una cadena inventada que además se
// comprueba que no aparece en ninguna salida ni en ninguna URL. Una prueba sintética acredita IMPLEMENTACIÓN, no acceso a Pipedrive.
const NOW = Date.parse('2026-11-08T10:00:00.000Z'), TOKEN = 'TEST-PIPE-TOKEN-5b7e21c9';
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
const deal = (id: number, status = 'open', extra: Record<string, unknown> = {}) => ({ id, title: 'Título con datos personales de Ana', status, update_time: '2026-11-08T09:30:00Z', is_deleted: false, person_id: 11, org_id: 21, ...extra });
const page = (data: unknown[], next: string | null) => ({ success: true, data, additional_data: { next_cursor: next } });
const source = (origin: string, extra: Partial<PipedriveSourceOptions> = {}, accountId = 'fixture-crm-a') => createPipedriveSource({ mode: { kind: 'local-test', origin, accountId }, credential: () => ({ scheme: 'api-token', token: TOKEN }), now: () => NOW, ...extra });
async function withServer<T>(handler: Handler, body: (s: Awaited<ReturnType<typeof serve>>) => Promise<T>) { const s = await serve(handler); try { return await body(s); } finally { await s.close(); } }
const keyOf = (r: { provider: string; accountId: string; kind: string; remoteId: string }) => JSON.stringify([r.provider, r.accountId, r.kind, r.remoteId]);
const definition = (links: CommitmentDefinition['links']): CommitmentDefinition => ({ id: 'caso', title: 'Caso', dueAt: new Date(NOW + 3_600_000).toISOString(), links });
const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const live = (fetcher: typeof fetch, limits: NonNullable<PipedriveSourceOptions['limits']> = {}) => createPipedriveSource({ mode: { kind: 'live', companyDomain: 'fixture-only' }, credential: () => ({ scheme: 'api-token', token: TOKEN }), fetch: fetcher, now: () => NOW, limits: { requestTimeoutMs: 30, totalTimeoutMs: 400, ...limits } });

test('LECTURA COMPLETA de oportunidades: tres páginas por cursor, cada observación conserva proveedor, cuenta, rol, ID remoto, instante y cobertura; solo GET, la credencial va en x-api-token y nunca en la URL', async () => {
  await withServer((req, res) => {
    const cursor = new URL(req.url!, 'http://x').searchParams.get('cursor');
    if (!cursor) send(res, 200, page([deal(1), deal(2, 'lost')], 'c+1/='));
    else if (cursor === 'c+1/=') send(res, 200, page([deal(3, 'won')], 'c2'));
    else send(res, 200, page([deal(4)], null));
  }, async server => {
    const reading = await source(server.origin).read('deal');
    assert.equal(sourceReading.safeParse(reading).success, true); assert.equal(reading.coverage, 'complete'); assert.equal(reading.pages, 3); assert.equal(reading.requests, 3); assert.equal(reading.objectType, 'deal');
    assert.deepEqual(reading.records.map(r => [r.remoteId, r.condition]), [['1', 'clear'], ['2', 'blocked'], ['3', 'completed'], ['4', 'clear']]);
    const observations = readingObservations(reading); assert.equal(observations.length, 4);
    for (const o of observations) { assert.equal(o.reference.provider, 'pipedrive-fixture'); assert.equal(o.reference.accountId, 'fixture-crm-a'); assert.equal(o.reference.kind, 'sale'); assert.equal(o.observedAt, new Date(NOW).toISOString()); assert.equal(o.coverage, 'complete'); }
    assert.deepEqual(server.hits.map(h => h.method), ['GET', 'GET', 'GET']); assert.equal(server.hits[0]!.url, '/api/v2/deals?limit=100'); assert.equal(server.hits[1]!.url, '/api/v2/deals?limit=100&cursor=c%2B1%2F%3D', 'el cursor opaco se envía codificado');
    for (const hit of server.hits) { assert.equal(hit.headers['x-api-token'], TOKEN); assert.equal(hit.headers.authorization, undefined); assert.ok(!hit.url.includes(TOKEN) && !/api_token/i.test(hit.url), 'la credencial no va en la URL'); }
    assert.ok(!JSON.stringify(reading).includes(TOKEN));
  });
});

test('OAUTH BEARER: con el esquema bearer la credencial va en Authorization y no en x-api-token', async () => {
  await withServer((_req, res) => send(res, 200, page([deal(1)], null)), async server => {
    const reading = await source(server.origin, { credential: () => ({ scheme: 'bearer', token: TOKEN }) }).read('deal'); assert.equal(reading.coverage, 'complete');
    assert.equal(server.hits[0]!.headers.authorization, 'Bearer ' + TOKEN); assert.equal(server.hits[0]!.headers['x-api-token'], undefined);
  });
});

test('CONDICIÓN DE OPORTUNIDADES: won completado, open sin bloqueo, lost y eliminada bloqueadas (con etiqueta propia), archivada rotulada, estado desconocido OMITIDO con contador; la política de «perdida» es configurable; la etiqueta no copia el título', async () => {
  await withServer((_req, res) => send(res, 200, page([deal(1, 'won'), deal(2, 'open'), deal(3, 'lost'), deal(4, 'deleted'), deal(5, 'open', { is_deleted: true }), deal(6, 'open', { is_archived: true }), deal(7, 'futuro-estado'), deal(8, 'open', { status: undefined })], null)), async server => {
    const reading = await source(server.origin).read('deal'); const by = (id: string) => reading.records.find(r => r.remoteId === id)!;
    assert.deepEqual(['1', '2', '3', '4', '5'].map(id => by(id).condition), ['completed', 'clear', 'blocked', 'blocked', 'blocked']); assert.match(by('5').label, /eliminada/); assert.match(by('6').label, /archivada/);
    assert.equal(reading.coverage, 'partial'); assert.equal(reading.skipped.unknownValue, 2); assert.ok(!JSON.stringify(reading).includes('Ana'), 'sin el título');
    const clear = await source(server.origin, { policy: { lostIs: 'clear' } }).read('deal'); assert.equal(clear.records.find(r => r.remoteId === '3')!.condition, 'clear');
  });
});

test('OBJETOS DE CONTEXTO: personas, organizaciones y actividades conservan identidad y relaciones pero NUNCA se proyectan al Radar ni crean vínculos; una actividad sin `done` booleano se omite', async () => {
  const responses: Record<string, unknown> = {
    '/api/v2/persons': page([{ id: 11, name: 'Ana Pérez', org_id: 21, update_time: '2026-11-08T09:00:00Z' }, { id: 12, name: 'Sin organización' }], null),
    '/api/v2/organizations': page([{ id: 21, name: 'Empresa de Ana' }], null),
    '/api/v2/activities': page([{ id: 31, done: false, subject: 'Llamar a Ana', deal_id: 1, person_id: 11, org_id: 21 }, { id: 32, done: 'no', subject: 'x' }, { id: 33, done: true, deal_id: 'no' }], null),
  };
  await withServer((req, res) => send(res, 200, responses[new URL(req.url!, 'http://x').pathname]), async server => {
    const s = source(server.origin);
    const persons = await s.read('person'), orgs = await s.read('organization'), activities = await s.read('activity');
    assert.deepEqual(persons.records.map(r => [r.remoteId, r.kind, r.condition, r.related]), [['11', null, null, [{ objectType: 'organization', remoteId: '21' }]], ['12', null, null, []]]);
    assert.deepEqual(orgs.records.map(r => [r.objectType, r.remoteId, r.kind]), [['organization', '21', null]]);
    assert.deepEqual(activities.records.map(r => [r.remoteId, r.related.map(x => x.objectType + ':' + x.remoteId)]), [['31', ['deal:1', 'person:11', 'organization:21']], ['33', []]]); assert.equal(activities.coverage, 'partial'); assert.equal(activities.skipped.unknownValue, 1);
    for (const reading of [persons, orgs, activities]) assert.deepEqual(readingObservations(reading), [], reading.objectType + ': nada se proyecta al Radar');
    assert.ok(!JSON.stringify([persons, orgs, activities]).match(/Ana|Llamar|Empresa/), 'sin nombres, asuntos ni títulos'); assert.ok(persons.records.every(r => !('links' in r)));
    assert.equal(server.hits[0]!.url, '/api/v2/persons?limit=100');
  });
});

test('PÁGINA VACÍA, FIN SIN INDICADOR Y PAGINACIÓN INCOMPLETA: solo `next_cursor: null` explícito cierra; sin additional_data, sin la clave, con success falso o con cursores no válidos la respuesta se rechaza; presupuestos y cursor repetido dan lectura PARCIAL', async () => {
  await withServer((_req, res) => send(res, 200, page([], null)), async server => { const empty = await source(server.origin).read('deal'); assert.equal(empty.coverage, 'complete'); assert.deepEqual(readingObservations(empty), []); });
  for (const body of [{ success: true, data: [] }, { success: true, data: [], additional_data: {} }, { success: false, data: [], additional_data: { next_cursor: null } }, { success: true, additional_data: { next_cursor: null } }, { success: true, data: [], additional_data: { next_cursor: 7 } }, { success: true, data: [], additional_data: [] }, [], null, 'texto']) {
    await withServer((_req, res) => send(res, 200, JSON.stringify(body)), async server => { const r = await source(server.origin).read('deal'); assert.equal(r.coverage, 'unavailable', JSON.stringify(body)); assert.equal(r.stoppedBy, 'malformed'); });
  }
  let n = 0;
  await withServer((_req, res) => { n++; send(res, 200, page([], 'cursor-' + n)); }, async server => { const r = await source(server.origin, { limits: { maxPages: 3 } }).read('deal'); assert.equal(r.coverage, 'partial'); assert.equal(r.stoppedBy, 'page-budget'); assert.equal(server.hits.length, 3, 'una página vacía con cursor no cierra'); });
  await withServer((_req, res) => send(res, 200, page([deal(1), deal(2), deal(3)], 'k1')), async server => { const r = await source(server.origin, { limits: { maxRecords: 2 } }).read('deal'); assert.equal(r.stoppedBy, 'record-budget'); assert.equal(r.records.length, 2); });
  let calls = 0;
  await withServer((_req, res) => { calls++; send(res, 200, page([deal(calls)], 'same')); }, async server => { const r = await source(server.origin).read('deal'); assert.equal(r.coverage, 'partial'); assert.equal(r.stoppedBy, 'cursor-loop'); assert.equal(server.hits.length, 2); });
  for (const cursor of ['con espacio', 'a'.repeat(1025), '', 'https://evil.example/x?y=1&z=2 3']) {
    let c = 0;
    await withServer((_req, res) => { c++; send(res, 200, c === 1 ? page([deal(1)], 'ok1') : { success: true, data: [deal(2)], additional_data: { next_cursor: cursor } }); }, async server => { const r = await source(server.origin).read('deal'); assert.equal(r.coverage, 'partial', cursor); assert.equal(r.stoppedBy, 'malformed'); assert.equal(server.hits.length, 2); });
  }
  assert.equal(parsePipedrivePage({ success: true, data: [], additional_data: { next_cursor: 'abc+/=_.~-' } })?.nextCursor, 'abc+/=_.~-');
});

test('PERMISOS Y ACCESO por objeto: 403/401/404/5xx en la primera página = no disponible (un 403 con página HTML no se copia); 403 tardío = parcial con lo leído; consulta de oportunidad no disponible = observación sin condición', async () => {
  for (const [status, stop] of [[403, 'forbidden'], [401, 'unauthorized'], [404, 'not-found'], [500, 'server-error'], [418, 'client-error']] as const) {
    await withServer((_req, res) => { res.writeHead(status, { 'content-type': 'text/html' }); res.end('<html>SECRETO-CLOUDFLARE ' + TOKEN + '</html>'); }, async server => {
      for (const object of ['deal', 'person', 'organization', 'activity'] as const) { const r = await source(server.origin).read(object); assert.equal(r.coverage, 'unavailable', object); assert.equal(r.stoppedBy, stop); assert.deepEqual(readingObservations(r), []); }
      const lookup = await source(server.origin).readDeal(55), [observation] = readingObservations(lookup);
      assert.equal(observation!.coverage, 'unavailable'); assert.equal(observation!.condition, null); assert.equal(observation!.reference.kind, 'sale'); assert.ok(!JSON.stringify([lookup, observation]).match(/SECRETO|TEST-PIPE/));
    });
  }
  let calls = 0;
  await withServer((_req, res) => { calls++; if (calls === 1) send(res, 200, page([deal(1), deal(2)], 'c1')); else send(res, 403, {}); }, async server => {
    const r = await source(server.origin).read('deal'); assert.equal(r.coverage, 'partial'); assert.equal(r.stoppedBy, 'forbidden'); assert.equal(r.records.length, 2); assert.ok(readingObservations(r).every(o => o.coverage === 'partial'));
  });
});

test('429 SIN Retry-After documentado: no se supone ninguno ni se reintenta; si llega en segundos se respeta (acotado)', async () => {
  for (const [header, expected] of [[undefined, null], ['7', 7], ['99999', 3600], ['Wed, 21 Oct 2026 07:28:00 GMT', null]] as const) {
    await withServer((_req, res) => send(res, 429, {}, header === undefined ? {} : { 'retry-after': header }), async server => {
      const r = await source(server.origin).read('deal'); assert.equal(r.coverage, 'unavailable'); assert.equal(r.stoppedBy, 'rate-limited'); assert.equal(r.retryAfterSeconds, expected, String(header)); assert.equal(server.hits.length, 1, 'sin reintento');
    });
  }
});

test('TIEMPO, TRUNCADO, TOPE DE BYTES Y REDIRECCIÓN: los límites del transporte común se aplican también a Pipedrive', async () => {
  await withServer(() => undefined, async server => { const r = await source(server.origin, { limits: { requestTimeoutMs: 80 } }).read('deal'); assert.equal(r.coverage, 'unavailable'); assert.equal(r.stoppedBy, 'timeout'); });
  await withServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000' }); res.write('{"success":true,"data":['); setTimeout(() => res.destroy(), 20); }, async server => { const r = await source(server.origin).read('deal'); assert.equal(r.stoppedBy, 'truncated'); assert.deepEqual(r.records, []); });
  const body = JSON.stringify(page([deal(1)], null)), size = Buffer.byteLength(body);
  await withServer((_req, res) => send(res, 200, body), async server => {
    assert.equal((await source(server.origin, { limits: { maxBodyBytes: size } }).read('deal')).coverage, 'complete', 'EXACTAMENTE el tope es válido');
    const over = await source(server.origin, { limits: { maxBodyBytes: size - 1 } }).read('deal'); assert.equal(over.stoppedBy, 'oversize'); assert.deepEqual(over.records, []);
  });
  await withServer((_req, res) => send(res, 200, {}), async target => { await withServer((_req, res) => { res.writeHead(302, { location: target.origin + '/api/v2/deals?limit=100' }); res.end(); }, async first => { const r = await source(first.origin).read('deal'); assert.equal(r.stoppedBy, 'redirect'); assert.equal(target.hits.length, 0); }); });
});

test('MODOS, HOST Y LÍMITES: `live` solo construye https://{dominio}.pipedrive.com (fetch simulado, sin red); el tamaño de página se acota por objeto; `local-test` nunca produce el proveedor pipedrive', async () => {
  const urls: string[] = [];
  const fake = (async (url: string) => { urls.push(url); return jsonResponse(page([], null)); }) as unknown as typeof fetch;
  const s = createPipedriveSource({ mode: { kind: 'live', companyDomain: 'acme-demo' }, credential: () => ({ scheme: 'api-token', token: TOKEN }), fetch: fake, now: () => NOW, limits: { pageSize: 500 } });
  for (const object of ['deal', 'person', 'organization', 'activity'] as const) await s.read(object);
  assert.deepEqual(urls, ['https://acme-demo.pipedrive.com/api/v2/deals?limit=500', 'https://acme-demo.pipedrive.com/api/v2/persons?limit=100', 'https://acme-demo.pipedrive.com/api/v2/organizations?limit=500', 'https://acme-demo.pipedrive.com/api/v2/activities?limit=500'], 'personas: como mucho 100 (el máximo documentado de otros objetos no se extiende por analogía)');
  assert.equal((await s.read('deal')).provider, 'pipedrive'); assert.equal(s.accountId, 'acme-demo', 'accountId live = dominio configurado, no identidad observada');
  for (const bad of ['evil.com/x', 'a.b', '', 'ACME', '-x', 'x-', 'a'.repeat(64), 'acme.pipedrive.com', 'acme@evil', 'api/../x']) assert.throws(() => createPipedriveSource({ mode: { kind: 'live', companyDomain: bad }, credential: () => ({ scheme: 'api-token', token: TOKEN }) }), /DOMINIO_NO_VALIDO/, bad);
  for (const origin of ['http://example.com:80', 'https://127.0.0.1:1', 'http://127.0.0.1', 'http://127.0.0.1:80/x', 'http://acme.pipedrive.com:80']) assert.throws(() => createPipedriveSource({ mode: { kind: 'local-test', origin, accountId: 'fixture-a' }, credential: () => ({ scheme: 'bearer', token: TOKEN }) }), /ORIGEN_DE_ENSAYO_NO_LOCAL/, origin);
  for (const accountId of ['acme', 'Fixture-a', 'fixture-', 'fixture-a b']) assert.throws(() => createPipedriveSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:1', accountId }, credential: () => ({ scheme: 'bearer', token: TOKEN }) }), /CUENTA_DE_ENSAYO_NO_VALIDA/, accountId);
  for (const limits of [{ pageSize: 501 }, { pageSize: 0 }, { maxPages: 21 }, { maxRecords: 501 }, { maxBodyBytes: 9 * 1024 * 1024 }]) assert.throws(() => createPipedriveSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:1', accountId: 'fixture-a' }, credential: () => ({ scheme: 'api-token', token: TOKEN }), limits }), /LIMITES_NO_VALIDOS/);
  await withServer((_req, res) => send(res, 200, page([deal(1)], null)), async server => { const local = await source(server.origin).read('deal'); assert.equal(local.provider, 'pipedrive-fixture'); assert.ok(readingObservations(local).every(o => o.reference.provider !== 'pipedrive')); });
});

test('CONSULTA POR ID de oportunidad: 200 completa; otro ID, estado raro o forma ilegible no se acepta; 404/403 no disponible; IDs no válidos lanzan; solo las oportunidades tienen consulta por ID', async () => {
  await withServer((req, res) => { const id = Number(req.url!.match(/deals\/(\d+)/)?.[1]); if (id === 404) return send(res, 404, {}); if (id === 78) return send(res, 200, { success: true, data: deal(79) }); if (id === 77) return send(res, 200, { success: true, data: deal(77, 'archivada-x') }); if (id === 76) return send(res, 200, { success: true, data: 'texto' }); send(res, 200, { success: true, data: deal(id, id === 1 ? 'lost' : 'open') }); }, async server => {
    const s = source(server.origin), ok = await s.readDeal('1'); assert.equal(ok.coverage, 'complete'); assert.equal(ok.mode, 'lookup'); assert.equal(server.hits[0]!.url, '/api/v2/deals/1'); assert.equal(readingObservations(ok)[0]!.condition, 'blocked');
    assert.equal((await s.readDeal(78)).stoppedBy, 'malformed', 'otro ID'); const odd = await s.readDeal(77); assert.equal(odd.stoppedBy, 'unsupported-value'); assert.equal(readingObservations(odd)[0]!.condition, null); assert.equal((await s.readDeal(76)).stoppedBy, 'malformed'); assert.equal((await s.readDeal(404)).stoppedBy, 'not-found');
  });
  for (const bad of ['0', '-1', '1.5', '1e3', 'abc', '7/../x', '12345678901234567', '']) await assert.rejects(source('http://127.0.0.1:1').readDeal(bad), /ID_DE_OPORTUNIDAD_NO_VALIDO/, bad);
});

test('VALORES ILEGIBLES Y DUPLICADOS: se omiten con contador y la lectura es PARCIAL; se conserva el duplicado más reciente; IDs no enteros o enormes no se aceptan', () => {
  const account = { provider: 'pipedrive-fixture', accountId: 'fixture-a' };
  assert.equal(normalizePipedriveRecord('deal', { id: Number.MAX_SAFE_INTEGER + 2, status: 'open' }, account).kind, 'malformed'); assert.equal(normalizePipedriveRecord('deal', { id: '4', status: 'open' }, account).kind, 'malformed'); assert.equal(normalizePipedriveRecord('deal', 'texto', account).kind, 'malformed');
  const odd = normalizePipedriveRecord('deal', { id: 4, status: 'open', update_time: 'ayer', person_id: '9', org_id: 0 }, account); assert.equal(odd.kind, 'record'); if (odd.kind === 'record') { assert.equal(odd.record.updatedAt, null); assert.deepEqual(odd.record.related, []); }
});

test('AISLAMIENTO: el mismo ID de oportunidad en dos cuentas, o igual al de un ticket de otro proveedor, son referencias distintas; el adaptador no vincula por ID ni por nombre; el Radar solo usa el vínculo declarado', async () => {
  await withServer((_req, res) => send(res, 200, page([deal(42, 'lost', { title: 'Instalación Almacén Norte' })], null)), async server => {
    const a = await source(server.origin, {}, 'fixture-crm-a').read('deal'), b = await source(server.origin, {}, 'fixture-crm-b').read('deal'), [oa] = readingObservations(a), [ob] = readingObservations(b);
    assert.notEqual(keyOf(oa!.reference), keyOf(ob!.reference)); assert.equal(oa!.reference.remoteId, ob!.reference.remoteId);
    const zendeskLike = { ...oa!, reference: { ...oa!.reference, provider: 'zendesk-fixture', kind: 'support' as const } }; assert.notEqual(keyOf(zendeskLike.reference), keyOf(oa!.reference));
    const only = projectCommitmentEvidence(definition([{ reference: oa!.reference, basis: 'explicit' }]), [oa!, ob!], NOW)[0]!; assert.equal(only.state, 'observed'); assert.equal(only.observation!.reference.accountId, 'fixture-crm-a'); assert.equal(only.observation!.condition, 'blocked');
    const ambiguous = projectCommitmentEvidence(definition([{ reference: oa!.reference, basis: 'candidate' }, { reference: ob!.reference, basis: 'candidate' }]), [oa!, ob!], NOW)[0]!; assert.equal(ambiguous.state, 'ambiguous'); assert.equal(ambiguous.observation, null);
    assert.deepEqual(projectCommitmentEvidence(definition([]), [oa!, ob!], NOW).map(e => e.state), ['missing', 'missing', 'missing']);
    assert.equal(projectCommitmentEvidence(definition([{ reference: oa!.reference, basis: 'explicit' }]), [oa!], NOW + 25 * 3_600_000)[0]!.state, 'stale', 'la misma lectura caduca con el reloj del Radar');
  });
});

test('CREDENCIAL: se pide en cada petición, sin credencial no sale nada, un token con salto de línea se rechaza y el token no aparece en ninguna lectura ni error', async () => {
  let asked = 0;
  await withServer((_req, res) => send(res, 200, page([deal(1)], null)), async server => {
    const reading = await source(server.origin, { credential: () => { asked++; return { scheme: 'api-token', token: TOKEN }; } }).read('deal'); assert.equal(asked, 1);
    const none = await source(server.origin, { credential: () => { throw new Error('no hay token ' + TOKEN); } }).read('deal'); assert.equal(none.stoppedBy, 'unauthorized'); assert.equal(none.requests, 0);
    const crlf = await source(server.origin, { credential: () => ({ scheme: 'api-token', token: 'a\r\nHost: evil' }) }).read('deal'); assert.equal(crlf.stoppedBy, 'unauthorized'); assert.equal(server.hits.length, 1);
    assert.ok(!JSON.stringify([reading, none, crlf]).includes(TOKEN));
  });
});

test('LÍMITES PROPIOS (transporte común R2): un fetch que ignora la señal no publica nada tardío en Pipedrive y la lectura vence en su plazo', async () => {
  let settled = false;
  const pending = live((async () => { await tick(120); return jsonResponse(page([deal(1)], null)); }) as typeof fetch).read('deal').then(r => { settled = true; return r; });
  await tick(100); assert.equal(settled, true, 'resolvió dentro del plazo aunque fetch siga sin responder'); const r = await pending; assert.equal(r.coverage, 'unavailable'); assert.equal(r.stoppedBy, 'timeout'); assert.deepEqual(r.records, []);
  const caller = new AbortController(); const late = live((async () => { await tick(15); return jsonResponse(page([deal(1)], null)); }) as typeof fetch).read('deal', { signal: caller.signal }); caller.abort(); assert.equal((await late).stoppedBy, 'aborted');
});

// ───────────────────────────── R2 · indicadores ilegibles y fechas de calendario reales (dictamen 295) ─────────────────────────────
const dealRaw = (id: number, extra: Record<string, unknown> = {}) => ({ id, status: 'won', is_deleted: false, is_archived: false, update_time: '2026-11-08T09:00:00Z', ...extra });
const fx = { provider: 'pipedrive-fixture', accountId: 'fixture-r2' };
const resp = (data: unknown[], next: string | null = null) => jsonResponse(page(data, next));
const localLike = (fetcher: typeof fetch) => createPipedriveSource({ mode: { kind: 'local-test', origin: 'http://127.0.0.1:9', accountId: 'fixture-r2' }, credential: () => ({ scheme: 'api-token', token: TOKEN }), now: () => NOW, fetch: fetcher });

test('R2 · INDICADORES ILEGIBLES: is_deleted/is_archived de tipo no booleano (cadena, número, null, objeto, lista) omiten la oportunidad con contador y dejan la lectura parcial; nunca clear/completed con cobertura completa; true, false y ausente conservan su comportamiento', async () => {
  for (const field of ['is_deleted', 'is_archived']) for (const value of ['true', 'false', '', null, 0, 1, {}, []]) {
    const r = await localLike((async () => resp([dealRaw(10, { [field]: value })])) as typeof fetch).read('deal'), label = field + '=' + JSON.stringify(value);
    assert.equal(r.coverage, 'partial', label); assert.equal(r.skipped.unknownValue, 1, label); assert.deepEqual(r.records, [], label + ': no se publica una oportunidad sana'); assert.deepEqual(readingObservations(r), [], label);
    const lookup = await localLike((async () => jsonResponse({ success: true, data: dealRaw(10, { [field]: value }) })) as typeof fetch).readDeal(10); assert.equal(lookup.coverage, 'unavailable', label); assert.equal(lookup.stoppedBy, 'unsupported-value', label); assert.equal(readingObservations(lookup)[0]!.condition, null, label);
  }
  const cases: Array<[Record<string, unknown>, string, boolean]> = [[{ is_deleted: false }, 'completed', false], [{ is_deleted: true }, 'blocked', false], [{}, 'completed', false], [{ is_archived: true }, 'completed', true], [{ is_archived: false }, 'completed', false], [{ is_deleted: undefined, is_archived: undefined }, 'completed', false]];
  for (const [extra, condition, archived] of cases) {
    const base = { id: 11, status: 'won', update_time: '2026-11-08T09:00:00Z' }, r = normalizePipedriveRecord('deal', { ...base, ...extra }, fx);
    assert.equal(r.kind, 'record', JSON.stringify(extra)); if (r.kind === 'record') { assert.equal(r.record.condition, condition, JSON.stringify(extra)); assert.equal(/archivada/.test(r.record.label), archived, JSON.stringify(extra)); }
  }
  const complete = await localLike((async () => resp([dealRaw(1), dealRaw(2, { status: 'open' }), { id: 3, status: 'won' }])) as typeof fetch).read('deal'); assert.equal(complete.coverage, 'complete', 'control: booleanos reales y campos ausentes dan lectura completa');
  const persons = await localLike((async () => resp([{ id: 5, is_deleted: 'x', org_id: 7 }])) as typeof fetch).read('person'); assert.equal(persons.coverage, 'complete', 'solo se validan los indicadores que se consumen (oportunidades)');
});

test('R2 · FECHAS DE CALENDARIO Y HORA: un día imposible, la hora 24, minutos o segundos 60 o un desfase fuera de rango dan updatedAt null (nunca otro día); bisiestos, desfases y fracciones válidos se conservan', () => {
  const at = (update_time: unknown) => { const r = normalizePipedriveRecord('deal', dealRaw(1, { update_time }), fx); assert.equal(r.kind, 'record'); return r.kind === 'record' ? r.record.updatedAt : 'x'; };
  for (const bad of ['2026-02-30T09:00:00Z', '2026-04-31T09:00:00Z', '2025-02-29T09:00:00Z', '2100-02-29T09:00:00Z', '2026-06-31T09:00:00Z', '2026-13-01T09:00:00Z', '2026-00-10T09:00:00Z', '2026-01-00T09:00:00Z', '2026-01-32T09:00:00Z', '2026-11-08T24:00:00Z', '2026-11-08T25:00:00Z', '2026-11-08T09:60:00Z', '2026-11-08T09:00:60Z', '2026-11-08T09:00:00+24:00', '2026-11-08T09:00:00+05:60', '2026-11-08 09:00:00Z', '2026-11-08T09:00:00', '2026-11-08', 'ayer', '', 20261108, null, {}]) assert.equal(at(bad), null, String(bad));
  const good: Array<[string, string]> = [['2024-02-29T10:30:00+01:00', '2024-02-29T09:30:00.000Z'], ['2000-02-29T00:00:00Z', '2000-02-29T00:00:00.000Z'], ['2026-04-30T23:59:59Z', '2026-04-30T23:59:59.000Z'], ['2026-11-08T09:00:00.123456Z', '2026-11-08T09:00:00.123Z'], ['2026-11-08T09:00:00-12:00', '2026-11-08T21:00:00.000Z'], ['2026-11-08T09:00:00+23:59', '2026-11-07T09:01:00.000Z'], ['2026-12-31T23:59:59+00:00', '2026-12-31T23:59:59.000Z'], ['0400-02-29T00:00:00Z', '0400-02-29T00:00:00.000Z']];
  for (const [input, expected] of good) assert.equal(at(input), expected, input);
});

test('R2 · UNA FECHA IMPOSIBLE NO DESPLAZA A UN DUPLICADO VÁLIDO: lost de las 08:00 del 2 de marzo seguida del mismo ID won con 30 de febrero conserva lost/blocked con su fecha; la lectura es parcial por el duplicado; también con 31 de abril y hora 24 y en orden inverso', async () => {
  for (const impossible of ['2026-02-30T09:00:00Z', '2026-04-31T09:00:00Z', '2026-03-02T24:00:00Z']) {
    let calls = 0;
    const r = await localLike((async () => (++calls === 1 ? resp([dealRaw(22, { status: 'lost', update_time: '2026-03-02T08:00:00Z' })], 'next') : resp([dealRaw(22, { status: 'won', update_time: impossible })]))) as typeof fetch).read('deal');
    assert.equal(r.skipped.duplicates, 1, impossible); assert.equal(r.coverage, 'partial', impossible); assert.equal(r.records.length, 1); assert.equal(r.records[0]!.condition, 'blocked', impossible + ': no pasa a completed por una fecha inventada'); assert.equal(r.records[0]!.updatedAt, '2026-03-02T08:00:00.000Z', impossible);
    calls = 0;
    const reversed = await localLike((async () => (++calls === 1 ? resp([dealRaw(22, { status: 'won', update_time: impossible })], 'next') : resp([dealRaw(22, { status: 'lost', update_time: '2026-03-02T08:00:00Z' })]))) as typeof fetch).read('deal');
    assert.equal(reversed.coverage, 'partial'); assert.equal(reversed.records[0]!.condition, 'blocked', impossible + ' primero: la fecha válida gana'); assert.equal(reversed.records[0]!.updatedAt, '2026-03-02T08:00:00.000Z');
  }
  let n = 0;
  const control = await localLike((async () => (++n === 1 ? resp([dealRaw(23, { status: 'lost', update_time: '2026-03-02T08:00:00Z' })], 'next') : resp([dealRaw(23, { status: 'won', update_time: '2026-03-02T09:00:00Z' })]))) as typeof fetch).read('deal');
  assert.equal(control.records[0]!.condition, 'completed', 'control: con ambas fechas válidas, la más reciente sigue ganando'); assert.equal(control.coverage, 'partial');
});

// ---- R3 (dictamen del revisor sobre R2): instantes fuera del formato público y desempate submilisegundo. Los casos de partida los planteó el revisor; esta batería es de la sesión de la autora. ----
const lookupOf = (id: number, raw: Record<string, unknown>) => localLike((async () => jsonResponse({ success: true, data: dealRaw(id, raw) })) as typeof fetch).readDeal(id);
test('R3 · F3 UN INSTANTE FUERA DEL AÑO DE CUATRO DÍGITOS NO RECHAZA LA LECTURA: updatedAt null, fila y condición conservadas, en listado y en consulta por ID', async () => {
  const outside = ['9999-12-31T23:45:00-01:00', '0000-01-01T00:15:00+01:00', '9999-12-31T23:59:59.999999999-23:59', '0000-01-01T00:00:00+23:59'];
  const rows = [dealRaw(1, { status: 'lost', update_time: outside[0] }), dealRaw(2, { status: 'won', update_time: outside[1] }), dealRaw(3, { status: 'open', update_time: '2026-11-09T08:00:00Z' }), dealRaw(4, { status: 'won', update_time: outside[2] }), dealRaw(5, { status: 'won', update_time: outside[3] })];
  const list = await localLike((async () => resp(rows)) as typeof fetch).read('deal');
  assert.equal(list.coverage, 'complete'); assert.deepEqual(list.records.map(r => r.remoteId), ['1', '2', '3', '4', '5']);
  assert.deepEqual(list.records.map(r => r.updatedAt), [null, null, '2026-11-09T08:00:00.000Z', null, null]);
  assert.deepEqual(list.records.map(r => r.condition), ['blocked', 'completed', 'clear', 'completed', 'completed'], 'la fila conserva su condición aunque la fecha quede desconocida');
  assert.ok(sourceReading.safeParse(list).success, 'la lectura sigue cumpliendo el esquema compartido');
  for (const [index, update_time] of outside.entries()) { const one = await lookupOf(40 + index, { status: 'won', update_time }); assert.equal(one.coverage, 'complete', update_time); assert.equal(one.records[0]!.updatedAt, null, update_time); assert.equal(one.records[0]!.condition, 'completed', update_time); }
  // control positivo: una fecha con zona que SÍ cae dentro del rango se normaliza a UTC; los extremos exactos del rango se conservan
  const inside = await lookupOf(50, { update_time: '2026-11-09T09:00:00+01:00' }); assert.equal(inside.records[0]!.updatedAt, '2026-11-09T08:00:00.000Z');
  assert.equal((await lookupOf(51, { update_time: '9999-12-31T23:59:59Z' })).records[0]!.updatedAt, '9999-12-31T23:59:59.000Z');
  assert.equal((await lookupOf(52, { update_time: '0000-01-01T00:00:00Z' })).records[0]!.updatedAt, '0000-01-01T00:00:00.000Z');
  // y una fecha fuera de rango no desplaza a un duplicado válido (en ambos órdenes)
  for (const order of [0, 1]) {
    let calls = 0; const first = dealRaw(60, { status: 'lost', update_time: '2026-03-02T08:00:00Z' }), second = dealRaw(60, { status: 'won', update_time: outside[0] });
    const r = await localLike((async () => (++calls === 1 ? resp([order ? second : first], 'next') : resp([order ? first : second]))) as typeof fetch).read('deal');
    assert.equal(r.records[0]!.condition, 'blocked', 'orden ' + order + ': gana la fecha válida'); assert.equal(r.records[0]!.updatedAt, '2026-03-02T08:00:00.000Z'); assert.equal(r.skipped.duplicates, 1); assert.equal(r.coverage, 'partial');
  }
});

test('R3 · F4 EL DUPLICADO MÁS RECIENTE GANA TAMBIÉN DENTRO DEL MISMO MILISEGUNDO, en cualquier orden de página, con offset y con cobertura parcial', async () => {
  const older = dealRaw(22, { status: 'lost', update_time: '2026-11-09T08:00:00.123100Z' }), newer = dealRaw(22, { status: 'won', update_time: '2026-11-09T09:00:00.123900+01:00' });
  for (const rows of [[older, newer], [newer, older]]) {
    let calls = 0; const r = await localLike((async () => (++calls === 1 ? resp([rows[0]], 'next') : resp([rows[1]]))) as typeof fetch).read('deal');
    assert.equal(r.coverage, 'partial'); assert.equal(r.skipped.duplicates, 1); assert.equal(r.records.length, 1);
    assert.equal(r.records[0]!.condition, 'completed', 'gana la fracción .123900'); assert.equal(r.records[0]!.updatedAt, '2026-11-09T08:00:00.123Z', 'el campo público conserva exactamente tres dígitos');
    assert.ok(sourceReading.safeParse(r).success);
  }
  // en la misma página, con un registro distinto en medio, y con nueve dígitos frente a seis
  const r9 = await localLike((async () => resp([dealRaw(30, { status: 'lost', update_time: '2026-11-09T08:00:00.123456789Z' }), dealRaw(31), dealRaw(30, { status: 'won', update_time: '2026-11-09T08:00:00.123456790Z' })])) as typeof fetch).read('deal');
  assert.equal(r9.records.find(x => x.remoteId === '30')!.condition, 'completed', 'diferencia de una nanosegundo'); assert.equal(r9.skipped.duplicates, 1);
  // controles: un milisegundo posterior sigue ganando (sin importar la fracción menor) y un instante anterior no desplaza al actual
  const control = await localLike((async () => resp([dealRaw(32, { status: 'lost', update_time: '2026-11-09T08:00:00.124000Z' }), dealRaw(32, { status: 'won', update_time: '2026-11-09T08:00:00.123999999Z' })])) as typeof fetch).read('deal');
  assert.equal(control.records[0]!.condition, 'blocked', 'el milisegundo posterior gana aunque la fracción menor sea menor'); assert.equal(control.records[0]!.updatedAt, '2026-11-09T08:00:00.124Z');
  // dos instantes idénticos hasta el nanosegundo no se pueden ordenar por fecha: se conserva el primero leído y el duplicado se cuenta (límite documentado)
  const tie = await localLike((async () => resp([dealRaw(33, { status: 'lost', update_time: '2026-11-09T08:00:00.123456Z' }), dealRaw(33, { status: 'won', update_time: '2026-11-09T08:00:00.123456Z' })])) as typeof fetch).read('deal');
  assert.equal(tie.records[0]!.condition, 'blocked'); assert.equal(tie.skipped.duplicates, 1);
  // tres duplicados: el intermedio no desplaza al más reciente ya elegido (la clave se actualiza al reemplazar)
  const mid = dealRaw(34, { status: 'open', update_time: '2026-11-09T08:00:00.123500Z' }), low = dealRaw(34, { status: 'lost', update_time: '2026-11-09T08:00:00.123100Z' }), top = dealRaw(34, { status: 'won', update_time: '2026-11-09T08:00:00.123900Z' });
  for (const rows of [[low, top, mid], [top, low, mid], [mid, low, top], [low, mid, top]]) { const three = await localLike((async () => resp(rows)) as typeof fetch).read('deal'); assert.equal(three.records[0]!.condition, 'completed', rows.map(x => x.status).join('>')); assert.equal(three.skipped.duplicates, 2); }
  // la misma fracción escrita con distinto número de ceros es el MISMO instante: no se ordena por la longitud del texto
  const zeros = await localLike((async () => resp([dealRaw(35, { status: 'lost', update_time: '2026-11-09T08:00:00.123Z' }), dealRaw(35, { status: 'won', update_time: '2026-11-09T08:00:00.123000000Z' })])) as typeof fetch).read('deal');
  assert.equal(zeros.records[0]!.condition, 'blocked', 'instante idéntico: se conserva el primero leído');
  // pureza: la clave de orden no existe en el registro público
  assert.equal(Object.hasOwn(r9.records[0]!, 'order'), false); assert.deepEqual(Object.keys(r9.records[0]!).sort(), Object.keys(control.records[0]!).sort());
});
