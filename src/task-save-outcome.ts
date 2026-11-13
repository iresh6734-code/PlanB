import { contextKey, type TaskContext } from '../shared/local-task-focus.js';
import type { CrmRecord, Entity, FieldValue } from '../shared/model.js';
import {
  canAccept, canDismiss, canRetry, canRetryQueue, canVerify, isUnresolved, refreshFailure, REFRESH_REASONS, rejectionMessage,
  type CompactTaskSaveReceipt, type OperationEvidence, type OperationStatus, type RevisedResult, type TaskSaveOperation,
} from '../shared/task-save-outcome.js';
import { browserTransport, saveTask, verifyAfterUncertain, type SaveOutcome, type Transport, type Verification } from './local-task-focus-client.js';

// Propietario de los resultados de guardado de tareas (unidad 136, problema D7). Vive MÁS TIEMPO que la ficha: la ficha le entrega
// la operación y puede cerrarse; el resultado (confirmado, rechazado o incierto) se muestra después en una superficie montada.
//
// Garantías de ESTE módulo (solo dentro de esta ventana, en memoria):
//   · la operación se registra ANTES de enviar, ligada a instalación, captura, ID de tarea y un intento local;
//   · nunca reenvía un PATCH: un reintento es siempre una llamada explícita de la persona y solo si consta que no se envió o que la
//     lectura (ligada a la copia original) muestra la tarea sin el cambio;
//   · no hay dos operaciones sin resolver para la misma tarea y copia (doble clic, dos fichas): la segunda se rechaza sin enviar;
//   · verificar solo LEE; un valor coincidente no prueba quién lo escribió;
//   · un fallo de la recarga de la cola nunca altera un guardado confirmado y reintentarla no escribe.
// Ciclo de vida (170): `dispose()` termina al propietario. Lo que AÚN NO se despachó no se enviará nunca (la comprobación se aborta y la puerta
// de `onDispatch` rechaza); lo que ya se despachó NO se cancela ni se deshace: el servidor puede haberlo aplicado y su resultado se sigue
// registrando con honestidad, pero ya no notifica a nadie. Un propietario nuevo empieza vacío: nada se hereda ni se recupera.
// Lo que NO garantiza: nada entre ventanas o procesos (otra pestaña puede guardar el mismo campo: gana el último), ni persistencia
// tras recargar o cerrar la app (todo se pierde), ni CAS/idempotencia en el servidor (la API antigua no los tiene; 128 aporta una
// comparación de revisión bajo un único escritor, no idempotencia por intención).

/**
 * Lo que una estrategia puede devolver: lo de siempre (`SaveOutcome`) más la escritura CONDICIONADA a la revisión. `unchanged` = el servidor confirmó que ya tenía esos valores (no-op: sin
 * historial nuevo); `saved` con `revised` conserva el token y el registro de la MISMA lectura validada. Un no-op nunca se anuncia como otra escritura.
 */
export type StrategyOutcome = SaveOutcome
  | { kind: 'unchanged'; record: CrmRecord; revised: RevisedResult }
  | { kind: 'saved'; record: CrmRecord; revised: RevisedResult }
  | { kind: 'compact-ack'; receipt: CompactTaskSaveReceipt };
/**
 * `attemptId`: el UUID de la operación del gestor, el MISMO que ve la superficie de resultados (`TaskSaveOperation.attemptId`). El gestor lo genera ANTES de ejecutar la estrategia y lo aporta siempre; es
 * opcional en esta interfaz solo por compatibilidad con quien construya la petición a mano. Las estrategias actuales (legado y revisión) lo ignoran. Una estrategia que lo necesite (la A4, que lo envía al
 * servidor como ID idempotente) debe EXIGIR uno válido antes de despachar y NO generar otro: un segundo ID rompería la asociación con la operación. Con un `newId` inyectado (pruebas) puede no ser un UUID.
 * Un reintento humano es OTRA operación con otro `attemptId`; repetir una consulta del mismo intento conserva el ID.
 */
export interface SaveRequest { taskId: string; baseline: CrmRecord; entity: Entity; patch: Record<string, FieldValue>; context: TaskContext; revision?: string | null; signal?: AbortSignal; attemptId?: string; }
/** `attemptId`: el de la operación que se comprueba (la verificación A4 es una lectura por ese ID; no crea ni sustituye intentos). */
export interface VerifyRequest { taskId: string; baseline: CrmRecord; patch: Record<string, FieldValue>; context: TaskContext; revision: string | null; attemptId?: string; }
/**
 * Estrategia de escritura/verificación. Hoy la de 123 (API antigua); 128 se adopta escribiendo otra, sin tocar el gestor.
 * CONTRATO: `hooks.onDispatch()` se llama en el mismo turno, justo ANTES de entregar la petición de escritura al transporte, y puede LANZAR
 * (el gestor ya terminó o la operación se canceló): en ese caso no debe enviarse nada y el error debe propagarse. Una estrategia que escriba
 * sin llamarlo queda fuera de la garantía de `dispose()`.
 */
export interface SaveStrategy {
  save(request: SaveRequest, hooks: { onDispatch: () => void }): Promise<StrategyOutcome>;
  verify(request: VerifyRequest): Promise<Verification>;
}
export const legacyStrategy = (transport: Transport = browserTransport()): SaveStrategy => ({
  save: (request, hooks) => saveTask({ taskId: request.taskId, baseline: request.baseline, entity: request.entity, patch: request.patch, context: request.context, signal: request.signal },
    { ...transport, fetch: (input, init) => { if (init?.method === 'PATCH') hooks.onDispatch(); return transport.fetch(input, init); } }),
  verify: request => verifyAfterUncertain({ taskId: request.taskId, baseline: request.baseline, patch: request.patch, context: request.context }, transport),
});

export interface SubmitInput { taskId: string; taskLabel: string; baseline: CrmRecord; entity: Entity; patch: Record<string, FieldValue>; context: TaskContext; revision?: string | null; signal?: AbortSignal; }
export type Submission =
  | { kind: 'started'; attemptId: string; done: Promise<TaskSaveOperation> }   // `done` resuelve cuando la operación se asienta (no espera a la cola)
  | { kind: 'busy'; existing: TaskSaveOperation }                              // ya hay un intento sin resolver para esta tarea y copia: no se envía nada
  | { kind: 'refused'; reason: string };
export interface ControllerOptions {
  strategy?: SaveStrategy;
  /** Solo lee. Recibe el registro confirmado o aceptado, o null si el servidor devolvió un acuse compacto. */
  onConfirmed?: (record: CrmRecord | null, operation: TaskSaveOperation) => Promise<void>;
  queueTimeoutMs?: number; maxOperations?: number; now?: () => string; newId?: () => string;
}
/** Qué dejó pendiente `dispose()`. `notDispatched`: canceladas antes de enviar (nunca saldrán). `dispatched`: ya enviadas y sin resultado (en vuelo o inciertas): NO se cancelaron. */
export interface DisposeSummary { notDispatched: number; dispatched: number; }
export interface TaskSaveOutcomes {
  submit(input: SubmitInput): Submission;
  verify(attemptId: string): Promise<void>;
  /**
   * La vista de Hoy se registra al montarse y se retira al desmontarse; las confirmaciones que llegaron sin consumidor esperan al siguiente.
   * Cambiar de consumidor (otra función, o `null`) invalida cualquier recarga en curso del anterior: su resultado, bueno o malo, NO se atribuye
   * al nuevo. `queue.ok` significa «el consumidor vigente en ese momento completó una lectura posterior a la confirmación»; cambiar de consumidor
   * después NO relee lo ya validado (el siguiente montaje de Hoy lee de nuevo por su cuenta). Registrar la misma función otra vez no hace nada.
   */
  setOnConfirmed(callback: ControllerOptions['onConfirmed'] | null): void;
  accept(attemptId: string): boolean;
  retry(attemptId: string): Submission;
  retryQueue(attemptId: string): Promise<void>;
  dismiss(attemptId: string): boolean;
  /**
   * Termina al propietario. Idempotente (las siguientes llamadas devuelven el mismo resumen). Después: `submit`/`retry` → `refused`; `verify`,
   * `accept`, `retryQueue` y `setOnConfirmed` no hacen nada; los suscriptores reciben a lo sumo UN aviso final (con el gestor ya cerrado) y ningún consumidor. Las operaciones sin despachar pasan a
   * `not_sent` («la sesión terminó antes de enviar») y NUNCA producirán un PATCH; las ya despachadas siguen su curso real y no se presentan como canceladas.
   */
  dispose(): DisposeSummary;
  get(attemptId: string): TaskSaveOperation | undefined;
  list(): readonly TaskSaveOperation[];
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly TaskSaveOperation[];
  /** Espera a que no haya recargas de cola pendientes (para pruebas y cierres ordenados). */
  whenIdle(): Promise<void>;
}

const DISPOSED_REASON = 'La sesión terminó: este seguimiento ya no admite guardados.';
const cancelled = () => new DOMException('Cancelada', 'AbortError');

export function createTaskSaveOutcomes(options: ControllerOptions = {}): TaskSaveOutcomes {
  const strategy = options.strategy ?? legacyStrategy(), now = options.now ?? (() => new Date().toISOString()), newId = options.newId ?? (() => crypto.randomUUID());
  const queueTimeout = options.queueTimeoutMs ?? 20_000, maxOperations = options.maxOperations ?? 50;
  let ops: readonly TaskSaveOperation[] = [], onConfirmed = options.onConfirmed ?? null, disposed = false, summary: DisposeSummary | null = null;
  let consumer = 0;                         // generación del consumidor actual: cambia al registrar otra función o null
  const awaiting = new Set<string>();       // confirmadas/aceptadas que aún no han podido actualizar la cola porque no había consumidor
  const refreshing = new Map<string, number>();   // operación → recarga vigente (solo la última cuenta)
  let refreshSeq = 0;
  const cancels = new Map<string, () => void>();   // cortan la espera de una recarga que dejó de ser la vigente (no queda temporizador ni promesa pendiente)
  const STALE = Symbol('stale');
  const cancelAll = () => { for (const cancel of [...cancels.values()]) cancel(); cancels.clear(); };
  const listeners = new Set<() => void>(), pending = new Set<Promise<unknown>>(), inputs = new Map<string, { entity: Entity; signal?: AbortSignal }>();
  const aborts = new Map<string, AbortController>();   // un control por operación sin despachar; dispose() los aborta
  const emit = () => { if (!disposed) listeners.forEach(listener => listener()); };
  const key = (op: Pick<TaskSaveOperation, 'context' | 'taskId'>) => contextKey(op.context) + '|' + op.taskId;
  const get = (id: string) => ops.find(op => op.attemptId === id);
  function update(id: string, change: Partial<TaskSaveOperation>) {
    if (!get(id)) return;
    ops = ops.map(op => op.attemptId === id ? { ...op, ...change } : op); emit();
  }
  function trim() {
    // Solo se descartan operaciones ya resueltas y sin nada pendiente; las que necesitan atención no se pierden por el tope.
    while (ops.length > maxOperations) {
      const victim = ops.find(op => !isUnresolved(op) && op.status !== 'rejected' && op.status !== 'not_sent' && op.queue.status !== 'failed' && op.queue.status !== 'updating');
      if (!victim) return;
      ops = ops.filter(op => op !== victim); inputs.delete(victim.attemptId);
    }
  }
  const settleBase = { phase: 'done' as const, settledAt: '' };
  function settle(id: string, status: OperationStatus, detail: TaskSaveOperation['detail'], extra: Partial<TaskSaveOperation> = {}) {
    update(id, { ...settleBase, settledAt: now(), status, detail, ...extra });
  }
  function track<T>(promise: Promise<T>) { pending.add(promise); void promise.finally(() => pending.delete(promise)); return promise; }

  // Recarga posterior a la confirmación. Cada llamada es una «recarga» con su número y el consumidor con el que empezó: si el consumidor cambia
  // (o llega otra recarga) mientras tanto, el resultado de esta —éxito o rechazo— se descarta y nunca se atribuye al consumidor nuevo.
  async function refreshQueue(id: string) {
    const op = get(id);
    if (disposed || !op || (!op.record && !op.compactReceipt)) return;
    if (!onConfirmed) { refreshing.delete(id); awaiting.add(id); update(id, { queue: { status: 'idle', reason: 'esperando una vista de Hoy' } }); return; }
    awaiting.delete(id);
    cancels.get(id)?.();
    const mine = ++refreshSeq, generation = consumer, callback = onConfirmed; refreshing.set(id, mine);
    const dropped = new Promise<never>((_, reject) => { cancels.set(id, () => reject(STALE)); });
    update(id, { queue: { status: 'updating', reason: '' } });
    const current = () => !disposed && refreshing.get(id) === mine && consumer === generation;
    let timer: ReturnType<typeof setTimeout> | undefined, failure: unknown, failed = false, timedOut = false;
    try {
      await Promise.race([Promise.resolve().then(() => callback(op.record, op)), new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('timeout')); }, queueTimeout); }), dropped]);
    } catch (error) { failed = true; failure = error; }
    finally { clearTimeout(timer); }
    if (!current()) return;
    cancels.delete(id);   // otro consumidor, otra recarga o el propietario terminó: este resultado ya no es el vigente
    refreshing.delete(id);
    if (!failed) { update(id, { queue: { status: 'ok', reason: '' } }); return; }
    const { cause, reason } = timedOut ? { cause: 'timeout' as const, reason: REFRESH_REASONS.timeout } : refreshFailure(failure);
    update(id, { queue: { status: 'failed', reason, cause } });
  }

  function mapOutcome(id: string, outcome: StrategyOutcome, dispatched: boolean) {
    if (get(id)?.status !== 'in_flight') return;   // ya se asentó (p. ej. dispose() antes de despachar): una respuesta posterior no la reescribe
    switch (outcome.kind) {
      case 'saved': settle(id, 'confirmed', { kind: 'saved', message: 'El servidor devolvió la tarea.' }, { record: outcome.record, revised: 'revised' in outcome ? outcome.revised : null }); void track(refreshQueue(id)); return;
      case 'unchanged': settle(id, 'confirmed', { kind: 'unchanged', message: 'El servidor confirmó que la tarea ya tenía esos valores.' }, { record: outcome.record, revised: outcome.revised }); void track(refreshQueue(id)); return;
      case 'compact-ack':
        settle(id, 'confirmed', { kind: 'compact-ack', message: 'El servidor confirmó este intento.' }, { compactReceipt: structuredClone(outcome.receipt) });
        void track(refreshQueue(id));
        return;
      case 'invalid': settle(id, 'rejected', { kind: 'invalid', message: outcome.message, fields: outcome.fields, httpStatus: 422 }); return;
      case 'rejected': settle(id, 'rejected', { kind: 'rejected', message: rejectionMessage(outcome.status, outcome.message), httpStatus: outcome.status, revisionConflict: (outcome as { revisionConflict?: boolean }).revisionConflict }); return;
      case 'missing': if (dispatched) settle(id, 'rejected', { kind: 'missing', message: rejectionMessage(404, ''), httpStatus: 404 }); else settle(id, 'not_sent', { kind: 'missing', message: rejectionMessage(404, '') }); return;
      case 'locked': if (dispatched) settle(id, 'rejected', { kind: 'locked', message: rejectionMessage(401, ''), httpStatus: 401 }); else settle(id, 'not_sent', { kind: 'locked', message: rejectionMessage(401, '') }); return;
      case 'conflict': settle(id, 'not_sent', { kind: 'conflict', message: 'Otra edición cambió: ' + outcome.conflicts.map(c => c.label).join(', ') + '.' }); return;
      case 'context-changed': settle(id, 'not_sent', { kind: 'context-changed', message: outcome.message }); return;
      case 'preflight-failed': settle(id, 'not_sent', { kind: 'preflight-failed', message: outcome.message }); return;
      case 'uncertain': settle(id, 'uncertain', { kind: 'uncertain', message: outcome.message }); return;
    }
  }

  async function run(id: string, request: SaveRequest) {
    let dispatched = false, refused = false, outcome: StrategyOutcome;
    const hooks = { onDispatch: () => {
      // Puerta ÚNICA y síncrona de la escritura: si el propietario terminó o la operación ya no está en curso, no se despacha nada.
      if (disposed || get(id)?.status !== 'in_flight' || aborts.get(id)?.signal.aborted) { refused = true; throw cancelled(); }
      dispatched = true; aborts.delete(id); update(id, { phase: 'sent' });
    } };
    try { outcome = await strategy.save(request, hooks); }
    catch { outcome = dispatched ? { kind: 'uncertain', message: 'El envío falló de forma inesperada; no se sabe si se aplicó.' } : { kind: 'preflight-failed', message: 'Se canceló antes de enviar. No se ha guardado nada.' }; }
    // La puerta rechazó la escritura: nada llegó al transporte. Una estrategia (como `saveTask`) puede haber convertido ese error en «incierto»;
    // eso sería falso —no salió ningún PATCH—, así que prevalece el hecho de que la puerta cerró.
    if (refused && !dispatched && outcome.kind !== 'preflight-failed') outcome = { kind: 'preflight-failed', message: 'Se canceló antes de enviar. No se ha guardado nada.' };
    aborts.delete(id);
    mapOutcome(id, outcome, dispatched);
    return get(id)!;
  }

  // Única puerta de entrada de operaciones (submit Y retry). Si ya hay otra operación sin resolver para esta tarea y copia —en comprobación,
  // enviada o incierta— se devuelve `busy` SIN registrar un intento, sin enviar y sin tocar ni el intento reciente ni el anterior (no se marca
  // `supersededBy`). `previous` queda excluido de la comparación: reintentar un intento incierto lo sustituye, pero no puede coexistir con otro.
  function start(input: SubmitInput, previous: TaskSaveOperation | null): Submission {
    if (disposed) return { kind: 'refused', reason: DISPOSED_REASON };
    const exclusive = ops.find(op => isUnresolved(op) && key(op) === contextKey(input.context) + '|' + input.taskId && op.attemptId !== previous?.attemptId);
    if (exclusive) return { kind: 'busy', existing: exclusive };
    const patch = structuredClone(input.patch);
    if (!Object.keys(patch).length) return { kind: 'refused', reason: 'No hay cambios que guardar.' };
    const attemptId = newId();
    const op: TaskSaveOperation = {
      attemptId, taskId: input.taskId, taskLabel: input.taskLabel, context: structuredClone(input.context), baseline: structuredClone(input.baseline), patch,
      fieldLabels: Object.fromEntries(input.entity.fields.map(field => [field.key, field.label])), revision: input.revision ?? null,
      startedAt: now(), settledAt: null, phase: 'checking', status: 'in_flight', detail: { kind: 'in_flight', message: '' }, record: null, evidence: null, verifying: false,
      queue: { status: 'idle', reason: '' }, revised: null, attemptNumber: previous ? previous.attemptNumber + 1 : 1, previousAttemptId: previous?.attemptId ?? null, supersededBy: null,
    };
    // Control propio por operación, encadenado a la señal de quien llama: dispose() lo aborta para cortar la comprobación previa.
    const control = new AbortController(); aborts.set(attemptId, control);
    if (input.signal) { if (input.signal.aborted) control.abort(); else input.signal.addEventListener('abort', () => control.abort(), { once: true }); }
    ops = [...ops.map(existing => previous && existing.attemptId === previous.attemptId ? { ...existing, supersededBy: attemptId } : existing), op];   // se registra ANTES de enviar
    inputs.set(attemptId, { entity: input.entity, signal: input.signal }); trim(); emit();
    const done = track(run(attemptId, { taskId: op.taskId, baseline: op.baseline, entity: input.entity, patch: op.patch, context: op.context, revision: op.revision, signal: control.signal, attemptId }));
    return { kind: 'started', attemptId, done };
  }

  return {
    submit(input) { return start(input, null); },
    async verify(attemptId) {
      const op = get(attemptId);
      if (disposed || !op || !canVerify(op)) return;
      update(attemptId, { verifying: true });
      let verdict: Verification;
      try { verdict = await strategy.verify({ taskId: op.taskId, baseline: op.baseline, patch: op.patch, context: op.context, revision: op.revision, attemptId: op.attemptId }); } catch { verdict = { kind: 'unknown' }; }
      const evidence: OperationEvidence = verdict.kind === 'read' ? { kind: verdict.evidence, record: verdict.record, at: now() } : { kind: verdict.kind, record: null, at: now() };
      update(attemptId, { verifying: false, evidence });
    },
    setOnConfirmed(callback) {
      if (disposed) return;
      const next = callback ?? null;
      if (next === onConfirmed) return;   // el mismo consumidor otra vez: ni recargas duplicadas ni invalidar la que ya está en curso
      onConfirmed = next; consumer++; cancelAll();
      if (!next) {   // sin consumidor: lo que se estaba recargando vuelve a esperar a la siguiente vista (el resultado del anterior se descarta)
        for (const id of [...refreshing.keys()]) { refreshing.delete(id); awaiting.add(id); update(id, { queue: { status: 'idle', reason: 'esperando una vista de Hoy' } }); }
        return;
      }
      // Recargas en curso del consumidor anterior: se relanzan con el nuevo (solo lecturas); su resultado antiguo se descartará.
      for (const id of [...refreshing.keys(), ...awaiting]) void track(refreshQueue(id));
    },
    accept(attemptId) {
      const op = get(attemptId);
      if (disposed || !op || !canAccept(op)) return false;
      settle(attemptId, 'accepted', { kind: 'accepted', message: 'La persona aceptó el estado leído.' }, { record: op.evidence!.record });
      void track(refreshQueue(attemptId)); return true;
    },
    retry(attemptId) {
      if (disposed) return { kind: 'refused', reason: DISPOSED_REASON };
      const op = get(attemptId), saved = inputs.get(attemptId);
      if (!op || !saved) return { kind: 'refused', reason: 'La operación ya no existe.' };
      if (!canRetry(op)) return { kind: 'refused', reason: 'Reenviar solo es posible si consta que no se envió o la lectura la muestra sin el cambio.' };
      const baseline = op.status === 'uncertain' && op.evidence?.record ? op.evidence.record : op.baseline;   // tras «sin cambios» se parte del estado leído
      return start({ taskId: op.taskId, taskLabel: op.taskLabel, baseline, entity: saved.entity, patch: op.patch, context: op.context, revision: op.revision, signal: saved.signal }, op);
    },
    async retryQueue(attemptId) { const op = get(attemptId); if (!disposed && op && canRetryQueue(op)) await track(refreshQueue(attemptId)); },
    dismiss(attemptId) {
      const op = get(attemptId);
      if (!op || !canDismiss(op)) return false;
      ops = ops.filter(item => item !== op); inputs.delete(attemptId); refreshing.delete(attemptId); awaiting.delete(attemptId); cancels.get(attemptId)?.(); cancels.delete(attemptId); emit(); return true;
    },
    dispose() {
      if (summary) return summary;
      // 1) El cierre y el resumen quedan FIJADOS antes de ejecutar nada ajeno (suscriptores, listeners de AbortSignal, consumidores): a partir de aquí
      //    `start`, `retry` y la puerta de `onDispatch` rechazan, y una reentrada a `dispose()` devuelve este mismo resumen. Solo se clasifica; no se llama a nadie.
      const cancelling = ops.filter(op => op.status === 'in_flight' && op.phase === 'checking');
      const controls = cancelling.map(op => aborts.get(op.attemptId));
      const sent = ops.filter(op => !op.supersededBy && ((op.status === 'in_flight' && op.phase === 'sent') || op.status === 'uncertain')).length;
      summary = { notDispatched: cancelling.length, dispatched: sent };
      const watchers = [...listeners];
      disposed = true; onConfirmed = null; consumer++; cancelAll(); awaiting.clear(); refreshing.clear(); listeners.clear(); inputs.clear(); aborts.clear();
      // 2) Con el gestor ya cerrado: lo que no se despachó se asienta como «no enviado» y los suscriptores reciben UN aviso final (si uno intenta
      //    registrar otro guardado, `start` lo rechaza). Después se abortan las comprobaciones. Ningún callback ajeno puede romper el cierre.
      for (const op of cancelling) settle(op.attemptId, 'not_sent', { kind: 'disposed', message: 'La sesión terminó antes de enviar: no salió ningún guardado.' });
      if (cancelling.length) for (const watcher of watchers) { try { watcher(); } catch { /* un suscriptor que falla no impide terminar */ } }
      for (const control of controls) { try { control?.abort(); } catch { /* ídem */ } }
      return summary;
    },
    get, list: () => ops, getSnapshot: () => ops,
    subscribe(listener) { if (disposed) return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; },
    async whenIdle() { while (pending.size) await Promise.allSettled([...pending]); },
  };
}
