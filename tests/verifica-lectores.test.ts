// Verifica · fase 1: los lectores reales sobre la empresa con trampas, sin red.
// Un HubSpot falso en memoria sirve las dos capturas como lo haría la API v3 (páginas, historial del más reciente al más
// antiguo, fechas en ISO o en milisegundos) y las facturas salen a un CSV como el libro de facturas de Holded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrapCompany, checkReference, type TrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { buildVerificaReport } from '../shared/verifica/report.js';
import { RULE_IDS, type HistoryEntry, type VerificaCapture, type VerificaCompany, type VerificaInvoice } from '../shared/verifica/model.js';
import { readHubspotForVerifica, type HubspotReaderOptions } from '../server/verifica/hubspot-reader.js';
import { VerificaReadError } from '../shared/verifica/hubspot.js';
import { importInvoices, parseAmount, parseInvoiceDate, InvoiceImportError } from '../shared/verifica/invoices.js';
import { verifyReport, type VerificaReport } from '../shared/verifica/report.js';
import { runCli } from '../scripts/verifica-hubspot.js';
import { buildReadRecord, checkReadAuthorization, madridDay, parseReadAuthorization, ReadAuthorizationError, verifyReadRecord, type ReadRecord } from '../shared/verifica/read-authorization.js';
import { sha256Hex } from '../shared/sha256.js';

const PORTAL = '4400123';
const TOKEN = 'pat-eu1-prueba-falsa-0000';
const STAGE = { open: 'appointmentscheduled', won: 'closedwon', lost: 'closedlost' } as const;

interface FakeOptions {
  accountType?: string;
  portalId?: string;
  /** Oportunidades a las que HubSpot no devuelve el historial. */
  withoutHistory?: string[];
  /** Diferencia que se suma al total de la búsqueda de recuento. */
  countSkew?: number;
  /** Respuestas forzadas por orden de petición (status), antes de la respuesta normal. */
  failures?: number[];
  loopCursor?: boolean;
}

interface Logged { method: string; url: URL; auth: string | null; body: string | null }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Un HubSpot en memoria con una captura de la empresa con trampas. */
function fakeHubspot(capture: VerificaCapture, options: FakeOptions = {}) {
  const log: Logged[] = [];
  const failures = [...(options.failures ?? [])];
  const stamp = (at: string, i: number) => i % 2 ? String(Date.parse(at)) : at;
  const history = (entries: HistoryEntry[], i: number) => [...entries].reverse().map(e => ({ value: e.value === null ? '' : String(e.value), timestamp: stamp(e.at, i), sourceType: 'CRM_UI' }));
  const deals = capture.deals.map((d, i) => ({
    id: d.id,
    properties: {
      dealname: d.name, amount: d.amount === null ? null : String(d.amount), dealstage: STAGE[d.status], pipeline: 'default',
      closedate: d.closeDate === null ? null : d.closeDate + 'T00:00:00Z', createdate: d.createdAt, hubspot_owner_id: d.ownerId,
    },
    ...(d.history && !options.withoutHistory?.includes(d.id) ? { propertiesWithHistory: { amount: history(d.history.amount, i), closedate: history(d.history.closeDate, i + 1) } } : {}),
    ...(d.companyId ? { associations: { companies: { results: [{ id: d.companyId, type: 'deal_to_company_unlabeled' }, { id: d.companyId, type: 'deal_to_company' }] } } } : {}),
  }));
  const objects: Record<string, unknown[]> = {
    deals,
    companies: capture.companies.map(c => ({ id: c.id, properties: { name: c.name, lifecyclestage: c.customer ? 'customer' : 'lead' } })),
    contacts: capture.contacts.map(p => ({ id: p.id, properties: { firstname: p.name, lastname: null, email: p.email, associatedcompanyid: p.companyId } })),
  };
  const owners = capture.owners.map(o => ({ id: o.id, firstName: o.name, lastName: '', email: o.id + '@vendedor.example' }));
  const page = (items: unknown[], url: URL) => {
    const limit = Number(url.searchParams.get('limit')), offset = Number(url.searchParams.get('after') ?? 0);
    const next = offset + limit < items.length ? String(options.loopCursor ? limit : offset + limit) : null;
    return json({ results: items.slice(offset, offset + limit), ...(next ? { paging: { next: { after: next, link: 'https://api.hubapi.com/no-seguir' } } } : {}) });
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    log.push({ method: init?.method ?? 'GET', url, auth: headers.get('authorization'), body: typeof init?.body === 'string' ? init.body : null });
    const forced = failures.shift();
    if (forced) return json({ status: 'error' }, forced);
    if (url.origin !== 'https://api.hubapi.com') return json({}, 404);
    if (url.pathname === '/account-info/v3/details') return json({ portalId: Number(options.portalId ?? PORTAL), accountType: options.accountType ?? 'DEVELOPER_TEST', timeZone: 'Europe/Madrid' });
    if (url.pathname === '/crm/v3/pipelines/deals') return json({ results: [{ id: 'default', stages: [
      { id: STAGE.open, metadata: { isClosed: 'false', probability: '0.2' } },
      { id: STAGE.won, metadata: { isClosed: 'true', probability: '1.0' } },
      { id: STAGE.lost, metadata: { isClosed: 'true', probability: '0.0' } },
    ] }] });
    if (url.pathname === '/crm/v3/owners') return page(owners, url);
    const search = /^\/crm\/v3\/objects\/(\w+)\/search$/.exec(url.pathname);
    if (search && init?.method === 'POST') return json({ total: objects[search[1]!]!.length + (search[1] === 'deals' ? options.countSkew ?? 0 : 0), results: [] });
    const list = /^\/crm\/v3\/objects\/(\w+)$/.exec(url.pathname);
    if (list && objects[list[1]!]) return page(objects[list[1]!]!, url);
    return json({}, 404);
  }) as typeof fetch;
  return { fetcher, log };
}

const read = (capture: VerificaCapture, fake = fakeHubspot(capture), extra: Partial<HubspotReaderOptions> = {}) =>
  readHubspotForVerifica({ token: TOKEN, accountId: PORTAL, mode: 'test', fetcher: fake.fetcher, now: () => new Date(capture.capturedAt), sleep: async () => undefined, ...extra });

/** Las facturas como el libro de facturas emitidas de Holded guardado como CSV desde Excel. */
function holdedCsv(invoices: VerificaInvoice[], companies: VerificaCompany[]): string {
  const names = new Map(companies.map(c => [c.id, c.name]));
  const money = (n: number) => { const [whole, cents] = n.toFixed(2).split('.'); return whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + cents; };
  const day = (at: string) => at.slice(8, 10) + '/' + at.slice(5, 7) + '/' + at.slice(0, 4);
  const lines = invoices.map((f, i) => {
    const name = names.get(f.companyId!)!;
    const shown = i % 2 ? name.toUpperCase().replace(' S.L.', ', S.L.') : name;
    return [f.id, day(f.issuedAt), '"' + shown + '"', '', money(f.amount), '21', money(f.amount * 1.21), f.dealRef ?? ''].join(';');
  });
  return '\uFEFF' + ['Núm.;Fecha;Contacto;NIF;Base imponible;IVA (%);Total;Referencia', ...lines].join('\r\n') + '\r\n';
}

async function reportThroughReaders(company: TrapCompany) {
  const previous = (await read(company.previous)).capture;
  const latest = (await read(company.latest)).capture;
  const imported = importInvoices(holdedCsv(company.invoices, latest.companies), latest.companies);
  const report = buildVerificaReport({ asOf: company.asOf, previous, latest, invoices: imported.invoices, declarations: company.declarations, salt: company.salt });
  return { previous, latest, imported, report };
}

const withoutMeta = ({ id: _id, source: _source, ...rest }: VerificaCapture) => rest;

test('Verifica · los lectores reales sobre la empresa con trampas dan las seis alarmas con sus cifras', async () => {
  const company = buildTrapCompany({ traps: true });
  const { previous, latest, imported, report } = await reportThroughReaders(company);
  assert.deepEqual(withoutMeta(latest), withoutMeta(company.latest), 'la lectura de HubSpot reproduce la captura entera, historial incluido');
  assert.deepEqual(withoutMeta(previous), withoutMeta(company.previous));
  assert.equal(latest.source, 'hubspot');
  assert.equal(latest.historyAvailable, true);
  assert.deepEqual(imported.invoices, company.invoices.map(f => ({ ...f, issuedAt: f.issuedAt.slice(0, 10) + 'T12:00:00.000Z' })));
  assert.equal(imported.amountBasis, 'base');
  assert.deepEqual([imported.unmatched, imported.issues, imported.warnings], [0, [], []]);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), [...RULE_IDS]);
});

test('Verifica · la misma empresa sin trampas, leída por los lectores reales, no da ningún aviso', async () => {
  const company = buildTrapCompany({ traps: false });
  const { report } = await reportThroughReaders(company);
  assert.deepEqual(checkReference(report, company.expected), []);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), []);
});

test('Verifica · el lector de HubSpot solo lee: GET y búsquedas de recuento, credencial en cabecera, páginas de 50 con historial', async () => {
  const company = buildTrapCompany({ traps: true });
  const fake = fakeHubspot(company.latest);
  const { requests } = await read(company.latest, fake);
  assert.equal(requests, fake.log.length);
  for (const call of fake.log) {
    assert.equal(call.url.origin, 'https://api.hubapi.com');
    assert.equal(call.auth, 'Bearer ' + TOKEN);
    assert.ok(!call.url.href.includes(TOKEN), 'la credencial nunca va en la URL');
    if (call.method === 'POST') { assert.match(call.url.pathname, /^\/crm\/v3\/objects\/(companies|contacts|deals)\/search$/); assert.equal(call.body, '{"limit":1}'); }
    else assert.equal(call.method, 'GET');
  }
  const dealPages = fake.log.filter(call => call.url.pathname === '/crm/v3/objects/deals');
  assert.equal(dealPages.length, Math.ceil(company.latest.deals.length / 50));
  for (const call of dealPages) {
    assert.equal(call.url.searchParams.get('limit'), '50');
    assert.equal(call.url.searchParams.get('propertiesWithHistory'), 'amount,closedate');
    assert.equal(call.url.searchParams.get('associations'), 'companies');
  }
  assert.equal(fake.log.filter(call => call.method === 'POST').length, 3);
});

test('Verifica · si HubSpot no devuelve el historial de alguna oportunidad, el aplazamiento queda «sin comprobar»', async () => {
  const company = buildTrapCompany({ traps: true });
  const latest = (await read(company.latest, fakeHubspot(company.latest, { withoutHistory: ['d0001'] }))).capture;
  assert.equal(latest.historyAvailable, false);
  assert.ok(latest.deals.every(d => d.history === null), 'no se mezclan oportunidades con y sin historial');
  const report = buildVerificaReport({ asOf: company.asOf, previous: company.previous, latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });
  const pushed = report.findings.find(f => f.rule === 'close-date-pushed')!;
  assert.deepEqual([pushed.basis, pushed.alarm], ['unverified', false]);
});

test('Verifica · el lector para antes de leer datos si la cuenta no es la esperada o no es de pruebas', async () => {
  const company = buildTrapCompany({ traps: false });
  const code = async (options: FakeOptions, extra: Partial<HubspotReaderOptions> = {}) => {
    const fake = fakeHubspot(company.latest, options);
    const error = await read(company.latest, fake, extra).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof VerificaReadError, String(error));
    return { code: error.code, requests: fake.log.length };
  };
  assert.deepEqual(await code({ accountType: 'STANDARD' }), { code: 'WRONG_ACCOUNT_TYPE', requests: 1 });
  assert.deepEqual(await code({ portalId: '999' }), { code: 'WRONG_ACCOUNT', requests: 1 });
  assert.deepEqual(await code({ accountType: 'DEVELOPER_TEST' }, { mode: 'production_readonly' }), { code: 'WRONG_ACCOUNT_TYPE', requests: 1 });
  assert.deepEqual(await code({}, { token: 'corta' }), { code: 'INVALID_OPTION', requests: 0 });
  const production = await read(company.latest, fakeHubspot(company.latest, { accountType: 'STANDARD' }), { mode: 'production_readonly' });
  assert.equal(production.capture.deals.length, company.latest.deals.length);
});

test('Verifica · el lector no publica una captura a medias: recuento distinto, cursor repetido, credencial rechazada', async () => {
  const company = buildTrapCompany({ traps: false });
  const fails = async (options: FakeOptions) => {
    const error = await read(company.latest, fakeHubspot(company.latest, options)).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof VerificaReadError, String(error));
    return error.code;
  };
  assert.equal(await fails({ countSkew: 1 }), 'COUNT_MISMATCH');
  assert.equal(await fails({ loopCursor: true }), 'CURSOR_LOOP');
  assert.equal(await fails({ failures: [401] }), 'UNAUTHORIZED');
  assert.equal(await fails({ failures: [403] }), 'FORBIDDEN');
  assert.equal(await fails({ failures: [500, 503, 502] }), 'INCOMPLETE');
  const waits: number[] = [];
  const fake = fakeHubspot(company.latest, { failures: [429, 503] });
  const reading = await read(company.latest, fake, { sleep: async ms => { waits.push(ms); } });
  assert.deepEqual(waits, [1000, 1000], 'reintenta dos veces tras 429 y 5xx');
  assert.equal(reading.requests, fake.log.length);
  const tight = await read(company.latest, fakeHubspot(company.latest), { limits: { maxPages: 3 } }).then(() => null, (e: unknown) => e);
  assert.equal((tight as VerificaReadError).code, 'PAGE_BUDGET');
});

test('Verifica · importes y fechas de factura en formato español', () => {
  const amounts: [string, number | null][] = [
    ['1.234,56', 1234.56], ['1234,56', 1234.56], ['1,234.56', 1234.56], ['4.500', 4500], ['4500', 4500], ['12,5', 12.5],
    ['-1.234,00 €', -1234], ['(300,00)', -300], ['1.234.567,8', 1234567.8], ['EUR 99', 99], ['', null], ['abc', null], ['1,2,3', null],
  ];
  for (const [raw, expected] of amounts) assert.equal(parseAmount(raw), expected, raw);
  assert.equal(parseInvoiceDate('05/03/2026'), '2026-03-05T12:00:00.000Z');
  assert.equal(parseInvoiceDate('5-3-2026'), '2026-03-05T12:00:00.000Z');
  assert.equal(parseInvoiceDate('2026-03-05'), '2026-03-05T12:00:00.000Z');
  assert.equal(parseInvoiceDate('2026-03-05T23:30:00+01:00'), '2026-03-05T12:00:00.000Z');
  assert.equal(parseInvoiceDate('31/02/2026'), null);
  assert.equal(parseInvoiceDate('marzo'), null);
});

test('Verifica · facturas: NIF antes que nombre, nombres repetidos sin asignar, total con aviso y líneas malas fuera', () => {
  const companies: VerificaCompany[] = [
    { id: 'a', name: 'Talleres Núñez S.L.', customer: true, taxId: 'B12345678' },
    { id: 'b', name: 'Talleres Nuñez, SL', customer: true, taxId: 'ES-B87654321' },
    { id: 'c', name: 'Gráficas Sol S.A.', customer: true },
    { id: 'd', name: 'Gráficas Sol SA', customer: true },
    { id: 'e', name: 'Hostal "La Ría"; Vigo', customer: true },
  ];
  const csv = [
    'Factura,Fecha de emisión,Razón social,CIF,Total',
    'F1,01/02/2026,Talleres Nunez SL,B-87654321,"1.210,00"',
    'F2,02/02/2026,TALLERES NÚÑEZ S.L.U.,,"2.420,00"',
    'F3,03/02/2026,Gráficas Sol,,"100,00"',
    'F4,04/02/2026,"Hostal ""La Ría""; Vigo",,"50,00"',
    'F5,31/02/2026,Gráficas Sol,,"10,00"',
    'F6,05/02/2026,Gráficas Sol,,gratis',
    'F1,06/02/2026,Talleres Nunez SL,,"1,00"',
    'F7,07/02/2026,Otra Empresa SL,,"5,00"',
  ].join('\n');
  const result = importInvoices(csv, companies);
  assert.equal(result.amountBasis, 'total');
  assert.deepEqual(result.columns, { number: 'Factura', date: 'Fecha de emisión', customer: 'Razón social', taxId: 'CIF', total: 'Total' });
  assert.deepEqual(result.invoices.map(f => [f.id, f.companyId, f.amount, f.dealRef]), [
    ['F1', 'b', 1210, null], ['F2', null, 2420, null], ['F3', null, 100, null], ['F4', 'e', 50, null], ['F7', null, 5, null],
  ]);
  assert.equal(result.unmatched, 3);
  assert.deepEqual(result.issues, [{ line: 6, reason: 'fecha no válida' }, { line: 7, reason: 'importe no válido' }, { line: 8, reason: 'número de factura repetido' }]);
  assert.equal(result.warnings.length, 3, result.warnings.join(' | '));
  assert.match(result.warnings[0]!, /total con IVA/);
  assert.throws(() => importInvoices('Número;Cliente;Base imponible\n1;A;10', companies), InvoiceImportError);
  assert.throws(() => importInvoices('Fecha;Cliente;Base imponible\n01/01/2026;"A;10', companies), /comillas/);
});

test('Verifica · el script del portal de pruebas: sin autorización no lee nada; con ella guarda captura e informe sin mostrar la credencial', async () => {
  const company = buildTrapCompany({ traps: true });
  const stdin = { isTTY: false, async *[Symbol.asyncIterator]() { yield TOKEN + '\r\n'; } };
  const files = new Map<string, string>([['facturas.csv', holdedCsv(company.invoices, company.latest.companies)]]);
  const run = async (capture: VerificaCapture, argv: string[]) => {
    const fake = fakeHubspot(capture);
    let out = '', err = '';
    const code = await runCli(argv, {
      stdin, out: t => { out += t; }, err: t => { err += t; }, fetch: fake.fetcher, now: () => new Date(capture.capturedAt),
      readText: async path => { const text = files.get(path); if (text === undefined) throw new Error('no existe'); return text; },
      writeNew: async (path, text) => { if (files.has(path)) throw new Error('ya existe'); files.set(path, text); },
    });
    assert.ok(!(out + err).includes(TOKEN), 'la credencial no se imprime');
    return { code, out, err, requests: fake.log.length };
  };
  const refused = await run(company.previous, ['--portal', PORTAL, '--out', 'antes.json']);
  assert.deepEqual([refused.code, refused.requests], [2, 0]);
  assert.match(refused.err, /--authorized-full-read/);

  const first = await run(company.previous, ['--portal', PORTAL, '--authorized-full-read', '--out', 'antes.json']);
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /Historial: SÍ/);
  const second = await run(company.latest, ['--portal', PORTAL, '--authorized-full-read', '--out', 'ahora.json', '--previous', 'antes.json', '--invoices', 'facturas.csv', '--report', 'informe.json']);
  assert.equal(second.code, 0, second.err);
  assert.match(second.out, /base imponible/);
  const report = JSON.parse(files.get('informe.json')!) as VerificaReport;
  assert.equal(verifyReport(report), true);
  assert.deepEqual(report.findings.filter(f => f.alarm).map(f => f.rule), [...RULE_IDS], 'también los clientes «activos» sin factura, aunque el vendedor no declare nada');
  const again = await run(company.latest, ['--portal', PORTAL, '--authorized-full-read', '--out', 'ahora.json']);
  assert.notEqual(again.code, 0, 'no sobrescribe una captura');
});

const SIGNED = new TextEncoder().encode('%PDF-1.4 autorización de lectura firmada por la cliente');
const authorizationFor = (overrides: Record<string, unknown> = {}) => ({
  kind: 'verifica-read-authorization', version: 1, portalId: PORTAL, engagement: 'VF-2026-001',
  authorizedBy: { name: 'Ana Ruiz', role: 'Directora general', company: 'Cliente de prueba S.L.' },
  signedOn: '2000-01-01', validUntil: '2099-12-31', scope: ['owners', 'companies', 'contacts', 'deals_with_history'],
  signedDocumentSha256: sha256Hex(SIGNED), ...overrides,
});

test('Verifica · autorización de lectura de un cliente: forma estricta, portal, fechas de Madrid, alcance y documento', () => {
  const today = '2026-05-10', documentSha256 = sha256Hex(SIGNED);
  const code = (raw: unknown, context: Partial<{ portalId: string; today: string; documentSha256: string }> = {}) => {
    try { checkReadAuthorization(parseReadAuthorization(raw), { portalId: PORTAL, today, documentSha256, ...context }); return 'OK'; }
    catch (e) { assert.ok(e instanceof ReadAuthorizationError, String(e)); return e.code; }
  };
  assert.equal(code(authorizationFor()), 'OK');
  assert.equal(code(authorizationFor({ validUntil: today })), 'OK', 'el último día cuenta');
  assert.equal(code(authorizationFor({ validUnitl: '2099-12-31' })), 'MALFORMED', 'una errata en una clave no pasa en silencio');
  assert.equal(code(authorizationFor({ signedDocumentSha256: 'abc' })), 'MALFORMED');
  assert.equal(code(authorizationFor({ validUntil: '2026-02-30' })), 'MALFORMED');
  assert.equal(code(authorizationFor({ portalId: 4400123 })), 'MALFORMED');
  assert.equal(code(authorizationFor(), { portalId: '999' }), 'WRONG_PORTAL');
  assert.equal(code(authorizationFor({ signedOn: '2026-05-11' })), 'NOT_YET_VALID');
  assert.equal(code(authorizationFor({ validUntil: '2026-05-09' })), 'EXPIRED');
  assert.equal(code(authorizationFor({ scope: ['owners', 'companies', 'contacts'] })), 'SCOPE');
  assert.equal(code(authorizationFor({ scope: ['owners', 'companies', 'contacts', 'deals_with_history', 'emails'] })), 'SCOPE');
  assert.equal(code(authorizationFor(), { documentSha256: sha256Hex('otro documento') }), 'DOCUMENT_MISMATCH');
  assert.equal(madridDay(new Date('2026-03-31T22:30:00Z')), '2026-04-01', 'a las 00:30 en Madrid ya es el día siguiente');
});

test('Verifica · el acta de lectura detecta retoques y una captura que no es la leída', () => {
  const auth = parseReadAuthorization(authorizationFor());
  const captureText = '{"id":"captura"}\n';
  const record = buildReadRecord({
    portalId: PORTAL, accountType: 'STANDARD', engagement: auth.engagement, authorizedBy: auth.authorizedBy, signedOn: auth.signedOn, validUntil: auth.validUntil,
    signedDocumentSha256: auth.signedDocumentSha256, startedAt: '2026-05-10T08:00:00.000Z', finishedAt: '2026-05-10T08:01:00.000Z',
    requestsByMethod: { GET: 9, POST: 3 }, endpoints: ['GET /crm/v3/owners', 'GET /crm/v3/owners', 'GET /account-info/v3/details'],
    counts: { owners: 1, companies: 2, contacts: 3, deals: 4 }, historyAvailable: true, captureId: 'captura', captureText,
  });
  assert.deepEqual(record.endpoints, ['GET /account-info/v3/details', 'GET /crm/v3/owners']);
  assert.equal(verifyReadRecord(record, captureText), true);
  assert.equal(verifyReadRecord({ ...record, counts: { ...record.counts, deals: 5 } }), false);
  assert.equal(verifyReadRecord(record, captureText.replace('captura', 'otra')), false);
});

test('Verifica · el script en modo cliente: sin autorización válida no hace ninguna petición; con ella lee solo una cuenta real y deja acta', async () => {
  const company = buildTrapCompany({ traps: true });
  const stdin = { isTTY: false, async *[Symbol.asyncIterator]() { yield TOKEN + '\n'; } };
  const files = new Map<string, string>([['autorizacion.json', JSON.stringify(authorizationFor())], ['caducada.json', JSON.stringify(authorizationFor({ validUntil: '2001-01-01' }))]]);
  const documents = new Map<string, Uint8Array>([['firmada.pdf', SIGNED], ['retocada.pdf', new TextEncoder().encode('%PDF-1.4 otro')]]);
  const run = async (argv: string[], accountType = 'STANDARD') => {
    const fake = fakeHubspot(company.latest, { accountType });
    let out = '', err = '';
    const code = await runCli(argv, {
      stdin, out: s => { out += s; }, err: s => { err += s; }, fetch: fake.fetcher, now: () => new Date(company.latest.capturedAt),
      readText: async path => { const text = files.get(path); if (text === undefined) throw new Error('no existe'); return text; },
      readBytes: async path => { const bytes = documents.get(path); if (bytes === undefined) throw new Error('no existe'); return bytes; },
      writeNew: async (path, text) => { if (files.has(path)) throw new Error('ya existe'); files.set(path, text); },
    });
    assert.ok(!(out + err).includes(TOKEN), 'la credencial no se imprime');
    return { code, out, err, log: fake.log };
  };
  const client = (more: string[]) => ['--portal', PORTAL, '--client-authorization', 'autorizacion.json', '--out', 'captura.json', ...more];
  const refusals: [string[], RegExp][] = [
    [client(['--record', 'acta.json']), /--authorization-document/],
    [client(['--authorization-document', 'firmada.pdf']), /--record/],
    [client(['--authorization-document', 'firmada.pdf', '--record', 'captura.json']), /dos archivos/],
    [client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json', '--authorized-full-read']), /Elige un modo/],
    [client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json', '--previous', 'antes.json', '--report', 'informe.json']), /sala limpia/],
    [['--portal', PORTAL, '--authorized-full-read', '--out', 'captura.json', '--record', 'acta.json'], /solo valen con --client-authorization/],
    [client(['--authorization-document', 'retocada.pdf', '--record', 'acta.json']), /DOCUMENT_MISMATCH/],
    [client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json']).map(a => a === 'autorizacion.json' ? 'caducada.json' : a), /EXPIRED/],
    [client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json']).map(a => a === PORTAL ? '999' : a), /WRONG_PORTAL/],
  ];
  for (const [argv, message] of refusals) {
    const refused = await run(argv);
    assert.deepEqual([refused.code, refused.log.length], [2, 0], argv.join(' '));
    assert.match(refused.err, message);
  }
  const argv = client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json']);
  const testPortal = await run(argv, 'DEVELOPER_TEST');
  assert.deepEqual([testPortal.code, testPortal.log.length], [1, 1], 'un portal de pruebas no pasa por cliente');
  assert.match(testPortal.err, /WRONG_ACCOUNT_TYPE/);

  const ok = await run(argv);
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /portal del cliente 4400123 \(STANDARD\)/);
  assert.match(ok.out, /Acta guardada en acta\.json/);
  const captureText = files.get('captura.json')!, record = JSON.parse(files.get('acta.json')!) as ReadRecord;
  assert.equal(verifyReadRecord(record, captureText), true);
  assert.deepEqual([record.accountType, record.engagement, record.authorizedBy.name, record.signedDocumentSha256], ['STANDARD', 'VF-2026-001', 'Ana Ruiz', sha256Hex(SIGNED)]);
  assert.deepEqual(Object.keys(record.requestsByMethod).sort(), ['GET', 'POST']);
  assert.equal(record.requestsByMethod.POST, 3, 'solo las tres búsquedas de recuento');
  assert.equal(record.requestsByMethod.GET! + record.requestsByMethod.POST!, ok.log.length, 'el acta cuenta todas las peticiones');
  assert.ok(record.endpoints.every(e => /^(GET|POST) \/[\w/-]+$/.test(e)), 'sin parámetros en las rutas');
  assert.ok(record.endpoints.filter(e => e.startsWith('POST ')).every(e => e.endsWith('/search')));
  assert.equal(record.counts.deals, company.latest.deals.length);

  const twice = await run(client(['--authorization-document', 'firmada.pdf', '--record', 'acta.json']).map(a => a === 'captura.json' ? 'captura-2.json' : a));
  assert.equal(twice.code, 1, 'no sobrescribe un acta');
  assert.match(twice.err, /sin acta: no la uses/);
});

test('Verifica · --check-only revisa la autorización y el documento sin leer la credencial, sin red y sin escribir', async () => {
  const files = new Map<string, string>([
    ['larga.json', JSON.stringify(authorizationFor())], ['corta.json', JSON.stringify(authorizationFor({ validUntil: '2026-05-12' }))],
    ['hoy.json', JSON.stringify(authorizationFor({ validUntil: '2026-05-10' }))], ['caducada.json', JSON.stringify(authorizationFor({ validUntil: '2026-05-09' }))],
  ]);
  const documents = new Map<string, Uint8Array>([['firmada.pdf', SIGNED], ['retocada.pdf', new TextEncoder().encode('%PDF-1.4 otro')]]);
  const touched: string[] = [];
  const run = async (argv: string[]) => {
    let out = '', err = '';
    const code = await runCli(argv, {
      stdin: { isTTY: false, [Symbol.asyncIterator]() { touched.push('stdin'); throw new Error('no debe leer la credencial'); } },
      out: s => { out += s; }, err: s => { err += s; }, now: () => new Date('2026-05-10T10:00:00Z'),
      fetch: (async () => { touched.push('fetch'); throw new Error('no debe hacer peticiones'); }) as typeof fetch,
      readText: async path => { const text = files.get(path); if (text === undefined) throw new Error('no existe'); return text; },
      readBytes: async path => { const bytes = documents.get(path); if (bytes === undefined) throw new Error('no existe'); return bytes; },
      writeNew: async path => { touched.push('write ' + path); },
    });
    return { code, out, err };
  };
  const check = (authorization: string, document = 'firmada.pdf', more: string[] = []) => ['--check-only', '--portal', PORTAL, '--client-authorization', authorization, '--authorization-document', document, ...more];

  const long = await run(check('larga.json'));
  assert.equal(long.code, 0, long.err);
  assert.match(long.out, /Autorización válida para leer el portal 4400123 hoy \(2026-05-10\)/);
  assert.match(long.out, /Encargo VF-2026-001 · autoriza Ana Ruiz \(Directora general, Cliente de prueba S\.L\.\)/);
  assert.doesNotMatch(long.out, /renovación/);
  assert.match((await run(check('corta.json'))).out, /quedan 2 días más\. Si la lectura no cabe en ese plazo, pide la renovación ya\./);
  assert.match((await run(check('hoy.json'))).out, /hoy es el último día\./);
  const sameLine = await run(check('larga.json', 'firmada.pdf', ['--out', 'captura.json', '--record', 'acta.json']));
  assert.equal(sameLine.code, 0, 'la misma orden del día de la lectura, con --check-only, solo comprueba');

  const refusals: [string[], RegExp][] = [
    [check('caducada.json'), /EXPIRED/],
    [check('larga.json', 'retocada.pdf'), /DOCUMENT_MISMATCH/],
    [check('larga.json').map(a => a === PORTAL ? '999' : a), /WRONG_PORTAL/],
    [['--check-only', '--portal', PORTAL, '--authorized-full-read', '--out', 'captura.json'], /--check-only revisa una autorización de cliente/],
    [check('larga.json').filter(a => a !== '--authorization-document' && a !== 'firmada.pdf'), /--authorization-document/],
  ];
  for (const [argv, message] of refusals) {
    const refused = await run(argv);
    assert.equal(refused.code, 2, argv.join(' '));
    assert.match(refused.err, message);
  }
  assert.deepEqual(touched, [], 'ni credencial, ni peticiones, ni archivos');
});
