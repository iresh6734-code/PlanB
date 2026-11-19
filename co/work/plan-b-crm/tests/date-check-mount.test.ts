import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { mountDateCheck } from '../server/date-check-mount.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { dateCheckApiPath, dateCheckCatalog, dateCheckList, dateCheckRecordView, dateCheckView, type DateCheckView } from '../shared/date-check-api.js';
import { DEMO, demoInput, initialDemoState, madridDayAt } from '../shared/date-check-demo.js';
import { dateCheckRevision } from '../shared/operational-date-check.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

process.env.NODE_ENV = 'test';
const NOW = Date.parse('2026-11-11T15:00:00.000Z'), headers = { host: '127.0.0.1' };
const ID = '0b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a40', OTHER = '1c2d3e4f-5061-4b72-8c83-0d9e8f7a6b51';
const OPERATION = '2d3e4f50-6172-4c83-9d94-1e0f9a8b7c62', OPERATION_2 = '3e4f5061-7283-4d94-8ea5-2f1a0b9c8d73';
const step = { owner: 'Marta (ficción)', nextStep: 'Pedir a Frioval que confirme la entrega antes del lunes 16 a las 08:00.', dueAt: '2026-11-10T09:00:00Z' };
const BOTH = 'alt-o-franja-cruz-jueves+o-frioval-jueves';

type Fixture = Awaited<ReturnType<typeof open>>;
async function open(file = ':memory:') {
  const base = await createBaseApp({ root: '.', dbPath: file, staticDir: 'none' });
  let now = NOW;
  const mounted = mountDateCheck(base.app, base.store, { clock: () => now });
  const pin = () => workspaceSearchIdentity(base.store)?.contextRevision ?? '0'.repeat(64);
  let cookie: string | undefined;
  const send = (method: 'GET' | 'POST', url: string, payload?: unknown) => base.app.inject({ method, url, headers: cookie ? { ...headers, cookie } : headers, ...(payload === undefined ? {} : { payload: payload as object }) });
  const get = (suffix: string) => send('GET', `${dateCheckApiPath}${suffix}${suffix.includes('?') ? '&' : '?'}contextRevision=${pin()}`);
  const post = (suffix: string, body: Record<string, unknown>) => send('POST', dateCheckApiPath + suffix, { contextRevision: pin(), ...body });
  return {
    ...base, pin, get, post, send, stats: mounted.stats,
    setCookie: (value: string | undefined) => { cookie = value; }, tick: (ms: number) => { now += ms; },
    meta: () => JSON.stringify(base.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'date-check:%' ORDER BY key").all()),
    business: () => JSON.stringify(['records', 'changes', 'captures', 'archives'].map(table => base.store.db.prepare('SELECT * FROM ' + table).all())),
  };
}
function activateCopy(f: Pick<Fixture, 'store'>) {
  const snapshot = makeFixture('agency');
  f.store.importSnapshot(snapshot, !!f.store.snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false });
  f.store.activate();
}
async function ready(file = ':memory:') { const f = await open(file); activateCopy(f); return f; }
const code = (response: { body: string }) => JSON.parse(response.body).details?.code ?? null;
const form = () => DEMO.defaults();
async function analyze(f: Fixture, value = form()): Promise<DateCheckView> {
  const response = await f.post('/analyze', { form: value });
  assert.equal(response.statusCode, 200, response.body);
  return dateCheckView.parse(JSON.parse(response.body));
}

test('sin copia de ensayo activa no se ofrece nada y con otra copia se rechaza', async t => {
  const f = await open();
  t.after(() => f.app.close());
  assert.equal(code(await f.get('/catalog')), 'DATE_CHECK_CONTEXT_CHANGED');
  activateCopy(f);
  const catalog = dateCheckCatalog.parse(JSON.parse((await f.get('/catalog')).body));
  assert.equal(catalog.mode, 'fiction');
  assert.deepEqual(catalog.defaults, form());
  assert.equal(catalog.week.now, '2026-11-09T07:00:00.000Z', 'el reloj del caso es fijo');
  assert.equal(code(await f.send('POST', dateCheckApiPath + '/analyze', { contextRevision: 'f'.repeat(64), form: form() })), 'DATE_CHECK_CONTEXT_CHANGED');
});

test('comparar no escribe nada y devuelve la tabla de aceptación con nombres y evidencia', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const before = { meta: f.meta(), business: f.business() };
  const view = await analyze(f);
  assert.deepEqual({ meta: f.meta(), business: f.business() }, before, 'ni un registro de negocio ni una clave propia');
  assert.equal(f.stats().analyses, 1); assert.equal(f.stats().saves + f.stats().decisions, 0);
  assert.equal(view.inputRevision, dateCheckRevision(demoInput(form(), initialDemoState())));
  assert.equal(view.request.windowStart, madridDayAt(form().requestedAt, 8));
  const keep = view.alternatives.find(item => item.id === view.keepId)!;
  assert.deepEqual([keep.requested.outcome, keep.requested.classification, keep.supported.at], ['misses', 'conflict', '2026-11-17T14:30:00.000Z']);
  const material = keep.blockers.find(item => item.code === 'material');
  assert.ok(material && material.code === 'material');
  assert.equal(material.label, 'Unidad interior VRF 12 kBTU · Almacén Sur');
  assert.deepEqual(material.pending, ['Frioval · 4 unidades (fecha sin confirmar)']);
  const staffing = keep.blockers.find(item => item.code === 'staffing');
  assert.ok(staffing && staffing.code === 'staffing');
  assert.deepEqual(staffing.occupiedBy, [{ title: 'Solar Granja Prado', protected: true, minutes: 165 }]);
  assert.equal(view.best, BOTH);
  const both = view.alternatives.find(item => item.id === BOTH)!;
  assert.equal(both.label, 'Frioval confirma las 4 unidades para el jueves 12 a las 10:00 + Cruz vuelve de la formación el jueves 12 a las 13:00');
  assert.equal(both.requested.outcome, 'meets');
  // Cada fila de compromiso afectado abre su evidencia: la entrega del lunes cita la reserva observada con cuenta, fuente, revisión y momento.
  const monday = both.affected.find(item => item.commitmentId === 'c-o20')!;
  const reservation = monday.evidence.find(item => item.label.startsWith('Reserva RES-2020'))!;
  assert.deepEqual([reservation.basis, reservation.source, reservation.observedAt], ['observed', 'erp-fixture · fixture-erp-sur · reservation RES-2020 · revisión erp-r812', '2026-11-09T06:30:00Z']);
  assert.ok(both.material.evidence.some(item => item.label.startsWith('Reposición semanal') && item.basis === 'observed'));
  assert.deepEqual(view.checkFirst.map(item => [item.kind, item.neededBy]), [['inbound-arrival', '2026-11-16T07:00:00.000Z'], ['slot', null]]);
  assert.equal(view.scenarios.length, 2);
});

test('guardar es idempotente por clave; confirmar escribe UNA decisión ligada a la revisión; reintentos y dos pestañas no duplican', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const view = await analyze(f);
  const businessBefore = f.business();
  const saved = await f.post('/checks', { id: ID, form: form(), inputRevision: view.inputRevision });
  assert.equal(saved.statusCode, 201);
  const record = dateCheckRecordView.parse(JSON.parse(saved.body));
  assert.deepEqual([record.state, record.decision], ['current', null]);
  const afterSave = f.meta();
  assert.equal((await f.post('/checks', { id: ID, form: form(), inputRevision: view.inputRevision })).statusCode, 200);
  assert.equal(f.meta(), afterSave, 'guardar dos veces no cambia nada');
  assert.equal(code(await f.post('/checks', { id: ID, form: { ...form(), quantity: 6 }, inputRevision: dateCheckRevision(demoInput({ ...form(), quantity: 6 }, initialDemoState())) })), 'DATE_CHECK_ID_REUSED');
  assert.equal(code(await f.post('/checks', { id: OTHER, form: form(), inputRevision: 'a'.repeat(64) })), 'DATE_CHECK_STALE');

  assert.equal(code(await f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: 'alt-inventada', operationId: OPERATION, ...step })), 'DATE_CHECK_NOT_CONFIRMABLE');
  const confirm = { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OPERATION, ...step };
  const first = await f.post(`/checks/${ID}/confirm`, confirm);
  assert.equal(first.statusCode, 201);
  const decided = dateCheckRecordView.parse(JSON.parse(first.body));
  assert.deepEqual(decided.decision?.promised, { requestedAt: '2026-11-13T15:00:00.000Z', outcome: 'meets', supportedAt: '2026-11-13T13:30:00.000Z', conditions: [
    'Confirmar: Frioval confirma las 4 unidades para el jueves 12 a las 10:00', 'Confirmar: Cruz vuelve de la formación el jueves 12 a las 13:00'] });
  assert.equal(decided.decision?.inputRevision, view.inputRevision);
  const afterDecision = f.meta();
  // Se perdió el acuse: repetir con la MISMA clave devuelve lo guardado (el recibo muestra lo persistido) y no escribe.
  const replay = await f.post(`/checks/${ID}/confirm`, confirm);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(dateCheckRecordView.parse(JSON.parse(replay.body)).decision, decided.decision);
  assert.equal(f.meta(), afterDecision);
  // La misma clave con otro texto, o la otra pestaña con otra clave, se rechazan.
  assert.equal(code(await f.post(`/checks/${ID}/confirm`, { ...confirm, nextStep: 'Otra cosa' })), 'DATE_CHECK_OPERATION_REUSED');
  assert.equal(code(await f.post(`/checks/${ID}/confirm`, { ...confirm, operationId: OPERATION_2 })), 'DATE_CHECK_ALREADY_DECIDED');
  assert.equal(f.meta(), afterDecision);
  assert.equal(f.business(), businessBefore, 'el siguiente paso es local: no toca registros del CRM');
  assert.deepEqual(f.stats(), { analyses: 1, saves: 1, decisions: 1, replays: 1 });
  const list = dateCheckList.parse(JSON.parse((await f.get('/checks')).body));
  assert.deepEqual(list.items.map(item => [item.id, item.state, item.decided]), [[ID, 'current', true]]);
});

test('dos pestañas confirmando a la vez: solo una decisión', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const view = await analyze(f);
  await f.post('/checks', { id: ID, form: form(), inputRevision: view.inputRevision });
  const [a, b] = await Promise.all([
    f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OPERATION, ...step }),
    f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: view.keepId, operationId: OPERATION_2, ...step, nextStep: 'Ofrecer el martes 17.' }),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]);
  assert.equal(f.stats().decisions, 1);
});

test('una revisión posterior retira la franja: lo comparado sigue legible, confirmar exige recalcular y el recálculo no ofrece el viernes', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const view = await analyze(f);
  await f.post('/checks', { id: ID, form: form(), inputRevision: view.inputRevision });
  const catalog = dateCheckCatalog.parse(JSON.parse((await f.post('/demo/revision', { change: 'withdraw-slot' })).body));
  assert.deepEqual([catalog.demo.revision, catalog.demo.slotWithdrawn], [2, true]);
  const reopened = dateCheckRecordView.parse(JSON.parse((await f.get(`/checks/${ID}`)).body));
  assert.equal(reopened.state, 'historical');
  assert.equal(reopened.view.alternatives.find(item => item.id === BOTH)!.requested.outcome, 'meets', 'lo comparado no se reescribe');
  assert.notEqual(reopened.currentInputRevision, view.inputRevision);
  const before = f.meta();
  assert.equal(code(await f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OPERATION, ...step })), 'DATE_CHECK_STALE');
  assert.equal(f.meta(), before);
  assert.equal(code(await f.post('/checks', { id: OTHER, form: form(), inputRevision: view.inputRevision })), 'DATE_CHECK_STALE');
  const fresh = await analyze(f);
  assert.equal(fresh.alternatives.some(item => item.id.includes('franja')), false);
  assert.equal(fresh.best, null, 'sin franja, nada cumple el viernes sin romper una protección');
});

test('con la sesión bloqueada no se compara ni se guarda; al desbloquear vuelve', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const setup = await f.send('POST', '/api/v2/auth/setup', { password: 'contrasena-ficticia-de-ensayo' });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  assert.ok(cookie.startsWith('planb_session='));
  assert.equal((await f.get('/catalog')).statusCode, 401);
  assert.equal((await f.post('/analyze', { form: form() })).statusCode, 401);
  assert.equal((await f.post('/checks', { id: ID, form: form(), inputRevision: 'a'.repeat(64) })).statusCode, 401);
  f.setCookie(cookie);
  assert.equal((await f.get('/catalog')).statusCode, 200);
});

test('formularios inválidos se rechazan sin calcular', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  assert.equal(code(await f.post('/analyze', { form: { ...form(), requestedAt: '2026-12-24T15:00:00Z' } })), 'DATE_CHECK_INVALID');
  assert.equal((await f.post('/analyze', { form: { ...form(), quantity: 999 } })).statusCode, 422);
  assert.equal((await f.post('/analyze', { form: { ...form(), extra: true } })).statusCode, 422);
  assert.equal(f.stats().analyses, 0);
});

test('reinicio sobre el mismo archivo: se reencuentran comprobación, decisión y estado; arrancar y leer no escriben ni recalculan', async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'date-check-mount-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'data.sqlite');
  let f = await ready(file);
  t.after(async () => { await f.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const pin = f.pin(), view = await analyze(f);
  await f.post('/checks', { id: ID, form: form(), inputRevision: view.inputRevision });
  const decided = dateCheckRecordView.parse(JSON.parse((await f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OPERATION, ...step })).body));
  const stored = f.meta();
  await f.app.close();
  f = await open(file);
  f.tick(6 * 60 * 60_000);
  assert.equal(f.pin(), pin);
  assert.equal(f.meta(), stored, 'arrancar no toca comprobaciones ni decisiones');
  const reopened = dateCheckRecordView.parse(JSON.parse((await f.get(`/checks/${ID}`)).body));
  assert.deepEqual([reopened.state, reopened.decision], ['current', decided.decision]);
  assert.equal(f.meta(), stored, 'reabrir no escribe');
  assert.deepEqual(f.stats(), { analyses: 0, saves: 0, decisions: 0, replays: 0 }, 'ni recalcula al reabrir');
  // El reintento tras reiniciar sigue devolviendo lo guardado.
  const replay = await f.post(`/checks/${ID}/confirm`, { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OPERATION, ...step });
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(f.stats().replays, 1);
});
