import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TaskRevisionParams, TaskRevisionResult, TaskRevisionView, TaskRevisionWrite } from '../shared/task-revision.js';
import { AppError, type Store } from './store.js';

const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function readRevisionState(store: Store, id: string) {
  const instance = z.string().uuid().safeParse(store.get('instanceId', null));
  if (!instance.success) throw new AppError(503, 'No se pudo identificar esta instalación.');
  const snapshot = store.snapshot, spec = store.spec;
  if (!snapshot) throw new AppError(409, 'Importa una captura antes de abrir una tarea.');
  const generation = spec ? store.generation : null;
  // Apply the Store.ready conditions to the same metadata used by the fingerprint.
  // Calling Store.ready here would decode the full capture and schema again.
  if (!spec || !generation?.approved || !store.reconciliation?.complete)
    throw new AppError(409, 'Revisa y activa la aplicación antes de editar tareas.');
  const record = store.record('tasks', id);
  if (!record) throw new AppError(404, 'La tarea ya no está disponible en esta copia.');
  const last = store.db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM changes WHERE entity='tasks' AND record_id=?").get(id) as { id: number };
  const revision = fingerprint({ instance: instance.data, snapshot, spec, generatedAt: generation.generatedAt ?? null, session: store.get('sessionId', null), record, lastChangeId: last.id });
  const view = TaskRevisionView.parse({ format: 'planb-task-revision-v1', revision, instanceId: instance.data,
    captureId: snapshot.id, capturedAt: snapshot.capturedAt, record });
  return { view, spec };
}

/** Version ties a task to its installation, full capture, active schema/generation and local history. */
export function readTaskRevision(store: Store, id: string): TaskRevisionView {
  return readRevisionState(store, id).view;
}

/**
 * compare+save is synchronous for the single writer/event loop owning this Store.
 * It is not a cross-process CAS and does not add idempotency to Store.saveRecord.
 */
export function writeTaskRevision(store: Store, id: string, body: z.infer<typeof TaskRevisionWrite>) {
  store.assertRecoveryIntegrity();
  if (store.get('returnBusy', false)) throw new AppError(409, 'Espera a que termine la devolución revisada.');
  const plan = store.validatedRecoveryPlan();
  if (plan && plan.status !== 'complete' && plan.operations.some(operation => ['applied', 'sending', 'uncertain'].includes(operation.status)))
    throw new AppError(409, 'Resuelve la devolución parcial antes de seguir editando.');
  const { view: before, spec } = readRevisionState(store, id);
  if (before.revision !== body.expectedRevision) throw new AppError(409, 'La tarea o la copia cambiaron. Actualiza y revisa tus cambios antes de guardar.', { code: 'TASK_REVISION_CHANGED' });
  const taskFields = spec.entities.find(entity => entity.id === 'tasks')?.fields ?? [];
  if (Object.keys(body.values).some(key => !taskFields.some(field => field.key === key)))
    throw new AppError(422, 'Revisa los campos señalados.');
  const different = Object.entries(body.values).some(([key, value]) => !Object.hasOwn(before.record.values, key) || before.record.values[key] !== value);
  if (!different) return TaskRevisionResult.parse({ ok: true, changed: false, current: before });
  store.saveRecord('tasks', body.values, id);
  return TaskRevisionResult.parse({ ok: true, changed: true, current: readTaskRevision(store, id) });
}

const registrations = new WeakMap<FastifyInstance, Store>();
/** Register only inside the protected base app; an unprotected Fastify instance has no authentication.
 * Repeating registration for the same app and Store is harmless; a different Store is a configuration error. */
export function registerTaskRevision(app: FastifyInstance, store: Store) {
  const existing = registrations.get(app);
  if (existing) {
    if (existing !== store) throw new Error('Task revisions are already registered with another Store.');
    return;
  }
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.split('?')[0].startsWith('/api/v7/task-revision/')) reply.header('Cache-Control', 'no-store').header('Vary', 'Cookie');
    return payload;
  });
  app.get('/api/v7/task-revision/:id', { exposeHeadRoute: false }, async request => {
    const parsed = TaskRevisionParams.safeParse(request.params);
    if (!parsed.success) throw new AppError(422, 'El identificador de tarea no es válido.');
    return readTaskRevision(store, parsed.data.id);
  });
  app.patch('/api/v7/task-revision/:id', async request => {
    const params = TaskRevisionParams.safeParse(request.params), body = TaskRevisionWrite.safeParse(request.body);
    if (!params.success || !body.success) throw new AppError(422, 'Revisa el identificador, los campos y la revisión.');
    return writeTaskRevision(store, params.data.id, body.data);
  });
  registrations.set(app, store);
}
