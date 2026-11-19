import { sameTaskCapture, findConflicts, judgeAfterUncertain, parseHealth, parseState, parseTaskRecord, type Conflict, type Evidence, type TaskContext, type TaskSchema } from '../shared/local-task-focus.js';
import type { CrmRecord, Entity, FieldValue } from '../shared/model.js';
import { parseWorkspaceSearchContext } from '../shared/workspace-search.js';

// Cliente de la ficha de tarea. Solo usa endpoints que ya existen:
//   GET /api/health · GET /api/v2/state · GET /api/v2/records/tasks/:id · PATCH /api/records/tasks/:id
// El PATCH actual no compara versión ni acepta clave de idempotencia; este módulo no finge ninguna de las dos cosas.

export class TaskFocusError extends Error {
  // status 0: no hubo respuesta HTTP utilizable (red, cuerpo cortado o formato incompatible).
  constructor(public status: number, message: string, public details: unknown = null, public kind: 'http' | 'network' | 'format' | 'context' = 'http') { super(message); }
}
export interface Transport { fetch: typeof fetch; base: string; readTimeoutMs?: number; writeTimeoutMs?: number; }
export const browserTransport = (): Transport => ({ fetch: (input, init) => globalThis.fetch(input, init), base: '' });
// Tiempos límite: sin ellos una lectura o un guardado colgados dejarían la ficha en «Leyendo…»/«Guardando…» para siempre.
// Un PATCH que agota su tiempo NO se da por fallido: se trata como resultado incierto (el servidor pudo aplicarlo).
export const READ_TIMEOUT_MS = 15_000, WRITE_TIMEOUT_MS = 30_000;
// Topes de tamaño aplicados MIENTRAS se lee el flujo (no después de tenerlo entero en memoria). El estado de la instalación
// incluye la especificación completa y crece con el número de propiedades (~300 B cada una): 8 MiB admite decenas de miles.
export const MAX_RECORD_BYTES = 1_048_576, MAX_STATE_BYTES = 8_388_608;
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const tooLarge = () => new TaskFocusError(0, 'La respuesta supera el tamaño permitido.', null, 'format');

async function readBounded(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) { await response.body?.cancel().catch(() => undefined); throw tooLarge(); }
  if (!response.body) { const raw = await response.text(); if (raw.length > max) throw tooLarge(); return raw; }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) { await reader.cancel().catch(() => undefined); throw tooLarge(); }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}
// Se corre contra la señal para que un transporte que ignore AbortSignal tampoco pueda colgar la ficha.
const raceAbort = <T>(work: Promise<T>, signal: AbortSignal) => new Promise<T>((resolve, reject) => {
  const onAbort = () => reject(new DOMException('Cancelada', 'AbortError'));
  work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));   // siempre se atiende `work`: ningún rechazo queda sin manejar
  if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
});

async function request(transport: Transport, path: string, init: RequestInit = {}, opts: { maxBytes?: number; write?: boolean } = {}): Promise<unknown> {
  const limit = opts.write ? transport.writeTimeoutMs ?? WRITE_TIMEOUT_MS : transport.readTimeoutMs ?? READ_TIMEOUT_MS;
  const controller = new AbortController(), outer = init.signal ?? undefined; let timedOut = false;
  const onOuter = () => controller.abort();
  if (outer) { if (outer.aborted) controller.abort(); else outer.addEventListener('abort', onOuter, { once: true }); }
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, limit);
  let response: Response, raw: string;
  try {
    response = await raceAbort(transport.fetch(transport.base + path, { ...init, signal: controller.signal }), controller.signal);
    raw = await raceAbort(readBounded(response, opts.maxBytes ?? MAX_RECORD_BYTES), controller.signal);
  } catch (error) {
    if (timedOut) throw new TaskFocusError(0, 'La respuesta tardó demasiado.', null, 'network');
    if (error instanceof TaskFocusError) throw error;
    if (isAbort(error)) throw error;
    throw new TaskFocusError(0, 'No se pudo conectar con esta instalación de Plan B.', null, 'network');
  } finally { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = undefined; }
  const body = (typeof value === 'object' && value !== null ? value : {}) as { error?: unknown; details?: unknown };
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    throw new TaskFocusError(response.status, typeof body.error === 'string' ? body.error : 'No se pudo completar la operación.', body.details ?? null);
  }
  if (value === undefined) throw new TaskFocusError(0, 'El servidor no devolvió una respuesta compatible.', null, 'format');
  return value;
}
const taskPath = (taskId: string) => '/api/v2/records/tasks/' + encodeURIComponent(taskId);

export async function readContext(signal: AbortSignal | undefined, transport = browserTransport()): Promise<{ context: TaskContext; schema: TaskSchema | null; changes: number }> {
  const [health, state] = await Promise.all([request(transport, '/api/health', { signal }), request(transport, '/api/v2/state', { signal }, { maxBytes: MAX_STATE_BYTES })]);
  const parsedHealth = parseHealth(health), parsedState = parseState(state);
  if (!parsedHealth || !parsedState) throw new TaskFocusError(0, 'El estado recibido no es compatible. Actualiza Plan B antes de continuar.', null, 'format');
  const context: TaskContext = { ...parsedState.context, instanceId: parsedHealth.instanceId };
  // Older installations omit this field. An active installation that exposes it must provide a matching pin.
  if (context.ready && Object.hasOwn(state as object, 'workspaceSearchContext')) {
    const pin = parseWorkspaceSearchContext((state as { workspaceSearchContext: unknown }).workspaceSearchContext);
    if (!pin || pin.instanceId !== context.instanceId || pin.captureId !== context.snapshotId + ':' + context.capturedAt
      || pin.capturedAt !== context.capturedAt || pin.accountId !== context.accountId || pin.isTestData !== context.isTestData) {
      throw new TaskFocusError(0, 'La procedencia de la copia no coincide. Vuelve a abrir la tarea.', null, 'context');
    }
    context.contextRevision = pin.contextRevision;
  }
  return { context, schema: parsedState.schema, changes: parsedState.changes };
}
// null = el servidor respondió 404 (la tarea no existe en esta copia); no se convierte en alta.
export async function readTask(taskId: string, signal: AbortSignal | undefined, transport = browserTransport()): Promise<CrmRecord | null> {
  let value: unknown;
  try { value = await request(transport, taskPath(taskId), { signal }); }
  catch (error) { if (error instanceof TaskFocusError && error.status === 404) return null; throw error; }
  const record = parseTaskRecord(value, taskId);
  if (!record) throw new TaskFocusError(0, 'El servidor devolvió otro registro distinto del pedido. No se abre para editar.', null, 'format');
  return record;
}

export type LoadedTask =
  | { kind: 'empty'; context: TaskContext }
  | { kind: 'missing'; context: TaskContext }
  | { kind: 'ok'; context: TaskContext; record: CrmRecord; schema: TaskSchema | null };
// El estado se lee antes y después del registro: si la copia activa cambió entre ambas lecturas, no se abre ninguna ficha.
export async function loadTask(taskId: string, signal: AbortSignal, transport = browserTransport()): Promise<LoadedTask> {
  const first = await readContext(signal, transport);
  if (first.context.snapshotId === null) return { kind: 'empty', context: first.context };
  const record = await readTask(taskId, signal, transport);
  const second = await readContext(signal, transport);
  if (!sameTaskCapture(first.context, second.context)) throw new TaskFocusError(0, 'La copia cambió mientras se leía la tarea. Vuelve a intentarlo.', null, 'context');
  if (!record) return { kind: 'missing', context: second.context };
  return { kind: 'ok', context: second.context, record, schema: second.schema };
}

export type SaveOutcome =
  | { kind: 'saved'; record: CrmRecord }                                              // el PATCH confirmó el registro guardado
  | { kind: 'invalid'; fields: Record<string, string>; message: string }              // 422: no se escribió nada
  | { kind: 'rejected'; status: number; message: string }                             // 409/4xx: el servidor no escribió nada
  | { kind: 'missing' }                                                               // 404: la tarea ya no existe; no se recrea
  | { kind: 'locked' }                                                                // 401: la app se bloquea; el borrador sigue en la ficha
  | { kind: 'conflict'; conflicts: Conflict[]; current: CrmRecord }                   // detectado antes de enviar: no se envió nada
  | { kind: 'context-changed'; message: string }                                      // otra copia/instalación o copia sin activar: no se envió nada
  | { kind: 'preflight-failed'; message: string }                                     // no se pudo comprobar: no se envió nada
  | { kind: 'uncertain'; message: string };                                           // el PATCH salió y no hay acuse utilizable
export const wroteNothing = (outcome: SaveOutcome) => outcome.kind !== 'saved' && outcome.kind !== 'uncertain';

function fieldErrors(details: unknown): Record<string, string> {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return {};
  return Object.fromEntries(Object.entries(details).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
}
// Guardado manual explícito. Antes de enviar se vuelve a leer la tarea y el contexto: es una comprobación de mejor
// esfuerzo, NO una garantía (entre esa lectura y el PATCH otra pestaña puede escribir). Solo se envían campos cambiados.
export async function saveTask(args: { taskId: string; baseline: CrmRecord; entity: Entity; patch: Record<string, FieldValue>; context: TaskContext; signal?: AbortSignal }, transport = browserTransport()): Promise<SaveOutcome> {
  const { taskId, baseline, entity, patch, context, signal } = args;
  let fresh: CrmRecord | null, now: Awaited<ReturnType<typeof readContext>>;
  try { [now, fresh] = await Promise.all([readContext(signal, transport), readTask(taskId, signal, transport)]); }
  catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof TaskFocusError && error.status === 401) return { kind: 'locked' };
    if (error instanceof TaskFocusError && error.kind === 'context') return { kind: 'context-changed', message: error.message + ' No se ha guardado nada.' };
    return { kind: 'preflight-failed', message: 'No se pudo comprobar la tarea antes de guardar. No se ha guardado nada.' };
  }
  if (!sameTaskCapture(now.context, context) || !now.context.ready)
    return { kind: 'context-changed', message: now.context.ready ? 'La copia activa ya no es la que abriste. No se ha guardado nada.' : 'La copia ya no está activada. No se ha guardado nada.' };
  if (!fresh) return { kind: 'missing' };
  const conflicts = findConflicts(entity, baseline, fresh, patch);
  if (conflicts.length) return { kind: 'conflict', conflicts, current: fresh };
  try {
    // El PATCH no se cancela: abortar el cliente no deshace lo que el servidor ya hubiera aplicado.
    const value = await request(transport, '/api/records/tasks/' + encodeURIComponent(taskId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: patch }) }, { write: true });
    const record = parseTaskRecord(value, taskId);
    return record ? { kind: 'saved', record } : { kind: 'uncertain', message: 'El servidor respondió con un formato inesperado; no se sabe si el cambio se aplicó.' };
  } catch (error) {
    if (!(error instanceof TaskFocusError)) throw error;
    if (error.status === 401) return { kind: 'locked' };
    if (error.status === 404) return { kind: 'missing' };
    if (error.status === 422) return { kind: 'invalid', fields: fieldErrors(error.details), message: error.message };
    if (error.status >= 400 && error.status < 500) return { kind: 'rejected', status: error.status, message: error.message };
    return { kind: 'uncertain', message: error.status === 0 ? 'No llegó el acuse del servidor; no se sabe si el cambio se aplicó.' : 'El servidor respondió con un error (' + error.status + '); no se sabe si el cambio se aplicó.' };
  }
}

export type Verification =
  | { kind: 'read'; evidence: Evidence; record: CrmRecord }
  | { kind: 'context-changed' }                         // la lectura habría venido de otra instalación/captura: no sirve como evidencia
  | { kind: 'missing' } | { kind: 'locked' } | { kind: 'unknown' };
// Tras un acuse perdido solo se LEE, y la lectura queda ligada al contexto que se abrió (revisión 131, F1): se comprueba la
// identidad de la copia antes y después de leer el registro. Sin contexto no hay evidencia utilizable. Nunca se reenvía un PATCH
// sin que la persona lo decida después de ver esta evidencia, y una coincidencia de valores no demuestra quién los escribió.
export async function verifyAfterUncertain(args: { taskId: string; baseline: CrmRecord; patch: Record<string, FieldValue>; context?: TaskContext }, transport = browserTransport()): Promise<Verification> {
  if (!args.context) return { kind: 'unknown' };
  const expected = args.context;
  try {
    const before = await readContext(undefined, transport);
    if (!sameTaskCapture(before.context, expected)) return { kind: 'context-changed' };
    const record = await readTask(args.taskId, undefined, transport);
    const after = await readContext(undefined, transport);
    if (!sameTaskCapture(after.context, expected)) return { kind: 'context-changed' };
    return record ? { kind: 'read', evidence: judgeAfterUncertain(args.baseline, record, args.patch), record } : { kind: 'missing' };
  } catch (error) {
    if (error instanceof TaskFocusError && error.kind === 'context') return { kind: 'context-changed' };
    return error instanceof TaskFocusError && error.status === 401 ? { kind: 'locked' } : { kind: 'unknown' };
  }
}
