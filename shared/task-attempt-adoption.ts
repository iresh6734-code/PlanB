import { contextKey, type TaskContext } from './local-task-focus.js';
import { isUnresolved, type TaskSaveOperation } from './task-save-outcome.js';

// Adopción del intento exacto al reabrir una tarea (unidad 219). Regla PURA: decide qué intento del gestor (136/170/171) debe retomar la ficha al abrirse.
// Principios:
//  · el intento se identifica por INSTALACIÓN + CAPTURA + GENERACIÓN (contextKey) + ID de tarea + ID de intento; nunca por título ni solo por ID de tarea (puede repetirse en otra captura);
//  · adoptar es MOSTRAR el mismo estado del intento: no hace PATCH ni convierte lo incierto en un formulario de reenvío;
//  · si no se puede adoptar con seguridad (otra copia, intento desaparecido, varios abiertos) NO se fuerza: se explica el motivo y no se inicia ninguna operación.
export type AdoptionRefusal = 'other-copy' | 'gone' | 'other-task' | 'ambiguous';
export type Adoption =
  | { kind: 'none' }
  /** La ficha enlaza su seguimiento a este intento (en curso, incierto, confirmado o aceptado). `otherOpen` = otros intentos sin resolver de la MISMA tarea y copia. */
  | { kind: 'adopt'; attemptId: string; otherOpen: string[] }
  /** El intento no llegó a aplicarse (rechazado/no enviado): se restaura lo escrito como borrador y el aviso se conserva. */
  | { kind: 'restore-draft'; attemptId: string }
  | { kind: 'refused'; reason: AdoptionRefusal; message: string; attemptId?: string; open?: string[] };

/** Sigue la cadena de reintentos hasta el intento vigente (un reintento sustituye al anterior). */
function live(ops: readonly TaskSaveOperation[], op: TaskSaveOperation): TaskSaveOperation {
  let current = op; const seen = new Set<string>();
  while (current.supersededBy && !seen.has(current.attemptId)) { seen.add(current.attemptId); const next = ops.find(item => item.attemptId === current.supersededBy); if (!next) break; current = next; }
  return current;
}
export function resolveAdoption(ops: readonly TaskSaveOperation[], input: { taskId: string; context: TaskContext; requestedAttemptId?: string | null }): Adoption {
  const here = contextKey(input.context);
  const sameTaskHere = ops.filter(op => !op.supersededBy && op.taskId === input.taskId && contextKey(op.context) === here);
  const open = sameTaskHere.filter(isUnresolved);
  if (input.requestedAttemptId) {
    const asked = ops.find(op => op.attemptId === input.requestedAttemptId);
    if (!asked) return { kind: 'refused', reason: 'gone', attemptId: input.requestedAttemptId, message: 'Ese resultado ya no está en el seguimiento (se descartó o este seguimiento se reinició). Se abre la tarea tal como está ahora.' };
    const op = live(ops, asked);
    if (op.taskId !== input.taskId) return { kind: 'refused', reason: 'other-task', attemptId: op.attemptId, message: 'Ese resultado corresponde a otra tarea; no se adopta.' };
    if (contextKey(op.context) !== here) return { kind: 'refused', reason: 'other-copy', attemptId: op.attemptId,
      message: 'Ese resultado es de otra copia («' + (op.context.snapshotName ?? 'sin nombre') + '»). Se conserva en «Resultados de guardado» con su contexto; la tarea que ves es la de la copia actual y es un recorrido nuevo y separado: no puede confirmar ni aceptar aquel intento.' };
    if (op.status === 'rejected' || op.status === 'not_sent') return { kind: 'restore-draft', attemptId: op.attemptId };
    return { kind: 'adopt', attemptId: op.attemptId, otherOpen: open.filter(item => item.attemptId !== op.attemptId).map(item => item.attemptId) };
  }
  if (open.length === 1) return { kind: 'adopt', attemptId: open[0].attemptId, otherOpen: [] };
  if (open.length > 1) return { kind: 'refused', reason: 'ambiguous', open: open.map(op => op.attemptId),
    message: 'Esta tarea tiene ' + open.length + ' guardados sin resolver en esta copia (intentos ' + open.map(op => op.attemptNumber).join(' y ') + '). No se ha elegido ninguno: ábrelos desde «Resultados de guardado» para retomar uno concreto. No se ha enviado nada.' };
  return { kind: 'none' };
}
