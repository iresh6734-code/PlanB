import assert from 'node:assert/strict';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerCommitments } from '../server/commitments.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { commitmentDemoDataset, commitmentDetailResponse, commitmentListResponse, commitmentPath, projectCommitmentEvidence } from '../shared/commitments.js';
import { COMMITMENT_DEMO_FORMAT, commitmentDemoExpectations, createCommitmentDemoDataset } from '../shared/commitment-demo.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

// Fuentes ficticias del Radar. Se valida con el esquema compartido y, contra la API REAL (`registerCommitments` sobre createBaseApp + Store real), que el Radar distingue riesgo, cobertura,
// fuente caída, datos antiguos y vínculo ambiguo con los MISMOS datos que registrará la candidata. Sin red, sin proveedor real, sin credenciales.
const NOW = Date.parse('2026-11-06T10:00:00.000Z'), host = { host: '127.0.0.1' };
const keyOf = (r: { provider: string; accountId: string; kind: string; remoteId: string }) => JSON.stringify([r.provider, r.accountId, r.kind, r.remoteId]);

async function open(now = () => NOW) {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); store.activate();
  registerCommitments(app, store, createCommitmentDemoDataset(NOW), now);
  const context = () => workspaceSearchIdentity(store)!.contextRevision;
  const get = (id = '') => app.inject({ url: commitmentPath + (id ? '/' + id : '') + '?contextRevision=' + context(), headers: host });
  return { app, store, get };
}

test('el conjunto cumple el esquema compartido, es DETERMINISTA para el mismo instante y cambia solo con él', () => {
  const a = createCommitmentDemoDataset(NOW), b = createCommitmentDemoDataset(NOW), c = createCommitmentDemoDataset(NOW + 60_000);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.notDeepEqual(a, c); assert.equal(a.format, COMMITMENT_DEMO_FORMAT); assert.equal(commitmentDemoDataset.safeParse(a).success, true);
  assert.deepEqual(a.commitments.map(item => item.id), commitmentDemoExpectations.map(item => item.id));
  assert.ok(a.commitments.length <= 24 && a.observations.length <= 120, 'dentro de los topes del contrato');
  assert.deepEqual(a, createCommitmentDemoDataset(NOW), 'sin estado interno');
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5, 1.5]) assert.throws(() => createCommitmentDemoDataset(bad), /instante válido/);
  const shifted = createCommitmentDemoDataset(NOW + 3_600_000); assert.equal(Date.parse(shifted.commitments[0]!.dueAt) - Date.parse(a.commitments[0]!.dueAt), 3_600_000, 'todo se desplaza con `now`');
});

test('ALCANCE FICTICIO: todos los proveedores y cuentas son de ensayo, no hay URLs, correos, claves ni ids reales, y las observaciones no necesitan red', () => {
  const text = JSON.stringify(createCommitmentDemoDataset(NOW)), data = createCommitmentDemoDataset(NOW);
  for (const o of data.observations) { assert.match(o.reference.provider, /-fixture$/); assert.match(o.reference.accountId, /^fixture-/); }
  assert.doesNotMatch(text, /https?:|@|token|secret|password|apikey|bearer|pat-|\b\d{8,}\b/i, 'sin URLs, correos, claves ni identificadores numéricos largos');
  assert.ok(!/\b149623262\b|\b12345\b/.test(text), 'ni el portal propio de ensayo ni el de las pruebas');
});

test('ESCENARIO: las seis situaciones están presentes y son DISTINTAS (bloqueo reciente, entrega sana con prueba, fuente caída, parcial, candidatos con el mismo ID remoto en cuentas distintas, datos antiguos)', () => {
  const d = createCommitmentDemoDataset(NOW), byKey = new Map(d.observations.map(o => [keyOf(o.reference), o])), obsFor = (id: string) => d.commitments.find(c => c.id === id)!.links.filter(l => l.basis !== 'candidate').map(l => byKey.get(keyOf(l.reference))!);
  assert.ok(obsFor('installation-north').some(o => o.condition === 'blocked' && o.coverage === 'complete'), 'bloqueo reciente y completo');
  assert.ok(obsFor('delivery-healthy').some(o => o.condition === 'completed' && o.coverage === 'complete' && /cumplimiento/.test(o.label)), 'entrega sana con prueba de cumplimiento');
  assert.ok(obsFor('support-source-down').some(o => o.coverage === 'unavailable' && o.condition === null), 'fuente caída sin condición');
  assert.ok(obsFor('project-partial').some(o => o.coverage === 'partial'), 'lectura parcial');
  const lookalike = d.commitments.find(c => c.id === 'installation-lookalike')!, candidates = lookalike.links.filter(l => l.basis === 'candidate');
  assert.equal(candidates.length, 2); assert.equal(new Set(candidates.map(l => l.reference.remoteId)).size, 1, 'el mismo ID remoto'); assert.equal(new Set(candidates.map(l => l.reference.accountId)).size, 2, 'en cuentas distintas');
  assert.equal(lookalike.links.filter(l => l.reference.kind === 'delivery' && l.basis !== 'candidate').length, 0, 'sin vínculo confirmado de entrega: queda como candidato');
  assert.equal(lookalike.title, d.commitments.find(c => c.id === 'installation-north')!.title, 'nombres iguales: no se vinculan por el nombre');
  const age = (id: string) => obsFor(id).map(o => NOW - Date.parse(o.observedAt)); assert.ok(age('stale-evidence').every(ms => ms > 24 * 3_600_000), 'datos antiguos'); assert.ok(age('installation-north').every(ms => ms >= 0 && ms < 24 * 3_600_000), 'datos recientes');
  assert.equal(new Set(d.observations.map(o => keyOf(o.reference))).size, d.observations.length, 'ninguna referencia observada dos veces');
});

test('PROYECCIÓN PURA: la evidencia que deriva el contrato coincide con lo esperado, y un candidato nunca aporta observación aunque su ID remoto coincida con una observación de otra cuenta', () => {
  const d = createCommitmentDemoDataset(NOW);
  for (const expected of commitmentDemoExpectations) { const item = d.commitments.find(c => c.id === expected.id)!, evidence = projectCommitmentEvidence(item, d.observations, NOW); assert.deepEqual(evidence.map(e => e.state), expected.evidence, expected.id); }
  const lookalike = projectCommitmentEvidence(d.commitments.find(c => c.id === 'installation-lookalike')!, d.observations, NOW)[1]!; assert.equal(lookalike.observation, null); assert.equal(lookalike.linked, null); assert.equal(lookalike.candidates.length, 2);
  const later = projectCommitmentEvidence(d.commitments.find(c => c.id === 'installation-north')!, d.observations, NOW + 25 * 3_600_000); assert.deepEqual(later.map(e => e.state), ['stale', 'stale', 'stale'], 'la misma evidencia caduca con el reloj');
});

test('API REAL: lista y detalle distinguen RIESGO, COBERTURA y CANDIDATOS con estos datos; una fuente caída es «sin confirmar», una entrega sana no cierra por inferencia y un candidato no es evidencia', async t => {
  let now = NOW; const f = await open(() => now); t.after(() => f.app.close());
  const list = commitmentListResponse.parse((await f.get()).json());
  assert.deepEqual(list.items.map(item => [item.id, item.status, item.cause]), commitmentDemoExpectations.map(e => [e.id, e.status, e.cause]));
  assert.deepEqual(list.items.map(item => item.affectedRole), commitmentDemoExpectations.map(e => e.affectedRole));
  for (const expected of commitmentDemoExpectations) {
    const detail = commitmentDetailResponse.parse((await f.get(expected.id)).json());
    assert.deepEqual(detail.evidence.map(e => e.state), expected.evidence, expected.id);
    assert.equal(detail.canCloseObserved, ('canCloseObserved' in expected) ? expected.canCloseObserved : false, expected.id + ': cierre observado');
  }
  const ambiguous = commitmentDetailResponse.parse((await f.get('installation-lookalike')).json()).evidence[1]!; assert.equal(ambiguous.state, 'ambiguous'); assert.equal(ambiguous.observation, null); assert.equal(ambiguous.linked, null); assert.deepEqual(ambiguous.candidates.map(c => c.accountId).sort(), ['fixture-orders-a', 'fixture-orders-b']);
  const down = commitmentDetailResponse.parse((await f.get('support-source-down')).json()); assert.equal(down.item.status, 'unconfirmed'); assert.equal(down.evidence[2]!.state, 'unavailable'); assert.equal(down.evidence[2]!.observation!.condition, null);
  now += 25 * 3_600_000; const later = commitmentListResponse.parse((await f.get()).json()); assert.ok(later.items.every(item => item.status !== 'no-risk-detected'), 'pasadas 25 h ninguna fuente es reciente: nada queda «sin riesgo»');
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'commitment-demo:%'").get()!.n, 0, 'leer no escribe');
});

test('EJEMPLO DE USO (el de la candidata): registerCommitments(app, store, createCommitmentDemoDataset(Date.now()))', async t => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); t.after(() => app.close());
  const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false }); store.activate();
  const now = Date.now(); registerCommitments(app, store, createCommitmentDemoDataset(now), () => now);
  const response = await app.inject({ url: commitmentPath + '?contextRevision=' + workspaceSearchIdentity(store)!.contextRevision, headers: host }); assert.equal(response.statusCode, 200);
  assert.equal(commitmentListResponse.parse(response.json()).items.length, 6);
});
