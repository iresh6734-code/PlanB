import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppSpecSchema, type AppSpec } from '../shared/model.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import { LocalOperationsSchema, LocalReviewRequestSchema, LocalReviewSchema, LocalWorkQueueSchema, WORK_QUEUE_BYTE_BUDGET, WORK_QUEUE_REFERENCE_LIMIT, WORK_QUEUE_TASK_LIMIT, type LocalOperations, type LocalWorkQueue } from '../shared/local-operations.js';
import { AppError, type Store } from './store.js';

const KEY = 'localOperations:reviews:v1';
const StoredReview = LocalReviewSchema.omit({ stale: true }).extend({ key: z.string().uuid(), instanceId: z.string().uuid() }).strict();
const History = z.array(StoredReview).max(100);
function history(store: Store) {
  try { return History.parse(store.get(KEY, [])); }
  catch { throw new AppError(409, 'No se puede validar el historial de revisiones locales. Se conserva sin modificar.'); }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Display metadata is bounded independently from the untouched captured identity/content.
function displayName(value: string, limit: number) {
  if (value.length <= limit) return value;
  let end = limit - 1;
  if (end > 0 && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
  return value.slice(0, end) + '…';
}

/** Reads captured/active rows, without requiring an AI specification to display imported work. */
export function inspectLocalOperations(store: Store, clock: () => number = Date.now): LocalOperations {
  const instanceId = z.string().uuid().safeParse(store.get('instanceId', null));
  if (!instanceId.success) throw new AppError(503, 'No se pudo identificar esta instalación.');
  const snapshot = store.snapshot, records = snapshot ? store.records() : [];
  const activeSpec = store.spec;
  const schema: AppSpec | null = activeSpec ?? (snapshot ? AppSpecSchema.parse({
    version: snapshot.version, title: displayName(snapshot.name, 100), description: '', entities: snapshot.entities,
    stages: snapshot.stages, rules: snapshot.rules,
    coverage: { supported: ['Campos de la captura importada, sin edición habilitada'], unsupported: snapshot.unsupported },
  }) : null);
  const revision = digest({ instanceId: instanceId.data, snapshot, spec: activeSpec, ready: store.ready, records });
  const evaluatedAt = clock();
  const queue = schema ? buildResponseQueue({ spec: schema, records, evaluatedAt, horizonHours: 24, limit: 200 }) : null;
  let saved: z.infer<typeof StoredReview> | undefined, historyError: string | null = null;
  try { saved = history(store).at(-1); }
  catch (error) { historyError = error instanceof Error ? error.message : 'No se pudo validar el historial local.'; }
  const invalidRecovery = store.recoveryIntegrity().state === 'invalid';
  const lastReview = saved && saved.instanceId === instanceId.data ? {
    id: saved.id, revision: saved.revision, at: saved.at, tasks: saved.tasks,
    overdue: saved.overdue, needsReview: saved.needsReview, stale: saved.revision !== revision,
  } : null;
  return LocalOperationsSchema.parse({
    format: 'planb-local-operations-v1', revision, evaluatedAt: new Date(evaluatedAt).toISOString(),
    context: { instanceId: instanceId.data, phase: !snapshot ? 'empty' : store.ready ? 'active' : 'imported',
      name: snapshot ? displayName(snapshot.name, 500) : 'Tu copia local', captureId: snapshot?.id ?? null,
      capturedAt: snapshot?.capturedAt ?? null, isTestData: snapshot?.source.isTestData ?? null },
    reviewable: !!snapshot && !invalidRecovery && !historyError,
    unavailableReason: !snapshot ? 'Importa una captura para ver y revisar tu trabajo.' : historyError ?? (invalidRecovery ? 'Revisa primero la integridad del plan de devolución. La copia sigue visible.' : null),
    counts: queue ? { records: records.length, tasks: queue.summary.totalTasks, completed: queue.summary.completedTasks,
      open: queue.summary.knownOpenTasks, unknownStatus: queue.summary.unknownStatusTasks,
      overdue: queue.summary.buckets.overdue, upcoming: queue.summary.buckets['due-in-window'],
      needsReview: queue.summary.buckets['needs-review'], queued: queue.summary.totalQueued, returned: queue.items.length } : null,
    tasks: queue?.items.map(item => ({ id: item.id, label: item.label, bucket: item.bucket,
      due: item.due.localDate ?? item.due.value, dueKind: item.due.kind,
      reasons: item.reasons.map(reason => reason.detail), nextAction: item.nextAction })) ?? [],
    limitations: [
      'Revisión por reglas locales: no usa IA ni consulta HubSpot.',
      'Los vencimientos se clasifican en Europe/Madrid; el horizonte es de 24 horas.',
      ...(!store.ready && snapshot ? ['La captura está importada. Activa y revisa su aplicación antes de editar registros.'] : []),
      ...(queue?.summary.truncated ? ['Los recuentos cubren toda la copia; se muestran las primeras 200 tareas en orden de prioridad.'] : []),
      ...(queue?.limitations ?? []),
    ], lastReview,
  });
}

/** Bytes UTF-8 reales del JSON que enviará Fastify (sin esquema de serialización, `JSON.stringify` + UTF-8). */
const bodyBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

type WorkReference = LocalWorkQueue['tasks'][number]['references'][number];
/**
 * Acota las asociaciones de UNA tarea sin tocar ningún identificador. Conserva siempre las no comprobables (missing, not-captured) y completa con las encontradas hasta el límite;
 * el resultado mantiene el orden original. La cobertura cuenta TODAS las asociaciones (también las que no viajan).
 */
export function limitWorkReferences(all: readonly WorkReference[], limit: number = WORK_QUEUE_REFERENCE_LIMIT) {
  const count = (state: WorkReference['state']) => all.filter(reference => reference.state === state).length;
  const chosen = new Set<number>();
  if (all.length <= limit) all.forEach((_, index) => chosen.add(index));
  else {
    all.forEach((reference, index) => { if (reference.state !== 'found' && chosen.size < limit) chosen.add(index); });
    all.forEach((reference, index) => { if (reference.state === 'found' && chosen.size < limit) chosen.add(index); });
  }
  const references = all.filter((_, index) => chosen.has(index));
  return { references, referenceCoverage: { total: all.length, returned: references.length, omitted: all.length - references.length,
    found: count('found'), missing: count('missing'), notCaptured: count('not-captured') } };
}

/**
 * Cola de trabajo ESTRUCTURADA (unidad 230, R2). Mismos registros y misma `buildResponseQueue` que el recurso v1, pero proyectando estado, referencias e identidad completa de la copia
 * (la que la ficha calcula con `contextKey` desde /api/v2/state) en lugar de textos de presentación. Solo lectura.
 *
 * La página cumple tres límites declarados en `page`: tareas (prefijo de la cola en orden de prioridad), referencias por tarea (con cobertura) y bytes UTF-8 reales del cuerpo. Si el
 * presupuesto de bytes no admite todas las tareas, se devuelve el prefijo MÁS LARGO que cabe: ni se reordenan ni se acortan identificadores, y las omitidas se cuentan aparte.
 */
export function inspectLocalWorkQueue(store: Store, clock: () => number = Date.now, options: { byteBudget?: number } = {}): LocalWorkQueue {
  const byteBudget = options.byteBudget ?? WORK_QUEUE_BYTE_BUDGET;
  const instanceId = z.string().uuid().safeParse(store.get('instanceId', null));
  if (!instanceId.success) throw new AppError(503, 'No se pudo identificar esta instalación.');
  const snapshot = store.snapshot, records = snapshot ? store.records() : [], activeSpec = store.spec;
  const schema: AppSpec | null = activeSpec ?? (snapshot ? AppSpecSchema.parse({
    version: snapshot.version, title: displayName(snapshot.name, 100), description: '', entities: snapshot.entities,
    stages: snapshot.stages, rules: snapshot.rules,
    coverage: { supported: ['Campos de la captura importada, sin edición habilitada'], unsupported: snapshot.unsupported },
  }) : null);
  const evaluatedAt = clock(), queue = schema ? buildResponseQueue({ spec: schema, records, evaluatedAt, horizonHours: 24, limit: WORK_QUEUE_TASK_LIMIT }) : null;
  const captured = new Set(snapshot?.entities.map(entity => entity.id) ?? []);
  const generation = store.generation;
  const tasks = queue?.items.map(item => ({ id: item.id, label: item.label, bucket: item.bucket, status: item.status,
    due: { kind: item.due.kind, value: item.due.value, localDate: item.due.localDate },
    ...limitWorkReferences(item.references.map(reference => ({ field: reference.field, entity: reference.entity, id: reference.id, label: reference.label,
      state: reference.available ? 'found' as const : captured.has(reference.entity) ? 'missing' as const : 'not-captured' as const }))),
    reasonCodes: [...new Set(item.reasons.map(reason => reason.code))] })) ?? [];
  const omittedByLimit = queue ? queue.summary.totalQueued - queue.items.length : 0;
  const sizes = tasks.map(task => bodyBytes(task));
  const build = (selected: readonly number[], oversize: number) => {
    const chosen = selected.map(index => tasks[index]);
    return {
      format: 'planb-local-work-queue-v1', evaluatedAt: new Date(evaluatedAt).toISOString(), horizonHours: 24,
      phase: !snapshot ? 'empty' : store.ready ? 'active' : 'imported',
      identity: snapshot ? { instanceId: instanceId.data, snapshotId: snapshot.id, capturedAt: snapshot.capturedAt, captureStartedAt: snapshot.captureStartedAt ?? null,
        accountId: snapshot.source.accountId ?? null, generatedAt: generation?.generatedAt ?? null } : null,
      counts: queue ? { tasks: queue.summary.totalTasks, completed: queue.summary.completedTasks, knownOpen: queue.summary.knownOpenTasks, unknownStatus: queue.summary.unknownStatusTasks,
        queued: queue.summary.totalQueued, returned: chosen.length, notReturned: queue.summary.totalQueued - chosen.length } : null,
      page: { taskLimit: WORK_QUEUE_TASK_LIMIT, referenceLimit: WORK_QUEUE_REFERENCE_LIMIT, byteBudget, omittedByLimit, omittedByBytes: tasks.length - chosen.length, omittedOversize: oversize },
      tasks: chosen,
      limitations: [
        'Estado y referencias salen de la cola de prioridad de la copia; una referencia «not-captured» no se puede comprobar porque la copia no captura esa entidad.',
        ...(omittedByLimit ? ['Se devuelven las primeras ' + WORK_QUEUE_TASK_LIMIT + ' tareas en orden de prioridad; los recuentos cubren toda la copia.'] : []),
        ...(chosen.length < tasks.length ? ['La respuesta se acortó a ' + chosen.length + ' tareas para no superar ' + byteBudget + ' bytes; las demás siguen en la cola y están contadas como no devueltas.'] : []),
        ...(oversize ? [oversize + ' tarea(s) no caben en el presupuesto ni solas (identificadores o asociaciones muy largos): se omiten enteras, sin truncar ningún identificador.'] : []),
        ...(chosen.some(task => task.referenceCoverage.omitted > 0) ? ['Alguna tarea tiene más de ' + WORK_QUEUE_REFERENCE_LIMIT + ' asociaciones: se devuelven las no comprobables y el resto hasta ese límite; su cobertura cuenta todas.'] : []),
        ...(queue?.limitations ?? []),
      ],
    };
  };
  // La IDENTIDAD de la copia viaja siempre entera: si ni ella cabe, no hay respuesta honesta posible (decisión de producto pendiente) y se dice con claridad.
  if (bodyBytes(build([], 0)) > byteBudget) throw new AppError(500, 'La identidad de esta copia no cabe en el presupuesto de la respuesta (' + byteBudget + ' bytes).');
  // Filas que SOLAS no caben: se omiten enteras (nunca truncadas) y las siguientes siguen. Solo se mide en exacto las candidatas por tamaño.
  const skeleton = bodyBytes(build([], 0)), oversizeRows = tasks.map((_, index) => index).filter(index => skeleton + sizes[index] > byteBudget - 4_096 && bodyBytes(build([index], 0)) > byteBudget);
  const skipped = new Set(oversizeRows), candidates = tasks.map((_, index) => index).filter(index => !skipped.has(index));
  const fits = (count: number) => bodyBytes(build(candidates.slice(0, count), oversizeRows.length)) <= byteBudget;
  // El mayor prefijo de las candidatas que cabe. Estimación por tamaños individuales y ajuste exacto con el cuerpo completo (los dígitos de los recuentos y las frases cambian algunos bytes).
  let returned = 0, estimate = bodyBytes(build([], oversizeRows.length));
  while (returned < candidates.length && estimate + sizes[candidates[returned]] + (returned ? 1 : 0) <= byteBudget) { estimate += sizes[candidates[returned]] + (returned ? 1 : 0); returned++; }
  while (returned < candidates.length && fits(returned + 1)) returned++;
  while (returned > 0 && !fits(returned)) returned--;
  const parsed = LocalWorkQueueSchema.parse(build(candidates.slice(0, returned), oversizeRows.length));
  if (bodyBytes(parsed) > byteBudget) throw new AppError(500, 'No se pudo acotar la cola de trabajo al presupuesto declarado.');
  return parsed;
}

export function registerLocalOperations(app: FastifyInstance, store: Store, clock: () => number = Date.now) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.split('?')[0].startsWith('/api/v7/local-operations')) {
      reply.header('Cache-Control', 'no-store').header('Vary', 'Cookie');
    }
    return payload;
  });
  app.get('/api/v7/local-operations', { exposeHeadRoute: false }, async () => inspectLocalOperations(store, clock));
  app.get('/api/v7/local-operations/work', { exposeHeadRoute: false }, async () => inspectLocalWorkQueue(store, clock));
  app.post('/api/v7/local-operations/reviews', async request => {
    const body = LocalReviewRequestSchema.safeParse(request.body);
    if (!body.success) throw new AppError(422, 'La revisión o su clave no son válidas.');
    return store.transaction(() => {
      store.assertRecoveryIntegrity();
      const current = inspectLocalOperations(store, clock), items = history(store);
      const prior = items.find(item => item.key === body.data.idempotencyKey);
      if (prior) {
        if (prior.instanceId !== current.context.instanceId || prior.revision !== body.data.revision)
          throw new AppError(422, 'Esta clave ya corresponde a otra revisión.');
        const { key: _, instanceId: __, ...record } = prior;
        return { ok: true, replayed: true, review: { ...record, stale: record.revision !== current.revision } };
      }
      if (body.data.revision !== current.revision) throw new AppError(409, 'La copia cambió. Actualiza antes de revisar.');
      if (!current.reviewable || !current.counts) throw new AppError(409, current.unavailableReason ?? 'No hay copia que revisar.');
      if (items.length >= 100) throw new AppError(409, 'Esta instalación conserva ya 100 revisiones locales. No se ha iniciado otra.');
      const saved = { key: body.data.idempotencyKey, instanceId: current.context.instanceId,
        id: randomUUID(), revision: current.revision, at: current.evaluatedAt,
        tasks: current.counts.tasks, overdue: current.counts.overdue, needsReview: current.counts.needsReview };
      store.set(KEY, [...items, saved]);
      const { key: _, instanceId: __, ...record } = saved;
      return { ok: true, replayed: false, review: { ...record, stale: false } };
    });
  });
}
