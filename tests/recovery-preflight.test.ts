import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import { inspectRecoveryCopy, MAX_RECOVERY_BYTES } from '../server/recovery-preflight.js';
import { encodePortable } from '../server/crypto.js';
import { Store } from '../server/store.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';

const password = 'solo-fixture-backup041-2026';
function prepare() {
  const store = new Store(':memory:'), snapshot = makeFixture();
  store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
  return store;
}
function bundle() { const store = prepare(); try { return store.bundle(); } finally { store.close(); } }

test('valid plain fictitious copy produces inventory, original-byte hash and an unchecked target warning', () => {
  const data = bundle(), raw = JSON.stringify(data), result = inspectRecoveryCopy(raw);
  assert.equal(result.status, 'valid'); assert.equal(result.encrypted, false); assert.equal(result.targetIdentityMatches, null);
  assert.equal(result.artifactHash, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.summary!.activeRecords, 62); assert.equal(result.summary!.counts.contacts, 24);
  assert.equal(result.summary!.captureId, data.snapshot.id + ':' + data.snapshot.capturedAt);
  assert.ok(result.issues.some(x => x.code === 'TARGET_NOT_CHECKED'));
});

test('encrypted copy validates and target identity can match without exposing records or password', () => {
  const data = bundle(), result = inspectRecoveryCopy(encodePortable(data, password), { password, target: { accountId: data.snapshot.source.accountId, isTestData: true } });
  assert.equal(result.status, 'valid'); assert.equal(result.encrypted, true); assert.equal(result.targetIdentityMatches, true);
  const output = JSON.stringify(result); assert.ok(!output.includes(password)); assert.ok(!output.includes('firstname')); assert.ok(!output.includes('@'));
});

test('missing and wrong passwords return safe failures without leaking ciphertext or low-level errors', () => {
  const raw = encodePortable(bundle(), password);
  assert.equal(inspectRecoveryCopy(raw).issues[0].code, 'PASSWORD_REQUIRED');
  const result = inspectRecoveryCopy(raw, { password: 'wrong-fixture-password' });
  assert.equal(result.status, 'invalid'); assert.equal(result.summary, null); assert.equal(result.issues[0].code, 'DECRYPT_FAILED');
  assert.ok(!JSON.stringify(result).includes('wrong-fixture-password')); assert.ok(!JSON.stringify(result).includes('enc1:'));
});

test('ciphertext tampering and noncanonical encrypted envelopes are detected', () => {
  const envelope = JSON.parse(encodePortable(bundle(), password)), bytes = Buffer.from(envelope.data.slice(5), 'base64');
  bytes[28] ^= 1; envelope.data = 'enc1:' + bytes.toString('base64');
  assert.equal(inspectRecoveryCopy(JSON.stringify(envelope), { password }).issues[0].code, 'DECRYPT_FAILED');
  envelope.salt += '!'; assert.equal(inspectRecoveryCopy(JSON.stringify(envelope), { password }).issues[0].code, 'INVALID_ENVELOPE');
});

test('portal and data-class mismatches are incompatible even when the artifact itself is valid', () => {
  const data = bundle(), raw = JSON.stringify(data);
  for (const target of [{ accountId: 'other-demo', isTestData: true }, { accountId: data.snapshot.source.accountId, isTestData: false }]) {
    const result = inspectRecoveryCopy(raw, { target }); assert.equal(result.status, 'incompatible'); assert.equal(result.targetIdentityMatches, false); assert.ok(result.summary);
  }
});

test('records changed outside the history fail the real restore contract rather than just a JSON schema', () => {
  const data = bundle(); data.records.find(r => r.entity === 'contacts')!.values.phone = 'unlogged';
  const result = inspectRecoveryCopy(JSON.stringify(data)); assert.equal(result.status, 'invalid'); assert.equal(result.issues[0].code, 'INTEGRITY_FAILED'); assert.equal(result.summary, null);
});

test('pending changes differ from audit-history entries after a preserved return watermark', () => {
  const store = prepare();
  try {
    store.saveRecord('contacts', { phone: 'local' }, 'contact-1'); const data = store.bundle();
    assert.equal(inspectRecoveryCopy(JSON.stringify(data)).summary!.pendingChanges, 1);
    data.returnState!.watermark = data.changes[0].id;
    const result = inspectRecoveryCopy(JSON.stringify(data)); assert.equal(result.status, 'valid');
    assert.equal(result.summary!.changeLogEntries, 1); assert.equal(result.summary!.pendingChanges, 0);
  } finally { store.close(); }
});

test('invalid history, missing active records and unapproved generation are rejected', () => {
  const original = bundle();
  for (const change of [
    (data: typeof original) => { data.records.pop(); },
    (data: typeof original) => { data.generation.approved = false; },
    (data: typeof original) => { data.returnState!.watermark = 999; },
  ]) { const data = structuredClone(original); change(data); assert.equal(inspectRecoveryCopy(JSON.stringify(data)).issues[0].code, 'INTEGRITY_FAILED'); }
});

test('production copy requires encryption and remains subject to installation policy', () => {
  const data = bundle(); data.format = 'planb-continuity-v3'; data.snapshot.version = 3; data.spec.version = 3;
  Object.assign(data.snapshot.source, { kind: 'hubspot', isTestData: false, environment: 'production', accountType: 'STANDARD' });
  assert.equal(inspectRecoveryCopy(JSON.stringify(data)).issues[0].code, 'PRODUCTION_REQUIRES_ENCRYPTION');
  const result = inspectRecoveryCopy(encodePortable(data, password), { password });
  assert.equal(result.status, 'valid'); assert.equal(result.summary!.isTestData, false); assert.ok(result.issues.some(i => i.code === 'REAL_DATA_POLICY'));
});

test('inspection predicts reset approvals and uncertain sending operations without touching the caller store', async () => {
  const store = prepare();
  try {
    store.saveRecord('contacts', { phone: 'local' }, 'contact-1');
    // This is an in-memory fake transport with HubSpot protocol identity; no provider calls.
    const remote = { ...simulatedRemote(store), source: 'hubspot' as const }, engine = new Recovery(store);
    const plan = await engine.preview(remote); engine.approve(plan.id);
    const data = store.bundle(), before = JSON.stringify(store.bundleOrNull()!.records);
    const approved = inspectRecoveryCopy(JSON.stringify(data));
    assert.equal(approved.status, 'valid'); assert.equal(approved.summary!.approvalWouldBeReset, true);
    assert.ok(approved.issues.some(i => i.code === 'APPROVAL_RESET'));
    data.returnState!.plan!.status = 'applying'; data.returnState!.plan!.operations[0].status = 'sending';
    const pending = inspectRecoveryCopy(JSON.stringify(data)); assert.equal(pending.status, 'valid');
    assert.equal(pending.summary!.uncertainOperationsAfterRestore, 1); assert.ok(pending.issues.some(i => i.code === 'REMOTE_RESULT_UNCERTAIN'));
    assert.equal(store.get<any>('recoveryPlan', null).status, 'approved'); assert.equal(JSON.stringify(store.records()), before);
  } finally { store.close(); }
});

test('invalid JSON, unsupported content, invalid targets/passwords and oversized files are bounded', () => {
  assert.equal(inspectRecoveryCopy('PK-not-a-json-zip').issues[0].code, 'INVALID_JSON');
  assert.equal(inspectRecoveryCopy('{"format":"unknown"}').issues[0].code, 'INVALID_BUNDLE');
  assert.equal(inspectRecoveryCopy(JSON.stringify(bundle()), { target: { accountId: '', isTestData: true } }).issues[0].code, 'INVALID_TARGET');
  assert.equal(inspectRecoveryCopy('{}', { password: 'x'.repeat(201) }).issues[0].code, 'INVALID_PASSWORD_INPUT');
  const result = inspectRecoveryCopy('x'.repeat(MAX_RECOVERY_BYTES + 1)); assert.equal(result.issues[0].code, 'SIZE_LIMIT'); assert.equal(result.artifactHash, null);
});

test('summaries do not contain synthetic personal-content canaries and repeated checks are deterministic', () => {
  const store = prepare();
  try {
    store.saveRecord('contacts', { firstname: 'PRIVATE-CANARY-041' }, 'contact-1'); const raw = JSON.stringify(store.bundle());
    const first = inspectRecoveryCopy(raw), second = inspectRecoveryCopy(raw); assert.deepEqual(first, second);
    assert.ok(!JSON.stringify(first).includes('PRIVATE-CANARY-041'));
  } finally { store.close(); }
});
