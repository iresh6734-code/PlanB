import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { commitmentRoles, type CommitmentDetail, type CommitmentEvent, type CommitmentEvidence, type CommitmentSummary } from '../shared/commitments.js';
import { multisystemDisclosures, multisystemProviderLabels } from '../shared/commitment-multisystem-demo.js';
import { buildCommitmentTimeline, createCommitmentReport, type CommitmentTimelineEntry } from '../shared/commitment-report.js';
import { simulateCommitment, type CommitmentSimulation, type SimulationAlternative } from '../shared/commitment-simulation.js';
import { CommitmentError, decideCommitment, loadCommitment, loadCommitments, type CommitmentRequest } from './commitment-radar-client.js';
import { Modal } from './components.js';
import './commitment-radar.css';

// RADAR DE COMPROMISOS · interfaz (unidad CLAUDE-COMMITMENT-RADAR-UI). Consume el contrato aceptado de `shared/commitments.ts` a través de `commitment-radar-client.ts`; no define otro modelo.
// Quién la monta y cómo llega el pin de copia es del montaje central (`CODEX-COMMITMENT-RADAR-MOUNT`): aquí solo se reciben `contextRevision` y, opcionalmente, un compromiso que abrir.
//
// Reglas que esta interfaz sostiene:
//  · cuatro estados distintos: en riesgo, sin confirmar, «sin riesgo detectado con los datos disponibles» y resuelto. Una fuente caída, parcial o antigua NUNCA se presenta como sana.
//  · dos IDs o títulos parecidos no crean vínculo: los candidatos se muestran aparte, «sin confirmar», y no cuentan como evidencia.
//  · toda decisión lleva el pin de copia, la revisión leída y una clave de operación; ante una pérdida de respuesta solo cabe un reintento EXPLÍCITO con la misma clave o comprobar leyendo.
//  · un 409 de revisión recarga el detalle y CONSERVA el borrador; cambiar de copia, bloquear o un 409 de contexto retiran todos los datos y los borradores; una respuesta tardía de otro pin se descarta.
export interface CommitmentRadarProps {
  /** Pin de la copia activa (`workspaceSearchContext.contextRevision`). `null` = no hay copia de ensayo activa: no se muestra nada. */
  contextRevision: string | null;
  /** Abre este compromiso por ID exacto cuando el pin y la lista lo permiten. */
  commitmentId?: string | null;
  /** El servidor dijo que la copia cambió: quien monta el Radar debe volver a leer el estado para obtener el pin vigente. */
  onContextStale?: () => void;
  /** Acción secundaria de la ficha: abrir «Ensayar mi semana» para este compromiso. Si no se pasa, el botón no aparece. */
  onRehearse?: (commitmentId: string) => void;
  /** Reloj para evaluar la antigüedad de la evidencia al simular (por defecto, el del navegador). Solo para pruebas con un servidor de reloj fijo. */
  clock?: () => number;
}
type Status = CommitmentSummary['status'];
type Role = (typeof commitmentRoles)[number];
interface Draft { mode: 'assign' | 'close'; owner: string; nextStep: string; due: string; basis: 'observed' | 'manual'; note: string; from: { id: SimulationAlternative['id']; title: string; revision: string; evaluatedAt: string; missing: string[]; projectedDueAt: string | null } | null; generated: { nextStep: string; due: string } | null; confirmed: boolean }
interface Attempt { request: CommitmentRequest; kind: Draft['mode'] }
const GROUPS: { status: Status; title: string; hint: string }[] = [
  { status: 'at-risk', title: 'En riesgo', hint: 'Una fuente observó un bloqueo o ya pasó la fecha sin entrega observada.' },
  { status: 'unconfirmed', title: 'Sin confirmar', hint: 'Faltan datos para afirmar nada: una fuente parcial, antigua, caída o sin vincular no equivale a sano.' },
  { status: 'no-risk-detected', title: 'Sin riesgo detectado con los datos disponibles', hint: 'No se observó ningún bloqueo en las fuentes vinculadas. No es una garantía de cumplimiento.' },
  { status: 'resolved', title: 'Resuelto', hint: 'Cerrado por una persona, con evidencia observada o de forma manual.' },
];
const STATUS_LABEL: Record<Status, string> = { 'at-risk': 'En riesgo', unconfirmed: 'Sin confirmar', 'no-risk-detected': 'Sin riesgo detectado', resolved: 'Resuelto' };
const STATUS_ICON = { 'at-risk': CircleAlert, unconfirmed: CircleHelp, 'no-risk-detected': ShieldCheck, resolved: CheckCircle2 } as const;
const ROLE_LABEL: Record<Role, string> = { sale: 'Venta', delivery: 'Entrega', support: 'Soporte' };
const CAUSE: Record<CommitmentSummary['cause'], string> = {
  'source-blocked': 'Una fuente observó un bloqueo',
  'deadline-passed': 'Pasó la fecha comprometida sin una entrega observada',
  'coverage-incomplete': 'Faltan datos: alguna fuente es parcial, antigua, no responde o no está vinculada',
  'no-blocker-observed': 'No se observó ningún bloqueo en las fuentes vinculadas',
  'closed-observed': 'Cerrado con evidencia observada y confirmado por una persona',
  'closed-manual': 'Cerrado manualmente por una persona',
};
const EVIDENCE_LABEL: Record<CommitmentEvidence['state'], string> = { observed: 'Observada', partial: 'Parcial', stale: 'Antigua', unavailable: 'No disponible', missing: 'Sin vincular', ambiguous: 'Ambigua: sin confirmar' };
const CONDITION_LABEL = { clear: 'Sin bloqueo', blocked: 'Bloqueada', completed: 'Completada' } as const;
const COVERAGE_LABEL = { complete: 'cobertura completa', partial: 'cobertura parcial', unavailable: 'fuente no disponible' } as const;
const BASIS_LABEL = { explicit: 'referencia explícita', confirmed: 'confirmado por una persona' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const emptyDraft = (): Draft => ({ mode: 'assign', owner: '', nextStep: '', due: '', basis: 'manual', note: '', from: null, generated: null, confirmed: false });
const dirty = (draft: Draft) => !!(draft.owner.trim() || draft.nextStep.trim() || draft.due || draft.note.trim());
const causeText = (item: CommitmentSummary) => CAUSE[item.cause] + (item.affectedRole ? ' (' + ROLE_LABEL[item.affectedRole].toLocaleLowerCase('es') + ')' : '');

/** Rótulo de procedencia: SIEMPRE dato de ensayo y nunca «conectado» (la fuente es `multisystemProviderLabels`; un proveedor desconocido no se rotula como real). */
const providerLabel = (provider: string): string | null => { const known = (multisystemProviderLabels as Record<string, { label: string; connected: boolean }>)[provider]; return known ? known.label + ' · no conectado' : null; };
function StatusChip({ status }: { status: Status }) { const Icon = STATUS_ICON[status]; return <span className="cr-chip" data-status={status}><Icon size={14} aria-hidden="true" />{STATUS_LABEL[status]}</span>; }
function Evidence({ source }: { source: CommitmentEvidence }) {
  const { linked, observation, candidates } = source;
  return <section className="cr-source" data-role={source.role} data-state={source.state} aria-label={'Evidencia de ' + ROLE_LABEL[source.role].toLocaleLowerCase('es')}>
    <h4>{ROLE_LABEL[source.role]} <span className="cr-state" data-state={source.state}>{EVIDENCE_LABEL[source.state]}</span></h4>
    {linked ? <p className="cr-line"><strong>Vínculo:</strong> {linked.reference.provider} · cuenta {linked.reference.accountId} · <code>{linked.reference.remoteId}</code> ({BASIS_LABEL[linked.basis]}){providerLabel(linked.reference.provider) ? <span className="cr-fiction" data-provider={linked.reference.provider}> · {providerLabel(linked.reference.provider)}</span> : null}</p> : <p className="cr-line"><strong>Vínculo:</strong> ninguno confirmado.</p>}
    {observation ? <p className="cr-line"><strong>Observación:</strong> {observation.label} · {observation.condition ? CONDITION_LABEL[observation.condition] : 'sin dato de estado'} · {COVERAGE_LABEL[observation.coverage]} · <time dateTime={observation.observedAt}>{when(observation.observedAt)}</time></p> : <p className="cr-line"><strong>Observación:</strong> ninguna.</p>}
    {source.state === 'unavailable' ? <p className="cr-note">La fuente no respondió: se desconoce su estado, no se supone sano.</p> : null}
    {source.state === 'partial' ? <p className="cr-note">Lectura parcial: no basta para afirmar el estado de esta fuente.</p> : null}
    {source.state === 'stale' ? <p className="cr-note">La observación tiene más de 24 horas o es de fecha futura: no se tiene en cuenta como actual.</p> : null}
    {candidates.length ? <div className="cr-candidates"><p className="cr-line"><strong>Candidatos sin confirmar</strong> (no cuentan como evidencia; un mismo ID en otra cuenta no crea un vínculo):</p>
      <ul>{candidates.map(candidate => <li key={JSON.stringify([candidate.provider, candidate.accountId, candidate.kind, candidate.remoteId])}>{candidate.provider} · cuenta {candidate.accountId} · <code>{candidate.remoteId}</code></li>)}</ul></div> : null}
  </section>;
}
function EventLine({ event }: { event: CommitmentEvent }) {
  const decision = event.decision;
  return <li className="cr-event" data-type={decision.type} data-basis={decision.type === 'close' ? decision.basis : undefined}>
    <p className="cr-line"><time dateTime={event.recordedAt}>{when(event.recordedAt)}</time> · decisión humana del operador local</p>
    {decision.type === 'assign' ? <p className="cr-line">Asignado a <strong>{decision.owner}</strong>: {decision.nextStep} (para <time dateTime={decision.dueAt}>{when(decision.dueAt)}</time>).</p>
      : <p className="cr-line">{decision.basis === 'observed' ? 'Cierre con evidencia observada, confirmado por una persona' : 'Cierre manual'}: {decision.note}</p>}
    {event.evidence.length ? <ul className="cr-evidence-used">{event.evidence.map(source => <li key={JSON.stringify(source.reference)}>{source.label} ({COVERAGE_LABEL[source.coverage]})</li>)}</ul> : null}
  </li>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const EFFECT: Record<SimulationAlternative['deadlineEffect'], string> = { late: 'Sigue siendo posterior a la fecha comprometida original: el nuevo plazo hay que acordarlo con el cliente', 'within-window': 'Cae dentro de la ventana comprometida', unknown: 'Efecto sobre el plazo: desconocido' };
function download(name: string, mime: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: mime })); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function TimelineLine({ entry }: { entry: CommitmentTimelineEntry }) {
  if (entry.type === 'observation') { const o = entry.observation; return <li className="cr-tl" data-kind="observation"><span className="cr-kind">Evidencia observada</span> <time dateTime={entry.at}>{when(entry.at)}</time> · {ROLE_LABEL[entry.role]}: {o.label} · {o.condition ? CONDITION_LABEL[o.condition] : 'sin dato de estado'} · {COVERAGE_LABEL[o.coverage]}</li>; }
  const d = entry.event.decision, label = d.type === 'assign' ? 'Decisión humana' : d.basis === 'observed' ? 'Cierre con evidencia observada, confirmado por una persona' : 'Cierre manual (decisión humana)';
  return <li className="cr-tl" data-kind="decision" data-basis={d.type === 'close' ? d.basis : undefined}><span className="cr-kind">{label}</span> <time dateTime={entry.at}>{when(entry.at)}</time> · Operador local · {d.type === 'assign' ? 'asigna a ' + d.owner + ': ' + d.nextStep : d.note}</li>;
}

export function CommitmentRadar({ contextRevision, commitmentId = null, onContextStale, onRehearse, clock = Date.now }: CommitmentRadarProps) {
  const [items, setItems] = useState<CommitmentSummary[] | null>(null), [listError, setListError] = useState(''), [listLoading, setListLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null), [detail, setDetail] = useState<CommitmentDetail | null>(null), [detailError, setDetailError] = useState(''), [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraftState] = useState<Draft>(emptyDraft()), [formError, setFormError] = useState(''), [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set()), [unknownOutcome, setUnknownOutcome] = useState(false), [done, setDone] = useState(''), [draftNotice, setDraftNotice] = useState(''), [freshSim, setFreshSim] = useState<{ detail: CommitmentDetail; sim: CommitmentSimulation | { error: string } } | null>(null);
  const pin = useRef<string | null>(contextRevision), alive = useRef(true), listSeq = useRef(0), detailSeq = useRef(0), listAbort = useRef<AbortController | null>(null), detailAbort = useRef<AbortController | null>(null);
  const drafts = useRef(new Map<string, Draft>()), attempts = useRef(new Map<string, Attempt>()), pending = useRef(new Set<string>()), mutSeq = useRef(0), notes = useRef(new Map<string, { formError: string; done: string }>()), openRef = useRef<string | null>(null), heading = useRef<HTMLHeadingElement | null>(null);
  openRef.current = openId;
  const ids = useId();   // el nombre accesible de cada campo es SOLO su rótulo (no incluye lo escrito dentro)

  function wipe(message = '') {
    listSeq.current++; detailSeq.current++; listAbort.current?.abort(); detailAbort.current?.abort(); drafts.current.clear(); attempts.current.clear(); notes.current.clear(); mutSeq.current++; pending.current.clear();   // una mutación en vuelo queda REVOCADA: su respuesta ya no toca nada
    setItems(null); setOpenId(null); setDetail(null); setDetailError(''); setDetailLoading(false); setListLoading(false); setListError(message); setDraftState(emptyDraft()); setFormError(''); setPendingIds(new Set()); setUnknownOutcome(false); setDone(''); setDraftNotice(''); setFreshSim(null);
  }
  /** Un error que invalida la vista (otra copia, sesión bloqueada) retira todo; el resto se explica sin perder nada. Devuelve true si retiró. */
  function invalidates(failure: unknown) {
    if (failure instanceof CommitmentError && (failure.status === 401 || failure.code === 'COMMITMENT_CONTEXT_CHANGED')) { wipe(failure.message); if (failure.status !== 401) onContextStale?.(); return true; }
    return false;
  }
  async function loadList() {
    const mine = pin.current; if (!mine) return; listAbort.current?.abort(); const abort = new AbortController(); listAbort.current = abort; const current = ++listSeq.current; setListLoading(true); setListError('');
    const timer = setTimeout(() => abort.abort(), 15_000);
    try { const result = await loadCommitments(mine, abort.signal); if (!alive.current || current !== listSeq.current || pin.current !== mine) return; setItems(result.items); }
    catch (failure) { if (!alive.current || current !== listSeq.current || pin.current !== mine) return; if (!invalidates(failure)) setListError(abort.signal.aborted ? 'La consulta del Radar tardó demasiado. Vuelve a intentarlo.' : failure instanceof Error ? failure.message : 'No se pudo cargar el Radar.'); }
    finally { clearTimeout(timer); if (alive.current && current === listSeq.current) setListLoading(false); }
  }
  async function loadDetail(id: string): Promise<CommitmentDetail | null> {
    const mine = pin.current; if (!mine) return null; detailAbort.current?.abort(); const abort = new AbortController(); detailAbort.current = abort; const current = ++detailSeq.current; setDetailLoading(true); setDetailError('');
    const timer = setTimeout(() => abort.abort(), 15_000);
    try { const result = await loadCommitment(id, mine, abort.signal); if (!alive.current || current !== detailSeq.current || pin.current !== mine || openRef.current !== id) return null; setDetail(result); return result; }
    catch (failure) { if (!alive.current || current !== detailSeq.current || pin.current !== mine) return null; if (!invalidates(failure)) setDetailError(abort.signal.aborted ? 'La consulta tardó demasiado. Vuelve a intentarlo.' : failure instanceof Error ? failure.message : 'No se pudo cargar el compromiso.'); return null; }
    finally { clearTimeout(timer); if (alive.current && current === detailSeq.current) setDetailLoading(false); }
  }
  function open(id: string) {
    openRef.current = id; setOpenId(id); setDetail(null); setDraftNotice(''); setFreshSim(null); const note = notes.current.get(id); notes.current.delete(id); setDone(note?.done ?? ''); setFormError(note?.formError ?? ''); setUnknownOutcome(attempts.current.has(id) && !!attempts.current.get(id)); setDraftState(drafts.current.get(id) ?? emptyDraft()); void loadDetail(id);
  }
  function close() { setOpenId(null); openRef.current = null; setDetail(null); detailSeq.current++; detailAbort.current?.abort(); setDetailLoading(false); setDetailError(''); requestAnimationFrame(() => { if (alive.current && (!document.activeElement || document.activeElement === document.body)) heading.current?.focus(); }); }
  function setDraft(next: Draft) { setDraftState(next); if (openId) { if (dirty(next)) drafts.current.set(openId, next); else drafts.current.delete(openId); } }

  // Un pin nuevo (otra copia) o ninguno retira TODO lo anterior antes de leer nada: ni listas, ni detalles, ni borradores de la copia anterior.
  useEffect(() => { alive.current = true; return () => { alive.current = false; listSeq.current++; detailSeq.current++; listAbort.current?.abort(); detailAbort.current?.abort(); }; }, []);
  useEffect(() => { pin.current = contextRevision; wipe(); if (contextRevision) void loadList(); }, [contextRevision]);
  useEffect(() => { if (commitmentId && contextRevision && items?.some(item => item.id === commitmentId) && openRef.current !== commitmentId) open(commitmentId); }, [commitmentId, items]);
  useEffect(() => { const lock = () => wipe('La sesión está bloqueada. Desbloquea Plan B para continuar.'); window.addEventListener('planb:locked', lock); return () => window.removeEventListener('planb:locked', lock); }, []);

  /**
   * Un envío pertenece a SU compromiso y a SU generación de mutaciones: si mientras espera cambia la copia, se bloquea o se retira el propietario (`wipe`), su respuesta ya no toca nada (ni formulario,
   * ni lecturas, ni indicadores). Si la ficha abierta es otra, el resultado solo actualiza la lista y deja una nota para cuando se reabra el compromiso de origen.
   */
  async function send(id: string, attempt: Attempt) {
    if (pending.current.has(id)) return;
    const gen = mutSeq.current, mine = attempt.request.contextRevision, live = () => alive.current && pin.current === mine && gen === mutSeq.current;
    pending.current.add(id); setPendingIds(new Set(pending.current)); attempts.current.set(id, attempt); notes.current.delete(id);
    if (openRef.current === id) { setFormError(''); setDone(''); setUnknownOutcome(false); }
    const tell = (formError: string, done: string, unknown = false) => { if (!live()) return; if (openRef.current === id) { setFormError(formError); setDone(done); setUnknownOutcome(unknown); } else notes.current.set(id, { formError, done }); };
    try {
      const receipt = await decideCommitment(id, attempt.request);
      if (!live()) return;   // respuesta tardía (otra copia, bloqueo o propietario retirado): se descarta sin tocar nada
      attempts.current.delete(id); drafts.current.delete(id); if (openRef.current === id) setDraftState(emptyDraft());
      tell('', attempt.kind === 'assign' ? 'Asignación guardada.' : 'Cierre guardado.');
      const [fresh] = await Promise.all([openRef.current === id ? loadDetail(id) : Promise.resolve(null), loadList()]);
      if (live() && openRef.current === id && !fresh) setFormError('La decisión se guardó (' + receipt.event.operationId.slice(0, 8) + '), pero no se pudo actualizar la vista. Usa «Actualizar».');
    } catch (failure) {
      if (!live()) return;
      if (invalidates(failure)) return;
      if (failure instanceof CommitmentError && failure.unknown) {
        const text = 'No se sabe si la decisión llegó a guardarse. No se ha reenviado nada: puedes reintentar con la misma clave (no duplica) o comprobar leyendo el compromiso.';
        if (openRef.current === id) tell(text, '', true); else notes.current.set(id, { formError: text, done: '' });   // el intento sigue guardado para su compromiso
      } else {
        attempts.current.delete(id);
        tell(failure instanceof Error ? failure.message : 'No se pudo guardar la decisión.', '');
        if (failure instanceof CommitmentError && failure.code === 'COMMITMENT_REVISION_CHANGED') { await Promise.all([openRef.current === id ? loadDetail(id) : Promise.resolve(null), loadList()]); }   // recarga el estado y CONSERVA el borrador
      }
    } finally { if (gen === mutSeq.current) { pending.current.delete(id); if (alive.current) setPendingIds(new Set(pending.current)); } }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!detail || !openId || !pin.current || pendingIds.has(openId)) return;
    if (draft.mode === 'assign') {
      const dueMs = Date.parse(draft.due);
      if (!draft.owner.trim() || !draft.nextStep.trim() || !draft.due || !Number.isFinite(dueMs)) { setFormError('Indica responsable, siguiente paso y una fecha válida.'); return; }
      if (draft.from && !staleFrom && !revalidateBeforeSend()) return;
      if (draft.from && staleFrom) { setFormError('La alternativa se calculó sobre una revisión anterior: vuelve a llevarla al formulario para confirmarla con la actual.'); return; }
      if (draft.from && !draft.confirmed) { setFormError('Confirma que llevas esta alternativa a una asignación antes de guardar.'); return; }
      void send(openId, { kind: 'assign', request: { contextRevision: pin.current, expectedRevision: detail.item.revision, operationId: crypto.randomUUID(), decision: { type: 'assign', owner: draft.owner.trim(), nextStep: draft.nextStep.trim(), dueAt: new Date(dueMs).toISOString() } } });
    } else {
      if (!draft.note.trim()) { setFormError('Escribe una nota para el cierre.'); return; }
      if (draft.basis === 'observed' && !detail.canCloseObserved) { setFormError('El cierre con evidencia observada no está disponible con la lectura actual.'); return; }
      void send(openId, { kind: 'close', request: { contextRevision: pin.current, expectedRevision: detail.item.revision, operationId: crypto.randomUUID(), decision: { type: 'close', basis: draft.basis, note: draft.note.trim() } } });
    }
  }
  /** Reintento EXPLÍCITO: mismo cuerpo, misma clave. Nunca se dispara solo. */
  function retrySame() { const id = openId, attempt = id ? attempts.current.get(id) : undefined; if (id && attempt) void send(id, attempt); }
  /** Comprobar solo LEE: si el historial ya contiene la clave, la decisión se aplicó. */
  async function check() {
    const id = openId, attempt = id ? attempts.current.get(id) : undefined; if (!id) return; const fresh = await loadDetail(id); if (!fresh || openRef.current !== id) return;
    if (attempt && fresh.events.some(event => event.operationId === attempt.request.operationId)) { attempts.current.delete(id); drafts.current.delete(id); setDraftState(emptyDraft()); setUnknownOutcome(false); setFormError(''); setDone('La decisión ya estaba guardada: se comprobó leyendo, sin reenviar.'); void loadList(); }
    else if (attempt) setFormError('La lectura no muestra esa decisión: no consta que se guardara. Puedes reintentar con la misma clave o descartar el intento.');
  }
  function discardAttempt() { if (openId) attempts.current.delete(openId); setUnknownOutcome(false); setFormError(''); }

  const saving = !!openId && pendingIds.has(openId);
  // SIMULACIÓN: se calcula en memoria a partir del detalle leído (misma revisión que se ve); no escribe nada. Con otra lectura se recalcula.
  // SIMULACIÓN: se calcula en memoria a partir del detalle leído; no escribe nada. La evidencia envejece con el reloj, así que se REVALIDA con el reloj actual al llevar una alternativa al formulario y al guardar una preparada antes (no hay sondeo).
  const evaluate = (target: CommitmentDetail): CommitmentSimulation | { error: string } => { try { return simulateCommitment(target, new Date(clock()).toISOString()); } catch (failure) { return { error: failure instanceof Error ? failure.message : 'No se pudo simular.' }; } };
  const baseSim = useMemo(() => detail ? evaluate(detail) : null, [detail]);
  const simulation = detail && freshSim && freshSim.detail === detail ? freshSim.sim : baseSim;
  const timeline = useMemo(() => detail ? buildCommitmentTimeline(detail) : [], [detail]);
  const staleFrom = !!(draft.from && detail && draft.from.revision !== detail.item.revision);
  const fmtNow = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'medium' });
  const generatedText = (alt: SimulationAlternative) => 'Alternativa «' + alt.title + '»: ' + (alt.id === 'delay-two-days' ? 'proponer al cliente el nuevo plazo y confirmarlo.' : 'comprobar stock y plazo en otra fuente antes de comprometer fecha.');
  const snapshot = (alt: SimulationAlternative, sim: CommitmentSimulation) => ({ id: alt.id, title: alt.title, revision: sim.baseRevision, evaluatedAt: sim.evaluatedAt, missing: alt.missing, projectedDueAt: alt.projectedDueAt });
  /** Texto que la persona escribió a mano se CONSERVA; lo generado y sin editar se actualiza. */
  const merged = (alt: SimulationAlternative) => {
    const nextStep = draft.nextStep.trim() && (!draft.generated || draft.nextStep !== draft.generated.nextStep) ? draft.nextStep : generatedText(alt);
    const generatedDue = alt.projectedDueAt ? toLocalInput(alt.projectedDueAt) : '', due = draft.due && (!draft.generated || draft.due !== draft.generated.due) ? draft.due : generatedDue;
    return { nextStep, due, generated: { nextStep: generatedText(alt), due: generatedDue }, keptStep: nextStep !== generatedText(alt), keptDue: !!draft.due && due === draft.due && due !== generatedDue };
  };
  /** Lleva una alternativa al formulario ÚNICO de decisión REVALIDANDO la evidencia con el reloj actual: la persona completa responsable y fecha y confirma; aquí no se guarda nada. */
  function bring(requested: SimulationAlternative) {
    if (!detail) return;
    const sim = evaluate(detail); setFreshSim({ detail, sim });
    if ('error' in sim || sim.closedReason) { setDraftNotice('No se pudo revalidar la alternativa: ' + ('error' in sim ? sim.error : sim.closedReason)); return; }
    const alt = sim.alternatives.find(candidate => candidate.id === requested.id) ?? requested, m = merged(alt);
    setDraft({ ...draft, mode: 'assign', nextStep: m.nextStep, due: m.due, from: snapshot(alt, sim), generated: m.generated, confirmed: false });
    setDraftNotice('Alternativa calculada a las ' + fmtNow(sim.evaluatedAt) + '.' + (alt.missing.length ? ' Faltan ' + alt.missing.length + ' datos de evidencia (ver arriba): puedes decidir igualmente si lo confirmas sabiéndolo.' : '') + (m.keptStep || m.keptDue ? ' Se conservó lo que escribiste a mano.' : ''));
    setFormError(''); setDone(''); requestAnimationFrame(() => document.getElementById(ids + 'oi')?.focus());   // el foco pasa al primer dato que falta: el responsable
  }
  /** Al guardar una alternativa preparada antes: si la evidencia envejeció, NO se envía; se recalcula, se explica qué cambió y se pide confirmar de nuevo. Devuelve true si puede enviarse. */
  function revalidateBeforeSend(): boolean {
    if (!detail || !draft.from) return true;
    const sim = evaluate(detail); setFreshSim({ detail, sim });
    if ('error' in sim || sim.closedReason) { setFormError('No se pudo revalidar la alternativa con el reloj actual: ' + ('error' in sim ? sim.error : sim.closedReason) + ' No se ha guardado nada.'); return false; }
    const alt = sim.alternatives.find(candidate => candidate.id === draft.from!.id); if (!alt) return true;
    if (JSON.stringify(alt.missing) === JSON.stringify(draft.from.missing) && alt.projectedDueAt === draft.from.projectedDueAt) return true;
    const m = merged(alt), cleared = !!draft.from.projectedDueAt && !alt.projectedDueAt && !!draft.generated && draft.due === draft.generated.due;
    setDraft({ ...draft, nextStep: m.nextStep, due: m.due, from: snapshot(alt, sim), generated: m.generated, confirmed: false });
    setDraftNotice('La evidencia envejeció desde que preparaste esta alternativa (revalidada a las ' + fmtNow(sim.evaluatedAt) + '). ' + (alt.missing.length ? 'Ahora faltan ' + alt.missing.length + ' datos de evidencia (ver arriba). ' : '') + (cleared ? 'La fecha propuesta ya no es válida y se quitó: elige una tú. ' : '') + 'Se conservó lo que escribiste a mano. Revisa y vuelve a confirmar; no se ha guardado nada.');
    setFormError('La alternativa se revalidó con el reloj actual y cambió: revisa el aviso y confirma de nuevo.'); return false;
  }
  function exportReport(kind: 'html' | 'json') {
    if (!detail) return;
    try { const report = createCommitmentReport(detail); download('pelicula-' + detail.item.id + '-' + detail.item.revision.slice(0, 8) + '.' + kind, kind === 'html' ? 'text/html;charset=utf-8' : 'application/json', report[kind]); }
    catch { setFormError('No se pudo preparar el archivo: el detalle no es válido.'); }
  }
  if (!contextRevision) return <section className="cr" aria-labelledby="cr-title"><h1 id="cr-title" ref={heading} tabIndex={-1}>Radar de compromisos</h1><p className="cr-empty ui-empty" role="status">No hay una copia de ensayo activa: el Radar no muestra compromisos.</p></section>;
  const grouped = GROUPS.map(group => ({ ...group, rows: (items ?? []).filter(item => item.status === group.status) }));
  const closed = !!detail?.item.closure, locked = unknownOutcome;
  return <section className="cr" aria-labelledby="cr-title">
    <header className="cr-head"><div><h1 id="cr-title" ref={heading} tabIndex={-1}>Radar de compromisos</h1><p className="cr-sub">Compromisos con fecha, sus fuentes de venta, entrega y soporte y lo que se decidió. Datos de prueba: ninguna fuente real.</p></div>
      <button type="button" className="button secondary" disabled={listLoading} onClick={() => void loadList()}><RefreshCw size={16} aria-hidden="true" />Actualizar</button></header>
    {listError ? <div className="error-box" role="alert"><p>{listError}</p><button type="button" className="text-button" onClick={() => void loadList()}>Reintentar la lectura</button></div> : null}
    {!items ? (listLoading ? <p role="status" className="ui-loading">Leyendo el Radar…</p> : null)
      : items.length === 0 ? <p className="cr-empty" role="status">Esta copia no tiene compromisos que vigilar.</p>
      : grouped.filter(group => group.rows.length).map(group => <section key={group.status} className="cr-group" data-status={group.status} aria-labelledby={'cr-g-' + group.status}>
        <h3 id={'cr-g-' + group.status}>{group.title} ({group.rows.length})</h3><p className="cr-hint">{group.hint}</p>
        <ul className="cr-list">{group.rows.map(item => <li key={item.id} className="cr-item" data-id={item.id} data-status={item.status}>
          <div className="cr-item-head"><StatusChip status={item.status} /><button type="button" className="cr-open" aria-label={'Abrir ' + item.title + ' (ID ' + item.id + ')'} onClick={() => open(item.id)}>{item.title}</button><code>{item.id}</code></div>
          <dl className="cr-facts">
            <div><dt>Responsable</dt><dd>{item.action ? item.action.owner : 'Sin asignar'}</dd></div>
            <div><dt>Fecha comprometida</dt><dd><time dateTime={item.dueAt}>{when(item.dueAt)}</time></dd></div>
            <div><dt>Causa principal</dt><dd>{causeText(item)}</dd></div>
            <div><dt>Siguiente paso</dt><dd>{item.action ? item.action.nextStep + ' (para ' + when(item.action.dueAt) + ')' : item.closure ? 'Cerrado: ' + item.closure.note : 'Sin siguiente paso definido'}</dd></div>
          </dl></li>)}</ul></section>)}
    {openId ? <Modal title={items?.find(item => item.id === openId)?.title ?? detail?.item.title ?? 'Compromiso'} side close={close}>
      <div className="cr-detail">
        {detailError ? <div className="error-box" role="alert"><p>{detailError}</p><button type="button" className="text-button" onClick={() => void loadDetail(openId)}>Reintentar la lectura</button></div> : null}
        {!detail ? (detailLoading ? <p role="status">Leyendo el compromiso…</p> : null) : <>
          <div className="cr-summary"><StatusChip status={detail.item.status} /><p className="cr-line"><strong>Causa principal:</strong> {causeText(detail.item)}</p><p className="cr-line"><strong>Fecha comprometida:</strong> <time dateTime={detail.item.dueAt}>{when(detail.item.dueAt)}</time></p>
            <p className="cr-line"><strong>Responsable:</strong> {detail.item.action ? detail.item.action.owner : 'Sin asignar'}</p><p className="cr-line"><strong>Siguiente paso:</strong> {detail.item.action ? detail.item.action.nextStep + ' (para ' + when(detail.item.action.dueAt) + ')' : 'sin siguiente paso definido'}</p>
            {detail.item.closure ? <p className="cr-line"><strong>Cierre:</strong> {detail.item.closure.basis === 'observed' ? 'con evidencia observada, confirmado por una persona' : 'manual'} · {detail.item.closure.note}</p> : null}
            {onRehearse ? <div className="cr-actions"><button type="button" className="button secondary" disabled={locked || saving} onClick={() => { const id = detail.item.id; close(); onRehearse(id); }}>Ensayar mi semana</button></div> : null}</div>
          <h3>Evidencia por fuente</h3>
          <ul className="cr-disclosures" aria-label="Procedencia de los datos">{multisystemDisclosures.map(text => <li key={text}>{text}</li>)}</ul>
          {detail.evidence.map(source => <Evidence key={source.role} source={source} />)}
          {simulation ? ('error' in simulation ? <p className="cr-note" role="status">No se pudo simular: {simulation.error}</p> : simulation.closedReason ? <p className="cr-note">{simulation.closedReason}</p> : <section className="cr-sim" aria-label="Alternativas simuladas">
            <h3>Alternativas</h3>
            <p className="cr-note">Calculadas ahora, <strong>solo en memoria</strong>, sobre la revisión que ves ({fmtNow(simulation.evaluatedAt)}): no se guardan, no se envían y no avisan a nadie. Solo existe lo que confirmes en «Decidir».</p>
            {simulation.alternatives.map(alt => <article key={alt.id} className="cr-alt" data-alt={alt.id}>
              <h4>{alt.title}</h4>
              <p className="cr-line"><strong>Fecha propuesta:</strong> {alt.projectedDueAt ? <time dateTime={alt.projectedDueAt}>{when(alt.projectedDueAt)}</time> : 'ninguna: no se puede prometer una fecha con los datos actuales'} · {EFFECT[alt.deadlineEffect]}</p>
              <p className="cr-line"><strong>Supuestos</strong></p><ul>{alt.assumptions.map(text => <li key={text}>{text}</li>)}</ul>
              {alt.missing.length ? <><p className="cr-line"><strong>Datos que faltan</strong></p><ul className="cr-missing">{alt.missing.map(text => <li key={text}>{text}</li>)}</ul></> : <p className="cr-note">No faltan datos de evidencia para esta alternativa.</p>}
              <button type="button" className="button secondary" onClick={() => bring(alt)} disabled={locked || saving}>Llevar al formulario de decisión</button>
            </article>)}
          </section>) : null}
          {done ? <p className="cr-done" role="status">{done}</p> : null}
          {!closed ? <form className="cr-form" onSubmit={submit} aria-label="Decidir sobre el compromiso" noValidate>
            <h3>Decidir</h3>
            <fieldset className="cr-mode" disabled={locked || saving}><legend>Qué quieres hacer</legend>
              <label><input type="radio" name="cr-mode" checked={draft.mode === 'assign'} onChange={() => setDraft({ ...draft, mode: 'assign' })} /> Asignar responsable y siguiente paso</label>
              <label><input type="radio" name="cr-mode" checked={draft.mode === 'close'} onChange={() => setDraft({ ...draft, mode: 'close' })} /> Cerrar el compromiso</label></fieldset>
            {draft.from ? <p className="cr-note" data-from={draft.from.id}>Borrador desde la simulación «{draft.from.title}» (calculada el {fmtNow(draft.from.evaluatedAt)}, solo en memoria). Revísalo: no se guarda nada hasta que confirmes.{draftNotice ? <span className="cr-draft-notice" role="status"> {draftNotice}</span> : null}{staleFrom ? ' ATENCIÓN: el compromiso cambió desde que la calculaste; vuelve a llevarla al formulario.' : ''}</p> : null}
            {draft.mode === 'assign' ? <>
              <label className="field"><span id={ids + 'o'}>Responsable</span><input id={ids + 'oi'} aria-labelledby={ids + 'o'} value={draft.owner} maxLength={160} disabled={locked || saving} onChange={event => setDraft({ ...draft, owner: event.target.value })} /></label>
              <label className="field"><span id={ids + 's'}>Siguiente paso</span><textarea aria-labelledby={ids + 's'} value={draft.nextStep} maxLength={400} disabled={locked || saving} onChange={event => setDraft({ ...draft, nextStep: event.target.value })} /></label>
              {draft.from ? <label className="cr-confirm"><input type="checkbox" checked={draft.confirmed && !staleFrom} disabled={staleFrom || locked || saving} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} /> Confirmo que llevo esta alternativa a una asignación con este responsable y esta fecha{draft.from.missing.length ? ' y que decido sabiendo que faltan ' + draft.from.missing.length + ' datos de evidencia (los de arriba)' : ''}</label> : null}
              <label className="field"><span id={ids + 'd'}>Fecha para el siguiente paso</span><input aria-labelledby={ids + 'd'} type="datetime-local" value={draft.due} disabled={locked || saving} onChange={event => setDraft({ ...draft, due: event.target.value })} /></label></> : <>
              <fieldset className="cr-mode" disabled={locked || saving}><legend>Cómo se cierra</legend>
                <label><input type="radio" name="cr-basis" checked={draft.basis === 'observed'} disabled={!detail.canCloseObserved} onChange={() => setDraft({ ...draft, basis: 'observed' })} /> Con evidencia observada</label>
                {!detail.canCloseObserved ? <p className="cr-note">No disponible: hacen falta las tres fuentes recientes y completas, la entrega completada y ninguna fuente bloqueada.</p> : null}
                <label><input type="radio" name="cr-basis" checked={draft.basis === 'manual'} onChange={() => setDraft({ ...draft, basis: 'manual' })} /> Cierre manual</label></fieldset>
              <label className="field"><span id={ids + 'n'}>Nota del cierre</span><textarea aria-labelledby={ids + 'n'} value={draft.note} maxLength={400} disabled={locked || saving} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label></>}
            {formError ? <p className="cr-error" role="alert">{formError}</p> : null}
            <div className="cr-actions">
              <button type="submit" className="button primary" disabled={saving || locked}>{saving ? 'Guardando…' : draft.mode === 'assign' ? 'Guardar asignación' : 'Cerrar compromiso'}</button>
              {unknownOutcome ? <><button type="button" className="button secondary" onClick={retrySame} disabled={saving}>Reintentar con la misma clave</button><button type="button" className="button secondary" onClick={() => void check()} disabled={saving || detailLoading}>Comprobar leyendo</button><button type="button" className="text-button" onClick={discardAttempt} disabled={saving}>Descartar este intento</button></> : null}
            </div>
            <p className="cr-note">Cada decisión se confirma con la revisión que estás viendo y una clave de operación: si el compromiso cambia mientras decides, se te avisa y tu borrador se conserva.</p>
          </form> : null}
          <section className="cr-film" aria-label="Cronología y exportación">
            <h3>Cronología del incidente</h3>
            <p className="cr-note">Mismos datos que el historial, con la evidencia observada. Distingue evidencia observada de decisión humana; las simulaciones no figuran porque solo viven en memoria. La cercanía en el tiempo no implica causalidad.</p>
            <details className="cr-timeline"><summary>Ver cronología ({timeline.length})</summary>{timeline.length ? <ol className="cr-tl-list">{timeline.map((entry, index) => <TimelineLine key={index + entry.at} entry={entry} />)}</ol> : <p className="cr-note">Sin eventos.</p>}</details>
            <div className="cr-actions"><button type="button" className="button secondary" onClick={() => exportReport('html')}><Download size={16} aria-hidden="true" />Descargar HTML</button><button type="button" className="button secondary" onClick={() => exportReport('json')}><Download size={16} aria-hidden="true" />Descargar JSON</button></div>
            <p className="cr-note">Ambos archivos salen de esta misma lectura (revisión {detail.item.revision.slice(0, 8)}…). Exportar solo lee: no escribe ni envía nada.</p>
          </section>
          <h3>Historial de decisiones ({detail.events.length})</h3>
          {detail.events.length ? <ol className="cr-events">{detail.events.map(event => <EventLine key={event.operationId} event={event} />)}</ol> : <p className="cr-note">Todavía no hay decisiones. Las observaciones de las fuentes no figuran aquí: solo lo que decidió una persona.</p>}
        </>}
      </div>
    </Modal> : null}
  </section>;
}
