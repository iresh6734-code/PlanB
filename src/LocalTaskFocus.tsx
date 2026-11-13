import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react';
import { Modal } from './components.js';
import { ReferenceSelect } from './ReferenceSelect.js';
import { loadTask, readTask, saveTask, TaskFocusError, verifyAfterUncertain, type SaveOutcome, type Verification } from './local-task-focus-client.js';
import type { TaskSaveOutcomes } from './task-save-outcome.js';
import { loadRevisedTask } from './task-revision-strategy.js';
import { TaskConflictReview } from './TaskConflictReview.js';
import {
  buildPatch, changedKeys, displayFieldValue, sameTaskCapture, findConflicts, formatInstant, instantToLocalInput, localInputToInstant, rebaseDraft, taskTitle, validateDraft,
  type Conflict, type Evidence, type TaskContext, type TaskFocusProps, type TaskSchema,
} from '../shared/local-task-focus.js';
import { describeOperation, type TaskSaveOperation } from '../shared/task-save-outcome.js';
import { resolveAdoption } from '../shared/task-attempt-adoption.js';
import type { Proposal } from '../shared/task-conflict-review.js';
import type { CrmRecord, Entity, Field, FieldValue } from '../shared/model.js';
import './local-task-focus.css';

/** `revision` = token de la lectura que la persona revisó (solo en modo condicionado). Pertenece al MISMO registro y contexto: se entrega junto a ellos y nunca se renueva para reenviar. */
interface Loaded { context: TaskContext; record: CrmRecord; schema: TaskSchema; revision?: string | null; }
type View = { k: 'loading' } | { k: 'error'; message: string } | { k: 'empty' } | { k: 'missing'; unsaved: string[] } | { k: 'readonly'; data: Loaded } | { k: 'edit'; data: Loaded }
  | { k: 'review'; data: Loaded; current: Loaded; patch: Record<string, FieldValue> };   // comparador 199: `data` = lo que la persona abrió, `current` = lectura ACTUAL validada
// source: «server» = el PATCH devolvió el registro; «person» = la persona aceptó el estado leído tras un acuse perdido (el servidor NO confirmó su envío).
interface Ack { record: CrmRecord; rows: { label: string; before: string; after: string }[]; source: 'server' | 'person'; /** El servidor confirmó que ya tenía esos valores: no se escribió ni se añadió historial. */ unchanged?: boolean; }
// Estado de la recarga de la cola de Hoy. Vive aparte del acuse: sobrevive a «Seguir editando».
// `source` es la PROCEDENCIA del registro que la cola debe reflejar y condiciona lo que se afirma: «server» = el PATCH devolvió el registro; «person» = la persona aceptó un estado leído
// y el servidor NO confirmó su envío. Un aviso de recarga nunca puede afirmar «confirmado» para el segundo caso (revisión 174, F1), tampoco tras «Seguir editando».
interface Queue { record: CrmRecord; status: 'idle' | 'updating' | 'ok' | 'failed'; reason: string; source: Ack['source']; }
const QUEUE_TIMEOUT_MS = 20_000;
interface Uncertain { patch: Record<string, FieldValue>; baseline: CrmRecord; message: string; verdict: Verification | 'checking'; }
interface Banner { tone: 'warning' | 'danger' | 'info'; title: string; text: string; conflicts?: Conflict[]; action?: { label: string; run: () => void }; }
type Draft = Record<string, FieldValue>;

const NOT_VERIFIED = 'La API actual no compara versiones: si otra pestaña edita a la vez el mismo campo, prevalece el último guardado. Antes de enviar se vuelve a leer la tarea y se avisa si un campo que vas a cambiar ya cambió, pero esa comprobación no es atómica.';
const REVISED_NOTE = 'Se guarda contra la versión que abriste: si otra edición cambió esta tarea antes, no se sobrescribe nada y se abre una comparación para decidir. La comprobación protege frente a un único escritor cooperante, no frente a otros procesos.';
const fieldId = (key: string) => 'ltf-f-' + key;
const show = (field: Field | undefined, value: FieldValue | undefined) => field ? displayFieldValue({ id: 'tasks', label: '', singular: '', displayField: '', columns: [''], fields: [field] }, field.key, value) : String(value ?? '—');

export interface LocalTaskFocusProps extends TaskFocusProps {
  /**
   * Gestor de resultados de guardado (unidad 136). OPCIONAL: sin él la ficha se comporta exactamente como en 123/140.
   * Con él, el gestor —no la ficha— es dueño de cada intento: la ficha lo registra con `submit`, refleja el estado de SU operación
   * y puede cerrarse sin perder el seguimiento. Contrato para quien lo pase:
   *  · debe ser el MISMO objeto mientras la ficha esté montada (si cambia, la ficha deja de seguir su intento);
   *  · debe haber una superficie `TaskSaveOutcomesPanel` montada sobre ese mismo gestor, porque la ficha remite a ella al cerrarse;
   *  · la recarga de la cola la hace el gestor mediante su `setOnConfirmed`: con `outcomes` la ficha NO llama a `onSaved`.
   */
  outcomes?: TaskSaveOutcomes;
  /**
   * Intento que se quiere retomar (unidad 219; solo con `outcomes`). Al abrir, la ficha enlaza SU seguimiento a ese intento si coinciden instalación, captura, generación, tarea
   * e intento: muestra el MISMO estado, sin PATCH y sin volver «incierto» un formulario listo para reenviar. Con `null` se adopta únicamente si hay exactamente un intento
   * sin resolver y compatible; con `undefined` (prop ausente) no se adopta nada y la ficha se comporta como en U1. Si no se puede adoptar con seguridad (otra copia, intento desaparecido, varios abiertos) se explica y no se inicia ninguna operación.
   */
  adoptAttemptId?: string | null;
  /**
   * Modo condicionado (unidad A2; solo con `outcomes`): la ficha abre con `loadRevisedTask` (registro, esquema, contexto y token de UNA lectura validada), guarda CONTRA esa revisión y ante un 409
   * `TASK_REVISION_CHANGED` abre el comparador. Un fallo de la lectura o del endpoint condicionado conserva el borrador y NUNCA cae al PATCH anterior. Sin esta prop: comportamiento de 123/219.
   */
  revised?: boolean;
}

// Qué muestra la ficha de una operación del gestor que NO llegó a aplicarse (rechazada o no enviada). Función pura: no lee ni escribe.
export type Unapplied =
  | { kind: 'field-errors'; fields: Record<string, string>; message: string }   // 422
  | { kind: 'rejected'; message: string }                                        // 409 y demás 4xx: llegó y el servidor no escribió
  | { kind: 'missing' } | { kind: 'locked' }
  | { kind: 'preflight-failed'; message: string } | { kind: 'context-changed'; message: string } | { kind: 'conflict'; message: string }
  | { kind: 'revision-conflict'; message: string };   // 409 TASK_REVISION_CHANGED: el servidor NO escribió; se compara con la versión actual
export function classifyUnapplied(op: TaskSaveOperation): Unapplied | null {
  if (op.status !== 'rejected' && op.status !== 'not_sent') return null;
  const { kind, message, fields } = op.detail;
  if (kind === 'missing') return { kind: 'missing' };
  if (kind === 'locked') return { kind: 'locked' };
  if (op.status === 'rejected' && op.detail.revisionConflict) return { kind: 'revision-conflict', message };
  if (op.status === 'rejected') return kind === 'invalid' ? { kind: 'field-errors', fields: fields ?? {}, message } : { kind: 'rejected', message };
  if (kind === 'conflict') return { kind: 'conflict', message };
  if (kind === 'context-changed') return { kind: 'context-changed', message };
  return { kind: 'preflight-failed', message };
}
// La evidencia del gestor, en el vocabulario de la vista de «resultado incierto». Sin evidencia todavía = se está comprobando.
export function verdictFromOperation(op: TaskSaveOperation): Verification | 'checking' {
  const evidence = op.evidence;
  if (op.verifying || !evidence) return 'checking';
  if ((evidence.kind === 'applied' || evidence.kind === 'unchanged' || evidence.kind === 'diverged') && evidence.record) return { kind: 'read', evidence: evidence.kind as Evidence, record: evidence.record };
  return evidence.kind === 'context-changed' || evidence.kind === 'missing' || evidence.kind === 'locked' ? { kind: evidence.kind } : { kind: 'unknown' };
}
type Opened = { kind: 'empty' } | { kind: 'missing' } | { kind: 'ok'; context: TaskContext; record: CrmRecord; schema: TaskSchema | null; revision: string | null };
/** Abre la tarea: con `revised`, UNA lectura validada con token (183); un error NUNCA cambia de modo. Sin `revised`, la lectura de 123. */
async function openTask(taskId: string, signal: AbortSignal, revised: boolean): Promise<Opened> {
  if (!revised) { const result = await loadTask(taskId, signal); return result.kind === 'ok' ? { kind: 'ok', context: result.context, record: result.record, schema: result.schema, revision: null } : { kind: result.kind }; }
  const result = await loadRevisedTask(taskId, signal);
  if (result.kind === 'ok') return { kind: 'ok', context: result.context, record: result.record, schema: result.schema, revision: result.revision };
  if (result.kind === 'failed') { if (result.status === 404) return { kind: 'missing' }; throw new TaskFocusError(result.status, result.message); }
  if (result.kind === 'unavailable') return { kind: 'empty' };
  throw new TaskFocusError(0, 'La copia cambió mientras se leía la tarea. Vuelve a intentarlo.', null, 'context');
}
const NO_OPERATIONS: readonly TaskSaveOperation[] = [];
const NO_STORE = { subscribe: () => () => undefined, getSnapshot: () => NO_OPERATIONS };

// Ficha lateral de UNA tarea local (entidad tasks) para abrir desde Hoy. Lee por ID, edita con el esquema vigente y guarda
// con PATCH manual. «El PATCH confirmó» y «la cola pudo recargarse» son hechos distintos: un fallo de onSaved nunca
// convierte un guardado confirmado en fallo ni reenvía el PATCH.
export function LocalTaskFocus({ taskId, onClose, onSaved, onPrepare, outcomes, adoptAttemptId, revised }: LocalTaskFocusProps) {
  const revisedMode = !!outcomes && !!revised;
  const [view, setView] = useState<View>({ k: 'loading' }), [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>({}), [errors, setErrors] = useState<Record<string, string>>({}), [notes, setNotes] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null), [busy, setBusy] = useState(false), [stale, setStale] = useState('');
  const [ack, setAck] = useState<Ack | null>(null), [queue, setQueue] = useState<Queue | null>(null), [uncertain, setUncertain] = useState<Uncertain | null>(null), [discard, setDiscard] = useState(false);
  const [receiptRead, setReceiptRead] = useState<{ pending: boolean; message: string } | null>(null);
  const readingReceipt = useRef(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const alive = useRef(true), run = useRef(0), flight = useRef(0), controller = useRef<AbortController | null>(null);
  const latest = useRef({ onSaved, onClose, outcomes }); latest.current = { onSaved, onClose, outcomes };
  const requestFocus = (id: string) => setFocus(previous => ({ id, n: (previous?.n ?? 0) + 1 }));
  useEffect(() => { if (focus) document.getElementById(focus.id)?.focus(); }, [focus]);

  // Con gestor: el intento que ESTA ficha registró (ID local). `trackedRef` se asigna en el mismo instante del `submit` para que un segundo
  // clic no llegue a ver el estado de React anterior; la operación se localiza por intento Y por tarea, así dos homónimas no se confunden.
  const [tracked, setTracked] = useState<string | null>(null), [showAck, setShowAck] = useState(true);
  const trackedRef = useRef<string | null>(null), handled = useRef(''), ackShown = useRef(false);
  // Intento que esta ficha RECUPERÓ de «Resultados» (no lo originó con `submit`): si luego llega un rechazo o un no enviado, el aviso sigue siendo del gestor (R2, dictamen 228).
  const adoptedRef = useRef<string | null>(null);
  const store = outcomes ?? NO_STORE;
  const operations = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const op = outcomes && tracked ? operations.find(item => item.attemptId === tracked && item.taskId === taskId) : undefined;

  // Cada taskId (o reintento) arranca limpio: respuestas, borrador y avisos de otra tarea no se reutilizan.
  useEffect(() => {
    alive.current = true; const mine = ++run.current, abort = new AbortController(); controller.current = abort;
    setView({ k: 'loading' }); setDraft({}); setErrors({}); setNotes({}); setBanner(null); setBusy(false); setStale(''); setAck(null); setQueue(null); setUncertain(null); setDiscard(false); flight.current = 0;   // un guardado en vuelo de OTRA tarea no bloquea esta
    setTracked(null); setShowAck(true); trackedRef.current = null; adoptedRef.current = null; handled.current = '';   // el intento de la tarea anterior sigue en el gestor, no en esta ficha
    setReceiptRead(null); readingReceipt.current = false;
    openTask(taskId, abort.signal, revisedMode).then(result => {
      if (!alive.current || mine !== run.current) return;
      if (result.kind === 'empty') setView({ k: 'empty' });
      else if (result.kind === 'missing') setView({ k: 'missing', unsaved: [] });
      else if (!result.schema) setView({ k: 'error', message: 'Esta copia no define la entidad de tareas, así que no se puede abrir la ficha.' });
      else {
        const data = { context: result.context, record: result.record, schema: result.schema, revision: result.revision };
        setDraft({ ...result.record.values }); setView({ k: result.context.ready && result.schema.spec ? 'edit' : 'readonly', data });
      }
    }, error => {
      if (!alive.current || mine !== run.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      setView({ k: 'error', message: error instanceof TaskFocusError && error.status === 401 ? 'La sesión de Plan B está bloqueada. Desbloquéala y vuelve a intentarlo; no se ha cambiado nada.'
        : error instanceof TaskFocusError ? error.message : 'No se pudo leer la tarea. No se ha cambiado nada.' });
    });
    return () => { alive.current = false; run.current++; abort.abort(); };
  }, [taskId, attempt]);

  const data = view.k === 'edit' || view.k === 'readonly' || view.k === 'review' ? view.data : null;
  const entity = data?.schema.entity ?? null;
  const compactOp = view.k === 'edit' && op?.status === 'confirmed' && op.compactReceipt ? op : null;
  // Con gestor, un intento en vuelo o incierto pertenece al gestor: cerrar la ficha no lo descarta ni lo cancela, y el borrador vive en la operación.
  const owned = op?.status === 'in_flight' || op?.status === 'uncertain', saving = busy || op?.status === 'in_flight';
  const dirty = (view.k === 'edit' && !!entity && !owned && !compactOp && (changedKeys(entity, view.data.record, draft).length > 0 || uncertain !== null)) || view.k === 'review';   // el comparador siempre tiene un borrador que no debe perderse sin avisar
  const changed = view.k === 'edit' && !!entity && changedKeys(entity, view.data.record, draft).length > 0;
  const confirmClose = () => { if (!dirty) return true; setDiscard(true); requestFocus('ltf-discard'); return false; };
  const requestClose = () => { if (confirmClose()) latest.current.onClose(); };

  // Vista derivada de la operación del gestor (o, sin gestor, del estado local de la ficha de siempre).
  const ackOp = op && (op.status === 'confirmed' || op.status === 'accepted') && op.record && showAck && data ? op : null;
  const ackView: Ack | null = outcomes ? (ackOp && entity ? { record: ackOp.record!, source: ackOp.status === 'accepted' ? 'person' : 'server', unchanged: ackOp.detail.kind === 'unchanged', rows: Object.keys(ackOp.patch).map(key => {
    const field = entity.fields.find(item => item.key === key); return { label: field?.label ?? key, before: show(field, ackOp.baseline.values[key]), after: show(field, ackOp.record!.values[key]) }; }) } : null) : ack;
  const queueView: Queue | null = outcomes ? (op?.record ? { record: op.record, status: op.queue.status, reason: op.queue.reason, source: op.status === 'accepted' ? 'person' : 'server' } : null) : queue;
  const uncertainView: Uncertain | null = outcomes ? (op?.status === 'uncertain' ? { patch: op.patch, baseline: op.baseline, message: op.detail.message, verdict: verdictFromOperation(op) } : null) : uncertain;
  useEffect(() => { ackShown.current = !!outcomes && (!!ackView || !!compactOp); });

  async function readAfterReceipt(operation: TaskSaveOperation) {
    const signal = controller.current?.signal;
    if (!signal || readingReceipt.current) return;
    const mine = run.current;
    const current = () => alive.current && mine === run.current && latest.current.outcomes === outcomes
      && trackedRef.current === operation.attemptId;
    readingReceipt.current = true;
    setReceiptRead({ pending: true, message: '' });
    let message = 'No se pudo leer la tarea actual. El guardado sigue confirmado.';
    try {
      const result = await openTask(taskId, signal, revisedMode);
      if (!current()) return;
      if (result.kind === 'missing') {
        message = 'La tarea ya no está en la copia. El guardado anterior sigue confirmado.';
      } else if (result.kind === 'ok') {
        if (!sameTaskCapture(result.context, operation.context)) {
          message = 'La copia activa cambió. Abre la tarea desde Hoy para seguir.';
        } else if (result.context.ready && result.schema?.spec && (!revisedMode || result.revision)) {
          setView({ k: 'edit', data: { context: result.context, record: result.record, schema: result.schema, revision: result.revision } });
          setDraft({ ...result.record.values });
          setReceiptRead(null);
          trackedRef.current = null;
          setTracked(null);
          requestFocus(fieldId(result.schema.entity.fields.find(field => !field.readOnly)?.key ?? ''));
          return;
        }
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof TaskFocusError && error.status === 401) {
        message = 'Desbloquea Plan B para leer la tarea. El guardado sigue confirmado.';
      } else if (error instanceof TaskFocusError && error.kind === 'context') {
        message = 'La copia activa cambió. Abre la tarea desde Hoy para seguir.';
      }
    } finally {
      if (mine === run.current) readingReceipt.current = false;
    }
    if (!current()) return;
    setReceiptRead({ pending: false, message });
    requestFocus('ltf-receipt-read-error');
  }

  function setField(key: string, value: FieldValue) {
    if (saving) return;
    setDraft(previous => ({ ...previous, [key]: value }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
  }
  async function refreshQueue(record: CrmRecord, mine: number) {
    const mark = (status: Queue['status'], reason = '') => { if (alive.current && mine === run.current) setQueue(previous => previous && previous.record === record ? { ...previous, status, reason } : previous); };
    mark('updating');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.resolve().then(() => latest.current.onSaved(record)), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), QUEUE_TIMEOUT_MS); })]);
      mark('ok');
    } catch (error) { mark('failed', error instanceof Error && error.message === 'timeout' ? 'La actualización tardó demasiado.' : ''); }
    finally { clearTimeout(timer); }
  }
  function confirmSaved(base: Loaded, baseline: CrmRecord, record: CrmRecord, keys: string[], mine: number, source: Ack['source'] = 'server') {
    const rows = keys.map(key => { const field = base.schema.entity.fields.find(item => item.key === key); return { label: field?.label ?? key, before: show(field, baseline.values[key]), after: show(field, record.values[key]) }; });
    setBusy(false); setUncertain(null); setBanner(null); setErrors({}); setNotes({}); setDiscard(false);
    setAck({ record, rows, source }); setQueue({ record, status: 'updating', reason: '', source }); setView({ k: 'edit', data: { ...base, record } }); setDraft({ ...record.values }); requestFocus('ltf-ack');
    void refreshQueue(record, mine);
  }
  async function verify(base: Loaded, pending: Uncertain, mine: number) {
    setUncertain({ ...pending, verdict: 'checking' });
    const verdict = await verifyAfterUncertain({ taskId, baseline: pending.baseline, patch: pending.patch, context: base.context });
    if (!alive.current || mine !== run.current) return;
    if (verdict.kind === 'missing') { setUncertain(null); setView({ k: 'missing', unsaved: Object.keys(pending.patch).map(key => (base.schema.entity.fields.find(f => f.key === key)?.label ?? key) + ': ' + show(base.schema.entity.fields.find(f => f.key === key), pending.patch[key])) }); return; }
    setUncertain({ ...pending, verdict }); requestFocus('ltf-uncertain');
  }

  // ── Con gestor ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // La ficha ENTREGA el intento al gestor y solo refleja su estado. No envía, no verifica y no recarga la cola por su cuenta.
  function submitManaged(base: Loaded, entity: Entity, patch: Record<string, FieldValue>) {
    setErrors({}); setBanner(null);
    const result = latest.current.outcomes!.submit({ taskId, taskLabel: taskTitle(entity, base.record) + ' (' + taskId + ')', baseline: base.record, entity, patch, context: base.context, ...(revisedMode ? { revision: base.revision ?? null } : {}) });
    if (result.kind === 'busy') {
      const existing = describeOperation(result.existing);
      setBanner({ tone: 'warning', title: 'Esta tarea ya tiene un guardado sin resolver', text: existing.title + '. ' + existing.lines.join(' ') + ' No se ha enviado nada y tu borrador se conserva. Resuélvelo en «Resultados de guardado» antes de guardar de nuevo.' });
      requestFocus('ltf-banner'); return;
    }
    if (result.kind === 'refused') { setBanner({ tone: 'info', title: 'No se ha enviado nada', text: result.reason + ' Tu borrador se conserva.' }); requestFocus('ltf-banner'); return; }
    trackedRef.current = result.attemptId; setTracked(result.attemptId); setShowAck(true); setDiscard(false); requestFocus('ltf-status');
  }
  // Otra edición cambió la tarea antes del envío (no salió nada): se relee SOLO para mostrar qué cambió y rebasar el borrador.
  async function reconcile(base: Loaded, entity: Entity, pending: TaskSaveOperation, mine: number) {
    let fresh: CrmRecord | null = null, failed = false;
    try { fresh = await readTask(taskId, controller.current?.signal); } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; failed = true; }
    if (!alive.current || mine !== run.current) return;
    if (!failed && !fresh) { setView({ k: 'missing', unsaved: Object.keys(pending.patch).map(key => (entity.fields.find(f => f.key === key)?.label ?? key) + ': ' + show(entity.fields.find(f => f.key === key), pending.patch[key])) }); return; }
    const conflicts = fresh ? findConflicts(entity, base.record, fresh, pending.patch) : [];
    if (fresh && conflicts.length) {
      setNotes(Object.fromEntries(conflicts.map(c => [c.key, 'Cambió fuera de esta ficha: antes «' + show(entity.fields.find(f => f.key === c.key), c.baseline) + '», ahora «' + show(entity.fields.find(f => f.key === c.key), c.current) + '». Tu valor se conserva hasta que guardes otra vez.'])));
      setDraft(previous => rebaseDraft(entity, base.record, fresh!, previous)); setView({ k: 'edit', data: { ...base, record: fresh } });
      setBanner({ tone: 'warning', title: 'Otra edición cambió esta tarea', text: 'No se ha guardado nada. Revisa los campos marcados; si sigues queriendo tu valor, pulsa Guardar otra vez.', conflicts });
    } else setBanner({ tone: 'warning', title: 'Otra edición cambió esta tarea', text: pending.detail.message + ' No se ha guardado nada y tu borrador se conserva' + (failed ? '; no se pudo releer la tarea para marcar los campos.' : '.') + ' Pulsa Guardar otra vez para comprobarlo de nuevo.' });
    requestFocus('ltf-banner');
  }
  // ── Comparador 199 desde un 409 real (modo condicionado) ───────────────────────────────────────────────────────────────────────────
  // Se lee la versión ACTUAL (una lectura validada con su token), se muestran base revisada / borrador / actual y NO se envía nada. La propuesta vuelve al formulario con la base y el
  // token de la lectura mostrada; un SEGUNDO guardado explícito la confirma. Un cambio posterior produce otro 409 y vuelve a pedir decisión sobre la versión nueva.
  async function compare(base: Loaded, patch: Record<string, FieldValue>) {
    const mine = run.current; setBanner({ tone: 'info', title: 'Leyendo la versión actual', text: 'Se compara con lo que escribiste. No se envía nada y tu borrador se conserva.' });
    let result: Awaited<ReturnType<typeof loadRevisedTask>>;
    try { result = await loadRevisedTask(taskId, controller.current?.signal); } catch { result = { kind: 'failed', status: 0, message: '' }; }
    if (!alive.current || mine !== run.current) return;
    if (result.kind === 'ok') {
      if (!sameTaskCapture(base.context, result.context)) setStale('La copia activa cambió. Tu borrador se conserva aquí. Abre la tarea desde Hoy para trabajar con la copia vigente.');
      setBanner(null);
      setView({ k: 'review', data: base, current: { context: result.context, record: result.record, schema: result.schema ?? base.schema, revision: result.revision }, patch });
      return;
    }
    if (result.kind === 'failed' && result.status === 404) { setView({ k: 'missing', unsaved: Object.keys(patch).map(key => (base.schema.entity.fields.find(f => f.key === key)?.label ?? key) + ': ' + show(base.schema.entity.fields.find(f => f.key === key), patch[key])) }); return; }
    setBanner({ tone: 'warning', title: 'No se pudo leer la versión actual', text: (result.kind === 'context-changed' ? 'La copia activa cambió mientras se leía. ' : result.kind === 'failed' && result.status === 401 ? 'La sesión está bloqueada: desbloquea Plan B. ' : '') + 'No se ha guardado nada y tu borrador se conserva.',
      action: { label: 'Volver a comparar', run: () => void compare(base, patch) } });
    requestFocus('ltf-banner');
  }
  function propose(proposal: Proposal) {
    if (view.k !== 'review') return;
    const { current } = view, count = Object.keys(proposal.patch).length;
    setView({ k: 'edit', data: { context: current.context, record: proposal.baseline, schema: current.schema, revision: current.revision } }); setDraft({ ...proposal.values }); setErrors({}); setNotes({});
    setBanner({ tone: 'info', title: 'Propuesta preparada con tus decisiones', text: 'Todavía no se ha guardado nada (' + count + (count === 1 ? ' campo' : ' campos') + ' por guardar). Revisa el formulario y pulsa «Guardar cambios» para confirmarla contra la versión que acabas de ver.' });
    requestFocus('ltf-banner');
  }
  function keepEditing() {
    if (view.k !== 'review') return;
    const { data: base, patch } = view; setView({ k: 'edit', data: base });
    setBanner(stale
      ? { tone: 'warning', title: 'Esta ficha ya no corresponde a la copia actual', text: stale }
      : { tone: 'warning', title: 'Tu borrador se conserva', text: 'Otra edición cambió esta tarea y todavía no has decidido. Guardar de nuevo con la versión que abriste repetiría el conflicto: compara otra vez para decidir.', action: { label: 'Comparar con la versión actual', run: () => void compare(base, patch) } });
    requestFocus('ltf-banner');
  }
  function showUnapplied(why: Unapplied, pending: TaskSaveOperation, base: Loaded, entity: Entity, mine: number) {
    const unsaved = () => Object.keys(pending.patch).map(key => (entity.fields.find(f => f.key === key)?.label ?? key) + ': ' + show(entity.fields.find(f => f.key === key), pending.patch[key]));
    switch (why.kind) {
      case 'field-errors': {
        setErrors(why.fields); setBanner({ tone: 'danger', title: 'El servidor rechazó algunos valores', text: why.message + ' No se ha guardado nada y tu borrador se conserva.' });
        const first = entity.fields.find(field => why.fields[field.key]); requestFocus(first ? fieldId(first.key) : 'ltf-banner'); return;
      }
      case 'rejected': setBanner({ tone: 'danger', title: 'No se ha guardado', text: why.message + ' No se ha sobrescrito nada y tu borrador se conserva.' }); requestFocus('ltf-banner'); return;
      case 'missing': setView({ k: 'missing', unsaved: unsaved() }); return;
      case 'locked': setBanner({ tone: 'warning', title: 'La sesión está bloqueada', text: 'Desbloquea Plan B para continuar. No se ha guardado nada y tu borrador sigue aquí; no recargues la página.' }); requestFocus('ltf-banner'); return;
      case 'preflight-failed': setBanner({ tone: 'warning', title: 'No se pudo comprobar antes de guardar', text: why.message + ' Puedes volver a intentarlo.' }); requestFocus('ltf-banner'); return;
      case 'context-changed': setStale(why.message); setBanner({ tone: 'danger', title: 'Esta ficha ya no corresponde a la copia actual', text: why.message + ' Vuelve a abrir la tarea para trabajar con la copia vigente.' }); requestFocus('ltf-banner'); return;
      case 'conflict': void reconcile(base, entity, pending, mine); return;
      case 'revision-conflict': void compare(base, pending.patch); return;
    }
  }
  // Reacciona a cada TRANSICIÓN de la operación (una vez por intento y estado): lo que el gestor liquida, la ficha lo presenta.
  useEffect(() => {
    if (!outcomes || !op || !data || !entity) return;
    const marker = op.attemptId + ':' + op.status;
    if (handled.current === marker) return; handled.current = marker;
    if (op.status === 'confirmed' || op.status === 'accepted') {
      if (op.compactReceipt) {
        setBanner(null); setErrors({}); setNotes({}); setDiscard(false); requestFocus('ltf-ack');
        return;
      }
      if (!op.record) return;
      setShowAck(true); setBanner(null); setErrors({}); setNotes({}); setDiscard(false);
      setView({ k: 'edit', data: { ...data, record: op.record, revision: op.revised?.token ?? data.revision } }); setDraft({ ...op.record.values }); requestFocus('ltf-ack');
    } else if (op.status === 'uncertain') {
      setDiscard(false); requestFocus('ltf-uncertain');
      if (!op.evidence && !op.verifying) void outcomes.verify(op.attemptId);   // una lectura: nunca escribe
    } else if (op.status === 'rejected' || op.status === 'not_sent') {
      // La ficha sigue abierta y se hace cargo del aviso: se libera la operación para que no quede un duplicado ni un «Reenviar» con un borrador viejo.
      // La ficha que ORIGINÓ el guardado se hace cargo del aviso y libera la operación; la que RECUPERÓ el intento de Resultados lo deja donde está: reabrir para ver el progreso no cambia quién conserva el aviso.
      const why = classifyUnapplied(op); if (adoptedRef.current !== op.attemptId) outcomes.dismiss(op.attemptId); trackedRef.current = null; setTracked(null);
      if (why) showUnapplied(why, op, data, entity, run.current);
    }
  }, [op?.attemptId, op?.status]);
  useEffect(() => { if (outcomes && op?.status === 'uncertain' && op.evidence) requestFocus('ltf-uncertain'); }, [op?.evidence?.at]);
  // Adopción del intento exacto (unidad 219): UNA vez por carga de la tarea, cuando la copia ya está leída y se conoce su contexto.
  const adoptedFor = useRef('');
  useEffect(() => {
    if (!outcomes || adoptAttemptId === undefined || view.k !== 'edit' || !data || !entity) return;   // `undefined` = quien monta no pide adopción (comportamiento de U1); `null` = adopta solo un intento único y compatible
    const key = run.current + ':' + taskId; if (adoptedFor.current === key) return; adoptedFor.current = key;
    const decision = resolveAdoption(outcomes.getSnapshot(), { taskId, context: data.context, requestedAttemptId: adoptAttemptId ?? null });
    if (decision.kind === 'adopt') {
      const adopted = outcomes.get(decision.attemptId);
      if (adopted && (adopted.status === 'in_flight' || adopted.status === 'uncertain')) setDraft({ ...data.record.values, ...adopted.patch });   // lo que se envió, a la vista
      trackedRef.current = decision.attemptId; adoptedRef.current = decision.attemptId; handled.current = ''; setTracked(decision.attemptId); setShowAck(true);
      if (decision.otherOpen.length) {
        const numbers = decision.otherOpen.map(id => outcomes.get(id)?.attemptNumber).filter(Boolean).join(' y ');
        setBanner({ tone: 'info', title: 'Hay otro guardado sin resolver de esta tarea', text: 'Esta ficha sigue el intento que abriste; el intento ' + numbers + ' sigue abierto en «Resultados de guardado». No se ha enviado nada.' });
      }
    } else if (decision.kind === 'restore-draft') {
      const op = outcomes.get(decision.attemptId);
      if (op) {
        const why = classifyUnapplied(op);
        setDraft(rebaseDraft(entity, op.baseline, data.record, { ...op.baseline.values, ...op.patch }));   // lo escrito, rebasado sobre la tarea ACTUAL
        setBanner({ tone: 'warning', title: 'Se restauró lo que escribiste', text: (why && 'message' in why && why.message ? why.message + ' ' : '') + 'Ese guardado no se aplicó. Revisa los valores y guarda de nuevo si quieres: será un guardado nuevo y explícito. El aviso sigue en «Resultados de guardado».' });
        requestFocus('ltf-banner');
        if (revisedMode && op.detail.revisionConflict) void compare({ context: op.context, record: op.baseline, schema: data.schema, revision: op.revision }, op.patch);   // un rechazo por revisión reabierto desde Resultados: se decide, no se sobrescribe
      }
    } else if (decision.kind === 'refused') {
      setBanner({ tone: decision.reason === 'other-copy' || decision.reason === 'ambiguous' ? 'warning' : 'info', title: decision.reason === 'other-copy' ? 'Ese resultado es de otra copia' : decision.reason === 'ambiguous' ? 'Hay varios guardados sin resolver de esta tarea' : 'No se retoma ese resultado', text: decision.message });
      requestFocus('ltf-banner');
    }
  }, [outcomes, view.k, data, entity, taskId, adoptAttemptId]);
  // Al cerrar la ficha: un resultado ya visto y con la cola al día no necesita quedarse en la superficie. Lo demás (en vuelo, incierto, cola
  // sin actualizar, rechazado fuera de la ficha) sigue en el gestor.
  useEffect(() => () => {
    const manager = latest.current.outcomes, id = trackedRef.current;
    if (!manager || !id || !ackShown.current) return;
    const last = manager.get(id);
    if (last && (last.status === 'confirmed' || last.status === 'accepted') && last.queue.status === 'ok') manager.dismiss(id);
  }, []);

  async function save() {
    if (view.k !== 'edit' || flight.current || !entity || stale) return;
    const trackedOperation = outcomes && trackedRef.current ? outcomes.get(trackedRef.current) : null;
    if (trackedOperation?.status === 'in_flight' || trackedOperation?.compactReceipt) return;
    const base = view.data, spec = base.schema.spec!, patch = buildPatch(entity, base.record, draft), keys = Object.keys(patch);
    if (!keys.length) return;
    const issues = validateDraft(spec, base.record, patch);
    if (Object.keys(issues).length) {
      setErrors(issues); setBanner({ tone: 'danger', title: 'Revisa los campos señalados', text: 'No se ha enviado nada. Tus cambios siguen en la ficha.' });
      requestFocus(entity.fields.find(field => issues[field.key]) ? fieldId(entity.fields.find(field => issues[field.key])!.key) : 'ltf-banner'); return;
    }
    if (outcomes) { submitManaged(base, entity, patch); return; }
    setErrors({}); setBanner(null); const mine = run.current; flight.current = mine; setBusy(true); requestFocus('ltf-status');
    let outcome: SaveOutcome;
    try { outcome = await saveTask({ taskId, baseline: base.record, entity, patch, context: base.context, signal: controller.current?.signal }); }
    catch { if (flight.current === mine) flight.current = 0; return; }
    if (flight.current === mine) flight.current = 0;
    if (!alive.current || mine !== run.current) {
      // La ficha ya no es la de esta tarea: un guardado confirmado igualmente avisa a la cola, sin tocar la vista actual.
      if (outcome.kind === 'saved') void Promise.resolve().then(() => latest.current.onSaved(outcome.kind === 'saved' ? outcome.record : base.record)).catch(() => undefined);
      return;
    }
    if (outcome.kind === 'saved') { confirmSaved(base, base.record, outcome.record, keys, mine); return; }
    setBusy(false);
    switch (outcome.kind) {
      case 'uncertain': { const pending = { patch, baseline: base.record, message: outcome.message, verdict: 'checking' as const }; requestFocus('ltf-uncertain'); void verify(base, pending, mine); return; }
      case 'invalid': {
        setErrors(outcome.fields); setBanner({ tone: 'danger', title: 'El servidor rechazó algunos valores', text: outcome.message + ' No se ha guardado nada y tu borrador se conserva.' });
        const first = entity.fields.find(field => outcome.fields[field.key]); requestFocus(first ? fieldId(first.key) : 'ltf-banner'); return;
      }
      case 'rejected': setBanner({ tone: 'danger', title: 'No se ha guardado', text: outcome.message + ' No se ha sobrescrito nada y tu borrador se conserva.' }); requestFocus('ltf-banner'); return;
      case 'missing': setView({ k: 'missing', unsaved: keys.map(key => (entity.fields.find(f => f.key === key)?.label ?? key) + ': ' + show(entity.fields.find(f => f.key === key), draft[key])) }); return;
      case 'locked': setBanner({ tone: 'warning', title: 'La sesión está bloqueada', text: 'Desbloquea Plan B para continuar. No se ha guardado nada y tu borrador sigue aquí; no recargues la página.' }); requestFocus('ltf-banner'); return;
      case 'preflight-failed': setBanner({ tone: 'warning', title: 'No se pudo comprobar antes de guardar', text: outcome.message + ' Puedes volver a intentarlo.' }); requestFocus('ltf-banner'); return;
      case 'context-changed': setStale(outcome.message); setBanner({ tone: 'danger', title: 'Esta ficha ya no corresponde a la copia actual', text: outcome.message + ' Vuelve a abrir la tarea para trabajar con la copia vigente.' }); requestFocus('ltf-banner'); return;
      case 'conflict': {
        setNotes(Object.fromEntries(outcome.conflicts.map(c => [c.key, 'Cambió fuera de esta ficha: antes «' + show(entity.fields.find(f => f.key === c.key), c.baseline) + '», ahora «' + show(entity.fields.find(f => f.key === c.key), c.current) + '». Tu valor se conserva hasta que guardes otra vez.'])));
        setDraft(rebaseDraft(entity, base.record, outcome.current, draft)); setView({ k: 'edit', data: { ...base, record: outcome.current } });
        setBanner({ tone: 'warning', title: 'Otra edición cambió esta tarea', text: 'No se ha guardado nada. Revisa los campos marcados; si sigues queriendo tu valor, pulsa Guardar otra vez.', conflicts: outcome.conflicts }); requestFocus('ltf-banner'); return;
      }
    }
  }
  function backToForm(verdict: Verification | 'checking', pending: Uncertain) {
    if (!data || !entity) return;
    const current = verdict !== 'checking' && verdict.kind === 'read' ? verdict.record : pending.baseline;
    setDraft(rebaseDraft(entity, pending.baseline, current, draft)); setView({ k: 'edit', data: { ...data, record: current } }); setUncertain(null); setBanner(null);
    // Con gestor, volver al formulario es la decisión explícita de dejar de seguir este intento (ya hay una lectura que lo respalda).
    if (outcomes && trackedRef.current) { outcomes.dismiss(trackedRef.current); trackedRef.current = null; setTracked(null); }
    requestFocus(fieldId(entity.fields.find(f => !f.readOnly)?.key ?? ''));
  }

  const control = (field: Field) => {
    const key = field.key, value = draft[key], id = fieldId(key), invalid = !!errors[key], describedBy = errors[key] ? id + '-error' : notes[key] ? id + '-note' : undefined;
    if (field.readOnly) return <p id={id} className="ltf-readonly" tabIndex={-1}>{show(field, value)}</p>;
    if (field.type === 'reference') return <ReferenceSelect id={id} label={field.label} value={String(value ?? '')} entity={field.referenceEntity!} spec={data!.schema.spec!} disabled={saving} onChange={next => setField(key, next)} />;
    if (field.type === 'enum' || field.type === 'multiselect') {
      const multiple = field.type === 'multiselect', current = String(value ?? ''), unknown = !multiple && current !== '' && !field.options.some(option => option.id === current);
      return <select id={id} multiple={multiple} disabled={saving} aria-invalid={invalid} aria-describedby={describedBy}
        value={multiple ? current.split(';').filter(Boolean) : current}
        onChange={event => setField(key, multiple ? [...event.target.selectedOptions].map(option => option.value).join(';') || null : event.target.value || null)}>
        {!multiple ? <option value="">Seleccionar…</option> : null}
        {unknown ? <option value={current} disabled>«{current}» (valor no reconocido)</option> : null}
        {field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>;
    }
    if (field.type === 'boolean') return <select id={id} disabled={saving} aria-describedby={describedBy} value={value ? 'true' : 'false'} onChange={event => setField(key, event.target.value === 'true')}><option value="false">No</option><option value="true">Sí</option></select>;
    const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : field.type === 'email' ? 'email' : 'text';
    const shown = field.type === 'date' ? (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? String(value) : '') : field.type === 'datetime' ? (value ? instantToLocalInput(String(value)) : '') : String(value ?? '');
    return <input id={id} type={type} step={field.type === 'number' ? 'any' : undefined} maxLength={10000} autoComplete="off" value={shown} disabled={saving} aria-invalid={invalid} aria-describedby={describedBy}
      onChange={event => setField(key, field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : field.type === 'datetime' ? localInputToInstant(event.target.value) : event.target.value || null)} />;
  };

  const contextLine = (context: TaskContext) => <p className="ltf-context">
    <span>Tarea <code>{taskId}</code></span><span>Copia «{context.snapshotName}»</span>
    {context.capturedAt ? <span>Captura del {formatInstant(context.capturedAt)}</span> : null}
    {context.isTestData === null ? null : <span>{context.isTestData ? 'Datos de ensayo' : 'Producción'}</span>}
  </p>;
  const closeButton = (label = 'Volver a Hoy') => <button type="button" className="button secondary" onClick={requestClose}>{label}</button>;
  const bannerBox = banner ? <div id="ltf-banner" tabIndex={-1} role="alert" className={'ltf-banner ltf-' + banner.tone}><strong>{banner.title}</strong><p>{banner.text}</p>
    {banner.conflicts ? <ul>{banner.conflicts.map(c => <li key={c.key}>{c.label}</li>)}</ul> : null}
    {banner.action ? <div className="ltf-actions"><button type="button" className="button secondary" onClick={banner.action.run}>{banner.action.label}</button></div> : null}</div> : null;

  const queueBanner = (state: Queue) => <div className="ltf-banner ltf-warning" role="alert">
    <strong>{state.record.id !== taskId ? 'La cola de Hoy no se actualizó' : state.source === 'server' ? 'El guardado está confirmado, pero la cola de Hoy no se actualizó' : 'Aceptaste el estado leído, pero la cola de Hoy no se actualizó'}</strong>
    <p>{state.reason || 'No se pudo recargar la cola.'} {state.source === 'server' ? 'La tarea ya tiene los valores nuevos' : 'La lectura mostró la tarea con esos valores, pero el servidor no confirmó tu envío'}; Hoy puede seguir mostrando los anteriores. Reintentar solo vuelve a leer la cola; no envía otro guardado.</p>
    <button type="button" className="button secondary" onClick={() => { if (outcomes && op) void outcomes.retryQueue(op.attemptId); else void refreshQueue(state.record, run.current); }}><RefreshCw size={14} aria-hidden="true" />Reintentar la actualización</button></div>;
  let body;
  if (view.k === 'loading') body = <p role="status" className="ltf-muted"><LoaderCircle size={16} className="spin" aria-hidden="true" /> Leyendo la tarea…</p>;
  else if (view.k === 'error') body = <div className="ltf-banner ltf-danger" role="alert"><strong>No se pudo abrir la tarea</strong><p>{view.message}</p><div className="ltf-actions"><button type="button" className="button primary" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={14} aria-hidden="true" />Reintentar</button>{closeButton()}</div></div>;
  else if (view.k === 'empty') body = <div className="ltf-banner ltf-info" role="status"><strong>Todavía no hay una copia en esta instalación</strong><p>Sin una copia importada y activada no hay tareas que abrir. No se ha creado ninguna.</p><div className="ltf-actions"><button type="button" className="button primary" onClick={onPrepare}>Continuar la preparación</button>{closeButton()}</div></div>;
  else if (view.k === 'missing') body = <div className="ltf-banner ltf-warning" role="alert"><strong>Esta tarea ya no existe en esta copia</strong><p>La tarea <code>{taskId}</code> no se encuentra. Plan B no la recrea.</p>
    {view.unsaved.length ? <><p>Lo que habías escrito no se ha guardado:</p><ul>{view.unsaved.map(line => <li key={line}>{line}</li>)}</ul></> : null}<div className="ltf-actions">{closeButton()}</div></div>;
  else if (view.k === 'readonly') body = <>
    {contextLine(view.data.context)}
    <div className="ltf-banner ltf-info" role="status"><strong>Esta copia está importada, pero no activada</strong><p>Puedes ver los valores guardados, pero no editarlos: hay que revisar y activar la copia en Preparación. No se activa de forma silenciosa.</p>
      <div className="ltf-actions"><button type="button" className="button primary" onClick={onPrepare}>Continuar la preparación</button>{closeButton()}</div></div>
    <dl className="ltf-values">{view.data.schema.entity.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{show(field, view.data.record.values[field.key])}</dd></div>)}</dl></>;
  else if (view.k === 'review') body = <>{contextLine(view.current.context)}<TaskConflictReview input={{ entity: view.data.schema.entity, spec: view.current.schema.spec, base: view.data.record, baseContext: view.data.context, draft: view.patch, current: view.current.record, currentContext: view.current.context }} onPropose={propose} onKeepEditing={keepEditing} /></>;
  else if (compactOp && data) {
    const confirmation = describeOperation(compactOp);
    body = <>{contextLine(data.context)}<div className="ltf-ack">
      <h3 id="ltf-ack" tabIndex={-1}><CheckCircle2 size={18} aria-hidden="true" /> {confirmation.title}</h3>
      {confirmation.lines.map(line => <p key={line}>{line}</p>)}
      {receiptRead?.message ? <p id="ltf-receipt-read-error" tabIndex={-1} role="alert">{receiptRead.message}</p> : null}
      <div className="ltf-actions">
        <button type="button" className="button primary" disabled={receiptRead?.pending} onClick={() => void readAfterReceipt(compactOp)}>
          {receiptRead?.pending ? 'Leyendo la tarea…' : 'Leer tarea actual'}
        </button>
        {compactOp.queue.status === 'failed' ? <button type="button" className="button secondary" onClick={() => void outcomes?.retryQueue(compactOp.attemptId)}>Reintentar la actualización de Hoy</button> : null}
        {closeButton()}
      </div>
    </div></>;
  }
  else if (ackView) {
    const ack = ackView, queueNote = queueView && queueView.record === ack.record ? queueView : null;
    body = <>{contextLine(view.data.context)}<div className="ltf-ack">
    <h3 id="ltf-ack" tabIndex={-1}><CheckCircle2 size={18} aria-hidden="true" /> {ack.unchanged ? 'Sin cambios' : ack.source === 'server' ? 'Cambios guardados' : 'Estado leído y aceptado por ti'}</h3>
    {ack.unchanged ? <p>El servidor confirmó que «{taskTitle(view.data.schema.entity, ack.record)}» ya tenía esos valores: no se escribió nada ni se añadió historial.</p>
      : ack.source === 'server'
      ? <p>El servidor confirmó el guardado de «{taskTitle(view.data.schema.entity, ack.record)}».</p>
      : <p>Aceptaste el estado que leyó la ficha para «{taskTitle(view.data.schema.entity, ack.record)}». El servidor <strong>no confirmó</strong> tu envío: no se sabe si lo aplicó tu solicitud u otra edición idéntica.</p>}
    <ul>{ack.rows.map(row => <li key={row.label}><strong>{row.label}:</strong> {row.before} → {row.after}</li>)}</ul>
    {queueNote?.status === 'updating' ? <p role="status" className="ltf-muted"><LoaderCircle size={14} className="spin" aria-hidden="true" /> Actualizando la cola de Hoy…</p> : null}
    {queueNote?.status === 'ok' ? <p role="status" className="ltf-muted">La cola de Hoy está actualizada.</p> : null}
    {queueNote?.status === 'idle' && queueNote.reason ? <p role="status" className="ltf-muted">La cola de Hoy se actualizará cuando vuelvas a esa vista; mientras tanto puede mostrar los valores anteriores.</p> : null}
    {queueNote?.status === 'failed' ? queueBanner(queueNote) : null}
    <div className="ltf-actions"><button type="button" className="button primary" onClick={requestClose}>Volver a Hoy</button><button type="button" className="button secondary" onClick={() => { setAck(null); setShowAck(false); requestFocus(fieldId(entity!.fields.find(f => !f.readOnly)?.key ?? '')); }}>Seguir editando</button></div></div></>;
  }
  else if (uncertainView) {
    const uncertain = uncertainView, v = uncertain.verdict, record = v !== 'checking' && v.kind === 'read' ? v.record : null;
    body = <>{contextLine(view.data.context)}<div id="ltf-uncertain" tabIndex={-1} role="alert" className="ltf-banner ltf-warning">
      <strong>No se sabe si el guardado llegó a aplicarse</strong><p>{uncertain.message} Tu borrador se conserva y no se ha reenviado nada por cuenta propia.</p>
      {outcomes ? <p>Si cierras la ficha, el seguimiento continúa en «Resultados de guardado»: no se descarta ni se reenvía nada.</p> : null}
      {v === 'checking' ? <p role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" /> Comprobando la tarea con una lectura…</p> : null}
      {v !== 'checking' && v.kind === 'read' && v.evidence === 'applied' ? <p>La lectura muestra que la tarea ya tiene los valores que enviaste. No se puede distinguir si los aplicó tu envío o una edición idéntica de otra persona.</p> : null}
      {v !== 'checking' && v.kind === 'read' && v.evidence === 'unchanged' ? <p>La lectura muestra la tarea como estaba antes de tu envío: tu cambio no consta aplicado.</p> : null}
      {v !== 'checking' && v.kind === 'read' && v.evidence === 'diverged' ? <p>La tarea tiene valores distintos a los de antes y a los que enviaste: alguien la editó. No se sobrescribe.</p> : null}
      {v !== 'checking' && v.kind === 'context-changed' ? <p>La copia activa cambió desde que abriste la ficha: la lectura corresponde a otra copia y no sirve como evidencia. No se acepta ni se reenvía nada; cierra la ficha y vuelve a abrir la tarea.</p> : null}
      {v !== 'checking' && v.kind === 'unknown' ? <p>No se pudo leer la tarea. No se puede decir si el cambio se aplicó; no se sugiere reenviarlo hasta comprobarlo.</p> : null}
      {v !== 'checking' && v.kind === 'locked' ? <p>La sesión está bloqueada: desbloquea Plan B y vuelve a comprobar.</p> : null}
      <div className="ltf-actions">
        {record && v !== 'checking' && v.kind === 'read' && v.evidence === 'applied' ? <button type="button" className="button primary" onClick={() => { if (outcomes && op) outcomes.accept(op.attemptId); else confirmSaved(view.data, uncertain.baseline, record, Object.keys(uncertain.patch), run.current, 'person'); }}>Aceptar el estado leído</button> : null}
        {v !== 'checking' && v.kind === 'read' ? <button type="button" className="button secondary" onClick={() => backToForm(v, uncertain)}>Volver al formulario</button> : null}
        {v !== 'checking' && (v.kind === 'unknown' || v.kind === 'locked' || v.kind === 'context-changed') ? <button type="button" className="button primary" onClick={() => { if (outcomes && op) void outcomes.verify(op.attemptId); else void verify(view.data, uncertain, run.current); }}><RefreshCw size={14} aria-hidden="true" />Comprobar de nuevo</button> : null}
        {closeButton(outcomes ? 'Cerrar la ficha' : 'Cerrar sin guardar')}
      </div></div></>;
  } else if (view.k === 'edit' && entity) {
    const rules = view.data.schema.rules;
    body = <>{contextLine(view.data.context)}{queueView && queueView.status === 'failed' ? queueBanner(queueView) : null}{queueView && queueView.status === 'updating' ? <p role="status" className="ltf-muted"><LoaderCircle size={14} className="spin" aria-hidden="true" /> Actualizando la cola de Hoy…</p> : null}{bannerBox}
      <form className="ltf-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="ltf-fields">{entity.fields.map(field => <div className="ltf-field" key={field.key} data-invalid={errors[field.key] ? 'true' : undefined}>
          <label htmlFor={fieldId(field.key)}>{field.label}{field.required ? <span className="ltf-required"> *</span> : null}{field.readOnly ? <small>Solo lectura</small> : null}</label>
          {control(field)}
          {notes[field.key] ? <small id={fieldId(field.key) + '-note'} className="ltf-note">{notes[field.key]}</small> : null}
          {errors[field.key] ? <em id={fieldId(field.key) + '-error'} className="ltf-error" role="alert">{errors[field.key]}</em> : null}
        </div>)}</div>
        <details className="ltf-more"><summary>Cómo se guarda</summary><p>Edición manual: solo se envían los campos que cambias, con el esquema y las reglas de esta copia. {revisedMode ? REVISED_NOTE : NOT_VERIFIED}</p></details>
        {rules.length ? <details className="ltf-more"><summary>Reglas que se aplican ({rules.length})</summary><ul>{rules.map(rule => <li key={rule.id}>{rule.description}</li>)}</ul></details> : null}
        <footer className="ltf-footer">{closeButton('Cancelar')}
          <button type="submit" className="button primary" aria-disabled={saving || !changed || !!stale} aria-describedby="ltf-hint">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          <span id="ltf-hint" className="ltf-sr">{!changed ? 'Cambia algún campo para poder guardar.' : ''}</span></footer>
      </form></>;
  } else body = null;

  const title = data && entity ? taskTitle(entity, data.record) : 'Tarea';
  return <Modal title={title} side close={onClose} confirmClose={confirmClose}>
    <div className="ltf" data-phase={ackView || compactOp ? 'saved' : uncertainView ? 'uncertain' : view.k} aria-busy={saving || view.k === 'loading' || !!receiptRead?.pending}>
      <p id="ltf-status" tabIndex={-1} role="status" className="ltf-status">{op?.status === 'in_flight' ? <><LoaderCircle size={14} className="spin" aria-hidden="true" /> {op.phase === 'sent' ? 'Guardando… El envío ya salió y no se puede cancelar. Puedes cerrar la ficha: verás el resultado en «Resultados de guardado».' : 'Comprobando la tarea antes de guardar… Todavía no se ha enviado nada. Puedes cerrar la ficha: el guardado sigue y verás el resultado en «Resultados de guardado».'}</> : busy ? <><LoaderCircle size={14} className="spin" aria-hidden="true" /> Guardando…</> : ''}</p>
      {discard && dirty ? <div id="ltf-discard" tabIndex={-1} role="alert" className="ltf-banner ltf-warning">
        <strong>{busy ? 'Hay un guardado en curso' : uncertain ? 'El resultado del guardado es incierto' : 'Hay cambios sin guardar'}</strong>
        <p>{busy ? 'El envío ya salió y no se puede cancelar: puede aplicarse aunque cierres. Aquí no sabrás el resultado ni se actualizará la cola de Hoy; vuelve a comprobar la tarea después.'
          : uncertain ? 'El cambio puede haberse aplicado. Si sales, tu borrador se descarta, no se reenvía nada y nadie comprobará el resultado.'
          : 'Si sales ahora se descartan. Nada se ha enviado.'}</p>
        <div className="ltf-actions"><button type="button" className="button secondary" onClick={() => { setDiscard(false); requestFocus(entity ? fieldId(entity.fields.find(f => !f.readOnly)?.key ?? '') : 'ltf-status'); }}>{busy || uncertain ? 'Seguir aquí' : 'Seguir editando'}</button>
          <button type="button" className="button primary" onClick={() => latest.current.onClose()}>{busy || uncertain ? 'Salir de todos modos' : 'Descartar y volver a Hoy'}</button></div></div> : null}
      {body}
    </div>
  </Modal>;
}
