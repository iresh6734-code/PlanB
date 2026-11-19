import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { CrmRecord, EntityName } from '../shared/model.js';
import type { WorkspaceSearchResult, WorkspaceSearchHit } from '../shared/workspace-search.js';
import { parseWorkspaceSearchContext, sameWorkspaceSearchContext, type WorkspaceSearchContext, type WorkspaceSearchSource } from '../shared/workspace-search.js';
import { api, ApiError } from './api.js';
import { Spinner } from './components.js';
import './workspace-search.css';

type Source = WorkspaceSearchSource;
type Response = WorkspaceSearchResult & { source: Source };
type SearchProblem = { key: string; message: string; contextConflict?: boolean; selectionConflict?: boolean };
const types = [{ id: 'all', label: 'Todos' }, { id: 'contacts', label: 'Clientes' }, { id: 'companies', label: 'Empresas' }, { id: 'deals', label: 'Oportunidades' }, { id: 'tasks', label: 'Tareas' }] as const;
const failure = (error: unknown) => error instanceof ApiError && error.status === 404 ? 'Esta versión instalada no incluye la búsqueda global. Actualiza Plan B para usarla.' : error instanceof Error ? error.message : 'No se pudo completar la búsqueda.';

export function WorkspaceSearch({ captureId, expectedContext, localRevision, refreshWorkspace, close, openRecord, askInstead }: {
  captureId: string; expectedContext: WorkspaceSearchContext | null; localRevision: number; close: () => void;
  refreshWorkspace?: (signal: AbortSignal) => Promise<unknown>;
  openRecord: (record: CrmRecord, related: CrmRecord[]) => void;
  /** R4 · Lleva lo escrito a la paleta, que lo responde como pregunta («oportunidades abiertas de más de 5000»). */
  askInstead?: (text: string) => void;
}) {
  const [query, setQuery] = useState(''), [entity, setEntity] = useState<string>('all'), [page, setPage] = useState<{baseKey:string;offset:number}|null>(null), [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; response: Response } | null>(null), [error, setError] = useState<SearchProblem | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null), [opening, setOpening] = useState(false), [openError, setOpenError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const input = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null), source = useRef<{ key: string; revision: string } | null>(null);
  const pendingOpen = useRef<AbortController | null>(null), pendingRefresh = useRef<AbortController | null>(null), alive = useRef(true);
  const expected = parseWorkspaceSearchContext(expectedContext);
  const identified = !!expected && expected.captureId === captureId;
  const trimmed = query.trim(), valid = trimmed.length >= 2 && identified;
  const baseKey = JSON.stringify([captureId, expected, localRevision, trimmed, entity]);
  const offset = page?.baseKey === baseKey ? page.offset : 0;
  const setOffset = (value:number|((previous:number)=>number)) => setPage(previous=>({baseKey,offset:typeof value === 'function'?value(previous?.baseKey===baseKey?previous.offset:0):value}));
  const key = JSON.stringify([baseKey, offset, nonce]);
  const current = useRef(key); current.current = key;
  const data = result?.key === key ? result.response : null, problem = error?.key === key ? error : null;
  const needsState = !!refreshWorkspace && problem?.contextConflict === true;
  const busy = valid && (loadingKey === key || !data && !problem);
  useEffect(() => {
    alive.current = true; const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    input.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]') ?? [])].filter(item => !item.closest('[hidden]'));
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => { alive.current = false; pendingOpen.current?.abort(); pendingRefresh.current?.abort(); document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard, true); previous?.focus(); };
  }, []);
  useEffect(()=>{source.current=null;setPage({baseKey,offset:0});},[baseKey]);
  useEffect(() => {
    pendingOpen.current?.abort(); setOpening(false); setOpenError('');
    if (!valid || refreshing || needsState) { setLoadingKey(null); return; }
    const controller = new AbortController(); let live = true;
    setLoadingKey(key);
    const timer = setTimeout(() => {
      const revision = offset && source.current?.key === baseKey ? '&revision=' + source.current.revision : '';
      void api<Response>('/v2/search?q=' + encodeURIComponent(trimmed) + (entity === 'all' ? '' : '&entities=' + entity) + '&offset=' + offset + '&limit=20&contextRevision=' + expected!.contextRevision + revision, { signal: controller.signal }).then(response => {
        if (!live || current.current !== key) return;
        if (!sameWorkspaceSearchContext(expected!, response.source)) throw new Error('La respuesta pertenece a otra copia. Cierra la búsqueda y actualiza el espacio de trabajo.');
        source.current = { key: baseKey, revision: response.source.revision }; setResult({ key, response }); setError(null);
      }).catch(failed => {
        if (live && current.current === key && !controller.signal.aborted) {
          setResult(null);
          setError({ key, message: failure(failed), contextConflict: failed instanceof ApiError && failed.status === 409 });
        }
      }).finally(() => { if (live && current.current === key) setLoadingKey(null); });
    }, 200);
    return () => { live = false; controller.abort(); clearTimeout(timer); };
  }, [key, valid, refreshing, needsState]);
  const choose = async (hit: WorkspaceSearchHit) => {
    if (!data || opening) return;
    const controller = new AbortController(), requestKey = key; pendingOpen.current?.abort(); pendingOpen.current = controller;
    setOpening(true); setOpenError('');
    try {
      const body = await api<{ record: CrmRecord; related: CrmRecord[]; source: Source }>('/v2/search-record?entity=' + hit.entity + '&id=' + encodeURIComponent(hit.id) + '&captureId=' + encodeURIComponent(data.source.captureId) + '&revision=' + data.source.revision, { signal: controller.signal });
      if (!alive.current || controller.signal.aborted || current.current !== requestKey) return;
      if (!sameWorkspaceSearchContext(expected!, body.source) || body.source.revision !== data.source.revision || body.record.entity !== hit.entity || body.record.id !== hit.id) throw new Error('El registro recibido no corresponde a la búsqueda. Actualiza los resultados.');
      openRecord(body.record, body.related);
    } catch (failed) {
      if (!alive.current || controller.signal.aborted || current.current !== requestKey) return;
      if (failed instanceof ApiError && failed.status === 409) {
        source.current = null;
        setResult(null);
        setError({ key: requestKey, message: failure(failed), contextConflict: true, selectionConflict: true });
      } else setOpenError(failure(failed));
    }
    finally { if (alive.current && current.current === requestKey && !controller.signal.aborted) setOpening(false); }
  };
  const refreshResults = () => { source.current = null; setOffset(0); setNonce(value => value + 1); };
  const refresh = async () => {
    if (pendingRefresh.current) return;
    if (!refreshWorkspace || !problem?.contextConflict) { refreshResults(); return; }
    const controller = new AbortController();
    pendingRefresh.current = controller;
    setRefreshing(true);
    try {
      await refreshWorkspace(controller.signal);
      if (!controller.signal.aborted) refreshResults();
    } catch (failed) {
      if (!controller.signal.aborted) setError({ ...problem, key: current.current, message: failure(failed) });
    } finally {
      pendingRefresh.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  };
  const navigateResults = (event: ReactKeyboardEvent<HTMLElement>, fromInput = false) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !data || busy || opening) return;
    const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('.workspace-search-hit:not(:disabled)') ?? [])];
    if (!buttons.length) return;
    let target: HTMLElement | undefined | null;
    if (fromInput) {
      if (event.key === 'ArrowDown') target = buttons[0];
      if (event.key === 'ArrowUp') target = buttons.at(-1);
    } else {
      const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
      if (index < 0) return;
      if (event.key === 'ArrowDown') target = buttons[Math.min(index + 1, buttons.length - 1)];
      if (event.key === 'ArrowUp') target = index ? buttons[index - 1] : input.current;
      if (event.key === 'Home') target = buttons[0];
      if (event.key === 'End') target = buttons.at(-1);
    }
    if (target) { event.preventDefault(); target.focus(); target.scrollIntoView({ block: 'nearest' }); }
  };
  return <div className="workspace-search-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
    <section ref={panel} className="workspace-search" role="dialog" aria-modal="true" aria-labelledby="workspace-search-title">
      <header><div><h2 id="workspace-search-title">Buscar en toda la copia</h2><p>Clientes, empresas, oportunidades y tareas guardados en este ordenador.</p></div><button type="button" className="icon-button" aria-label="Cerrar búsqueda global" onClick={close}><X size={20} /></button></header>
      <label className="workspace-search-input"><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar en toda la copia</span><input ref={input} type="search" maxLength={160} value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} onKeyDown={event => navigateResults(event, true)} placeholder="Nombre, correo, teléfono o ID…" aria-describedby={'workspace-search-help' + (data?.items.length ? ' workspace-search-keyboard-help' : '')} /></label>
      <p id="workspace-search-help" className="helper">Escribe al menos 2 caracteres. Se buscan todos los términos, sin distinguir acentos o mayúsculas. Solo consulta la copia activa.</p>
      {askInstead && query.trim().split(/\s+/).length >= 2 ? <p className="helper workspace-search-ask">¿Es una pregunta, como «tareas vencidas» o «empresas sin teléfono»? <button type="button" className="text-button" onClick={() => askInstead(query.trim())}>Responder como pregunta</button></p> : null}
      {data?.items.length ? <p id="workspace-search-keyboard-help" className="helper workspace-search-keyboard-help">Usa ↑/↓ para recorrerlos; Inicio/Fin en la lista y Enter para abrir.</p> : null}
      <div className="workspace-search-filters"><label>Tipo de registro<select aria-label="Tipo de registro" value={entity} onChange={event => { setEntity(event.target.value); setOffset(0); }}>{types.map(type => <option key={type.id} value={type.id}>{type.label}{data ? ' (' + (type.id === 'all' ? Object.values(data.counts).reduce((a, b) => a + b, 0) : data.counts[type.id]) + ')' : ''}</option>)}</select></label><button type="button" className="button secondary" disabled={!valid || busy || opening || refreshing} onClick={refresh}>Actualizar búsqueda</button></div>
      <div className="workspace-search-results" aria-busy={busy || opening || refreshing}>
        {refreshing ? <Spinner text="Actualizando la copia activa…" /> : !identified ? <p className="error-box" role="alert">Esta versión no permite identificar la copia de la búsqueda. Actualiza Plan B y vuelve a abrir el espacio de trabajo.</p> : !valid ? <p className="muted">Busca un nombre, un dato de contacto o el identificador de un registro.</p> : busy ? <Spinner text="Buscando en la copia local…" /> : problem ? <div className="error-box" role="alert"><p>{problem.message}</p><button type="button" className="text-button" onClick={refresh}>{problem.selectionConflict ? 'Actualizar resultados' : 'Reintentar búsqueda'}</button></div> : data ? <>
          <p className="workspace-search-provenance">{data.source.isTestData ? 'Datos de prueba' : 'Datos reales'} · Portal {data.source.accountId} · Captura {new Date(data.source.capturedAt).toLocaleString('es-ES')}<br />Revisión {data.source.revision.slice(0, 12)} · Los recuentos incluyen todas las coincidencias.</p>
          <p role="status">{data.total ? `${offset + 1}–${Math.min(offset + data.items.length, data.total)} de ${data.total} resultados` : 'No hay resultados para esta búsqueda.'}</p>
          {data.items.length ? <ul aria-label="Resultados de la búsqueda global">{data.items.map(hit => <li key={hit.entity + ':' + hit.id}><button type="button" disabled={opening} className="workspace-search-hit" onKeyDown={event => navigateResults(event)} onClick={() => void choose(hit)}><span className="workspace-search-hit-title"><strong>{hit.label}</strong><span>{types.find(type => type.id === hit.entity)!.label}</span></span><small>ID {hit.id}{hit.matchedId ? ' · Coincide el identificador' : ''}</small>{hit.matches.map(match => <span className="workspace-search-match" key={match.field}><b>{match.label}:</b> {match.preview}{match.truncated ? <em> (vista previa)</em> : null}</span>)}{hit.totalMatchedFields > hit.matches.length ? <small>Y {hit.totalMatchedFields - hit.matches.length} campos más.</small> : null}<span className="workspace-search-open">Abrir registro</span></button></li>)}</ul> : <p className="helper">Prueba con menos términos o cambia el tipo de registro. No se consulta HubSpot.</p>}
          {data.total > 20 ? <nav aria-label="Páginas de búsqueda global"><button type="button" className="button secondary" disabled={!offset || opening} onClick={() => setOffset(value => Math.max(0, value - 20))}>Anterior</button><button type="button" className="button secondary" disabled={!data.hasMore || opening} onClick={() => setOffset(value => value + 20)}>Siguiente</button></nav> : null}
        </> : null}
        {opening ? <Spinner text="Abriendo el registro actual…" /> : null}
        {openError ? <div role="alert" className="error-box"><p>{openError}</p><button type="button" className="text-button" onClick={refresh}>Actualizar resultados</button></div> : null}
      </div>
    </section>
  </div>;
}
