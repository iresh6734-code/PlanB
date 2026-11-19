import { z } from 'zod';
import { commitmentRevision } from './commitments.js';

// CONTRATO HTTP PROPUESTO de «Revisar una decisión» (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). planb-date-check-review-api-v1. Solo ficción y con copia de ensayo activa.
// Lee la decisión por la ruta pública de Comprobar una fecha. Ver una revisión NO escribe ni recalcula. Registrar un desenlace escribe UNO por decisión, idempotente por clave.

export const reviewApiPath = '/api/v7/date-check-review';
const pin = commitmentRevision;
const at = z.iso.datetime();
const text = z.string().trim().min(1).max(400);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const outcome = z.enum(['meets', 'misses', 'unknown']);

export const reviewObservation = z.object({
  id: text, kind: z.enum(['arrival', 'slot', 'finish']), subject: text, happenedAt: at.nullable(), worked: z.boolean().optional(),
  reference: text, recordedAt: at, scope: z.enum(['complete', 'partial']),
}).strict();
export const decisionReview = z.object({
  format: z.literal('planb-date-check-review-v1'), engineVersion: text, inputRevision: revision, requestedAt: at, offeredAt: at.nullable(),
  planned: z.object({ alternativeId: text, finishAt: at.nullable(), outcome }).strict(),
  conditions: z.array(z.object({
    offerId: text, type: z.enum(['confirm-arrival', 'add-slot', 'use-reserved', 'substitute']), label: text,
    assumed: z.object({ at: at.nullable(), start: at.nullable(), end: at.nullable() }).strict(),
    observation: reviewObservation.nullable(), status: z.enum(['held', 'later', 'not-happened', 'unobserved', 'not-observable']), differenceMinutes: z.number().int().nullable(),
  }).strict()).max(4),
  counterfactual: z.object({ alternativeId: text, finishAt: at.nullable(), outcome, usedObservations: z.array(text).max(8), proven: z.boolean() }).strict().nullable(),
  observed: z.object({ finishAt: at.nullable(), met: z.boolean().nullable(), observation: reviewObservation.nullable() }).strict(),
  attribution: z.object({ delayMinutes: z.number().int().nullable(), explainedMinutes: z.number().int().nullable(), residualMinutes: z.number().int().nullable(), explainedBy: z.array(text).max(4), partialEvidence: z.boolean() }).strict(),
  verdict: z.enum(['pending', 'met-as-offered', 'met-differently', 'missed']),
}).strict();
export type DecisionReviewView = z.infer<typeof decisionReview>;

export const reviewView = z.object({
  format: z.literal('planb-date-check-review-view-v1'), mode: z.literal('fiction'), contextRevision: pin,
  checkId: z.uuid(), title: text,
  decision: z.object({
    alternativeId: text, alternativeLabel: text, owner: text, nextStep: text, dueAt: at, confirmedAt: at, inputRevision: revision,
    promised: z.object({ requestedAt: at, outcome, supportedAt: at.nullable(), conditions: z.array(text).max(8) }).strict(),
  }).strict(),
  state: z.enum(['pending', 'recorded']), recordedAt: at.nullable(), ending: z.enum(['met', 'supplier-late']).nullable(),
  endings: z.array(z.object({ id: z.enum(['met', 'supplier-late']), label: text, available: z.boolean() }).strict()).max(4),
  observations: z.array(reviewObservation).max(12),
  review: decisionReview.nullable(),
}).strict();
export type ReviewView = z.infer<typeof reviewView>;

export const reviewList = z.object({
  format: z.literal('planb-date-check-review-list-v1'), contextRevision: pin,
  items: z.array(z.object({ checkId: z.uuid(), title: text, requestedAt: at, recorded: z.boolean(), verdict: z.enum(['pending', 'met-as-offered', 'met-differently', 'missed']).nullable() }).strict()).max(30),
}).strict();
export type ReviewList = z.infer<typeof reviewList>;

export const reviewRecordRequest = z.object({ contextRevision: pin, ending: z.enum(['met', 'supplier-late']), operationId: z.uuid() }).strict();
