import { z } from 'zod';
import type { Evidence, TaskContext } from '../shared/local-task-focus.js';
import type { CrmRecord } from '../shared/model.js';
import { TaskIntentIdentity, TaskIntentScope, type TaskIntentExecution, type TaskIntentSummary } from '../shared/task-intents.js';
import type { RevisedResult } from '../shared/task-save-outcome.js';
import type { Verification } from './local-task-focus-client.js';
import { createTaskIntentsClient, type ExecuteResult, type TaskIntentsClient, type TaskIntentsClientOptions, type UnavailableCause, type UncertainCause } from './local-task-intents-client.js';
import type { SaveRequest, SaveStrategy, StrategyOutcome, VerifyRequest } from './task-save-outcome.js';

// ESTRATEGIA A4 (unidad CLAUDE-A4-CLIENT-STRATEGY): el guardado de una tarea pasa a ser UNA petición de ejecución duradera (`POST /api/v7/task-intents/attempts`) con el ID que el gestor ya creó. No hay PATCH separado,
// ni un segundo UUID, ni reenvío para «resolver» una respuesta perdida: tras un acuse perdido solo se LEE (`GET …/check`).
//
// SIETE ESTADOS que esta capa separa y nunca mezcla (cada uno con su prueba):
//   1. `not-sent`     la puerta se cerró, la entrada era inválida o faltó un dato ANTES del transporte → cero POST.
//   2. `uncertain`    el POST pudo salir y no hay un acuse válido (sin respuesta, plazo, cancelación, 5xx, 401, recibo ajeno, intento sin asentar…) → solo consulta explícita por GET. Un 503 NUNCA basta para decir «no enviado».
//   3. `acknowledged` acuse duradero DEL SERVIDOR (`provenance: 'server-ack'`): se conserva aunque falte `writeResult` (replay, respuesta grande) o falle la recarga de Hoy; sin `writeResult` NO se reconstruye registro.
//   4. `no-op`        el servidor confirmó `changed:false`: nada nuevo se escribió; no es trabajo nuevo.
//   5. lectura `applied` (`check`): los valores coinciden. NO atribuye autoría (`attribution: 'unknown'`) ni inventa un acuse.
//   6. `accepted-read` decisión HUMANA con secuencia, distinta de `server-ack` (`source: 'person-accepted-read'`).
//   7. `detail-expired` / `unavailable` por tamaño o vencimiento: conserva los metadatos; no hay base, parche ni CrmRecord reconstruidos.
// La recarga de Hoy es OTRA dimensión: pertenece al gestor (`onConfirmed`); un fallo suyo no cambia nada de lo anterior y reintentarla solo hace lecturas.
//
// CONFORMIDAD. Probado contra el servicio del autor (316, en revisión, NO aceptado) y contra transportes falsos; el contrato público (311) está aceptado. No fija como definitivo ningún diagnóstico de 316/319.
// INTERFAZ PENDIENTE (gestor): `StrategyOutcome` aún no sabe expresar «confirmado por el servidor SIN registro». `asSaveStrategy()` lo degrada a `uncertain` con un texto que dice que el servidor sí confirmó; la
// confirmación íntegra vive en `IntentOutcome` y exige ampliar el gestor (`src/task-save-outcome.ts` / `shared/task-save-outcome.ts`) en su propia unidad. Hasta entonces no se monta como estrategia de Hoy.
export type NotSentCause = 'gate-closed' | 'invalid-request' | 'cancelled' | 'missing-attempt-id' | 'missing-scope' | 'missing-revision';
export type IntentUncertainCause = UncertainCause | 'unsettled';
interface Settled { operation: TaskIntentSummary; replayed: boolean }
export type IntentOutcome =
  | { kind: 'not-sent'; cause: NotSentCause; message: string }
  | ({ kind: 'acknowledged' | 'no-op'; source: 'server-ack'; changed: boolean | null; resultingRevision: string | null; record: CrmRecord | null; revised: RevisedResult | null; writeResultOmitted: 'response-too-large' | 'not-retained' | null } & Settled)
  | ({ kind: 'accepted-read'; source: 'person-accepted-read'; seq: number } & Settled)
  | ({ kind: 'abandoned' } & Settled)
  | { kind: 'closed-by-server'; outcome: 'rejected' | 'not-sent'; operation: TaskIntentSummary }
  | { kind: 'detail-expired'; operation: TaskIntentSummary }
  | { kind: 'rejected'; status: number; code: string | null; message: string; revisionConflict: boolean }
  | { kind: 'uncertain'; cause: IntentUncertainCause; status: number | null; message: string; operation: TaskIntentSummary | null };

export type IntentCheckReason = 'response-too-large' | 'read-failed' | 'detail-expired' | 'task-missing';
/** `attribution: 'unknown'`: una lectura `applied` solo prueba que los valores coinciden, nunca quién los escribió. `recorded` es lo que el SERVIDOR tiene asentado de este intento (p. ej. su acuse tras reiniciar), separado de la lectura de la tarea. */
export type IntentVerification =
  | { kind: 'read'; evidence: Evidence; record: CrmRecord; taskRevision: string; readAt: string; operation: TaskIntentSummary; attribution: 'unknown'; recorded: IntentOutcome }
  | { kind: 'unavailable'; reason: IntentCheckReason; operation: TaskIntentSummary; recorded: IntentOutcome }
  | { kind: 'locked' } | { kind: 'context-changed' } | { kind: 'not-found' }
  | { kind: 'unreachable'; cause: UnavailableCause; message: string };

/** Identidad de la copia (seis campos) + pin que publica el servidor. `null` si la copia no está lista o algún campo no cumple el contrato: sin identidad completa no se envía nada. */
export function intentScopeFromContext(context: TaskContext, contextRevision: string | null): TaskIntentScope | null {
  if (!context.ready || !contextRevision) return null;
  const identity = TaskIntentIdentity.safeParse({ instanceId: context.instanceId, snapshotId: context.snapshotId, capturedAt: context.capturedAt, captureStartedAt: context.captureStartedAt, accountId: context.accountId, generatedAt: context.generatedAt });
  const scope = identity.success ? TaskIntentScope.safeParse({ identity: identity.data, contextRevision }) : null;
  return scope?.success ? scope.data : null;
}

const notSent = (cause: NotSentCause, message: string): IntentOutcome => ({ kind: 'not-sent', cause, message });
const uncertain = (cause: IntentUncertainCause, status: number | null, message: string, operation: TaskIntentSummary | null = null): IntentOutcome => ({ kind: 'uncertain', cause, status, message, operation });
const UNSETTLED = 'El servidor conservó el intento pero no llegó a asentar su resultado. No se sabe si el cambio se aplicó; compruébalo leyendo, no se reenvía nada.';

/** Traduce un estado persistido del servidor (acuse de ejecución, replay o resumen) a UN estado de esta capa. Nunca inventa un registro ni una autoría. */
export function outcomeFromOperation(operation: TaskIntentSummary, extra: { replayed: boolean; writeResult?: TaskIntentExecution['writeResult']; writeResultOmitted?: TaskIntentExecution['writeResultOmitted'] }): IntentOutcome {
  const { replayed } = extra;
  if (operation.phase === 'attempt' || operation.outcome === null) return uncertain('unsettled', null, UNSETTLED, operation);
  switch (operation.outcome) {
    case 'acknowledged': {
      const ack = operation.acknowledgement, write = extra.writeResult ?? null;
      const base = { source: 'server-ack' as const, operation, replayed, changed: ack ? ack.changed : write ? write.changed : null, resultingRevision: ack ? ack.resultingRevision : write ? write.current.revision : null,
        record: write ? write.current.record : null, revised: write ? { changed: write.changed, token: write.current.revision, current: write.current.record } : null, writeResultOmitted: extra.writeResultOmitted ?? (write ? null : 'not-retained') };
      return { kind: base.changed === false ? 'no-op' : 'acknowledged', ...base };
    }
    case 'accepted-read': return { kind: 'accepted-read', source: 'person-accepted-read', seq: operation.seq, operation, replayed };
    case 'abandoned': return { kind: 'abandoned', operation, replayed };
    default: return { kind: 'closed-by-server', outcome: operation.outcome, operation };
  }
}
export function interpretExecute(result: ExecuteResult): IntentOutcome {
  switch (result.kind) {
    case 'not-dispatched': return notSent(result.cause, result.message);
    case 'execution': return outcomeFromOperation(result.execution.operation, { replayed: result.execution.replayed, writeResult: result.execution.writeResult, writeResultOmitted: result.execution.writeResultOmitted });
    case 'detail-expired': return { kind: 'detail-expired', operation: result.operation };
    case 'rejected': return { kind: 'rejected', status: result.status, code: result.code, message: result.message, revisionConflict: result.code === 'TASK_REVISION_CHANGED' };
    case 'uncertain': return uncertain(result.cause, result.status, result.message);
  }
}

const uuid = z.string().uuid();
export interface TaskSaveIntentOptions extends TaskIntentsClientOptions {
  /** Pin de la copia (`contextRevision`) que publica el servidor para ESTE contexto, o null si no se conoce. Sin él no se envía nada. */
  contextRevision: (context: TaskContext) => string | null;
  client?: TaskIntentsClient;
}
export interface TaskSaveIntentStrategy {
  save(request: SaveRequest, hooks: { onDispatch: () => void }): Promise<IntentOutcome>;
  /** Comprobación explícita por ID exacto: SOLO lectura (GET). Nunca crea un intento ni envía un POST. */
  check(request: { attemptId: string; context: TaskContext }, signal?: AbortSignal): Promise<IntentVerification>;
  asSaveStrategy(): SaveStrategy;
}

export function createTaskSaveIntentStrategy(options: TaskSaveIntentOptions): TaskSaveIntentStrategy {
  const client = options.client ?? createTaskIntentsClient(options);
  async function save(request: SaveRequest, hooks: { onDispatch: () => void }): Promise<IntentOutcome> {
    const attemptId = request.attemptId;
    // El ID es el del gestor: se exige y NO se genera otro (un segundo UUID rompería la asociación con la operación que ve la persona).
    if (!attemptId || !uuid.safeParse(attemptId).success) return notSent('missing-attempt-id', 'El intento no tiene un identificador estable. No se envió nada.');
    if (request.taskId !== request.baseline.id) return notSent('invalid-request', 'La tarea que ibas a guardar no es la que abriste. No se envió nada.');
    if (!request.revision) return notSent('missing-revision', 'Falta la revisión que abriste: no se puede guardar contra ella. No se envió nada.');
    const scope = intentScopeFromContext(request.context, options.contextRevision(request.context));
    if (!scope) return notSent('missing-scope', 'Falta la identidad completa de la copia o su revisión. No se envió nada.');
    return interpretExecute(await client.execute({ scope, attemptId, taskId: request.taskId, expectedRevision: request.revision, values: request.patch }, { onDispatch: hooks.onDispatch }, request.signal));
  }
  async function check(request: { attemptId: string; context: TaskContext }, signal?: AbortSignal): Promise<IntentVerification> {
    const scope = intentScopeFromContext(request.context, options.contextRevision(request.context));
    if (!scope || !uuid.safeParse(request.attemptId).success) return { kind: 'unreachable', cause: 'incompatible', message: 'Falta la identidad de la copia o del intento: no se puede comprobar.' };
    const result = await client.check(request.attemptId, scope, signal);
    switch (result.kind) {
      case 'locked': case 'not-found': case 'context-changed': return { kind: result.kind };
      case 'rejected': return { kind: 'unreachable', cause: 'server-error', message: result.message };
      case 'unavailable': return { kind: 'unreachable', cause: result.cause, message: result.message };
      case 'ok': {
        const value = result.value;
        if (value.evidence === 'applied' || value.evidence === 'unchanged' || value.evidence === 'diverged') return { kind: 'read', evidence: value.evidence, record: value.record!, taskRevision: value.taskRevision!, readAt: value.readAt, operation: value.operation, attribution: 'unknown', recorded: outcomeFromOperation(value.operation, { replayed: true }) };
        return { kind: 'unavailable', reason: value.evidence === 'missing' ? 'task-missing' : value.reason ?? 'read-failed', operation: value.operation, recorded: outcomeFromOperation(value.operation, { replayed: true }) };
      }
    }
  }
  /** Adaptador para el gestor ACTUAL (`SaveStrategy`). Es fiel salvo en un caso, degradado a propósito: confirmado por el servidor SIN registro (ver cabecera). */
  function asSaveStrategy(): SaveStrategy {
    return {
      async save(request, hooks): Promise<StrategyOutcome> { return toStrategyOutcome(await save(request, hooks)); },
      async verify(request: VerifyRequest): Promise<Verification> {
        if (!request.attemptId) return { kind: 'unknown' };
        const result = await check({ attemptId: request.attemptId, context: request.context });
        if (result.kind === 'read') return { kind: 'read', evidence: result.evidence, record: result.record };
        if (result.kind === 'unavailable') return result.reason === 'task-missing' ? { kind: 'missing' } : { kind: 'unknown' };
        return result.kind === 'locked' ? { kind: 'locked' } : result.kind === 'context-changed' ? { kind: 'context-changed' } : { kind: 'unknown' };
      },
    };
  }
  return { save, check, asSaveStrategy };
}

/** Lo que el gestor actual puede expresar. Lo demás se degrada a `uncertain` (nunca a «guardado» ni a «no enviado»). */
export function toStrategyOutcome(outcome: IntentOutcome): StrategyOutcome {
  switch (outcome.kind) {
    case 'not-sent': return { kind: 'preflight-failed', message: outcome.message };
    case 'rejected': return outcome.revisionConflict ? ({ kind: 'rejected', status: 409, message: outcome.message, revisionConflict: true } as StrategyOutcome) : { kind: 'rejected', status: outcome.status, message: outcome.message };
    case 'acknowledged': case 'no-op':
      if (outcome.record && outcome.revised) return outcome.kind === 'no-op' ? { kind: 'unchanged', record: outcome.record, revised: outcome.revised } : { kind: 'saved', record: outcome.record, revised: outcome.revised };
      return { kind: 'uncertain', message: 'El servidor confirmó este intento, pero su respuesta no incluyó el registro. El acuse queda guardado en el servidor; compruébalo en «Trabajo por recuperar».' };
    case 'accepted-read': return { kind: 'uncertain', message: 'Este intento ya fue aceptado por una persona tras leer la tarea. No se vuelve a enviar.' };
    case 'abandoned': return { kind: 'uncertain', message: 'Este intento ya se cerró sin seguimiento. La tarea pudo aplicarse; no se vuelve a enviar.' };
    case 'closed-by-server': return { kind: 'uncertain', message: 'El servidor ya cerró este intento. Compruébalo leyendo; no se vuelve a enviar.' };
    case 'detail-expired': return { kind: 'uncertain', message: 'El detalle de este intento venció; solo quedan sus metadatos. No se vuelve a enviar.' };
    case 'uncertain': return { kind: 'uncertain', message: outcome.message };
  }
}
