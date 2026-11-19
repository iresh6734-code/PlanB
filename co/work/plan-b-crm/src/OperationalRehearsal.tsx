import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { RehearsalAlternative, RehearsalAnalysis, RehearsalCheckFirst, RehearsalDecisionDraft, RehearsalDiagnosis, RehearsalOverview, RehearsalView } from '../shared/operational-rehearsal-api.js';
import { CommitmentError, decideCommitment } from './commitment-radar-client.js';
import {
  RehearsalError, analyzeRehearsal, checkFirstRehearsal, chooseRehearsalAlternative, draftRehearsalDecision, linkRehearsalDecision, loadRehearsal, loadRehearsalOverview, saveRehearsal,
  type RehearsalScenario,
} from './operational-rehearsal-client.js';
import './operational-rehearsal.css';

// «ENSAYAR MI SEMANA» (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). Pantalla de un compromiso: empieza por qué pasa hoy y qué se puede decidir; el calendario es detalle.
// Todo lo que muestra es ficción y ensayo: nada se envía a ningún proveedor. Lo único que cambia algo es «Confirmar decisión», que registra UNA decisión local
// con la ruta existente del Radar, sobre la revisión vigente. Tres cosas se rotulan siempre por separado: ensayo (hipotético), decisión y resultado observado.

export interface OperationalRehearsalProps {
  /** Pin de la copia activa (`workspaceSearchContext.contextRevision`). */
  contextRevision: string | null;
  commitmentId: string;
  /** El servidor dijo que la copia cambió: el anfitrión debe releer su estado. */
  onContextStale?: () => void;
  /** Se registró una decisión: el anfitrión puede refrescar el Radar. */
  onDecision?: (commitmentId: string) => void;
  onClose?: () => void;
  /** Solo pruebas: generador de claves. */
  newId?: () => string;
}

const PROJECTION: Record<string, string> = {
  'on-time': 'Llega a tiempo, según este ensayo', late: 'Llega tarde', 'not-completed': 'No se termina dentro de estas dos semanas', indeterminate: 'No se puede saber con los datos que hay',
};
const SHORT: Record<string, string> = { 'on-time': 'a tiempo', late: 'tarde', 'not-completed': 'sin terminar', indeterminate: 'sin datos suficientes' };
const BASIS: Record<string, string> = { observed: 'Leído de', declared: 'Declarado por', assumed: 'Supuesto' };
const FIELD: Record<string, string> = { duration: 'duración', travel: 'desplazamiento', availableAt: 'fecha de disponibilidad', windows: 'horario' };
const CAVEAT: Record<string, string> = {
  'stale-evidence': 'dato observado hace más de un día', 'partial-source': 'la fuente solo se leyó en parte', assumed: 'es un supuesto de este ensayo', 'candidate-dependency': 'tiene un vínculo sin confirmar, que no se ha tenido en cuenta',
};
function heldText(code: string, name: string | null) {
  const quoted = name ? `«${name}»` : '';
  switch (code) {
    case 'resource-busy': return `su técnico estaba con ${quoted}`;
    case 'dependency': case 'waiting-dependency': return `tenía que terminar antes ${quoted}`;
    case 'material': return `esperaba el material ${quoted}`;
    case 'earliest-start': return 'no se podía empezar antes (acceso o fecha mínima)';
    case 'clock': return 'empieza en cuanto arranca la semana';
    case 'unknown-duration': return 'no se conoce su duración';
    case 'unknown-material': return `no se sabe cuándo estará ${quoted}`;
    case 'depends-on': return `depende de ${quoted}, que está sin determinar`;
    case 'unknown-capacity': return `no se conoce el horario de ${quoted}`;
    case 'not-in-plan': return 'no tiene sitio en el plan declarado';
    case 'queued-behind': return `está en cola detrás de ${quoted}`;
    case 'no-capacity-in-horizon': return 'no hay horas suficientes en estas dos semanas';
    default: return quoted ? `${code} ${quoted}` : code;
  }
}
const hours = (minutes: number) => { const h = Math.floor(minutes / 60), m = minutes % 60; return h >= 48 ? `${Math.round(minutes / 1440)} días` : (h ? `${h} h` : '') + (m ? ` ${m} min` : '') || '0 min'; };
function costText(costs: RehearsalAlternative['costs']) {
  const parts = [
    costs.extraCapacityMinutes ? `${hours(costs.extraCapacityMinutes)} de trabajo extra` : '', costs.renegotiatedDates ? 'renegociar una fecha con el cliente' : '',
    costs.alternativeMaterials ? 'un material alternativo sin confirmar' : '', costs.splits ? 'dividir un trabajo entre dos personas' : '',
  ].filter(Boolean);
  return parts.length ? 'Pide ' + parts.join(' y ') + '.' : 'No pide nada a nadie.';
}
const ROLE: Record<string, string> = { sale: 'Venta', delivery: 'Entrega', support: 'Soporte' };
const SOURCE_STATE: Record<string, string> = { observed: 'leída', stale: 'leída hace más de un día', partial: 'leída solo en parte', unavailable: 'no se pudo leer', missing: 'sin lectura', ambiguous: 'sin vínculo confirmado' };
const SOURCE_EFFECT: Record<string, string> = {
  'not-used': 'no cambia el ensayo', 'estimated-date': 'el pedido está retenido: se usa la fecha estimada de reposición', 'available-now': 'el material consta como disponible',
  'unknown-material': 'no se sabe cuándo estará el material: el ensayo no lo da por bueno', 'ticket-open': 'hay un ticket abierto que debe resolverse', 'ticket-resolved': 'el ticket consta como resuelto',
  'unknown-ticket': 'no se sabe cuánto queda del ticket: el ensayo no lo da por bueno',
};
const toLocalInput = (date: Date) => { const pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };

type Stage = 'idle' | 'saving' | 'unknown' | 'done';
type Attempt = { rehearsalId: string; operationId: string; step: number; draft: RehearsalDecisionDraft | null };

export function OperationalRehearsal({ contextRevision: pin, commitmentId, onContextStale, onDecision, onClose, newId = () => crypto.randomUUID() }: OperationalRehearsalProps) {
  const ids = useId();
  const [overview, setOverview] = useState<RehearsalOverview | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [priority, setPriority] = useState<'focus' | 'rival'>('focus');
  const [analysis, setAnalysis] = useState<RehearsalAnalysis | null>(null), [running, setRunning] = useState<'' | 'analyze' | 'check'>(''), [check, setCheck] = useState<RehearsalCheckFirst | null>(null);
  const [choice, setChoice] = useState(''), [form, setForm] = useState({ owner: '', nextStep: '', due: '' }), [stage, setStage] = useState<Stage>('idle'), [formError, setFormError] = useState('');
  const [recorded, setRecorded] = useState<RehearsalView | null>(null), [reopened, setReopened] = useState<RehearsalView | null>(null), [announce, setAnnounce] = useState('');
  const [saved, setSaved] = useState<{ owner: string; nextStep: string; dueAt: string } | null>(null);
  const [pendingNote, setPendingNote] = useState('');
  const sequence = useRef(0), work = useRef<AbortController | null>(null), attempt = useRef<Attempt | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null), receiptHeading = useRef<HTMLHeadingElement>(null), reopenedHeading = useRef<HTMLHeadingElement>(null);
  // El foco se mueve DESPUÉS de pintar (efecto), no en el mismo turno: el resultado aún no existe cuando termina la petición.
  const [focusOn, setFocusOn] = useState<{ target: 'results' | 'receipt' | 'reopened'; turn: number } | null>(null);
  useEffect(() => { if (focusOn) ({ results: resultsHeading, receipt: receiptHeading, reopened: reopenedHeading })[focusOn.target].current?.focus(); }, [focusOn]);
  const moveFocus = (target: 'results' | 'receipt' | 'reopened') => setFocusOn(previous => ({ target, turn: (previous?.turn ?? 0) + 1 }));
  const zone = overview?.week?.timeZone ?? 'Europe/Madrid';
  const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone }) : 'sin fecha';
  const scenario: RehearsalScenario = { commitmentId, perturbationIds: selected, priority };

  const clear = useCallback(() => {
    work.current?.abort(); sequence.current += 1;
    setOverview(null); setAnalysis(null); setCheck(null); setChoice(''); setRecorded(null); setReopened(null); setRunning(''); setStage('idle'); setFormError(''); attempt.current = null;
  }, []);
  const failed = useCallback((failure: unknown, show: (message: string) => void) => {
    if (failure instanceof DOMException && failure.name === 'AbortError') return;
    const known = failure instanceof RehearsalError || failure instanceof CommitmentError ? failure : null;
    if (known?.status === 401) { clear(); show(known.message); return; }
    if (known?.code === 'REHEARSAL_CONTEXT_CHANGED' || known?.code === 'COMMITMENT_CONTEXT_CHANGED') { clear(); show(known.message); onContextStale?.(); return; }
    show(known?.message ?? 'No se pudo completar el ensayo.');
  }, [clear, onContextStale]);

  const load = useCallback(async () => {
    if (!pin) { clear(); return; }
    const turn = ++sequence.current, controller = new AbortController();
    setLoading(true); setError('');
    try {
      const next = await loadRehearsalOverview(pin, commitmentId, controller.signal);
      if (turn !== sequence.current) return;
      setOverview(next);
    } catch (failure) { if (turn === sequence.current) failed(failure, setError); }
    finally { if (turn === sequence.current) setLoading(false); }
  }, [pin, commitmentId, clear, failed]);
  useEffect(() => { clear(); void load(); }, [pin, commitmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const locked = () => { clear(); setError('La sesión está bloqueada. Desbloquea Plan B para continuar.'); };
    window.addEventListener('planb:locked', locked);
    return () => { window.removeEventListener('planb:locked', locked); work.current?.abort(); };
  }, [clear]);

  async function launch(kind: 'analyze' | 'check') {
    if (!pin || running) return;
    const controller = new AbortController(), turn = sequence.current;
    work.current = controller; setRunning(kind); setError('');
    setAnnounce(kind === 'analyze' ? 'Ensayando la semana. Puedes cancelar.' : 'Comparando qué dato cambia más la decisión. Puedes cancelar.');
    try {
      if (kind === 'analyze') {
        const result = await analyzeRehearsal(pin, scenario, controller.signal);
        if (turn !== sequence.current) return;
        setAnalysis(result); setCheck(null); setChoice(''); setRecorded(null); setStage('idle'); setFormError(''); attempt.current = null;
        setAnnounce('Ensayo terminado.'); moveFocus('results');
      } else {
        const result = await checkFirstRehearsal(pin, scenario, controller.signal);
        if (turn !== sequence.current) return;
        setCheck(result); setAnnounce('Comparación terminada.');
      }
    } catch (failure) {
      if (controller.signal.aborted) setAnnounce('Cancelado. No se ha cambiado nada.'); else if (turn === sequence.current) failed(failure, setError);
    } finally { if (work.current === controller) { work.current = null; setRunning(''); } }
  }
  const cancel = () => work.current?.abort();
  const stale = analysis !== null && (analysis.scenario.join() !== selected.join() || analysis.priority !== priority);

  // Confirmación por pasos reanudables: guardar ensayo → elegir → preparar → decidir (ruta del Radar) → anotar. Cada paso es idempotente con las mismas claves,
  // así que un reintento tras un resultado desconocido continúa desde el paso que falló sin crear un segundo efecto.
  async function confirm(event?: FormEvent) {
    event?.preventDefault();
    if (!pin || !analysis || !choice || stage === 'saving') return;
    const owner = form.owner.trim(), nextStep = form.nextStep.trim(), due = form.due ? new Date(form.due) : null;
    if (!owner || !nextStep || !due || Number.isNaN(due.getTime())) { setFormError('Escribe quién se encarga, cuál es el siguiente paso concreto y para cuándo.'); return; }
    const current = attempt.current ??= { rehearsalId: newId(), operationId: newId(), step: 0, draft: null };
    setStage('saving'); setFormError('');
    try {
      if (current.step === 0) { await saveRehearsal(pin, current.rehearsalId, { commitmentId, perturbationIds: analysis.scenario, priority: analysis.priority }); current.step = 1; }
      if (current.step === 1) { await chooseRehearsalAlternative(pin, current.rehearsalId, choice); current.step = 2; }
      if (current.step === 2) { current.draft = await draftRehearsalDecision(pin, current.rehearsalId, { operationId: current.operationId, owner, nextStep, dueAt: due.toISOString() }); current.step = 3; }
      if (current.step === 3) { await decideCommitment(commitmentId, current.draft!.request); current.step = 4; }
      const view = await linkRehearsalDecision(pin, current.rehearsalId, current.operationId);
      // El recibo cuenta lo que se ENVIÓ y guardó (la preparación inmutable de este intento), no lo que haya en el formulario tras un resultado desconocido (328).
      const sent = current.draft!.request.decision;
      attempt.current = null;
      setSaved(sent.type === 'assign' ? { owner: sent.owner, nextStep: sent.nextStep, dueAt: sent.dueAt } : null);
      setRecorded(view); setStage('done'); setAnnounce('Decisión registrada.');
      onDecision?.(commitmentId);
      void load();
      moveFocus('receipt');
    } catch (failure) {
      const unknown = (failure instanceof RehearsalError || failure instanceof CommitmentError) && failure.unknown;
      if (!unknown && (failure instanceof RehearsalError || failure instanceof CommitmentError) && failure.status === 409) attempt.current = null;
      setStage(unknown ? 'unknown' : 'idle');
      failed(failure, message => setFormError(unknown ? 'No se sabe si la decisión llegó a guardarse. Reintenta con la misma clave: no se duplicará.' : message));
    }
  }
  // Comprueba si una decisión PREPARADA llegó al Radar. No vuelve a decidir: solo anota la que el Radar ya tenga, o dice que no la tiene.
  async function checkPending(id: string, operationId: string) {
    if (!pin) return;
    try { const view = await linkRehearsalDecision(pin, id, operationId); setReopened(view); setPendingNote('El Radar sí la tenía: queda anotada en este ensayo.'); onDecision?.(commitmentId); void load(); }
    catch (failure) {
      if (failure instanceof RehearsalError && failure.code === 'REHEARSAL_DECISION_NOT_FOUND') setPendingNote('El Radar no tiene esa decisión: no llegó a registrarse. No se ha vuelto a enviar nada.');
      else failed(failure, setPendingNote);
    }
  }
  async function reopen(id: string) {
    if (!pin) return;
    try { const view = await loadRehearsal(pin, id, new AbortController().signal); setReopened(view); setPendingNote(''); moveFocus('reopened'); }
    catch (failure) { failed(failure, setError); }
  }

  const chosen = analysis?.alternatives.find(item => item.id === choice) ?? null, focus = overview?.focus ?? null;
  const span = overview?.week ? [Date.parse(overview.week.now), Date.parse(overview.week.horizonEnd)] as const : null;
  const diagnosisView = (diagnosis: RehearsalDiagnosis, hypothetical: boolean) => (
    <div className="or-diagnosis" data-projection={diagnosis.projection}>
      <p className="or-verdict"><strong>{PROJECTION[diagnosis.projection]}.</strong>{' '}
        {diagnosis.completionAt ? <>Terminaría el {when(diagnosis.completionAt)}; está comprometido para el {when(diagnosis.dueAt)}{diagnosis.latenessMinutes ? <> ({hours(diagnosis.latenessMinutes)} después)</> : null}.</> : <>Está comprometido para el {when(diagnosis.dueAt)}.</>}
        {hypothetical ? ' Es un ensayo: no ha ocurrido.' : ''}</p>
      {diagnosis.steps.length ? <><h4>Por qué</h4><ol className="or-chain">{diagnosis.steps.map(step => (
        <li key={step.jobId}><strong>{step.title}</strong>{step.resource ? <> · {step.resource}</> : null}{step.startAt ? <> · empieza el {when(step.startAt)}{step.finishAt ? <> y termina el {when(step.finishAt)}</> : null}</> : null}
          {step.held.length ? <span className="or-because"> porque {step.held.map(item => heldText(item.code, item.name)).join(' y ')}{step.waitedForCapacity ? ' (y después esperó a la siguiente jornada)' : ''}.</span> : null}</li>))}</ol></> : null}
      <details className="or-evidence"><summary>Con qué datos se ha calculado ({diagnosis.evidence.length})</summary>
        <ul>{diagnosis.evidence.map(item => <li key={item.subject + item.field}><strong>{item.subject}</strong> · {FIELD[item.field] ?? item.field}: {BASIS[item.basis]} {item.basis === 'assumed' ? 'de este ensayo' : item.origin}</li>)}</ul>
        {diagnosis.caveats.length ? <><h4>Con reservas</h4><ul>{diagnosis.caveats.map(item => <li key={item.code + item.subject}><strong>{item.subject}</strong>: {CAVEAT[item.code] ?? item.code}</li>)}</ul></> : null}
      </details>
      {diagnosis.offTime.length > 1 ? <p className="or-others">Además, con este plan: {diagnosis.offTime.filter(item => item.commitmentId !== commitmentId).map(item => `${item.title} (${SHORT[item.projection]})`).join('; ')}.</p> : null}
    </div>
  );
  const timelineView = (alternative: RehearsalAlternative) => (
    <details className="or-timeline"><summary>Ver el calendario de este plan</summary>
      {alternative.timeline.map(row => (
        <div key={row.resourceId} className="or-row">
          <h5>{row.resource}</h5>
          {span ? <div className="or-bars" aria-hidden="true">{row.jobs.map(job => { const left = (Date.parse(job.startAt) - span[0]) / (span[1] - span[0]) * 100, width = Math.max(0.6, (Date.parse(job.finishAt) - Date.parse(job.startAt)) / (span[1] - span[0]) * 100); return <span key={job.jobId} data-focus={job.focus || undefined} style={{ left: left + '%', width: width + '%' }} />; })}</div> : null}
          {row.jobs.length ? <ol>{row.jobs.map(job => <li key={job.jobId} data-focus={job.focus || undefined}>{when(job.startAt)} → {when(job.finishAt)} · {job.title}{job.focus ? ' (este compromiso)' : ''}</li>)}</ol> : <p className="or-muted">Sin trabajos en este plan.</p>}
        </div>))}
    </details>
  );

  return (
    <section className="or" aria-labelledby={ids + 't'} aria-busy={loading || running !== ''}>
      <header className="or-head">
        <div>
          <h2 id={ids + 't'}>Ensayar mi semana</h2>
          <p className="or-fiction"><span className="or-chip">Datos de prueba</span> Nada de lo que pruebes aquí se envía a ningún proveedor ni cambia tus datos. Solo «Confirmar decisión» registra algo, y lo hace en tu copia local.</p>
        </div>
        {onClose ? <button type="button" className="button secondary" onClick={onClose}>Volver al compromiso</button> : null}
      </header>
      <p className="or-live" role="status" aria-live="polite">{announce}</p>
      {error ? <div className="error-box or-error" role="alert">{error} <button type="button" className="text-button" onClick={() => void load()}>Actualizar</button></div> : null}
      {!pin ? <p className="or-empty">Abre una copia de ensayo para poder ensayar la semana.</p>
        : loading && !overview ? <p className="or-empty ui-loading">Leyendo la semana…</p>
        : overview?.status === 'radar-not-ready' ? <p className="or-empty">Activa primero el escenario de ensayo del Radar: la semana se ensaya sobre sus compromisos.</p>
        : overview?.status === 'commitment-not-linked' ? <p className="or-empty">Este compromiso no tiene semana de ensayo en los datos de prueba. Prueba con «Instalación de 12 equipos en Almacén Norte».</p>
        : overview && focus && overview.diagnosis ? <>
          <section className="or-block" aria-labelledby={ids + 'c'}>
            <h3 id={ids + 'c'}>{focus.title}</h3>
            <p className="or-context">Comprometido para el {when(focus.dueAt)}. Semana de ensayo: {overview.counts!.installations} instalaciones, {overview.counts!.technicians} técnicos, {overview.counts!.warehouses} almacenes, {overview.counts!.orders} pedidos y {overview.counts!.tickets} tickets, desde el {when(overview.week!.now)}.</p>
            <h4 className="or-sub">Con el plan de hoy</h4>
            {diagnosisView(overview.diagnosis, false)}
            {overview.sources.length ? <details className="or-evidence or-sources"><summary>Qué dicen las fuentes del Radar sobre este compromiso</summary>
              <ul>{overview.sources.map(item => <li key={item.role}><strong>{ROLE[item.role]}</strong> · {SOURCE_STATE[item.state]}{item.origin ? <> ({item.origin}{item.observedAt ? <>, {when(item.observedAt)}</> : null})</> : null}: {SOURCE_EFFECT[item.effect]}.</li>)}</ul>
              <p className="or-muted">Lo que una fuente no pudo leer queda como dato desconocido. No se rellena con un valor.</p>
            </details> : null}
          </section>

          <form className="or-block or-what-if" aria-labelledby={ids + 'w'} onSubmit={event => { event.preventDefault(); void launch('analyze'); }}>
            <h3 id={ids + 'w'}>¿Y si…?</h3>
            <fieldset disabled={running !== '' || stage === 'saving'}>
              <legend>Marca lo que quieras ensayar (ninguno: la semana tal como está)</legend>
              {overview.perturbations.map(item => (
                <label key={item.id} className="or-check"><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(overview.perturbations.map(entry => entry.id).filter(value => value === item.id ? event.target.checked : selected.includes(value)))} />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span></label>))}
            </fieldset>
            <fieldset disabled={running !== '' || stage === 'saving'}>
              <legend>Qué va primero (lo decides tú)</legend>
              <label className="or-check"><input type="radio" name={ids + 'p'} checked={priority === 'focus'} onChange={() => setPriority('focus')} /><span><strong>{focus.title}</strong></span></label>
              <label className="or-check"><input type="radio" name={ids + 'p'} checked={priority === 'rival'} onChange={() => setPriority('rival')} /><span><strong>{overview.rival?.title}</strong><small>Prioridad nueva de otro cliente</small></span></label>
            </fieldset>
            <div className="or-actions">
              <button type="submit" className="button primary" disabled={running !== '' || stage === 'saving'}>{running === 'analyze' ? 'Ensayando…' : analysis ? 'Ensayar de nuevo' : 'Ensayar'}</button>
              {running ? <button type="button" className="button secondary" onClick={cancel}>Cancelar</button> : null}
            </div>
          </form>

          {analysis ? <section className="or-block or-results" aria-labelledby={ids + 'r'} data-stale={stale || undefined}>
            <h3 id={ids + 'r'} tabIndex={-1} ref={resultsHeading}>Resultado del ensayo</h3>
            {stale ? <p className="or-note" role="status">Has cambiado lo que quieres ensayar. Esto es el ensayo anterior: pulsa «Ensayar de nuevo».</p> : null}
            {analysis.scenario.length ? <><h4 className="or-sub">Con esos cambios, el plan de hoy</h4>{diagnosisView(analysis.diagnosis, true)}</> : null}
            <div className="or-conflict" data-verdict={analysis.conflict.verdict}>
              {analysis.conflict.verdict === 'conflict' ? <>
                <h4>No caben a la vez</h4>
                <ul>{analysis.conflict.commitments.map(item => <li key={item.commitmentId}><strong>{item.title}</strong>, comprometido para el {when(item.dueAt)}{item.neededDueAt ? <>. Si los demás mantienen su fecha, necesitaría hasta el {when(item.neededDueAt)}</> : null}.</li>)}</ul>
                <p>Lo que aprieta: {[...analysis.conflict.resources, ...analysis.conflict.materials].join(', ') || 'las fechas comprometidas'}.{' '}
                  {analysis.conflict.minimality === 'verified-irreducible' ? 'Comprobado: juntos no caben, y quitando cualquiera de ellos sí.' : 'No se ha podido comprobar del todo; sirve para entender el problema, no como prueba.'}</p>
              </> : analysis.conflict.verdict === 'indeterminate' ? <>
                <h4>No se puede saber si cabe</h4>
                <p>Faltan datos: {analysis.conflict.missingData.map(item => heldText(item.code, item.name)).join('; ')}. No se da por bueno ni por malo.</p>
              </> : analysis.conflict.verdict === 'fits-with-everything' ? <><h4>Cabe</h4><p>En el plan encontrado este compromiso y los demás con datos llegan a tiempo.</p></>
                : <><h4>No se ha encontrado un choque pequeño</h4><p>Se examinaron {analysis.conflict.examined.join(', ')} sin encontrar una incompatibilidad entre pocos compromisos. Puede haber una mayor.</p></>}
            </div>

            <fieldset className="or-alternatives" disabled={stage === 'saving' || stage === 'done' || stale}>
              <legend>Qué puedes hacer</legend>
              <p className="or-note">Cada respuesta pide algo distinto. Ninguna está autorizada ni confirmada por aparecer aquí{analysis.optimality === 'best-found' ? '; los planes son los mejores encontrados, no necesariamente los mejores posibles' : ''}.</p>
              <div className="or-cards">{analysis.alternatives.map(item => (
                <article key={item.id} className="or-card" data-chosen={choice === item.id || undefined} data-projection={item.focus.projection}>
                  <label className="or-pick"><input type="radio" name={ids + 'a'} value={item.id} checked={choice === item.id} onChange={() => { setChoice(item.id); if (!form.due) setForm(value => ({ ...value, due: toLocalInput(new Date(Date.now() + 4 * 3_600_000)) })); }} />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span></label>
                  <dl>
                    <div><dt>Este compromiso</dt><dd>{SHORT[item.focus.projection]}{item.focus.completionAt ? ` · termina el ${when(item.focus.completionAt)}` : ''}{item.costs.renegotiatedDates ? ` · nueva fecha ${when(item.focus.dueAt)}` : ''}</dd></div>
                    <div><dt>Qué pide</dt><dd>{costText(item.costs)}</dd></div>
                    <div><dt>Mejora</dt><dd>{item.deltas.filter(delta => delta.effect === 'improves').map(delta => delta.title).join(', ') || 'nada más'}</dd></div>
                    <div><dt>Empeora</dt><dd>{item.deltas.filter(delta => delta.effect === 'worsens').map(delta => delta.title).join(', ') || 'nada en este plan'}</dd></div>
                    <div><dt>Quedan fuera de plazo</dt><dd>{item.missed}{item.indeterminate ? ` · ${item.indeterminate} sin datos suficientes` : ''}</dd></div>
                  </dl>
                  {timelineView(item)}
                </article>))}</div>
              {analysis.discarded.length ? <p className="or-muted">No aportan más en lo encontrado: {analysis.discarded.map(item => item.label).join('; ')}.</p> : null}
            </fieldset>

            <div className="or-check-first">
              <div className="or-actions"><button type="button" className="button secondary" disabled={running !== '' || stale || stage === 'saving'} onClick={() => void launch('check')}>{running === 'check' ? 'Comparando…' : '¿Qué conviene comprobar antes de decidir?'}</button>
                {running === 'check' ? <button type="button" className="button secondary" onClick={cancel}>Cancelar</button> : null}</div>
              {check ? <div className="or-ranking">
                <p className="or-note">Se prueba cada dato dudoso con los valores que se creen posibles, uno cada vez. No hay probabilidades: no se sabe cuál es más verosímil.</p>
                <ol>{check.ranking.map(row => (
                  <li key={row.hypothesisId} data-decisive={row.hypothesisId === check.mostDecisive || undefined}>
                    <strong>{row.question}</strong> {row.decisionChanges || row.viabilityFlips ? <span className="or-chip">Cambia la decisión</span> : <span className="or-muted">No cambia la decisión.</span>}
                    <ul>{row.byValue.map(entry => <li key={String(entry.value)}>Si es {typeof entry.value === 'number' ? hours(entry.value) : when(entry.value)}: {entry.best.length > 1 ? 'empatan como mejores' : 'lo mejor sería'} {entry.best.map(label => `«${label}»`).join(', ')}.</li>)}</ul>
                  </li>))}</ol>
              </div> : null}
            </div>

            {stage === 'done' && recorded ? <div className="or-receipt">
              <h4 tabIndex={-1} ref={receiptHeading}>Decisión registrada</h4>
              <dl>
                <div><dt>Ensayo (hipotético)</dt><dd>Comparaste {recorded.record.compared.length} respuestas y elegiste «{recorded.labels[recorded.record.chosen?.alternativeId ?? ''] ?? '—'}». Sigue siendo un ensayo: no demuestra que vaya a salir así.</dd></div>
                <div><dt>Decisión</dt><dd>{saved ? <>{saved.owner} se encarga de: {saved.nextStep} Para el {when(saved.dueAt)}. Guardada en tu copia local.</> : 'Guardada en tu copia local.'}</dd></div>
                <div><dt>Resultado observado</dt><dd>Todavía ninguno. Lo que ocurra de verdad se verá en el Radar cuando sus fuentes lo acrediten; ensayar o decidir no lo da por resuelto.</dd></div>
              </dl>
            </div> : chosen ? <form className="or-decision" onSubmit={confirm} aria-labelledby={ids + 'd'}>
              <h4 id={ids + 'd'}>Siguiente paso para «{chosen.label}»</h4>
              <p className="or-note">Se registra una sola decisión, sobre este compromiso tal como está ahora. Si el compromiso cambia antes de confirmar, tendrás que ensayar de nuevo.</p>
              <label className="field"><span>Quién se encarga</span><input value={form.owner} maxLength={160} disabled={stage === 'saving'} onChange={event => setForm({ ...form, owner: event.target.value })} /></label>
              <label className="field"><span>Siguiente paso concreto</span><textarea value={form.nextStep} maxLength={400} rows={3} disabled={stage === 'saving'} onChange={event => setForm({ ...form, nextStep: event.target.value })} /></label>
              <label className="field"><span>Para cuándo</span><input type="datetime-local" value={form.due} disabled={stage === 'saving'} onChange={event => setForm({ ...form, due: event.target.value })} /></label>
              {formError ? <div className="error-box" role="alert">{formError}</div> : null}
              {stage === 'unknown' ? <p className="or-note">El reintento envía exactamente lo que ya se intentó guardar. Si cambias el formulario, ese cambio no se aplica a esta decisión.</p> : null}
              <div className="or-actions"><button type="submit" className="button primary" disabled={stage === 'saving' || stale}>{stage === 'saving' ? 'Guardando…' : stage === 'unknown' ? 'Reintentar con la misma clave' : 'Confirmar decisión'}</button></div>
            </form> : <p className="or-muted">Elige una respuesta para preparar el siguiente paso.</p>}
          </section> : null}

          {overview.rehearsals.length ? <section className="or-block" aria-labelledby={ids + 's'}>
            <h3 id={ids + 's'}>Ensayos guardados de este compromiso</h3>
            <ul className="or-saved">{overview.rehearsals.map(item => (
              <li key={item.id}><span>{when(item.createdAt)} · {item.chosen ?? 'sin elección'} · {item.status === 'decision-recorded' ? 'con decisión registrada' : 'solo ensayo'} · {item.state === 'current' ? 'vigente' : 'histórico'}</span>
                <button type="button" className="button secondary" onClick={() => void reopen(item.id)}>Reabrir<span className="or-sr"> el ensayo del {when(item.createdAt)}</span></button></li>))}</ul>
            {reopened ? <div className="or-reopened" data-state={reopened.state}>
              <h4 tabIndex={-1} ref={reopenedHeading}>Ensayo del {when(reopened.record.createdAt)} · {reopened.state === 'current' ? 'vigente' : 'borrador histórico'}</h4>
              <p>{reopened.state === 'historical' ? 'El compromiso o la semana han cambiado desde entonces. Se conserva lo que comparaste, pero ya no sirve para confirmar: ensaya de nuevo.' : 'Se hizo sobre el compromiso tal como está ahora.'} Reabrirlo no vuelve a ensayar ni ejecuta nada.</p>
              <dl>
                <div><dt>Ensayo (hipotético)</dt><dd><ul>{reopened.record.compared.map(item => <li key={item.alternativeId}>{reopened.labels[item.alternativeId] ?? item.alternativeId}: {item.missedByTier.reduce((a, b) => a + b, 0)} fuera de plazo o sin datos{reopened.record.chosen?.alternativeId === item.alternativeId ? ' · elegida' : ''}</li>)}</ul></dd></div>
                <div><dt>Decisión</dt><dd>{reopened.record.decision ? <>Registrada en el Radar para este compromiso.{reopened.decisionDetail ? <> {reopened.decisionDetail.owner} se encarga de: {reopened.decisionDetail.nextStep} Para el {when(reopened.decisionDetail.dueAt)}. Se preparó para «{reopened.decisionDetail.label}».</> : null}</>
                  : reopened.pending.length ? <>{reopened.pending.map(item => <span key={item.operationId} className="or-pending">Se preparó una decisión para «{item.label}», pero no consta registrada. <button type="button" className="button secondary" onClick={() => void checkPending(reopened.record.id, item.operationId)}>Comprobar si llegó al Radar</button></span>)}{pendingNote ? <span role="status" className="or-pending-note">{pendingNote}</span> : null}</>
                  : 'Ninguna: fue solo un ensayo.'}{reopened.record.decision && pendingNote ? <span role="status" className="or-pending-note"> {pendingNote}</span> : null}</dd></div>
                <div><dt>Resultado observado</dt><dd>No se guarda aquí: se lee en el Radar.</dd></div>
              </dl>
              <p className="or-muted">Motor {reopened.record.engineVersion} · revisión {reopened.record.baseRevision.slice(0, 12)}</p>
            </div> : null}
          </section> : null}
        </> : null}
    </section>
  );
}
