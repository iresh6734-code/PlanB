import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sourceReading, type SourceReading } from '../shared/source-reading.js';
import type { Store } from './store.js';

// Internal local persistence only. A receipt is not provider acknowledgement,
// authorization, an authenticated source identity, or A4 recovery coverage.
export const SOURCE_READING_JOURNAL_KEY = 'source-reading-journal:v1';
export const SOURCE_READING_JOURNAL_LIMITS = Object.freeze({ entries: 32, readingBytes: 512 * 1024, journalBytes: 2 * 1024 * 1024 });
const FORMAT = 'planb-source-reading-journal-v1' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.object({
  sequence: z.number().int().min(1).max(SOURCE_READING_JOURNAL_LIMITS.entries),
  previousReceipt: digest.nullable(), readingDigest: digest, savedAt: z.iso.datetime(), receiptId: digest,
  reading: sourceReading,
}).strict();
const envelopeSchema = z.object({
  format: z.literal(FORMAT), instanceId: z.string().uuid(),
  entries: z.array(receiptSchema).max(SOURCE_READING_JOURNAL_LIMITS.entries),
}).strict();
export type SourceReadingReceipt = z.infer<typeof receiptSchema>;
type Envelope = z.infer<typeof envelopeSchema>;
type Provenance = 'memory-only' | 'durable';
type Ready = { status: 'ready'; instanceId: string; revision: string | null; entries: SourceReadingReceipt[]; provenance: Provenance };
type Unavailable = { status: 'unavailable'; reason: 'missing-identity' | 'invalid-journal' | 'storage-failed' };
export type SourceReadingJournal = Ready | Unavailable;
type Refusal = 'invalid-reading' | 'invalid-revision' | 'revision-conflict' | 'reading-too-large'
  | 'journal-full' | 'journal-too-large' | 'invalid-clock' | 'clock-regressed' | 'reading-from-future' | 'context-changed';
export type SourceReadingAppend =
  | { status: 'saved'; created: boolean; revision: string; receipt: SourceReadingReceipt; provenance: Provenance }
  | { status: 'rejected'; reason: Refusal }
  | Unavailable
  | { status: 'unavailable'; reason: 'write-uncertain' };

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const provenance = (store: Store): Provenance => store.filename === ':memory:' ? 'memory-only' : 'durable';
const head = (entries: SourceReadingReceipt[]) => entries.at(-1)?.receiptId ?? null;
const receiptId = (instanceId: string, receipt: Omit<SourceReadingReceipt, 'receiptId' | 'reading'>) => sha({ instanceId, ...receipt });
class Rejected extends Error { constructor(readonly reason: Refusal) { super(reason); } }

function inspect(store: Store): SourceReadingJournal {
  try {
    const identity = z.string().uuid().safeParse(store.get<unknown>('instanceId', null));
    if (!identity.success) return { status: 'unavailable', reason: 'missing-identity' };
    const row = store.db.prepare('SELECT value FROM meta WHERE key=?').get(SOURCE_READING_JOURNAL_KEY) as { value: string } | undefined;
    if (!row) return { status: 'ready', instanceId: identity.data, revision: null, entries: [], provenance: provenance(store) };
    // Bound the encoded row before decoding. File-backed Store normally writes
    // enc1 AES-GCM; don't silently adopt a new plaintext journal row.
    if (typeof row.value !== 'string' || Buffer.byteLength(row.value) > SOURCE_READING_JOURNAL_LIMITS.journalBytes * 2
      || store.filename !== ':memory:' && !row.value.startsWith('enc1:')) return { status: 'unavailable', reason: 'invalid-journal' };
    let raw: unknown;
    try { raw = store.decode<unknown>(row.value); } catch { return { status: 'unavailable', reason: 'invalid-journal' }; }
    if (bytes(raw) > SOURCE_READING_JOURNAL_LIMITS.journalBytes) return { status: 'unavailable', reason: 'invalid-journal' };
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success || parsed.data.instanceId !== identity.data) return { status: 'unavailable', reason: 'invalid-journal' };
    let previous: string | null = null, lastSavedAt = -Infinity;
    const seen = new Set<string>();
    for (const [index, entry] of parsed.data.entries.entries()) {
      const savedAt = Date.parse(entry.savedAt);
      if (entry.sequence !== index + 1 || entry.previousReceipt !== previous
        || entry.readingDigest !== sha(entry.reading) || seen.has(entry.readingDigest)
        || bytes(entry.reading) > SOURCE_READING_JOURNAL_LIMITS.readingBytes
        || savedAt < lastSavedAt || savedAt < Date.parse(entry.reading.completedAt)
        || entry.receiptId !== receiptId(identity.data, {
          sequence: entry.sequence, previousReceipt: entry.previousReceipt, readingDigest: entry.readingDigest, savedAt: entry.savedAt,
        })) return { status: 'unavailable', reason: 'invalid-journal' };
      seen.add(entry.readingDigest); previous = entry.receiptId; lastSavedAt = savedAt;
    }
    return { status: 'ready', instanceId: identity.data, revision: previous, entries: parsed.data.entries, provenance: provenance(store) };
  } catch { return { status: 'unavailable', reason: 'storage-failed' }; }
}

/** No writes, initialization, repair, pruning, clock reads, network or freshness renewal. */
export function readSourceReadingJournal(store: Store): SourceReadingJournal { return inspect(store); }

/**
 * Synchronous cooperative CAS under Store's BEGIN IMMEDIATE. Retry the exact
 * reading after an uncertain acknowledgement to recover its original receipt.
 * Authorizing this operation and authenticating adapter provenance belong to
 * the future host; none is inferred from a valid SourceReading object.
 */
export function appendSourceReading(store: Store, input: { expectedRevision: string | null; reading: unknown }, clock: () => number = Date.now): SourceReadingAppend {
  if (input.expectedRevision !== null && !digest.safeParse(input.expectedRevision).success) return { status: 'rejected', reason: 'invalid-revision' };
  let reading: SourceReading;
  try { reading = sourceReading.parse(input.reading); } catch { return { status: 'rejected', reason: 'invalid-reading' }; }
  if (bytes(reading) > SOURCE_READING_JOURNAL_LIMITS.readingBytes) return { status: 'rejected', reason: 'reading-too-large' };
  const readingDigest = sha(reading);
  try {
    return store.transaction((): SourceReadingAppend => {
      const before = inspect(store);
      if (before.status !== 'ready') return before;
      const existing = before.entries.find(entry => entry.readingDigest === readingDigest);
      if (existing) return { status: 'saved', created: false, revision: before.revision!, receipt: existing, provenance: before.provenance };
      if (before.revision !== input.expectedRevision) return { status: 'rejected', reason: 'revision-conflict' };
      if (before.entries.length >= SOURCE_READING_JOURNAL_LIMITS.entries) return { status: 'rejected', reason: 'journal-full' };
      let epoch: number, savedAt: string;
      try { epoch = clock(); if (!Number.isSafeInteger(epoch) || epoch <= 0) throw Error(); savedAt = new Date(epoch).toISOString(); }
      catch { throw new Rejected('invalid-clock'); }
      const afterClock = inspect(store);
      if (afterClock.status !== 'ready' || afterClock.instanceId !== before.instanceId || afterClock.revision !== before.revision) throw new Rejected('context-changed');
      if (epoch < Date.parse(before.entries.at(-1)?.savedAt ?? '1970-01-01T00:00:00Z')) throw new Rejected('clock-regressed');
      if (epoch < Date.parse(reading.completedAt)) throw new Rejected('reading-from-future');
      const fields = { sequence: before.entries.length + 1, previousReceipt: before.revision, readingDigest, savedAt };
      const receipt: SourceReadingReceipt = { ...fields, receiptId: receiptId(before.instanceId, fields), reading };
      const envelope: Envelope = { format: FORMAT, instanceId: before.instanceId, entries: [...before.entries, receipt] };
      if (bytes(envelope) > SOURCE_READING_JOURNAL_LIMITS.journalBytes) throw new Rejected('journal-too-large');
      store.set(SOURCE_READING_JOURNAL_KEY, envelope);
      const verified = inspect(store);
      if (verified.status !== 'ready' || verified.revision !== receipt.receiptId || verified.entries.length !== envelope.entries.length) throw Error('local receipt not verified');
      return { status: 'saved', created: true, revision: receipt.receiptId, receipt: verified.entries.at(-1)!, provenance: before.provenance };
    });
  } catch (error) {
    if (error instanceof Rejected) return { status: 'rejected', reason: error.reason };
    // Includes a commit whose acknowledgement failed. Never claim "not saved".
    return { status: 'unavailable', reason: 'write-uncertain' };
  }
}
