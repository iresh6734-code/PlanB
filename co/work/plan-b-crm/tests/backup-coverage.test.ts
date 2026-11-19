import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareBackupCoverage } from '../server/backup-coverage.js';
import { bundleRevision } from '../server/recovery-copy.js';
import { MAX_RECOVERY_BYTES } from '../server/recovery-preflight.js';
import { encodePortable } from '../server/crypto.js';
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { ContinuityBundle } from '../shared/model.js';

function store() {
  const s = new Store(':memory:'), snapshot = makeFixture();
  s.importSnapshot(snapshot); s.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-10-30T08:00:00Z', prompt: '', approved: false }); s.activate();
  return s;
}
function bundle() { const s = store(); try { return s.bundle(); } finally { s.close(); } }
const raw = (b: ContinuityBundle) => JSON.stringify(b);
const compare = (reference: ContinuityBundle, backup: ContinuityBundle) => compareBackupCoverage({ reference: raw(reference), backup: raw(backup) });

test('same revision uses existing revision contract; exportedAt and object key order do not manufacture divergence', () => {
  const data = bundle(), copy = { ...data, exportedAt: '2020-01-01T00:00:00Z' };
  const text = JSON.stringify(Object.fromEntries(Object.entries(copy).reverse()));
  const result = compareBackupCoverage({ reference: raw(data), backup: text });
  assert.equal(result.status, 'matches-reference'); assert.equal(result.missingLocalChanges, 0);
  assert.equal(result.reference.revision, bundleRevision(data)); assert.equal(result.backup.revision, bundleRevision(copy));
  assert.equal(result.byteIdentical, false); assert.equal(result.reference.artifactHash, createHash('sha256').update(raw(data)).digest('hex'));
  assert.equal(result.differences!.changedRecords, 0); assert.match(result.limitations.join(' '), /no demuestra el estado más reciente/);
});

test('byte-identical inputs are explicitly identified and never treated as proof of external custody', () => {
  const data = bundle(), result = compare(data, data);
  assert.equal(result.status, 'matches-reference'); assert.equal(result.byteIdentical, true);
  assert.match(result.limitations.join(' '), /no demuestra copia fuera del equipo/);
});

test('backup misses a verified history prefix, including a new local record; export dates cannot reverse it', () => {
  const s = store();
  try {
    const copy = s.bundle();
    s.saveRecord('contacts', { phone: 'LOCAL-PHONE-049' }, 'contact-1');
    s.saveRecord('contacts', { firstname: 'Nuevo', lastname: 'Local', email: 'fixture@example.invalid' });
    const reference = s.bundle(); copy.exportedAt = '2099-01-01T00:00:00Z'; reference.exportedAt = '2000-01-01T00:00:00Z';
    const result = compare(reference, copy);
    assert.equal(result.status, 'missing-local-changes'); assert.equal(result.missingLocalChanges, 2);
    assert.equal(result.differences!.missingRecordsInBackup, 1); assert.equal(result.differences!.changedRecords, 1);
    assert.equal(result.differences!.extraRecordsInBackup, 0); assert.equal(result.reference.pendingChanges, 2);
    assert.ok(!JSON.stringify(result).includes('LOCAL-PHONE-049')); assert.ok(!JSON.stringify(result).includes('fixture@example.invalid'));
  } finally { s.close(); }
});

test('extra history containing a reverted value still matters even if records are equal', () => {
  const s = store();
  try {
    const copy = s.bundle(), phone = copy.records.find(r => r.entity === 'contacts' && r.id === 'contact-1')!.values.phone;
    s.saveRecord('contacts', { phone: 'temporary-fixture' }, 'contact-1'); s.saveRecord('contacts', { phone }, 'contact-1');
    const result = compare(s.bundle(), copy);
    assert.equal(result.status, 'missing-local-changes'); assert.equal(result.missingLocalChanges, 2);
    assert.equal(result.differences!.changedRecords, 0, 'history is not inferred from current values');
  } finally { s.close(); }
});

test('reversed direction and divergent histories do not claim a missing-change count', () => {
  const s = store();
  try {
    const first = s.bundle(); s.saveRecord('contacts', { phone: 'one-branch' }, 'contact-1'); const second = s.bundle();
    const reversed = compare(first, second); assert.equal(reversed.status, 'different-revision'); assert.equal(reversed.missingLocalChanges, null);
    const other = new Store(':memory:');
    try { other.restoreBundle(first); other.saveRecord('contacts', { phone: 'another-branch' }, 'contact-1');
      const divergent = compare(second, other.bundle()); assert.equal(divergent.status, 'different-revision'); assert.equal(divergent.missingLocalChanges, null);
      assert.equal(divergent.differences!.changedRecords, 1);
    } finally { other.close(); }
  } finally { s.close(); }
});

test('same records/history but a changed return watermark cannot pass as covered', () => {
  const s = store();
  try {
    s.saveRecord('contacts', { phone: 'local' }, 'contact-1'); const reference = s.bundle(), copy = structuredClone(reference);
    reference.returnState!.watermark = reference.changes[0].id;
    const result = compare(reference, copy);
    assert.equal(result.status, 'different-revision'); assert.equal(result.differences!.changedRecords, 0);
    assert.equal(result.differences!.returnStateChanged, true); assert.equal(result.missingLocalChanges, null);
    assert.equal(result.reference.pendingChanges, 0); assert.equal(result.backup.pendingChanges, 1);
  } finally { s.close(); }
});

test('configuration, generation, session and record-array order changes preserve exact revision semantics', () => {
  const data = bundle();
  for (const change of [
    (copy: ContinuityBundle) => { copy.spec.title = 'Otra vista del mismo ensayo'; },
    (copy: ContinuityBundle) => { copy.generation.model = 'another-fixture-model'; },
    (copy: ContinuityBundle) => { copy.sessionId = 'another-fixture-session'; },
    (copy: ContinuityBundle) => { copy.records.reverse(); },
  ]) {
    const copy = structuredClone(data); change(copy); const result = compare(data, copy);
    assert.equal(result.status, 'different-revision'); assert.equal(result.missingLocalChanges, null); assert.notEqual(result.reference.revision, result.backup.revision);
    assert.equal(result.differences!.changedRecords, 0);
  }
});

test('an extra history suffix does not prove coverage if configuration changed as well', () => {
  const s = store();
  try {
    const copy = s.bundle(); s.saveRecord('contacts', { phone: 'local' }, 'contact-1'); const reference = s.bundle(); reference.spec.title = 'Configuración diferente';
    const result = compare(reference, copy); assert.equal(result.status, 'different-revision'); assert.equal(result.missingLocalChanges, null); assert.equal(result.differences!.specChanged, true);
  } finally { s.close(); }
});

test('portal, source, environment and capture identity are mandatory comparison boundaries', () => {
  const data = bundle();
  for (const change of [
    (copy: ContinuityBundle) => { copy.snapshot.source.accountId = 'another-fixture-portal'; copy.returnState!.accountId = copy.snapshot.source.accountId; },
    (copy: ContinuityBundle) => { copy.snapshot.source.kind = 'archive'; },
    (copy: ContinuityBundle) => { copy.snapshot.source.environment = copy.snapshot.source.environment ? undefined : 'test'; },
    (copy: ContinuityBundle) => { copy.snapshot.id += '-other'; },
    (copy: ContinuityBundle) => { copy.snapshot.capturedAt = '2020-01-01T00:00:00Z'; },
  ]) {
    const copy = structuredClone(data); change(copy); const result = compare(data, copy);
    assert.equal(result.backup.validity, 'valid'); assert.equal(result.status, 'incompatible'); assert.equal(result.differences, null); assert.equal(result.missingLocalChanges, null);
  }
});

test('production class boundary is incompatible even with a valid encrypted production artifact', () => {
  const data = bundle(), production = structuredClone(data), password = 'fiction-only-production-049';
  production.format = 'planb-continuity-v3'; production.snapshot.version = 3; production.spec.version = 3;
  Object.assign(production.snapshot.source, { kind: 'hubspot', isTestData: false, environment: 'production', accountType: 'STANDARD' });
  const result = compareBackupCoverage({ reference: raw(data), backup: encodePortable(production, password), backupPassword: password });
  assert.equal(result.backup.validity, 'valid'); assert.equal(result.status, 'incompatible'); assert.equal(result.sameSource, false);
});

test('each encrypted artifact has its own password; missing/wrong password never falls back to comparison', () => {
  const data = bundle(), referencePassword = 'fiction-reference-049', backupPassword = 'fiction-backup-049';
  const reference = encodePortable(data, referencePassword), backup = encodePortable(data, backupPassword);
  const result = compareBackupCoverage({ reference, backup, referencePassword, backupPassword });
  assert.equal(result.status, 'matches-reference'); assert.equal(result.byteIdentical, false); assert.equal(result.reference.encrypted, true);
  for (const password of [undefined, 'wrong-fixture-password']) {
    const failure = compareBackupCoverage({ reference, backup, referencePassword, backupPassword: password });
    assert.equal(failure.status, 'invalid'); assert.equal(failure.sameSource, null); assert.equal(failure.differences, null);
    assert.ok(!JSON.stringify(failure).includes('wrong-fixture-password')); assert.ok(!JSON.stringify(failure).includes('enc1:'));
  }
});

test('valid JSON with corrupted active data or history is invalid before any coverage verdict', () => {
  const data = bundle(), corrupt = structuredClone(data); corrupt.records[0].values.firstname = 'UNLOGGED-CANARY-049';
  const result = compare(data, corrupt); assert.equal(result.status, 'invalid'); assert.equal(result.backup.revision, null);
  assert.ok(result.backup.issueCodes.includes('INTEGRITY_FAILED')); assert.equal(result.differences, null);
});

test('malformed and oversized inputs produce bounded safe summaries', () => {
  const reference = raw(bundle());
  for (const backup of ['not-json', '{}', 'x'.repeat(MAX_RECOVERY_BYTES + 1)]) {
    const result = compareBackupCoverage({ reference, backup }); assert.equal(result.status, 'invalid'); assert.equal(result.differences, null); assert.equal(result.missingLocalChanges, null);
  }
});

test('report is deterministic, does not mutate inputs/stores and omits customer canaries and identifiers', () => {
  const s = store();
  try {
    s.saveRecord('contacts', { firstname: 'PRIVATE-CANARY-049', email: 'private-canary@example.invalid' }, 'contact-1');
    const data = s.bundle(), before = raw(data), rows = JSON.stringify(s.records());
    const first = compare(data, data); assert.deepEqual(first, compare(data, data));
    const output = JSON.stringify(first);
    for (const canary of ['PRIVATE-CANARY-049', 'private-canary', 'contact-1', 'firstname', 'accountId', 'captureId']) assert.ok(!output.includes(canary), canary);
    assert.equal(raw(data), before); assert.equal(JSON.stringify(s.records()), rows);
    assert.equal(s.pendingChangesCount, 1);
  } finally { s.close(); }
});

test('complete 10000-record inventory is compared without a visible-list cap hiding the last change', () => {
  const copy = bundle(), template = copy.records.find(r => r.entity === 'contacts')!;
  const count = 10_000 - copy.records.length;
  for (let index = 0; index < count; index++) {
    const record = { ...structuredClone(template), id: 'extra-fixture-' + index };
    copy.records.push(record); copy.snapshot.records.push(structuredClone(record));
  }
  copy.snapshot.manifest.expectedCounts.contacts += count;
  const reference = structuredClone(copy), before = structuredClone(reference.records.at(-1)!);
  const after = { ...structuredClone(before), values: { ...before.values, phone: 'last-record-change-049' } };
  reference.records[reference.records.length - 1] = after;
  reference.changes.push({ id: 1, at: '2026-10-30T10:00:00Z', entity: after.entity, recordId: after.id, operation: 'update', before, after });
  const result = compare(reference, copy);
  assert.equal(result.reference.validity, 'valid'); assert.equal(result.backup.validity, 'valid');
  assert.equal(result.reference.records, 10_000); assert.equal(result.status, 'missing-local-changes');
  assert.equal(result.missingLocalChanges, 1); assert.equal(result.differences!.changedRecords, 1);
  assert.ok(!JSON.stringify(result).includes('last-record-change-049'));
});
