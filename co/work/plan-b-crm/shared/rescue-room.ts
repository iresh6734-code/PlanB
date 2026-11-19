import { z } from 'zod';
// Modo Rescate (CLAUDE-RESCUE-106): contratos, contexto e invariantes del incidente. Sin red ni acceso a disco.
// Es una sala de ENSAYO con datos ficticios: nada de aquí describe disponibilidad, protección de otro equipo ni RTO.
export const RESCUE_FORMAT = 'planb-rescue-room-v1';
export const MAX_JOURNAL_EVENTS = 5000, MAX_EVENTS_PER_RUN = 2; // política de capacidad: se rechaza ANTES de producir efectos cuando no cabría el recibo de la próxima operación
export const MAX_ESTIMATE_MINUTES = 480, MIN_ESTIMATE_MINUTES = 5, MAX_NOTE_CHARS = 2000, MAX_JSON_BYTES = 2_000_000;
export const BUDGET_PRESETS = [30, 60, 120] as const;

export const stages = ['preparation', 'local-work', 'return-review', 'return-partial', 'return-verified', 'closed'] as const;
export type RescueStage = typeof stages[number];
export const STAGE_LABEL: Record<RescueStage, string> = {
  preparation: 'Preparando el plan', 'local-work': 'Trabajo local', 'return-review': 'Retorno en revisión',
  'return-partial': 'Resultado parcial o incierto', 'return-verified': 'Devolución simulada verificada', closed: 'Ensayo cerrado',
};
// Un solo camino permitido entre estados: «Ensayo cerrado» no significa «negocio recuperado».
const allowed: Record<RescueStage, RescueStage[]> = {
  preparation: ['local-work', 'closed'],
  'local-work': ['return-review', 'closed'],
  'return-review': ['return-partial', 'return-verified', 'closed'],
  'return-partial': ['return-review', 'return-partial', 'return-verified', 'closed'],
  'return-verified': ['closed'],
  closed: [],
};
export const canTransition = (from: RescueStage, to: RescueStage) => (from === to && from !== 'closed') || allowed[from].includes(to);
export class RescueError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); this.name = 'RescueError'; }
}
export function assertTransition(from: RescueStage, to: RescueStage) {
  if (!canTransition(from, to)) throw new RescueError(409, 'STAGE_TRANSITION', 'No se puede pasar de «' + STAGE_LABEL[from] + '» a «' + STAGE_LABEL[to] + '».');
}

export const ContextSchema = z.object({
  workspaceId: z.string().min(8).max(80), accountId: z.string().min(1).max(120),
  captureId: z.string().min(1).max(200), captureRevision: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type RescueContext = z.infer<typeof ContextSchema>;
export const sameContext = (a: RescueContext, b: RescueContext) => a.workspaceId === b.workspaceId && a.accountId === b.accountId && a.captureId === b.captureId && a.captureRevision === b.captureRevision;

export const StateSchema = z.object({
  format: z.literal(RESCUE_FORMAT), version: z.number().int().min(1), incidentId: z.string().min(8).max(80),
  context: ContextSchema, stage: z.enum(stages), openedAt: z.string(), incidentStartedAt: z.string(), incidentHours: z.number().int().min(1).max(720),
  horizonHours: z.number().int().min(1).max(720), budgetMinutes: z.number().int().min(1).max(MAX_ESTIMATE_MINUTES).nullable(),
  estimates: z.record(z.string(), z.number().int().min(MIN_ESTIMATE_MINUTES).max(MAX_ESTIMATE_MINUTES)),
  notes: z.record(z.string(), z.string().max(MAX_NOTE_CHARS)), blocked: z.record(z.string(), z.string().max(300)),
  selectedTaskId: z.string().nullable(), crmOnline: z.boolean(), faults: z.object({ lostAck: z.boolean() }).strict(),
  returnPlanId: z.string().nullable(), closedAt: z.string().nullable(), closeNote: z.string().max(500),
  // Solo en salas creadas desde una cápsula (Kit de Relevo): identidades de origen cuyo diario e idempotencia se conservan como historia, sin atribuirlas a esta sala.
  lineage: z.object({ origins: z.array(z.string().min(8).max(80)).min(1).max(16), importedAt: z.string(), capsuleRevision: z.string().regex(/^[0-9a-f]{64}$/) }).strict().optional(),
}).strict();
export type RescueState = z.infer<typeof StateSchema>;

export const actors = ['operator', 'simulator', 'system'] as const;
export const eventKinds = ['incident-opened', 'plan-chosen', 'estimate-set', 'estimates-loaded', 'note-saved', 'blocker-declared', 'local-edit', 'local-create', 'crm-returned', 'fault-armed',
  'return-prepared', 'decision-recorded', 'return-approved', 'apply-attempted', 'uncertain-resolved', 'return-refreshed', 'closed', 'capsule-imported'] as const;
export const EventSchema = z.object({
  seq: z.number().int().min(1), id: z.string().min(8).max(80), at: z.string(), actor: z.enum(actors), kind: z.enum(eventKinds),
  stateVersion: z.number().int().min(1), workspaceId: z.string(), captureRevision: z.string(), summary: z.string().max(600), data: z.record(z.string(), z.unknown()),
}).strict();
export type RescueEvent = z.infer<typeof EventSchema>;
export const JournalSchema = z.array(EventSchema).max(MAX_JOURNAL_EVENTS);

// Acuse persistido de cada mutación: distingue «no aplicada», «guardada» e «incierta».
export type MutationOutcome = 'not-applied' | 'saved' | 'uncertain';
export const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._:-]{8,100}$/);
export const MutationEnvelope = z.object({
  idempotencyKey: IdempotencyKeySchema, expectedVersion: z.number().int().min(1), context: ContextSchema,
});
export const budgetSchema = z.number().int().min(1).max(MAX_ESTIMATE_MINUTES);
const fieldValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
export const Requests = {
  choosePlan: MutationEnvelope.extend({ budgetMinutes: budgetSchema }).strict(),
  setEstimate: MutationEnvelope.extend({ taskId: z.string().min(1).max(200), minutes: z.number().int().min(MIN_ESTIMATE_MINUTES).max(MAX_ESTIMATE_MINUTES).nullable() }).strict(),
  saveNote: MutationEnvelope.extend({ taskId: z.string().min(1).max(200), text: z.string().max(MAX_NOTE_CHARS) }).strict(),
  declareBlocker: MutationEnvelope.extend({ taskId: z.string().min(1).max(200), reason: z.string().max(300) }).strict(),
  select: MutationEnvelope.extend({ taskId: z.string().min(1).max(200).nullable() }).strict(),
  editTask: MutationEnvelope.extend({ taskId: z.string().min(1).max(200), values: z.record(z.string(), fieldValue).refine(v => Object.keys(v).length >= 1 && Object.keys(v).length <= 6, 'Entre 1 y 6 campos.') }).strict(),
  createTask: MutationEnvelope.extend({ values: z.record(z.string(), fieldValue).refine(v => Object.keys(v).length >= 1 && Object.keys(v).length <= 8, 'Entre 1 y 8 campos.') }).strict(),
  loadScriptEstimates: MutationEnvelope.strict(),
  crmReturn: MutationEnvelope.strict(), prepareReturn: MutationEnvelope.strict(), refreshReturn: MutationEnvelope.strict(),
  armLostAck: MutationEnvelope.extend({ armed: z.boolean() }).strict(),
  decide: MutationEnvelope.extend({ planId: z.string().min(1).max(100), decisions: z.array(z.object({ operationId: z.string().min(1).max(100), field: z.string().min(1).max(100), decision: z.enum(['local', 'remote']) }).strict()).min(1).max(200) }).strict(),
  approve: MutationEnvelope.extend({ planId: z.string().min(1).max(100) }).strict(),
  apply: MutationEnvelope.extend({ planId: z.string().min(1).max(100) }).strict(),
  resolve: MutationEnvelope.extend({ planId: z.string().min(1).max(100), operationId: z.string().min(1).max(100), remoteId: z.string().min(1).max(200) }).strict(),
  close: MutationEnvelope.extend({ note: z.string().max(500) }).strict(),
};
export const isFieldValue = (value: unknown): value is string | number | boolean | null =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);
