import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, CircleAlert, X } from 'lucide-react';
import { needsAttention, OutcomeRefreshError, type TaskSaveOperation } from '../shared/task-save-outcome.js';
import { createTaskSaveOutcomes, type DisposeSummary, type TaskSaveOutcomes } from './task-save-outcome.js';
import { TaskSaveOutcomesPanel } from './TaskSaveOutcomes.js';
import { revisionStrategy } from './task-revision-strategy.js';
import './task-outcomes-host.css';

// Propietario de los resultados de guardado de tareas en la App real (unidad U2-171, problema D7).
//
// QUÉ HACE. Crea UNA instancia del gestor (136/170) por montaje de la sesión desbloqueada —sin singleton de módulo—, la comparte por contexto con la vista de
// Hoy (que se la pasa EXACTAMENTE a la ficha) y monta la superficie «Resultados de guardado» FUERA de Hoy, en el contenido principal, para que el seguimiento
// sobreviva a cerrar la ficha y a navegar. Al desmontarse (bloqueo o cierre de sesión) llama a `dispose()` ANTES de soltar al propietario.
//
// QUÉ NO HACE. El seguimiento vive en memoria: se pierde al recargar, al cerrar la pestaña y al bloquear. No hay persistencia, ni coordinación entre pestañas,
// ni revisión de versión (128/160/166). Un envío ya despachado no se cancela. Tras bloquear solo se conserva un RECUENTO (sin textos de tareas ni borradores).

/** Cómo la vista de Hoy se ofrece como consumidor de la recarga posterior a un guardado confirmado. */
export interface TodayRegistration {
  /** Relee la cola de Hoy. DEBE rechazar si la lectura falla o fue sustituida. Solo lee. */
  reload(): Promise<void>;
  /** ¿Sigue montada esa vista? Si se desmontó durante la recarga, el siguiente montaje lee de nuevo por su cuenta. */
  mounted(): boolean;
}

/**
 * Consumidor de `onConfirmed` para un momento dado: 1) estado padre de la App; 2) la cola de Hoy, solo si Hoy está montada. Solo lee.
 * Cada fallo se traduce a una causa CERRADA (`state`/`list`) y nunca se copia el mensaje de un error ajeno. Se crea uno nuevo por cada cambio de la
 * vista registrada: así el gestor invalida la recarga del consumidor anterior y nunca le atribuye al nuevo un éxito que no leyó.
 */
export function confirmationConsumer(readState: () => Promise<unknown>, today: TodayRegistration | null): (record: unknown, operation: TaskSaveOperation) => Promise<void> {
  return async () => {
    try { await readState(); } catch { throw new OutcomeRefreshError('state'); }
    if (!today) return;
    try { await today.reload(); }
    catch { if (today.mounted()) throw new OutcomeRefreshError('list'); /* Hoy se desmontó durante la lectura: no hay cola vieja en pantalla y el siguiente montaje lee de nuevo */ }
  };
}

/** `confirmed` = confirmado por el SERVIDOR; `accepted` = lectura que la persona aceptó (el servidor no confirmó su envío); `queueFailed` es otra DIMENSIÓN (la lista no se actualizó) y no cambia la procedencia. */
export interface OutcomesSummary { total: number; unresolved: number; sending: number; rejected: number; queueFailed: number; confirmed: number; accepted: number; attention: boolean; label: string }
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
/** Resumen compacto para la barra de la superficie: lo pendiente primero. No lee nada más que las operaciones. */
export function summarizeOutcomes(ops: readonly TaskSaveOperation[]): OutcomesSummary {
  const live = ops.filter(op => !op.supersededBy);
  const unresolved = live.filter(op => op.status === 'uncertain').length, sending = live.filter(op => op.status === 'in_flight').length;
  const rejected = live.filter(op => op.status === 'rejected' || op.status === 'not_sent').length;
  const queueFailed = live.filter(op => (op.status === 'confirmed' || op.status === 'accepted') && op.queue.status === 'failed').length;
  const confirmed = live.filter(op => op.status === 'confirmed').length, accepted = live.filter(op => op.status === 'accepted').length;
  const parts: string[] = [];
  if (unresolved) parts.push(plural(unresolved, 'guardado sin saber si se aplicó', 'guardados sin saber si se aplicaron'));
  if (sending) parts.push(plural(sending, 'guardado en curso', 'guardados en curso'));
  if (queueFailed) parts.push(plural(queueFailed, 'lista sin actualizar', 'listas sin actualizar'));
  if (rejected) parts.push(plural(rejected, 'guardado que no se aplicó', 'guardados que no se aplicaron'));
  if (confirmed) parts.push(plural(confirmed, 'confirmado por el servidor', 'confirmados por el servidor'));
  if (accepted) parts.push(plural(accepted, 'lectura aceptada por ti', 'lecturas aceptadas por ti'));
  return { total: live.length, unresolved, sending, rejected, queueFailed, confirmed, accepted, attention: live.some(needsAttention), label: parts.join(' · ') };
}
/** Orden de la superficie: lo que necesita atención primero; el resto conserva el orden de llegada. */
export const byAttention = (ops: readonly TaskSaveOperation[]): readonly TaskSaveOperation[] => [...ops.filter(needsAttention), ...ops.filter(op => !needsAttention(op))];

/** Suma al recuento de un bloqueo anterior (los avisos pendientes de leer se acumulan, sin guardar nada más). */
export function addLockSummary(previous: DisposeSummary | null, next: DisposeSummary): DisposeSummary | null {
  const sum = { notDispatched: (previous?.notDispatched ?? 0) + next.notDispatched, dispatched: (previous?.dispatched ?? 0) + next.dispatched };
  return sum.notDispatched + sum.dispatched > 0 ? sum : previous;
}

export interface TaskOutcomesContextValue {
  controller: TaskSaveOutcomes;
  /** La vista de Hoy se registra al montarse y devuelve la función que la retira. Mantener esta función estable. */
  registerToday(registration: TodayRegistration): () => void;
  /** Hoy avisa de si hay una ficha abierta: mientras lo está, la superficie se oculta (la ficha ya muestra el mismo resultado). */
  setFichaOpen(open: boolean): void;
  openTask(taskId: string, attemptId?: string): void;
  /** ¿Hay una ficha abierta ahora? La superficie se oculta mientras tanto. */
  ficha: boolean;
  /** Modo de guardado de este propietario: `true` = guardado CONDICIONADO a la revisión que la persona abrió (233); `false` = ruta anterior, solo en anfitriones configurados de forma expresa. */
  revised: boolean;
}
const Context = createContext<TaskOutcomesContextValue | null>(null);
/** `null` si no hay propietario (p. ej. una prueba que monta Hoy sola): entonces Hoy conserva su comportamiento anterior. */
export const useTaskOutcomes = () => useContext(Context);

/**
 * Control que el host entrega a quien inicia el cierre del acceso (App → «Proteger / bloquear»). `seal()` cierra la frontera de despacho AL INSTANTE, antes de cualquier espera de red:
 * lo que aún no se despachó no saldrá nunca y lo ya despachado no se cancela (recuentos en el resumen). `resume()` solo se usa si el cierre NO se completó: NO reactiva al propietario
 * sellado; empieza uno NUEVO y vacío y comunica lo sellado para que la persona sepa qué pasó con lo pendiente.
 */
export interface TaskOutcomesControl { seal(): DisposeSummary; resume(): void }
export type OutcomesClosedReason = 'closed' | 'lock-not-completed';
export interface TaskOutcomesHostProps {
  children: ReactNode;
  /** Relee el estado de la App (solo lectura). Debe rechazar si falla. */
  refreshState: () => Promise<unknown>;
  /** Abre la tarea por ID (navega a Hoy y abre la ficha). */
  onOpenTask: (taskId: string, attemptId?: string) => void;
  /** Se llama UNA vez por propietario terminado, con el recuento de lo que quedó sin resolver. Sin textos de tareas. `lock-not-completed`: se selló al pedir el bloqueo pero no llegó a completarse. */
  onClosed?: (summary: DisposeSummary, reason: OutcomesClosedReason) => void;
  /** Referencia en la que el host publica su control mientras está montado. */
  controlRef?: { current: TaskOutcomesControl | null };
  /**
   * Cómo se guardan las tareas. Por defecto `'revised'`: la ficha abre con una lectura validada (registro, contexto y token) y guarda CONTRA ESA REVISIÓN; un error condicionado jamás cae a la ruta anterior.
   * `'legacy'` solo para anfitriones que NO habilitan el contrato de revisiones (configuración expresa): conserva el PATCH sin comparación de versiones.
   */
  saveMode?: 'revised' | 'legacy';
}
export function TaskOutcomesHost({ children, refreshState, onOpenTask, onClosed, controlRef, saveMode = 'revised' }: TaskOutcomesHostProps) {
  // El gestor se crea y se descarta en un efecto (no al renderizar): así un doble montaje de desarrollo no deja un gestor ya cerrado en uso.
  const [controller, setController] = useState<TaskSaveOutcomes | null>(null), [today, setToday] = useState<TodayRegistration | null>(null), [ficha, setFicha] = useState(false);
  const latest = useRef({ refreshState, onClosed, onOpenTask }); latest.current = { refreshState, onClosed, onOpenTask };
  const live = useRef<{ controller: TaskSaveOutcomes; reported: boolean } | null>(null);
  const revised = saveMode === 'revised', modeRef = useRef(revised); modeRef.current = revised;   // el modo se fija al crear cada propietario: cambiarlo a mitad no reconfigura intentos en vuelo
  useEffect(() => {
    const created = createTaskSaveOutcomes(modeRef.current ? { strategy: revisionStrategy() } : undefined); live.current = { controller: created, reported: false }; setController(created);
    return () => {
      const entry = live.current; live.current = null; if (!entry) return;
      const summary = entry.controller.dispose();   // idempotente: si ya se selló al pedir el bloqueo devuelve ESE mismo resumen
      setController(null); setToday(null); if (!entry.reported) latest.current.onClosed?.(summary, 'closed');
    };
  }, []);
  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      seal() { const entry = live.current; return entry ? entry.controller.dispose() : { notDispatched: 0, dispatched: 0 }; },
      resume() {
        const entry = live.current; if (!entry) return;
        const summary = entry.controller.dispose(); entry.reported = true; latest.current.onClosed?.(summary, 'lock-not-completed');
        const next = createTaskSaveOutcomes(modeRef.current ? { strategy: revisionStrategy() } : undefined); live.current = { controller: next, reported: false }; setController(next);   // propietario NUEVO y vacío; el sellado no se reactiva
      },
    };
    return () => { controlRef.current = null; };
  }, [controlRef]);
  const consumer = useMemo(() => confirmationConsumer(() => latest.current.refreshState(), today), [today]);
  useEffect(() => { controller?.setOnConfirmed(consumer); }, [controller, consumer]);
  const registerToday = useCallback((registration: TodayRegistration) => { setToday(registration); return () => setToday(current => current === registration ? null : current); }, []);
  const openTask = useCallback((taskId: string, attemptId?: string) => latest.current.onOpenTask(taskId, attemptId), []);
  const value = useMemo<TaskOutcomesContextValue | null>(() => controller ? { controller, registerToday, setFichaOpen: setFicha, openTask, ficha, revised } : null, [controller, registerToday, openTask, ficha, revised]);
  if (!value) return null;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Superficie compacta: una línea de resumen y el detalle (la superficie 136) a un clic. Se abre sola cuando aparece algo que necesita atención. */
export function TaskOutcomesSurface() {
  const context = useContext(Context);
  if (!context) return null;
  return <Surface controller={context.controller} hidden={context.ficha} onOpenTask={context.openTask} />;
}
function Surface({ controller, hidden, onOpenTask }: { controller: TaskSaveOutcomes; hidden: boolean; onOpenTask: (taskId: string, attemptId?: string) => void }) {
  const ops = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  // Vista ordenada con identidad estable mientras no cambien las operaciones (useSyncExternalStore lo exige). Las acciones siguen siendo las del gestor.
  const sorted = useRef<{ from: readonly TaskSaveOperation[]; to: readonly TaskSaveOperation[] } | null>(null);
  if (sorted.current?.from !== ops) sorted.current = { from: ops, to: byAttention(ops) };
  const view = useMemo<TaskSaveOutcomes>(() => ({ ...controller, getSnapshot: () => sorted.current!.to, list: () => sorted.current!.to }), [controller, ops]);
  const summary = summarizeOutcomes(ops), [open, setOpen] = useState(false);
  const known = useRef(new Set<string>()), toggle = useRef<HTMLButtonElement | null>(null), root = useRef<HTMLDivElement | null>(null), hadFocus = useRef(false);
  // Se anota en el render (justo antes de aplicar los cambios al DOM) si el foco estaba dentro: tras el cambio ya no se podría saber.
  hadFocus.current = typeof document !== 'undefined' && !!root.current && root.current.contains(document.activeElement);
  // Se abre sola cuando aparece un intento NUEVO que necesita atención; si la persona la cierra, no se vuelve a abrir por el mismo intento.
  useEffect(() => {
    const now = new Set(ops.filter(op => !op.supersededBy && needsAttention(op)).map(op => op.attemptId));
    if ([...now].some(id => !known.current.has(id))) setOpen(true);
    known.current = new Set([...known.current, ...now]);
  }, [ops]);
  // Foco útil: si el botón que tenía el foco desaparece (descartar un aviso, un resultado que se retira), el foco va al resumen o, si ya no hay nada, al contenido.
  useLayoutEffect(() => {
    if (!hadFocus.current || (document.activeElement && document.activeElement !== document.body)) return;
    hadFocus.current = false;
    const target = toggle.current && toggle.current.isConnected && !hidden ? toggle.current : document.getElementById('main-content');
    target?.focus({ preventScroll: true });
  });
  if (!summary.total) return null;
  return <div ref={root} className="toh" data-attention={summary.attention ? 'true' : 'false'} hidden={hidden}>
    <div className="toh-bar">
      <p className="toh-line" role="status"><span className="toh-title">Resultados de guardado</span>{summary.label ? <span className="toh-label"> · {summary.label}</span> : null}</p>
      <button ref={toggle} type="button" className="text-button toh-toggle" aria-expanded={open} aria-controls="toh-detail" onClick={() => setOpen(value => !value)}>{open ? 'Ocultar detalle' : 'Ver detalle'}<ChevronDown size={15} aria-hidden="true" className={open ? 'expanded' : ''} /></button>
    </div>
    <div id="toh-detail" hidden={!open}><TaskSaveOutcomesPanel controller={view} onOpenTask={onOpenTask} /></div>
  </div>;
}

/**
 * Aviso tras volver a entrar: al cerrarse el acceso (bloqueo, o salir de la configuración de la contraseña, que también desmonta la pantalla) el seguimiento en memoria se perdió. Solo se conserva un RECUENTO (sin textos de tareas, valores ni borradores).
 * Un recuento NO es seguimiento detallado: no permite comprobar ni aceptar nada; por eso el aviso manda abrir la tarea y no declara resuelto el caso.
 */
export function OutcomesLockNotice({ summary, onDismiss, failed = false, onRetry }: { summary: DisposeSummary | null; onDismiss: () => void; failed?: boolean; onRetry?: () => void }) {
  if (!summary || summary.dispatched + summary.notDispatched === 0) return null;
  const sent = summary.dispatched, never = summary.notDispatched;
  return <div className="toh-lock" role="status" data-testid="outcomes-lock-notice" data-failed={failed ? 'true' : 'false'}>
    <CircleAlert size={17} aria-hidden="true" />
    <div>
      <strong>{failed ? 'No se completó el bloqueo: el seguimiento de esta ventana se cerró' : 'Se cerró el acceso a Plan B con guardados sin resolver'}</strong>
      {sent ? <p>{plural(sent, 'guardado ya había salido', 'guardados ya habían salido')} y {sent === 1 ? 'no tenía' : 'no tenían'} resultado conocido: pudo{sent === 1 ? '' : 'ieron'} aplicarse o no, y no se canceló. Esta ventana ya no lo sigue: no puedes comprobarlo ni aceptarlo desde aquí. Abre cada tarea de Hoy para ver su valor actual.</p> : null}
      {never ? <p>{plural(never, 'guardado no llegó a enviarse', 'guardados no llegaron a enviarse')}{failed ? ' porque se pidió bloquear' : ''}: no cambió nada en tu copia{failed ? '; tendrás que guardarlo de nuevo' : ''}.</p> : null}
      {failed ? <p>Sigues con acceso: lo que guardes desde ahora tendrá un seguimiento nuevo. Para bloquear, vuelve a intentarlo.{onRetry ? <> <button type="button" className="button secondary" onClick={onRetry}>Reintentar el bloqueo</button></> : null}</p> : null}
      <p className="toh-lock-limit">Solo se conserva este recuento: no se guardaron títulos, valores ni borradores, y esto no sustituye al seguimiento detallado.</p>
    </div>
    <button type="button" className="icon-button" aria-label="Cerrar este aviso" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>
  </div>;
}
