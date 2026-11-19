import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, ChartColumn, ChevronRight, Database, Download, PlugZap, Plus, Search, Sparkles, Unplug, X } from 'lucide-react';
import type { AppState, CrmRecord, EntityName } from '../../shared/model.js';
import { displayValue, recordName } from '../components.js';
import { EmptyState, ErrorState, Skeleton } from '../ui/index.js';
import { downloadCsv, toCsv } from './csv.js';
import { madridDay } from '../task-display.js';
import { closeStatus, dealSignal, dueStatus, euros, stageKind, type DealPulse } from './deal-insights.js';
import { addSavedView, describeView, readSavedViews, sameView, smartViews, writeSavedViews, type SavedView } from './saved-views.js';
import { RECORD_PAGE_SIZE, type BoardRead, type RecordListView } from './useRecordList.js';
import { pagedLabel } from './pager.js';
import { formatRecordSort } from '../../shared/record-order.js';
import { InlineSelect } from './InlineSelect.js';
import { BulkBar } from './BulkBar.js';
import { bulkFields, type BulkItem, type BulkResult } from './bulk-edit.js';
import { PipelineStats } from './lazy-pages.js';
import { ProBadge } from './ProBadge.js';

const singular: Record<EntityName, string> = { contacts: 'Nuevo cliente', companies: 'Nueva empresa', deals: 'Nueva oportunidad', tasks: 'Nueva tarea' };
type Spec = NonNullable<AppState['spec']>;
type Props = {
  state: AppState; spec: Spec; entity: Spec['entities'][number]; entityName: EntityName;
  rows: CrmRecord[]; records: CrmRecord[]; total: number; offset: number; setOffset: (offset: number) => void;
  query: string; setQuery: (query: string) => void; pipeline: string; setPipeline: (pipeline: string) => void;
  selected: CrmRecord | 'new' | null; setSelected: (record: CrmRecord | 'new') => void;
  recordsLoading: boolean; recordsError: string; busy: boolean; date: string;
  /** Volver a pedir la página cuando falla la carga (D3). */ onRetry?: () => void;
  viewCoverage: () => void; toggleServices: () => void;
  /** Cambia la etapa de una oportunidad con la validación y el guardado de la ficha. Devuelve el motivo si no se pudo. */
  moveDeal: (record: CrmRecord, stageId: string) => Promise<string | null>;
  /** Abre una ficha nueva con valores iniciales (p. ej. una oportunidad ya en la etapa de su columna). */
  newWith?: (values: Record<string, string>) => void;
  /** Cambia un campo de lista desde la tabla, con la validación y el guardado de la ficha. */
  saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>;
  /** Cambio en bloque (V3): guarda varios uno a uno y refresca una sola vez. Sin esto, la tabla no ofrece casillas. */
  saveMany?: (items: BulkItem[], onProgress?: (handled: number, total: number) => void, signal?: AbortSignal) => Promise<BulkResult>;
  /** El último guardado aún se puede deshacer (lo decide App, que caduca la opción a los pocos segundos). */
  canUndo?: boolean; onUndo?: () => void;
  /** Con esto, el orden y el filtro rápido los resuelve el servidor sobre todos los registros (V1); sin ello, solo la página. */
  setServerView?: (view: RecordListView) => void;
  /** Recuento por opción del filtro rápido sobre toda la búsqueda, cuando lo da el servidor. */
  facets?: Record<string, number> | null;
  /** Oportunidades de todo el proceso (hasta 1.000) para el tablero; sin ello, el tablero usa la página. */
  board?: BoardRead | null;
  /** Tareas por oportunidad (V5); sin ello no se ofrecen «Sin próximo paso» ni «Paradas». */
  pulse?: Map<string, DealPulse> | null;
};
const CARD_CAP = 40;
const DEAL_NOUN = { one: 'oportunidad', many: 'oportunidades' };
type View = { sort: { key: string; dir: 1 | -1 } | null; pick: string | null; smart: string | null };
// Vista recordada por tipo de registro en este navegador: solo el orden y el filtro rápido, nunca datos.
const readView = (entity: EntityName): View => { try { const value = JSON.parse(localStorage.getItem('planb:view:' + entity) ?? 'null'); return value && typeof value === 'object' ? { sort: value.sort && typeof value.sort.key === 'string' && (value.sort.dir === 1 || value.sort.dir === -1) ? value.sort : null, pick: typeof value.pick === 'string' ? value.pick : null, smart: typeof value.smart === 'string' ? value.smart : null } : { sort: null, pick: null, smart: null }; } catch { return { sort: null, pick: null, smart: null }; } };
const writeView = (entity: EntityName, view: View) => { try { localStorage.setItem('planb:view:' + entity, JSON.stringify(view)); } catch { /* sin almacenamiento: la vista no se recuerda */ } };

/** Clientes, Empresas, Oportunidades y Tareas: cabecera-barra, tabla ordenable o tablero por etapas, y barra de estado.
 *  Con `setServerView`, el orden y el filtro rápido llegan a todos los registros; las vistas inteligentes miran la página. */
export function RecordsPage({ state, spec, entity, entityName, rows, records, total, offset, setOffset, query, setQuery, pipeline, setPipeline, selected, setSelected, recordsLoading, recordsError, onRetry, busy, date, viewCoverage, toggleServices, moveDeal, saveField, saveMany, newWith, canUndo = false, onUndo, setServerView, facets, board, pulse = null }: Props) {
  const server = !!setServerView;
  // Tablero con todo el proceso (V2): en cuanto llega la primera página sustituye a la página de la lista; si falla, se vuelve a ella.
  const live = entityName === 'deals' && board && !board.error && (board.scanned > 0 || !board.loading) ? board : null, boardOn = !!live;
  const loaded = live ? live.records : rows;
  const partial = live ? !live.complete && live.scanned < live.total : total > rows.length;
  const lookup = useMemo(() => live ? [...records, ...live.related, ...live.records] : records, [live, records]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(() => readView(entityName).sort);
  // Al cambiar de tipo de registro se recupera la vista recordada de ese tipo (la página no se desmonta).
  useEffect(() => { const view = readView(entityName); setSort(view.sort); setPick(view.pick); setSmart(view.smart); setSaved(readSavedViews(entityName)); setNaming(null); setMoveNote(null); setExpanded(new Set()); }, [entityName]);
  // Filtro rápido por la primera columna de tipo lista (p. ej. el estado de las tareas). Filtra los registros ya cargados en la página.
  const [pick, setPick] = useState<string | null>(() => readView(entityName).pick);
  // Vista inteligente activa y vistas guardadas por la persona (en este navegador).
  const [smart, setSmart] = useState<string | null>(() => readView(entityName).smart);
  const [saved, setSaved] = useState<SavedView[]>(() => readSavedViews(entityName)), [naming, setNaming] = useState<string | null>(null);
  useEffect(() => { writeView(entityName, { sort, pick, smart }); }, [entityName, sort, pick, smart]);
  const [editing, setEditing] = useState<string | null>(null);
  // F1: la analítica del proceso solo se carga (y lee el diario) cuando se abre.
  const [analytics, setAnalytics] = useState(false);
  const change = async (record: CrmRecord, key: string, value: string) => {
    const field = entity.fields.find(item => item.key === key); if (!field || String(record.values[key] ?? '') === value) return;
    setEditing(record.id + ':' + key); setMoveNote(null);
    const problem = await saveField(record, key, value || null);
    setEditing(null);
    const label = field.options.find(option => option.id === value)?.label ?? 'vacío';
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '»: ' + field.label.toLowerCase() + ' no cambió. ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '»: ' + field.label.toLowerCase() + ' → ' + label + '. Guardado en tu copia local.', undo: true });
  };
  const pickField = entityName === 'deals' ? undefined : entity.columns.map(key => entity.fields.find(field => field.key === key)).find(field => field?.type === 'enum' && field.options.length > 1 && field.options.length <= 6);
  // Lleva el orden y el filtro rápido al servidor. Solo campos de este tipo de registro: justo al cambiar de tipo, el
  // estado aún puede traer la vista del anterior durante un render.
  const serverSort = sort && entity.fields.some(field => field.key === sort.key) ? formatRecordSort(sort) : '';
  const serverPick = pick && pickField?.options.some(option => option.id === pick) ? pick : null;
  useEffect(() => { setServerView?.({ sort: serverSort, filters: serverPick && pickField ? { [pickField.key]: serverPick } : {}, facet: pickField?.key ?? '' }); }, [setServerView, serverSort, serverPick, pickField?.key]);
  const choosePick = (next: string | null) => { setPick(next); if (server) setOffset(0); };
  // Tablero: arrastrar entre etapas o Alt + flechas con la tarjeta enfocada.
  const [dragId, setDragId] = useState<string | null>(null), [overStage, setOverStage] = useState<string | null>(null), [moving, setMoving] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<{ tone: 'ok' | 'error'; text: string; undo?: boolean } | null>(null);
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const stages = spec.stages.filter(stage => !pipeline || !stage.pipelineId || stage.pipelineId === pipeline);
  const move = async (record: CrmRecord, stageId: string) => {
    if (moving || record.values[stageKey] === stageId) return;
    const target = stages.find(stage => stage.id === stageId); if (!target) return;
    setMoving(record.id); setMoveNote(null);
    const problem = await moveDeal(record, stageId);
    setMoving(null);
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '» no se movió a ' + target.label + ': ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '» pasó a ' + target.label + '. Guardado en tu copia local.', undo: true });
  };
  const today = madridDay(new Date());
  // Una fecha pasada solo se resalta si la tarea no parece cerrada. «Cerrada» se deduce del NOMBRE de la opción de estado
  // (completada, hecha, cerrada…): es una ayuda visual, no un dato.
  const statusField = entityName === 'tasks' ? entity.fields.find(field => field.key === (spec.roles?.taskStatus ?? 'status')) : undefined;
  const looksDone = (record: CrmRecord) => { const option = statusField?.options.find(item => item.id === String(record.values[statusField.key] ?? '')); return !!option && /complet|hech|cerrad|termin|finaliz|done|closed/i.test(option.label + ' ' + option.id); };
  // «Pasar a mañana»: en una tarea abierta y vencida, mueve su fecha límite a mañana con el guardado de la ficha.
  const dueKey = spec.roles?.dueDate ?? 'due_date';
  const tomorrow = madridDay(new Date(Date.now() + 86_400_000));
  const postpone = async (record: CrmRecord) => {
    setEditing(record.id + ':' + dueKey); setMoveNote(null);
    const problem = await saveField(record, dueKey, tomorrow);
    setEditing(null);
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '» no cambió de fecha. ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '» pasa a mañana. Guardado en tu copia local.', undo: true });
  };
  // Tareas abiertas: a la fecha límite se le añade cuándo vence en palabras («hace 3 días», «hoy», «mañana», «en 5 días»).
  const dueHint = (record: CrmRecord, value: unknown) => { if (looksDone(record)) return null; const status = dueStatus(value, today, false); if (status.tone !== 'late' && status.tone !== 'soon') return null; return { tone: status.tone, text: status.label.replace(/ · .*$/, '').replace(/^Venció /, '').replace(/^Vence /, '') }; };
  const isPast = (record: CrmRecord, value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && value.slice(0, 10) < today && !looksDone(record);
  const smarts = smartViews(entityName, entity, spec).filter(view => view.needs !== 'pulse' || pulse), activeSmart = smarts.find(view => view.id === smart);
  const smartContext = { today, looksDone, pulse };
  const filtered = activeSmart ? loaded.filter(record => activeSmart.test(record, smartContext)) : loaded;
  const sortField = sort && !server ? entity.fields.find(field => field.key === sort.key) : undefined;
  const shown = sort && sortField ? [...filtered].sort((a, b) => {
    const x = a.values[sortField.key], y = b.values[sortField.key], nx = Number(x), ny = Number(y);
    const numeric = x != null && y != null && x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny);
    return sort.dir * (numeric ? nx - ny : displayValue(x, sortField, records, spec).localeCompare(displayValue(y, sortField, records, spec), 'es', { numeric: true, sensitivity: 'base' }));
  }) : filtered;
  const visible = pick && pickField && !server ? shown.filter(record => String(record.values[pickField.key] ?? '') === pick) : shown;
  // Selección para el cambio en bloque: solo cuenta lo que sigue a la vista; cambiar de página, búsqueda o filtro la vacía.
  const bulkOn = !!saveMany && entityName !== 'deals' && bulkFields(entity).length > 0;
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => { setMarked(new Set()); setAnchor(null); }, [entityName, offset, query, pick, smart]);
  const picked = bulkOn ? visible.filter(record => marked.has(record.id)) : [];
  const allMarked = picked.length > 0 && picked.length === visible.length;
  const markAll = () => { setMarked(allMarked ? new Set() : new Set(visible.map(record => record.id))); setAnchor(null); };
  // Mayús + clic marca o desmarca el tramo desde la última casilla tocada.
  const mark = (index: number, range: boolean) => {
    const id = visible[index].id, on = !marked.has(id);
    setMarked(current => { const next = new Set(current); const from = range && anchor !== null ? Math.min(anchor, index) : index, to = range && anchor !== null ? Math.max(anchor, index) : index; for (const record of visible.slice(from, to + 1)) { if (on) next.add(record.id); else next.delete(record.id); } return next; });
    setAnchor(index);
  };
  const freshRecord = (id: string) => loaded.find(record => record.id === id);
  // Exportar la vista: lo que se ve en la tabla (búsqueda, filtro y orden aplicados), con los valores tal como se muestran.
  const exportView = () => {
    const columns = entity.columns.map(key => entity.fields.find(field => field.key === key)!).filter(Boolean);
    const list = entityName === 'deals' ? filtered : visible;
    const text = toCsv(columns.map(field => field.label), list.map(record => columns.map(field => field.key === entity.displayField ? recordName(record, spec) : displayValue(record.values[field.key], field, lookup, spec))));
    downloadCsv(entity.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.csv', text);
    if (partial) setMoveNote({ tone: 'ok', text: 'CSV con ' + list.length + ' ' + (list.length === 1 ? 'registro' : 'registros') + (boardOn ? ' de las ' + loaded.length + ' cargadas' : ' de esta página') + ' (' + total + ' en total). Para la copia completa, usa Exportar.' });
  };
  const current = { query, pick, sort, smart };
  const isDefault = !query.trim() && !pick && !sort && !smart;
  const labels = { pick: (id: string) => pickField?.options.find(option => option.id === id)?.label, sort: (key: string) => entity.fields.find(field => field.key === key)?.label, smart: (id: string) => smarts.find(view => view.id === id)?.label };
  const saveView = (name: string) => {
    const next = addSavedView(saved, name, current, Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    if (next === saved) { setNaming(null); return; }
    if (!writeSavedViews(entityName, next)) {
      setMoveNote({ tone: 'error', text: 'No se pudo guardar esta vista en el navegador.' });
      return;
    }
    setSaved(next);
    setNaming(null);
    setMoveNote({ tone: 'ok', text: 'Vista «' + next[0].name + '» guardada en este navegador.' });
  };
  const applyView = (view: SavedView) => { setQuery(view.query); setOffset(0); setPick(view.pick); setSort(view.sort); setSmart(smarts.some(item => item.id === view.smart) ? view.smart : null); setMoveNote(null); };
  const removeView = (view: SavedView) => {
    const next = saved.filter(item => item.id !== view.id);
    if (!writeSavedViews(entityName, next)) {
      setMoveNote({ tone: 'error', text: 'No se pudo borrar esta vista del navegador.' });
      return;
    }
    setSaved(next);
    setMoveNote({ tone: 'ok', text: 'Vista «' + view.name + '» borrada.' });
  };
  // Lo que filtra en el navegador (vista inteligente, o el filtro rápido sin servidor) solo ve la página cargada: se dice cuando hay más.
  const pageOnly = (!!activeSmart || (!!pick && !!pickField && !server)) && partial;
  const pickActive = !!pick && !!pickField, filterActive = pickActive || !!activeSmart;
  const pickCount = (id: string) => server ? facets?.[id] : rows.filter(record => String(record.values[pickField?.key ?? ''] ?? '') === id).length;
  const dealsSum = filtered.reduce((sum, record) => sum + (Number(record.values[amountKey]) || 0), 0);
  // Tarjeta: fecha prevista de cierre (si el modelo la tiene) y las dos primeras referencias (empresa · cliente).
  const closeField = entityName === 'deals' ? entity.fields.find(field => field.type === 'date' && /cierre|close/i.test(field.key + ' ' + field.label)) : undefined;
  const refFields = entity.fields.filter(field => field.type === 'reference').slice(0, 2);
  return <section className="workspace">
    <header className="page-header gx-records-head"><div><h1>{entity.label}</h1></div>
  <div className="table-toolbar"><label className="search-field"><Search size={15} /><input aria-label={'Buscar ' + entity.label.toLowerCase()} placeholder={'Buscar ' + entity.label.toLowerCase() + '…'} value={query} onChange={event => {setQuery(event.target.value);setOffset(0);}} /></label>
      {entityName==='deals'&&state.snapshot?.pipelines?.length?<select aria-label="Proceso comercial" value={pipeline} onChange={e=>{setPipeline(e.target.value);setOffset(0);}}><option value="">Todos los procesos</option>{state.snapshot.pipelines.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>:null}
  {pickField && (rows.length || (server && pick)) ? <div className="gx-picks" role="group" aria-label={'Filtrar por ' + pickField.label.toLowerCase()}><button type="button" aria-pressed={pick === null} onClick={() => choosePick(null)}>Todo</button>{pickField.options.map(option => { const count = pickCount(option.id); return <button key={option.id} type="button" aria-pressed={pick === option.id} onClick={() => choosePick(pick === option.id ? null : option.id)}>{option.label}{count === undefined ? null : <span>{count}</span>}</button>; })}</div> : null}
          <span className="muted">{pageOnly ? (entityName === 'deals' ? filtered : visible).length + ' de ' + loaded.length + ' cargados (' + total + ' en total)' : server && pickActive && !activeSmart ? total + ' ' + entity.label.toLowerCase() + ' con este filtro' : <>{filterActive ? (entityName === 'deals' ? filtered : visible).length + ' de ' : ''}{total} {entity.label.toLowerCase()}</>}</span>{entityName==='deals'&&loaded.length?<span className="muted gx-total" title={partial ? 'Suma de las ' + loaded.length + ' oportunidades cargadas' : 'Suma de todo el proceso con la búsqueda y la vista aplicadas'}><strong>{euros(dealsSum)}</strong> {partial ? 'en lo cargado' : 'en esta vista'}</span>:null}</div>
  <div className="gx-head-actions">{entityName === 'deals' ? <button type="button" className="button secondary" aria-pressed={analytics} aria-controls={analytics ? 'gx-stats-panel' : undefined} title="Tasa de cierre, ciclo y conversión por etapa con tu copia local" onClick={() => setAnalytics(value => !value)}><ChartColumn size={15} />Analítica<ProBadge feature="pipeline-analytics" decorative /></button> : null}<button type="button" className="button secondary" disabled={recordsLoading || !loaded.length} title={partial ? 'Exporta los ' + loaded.length + ' registros cargados, con la búsqueda y el filtro aplicados' : 'Exporta lo que ves, con la búsqueda y el filtro aplicados'} onClick={exportView}><Download size={15} />CSV</button>
    <button className="button primary" onClick={() => setSelected('new')}><Plus size={16} />{singular[entityName]}</button></div></header>
    {entityName === 'deals' && analytics ? <div id="gx-stats-panel"><PipelineStats spec={spec} revision={(state.snapshot?.capturedAt ?? '') + ':' + (state.changes ?? 0)} /></div> : null}
    {smarts.length || saved.length || !isDefault ? <div className="gx-views" role="group" aria-label="Vistas">
      {smarts.map(view => { const count = loaded.filter(record => view.test(record, smartContext)).length; return <button key={view.id} type="button" className="gx-view" data-kind="smart" aria-pressed={smart === view.id} title={view.hint + (partial ? ' · en los registros cargados' : '')} onClick={() => setSmart(smart === view.id ? null : view.id)}><Sparkles size={13} aria-hidden="true" />{view.label}<span>{count}</span></button>; })}
      {saved.map(view => <span key={view.id} className="gx-view-saved"><button type="button" className="gx-view" data-kind="saved" aria-pressed={sameView(view, current)} title={describeView(view, labels)} onClick={() => applyView(view)}><Bookmark size={13} aria-hidden="true" />{view.name}</button><button type="button" className="gx-view-remove" aria-label={'Borrar la vista «' + view.name + '»'} title="Borrar esta vista" onClick={() => removeView(view)}><X size={12} aria-hidden="true" /></button></span>)}
      {naming !== null ? <form className="gx-view-form" onSubmit={event => { event.preventDefault(); saveView(naming); }}>
        <input autoFocus aria-label="Nombre de la vista" placeholder="Nombre de la vista" maxLength={40} value={naming} onChange={event => setNaming(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setNaming(null); } }} />
        <button type="submit" className="button primary" disabled={!naming.trim()}>Guardar</button><button type="button" className="button secondary" onClick={() => setNaming(null)}>Cancelar</button>
        <small className="muted">{describeView(current, labels)}</small></form>
      : <button type="button" className="gx-view-add" disabled={isDefault} title={isDefault ? 'Busca, filtra u ordena y guárdalo con un nombre' : 'Guardar ' + describeView(current, labels)} onClick={() => setNaming('')}><Plus size={13} aria-hidden="true" />Guardar vista</button>}
      {pageOnly ? <span className="gx-views-note">Filtra los {loaded.length} registros cargados; la búsqueda llega a todos.</span> : null}
    </div> : null}
    {moveNote ? <p className="gx-move-note" data-tone={moveNote.tone} role={moveNote.tone === 'error' ? 'alert' : 'status'}>{moveNote.text}{moveNote.undo && canUndo && onUndo ? <button type="button" className="gx-move-undo" onClick={() => { setMoveNote(null); onUndo(); }}>Deshacer</button> : null}<button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={() => setMoveNote(null)}>×</button></p> : null}
    {entityName === 'deals' && board?.error ? <p className="gx-board-note" data-tone="error" role="status">No se pudo leer todo el proceso; el tablero muestra las {rows.length} oportunidades de esta página.</p>
      : live && (live.loading || partial) ? <p className="gx-board-note" role="status">{pagedLabel(live, live.loading, DEAL_NOUN)}{!live.loading && partial ? '. Busca o elige un proceso para ver el resto.' : ''}</p> : null}
    {entityName === 'deals' ? <div className="kanban" aria-label="Tablero de oportunidades" aria-busy={live?.loading ? 'true' : undefined}>{stages.map((stage, stageIndex) => {
      const deals = filtered.filter(r => r.values[stageKey] === stage.id);
      const open = expanded.has(stage.id), cards = open ? deals : deals.slice(0, CARD_CAP);
      const kind = stageKind(stage), stageSum = deals.reduce((sum, record) => sum + (Number(record.values[amountKey]) || 0), 0);
      return <section className="kanban-column" key={stage.id} data-kind={kind} data-empty={deals.length ? undefined : 'true'} style={{ '--stage': stage.color } as Record<string, string>} data-over={overStage === stage.id ? 'true' : undefined}
              onDragOver={event => { if (dragId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (overStage !== stage.id) setOverStage(stage.id); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(current => current === stage.id ? null : current); }}
              onDrop={event => { event.preventDefault(); const record = filtered.find(item => item.id === dragId); setDragId(null); setOverStage(null); if (record) void move(record, stage.id); }}><h2><span className="dot" style={{ background: stage.color }} />{stage.label}<small>{deals.length}</small>{newWith && kind === 'open' ? <button type="button" className="gx-col-add" aria-label={'Nueva oportunidad en ' + stage.label} title={'Nueva oportunidad en ' + stage.label} onClick={() => newWith({ [stageKey]: stage.id, ...(stage.pipelineId ? { pipeline: stage.pipelineId } : {}) })}><Plus size={14} aria-hidden="true" /></button> : null}</h2>
        {deals.length ? <p className="gx-sum" title="Suma de los importes de esta etapa en la vista actual">{euros(stageSum)}{dealsSum > 0 && kind === 'open' ? <span className="gx-share" aria-hidden="true"><i style={{ width: Math.max(4, Math.round(stageSum / dealsSum * 100)) + '%' }} /></span> : null}</p> : null}
        {cards.map(record => <button key={record.id} className="deal-card" draggable={!moving} data-dragging={dragId === record.id ? 'true' : undefined} data-moving={moving === record.id ? 'true' : undefined} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
              title="Arrastra a otra etapa, o Alt + flechas para moverla"
              onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', record.id); setDragId(record.id); }}
              onDragEnd={() => { setDragId(null); setOverStage(null); }}
              onKeyDown={event => { if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { const target = stages[stageIndex + (event.key === 'ArrowRight' ? 1 : -1)]; if (target) { event.preventDefault(); void move(record, target.id); } } }}
              onClick={() => setSelected(record)}><strong>{recordName(record, spec)}</strong>
          <span>{euros(record.values[amountKey])}</span>
          <small>{refFields.map(f => displayValue(record.values[f.key], f, lookup, spec)).filter(text => text && text !== '—').join(' · ') || 'Sin empresa ni cliente'}</small>
          {closeField && kind === 'open' ? (() => { const status = closeStatus(record.values[closeField.key], today, kind); return <em className="deal-close" data-tone={status.tone}>{status.label}</em>; })() : null}
          {pulse && kind === 'open' ? (() => { const signal = dealSignal(pulse.get(record.id), today); return signal ? <em className="deal-pulse" data-tone={signal.noNext ? 'warn' : 'late'} title={signal.noNext ? 'Ninguna tarea pendiente enlazada a esta oportunidad' : 'Su tarea más reciente es de hace ' + signal.idleDays + ' días'}>{signal.label}</em> : null; })() : null}<span className="card-edit">Abrir oportunidad <ArrowRight size={14} /></span></button>)}
        {deals.length > CARD_CAP ? <button type="button" className="gx-col-more" aria-expanded={open} onClick={() => setExpanded(current => { const next = new Set(current); if (open) next.delete(stage.id); else next.add(stage.id); return next; })}>{open ? 'Ver menos' : 'Ver ' + (deals.length - CARD_CAP).toLocaleString('es-ES') + ' más'}</button> : null}
        {!deals.length ? <p className="column-empty">Sin oportunidades</p> : null}</section>;
    })}</div>
    : <div className="table-container"><table><thead><tr>{entity.columns.map((key, index) => { const sorter = <button type="button" className="gx-sort" title={server?'Ordenar todos los registros por esta columna':total>rows.length?'Ordena los '+rows.length+' registros de esta página':'Ordenar por esta columna'} onClick={()=>{setSort(current=>current?.key===key?(current.dir===1?{key,dir:-1}:null):{key,dir:1});if(server)setOffset(0);}}>{entity.fields.find(f => f.key === key)!.label}</button>;
      return <th key={key} aria-sort={sort?.key===key?(sort.dir===1?'ascending':'descending'):'none'}>{index === 0 && bulkOn ? <span className="gx-pick-cell"><input type="checkbox" className="gx-pick" aria-label={allMarked ? 'Desmarcar todos' : 'Marcar los ' + visible.length + ' de la vista'} title={allMarked ? 'Desmarcar todos' : 'Marcar todos los de la vista para cambiarlos a la vez'} disabled={!visible.length} checked={allMarked} ref={node => { if (node) node.indeterminate = picked.length > 0 && !allMarked; }} onChange={markAll} />{sorter}</span> : sorter}</th>; })}<th><span className="sr-only">Editar</span></th></tr></thead>
  <tbody>{visible.map((record, rowIndex) => <tr key={record.id} className={(selected !== 'new' && selected?.id === record.id ? 'selected-row' : '') + (bulkOn && marked.has(record.id) ? ' marked-row' : '')}>
        {entity.columns.map((key, index) => { const field = entity.fields.find(f => f.key === key)!; const value = displayValue(record.values[key], field, records, spec);
          const link = <button className="record-link" onClick={() => setSelected(record)}>
            {entityName === 'contacts' ? <span className="avatar">{String(record.values.firstname || '?')[0]}{String(record.values.lastname || '')[0]}</span> : null}
            {entityName === 'contacts' && key === entity.displayField ? recordName(record, spec) : value}</button>;
          return <td key={key} data-label={field.label}>{index === 0 ? (bulkOn ? <span className="gx-pick-cell"><input type="checkbox" className="gx-pick" aria-label={'Marcar ' + recordName(record, spec)} title="Marcar para cambiar varios a la vez (Mayús + clic marca un tramo)" checked={marked.has(record.id)} onChange={event => mark(rowIndex, (event.nativeEvent as MouseEvent).shiftKey === true)} />{link}</span> : link)
            : field.type === 'enum' && !field.readOnly && field.options.length ? <InlineSelect className="gx-inline" aria-label={'Cambiar ' + field.label.toLowerCase() + ' de ' + recordName(record, spec)} title={'Cambiar ' + field.label.toLowerCase() + ' (con el teclado, confirma con Intro)'} value={String(record.values[key] ?? '')} disabled={editing !== null} data-saving={editing === record.id + ':' + key ? 'true' : undefined} onCommit={next => void change(record, key, next)}>
                {field.required ? null : <option value="">—</option>}{!field.options.some(option => option.id === String(record.values[key] ?? '')) && record.values[key] ? <option value={String(record.values[key])}>{value}</option> : null}{field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</InlineSelect>
            : <span className={field.type === 'enum' ? 'enum-label' : field.type === 'date' && isPast(record, record.values[key]) ? 'gx-past' : ''} title={field.type === 'date' && isPast(record, record.values[key]) ? 'Fecha anterior a hoy' : undefined}>{value}</span>}{entityName === 'tasks' && key === dueKey && field.type === 'date' ? (() => { const hint = dueHint(record, record.values[key]); return hint ? <small className="gx-due-rel" data-tone={hint.tone}>{hint.text}</small> : null; })() : null}{entityName === 'tasks' && key === dueKey && field.type === 'date' && !field.readOnly && isPast(record, record.values[key]) ? <button type="button" className="gx-postpone" disabled={editing !== null} aria-label={'Pasar «' + recordName(record, spec) + '» a mañana'} onClick={() => void postpone(record)}>Mañana</button> : null}</td>; })}
        <td className="gx-row-open"><button className="icon-button" aria-label={'Editar ' + recordName(record, spec)} onClick={() => setSelected(record)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table>
      {recordsLoading?<Skeleton rows={8} label="Cargando registros…" />:recordsError?<ErrorState title="No se pudieron cargar los registros" onAction={onRetry}>Tus datos siguen en este ordenador. {onRetry?'Vuelve a intentarlo; si se repite, comprueba que Plan B sigue abierto.':'Vuelve a seleccionar la sección para intentarlo de nuevo.'}</ErrorState>:!visible.length && filterActive && (rows.length || (server && pickActive)) ? <EmptyState icon={<Search size={22} />} title="Ningún registro con este filtro" action={<button type="button" className="button secondary" onClick={() => { choosePick(null); setSmart(null); }}>Quitar filtros</button>}>{pageOnly ? 'El filtro mira los ' + rows.length + ' registros cargados; prueba en la página siguiente o busca por nombre.' : server && !rows.length ? 'Ningún registro cumple el filtro elegido' + (query ? ' con esta búsqueda.' : '.') : 'Los ' + rows.length + ' registros de la lista no cumplen el filtro elegido.'}</EmptyState>:!visible.length ? <EmptyState icon={<Search size={22} />} title={query ? 'Sin resultados' : 'Todavía no hay registros'} action={query ? <button type="button" className="button secondary" onClick={() => { setQuery(''); setOffset(0); }}>Quitar la búsqueda</button> : <button type="button" className="button primary" onClick={() => setSelected('new')}><Plus size={16} />{singular[entityName]}</button>}>{query ? 'Prueba con otro nombre, correo o empresa.' : 'Crea el primer registro para empezar.'}</EmptyState> : null}
    </div>}
    {bulkOn && saveMany ? <BulkBar key={entityName} spec={spec} entity={entity} picked={picked} fresh={freshRecord} reloading={recordsLoading} saveMany={saveMany} keep={ids => { setMarked(new Set(ids)); setAnchor(null); }} /> : null}
    <footer className="gx-statusbar"><div className="status-strip"><span className={'status-label ' + (state.disconnected ? 'independent' : '')}><span className="dot" />{state.disconnected ? 'Modo independiente' : 'Copia local activa'}</span>
  <span className="copy-date">Última copia · {date}</span><button className="text-button" onClick={viewCoverage}>Ver cobertura<ChevronRight size={14} /></button>
      {!state.runtime ? <button className="text-button disconnect" disabled={busy} onClick={toggleServices}>
        {state.disconnected ? <PlugZap size={14} /> : <Unplug size={14} />}{state.disconnected ? 'Habilitar servicios' : 'Desconectar servicios'}</button> : null}</div>
      {state.generation?.provider === 'demo' ? <p className="demo-caption" title="Especificación de ensayo · campos y reglas de la captura · sin generación por IA">Especificación de ensayo · campos y reglas de la captura · sin generación por IA</p> : null}
  <div className="workspace-footer"><Database size={13} />Guardado en este ordenador<span>{state.changes} {state.changes===1?'cambio local':'cambios locales'}</span></div>
  {live ? <div className="pagination"><span>{pagedLabel(live, live.loading, DEAL_NOUN)}</span></div> : <div className="pagination"><span>{recordsLoading?'Cargando…':<>{total?offset+1:0}–{Math.min(offset+RECORD_PAGE_SIZE,total)} de {total}</>}</span><button className="button secondary" disabled={recordsLoading||offset===0} onClick={()=>setOffset(Math.max(0,offset-RECORD_PAGE_SIZE))}>Anterior</button><button className="button secondary" disabled={recordsLoading||offset+RECORD_PAGE_SIZE>=total} onClick={()=>setOffset(offset+RECORD_PAGE_SIZE)}>Siguiente</button></div>}</footer>
  </section>;
}
