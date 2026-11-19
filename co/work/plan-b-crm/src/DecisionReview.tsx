import { useEffect, useRef, useState } from 'react';
import type { DecisionReviewView, ReviewList, ReviewView } from '../shared/date-check-review-api.js';
import { ReviewError, listDecisions, loadReview, recordEnding } from './date-check-review-client.js';
import './decision-review.css';

// «REVISAR UNA DECISIÓN» (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). Compara lo que se decidió con lo que pasó después.
// Tres cosas que no se mezclan: lo que la decisión suponía, lo que se observó (con fecha, referencia y alcance) y lo que el cálculo proyecta con lo observado.
// El desenlace observado se muestra aparte de la proyección. Solo se atribuye el retraso que la proyección explica; el resto se muestra como «por comprobar».

type Props = { contextRevision: string | null; onContextStale: () => void };
const DATE = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const when = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : 'sin fecha');
const span = (value: number) => {
  const days = Math.floor(value / 1440), hours = Math.floor((value % 1440) / 60), minutes = value % 60;
  return [days ? `${days} d` : '', hours ? `${hours} h` : '', minutes || (!days && !hours) ? `${minutes} min` : ''].filter(Boolean).join(' ');
};
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1e12).toString(16).padStart(12, '0'));
const STATUS: Record<DecisionReviewView['conditions'][number]['status'], string> = {
  held: 'Se cumplió', later: 'Ocurrió más tarde', 'not-happened': 'No ocurrió', unobserved: 'Sin observar', 'not-observable': 'Decisión interna',
};
const VERDICT: Record<DecisionReviewView['verdict'], string> = {
  pending: 'Todavía no hay desenlace observado.', 'met-as-offered': 'Se cumplió la fecha ofrecida, con las condiciones que la sostenían.',
  'met-differently': 'Se cumplió la fecha ofrecida, aunque no todo ocurrió como se suponía.', missed: 'La fecha ofrecida no se cumplió.',
};

export function DecisionReview({ contextRevision: pin, onContextStale }: Props) {
  const [list, setList] = useState<ReviewList['items']>([]);
  const [view, setView] = useState<ReviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<{ ending: 'met' | 'supplier-late'; operationId: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (focus) { heading.current?.focus(); setFocus(false); } }, [focus]);

  const fail = (failure: unknown) => {
    if (failure instanceof DOMException && failure.name === 'AbortError') return;
    if (failure instanceof ReviewError && failure.code === 'REVIEW_CONTEXT_CHANGED') { setView(null); onContextStale(); }
    setError(failure instanceof Error ? failure.message : 'No se pudo completar la revisión.');
  };
  async function refreshList(signal: AbortSignal) { if (pin) setList((await listDecisions(pin, signal)).items); }
  useEffect(() => {
    if (!pin) return;
    const controller = new AbortController();
    refreshList(controller.signal).catch(fail);
    // En la App esta pantalla convive con «Comprobar una fecha»: una decisión recién confirmada debe aparecer al volver a la ventana sin recargar.
    const onFocus = () => { void refreshList(new AbortController().signal).catch(() => undefined); };
    window.addEventListener('focus', onFocus);
    return () => { controller.abort(); window.removeEventListener('focus', onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);
  // Al entrar en la lista (puntero o foco) se vuelve a leer, como mucho cada 3 s. Leer no escribe.
  const lastRefresh = useRef(0);
  const refreshSoon = () => {
    if (!pin || Date.now() - lastRefresh.current < 3000) return;
    lastRefresh.current = Date.now();
    void refreshList(new AbortController().signal).catch(() => undefined);
  };

  async function open(id: string) {
    if (!pin) return;
    setBusy(true); setError(null); setPendingKey(null);
    try { setView(await loadReview(pin, id, new AbortController().signal)); setFocus(true); }
    catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }
  async function record(ending: 'met' | 'supplier-late') {
    if (!pin || !view) return;
    const attempt = pendingKey?.ending === ending ? pendingKey : { ending, operationId: uuid() };
    setBusy(true); setError(null);
    try {
      const next = await recordEnding(pin, view.checkId, ending, attempt.operationId);
      setView(next); setPendingKey(null); setFocus(true);
      await refreshList(new AbortController().signal);
    } catch (failure) {
      if (failure instanceof ReviewError && failure.unknown) { setPendingKey(attempt); setError('No sabemos si se registró: repite con la misma clave para comprobarlo sin duplicar.'); }
      else fail(failure);
    } finally { setBusy(false); }
  }

  if (!pin) return <section className="drv" aria-labelledby="drv-title"><h2 id="drv-title">Revisar una decisión</h2><p className="drv-note">Activa una copia de ensayo para revisar decisiones.</p></section>;
  const review = view?.review ?? null;
  return (
    <section className="drv" aria-labelledby="drv-title">
      <h2 id="drv-title">Revisar una decisión</h2>
      <p className="drv-note">Con datos de prueba. Compara lo que se decidió con lo que pasó después. Ver una revisión no cambia nada.</p>
      {error ? <div className="drv-error" role="alert">{error}</div> : null}
      <div className="drv-block" onPointerEnter={refreshSoon} onFocusCapture={refreshSoon}>
        <div className="drv-list-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3>Decisiones registradas</h3>
          <button type="button" className="button secondary" disabled={busy} onClick={() => { lastRefresh.current = Date.now(); void refreshList(new AbortController().signal).catch(fail); }}>Actualizar</button>
        </div>
        {list.length ? <ul className="drv-list">{list.map(item => (
          <li key={item.checkId}><button type="button" className="drv-link" disabled={busy} onClick={() => void open(item.checkId)} aria-current={view?.checkId === item.checkId ? 'true' : undefined}>{item.title}</button>
            <small>{item.recorded ? VERDICT[item.verdict ?? 'pending'] : 'Sin desenlace todavía'}</small></li>
        ))}</ul> : <p className="drv-note">Todavía no hay decisiones. Se registran al confirmar un siguiente paso en «Comprobar una fecha».</p>}
      </div>

      {view ? (
        <article className="drv-block drv-detail" data-verdict={review?.verdict ?? 'pending'} aria-labelledby="drv-detail-title">
          <h3 id="drv-detail-title" ref={heading} tabIndex={-1}>{view.title}</h3>
          <h4>Lo que se decidió</h4>
          <dl className="drv-grid">
            <div><dt>Alternativa</dt><dd>{view.decision.alternativeLabel}</dd></div>
            <div><dt>Fecha que se podía ofrecer</dt><dd>{when(review?.offeredAt ?? (view.decision.promised.outcome === 'meets' ? view.decision.promised.requestedAt : view.decision.promised.supportedAt))}</dd></div>
            <div><dt>Responsable y siguiente paso</dt><dd>{view.decision.owner}: {view.decision.nextStep}</dd></div>
            <div><dt>Revisión comparada</dt><dd><code>{view.decision.inputRevision.slice(0, 12)}</code> · {when(view.decision.confirmedAt)}</dd></div>
          </dl>
          {view.decision.promised.conditions.length ? <><h5>Condiciones que la sostenían</h5><ul>{view.decision.promised.conditions.map((item, index) => <li key={index}>{item}</li>)}</ul></> : null}

          {review ? (
            <>
              <p className="drv-verdict">{VERDICT[review.verdict]}</p>
              {review.conditions.length ? (
                <><h4>Lo que se suponía y lo que se observó</h4>
                  <div className="drv-table-wrap" role="region" aria-label="Condiciones y observaciones" tabIndex={0}>
                    <table className="drv-table">
                      <thead><tr><th scope="col">Condición</th><th scope="col">Se suponía</th><th scope="col">Se observó</th><th scope="col">Estado</th></tr></thead>
                      <tbody>{review.conditions.map(item => (
                        <tr key={item.offerId} data-status={item.status}>
                          <th scope="row">{item.label}</th>
                          <td>{item.assumed.at ? when(item.assumed.at) : item.assumed.start ? `${when(item.assumed.start)} – ${when(item.assumed.end)}` : '—'}</td>
                          <td>{item.observation ? <>{item.observation.kind === 'slot' ? (item.observation.worked ? 'Trabajada' : 'No trabajada') : when(item.observation.happenedAt)}<small>{item.observation.reference}{item.observation.scope === 'partial' ? ' · registro parcial' : ''}</small></> : 'Sin observación'}</td>
                          <td>{STATUS[item.status]}{item.differenceMinutes && item.differenceMinutes > 0 ? <small>{span(item.differenceMinutes)} más tarde</small> : null}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div></>
              ) : null}
              <div className="drv-compare">
                <section aria-labelledby="drv-cf"><h4 id="drv-cf">Proyección con lo observado</h4>
                  {review.counterfactual ? <><p className="drv-big">{when(review.counterfactual.finishAt)}</p><p className="drv-note">El mismo cálculo y la misma revisión, con lo observado en lugar de lo supuesto. Es una proyección, no un hecho.</p></>
                    : <p className="drv-note">No hay condiciones observadas: la proyección es la del día de la decisión ({when(review.planned.finishAt)}).</p>}
                </section>
                <section aria-labelledby="drv-obs"><h4 id="drv-obs">Desenlace observado</h4>
                  <p className="drv-big">{when(review.observed.finishAt)}</p>
                  {review.observed.observation ? <p className="drv-note">{review.observed.observation.reference} · registrado {when(review.observed.observation.recordedAt)}</p> : null}
                </section>
              </div>
              {review.attribution.delayMinutes ? (
                <><h4>Qué explica la diferencia</h4>
                  <p>Terminó {span(review.attribution.delayMinutes)} después de lo previsto ({when(review.planned.finishAt)}).
                    {review.attribution.explainedMinutes ? ` ${span(review.attribution.explainedMinutes)} se explican por: ${review.conditions.filter(item => review.attribution.explainedBy.includes(item.offerId)).map(item => item.label).join(', ')}.` : ' Ninguna condición observada lo explica.'}</p>
                  {review.attribution.residualMinutes ? <p className="drv-residual">Quedan {span(review.attribution.residualMinutes)} por comprobar: ningún hecho registrado los explica.</p> : null}</>
              ) : null}
              {review.attribution.partialEvidence ? <p className="drv-note">Alguna observación es un registro parcial: la explicación puede cambiar cuando se complete.</p> : null}
              <p className="drv-note">Desenlace registrado {when(view.recordedAt)}.</p>
            </>
          ) : (
            <div className="drv-record">
              <h4>Registrar el desenlace (datos de prueba)</h4>
              <p className="drv-note">En un piloto vendría de las fuentes. Aquí se elige uno de dos cierres de prueba; se registra una sola vez.</p>
              <div className="drv-actions">{view.endings.map(item => (
                <button key={item.id} type="button" className="button secondary" disabled={busy || !item.available} onClick={() => void record(item.id)}>
                  {pendingKey?.ending === item.id ? 'Repetir con la misma clave' : item.label}
                </button>
              ))}</div>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
