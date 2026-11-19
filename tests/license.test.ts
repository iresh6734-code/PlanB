import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLicense, issueLicense, planAllows, toBase64Url, type LicensePayload } from '../shared/license.js';
import { effectivePlan, featureAccess, FEATURES, PLAN_OFFERS, PRICE_PENDING, planHighlights, TRIAL_DAYS, trialState } from '../shared/plans.js';

const NOW = new Date('2026-11-19T12:00:00Z');
const payload = (over: Partial<LicensePayload> = {}): LicensePayload => ({ v: 1, id: 'lic-0001', plan: 'pro', holder: 'Ensayo S. L.', seats: 3, issuedAt: '2026-11-01T00:00:00Z', expiresAt: '2027-11-01T00:00:00Z', ...over });
async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) };
}

test('licencia: firmada y vigente activa el plan; pegada con saltos de línea también vale', async () => {
  const { privateKey, publicKey } = await keys();
  const text = await issueLicense(payload(), privateKey);
  const state = await checkLicense(text, NOW, publicKey);
  assert.equal(state.status, 'active'); assert.equal(state.plan, 'pro'); assert.equal(state.daysLeft, 347);
  assert.equal((await checkLicense('  ' + text.slice(0, 20) + '\n' + text.slice(20) + '\n', NOW, publicKey)).status, 'active');
  assert.equal((await checkLicense(await issueLicense(payload({ plan: 'team', expiresAt: null }), privateKey), NOW, publicKey)).daysLeft, null);
});

test('licencia: caducada da gracia 14 días y después vuelve a Personal sin bloquear', async () => {
  const { privateKey, publicKey } = await keys();
  const grace = await checkLicense(await issueLicense(payload({ expiresAt: '2026-11-15T12:00:00Z' }), privateKey), NOW, publicKey);
  assert.equal(grace.status, 'grace'); assert.equal(grace.plan, 'pro'); assert.match(grace.detail, /antes de 10 días/);
  const expired = await checkLicense(await issueLicense(payload({ expiresAt: '2026-10-01T00:00:00Z' }), privateKey), NOW, publicKey);
  assert.equal(expired.status, 'expired'); assert.equal(expired.plan, 'personal'); assert.match(expired.detail, /datos siguen intactos/);
});

test('licencia: manipulada, de otro emisor, mal formada o sin clave configurada → Personal', async () => {
  const { privateKey, publicKey } = await keys(), other = await keys();
  const text = await issueLicense(payload(), privateKey), [prefix, body, signature] = text.split('.');
  const forged = prefix + '.' + toBase64Url(new TextEncoder().encode(JSON.stringify(payload({ plan: 'team' })))) + '.' + signature;
  assert.equal((await checkLicense(forged, NOW, publicKey)).status, 'invalid');
  assert.equal((await checkLicense(text, NOW, other.publicKey)).status, 'invalid');
  assert.equal((await checkLicense(prefix + '.' + body, NOW, publicKey)).status, 'malformed');
  assert.equal((await checkLicense('PLANB1.%%%.abc', NOW, publicKey)).status, 'malformed');
  assert.equal((await checkLicense('', NOW, publicKey)).status, 'none');
  const pending = await checkLicense(text, NOW);
  assert.equal(pending.status, 'unverifiable'); assert.equal(pending.plan, 'personal');
});

test('planes: Personal conserva lo básico; Equipo incluye todo lo de Pro', () => {
  assert.equal(planAllows('personal', 'drills'), true); assert.equal(planAllows('personal', 'scheduled-captures'), false);
  assert.equal(planAllows('pro', 'team-space'), false); assert.equal(planAllows('team', 'bulk-edit'), true);
});

test('la tarifa de la landing sale de los mismos planes que la licencia y no inventa precios', () => {
  assert.deepEqual(PLAN_OFFERS.map(offer => offer.id), ['personal', 'pro', 'team']);
  assert.equal(PLAN_OFFERS[0].price, 'Gratis');
  assert.ok(PLAN_OFFERS.slice(1).every(offer => offer.price === PRICE_PENDING));
  assert.deepEqual(planHighlights('personal'), ['Copias manuales y trabajo sin conexión', 'Simulacros de caída']);
  assert.ok(planHighlights('pro').includes('Pasaporte de continuidad') && !planHighlights('pro').includes('Simulacros de caída'));
  assert.deepEqual(planHighlights('team'), ['Espacio de equipo']);
});

test('prueba de Pro: 14 días desde que empieza, una sola vez, y nunca se alarga con el reloj', () => {
  assert.equal(TRIAL_DAYS, 14);
  assert.deepEqual(trialState(null, NOW), { status: 'available', startedAt: null, endsAt: null, daysLeft: null });
  assert.equal(trialState('no es una fecha', NOW).status, 'available');
  const day1 = trialState('2026-11-19T12:00:00.000Z', NOW);
  assert.equal(day1.status, 'active'); assert.equal(day1.daysLeft, 14); assert.equal(day1.endsAt, '2026-12-03T12:00:00.000Z');
  assert.equal(trialState('2026-11-05T13:00:00.000Z', NOW).daysLeft, 1);
  const ended = trialState('2026-11-01T00:00:00.000Z', NOW);
  assert.equal(ended.status, 'ended'); assert.equal(ended.daysLeft, 0);
  const future = trialState('2027-01-01T00:00:00.000Z', NOW);
  assert.equal(future.daysLeft, 14, 'un inicio en el futuro cuenta desde hoy');
  assert.equal(future.startedAt, NOW.toISOString());
});

test('puertas suaves: la prueba eleva Personal a Pro, la licencia nunca baja y nada se bloquea', () => {
  const active = trialState('2026-11-15T00:00:00.000Z', NOW), none = trialState(null, NOW), ended = trialState('2026-10-01T00:00:00.000Z', NOW);
  assert.equal(effectivePlan('personal', active), 'pro');
  assert.equal(effectivePlan('personal', ended), 'personal');
  assert.equal(effectivePlan('team', none), 'team');
  const viaPlan = featureAccess('continuity-seal', 'pro', none);
  assert.equal(viaPlan.via, 'plan'); assert.equal(viaPlan.included, true); assert.equal(viaPlan.badge, 'Pro');
  const viaTrial = featureAccess('pipeline-analytics', 'personal', active);
  assert.equal(viaTrial.via, 'trial'); assert.match(viaTrial.hint, /prueba de Pro \(quedan 10 días\)/);
  const outside = featureAccess('incident-file', 'personal', ended);
  assert.equal(outside.included, false); assert.equal(outside.via, 'none');
  assert.match(outside.hint, /Puedes seguir usándolo; Plan B nunca bloquea tus datos, la exportación ni la recuperación\./);
  assert.equal(featureAccess('team-space', 'personal', active).badge, 'Equipo');
  assert.equal(featureAccess('team-space', 'personal', active).included, false, 'la prueba es de Pro, no de Equipo');
  for (const id of ['incident-file', 'continuity-seal', 'pipeline-analytics', 'scheduled-captures'] as const) assert.ok(FEATURES.some(item => item.id === id && item.plans.join() === 'pro,team'), id);
  assert.ok(planHighlights('pro').includes('Sello de continuidad'));
});