import { z } from 'zod';
import { RecordSchema } from './model.js';
import { TaskRevisionResult, TaskRevisionWrite } from './task-revision.js';

export const TASK_INTENTS_PATH = '/api/v7/task-intents';
export const TASK_INTENT_REQUEST_BYTES = 256 * 1024;
export const TASK_INTENT_RESPONSE_BYTES = 512 * 1024;

const revision = z.string().regex(/^[a-f0-9]{64}$/);
const taskId = z.string().min(1).max(500);
const date = z.iso.datetime();
const sequence = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const fieldValue = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

/** The transport also bounds bytes while reading, before JSON parsing. */
export function taskIntentJsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? new TextEncoder().encode(json).byteLength : Infinity;
  } catch {
    return Infinity;
  }
}

export const TaskIntentIdentity = z.object({
  instanceId: z.string().uuid(),
  snapshotId: z.string().min(1).max(500),
  capturedAt: date,
  captureStartedAt: date.nullable(),
  accountId: z.string().max(500).nullable(),
  generatedAt: date,
}).strict();

export const TaskIntentScope = z.object({
  identity: TaskIntentIdentity,
  contextRevision: revision,
}).strict();

export const TaskIntentExecute = TaskIntentScope.extend({
  attemptId: z.string().uuid(),
  taskId,
  expectedRevision: TaskRevisionWrite.shape.expectedRevision,
  values: TaskRevisionWrite.shape.values,
}).refine(value => taskIntentJsonBytes(value) <= TASK_INTENT_REQUEST_BYTES, 'La petición supera el límite de bytes');

export const TaskIntentSummary = z.object({
  attemptId: z.string().uuid(),
  taskId,
  scope: TaskIntentScope,
  seq: sequence,
  phase: z.enum(['attempt', 'settled']),
  outcome: z.enum(['acknowledged', 'rejected', 'not-sent', 'accepted-read', 'abandoned']).nullable(),
  provenance: z.enum(['server-ack', 'person-accepted-read']).nullable(),
  createdAt: date,
  updatedAt: date,
  detailAvailable: z.boolean(),
  acknowledgement: z.object({ changed: z.boolean(), resultingRevision: revision }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) bad('El desenlace precede al intento');
  if ((value.phase === 'settled') !== (value.outcome !== null)) bad('Fase y desenlace incompatibles');
  if (value.phase === 'attempt' && !value.detailAvailable) bad('Un intento pendiente conserva su detalle');
  const expected = value.outcome === 'acknowledged' ? 'server-ack'
    : value.outcome === 'accepted-read' ? 'person-accepted-read' : null;
  if (value.provenance !== expected) bad('La procedencia no corresponde al desenlace');
  if (value.acknowledgement !== null && value.outcome !== 'acknowledged') bad('Solo un acuse del servidor acredita una escritura');
});

export const TaskIntentExecution = z.object({
  format: z.literal('planb-task-intent-execution-v1'),
  created: z.boolean(),
  replayed: z.boolean(),
  operation: TaskIntentSummary,
  writeResult: TaskRevisionResult.nullable(),
  writeResultOmitted: z.enum(['response-too-large', 'not-retained']).nullable(),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.created === value.replayed) bad('La ejecución debe identificar alta o replay');
  if ((value.writeResult === null) !== (value.writeResultOmitted !== null)) bad('La omisión del resultado debe explicarse');
  if (value.writeResult) {
    const { current, changed } = value.writeResult;
    const { operation } = value;
    if (operation.outcome !== 'acknowledged') bad('El resultado de escritura exige un acuse persistido');
    if (current.record.id !== operation.taskId || current.instanceId !== operation.scope.identity.instanceId
      || current.captureId !== operation.scope.identity.snapshotId || current.capturedAt !== operation.scope.identity.capturedAt)
      bad('El resultado pertenece a otra tarea o copia');
    if (!operation.acknowledgement || operation.acknowledgement.changed !== changed
      || operation.acknowledgement.resultingRevision !== current.revision) bad('El resultado no coincide con el acuse compacto');
  }
  if (value.writeResultOmitted === 'response-too-large' && !value.operation.acknowledgement)
    bad('Omitir una escritura grande exige conservar su acuse compacto');
}).refine(value => taskIntentJsonBytes(value) <= TASK_INTENT_RESPONSE_BYTES, 'La respuesta supera el límite de bytes');

export const TaskIntentListQuery = TaskIntentScope.extend({
  limit: z.number().int().min(1).max(25).default(10),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional(),
});

export const TaskIntentList = z.object({
  format: z.literal('planb-task-intent-list-v1'),
  scope: TaskIntentScope,
  status: z.enum(['read', 'unavailable']),
  entries: z.array(TaskIntentSummary).max(25),
  quarantined: z.number().int().min(0).nullable(),
  otherContexts: z.number().int().min(0).nullable(),
  nextCursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).nullable(),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.status === 'unavailable' && (value.entries.length || value.quarantined !== null
    || value.otherContexts !== null || value.nextCursor !== null)) bad('Una lectura fallida conserva recuentos desconocidos');
  if (value.status === 'read' && (value.quarantined === null || value.otherContexts === null)) bad('La lectura debe declarar sus recuentos');
  const scope = JSON.stringify(value.scope);
  if (value.entries.some(entry => JSON.stringify(entry.scope) !== scope)) bad('La lista mezcla ámbitos');
  if (new Set(value.entries.map(entry => entry.attemptId)).size !== value.entries.length) bad('Hay intentos repetidos');
}).refine(value => taskIntentJsonBytes(value) <= TASK_INTENT_RESPONSE_BYTES, 'La respuesta supera el límite de bytes');

export const TaskIntentPayload = z.object({
  baseline: z.record(z.string(), fieldValue),
  values: TaskRevisionWrite.shape.values,
  expectedRevision: revision,
}).strict().refine(value => {
  const keys = Object.keys(value.values);
  return Object.keys(value.baseline).length === keys.length && keys.every(key => Object.hasOwn(value.baseline, key));
}, 'La base corresponde exactamente a los campos del parche');

export const TaskIntentDetail = z.object({
  format: z.literal('planb-task-intent-detail-v1'),
  operation: TaskIntentSummary,
  payload: TaskIntentPayload.nullable(),
  payloadIssue: z.enum(['detail-expired', 'response-too-large']).nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.payload === null) !== (value.payloadIssue !== null)) ctx.addIssue({ code: 'custom', message: 'La omisión de valores debe explicarse' });
  if ((!value.operation.detailAvailable) !== (value.payloadIssue === 'detail-expired')) ctx.addIssue({ code: 'custom', message: 'El estado del detalle no coincide' });
}).refine(value => taskIntentJsonBytes(value) <= TASK_INTENT_RESPONSE_BYTES, 'La respuesta supera el límite de bytes');

export const TaskIntentCheck = z.object({
  format: z.literal('planb-task-intent-check-v1'),
  operation: TaskIntentSummary,
  evidence: z.enum(['applied', 'unchanged', 'diverged', 'missing', 'unavailable']),
  readAt: date,
  taskRevision: revision.nullable(),
  record: RecordSchema.refine(record => record.entity === 'tasks').nullable(),
  reason: z.enum(['response-too-large', 'read-failed', 'task-missing', 'detail-expired']).nullable(),
}).strict().superRefine((value, ctx) => {
  const known = ['applied', 'unchanged', 'diverged'].includes(value.evidence);
  if (known && !value.operation.detailAvailable)
    ctx.addIssue({ code: 'custom', message: 'Comparar el intento exige conservar su base y parche' });
  if (value.reason === 'detail-expired' && value.operation.detailAvailable)
    ctx.addIssue({ code: 'custom', message: 'La causa de vencimiento contradice el detalle disponible' });
  if (known !== (value.record !== null && value.taskRevision !== null) || known && value.reason !== null)
    ctx.addIssue({ code: 'custom', message: 'La evidencia exige una lectura válida' });
  if (!known && (value.record !== null || value.taskRevision !== null || value.reason === null))
    ctx.addIssue({ code: 'custom', message: 'La lectura no disponible debe explicar su causa' });
  if (value.record && value.record.id !== value.operation.taskId) ctx.addIssue({ code: 'custom', message: 'La lectura es de otra tarea' });
  if ((value.evidence === 'missing') !== (value.reason === 'task-missing')) ctx.addIssue({ code: 'custom', message: 'La causa no corresponde a la evidencia' });
}).refine(value => taskIntentJsonBytes(value) <= TASK_INTENT_RESPONSE_BYTES, 'La respuesta supera el límite de bytes');

export const TaskIntentAccept = TaskIntentScope.extend({ expectedSeq: sequence, expectedTaskRevision: revision });
export const TaskIntentAbandon = TaskIntentScope.extend({ expectedSeq: sequence, confirmed: z.literal(true) });

export type TaskIntentIdentity = z.infer<typeof TaskIntentIdentity>;
export type TaskIntentScope = z.infer<typeof TaskIntentScope>;
export type TaskIntentExecute = z.infer<typeof TaskIntentExecute>;
export type TaskIntentSummary = z.infer<typeof TaskIntentSummary>;
export type TaskIntentExecution = z.infer<typeof TaskIntentExecution>;
export type TaskIntentList = z.infer<typeof TaskIntentList>;
export type TaskIntentDetail = z.infer<typeof TaskIntentDetail>;
export type TaskIntentCheck = z.infer<typeof TaskIntentCheck>;
