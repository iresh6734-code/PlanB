import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLicense, issueLicense, planAllows, toBase64Url, type LicensePayload } from '../shared/license.js';

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
