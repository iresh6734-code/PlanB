import { useState, useSyncExternalStore } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { canAccept, canDismiss, canRetry, canRetryQueue, canVerify, describeOperation, isUnresolved, patchLines, type TaskSaveOperation } from '../shared/task-save-outcome.js';
import type { TaskSaveOutcomes } from './task-save-outcome.js';
import './task-save-outcomes.css';

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) + ' (Madrid)';

/**
 * «Por decidir»: agrupa lo que el gestor tiene abierto por la ACCIÓN disponible, que es distinta en cada caso (no por antigüedad ni por tarea). Los resultados sin incidencias (confirmados con la
 * lista al día, descartados) no están en ningún grupo: solo se ven en «Todos». Función pura sobre la operación: no lee ni escribe.
 */
export type DecisionGroup = 'uncertain' | 'rejected' | 'queue-failed' | 'in-flight';
export function decisionGroup(op: TaskSaveOperation): DecisionGroup | null {
  if (op.supersededBy) return null;
  if (op.status === 'uncertain') return 'uncertain';
  if (op.status === 'rejected' || op.status === 'not_sent') return 'rejected';
  if ((op.status === 'confirmed' || op.status === 'accepted') && op.queue.status === 'failed') return 'queue-failed';
  if (op.status === 'in_flight') return 'in-flight';
  return null;
}
const GROUPS: { id: DecisionGroup; title: string; hint: string }[] = [
  { id: 'uncertain', title: 'Sin saber si se aplicó', hint: 'Comprueba leyendo la tarea: no se reenvía nada por cuenta propia. Si la lectura muestra el cambio, puedes aceptar ese estado.' },
  { id: 'rejected', title: 'No se aplicó', hint: 'Abre la tarea para recuperar lo que escribiste y decidir si guardas de nuevo.' },
  { id: 'queue-failed', title: 'Lista sin actualizar', hint: 'El guardado ya está hecho; reintentar solo vuelve a leer la lista de Hoy.' },
  { id: 'in-flight', title: 'En curso', hint: 'Nada que decidir: el envío ya salió y no se puede cancelar.' },
];
export type OutcomesFilter = 'all' | 'decide';

function Item({ op, controller, onOpenTask }: { op: TaskSaveOperation; controller: TaskSaveOutcomes; onOpenTask?: (taskId: string, attemptId?: string) => void }) {
  const [confirming, setConfirming] = useState(false), [notice, setNotice] = useState('');
  const described = describeOperation(op), lines = patchLines(op), id = 'ltso-' + op.attemptId;
  const name = (verb: string) => verb + ': ' + op.taskLabel;
  const showWritten = lines.length > 0 && (op.status === 'uncertain' || op.status === 'rejected' || op.status === 'not_sent');
  return <li className="ltso-item" data-status={op.status} data-attempt={op.attemptId} data-task={op.taskId} aria-labelledby={id + '-t'}>
    <div className={'ltso-box ltso-' + described.tone} role={described.live}>
      <strong id={id + '-t'}>{op.status === 'in_flight' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : described.tone === 'success' ? <CheckCircle2 size={15} aria-hidden="true" /> : described.tone === 'info' ? null : <CircleAlert size={15} aria-hidden="true" />} {described.title}</strong>
      {described.lines.map(line => <p key={line}>{line}</p>)}
      <small>Intento {op.attemptNumber} · {when(op.startedAt)}{op.settledAt ? '' : ' · en curso'}</small>
    </div>
    {showWritten ? <details className="ltso-written"><summary>Lo que escribiste (solo en esta ventana)</summary><ul>{lines.map(line => <li key={line}>{line}</li>)}</ul></details> : null}
    <div className="ltso-actions">
      {op.status === 'uncertain' && !op.supersededBy ? <button type="button" className="button secondary" aria-label={name('Comprobar ahora')} aria-disabled={!canVerify(op)} onClick={() => { if (canVerify(op)) void controller.verify(op.attemptId); }}><RefreshCw size={14} aria-hidden="true" />Comprobar ahora</button> : null}
      {canAccept(op) ? <button type="button" className="button primary" aria-label={name('Aceptar el estado leído')} onClick={() => controller.accept(op.attemptId)}>Aceptar el estado leído</button> : null}
      {canRetry(op) ? <button type="button" className="button secondary" aria-label={name('Reenviar el guardado como un guardado nuevo')} onClick={() => { const result = controller.retry(op.attemptId); setNotice(result.kind === 'busy' ? 'No se reenvió: esta tarea ya tiene un guardado en curso o sin resolver. Espera su resultado; este intento sigue disponible.' : result.kind === 'refused' ? result.reason : ''); }}>Reenviar el guardado</button> : null}
      {canRetryQueue(op) ? <button type="button" className="button secondary" aria-label={name('Reintentar la actualización de la cola')} onClick={() => void controller.retryQueue(op.attemptId)}><RefreshCw size={14} aria-hidden="true" />Reintentar la actualización</button> : null}
      {onOpenTask && (op.status === 'rejected' || op.status === 'not_sent' || op.status === 'uncertain' || op.status === 'in_flight' || op.evidence?.kind === 'diverged') ? <button type="button" className="button secondary" aria-label={name('Abrir la tarea')} onClick={() => onOpenTask(op.taskId, op.attemptId)}>Abrir la tarea</button> : null}
      {canDismiss(op) && !confirming ? <button type="button" className="text-button" aria-label={name('Descartar el aviso')} onClick={() => { if (isUnresolved(op)) setConfirming(true); else controller.dismiss(op.attemptId); }}>{op.status === 'confirmed' || op.status === 'accepted' ? 'Entendido' : 'Descartar aviso'}</button> : null}
      {confirming ? <span className="ltso-confirm" role="alert">Dejarás de seguir este guardado, que puede haberse aplicado. <button type="button" className="button secondary" onClick={() => setConfirming(false)}>Seguir viéndolo</button> <button type="button" className="button primary" aria-label={name('Dejar de seguir')} onClick={() => controller.dismiss(op.attemptId)}>Dejar de seguir</button></span> : null}
    </div>
    {notice ? <p className="ltso-notice" role="alert">{notice}</p> : null}
  </li>;
}

// Superficie que debe seguir MONTADA mientras la ficha se abre y se cierra (por ejemplo, en la vista de Hoy). Muestra solo lo que el
// gestor puede afirmar y declara su límite: el seguimiento vive en esta ventana y se pierde al recargarla o cerrarla.
export function TaskSaveOutcomesPanel({ controller, onOpenTask }: { controller: TaskSaveOutcomes; onOpenTask?: (taskId: string, attemptId?: string) => void }) {
  const ops = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot).filter(op => !op.supersededBy);
  const [filter, setFilter] = useState<OutcomesFilter>('all');
  if (!ops.length) return null;
  const grouped = GROUPS.map(group => ({ ...group, items: ops.filter(op => decisionGroup(op) === group.id) })).filter(group => group.items.length > 0);
  const toDecide = ops.filter(op => { const group = decisionGroup(op); return group !== null && group !== 'in-flight'; }).length;
  const item = (op: TaskSaveOperation) => <Item key={op.attemptId} op={op} controller={controller} onOpenTask={onOpenTask} />;
  return <section className="ltso" aria-label="Resultados de guardado de tareas">
    <h2>Resultados de guardado</h2>
    <div className="ltso-filter" role="group" aria-label="Qué resultados ver">
      <button type="button" className="ltso-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos ({ops.length})</button>
      <button type="button" className="ltso-chip" aria-pressed={filter === 'decide'} onClick={() => setFilter('decide')}>Por decidir ({toDecide})</button>
    </div>
    {filter === 'all' ? <ul className="ltso-list">{ops.map(item)}</ul>
      : grouped.length ? grouped.map(group => <section key={group.id} className="ltso-group" aria-labelledby={'ltso-g-' + group.id} data-group={group.id}>
        <h3 id={'ltso-g-' + group.id}>{group.title} ({group.items.length})</h3><p className="ltso-hint">{group.hint}</p><ul className="ltso-list">{group.items.map(item)}</ul></section>)
        : <p role="status" className="ltso-empty">Nada por decidir ahora. Los resultados ya resueltos siguen en «Todos».</p>}
    <p className="ltso-limit">Este seguimiento vive solo mientras esta ventana siga abierta: si recargas o cierras Plan B se pierde y no se guarda nada en el navegador. Para saber el estado de una tarea después, ábrela de nuevo.</p>
  </section>;
}
