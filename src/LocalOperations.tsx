import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock3, ListChecks, RefreshCw } from 'lucide-react';
import type { LocalOperations as Operations, LocalReview } from '../shared/local-operations.js';
import type { OutcomeHints } from '../shared/continuity-day.js';
import { contextKey } from '../shared/local-task-focus.js';
import type { TaskSaveOperation } from '../shared/task-save-outcome.js';
import { dayInputFromWorkQueue, referenceNoteOf, shortId, type WorkDayInput } from '../shared/work-queue-day.js';
import { readContext } from './local-task-focus-client.js';
import { ContinuityDay } from './ContinuityDay.js';
import { loadLocalOperations, loadLocalWorkQueue, LocalOperationsError, runLocalReview } from './local-operations-client.js';
import { LocalTaskFocus } from './LocalTaskFocus.js';
import { useTaskOutcomes } from './TaskOutcomesHost.js';
import './local-operations.css';
import { daysLate, dueLabel, splitTaskLabel, TASK_BUCKET_ORDER, TASK_BUCKETS, type TaskBucket } from './task-display.js';
import { inContingencyScope } from './app-shell/contingency.js';
import { useContingency } from './app-shell/useContingency.js';
import { textMatches } from '../shared/text-match.js';

/** Petición de abrir una tarea por ID desde fuera de Hoy (la superficie de resultados). El `nonce` distingue peticiones repetidas del mismo ID. */
export type OpenTaskRequest = { taskId: string; attemptId?: string | null; nonce: number };
type Props = { view: 'today' | 'agents'; onOpenTasks: () => void; onOpenDeals: () => void; onOpenProposals: () => void; onPrepare: () => void; onRecordSaved?: () => Promise<unknown>; openTaskRequest?: OpenTaskRequest | null; onOpenTaskHandled?: () => void; onDispatch?: () => void; filterRequest?: TaskBucket | null; onFilterHandled?: () => void };
const NO_OPS: readonly TaskSaveOperation[] = [], subscribeNone = () => () => undefined, snapshotNone = () => NO_OPS;
// «Operaciones claras»: filtros con recuento y grupos en el orden de urgencia. El filtro es solo de vista: no cambia la cola ni los recuentos de la copia.
// Nombres y tonos vienen de task-display (TASK_BUCKETS), los mismos que usan las etiquetas de cada tarea.
type Bucket = TaskBucket;
const bucketOrder: Bucket[] = TASK_BUCKET_ORDER;
const bucketNames = Object.fromEntries(bucketOrder.map(bucket => [bucket, TASK_BUCKETS[bucket].one])) as Record<Bucket, string>;
const groupNames = Object.fromEntries(bucketOrder.map(bucket => [bucket, TASK_BUCKETS[bucket].group])) as Record<Bucket, string>;
const bucketTone = Object.fromEntries(bucketOrder.map(bucket => { const tone = TASK_BUCKETS[bucket].tone; return [bucket, tone === 'neutral' ? undefined : tone]; })) as Record<Bucket, 'danger' | 'warn' | undefined>;
export function LocalOperations({ view, onOpenTasks, onOpenDeals, onPrepare, onRecordSaved, openTaskRequest, onOpenTaskHandled, onDispatch, filterRequest, onFilterHandled }: Props) {
  // Con propietario (App real) la ficha delega el guardado en el gestor compartido y Hoy solo se ofrece como consumidor de la recarga; sin él, comportamiento anterior.
  const outcomes = useTaskOutcomes();
  const [data, setData] = useState<Operations | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | Bucket>('all');
  // R1 · En contingencia, «Todas» en Hoy enseña solo lo urgente; «Ver todas» lo deshace solo en esta visita.
  const contingency = useContingency(), [showAllInContingency, setShowAllInContingency] = useState(false);
  const [ack, setAck] = useState<LocalReview | null>(null), [reloadFailed, setReloadFailed] = useState(false);
  const [focusedTask, setFocusedTask] = useState<string | null>(null), [focusedAttempt, setFocusedAttempt] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null), queueHeading = useRef<HTMLHeadingElement | null>(null);
  const alive = useRef(true), controller = useRef<AbortController | null>(null), sequence = useRef(0);
  const pending = useRef<{ revision: string; key: string } | null>(null), flight = useRef(false);
  // «Organizar mi jornada»: la Jornada (205) consume la cola ESTRUCTURADA (230) por el adaptador (A3). Es una selección en memoria, no escribe nada. Su ámbito es esta vista de Hoy abierta
  // Y la identidad completa de la copia (instalación, captura, generación…): otra identidad la reinicia aunque se repitan los IDs; salir de Hoy o recargar la descarta.
  const [dayOpen, setDayOpen] = useState(false), [day, setDay] = useState<{ input: WorkDayInput; evaluatedAt: string; epoch: number; print: string } | null>(null), [epoch, setEpoch] = useState(0), [dayError, setDayError] = useState(''), [dayLoading, setDayLoading] = useState(false);
  // BARRERA DE CONTEXTO (R2). Cada lectura de Hoy es una ÉPOCA. La jornada solo ofrece acciones cuando su cola se leyó EN LA ÉPOCA ACTUAL y es de la misma copia que muestra la lista de Hoy:
  //  · la lista v1 trae `instanceId`, `captureId` y `capturedAt` (parte de la identidad de la cola 230: faltan inicio de captura, cuenta y generación): sirve solo de PRIMER filtro y para retirar el plan ante un cambio conocido, NUNCA para autorizar;
  //  · AUTORIZAR exige la identidad COMPLETA: tras recibir la cola se lee la identidad vigente de la copia (`readContext`, la misma lectura de la ficha) y debe dar EXACTAMENTE la clave de la cola; otra generación, cuenta o inicio de captura la descarta y se relee una vez;
  //  · un cambio conocido de la copia en la lista RETIRA el plan anterior; cola pendiente, con error o recibida tarde de otra copia no renueva la autorización;
  //  · la misma copia comprobada conserva estimaciones (la clave completa de la cola es la misma); otra identidad las reinicia.
  // Mientras no esté confirmada, lo mostrado es solo de consulta (`inert`).
  const epochRef = useRef(0), v1Ref = useRef<{ epoch: number; instanceId: string; captureId: string | null; capturedAt: string | null; print: string } | null>(null), pendingWork = useRef<{ input: WorkDayInput; evaluatedAt: string; identity: { instanceId: string; snapshotId: string; capturedAt: string } | null; epoch: number } | null>(null), retried = useRef(new Set<number>()), confirmSeq = useRef(0), confirmAbort = useRef<AbortController | null>(null), dayActiveRef = useRef(false);
  const dayOpenRef = useRef(false), dayController = useRef<AbortController | null>(null), daySequence = useRef(0), dayButton = useRef<HTMLButtonElement | null>(null), dayBody = useRef<HTMLDivElement | null>(null), dayOrigin = useRef(false);
  const ops = useSyncExternalStore(outcomes?.controller.subscribe ?? subscribeNone, outcomes?.controller.getSnapshot ?? snapshotNone, snapshotNone);
  // Un guardado sin resolver solo afecta a la Jornada de SU copia: la misma ID en otra captura u otra generación no se confunde.
  const hints = useMemo(() => {
    const result: OutcomeHints = Object.create(null);
    if (day?.input.key) for (const op of ops) { if (op.supersededBy || (op.status !== 'uncertain' && op.status !== 'in_flight') || contextKey(op.context) !== day.input.key) continue; result[op.taskId] = op.status === 'uncertain' ? 'uncertain' : 'in_flight'; }
    return result;
  }, [ops, day?.input.key]);
  function reconcile() {
    const v = v1Ref.current, w = pendingWork.current;
    if (v) setDay(previous => previous && previous.print !== v.print ? null : previous);   // la copia que muestra Hoy cambió: el plan anterior ya no es de esta copia
    if (!v || !w || v.epoch !== w.epoch || w.epoch !== epochRef.current) return;
    pendingWork.current = null;
    const same = w.identity ? v.instanceId === w.identity.instanceId && v.captureId === w.identity.snapshotId && v.capturedAt === w.identity.capturedAt : v.captureId === null;
    if (same) { void confirmFull(w, v.print); return; }
    setDay(null);   // la cola es de otra copia (llegó tarde): no se usa; se relee UNA vez y, si sigue sin coincidir, se avisa
    if (!retried.current.has(w.epoch)) { retried.current.add(w.epoch); void loadDay(); } else setDayError('La cola de la jornada no corresponde a la copia que muestra Hoy. Pulsa «Actualizar».');
  }
  /** Comprobación COMPLETA: la identidad vigente leída DESPUÉS de recibir la cola debe ser exactamente la de la cola. Cancelable y con guarda de época y de secuencia. */
  async function confirmFull(w: NonNullable<typeof pendingWork.current>, print: string) {
    confirmAbort.current?.abort(); const abort = new AbortController(); confirmAbort.current = abort; const seq = ++confirmSeq.current, still = () => alive.current && seq === confirmSeq.current && w.epoch === epochRef.current && !abort.signal.aborted;
    const timer = setTimeout(() => abort.abort(), 15_000);
    try {
      const { context } = await readContext(abort.signal); if (!still()) return;
      const same = w.input.key === null ? context.snapshotId === null : contextKey(context) === w.input.key;
      if (same) { setDay({ input: w.input, evaluatedAt: w.evaluatedAt, epoch: w.epoch, print }); setDayError(''); return; }
      setDay(null);   // la cola es de otra identidad (generación, cuenta, inicio de captura…): no autoriza nada; se relee UNA vez y no se elige otra copia por cuenta propia
      if (!retried.current.has(w.epoch)) { retried.current.add(w.epoch); void loadDay(); } else setDayError('La cola de la jornada no corresponde a la copia actual. Pulsa «Actualizar».');
    } catch (failure) { if (still()) setDayError(failure instanceof Error && !abort.signal.aborted ? 'No se pudo comprobar la identidad completa de la copia: la jornada queda de consulta. Pulsa «Actualizar».' : 'La comprobación de la copia tardó demasiado. Pulsa «Actualizar».'); }
    finally { clearTimeout(timer); }
  }
  async function loadDay() {
    dayController.current?.abort(); const abort = new AbortController(); dayController.current = abort;
    const current = ++daySequence.current; setDayLoading(true); setDayError('');
    const timer = setTimeout(() => abort.abort(), 15_000);
    const startedIn = epochRef.current;
    try { const work = await loadLocalWorkQueue(abort.signal); if (!alive.current || current !== daySequence.current || startedIn !== epochRef.current) return; pendingWork.current = { input: dayInputFromWorkQueue(work), evaluatedAt: work.evaluatedAt, identity: work.identity ? { instanceId: work.identity.instanceId, snapshotId: work.identity.snapshotId, capturedAt: work.identity.capturedAt } : null, epoch: startedIn }; reconcile(); }
    catch (failure) { if (alive.current && current === daySequence.current) setDayError(abort.signal.aborted ? 'La lectura de la cola tardó demasiado. Vuelve a intentarlo.' : failure instanceof Error ? failure.message : 'No se pudo leer la cola de trabajo.'); }
    finally { clearTimeout(timer); if (alive.current && current === daySequence.current) setDayLoading(false); }
  }
  function toggleDay() {
    const next = !dayOpenRef.current; dayOpenRef.current = next; setDayOpen(next);
    if (next) { if (!day || dayError) void loadDay(); requestAnimationFrame(() => dayBody.current?.focus()); }
    else requestAnimationFrame(() => dayButton.current?.focus());
  }
  // Un botón de la Jornada puede desaparecer mientras la ficha está abierta (una tarea con guardado en curso sale de la propuesta y vuelve): el retorno de foco no guarda el NODO sino su nombre exacto y su sección.
  function openFromDay(taskId: string) { if (!dayActiveRef.current) return; opener.current = null; dayReturn.current = dayClicked.current; dayOrigin.current = true; setFocusedAttempt(null); setFocusedTask(taskId); }
  function returnToDay() {
    const scope = dayBody.current, wanted = dayReturn.current; if (!scope) return;
    const same = wanted?.label ? [...scope.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.getAttribute('aria-label') === wanted.label) : [];
    (same.find(button => button.closest('section')?.getAttribute('aria-labelledby') === wanted?.section) ?? same[0] ?? scope).focus();
  }
  const dayClicked = useRef<{ label: string | null; section: string | null } | null>(null), dayReturn = useRef<{ label: string | null; section: string | null } | null>(null);
  async function load(propagate = false) {
    const myEpoch = ++epochRef.current; setEpoch(myEpoch); pendingWork.current = null; v1Ref.current = null; confirmSeq.current++; confirmAbort.current?.abort();
    if (view === 'today') void loadDay();   // la cola estructurada se lee junto con la lista de Hoy; un fallo suyo no rompe la lista (solo se ve al abrir la jornada)
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const current = ++sequence.current; setLoading(true); setError('');
    const timer = setTimeout(() => abort.abort(), 15_000);
    try { const next = await loadLocalOperations(abort.signal); if (!alive.current || current !== sequence.current) throw new Error('La lectura fue sustituida por otra.'); setData(next); setReloadFailed(false); restoreFocusIfRowGone(); if (myEpoch === epochRef.current) { v1Ref.current = { epoch: myEpoch, instanceId: next.context.instanceId, captureId: next.context.captureId, capturedAt: next.context.capturedAt, print: JSON.stringify([next.context.instanceId, next.context.captureId, next.context.capturedAt, next.context.phase]) }; reconcile(); } }
    catch (failure) { if (alive.current && current === sequence.current) { setError(abort.signal.aborted ? 'La consulta tardó demasiado. Vuelve a intentarlo.' : failure instanceof Error ? failure.message : 'No se pudo cargar la copia.'); setReloadFailed(true); } if (propagate) throw failure; }
    finally { clearTimeout(timer); if (alive.current && current === sequence.current) setLoading(false); }
  }
  // Si la fila desde la que se abrió la ficha desaparece de la cola (la tarea se completó) y el foco se perdió, vuelve a un control útil: el encabezado de la cola.
  function restoreFocusIfRowGone() {
    requestAnimationFrame(() => {
      if (!alive.current || !opener.current || opener.current.isConnected || document.querySelector('[role="dialog"]')) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      queueHeading.current?.focus(); opener.current = null;
    });
  }
  function closeTask() {
    setFocusedTask(null); setFocusedAttempt(null);
    requestAnimationFrame(() => {
      if (!alive.current || (document.activeElement && document.activeElement !== document.body)) return;
      if (dayOrigin.current) returnToDay(); else if (!opener.current?.isConnected) queueHeading.current?.focus();
    });
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; sequence.current++; controller.current?.abort(); daySequence.current++; dayController.current?.abort(); confirmSeq.current++; confirmAbort.current?.abort(); }; }, []);
  // Al bloquear, la cola de la Jornada se retira y una lectura en vuelo se descarta.
  useEffect(() => { const lock = () => { daySequence.current++; dayController.current?.abort(); dayOpenRef.current = false; pendingWork.current = null; v1Ref.current = null; epochRef.current++; confirmSeq.current++; confirmAbort.current?.abort(); setDay(null); setDayOpen(false); setDayLoading(false); }; window.addEventListener('planb:locked', lock); return () => window.removeEventListener('planb:locked', lock); }, []);
  // Hoy se ofrece al propietario como consumidor de la recarga posterior a un guardado y le dice si hay una ficha abierta (la superficie se oculta mientras tanto).
  const registerToday = outcomes?.registerToday, setFichaOpen = outcomes?.setFichaOpen;
  useEffect(() => registerToday?.({ reload: () => load(true), mounted: () => alive.current }), [registerToday]);
  useEffect(() => { setFichaOpen?.(!!focusedTask); return () => setFichaOpen?.(false); }, [setFichaOpen, !!focusedTask]);
  // Abrir una tarea por ID desde la superficie: la ficha la carga por su cuenta; aquí solo se abre una vez por petición.
  useEffect(() => { if (!filterRequest) return; setFilter(filterRequest); onFilterHandled?.(); }, [filterRequest]);
  useEffect(() => { if (!openTaskRequest) return; opener.current = null; dayOrigin.current = false; setFocusedAttempt(openTaskRequest.attemptId ?? null); setFocusedTask(openTaskRequest.taskId); onOpenTaskHandled?.(); }, [openTaskRequest?.nonce]);
  async function review() {
    if (!data || flight.current) return;
    flight.current = true; setBusy(true); setError('');
    const operation = pending.current ?? { revision: data.revision, key: crypto.randomUUID() }; pending.current = operation;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15_000);
    try {
      const result = await runLocalReview(operation.revision, operation.key, abort.signal);
      if (!alive.current) return;
      setAck(result.review); pending.current = null; await load();
    } catch (failure) {
      if (failure instanceof LocalOperationsError && [409, 422].includes(failure.status)) pending.current = null;
      if (alive.current) setError(failure instanceof Error ? failure.message : 'No se pudo confirmar la revisión. Reintenta con la misma clave.');
    }
    finally { clearTimeout(timer); flight.current = false; if (alive.current) setBusy(false); }
  }
  // Asociaciones que la copia no puede comprobar (no captura esa entidad) o que la lista no muestra: se declaran como DESCONOCIDAS, no como ausentes ni como correctas.
  const dayActive = !!day && day.epoch === epoch; dayActiveRef.current = dayActive;
  const unverified = day ? day.input.candidates.flatMap(candidate => { const note = referenceNoteOf(day.input.referenceNotes, candidate.id); return note && (note.unverifiable > 0 || note.notShown > 0) ? [{ candidate, note }] : []; }) : [];
  const last = ack ? { ...ack, stale: !!data && ack.revision !== data.revision } : data?.lastReview;
  const urgentOnly = view === 'today' && !!contingency && filter === 'all' && !showAllInContingency;
  const visible = data?.tasks.filter(task => (filter === 'all' ? !urgentOnly || inContingencyScope(task.bucket) : task.bucket === filter) && textMatches(task.label + ' ' + task.id, query)) ?? [];
  const hiddenByContingency = urgentOnly ? data?.tasks.filter(task => !inContingencyScope(task.bucket)).length ?? 0 : 0;
  const groups = bucketOrder.map(bucket => ({ bucket, tasks: visible.filter(task => task.bucket === bucket) })).filter(group => group.tasks.length > 0);
  const shownIn = (bucket: Bucket) => data?.tasks.filter(task => task.bucket === bucket).length ?? 0;
  return <section className="lop" aria-labelledby="lop-title">
    <header className="page-header"><div><h1 id="lop-title">{view === 'today' ? 'Hoy' : 'Propuestas'}</h1><p className="page-subtitle">{view === 'today' ? 'Tareas de tu copia, ordenadas para decidir qué atender.' : 'Comprueba tu trabajo local y conserva el resultado de la revisión.'}</p></div><button className="button secondary" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={16} />Actualizar</button></header>
    {error ? <div className="error-box" role="alert"><p>{error}</p><button className="text-button" onClick={() => void load()}>Reintentar lectura</button></div> : null}
    {last ? <p className="lop-confirmation" data-stale={last.stale || reloadFailed ? 'true' : undefined} role="status">{last.stale || reloadFailed ? <Clock3 size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}<span>Revisión local guardada: {new Date(last.at).toLocaleString('es-ES')} · {last.tasks} tareas comprobadas.{last.stale ? ' Corresponde a una revisión anterior de la copia.' : ''}{reloadFailed ? ' El resultado está guardado, pero no se pudo actualizar la pantalla.' : ''}</span></p> : null}
    {loading && !data ? <p role="status" className="ui-loading">Leyendo la copia local…</p> : !data ? <p>La copia no está disponible. Reintenta la consulta para continuar.</p> : <>
      <div className="lop-context"><strong>{data.context.name}</strong><span>{data.context.phase === 'active' ? 'Copia activa' : data.context.phase === 'imported' ? 'Captura importada · pendiente de activar' : 'Sin captura'}</span><span>{data.context.isTestData === null ? 'Sin fuente' : data.context.isTestData ? 'Datos ficticios' : 'Datos de tu copia'}</span></div>
      {data.context.phase !== 'active' ? <div className="lop-prepare"><p>{data.context.phase === 'empty' ? 'Importa una captura para consultar las tareas y preparar el trabajo.' : 'Puedes consultar lo importado. Completa la preparación para habilitar la edición.'}</p><button className="button primary" onClick={onPrepare}>Continuar preparación<ArrowRight size={16} /></button></div> : null}
      {data.counts ? <>
        <div className="oc-filters" role="group" aria-label="Filtrar las tareas mostradas"><button type="button" className="oc-filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas<span className="oc-count">{data.tasks.length}</span></button>{bucketOrder.map(bucket => <Fragment key={bucket}><button type="button" className="oc-filter" data-tone={shownIn(bucket) > 0 ? bucketTone[bucket] : undefined} aria-pressed={filter === bucket} onClick={() => setFilter(filter === bucket ? 'all' : bucket)}>{groupNames[bucket]}<span className="oc-count">{shownIn(bucket)}</span></button>{bucket === 'overdue' && view === 'today' && onDispatch && data.context.phase === 'active' && data.counts!.overdue > 0 ? <button type="button" className="text-button lop-dispatch" onClick={onDispatch} aria-label={'Despachar ' + (data.counts!.overdue === 1 ? 'la tarea vencida' : 'las ' + data.counts!.overdue + ' tareas vencidas') + ' de la copia, una a una'}>Despachar</button> : null}</Fragment>)}<span className="oc-copy-total"><span>Tareas en la copia</span> <strong>{data.counts.tasks}</strong></span></div>
        {view === 'agents' ? <section className="lop-review"><ClipboardCheck size={24} /><div><h2>Revisión de prioridades</h2><p>Comprueba vencimientos, estados desconocidos y datos de las tareas. Funciona con reglas locales, sin enviar información a un proveedor de IA.</p><p>El resultado se guarda en esta instalación. No crea tareas ni envía correos.</p>{data.unavailableReason ? <p>{data.unavailableReason}</p> : null}<button className={'button ' + (data.context.phase === 'active' ? 'primary' : 'secondary')} disabled={!data.reviewable || busy || loading} onClick={() => void review()}>{busy ? 'Revisando…' : pending.current ? 'Reintentar la misma revisión' : 'Revisar mi copia'}</button></div></section> : null}
        <section aria-labelledby="lop-queue"><div className="lop-queue-heading"><h2 id="lop-queue" ref={queueHeading} tabIndex={-1}>{view === 'today' ? 'Qué atender primero' : 'Trabajo que comprobará la revisión'}</h2><div className="lop-queue-actions">
          {view === 'today' ? <button type="button" className={'button ' + (data.context.phase === 'active' ? 'primary' : 'secondary')} ref={dayButton} aria-expanded={dayOpen} aria-controls="lop-day" onClick={toggleDay}><ListChecks size={16} aria-hidden="true" />{dayOpen ? 'Ocultar la jornada' : 'Organizar mi jornada'}</button> : null}
          {data.context.phase === 'active' ? <button className="text-button" onClick={onOpenTasks}>Abrir tareas<ArrowRight size={14} /></button> : null}
        </div></div>
          {view === 'today' && dayOpen ? <div id="lop-day" className="lop-day" ref={dayBody} tabIndex={-1} role="region" aria-label="Organizar mi jornada" onClickCapture={event => { const button = (event.target as HTMLElement).closest('button'); dayClicked.current = button ? { label: button.getAttribute('aria-label'), section: button.closest('section')?.getAttribute('aria-labelledby') ?? null } : null; }}>
            {dayError ? <div className="error-box" role="alert"><p>{day ? 'No se pudo actualizar la cola de la jornada; se muestra la última lectura (' + new Date(day.evaluatedAt).toLocaleTimeString('es-ES') + '). ' : ''}{dayError}</p><button className="text-button" disabled={dayLoading} onClick={() => void loadDay()}>Reintentar la lectura de la cola</button></div> : null}
            {!day ? (dayLoading ? <p role="status" className="ui-loading">Leyendo la cola de trabajo…</p> : dayError ? null : <p className="lop-day-note" role="status">La jornada espera a que Hoy confirme la copia actual. Pulsa «Actualizar» si no avanza.</p>)
              : day.input.phase === 'empty' ? <p className="lop-day-note" role="status">Esta copia todavía no tiene captura: no hay tareas que organizar. Importa una captura desde la preparación.</p>
              : <>
                <p className="lop-day-note" role="status">{day.input.phase === 'imported' ? 'Captura importada, sin activar: puedes organizar la jornada con lo importado; para editar tareas hay que completar la preparación. ' : ''}{dayLoading ? 'Actualizando la cola… ' : ''}Cola leída a las {new Date(day.evaluatedAt).toLocaleTimeString('es-ES')}: {day.input.coverage.queued ?? 0} {day.input.coverage.queued === 1 ? 'tarea abierta o por revisar' : 'tareas abiertas o por revisar'} en la copia, {day.input.coverage.returned} en esta lista.</p>
                {day.input.coverage.notice ? <p className="lop-day-coverage" role="status" data-partial="true">{day.input.coverage.notice}</p> : null}
                {data.counts && day.input.coverage.queued !== null && data.counts.queued !== day.input.coverage.queued ? <p className="lop-day-coverage" role="status" data-changed="true">La lista de Hoy ({data.counts.queued}) y la cola de la jornada ({day.input.coverage.queued}) se leyeron en momentos distintos. Pulsa «Actualizar» para releerlas juntas.</p> : null}
                {!dayActive ? <p className="lop-day-coverage" role="status" data-inactive="true">{dayLoading ? 'Comprobando que la jornada sea de la copia actual… ' : 'No se pudo confirmar la copia actual. '}Lo que ves es la lectura de las {new Date(day.evaluatedAt).toLocaleTimeString('es-ES')}, solo de consulta: no se pueden abrir tareas ni cambiar la selección hasta confirmarla.</p> : null}
                <div className={dayActive ? undefined : 'lop-day-inactive'} inert={!dayActive} aria-hidden={!dayActive}><ContinuityDay key={day.input.key ?? 'sin-captura'} candidates={day.input.candidates} notConsidered={day.input.notConsidered} hints={hints} onOpenTask={openFromDay} /></div>
                {unverified.length ? <details className="lop-day-unverified"><summary>Asociaciones que no se pueden comprobar ({unverified.length})</summary>
                  <p>Estas tareas tienen asociaciones que esta copia no puede comprobar (no captura esa entidad) o que la lista no muestra. No se tratan como ausentes ni como correctas: ábrelas para revisarlas.</p>
                  <ul>{unverified.map(({ candidate, note }) => <li key={candidate.id}><strong>{candidate.label}</strong> <code>{shortId(candidate.id)}</code>: {[note.unverifiable ? note.unverifiable + (note.unverifiable === 1 ? ' asociación sin comprobar' : ' asociaciones sin comprobar') : '', note.notShown ? note.notShown + (note.notShown === 1 ? ' asociación sin mostrar' : ' asociaciones sin mostrar') : ''].filter(Boolean).join(' · ')}</li>)}</ul></details> : null}
              </>}
          </div> : null}
          {view === 'today' && contingency && filter === 'all' ? <p className="lop-contingency" role="status" data-showing={urgentOnly ? 'urgent' : 'all'}><span><strong>Modo contingencia.</strong> {urgentOnly ? 'Solo lo vencido y lo que vence en 24 horas' + (hiddenByContingency ? ': ' + hiddenByContingency + (hiddenByContingency === 1 ? ' tarea queda' : ' tareas quedan') + ' para después.' : '.') : 'Estás viendo todas las tareas.'}</span><button type="button" className="text-button" onClick={() => setShowAllInContingency(!showAllInContingency)}>{urgentOnly ? 'Ver todas' : 'Solo lo urgente'}</button></p> : null}
          <label className="field lop-search"><span>Buscar en las tareas mostradas</span><input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Filtrar por texto…" /></label>
          {visible.length ? <div className="oc-table" role="table" aria-label="Tareas de Hoy por estado"><div className="oc-table-head" role="row"><span role="columnheader">Tarea</span><span role="columnheader">Vence</span><span role="columnheader"><span className="oc-sr">Acción</span></span></div>{groups.map(group => <div key={group.bucket} role="none"><div role="row"><div role="cell" aria-colspan={3}><h3 className="oc-group" data-tone={bucketTone[group.bucket]}>{groupNames[group.bucket]} · {group.tasks.length}</h3></div></div><ul className="lop-tasks" role="rowgroup" aria-label={groupNames[group.bucket]}>{group.tasks.map(task => { const [what, who] = splitTaskLabel(task.label || 'Tarea sin título'), late = task.bucket === 'overdue' ? daysLate(task.due) : null; return <li key={task.id} role="row"><div style={{ minWidth: 0 }} role="cell"><span className="oc-task-title" title={task.label}>{what}{who ? <span className="oc-task-who">{who}</span> : null}</span><span className="oc-sr"> · {bucketNames[task.bucket]}. {task.reasons.join(' ')} {task.nextAction}</span></div><span className="oc-due" role="cell" data-tone={task.dueKind === 'invalid' ? undefined : bucketTone[task.bucket]}>{task.dueKind === 'invalid' ? 'Fecha por revisar' : dueLabel(task.due, task.dueKind) + (late && late > 0 ? ' · ' + late + ' d' : '')}</span>{view === 'today' ? <span className="lop-cell-action" role="cell"><button type="button" className="button secondary lop-open-task" aria-label={'Abrir ' + task.label + ' (ID ' + task.id + ')'} onClick={event => { opener.current = event.currentTarget; dayOrigin.current = false; setFocusedAttempt(null); setFocusedTask(task.id); }}>Abrir<ArrowRight size={14} aria-hidden="true" /></button></span> : <span role="cell" />}</li>; })}</ul></div>)}</div> : <p className={'lop-empty ui-empty' + (!query && !data.counts.queued && data.context.phase === 'active' ? ' ui-empty-ok' : '')}>{query ? 'No hay coincidencias entre las tareas mostradas.' : urgentOnly && data.tasks.length ? 'Nada vencido ni que venza en 24 horas. Lo demás puede esperar a que vuelva HubSpot.' : data.counts.queued ? 'No se han recibido las tareas. Actualiza la copia.' : 'No hay tareas abiertas que atender en esta copia.'}</p>}
          <p className="helper">{data.counts.returned} de {data.counts.queued} tareas abiertas o pendientes de revisar · {data.counts.completed} completadas. Los recuentos incluyen toda la copia.</p>
        </section>
        {data.context.phase === 'active' ? <button className="button secondary" onClick={onOpenDeals}>Abrir oportunidades<ArrowRight size={16} /></button> : null}
      </> : null}
      <details className="lop-details"><summary>Cómo se calcula y qué incluye</summary><ul>{data.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul></details>
    </>}
    {focusedTask ? <LocalTaskFocus taskId={focusedTask} outcomes={outcomes?.controller} revised={outcomes?.revised} adoptAttemptId={focusedAttempt} onClose={closeTask} onSaved={async () => {
      await onRecordSaved?.();
      if (!alive.current) throw new Error('La vista de Hoy ya no está abierta.');
      await load(true);
    }} onPrepare={onPrepare} /> : null}
  </section>;
}
