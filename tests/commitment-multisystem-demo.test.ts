import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';
import { registerCommitments } from '../server/commitments.js';
import { workspaceSearchIdentity } from '../server/workspace-search.js';
import { commitmentDemoDataset, commitmentDetailResponse, commitmentListResponse, commitmentPath, projectCommitmentEvidence, type CommitmentDataset } from '../shared/commitments.js';
import { createMultisystemScenario, MULTISYSTEM_DEMO_FORMAT, multisystemDisclosures, multisystemProviderLabels, multisystemScenarioExpectations } from '../shared/commitment-multisystem-demo.js';
import { createCommitmentDemoDataset } from '../shared/commitment-demo.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

// Escenario multisistema del Radar: ficción pura (sin red, sin proveedor, sin credenciales). Se comprueba contra el esquema compartido, contra la proyección pura y contra la API REAL del Radar
// (createBaseApp + Store + registerCommitments) que cada caso produce el estado, la causa y el origen esperados, que dos proveedores/cuentas con el mismo ID no se mezclan y que las decisiones
// sobreviven a un reinicio SOLO si el instante del conjunto es el mismo.
const NOW = Date.parse('2026-11-08T10:00:00.000Z'), host = { host: '127.0.0.1' };
const keyOf = (r: { provider: string; accountId: string; kind: string; remoteId: string }) => JSON.stringify([r.provider, r.accountId, r.kind, r.remoteId]);

async function open(dataset: CommitmentDataset, dbPath = ':memory:', now = () => NOW) {
  const { app, store } = await createBaseApp({ dbPath, root: '.', staticDir: 'none' });
  if (!store.ready) { const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); store.activate(); }
  registerCommitments(app, store, dataset, now);
  const context = () => workspaceSearchIdentity(store)!.contextRevision;
  const get = (id = '') => app.inject({ url: commitmentPath + (id ? '/' + id : '') + '?contextRevision=' + context(), headers: host });
  const post = (id: string, payload: object) => app.inject({ method: 'POST', url: commitmentPath + '/' + id + '/decisions', headers: host, payload });
  return { app, store, context, get, post };
}

test('ESQUEMA Y DETERMINISMO: el conjunto cumple el contrato compartido, es idéntico para el mismo instante, se desplaza con él y respeta los topes', () => {
  const a = createMultisystemScenario(NOW), b = createMultisystemScenario(NOW), c = createMultisystemScenario(NOW + 60_000);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.notDeepEqual(a, c); assert.equal(a.format, MULTISYSTEM_DEMO_FORMAT); assert.equal(commitmentDemoDataset.safeParse(a).success, true);
  assert.deepEqual(a.commitments.map(item => item.id), multisystemScenarioExpectations.map(item => item.id)); assert.ok(a.commitments.length <= 24 && a.observations.length <= 120);
  assert.equal(Date.parse(c.commitments[0]!.dueAt) - Date.parse(a.commitments[0]!.dueAt), 60_000);
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5, 1.5]) assert.throws(() => createMultisystemScenario(bad), /instante válido/);
});

test('ALCANCE FICTICIO: proveedores «-fixture», cuentas «fixture-», pedidos ficticios declarados, ningún proveedor «conectado», sin datos reales y la demo anterior intacta', () => {
  const data = createMultisystemScenario(NOW), text = JSON.stringify(data);
  for (const o of data.observations) { assert.match(o.reference.provider, /-fixture$/); assert.match(o.reference.accountId, /^fixture-/); }
  assert.doesNotMatch(text, /https?:|@|token|secret|password|apikey|bearer|pat-|\b\d{8,}\b|shopify/i, 'sin URLs, correos, claves, identificadores largos ni Shopify'); assert.ok(!/\b149623262\b|\b12345\b/.test(text));
  assert.deepEqual(new Set(data.observations.map(o => o.reference.provider)), new Set(Object.keys(multisystemProviderLabels)));
  assert.ok(Object.values(multisystemProviderLabels).every(p => p.connected === false && /ensayo|ficticios/i.test(p.label)));
  assert.ok(data.observations.filter(o => o.reference.provider === 'orders-fixture' && o.reference.kind === 'delivery').every(o => /ficticio/i.test(o.label)), 'cada pedido se declara ficticio');
  assert.ok(multisystemDisclosures.some(d => /Shopify/.test(d)) && multisystemDisclosures.some(d => /no es el mismo registro/i.test(d)));
  assert.notDeepEqual(createCommitmentDemoDataset(NOW).commitments.map(c => c.id), data.commitments.map(c => c.id), 'es una unidad nueva: la demo aceptada no se reutiliza ni se modifica');
});

test('EL MISMO TIPO DE COMPROMISO DESDE HUBSPOT Y DESDE PIPEDRIVE conserva sus identidades: mismo ID remoto de oportunidad, dos referencias, ningún vínculo cruzado y resultado equivalente', () => {
  const data = createMultisystemScenario(NOW), hs = data.commitments.find(c => c.id === 'ms-installation-hubspot')!, pd = data.commitments.find(c => c.id === 'ms-installation-pipedrive')!;
  const saleOf = (c: typeof hs) => c.links.find(l => l.reference.kind === 'sale')!.reference;
  assert.equal(saleOf(hs).remoteId, saleOf(pd).remoteId, 'MISMO ID remoto…'); assert.notEqual(saleOf(hs).provider, saleOf(pd).provider); assert.notEqual(keyOf(saleOf(hs)), keyOf(saleOf(pd)), '…y referencias distintas');
  for (const commitment of data.commitments) { const providers = commitment.links.filter(l => l.reference.kind === 'sale').map(l => l.reference.provider); assert.equal(providers.length, 1, commitment.id + ': una sola venta enlazada'); }
  const ids = new Set(data.commitments.flatMap(c => c.links.map(l => keyOf(l.reference)))), obsIds = data.observations.map(o => keyOf(o.reference)); assert.equal(new Set(obsIds).size, obsIds.length);
  assert.ok(ids.size > 0);
  const evidence = (id: string) => projectCommitmentEvidence(data.commitments.find(c => c.id === id)!, data.observations, NOW);
  assert.deepEqual(evidence('ms-installation-hubspot').map(e => [e.state, e.observation?.condition]), evidence('ms-installation-pipedrive').map(e => [e.state, e.observation?.condition]), 'mismo resultado de negocio');
  assert.notEqual(evidence('ms-installation-hubspot')[0]!.observation!.reference.provider, evidence('ms-installation-pipedrive')[0]!.observation!.reference.provider);
});

test('PROYECCIÓN PURA: la evidencia por rol y su origen visible coinciden con las expectativas; un candidato nunca aporta observación y la misma evidencia caduca con el reloj', () => {
  const data = createMultisystemScenario(NOW);
  for (const expected of multisystemScenarioExpectations) {
    const evidence = projectCommitmentEvidence(data.commitments.find(c => c.id === expected.id)!, data.observations, NOW);
    assert.deepEqual(evidence.map(e => e.state), expected.evidence, expected.id);
    for (const [index, role] of (['sale', 'delivery', 'support'] as const).entries()) {
      const o = evidence[index]!.observation, want = expected.origins[role];
      assert.deepEqual(o ? { provider: o.reference.provider, accountId: o.reference.accountId, remoteId: o.reference.remoteId } : null, want, expected.id + ' · ' + role);
    }
  }
  const twin = projectCommitmentEvidence(data.commitments.find(c => c.id === 'ms-same-id-two-accounts')!, data.observations, NOW)[1]!;
  assert.equal(twin.observation, null); assert.equal(twin.linked, null); assert.equal(twin.candidates.length, 2); assert.equal(new Set(twin.candidates.map(c => c.remoteId)).size, 1); assert.equal(new Set(twin.candidates.map(c => c.accountId)).size, 2);
  const later = projectCommitmentEvidence(data.commitments.find(c => c.id === 'ms-installation-hubspot')!, data.observations, NOW + 25 * 3_600_000);
  assert.deepEqual(later.map(e => e.state), ['stale', 'stale', 'stale']);
});

test('API REAL DEL RADAR: estado, causa, rol afectado y cierre observable de cada caso son los esperados; el fallo de una fuente nunca es «sin riesgo» y leer no escribe', async t => {
  const f = await open(createMultisystemScenario(NOW)); t.after(() => f.app.close());
  const list = commitmentListResponse.parse((await f.get()).json());
  assert.deepEqual(list.items.map(i => [i.id, i.status, i.cause, i.affectedRole]), multisystemScenarioExpectations.map(e => [e.id, e.status, e.cause, e.affectedRole]));
  for (const expected of multisystemScenarioExpectations) {
    const detail = commitmentDetailResponse.parse((await f.get(expected.id)).json());
    assert.deepEqual(detail.evidence.map(e => e.state), expected.evidence, expected.id); assert.equal(detail.canCloseObserved, expected.canCloseObserved, expected.id);
  }
  assert.ok(list.items.filter(i => i.status === 'no-risk-detected').every(i => ['ms-delivery-healthy', 'ms-orders-account-b'].includes(i.id)), 'ningún fallo, hueco ni ambigüedad es «sin riesgo»');
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'commitment-demo:%'").get()!.n, 0);
  const later = createMultisystemScenario(NOW); const aged = await open(later, ':memory:', () => NOW + 25 * 3_600_000); t.after(() => aged.app.close());
  assert.ok(commitmentListResponse.parse((await aged.get()).json()).items.every(i => i.status !== 'no-risk-detected'), 'pasadas 25 h ninguna queda «sin riesgo»');
});

test('AISLAMIENTO: el mismo ID de pedido en dos cuentas da dos resultados distintos y cada uno solo afecta a su compromiso; el candidato no hereda ni el bloqueo ni el cumplimiento', async t => {
  const f = await open(createMultisystemScenario(NOW)); t.after(() => f.app.close());
  const a = commitmentDetailResponse.parse((await f.get('ms-installation-hubspot')).json()), b = commitmentDetailResponse.parse((await f.get('ms-orders-account-b')).json()), twin = commitmentDetailResponse.parse((await f.get('ms-same-id-two-accounts')).json());
  assert.equal(a.evidence[1]!.observation!.reference.remoteId, b.evidence[1]!.observation!.reference.remoteId); assert.notEqual(a.evidence[1]!.observation!.reference.accountId, b.evidence[1]!.observation!.reference.accountId);
  assert.deepEqual([a.evidence[1]!.observation!.condition, b.evidence[1]!.observation!.condition], ['blocked', 'completed']); assert.deepEqual([a.item.status, b.item.status], ['at-risk', 'no-risk-detected']);
  assert.equal(twin.item.status, 'unconfirmed'); assert.equal(twin.item.affectedRole, null); assert.equal(twin.evidence[1]!.state, 'ambiguous');
  // control: si el candidato se confirmara a la cuenta A, el compromiso heredaría el bloqueo; así el vínculo es la única puerta.
  const data = createMultisystemScenario(NOW); const mutated: CommitmentDataset = { ...data, commitments: data.commitments.map(c => c.id !== 'ms-same-id-two-accounts' ? c : { ...c, links: c.links.map(l => l.basis === 'candidate' && l.reference.accountId === 'fixture-orders-a' ? { ...l, basis: 'explicit' as const } : l.basis === 'candidate' ? { ...l } : l).filter(l => !(l.basis === 'candidate')) }) };
  const g = await open(mutated); t.after(() => g.app.close());
  assert.equal(commitmentDetailResponse.parse((await g.get('ms-same-id-two-accounts')).json()).item.status, 'at-risk', 'con el vínculo confirmado, y solo entonces, hereda el bloqueo');
});

test('REINICIO: con el MISMO instante las decisiones sobreviven y el historial se lee; con otro instante es otro conjunto y no se aplican (el montaje central debe fijar y conservar `now`)', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'planb-ms-')), db = join(dir, 'ms.db'), apps: Array<{ close(): Promise<unknown> }> = [];
  t.after(async () => { await Promise.allSettled(apps.map(app => app.close())); await rm(dir, { recursive: true, force: true }); });
  const first = await open(createMultisystemScenario(NOW), db); apps.push(first.app);
  const detail = commitmentDetailResponse.parse((await first.get('ms-installation-hubspot')).json());
  const response = await first.post('ms-installation-hubspot', { contextRevision: first.context(), expectedRevision: detail.item.revision, operationId: randomUUID(), decision: { type: 'assign', owner: 'Responsable de entrega', nextStep: 'Reponer stock del pedido 9001', dueAt: new Date(NOW + 3_600_000).toISOString() } });
  assert.equal(response.statusCode, 200, response.body); await first.app.close(); apps.pop();
  const same = await open(createMultisystemScenario(NOW), db); apps.push(same.app);
  const restored = commitmentDetailResponse.parse((await same.get('ms-installation-hubspot')).json());
  assert.equal(restored.events.length, 1); assert.equal(restored.item.action?.owner, 'Responsable de entrega');
  await same.app.close(); apps.pop();
  const other = await open(createMultisystemScenario(NOW + 60_000), db); apps.push(other.app);
  const lost = commitmentDetailResponse.parse((await other.get('ms-installation-hubspot')).json());
  assert.equal(lost.events.length, 0, 'otro instante = otro conjunto: la decisión no aparece'); assert.equal(lost.item.action, null);
  assert.ok((await readdir(dir)).length >= 1);
});

test('LA PRUEBA DETECTA: seis alteraciones del escenario rompen alguna expectativa (control causal sin tocar el archivo)', () => {
  const base = createMultisystemScenario(NOW), state = (data: CommitmentDataset, id: string) => projectCommitmentEvidence(data.commitments.find(c => c.id === id)!, data.observations, NOW).map(e => [e.state, e.observation?.condition ?? null]);
  const change = (fn: (d: CommitmentDataset) => CommitmentDataset) => fn(structuredClone(base));
  const cases: Array<[string, string, CommitmentDataset]> = [
    ['fuente caída pasa a sana', 'ms-support-source-down', change(d => ({ ...d, observations: d.observations.map(o => o.reference.remoteId === 'ticket-8008' ? { ...o, coverage: 'complete' as const, condition: 'clear' as const } : o) }))],
    ['parcial pasa a completa', 'ms-orders-partial', change(d => ({ ...d, observations: d.observations.map(o => o.reference.remoteId === 'order-9005' ? { ...o, coverage: 'complete' as const } : o) }))],
    ['el pedido sin lectura recibe lectura', 'ms-delivery-unconfirmed', change(d => ({ ...d, observations: [...d.observations, { reference: d.commitments.find(c => c.id === 'ms-delivery-unconfirmed')!.links[1]!.reference, observedAt: d.observations[0]!.observedAt, coverage: 'complete' as const, condition: 'clear' as const, label: 'x' }] }))],
    ['el bloqueo desaparece', 'ms-installation-hubspot', change(d => ({ ...d, observations: d.observations.map(o => o.reference.remoteId === 'order-9001' && o.reference.accountId === 'fixture-orders-a' ? { ...o, condition: 'clear' as const } : o) }))],
    ['el candidato de la cuenta B se confirma', 'ms-same-id-two-accounts', change(d => ({ ...d, commitments: d.commitments.map(c => c.id !== 'ms-same-id-two-accounts' ? c : { ...c, links: [c.links[0]!, { ...c.links[2]!, basis: 'explicit' as const }, c.links[3]!] }) }))],
    ['datos de hace 30 h', 'ms-delivery-healthy', change(d => ({ ...d, observations: d.observations.map(o => o.reference.remoteId === 'order-9003' ? { ...o, observedAt: new Date(NOW - 30 * 3_600_000).toISOString() } : o) }))],
  ];
  for (const [name, id, mutated] of cases) assert.notDeepEqual(state(mutated, id), state(base, id), name);
});
