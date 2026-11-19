import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { when } from '../shared/continuity-passport.js';
import { SOURCE_READING_HISTORY_NOTICE, type SourceHistoryResponse } from '../shared/source-reading-history.js';
import { FAILURE_TEXT, HISTORY_DEFAULT_LIMIT, entryFacts, headlineOf, loadSourceHistory, type HistoryEntry, type HistoryFailure, type HistorySource } from './source-reading-history-client.js';
import './source-reading-history.css';

// «Historial de lecturas» de una fuente (consumidor de la API local 298 sobre el diario 297). SOLO consulta el estado LOCAL: ni «Conectar» ni «Leer del proveedor» (esa acción, explícita y con cuenta y
// alcance autorizados, no existe todavía y es del coordinador). No muestra etiquetas, asuntos, referencias externas, valores ni cuerpos de registros: la API no los entrega. Sin consumidor montado todavía:
// ver coordination/plans/SOURCE-READING-HISTORY-UI-HANDOFF.md. El ámbito (fuente exacta y pin de la copia) lo fija el anfitrión; el componente nunca lo amplía.
export interface SourceReadingHistoryProps {
  /** Fuente exacta autorizada por el anfitrión (proveedor de ensayo, cuenta ficticia, objeto, modo y objetivo). */
  source: HistorySource;
  /** Pin de la copia activa (`contextRevision`). Cambiarlo descarta lo leído y vuelve a consultar. */
  contextRevision: string;
  /** Nombre visible de la fuente, dado por el anfitrión (no procede de los registros). */
  label: string;
  /** El contrato 298 solo sirve ensayos; el componente lo declara siempre. */
  environment: 'ensayo';
  /** Cambiar la clave descarta lo leído y vuelve a consultar (sesión, bloqueo, cuenta, captura). */
  identityKey?: string;
  pageSize?: number;
  fetcher?: typeof fetch;
}
type Meta = Pick<SourceHistoryResponse, 'instanceId' | 'contextRevision' | 'scopeRevision' | 'journalRevision' | 'provenance'> & { total: number; nextCursor: string | null };
interface View { entries: HistoryEntry[]; meta: Meta | null; failure: HistoryFailure | null; notice: string }
const EMPTY: View = { entries: [], meta: null, failure: null, notice: '' };
const metaOf = (response: SourceHistoryResponse): Meta => ({ instanceId: response.instanceId, contextRevision: response.contextRevision, scopeRevision: response.scopeRevision, journalRevision: response.journalRevision, provenance: response.provenance, total: response.page.total, nextCursor: response.page.nextCursor });
const sameSnapshot = (a: Meta, b: Meta) => a.instanceId === b.instanceId && a.contextRevision === b.contextRevision && a.scopeRevision === b.scopeRevision && a.journalRevision === b.journalRevision && a.provenance === b.provenance && a.total === b.total;
// Si el fallo invalida lo leído (otra copia, otro ámbito, historial cambiado, bloqueo) se descarta TODO; si solo impide continuar (no disponible, fallo), se conserva lo leído marcándolo como tal.
const DROPS: ReadonlySet<HistoryFailure> = new Set(['locked', 'not-registered', 'out-of-scope', 'changed', 'bad-cursor', 'invalid']);

export function SourceReadingHistory({ source, contextRevision, label, environment, identityKey = '', pageSize = HISTORY_DEFAULT_LIMIT, fetcher }: SourceReadingHistoryProps) {
  const titleId = useId(), [view, setView] = useState<View>(EMPTY), [loading, setLoading] = useState(true), [open, setOpen] = useState(false);
  const alive = useRef(true), generation = useRef(0), controller = useRef<AbortController | null>(null), loaded = useRef<View>(EMPTY), sourceKey = JSON.stringify(source);
  const publish = (next: View) => { loaded.current = next; setView(next); };
  const begin = () => {
    const mine = ++generation.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort; setLoading(true);
    return { signal: abort.signal, current: () => alive.current && generation.current === mine, finish: () => { if (alive.current && generation.current === mine) setLoading(false); } };
  };
  const first = useCallback((notice = '') => {
    const run = begin(); publish({ ...EMPTY, notice });                                        // lo anterior se descarta ANTES de preguntar: nunca se presenta como actual
    return loadSourceHistory({ source: JSON.parse(sourceKey) as HistorySource, contextRevision, limit: pageSize, signal: run.signal, fetcher }).then(result => {
      if (!run.current()) return;
      publish(result.kind === 'read' ? { entries: result.response.entries, meta: metaOf(result.response), failure: null, notice } : { ...EMPTY, failure: result.kind, notice });
    }, () => undefined).finally(run.finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, contextRevision, pageSize, fetcher]);
  const more = () => {
    const before = loaded.current, cursor = before.meta?.nextCursor; if (!before.meta || !cursor) return;
    const run = begin();
    void loadSourceHistory({ source: JSON.parse(sourceKey) as HistorySource, contextRevision, limit: pageSize, cursor, signal: run.signal, fetcher }).then(result => {
      if (!run.current()) return;
      if (result.kind === 'read') {
        const next = metaOf(result.response);
        // Otra instantánea (otro corte del diario, otro ámbito, otra copia): lo leído ya no es consistente y se empieza de nuevo.
        if (!sameSnapshot(before.meta!, next)) { void first('El historial cambió mientras se leía; se volvió a consultar desde el principio.'); return; }
        publish({ entries: [...before.entries, ...result.response.entries], meta: next, failure: null, notice: '' });
      } else if (result.kind === 'changed' || result.kind === 'bad-cursor') { void first('El historial cambió mientras se leía; se volvió a consultar desde el principio.'); }
      else if (DROPS.has(result.kind)) publish({ ...EMPTY, failure: result.kind });
      else publish({ ...before, failure: result.kind });
    }, () => undefined).finally(run.finish);
  };
  useEffect(() => { alive.current = true; setOpen(false); void first(); return () => { alive.current = false; generation.current++; controller.current?.abort(); }; }, [first, identityKey]);

  const { entries, meta, failure } = view, failed = failure ? FAILURE_TEXT[failure] : null, complete = !!meta && meta.nextCursor === null && failure === null;
  const headline = headlineOf(entries, complete), tone = failure ? (failure === 'not-registered' ? 'unknown' : 'attention') : 'unknown';
  const kind = source.mode === 'lookup' ? 'consulta por identificador' : 'listado';
  let head: string, detail: string | null = null;
  if (failed) { head = failed.head; detail = failed.detail; }
  else if (!meta) head = 'Consultando el historial local…';
  else if (meta.total === 0) { head = 'Sin recibos locales para esta fuente.'; detail = 'Que no haya recibos no dice nada de lo que tenga el proveedor: aquí solo se guarda lo que se leyó de esta fuente.'; }
  else if (!complete) { head = 'Hay ' + meta.total + (meta.total === 1 ? ' recibo local' : ' recibos locales') + ' de esta fuente; se han cargado ' + entries.length + '.'; detail = 'El último guardado está en una página sin cargar: carga el resto para verlo.'; }
  else head = meta.total + (meta.total === 1 ? ' recibo local' : ' recibos locales') + ' de esta fuente.';
  const when2 = (iso: string) => when(iso);
  return <section className={'srh srh-' + tone} aria-labelledby={titleId} aria-busy={loading} data-state={failure ?? (meta ? (meta.total === 0 ? 'empty' : complete ? 'complete' : 'partial-view') : 'loading')} data-testid="source-history">
    <h3 id={titleId}>Historial de lecturas · {label}</h3>
    <p className="srh-id" data-testid="history-identity">{label} · cuenta {source.accountId} · {source.objectType} ({kind}) · entorno de {environment}</p>
    <p className="srh-notice" data-testid="history-notice">{SOURCE_READING_HISTORY_NOTICE}</p>
    <p className="srh-head" role="status">{head}</p>
    {detail ? <p className="srh-detail">{detail}</p> : null}
    {view.notice ? <p className="srh-detail" role="status" data-testid="history-notice-reread">{view.notice}</p> : null}
    {failure && entries.length > 0 ? <p className="srh-detail srh-warn" role="status" data-testid="history-stale">{FAILURE_TEXT[failure].head} Lo que sigue es lo leído antes y puede estar incompleto.</p> : null}
    {headline.lastSaved ? <dl className="srh-summary" data-testid="history-summary">
      <dt>Último guardado</dt><dd>Recibo {headline.lastSaved.sequence} · guardado {when2(headline.lastSaved.savedAt)} · observado {when2(headline.lastSaved.completedAt)}</dd>
      <dt>Observación más reciente</dt><dd>{headline.sameEntry ? 'Es el mismo recibo (' + headline.lastSaved.sequence + ').' : 'Recibo ' + headline.latestObserved!.sequence + ' · observado ' + when2(headline.latestObserved!.completedAt) + ' (no es el último guardado).'}</dd>
    </dl> : null}
    {meta ? <small className="srh-meta" data-testid="history-provenance">{meta.provenance === 'durable' ? 'Guardado en el almacén local de esta copia.' : 'Guardado solo en memoria: se pierde al reiniciar.'}</small> : null}
    <div className="srh-actions">
      {entries.length > 0 ? <button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar recibos' : 'Historial (' + entries.length + ')'}</button> : null}
      {meta && meta.nextCursor ? <button type="button" className="button secondary" disabled={loading} onClick={more}>Cargar más recibos</button> : null}
      <button type="button" className="button secondary" disabled={loading} onClick={() => void first()}>{failure === 'unavailable' || failure === 'failed' || failure === 'invalid' ? 'Reintentar consulta local' : 'Actualizar historial local'}</button>
    </div>
    {open && entries.length > 0 ? <ol className="srh-list" aria-label="Recibos locales, en orden de guardado" data-testid="history-list">
      {entries.map(entry => { const facts = entryFacts(entry), skipped = entry.skipped.unknownValue + entry.skipped.malformed + entry.skipped.duplicates;
        return <li key={entry.receiptId} data-sequence={entry.sequence} data-coverage={entry.coverage} data-evidence={facts.evidenceKind}>
          <strong>Recibo {entry.sequence} · {facts.coverage}</strong>
          <span>Observado {when2(entry.completedAt)} · guardado {when2(entry.savedAt)}</span>
          <span data-kind="records">{facts.records}</span>
          {facts.cause ? <span data-kind="cause">Causa: {facts.cause}</span> : null}
          <span data-kind="evidence">Intento: {facts.evidence}</span>
          <span data-kind="effort">Páginas {entry.pages} · peticiones {entry.requests}</span>
          {skipped > 0 ? <span data-kind="skipped">Omitidos: {entry.skipped.unknownValue} de valor no reconocido, {entry.skipped.malformed} ilegibles, {entry.skipped.duplicates} repetidos</span> : null}
          {entry.retryAfterSeconds !== null ? <span data-kind="retry">La fuente pidió esperar {entry.retryAfterSeconds} s</span> : null}
        </li>; })}
    </ol> : null}
    <small className="srh-meta">No conectado: este historial no prueba una conexión ni se actualiza solo. «Actualizar» solo consulta lo guardado en esta copia; no lee del proveedor.</small>
  </section>;
}
