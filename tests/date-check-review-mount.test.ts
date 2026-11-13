import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { mountDateCheck } from '../server/date-check-mount.js';
import { mountDateCheckReview } from '../server/date-check-review-mount.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { dateCheckApiPath, dateCheckView } from '../shared/date-check-api.js';
import { DEMO } from '../shared/date-check-demo.js';
import { reviewApiPath, reviewList, reviewView } from '../shared/date-check-review-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

process.env.NODE_ENV = 'test';
const NOW = Date.parse('2026-11-11T15:00:00.000Z'), LATER = Date.parse('2026-11-20T10:00:00.000Z'), headers = { host: '127.0.0.1' };
const CHECK_A = '4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d', CHECK_B = '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e', CHECK_C = '6c7d8e9f-0a1b-4c2d-9e3f-4a5b6c7d8e9f';
const OP = ['7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a', '8e9f0a1b-2c3d-4e4f-9a5b-6c7d8e9f0a1b', '9f0a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c', 'a0b1c2d3-e4f5-4a6b-9c7d-8e9f0a1b2c3d', 'b1c2d3e4-f5a6-4b7c-8d8e-9f0a1b2c3d4e'];
const BOTH = 'alt-o-franja-cruz-jueves+o-frioval-jueves';
const step = { owner: 'Marta (ficción)', nextStep: 'Pedir a Frioval que confirme la entrega.', dueAt: '2026-11-10T17:00:00Z' };

type Fixture = Awaited<ReturnType<typeof open>>;
async function open(file = ':memory:') {
  const base = await createBaseApp({ root: '.', dbPath: file, staticDir: 'none' });
  let now = NOW;
  mountDateCheck(base.app, base.store, { clock: () => now });
  const review = mountDateCheckReview(base.app, base.store, { clock: () => now });
  const pin = () => workspaceSearchIdentity(base.store)?.contextRevision ?? '0'.repeat(64);
  const send = (method: 'GET' | 'POST', url: string, payload?: unknown) => base.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) });
  return {
    ...base, pin, send, stats: review.stats, at: (value: number) => { now = value; },
    get: (url: string) => send('GET', `${url}${url.includes('?') ? '&' : '?'}contextRevision=${pin()}`),
    post: (url: string, body: Record<string, unknown>) => send('POST', url, { contextRevision: pin(), ...body }),
    meta: (prefix: string) => JSON.stringify(base.store.db.prepare('SELECT key, value FROM meta WHERE key LIKE ? ORDER BY key').all(prefix + '%')),
  };
}
function activate(f: Pick<Fixture, 'store'>) {
  const snapshot = makeFixture('agency');
  f.store.importSnapshot(snapshot, !!f.store.snapshot);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false });
  f.store.activate();
}
const code = (response: { body: string }) => JSON.parse(response.body).details?.code ?? null;
async function decide(f: Fixture, id: string, alternativeId: string, operationId: string) {
  const view = dateCheckView.parse(JSON.parse((await f.post(dateCheckApiPath + '/analyze', { form: DEMO.defaults() })).body));
  assert.equal((await f.post(dateCheckApiPath + '/checks', { id, form: DEMO.defaults(), inputRevision: view.inputRevision })).statusCode, 201);
  assert.equal((await f.post(`${dateCheckApiPath}/checks/${id}/confirm`, { inputRevision: view.inputRevision, alternativeId, operationId, ...step })).statusCode, 201);
}

test('una decisión sin desenlace se ve pendiente; ver no escribe ni recalcula; sin decisión no hay revisión', async t => {
  const f = await open();
  t.after(() => f.app.close());
  assert.equal(code(await f.get(reviewApiPath + '/decisions')), 'REVIEW_CONTEXT_CHANGED');
  activate(f);
  const view = dateCheckView.parse(JSON.parse((await f.post(dateCheckApiPath + '/analyze', { form: DEMO.defaults() })).body));
  await f.post(dateCheckApiPath + '/checks', { id: CHECK_C, form: DEMO.defaults(), inputRevision: view.inputRevision });
  assert.equal(code(await f.get(`${reviewApiPath}/decisions/${CHECK_C}`)), 'REVIEW_NO_DECISION');
  await f.post(`${dateCheckApiPath}/checks/${CHECK_C}/confirm`, { inputRevision: view.inputRevision, alternativeId: BOTH, operationId: OP[4], ...step });
  const before = f.meta('date-');
  const pending = reviewView.parse(JSON.parse((await f.get(`${reviewApiPath}/decisions/${CHECK_C}`)).body));
  assert.deepEqual([pending.state, pending.review, pending.endings.map(item => item.available)], ['pending', null, [true, true]]);
  assert.equal(pending.decision.alternativeLabel, 'Frioval confirma las 4 unidades para el jueves 12 a las 10:00 + Cruz vuelve de la formación el jueves 12 a las 13:00');
  assert.equal(f.meta('date-'), before);
  assert.deepEqual(reviewList.parse(JSON.parse((await f.get(reviewApiPath + '/decisions')).body)).items.map(item => [item.checkId, item.recorded]), [[CHECK_C, false]]);
});

test('dos cierres: condiciones cumplidas coincide con lo ofrecido; proveedor tarde atribuye una parte y deja el resto por comprobar', async t => {
  const f = await open();
  t.after(() => f.app.close());
  activate(f);
  await decide(f, CHECK_A, BOTH, OP[0]);
  await decide(f, CHECK_B, BOTH, OP[1]);
  const flowBefore = f.meta('date-check:');
  f.at(LATER);
  const met = await f.post(`${reviewApiPath}/decisions/${CHECK_A}/outcome`, { ending: 'met', operationId: OP[2] });
  assert.equal(met.statusCode, 201);
  const a = reviewView.parse(JSON.parse(met.body)).review!;
  assert.equal(a.verdict, 'met-as-offered');
  assert.deepEqual(a.conditions.map(item => [item.offerId, item.status, item.differenceMinutes]), [['o-frioval-jueves', 'held', -20], ['o-franja-cruz-jueves', 'held', null]]);
  assert.deepEqual([a.planned.finishAt, a.observed.finishAt, a.observed.met], ['2026-11-13T13:30:00.000Z', '2026-11-13T13:20:00.000Z', true]);

  const late = await f.post(`${reviewApiPath}/decisions/${CHECK_B}/outcome`, { ending: 'supplier-late', operationId: OP[3] });
  const recorded = reviewView.parse(JSON.parse(late.body)), b = recorded.review!;
  assert.equal(b.verdict, 'missed');
  const supplier = b.conditions.find(item => item.offerId === 'o-frioval-jueves')!;
  assert.deepEqual([supplier.status, supplier.assumed.at, supplier.observation?.happenedAt, supplier.differenceMinutes], ['later', '2026-11-12T09:00:00Z', '2026-11-16T10:00:00.000Z', 5820]);
  assert.equal(supplier.observation?.reference, 'purchasing-fixture · fixture-compras · albarán ALB-5602');
  // Contrafactual y observado, por separado.
  assert.deepEqual([b.counterfactual?.finishAt, b.counterfactual?.outcome, b.observed.finishAt], ['2026-11-17T08:30:00.000Z', 'misses', '2026-11-17T09:10:00.000Z']);
  assert.deepEqual(b.attribution, { delayMinutes: 5500, explainedMinutes: 5460, residualMinutes: 40, explainedBy: ['o-frioval-jueves'], partialEvidence: true });
  assert.ok(recorded.observations.some(item => item.kind === 'slot' && item.scope === 'partial'));
  assert.equal(f.meta('date-check:'), flowBefore, 'registrar el desenlace no toca la comprobación ni su decisión');
  assert.deepEqual(f.stats(), { recorded: 2, replays: 0 });

  // Idempotencia: misma clave y cierre → lo guardado; otra clave → rechazo; nada se reescribe.
  const after = f.meta('date-check-review:');
  assert.equal((await f.post(`${reviewApiPath}/decisions/${CHECK_B}/outcome`, { ending: 'supplier-late', operationId: OP[3] })).statusCode, 200);
  assert.equal(code(await f.post(`${reviewApiPath}/decisions/${CHECK_B}/outcome`, { ending: 'met', operationId: OP[4] })), 'REVIEW_ALREADY_RECORDED');
  assert.equal(f.meta('date-check-review:'), after);
  assert.deepEqual(reviewList.parse(JSON.parse((await f.get(reviewApiPath + '/decisions')).body)).items.map(item => [item.checkId, item.verdict]).sort(), [[CHECK_A, 'met-as-offered'], [CHECK_B, 'missed']].sort());
});

test('una decisión sin llegada que observar solo admite el cierre cumplido', async t => {
  const f = await open();
  t.after(() => f.app.close());
  activate(f);
  await decide(f, CHECK_A, 'alt-mantener', OP[0]);
  const pending = reviewView.parse(JSON.parse((await f.get(`${reviewApiPath}/decisions/${CHECK_A}`)).body));
  assert.deepEqual(pending.endings.map(item => [item.id, item.available]), [['met', true], ['supplier-late', false]]);
  assert.equal(code(await f.post(`${reviewApiPath}/decisions/${CHECK_A}/outcome`, { ending: 'supplier-late', operationId: OP[1] })), 'REVIEW_ENDING_NOT_APPLICABLE');
  const met = reviewView.parse(JSON.parse((await f.post(`${reviewApiPath}/decisions/${CHECK_A}/outcome`, { ending: 'met', operationId: OP[2] })).body)).review!;
  // Se juzga contra la fecha que esa decisión permitía ofrecer (martes 17, 15:30), no contra el viernes pedido.
  assert.deepEqual([met.counterfactual, met.offeredAt, met.observed.finishAt, met.verdict], [null, '2026-11-17T14:30:00.000Z', '2026-11-17T14:20:00.000Z', 'met-as-offered']);
});

test('tras reiniciar sobre el mismo archivo se reabre igual y leer no escribe ni recalcula', async t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'date-check-review-'));
  fs.writeFileSync(path.join(root, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const file = path.join(root, 'data.sqlite');
  let f = await open(file);
  t.after(async () => { await f.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  activate(f);
  await decide(f, CHECK_B, BOTH, OP[1]);
  f.at(LATER);
  const first = reviewView.parse(JSON.parse((await f.post(`${reviewApiPath}/decisions/${CHECK_B}/outcome`, { ending: 'supplier-late', operationId: OP[3] })).body));
  const snapshot = f.meta('date-');
  await f.app.close();
  f = await open(file);
  const reopened = reviewView.parse(JSON.parse((await f.get(`${reviewApiPath}/decisions/${CHECK_B}`)).body));
  assert.deepEqual(reopened, first);
  assert.equal(f.meta('date-'), snapshot);
  assert.deepEqual(f.stats(), { recorded: 0, replays: 0 });
});
