import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { COMMITMENT_RADAR_CAPABILITY_PATH, mountCommitmentRadar } from '../server/commitment-radar-mount.js';
import { mountOperationalRehearsal } from '../server/operational-rehearsal-mount.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { commitmentDetailResponse, commitmentPath } from '../shared/commitments.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import {
  rehearsalAnalysis, rehearsalApiPath, rehearsalCheckFirst, rehearsalDecisionDraft, rehearsalOverview, rehearsalView,
} from '../shared/operational-rehearsal-api.js';
import { REHEARSAL_RADAR_COMMITMENT, buildRehearsalDemo } from '../shared/operational-rehearsal-demo.js';
import { operationalModel, operationalRevision } from '../shared/operational-twin.js';

process.env.NODE_ENV = 'test';
// Miércoles 11/11/2026: el Radar fija la fecha del compromiso dos días después, el viernes 13.
const NOW = Date.parse('2026-11-11T15:00:00.000Z'), headers = { host: '127.0.0.1' };
const FOCUS = REHEARSAL_RADAR_COMMITMENT, ID = '5e2f6a10-7c3b-4d19-9a40-1b2c3d4e5f60', OPERATION = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', OTHER = '22222222-3333-4444-8555-666666666666';

type Fixture = Awaited<ReturnType<typeof open>>;
async function open(file = ':memory:', mounts: { radar?: boolean } = {}) {
  const base = await createBaseApp({ root: '.', dbPath: file, staticDir: 'none' });
  let now = NOW;
  if (mounts.radar !== false) mountCommitmentRadar(base.app, base.store, { clock: () => now });
  mountOperationalRehearsal(base.app, base.store, { clock: () => now });
  const pin = () => workspaceSearchIdentity(base.store)?.contextRevision ?? '0'.repeat(64);
  let cookie: string | undefined;
  const send = (method: 'GET' | 'POST', url: string, payload?: unknown) => base.app.inject({ method, url, headers: cookie ? { ...headers, cookie } : headers, ...(payload === undefined ? {} : { payload: payload as object }) });
  const get = (suffix = '', query = `commitmentId=${FOCUS}`) => send('GET', `${rehearsalApiPath}${suffix}?contextRevision=${pin()}${query ? '&' + query : ''}`);
  const post = (suffix: string, body: Record<string, unknown>) => send('POST', rehearsalApiPath + suffix, { contextRevision: pin(), ...body });
  return {
    ...base, pin, get, post, send,
    setCookie: (value: string | undefined) => { cookie = value; }, tick: (ms: number) => { now += ms; },
    meta: () => JSON.stringify(base.store.db.prepare('SELECT key, value FROM meta ORDER BY key').all()),
    // Solo lo que guardan el ensayo y el Radar (el arranque de la app base reescribe claves propias, ajenas a esta unidad).
    owned: () => JSON.stringify(base.store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'operational-rehearsal:%' OR key LIKE 'commitment-%' ORDER BY key").all()),
    scenario: { commitmentId: FOCUS, perturbationIds: [] as string[], priority: 'focus' as const },
  };
}
function activateCopy(f: Pick<Fixture, 'store'>) {
  const snapshot = makeFixture('agency');
  f.store.importSnapshot(snapshot, !!f.store.snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false });
  f.store.activate();
}
async function ready(file = ':memory:') {
  const f = await open(file);
  activateCopy(f);
  assert.equal((await f.send('POST', COMMITMENT_RADAR_CAPABILITY_PATH + '/activate', { contextRevision: f.pin() })).statusCode, 201);
  return f;
}
const code = (response: { body: string }) => JSON.parse(response.body).details?.code ?? null;
const radarDetail = async (f: Fixture) => commitmentDetailResponse.parse(JSON.parse((await f.send('GET', `${commitmentPath}/${FOCUS}?contextRevision=${f.pin()}`)).body));
const step = { owner: 'Marta (ficción)', nextStep: 'Confirmar con Almacén Sur que los equipos equivalentes están el martes.', dueAt: '2026-11-12T10:00:00Z' };

test('sin copia de ensayo, sin Radar o con otro compromiso no se ofrece ensayo ni se inventa nada', async t => {
  const empty = await open();
  t.after(() => empty.app.close());
  assert.deepEqual([(await empty.get()).statusCode, code(await empty.get())], [409, 'REHEARSAL_CONTEXT_CHANGED']);
  activateCopy(empty);
  const before = empty.meta(), notSeeded = rehearsalOverview.parse(JSON.parse((await empty.get()).body));
  assert.deepEqual([notSeeded.status, notSeeded.focus, notSeeded.diagnosis, notSeeded.options], ['radar-not-ready', null, null, []]);
  assert.equal(code(await empty.post('/analyze', empty.scenario)), 'REHEARSAL_RADAR_REQUIRED');
  assert.equal(empty.meta(), before, 'leer no crea la semilla del Radar ni ningún registro');

  const f = await ready();
  t.after(() => f.app.close());
  const other = rehearsalOverview.parse(JSON.parse((await f.get('', 'commitmentId=ms-delivery-healthy')).body));
  assert.equal(other.status, 'commitment-not-linked');
  assert.equal(code(await f.post('/analyze', { ...f.scenario, commitmentId: 'ms-delivery-healthy' })), 'REHEARSAL_COMMITMENT_NOT_LINKED');
  assert.equal((await f.send('GET', `${rehearsalApiPath}?contextRevision=${'0'.repeat(64)}&commitmentId=${FOCUS}`)).statusCode, 409);
  assert.equal((await f.send('GET', `${rehearsalApiPath}?contextRevision=${f.pin()}`)).statusCode, 422);
  assert.equal((await f.post('/analyze', { ...f.scenario, extra: 1 })).statusCode, 422);
  assert.equal(code(await f.post('/analyze', { ...f.scenario, perturbationIds: ['no-existe'] })), 'REHEARSAL_INVALID');

  // Sin el Radar montado en la app, el ensayo no se ofrece aunque haya semilla.
  const alone = await open(':memory:', { radar: false });
  t.after(() => alone.app.close());
  activateCopy(alone);
  assert.equal(rehearsalOverview.parse(JSON.parse((await alone.get()).body)).status, 'radar-not-ready');
});

test('la semana de ensayo es la empresa completa con el compromiso del Radar, su fecha y su revisión', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const response = await f.get(), overview = rehearsalOverview.parse(JSON.parse(response.body)), detail = await radarDetail(f);
  assert.deepEqual([response.headers['cache-control'], response.headers.vary], ['no-store', 'Cookie']);
  assert.deepEqual([overview.status, overview.mode], ['available', 'fiction']);
  assert.deepEqual(overview.counts, { installations: 12, technicians: 3, warehouses: 2, orders: 20, tickets: 8 });
  assert.deepEqual(overview.focus, { commitmentId: FOCUS, title: detail.item.title, dueAt: detail.item.dueAt, commitmentRevision: detail.item.revision, closed: false });
  assert.equal(overview.focus!.dueAt, '2026-11-13T15:00:00.000Z');
  assert.equal(overview.week!.now, '2026-11-09T07:00:00.000Z', 'el reloj del modelo es el lunes de la semana cuyo viernes es la fecha del Radar');
  const demo = buildRehearsalDemo({ commitmentId: FOCUS, revision: detail.item.revision, title: detail.item.title, dueAt: detail.item.dueAt });
  assert.equal(overview.modelRevision, operationalRevision(demo.model));
  // Diagnóstico del plan declarado, con nombres legibles y procedencia.
  const diagnosis = overview.diagnosis!;
  assert.deepEqual([diagnosis.projection, diagnosis.completionAt, diagnosis.latenessMinutes], ['late', '2026-11-16T11:30:00.000Z', 4110]);
  assert.deepEqual(diagnosis.steps.map(item => [item.title, item.resource, item.held.map(held => `${held.code}:${held.name ?? ''}`)]), [
    ['Ticket: incidencia pendiente en Almacén Norte', 'Ana', ['resource-busy:Instalar los 12 equipos en Almacén Norte', 'dependency:Instalar los 12 equipos en Almacén Norte']],
    ['Instalar los 12 equipos en Almacén Norte', 'Ana', ['resource-busy:Climatización urgente Hotel Faro']],
    ['Climatización urgente Hotel Faro', 'Ana', ['earliest-start:']],
  ]);
  assert.ok(diagnosis.evidence.some(item => item.subject === 'Equipos del pedido (retenidos)' && item.basis === 'observed' && item.origin === 'orders-fixture · fixture-orders-a'));
  assert.ok(diagnosis.evidence.some(item => item.basis === 'declared'));
  assert.deepEqual(diagnosis.offTime.map(item => [item.commitmentId, item.projection]), [[FOCUS, 'late'], ['c-t07', 'indeterminate']]);
  assert.deepEqual([overview.perturbations.length, overview.options.length, overview.hypotheses.length, overview.rehearsals], [4, 4, 2, []]);
  assert.equal(overview.rival!.title, 'Climatización urgente Hotel Faro');
});

test('ensayar, comparar y preguntar qué comprobar no escribe nada y es reproducible', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const before = f.meta();
  const first = await f.post('/analyze', f.scenario), analysis = rehearsalAnalysis.parse(JSON.parse(first.body));
  assert.equal(first.statusCode, 200);
  assert.deepEqual([analysis.kind, analysis.hypothetical, analysis.optimality], ['proposal', true, 'best-found']);
  assert.deepEqual([analysis.conflict.verdict, analysis.conflict.minimality, analysis.conflict.scope], ['conflict', 'verified-irreducible', 'examined-commitments-only']);
  assert.deepEqual(analysis.conflict.commitments.map(item => [item.commitmentId, item.neededDueAt]), [[FOCUS, '2026-11-16T11:00:00.000Z'], ['c-i08', '2026-11-16T07:30:00.000Z']]);
  assert.deepEqual([analysis.conflict.resources, analysis.conflict.materials], [['Ana', 'Cruz'], ['Equipos del pedido (retenidos)']]);
  assert.deepEqual(analysis.alternatives.map(item => [item.id, item.label, item.authorization, item.focus.projection]), [
    ['alt-sin-cambios', 'Replanificar con lo que hay', 'unconfirmed', 'on-time'],
    ['alt-o-extra-cruz', 'Cruz aplaza la formación del jueves', 'unconfirmed', 'on-time'],
    ['alt-o-bomba-alt', 'Usar equipos equivalentes del Almacén Sur', 'unconfirmed', 'on-time'],
    ['alt-o-mover-i07', 'Renegociar la fecha al lunes siguiente', 'unconfirmed', 'on-time'],
    ['alt-o-dividir-i07', 'Dividir la instalación en dos partes', 'unconfirmed', 'on-time'],
  ]);
  assert.deepEqual(analysis.alternatives.map(item => item.missed), [1, 0, 0, 0, 0], 'sin cambios se retrasa otra instalación; cada respuesta la salva');
  assert.ok(analysis.alternatives.slice(1).every(item => item.deltas.length === 1 && item.deltas[0].title === 'Climatización urgente Hotel Faro' && item.deltas[0].effect === 'improves'));
  assert.equal(analysis.alternatives[3].focus.dueAt, '2026-11-16T15:00:00.000Z', 'la fecha movida se muestra como tal');
  assert.ok(analysis.alternatives.every(item => item.timeline.length === 5 && item.timeline.flatMap(row => row.jobs).some(job => job.focus)));
  assert.equal(analysis.alternatives[4].timeline.flatMap(row => row.jobs).filter(job => job.title.includes('(parte')).length, 2);
  assert.equal(JSON.stringify(JSON.parse((await f.post('/analyze', f.scenario)).body)), JSON.stringify(JSON.parse(first.body)), 'misma entrada, misma respuesta');

  // Con perturbaciones y prioridad nueva.
  const delayed = rehearsalAnalysis.parse(JSON.parse((await f.post('/analyze', { ...f.scenario, perturbationIds: ['p-bomba-tarde'] })).body));
  assert.ok(delayed.diagnosis.caveats.some(item => item.code === 'assumed' && item.subject === 'Equipos del pedido (retenidos)'));
  assert.notEqual(delayed.alternatives[0].focus.projection, 'on-time');
  const down = rehearsalAnalysis.parse(JSON.parse((await f.post('/analyze', { ...f.scenario, perturbationIds: ['p-pedidos-a-caida'] })).body));
  assert.deepEqual([down.diagnosis.projection, down.conflict.verdict], ['indeterminate', 'indeterminate']);
  assert.ok(down.conflict.missingData.length > 0);
  const swapped = rehearsalAnalysis.parse(JSON.parse((await f.post('/analyze', { ...f.scenario, priority: 'rival' })).body));
  assert.deepEqual([swapped.alternatives[0].focus.projection, swapped.alternatives[0].missed], ['late', 1]);

  const check = rehearsalCheckFirst.parse(JSON.parse((await f.post('/check-first', f.scenario)).body));
  assert.deepEqual([check.mostDecisive, check.probabilities, check.method], ['bomba-alt', 'none', 'one-at-a-time']);
  assert.deepEqual(check.ranking.map(row => row.hypothesisId), ['bomba-alt', 'ticket-solar']);
  assert.equal(f.meta(), before, 'ni un byte nuevo en el almacén');
});

test('guardar, elegir, confirmar UNA decisión por la ruta existente, repetir sin segundo efecto y reiniciar en proceso nuevo', async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'rehearsal-mount-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'data.sqlite');
  let f = await ready(file);
  t.after(async () => { await f.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const pin = f.pin(), revision = (await radarDetail(f)).item.revision;

  const saved = await f.post('/rehearsals', { ...f.scenario, id: ID }), view = rehearsalView.parse(JSON.parse(saved.body));
  assert.equal(saved.statusCode, 201);
  assert.deepEqual([view.state, view.status, view.canConfirm, view.record.hypothetical, view.record.focus.commitmentRevision], ['current', 'simulation-only', false, true, revision]);
  assert.equal(view.labels['alt-o-bomba-alt'], 'Usar equipos equivalentes del Almacén Sur');
  // Guardar de nuevo con la misma clave no duplica; otra entrada con la misma clave se rechaza.
  const afterSave = f.meta();
  assert.equal((await f.post('/rehearsals', { ...f.scenario, id: ID })).statusCode, 200);
  assert.equal(f.meta(), afterSave);
  assert.equal(code(await f.post('/rehearsals', { ...f.scenario, id: ID, perturbationIds: ['p-ana-baja'] })), 'REHEARSAL_ID_REUSED');

  assert.equal(code(await f.post(`/rehearsals/${ID}/decision-draft`, { operationId: OPERATION, ...step })), 'REHEARSAL_NOT_CONFIRMABLE');
  assert.equal(code(await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-inventada' })), 'REHEARSAL_INVALID');
  const chosen = rehearsalView.parse(JSON.parse((await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-o-bomba-alt' })).body));
  assert.deepEqual([chosen.canConfirm, chosen.record.chosen], [true, { alternativeId: 'alt-o-bomba-alt', suppositionIds: ['o-bomba-alt'] }]);

  // Preparar no decide: guarda solo la preparación (R2 de 327). La decisión la escribe la ruta de compromisos que ya existe.
  const eventsBefore = (await radarDetail(f)).events.length;
  const draft = rehearsalDecisionDraft.parse(JSON.parse((await f.post(`/rehearsals/${ID}/decision-draft`, { operationId: OPERATION, ...step })).body));
  assert.equal((await radarDetail(f)).events.length, eventsBefore);
  assert.deepEqual(draft.request, { contextRevision: pin, expectedRevision: revision, operationId: OPERATION, decision: { type: 'assign', ...step } });
  assert.equal(code(await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })), 'REHEARSAL_DECISION_NOT_FOUND', 'no se anota una decisión que el Radar no tiene');
  const decided = await f.send('POST', `${commitmentPath}/${FOCUS}/decisions`, draft.request);
  assert.equal(decided.statusCode, 200);
  const replay = await f.send('POST', `${commitmentPath}/${FOCUS}/decisions`, draft.request);
  assert.deepEqual(JSON.parse(replay.body), JSON.parse(decided.body), 'repetir la decisión aceptada devuelve el mismo recibo');
  assert.equal((await radarDetail(f)).events.length, 1, 'y no crea un segundo efecto');

  const linked = rehearsalView.parse(JSON.parse((await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })).body));
  assert.deepEqual([linked.status, linked.state, linked.canConfirm, linked.record.hypothetical], ['decision-recorded', 'historical', false, true]);
  assert.deepEqual(linked.reasons, ['base-revision-changed', 'commitment-revision-changed'], 'la decisión cambió la revisión del compromiso: el ensayo queda como histórico');
  assert.deepEqual(linked.record.decision, { operationId: OPERATION, commitmentId: FOCUS, expectedRevision: revision });
  const afterLink = f.meta(), ownedAfterLink = f.owned();
  assert.equal((await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })).statusCode, 200);
  assert.equal(f.meta(), afterLink, 'anotar dos veces no cambia nada');
  assert.equal(code(await f.post(`/rehearsals/${ID}/link`, { operationId: OTHER })), 'REHEARSAL_DECISION_NOT_FOUND');
  assert.equal(code(await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-o-mover-i07' })), 'REHEARSAL_STALE');
  assert.equal(code(await f.post(`/rehearsals/${ID}/decision-draft`, { operationId: OTHER, ...step })), 'REHEARSAL_STALE');

  // Reinicio en proceso nuevo sobre el mismo archivo: se conserva todo y no se ejecuta nada al arrancar ni al leer.
  await f.app.close();
  f = await open(file);
  f.tick(6 * 60 * 60_000);
  const cold = f.meta();
  assert.equal(f.owned(), ownedAfterLink, 'arrancar no toca ensayos, decisiones ni semilla');
  assert.equal(JSON.parse(f.owned()).length, 5, 'semilla, historial del compromiso, índice, un ensayo y su preparación');
  assert.equal(f.pin(), pin);
  const overview = rehearsalOverview.parse(JSON.parse((await f.get()).body));
  assert.deepEqual(overview.rehearsals, [{ id: ID, createdAt: new Date(NOW).toISOString(), state: 'historical', status: 'decision-recorded', chosen: 'Usar equipos equivalentes del Almacén Sur' }]);
  assert.equal(overview.week!.now, '2026-11-09T07:00:00.000Z', 'el reloj del modelo no se mueve al reiniciar ni al pasar las horas');
  const reopened = rehearsalView.parse(JSON.parse((await f.get(`/rehearsals/${ID}`, '')).body));
  assert.deepEqual(reopened.record, linked.record);
  const radar = await radarDetail(f);
  assert.deepEqual([radar.events.length, radar.item.action], [1, step]);
  assert.equal(f.meta(), cold, 'reabrir y leer tampoco escriben ni vuelven a ensayar');
  // Simulación, decisión y resultado observado siguen separados: el Radar no da el compromiso por resuelto por haber ensayado o decidido.
  assert.deepEqual([radar.item.status, radar.item.cause, radar.item.closure], ['at-risk', 'source-blocked', null]);

  // Un ensayo nuevo sobre la revisión vigente vuelve a ser confirmable.
  const fresh = rehearsalView.parse(JSON.parse((await f.post('/rehearsals', { ...f.scenario, id: OTHER })).body));
  assert.deepEqual([fresh.state, fresh.record.focus.commitmentRevision], ['current', radar.item.revision]);
  assert.equal(code(await f.get(`/rehearsals/${OPERATION}`, '')), 'REHEARSAL_NOT_FOUND');
});

test('con la copia bloqueada no se lee ni se ensaya; al desbloquear vuelve', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const setup = await f.send('POST', '/api/v2/auth/setup', { password: 'contrasena-ficticia-de-ensayo' });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  assert.ok(cookie.startsWith('planb_session='));
  assert.equal((await f.get()).statusCode, 401);
  assert.equal((await f.post('/analyze', f.scenario)).statusCode, 401);
  assert.equal((await f.post('/rehearsals', { ...f.scenario, id: ID })).statusCode, 401);
  f.setCookie(cookie);
  assert.equal(rehearsalOverview.parse(JSON.parse((await f.get()).body)).status, 'available');
  assert.equal((await f.post('/rehearsals', { ...f.scenario, id: ID })).statusCode, 201);
});

// ── R2 (revisión independiente 327): la decisión se atribuye al ensayo y a la alternativa EXACTOS que la prepararon ──────────────────────────────────────────────
const crm = (f: Fixture) => JSON.stringify(['records', 'changes', 'captures', 'archives'].map(table => f.store.db.prepare('SELECT * FROM ' + table).all()));
const view = async (f: Fixture, id: string) => rehearsalView.parse(JSON.parse((await f.get(`/rehearsals/${id}`, '')).body));
const draftFor = async (f: Fixture, id: string, operationId: string, extra: Record<string, unknown> = {}) => f.post(`/rehearsals/${id}/decision-draft`, { operationId, ...step, ...extra });
const decide = (f: Fixture, request: unknown) => f.send('POST', `${commitmentPath}/${FOCUS}/decisions`, request);
const THIRD = '33333333-4444-4555-8666-777777777777', FOURTH = '44444444-5555-4666-8777-888888888888';

test('R2 · cambiar la elección tras preparar: la decisión se atribuye a la alternativa preparada, con prueba, y el CRM no cambia', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const records = crm(f);
  assert.equal((await f.post('/rehearsals', { ...f.scenario, id: ID })).statusCode, 201);
  await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-o-bomba-alt' });
  const beforeDraft = f.owned();
  const prepared = rehearsalDecisionDraft.parse(JSON.parse((await draftFor(f, ID, OPERATION)).body));
  // Preparar guarda SOLO la preparación: ninguna decisión en el Radar, ningún registro del CRM.
  const added = (JSON.parse(f.owned()) as { key: string }[]).map(row => row.key).filter(key => !(JSON.parse(beforeDraft) as { key: string }[]).some(row => row.key === key));
  assert.deepEqual(added.map(key => key.split(':').slice(-2).join(':')), [`${ID}:prepared`]);
  assert.equal((await radarDetail(f)).events.length, 0);
  assert.deepEqual((await view(f, ID)).pending, [{ operationId: OPERATION, alternativeId: 'alt-o-bomba-alt', label: 'Usar equipos equivalentes del Almacén Sur' }]);
  const afterDraft = f.owned();
  assert.equal((await draftFor(f, ID, OPERATION)).statusCode, 200);
  assert.equal(f.owned(), afterDraft, 'repetir la misma preparación no reescribe');
  assert.equal(code(await draftFor(f, ID, OPERATION, { owner: 'Otra persona (ficción)' })), 'REHEARSAL_ID_REUSED');

  // La persona cambia de opinión (o lo hace otra pestaña) y aun así se envía la petición ORIGINAL.
  const switched = rehearsalView.parse(JSON.parse((await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-o-mover-i07' })).body));
  assert.equal(switched.record.chosen?.alternativeId, 'alt-o-mover-i07');
  assert.equal((await decide(f, prepared.request)).statusCode, 200);
  const linked = rehearsalView.parse(JSON.parse((await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })).body));
  assert.equal(linked.record.chosen?.alternativeId, 'alt-o-bomba-alt', 'la decisión enviada se preparó para los equipos equivalentes');
  assert.deepEqual(linked.decisionDetail, { alternativeId: 'alt-o-bomba-alt', label: 'Usar equipos equivalentes del Almacén Sur', ...step });
  assert.deepEqual([linked.pending, linked.status], [[], 'decision-recorded']);
  assert.deepEqual((await radarDetail(f)).events.map(event => event.operationId), [OPERATION]);
  const settled = f.owned();
  assert.equal((await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })).statusCode, 200);
  assert.equal(f.owned(), settled, 'repetir el enlace no cambia nada');
  assert.equal(crm(f), records, 'ni una fila del CRM cambia por ensayar, preparar, decidir o enlazar');
});

test('R2 · una decisión ajena, de otro ensayo o con otros valores no se atribuye; dos ensayos de la misma revisión no se cruzan', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  for (const id of [ID, OTHER]) {
    assert.equal((await f.post('/rehearsals', { ...f.scenario, id })).statusCode, 201);
    await f.post(`/rehearsals/${id}/choose`, { alternativeId: id === ID ? 'alt-o-bomba-alt' : 'alt-o-dividir-i07' });
  }
  const revision = (await radarDetail(f)).item.revision;
  // 1) Decisión tomada directamente en el Radar, sin preparar: no se atribuye a ningún ensayo.
  const direct = { contextRevision: f.pin(), expectedRevision: revision, operationId: THIRD, decision: { type: 'assign', owner: 'Lucía (ficción)', nextStep: 'Llamar al cliente.', dueAt: step.dueAt } };
  assert.equal(code(await f.post(`/rehearsals/${ID}/link`, { operationId: THIRD })), 'REHEARSAL_DECISION_NOT_FOUND');
  // 2) Preparada desde el ensayo OTHER: no se puede enlazar al ensayo ID.
  const fromOther = rehearsalDecisionDraft.parse(JSON.parse((await draftFor(f, OTHER, FOURTH)).body));
  assert.equal(code(await f.post(`/rehearsals/${ID}/link`, { operationId: FOURTH })), 'REHEARSAL_DECISION_NOT_FOUND');
  // 3) Preparada desde ID pero el Radar aceptó OTROS valores con esa clave: tampoco.
  await draftFor(f, ID, OPERATION);
  const rehearsals = () => JSON.stringify((JSON.parse(f.owned()) as { key: string }[]).filter(row => row.key.startsWith('operational-rehearsal:')));
  const prepared = rehearsals();
  assert.equal((await decide(f, { ...direct, operationId: OPERATION })).statusCode, 200);
  assert.equal(code(await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })), 'REHEARSAL_DECISION_NOT_FOUND', 'misma clave, valores distintos de los preparados');
  assert.equal(rehearsals(), prepared, 'los ensayos no cambian al rechazar un enlace');
  const [first, second] = [await view(f, ID), await view(f, OTHER)];
  assert.deepEqual([first.record.decision, second.record.decision], [null, null]);
  assert.deepEqual((await radarDetail(f)).events.map(event => event.operationId), [OPERATION], 'el Radar conserva su único efecto');
  // La petición de OTHER ya no entra en el Radar (la revisión cambió) y su ensayo queda histórico, con la preparación a la vista para comprobar.
  assert.equal((await decide(f, fromOther.request)).statusCode, 409);
  assert.deepEqual([second.state, second.pending.map(item => item.operationId)], ['historical', [FOURTH]]);
});

test('R2 · acuse perdido: tras reiniciar se comprueba la decisión preparada sin volver a decidir', async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'rehearsal-r2-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'data.sqlite');
  let f = await ready(file);
  t.after(async () => { await f.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await f.post('/rehearsals', { ...f.scenario, id: ID });
  await f.post(`/rehearsals/${ID}/choose`, { alternativeId: 'alt-o-dividir-i07' });
  const prepared = rehearsalDecisionDraft.parse(JSON.parse((await draftFor(f, ID, OPERATION)).body));
  // El Radar acepta la decisión, pero el cliente nunca recibe el acuse ni llega a enlazar. Se reinicia.
  assert.equal((await decide(f, prepared.request)).statusCode, 200);
  await f.app.close();
  f = await open(file);
  const reopened = await view(f, ID);
  assert.deepEqual([reopened.state, reopened.status, reopened.record.decision], ['historical', 'simulation-only', null]);
  assert.deepEqual(reopened.pending, [{ operationId: OPERATION, alternativeId: 'alt-o-dividir-i07', label: 'Dividir la instalación en dos partes' }]);
  // «Comprobar»: enlaza la que el Radar ya tiene. No hay segunda decisión.
  const checked = rehearsalView.parse(JSON.parse((await f.post(`/rehearsals/${ID}/link`, { operationId: OPERATION })).body));
  assert.deepEqual([checked.status, checked.record.chosen?.alternativeId, checked.pending], ['decision-recorded', 'alt-o-dividir-i07', []]);
  assert.equal((await radarDetail(f)).events.length, 1);
  // Y si la decisión NUNCA llegó al Radar, comprobar lo dice y no inventa nada.
  await f.post('/rehearsals', { ...f.scenario, id: OTHER });
  await f.post(`/rehearsals/${OTHER}/choose`, { alternativeId: 'alt-o-bomba-alt' });
  await draftFor(f, OTHER, THIRD);
  assert.equal(code(await f.post(`/rehearsals/${OTHER}/link`, { operationId: THIRD })), 'REHEARSAL_DECISION_NOT_FOUND');
  assert.equal((await view(f, OTHER)).record.decision, null);
  assert.equal((await radarDetail(f)).events.length, 1);
});

// ── Proyección de las fuentes del Radar al modelo ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('fuentes: lo que el Radar no pudo leer deja el dato desconocido en el ensayo; lo que observó se usa con su origen', async t => {
  const f = await ready();
  t.after(() => f.app.close());
  const overview = rehearsalOverview.parse(JSON.parse((await f.get()).body)), detail = await radarDetail(f);
  assert.deepEqual(overview.sources.map(item => [item.role, item.state, item.condition, item.effect]), [
    ['sale', 'observed', 'clear', 'not-used'], ['delivery', 'observed', 'blocked', 'estimated-date'], ['support', 'observed', 'clear', 'ticket-open'],
  ]);
  assert.equal(overview.sources[1].origin, 'orders-fixture · fixture-orders-a · order-9001');
  assert.equal(overview.sources[1].observedAt, detail.evidence[1].observation!.observedAt);

  const link = { commitmentId: FOCUS, revision: detail.item.revision, title: detail.item.title, dueAt: detail.item.dueAt };
  const withEvidence = (role: 'delivery' | 'support', change: Record<string, unknown>) => detail.evidence.map(entry => entry.role === role ? { ...entry, ...change } as typeof entry : entry);
  const material = (demo: ReturnType<typeof buildRehearsalDemo>) => demo.model.materials.find(item => item.id === 'mat-bomba')!.availableAt;
  const ticket = (demo: ReturnType<typeof buildRehearsalDemo>) => demo.model.jobs.find(item => item.id === 't03');
  const base = buildRehearsalDemo(link, detail.evidence);
  assert.equal(material(base).state, 'known');
  assert.equal(ticket(base)!.duration.state, 'known');
  // Entrega: caída, parcial, sin lectura o ambigua → disponibilidad DESCONOCIDA, con su motivo; nunca un valor de relleno.
  for (const [state, reason] of [['unavailable', 'source-unavailable'], ['partial', 'source-partial'], ['missing', 'not-provided'], ['ambiguous', 'not-provided']] as const) {
    const demo = buildRehearsalDemo(link, withEvidence('delivery', { state, observation: state === 'partial' ? detail.evidence[1].observation : null }));
    assert.deepEqual(material(demo), { state: 'unknown', reason }, state);
    assert.equal(demo.sources[1].effect, 'unknown-material');
    assert.notEqual(operationalRevision(demo.model), operationalRevision(base.model), 'otra lectura de las fuentes es otra revisión');
  }
  // Entrega observada sin bloqueo: el material está ya, y su procedencia es la observación del Radar.
  const released = buildRehearsalDemo(link, withEvidence('delivery', { observation: { ...detail.evidence[1].observation!, condition: 'clear' } }));
  const fact = material(released);
  assert.ok(fact.state === 'known' && fact.provenance.basis === 'observed' && fact.provenance.source.remoteId === 'order-9001' && fact.value === released.model.clock.now);
  assert.equal(released.sources[1].effect, 'available-now');
  // Soporte: caído → duración del ticket desconocida; ticket resuelto → deja de ser un trabajo pendiente.
  const down = buildRehearsalDemo(link, withEvidence('support', { state: 'unavailable', observation: null }));
  assert.deepEqual([ticket(down)!.duration, down.sources[2].effect], [{ state: 'unknown', reason: 'source-unavailable' }, 'unknown-ticket']);
  const resolved = buildRehearsalDemo(link, withEvidence('support', { observation: { ...detail.evidence[2].observation!, condition: 'completed' } }));
  assert.deepEqual([ticket(resolved), resolved.sources[2].effect, resolved.model.currentPlan!.plan.sequences.flatMap(entry => entry.jobIds).includes('t03')], [undefined, 'ticket-resolved', false]);
  assert.equal(operationalModel.safeParse(resolved.model).success, true);

  // De extremo a extremo: pasadas 30 horas las observaciones del Radar son antiguas y la lectura del ensayo lo refleja; el ensayo guardado antes queda histórico.
  await f.post('/rehearsals', { ...f.scenario, id: ID });
  f.tick(30 * 60 * 60_000);
  const later = rehearsalOverview.parse(JSON.parse((await f.get()).body));
  assert.deepEqual(later.sources.map(item => item.state), ['stale', 'stale', 'stale']);
  assert.ok(later.diagnosis!.caveats.some(item => item.code === 'stale-evidence'), 'la lectura antigua queda señalada en el diagnóstico');
});
