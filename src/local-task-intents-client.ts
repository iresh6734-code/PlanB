import {
  TASK_INTENTS_PATH, TASK_INTENT_RESPONSE_BYTES,
  TaskIntentAbandon, TaskIntentAccept, TaskIntentCheck, TaskIntentDetail, TaskIntentExecute, TaskIntentExecution, TaskIntentList, TaskIntentScope, TaskIntentSummary,
} from '../shared/task-intents.js';
import { readBoundedText } from './local-operations-client.js';

// CLIENTE A4 DE INTENTOS DE TAREA (unidad CLAUDE-A4-CLIENT-STRATEGY). Habla SOLO con las seis rutas de `/api/v7/task-intents` y valida cada respuesta con los esquemas estrictos de `shared/task-intents.ts`.
//
// QUÉ GARANTIZA
//  · `execute` envía UN POST con el ID de intento que le dan (nunca genera otro) y ejecuta `onDispatch` en el mismo turno, inmediatamente antes de entregar la petición al transporte. Si la puerta lanza,
//    la entrada es inválida o la señal ya estaba cancelada, NO hay POST (`not-dispatched`). Desde que `fetch` recibe la petición, el POST se considera potencialmente despachado.
//  · Un POST despachado sin respuesta válida (sin respuesta, plazo, cancelación, cuerpo ilegible/excesivo, contrato ajeno, recibo de otro intento/tarea/contexto, 401, 5xx o un código no reconocido) es
//    `uncertain`: jamás «no enviado». Solo ciertos 4xx anteriores al escritor (códigos cerrados) son `rejected`. Nada se reenvía: ni el plazo, ni la cancelación, ni un error.
//  · El plazo (cabeceras + cuerpo) y la cancelación son PROPIOS: no dependen de que el transporte atienda la señal. Se lee con límite real de bytes (512 KiB) mientras llega el cuerpo.
//  · Los textos de error son propios y cerrados; no se muestra lo que diga el servidor. 401 emite `planb:locked`.
//  · Los GET (lista, detalle, comprobar) y todo lo que se pide «leer» nunca escriben ni envían un POST.
// QUÉ NO HACE: no decide estados del gestor (eso es la estrategia), no sabe de React ni de Hoy, no recarga nada y no genera UUID.
export type UncertainCause = 'no-response' | 'timeout' | 'cancelled' | 'unreadable' | 'incompatible' | 'mismatched-receipt' | 'server-error' | 'locked' | 'context-changed';
export type UnavailableCause = 'no-response' | 'timeout' | 'cancelled' | 'unreadable' | 'incompatible' | 'mismatched-receipt' | 'server-error';
export type ExecuteResult =
  | { kind: 'not-dispatched'; cause: 'gate-closed' | 'invalid-request' | 'cancelled'; message: string }
  | { kind: 'execution'; execution: TaskIntentExecution }
  | { kind: 'detail-expired'; operation: TaskIntentSummary }
  | { kind: 'rejected'; status: number; code: string | null; message: string }
  | { kind: 'uncertain'; cause: UncertainCause; status: number | null; code: string | null; message: string };
export type ReadResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'locked' } | { kind: 'not-found' } | { kind: 'context-changed' }
  | { kind: 'rejected'; status: number; code: string | null; message: string }
  | { kind: 'unavailable'; cause: UnavailableCause; status: number | null; message: string };
export type DecisionResult =
  | { kind: 'ok'; detail: TaskIntentDetail }
  | { kind: 'conflict'; code: string | null; message: string }                       // 409: la secuencia o la tarea cambiaron; el intento se conserva
  | { kind: 'not-found' } | { kind: 'context-changed' }
  | { kind: 'rejected'; status: number; code: string | null; message: string }
  | { kind: 'uncertain'; cause: UncertainCause; status: number | null; code: string | null; message: string };

export interface ExecuteInput { scope: TaskIntentScope; attemptId: string; taskId: string; expectedRevision: string; values: Record<string, string | number | boolean | null>; }
export interface TaskIntentsClientOptions { fetch?: typeof fetch; base?: string; readTimeoutMs?: number; writeTimeoutMs?: number; maxResponseBytes?: number; }
export interface TaskIntentsClient {
  execute(input: ExecuteInput, hooks?: { onDispatch?: () => void }, signal?: AbortSignal): Promise<ExecuteResult>;
  list(scope: TaskIntentScope, page?: { limit?: number; cursor?: string }, signal?: AbortSignal): Promise<ReadResult<TaskIntentList>>;
  detail(attemptId: string, scope: TaskIntentScope, signal?: AbortSignal): Promise<ReadResult<TaskIntentDetail>>;
  check(attemptId: string, scope: TaskIntentScope, signal?: AbortSignal): Promise<ReadResult<TaskIntentCheck>>;
  accept(attemptId: string, scope: TaskIntentScope, expected: { seq: number; taskRevision: string }, signal?: AbortSignal): Promise<DecisionResult>;
  abandon(attemptId: string, scope: TaskIntentScope, expected: { seq: number }, signal?: AbortSignal): Promise<DecisionResult>;
}

// Mensajes CERRADOS por código público. Un código que no esté aquí no se muestra ni se reenvía: se trata como desconocido.
const MESSAGES: Record<string, string> = {
  TASK_REVISION_CHANGED: 'La tarea cambió mientras la revisabas. No se aplicó tu cambio: vuelve a leerla antes de decidir.',
  TASK_INTENT_REUSED: 'Ese identificador de intento ya pertenece a otra decisión. No se envió este cambio.',
  TASK_INTENT_CONTEXT_CHANGED: 'La copia activa cambió. Se retiró lo que se mostraba: actualiza antes de continuar.',
  TASK_INTENT_CAPACITY: 'El seguimiento duradero de esta copia está lleno: no admite intentos nuevos.',
  TASK_INTENT_TOO_LARGE: 'El cambio es demasiado grande para guardarlo con seguimiento.',
  TASK_INTENT_NOT_FOUND: 'El intento no está disponible en esta copia.',
  TASK_INTENT_FICTION_ONLY: 'El seguimiento de intentos solo funciona con una copia de datos de ensayo.',
  TASK_INTENT_LOCKED: 'La sesión está bloqueada. Desbloquea Plan B para continuar.',
  TASK_INTENT_STORAGE_UNAVAILABLE: 'No se pudo comprobar el intento. Se conserva sin reenviarlo.',
  TASK_INTENT_CHANGED: 'El intento cambió mientras lo consultabas. Vuelve a leerlo antes de decidir.',
  TASK_INTENT_IN_PROGRESS: 'El intento sigue en curso. Espera a que termine y vuelve a comprobarlo.',
  TASK_INTENT_EVIDENCE_CHANGED: 'La tarea cambió desde la lectura que viste. Vuelve a leerla antes de decidir.',
  TASK_INTENT_DETAIL_EXPIRED: 'El detalle de este intento venció: solo se conservan sus metadatos.',
  TASK_INTENT_CURSOR_INVALID: 'La página pedida ya no es válida. Vuelve a cargar la lista.',
  TASK_INTENT_LIST_CHANGED: 'La lista cambió mientras la recorrías. Vuelve a cargarla.',
};
const GENERIC = 'No se pudo completar la operación con el seguimiento de intentos.';
/** Estados HTTP que el servidor decide ANTES de ejecutar nada (cuerpo mal formado, ruta ausente, entrada inválida o demasiado grande, copia no ficticia). */
const BEFORE_EFFECT = new Set([400, 403, 404, 405, 413, 415, 422]);
/** Códigos 409 que acreditan rechazo anterior al escritor. Los demás 409 (p. ej. cambio de intento) no acreditan nada sobre el efecto. */
const DEFINITE_409 = new Set(['TASK_REVISION_CHANGED', 'TASK_INTENT_REUSED', 'TASK_INTENT_CAPACITY']);
const codeOf = (json: unknown): string | null => { const code = (json as { details?: { code?: unknown } } | null)?.details?.code; return typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? code : null; };
const textFor = (code: string | null) => (code ? MESSAGES[code]! : GENERIC);

// ── Transporte con plazo y límite propios ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Raw = { got: true; status: number; json: unknown } | { got: false; cause: 'gate-closed' | 'no-response' | 'timeout' | 'cancelled' | 'unreadable'; status: number | null; dispatched: boolean };
interface Exchange { fetcher: typeof fetch; url: string; init: RequestInit; timeoutMs: number; limit: number; signal?: AbortSignal; beforeSend?: () => void; }
function exchange(options: Exchange): Promise<Raw> {
  const { fetcher, url, init, timeoutMs, limit, signal, beforeSend } = options;
  if (signal?.aborted) return Promise.resolve({ got: false, cause: 'cancelled', status: null, dispatched: false });
  const controller = new AbortController();
  let dispatched = false, settled = false, timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined;
  const stop = new Promise<Raw>(resolve => {
    timer = setTimeout(() => { settled = true; resolve({ got: false, cause: 'timeout', status: null, dispatched }); controller.abort(); }, timeoutMs);
    if (signal) { onAbort = () => { settled = true; resolve({ got: false, cause: 'cancelled', status: null, dispatched }); controller.abort(); }; signal.addEventListener('abort', onAbort, { once: true }); }
  });
  const work = (async (): Promise<Raw> => {
    try { beforeSend?.(); } catch { return { got: false, cause: 'gate-closed', status: null, dispatched: false }; }   // la puerta se cruza en el mismo turno que la entrega al transporte
    // Si la puerta canceló, ya se respondió «no enviado»: entregar la petición lo desmentiría.
    if (settled || controller.signal.aborted) return { got: false, cause: 'cancelled', status: null, dispatched: false };
    let response: Response; dispatched = true;
    try { response = await fetcher(url, { ...init, signal: controller.signal }); } catch { return { got: false, cause: 'no-response', status: null, dispatched }; }
    if (response.status === 401) {
      // Una respuesta que llega después del plazo o de la cancelación es de una consulta que ya nadie espera: no bloquea la sesión de ahora.
      if (!settled && typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
      if (response.body) void response.body.cancel().catch(() => undefined);
      return { got: true, status: 401, json: null };
    }
    let text: string; try { text = await readBoundedText(response, limit); } catch { return { got: false, cause: 'unreadable', status: response.status, dispatched }; }
    try { return { got: true, status: response.status, json: JSON.parse(text) as unknown }; } catch { return { got: false, cause: 'unreadable', status: response.status, dispatched }; }
  })();
  return Promise.race([work, stop]).finally(() => { clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort); });
}

const canonicalScope = (scope: TaskIntentScope) => TaskIntentScope.safeParse(scope);
const sameScope = (a: TaskIntentScope, b: TaskIntentScope) => JSON.stringify(a) === JSON.stringify(b);
const sameOperation = (op: TaskIntentSummary, attemptId: string, scope: TaskIntentScope, taskId?: string) =>
  op.attemptId === attemptId && sameScope(op.scope, scope) && (taskId === undefined || op.taskId === taskId);

export function createTaskIntentsClient(options: TaskIntentsClientOptions = {}): TaskIntentsClient {
  const fetcher = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const base = options.base ?? '', readTimeoutMs = options.readTimeoutMs ?? 15_000, writeTimeoutMs = options.writeTimeoutMs ?? 30_000, limit = options.maxResponseBytes ?? TASK_INTENT_RESPONSE_BYTES;
  const path = (suffix: string) => base + TASK_INTENTS_PATH + suffix;
  const post = (suffix: string, body: unknown, signal: AbortSignal | undefined, beforeSend?: () => void) =>
    exchange({ fetcher, url: path(suffix), init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs: writeTimeoutMs, limit, signal, beforeSend });
  const get = (suffix: string, scope: TaskIntentScope, extra: Record<string, string>, signal: AbortSignal | undefined) =>
    exchange({ fetcher, url: path(suffix) + '?' + new URLSearchParams({ identity: JSON.stringify(scope.identity), contextRevision: scope.contextRevision, ...extra }).toString(), init: { method: 'GET' }, timeoutMs: readTimeoutMs, limit, signal });

  /** Clasificación común de un POST ya despachado cuya respuesta no fue un éxito reconocible. */
  function failed(raw: Raw): Extract<ExecuteResult, { kind: 'uncertain' | 'rejected' | 'not-dispatched' }> | { kind: 'ok'; json: unknown } | { kind: 'conflict'; code: string | null } | { kind: 'expired'; json: unknown } | { kind: 'context' } {
    if (!raw.got) {
      if (raw.cause === 'gate-closed') return { kind: 'not-dispatched', cause: 'gate-closed', message: 'El guardado se canceló antes de enviarse. No se envió nada.' };
      if (!raw.dispatched) return { kind: 'not-dispatched', cause: 'cancelled', message: 'El guardado se canceló antes de enviarse. No se envió nada.' };
      const message = raw.cause === 'timeout' ? 'El servidor tardó demasiado en responder. No se sabe si el cambio se aplicó; no se ha reenviado nada.'
        : raw.cause === 'cancelled' ? 'La espera se canceló después de enviar el cambio. No se sabe si se aplicó; no se ha reenviado nada.'
          : raw.cause === 'unreadable' ? 'La respuesta del servidor no se pudo leer. No se sabe si el cambio se aplicó; no se ha reenviado nada.'
            : 'No llegó la respuesta del servidor. No se sabe si el cambio se aplicó; no se ha reenviado nada.';
      return { kind: 'uncertain', cause: raw.cause, status: raw.status, code: null, message };
    }
    const code = codeOf(raw.json);
    if (raw.status === 401) return { kind: 'uncertain', cause: 'locked', status: 401, code: null, message: 'La sesión se bloqueó mientras se guardaba. No se sabe si el cambio se aplicó; al desbloquear podrás comprobarlo.' };
    if (raw.status >= 200 && raw.status < 300) return { kind: 'ok', json: raw.json };
    if (raw.status === 409 && code === 'TASK_INTENT_CONTEXT_CHANGED') return { kind: 'context' };
    if (raw.status === 409 && code === 'TASK_INTENT_DETAIL_EXPIRED') return { kind: 'expired', json: raw.json };
    if (raw.status === 409 && code !== null && !DEFINITE_409.has(code)) return { kind: 'conflict', code };
    if (BEFORE_EFFECT.has(raw.status) || (raw.status === 409 && code !== null)) return { kind: 'rejected', status: raw.status, code, message: textFor(code) };
    return { kind: 'uncertain', cause: 'server-error', status: raw.status, code, message: 'El servidor respondió con un error (' + raw.status + '). No se sabe si el cambio se aplicó; no se ha reenviado nada.' };
  }
  const contextUncertain = (): Extract<ExecuteResult, { kind: 'uncertain' }> => ({ kind: 'uncertain', cause: 'context-changed', status: 409, code: 'TASK_INTENT_CONTEXT_CHANGED', message: 'La copia cambió mientras se guardaba. No se sabe si el cambio llegó a aplicarse en la copia anterior; no se ha reenviado nada.' });
  const bad = (cause: 'incompatible' | 'mismatched-receipt'): Extract<ExecuteResult, { kind: 'uncertain' }> => ({ kind: 'uncertain', cause, status: null, code: null,
    message: cause === 'incompatible' ? 'La respuesta del servidor no es compatible. No se sabe si el cambio se aplicó; actualiza Plan B y comprueba el intento.' : 'La respuesta no corresponde a este intento. No se sabe si el cambio se aplicó; comprueba el intento.' });

  async function execute(input: ExecuteInput, hooks: { onDispatch?: () => void } = {}, signal?: AbortSignal): Promise<ExecuteResult> {
    const scope = canonicalScope(input.scope);
    const parsed = scope.success ? TaskIntentExecute.safeParse({ ...scope.data, attemptId: input.attemptId, taskId: input.taskId, expectedRevision: input.expectedRevision, values: input.values }) : null;
    if (!scope.success || !parsed?.success) return { kind: 'not-dispatched', cause: 'invalid-request', message: 'El cambio no es válido o es demasiado grande. No se envió nada.' };
    const request = parsed.data, expected = TaskIntentScope.parse({ identity: request.identity, contextRevision: request.contextRevision });
    const raw = await post('/attempts', request, signal, hooks.onDispatch);
    const result = failed(raw);
    if (result.kind === 'context') return contextUncertain();
    if (result.kind === 'conflict') return { kind: 'uncertain', cause: 'server-error', status: 409, code: result.code, message: textFor(result.code) + ' No se sabe si el cambio se aplicó; no se ha reenviado nada.' };
    if (result.kind === 'expired') {
      const details = (result.json as { details?: { operation?: unknown; replayed?: unknown } } | null)?.details, summary = TaskIntentSummary.safeParse(details?.operation);
      if (!summary.success || details?.replayed !== true) return bad('incompatible');
      return sameOperation(summary.data, request.attemptId, expected, request.taskId) ? { kind: 'detail-expired', operation: summary.data } : bad('mismatched-receipt');
    }
    if (result.kind !== 'ok') return result;
    const execution = TaskIntentExecution.safeParse(result.json);
    if (!execution.success) return bad('incompatible');
    return sameOperation(execution.data.operation, request.attemptId, expected, request.taskId) ? { kind: 'execution', execution: execution.data } : bad('mismatched-receipt');
  }

  async function read<T>(suffix: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, scope: TaskIntentScope, extra: Record<string, string>, signal: AbortSignal | undefined, matches: (value: T, scope: TaskIntentScope) => boolean): Promise<ReadResult<T>> {
    const canonical = canonicalScope(scope); if (!canonical.success) return { kind: 'rejected', status: 422, code: null, message: GENERIC };
    const raw = await get(suffix, canonical.data, extra, signal);
    if (!raw.got) return { kind: 'unavailable', cause: raw.cause === 'gate-closed' ? 'cancelled' : raw.cause, status: raw.status, message: raw.cause === 'timeout' ? 'La consulta tardó demasiado. Inténtalo de nuevo.' : raw.cause === 'cancelled' ? 'La consulta se canceló.' : 'No se pudo leer la respuesta del servidor.' };
    const code = codeOf(raw.json);
    if (raw.status === 401) return { kind: 'locked' };
    if (raw.status === 404) return { kind: 'not-found' };
    if (raw.status === 409 && code === 'TASK_INTENT_CONTEXT_CHANGED') return { kind: 'context-changed' };
    if (raw.status < 200 || raw.status >= 300) return BEFORE_EFFECT.has(raw.status) || raw.status === 409 ? { kind: 'rejected', status: raw.status, code, message: textFor(code) } : { kind: 'unavailable', cause: 'server-error', status: raw.status, message: 'El servidor no pudo responder (' + raw.status + '). Inténtalo de nuevo.' };
    const value = schema.safeParse(raw.json);
    if (!value.success) return { kind: 'unavailable', cause: 'incompatible', status: raw.status, message: 'La respuesta del servidor no es compatible. Actualiza Plan B antes de continuar.' };
    return matches(value.data, canonical.data) ? { kind: 'ok', value: value.data } : { kind: 'unavailable', cause: 'mismatched-receipt', status: raw.status, message: 'La respuesta no corresponde a esta copia o a este intento.' };
  }
  async function decide(action: 'accept' | 'abandon', attemptId: string, body: unknown, scope: TaskIntentScope, signal: AbortSignal | undefined): Promise<DecisionResult> {
    const parsed = (action === 'accept' ? TaskIntentAccept : TaskIntentAbandon).safeParse(body), canonical = canonicalScope(scope);
    if (!parsed.success || !canonical.success) return { kind: 'rejected', status: 422, code: null, message: GENERIC };
    const result = failed(await post('/' + encodeURIComponent(attemptId) + '/' + action, parsed.data, signal));
    if (result.kind === 'not-dispatched') return { kind: 'uncertain', cause: 'cancelled', status: null, code: null, message: result.message };
    if (result.kind === 'context') return { kind: 'context-changed' };
    if (result.kind === 'conflict') return { kind: 'conflict', code: result.code, message: textFor(result.code) };
    if (result.kind === 'expired') return { kind: 'conflict', code: 'TASK_INTENT_DETAIL_EXPIRED', message: textFor('TASK_INTENT_DETAIL_EXPIRED') };
    if (result.kind === 'rejected') return result.status === 404 ? { kind: 'not-found' } : result.status === 409 ? { kind: 'conflict', code: result.code, message: result.message } : result;
    if (result.kind !== 'ok') return result;
    const detail = TaskIntentDetail.safeParse(result.json);
    if (!detail.success) return bad('incompatible');
    const op = detail.data.operation, wanted = action === 'accept' ? 'accepted-read' : 'abandoned';
    return sameOperation(op, attemptId, canonical.data) && op.outcome === wanted ? { kind: 'ok', detail: detail.data } : bad('mismatched-receipt');
  }

  return {
    execute,
    list: (scope, page = {}, signal) => read('', TaskIntentList, scope, { ...(page.limit === undefined ? {} : { limit: String(page.limit) }), ...(page.cursor === undefined ? {} : { cursor: page.cursor }) }, signal,
      (value, sent) => sameScope(value.scope, sent)),
    detail: (attemptId, scope, signal) => read('/' + encodeURIComponent(attemptId), TaskIntentDetail, scope, {}, signal, (value, sent) => sameOperation(value.operation, attemptId, sent)),
    check: (attemptId, scope, signal) => read('/' + encodeURIComponent(attemptId) + '/check', TaskIntentCheck, scope, {}, signal, (value, sent) => sameOperation(value.operation, attemptId, sent)),
    accept: (attemptId, scope, expected, signal) => decide('accept', attemptId, { ...scope, expectedSeq: expected.seq, expectedTaskRevision: expected.taskRevision }, scope, signal),
    abandon: (attemptId, scope, expected, signal) => decide('abandon', attemptId, { ...scope, expectedSeq: expected.seq, confirmed: true }, scope, signal),
  };
}
