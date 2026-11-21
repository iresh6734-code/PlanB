import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerCommitments } from '../server/commitments.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { commitmentDecisionResponse, commitmentDetailResponse, commitmentListResponse, commitmentPath, type CommitmentDataset, type CommitmentObservation } from '../shared/commitments.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const observedAt = '2026-11-06T10:00:00.000Z';
const dueAt = '2026-11-06T18:00:00.000Z';
const observed = Date.parse(observedAt);
const host = { host: '127.0.0.1' };

function dataset() {
  const roles = ['sale', 'delivery', 'support'] as const;
  const account = (id: string, kind: CommitmentObservation['reference']['kind']) => ({ provider: 'fixture', accountId: id, kind, remoteId: '42' });
  const commitments = ['installation', 'delivery', 'unknown', 'candidate'].map(id => ({
    id, title: 'Equipo para instalación', dueAt,
    links: roles.map(kind => ({ reference: account(id, kind), basis: id === 'candidate' && kind === 'delivery' ? 'candidate' as const : 'explicit' as const })),
  }));
  const observations = commitments.flatMap(item => roles.map((kind): CommitmentObservation => ({
    reference: account(item.id, kind), observedAt, label: `Ensayo ${kind}`,
    ...(item.id === 'unknown' && kind === 'delivery' ? { coverage: 'unavailable', condition: null }
      : { coverage: 'complete', condition: kind !== 'delivery' ? 'clear' : item.id === 'delivery' ? 'completed' : 'blocked' }),
  })));
  return { format: 'planb-commitments-demo-v1', commitments, observations } satisfies CommitmentDataset;
}

async function open(dbPath = ':memory:', clock = () => observed) {
  const { app, store } = await createBaseApp({ dbPath, root: '.', staticDir: 'none' });
  function activate(capturedAt?: string) {
    const snapshot = makeFixture('agency');
    if (capturedAt) snapshot.capturedAt = capturedAt;
    store.importSnapshot(snapshot, !!store.snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: observedAt, prompt: '', approved: false });
    store.activate();
  }
  if (!store.ready) activate();
  registerCommitments(app, store, dataset(), clock);
  const context = () => workspaceSearchIdentity(store)!.contextRevision;
  const get = (id = '', headers = host, revision = context()) => app.inject({
    url: `${commitmentPath}${id ? '/' + id : ''}?contextRevision=${revision}`, headers,
  });
  const post = (id: string, payload: object, headers = host) => app.inject({
    method: 'POST', url: `${commitmentPath}/${id}/decisions`, headers, payload,
  });
  return { app, store, activate, context, get, post };
}

test('fuente caída y vínculo candidato no se convierten en evidencia aunque los IDs remotos coincidan', async t => {
  let now = observed;
  const f = await open(':memory:', () => now);
  t.after(() => f.app.close());
  const list = commitmentListResponse.parse((await f.get()).json());
  assert.deepEqual(list.items.map(item => [item.status, item.cause]), [
    ['at-risk', 'source-blocked'], ['no-risk-detected', 'no-blocker-observed'],
    ['unconfirmed', 'coverage-incomplete'], ['unconfirmed', 'coverage-incomplete'],
  ]);
  const detail = commitmentDetailResponse.parse((await f.get('candidate')).json());
  assert.deepEqual(detail.evidence.map(e => e.state), ['observed', 'ambiguous', 'observed']);
  assert.equal(detail.evidence[1].observation, null);
  assert.equal(detail.evidence[1].linked, null);
  assert.equal(detail.evidence[1].candidates[0].accountId, 'candidate');
  now += 25 * 60 * 60_000;
  const stale = commitmentDetailResponse.parse((await f.get('installation')).json());
  assert.equal(stale.item.status, 'unconfirmed');
  assert.equal(stale.evidence[1].state, 'stale');
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'commitment-demo:%'").get()!.n, 0);
});

test('la habilitación del recurso de ensayo no autoriza una copia de producción', async t => {
  const f = await open();
  t.after(() => f.app.close());
  const snapshot = { ...f.store.snapshot!, version: 3 as const, source: {
    kind: 'hubspot' as const, accountId: '300000', isTestData: false, environment: 'production' as const, accountType: 'STANDARD', description: 'Fixture de política',
  } };
  f.store.importSnapshot(snapshot, true);
  f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: observedAt, prompt: '', approved: false });
  f.store.activate();
  assert.equal((await f.get()).statusCode, 409);
  assert.equal((await f.get('installation')).statusCode, 409);
  assert.equal((await f.post('installation', { contextRevision: f.context(), expectedRevision: 'a'.repeat(64),
    operationId: randomUUID(), decision: { type: 'assign', owner: 'Marta', nextStep: 'Confirmar stock', dueAt } })).statusCode, 409);
});

test('dos pestañas, reintento exacto tras reiniciar y cambio de copia sin fuga de decisiones', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'planb-commitment-'));
  const db = join(dir, 'planb.sqlite');
  let f = await open(db);
  t.after(async () => {
    await f.app.close();
    for (const entry of await readdir(dir)) await unlink(join(dir, entry));
    await rmdir(dir);
  });
  const { item } = commitmentDetailResponse.parse((await f.get('installation')).json());
  const contextRevision = f.context();
  const command = { operationId: randomUUID(), expectedRevision: item.revision, contextRevision,
    decision: { type: 'assign', owner: 'Marta', nextStep: 'Confirmar stock', dueAt } };
  const competing = { ...command, operationId: randomUUID(), decision: { ...command.decision, owner: 'Luis' } };
  const results = await Promise.all([f.post(item.id, command), f.post(item.id, competing)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const accepted = results[0].statusCode === 200 ? command : competing;
  const receipt = commitmentDecisionResponse.parse(results.find(result => result.statusCode === 200)!.json());
  await f.app.close();
  f = await open(db);
  assert.deepEqual((await f.post(item.id, accepted)).json(), receipt);
  const reused = await f.post(item.id, { ...accepted, decision: { ...accepted.decision, owner: 'Otra persona' } });
  assert.equal(reused.json().details.code, 'COMMITMENT_OPERATION_REUSED');
  const detail = commitmentDetailResponse.parse((await f.get(item.id)).json());
  assert.equal(detail.events.length, 1);
  assert.equal(detail.item.action?.owner, accepted.decision.owner);
  assert.equal(f.store.changesCount, 0);
  const row = f.store.db.prepare("SELECT value FROM meta WHERE key LIKE 'commitment-demo:%'").get()!;
  assert.match(String(row.value), /^enc1:/);
  f.activate('2026-11-07T10:00:00.000Z');
  assert.notEqual(f.context(), contextRevision);
  assert.equal((await f.get(item.id, host, contextRevision)).statusCode, 409);
  assert.equal((await f.post(item.id, accepted)).statusCode, 409);
  assert.equal(commitmentDetailResponse.parse((await f.get(item.id)).json()).item.action, null);
});

test('bloqueo de sesión y cierre con evidencia frente a cierre manual', async t => {
  const f = await open();
  t.after(() => f.app.close());
  const setup = await f.app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers: host, payload: { password: randomUUID() } });
  assert.equal(setup.statusCode, 200);
  const headers = { ...host, cookie: String(setup.headers['set-cookie']).split(';')[0] };
  assert.equal((await f.get('installation')).statusCode, 401);
  const makeClose = async (id: string, basis: string) => ({
    contextRevision: f.context(), operationId: randomUUID(),
    expectedRevision: commitmentDetailResponse.parse((await f.get(id, headers)).json()).item.revision,
    decision: { type: 'close', basis, note: 'Decisión de ensayo' },
  });
  const blocked = await f.post('installation', await makeClose('installation', 'observed'), headers);
  assert.equal(blocked.json().details.code, 'COMMITMENT_EVIDENCE_REQUIRED');
  const manual = await f.post('installation', await makeClose('installation', 'manual'), headers);
  assert.deepEqual(commitmentDecisionResponse.parse(manual.json()).event.evidence, []);
  const observedClose = await makeClose('delivery', 'observed');
  const completed = await f.post('delivery', observedClose, headers);
  assert.equal(commitmentDecisionResponse.parse(completed.json()).event.evidence.length, 3);
  const list = commitmentListResponse.parse((await f.get('', headers)).json());
  assert.equal(list.items[0].cause, 'closed-manual');
  assert.equal(list.items[1].cause, 'closed-observed');
  await f.app.inject({ method: 'POST', url: '/api/v2/auth/lock', headers });
  assert.equal((await f.get('delivery', headers)).statusCode, 401);
  assert.equal((await f.post('delivery', observedClose, headers)).statusCode, 401);
});

for (const boundary of ['list', 'detail', 'before-write', 'after-write'] as const) {
  test(`la sesión original se revalida en la frontera ${boundary}`, async () => {
    const originalNow = Date.now;
    let wall = observed;
    Date.now = () => wall;
    const f = await open();
    const originalGet = f.store.get.bind(f.store);
    const originalSet = f.store.set.bind(f.store);
    try {
      const password = randomUUID();
      const authenticate = async (route: string) => {
        const response = await f.app.inject({ method: 'POST', url: '/api/v2/auth/' + route, headers: host, payload: { password } });
        assert.equal(response.statusCode, 200);
        return { ...host, cookie: String(response.headers['set-cookie']).split(';')[0] };
      };
      const headers = await authenticate('setup');
      const contextRevision = f.context();
      const detail = commitmentDetailResponse.parse((await f.get('installation', headers)).json());
      const command = { contextRevision, expectedRevision: detail.item.revision, operationId: randomUUID(),
        decision: { type: 'assign', owner: 'Marta', nextStep: 'Confirmar recepción', dueAt } };
      let reads = 0;
      const expire = () => { wall = observed + 30 * 60_000 + 1; };
      // La identidad de la copia (instancia, captura, generación y sesión de trabajo) ya no se lee con store.get('sessionId'):
      // workspace-search.ts la lee con una consulta propia sobre meta y la guarda en caché (CLAUDE-SEARCH-PERF-R). La frontera
      // que se prueba sigue siendo la misma: la sesión caduca en la SEGUNDA lectura de esa identidad (la de después de leer el
      // escenario) y la ruta debe revalidarla y responder 401. Misión maestra, 21/11/2026.
      const db = f.store.db as unknown as { prepare: (sql: string) => unknown };
      const originalPrepare = db.prepare.bind(db);
      if (boundary === 'after-write') {
        f.store.set = (key, value) => {
          originalSet(key, value);
          if (key.startsWith('commitment-demo:')) expire();
        };
      } else {
        db.prepare = (sql: string) => {
          if (/^SELECT key,.* FROM meta WHERE key IN \(/.test(sql) && ++reads === 2) expire();
          return originalPrepare(sql);
        };
      }
      const response = boundary === 'list' || boundary === 'detail'
        ? await f.get(boundary === 'list' ? '' : 'installation', headers, contextRevision)
        : await f.post('installation', command, headers);
      db.prepare = originalPrepare;
      f.store.get = originalGet;
      f.store.set = originalSet;
      assert.equal(response.statusCode, 401);
      assert.deepEqual(Object.keys(response.json()).sort(), ['details', 'error']);
      const rows = () => f.store.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'commitment-demo:%'").get()!.n;
      assert.equal(rows(), boundary === 'after-write' ? 1 : 0);
      if (boundary === 'after-write') {
        const unlocked = await authenticate('login');
        const retry = await f.post('installation', command, unlocked);
        assert.equal(retry.statusCode, 200);
        assert.equal(retry.json().event.operationId, command.operationId);
        const reopened = commitmentDetailResponse.parse((await f.get('installation', unlocked)).json());
        assert.equal(reopened.events.length, 1);
        assert.equal(rows(), 1);
      }
    } finally {
      f.store.get = originalGet;
      f.store.set = originalSet;
      Date.now = originalNow;
      await f.app.close();
    }
  });
}
