import { z } from 'zod';
import { commitmentDecisionRequest, commitmentId, commitmentRevision } from './commitments.js';
import { rehearsalRecord } from './operational-rehearsal.js';

// CONTRATO DE API DE «ENSAYAR MI SEMANA» (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). Propuesto; lo sirve server/operational-rehearsal-mount.ts y lo valida el cliente.
// Todo es ficción (`mode: 'fiction'`) y va ligado al pin de la copia activa (`contextRevision`), como el Radar. Las respuestas de ensayo son vistas calculadas:
// llevan nombres legibles además de ids, para que la interfaz no tenga que conocer el modelo. Ninguna ruta escribe en proveedores.
//   GET  {path}?contextRevision&commitmentId      lectura: diagnóstico del plan declarado, catálogos y ensayos guardados. No escribe.
//   POST {path}/analyze                           ensaya perturbaciones y compara respuestas. No escribe.
//   POST {path}/check-first                       qué dato conviene comprobar antes. No escribe.
//   POST {path}/rehearsals                        guarda un ensayo (idempotente por id).
//   GET  {path}/rehearsals/:id?contextRevision    reabre un ensayo contra la revisión vigente. No recalcula ni escribe.
//   POST {path}/rehearsals/:id/choose             elige (o retira) una alternativa.
//   POST {path}/rehearsals/:id/decision-draft     prepara UNA decisión `assign` del contrato de compromisos y guarda esa PREPARACIÓN (ensayo, alternativa, clave y valores).
//                                                 No envía nada, no crea ninguna decisión y no toca registros del CRM.
//   POST {path}/rehearsals/:id/link               anota la decisión que el Radar ya aceptó SOLO si coincide con una preparación de este ensayo: misma clave, misma revisión
//                                                 y mismos valores. La alternativa atribuida es la que se preparó, aunque la elección haya cambiado después.

export const rehearsalApiPath = '/api/v7/operational-rehearsal';
export const rehearsalErrorCodes = ['REHEARSAL_CONTEXT_CHANGED', 'REHEARSAL_RADAR_REQUIRED', 'REHEARSAL_COMMITMENT_NOT_LINKED', 'REHEARSAL_NOT_FOUND', 'REHEARSAL_STALE',
  'REHEARSAL_NOT_CONFIRMABLE', 'REHEARSAL_ID_REUSED', 'REHEARSAL_DECISION_NOT_FOUND', 'REHEARSAL_INVALID', 'REHEARSAL_CANCELLED', 'REHEARSAL_STORAGE'] as const;

const instant = z.iso.datetime(), text = z.string().max(240), id = z.string().min(1).max(160);
const projection = z.enum(['on-time', 'late', 'not-completed', 'indeterminate']);
const optimality = z.enum(['proven-within-model', 'best-found']);
const context = { mode: z.literal('fiction'), contextRevision: commitmentRevision };

const held = z.object({ code: z.string().max(40), name: text.nullable() }).strict();
const step = z.object({ jobId: id, title: text, resource: text.nullable(), status: z.string().max(40), startAt: instant.nullable(), finishAt: instant.nullable(), waitedForCapacity: z.boolean(), held: z.array(held).max(12) }).strict();
const diagnosis = z.object({
  projection, dueAt: instant, completionAt: instant.nullable(), latenessMinutes: z.number().int().nullable(),
  steps: z.array(step).max(16),
  evidence: z.array(z.object({ subject: text, field: z.string().max(40), basis: z.enum(['observed', 'declared', 'assumed']), origin: text }).strict()).max(40),
  caveats: z.array(z.object({ code: z.string().max(40), subject: text }).strict()).max(40),
  offTime: z.array(z.object({ commitmentId: id, title: text, projection }).strict()).max(64),
}).strict();
const catalog = z.object({ id, label: text, detail: text }).strict();
const savedSummary = z.object({ id: z.uuid(), createdAt: instant, state: z.enum(['current', 'historical']), status: z.enum(['simulation-only', 'decision-recorded']), chosen: text.nullable() }).strict();

export const rehearsalOverview = z.object({
  format: z.literal('planb-operational-rehearsal-overview-v1'), ...context,
  status: z.enum(['available', 'radar-not-ready', 'commitment-not-linked']),
  modelRevision: commitmentRevision.nullable(),
  week: z.object({ now: instant, horizonEnd: instant, timeZone: z.string().max(64) }).strict().nullable(),
  counts: z.object({ installations: z.number().int(), technicians: z.number().int(), warehouses: z.number().int(), orders: z.number().int(), tickets: z.number().int() }).strict().nullable(),
  focus: z.object({ commitmentId, title: text, dueAt: instant, commitmentRevision, closed: z.boolean() }).strict().nullable(),
  rival: z.object({ commitmentId: id, title: text }).strict().nullable(),
  diagnosis: diagnosis.nullable(),
  // Fuentes del Radar para este compromiso: estado de lectura y efecto en el ensayo. Lo ilegible deja el dato desconocido; no se rellena.
  sources: z.array(z.object({
    role: z.enum(['sale', 'delivery', 'support']), state: z.enum(['observed', 'partial', 'stale', 'unavailable', 'missing', 'ambiguous']), origin: text.nullable(), observedAt: instant.nullable(),
    condition: z.enum(['clear', 'blocked', 'completed']).nullable(), effect: z.enum(['not-used', 'estimated-date', 'available-now', 'unknown-material', 'ticket-open', 'ticket-resolved', 'unknown-ticket']),
  }).strict()).max(3),
  perturbations: z.array(catalog).max(16), options: z.array(catalog).max(6),
  hypotheses: z.array(z.object({ id, question: text, values: z.array(z.union([z.string(), z.number()])).min(2).max(4) }).strict()).max(8),
  rehearsals: z.array(savedSummary).max(30),
}).strict();

const timeline = z.object({ resourceId: id, resource: text, jobs: z.array(z.object({ jobId: id, title: text, startAt: instant, finishAt: instant, focus: z.boolean() }).strict()).max(64) }).strict();
const alternative = z.object({
  id, optionIds: z.array(id).max(6), label: text, detail: text, authorization: z.literal('unconfirmed'),
  costs: z.object({ extraCapacityMinutes: z.number().int(), renegotiatedDates: z.number().int(), alternativeMaterials: z.number().int(), splits: z.number().int() }).strict(),
  focus: z.object({ projection, completionAt: instant.nullable(), dueAt: instant }).strict(),
  missed: z.number().int(), indeterminate: z.number().int(), optimality,
  deltas: z.array(z.object({ commitmentId: id, title: text, before: projection, after: projection, effect: z.enum(['improves', 'worsens', 'unknown']), deltaMinutes: z.number().int().nullable() }).strict()).max(64),
  timeline: z.array(timeline).max(12),
}).strict();
export const rehearsalAnalysis = z.object({
  format: z.literal('planb-operational-rehearsal-analysis-v1'), ...context, kind: z.literal('proposal'), hypothetical: z.literal(true),
  modelRevision: commitmentRevision, engineVersion: text, scenario: z.array(id).max(16), priority: z.enum(['focus', 'rival']),
  diagnosis,
  conflict: z.object({
    verdict: z.enum(['conflict', 'fits-with-everything', 'no-small-conflict', 'indeterminate']),
    minimality: z.enum(['verified-irreducible', 'explanatory']).nullable(), scope: z.literal('examined-commitments-only'),
    commitments: z.array(z.object({ commitmentId: id, title: text, dueAt: instant, neededDueAt: instant.nullable() }).strict()).max(8),
    resources: z.array(text).max(12), materials: z.array(text).max(12), examined: z.array(text).max(8),
    missingData: z.array(held).max(16),
  }).strict(),
  alternatives: z.array(alternative).max(8),
  discarded: z.array(z.object({ label: text, reason: z.enum(['dominated', 'no-better-plan-found', 'incompatible']) }).strict()).max(8),
  optimality,
}).strict();

export const rehearsalCheckFirst = z.object({
  format: z.literal('planb-operational-rehearsal-check-first-v1'), ...context, kind: z.literal('proposal'), hypothetical: z.literal(true),
  modelRevision: commitmentRevision, method: z.literal('one-at-a-time'), probabilities: z.literal('none'), mostDecisive: id.nullable(), optimality,
  ranking: z.array(z.object({
    hypothesisId: id, question: text, decisionChanges: z.boolean(), viabilityFlips: z.number().int(),
    byValue: z.array(z.object({ value: z.union([z.string(), z.number()]), best: z.array(text).max(8), focus: z.array(z.object({ label: text, projection: projection.nullable() }).strict()).max(8) }).strict()).max(4),
  }).strict()).max(8),
}).strict();

export const rehearsalView = z.object({
  format: z.literal('planb-operational-rehearsal-view-v1'), ...context,
  state: z.enum(['current', 'historical']), reasons: z.array(z.enum(['base-revision-changed', 'commitment-revision-changed', 'commitment-missing', 'engine-version-changed'])).max(4),
  canConfirm: z.boolean(), status: z.enum(['simulation-only', 'decision-recorded']), record: rehearsalRecord,
  labels: z.record(z.string(), text),
  // Decisiones PREPARADAS desde este ensayo que todavía no constan como registradas: la interfaz puede comprobar si el Radar llegó a aceptarlas, sin volver a decidir.
  pending: z.array(z.object({ operationId: z.uuid(), alternativeId: text, label: text }).strict()).max(8),
  // Lo que se preparó para la decisión registrada: prueba de a qué alternativa y con qué valores corresponde.
  decisionDetail: z.object({ alternativeId: text, label: text, owner: text, nextStep: z.string().max(400), dueAt: instant }).strict().nullable(),
}).strict();
export const rehearsalDecisionDraft = z.object({ format: z.literal('planb-operational-rehearsal-decision-draft-v1'), ...context, commitmentId, request: commitmentDecisionRequest }).strict();

// Peticiones
const scenarioInput = { contextRevision: commitmentRevision, commitmentId, perturbationIds: z.array(commitmentId).max(16), priority: z.enum(['focus', 'rival']) };
export const rehearsalAnalyzeRequest = z.object(scenarioInput).strict();
export const rehearsalSaveRequest = z.object({ ...scenarioInput, id: z.uuid() }).strict();
export const rehearsalChooseRequest = z.object({ contextRevision: commitmentRevision, alternativeId: text.nullable() }).strict();
export const rehearsalDraftRequest = z.object({
  contextRevision: commitmentRevision, operationId: z.uuid(), owner: z.string().trim().min(1).max(160), nextStep: z.string().trim().min(1).max(400), dueAt: instant,
}).strict();
export const rehearsalLinkRequest = z.object({ contextRevision: commitmentRevision, operationId: z.uuid() }).strict();

export type RehearsalOverview = z.infer<typeof rehearsalOverview>;
export type RehearsalAnalysis = z.infer<typeof rehearsalAnalysis>;
export type RehearsalDiagnosis = z.infer<typeof diagnosis>;
export type RehearsalAlternative = z.infer<typeof alternative>;
export type RehearsalCheckFirst = z.infer<typeof rehearsalCheckFirst>;
export type RehearsalView = z.infer<typeof rehearsalView>;
export type RehearsalDecisionDraft = z.infer<typeof rehearsalDecisionDraft>;
