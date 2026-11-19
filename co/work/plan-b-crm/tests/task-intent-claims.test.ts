import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.js';
import { createTaskIntentClaims, fingerprintTaskIntent, CLAIM_PREFIX, CLAIM_INDEX_KEY, CLAIM_EPOCH_KEY, CLAIM_LIMITS,
  type ClaimDescriptor, type ClaimIdentity, type ClaimWriteOptions, type TaskIntentClaim } from '../server/task-intent-claims.js';
import { createIntentJournal, encodeRecord, KEY_PREFIX, SETTLED_TTL_MS, MAX_RECORDS, type IntentRecord } from '../shared/task-intent-journal.js';
import { contextKey } from '../shared/local-task-focus.js';

process.env.NODE_ENV = 'test';
const AT = '2026-11-09T10:00:00.000Z', TOKEN = 'a'.repeat(64), PIN = 'b'.repeat(64), NEXT = 'c'.repeat(64), SECRET = 'fiction-patch-canary-310';
const identity: ClaimIdentity = { instanceId: '00000000-0000-4000-8000-000000000001', snapshotId: 'fixture-310', capturedAt: AT, captureStartedAt: null, accountId: 'fixture-account-310', generatedAt: AT };
function fixture(over: Partial<Omit<ClaimDescriptor, 'fingerprint'>> = {}) {
  const input = { attemptId: randomUUID(), identity: { ...identity }, contextRevision: PIN, taskId: 'fiction-task', expectedRevision: TOKEN, ...over };
  const values = { notes: SECRET };
  const d: ClaimDescriptor = { ...input, fingerprint: fingerprintTaskIntent({ ...input, values }) };
  const record: IntentRecord = { v: 1, id: d.attemptId, installId: d.identity.instanceId, contextKey: contextKey(d.identity), taskId: d.taskId,
    phase: 'attempt', outcome: null, provenance: null, patch: values, baseline: { notes: 'fiction-base-310' }, revision: d.expectedRevision,
    createdAt: AT, updatedAt: AT, evidence: null, seq: 1 };
  return { d, record, raw: encodeRecord(record) };
}
const options = (): ClaimWriteOptions => ({ assertCurrent() {} });
const rows = (store: Store) => JSON.stringify(store.db.prepare('SELECT key,value FROM meta ORDER BY key').all());
function memory(t: TestContext) { const store = new Store(':memory:'); t.after(() => store.close()); return store; }
function settle(record: IntentRecord): IntentRecord { return { ...record, phase: 'settled', outcome: 'acknowledged', provenance: 'server-ack', seq: record.seq + 1 }; }
function saveSettled(store: Store, f = fixture()) {
  const claims = createTaskIntentClaims(store); assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok');
  const raw = encodeRecord(settle(f.record)); assert.equal(claims.writeIntent(f.d, raw, f.raw, { ...options(), receipt: { changed: true, resultingRevision: NEXT } }).status, 'ok');
  return { ...f, raw, record: settle(f.record), claims };
}

test('lecturas nuevas son puras y fingerprint canónico distingue contenido, identidad y revisión sin depender del orden de campos', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture(), before = rows(store);
  assert.equal(claims.inspect().status, 'uninitialized'); assert.deepEqual(claims.lookup(f.d), { kind: 'new' }); assert.equal(rows(store), before);
  const input = { attemptId: f.d.attemptId, identity: f.d.identity, contextRevision: PIN, taskId: f.d.taskId, expectedRevision: TOKEN };
  assert.equal(fingerprintTaskIntent({ ...input, values: { a: 1, b: false } }), fingerprintTaskIntent({ ...input, values: { b: false, a: 1 } }));
  assert.notEqual(fingerprintTaskIntent({ ...input, values: { a: 1 } }), fingerprintTaskIntent({ ...input, values: { a: 2 } }));
  assert.notEqual(fingerprintTaskIntent({ ...input, values: { a: 1 } }), fingerprintTaskIntent({ ...input, expectedRevision: NEXT, values: { a: 1 } }));
});

test('claim y raw208 se crean juntos, se releen idénticos y replay/reuso/ámbito distinto no escriben', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture();
  assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok'); assert.equal(store.get(KEY_PREFIX + f.d.attemptId, null), f.raw);
  const before = rows(store), found = claims.lookup(f.d); assert.equal(found.kind, 'replay');
  assert.equal(claims.lookup({ ...f.d, fingerprint: NEXT }).kind, 'reused');
  assert.equal(claims.lookup({ ...f.d, contextRevision: NEXT }).kind, 'wrong-scope');
  assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'conflict');
  assert.equal(rows(store), before);
});

test('una cuenta vacía conserva la identidad exacta del contexto; no se sustituye por null', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture({ identity: { ...identity, accountId: '' } });
  assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok');
  assert.equal(claims.lookup(f.d).kind, 'replay');
  assert.equal(claims.lookup({ ...f.d, identity: { ...f.d.identity, accountId: null } }).kind, 'wrong-scope');
});

test('CAS actualiza evidencia y metadata en una transacción; secuencia vieja, salto y baseline alterada se rechazan', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture();
  assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok');
  const revised = { ...f.record, seq: 2, evidence: { kind: 'applied' as const, at: AT } }, raw = encodeRecord(revised);
  assert.equal(claims.writeIntent(f.d, raw, f.raw, options()).status, 'ok');
  const found = claims.lookup(f.d); assert.equal(found.kind, 'replay'); if (found.kind === 'replay') assert.equal(found.claim.seq, 2);
  const before = rows(store);
  assert.equal(claims.writeIntent(f.d, raw, f.raw, options()).status, 'conflict');
  assert.equal(claims.writeIntent(f.d, encodeRecord({ ...revised, seq: 4 }), raw, options()).status, 'conflict');
  assert.equal(claims.writeIntent(f.d, encodeRecord({ ...revised, seq: 3, baseline: { notes: 'altered' } }), raw, options()).status, 'conflict');
  assert.equal(rows(store), before);
});

test('cada fallo parcial y cada set que no escribe revierte claim, epoch, índice e intención', t => {
  for (const mode of ['throw', 'noop'] as const) for (const target of ['intent', 'claim', 'epoch', 'index'] as const) {
    const store = new Store(':memory:');
    try {
      const f = fixture(), claims = createTaskIntentClaims(store), before = rows(store), original = store.set.bind(store);
      const key = target === 'intent' ? KEY_PREFIX + f.d.attemptId : target === 'claim' ? CLAIM_PREFIX + f.d.attemptId : target === 'epoch' ? CLAIM_EPOCH_KEY : CLAIM_INDEX_KEY;
      store.set = (name, value) => { if (name === key) { if (mode === 'throw') throw new Error('synthetic write failure'); return; } original(name, value); };
      assert.notEqual(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok', mode + ':' + target);
      assert.equal(rows(store), before, mode + ':' + target); assert.equal(claims.inspect().status, 'uninitialized');
    } finally { store.close(); }
  }
});

test('guardia síncrona comprueba permiso/contexto y versiones justo antes de escribir; throw/false/Promise no producen efecto', t => {
  const store = memory(t), f = fixture(), claims = createTaskIntentClaims(store), before = rows(store);
  for (const assertCurrent of [() => { throw new Error('revoked'); }, () => false, () => Promise.resolve(), () => Promise.reject(new Error('async rejection'))]) {
    const result = claims.writeIntent(f.d, f.raw, null, { assertCurrent }); assert.equal(result.issue, 'guard-failed'); assert.equal(rows(store), before);
  }
  let calls = 0;
  assert.equal(claims.writeIntent(f.d, f.raw, null, { assertCurrent() { calls++; assert.equal(store.get(KEY_PREFIX + f.d.attemptId, null), null); } }).status, 'ok');
  assert.equal(calls, 1);
  const current = rows(store);
  assert.equal(claims.writeIntent(f.d, encodeRecord({ ...f.record, seq: 2 }), f.raw, { assertCurrent() { assert.equal('actual-task-revision', 'expected-task-revision'); } }).issue, 'guard-failed');
  assert.equal(rows(store), current);
});

test('un acuse de COMMIT perdido se declara incierto y lookup concilia lo persistido sin volver a escribir', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture(), original = store.transaction.bind(store);
  store.transaction = fn => { original(fn); throw new Error('synthetic lost commit receipt'); };
  assert.deepEqual(claims.writeIntent(f.d, f.raw, null, options()), { status: 'failed', issue: 'commit-uncertain' });
  store.transaction = original; const before = rows(store);
  assert.equal(claims.lookup(f.d).kind, 'replay'); assert.equal(rows(store), before);
});

test('adaptador208 no envía si persistir falla; confirma acuse real, permite poda propia y tombstone impide reenviar trasTTL', async t => {
  const store = memory(t), f = fixture(), claims = createTaskIntentClaims(store), opts = options(); let sends = 0, now = AT;
  const journal = createIntentJournal({ storage: claims.storage(f.d, opts), now: () => now, newId: () => f.d.attemptId });
  const input = { id: f.d.attemptId, current: { installId: f.d.identity.instanceId, contextKey: contextKey(f.d.identity) }, taskId: f.d.taskId, patch: f.record.patch, baseline: f.record.baseline, revision: TOKEN };
  const result = await journal.attempt(input, async () => { sends++; opts.receipt = { changed: false, resultingRevision: TOKEN }; return { kind: 'ack' as const }; });
  assert.equal(result.journaled, true); if (result.journaled) assert.equal(result.settled, true); assert.equal(sends, 1);
  const found = claims.lookup(f.d); assert.equal(found.kind, 'replay'); if (found.kind === 'replay') assert.deepEqual(found.claim.receipt, { changed: false, resultingRevision: TOKEN });
  now = new Date(Date.parse(AT) + SETTLED_TTL_MS + 1).toISOString(); assert.equal((await journal.prune()).removed, 1);
  const before = rows(store), expired = claims.lookup(f.d); assert.equal(expired.kind, 'expired');
  delete opts.receipt; // A fresh HTTP attempt does not carry the receipt of the earlier execution.
  const repeat = await journal.attempt(input, async () => { sends++; return { kind: 'ack' as const }; });
  assert.equal(repeat.journaled, false); assert.equal(sends, 1); assert.equal(rows(store), before);
});

test('un fallo al guardar impide el callback de envío208', async t => {
  const store = memory(t), f = fixture(), claims = createTaskIntentClaims(store); let sends = 0;
  const journal = createIntentJournal({ storage: claims.storage(f.d, { assertCurrent() { throw new Error('context changed'); } }), now: () => AT, newId: () => f.d.attemptId });
  const result = await journal.attempt({ id: f.d.attemptId, current: { installId: identity.instanceId, contextKey: contextKey(identity) }, taskId: f.d.taskId, patch: f.record.patch, baseline: f.record.baseline, revision: TOKEN }, async () => { sends++; return { kind: 'ack' as const }; });
  assert.equal(result.journaled, false); assert.equal(sends, 0); assert.equal(claims.inspect().status, 'uninitialized');
});

test('relectura sin escritura y acuse de COMMIT perdido impiden despachar a través del diario208', async () => {
  for (const fault of ['silent-set', 'lost-commit'] as const) {
    const store = new Store(':memory:');
    try {
      const f = fixture(), claims = createTaskIntentClaims(store), originalSet = store.set.bind(store), originalTransaction = store.transaction.bind(store); let sends = 0;
      if (fault === 'silent-set') store.set = (key, value) => { if (key !== KEY_PREFIX + f.d.attemptId) originalSet(key, value); };
      else store.transaction = fn => { originalTransaction(fn); throw new Error('synthetic lost commit acknowledgment'); };
      const journal = createIntentJournal({ storage: claims.storage(f.d, options()), now: () => AT, newId: () => f.d.attemptId });
      const result = await journal.attempt({ id: f.d.attemptId, current: { installId: identity.instanceId, contextKey: contextKey(identity) }, taskId: f.d.taskId, patch: f.record.patch, baseline: f.record.baseline, revision: TOKEN }, async () => { sends++; return { kind: 'ack' as const }; });
      assert.equal(result.journaled, false, fault); assert.equal(sends, 0, fault);
      store.set = originalSet; store.transaction = originalTransaction;
      assert.equal(claims.lookup(f.d).kind, fault === 'silent-set' ? 'new' : 'replay');
      assert.equal(claims.inspect().status, fault === 'silent-set' ? 'uninitialized' : 'ready');
    } finally { store.close(); }
  }
});

test('el adaptador captura la guardia original: sustituir options después no adopta otra autorización', async t => {
  const store = memory(t), f = fixture(), claims = createTaskIntentClaims(store), opts: ClaimWriteOptions = { assertCurrent() { throw new Error('original permission revoked'); } };
  const adapter = claims.storage(f.d, opts), before = rows(store);
  opts.assertCurrent = () => undefined;
  assert.equal(await adapter.write(KEY_PREFIX + f.d.attemptId, f.raw, null), 'failed');
  assert.equal(rows(store), before);
});

test('retirar detalle pendiente o mutar una liquidación cerrada no está permitido; no inventa un acuse compacto', t => {
  const store = memory(t), claims = createTaskIntentClaims(store), f = fixture(); assert.equal(claims.writeIntent(f.d, f.raw, null, options()).status, 'ok');
  const before = rows(store); assert.equal(claims.removeIntent(f.d, f.raw, options()).status, 'conflict'); assert.equal(rows(store), before);
  const settled = encodeRecord(settle(f.record)); assert.equal(claims.writeIntent(f.d, settled, f.raw, options()).status, 'ok');
  const found = claims.lookup(f.d); assert.equal(found.kind, 'replay'); if (found.kind === 'replay') assert.equal(found.claim.receipt, null);
  assert.equal(claims.writeIntent(f.d, encodeRecord({ ...settle(f.record), seq: 3 }), settled, options()).status, 'conflict');
});

test('índice, epoch, marca o detalle ausentes/corruptos se conservan indisponibles; nunca se inicializa sobre ellos', t => {
  for (const target of [CLAIM_INDEX_KEY, CLAIM_EPOCH_KEY, 'claim', 'intent']) for (const remove of [true, false]) {
    const store = new Store(':memory:');
    try {
      const f = saveSettled(store), key = target === 'claim' ? CLAIM_PREFIX + f.d.attemptId : target === 'intent' ? KEY_PREFIX + f.d.attemptId : target;
      if (remove) store.db.prepare('DELETE FROM meta WHERE key=?').run(key); else store.set(key, { corrupt: true });
      const before = rows(store), next = fixture(); assert.equal(f.claims.inspect().status, 'unavailable', key);
      assert.equal(f.claims.lookup(next.d).kind, 'unavailable'); assert.notEqual(f.claims.writeIntent(next.d, next.raw, null, options()).status, 'ok'); assert.equal(rows(store), before);
    } finally { store.close(); }
  }
});

test('un raw alterado con checksum válido, un ID208 legado y un tombstone con detalle reaparecido no se adoptan', t => {
  const store = memory(t), f = saveSettled(store), claims = f.claims;
  store.set(KEY_PREFIX + f.d.attemptId, encodeRecord({ ...f.record, patch: { notes: 'different' } })); assert.equal(claims.inspect().status, 'unavailable');
  const other = new Store(':memory:');
  try {
    const legacy = fixture(), c = createTaskIntentClaims(other); other.set(KEY_PREFIX + legacy.d.attemptId, legacy.raw); const before = rows(other);
    assert.equal(c.lookup(legacy.d).kind, 'unavailable'); assert.notEqual(c.writeIntent(legacy.d, legacy.raw, null, options()).status, 'ok'); assert.equal(rows(other), before);
    const own = saveSettled(other); assert.equal(own.claims.removeIntent(own.d, own.raw, options()).status, 'ok'); other.set(KEY_PREFIX + own.d.attemptId, own.raw); assert.equal(own.claims.inspect().status, 'unavailable');
  } finally { other.close(); }
});

test('reinicio de SQLite de archivo conserva claims sellados y tombstone, con lecturas sin mutación', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-claims310-')), file = path.join(folder, 'planb.sqlite'); let store: Store | null = null;
  try {
    store = new Store(file); const f = saveSettled(store);
    for (const r of store.db.prepare('SELECT value FROM meta').all() as { value: string }[]) { assert.ok(r.value.startsWith('enc1:')); assert.ok(!r.value.includes(SECRET)); }
    const second = new Store(file);
    try {
      const beforeSecond = rows(store), c = createTaskIntentClaims(second);
      assert.equal(c.lookup(f.d).kind, 'replay');
      assert.equal(c.writeIntent(f.d, f.raw, null, options()).status, 'conflict', 'otra conexión no reclama un ID existente');
      assert.equal(rows(store), beforeSecond);
    } finally { second.close(); }
    store.close(); store = new Store(file); const c = createTaskIntentClaims(store), before = rows(store); assert.equal(c.lookup(f.d).kind, 'replay'); assert.equal(rows(store), before);
    assert.equal(c.removeIntent(f.d, f.raw, options()).status, 'ok'); store.close(); store = new Store(file);
    const after = rows(store); assert.equal(createTaskIntentClaims(store).lookup(f.d).kind, 'expired'); assert.equal(rows(store), after);
  } finally {
    store?.close(); const absolute = path.resolve(folder), parent = path.resolve(os.tmpdir());
    assert.ok(absolute.startsWith(parent + path.sep) && path.basename(absolute).startsWith('planb-claims310-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  }
});

test('límite200: prune ligado al ID no borra otros; mantenimiento explícito autorizado libera solo detalle', async t => {
  const store = memory(t), previous: ReturnType<typeof saveSettled>[] = [];
  for (let n = 0; n < MAX_RECORDS; n++) previous.push(saveSettled(store));
  const f = fixture(), c = createTaskIntentClaims(store), future = new Date(Date.parse(AT) + SETTLED_TTL_MS + 1).toISOString(); let sends = 0;
  const journal = createIntentJournal({ storage: c.storage(f.d, options()), now: () => future, newId: () => f.d.attemptId });
  const input = { id: f.d.attemptId, current: { installId: identity.instanceId, contextKey: contextKey(identity) }, taskId: f.d.taskId, patch: f.record.patch, baseline: f.record.baseline, revision: TOKEN };
  const before = rows(store), result = await journal.attempt(input, async () => { sends++; return { kind: 'unknown' as const }; });
  assert.equal(result.journaled, false); assert.equal(sends, 0); assert.equal(rows(store), before);
  assert.equal(c.removeIntent(previous[0]!.d, previous[0]!.raw, options()).status, 'ok'); assert.equal(c.lookup(previous[0]!.d).kind, 'expired');
  const retry = await journal.attempt(input, async () => { sends++; return { kind: 'unknown' as const }; }); assert.equal(retry.journaled, true); assert.equal(sends, 1);
});

// Physical boundary fixtures use the documented persisted representation, not10,000 incremental O(n) integrity scans.
const canonicalFixture = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonicalFixture).join(',') + ']'
  : v !== null && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalFixture((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v ?? null);
const digestFixture = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : canonicalFixture(v)).digest('hex');
function seedTombstones(store: Store, template: TaskIntentClaim, count: number) {
  const epoch = store.get<{ id: string }>(CLAIM_EPOCH_KEY, { id: '' }), entries: TaskIntentClaim[] = [];
  store.transaction(() => {
    store.db.prepare('DELETE FROM meta WHERE substr(key,1,?)=?').run(CLAIM_PREFIX.length, CLAIM_PREFIX);
    store.db.prepare('DELETE FROM meta WHERE substr(key,1,?)=?').run(KEY_PREFIX.length, KEY_PREFIX);
    for (let n = 0; n < count; n++) {
      const attemptId = '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
      const entry: TaskIntentClaim = { ...template, descriptor: { ...template.descriptor, attemptId }, hasDetail: false };
      entries.push(entry); store.set(CLAIM_PREFIX + attemptId, entry);
    }
    store.set(CLAIM_INDEX_KEY, { format: 'planb-task-claim-index-v1', epochId: epoch.id, count,
      totalBytes: entries.reduce((sum, e) => sum + Buffer.byteLength(canonicalFixture(e)), 0),
      digest: digestFixture(entries.map(e => [e.descriptor.attemptId, digestFixture(e)])) });
  });
}

test('límite físico de10000marcas conserva replays y rechaza el alta antes de la guardia', t => {
  const store = memory(t), f = saveSettled(store), found = f.claims.lookup(f.d); assert.equal(found.kind, 'replay'); if (found.kind !== 'replay') return;
  seedTombstones(store, found.claim, CLAIM_LIMITS.count); assert.equal(f.claims.inspect().status, 'ready'); const before = rows(store), next = fixture(); let called = 0;
  assert.equal(f.claims.writeIntent(next.d, next.raw, null, { assertCurrent() { called++; } }).issue, 'claim-capacity'); assert.equal(called, 0); assert.equal(rows(store), before);
  assert.equal(f.claims.lookup({ ...found.claim.descriptor, attemptId: '00000000-0000-4000-8000-000000000000' }).kind, 'expired');
});

test('límite4096UTF8por marca no produce filas parciales ni inicialización', t => {
  const store = memory(t), f = fixture({ identity: { ...identity, snapshotId: '界'.repeat(500), capturedAt: '界'.repeat(500), captureStartedAt: '界'.repeat(500), accountId: '界'.repeat(500), generatedAt: '界'.repeat(500) }, taskId: 'k'.repeat(500) }), c = createTaskIntentClaims(store), before = rows(store); let called = 0;
  assert.ok(Buffer.byteLength(JSON.stringify(f.d), 'utf8') > CLAIM_LIMITS.bytesPerClaim, 'la fixture realmente excede el presupuesto de bytes, sin exceder caracteres por campo');
  assert.equal(c.writeIntent(f.d, f.raw, null, { assertCurrent() { called++; } }).issue, 'claim-capacity'); assert.equal(called, 0); assert.equal(rows(store), before);
});

test('límite agregado16MiB rechaza el alta y conserva marcas existentes sin confundirlo con capacidad208', t => {
  const store = memory(t), f = saveSettled(store, fixture({ identity: { ...identity, snapshotId: 's'.repeat(400), capturedAt: 'c'.repeat(400), captureStartedAt: 't'.repeat(400), accountId: 'a'.repeat(400) } }));
  const found = f.claims.lookup(f.d); assert.equal(found.kind, 'replay'); if (found.kind !== 'replay') return;
  const template = { ...found.claim, hasDetail: false }, size = Buffer.byteLength(canonicalFixture(template)); assert.ok(size < CLAIM_LIMITS.bytesPerClaim);
  const count = Math.floor(CLAIM_LIMITS.totalBytes / size); assert.ok(count < CLAIM_LIMITS.count); seedTombstones(store, template, count);
  assert.equal(f.claims.inspect().status, 'ready'); const before = rows(store), next = fixture({ identity: f.d.identity });
  assert.equal(f.claims.writeIntent(next.d, next.raw, null, options()).issue, 'claim-capacity'); assert.equal(rows(store), before);
});
