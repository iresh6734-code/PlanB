import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { contextKey } from '../shared/local-task-focus.js';
import { TaskRevisionWrite } from '../shared/task-revision.js';
import { decodeRecord, KEY_PREFIX, MAX_RECORD_BYTES, MAX_RECORDS, validDate, type IntentRecord, type IntentStorage, type StorageWrite } from '../shared/task-intent-journal.js';
import { storeIntentStorage } from './task-intent-storage.js';
import type { Store } from './store.js';

export const CLAIM_PREFIX = 'task-claim:';
export const CLAIM_INDEX_KEY = 'task-claim-index:v1';
export const CLAIM_EPOCH_KEY = 'task-claim-epoch:v1';
export const CLAIM_LIMITS = Object.freeze({ count: 10_000, bytesPerClaim: 4096, totalBytes: 16 * 1024 * 1024 });
const token = z.string().regex(/^[a-f0-9]{64}$/);
const nullableIdentity = z.string().max(500).nullable();
const identitySchema = z.object({
  instanceId: z.string().uuid(), snapshotId: nullableIdentity, capturedAt: nullableIdentity,
  captureStartedAt: nullableIdentity, accountId: nullableIdentity, generatedAt: nullableIdentity,
}).strict();
export const claimDescriptorSchema = z.object({
  attemptId: z.string().uuid(), identity: identitySchema, contextRevision: token,
  taskId: z.string().min(1).max(500), expectedRevision: token, fingerprint: token,
}).strict();
export type ClaimIdentity = z.infer<typeof identitySchema>;
export type ClaimDescriptor = z.infer<typeof claimDescriptorSchema>;
const fingerprintInput = claimDescriptorSchema.omit({ fingerprint: true }).extend({ values: TaskRevisionWrite.shape.values });
const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
    : JSON.stringify(value ?? null);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const bytes = (value: unknown) => Buffer.byteLength(canonical(value), 'utf8');
export function fingerprintTaskIntent(input: z.input<typeof fingerprintInput>): string {
  return sha(canonical({ protocol: 'planb-task-intent-input-v1', ...fingerprintInput.parse(input) }));
}
const fingerprintOf = (d: ClaimDescriptor, record: IntentRecord) => fingerprintTaskIntent({
  attemptId: d.attemptId, identity: d.identity, contextRevision: d.contextRevision,
  taskId: d.taskId, expectedRevision: d.expectedRevision, values: record.patch,
});
const date = z.string().refine(validDate);
const receiptSchema = z.object({ changed: z.boolean(), resultingRevision: token }).strict();
export type ClaimReceipt = z.infer<typeof receiptSchema>;
const outcome = z.enum(['acknowledged', 'rejected', 'not-sent', 'accepted-read', 'abandoned']).nullable();
const claimSchema = z.object({
  format: z.literal('planb-task-claim-v1'), descriptor: claimDescriptorSchema,
  createdAt: date, updatedAt: date, immutableDigest: token, intentDigest: token,
  seq: z.number().int().min(1), phase: z.enum(['attempt', 'settled']), outcome,
  provenance: z.enum(['server-ack', 'person-accepted-read']).nullable(),
  hasDetail: z.boolean(), receipt: receiptSchema.nullable(),
}).strict().superRefine((claim, ctx) => {
  const provenance = claim.outcome === 'acknowledged' ? 'server-ack' : claim.outcome === 'accepted-read' ? 'person-accepted-read' : null;
  if ((claim.phase === 'settled') !== (claim.outcome !== null) || claim.provenance !== provenance
    || (!claim.hasDetail && claim.phase !== 'settled') || (claim.receipt !== null && claim.outcome !== 'acknowledged')) {
    ctx.addIssue({ code: 'custom', message: 'Incoherent claim' });
  }
});
export type TaskIntentClaim = z.infer<typeof claimSchema>;
const epochSchema = z.object({ format: z.literal('planb-task-claim-epoch-v1'), id: z.string().uuid() }).strict();
const indexSchema = z.object({
  format: z.literal('planb-task-claim-index-v1'), epochId: z.string().uuid(),
  count: z.number().int().min(1).max(CLAIM_LIMITS.count),
  totalBytes: z.number().int().min(1).max(CLAIM_LIMITS.totalBytes), digest: token,
}).strict();
type Index = z.infer<typeof indexSchema>;
export type ClaimIssue = 'invalid-input' | 'unavailable' | 'unclaimed-intent' | 'reused' | 'wrong-scope' | 'expired'
  | 'conflict' | 'claim-capacity' | 'intent-capacity' | 'guard-failed' | 'storage-failed' | 'commit-uncertain';
export type ClaimWriteResult = { status: StorageWrite; issue: ClaimIssue | null };
export type ClaimsInspection = { status: 'ready'; claims: TaskIntentClaim[]; totalBytes: number }
  | { status: 'uninitialized'; claims: []; totalBytes: 0 }
  | { status: 'unavailable'; claims: []; totalBytes: null };
export type ClaimLookup = { kind: 'new' } | { kind: 'replay' | 'expired'; claim: TaskIntentClaim }
  | { kind: 'reused' | 'wrong-scope' | 'unavailable'; issue: ClaimIssue };
export interface ClaimWriteOptions {
  /** Synchronous assertion over the original permission, full context and any task/intent revision precondition. */
  assertCurrent: () => void;
  maxEntries?: number;
  /** Only an actual writer result may supply this receipt. It is never reconstructed from task values. */
  receipt?: ClaimReceipt | null;
}
interface Ledger { claims: TaskIntentClaim[]; index: Index | null; epochId: string | null }
class ClaimFailure extends Error { constructor(readonly issue: ClaimIssue) { super(issue); } }
const immutable = (r: IntentRecord) => sha(canonical({ id: r.id, installId: r.installId, contextKey: r.contextKey,
  taskId: r.taskId, revision: r.revision, createdAt: r.createdAt, patch: r.patch, baseline: r.baseline }));
const recordKeys = new Set(['v', 'id', 'installId', 'contextKey', 'taskId', 'phase', 'outcome', 'provenance', 'patch', 'baseline', 'revision', 'createdAt', 'updatedAt', 'evidence', 'seq']);
const indexOf = (claims: TaskIntentClaim[], epochId: string): Index => ({
  format: 'planb-task-claim-index-v1', epochId, count: claims.length,
  totalBytes: claims.reduce((sum, claim) => sum + bytes(claim), 0),
  digest: sha(canonical([...claims].sort((a, b) => a.descriptor.attemptId < b.descriptor.attemptId ? -1 : a.descriptor.attemptId > b.descriptor.attemptId ? 1 : 0).map(claim => [claim.descriptor.attemptId, sha(canonical(claim))]))),
});
const sameScope = (a: ClaimDescriptor, b: ClaimDescriptor) => a.contextRevision === b.contextRevision && canonical(a.identity) === canonical(b.identity);
const fail = (issue: ClaimIssue, status: StorageWrite = 'failed'): ClaimWriteResult => ({ status, issue });

export function createTaskIntentClaims(store: Store) {
  const row = (key: string): { exists: false; value: null } | { exists: true; value: unknown } => {
    const item = store.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined;
    return item ? { exists: true, value: store.decode<unknown>(item.value) } : { exists: false, value: null };
  };
  function intent(id: string): { raw: string; record: IntentRecord } | null {
    const item = row(KEY_PREFIX + id);
    if (!item.exists) return null;
    if (typeof item.value !== 'string' || Buffer.byteLength(item.value, 'utf8') > MAX_RECORD_BYTES) throw new ClaimFailure('unavailable');
    const parsed = decodeRecord(item.value, KEY_PREFIX + id);
    if (!parsed.ok || Object.keys(parsed.record).some(key => !recordKeys.has(key))) throw new ClaimFailure('unavailable');
    return { raw: item.value, record: parsed.record };
  }
  function validateBinding(d: ClaimDescriptor, r: IntentRecord) {
    if (r.id !== d.attemptId || r.installId !== d.identity.instanceId || r.contextKey !== contextKey(d.identity)
      || r.taskId !== d.taskId || r.revision !== d.expectedRevision || fingerprintOf(d, r) !== d.fingerprint) throw new ClaimFailure('invalid-input');
  }
  function readLedger(): Ledger {
    const keys = store.db.prepare('SELECT key FROM meta WHERE substr(key,1,?)=? ORDER BY key LIMIT ?').all(CLAIM_PREFIX.length, CLAIM_PREFIX, CLAIM_LIMITS.count + 1) as { key: string }[];
    const epoch = row(CLAIM_EPOCH_KEY), index = row(CLAIM_INDEX_KEY);
    if (!epoch.exists && !index.exists && keys.length === 0) return { claims: [], index: null, epochId: null };
    const parsedEpoch = epochSchema.parse(epoch.value), parsedIndex = indexSchema.parse(index.value);
    if (parsedEpoch.id !== parsedIndex.epochId || keys.length !== parsedIndex.count) throw new ClaimFailure('unavailable');
    const claims = keys.map(({ key }) => {
      const claim = claimSchema.parse(row(key).value);
      if (key !== CLAIM_PREFIX + claim.descriptor.attemptId || bytes(claim) > CLAIM_LIMITS.bytesPerClaim) throw new ClaimFailure('unavailable');
      const current = intent(claim.descriptor.attemptId);
      if (!claim.hasDetail) { if (current !== null) throw new ClaimFailure('unavailable'); }
      else {
        if (!current || sha(current.raw) !== claim.intentDigest || immutable(current.record) !== claim.immutableDigest) throw new ClaimFailure('unavailable');
        validateBinding(claim.descriptor, current.record);
        const r = current.record;
        if (r.seq !== claim.seq || r.phase !== claim.phase || r.outcome !== claim.outcome || r.provenance !== claim.provenance
          || r.createdAt !== claim.createdAt || r.updatedAt !== claim.updatedAt) throw new ClaimFailure('unavailable');
      }
      return claim;
    });
    if (canonical(indexOf(claims, parsedEpoch.id)) !== canonical(parsedIndex)) throw new ClaimFailure('unavailable');
    return { claims, index: parsedIndex, epochId: parsedEpoch.id };
  }
  function inspect(): ClaimsInspection {
    try { const l = readLedger(); return l.index ? { status: 'ready', claims: l.claims, totalBytes: l.index.totalBytes } : { status: 'uninitialized', claims: [], totalBytes: 0 }; }
    catch { return { status: 'unavailable', claims: [], totalBytes: null }; }
  }
  function lookup(input: ClaimDescriptor): ClaimLookup {
    try {
      const d = claimDescriptorSchema.parse(input), l = readLedger(), existing = l.claims.find(c => c.descriptor.attemptId === d.attemptId);
      if (!existing) return intent(d.attemptId) ? { kind: 'unavailable', issue: 'unclaimed-intent' } : { kind: 'new' };
      if (!sameScope(existing.descriptor, d)) return { kind: 'wrong-scope', issue: 'wrong-scope' };
      if (canonical(existing.descriptor) !== canonical(d)) return { kind: 'reused', issue: 'reused' };
      return { kind: existing.hasDetail ? 'replay' : 'expired', claim: existing };
    } catch { return { kind: 'unavailable', issue: 'unavailable' }; }
  }
  function guard(options: ClaimWriteOptions) {
    try {
      const result: unknown = options.assertCurrent();
      if (result !== undefined) {
        if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch(() => undefined);
        throw new Error('Assertion must return void synchronously');
      }
    } catch { throw new ClaimFailure('guard-failed'); }
  }
  function persist(l: Ledger, claim: TaskIntentClaim) {
    const next = [...l.claims.filter(c => c.descriptor.attemptId !== claim.descriptor.attemptId), claim];
    if (bytes(claim) > CLAIM_LIMITS.bytesPerClaim || next.length > CLAIM_LIMITS.count) throw new ClaimFailure('claim-capacity');
    const epochId = l.epochId ?? randomUUID(), index = indexOf(next, epochId);
    if (index.totalBytes > CLAIM_LIMITS.totalBytes) throw new ClaimFailure('claim-capacity');
    return { next, epochId, index };
  }
  function transact(d: ClaimDescriptor, raw: string | null, expected: string | null, options: ClaimWriteOptions): ClaimWriteResult {
    let verifiedBody = false;
    try {
      const result = store.transaction(() => {
        const l = readLedger(), previous = l.claims.find(c => c.descriptor.attemptId === d.attemptId), current = intent(d.attemptId);
        if (previous && !sameScope(previous.descriptor, d)) return fail('wrong-scope', 'conflict');
        if (previous && canonical(previous.descriptor) !== canonical(d)) return fail('reused', 'conflict');
        if (previous && !previous.hasDetail) return fail('expired', 'conflict');
        if ((current?.raw ?? null) !== expected) return fail('conflict', 'conflict');
        if (!previous && current) return fail('unclaimed-intent', 'conflict');
        let nextClaim: TaskIntentClaim;
        if (raw === null) {
          if (!previous || !current || current.record.phase !== 'settled') return fail('conflict', 'conflict');
          nextClaim = { ...previous, hasDetail: false };
        } else {
          if (Buffer.byteLength(raw, 'utf8') > MAX_RECORD_BYTES) return fail('invalid-input');
          const parsed = decodeRecord(raw, KEY_PREFIX + d.attemptId);
          if (!parsed.ok || Object.keys(parsed.record).some(key => !recordKeys.has(key))) return fail('invalid-input');
          const r = parsed.record; validateBinding(d, r);
          if ((!previous && (expected !== null || r.phase !== 'attempt' || r.seq !== 1))
            || (previous && (r.seq !== previous.seq + 1 || immutable(r) !== previous.immutableDigest
              || previous.phase === 'settled'))) return fail('conflict', 'conflict');
          let receipt = previous?.receipt ?? null;
          if (options.receipt !== undefined && options.receipt !== null) receipt = receiptSchema.parse(options.receipt);
          if (r.outcome !== 'acknowledged') { if (options.receipt) return fail('invalid-input'); receipt = null; }
          nextClaim = claimSchema.parse({ format: 'planb-task-claim-v1', descriptor: d, createdAt: r.createdAt, updatedAt: r.updatedAt,
            immutableDigest: immutable(r), intentDigest: sha(raw), seq: r.seq, phase: r.phase, outcome: r.outcome,
            provenance: r.provenance, hasDetail: true, receipt });
          if (!previous) {
            const limit = options.maxEntries ?? MAX_RECORDS;
            if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECORDS) return fail('invalid-input');
            const { n } = store.db.prepare('SELECT COUNT(*) AS n FROM meta WHERE substr(key,1,?)=?').get(KEY_PREFIX.length, KEY_PREFIX) as { n: number };
            if (n >= limit) return fail('intent-capacity', 'full');
          }
        }
        const prepared = persist(l, nextClaim);
        guard(options); // The original permission and any revision/sequence assertions, with no await before the effect.
        if (raw === null) store.db.prepare('DELETE FROM meta WHERE key=?').run(KEY_PREFIX + d.attemptId);
        else store.set(KEY_PREFIX + d.attemptId, raw);
        store.set(CLAIM_PREFIX + d.attemptId, nextClaim);
        if (l.epochId === null) store.set(CLAIM_EPOCH_KEY, { format: 'planb-task-claim-epoch-v1', id: prepared.epochId });
        store.set(CLAIM_INDEX_KEY, prepared.index);
        const after = readLedger();
        if (canonical(after.claims.find(c => c.descriptor.attemptId === d.attemptId)) !== canonical(nextClaim)
          || canonical(after.index) !== canonical(prepared.index) || (intent(d.attemptId)?.raw ?? null) !== raw) throw new ClaimFailure('storage-failed');
        verifiedBody = true;
        return { status: 'ok', issue: null } as ClaimWriteResult;
      });
      if (result.status === 'ok') {
        const after = readLedger(), claim = after.claims.find(c => c.descriptor.attemptId === d.attemptId);
        if (!claim || canonical(claim.descriptor) !== canonical(d) || (intent(d.attemptId)?.raw ?? null) !== raw) return fail('commit-uncertain');
      }
      return result;
    } catch (error) {
      if (verifiedBody) return fail('commit-uncertain');
      const issue = error instanceof ClaimFailure ? error.issue : 'storage-failed';
      return fail(issue, issue === 'claim-capacity' ? 'full' : 'failed');
    }
  }
  function writeIntent(input: ClaimDescriptor, raw: string, expected: string | null, options: ClaimWriteOptions): ClaimWriteResult {
    const d = claimDescriptorSchema.safeParse(input);
    if (!d.success || typeof raw !== 'string' || (expected !== null && typeof expected !== 'string')) return fail('invalid-input');
    return transact(d.data, raw, expected, options);
  }
  function removeIntent(input: ClaimDescriptor, expected: string, options: ClaimWriteOptions): ClaimWriteResult {
    const d = claimDescriptorSchema.safeParse(input);
    if (!d.success || typeof expected !== 'string') return fail('invalid-input');
    return transact(d.data, null, expected, options);
  }
  function storage(input: ClaimDescriptor, options: ClaimWriteOptions): IntentStorage {
    const d = claimDescriptorSchema.parse(input), base = storeIntentStorage(store), ownKey = KEY_PREFIX + d.attemptId, assertCurrent = options.assertCurrent;
    return {
      async readAll() { if (inspect().status === 'unavailable') throw new Error('Claim storage unavailable'); return base.readAll(); },
      async write(key, raw, expected, limits) { return key === ownKey ? writeIntent(d, raw, expected, { ...options, ...limits, assertCurrent }).status : 'failed'; },
      async remove(key, expected) { return key === ownKey ? removeIntent(d, expected, { ...options, assertCurrent }).status : 'failed'; },
    };
  }
  return { inspect, lookup, writeIntent, removeIntent, storage };
}
