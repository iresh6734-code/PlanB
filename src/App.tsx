import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, ShieldCheck, X } from 'lucide-react';
import { validateRecord, type AppState, type CrmRecord, type EntityName } from '../shared/model.js';
import { api, post } from './api.js';
import { Brand, Modal, RecordDrawer, Spinner, recordName } from './components.js';
import { Protection } from './Protection.js';
import { type PageId, rememberPlace, storedEntity, storedPage } from './app-shell/session.js';
import { useShortcuts } from './app-shell/useShortcuts.js';
import { ShortcutsHelp } from './app-shell/ShortcutsHelp.js';
import { RecordsPage } from './app-shell/RecordsPage.js';
import { Sidebar } from './app-shell/Sidebar.js';
import { TopBar } from './app-shell/TopBar.js';
import { RelatedPanel } from './app-shell/RelatedPanel.js';
import { RecordTimeline } from './app-shell/RecordTimeline.js';
import { CommandPalette } from './app-shell/CommandPalette.js';
import { FocusRun } from './app-shell/FocusRun.js';
import { MobileNav } from './app-shell/MobileNav.js';
import type { Command } from './app-shell/commands.js';
import { toggleTheme } from './app-shell/theme.js';
import { LocalOperations, type OpenTaskRequest } from './LocalOperations.js';
import { OutcomesLockNotice, TaskOutcomesHost, TaskOutcomesSurface, addLockSummary, type TaskOutcomesControl } from './TaskOutcomesHost.js';
import { WorkspaceSearch } from './WorkspaceSearch.js';
import { RehearsalTodayEntry } from './RehearsalTodayEntry.js';
import { HomeOverview } from './HomeOverview.js';
// Apartados que se descargan al visitarlos por primera vez (misma interfaz de uso que los originales).
import { ChangesView, ContinuityHome, DateCheck, DecisionReview, LocalIntegrations, OperationalRehearsal, PortableExport, Preparation, RadarHost, Settings, TeamSync } from './app-shell/lazy-pages.js';
import type { WorkspaceSearchContext } from '../shared/workspace-search.js';

type LocalAppState = AppState & { workspaceSearchContext?: WorkspaceSearchContext | null };

class SupersededStateRead extends Error {
  constructor() { super('Otra consulta sustituyó esta lectura. Reintenta la actualización.'); }
}

export default function App() {
  const [state, setState] = useState<LocalAppState | null>(null);
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [page, setPage] = useState<PageId>(storedPage);
  const [rehearseFromToday, setRehearseFromToday] = useState<string | null>(null);
  const [integrationsFrom, setIntegrationsFrom] = useState<'continuity' | null>(null), [returnedFrom, setReturnedFrom] = useState<'integrations' | null>(null);
  useEffect(() => { if (page !== 'integrations') setIntegrationsFrom(null); }, [page]);
  const [entityName, setEntity] = useState<EntityName>(storedEntity);
  useEffect(() => { rememberPlace(page, entityName); }, [page, entityName]);
  const [signals, setSignals] = useState<{ overdue: number | null; atRisk: number | null }>({ overdue: null, atRisk: null });
  const [help, setHelp] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [workOpen,setWorkOpen]=useState(true);
  const [preparationOpen,setPreparationOpen]=useState(false);
  useEffect(()=>{if(page==='workspace')setWorkOpen(true);},[page]);
  // En la tira de navegación móvil, el apartado activo queda siempre a la vista.
  useEffect(()=>{if(typeof window==='undefined'||!window.matchMedia?.('(max-width: 760px)').matches)return;const frame=requestAnimationFrame(()=>document.querySelector('.sidebar [aria-current="page"]')?.scrollIntoView({inline:'center',block:'nearest'}));return()=>cancelAnimationFrame(frame);},[page,entityName]);
  const [teamOrigin,setTeamOrigin]=useState<string|null>(null);
  useEffect(()=>{if(!state||state.runtime)return;let active=true;void api<{origin:string|null}>('/v6/workspace').then(value=>{if(active)setTeamOrigin(value.origin);}).catch(()=>{});return()=>{active=false;};},[state?.runtime]);
  const [step, setStep] = useState(0);
  const [connectRequest,setConnectRequest]=useState(0);
  const [selected, setSelected] = useState<CrmRecord | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [globalSearch, setGlobalSearch] = useState(false);
  const [offset,setOffset]=useState(0),[total,setTotal]=useState(0),[pipeline,setPipeline]=useState('');
  const [rows,setRows]=useState<CrmRecord[]>([]);
  const [recordsLoading,setRecordsLoading]=useState(true),[recordsError,setRecordsError]=useState('');
  const [auth,setAuth]=useState<'loading'|'open'|'locked'|'setup'>('loading');
  const [dataRevision,setDataRevision]=useState(0);
  const [lockEpoch,setLockEpoch]=useState(0);
  // Solo un RECUENTO de lo que quedó sin resolver al bloquear (el seguimiento detallado vive en memoria y se pierde): sin textos de tareas ni borradores.
  const [lockedOutcomes,setLockedOutcomes]=useState<{notDispatched:number;dispatched:number}|null>(null);
  const [lockFailed,setLockFailed]=useState(false);
  const outcomesControl=useRef<TaskOutcomesControl|null>(null);
  const [taskRequest,setTaskRequest]=useState<OpenTaskRequest|null>(null);
  const refreshSequence = useRef(0);
  const accessSequence = useRef(0);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && auth === 'open' && state?.ready && !selected && !document.querySelector('[role="dialog"]')) { event.preventDefault(); setGlobalSearch(true); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [auth, state?.ready, selected]);
  useEffect(() => { if (auth !== 'open' || !state?.ready) setGlobalSearch(false); }, [auth, state?.ready]);
  const [modal, setModal] = useState<'settings' | 'coverage' | null>(null);
  useShortcuts({ active: auth === 'open' && !!state, ready: !!state?.ready, runtime: !!state?.runtime, blocked: !!selected, onRecords: page === 'workspace',
    openEntity: entity => openEntity(entity), go: next => { setPage(next); setSelected(null); }, openHelp: () => setHelp(true), openSearch: () => setGlobalSearch(true), newRecord: () => setSelected('new'), openCommands: () => setCommandsOpen(true) });
  // Una copia restaurada no tiene Hoy, Agentes, Integraciones ni copia de equipo: si la sesión recordaba uno, se vuelve a Inicio.
  useEffect(() => { if (state?.runtime && (page === 'today' || page === 'agents' || page === 'integrations' || page === 'team-sync')) setPage('home'); }, [state?.runtime, page]);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<{ checks: { id: string; label: string; passed: boolean }[] } | null>(null);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    let next: LocalAppState;
    try { next = await api<LocalAppState>('/v2/state'); }
    catch (failure) { if (sequence !== refreshSequence.current) throw new SupersededStateRead(); throw failure; }
    if (sequence !== refreshSequence.current) throw new SupersededStateRead();
    setState(next);setDataRevision(r=>r+1);return next;
  }, []);
  useEffect(() => {
    const check=()=>{
      const sequence=++accessSequence.current;
      return api<{configured:boolean;authenticated:boolean}>('/v2/auth/status').then(async gate=>{
        if(sequence!==accessSequence.current)return;
        if(!gate.authenticated){refreshSequence.current++;setAuth('locked');setLoading(false);return;}
        setAuth('open');const next=await refresh();
        if(sequence!==accessSequence.current)return;
        setStep(next.candidate?.spec?2:next.spec?2:next.snapshot?1:0);setLoading(false);
      }).catch(f=>{if(sequence!==accessSequence.current||f instanceof SupersededStateRead)return;setError(f.message);setLoading(false);});
    };
    void check();const lock=()=>{setLockEpoch(epoch=>epoch+1);void check();};window.addEventListener('planb:locked',lock);
    return()=>{accessSequence.current++;refreshSequence.current++;window.removeEventListener('planb:locked',lock);};
  }, [refresh]);
  useEffect(()=>{
    if(auth!=='open'||page!=='workspace'||!state?.ready)return;
    const controller=new AbortController();setRecordsLoading(true);setRecordsError('');
    const timer=setTimeout(()=>void api<{records:CrmRecord[];related:CrmRecord[];total:number}>('/v2/records/'+entityName+'?q='+encodeURIComponent(query)+'&offset='+offset+'&limit=50&pipeline='+encodeURIComponent(pipeline),{signal:controller.signal})
      .then(data=>{setRows(data.records);setRecords([...data.records,...data.related]);setTotal(data.total);}).catch(f=>{if(f.name!=='AbortError'){setError(f.message);setRecordsError(f.message);}}).finally(()=>{if(!controller.signal.aborted)setRecordsLoading(false);}),query?180:0);
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
  const openEntity = (id: EntityName) => { setWorkOpen(true);setEntity(id); setSelected(null); setQuery('');setOffset(0);setPipeline('');setRows([]);setRecords([]);setRecordsLoading(true);setTotal(0);setDataRevision(r=>r+1); setPage('workspace'); };
  const openPreparation = (nextStep?: number) => { setPage('prepare'); setSelected(null); setPreparationOpen(true); if(nextStep!==undefined)setStep(nextStep); };
  const viewCoverage = async () => {
    setModal('coverage'); setProbe(null);
    try { setProbe(await post('/probe', {})); } catch (failure) { setError((failure as Error).message); }
  };
  const protect=async()=>{
    // Se SELLA la frontera de despacho al INICIAR el cierre, antes de cualquier espera de red: un guardado que seguía en su comprobación previa no puede salir mientras el bloqueo viaja.
    const outcomes=outcomesControl.current;outcomes?.seal();
    try{
      const gate=await api<{configured:boolean}>('/v2/auth/status');
      if(gate.configured){await post('/v2/auth/lock',{});accessSequence.current++;refreshSequence.current++;setAuth('locked');}
      else{accessSequence.current++;refreshSequence.current++;setAuth('setup');}
    }catch(failure){
      // El cierre no se completó: el propietario sellado NO se reactiva; empieza uno nuevo y vacío y la persona ve qué quedó sellado y cómo reintentar.
      outcomes?.resume();setError(failure instanceof Error?failure.message:'No se pudo bloquear Plan B.');
    }
  };

  if(auth==='locked'||auth==='setup')return <Protection key={lockEpoch} setup={auth==='setup'} cancel={auth==='setup'?()=>setAuth('open'):undefined} done={async()=>{const sequence=++accessSequence.current;await refresh();if(sequence!==accessSequence.current)throw new SupersededStateRead();setAuth('open');}}/>;
  if (loading||auth==='loading') return <main className="loading-page"><Brand /><Spinner text="Abriendo tu copia local…" /></main>;
  if (!state) return <main className="loading-page"><Brand /><p role="alert">{error || 'No se puede conectar con el servidor local.'}</p><button className="button primary" onClick={() => location.reload()}>Volver a intentar</button></main>;
  const openTaskFromOutcomes=(taskId:string,attemptId?:string)=>{setPage('today');setSelected(null);setTaskRequest(previous=>({taskId,attemptId:attemptId??null,nonce:(previous?.nonce??0)+1}));};
  const spec = state.spec;
  const entity = spec?.entities.find(e => e.id === entityName);
  const pageLabel = page==='workspace'?(entity?.label??'Trabajar'):({home:'Inicio',today:'Hoy',changes:'Cambios',agents:'Agentes',radar:'Radar','date-check':'Comprobar una fecha',continuity:'Continuidad','team-sync':'Copia de equipo',export:'Exportar',integrations:'Integraciones',prepare:'Preparación'} as Record<string,string>)[page]??'';
  // Mover una oportunidad de etapa desde el tablero: misma validación y mismo guardado que la ficha. Devuelve el motivo si no se puede.
  // Cambiar un campo desde la tabla o el tablero: misma validación y mismo guardado que la ficha. Devuelve el motivo si no se puede.
  const saveField = async (record: CrmRecord, key: string, value: string | null): Promise<string | null> => {
    if (!spec) return 'La aplicación todavía no está lista.';
    const next: CrmRecord = { ...record, values: { ...record.values, [key]: value } };
    const issues = validateRecord(spec, next, record);
    if (Object.keys(issues).length) return Object.values(issues)[0];
    try { await api('/records/' + record.entity + '/' + encodeURIComponent(record.id), { method: 'PATCH', body: JSON.stringify({ values: next.values }) }); await refresh(); return null; }
    catch (failure) { return failure instanceof Error ? failure.message : 'No se pudo guardar el cambio.'; }
  };
  const moveDeal = (record: CrmRecord, stageId: string) => saveField(record, spec?.roles?.stage ?? 'dealstage', stageId);
  // Órdenes de la paleta (Ctrl J): las mismas acciones que ya ofrecen el menú y los botones, con las mismas condiciones.
  const goTo = (next: PageId) => () => { setPage(next); setSelected(null); };
  const commandList: Command[] = [
    { id: 'home', label: 'Ir a Inicio', group: 'Ir a', hint: 'G I', run: goTo('home') },
    ...(!state.runtime ? [{ id: 'today', label: 'Ir a Hoy', group: 'Ir a', hint: 'G H', run: goTo('today') }] : []),
    ...(state.ready && spec ? spec.entities.map(item => ({ id: 'open-' + item.id, label: 'Ir a ' + item.label, group: 'Ir a', run: () => openEntity(item.id) })) : []),
    ...(state.ready ? [{ id: 'changes', label: 'Ir a Cambios', group: 'Ir a', hint: 'G M', run: goTo('changes') }] : []),
    ...(!state.runtime ? [{ id: 'agents', label: 'Ir a Agentes', group: 'Ir a', run: goTo('agents') }] : []),
    ...(state.ready ? [{ id: 'radar', label: 'Ir al Radar', group: 'Ir a', hint: 'G R', run: () => { setRehearseFromToday(null); goTo('radar')(); } }, { id: 'date-check', label: 'Comprobar una fecha', group: 'Ir a', hint: 'G F', run: goTo('date-check') }] : []),
    { id: 'continuity', label: 'Ir a Continuidad', group: 'Ir a', hint: 'G N', run: goTo('continuity') },
    ...(!state.runtime ? [{ id: 'team-sync', label: 'Ir a Copia de equipo', group: 'Ir a', run: goTo('team-sync') }, { id: 'integrations', label: 'Ir a Integraciones', group: 'Ir a', run: goTo('integrations') }] : []),
    ...(state.ready ? [{ id: 'export', label: 'Ir a Exportar', group: 'Ir a', hint: 'G X', run: goTo('export') }] : []),
    ...(state.ready && spec ? spec.entities.map(item => ({ id: 'new-' + item.id, label: 'Crear: ' + item.singular, group: 'Crear', run: () => { openEntity(item.id); setSelected('new'); } })) : []),
    ...(state.ready && spec ? [{ id: 'focus', label: 'Despachar vencidas', group: 'Acción', hint: signals.overdue ? signals.overdue + ' vencidas' : undefined, run: () => setFocusOpen(true) }] : []),
    ...(state.ready ? [{ id: 'search', label: 'Buscar en toda la copia', group: 'Acción', hint: 'Ctrl K', run: () => setGlobalSearch(true) }, { id: 'coverage', label: 'Ver la cobertura de la copia', group: 'Acción', run: () => void viewCoverage() }] : []),
    ...(!state.runtime ? [{ id: 'prepare', label: 'Ir a Preparación', group: 'Ir a', run: () => openPreparation() }] : []),
    ...(!state.runtime && state.snapshot?.source.isTestData !== false ? [{ id: 'provider', label: 'Proveedor de IA', group: 'Ajustes', run: () => setModal('settings') }] : []),
    ...(!state.runtime && teamOrigin ? [{ id: 'commercial', label: 'Ir al espacio comercial', group: 'Ir a', run: () => { location.href = teamOrigin + '/team?view=company'; } }] : []),
    { id: 'lock', label: 'Proteger o bloquear Plan B', group: 'Acción', run: () => void protect() },
    { id: 'theme', label: typeof document !== 'undefined' && document.documentElement?.dataset?.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', group: 'Acción', run: toggleTheme },
    { id: 'help', label: 'Ver los atajos de teclado', group: 'Acción', hint: '?', run: () => setHelp(true) }
  ];
  // Registros para la paleta: hasta 4 por tipo, de la copia local, en el orden de la búsqueda del servidor.
  const findRecords = async (text: string): Promise<Command[]> => {
    if (!spec || !state.ready) return [];
    const lists = await Promise.all(spec.entities.map(item => api<{ records: CrmRecord[] }>('/v2/records/' + item.id + '?q=' + encodeURIComponent(text) + '&offset=0&limit=4&pipeline=').then(data => data.records.map(record => ({ record, item }))).catch(() => [])));
    return lists.flat().map(({ record, item }) => ({ id: 'rec-' + record.entity + '-' + record.id, label: recordName(record, spec), hint: item.singular[0].toUpperCase() + item.singular.slice(1), group: 'Registros', run: () => { openEntity(record.entity); setRecords([record]); setSelected(record); } }));
  };
  const date = state.snapshot ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(state.snapshot.capturedAt)) : '';
  return <TaskOutcomesHost refreshState={refresh} onOpenTask={openTaskFromOutcomes} onClosed={(summary,reason)=>{setLockedOutcomes(previous=>addLockSummary(previous,summary));if(summary.dispatched+summary.notDispatched>0)setLockFailed(reason==='lock-not-completed');}} controlRef={outcomesControl}><div className={'app-shell ' + (selected ? 'has-drawer' : '')}>
    <a className="skip-link" href="#main-content">Saltar al contenido</a>
    <Sidebar state={state} page={page} entityName={entityName} selected={!!selected} signals={signals} teamOrigin={teamOrigin} step={step} workOpen={workOpen} preparationOpen={preparationOpen}
      setPage={setPage} setSelected={setSelected} setWorkOpen={setWorkOpen} setPreparationOpen={setPreparationOpen} setGlobalSearch={setGlobalSearch} setModal={setModal}
      openEntity={openEntity} openPreparation={openPreparation} protect={() => void protect()} />
    <div className="mobile-brand"><Brand /><span className="badge">{state.snapshot?.source.isTestData===false?'Producción · lectura':'Local · Ensayo'}</span></div>
    <main id="main-content" className="main-content" tabIndex={-1}><TopBar state={state} pageLabel={pageLabel} date={date} teamOrigin={teamOrigin} openContinuity={() => { setPage('continuity'); setSelected(null); }} openHelp={() => setHelp(true)} openCommands={() => setCommandsOpen(true)} />
      {error ? <div role="alert" className="global-error"><span>{error}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setError('')}><X size={18} /></button></div> : null}
      <OutcomesLockNotice summary={lockedOutcomes} failed={lockFailed} onRetry={()=>void protect()} onDismiss={()=>{setLockedOutcomes(null);setLockFailed(false);}}/>
      {!state.runtime?<TaskOutcomesSurface/>:null}
      {page==='home'?<HomeOverview state={state} onSignals={setSignals} onDispatch={state.ready ? () => setFocusOpen(true) : undefined} onOpenRecord={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }}contextRevision={state.workspaceSearchContext?.contextRevision??null} onOpenToday={()=>{setPage('today');setSelected(null);}} onOpenTask={id=>openTaskFromOutcomes(id)} onOpenRadar={()=>{setRehearseFromToday(null);setPage('radar');setSelected(null);}} onRehearse={id=>{setRehearseFromToday(id);setPage('radar');setSelected(null);}} onOpenDateCheck={()=>{setPage('date-check');setSelected(null);}} onOpenContinuity={()=>{setPage('continuity');setSelected(null);}} onOpenChanges={()=>{setPage('changes');setSelected(null);}}/>
      :page==='continuity'?<ContinuityHome state={state} workspaceContextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={refresh} work={()=>openEntity('contacts')} prepare={()=>openPreparation(0)} protect={()=>void protect()} exportCopy={()=>setPage('export')} connectRequest={connectRequest} onOpenToday={()=>{setPage('today');setSelected(null);}} onOpenIntegrations={()=>{setIntegrationsFrom('continuity');setPage('integrations');setSelected(null);}} returnedFrom={returnedFrom} onReturnHandled={()=>setReturnedFrom(null)}/>
      :page==='today'||page==='agents'?<>{page==='today'?<RehearsalTodayEntry contextRevision={state.workspaceSearchContext?.contextRevision??null} onOpen={id=>{setRehearseFromToday(id);setPage('radar');setSelected(null);}} onOpenRadar={()=>{setRehearseFromToday(null);setPage('radar');setSelected(null);}}/>:null}<LocalOperations key={page} view={page} onOpenTasks={()=>openEntity('tasks')} onOpenDeals={()=>openEntity('deals')} onOpenProposals={()=>setPage('changes')} onPrepare={()=>openPreparation(0)} onRecordSaved={refresh} openTaskRequest={taskRequest} onOpenTaskHandled={()=>setTaskRequest(null)}/></>
        :page==='integrations'?<>{integrationsFrom?<p className="back-link"><button type="button" className="text-button" onClick={()=>{setIntegrationsFrom(null);setPage('continuity');setSelected(null);setReturnedFrom('integrations');}}>← Volver a Continuidad</button></p>:null}<LocalIntegrations onConnectHubspot={()=>{setPage('continuity');setSelected(null);setConnectRequest(n=>n+1);}}/></>
      :page==='team-sync'?<TeamSync/>
      :page==='date-check'?<div className="gx-datecheck"><h1 className="sr-only">Comprobar una fecha</h1><DateCheck contextRevision={state.workspaceSearchContext?.contextRevision??null} onContextStale={()=>void refresh()}/><div className="gx-datecheck-side"><DecisionReview contextRevision={state.workspaceSearchContext?.contextRevision??null} onContextStale={()=>void refresh()}/></div></div>
      :page==='radar'?(rehearseFromToday?<OperationalRehearsal contextRevision={state.workspaceSearchContext?.contextRevision??null} commitmentId={rehearseFromToday} onContextStale={()=>void refresh()} onClose={()=>setRehearseFromToday(null)}/>:<RadarHost contextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={()=>void refresh()}/>)
      :page==='changes'?<ChangesView runtime={state.runtime} production={state.snapshot?.source.isTestData===false}/>
      :page==='export'?<PortableExport/>
      :page === 'prepare' ? <Preparation state={state.candidate?{...state,...state.candidate,lastError:state.candidate.error}:state} step={step} setStep={setStep} refresh={refresh}
        openWorkspace={() => setPage('workspace')} configure={() => setModal('settings')} onConnect={()=>{setPage('continuity');setConnectRequest(n=>n+1);}} onError={setError} />
      : !state.ready || !spec || !entity ? <section className="empty-state"><ShieldCheck size={36} /><h1>Revisa la preparación</h1><p>La captura y las reglas deben estar verificadas antes de editar.</p>
          <button className="button primary" onClick={() => openPreparation(2)}>Revisar aplicación</button></section>
      : <RecordsPage state={state} spec={spec} entity={entity} entityName={entityName} rows={rows} records={records} total={total} offset={offset} setOffset={setOffset}
          query={query} setQuery={setQuery} pipeline={pipeline} setPipeline={setPipeline} selected={selected} setSelected={setSelected} recordsLoading={recordsLoading} recordsError={recordsError} busy={busy} date={date} moveDeal={moveDeal} saveField={saveField}
          viewCoverage={() => void viewCoverage()} toggleServices={() => act(() => post('/disconnect', { disconnected: !state.disconnected }), state.disconnected ? 'Servicios habilitados para importar o generar.' : 'HubSpot e IA desconectados. Sigue trabajando con tus datos locales.')} />}
    </main>
    {globalSearch && state.ready && state.snapshot ? <WorkspaceSearch captureId={state.snapshot.id+':'+state.snapshot.capturedAt} expectedContext={state.workspaceSearchContext??null} localRevision={dataRevision} close={() => setGlobalSearch(false)} openRecord={(record, related) => { setGlobalSearch(false); openEntity(record.entity); setRecords([record,...related]); setSelected(record); }}/>:null}
    {selected && spec && state.ready ? <><div className="drawer-shade" onClick={() => setSelected(null)} /><RecordDrawer key={selected === 'new' ? entityName + '-new' : selected.id} entityName={entityName} selected={selected} spec={spec} records={records}
      extra={selected === 'new' ? undefined : dirty => <><RelatedPanel spec={spec} record={selected} dirty={dirty} onOpen={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }} /><RecordTimeline spec={spec} record={selected} records={records} /></>}
      close={() => setSelected(null)} saved={async () => { await refresh(); setSelected(null); setNotice('Guardado en tu copia local.'); }} /></> : null}
    {notice ? <div className="toast" role="status"><CheckCircle2 size={19} />{notice}</div> : null}
    {modal === 'settings' ? <Settings state={state} close={() => setModal(null)} done={async () => { await refresh(); setNotice('Proveedor guardado.'); }} /> : null}
    {help ? <ShortcutsHelp close={() => setHelp(false)} /> : null}
    <MobileNav page={page} entityName={entityName} runtime={!!state.runtime} ready={!!state.ready} overdue={signals.overdue} go={next => { setPage(next); setSelected(null); }} openEntity={openEntity} openMore={() => setCommandsOpen(true)} />
    {focusOpen && spec && state.ready ? <FocusRun spec={spec} saveField={saveField} onOpen={record => { openEntity(record.entity); setRecords([record]); setSelected(record); }} close={() => setFocusOpen(false)} /> : null}
    {commandsOpen ? <CommandPalette commands={commandList} close={() => setCommandsOpen(false)} findRecords={state.ready && spec ? findRecords : undefined} /> : null}
    {modal === 'coverage' ? <Modal title="Cobertura de tu copia" close={() => setModal(null)} wide><div className="modal-body">
      <p className="muted">Comprobaciones sobre la captura y la aplicación que estás utilizando.</p>
      <div className="check-list">{probe ? probe.checks.map(check => <div key={check.id}>{check.passed ? <CheckCircle2 size={19} className="green" /> : <Circle size={19} className="muted" />}<span>{check.label}</span><small>{check.passed ? 'Verificado' : 'Pendiente'}</small></div>) : <Spinner />}</div>
      <h3>Conciliación del origen</h3><p className="muted">{Object.values(state.reconciliation?.counts??{}).reduce((n,c)=>n+c.actual,0)} registros y {state.reconciliation?.actualLinks} relaciones conservadas en la captura.</p>
      <h3>Pendiente de cobertura</h3><ul className="plain-list">{spec?.coverage.unsupported.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="helper">Una copia completa de estos datos no equivale a reproducir todas las funciones del CRM. El paquete incluye los resultados de las pruebas de reinicio y red.</p>
    </div></Modal> : null}
  </div></TaskOutcomesHost>;
}
