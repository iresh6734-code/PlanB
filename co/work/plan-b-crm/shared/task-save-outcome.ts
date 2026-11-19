import type { CrmRecord, FieldValue } from './model.js';
import type { Evidence, TaskContext } from './local-task-focus.js';
import type { TaskIntentExecution, TaskIntentSummary } from './task-intents.js';

// Contrato y reglas puras del seguimiento de guardados de tareas (unidad 136, problema D7). Sin red ni React.
// Principio: cada estado afirma SOLO lo que la evidencia permite. «Cancelar la interfaz» no es «deshacer el PATCH»,
// una coincidencia de valores no prueba autoría y un fallo de la recarga posterior no cambia un guardado confirmado.

export type OperationStatus =
  | 'in_flight'   // registrada; la comprobación previa o el envío siguen en curso
  | 'confirmed'   // el servidor confirmó el guardado, con registro o acuse compacto
  | 'accepted'    // acuse perdido: la persona aceptó el estado que leyó (el servidor NO confirmó su envío)
  | 'rejected'    // el PATCH llegó y el servidor respondió 4xx: no se escribió nada
  | 'not_sent'    // la comprobación previa cortó el envío: no salió ningún PATCH
  | 'uncertain';  // el PATCH salió y no hay acuse utilizable: pudo aplicarse o no
export type EvidenceKind = Evidence | 'context-changed' | 'missing' | 'locked' | 'unknown';
export interface OperationEvidence { kind: EvidenceKind; at: string; record: CrmRecord | null; }
// Causa CERRADA de un fallo de la actualización posterior al guardado. Nunca se copia el mensaje de un error ajeno: puede llevar URLs,
// rutas internas o datos del registro. 'state' = estado de la App; 'list' = lista de Hoy; 'timeout' = no respondió a tiempo; 'unknown' = cualquier otro error.
export type RefreshCause = 'state' | 'list';
export type QueueFailureCause = RefreshCause | 'timeout' | 'unknown';
export const REFRESH_REASONS: Record<QueueFailureCause, string> = {
  state: 'No se pudo actualizar el estado de la aplicación',
  list: 'No se pudo actualizar la lista de Hoy',
  timeout: 'la actualización tardó demasiado',
  unknown: '',
};
/** Lo que un consumidor de onConfirmed lanza cuando una lectura NECESARIA falló. Solo transporta una causa tipada, nunca texto del servidor. */
export class OutcomeRefreshError extends Error {
  readonly refreshCause: RefreshCause;
  constructor(cause: RefreshCause) { super(REFRESH_REASONS[cause]); this.name = 'OutcomeRefreshError'; this.refreshCause = cause; }
}
export function refreshFailure(error: unknown): { cause: QueueFailureCause; reason: string } {
  const cause = (error as { refreshCause?: unknown } | null)?.refreshCause;
  if (error instanceof Error && error.name === 'OutcomeRefreshError' && (cause === 'state' || cause === 'list')) return { cause, reason: REFRESH_REASONS[cause] };
  return { cause: 'unknown', reason: REFRESH_REASONS.unknown };
}
export interface QueueState { status: 'idle' | 'updating' | 'ok' | 'failed'; reason: string; /** Solo con status 'failed'. */ cause?: QueueFailureCause; }
export interface OperationDetail { kind: string; message: string; fields?: Record<string, string>; httpStatus?: number; revisionConflict?: boolean; }

/** Resultado de una escritura CONDICIONADA a la revisión (166/183/185): solo existe cuando el servidor confirmó con una lectura validada. `token` y `current` corresponden a LA MISMA lectura. */
export interface RevisedResult { changed: boolean; token: string; current: CrmRecord; }
export interface CompactTaskSaveReceipt {
  source: 'server-ack';
  acknowledgement: TaskIntentSummary['acknowledgement'];
  replayed: boolean;
  writeResultOmitted: NonNullable<TaskIntentExecution['writeResultOmitted']>;
}
export interface TaskSaveOperation {
  /** Identidad del intento, compartida con el servidor cuando la estrategia usa A4. */
  attemptId: string;
  taskId: string; taskLabel: string;
  /** Instalación, captura, fecha, cuenta y generación con las que se abrió la tarea. */
  context: TaskContext;
  /** Valores que la persona vio al abrir. */
  baseline: CrmRecord;
  /** Lo que escribió: solo los campos cambiados. Vive únicamente en memoria. */
  patch: Record<string, FieldValue>;
  fieldLabels: Record<string, string>;
  /** Token de revisión de 128 si la estrategia lo usa; null con la API antigua. */
  revision: string | null;
  startedAt: string; settledAt: string | null;
  /** «sent» = el PATCH salió del cliente; NO implica que llegara. */
  phase: 'checking' | 'sent' | 'done';
  status: OperationStatus;
  detail: OperationDetail;
  /** Registro devuelto por el PATCH (confirmed) o leído y aceptado (accepted). */
  record: CrmRecord | null;
  /** Solo con escritura condicionada validada: `changed:false` = no-op (el servidor ya tenía esos valores: sin historial nuevo). */
  revised?: RevisedResult | null;
  /** Confirmación sin una lectura utilizable del registro. Su revisión pertenece al acuse. */
  compactReceipt?: CompactTaskSaveReceipt;
  evidence: OperationEvidence | null;
  verifying: boolean;
  queue: QueueState;
  /** 1 = primer intento; sube con cada reintento explícito de la persona. */
  attemptNumber: number; previousAttemptId: string | null; supersededBy: string | null;
}

export const isUnresolved = (op: TaskSaveOperation) => !op.supersededBy && (op.status === 'in_flight' || op.status === 'uncertain');
export const canVerify = (op: TaskSaveOperation) => op.status === 'uncertain' && !op.verifying && !op.supersededBy;
export const canAccept = (op: TaskSaveOperation) => op.status === 'uncertain' && !op.supersededBy && op.evidence?.kind === 'applied' && !!op.evidence.record;
// Reintentar solo es una decisión explícita y solo cuando consta que NO se envió, o que la lectura, ligada a la copia original, la
// muestra sin el cambio. Con la API antigua un reintento tras un guardado aplicado duplicaría la escritura: por eso no hay reintento
// automático ni tras «applied»/«diverged»/«context-changed».
export const canRetry = (op: TaskSaveOperation) => !op.supersededBy && ((op.status === 'uncertain' && op.evidence?.kind === 'unchanged') || (op.status === 'not_sent' && op.detail.kind !== 'context-changed' && op.detail.kind !== 'disposed'));
export const canDismiss = (op: TaskSaveOperation) => op.status !== 'in_flight';
export const canRetryQueue = (op: TaskSaveOperation) => (op.status === 'confirmed' || op.status === 'accepted') && op.queue.status === 'failed';
export const needsAttention = (op: TaskSaveOperation) => !op.supersededBy && (isUnresolved(op) || op.status === 'rejected' || op.status === 'not_sent' || op.queue.status === 'failed' || op.queue.status === 'updating');

export type Tone = 'info' | 'warning' | 'danger' | 'success';
export interface Described { tone: Tone; title: string; lines: string[]; live: 'status' | 'alert'; }
const q = (label: string) => '«' + label + '»';
export function describeOperation(op: TaskSaveOperation): Described {
  const lines: string[] = [];
  const queueLines = () => {
    if (op.queue.status === 'updating') lines.push('Actualizando la cola de Hoy…');
    if (op.queue.status === 'ok') lines.push('La cola de Hoy está actualizada.');
    if (op.queue.status === 'idle' && op.queue.reason) lines.push('La cola de Hoy se actualizará cuando vuelvas a esa vista; mientras tanto puede mostrar los valores anteriores.');
    if (op.queue.status === 'failed') {
      const freshness = op.compactReceipt ? ' La pantalla puede seguir mostrando una lectura anterior.' : ' La tarea ya tiene los valores nuevos; la pantalla puede seguir mostrando los anteriores.';
      lines.push((op.queue.cause === 'state' || op.queue.cause === 'list' ? op.queue.reason : 'La cola de Hoy no se actualizó' + (op.queue.reason ? ' (' + op.queue.reason + ')' : '')) + '.' + freshness + ' Reintentar solo vuelve a leer, no envía otro guardado.');
    }
  };
  switch (op.status) {
    case 'in_flight':
      return { tone: 'info', live: 'status', title: op.phase === 'sent' ? 'Guardando ' + q(op.taskLabel) + '…' : 'Comprobando antes de guardar ' + q(op.taskLabel) + '…',
        lines: [op.phase === 'sent' ? 'El envío ya salió y no se puede cancelar: puede aplicarse aunque cierres la ficha. Aquí verás el resultado.' : 'Todavía no se ha enviado nada.'] };
    case 'confirmed': {
      queueLines();
      const receipt = op.compactReceipt;
      if (receipt) {
        const noChange = receipt.acknowledgement?.changed === false;
        const message = noChange
          ? 'El servidor confirmó que la tarea ya tenía esos valores: no se escribió nada ni se añadió historial.'
          : receipt.replayed ? 'El servidor devolvió el acuse que conservaba para este intento.' : 'El servidor confirmó este intento.';
        return {
          tone: op.queue.status === 'failed' ? 'warning' : noChange ? 'info' : 'success',
          live: op.queue.status === 'failed' ? 'alert' : 'status',
          title: (noChange ? 'Sin cambios en ' : 'Guardado confirmado: ') + q(op.taskLabel),
          lines: [message, 'Vuelve a abrir la tarea para leer su registro actual.', ...lines],
        };
      }
      if (op.detail?.kind === 'unchanged') return { tone: op.queue.status === 'failed' ? 'warning' : 'info', live: op.queue.status === 'failed' ? 'alert' : 'status', title: 'Sin cambios en ' + q(op.taskLabel), lines: ['El servidor confirmó que la tarea ya tenía esos valores: no se escribió nada ni se añadió historial.', ...lines] };
      return { tone: op.queue.status === 'failed' ? 'warning' : 'success', live: op.queue.status === 'failed' ? 'alert' : 'status', title: 'Guardado confirmado: ' + q(op.taskLabel), lines: ['El servidor devolvió la tarea con los valores guardados.', ...(op.revised ? ['Se guardó contra la revisión que abriste.'] : []), ...lines] };
    }
    case 'accepted': queueLines(); return { tone: op.queue.status === 'failed' ? 'warning' : 'info', live: op.queue.status === 'failed' ? 'alert' : 'status', title: 'Estado leído y aceptado por ti: ' + q(op.taskLabel), lines: ['El servidor no confirmó tu envío: no se sabe si lo aplicó tu solicitud u otra edición idéntica.', ...lines] };
    case 'rejected': return { tone: 'danger', live: 'alert', title: 'No se guardó ' + q(op.taskLabel), lines: [op.detail.message, ...Object.entries(op.detail.fields ?? {}).map(([key, why]) => (op.fieldLabels[key] ?? key) + ': ' + why), 'El servidor rechazó la petición y no cambió nada. Lo que escribiste se conserva aquí.'] };
    case 'not_sent': return { tone: 'warning', live: 'alert', title: 'No se envió ' + q(op.taskLabel), lines: [op.detail.message, 'No salió ningún guardado. Lo que escribiste se conserva aquí.'] };
    case 'uncertain': {
      const evidence = op.evidence;
      lines.push('El guardado salió y no llegó un acuse utilizable: ' + (op.detail.message || 'pudo aplicarse o no.') + ' No se ha reenviado nada por cuenta propia.');
      if (op.verifying) lines.push('Comprobando la tarea con una lectura…');
      else if (!evidence) lines.push('Puedes comprobarlo con una lectura. Nada se escribirá al comprobar.');
      else if (evidence.kind === 'applied') lines.push('La lectura muestra la tarea con los valores que enviaste. No distingue si los aplicó tu envío o una edición idéntica de otra persona.');
      else if (evidence.kind === 'unchanged') lines.push('La lectura, ligada a la copia original, muestra la tarea sin tu cambio. Si decides reenviar, será un guardado nuevo y explícito.');
      else if (evidence.kind === 'diverged') lines.push('La tarea tiene valores distintos a los de antes y a los que enviaste: otra edición. No se sobrescribe; reabre la tarea para revisarla.');
      else if (evidence.kind === 'context-changed') lines.push('La copia activa cambió desde que abriste la ficha: la lectura corresponde a otra copia y no sirve como evidencia. No se acepta ni se reenvía nada.');
      else if (evidence.kind === 'missing') lines.push('La tarea ya no existe en esta copia.');
      else if (evidence.kind === 'locked') lines.push('La sesión está bloqueada: desbloquea Plan B y vuelve a comprobar.');
      else lines.push('No se pudo leer la tarea: sigue sin saberse si se aplicó.');
      return { tone: 'warning', live: 'alert', title: 'No se sabe si se guardó ' + q(op.taskLabel), lines };
    }
  }
}
/** Pares «campo: valor» de lo escrito, para que la persona pueda recuperarlo si el guardado no se aplicó. */
export const patchLines = (op: TaskSaveOperation) => Object.entries(op.patch).map(([key, value]) => (op.fieldLabels[key] ?? key) + ': ' + (value === null || value === '' ? '(vacío)' : String(value)));
export const rejectionMessage = (status: number, message: string) => status === 409 ? message + ' (conflicto)' : status === 422 ? message : status === 404 ? 'La tarea ya no existe en esta copia.' : status === 401 ? 'La sesión está bloqueada.' : message;
