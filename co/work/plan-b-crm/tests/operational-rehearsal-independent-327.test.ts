import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { createBaseApp } from '../server/app.js';
import { COMMITMENT_RADAR_CAPABILITY_PATH, mountCommitmentRadar } from '../server/commitment-radar-mount.js';
import { mountOperationalRehearsal } from '../server/operational-rehearsal-mount.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { commitmentDetailResponse, commitmentPath } from '../shared/commitments.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { rehearsalApiPath, rehearsalDecisionDraft, rehearsalView } from '../shared/operational-rehearsal-api.js';
import { REHEARSAL_RADAR_COMMITMENT } from '../shared/operational-rehearsal-demo.js';

const now = '2026-11-11T15:00:00.000Z';
const focus = REHEARSAL_RADAR_COMMITMENT;
const choiceA = 'alt-o-bomba-alt';
const choiceB = 'alt-o-mover-i07';
const step = { owner: 'Marta (ficción)', nextStep: 'Consultar disponibilidad de la bomba equivalente.', dueAt: '2026-11-12T10:00:00Z' };
const headers = { host: '127.0.0.1' };

async function open(t: TestContext) {
  const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: 'none' });
  t.after(() => app.close());
  mountCommitmentRadar(app, store, { clock: () => Date.parse(now) });
  mountOperationalRehearsal(app, store, { clock: () => Date.parse(now) });
  const snapshot = makeFixture('agency');
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: now, approved: false });
  store.activate();
  const pin = workspaceSearchIdentity(store)!.contextRevision;
  const setup = await app.inject({
    method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-327-password' },
  });
  assert.equal(setup.statusCode, 200);
  const cookie = String(setup.headers['set-cookie']).split(';')[0]!;
  assert.ok(cookie.includes('='));
  // The two actors share the same unlocked installation and session, as two tabs can.
  const send = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { ...headers, cookie }, ...(payload ? { payload } : {}) });
  assert.equal((await send('POST', COMMITMENT_RADAR_CAPABILITY_PATH + '/activate', { contextRevision: pin })).statusCode, 201);
  const post = (suffix: string, payload: Record<string, unknown>) => send('POST', rehearsalApiPath + suffix, { contextRevision: pin, ...payload });
  const get = async (id: string) => rehearsalView.parse((await send('GET', rehearsalApiPath + '/rehearsals/' + id + '?contextRevision=' + pin)).json());
  const radar = async () => commitmentDetailResponse.parse((await send('GET', commitmentPath + '/' + focus + '?contextRevision=' + pin)).json());
  const decide = (request: Record<string, unknown>) => send('POST', commitmentPath + '/' + focus + '/decisions', request);
  const save = async () => {
    const id = randomUUID();
    const result = await post('/rehearsals', { id, commitmentId: focus, perturbationIds: [], priority: 'focus' });
    assert.equal(result.statusCode, 201);
    const saved = rehearsalView.parse(result.json());
    assert.equal(saved.record.id, id);
    return id;
  };
  const choose = (id: string, alternativeId: string) => post('/rehearsals/' + id + '/choose', { alternativeId });
  const prepare = async (id: string, operationId: string) => {
    const result = await post('/rehearsals/' + id + '/decision-draft', { operationId, ...step });
    assert.equal(result.statusCode, 200);
    return rehearsalDecisionDraft.parse(result.json()).request;
  };
  const link = (id: string, operationId: string) => post('/rehearsals/' + id + '/link', { operationId });
  const rehearsalBytes = () => store.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'operational-rehearsal:%' ORDER BY key").all();
  return { pin, save, choose, prepare, link, decide, get, radar, rehearsalBytes };
}

test('327 · el historial del ensayo no atribuye a B la decisión preparada para A', async t => {
  const f = await open(t);
  const id = await f.save();
  const firstChoice = rehearsalView.parse((await f.choose(id, choiceA)).json());
  assert.equal(firstChoice.record.chosen?.alternativeId, choiceA);
  const operationId = randomUUID();
  const draft = await f.prepare(id, operationId);
  const switchChoice = await f.choose(id, choiceB);
  assert.ok([200, 409].includes(switchChoice.statusCode));
  if (switchChoice.statusCode === 200) assert.equal(rehearsalView.parse(switchChoice.json()).record.chosen?.alternativeId, choiceB);
  assert.equal((await f.decide(draft)).statusCode, 200);
  const beforeLink = f.rehearsalBytes();
  const linked = await f.link(id, operationId);
  const view = await f.get(id);
  const events = (await f.radar()).events;
  assert.deepEqual(events.map(event => event.operationId), [operationId], 'el Radar conserva el único efecto aceptado');
  if (linked.statusCode === 409) {
    assert.equal(view.record.decision, null);
    assert.deepEqual(f.rehearsalBytes(), beforeLink);
  } else {
    assert.equal(linked.statusCode, 200);
    assert.equal(view.record.decision?.operationId, operationId);
    assert.equal(view.record.chosen?.alternativeId, choiceA, 'la decisión enviada usaba la elección A');
  }
});

test('327 · una decisión tomada en el Radar sin preparar ese ensayo no se atribuye a su alternativa', async t => {
  const f = await open(t);
  const id = await f.save();
  assert.equal((await f.choose(id, choiceA)).statusCode, 200);
  const detail = await f.radar();
  const operationId = randomUUID();
  const ordinaryDecision = {
    contextRevision: f.pin, expectedRevision: detail.item.revision, operationId,
    decision: { type: 'assign', owner: 'Lucía (ficción)', nextStep: 'Llamar a la instalación para actualizar la visita.', dueAt: step.dueAt },
  };
  assert.equal((await f.decide(ordinaryDecision)).statusCode, 200);
  const beforeLink = f.rehearsalBytes();
  const linked = await f.link(id, operationId);
  const view = await f.get(id);
  assert.deepEqual((await f.radar()).events.map(event => event.operationId), [operationId]);
  assert.equal(linked.statusCode, 409);
  assert.equal(view.record.decision, null);
  assert.deepEqual(f.rehearsalBytes(), beforeLink);
});

test('327 · la misma elección preparada, confirmada y enlazada conserva un solo efecto', async t => {
  const f = await open(t);
  const id = await f.save();
  assert.equal((await f.choose(id, choiceA)).statusCode, 200);
  const operationId = randomUUID();
  const draft = await f.prepare(id, operationId);
  assert.equal((await f.decide(draft)).statusCode, 200);
  const linked = await f.link(id, operationId);
  assert.equal(linked.statusCode, 200);
  const view = rehearsalView.parse(linked.json());
  assert.equal(view.record.chosen?.alternativeId, choiceA);
  assert.equal(view.record.decision?.operationId, operationId);
  const bytes = f.rehearsalBytes();
  assert.equal((await f.link(id, operationId)).statusCode, 200);
  assert.deepEqual(f.rehearsalBytes(), bytes);
  assert.deepEqual((await f.radar()).events.map(event => event.operationId), [operationId]);
});
