import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, ChevronRight, Circle, Database, Download, GitBranch, LayoutDashboard, ListTodo, PlugZap, Plus, Search, Settings2, ShieldCheck, Unplug, Users, X } from 'lucide-react';
import type { AppState, CrmRecord, EntityName } from '../shared/model.js';
import { api, post } from './api.js';
import { Brand, Modal, RecordDrawer, Spinner, displayValue, recordName } from './components.js';
import { Settings } from './Settings.js';
import { Preparation } from './Preparation.js';
import { ContinuityHome } from './ContinuityHome.js';
import { ChangesView } from './ChangesView.js';
import { PortableExport } from './PortableExport.js';
import { Protection } from './Protection.js';
import { APP_VERSION } from '../shared/version.js';

const navigation = [
  { id: 'contacts', label: 'Clientes', icon: Users },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'deals', label: 'Oportunidades', icon: GitBranch },
  { id: 'tasks', label: 'Tareas', icon: ListTodo }
] as const;
const singular: Record<EntityName, string> = { contacts: 'Nuevo cliente', companies: 'Nueva empresa', deals: 'Nueva oportunidad', tasks: 'Nueva tarea' };
export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [page, setPage] = useState<'continuity' | 'changes' | 'prepare' | 'workspace' | 'export'>('continuity');
  const [entityName, setEntity] = useState<EntityName>('contacts');
  const [step, setStep] = useState(0);
  const [connectRequest,setConnectRequest]=useState(0);
  const [selected, setSelected] = useState<CrmRecord | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [offset,setOffset]=useState(0),[total,setTotal]=useState(0),[pipeline,setPipeline]=useState('');
  const [rows,setRows]=useState<CrmRecord[]>([]);
  const [auth,setAuth]=useState<'loading'|'open'|'locked'|'setup'>('loading');
  const [dataRevision,setDataRevision]=useState(0);
  const [modal, setModal] = useState<'settings' | 'coverage' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<{ checks: { id: string; label: string; passed: boolean }[] } | null>(null);
  const refresh = useCallback(async () => {
    const next=await api<AppState>('/v2/state');
    setState(next);setDataRevision(r=>r+1);return next;
  }, []);
  useEffect(() => {
    const check=()=>api<{configured:boolean;authenticated:boolean}>('/v2/auth/status').then(async gate=>{
      if(!gate.authenticated){setAuth('locked');setLoading(false);return;}
      setAuth('open');const next=await refresh();setStep(next.candidate?.spec?2:next.spec?2:next.snapshot?1:0);setLoading(false);
    }).catch(f=>{setError(f.message);setLoading(false);});
    void check();const lock=()=>void check();window.addEventListener('planb:locked',lock);
    return()=>window.removeEventListener('planb:locked',lock);
  }, [refresh]);
  useEffect(()=>{
    if(auth!=='open'||page!=='workspace'||!state?.ready)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>void api<{records:CrmRecord[];related:CrmRecord[];total:number}>('/v2/records/'+entityName+'?q='+encodeURIComponent(query)+'&offset='+offset+'&limit=50&pipeline='+encodeURIComponent(pipeline),{signal:controller.signal})
      .then(data=>{setRows(data.records);setRecords([...data.records,...data.related]);setTotal(data.total);}).catch(f=>{if(f.name!=='AbortError')setError(f.message);}),query?180:0);
    return()=>{controller.abort();clearTimeout(timer);};
  },[auth,page,entityName,query,offset,pipeline,dataRevision,state?.ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [selected]);
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); if (message) setNotice(message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const openEntity = (id: EntityName) => { setEntity(id); setSelected(null); setQuery('');setOffset(0);setPipeline('');setRows([]);setRecords([]); setPage('workspace'); };
  const viewCoverage = async () => {
    setModal('coverage'); setProbe(null);
    try { setProbe(await post('/probe', {})); } catch (failure) { setError((failure as Error).message); }
  };
  const filtered=rows;
  const protect=async()=>{
    const gate=await api<{configured:boolean}>('/v2/auth/status');
    if(gate.configured){await post('/v2/auth/lock',{});setAuth('locked');}else setAuth('setup');
  };

  if(auth==='locked'||auth==='setup')return <Protection setup={auth==='setup'} cancel={auth==='setup'?()=>setAuth('open'):undefined} done={()=>{setAuth('open');void refresh();}}/>;
  if (loading||auth==='loading') return <main className="loading-page"><Brand /><Spinner text="Abriendo tu copia local…" /></main>;
  if (!state) return <main className="loading-page"><Brand /><p role="alert">{error || 'No se puede conectar con el servidor local.'}</p><button className="button primary" onClick={() => location.reload()}>Volver a intentar</button></main>;
  const spec = state.spec;
  const entity = spec?.entities.find(e => e.id === entityName);
  const date = state.snapshot ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(state.snapshot.capturedAt)) : '';
  return <div className={'app-shell ' + (selected ? 'has-drawer' : '')}>
    <aside className="sidebar">
      <Brand /><p className="sidebar-caption">{page === 'prepare' ? 'PREPARACIÓN' : 'APLICACIÓN'}</p>
      <nav aria-label="Navegación principal">
        <button className={'nav-item '+(page==='continuity'?'active':'')} onClick={()=>{setPage('continuity');setSelected(null);}}><ShieldCheck size={19}/>Continuidad</button>
        <button className={'nav-item '+(page==='workspace'?'active':'')} disabled={!state.ready} onClick={()=>openEntity('contacts')}><Users size={19}/>Trabajar</button>
        <button className={'nav-item '+(page==='changes'?'active':'')} disabled={!state.ready} onClick={()=>{setPage('changes');setSelected(null);}}><GitBranch size={19}/>Cambios</button>
      </nav>
      {page==='workspace'||page==='prepare'?<nav className="entity-nav" aria-label="Secciones">
        {page === 'prepare' ? ['Origen', 'Procesos', 'Generar', 'Exportar'].map((label, index) => <button key={label}
          className={'nav-item ' + (step === index ? 'active' : '')} disabled={index > 0 && !state.snapshot || index === 3 && !state.ready}
          onClick={() => index === 3 ? setPage('export') : setStep(index)}><span className="step-number">{index + 1}</span>{label}</button>)
          : navigation.map(item => <button key={item.id} className={'nav-item ' + (page === 'workspace' && entityName === item.id ? 'active' : '')}
              onClick={() => openEntity(item.id)}><item.icon size={19} />{item.label}</button>)}
      </nav>:null}
      <div className="sidebar-secondary">
        {!state.runtime && page !== 'prepare' ? <button className="nav-item" onClick={() => { setPage('prepare'); setSelected(null); }}><LayoutDashboard size={19} />Preparación</button> : null}
        {page === 'prepare' ? <button className="nav-item" disabled={!state.ready} onClick={() => setPage('workspace')}><ArrowRight size={19} />Abrir aplicación</button> : null}
        <button className={'nav-item ' + (page === 'export' ? 'active' : '')} disabled={!state.ready} onClick={() => { setPage('export'); setSelected(null); }}><Download size={19} />Exportar</button>
        {!state.runtime&&state.snapshot?.source.isTestData!==false ? <button className="nav-item" onClick={() => setModal('settings')}><Settings2 size={19} />Proveedor de IA</button> : null}
        <button className="nav-item" onClick={()=>void protect()}><ShieldCheck size={19}/>Proteger / bloquear</button>
      </div>
      <div className="sidebar-bottom"><span className="dot" />{state.snapshot?.source.isTestData===false?'Producción · lectura':'Datos de ensayo'}<small>{state.snapshot?.name ?? 'Tu copia, en tu ordenador'} · v{APP_VERSION}</small></div>
    </aside>
    <div className="mobile-brand"><Brand /><span className="badge">{state.snapshot?.source.isTestData===false?'Producción · lectura':'Local · Ensayo'}</span></div>
    <main className="main-content">
      {error ? <div role="alert" className="global-error"><span>{error}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setError('')}><X size={18} /></button></div> : null}
      {page==='continuity'?<ContinuityHome state={state} refresh={refresh} work={()=>openEntity('contacts')} prepare={()=>{setPage('prepare');setStep(0);}} protect={()=>void protect()} exportCopy={()=>setPage('export')} connectRequest={connectRequest}/>
      :page==='changes'?<ChangesView runtime={state.runtime} production={state.snapshot?.source.isTestData===false}/>
      :page==='export'?<PortableExport/>
      :page === 'prepare' ? <Preparation state={state.candidate?{...state,...state.candidate,lastError:state.candidate.error}:state} step={step} setStep={setStep} refresh={refresh}
        openWorkspace={() => setPage('workspace')} configure={() => setModal('settings')} onConnect={()=>{setPage('continuity');setConnectRequest(n=>n+1);}} onError={setError} />
      : !state.ready || !spec || !entity ? <section className="empty-state"><ShieldCheck size={36} /><h1>Revisa la preparación</h1><p>La captura y las reglas deben estar verificadas antes de editar.</p>
          <button className="button primary" onClick={() => { setPage('prepare'); setStep(2); }}>Revisar aplicación</button></section>
      : <section className="workspace">
        <header className="page-header"><div><h1>{entity.label}</h1><p className="page-subtitle">{entityName === 'contacts' ? 'Las relaciones siguen contigo.' : entityName === 'deals' ? 'Cada oportunidad, en su siguiente paso.' : entityName === 'tasks' ? 'Lo importante sigue en marcha.' : 'Todo tu contexto, en un solo lugar.'}</p></div>
          <button className="button primary" onClick={() => setSelected('new')}><Plus size={18} />{singular[entityName]}</button></header>
        <div className="status-strip"><span className={'status-label ' + (state.disconnected ? 'independent' : '')}><span className="dot" />{state.disconnected ? 'Modo independiente' : 'Copia local activa'}</span>
          <span className="copy-date">Última copia · {date}</span><button className="text-button" onClick={() => void viewCoverage()}>Ver cobertura<ChevronRight size={15} /></button>
          {!state.runtime ? <button className="text-button disconnect" disabled={busy} onClick={() => act(() => post('/disconnect', { disconnected: !state.disconnected }), state.disconnected ? 'Servicios habilitados para importar o generar.' : 'HubSpot e IA desconectados. Sigue trabajando con tus datos locales.')}>
            {state.disconnected ? <PlugZap size={15} /> : <Unplug size={15} />}{state.disconnected ? 'Habilitar servicios' : 'Desconectar servicios'}</button> : null}</div>
        {state.generation?.provider === 'demo' ? <p className="demo-caption">Especificación de ensayo · campos y reglas de la captura · sin generación por IA</p> : null}
        <div className="table-toolbar"><label className="search-field"><Search size={18} /><input aria-label={'Buscar ' + entity.label.toLowerCase()} placeholder={'Buscar ' + entity.label.toLowerCase() + '…'} value={query} onChange={event => {setQuery(event.target.value);setOffset(0);}} /></label>
          {entityName==='deals'&&state.snapshot?.pipelines?.length?<select aria-label="Proceso comercial" value={pipeline} onChange={e=>{setPipeline(e.target.value);setOffset(0);}}><option value="">Todos los procesos</option>{state.snapshot.pipelines.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>:null}
          <span className="muted">{total} {entity.label.toLowerCase()}</span></div>
        {entityName === 'deals' ? <div className="kanban" aria-label="Tablero de oportunidades">{spec.stages.filter(s=>!pipeline||!s.pipelineId||s.pipelineId===pipeline).map(stage => {
          const deals = filtered.filter(r => r.values.dealstage === stage.id);
          return <section className="kanban-column" key={stage.id}><h2><span className="dot" style={{ background: stage.color }} />{stage.label}<small>{deals.length}</small></h2>
            {deals.map(record => <button key={record.id} className="deal-card" onClick={() => setSelected(record)}><strong>{recordName(record, spec)}</strong>
              <span>{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(record.values.amount ?? 0))}</span>
              <small>{entity.fields.filter(f => f.type === 'reference').slice(0, 1).map(f => displayValue(record.values[f.key], f, records, spec)).join('')}</small><span className="card-edit">Abrir oportunidad <ArrowRight size={14} /></span></button>)}
            {!deals.length ? <p className="column-empty">Sin oportunidades</p> : null}</section>;
        })}</div>
        : <div className="table-container"><table><thead><tr>{entity.columns.map(key => <th key={key}>{entity.fields.find(f => f.key === key)!.label}</th>)}<th><span className="sr-only">Editar</span></th></tr></thead>
          <tbody>{filtered.map(record => <tr key={record.id} className={selected !== 'new' && selected?.id === record.id ? 'selected-row' : ''}>
            {entity.columns.map((key, index) => { const field = entity.fields.find(f => f.key === key)!; const value = displayValue(record.values[key], field, records, spec);
              return <td key={key}>{index === 0 ? <button className="record-link" onClick={() => setSelected(record)}>
                {entityName === 'contacts' ? <span className="avatar">{String(record.values.firstname || '?')[0]}{String(record.values.lastname || '')[0]}</span> : null}
                {entityName === 'contacts' && key === entity.displayField ? recordName(record, spec) : value}</button>
                : <span className={field.type === 'enum' ? 'enum-label' : ''}>{value}</span>}</td>; })}
            <td><button className="icon-button" aria-label={'Editar ' + recordName(record, spec)} onClick={() => setSelected(record)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table>
          {!filtered.length ? <div className="empty-table"><Search size={24} /><h3>{query ? 'Sin resultados' : 'Todavía no hay registros'}</h3><p>{query ? 'Prueba con otro nombre, correo o empresa.' : 'Crea el primer registro para empezar.'}</p></div> : null}
        </div>}
        <footer className="pagination"><span>{total?offset+1:0}–{Math.min(offset+50,total)} de {total}</span><button className="button secondary" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><button className="button secondary" disabled={offset+50>=total} onClick={()=>setOffset(offset+50)}>Siguiente</button></footer>
        <footer className="workspace-footer"><Database size={14} />Guardado en este ordenador<span>{state.changes} cambios locales</span></footer>
      </section>}
    </main>
    {selected && spec && state.ready ? <><div className="drawer-shade" onClick={() => setSelected(null)} /><RecordDrawer key={selected === 'new' ? entityName + '-new' : selected.id} entityName={entityName} selected={selected} spec={spec} records={records}
      close={() => setSelected(null)} saved={async () => { await refresh(); setSelected(null); setNotice('Guardado en tu copia local.'); }} /></> : null}
    {notice ? <div className="toast" role="status"><CheckCircle2 size={19} />{notice}</div> : null}
    {modal === 'settings' ? <Settings state={state} close={() => setModal(null)} done={async () => { await refresh(); setNotice('Proveedor guardado.'); }} /> : null}
    {modal === 'coverage' ? <Modal title="Cobertura de tu copia" close={() => setModal(null)} wide><div className="modal-body">
      <p className="muted">Comprobaciones sobre la captura y la aplicación que estás utilizando.</p>
      <div className="check-list">{probe ? probe.checks.map(check => <div key={check.id}>{check.passed ? <CheckCircle2 size={19} className="green" /> : <Circle size={19} className="muted" />}<span>{check.label}</span><small>{check.passed ? 'Verificado' : 'Pendiente'}</small></div>) : <Spinner />}</div>
      <h3>Conciliación del origen</h3><p className="muted">{Object.values(state.reconciliation?.counts??{}).reduce((n,c)=>n+c.actual,0)} registros y {state.reconciliation?.actualLinks} relaciones conservadas en la captura.</p>
      <h3>Pendiente de cobertura</h3><ul className="plain-list">{spec?.coverage.unsupported.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="helper">Una copia completa de estos datos no equivale a reproducir todas las funciones del CRM. El paquete incluye los resultados de las pruebas de reinicio y red.</p>
    </div></Modal> : null}
  </div>;
}
