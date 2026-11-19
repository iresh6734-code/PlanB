import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { SourceReading, SourceStop } from '../shared/source-reading.js';
import { describeSourceStatus, SourceStatusError, sourceStatusView, type SourceRegistryEntry, type SourceStatusView } from '../shared/source-status.js';
import { createZendeskSource } from '../server/zendesk-source.js';

// Estado de fuente para Integraciones: derivación PURA sobre lecturas reales de los adaptadores (Zendesk sobre un servidor de bucle local o un fetch simulado). Ninguna prueba toca la red, una cuenta ni una
// credencial reales. Que estas vistas existan NO conecta ningún proveedor ni monta nada en la App.
const NOW = Date.parse('2026-11-08T10:00:00.000Z'), TOKEN = 'TEST-STATUS-TOKEN-91ac', SUBJECT = 'Asunto privado de Ana: factura impagada';
const iso = (ms = NOW) => new Date(ms).toISOString();
const entry = (over: Partial<SourceRegistryEntry> = {}): SourceRegistryEntry => ({ provider: 'zendesk-fixture', label: 'Zendesk', accountId: 'fixture-support-a', observedAccount: null, authorization: null, ...over });
const liveEntry = (over: Partial<SourceRegistryEntry> = {}) => entry({ provider: 'zendesk', accountId: 'acme-demo', authorization: { authorizedAt: iso(NOW - 3_600_000), scope: 'tickets:read (documentado, sin ensayar)' }, ...over });

type Reply = (res: http.ServerResponse) => void;
async function withServer<T>(reply: Reply, body: (origin: string) => Promise<T>) {
  const sockets = new Set<import('node:net').Socket>(), server = http.createServer((_req, res) => reply(res));
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await body('http://127.0.0.1:' + (server.address() as AddressInfo).port); } finally { for (const s of sockets) s.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const ticket = (id: number, status = 'open') => ({ id, status, subject: SUBJECT, updated_at: '2026-11-08T09:00:00Z', external_id: 'PEDIDO-4821' });
const local = (origin: string, extra: Record<string, unknown> = {}) => createZendeskSource({ mode: { kind: 'local-test', origin, accountId: 'fixture-support-a' }, credential: () => TOKEN, now: () => NOW, ...extra });
const liveReading = async (reply: Reply) => withServer(reply, async origin => { const r = await local(origin).readTickets(); return { ...r, provider: 'zendesk', accountId: 'acme-demo', records: r.records.map(x => ({ ...x, provider: 'zendesk', accountId: 'acme-demo' })) } as SourceReading; });

test('SIN LECTURA: «implementación preparada»; la siguiente acción depende de la cuenta y de la autorización; connected es siempre false', () => {
  const cases: Array<[string, SourceRegistryEntry, string]> = [
    ['sin cuenta configurada', entry({ accountId: null }), 'configure-account'], ['proveedor real sin autorización', liveEntry({ authorization: null }), 'request-authorization'],
    ['proveedor real autorizado', liveEntry(), 'run-explicit-read'], ['ensayo', entry(), 'run-explicit-read'],
  ];
  for (const [name, e, action] of cases) {
    const view = describeSourceStatus(e, null, NOW); assert.equal(view.level, 'implementation-prepared', name); assert.equal(view.reading, null); assert.equal(view.nextAction, action, name); assert.equal(view.connected, false); assert.ok(view.statements.some(s => /No conectado/.test(s)));
    assert.match(view.statements[0]!, /Implementación preparada/);
  }
});

test('LECTURA DE ENSAYO: nunca es «observada en proveedor» ni conectada, aunque el proveedor de ensayo tenga una autorización registrada; lo dice con palabras', async () => {
  await withServer(res => json(res, 200, { tickets: [ticket(1), ticket(2)], meta: { has_more: false, after_cursor: null } }), async origin => {
    const reading = await local(origin).readTickets(), view = describeSourceStatus(entry({ authorization: { authorizedAt: iso(), scope: 'ensayo' } }), reading, NOW);
    assert.equal(view.level, 'fixture-reading'); assert.equal(view.connected, false); assert.equal(view.reading!.coverage, 'complete'); assert.equal(view.reading!.records, 2); assert.equal(view.reading!.fresh, true); assert.equal(view.nextAction, 'none');
    assert.ok(view.statements.some(s => /ensayo con datos ficticios: no acredita acceso a Zendesk/.test(s))); assert.ok(view.statements.some(s => /no es una captura atómica ni el inventario íntegro/.test(s)));
    const forged = { ...view, level: 'provider-observed' }; assert.equal(sourceStatusView.safeParse(forged).success, false, 'un proveedor de ensayo no puede declararse observado');
  });
});

test('LECTURA REAL: sin autorización explícita se RECHAZA; con ella es «observada»; la cuenta es «configurada» salvo que una respuesta del proveedor la haya comprobado; otra cuenta o proveedor se rechazan', async () => {
  const reading = await liveReading(res => json(res, 200, { tickets: [ticket(1)], meta: { has_more: false, after_cursor: null } }));
  assert.throws(() => describeSourceStatus(liveEntry({ authorization: null }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_WITHOUT_AUTHORIZATION');
  const configured = describeSourceStatus(liveEntry(), reading, NOW); assert.equal(configured.level, 'provider-observed'); assert.equal(configured.accountIdentity, 'configured'); assert.match(configured.statements.join(' '), /la identidad no se ha comprobado con una respuesta del proveedor/); assert.equal(configured.connected, false); assert.ok(configured.authorizedAt);
  const observed = describeSourceStatus(liveEntry({ observedAccount: { accountId: 'acme-demo', at: iso() } }), reading, NOW); assert.equal(observed.accountIdentity, 'observed'); assert.doesNotMatch(observed.statements.join(' '), /no se ha comprobado/);
  const wrongObserved = describeSourceStatus(liveEntry({ observedAccount: { accountId: 'otra-cuenta', at: iso() } }), reading, NOW); assert.equal(wrongObserved.accountIdentity, 'configured', 'una cuenta observada distinta no acredita la configurada');
  assert.throws(() => describeSourceStatus(liveEntry({ accountId: 'otra-cuenta' }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_OF_OTHER_ACCOUNT');
  assert.throws(() => describeSourceStatus(liveEntry({ provider: 'pipedrive' }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_OF_OTHER_PROVIDER');
});

test('LECTURA PARCIAL: el recuento es una cota inferior y la acción es una lectura explícita; las omitidas se cuentan sin su contenido', async () => {
  let n = 0;
  await withServer(res => { n++; json(res, 200, { tickets: [ticket(n), { id: 900 + n, status: 'estado-futuro' }], meta: { has_more: true, after_cursor: 'c' + n } }); }, async origin => {
    const view = describeSourceStatus(entry(), await local(origin, { limits: { maxPages: 2 } }).readTickets(), NOW);
    assert.equal(view.reading!.coverage, 'partial'); assert.equal(view.reading!.stoppedBy, 'page-budget'); assert.equal(view.reading!.records, 2); assert.equal(view.reading!.skipped, 2); assert.equal(view.nextAction, 'run-explicit-read');
    assert.ok(view.statements.some(s => /Lectura parcial .*cota inferior/.test(s))); assert.ok(view.statements.some(s => /2 registro\(s\) omitidos/.test(s)));
  });
});

test('LECTURA NO DISPONIBLE: cada causa da su siguiente acción y el recuento es null (un fallo NO es cero registros ni «sin tickets»)', async () => {
  const causes: Array<[string, Reply, SourceStop, string]> = [
    ['permisos insuficientes', res => json(res, 403, {}), 'forbidden', 'review-permissions'], ['acceso perdido', res => json(res, 401, {}), 'unauthorized', 'review-account'],
    ['límite de peticiones', res => json(res, 429, {}, { 'retry-after': '30' }), 'rate-limited', 'retry-later'], ['error del proveedor', res => json(res, 500, {}), 'server-error', 'retry-later'],
    ['respuesta ilegible', res => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"tickets":'); }, 'malformed', 'run-explicit-read'],
  ];
  for (const [name, reply, stop, action] of causes) {
    await withServer(reply, async origin => {
      const view = describeSourceStatus(entry(), await local(origin).readTickets(), NOW);
      assert.equal(view.reading!.coverage, 'unavailable', name); assert.equal(view.reading!.stoppedBy, stop, name); assert.equal(view.reading!.records, null, name + ': null, no 0'); assert.equal(view.nextAction, action, name);
      assert.ok(view.statements.some(s => /No se leyó nada .*no significa que no haya registros/.test(s)), name); assert.ok(!/\b0 registros|sin tickets/i.test(JSON.stringify(view)), name);
    });
  }
  await withServer(res => json(res, 429, {}, { 'retry-after': '30' }), async origin => assert.equal(describeSourceStatus(entry(), await local(origin).readTickets(), NOW).reading!.retryAfterSeconds, 30));
  await withServer(() => undefined, async origin => { const view = describeSourceStatus(entry(), await local(origin, { limits: { requestTimeoutMs: 60 } }).readTickets(), NOW); assert.equal(view.reading!.stoppedBy, 'timeout'); assert.equal(view.nextAction, 'retry-later'); });
  const controller = new AbortController(); controller.abort(); await withServer(res => json(res, 200, {}), async origin => { const view = describeSourceStatus(entry(), await local(origin).readTickets({ signal: controller.signal }), NOW); assert.equal(view.reading!.stoppedBy, 'aborted'); assert.equal(view.nextAction, 'run-explicit-read'); });
});

test('LECTURA ANTIGUA: se marca como no reciente, no se muestra como acción cumplida y pide una lectura explícita; una lectura del futuro tampoco es reciente', async () => {
  await withServer(res => json(res, 200, { tickets: [ticket(1)], meta: { has_more: false, after_cursor: null } }), async origin => {
    const reading = await local(origin).readTickets(), later = describeSourceStatus(entry(), reading, NOW + 25 * 3_600_000);
    assert.equal(later.reading!.fresh, false); assert.equal(later.nextAction, 'run-explicit-read'); assert.ok(later.statements.some(s => /antigua/.test(s)));
    assert.equal(describeSourceStatus(entry(), reading, NOW - 60_000).reading!.fresh, false, 'lectura del futuro');
  });
});

test('SIN FUGAS: la vista lleva recuentos y causas, nunca el asunto ni la referencia de los tickets, ni la credencial, ni rutas; la derivación no usa la red y es determinista', async () => {
  await withServer(res => json(res, 200, { tickets: [ticket(1, 'hold')], meta: { has_more: false, after_cursor: null } }), async origin => {
    const reading = await local(origin, { policy: { includeSubject: true } }).readTickets(); assert.ok(reading.records[0]!.label.includes('Asunto privado'), 'el registro SÍ lleva el asunto: la vista no debe');
    const realFetch = globalThis.fetch; globalThis.fetch = (() => { throw new Error('la derivación no puede usar la red'); }) as typeof fetch;
    try {
      const a = describeSourceStatus(entry(), reading, NOW), b = describeSourceStatus(entry(), reading, NOW); assert.deepEqual(a, b);
      const text = JSON.stringify(a); for (const secret of [SUBJECT, 'Asunto privado', 'PEDIDO-4821', TOKEN, 'ticket-', '127.0.0.1', 'planb.sqlite', '.planb-key']) assert.ok(!text.includes(secret), 'sin ' + secret);
      assert.deepEqual(Object.keys(a.reading!).sort(), ['at', 'cause', 'coverage', 'fresh', 'mode', 'objectType', 'pages', 'records', 'requests', 'retryAfterSeconds', 'skipped', 'stoppedBy'].sort());
    } finally { globalThis.fetch = realFetch; }
  });
});

test('ESQUEMA ESTRICTO: connected true, nivel incoherente, observada sin cuenta o autorización, no disponible con recuento, claves extra o formato distinto se rechazan', () => {
  const base = describeSourceStatus(liveEntry(), null, NOW) as SourceStatusView;
  const fakeReading = { objectType: 'ticket', mode: 'listing' as const, at: iso(), coverage: 'complete' as const, stoppedBy: null, cause: 'completa', records: 1, pages: 1, requests: 1, skipped: 0, retryAfterSeconds: null, fresh: true };
  const bad: Array<[string, unknown]> = [
    ['connected true', { ...base, connected: true }], ['formato', { ...base, format: 'otro' }], ['clave extra', { ...base, extra: 1 }],
    ['fixture con proveedor real', { ...base, level: 'fixture-reading', reading: fakeReading }], ['observada sin autorización', { ...base, level: 'provider-observed', reading: fakeReading, authorizedAt: null }],
    ['observada sin cuenta', { ...base, level: 'provider-observed', reading: fakeReading, authorizedAt: iso(), accountId: null, accountIdentity: 'none' }],
    ['sin lectura con detalle', { ...base, reading: fakeReading }], ['con lectura sin detalle', { ...base, level: 'provider-observed', authorizedAt: iso() }],
    ['no disponible con recuento', { ...base, level: 'provider-observed', authorizedAt: iso(), reading: { ...fakeReading, coverage: 'unavailable', stoppedBy: 'forbidden', cause: 'x', records: 3 } }],
    ['datos sin recuento', { ...base, level: 'provider-observed', authorizedAt: iso(), reading: { ...fakeReading, records: null } }], ['sin declaraciones', { ...base, statements: [] }],
  ];
  for (const [name, view] of bad) assert.equal(sourceStatusView.safeParse(view).success, false, name);
  assert.equal(sourceStatusView.safeParse(base).success, true);
});

// ───────────────────────────── R2 · intento sin lectura útil, cronología de la autorización y matriz de textos (dictamen 296) ─────────────────────────────
import { ACTION_LABEL, describeSourceHeadline, evidenceOf, evidenceKinds } from '../shared/source-status.js';
let cursorN = 0; const body = (tickets: unknown[] = [ticket(22)], more = false) => new Response(JSON.stringify({ tickets, meta: { has_more: more, after_cursor: more ? 'c' + (++cursorN) : null } }), { headers: { 'content-type': 'application/json' } });
const liveZendesk = (extra: Record<string, unknown>) => createZendeskSource({ mode: { kind: 'live', subdomain: 'acme-demo' }, credential: () => TOKEN, now: () => NOW, ...extra } as never);
const realEntry = (over: Partial<SourceRegistryEntry> = {}) => liveEntry({ accountId: 'acme-demo', ...over });
const noFetch = (counter: { n: number }) => (async () => { counter.n++; return body(); }) as typeof fetch;

test('R2 · INTENTOS SIN LECTURA ÚTIL por los caminos reales del adaptador: credencial ausente, aborto previo, fallo de red, respuesta de error, ilegible y plazo NO son «lectura observada en proveedor»; conservan causa, acción, recuento desconocido y connected:false', async () => {
  const calls = { n: 0 }, pre = new AbortController(); pre.abort();
  const cases: Array<[string, () => Promise<SourceReading>, string, string, string, number]> = [
    ['credencial ausente', () => liveZendesk({ credential: () => { throw new Error('no hay credencial'); }, fetch: noFetch(calls) }).readTickets(), 'not-sent', 'not-attempted', 'review-account', 0],
    ['aborto previo', () => liveZendesk({ fetch: noFetch(calls) }).readTickets({ signal: pre.signal }), 'not-sent', 'not-attempted', 'run-explicit-read', 0],
    ['fallo de red', () => liveZendesk({ fetch: (async () => { throw new Error('sin red'); }) as typeof fetch }).readTickets(), 'no-response', 'unknown', 'retry-later', 1],
    ['plazo agotado', () => liveZendesk({ fetch: (async () => { await new Promise(r => setTimeout(r, 120)); return body(); }) as typeof fetch, limits: { requestTimeoutMs: 30 } }).readTickets(), 'interrupted', 'unknown', 'retry-later', 1],   // R3: antes 'no-response'; el recibo no distingue plazo antes o después de las cabeceras
    ['aborto esperando cabeceras', () => { const c = new AbortController(); return liveZendesk({ fetch: ((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => { setTimeout(() => c.abort(), 20); init?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))); })) as typeof fetch }).readTickets({ signal: c.signal }); }, 'interrupted', 'unknown', 'run-explicit-read', 1],
    ['aborto durante el cuerpo (cabeceras ya recibidas)', () => { const c = new AbortController(); return liveZendesk({ fetch: (async () => new Response(new ReadableStream<Uint8Array>({ pull() { c.abort(); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch }).readTickets({ signal: c.signal }); }, 'interrupted', 'unknown', 'run-explicit-read', 1],
    ['plazo durante el cuerpo (cabeceras ya recibidas)', () => liveZendesk({ fetch: (async () => new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch, limits: { requestTimeoutMs: 40 } }).readTickets(), 'interrupted', 'unknown', 'retry-later', 1],
    ['cuerpo cortado por la red (cabeceras recibidas)', () => liveZendesk({ fetch: (async () => new Response(new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error('corte')); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch }).readTickets(), 'unusable-response', 'unknown', 'retry-later', 1],
    ['403 permisos', () => liveZendesk({ fetch: (async () => new Response('{}', { status: 403 })) as typeof fetch }).readTickets(), 'error-response', 'denied', 'review-permissions', 1],
    ['401 acceso perdido', () => liveZendesk({ fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch }).readTickets(), 'error-response', 'denied', 'review-account', 1],
    ['429 límite', () => liveZendesk({ fetch: (async () => new Response('{}', { status: 429, headers: { 'retry-after': '30' } })) as typeof fetch }).readTickets(), 'error-response', 'unknown', 'retry-later', 1],
    ['500 del proveedor', () => liveZendesk({ fetch: (async () => new Response('{}', { status: 500 })) as typeof fetch }).readTickets(), 'error-response', 'unknown', 'retry-later', 1],
    ['respuesta ilegible', () => liveZendesk({ fetch: (async () => new Response('{"tickets":', { headers: { 'content-type': 'application/json' } })) as typeof fetch }).readTickets(), 'unusable-response', 'unknown', 'run-explicit-read', 1],
  ];
  for (const [name, run, evidence, access, action, requests] of cases) {
    const reading = await run(), view = describeSourceStatus(realEntry(), reading, NOW);
    assert.equal(reading.requests, requests, name); assert.equal(view.level, 'attempt-without-data', name); assert.equal(view.evidence, evidence, name); assert.equal(view.access, access, name); assert.equal(view.nextAction, action, name);
    assert.equal(view.reading!.records, null, name + ': recuento desconocido, no cero'); assert.equal(view.connected, false); assert.equal(view.emptyListing, false);
    assert.ok(!view.statements.some(s => /^Lectura realizada en el proveedor/.test(s)), name + ': no se narra como lectura realizada'); assert.ok(view.statements.some(s => /Intento de lectura sin ningún dato: no es una lectura observada/.test(s)), name); assert.ok(view.statements.some(s => /no significa que no haya registros/.test(s)), name);
    assert.equal(evidenceOf(reading), evidence, name); assert.notEqual(view.level, 'provider-observed', name);
    const said = view.statements.join(' ');
    if (evidence === 'interrupted') { assert.match(said, /se interrumpió .* no se sabe si la fuente llegó a responder/, name); assert.doesNotMatch(said, /no llegó respuesta|falló la red/i, name + ': no niega una respuesta que pudo llegar'); assert.match(describeSourceHeadline(view).headline, /^Intento interrumpido · recuento desconocido$/, name); }
    if (evidence === 'no-response') { assert.match(said, /falló la red antes de recibir respuesta/, name); assert.doesNotMatch(said, /interrump/i, name); }
  }
  assert.equal(calls.n, 0, 'ni credencial ausente ni aborto previo invocaron fetch');
});

test('R2 · CONTROLES POSITIVOS: una lectura que SÍ devolvió datos sigue siendo «observada»; un listado observado vacío se distingue de no tener recibos locales; la parcial lo es con su causa', async () => {
  const ok = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body()) as typeof fetch }).readTickets(), NOW);
  assert.equal(ok.level, 'provider-observed'); assert.equal(ok.evidence, 'data'); assert.equal(ok.access, 'data-obtained'); assert.equal(ok.reading!.records, 1); assert.ok(ok.statements.some(s => /^Lectura realizada en el proveedor/.test(s)));
  const empty = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body([])) as typeof fetch }).readTickets(), NOW), none = describeSourceStatus(realEntry(), null, NOW);
  assert.equal(empty.level, 'provider-observed'); assert.equal(empty.emptyListing, true); assert.equal(empty.reading!.records, 0); assert.ok(empty.statements.some(s => /^Listado observado vacío/.test(s))); assert.equal(none.emptyListing, false); assert.equal(none.reading, null); assert.ok(none.statements.some(s => /^Sin recibos locales/.test(s)));
  assert.ok(!empty.statements.some(s => /^Sin recibos locales/.test(s)) && !none.statements.some(s => /^Listado observado vacío/.test(s)), 'dos situaciones distintas, dos textos distintos');
  let n = 0; const partial = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body([ticket(++n)], true)) as typeof fetch, limits: { maxPages: 2 } }).readTickets(), NOW);
  assert.equal(partial.level, 'provider-observed'); assert.equal(partial.reading!.coverage, 'partial'); assert.equal(partial.reading!.stoppedBy, 'page-budget'); assert.equal(partial.access, 'data-obtained');
  const fixtureFail = describeSourceStatus(entry(), { ...(await liveZendesk({ fetch: (async () => { throw new Error('x'); }) as typeof fetch }).readTickets()), provider: 'zendesk-fixture', accountId: 'fixture-support-a' }, NOW); assert.equal(fixtureFail.level, 'attempt-without-data'); assert.ok(fixtureFail.statements.some(s => /ensayo/.test(s)));
});

test('R2 · CRONOLOGÍA DE LA AUTORIZACIÓN: una autorización POSTERIOR al inicio de la lectura no la respalda (se rechaza); anterior o igual sí; el objeto leído debe estar entre los autorizados; el ensayo no necesita autorización', async () => {
  const reading = await liveZendesk({ fetch: (async () => body()) as typeof fetch }).readTickets(), started = Date.parse(reading.startedAt);
  const at = (delta: number) => ({ authorizedAt: iso(started + delta), scope: 'tickets:read (declarado por el anfitrión)' });
  for (const delta of [60_000, 1, 1000]) assert.throws(() => describeSourceStatus(realEntry({ authorization: at(delta) }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'AUTHORIZATION_AFTER_READING', 'autorizada ' + delta + ' ms después');
  for (const delta of [0, -1, -3_600_000]) assert.equal(describeSourceStatus(realEntry({ authorization: at(delta) }), reading, NOW).level, 'provider-observed', 'autorizada ' + delta + ' ms antes o al empezar');
  assert.throws(() => describeSourceStatus(realEntry({ authorization: { ...at(-1000), objectTypes: ['organization'] } }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_OUTSIDE_AUTHORIZED_SCOPE');
  assert.equal(describeSourceStatus(realEntry({ authorization: { ...at(-1000), objectTypes: ['organization', 'ticket'] } }), reading, NOW).level, 'provider-observed');
  const failed = await liveZendesk({ credential: () => { throw new Error('x'); } }).readTickets();
  assert.throws(() => describeSourceStatus(realEntry({ authorization: at(60_000) }), failed, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'AUTHORIZATION_AFTER_READING', 'tampoco respalda un intento anterior');
  assert.throws(() => describeSourceStatus(realEntry({ authorization: null }), failed, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_WITHOUT_AUTHORIZATION', 'ni un intento sin autorización');
  assert.throws(() => describeSourceStatus(realEntry({ accountId: 'otra' }), reading, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'READING_OF_OTHER_ACCOUNT');
  await withServer(res => json(res, 200, { tickets: [ticket(1)], meta: { has_more: false, after_cursor: null } }), async origin => assert.equal(describeSourceStatus(entry({ authorization: { authorizedAt: iso(NOW + 86_400_000), scope: 'ensayo' } }), await local(origin).readTickets(), NOW).level, 'fixture-reading', 'el ensayo no depende de la autorización'));
});

test('R2 · MATRIZ DE TEXTOS Y ACCIONES: cada situación tiene titular, detalle y acción propios; los intentos hablan de recuento desconocido; el ensayo dice ficticio; nada afirma «conectado»; «Lectura observada» solo con datos de un proveedor real', async () => {
  const views: Array<[string, SourceStatusView]> = [];
  views.push(['preparada', describeSourceStatus(realEntry(), null, NOW)], ['sin cuenta', describeSourceStatus(realEntry({ accountId: null, authorization: null }), null, NOW)], ['sin autorización', describeSourceStatus(realEntry({ authorization: null }), null, NOW)]);
  await withServer(res => json(res, 200, { tickets: [ticket(1)], meta: { has_more: false, after_cursor: null } }), async origin => { views.push(['ensayo', describeSourceStatus(entry(), await local(origin).readTickets(), NOW)]); views.push(['ensayo antiguo', describeSourceStatus(entry(), await local(origin).readTickets(), NOW + 25 * 3_600_000)]); });
  for (const [name, fetcher] of [['sin petición', null], ['sin respuesta', (async () => { throw new Error('x'); }) as typeof fetch], ['interrumpido', (async () => new Response(new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } }, { highWaterMark: 0 }), { status: 200 })) as typeof fetch], ['error del proveedor', (async () => new Response('{}', { status: 403 })) as typeof fetch], ['ilegible', (async () => new Response('x', { headers: { 'content-type': 'application/json' } })) as typeof fetch]] as const)
    views.push([name, describeSourceStatus(realEntry(), await liveZendesk(fetcher ? { fetch: fetcher, ...(name === 'interrumpido' ? { limits: { requestTimeoutMs: 40 } } : {}) } : { credential: () => { throw new Error('x'); } }).readTickets(), NOW)]);
  views.push(['observada', describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body()) as typeof fetch }).readTickets(), NOW)], ['observada antigua', describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body()) as typeof fetch }).readTickets(), NOW + 25 * 3_600_000)], ['vacía', describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body([])) as typeof fetch }).readTickets(), NOW)]);
  let n = 0; views.push(['parcial', describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body([ticket(++n)], true)) as typeof fetch, limits: { maxPages: 2 } }).readTickets(), NOW)]);
  const heads = new Set<string>();
  for (const [name, view] of views) {
    const copy = describeSourceHeadline(view); heads.add(name + '|' + copy.headline); assert.ok(copy.headline.length > 5 && copy.detail.length > 20 && copy.action === ACTION_LABEL[view.nextAction], name);
    assert.doesNotMatch(copy.headline + ' ' + copy.detail + ' ' + copy.action, /\bconectad[oa]\b|\bConectar\b/i, name + ': nada afirma ni ofrece conexión');
    if (view.level === 'attempt-without-data') { assert.match(copy.detail, /desconoce \(no es cero\)/, name); assert.match(copy.headline, /recuento desconocido/, name); assert.equal(copy.tone, 'warning'); }
    if (view.level === 'fixture-reading') assert.match(copy.headline + copy.detail, /ficticios?/, name);
    if (/^Lectura (parcial )?observada|^Listado observado/.test(copy.headline)) assert.equal(view.level, 'provider-observed', name);
    if (view.level === 'provider-observed') assert.match(copy.detail, /no es el inventario íntegro|Cobertura parcial|no hubo registros visibles/, name);
  }
  assert.equal(heads.size, views.length, 'titulares distintos por situación: ' + [...heads].join(' · '));
  const byName = Object.fromEntries(views); assert.match(describeSourceHeadline(byName.preparada!).headline, /^Configuración preparada/); assert.match(describeSourceHeadline(byName.parcial!).headline, /^Lectura parcial observada/); assert.match(describeSourceHeadline(byName['observada antigua']!).headline, /antigua$/); assert.match(describeSourceHeadline(byName.vacía!).headline, /^Listado observado vacío/);
  assert.deepEqual(new Set(evidenceKinds), new Set(['data', 'not-sent', 'no-response', 'interrupted', 'error-response', 'unusable-response']));   // R3: se añade «interrupted»
});

test('R2 · ESQUEMA: un intento no puede declararse con datos, una lectura observada exige datos y petición enviada, un listado vacío es una lectura completa sin registros y la evidencia concuerda con la cobertura', async () => {
  const good = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => body()) as typeof fetch }).readTickets(), NOW), failed = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => { throw new Error('x'); }) as typeof fetch }).readTickets(), NOW);
  assert.equal(sourceStatusView.safeParse(good).success, true); assert.equal(sourceStatusView.safeParse(failed).success, true);
  const bad: Array<[string, unknown]> = [
    ['observada sin datos', { ...failed, level: 'provider-observed' }], ['intento con evidencia de datos', { ...failed, evidence: 'data' }], ['observada con evidencia de error', { ...good, evidence: 'error-response' }], ['sin petición con peticiones', { ...failed, evidence: 'not-sent' }],
    ['petición enviada sin contar', { ...failed, reading: { ...failed.reading!, requests: 0 } }], ['listado vacío falso', { ...good, emptyListing: true }], ['acceso con datos sin datos', { ...failed, access: 'data-obtained' }], ['acceso no intentado con petición', { ...failed, access: 'not-attempted' }],
    ['sin evidencia con lectura', { ...good, evidence: null }],
    // reglas AISLADAS: cada vista viola UNA sola regla (las demás se cumplen)
    ['solo: intento con evidencia de datos', { ...good, level: 'attempt-without-data' }], ['solo: evidencia y cobertura incoherentes', { ...good, level: 'attempt-without-data', evidence: 'error-response', access: 'unknown' }],
    ['solo: observada sin autorización', { ...good, authorizedAt: null }], ['solo: observada sin identidad de cuenta', { ...good, accountId: null, accountIdentity: 'none' }], ['solo: no disponible con recuento', { ...failed, reading: { ...failed.reading!, records: 3 } }], ['evidencia sin lectura', { ...describeSourceStatus(realEntry(), null, NOW), evidence: 'data' }], ['nivel desconocido', { ...good, level: 'conectado' }],
  ];
  for (const [name, view] of bad) assert.equal(sourceStatusView.safeParse(view).success, false, name);
});

// ───────────────────────────── R3 · interrupción tras cabeceras (F3) y autorización dentro del mismo milisegundo (F4) ─────────────────────────────
import { isLaterInstant } from '../shared/source-status.js';

test('R3 · F3 INTERRUPCIÓN: cancelación antes de enviar, antes de cabeceras y durante el cuerpo, plazo antes y durante el cuerpo y fallo de red se distinguen; ninguna niega una respuesta que pudo llegar; todas conservan causa, acción, recuento desconocido y connected:false', async () => {
  const pre = new AbortController(); pre.abort(); const calls = { n: 0 };
  const sentinel = await liveZendesk({ fetch: noFetch(calls) }).readTickets({ signal: pre.signal }), notSent = describeSourceStatus(realEntry(), sentinel, NOW);
  assert.equal(notSent.evidence, 'not-sent'); assert.equal(sentinel.requests, 0); assert.equal(calls.n, 0, 'la cancelación previa no invoca fetch'); assert.match(notSent.statements.join(' '), /No llegó a enviarse ninguna petición/);
  const net = describeSourceStatus(realEntry(), await liveZendesk({ fetch: (async () => { throw new Error('sin red'); }) as typeof fetch }).readTickets(), NOW);
  assert.equal(net.evidence, 'no-response'); assert.equal(net.reading!.stoppedBy, 'network'); assert.match(net.statements.join(' '), /falló la red antes de recibir respuesta/);
  const reviewerProbe = new AbortController(); let bodyRequested = false;
  const mid = await liveZendesk({ fetch: (async () => new Response(new ReadableStream<Uint8Array>({ pull() { bodyRequested = true; reviewerProbe.abort(); } }, { highWaterMark: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch }).readTickets({ signal: reviewerProbe.signal });
  const view = describeSourceStatus(realEntry(), mid, NOW);
  assert.equal(bodyRequested, true, 'el transporte obtuvo estado y cabeceras y pidió el cuerpo'); assert.deepEqual([mid.requests, mid.pages, mid.stoppedBy], [1, 0, 'aborted']);
  assert.equal(view.evidence, 'interrupted'); assert.equal(view.level, 'attempt-without-data'); assert.equal(view.reading!.records, null); assert.equal(view.access, 'unknown'); assert.equal(view.nextAction, 'run-explicit-read'); assert.equal(view.connected, false);
  assert.doesNotMatch(view.statements.join(' '), /no llegó respuesta/i); assert.equal(view.reading!.cause, 'lectura cancelada');
  // un plazo y una cancelación con el MISMO recibo de «petición enviada, cero páginas» no pueden distinguirse entre antes y después de cabeceras: ambos son «interrumpido»
  const both = [['timeout', 'retry-later'], ['aborted', 'run-explicit-read']] as const;
  for (const [stop, action] of both) { const synthetic = describeSourceStatus(realEntry(), { ...mid, stoppedBy: stop }, NOW); assert.equal(synthetic.evidence, 'interrupted', stop); assert.equal(synthetic.nextAction, action, stop); assert.equal(synthetic.reading!.records, null, stop); }
  // CONTROLES: el error HTTP confirmado y la respuesta inutilizable conservan sus propias evidencias
  assert.equal(evidenceOf({ coverage: 'unavailable', requests: 1, stoppedBy: 'forbidden' }), 'error-response'); assert.equal(evidenceOf({ coverage: 'unavailable', requests: 1, stoppedBy: 'truncated' }), 'unusable-response');
  assert.equal(evidenceOf({ coverage: 'unavailable', requests: 0, stoppedBy: 'timeout' }), 'not-sent', 'cero peticiones sigue siendo no enviada aunque la causa sea un plazo');
  assert.equal(evidenceOf({ coverage: 'partial', requests: 3, stoppedBy: 'aborted' }), 'data', 'una lectura con páginas no es una interrupción sin datos');
});

test('R3 · F4 AUTORIZACIÓN POSTERIOR DENTRO DEL MISMO MILISEGUNDO: se rechaza con toda la precisión admitida; igual y anterior se aceptan; los formatos con distinto número de decimales se ordenan por su valor', async () => {
  const reading = await liveZendesk({ fetch: (async () => body([])) as typeof fetch }).readTickets(), started = reading.startedAt, base = started.replace(/\.\d+Z$/, '').replace(/Z$/, '');
  const asReading = (startedAt: string) => ({ ...reading, startedAt, completedAt: new Date(Math.max(Date.parse(startedAt), Date.parse(reading.completedAt))).toISOString() });
  const attempt = (startedAt: string, authorizedAt: string) => describeSourceStatus(realEntry({ authorization: { authorizedAt, scope: 'tickets:read (declarado por el anfitrión)' } }), asReading(startedAt), NOW);
  const late = (startedAt: string, authorizedAt: string) => assert.throws(() => attempt(startedAt, authorizedAt), (e: unknown) => e instanceof SourceStatusError && e.code === 'AUTHORIZATION_AFTER_READING', startedAt + ' < ' + authorizedAt);
  const ok = (startedAt: string, authorizedAt: string) => assert.equal(attempt(startedAt, authorizedAt).level, 'provider-observed', startedAt + ' >= ' + authorizedAt);
  const T = base;   // 2026-11-09T08:00:00 (sin zona)
  const s0 = T + '.000Z';
  late(s0, T + '.000001Z');        // el caso del dictamen: microsegundo posterior
  late(s0, T + '.000000001Z');     // nanosegundo posterior
  late(s0, T + '.0000001Z'); late(T + '.123456Z', T + '.123457Z'); late(T + '.123Z', T + '.1230001Z'); late(T + '.5Z', T + '.500000001Z'); late(T + '.123456789Z', T + '.12345679Z');
  ok(s0, s0); ok(s0, T + 'Z'); ok(s0, T + '.0Z'); ok(s0, T + '.000000Z'); ok(s0, T + '.000000000Z');     // iguales con distinto número de decimales
  ok(T + '.123456Z', T + '.123456Z'); ok(T + '.123456Z', T + '.123455Z'); ok(T + '.123456Z', T + '.123Z'); ok(T + '.123456789Z', T + '.12345678Z'); ok(s0, new Date(Date.parse(s0) - 1000).toISOString().replace(/.d+Z$/, '.999999999Z'));   // un segundo antes, con la fracción máxima
  late(T + '.999Z', new Date(Date.parse(s0) + 1000).toISOString());   // un segundo posterior sigue rechazándose
  // la función pura
  assert.equal(isLaterInstant('2026-11-09T08:00:00.000001Z', '2026-11-09T08:00:00.000Z'), true); assert.equal(isLaterInstant('2026-11-09T08:00:00.000Z', '2026-11-09T08:00:00.000001Z'), false);
  assert.equal(isLaterInstant('2026-11-09T08:00:00Z', '2026-11-09T08:00:00.000000000Z'), false); assert.equal(isLaterInstant('2026-11-09T08:00:00.1Z', '2026-11-09T08:00:00.100000Z'), false);
  // también para un intento sin datos y para el ensayo (que no necesita autorización)
  const failed = await liveZendesk({ credential: () => { throw new Error('x'); } }).readTickets();
  assert.throws(() => describeSourceStatus(realEntry({ authorization: { authorizedAt: failed.startedAt.replace(/Z$/, '001Z'), scope: 'x' } }), failed, NOW), (e: unknown) => e instanceof SourceStatusError && e.code === 'AUTHORIZATION_AFTER_READING');
});
