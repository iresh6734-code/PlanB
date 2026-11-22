import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import { IntegrationLogo } from './IntegrationLogo.js';
import { HubspotReadCheck } from './HubspotReadCheck.js';
import { issueLabels, parseCatalog, parseContinuity, projectIntegrations, type IntegrationRow, type SourceName, type SourceState } from '../shared/local-integrations.js';
import './local-integrations.css';

const TIMEOUT_MS = 15_000;
interface Loaded<T> extends SourceState<T> { reload: () => void; }
// Cada fuente tiene su propia petición, cancelación y secuencia: un fallo o una respuesta tardía de una
// no toca los datos válidos de otra. Un reintento fallido conserva el último dato recibido.
function useSource<T>(path: string, parse: (raw: unknown) => T | null): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; failed: boolean; loading: boolean }>({ data: null, failed: false, loading: true });
  const alive = useRef(true), sequence = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    controller.current?.abort();
    const abort = new AbortController(), current = ++sequence.current;
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    setState(previous => ({ ...previous, loading: true }));
    api<unknown>(path, { signal: abort.signal }).then(raw => {
      if (!alive.current || current !== sequence.current) return;
      const data = parse(raw);
      setState(previous => data === null ? { data: previous.data, failed: true, loading: false } : { data, failed: false, loading: false });
    }, () => {
      if (!alive.current || current !== sequence.current) return;
      setState(previous => ({ data: previous.data, failed: true, loading: false }));
    }).finally(() => clearTimeout(timer));
  }, [path, parse]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; sequence.current++; controller.current?.abort(); }; }, [load]);
  return { ...state, reload: load };
}

function Row({ item, onConnect, onRetry }: { item: IntegrationRow; onConnect: () => void; onRetry: (source: SourceName) => void }) {
  const headingId = 'lint-row-' + item.id, factsId = headingId + '-facts';
  return <li className="lint-row" data-state={item.state} aria-labelledby={headingId}>
    <div className="lint-who"><IntegrationLogo id={item.id} /><div><h4 id={headingId}>{item.label}</h4><p>{item.summary}</p></div></div>
    <div className="lint-status">
      <span className={'lint-badge lint-' + item.tone}>{item.stateLabel}</span>
      {item.facts.length ? <ul id={factsId} className="lint-facts">{item.facts.map(fact => <li key={fact}>{fact}</li>)}</ul> : null}
    </div>
    <div className="lint-next">
      {item.next ? <p><strong>Siguiente paso.</strong> {item.next}</p> : null}
      {item.action?.kind === 'callback' ? <button type="button" className="button primary" onClick={onConnect}>{item.action.label}</button> : null}
      {item.action?.kind === 'link' ? <a className="button secondary" href={item.action.href} target="_blank" rel="noopener noreferrer">{item.action.label} <ArrowRight size={14} aria-hidden="true" /><span className="lint-sr"> (se abre en una pestaña nueva)</span></a> : null}
      {item.retry ? <button type="button" className="button secondary" onClick={() => onRetry(item.retry!)}><RefreshCw size={14} aria-hidden="true" />Reintentar</button> : null}
    </div>
  </li>;
}

export function LocalIntegrations({ onConnectHubspot }: { onConnectHubspot: () => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const continuity = useSource('/v2/continuity', parseContinuity), catalog = useSource('/v4/integrations', parseCatalog);
  const view = projectIntegrations({ continuity, catalog });
  const reload: Record<SourceName, () => void> = { continuity: continuity.reload, catalog: catalog.reload };
  const busy = continuity.loading || catalog.loading;
  const refresh = () => { continuity.reload(); catalog.reload(); setReloadKey(value => value + 1); };
  return <section className="lint" aria-labelledby="lint-title" aria-busy={busy}>
    <header className="page-header"><div><h1 id="lint-title">Integraciones</h1><p className="page-subtitle">Qué está conectado, qué falta y el siguiente paso en cada herramienta.</p></div>
      <button type="button" className="button secondary" onClick={refresh}><RefreshCw size={14} aria-hidden="true" />Actualizar estado</button></header>
    <p className="lint-scope">Al abrir o actualizar esta pantalla se consulta el estado guardado en Plan B. La lectura de HubSpot se comprueba cuando autorizas expresamente las cinco solicitudes.</p>
    {view.stale.length ? <div className="lint-alert" role="alert">{view.stale.map(notice => <p key={notice.source}>{notice.message} <button type="button" className="text-button" onClick={reload[notice.source]}>Reintentar</button></p>)}</div> : null}

    <h2 className="lint-h2">Conexiones</h2>
    <div className="lint-space" role="group" aria-label="Espacio local">
      <h3>Espacio local</h3>
      {view.space.status === 'loading' ? <p role="status" className="lint-muted ui-loading">Leyendo el estado de esta instalación…</p> : null}
      {view.space.status === 'error' ? <p className="lint-muted" role="alert">No se pudo leer el estado de esta instalación. <button type="button" className="text-button" onClick={continuity.reload}>Reintentar</button></p> : null}
      {view.space.status === 'ok' ? <dl>{view.space.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd className={'lint-' + item.tone}>{item.value}</dd></div>)}</dl> : null}
      {view.space.notes.map(note => <p key={note} className="lint-note">{note}</p>)}
    </div>

    <section aria-labelledby="lint-hubspot-h"><h3 id="lint-hubspot-h" className="lint-group">CRM · HubSpot</h3>
      <ul className="lint-rows"><Row item={view.hubspot} onConnect={onConnectHubspot} onRetry={source => reload[source]()} /></ul>
      {continuity.data && !continuity.data.runtime ? <HubspotReadCheck portalId={continuity.data.connection?.accountId ?? null} mode={continuity.data.connection?.mode ?? 'unknown'} reloadKey={reloadKey} /> : null}</section>

    <details className="lint-rehearsal">
      <summary>Ver capacidades de ensayo</summary>
      <div className="lint-rehearsal-body">
        <p className="lint-muted">Catálogo de lo que esta instalación puede hacer en ensayo o lectura. No prueba que haya una cuenta conectada ni que una acción tenga éxito fuera de Plan B: un mensaje o una reunión simulados no se envían.</p>
        {view.rehearsal.status === 'loading' ? <p role="status" className="lint-muted ui-loading">Leyendo el catálogo…</p> : null}
        {view.rehearsal.status === 'error' ? <p className="lint-muted" role="alert">No se pudo leer el catálogo. <button type="button" className="text-button" onClick={catalog.reload}>Reintentar</button></p> : null}
        {view.rehearsal.status === 'empty' ? <p className="lint-muted">El catálogo no declara capacidades.</p> : null}
        {view.rehearsal.refreshFailed ? <p className="lint-muted" role="alert">No se pudo actualizar {issueLabels.catalog}; se muestran los últimos datos. <button type="button" className="text-button" onClick={catalog.reload}>Reintentar</button></p> : null}
        {view.rehearsal.entries.length ? <ul className="lint-caps">{view.rehearsal.entries.map(entry => <li key={entry.id}>
          <div><strong>{entry.label}</strong><span className="lint-badge lint-neutral">{entry.modeLabel}</span></div>
          {entry.description ? <p>{entry.description}</p> : null}
          {entry.actions.length ? <p className="lint-muted">Acciones de ensayo o lectura: {entry.actions.join(' · ')}.</p> : null}
        </li>)}</ul> : null}
      </div>
    </details>
  </section>;
}
