import type { TaskContext, TaskSchema } from '../shared/local-task-focus.js';
import type { CrmRecord } from '../shared/model.js';
import { TaskRevisionView } from '../shared/task-revision.js';
import type { Verification } from './local-task-focus-client.js';
import { createContextualTaskRevisionClient, type ContextualRevisionSave, type ContextualTaskRevision } from './task-revision-context-client.js';
import type { SaveRequest, SaveStrategy, StrategyOutcome, VerifyRequest } from './task-save-outcome.js';

// Estrategia de guardado CONDICIONADO a la revisión (unidad 233): adopta el cliente contextual 183 (que compone el cliente 166 y la lectura de contexto) en el contrato del gestor 136/170.
//
// Garantías:
//  · el token es SIEMPRE el de la lectura que la persona revisó (`request.revision`): no se renueva, no se relee para reenviar y no se sustituye por otro más nuevo;
//  · la puerta síncrona `onDispatch()` de 170 se llama inmediatamente ANTES de la petición de escritura (envolviendo `fetch`): tras `dispose()` no sale ningún PATCH;
//  · ningún error de la ruta condicionada se reintenta por la ruta anterior: no existe aquí ninguna llamada a `saveTask` ni a la API sin revisión;
//  · un no-op (`unchanged`) no se anuncia como escritura; `revised` (token + registro) solo existe cuando el servidor confirmó con una lectura validada;
//  · tras un acuse perdido, `verify` SOLO hace GET; una coincidencia de valores no prueba autoría.
// Límites: el servidor compara bajo UN escritor cooperante (185); no protege rutas anteriores, escritores externos ni varios procesos, ni da idempotencia por intención.
export interface RevisionStrategyOptions { base?: string; fetch?: typeof fetch; timeoutMs?: number; contextTimeoutMs?: number; maxResponseBytes?: number; }

/**
 * Reconstruye la lectura que la persona revisó a partir de lo que el gestor conserva (registro base, contexto y token). `null` si falta algo imprescindible.
 * La tarea que el gestor declara (`taskId`) y el registro que se revisó (`baseline.id`) DEBEN ser la misma: se comprueba aquí, ANTES de consultar contexto, cruzar la puerta
 * `onDispatch` o formar una petición, y la comparten guardar y verificar. Sin esta guarda un token válido de otra tarea se aceptaría y el intento declararía una tarea distinta de la que escribió.
 */
function reviewedFrom(request: { taskId: string; baseline: CrmRecord; context: TaskContext; revision?: string | null }): ContextualTaskRevision | null {
  const { context } = request;
  if (request.taskId !== request.baseline.id || !request.revision || !context.ready || !context.instanceId || !context.snapshotId || !context.capturedAt) return null;
  const view = TaskRevisionView.safeParse({ format: 'planb-task-revision-v1', revision: request.revision, instanceId: context.instanceId, captureId: context.snapshotId, capturedAt: context.capturedAt, record: request.baseline });
  return view.success ? { context: structuredClone(context), schema: null, current: view.data } : null;
}
const fieldsOf = (details: unknown): Record<string, string> | null => {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return null;
  const entries = Object.entries(details as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length ? Object.fromEntries(entries) : null;
};
const NOTHING_SENT = ' No se envió nada.';
export function mapRevisionSave(result: ContextualRevisionSave): StrategyOutcome {
  switch (result.kind) {
    case 'changed': return { kind: 'saved', record: result.current.record, revised: { changed: true, token: result.current.revision, current: result.current.record } };
    case 'unchanged': return { kind: 'unchanged', record: result.current.record, revised: { changed: false, token: result.current.revision, current: result.current.record } };
    // 409 TASK_REVISION_CHANGED: el servidor NO escribió. Se conserva la intención y el token original; otro intento exige leer y decidir de nuevo.
    case 'conflict': return { kind: 'rejected', status: 409, message: result.message, revisionConflict: true } as StrategyOutcome;
    case 'rejected': {
      if (result.status === 401) return { kind: 'locked' };
      if (result.status === 404) return { kind: 'missing' };
      const fields = result.status === 422 ? fieldsOf(result.details) : null;
      return fields ? { kind: 'invalid', fields, message: result.message } : { kind: 'rejected', status: result.status, message: result.message };
    }
    case 'context-changed': return { kind: 'context-changed', message: 'La copia activa cambió desde que abriste la tarea: la revisión que revisaste ya no corresponde a esta copia.' + NOTHING_SENT };
    case 'preflight-failed': return { kind: 'preflight-failed', message: result.message };
    case 'not-sent': return { kind: 'preflight-failed', message: result.message };
    case 'uncertain': return { kind: 'uncertain', message: result.message };
  }
}

export function revisionStrategy(options: RevisionStrategyOptions = {}): SaveStrategy {
  const fetcher = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  return {
    async save(request: SaveRequest, hooks): Promise<StrategyOutcome> {
      if (request.taskId !== request.baseline.id) return { kind: 'preflight-failed', message: 'La tarea que ibas a guardar no es la que abriste (' + request.baseline.id + '): no se puede guardar contra su revisión.' + NOTHING_SENT };
      const reviewed = reviewedFrom(request);
      if (!reviewed) return { kind: 'preflight-failed', message: 'Falta la revisión que abriste o el contexto de la copia: no se puede guardar contra ella.' + NOTHING_SENT };
      // La puerta se cruza justo antes de entregar la ESCRITURA al transporte. Si el gestor ya terminó, lanza: el cliente lo informa como incierto y el gestor lo corrige a «no enviado».
      const client = createContextualTaskRevisionClient({ ...options, fetch: (input, init) => { if (init?.method === 'PATCH') hooks.onDispatch(); return fetcher(input, init); } });
      return mapRevisionSave(await client.save(reviewed, request.patch, request.signal));
    },
    async verify(request: VerifyRequest): Promise<Verification> {
      const reviewed = reviewedFrom(request);
      if (!reviewed) return { kind: 'unknown' };
      const client = createContextualTaskRevisionClient({ ...options, fetch: (input, init) => { if (init?.method && init.method !== 'GET') throw new Error('La comprobación solo lee.'); return fetcher(input, init); } });
      const result = await client.verify(reviewed, request.patch);
      return result.kind === 'read' ? { kind: 'read', evidence: result.evidence, record: result.opened.current.record } : { kind: result.kind };
    },
  };
}

/** Lo que la ficha necesita al abrir: contexto, esquema, registro y el TOKEN, todo de UNA lectura validada (183: contexto antes y después + vista de revisión). */
export type RevisedTask =
  | { kind: 'ok'; context: TaskContext; schema: TaskSchema | null; record: CrmRecord; revision: string }
  | { kind: 'context-changed' | 'unavailable' }
  | { kind: 'failed'; status: number; message: string };
export async function loadRevisedTask(taskId: string, signal?: AbortSignal, options: RevisionStrategyOptions = {}): Promise<RevisedTask> {
  const result = await createContextualTaskRevisionClient(options).read(taskId, undefined, signal);
  if (result.kind === 'read') return { kind: 'ok', context: result.opened.context, schema: result.opened.schema, record: result.opened.current.record, revision: result.opened.current.revision };
  return result;
}
