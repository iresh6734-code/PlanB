// CLAUDE-API-CONTRACTS · E2 del informe de mejoras: pruebas por contrato de las rutas principales.
// Comprueban códigos HTTP y la forma de las respuestas frente a los esquemas zod de shared/, no huellas de archivos.
// App real (createBaseApp) con base en memoria y datos ficticios de shared/fixtures.ts. Sin red ni datos reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import {
  AppSpecSchema, BundleSchema, EntityNameSchema, GenerationSchema, RecordSchema, SnapshotSchema, entityNames
} from '../shared/model.js';
import { parseWorkspaceSearchContext } from '../shared/workspace-search.js';
import { APP_VERSION } from '../shared/version.js';

type App = Awaited<ReturnType<typeof createBaseApp>>;

/** Contratos de respuesta compuestos con los esquemas de shared/. `.strict()` donde la ruta promete una forma cerrada. */
const ErrorSchema = z.object({ error: z.string().min(1), details: z.unknown().optional() }).strict();
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const PageSchema = z.object({
  records: z.array(RecordSchema), related: z.array(RecordSchema),
  total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().positive()
}).strict();
const ChangeSchema = z.object({
  id: z.number().int().positive(), at: z.iso.datetime(), entity: EntityNameSchema, recordId: z.string().min(1),
  operation: z.enum(['create', 'update']), before: RecordSchema.nullable(), after: RecordSchema
}).loose();
const SavedSchema = z.object({ record: RecordSchema, change: z.object({ id: z.number().int().positive(), at: z.iso.datetime() }).loose() }).strict();
const SearchSourceSchema = z.object({
  instanceId: z.uuid(), captureId: z.string().min(1), accountId: z.string(), capturedAt: z.string(),
  isTestData: z.boolean(), contextRevision: Sha256, revision: Sha256
}).strict();
const SearchSchema = z.object({
  source: SearchSourceSchema, query: z.string(), offset: z.number().int(), limit: z.number().int(), total: z.number().int().nonnegative(),
  hasMore: z.boolean(), counts: z.record(EntityNameSchema, z.number().int().nonnegative()),
  items: z.array(z.object({
    entity: EntityNameSchema, id: z.string().min(1), label: z.string(), matchedId: z.boolean(), totalMatchedFields: z.number().int().nonnegative(),
    matches: z.array(z.object({ field: z.string(), label: z.string(), preview: z.string(), truncated: z.boolean() }).strict())
  }).strict())
}).strict();
const StateSchema = z.object({
  snapshot: SnapshotSchema.nullable(), spec: AppSpecSchema.nullable(), generation: GenerationSchema.nullable(),
  ready: z.boolean(), runtime: z.boolean(), disconnected: z.boolean(), changes: z.number().int().nonnegative(),
  workspaceSearchContext: z.unknown()
}).loose();

async function app(t: test.TestContext, seed = true): Promise<App> {
  fs.mkdirSync(path.resolve('tests/.tmp'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/contract-'));
  const created = await createBaseApp({ dbPath: ':memory:', root, staticDir: 'none' });
  t.after(async () => { await created.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  if (seed) {
    const snapshot = makeFixture('agency');
    created.store.importSnapshot(snapshot);
    created.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
    created.store.activate();
  }
  return created;
}

function parse<T>(schema: z.ZodType<T>, response: { statusCode: number; body: string }, status = 200): T {
  assert.equal(response.statusCode, status, response.body.slice(0, 300));
  const result = schema.safeParse(JSON.parse(response.body));
  assert.ok(result.success, 'contrato: ' + (result.success ? '' : JSON.stringify(result.error.issues.slice(0, 3))));
  return result.data;
}

test('GET /api/health: estado, versión de la App e identidad de instalación', async t => {
  const { app: server } = await app(t, false);
  const body = parse(z.object({ ok: z.literal(true), version: z.literal(APP_VERSION), instanceId: z.uuid() }).strict(),
    await server.inject({ url: '/api/health' }));
  assert.ok(body.instanceId);
});

test('cabeceras de seguridad y rechazo de Host u Origin ajenos con el sobre de error', async t => {
  const { app: server } = await app(t, false);
  const ok = await server.inject({ url: '/api/v2/state' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal(ok.headers['referrer-policy'], 'no-referrer');
  assert.match(String(ok.headers['content-security-policy']), /default-src 'self'.*frame-ancestors 'none'/);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/state', headers: { host: 'example.com' } }), 403);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/state', headers: { origin: 'http://example.com' } }), 403);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/state', headers: { origin: 'no es una URL' } }), 403);
});

test('GET /api/v2/state: vacío sin copia; con copia activa, esquemas de shared/ y captura compacta', async t => {
  const { app: empty } = await app(t, false);
  const before = parse(StateSchema, await empty.inject({ url: '/api/v2/state' }));
  assert.equal(before.snapshot, null);
  assert.equal(before.ready, false);
  assert.equal(before.workspaceSearchContext, null);

  const { app: server } = await app(t);
  const state = parse(StateSchema, await server.inject({ url: '/api/v2/state' }));
  assert.equal(state.ready, true);
  assert.deepEqual(state.snapshot!.records, [], 'la captura del estado no transporta registros');
  assert.deepEqual(state.snapshot!.links, []);
  assert.ok(state.snapshot!.manifest.expectedCounts.contacts > 0, 'conserva los recuentos esperados');
  assert.ok(parseWorkspaceSearchContext(state.workspaceSearchContext), 'identidad de búsqueda válida');
});

test('GET /api/v2/records/:entity: página con su contrato, límites y errores 422', async t => {
  const { app: server } = await app(t);
  for (const entity of entityNames) {
    const page = parse(PageSchema, await server.inject({ url: '/api/v2/records/' + entity + '?limit=5' }));
    assert.ok(page.records.length <= 5 && page.records.every(record => record.entity === entity));
    assert.equal(page.limit, 5);
  }
  const contacts = parse(PageSchema, await server.inject({ url: '/api/v2/records/contacts?limit=100' }));
  assert.equal(contacts.total, contacts.records.length);
  const related = new Set(contacts.related.map(record => record.entity + ':' + record.id));
  for (const record of contacts.records) if (record.values.company_id) assert.ok(related.has('companies:' + record.values.company_id), 'relacionado incluido');
  const filtered = parse(PageSchema, await server.inject({ url: '/api/v2/records/contacts?q=lucia' }));
  assert.ok(filtered.total >= 1 && filtered.total < contacts.total);
  const past = parse(PageSchema, await server.inject({ url: '/api/v2/records/contacts?offset=100000' }));
  assert.deepEqual(past.records, []);
  for (const bad of ['/api/v2/records/contacts?limit=101', '/api/v2/records/contacts?limit=0', '/api/v2/records/contacts?offset=-1',
    '/api/v2/records/notes', '/api/v2/records/contacts?q=' + 'x'.repeat(201)])
    parse(ErrorSchema, await server.inject({ url: bad }), 422);
});

test('GET /api/v2/records/:entity/:id: ficha válida y 404 con el sobre de error', async t => {
  const { app: server, store } = await app(t);
  const id = store.records('deals')[0].id;
  const { record } = parse(z.object({ record: RecordSchema }).strict(), await server.inject({ url: '/api/v2/records/deals/' + id }));
  assert.equal(record.id, id);
  assert.deepEqual(record, store.record('deals', id));
  const missing = parse(ErrorSchema, await server.inject({ url: '/api/v2/records/deals/no-existe' }), 404);
  assert.equal(missing.details, null);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/records/notes/' + id }), 422);
});

test('PATCH y POST /api/records/:entity: guardado con identidad de cambio y validación 422', async t => {
  const { app: server, store } = await app(t);
  const id = store.records('contacts')[0].id;
  const saved = parse(SavedSchema, await server.inject({ method: 'PATCH', url: '/api/records/contacts/' + id, payload: { values: { phone: '611 000 001' } } }));
  assert.equal(saved.record.values.phone, '611 000 001');
  const created = parse(SavedSchema, await server.inject({ method: 'POST', url: '/api/records/companies',
    payload: { values: { name: 'Empresa ficticia de contrato', domain: 'https://contrato.example.com', phone: '900 111 222' } } }));
  assert.equal(created.record.entity, 'companies');
  assert.ok(created.change.id > saved.change.id);
  for (const payload of [{}, { values: { phone: { nested: true } } }, { values: { phone: 'x' }, extra: 1 }, { values: { amount: Infinity } }])
    parse(ErrorSchema, await server.inject({ method: 'PATCH', url: '/api/records/contacts/' + id, payload }), 422);
  parse(ErrorSchema, await server.inject({ method: 'PATCH', url: '/api/records/notes/' + id, payload: { values: {} } }), 422);
});

test('GET /api/v2/changes: cada cambio cumple el contrato y refleja lo guardado', async t => {
  const { app: server } = await app(t);
  const id = (await server.inject({ url: '/api/v2/records/contacts?limit=1' })).json().records[0].id as string;
  await server.inject({ method: 'PATCH', url: '/api/records/contacts/' + id, payload: { values: { phone: '622 000 002' } } });
  const body = parse(z.object({ changes: z.array(ChangeSchema), pendingChanges: z.number().int().nonnegative() }).loose(),
    await server.inject({ url: '/api/v2/changes' }));
  const last = body.changes.find(change => change.recordId === id)!;
  assert.ok(last, 'el cambio aparece');
  assert.equal(last.operation, 'update');
  assert.equal(last.after.values.phone, '622 000 002');
  assert.notEqual(last.before?.values.phone, '622 000 002');
});

test('GET /api/v2/search y /api/v2/search-record: contrato, revisión y errores 409/422/404', async t => {
  const { app: empty } = await app(t, false);
  parse(ErrorSchema, await empty.inject({ url: '/api/v2/search?q=lucia' }), 409);

  const { app: server, store } = await app(t);
  const result = parse(SearchSchema, await server.inject({ url: '/api/v2/search?q=lucia&limit=5' }));
  assert.ok(result.total >= 1 && result.items.length >= 1);
  assert.equal(result.source.isTestData, true);
  const counted = Object.values(result.counts).reduce((a, b) => a + b, 0);
  assert.equal(counted, result.total);
  const only = parse(SearchSchema, await server.inject({ url: '/api/v2/search?q=lucia&entities=tasks' }));
  assert.ok(only.items.every(item => item.entity === 'tasks'));
  for (const bad of ['/api/v2/search?q=a', '/api/v2/search?q=lucia&limit=51', '/api/v2/search?q=lucia&entities=notes',
    '/api/v2/search?q=lucia&entities=tasks,tasks', '/api/v2/search?q=lucia&revision=abc'])
    parse(ErrorSchema, await server.inject({ url: bad }), 422);

  const hit = result.items[0];
  const open = (entity: string, id: string, revision = result.source.revision, captureId = result.source.captureId) =>
    server.inject({ url: '/api/v2/search-record?' + new URLSearchParams({ entity, id, captureId, revision }) });
  const opened = parse(z.object({ source: SearchSourceSchema, record: RecordSchema, related: z.array(RecordSchema) }).strict(), await open(hit.entity, hit.id));
  assert.equal(opened.record.id, hit.id);
  parse(ErrorSchema, await open(hit.entity, 'no-existe'), 404);
  parse(ErrorSchema, await open(hit.entity, hit.id, result.source.revision, 'otra-copia'), 409);
  store.saveRecord('contacts', { phone: '633 000 003' }, store.records('contacts')[0].id);
  parse(ErrorSchema, await open(hit.entity, hit.id), 409);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/search?q=lucia&revision=' + result.source.revision }), 409);
});

test('GET /api/export/bundle: el paquete de datos de prueba cumple BundleSchema', async t => {
  const { app: server } = await app(t);
  const response = await server.inject({ url: '/api/export/bundle' });
  assert.match(String(response.headers['content-disposition']), /attachment; filename="plan-b-continuidad.json"/);
  parse(BundleSchema, response);
});

test('autenticación local: 401 sin sesión, cookie HttpOnly y SameSite=Strict, 422 y 409 con su sobre', async t => {
  const { app: server } = await app(t);
  const status = z.object({ configured: z.boolean(), authenticated: z.boolean() }).strict();
  assert.deepEqual(parse(status, await server.inject({ url: '/api/v2/auth/status' })), { configured: false, authenticated: true });
  parse(ErrorSchema, await server.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'corta' } }), 422);
  const setup = await server.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'contraseña-ficticia-de-contrato' } });
  parse(z.object({ configured: z.literal(true) }).strict(), setup);
  const cookie = String(setup.headers['set-cookie']);
  assert.match(cookie, /^planb_session=[a-f0-9]{64};/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = cookie.split(';')[0];
  parse(ErrorSchema, await server.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'otra-contraseña-ficticia' } }), 409);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/state' }), 401);
  parse(ErrorSchema, await server.inject({ url: '/api/v2/records/contacts' }), 401);
  parse(StateSchema, await server.inject({ url: '/api/v2/state', headers: { cookie: session } }));
  assert.deepEqual(parse(status, await server.inject({ url: '/api/v2/auth/status', headers: { cookie: session } })), { configured: true, authenticated: true });
  parse(ErrorSchema, await server.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: 'incorrecta-ficticia' } }), 401);
  const login = await server.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { password: 'contraseña-ficticia-de-contrato' } });
  parse(z.object({ authenticated: z.literal(true) }).strict(), login);
  const fresh = String(login.headers['set-cookie']).split(';')[0];
  parse(z.object({ locked: z.literal(true) }).strict(), await server.inject({ method: 'POST', url: '/api/v2/auth/lock', headers: { cookie: fresh } }));
  parse(ErrorSchema, await server.inject({ url: '/api/v2/state', headers: { cookie: fresh } }), 401);
});

test('los contratos detectan regresiones plausibles (oráculo comprobado)', async t => {
  const { app: server } = await app(t);
  const page = (await server.inject({ url: '/api/v2/records/contacts?limit=2' })).json();
  assert.ok(PageSchema.safeParse(page).success);
  for (const broken of [{ ...page, extra: 1 }, { ...page, total: '2' }, { ...page, records: [{ ...page.records[0], entity: 'notes' }] },
    { ...page, related: undefined }, { ...page, records: [{ ...page.records[0], values: { phone: { nested: true } } }] }])
    assert.equal(PageSchema.safeParse(broken).success, false, JSON.stringify(broken).slice(0, 80));
  const state = (await server.inject({ url: '/api/v2/state' })).json();
  assert.ok(StateSchema.safeParse(state).success);
  const { manifest: _manifest, ...withoutManifest } = state.snapshot;
  for (const broken of [{ ...state, ready: 'true' }, { ...state, snapshot: withoutManifest }, { ...state, spec: { ...state.spec, title: '' } }])
    assert.equal(StateSchema.safeParse(broken).success, false);
  assert.equal(ErrorSchema.safeParse({ message: 'sin campo error' }).success, false);
  assert.equal(ErrorSchema.safeParse({ error: '' }).success, false);
});
