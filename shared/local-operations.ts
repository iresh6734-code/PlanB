import { z } from 'zod';

export const LocalReviewRequestSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
}).strict();
const count = z.number().int().min(0).max(10_000);
export const LocalReviewSchema = z.object({
  id: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/),
  at: z.string().datetime(), tasks: count, overdue: count, needsReview: count,
  stale: z.boolean(),
}).strict();
export const LocalOperationsSchema = z.object({
  format: z.literal('planb-local-operations-v1'),
  revision: z.string().regex(/^[a-f0-9]{64}$/), evaluatedAt: z.string().datetime(),
  context: z.object({
    instanceId: z.string().uuid(), phase: z.enum(['empty', 'imported', 'active']),
    name: z.string().max(500), captureId: z.string().max(500).nullable(),
    capturedAt: z.string().nullable(), isTestData: z.boolean().nullable(),
  }).strict(),
  reviewable: z.boolean(), unavailableReason: z.string().max(1000).nullable(),
  counts: z.object({
    records: count, tasks: count, completed: count, open: count, unknownStatus: count,
    overdue: count, upcoming: count, needsReview: count, queued: count, returned: count,
  }).strict().nullable(),
  tasks: z.array(z.object({
    id: z.string().min(1).max(1000), label: z.string().max(500),
    bucket: z.enum(['overdue', 'due-in-window', 'needs-review', 'later']),
    due: z.string().max(100).nullable(), dueKind: z.enum(['date', 'instant', 'missing', 'invalid']),
    reasons: z.array(z.string().max(1000)).max(20), nextAction: z.string().max(1000),
  }).strict()).max(200),
  limitations: z.array(z.string().max(1000)).max(30),
  lastReview: LocalReviewSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.counts && (value.tasks.length !== value.counts.returned || value.counts.returned > value.counts.queued))
    ctx.addIssue({ code: 'custom', message: 'La lista no coincide con sus recuentos.' });
  if (value.reviewable && (!value.counts || value.context.phase === 'empty'))
    ctx.addIssue({ code: 'custom', message: 'No hay copia que revisar.' });
});
export const LocalReviewResponseSchema = z.object({
  ok: z.literal(true), replayed: z.boolean(), review: LocalReviewSchema,
}).strict();
export type LocalOperations = z.infer<typeof LocalOperationsSchema>;
export type LocalReview = z.infer<typeof LocalReviewSchema>;

// ── Cola de trabajo estructurada (unidad 230, R2) ─────────────────────────────────────────────────────────────────────────────────────
// Recurso ADITIVO: el v1 de arriba no cambia (un cliente anterior con esquema estricto sigue funcionando). Aquí viajan datos ESTRUCTURADOS con la procedencia de la cola real
// (`buildResponseQueue`): estado de la tarea, referencias y la identidad completa de la copia. Los textos de presentación (siguiente acción, detalles) son de la interfaz.
// Distingue CERO (recuento exacto 0), DESCONOCIDO (`status: 'unknown'`, referencia `not-captured`) y copia SIN captura (`counts: null`, `identity: null`).
//
// Límites del contrato (el servidor los cumple y el cliente los puede leer; una lista parcial NUNCA acredita el total):
//  - Tareas: como mucho WORK_QUEUE_TASK_LIMIT por página, en orden de prioridad (un prefijo de la cola completa).
//  - Referencias por tarea: como mucho WORK_QUEUE_REFERENCE_LIMIT. Si hay más, se conservan SIEMPRE las no comprobadas (missing / not-captured) y se completa con las encontradas, sin tocar
//    ningún identificador; `referenceCoverage` da el total y los recuentos por estado de TODAS las asociaciones, y `omitted` cuántas no viajan.
//  - Cuerpo: el servidor mide los bytes UTF-8 reales del JSON y no supera WORK_QUEUE_BYTE_BUDGET; el cliente acepta hasta WORK_QUEUE_CLIENT_MAX_BYTES. Si una página no cabe, se devuelve el prefijo
//    más largo que cabe y `page.omittedByBytes` lo cuenta (distinto de `page.omittedByLimit`, el recorte por número de tareas). Una fila que SOLA no cabe (`page.omittedOversize`) se omite entera y las
//    siguientes siguen: nunca se trunca un ID. Si la IDENTIDAD de la copia no cabe en el presupuesto, el servidor responde con un error claro (decisión de producto pendiente: ver informe).
export const WORK_QUEUE_TASK_LIMIT = 200;
export const WORK_QUEUE_REFERENCE_LIMIT = 50;
export const WORK_QUEUE_BYTE_BUDGET = 900_000;
export const WORK_QUEUE_CLIENT_MAX_BYTES = 1_000_000;
/**
 * Los IDs de registro, de captura y de cuenta que admite la IMPORTACIÓN no tienen más tope que «no vacío» (`RecordSchema`, `SnapshotSchema`): un tope propio de 1.000 hacía ilegible toda la cola por UN ID
 * válido. Aquí solo los acota el presupuesto de la respuesta (en unidades UTF-16 una cadena no puede pesar menos bytes que unidades): ninguna fila ni identidad se trunca; lo que no cabe se OMITE y se cuenta.
 */
const identifier = z.string().min(1).max(WORK_QUEUE_BYTE_BUDGET);
export const WorkReferenceSchema = z.object({
  field: z.string().min(1).max(200), entity: z.string().min(1).max(100), id: identifier, label: z.string().max(500).nullable(),
  /** found = el registro está en la copia; missing = la copia captura esa entidad y el registro no está; not-captured = la copia NO captura esa entidad (no se puede comprobar). */
  state: z.enum(['found', 'missing', 'not-captured']),
}).strict();
/** Cobertura de TODAS las asociaciones de la tarea, incluidas las que no viajan en `references`. `total === 0` es «sin asociaciones», no «recortado». */
export const WorkReferenceCoverageSchema = z.object({
  total: count, returned: count, omitted: count, found: count, missing: count, notCaptured: count,
}).strict().superRefine((value, ctx) => {
  if (value.returned + value.omitted !== value.total) ctx.addIssue({ code: 'custom', message: 'La cobertura de referencias no suma su total.' });
  if (value.found + value.missing + value.notCaptured !== value.total) ctx.addIssue({ code: 'custom', message: 'Los estados de las referencias no suman su total.' });
});
const distinct = (values: readonly string[]) => new Set(values).size === values.length;
export const WorkTaskSchema = z.object({
  id: identifier, label: z.string().max(500), bucket: z.enum(['overdue', 'due-in-window', 'needs-review', 'later']),
  status: z.enum(['open', 'unknown']),
  due: z.object({ kind: z.enum(['date', 'instant', 'missing', 'invalid']), value: z.string().max(100).nullable(), localDate: z.string().max(20).nullable() }).strict(),
  references: z.array(WorkReferenceSchema).max(WORK_QUEUE_REFERENCE_LIMIT), referenceCoverage: WorkReferenceCoverageSchema,
  /** Códigos DISTINTOS (una tarea con varias asociaciones ausentes tiene un solo «missing-reference»; cuántas, en `referenceCoverage.missing`). */
  reasonCodes: z.array(z.string().min(1).max(100)).max(20),
}).strict().superRefine((value, ctx) => {
  const coverage = value.referenceCoverage;
  if (value.references.length !== coverage.returned) ctx.addIssue({ code: 'custom', message: 'Las referencias devueltas no coinciden con su cobertura.' });
  for (const [state, total] of [['found', coverage.found], ['missing', coverage.missing], ['not-captured', coverage.notCaptured]] as const)
    if (value.references.filter(reference => reference.state === state).length > total) ctx.addIssue({ code: 'custom', message: 'Hay más referencias devueltas que las contadas.' });
  if (coverage.omitted > 0 && value.references.length !== WORK_QUEUE_REFERENCE_LIMIT) ctx.addIssue({ code: 'custom', message: 'Un recorte de referencias exige llegar a su límite.' });
  if (value.references.length && !distinct(value.references.map(reference => reference.field + '\u0000' + reference.id))) ctx.addIssue({ code: 'custom', message: 'Referencia repetida.' });
  if (!distinct(value.reasonCodes)) ctx.addIssue({ code: 'custom', message: 'Motivos repetidos.' });
});
export const WorkIdentitySchema = z.object({
  instanceId: z.string().uuid(), snapshotId: identifier, capturedAt: z.string().max(100), captureStartedAt: z.string().max(100).nullable(),
  accountId: z.string().max(WORK_QUEUE_BYTE_BUDGET).nullable(), generatedAt: z.string().max(100).nullable(),
}).strict();
/** Alcance de la página: qué límites se aplicaron y cuántas tareas dejó fuera cada uno. `notReturned` de los recuentos es siempre su suma. */
export const WorkPageSchema = z.object({
  taskLimit: z.literal(WORK_QUEUE_TASK_LIMIT), referenceLimit: z.literal(WORK_QUEUE_REFERENCE_LIMIT), byteBudget: z.number().int().min(1_000).max(WORK_QUEUE_CLIENT_MAX_BYTES),
  omittedByLimit: count, omittedByBytes: count,
  /** Subconjunto de `omittedByBytes`: filas que, SOLAS, no caben en el presupuesto (p. ej. un ID enorme). Se omiten enteras; ninguna se trunca ni se sustituye por otra. */
  omittedOversize: count,
}).strict().superRefine((value, ctx) => {
  if (value.omittedOversize > value.omittedByBytes) ctx.addIssue({ code: 'custom', message: 'Las filas demasiado grandes no pueden superar las omitidas por bytes.' });
});
export const LocalWorkQueueSchema = z.object({
  format: z.literal('planb-local-work-queue-v1'), evaluatedAt: z.string().datetime(), horizonHours: z.literal(24),
  phase: z.enum(['empty', 'imported', 'active']), identity: WorkIdentitySchema.nullable(),
  counts: z.object({ tasks: count, completed: count, knownOpen: count, unknownStatus: count, queued: count, returned: count, notReturned: count }).strict().nullable(),
  page: WorkPageSchema,
  tasks: z.array(WorkTaskSchema).max(WORK_QUEUE_TASK_LIMIT), limitations: z.array(z.string().max(1000)).max(30),
}).strict().superRefine((value, ctx) => {
  const { counts, identity, phase, tasks, page } = value;
  if (phase === 'empty') {
    if (identity || counts || tasks.length || page.omittedByLimit || page.omittedByBytes || page.omittedOversize) ctx.addIssue({ code: 'custom', message: 'Una copia vacía no tiene identidad, recuentos ni tareas.' });
    return;
  }
  if (!identity || !counts) { ctx.addIssue({ code: 'custom', message: 'Una copia importada o activa exige identidad y recuentos.' }); return; }
  if (tasks.length !== counts.returned || counts.returned + counts.notReturned !== counts.queued)
    ctx.addIssue({ code: 'custom', message: 'La lista no coincide con sus recuentos.' });
  if (counts.tasks !== counts.completed + counts.knownOpen + counts.unknownStatus || counts.queued !== counts.knownOpen + counts.unknownStatus)
    ctx.addIssue({ code: 'custom', message: 'Los recuentos de tareas no son coherentes.' });
  if (counts.notReturned !== page.omittedByLimit + page.omittedByBytes) ctx.addIssue({ code: 'custom', message: 'Las tareas no devueltas no coinciden con sus motivos.' });
  if (!distinct(tasks.map(task => task.id))) ctx.addIssue({ code: 'custom', message: 'Tarea repetida en la lista.' });
  if (tasks.filter(task => task.status === 'open').length > counts.knownOpen || tasks.filter(task => task.status === 'unknown').length > counts.unknownStatus)
    ctx.addIssue({ code: 'custom', message: 'La lista contiene más tareas de un estado que las contadas.' });
});
export type LocalWorkQueue = z.infer<typeof LocalWorkQueueSchema>;
export type WorkTask = z.infer<typeof WorkTaskSchema>;
