import { z } from 'zod';
import { commitmentId, commitmentRevision, commitmentRoles } from './commitments.js';
import { sourceStops } from './source-reading.js';

export const SOURCE_READING_HISTORY_PATH = '/api/v7/source-reading-history';
export const SOURCE_READING_HISTORY_NOTICE = 'Historial local de ensayo: los recibos no acreditan acceso o conexión con el proveedor.';
const provider = commitmentId.refine(value => value.endsWith('-fixture'), 'Solo fuentes de ensayo');
const account = z.string().regex(/^fixture-[a-z0-9-]{1,48}$/);
const object = z.string().regex(/^[a-z][a-z-]{0,39}$/);
const target = z.object({ kind: z.enum(commitmentRoles), remoteId: z.string().trim().min(1).max(160) }).strict();
export const sourceHistoryKey = z.object({ provider, accountId: account, objectType: object, mode: z.enum(['listing', 'lookup']), target: target.nullable() }).strict().superRefine((key, ctx) => {
  if ((key.mode === 'lookup') !== (key.target !== null)) ctx.addIssue({ code: 'custom', message: 'El objetivo solo corresponde a lookup' });
});
export const sourceHistoryBinding = z.object({ instanceId: z.string().uuid(), contextRevision: commitmentRevision, scopeRevision: commitmentRevision, source: sourceHistoryKey }).strict();
export type SourceHistoryBinding = z.infer<typeof sourceHistoryBinding>;
export const sourceHistoryQuery = z.object({
  contextRevision: commitmentRevision, provider, accountId: account, objectType: object, mode: z.enum(['listing', 'lookup']),
  role: z.enum(commitmentRoles).optional(), remoteId: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10), cursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional(),
}).strict().superRefine((query, ctx) => {
  if (query.mode === 'listing' && (query.role !== undefined || query.remoteId !== undefined)
    || query.mode === 'lookup' && (query.role === undefined || query.remoteId === undefined)) ctx.addIssue({ code: 'custom', message: 'Indica el objetivo exacto solo para lookup' });
});
export const sourceHistoryCursor = z.object({
  format: z.literal('planb-source-history-cursor-v1'), instanceId: z.string().uuid(), contextRevision: commitmentRevision,
  scopeRevision: commitmentRevision, filterRevision: commitmentRevision, journalRevision: commitmentRevision,
  offset: z.number().int().min(1).max(32), limit: z.number().int().min(1).max(25),
}).strict();
export const sourceHistoryResponse = z.object({
  format: z.literal('planb-source-reading-history-v1'), storageOnly: z.literal(true), notice: z.literal(SOURCE_READING_HISTORY_NOTICE),
  instanceId: z.string().uuid(), contextRevision: commitmentRevision, scopeRevision: commitmentRevision, source: sourceHistoryKey,
  journalRevision: commitmentRevision.nullable(), provenance: z.enum(['memory-only', 'durable']),
  entries: z.array(z.object({
    sequence: z.number().int().min(1).max(32), receiptId: commitmentRevision, readingDigest: commitmentRevision,
    savedAt: z.iso.datetime(), startedAt: z.iso.datetime(), completedAt: z.iso.datetime(), coverage: z.enum(['complete', 'partial', 'unavailable']),
    stoppedBy: z.enum(sourceStops).nullable(), storedRecords: z.number().int().min(0).nullable(), pages: z.number().int().min(0), requests: z.number().int().min(0),
    skipped: z.object({ unknownValue: z.number().int().min(0), malformed: z.number().int().min(0), duplicates: z.number().int().min(0) }).strict(),
    retryAfterSeconds: z.number().int().min(0).max(3600).nullable(),
  }).strict()).max(25),
  page: z.object({ offset: z.number().int().min(0).max(32), limit: z.number().int().min(1).max(25), total: z.number().int().min(0).max(32), nextCursor: z.string().nullable() }).strict(),
}).strict().superRefine((response, ctx) => {
  if (response.entries.some(entry => (entry.coverage === 'unavailable') !== (entry.storedRecords === null))) ctx.addIssue({ code: 'custom', message: 'Un fallo sin datos no acredita cero registros' });
  if (response.page.offset + response.entries.length > response.page.total) ctx.addIssue({ code: 'custom', message: 'Paginación incoherente' });
});
export type SourceHistoryResponse = z.infer<typeof sourceHistoryResponse>;
