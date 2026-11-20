import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import {
  dateCheckMaterials, dateCheckSkills, isoToMadridLocal, madridLocalToIso,
  type DateCheckAlternativeView, type DateCheckCatalog, type DateCheckEvidence, type DateCheckForm, type DateCheckRecordView, type DateCheckView,
} from '../shared/date-check-api.js';
import { DateCheckError, analyzeDate, changeDemo, confirmCheck, listChecks, loadCatalog, loadCheck, saveCheck } from './date-check-client.js';
import './date-check.css';

// «COMPROBAR UNA FECHA» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). Una persona de ventas u operaciones indica el trabajo pedido y ensaya si puede prometer la fecha.
// La pantalla solo muestra lo que calculó el motor: fecha pedida, primera fecha sustentada, por qué, qué cambiaría el resultado y a quién afecta cada alternativa.
// Comparar no escribe. Confirmar registra UN siguiente paso local, con la revisión comparada y una clave de operación; el recibo muestra lo que guardó el servidor.

type Props = { contextRevision: string | null; onContextStale: () => void; onClose?: () => void };
type Busy = null | 'catalog' | 'analyze' | 'confirm' | 'list' | 'open' | 'demo';
type Uncertain = { id: string; operationId: string; payload: { owner: string; nextStep: string; dueAt: string; alternativeId: string; inputRevision: string }; form: DateCheckForm };

const DATE = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const when = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : 'sin fecha');
const short = (iso: string | null | undefined) => (iso ? DAY.format(new Date(iso)) : '—');
const minutes = (value: number) => (value >= 60 ? `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ''}` : `${value} min`);
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString(16).padStart(12, '0'));

const OUTCOME: Record<DateCheckAlternativeView['requested']['outcome'], string> = { meets: 'Cumple la fecha pedida', misses: 'No cumple la fecha pedida', unknown: 'Sin determinar' };
const CLASS: Record<DateCheckAlternativeView['requested']['classification'], string> = {
  verified: 'Comprobado con los datos actuales', conditioned: 'Depende de confirmar algo', conflict: 'Conflicto comprobado', incomplete: 'Cálculo incompleto',
};
const EFFECT: Record<string, string> = { improves: 'Mejora', worsens: 'Empeora', later: 'Termina más tarde, en plazo', earlier: 'Termina antes', same: 'Sin cambios', unknown: 'Sin determinar' };
const PROJECTION: Record<string, string> = { 'on-time': 'En plazo', late: 'Tarde', 'not-completed': 'No termina', indeterminate: 'Sin determinar' };
const BASIS: Record<DateCheckEvidence['basis'], string> = { observed: 'Observado', declared: 'Declarado', assumed: 'Supuesto del ensayo', unknown: 'Desconocido' };
const CELL: Record<string, string> = { meets: 'Cumple', misses: 'No cumple', unknown: 'Sin determinar', 'not-available': 'No disponible' };

export function DateCheck({ contextRevision, onContextStale, onClose }: Props) {
  const [catalog, setCatalog] = useState<DateCheckCatalog | null>(null);
  const [form, setForm] = useState<DateCheckForm | null>(null);
  const [view, setView] = useState<DateCheckView | null>(null);
  const [record, setRecord] = useState<DateCheckRecordView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>('catalog');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState<{ id: string; title: string; createdAt: string; requestedAt: string; state: 'current' | 'historical'; decided: boolean }[]>([]);
  const [uncertain, setUncertain] = useState<Uncertain | null>(null);
  const [step, setStep] = useState({ owner: '', nextStep: '', dueAt: '' });
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const checkId = useRef<string | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const [focusTarget, setFocusTarget] = useState<'result' | 'receipt' | null>(null);
  const pin = contextRevision;

  const fail = (failure: unknown) => {
    if (failure instanceof DOMException && failure.name === 'AbortError') return;
    if (failure instanceof DateCheckError && failure.code === 'DATE_CHECK_CONTEXT_CHANGED') { setView(null); setRecord(null); onContextStale(); }
    setError(failure instanceof Error ? failure.message : 'No se pudo completar la comprobación.');
  };

  useEffect(() => {
    if (!pin) { setBusy(null); return; }
    const controller = new AbortController();
    setBusy('catalog'); setError(null);
    Promise.all([loadCatalog(pin, controller.signal), listChecks(pin, controller.signal)])
      .then(([value, list]) => { setCatalog(value); setForm(current => current ?? value.defaults); setSaved(list.items); })
      .catch(fail).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);
  useEffect(() => () => abort.current?.abort(), []);
  // El foco se mueve en un efecto, cuando el contenido ya está pintado.
  useEffect(() => {
    if (focusTarget === 'result') resultHeading.current?.focus();
    if (focusTarget === 'receipt') receiptHeading.current?.focus();
    if (focusTarget) setFocusTarget(null);
  }, [focusTarget]);

  const shown = record?.view ?? view;
  const alternatives = useMemo(() => {
    if (!shown) return [];
    return [...shown.alternatives].filter(item => item.available).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  }, [shown]);
  const current = alternatives.find(item => item.id === selected) ?? null;
  const keep = shown?.alternatives.find(item => item.id === shown.keepId) ?? null;
  const historical = record?.state === 'historical';
  const decision = record?.decision ?? null;

  function suggestStep(value: DateCheckView, alternative: DateCheckAlternativeView | null) {
    const first = value.checkFirst[0];
    const nextStep = first?.kind === 'inbound-arrival' && first.neededBy ? `${first.label}: antes del ${when(first.neededBy)}.`
      : first?.kind === 'duration' && first.maxMinutes ? `Estimar la duración en visita técnica: cabe si dura ${minutes(first.maxMinutes)} o menos.`
        : first ? `${first.label}.` : alternative?.supported.at ? `Ofrecer ${when(alternative.supported.at)} al cliente.` : 'Revisar la solicitud con operaciones.';
    return nextStep.slice(0, 400);
  }

  async function runAnalysis(event?: SyntheticEvent) {
    event?.preventDefault();
    if (!pin || !form) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy('analyze'); setError(null); setRecord(null); setUncertain(null); setStatus('Comprobando la fecha con la cartera…');
    try {
      const value = await analyzeDate(pin, form, controller.signal);
      checkId.current = uuid();
      const best = value.best ?? [...value.alternatives].filter(item => item.available).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]?.id ?? value.keepId;
      setView(value); setSelected(best);
      const alternative = value.alternatives.find(item => item.id === best) ?? null;
      const dueDefault = isoToMadridLocal(new Date(Date.parse(catalog?.week.now ?? value.evaluatedAt) + 26 * 3600_000).toISOString()).date;
      setStep(prior => ({ owner: prior.owner, nextStep: suggestStep(value, alternative), dueAt: dueDefault }));
      setStatus('Comprobación lista.'); setFocusTarget('result');
    } catch (failure) { setStatus(''); fail(failure); }
    finally { if (abort.current === controller) { abort.current = null; setBusy(null); } }
  }
  function cancel() { abort.current?.abort(); abort.current = null; setBusy(null); setStatus('Comprobación cancelada. No se guardó nada.'); }

  async function confirm(event: SyntheticEvent) {
    event.preventDefault();
    if (!pin || !shown || !current || !form) return;
    const attempt: Uncertain = uncertain ?? {
      id: record?.id ?? checkId.current ?? uuid(), operationId: uuid(), form: record?.form ?? form,
      payload: { owner: step.owner.trim(), nextStep: step.nextStep.trim(), dueAt: madridLocalToIso(step.dueAt, '18:00'), alternativeId: current.id, inputRevision: shown.inputRevision },
    };
    setBusy('confirm'); setError(null); setStatus('Registrando el siguiente paso…');
    try {
      // Guardar la comprobación (idempotente por clave) y confirmar UNA decisión con su clave de operación. Si se pierde la respuesta, se repite con las MISMAS claves.
      if (!record) await saveCheck(pin, attempt.id, attempt.form, attempt.payload.inputRevision);
      const result = await confirmCheck(pin, attempt.id, { ...attempt.payload, operationId: attempt.operationId });
      setRecord(result); setUncertain(null); setView(null);
      setSaved(list => [{ id: result.id, title: result.form.title, createdAt: result.createdAt, requestedAt: result.form.requestedAt, state: result.state, decided: true }, ...list.filter(item => item.id !== result.id)]);
      setStatus('Siguiente paso registrado.'); setFocusTarget('receipt');
    } catch (failure) {
      if (failure instanceof DateCheckError && failure.unknown) { setUncertain(attempt); setStatus(''); setError('No sabemos si se registró: tu copia no respondió. Repite con la misma clave para comprobarlo sin duplicar.'); }
      else { setStatus(''); fail(failure); }
    } finally { setBusy(null); }
  }

  async function reopen(id: string) {
    if (!pin) return;
    setBusy('open'); setError(null); setUncertain(null);
    try {
      const value = await loadCheck(pin, id, new AbortController().signal);
      setRecord(value); setView(null); setForm(value.form);
      setSelected(value.decision?.alternativeId ?? value.view.best ?? value.view.keepId);
      setStatus(value.state === 'historical' ? 'Comprobación histórica: la cartera cambió desde entonces.' : 'Comprobación abierta.'); setFocusTarget(value.decision ? 'receipt' : 'result');
    } catch (failure) { fail(failure); }
    finally { setBusy(null); }
  }
  async function demo(change: 'withdraw-slot' | 'restore-slot') {
    if (!pin) return;
    setBusy('demo'); setError(null);
    try {
      const value = await changeDemo(pin, change);
      setCatalog(value);
      const list = await listChecks(pin, new AbortController().signal);
      setSaved(list.items);
      if (record) setRecord({ ...record, state: list.items.find(item => item.id === record.id)?.state ?? record.state });
      if (view) setStatus('La cartera cambió: vuelve a comprobar para ver el resultado vigente.');
      setView(prior => (prior ? { ...prior, demoRevision: -1 } : prior));
    } catch (failure) { fail(failure); }
    finally { setBusy(null); }
  }

  if (!pin) return <section className="dc" aria-labelledby="dc-title"><h2 id="dc-title">Comprobar una fecha</h2><p className="dc-empty">Activa una copia de datos de prueba para comprobar fechas con su cartera.</p></section>;
  const viewStale = view?.demoRevision === -1;
  const local = form ? isoToMadridLocal(form.requestedAt) : null;
  const set = (patch: Partial<DateCheckForm>) => setForm(prior => (prior ? { ...prior, ...patch } : prior));

  return (
    <section className="dc" aria-labelledby="dc-title">
      <div className="dc-head">
        <div>
          <h2 id="dc-title">Comprobar una fecha</h2>
          <p className="dc-fiction">Ficción: semana de ensayo de una distribuidora e instaladora ({catalog ? `${short(catalog.week.start)} – ${short(catalog.week.end)}` : '…'}). Comprobar no cambia nada; solo se guarda el siguiente paso que confirmes.</p>
        </div>
        <div className="dc-head-actions">
          <span className="dc-chip">Ensayo</span>
          {onClose ? <button type="button" className="button secondary" onClick={onClose}>Volver</button> : null}
        </div>
      </div>
      <p className="dc-live" role="status" aria-live="polite">{status}</p>
      {error ? <div className="dc-error" role="alert">{error}</div> : null}

      {form && local ? (
        <form className="dc-block dc-form" onSubmit={runAnalysis} aria-labelledby="dc-form-title">
          <h3 id="dc-form-title">Solicitud</h3>
          <div className="dc-grid">
            <label className="dc-field dc-wide">Trabajo<input value={form.title} maxLength={120} required onChange={event => set({ title: event.target.value })} /></label>
            <label className="dc-field">Fecha pedida<input type="date" value={local.date} required onChange={event => event.target.value && set({ requestedAt: madridLocalToIso(event.target.value, local.time) })} /></label>
            <label className="dc-field">Hora límite<input type="time" value={local.time} step={900} required onChange={event => event.target.value && set({ requestedAt: madridLocalToIso(local.date, event.target.value) })} /></label>
            <label className="dc-field">Duración (horas)
              <input type="number" min={0.5} max={50} step={0.5} value={form.durationMinutes === null ? '' : form.durationMinutes / 60} disabled={form.durationMinutes === null}
                onChange={event => { const hours = Number(event.target.value); if (Number.isFinite(hours) && hours >= 0.5) set({ durationMinutes: Math.round(hours * 60) }); }} />
            </label>
            <label className="dc-check"><input type="checkbox" checked={form.durationMinutes === null} onChange={event => set({ durationMinutes: event.target.checked ? null : 360 })} />Todavía sin estimar</label>
            <label className="dc-field">Habilidad
              <select value={form.skill} onChange={event => set({ skill: event.target.value })}>{dateCheckSkills.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            </label>
            <label className="dc-field dc-wide">Material
              <select value={form.materialKey} onChange={event => set({ materialKey: event.target.value })}>
                <option value="none">Sin material</option>
                {dateCheckMaterials.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="dc-field">Unidades<input type="number" min={0} max={40} value={form.quantity} disabled={form.materialKey === 'none'} onChange={event => set({ quantity: Math.max(0, Math.min(40, Math.round(Number(event.target.value) || 0))) })} /></label>
          </div>
          <p className="dc-note">Se suman 30 min de viaje. El cliente da acceso desde las 08:00 del día pedido.</p>
          <div className="dc-actions">
            <button type="submit" className="button primary" disabled={busy !== null}>{busy === 'analyze' ? 'Comprobando…' : 'Comprobar'}</button>
            {busy === 'analyze' ? <button type="button" className="button secondary" onClick={cancel}>Cancelar</button> : null}
          </div>
        </form>
      ) : busy === 'catalog' ? <p className="dc-empty ui-loading">Cargando la semana de ensayo…</p> : null}

      {shown && keep ? (
        <div className="dc-results" data-stale={viewStale || historical ? '' : undefined}>
          <div className="dc-block dc-summary" data-outcome={shown.best ? 'meets' : keep.requested.outcome}>
            <h3 ref={resultHeading} tabIndex={-1}>{shown.request.title}</h3>
            {historical ? <p className="dc-warning" role="note">Comprobación histórica: la cartera, las reservas o los cambios declarados cambiaron después. Lo comparado sigue aquí; para confirmar, comprueba de nuevo.</p> : null}
            {viewStale ? <p className="dc-warning" role="note">La cartera cambió después de esta comprobación. Vuelve a comprobar antes de confirmar.</p> : null}
            <dl className="dc-dates">
              <div><dt>Fecha pedida</dt><dd>{when(shown.request.requestedAt)}</dd></div>
              <div><dt>Primera fecha que sostiene la evidencia</dt><dd>{keep.supported.at ? when(keep.supported.at) : keep.requested.outcome === 'unknown' ? 'Sin determinar' : 'Ninguna en la semana'}{keep.supported.at && !keep.supported.proven ? ' (no se pudo comprobar si hay otra antes)' : ''}</dd></div>
            </dl>
            <p className="dc-verdict">{verdict(shown, keep)}</p>
            {keep.blockers.length ? <><h4>Por qué, con lo que hay</h4><ul className="dc-because">{keep.blockers.map((item, index) => <li key={index}>{blockerText(item, shown)}</li>)}</ul></> : null}
            {keep.conditions.length ? <><h4>De qué depende</h4><ul>{keep.conditions.map((item, index) => <li key={index}>{item.label}</li>)}</ul></> : null}
            {shown.checkFirst.length ? (
              <><h4>Qué conviene confirmar primero</h4>
                <ol className="dc-first">{shown.checkFirst.map((item, index) => (
                  <li key={index}>{item.label}{item.neededBy ? <> — antes del <strong>{when(item.neededBy)}</strong></> : null}{item.maxMinutes ? <> — cabe si dura <strong>{minutes(item.maxMinutes)}</strong> o menos</> : null}
                    {item.dependents ? <small>{item.dependents === 1 ? 'Lo necesita 1 alternativa que cumple.' : `Lo necesitan ${item.dependents} alternativas que cumplen.`}</small> : null}</li>
                ))}</ol></>
            ) : null}
            <p className="dc-note">Se reorganizan {shown.slice.movable} trabajos que comparten recurso o material con la solicitud ({shown.slice.resources.join(', ')}); los otros {shown.slice.frozen} conservan su horario y lo que termina antes del {short(shown.slice.frozenBefore)} no se mueve.{shown.search.complete ? '' : ' La búsqueda no terminó: nada se da por comprobado.'}</p>
          </div>

          <fieldset className="dc-block dc-alternatives">
            <legend><h3>Alternativas</h3></legend>
            <p className="dc-note">Ordenadas por: fechas protegidas que respetan, si cumplen la fecha pedida, primera fecha posible y cuántos cambios piden. Ninguna está autorizada por aparecer aquí.</p>
            {alternatives.map((item, index) => (
              <label key={item.id} className="dc-pick" data-outcome={item.requested.outcome}>
                <input type="radio" name="dc-alternative" value={item.id} checked={selected === item.id} disabled={!!decision} onChange={() => setSelected(item.id)}
                  aria-labelledby={`dc-alt-${index}`} aria-describedby={`dc-alt-${index}-detail`} />
                <span className="dc-pick-body">
                  <strong id={`dc-alt-${index}`}>{item.label}</strong>
                  <span id={`dc-alt-${index}-detail`} className="dc-pick-detail">
                  <span className="dc-pick-line"><span className="dc-badge" data-outcome={item.requested.outcome}>{OUTCOME[item.requested.outcome]}</span> {CLASS[item.requested.classification]}</span>
                  <span className="dc-pick-line">{item.supported.at ? <>Fecha posible: {when(item.supported.at)}</> : 'Sin fecha posible que respete las protecciones'}</span>
                  <span className="dc-pick-line">{item.protections.every(entry => entry.kept !== false) ? 'Mantiene las fechas protegidas' : `Rompe: ${item.protections.filter(entry => entry.kept === false).map(entry => entry.title).join(', ')}`}
                    {item.extraMinutes ? ` · +${minutes(item.extraMinutes)} de trabajo` : ''}{item.reservations.length ? ` · cede ${item.reservations.map(entry => `${entry.quantity} uds de ${entry.title}`).join(', ')}` : ''}</span>
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {current ? (
            <div className="dc-block" aria-labelledby="dc-detail-title">
              <h3 id="dc-detail-title">{current.label}</h3>
              {current.candidate.startAt ? <p>Con esta alternativa, {current.candidate.resource} haría el trabajo de {short(current.candidate.startAt)} a {short(current.candidate.finishAt)}.</p> : null}
              {current.blockers.length ? <ul className="dc-because">{current.blockers.map((item, index) => <li key={index}>{blockerText(item, shown)}</li>)}</ul> : null}
              <p>Material: {current.material.ok ? 'llega a tiempo' : 'no llega a tiempo'}{current.material.availableAt ? ` (disponible ${short(current.material.availableAt)}${current.material.enabledBy ? `, con ${current.material.enabledBy}` : ''})` : ''}. Personal: {current.staffing.ok === true ? 'hay capacidad' : current.staffing.ok === false ? 'no hay capacidad' : 'sin determinar'}{current.staffing.completionIfMaterial && current.staffing.ok === false ? ` (con material terminaría ${short(current.staffing.completionIfMaterial)})` : ''}.</p>
              <details className="dc-evidence"><summary>Evidencia del material</summary><EvidenceList items={current.material.evidence} /></details>
              <h4>Compromisos afectados</h4>
              <div className="dc-table-wrap" role="region" aria-label="Compromisos afectados" tabIndex={0}>
                <table className="dc-table">
                  <thead><tr><th scope="col">Compromiso</th><th scope="col">Antes</th><th scope="col">Después</th><th scope="col">Efecto</th><th scope="col"><span className="dc-sr">Evidencia</span></th></tr></thead>
                  <tbody>{current.affected.map(row => {
                    const key = `${current.id}:${row.commitmentId}`, open = openEvidence === key;
                    return [
                      <tr key={key} data-effect={row.effect}>
                        <th scope="row">{row.title}{row.protected ? <small>Protegido</small> : null}{row.reassigned.length ? <small>{row.reassigned.map(move => `${move.job}: ${move.from ?? '—'} → ${move.to ?? '—'}`).join('; ')}</small> : null}</th>
                        <td>{PROJECTION[row.before.projection]}<small>{short(row.before.completionAt)}</small></td>
                        <td>{PROJECTION[row.after.projection]}<small>{short(row.after.completionAt)}</small></td>
                        <td>{EFFECT[row.effect]}</td>
                        <td><button type="button" className="dc-link" aria-expanded={open} aria-controls={`dc-ev-${row.commitmentId}`} onClick={() => setOpenEvidence(open ? null : key)}>{open ? 'Ocultar evidencia' : 'Ver evidencia'}<span className="dc-sr"> de {row.title}</span></button></td>
                      </tr>,
                      open ? <tr key={key + ':ev'} id={`dc-ev-${row.commitmentId}`}><td colSpan={5}><EvidenceList items={row.evidence} /></td></tr> : null,
                    ];
                  })}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {shown.scenarios.length ? (
            <div className="dc-block">
              <h3>Si cambian las circunstancias</h3>
              <div className="dc-table-wrap" role="region" aria-label="Alternativas por escenario" tabIndex={0}>
                <table className="dc-table dc-matrix">
                  <thead><tr><th scope="col">Alternativa</th>{shown.scenarios.map(item => <th key={item.id} scope="col">{item.label}</th>)}</tr></thead>
                  <tbody>{alternatives.map(item => (
                    <tr key={item.id}><th scope="row">{item.label}</th>{shown.scenarios.map(scenario => {
                      const cell = scenario.cells.find(entry => entry.alternativeId === item.id);
                      return <td key={scenario.id} data-outcome={cell?.outcome}>{cell ? CELL[cell.outcome] : '—'}{cell?.protectionsKept === false ? <small>rompe una protección</small> : null}</td>;
                    })}</tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {decision ? (
            <div className="dc-block dc-receipt" aria-labelledby="dc-receipt-title">
              <h3 id="dc-receipt-title" ref={receiptHeading} tabIndex={-1}>Siguiente paso registrado</h3>
              <dl className="dc-dates">
                <div><dt>Alternativa</dt><dd>{decision.alternativeLabel}</dd></div>
                <div><dt>Responsable</dt><dd>{decision.owner}</dd></div>
                <div><dt>Siguiente paso</dt><dd>{decision.nextStep}</dd></div>
                <div><dt>Para</dt><dd>{when(decision.dueAt)}</dd></div>
                <div><dt>Fecha que se podría ofrecer</dt><dd>{decision.promised.outcome === 'meets' ? when(decision.promised.requestedAt) : decision.promised.supportedAt ? when(decision.promised.supportedAt) : 'Sin fecha'}</dd></div>
                <div><dt>Registrado</dt><dd>{when(decision.confirmedAt)}</dd></div>
              </dl>
              {decision.promised.conditions.length ? <><h4>Condiciones que lo sostienen</h4><ul>{decision.promised.conditions.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}
              <p className="dc-note">Es un registro local de esta copia de ensayo, ligado a la revisión comparada. No avisa a nadie ni cambia la cartera.</p>
            </div>
          ) : !historical && !viewStale && current ? (
            <form className="dc-block dc-confirm" onSubmit={confirm} aria-labelledby="dc-confirm-title">
              <h3 id="dc-confirm-title">Registrar el siguiente paso</h3>
              <p className="dc-note">Alternativa elegida: <strong>{current.label}</strong>. Se guarda una sola vez.</p>
              <div className="dc-grid">
                <label className="dc-field">Responsable<input value={step.owner} maxLength={160} required disabled={!!uncertain} onChange={event => setStep({ ...step, owner: event.target.value })} /></label>
                <label className="dc-field">Para el día<input type="date" value={step.dueAt} required disabled={!!uncertain} onChange={event => setStep({ ...step, dueAt: event.target.value })} /></label>
                <label className="dc-field dc-wide">Siguiente paso<textarea value={step.nextStep} maxLength={400} rows={2} required disabled={!!uncertain} onChange={event => setStep({ ...step, nextStep: event.target.value })} /></label>
              </div>
              <div className="dc-actions"><button type="submit" className="button primary" disabled={busy !== null || !step.owner.trim() || !step.nextStep.trim() || !step.dueAt}>{uncertain ? 'Repetir con la misma clave' : busy === 'confirm' ? 'Registrando…' : 'Confirmar'}</button></div>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="dc-block dc-saved">
        <h3>Comprobaciones guardadas</h3>
        {saved.length ? <ul className="dc-list">{saved.map(item => (
          <li key={item.id}><button type="button" className="dc-link" onClick={() => void reopen(item.id)} disabled={busy !== null}>{item.title}</button>
            <small>Para {short(item.requestedAt)} · {item.decided ? 'con siguiente paso' : 'sin decidir'} · {item.state === 'historical' ? 'histórica' : 'vigente'}</small></li>
        ))}</ul> : <p className="dc-note">Todavía no hay ninguna. Se guarda al confirmar un siguiente paso.</p>}
        {catalog ? (
          <details className="dc-evidence dc-demo">
            <summary>Datos de prueba: simular un cambio posterior en la cartera</summary>
            <p className="dc-note">Revisión de la semana: {catalog.demo.revision}. {catalog.demo.slotWithdrawn ? 'Coordinación retiró la franja de Cruz del jueves.' : 'La franja de Cruz del jueves sigue disponible.'}</p>
            <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void demo(catalog.demo.slotWithdrawn ? 'restore-slot' : 'withdraw-slot')}>{catalog.demo.slotWithdrawn ? 'Devolver la franja del jueves' : 'Retirar la franja del jueves'}</button>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function EvidenceList({ items }: { items: DateCheckEvidence[] }) {
  if (!items.length) return <p className="dc-note">Sin evidencia registrada.</p>;
  return <ul className="dc-ev">{items.map((item, index) => (
    <li key={index}><strong>{item.label}</strong>: {item.value}
      <small>{BASIS[item.basis]}{item.source ? ` · ${item.source}` : ''}{item.observedAt ? ` · ${short(item.observedAt)}` : ''}{item.coverage === 'partial' ? ' · lectura parcial' : ''}{item.stale ? ' · dato antiguo' : ''}</small></li>
  ))}</ul>;
}

function verdict(view: DateCheckView, keep: DateCheckAlternativeView) {
  const best = view.alternatives.find(item => item.id === view.best);
  if (keep.requested.outcome === 'meets') return keep.requested.classification === 'verified' ? 'Se puede prometer con lo que hay: el cálculo encuentra un plan que respeta todas las fechas protegidas.' : 'Se puede prometer con lo que hay, pero depende de un dato que conviene confirmar.';
  if (keep.requested.outcome === 'unknown') return 'Con lo que se sabe, la fecha queda sin determinar.';
  if (best) return `Con lo que hay, no. Se puede prometer si se confirma: ${best.offers.map(item => item.label).join(' y ')}.`;
  return 'No se puede prometer esa fecha sin mover una fecha protegida.';
}

function blockerText(item: DateCheckAlternativeView['blockers'][number], view: DateCheckView): string {
  switch (item.code) {
    case 'material': return item.availableAt
      ? `Faltan ${item.shortAtNeed} de ${item.quantity} unidades de ${item.label} para empezar a tiempo (haría falta antes del ${short(item.neededBy)}). Llegan ${short(item.availableAt)}${item.enabledBy ? ` con ${item.enabledBy}` : ''}.${item.pending.length ? ` Sin fecha: ${item.pending.join(', ')}.` : ''}`
      : `No hay ${item.quantity} unidades de ${item.label} con lo conocido.${item.pending.length ? ` Pendiente sin fecha: ${item.pending.join(', ')}.` : ''}`;
    case 'staffing': return `${item.resources.join(', ')}: quedan ${minutes(Math.max(0, item.freeMinutes))} entre ${short(item.windowStart)} y ${short(view.request.requestedAt)}; hacen falta ${minutes(item.neededMinutes)}.${item.occupiedBy.length ? ` Lo ocupa ${item.occupiedBy.map(entry => `${entry.title} (${minutes(entry.minutes)}${entry.protected ? ', protegida' : ''})`).join(', ')}.` : ''}`;
    case 'protection': return `Rompería la fecha protegida de ${item.title} (${short(item.protectedAt)}): ${item.projectedAt ? `pasaría a ${short(item.projectedAt)}` : 'no terminaría'}.`;
    case 'horizon': return `No cabe dentro de la semana de ensayo (hasta ${short(item.horizonEnd)}).`;
    case 'window': return `No cabe dentro de la ventana de la solicitud (hasta ${short(item.windowEnd)}).`;
  }
}
