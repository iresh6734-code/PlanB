import { useEffect, useState } from 'react';
import { ArrowRight, Bookmark, ChevronRight, Database, Download, PlugZap, Plus, Search, Sparkles, Unplug, X } from 'lucide-react';
import type { AppState, CrmRecord, EntityName } from '../../shared/model.js';
import { displayValue, recordName } from '../components.js';
import { EmptyState, ErrorState, Skeleton } from '../ui/index.js';
import { downloadCsv, toCsv } from './csv.js';
import { madridDay } from '../task-display.js';
import { closeStatus, euros, stageKind } from './deal-insights.js';
import { addSavedView, describeView, readSavedViews, sameView, smartViews, writeSavedViews, type SavedView } from './saved-views.js';

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
  /** Cambia un campo de lista desde la tabla, con la validación y el guardado de la ficha. */
  saveField: (record: CrmRecord, key: string, value: string | null) => Promise<string | null>;
};
type View = { sort: { key: string; dir: 1 | -1 } | null; pick: string | null; smart: string | null };
// Vista recordada por tipo de registro en este navegador: solo el orden y el filtro rápido, nunca datos.
const readView = (entity: EntityName): View => { try { const value = JSON.parse(localStorage.getItem('planb:view:' + entity) ?? 'null'); return value && typeof value === 'object' ? { sort: value.sort && typeof value.sort.key === 'string' && (value.sort.dir === 1 || value.sort.dir === -1) ? value.sort : null, pick: typeof value.pick === 'string' ? value.pick : null, smart: typeof value.smart === 'string' ? value.smart : null } : { sort: null, pick: null, smart: null }; } catch { return { sort: null, pick: null, smart: null }; } };
const writeView = (entity: EntityName, view: View) => { try { localStorage.setItem('planb:view:' + entity, JSON.stringify(view)); } catch { /* sin almacenamiento: la vista no se recuerda */ } };

/** Clientes, Empresas, Oportunidades y Tareas: cabecera-barra, tabla ordenable o tablero por etapas, y barra de estado.
 *  Solo presenta lo que App ya cargó; el orden reordena los registros de la página, no pide nada nuevo. */
export function RecordsPage({ state, spec, entity, entityName, rows, records, total, offset, setOffset, query, setQuery, pipeline, setPipeline, selected, setSelected, recordsLoading, recordsError, onRetry, busy, date, viewCoverage, toggleServices, moveDeal, saveField }: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(() => readView(entityName).sort);
  // Al cambiar de tipo de registro se recupera la vista recordada de ese tipo (la página no se desmonta).
  useEffect(() => { const view = readView(entityName); setSort(view.sort); setPick(view.pick); setSmart(view.smart); setSaved(readSavedViews(entityName)); setNaming(null); setMoveNote(null); }, [entityName]);
  // Filtro rápido por la primera columna de tipo lista (p. ej. el estado de las tareas). Filtra los registros ya cargados en la página.
  const [pick, setPick] = useState<string | null>(() => readView(entityName).pick);
  // Vista inteligente activa y vistas guardadas por la persona (en este navegador).
  const [smart, setSmart] = useState<string | null>(() => readView(entityName).smart);
  const [saved, setSaved] = useState<SavedView[]>(() => readSavedViews(entityName)), [naming, setNaming] = useState<string | null>(null);
  useEffect(() => { writeView(entityName, { sort, pick, smart }); }, [entityName, sort, pick, smart]);
  const [editing, setEditing] = useState<string | null>(null);
  const change = async (record: CrmRecord, key: string, value: string) => {
    const field = entity.fields.find(item => item.key === key); if (!field || String(record.values[key] ?? '') === value) return;
    setEditing(record.id + ':' + key); setMoveNote(null);
    const problem = await saveField(record, key, value || null);
    setEditing(null);
    const label = field.options.find(option => option.id === value)?.label ?? 'vacío';
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '»: ' + field.label.toLowerCase() + ' no cambió. ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '»: ' + field.label.toLowerCase() + ' → ' + label + '. Guardado en tu copia local.' });
  };
  const pickField = entityName === 'deals' ? undefined : entity.columns.map(key => entity.fields.find(field => field.key === key)).find(field => field?.type === 'enum' && field.options.length > 1 && field.options.length <= 6);
  // Tablero: arrastrar entre etapas o Alt + flechas con la tarjeta enfocada.
  const [dragId, setDragId] = useState<string | null>(null), [overStage, setOverStage] = useState<string | null>(null), [moving, setMoving] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const stages = spec.stages.filter(stage => !pipeline || !stage.pipelineId || stage.pipelineId === pipeline);
  const move = async (record: CrmRecord, stageId: string) => {
    if (moving || record.values[stageKey] === stageId) return;
    const target = stages.find(stage => stage.id === stageId); if (!target) return;
    setMoving(record.id); setMoveNote(null);
    const problem = await moveDeal(record, stageId);
    setMoving(null);
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '» no se movió a ' + target.label + ': ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '» pasó a ' + target.label + '. Guardado en tu copia local.' });
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
    setMoveNote(problem ? { tone: 'error', text: '«' + recordName(record, spec) + '» no cambió de fecha. ' + problem } : { tone: 'ok', text: '«' + recordName(record, spec) + '» pasa a mañana. Guardado en tu copia local.' });
  };
  const isPast = (record: CrmRecord, value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && value.slice(0, 10) < today && !looksDone(record);
  const smarts = smartViews(entityName, entity, spec), activeSmart = smarts.find(view => view.id === smart);
  const smartContext = { today, looksDone };
  const filtered = activeSmart ? rows.filter(record => activeSmart.test(record, smartContext)) : rows;
  const sortField = sort ? entity.fields.find(field => field.key === sort.key) : undefined;
  const shown = sort && sortField ? [...filtered].sort((a, b) => {
    const x = a.values[sortField.key], y = b.values[sortField.key], nx = Number(x), ny = Number(y);
    const numeric = x != null && y != null && x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny);
    return sort.dir * (numeric ? nx - ny : displayValue(x, sortField, records, spec).localeCompare(displayValue(y, sortField, records, spec), 'es', { numeric: true, sensitivity: 'base' }));
  }) : filtered;
  const visible = pick && pickField ? shown.filter(record => String(record.values[pickField.key] ?? '') === pick) : shown;
  // Exportar la vista: lo que se ve en la tabla (búsqueda, filtro y orden aplicados), con los valores tal como se muestran.
  const exportView = () => {
    const columns = entity.columns.map(key => entity.fields.find(field => field.key === key)!).filter(Boolean);
    const list = entityName === 'deals' ? filtered : visible;
    const text = toCsv(columns.map(field => field.label), list.map(record => columns.map(field => field.key === entity.displayField ? recordName(record, spec) : displayValue(record.values[field.key], field, records, spec))));
    downloadCsv(entity.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.csv', text);
  };
  const current = { query, pick, sort, smart };
  const isDefault = !query.trim() && !pick && !sort && !smart;
  const labels = { pick: (id: string) => pickField?.options.find(option => option.id === id)?.label, sort: (key: string) => entity.fields.find(field => field.key === key)?.label, smart: (id: string) => smarts.find(view => view.id === id)?.label };
  const store = (next: SavedView[]) => { setSaved(next); writeSavedViews(entityName, next); };
  const saveView = (name: string) => { const next = addSavedView(saved, name, current, Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); if (next !== saved) { store(next); setMoveNote({ tone: 'ok', text: 'Vista «' + next[0].name + '» guardada en este navegador.' }); } setNaming(null); };
  const applyView = (view: SavedView) => { setQuery(view.query); setOffset(0); setPick(view.pick); setSort(view.sort); setSmart(smarts.some(item => item.id === view.smart) ? view.smart : null); setMoveNote(null); };
  const removeView = (view: SavedView) => { store(saved.filter(item => item.id !== view.id)); setMoveNote({ tone: 'ok', text: 'Vista «' + view.name + '» borrada.' }); };
  // Lo que filtra en el navegador (vista inteligente o filtro rápido) solo ve la página cargada: se dice cuando hay más.
  const pageOnly = (!!activeSmart || (!!pick && !!pickField)) && total > rows.length;
  const dealsSum = filtered.reduce((sum, record) => sum + (Number(record.values[amountKey]) || 0), 0);
  // Tarjeta: fecha prevista de cierre (si el modelo la tiene) y las dos primeras referencias (empresa · cliente).
  const closeField = entityName === 'deals' ? entity.fields.find(field => field.type === 'date' && /cierre|close/i.test(field.key + ' ' + field.label)) : undefined;
  const refFields = entity.fields.filter(field => field.type === 'reference').slice(0, 2);
  return <section className="workspace">
    <header className="page-header gx-records-head"><div><h1>{entity.label}</h1><p className="page-subtitle">{entityName === 'contacts' ? 'Las relaciones siguen contigo.' : entityName === 'deals' ? 'Cada oportunidad, en su siguiente paso.' : entityName === 'tasks' ? 'Lo importante sigue en marcha.' : 'Todo tu contexto, en un solo lugar.'}</p></div>
  <div className="table-toolbar"><label className="search-field"><Search size={15} /><input aria-label={'Buscar ' + entity.label.toLowerCase()} placeholder={'Buscar ' + entity.label.toLowerCase() + '…'} value={query} onChange={event => {setQuery(event.target.value);setOffset(0);}} /></label>
      {entityName==='deals'&&state.snapshot?.pipelines?.length?<select aria-label="Proceso comercial" value={pipeline} onChange={e=>{setPipeline(e.target.value);setOffset(0);}}><option value="">Todos los procesos</option>{state.snapshot.pipelines.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>:null}
  {pickField && rows.length ? <div className="gx-picks" role="group" aria-label={'Filtrar por ' + pickField.label.toLowerCase()}><button type="button" aria-pressed={pick === null} onClick={() => setPick(null)}>Todo</button>{pickField.options.map(option => <button key={option.id} type="button" aria-pressed={pick === option.id} onClick={() => setPick(pick === option.id ? null : option.id)}>{option.label}<span>{rows.filter(record => String(record.values[pickField.key] ?? '') === option.id).length}</span></button>)}</div> : null}
          <span className="muted">{pageOnly ? (entityName === 'deals' ? filtered : visible).length + ' de ' + rows.length + ' cargados (' + total + ' en total)' : <>{(pick && pickField) || activeSmart ? (entityName === 'deals' ? filtered : visible).length + ' de ' : ''}{total} {entity.label.toLowerCase()}</>}</span>{entityName==='deals'&&rows.length?<span className="muted gx-total"><strong>{euros(dealsSum)}</strong> en esta vista</span>:null}</div>
  <div className="gx-head-actions"><button type="button" className="button secondary" disabled={recordsLoading || !rows.length} title={total > rows.length ? 'Exporta los ' + rows.length + ' registros de esta página, con la búsqueda y el filtro aplicados' : 'Exporta lo que ves, con la búsqueda y el filtro aplicados'} onClick={exportView}><Download size={15} />CSV</button>
    <button className="button primary" onClick={() => setSelected('new')}><Plus size={16} />{singular[entityName]}</button></div></header>
    {smarts.length || saved.length || !isDefault ? <div className="gx-views" role="group" aria-label="Vistas">
      {smarts.map(view => { const count = rows.filter(record => view.test(record, smartContext)).length; return <button key={view.id} type="button" className="gx-view" data-kind="smart" aria-pressed={smart === view.id} title={view.hint + (total > rows.length ? ' · en los registros cargados' : '')} onClick={() => setSmart(smart === view.id ? null : view.id)}><Sparkles size={13} aria-hidden="true" />{view.label}<span>{count}</span></button>; })}
      {saved.map(view => <span key={view.id} className="gx-view-saved"><button type="button" className="gx-view" data-kind="saved" aria-pressed={sameView(view, current)} title={describeView(view, labels)} onClick={() => applyView(view)}><Bookmark size={13} aria-hidden="true" />{view.name}</button><button type="button" className="gx-view-remove" aria-label={'Borrar la vista «' + view.name + '»'} title="Borrar esta vista" onClick={() => removeView(view)}><X size={12} aria-hidden="true" /></button></span>)}
      {naming !== null ? <form className="gx-view-form" onSubmit={event => { event.preventDefault(); saveView(naming); }}>
        <input autoFocus aria-label="Nombre de la vista" placeholder="Nombre de la vista" maxLength={40} value={naming} onChange={event => setNaming(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setNaming(null); } }} />
        <button type="submit" className="button primary" disabled={!naming.trim()}>Guardar</button><button type="button" className="button secondary" onClick={() => setNaming(null)}>Cancelar</button>
        <small className="muted">{describeView(current, labels)}</small></form>
      : <button type="button" className="gx-view-add" disabled={isDefault} title={isDefault ? 'Busca, filtra u ordena y guárdalo con un nombre' : 'Guardar ' + describeView(current, labels)} onClick={() => setNaming('')}><Plus size={13} aria-hidden="true" />Guardar vista</button>}
      {pageOnly ? <span className="gx-views-note">Filtra los {rows.length} registros cargados; la búsqueda llega a todos.</span> : null}
    </div> : null}
    {moveNote ? <p className="gx-move-note" data-tone={moveNote.tone} role={moveNote.tone === 'error' ? 'alert' : 'status'}>{moveNote.text}<button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={() => setMoveNote(null)}>×</button></p> : null}
    {entityName === 'deals' ? <div className="kanban" aria-label="Tablero de oportunidades">{stages.map((stage, stageIndex) => {
      const deals = filtered.filter(r => r.values[stageKey] === stage.id);
      const kind = stageKind(stage), stageSum = deals.reduce((sum, record) => sum + (Number(record.values[amountKey]) || 0), 0);
      return <section className="kanban-column" key={stage.id} data-kind={kind} data-empty={deals.length ? undefined : 'true'} style={{ '--stage': stage.color } as Record<string, string>} data-over={overStage === stage.id ? 'true' : undefined}
              onDragOver={event => { if (dragId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (overStage !== stage.id) setOverStage(stage.id); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverStage(current => current === stage.id ? null : current); }}
              onDrop={event => { event.preventDefault(); const record = filtered.find(item => item.id === dragId); setDragId(null); setOverStage(null); if (record) void move(record, stage.id); }}><h2><span className="dot" style={{ background: stage.color }} />{stage.label}<small>{deals.length}</small></h2>
        {deals.length ? <p className="gx-sum" title="Suma de los importes de esta etapa en la vista actual">{euros(stageSum)}{dealsSum > 0 && kind === 'open' ? <span className="gx-share" aria-hidden="true"><i style={{ width: Math.max(4, Math.round(stageSum / dealsSum * 100)) + '%' }} /></span> : null}</p> : null}
        {deals.map(record => <button key={record.id} className="deal-card" draggable={!moving} data-dragging={dragId === record.id ? 'true' : undefined} data-moving={moving === record.id ? 'true' : undefined} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
              title="Arrastra a otra etapa, o Alt + flechas para moverla"
              onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', record.id); setDragId(record.id); }}
              onDragEnd={() => { setDragId(null); setOverStage(null); }}
              onKeyDown={event => { if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { const target = stages[stageIndex + (event.key === 'ArrowRight' ? 1 : -1)]; if (target) { event.preventDefault(); void move(record, target.id); } } }}
              onClick={() => setSelected(record)}><strong>{recordName(record, spec)}</strong>
          <span>{euros(record.values[amountKey])}</span>
          <small>{refFields.map(f => displayValue(record.values[f.key], f, records, spec)).filter(text => text && text !== '—').join(' · ') || 'Sin empresa ni cliente'}</small>
          {closeField && kind === 'open' ? (() => { const status = closeStatus(record.values[closeField.key], today, kind); return <em className="deal-close" data-tone={status.tone}>{status.label}</em>; })() : null}<span className="card-edit">Abrir oportunidad <ArrowRight size={14} /></span></button>)}
        {!deals.length ? <p className="column-empty">Sin oportunidades</p> : null}</section>;
    })}</div>
    : <div className="table-container"><table><thead><tr>{entity.columns.map(key => <th key={key} aria-sort={sort?.key===key?(sort.dir===1?'ascending':'descending'):'none'}><button type="button" className="gx-sort" title={total>rows.length?'Ordena los '+rows.length+' registros de esta página':'Ordenar por esta columna'} onClick={()=>setSort(current=>current?.key===key?(current.dir===1?{key,dir:-1}:null):{key,dir:1})}>{entity.fields.find(f => f.key === key)!.label}</button></th>)}<th><span className="sr-only">Editar</span></th></tr></thead>
  <tbody>{visible.map(record => <tr key={record.id} className={selected !== 'new' && selected?.id === record.id ? 'selected-row' : ''}>
        {entity.columns.map((key, index) => { const field = entity.fields.find(f => f.key === key)!; const value = displayValue(record.values[key], field, records, spec);
          return <td key={key} data-label={field.label}>{index === 0 ? <button className="record-link" onClick={() => setSelected(record)}>
            {entityName === 'contacts' ? <span className="avatar">{String(record.values.firstname || '?')[0]}{String(record.values.lastname || '')[0]}</span> : null}
            {entityName === 'contacts' && key === entity.displayField ? recordName(record, spec) : value}</button>
            : field.type === 'enum' && !field.readOnly && field.options.length ? <select className="gx-inline" aria-label={'Cambiar ' + field.label.toLowerCase() + ' de ' + recordName(record, spec)} title={'Cambiar ' + field.label.toLowerCase()} value={String(record.values[key] ?? '')} disabled={editing !== null} data-saving={editing === record.id + ':' + key ? 'true' : undefined} onChange={event => void change(record, key, event.target.value)}>
                {field.required ? null : <option value="">—</option>}{!field.options.some(option => option.id === String(record.values[key] ?? '')) && record.values[key] ? <option value={String(record.values[key])}>{value}</option> : null}{field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            : <span className={field.type === 'enum' ? 'enum-label' : field.type === 'date' && isPast(record, record.values[key]) ? 'gx-past' : ''} title={field.type === 'date' && isPast(record, record.values[key]) ? 'Fecha anterior a hoy' : undefined}>{value}</span>}{entityName === 'tasks' && key === dueKey && field.type === 'date' && !field.readOnly && isPast(record, record.values[key]) ? <button type="button" className="gx-postpone" disabled={editing !== null} aria-label={'Pasar «' + recordName(record, spec) + '» a mañana'} onClick={() => void postpone(record)}>Mañana</button> : null}</td>; })}
        <td className="gx-row-open"><button className="icon-button" aria-label={'Editar ' + recordName(record, spec)} onClick={() => setSelected(record)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table>
      {recordsLoading?<Skeleton rows={8} label="Cargando registros…" />:recordsError?<ErrorState title="No se pudieron cargar los registros" onAction={onRetry}>Tus datos siguen en este ordenador. {onRetry?'Vuelve a intentarlo; si se repite, comprueba que Plan B sigue abierto.':'Vuelve a seleccionar la sección para intentarlo de nuevo.'}</ErrorState>:!visible.length ? <EmptyState icon={<Search size={22} />} title={query ? 'Sin resultados' : 'Todavía no hay registros'} action={query ? <button type="button" className="button secondary" onClick={() => { setQuery(''); setOffset(0); }}>Quitar la búsqueda</button> : <button type="button" className="button primary" onClick={() => setSelected('new')}><Plus size={16} />{singular[entityName]}</button>}>{query ? 'Prueba con otro nombre, correo o empresa.' : 'Crea el primer registro para empezar.'}</EmptyState> : null}
    </div>}
    <footer className="gx-statusbar"><div className="status-strip"><span className={'status-label ' + (state.disconnected ? 'independent' : '')}><span className="dot" />{state.disconnected ? 'Modo independiente' : 'Copia local activa'}</span>
  <span className="copy-date">Última copia · {date}</span><button className="text-button" onClick={viewCoverage}>Ver cobertura<ChevronRight size={14} /></button>
      {!state.runtime ? <button className="text-button disconnect" disabled={busy} onClick={toggleServices}>
        {state.disconnected ? <PlugZap size={14} /> : <Unplug size={14} />}{state.disconnected ? 'Habilitar servicios' : 'Desconectar servicios'}</button> : null}</div>
      {state.generation?.provider === 'demo' ? <p className="demo-caption" title="Especificación de ensayo · campos y reglas de la captura · sin generación por IA">Especificación de ensayo · campos y reglas de la captura · sin generación por IA</p> : null}
  <div className="workspace-footer"><Database size={13} />Guardado en este ordenador<span>{state.changes} {state.changes===1?'cambio local':'cambios locales'}</span></div>
  <div className="pagination"><span>{recordsLoading?'Cargando…':<>{total?offset+1:0}–{Math.min(offset+50,total)} de {total}</>}</span><button className="button secondary" disabled={recordsLoading||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><button className="button secondary" disabled={recordsLoading||offset+50>=total} onClick={()=>setOffset(offset+50)}>Siguiente</button></div></footer>
  </section>;
}
