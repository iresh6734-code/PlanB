import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Database, Download, LockKeyhole, Play, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import type { ContinuityStatus } from '../shared/operations.js';
import { api, post, download } from './api.js';
import { Modal, Spinner } from './components.js';
import { ConnectionDialog } from './ConnectionDialog.js';
import { StatusTag } from './WorkspaceUI.js';
import { ContinuityOperations } from './ContinuityOperations.js';
import { APP_VERSION } from '../shared/version.js';
import { CopyInspection } from './CopyInspection.js';
import {INVALID_RECOVERY_MESSAGE} from '../shared/recovery-integrity.js';
import { ContinuityHub } from './ContinuityHub.js';
import { WorkSummary } from './WorkSummary.js';
import { toWorkSource } from '../shared/work-summary.js';
import type { WorkSummaryResult } from './work-summary-client.js';
import { TabList, tabPanelProps } from './TabList.js';
import { CopyTimeline } from './app-shell/CopyTimeline.js';
import './continuity-home-hub.css';
type ContinuityTab='estado'|'evidencia'|'copias'|'operaciones';
const CONTINUITY_TABS=[{id:'estado',label:'Estado'},{id:'evidencia',label:'Evidencia e impacto'},{id:'copias',label:'Copias y archivo'},{id:'operaciones',label:'Operaciones'}] as const satisfies readonly {id:ContinuityTab;label:string}[];
/** Navegación hacia superficies que ya existen en la App. Una ausente NO se simula: el hub explica que se abre desde el menú. */
export interface ContinuityHubLinks { onOpenToday?: () => void; onOpenIntegrations?: () => void }
export function ContinuityHome({state,workspaceContextRevision,refresh,work,prepare,protect,exportCopy,connectRequest=0,onOpenToday,onOpenIntegrations,returnedFrom=null,onReturnHandled}:{state:AppState;workspaceContextRevision?:string|null;refresh:()=>Promise<AppState>;work:()=>void;prepare:()=>void;protect:()=>void;exportCopy:()=>void;connectRequest?:number;returnedFrom?:'integrations'|null;onReturnHandled?:()=>void}&ContinuityHubLinks) {
  const [status,setStatus]=useState<ContinuityStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connection,setConnection]=useState(false),[restore,setRestore]=useState(false);
  const [tab,setTab]=useState<ContinuityTab>('estado');
  const [file,setFile]=useState(''),[password,setPassword]=useState(''),[replace,setReplace]=useState(false);
  const load=()=>api<ContinuityStatus>('/v2/continuity').then(setStatus);
  // Remount the evidence consumer when the authorized App context changes, retiring its pending reads and visible results together.
  const hubRef=useRef<HTMLDetailsElement|null>(null),[returnNote,setReturnNote]=useState(false);
  const workOwner=JSON.stringify([workspaceContextRevision??null,state.ready,state.runtime]);
  const [workPin,setWorkPin]=useState<{owner:string;pin:string|null}|null>(null);
  const [workRead,setWorkRead]=useState<{owner:string;result:WorkSummaryResult}|null>(null);
  const receiveCopyContext=useCallback((pin:string|null)=>{
    setWorkPin(previous=>previous?.owner===workOwner&&previous.pin===pin?previous:{owner:workOwner,pin});
    if(pin===null)setWorkRead(null);
  },[workOwner]);
  const receiveWork=useCallback((result:WorkSummaryResult|null)=>setWorkRead(result?{owner:workOwner,result}:null),[workOwner]);
  const expectedWorkPin=workPin?.owner===workOwner?workPin.pin:null;
  const canReadWork=!state.ready||typeof workspaceContextRevision==='string'&&expectedWorkPin!==null;
  const workSource=workRead?.owner===workOwner&&workRead.result.kind==='read'?toWorkSource(workRead.result.summary):undefined;
  const hubNavigate=useMemo(()=>({'open-preparation':prepare,'open-export':exportCopy,'open-continuity':()=>{setTab('evidencia');requestAnimationFrame(()=>hubRef.current?.scrollIntoView({block:'start'}));},...(onOpenToday?{'open-today':onOpenToday}:{}),...(onOpenIntegrations?{'open-integrations':onOpenIntegrations}:{})}),[prepare,exportCopy,onOpenToday,onOpenIntegrations]);
  useEffect(()=>{if(!returnedFrom)return;setTab('evidencia');setReturnNote(true);const frame=requestAnimationFrame(()=>{const heading=hubRef.current?.querySelector<HTMLElement>('.cph > h2');if(heading){heading.tabIndex=-1;heading.focus();heading.scrollIntoView({block:'start'});}onReturnHandled?.();});return()=>cancelAnimationFrame(frame);},[returnedFrom]);
  useEffect(()=>{void load().catch(f=>setError((f as Error).message));const timer=setInterval(()=>void load().catch(()=>{}),2500);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(connectRequest)void api<{configured:boolean}>('/v2/auth/status').then(g=>g.configured?setConnection(true):protect()).catch(f=>setError(f.message));},[connectRequest]);
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await load();await refresh();}catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  const active=status?.jobs.find(j=>['queued','running'].includes(j.status));
  const latest=status?.captures[0],summary=status?.latestCapture;
  const report=status?.reports.find(r=>r.id===status.readiness?.reportId);
  const diagnosis=status?.readiness;
  const readinessLabel=diagnosis?({empty:'Necesitas una captura',blocked:'Prepara los datos del simulacro',untested:'Esta copia todavía no se ha probado',passed:'Simulacro superado',failed:'Hay procesos por revisar',expired:'Repite el simulacro de esta copia'})[diagnosis.status]:'';
  const production=status?.connection?.mode==='production_readonly'||state.snapshot?.source.isTestData===false;
  return <section className="continuity-home"><header className="page-header"><div><h1>Tu negocio puede seguir.</h1><p className="page-subtitle">Una copia utilizable. Una prueba que lo demuestra.</p></div><span className="badge">v{APP_VERSION} · {production?'Producción · lectura':'Local · Datos de ensayo'}</span></header>
    {error?<p className="error-box" role="alert">{error}</p>:null}
    {status?.recoveryIntegrity?.state==='invalid'?<p className="error-box" role="alert">{INVALID_RECOVERY_MESSAGE}</p>:null}
    <TabList label="Secciones de Continuidad" prefix="ct" tabs={CONTINUITY_TABS} value={tab} onChange={setTab}/>
    <div className="ct-panel ct-estado" {...tabPanelProps('ct','estado')} hidden={tab!=='estado'}>
      <div className="ct-main">
    <section className={'continuity-summary '+(status?.stale?'needs-attention':'')}>
      <ShieldCheck size={33}/><div><h2>{!latest?'Prepara tu primera copia':status?.stale?'Tu copia necesita actualizarse':'Tienes una copia disponible'}</h2>
      <p>{latest?'Última captura: '+new Date(latest.at).toLocaleString('es-ES'):'Elige los datos ficticios incluidos o conecta una cuenta de prueba de HubSpot.'}</p>
      {latest?<small>{Math.floor(status?.ageMinutes??0)} minutos de antigüedad · {summary?.records??'—'} registros en esta captura</small>:null}{latest?<div className="continuity-facts"><StatusTag tone={diagnosis?.status==='passed'?'success':diagnosis?.status==='untested'?'warning':'neutral'}>{diagnosis?.status==='passed'?'Prueba vigente':diagnosis?.status==='untested'?'Prueba pendiente':'Verificación por revisar'}</StatusTag><span>{status?.pendingChanges??0} cambios locales pendientes</span><span>{status?.operations?.paused?'Actualización en pausa':'Actualización habilitada'}</span></div>:null}</div>
      <button className="button primary" disabled={busy||!!active} onClick={()=>status?.session||state.ready&&(status?.pendingChanges??0)>0?work():latest?run(async()=>{await post('/v2/session/begin',{captureId:latest.id});work();}):state.runtime?setRestore(true):prepare()}>{latest?'Continuar trabajando':state.runtime?'Restaurar archivo':'Preparar aplicación'}<ArrowRight size={17}/></button>
    </section>
    {summary?<details className="capture-details ct-content"><summary>Ver contenido de esta copia</summary><div className="capture-details-body">
      <p><strong>{summary.name}</strong><span>{summary.source==='hubspot'?'HubSpot · Portal '+summary.accountId:'Conjunto de ensayo local'}</span></p>
      <dl className="capture-counts">{([['contacts','Clientes'],['companies','Empresas'],['deals','Oportunidades'],['tasks','Tareas']] as const).map(([id,label])=><div key={id}><dt>{label}</dt><dd>{summary.counts[id]}</dd></div>)}</dl>
      <p className="helper">{summary.relations} relaciones · {summary.pipelines} {summary.pipelines===1?'proceso comercial':'procesos comerciales'} · {summary.fields} campos conservados</p>
      {state.ready&&state.snapshot&&state.snapshot.id+':'+state.snapshot.capturedAt!==summary.id?<p className="helper">El espacio de trabajo conserva otra versión. Abrir esta copia requiere cerrar la sesión anterior y resolver los cambios pendientes.</p>:null}
    </div></details>:null}
    {status?.session?<div className="info-box"><Unplug size={20}/><div><strong>Sesión de continuidad abierta</strong><p>Importaciones e IA pausadas. Tus cambios se conservan. La devolución a HubSpot tiene su propio proceso de revisión.</p><div className="button-row"><button className="text-button" onClick={work}>Abrir trabajo</button><button className="text-button" onClick={()=>run(()=>post('/v2/session/end',{}))}>Cerrar sesión de continuidad</button></div></div></div>:null}
    {active?<div className="job-progress" role="status"><Spinner text={active.message}/><progress max="100" value={active.progress}/><button className="text-button" onClick={()=>run(()=>post('/v2/jobs/'+active.id+'/cancel',{}))}>Cancelar trabajo</button></div>:null}
      <article className="ct-verify"><div className="section-heading"><h2>Comprueba tu Plan B</h2><Play size={21}/></div><p>Prueba buscar y editar, avanzar una oportunidad, crear y completar una tarea, y reiniciar. En una copia aislada con red bloqueada.</p>
        <button className="button secondary" disabled={!latest||busy||!!active} onClick={()=>run(()=>post('/v2/drills',{captureId:latest!.id}))}>Probar mi Plan B</button>
        {diagnosis?<div className="drill-result"><strong className={diagnosis.status==='passed'?'green':diagnosis.status==='untested'||diagnosis.status==='empty'?'':'warning-text'} role="status">{readinessLabel}</strong>
          {diagnosis.issues.length?<ul>{diagnosis.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
          {diagnosis.status==='untested'&&!!status?.reports.length?<p className="helper">El informe anterior corresponde a otra captura. Ejecuta una prueba para comprobar esta copia.</p>:null}
          {report?<><small>{new Date(report.completedAt).toLocaleString('es-ES')} · {(report.durationMs/1000).toFixed(1)} s · {report.dataSource}</small>
            <ul>{report.checks.map(c=><li key={c.label}><span className={c.passed?'green':'warning-text'}>{c.passed?'✓':'·'}</span>{c.label}{!c.passed?<small>{c.detail}</small>:null}</li>)}</ul>
            <div className="button-row"><button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report?format=html','plan-b-informe-continuidad.html'))}><Download size={15}/>Informe para compartir</button>
              <button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report','plan-b-simulacro.json'))}>JSON</button></div>
            <p className="helper">Esta prueba ejercita un cliente, una oportunidad y una tarea. La devolución a HubSpot se valida por separado.</p></>:null}</div>:null}</article>      </div>
      <aside className="ct-rail" aria-label="Preparación y mantenimiento">
    {!state.runtime?<details className="capture-details" open><summary onClick={event => event.preventDefault()}>Preparación de tu Plan B</summary><ol className="setup-checklist">
      <li><span>{status?.protected?'✓':'1'} Proteger el acceso</span>{!status?.protected?<button className="text-button" onClick={protect}>Elegir contraseña</button>:null}</li>
      <li><span>{state.hubspotConfigured?'✓':'2'} Conectar y revisar alcance</span><button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>{status?.connection?'Portal '+status.connection.accountId+' · '+(production?'solo lectura':'ensayo'):'Conectar HubSpot'}</button></li>
      <li><span>{latest?'✓':'3'} Conservar una captura completa</span></li>
      <li><span>{diagnosis?.status==='passed'?'✓':'4'} Probar la misma copia</span></li>
      <li><span>{status?.recoveryCopy?.confirmedAt&&status.recoveryCopy.current?'✓':'5'} Preparar recuperación</span><button className="text-button" disabled={!state.ready} onClick={exportCopy}>Crear copia cifrada</button>{status?.recoveryCopy?.current&&!status.recoveryCopy.confirmedAt?<button className="text-button" onClick={()=>run(()=>post('/v3/recovery-copy/confirm',{storedSeparately:true,revision:status.recoveryCopy!.revision}))}>Confirmo que conservé la copia fuera de este PC y la contraseña por separado</button>:null}{status?.recoveryCopy&&!status.recoveryCopy.current?<p className="warning-text">La copia conservada corresponde a otra revisión. Exporta los cambios actuales.</p>:null}</li>
    </ol><p className="helper">Una carpeta por portal. La copia necesita el PC encendido para actualizarse. Una descarga no comprueba la restauración: ensáyala en otra carpeta.</p></details>:null}
      <article><div className="section-heading"><h2>Mantén la copia al día</h2><Clock3 size={21}/></div><p>Una captura cada hora mientras el ordenador esté encendido, conectado y los servicios estén habilitados. Aviso de antigüedad a los 75 minutos.</p>
        {status?.operations?<details className="maintenance-details" open={!!status.operations.error}><summary>Estado de las actualizaciones</summary><div className="operation-health"><strong>{status.operations.paused?'Actualización en pausa':'Servicios habilitados'}</strong><small>Último intento: {status.operations.lastAttempt?new Date(status.operations.lastAttempt).toLocaleString('es-ES'):'Todavía sin intentos'}</small><small>Última captura de conexión correcta: {status.operations.lastSuccess?new Date(status.operations.lastSuccess).toLocaleString('es-ES'):'Todavía sin resultado'}</small>{status.operations.error?<p role="alert" className="warning-text">{status.operations.error.message} {status.operations.error.action}</p>:null}</div></details>:null}
        {!state.runtime?<><label className="checkbox-label"><input type="checkbox" checked={status?.schedule.enabled??false} disabled={busy} onChange={e=>run(()=>post('/v2/schedule',{enabled:e.target.checked}))}/>Capturas y simulacro mensual automáticos</label>
        <div className="button-row"><button className="button secondary" disabled={busy||!!active||!status?.connected||!!status?.session} onClick={()=>run(()=>post('/v2/captures',{}))}><RefreshCw size={16}/>Capturar ahora</button>
          <button className="text-button" disabled={busy||!!status?.session} onClick={()=>run(()=>post('/v2/services',{enabled:!status?.connected}))}>{status?.connected?'Pausar servicios':'Habilitar servicios'}</button></div>
        <button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>Configurar conexión HubSpot</button>{!status?.connected?<p className="capture-disabled-reason">La captura está deshabilitada mientras los servicios estén en pausa. Revisa primero la conexión y habilítalos cuando corresponda.</p>:status?.session?<p className="capture-disabled-reason">Las capturas están pausadas durante la sesión de continuidad.</p>:null}</>:<p className="helper">Este paquete no contiene conectores externos.</p>}
        <p className="helper">No se ofrece un SLA con el PC apagado. Cada captura comprueba su portal; producción permanece solo en lectura.</p><button className="text-button" onClick={()=>run(()=>download('/v3/diagnostics','plan-b-diagnostico.json'))}>Descargar diagnóstico sin fichas ni claves</button></article>
      </aside>
    </div>
    <div className="ct-panel ct-evidencia" {...tabPanelProps('ct','evidencia')} hidden={tab!=='evidencia'}>
    <details className="chub-block" ref={hubRef} open data-testid="continuity-hub-block"><summary>Evidencia, mapa de impacto y ensayo de relevo</summary>
      <p className="helper">Qué copia tienes, qué se observó de ella y de la lectura de HubSpot, y qué podría impedir seguir trabajando. «Probar mi Plan B» comprueba tu copia en un entorno aislado; el ensayo de relevo practica exportar e importar con datos ficticios y no la sustituye.</p>
      {returnNote?<p className="chub-return" role="status" data-testid="return-note">Has vuelto de Integraciones. Lo guardado allí se lee de nuevo aquí; no se ha pedido nada al proveedor.</p>:null}
      {canReadWork?<WorkSummary key={workOwner+':'+(expectedWorkPin??'none')} expectedContext={expectedWorkPin} identityKey={workOwner} onOpenToday={onOpenToday} onSummary={receiveWork}/>:<p className="helper" role="status" data-testid="work-summary-awaiting-context">El resumen del trabajo espera una referencia autorizada de la copia. No se acredita ningún recuento mientras tanto.</p>}
      <ContinuityHub key={workspaceContextRevision??'unavailable'} workspaceContextRevision={workspaceContextRevision} navigate={hubNavigate} connectionKey={status?.connection?'portal:'+status.connection.accountId:null} evidenceLink="#/continuidad" extra={{work:workSource}} onCopyContext={receiveCopyContext}/>
    </details>
    </div>
    <div className="ct-panel ct-copias" {...tabPanelProps('ct','copias')} hidden={tab!=='copias'}>
      {status?<CopyTimeline status={status}/>:null}
      <section className="history-section"><div className="section-heading"><h2>Historial de capturas</h2><div className="button-row"><button className="text-button" onClick={()=>setRestore(true)}>Restaurar archivo</button><button className="text-button" onClick={protect}><LockKeyhole size={15}/>{status?.protected?'Protección configurada':'Proteger acceso local'}</button></div></div>
      {status?.captures.length?<div className="history-list">{status.captures.slice(0,12).map(item=><div key={item.id}><Database size={17}/><div><strong>{new Date(item.at).toLocaleString('es-ES')}</strong><small>{(item.bytes/1024).toFixed(0)} KB · Captura conciliada</small></div>
        <button className="text-button" disabled={busy||!!active||status.pendingChanges>0||!!status.session&&status.session.captureId!==item.id} onClick={()=>status.session?.captureId===item.id?work():run(async()=>{await post('/v2/session/begin',{captureId:item.id});work();})}>{status.session?.captureId===item.id?'Abrir trabajo':'Abrir copia'}<ArrowRight size={15}/></button></div>)}</div>:<p className="muted">Todavía no hay capturas verificadas.</p>}
      <p className="helper">Retención: hasta 24 capturas horarias y 30 diarias; las necesarias para una sesión pendiente se conservan. Límite local 2 GB.</p>
    </section>
    {!state.runtime?<CopyInspection contextKey={JSON.stringify([state.snapshot?.id,state.snapshot?.capturedAt,state.changes,state.generation?.approved])}/>:null}
    {status?.jobs.length?<details className="job-history"><summary>Trabajos recientes</summary>{status.jobs.slice(0,8).map(j=><div key={j.id}><strong>{({capture:'Captura',drill:'Simulacro',return:'Devolución'})[j.kind]}</strong><span>{({queued:'En cola',running:'En curso',succeeded:'Completado',failed:'Fallido',cancelled:'Cancelado',interrupted:'Interrumpido'})[j.status]}</span><small>{j.message}</small></div>)}</details>:null}
    </div>
    <div className="ct-panel ct-operaciones" {...tabPanelProps('ct','operaciones')} hidden={tab!=='operaciones'}>
    {status?<ContinuityOperations captures={status.captures} activeCaptureId={state.ready&&state.snapshot?state.snapshot.id+':'+state.snapshot.capturedAt:null} refreshContext={refresh}/>:null}
    </div>
    {connection?<ConnectionDialog close={()=>setConnection(false)} done={async()=>{await load();await refresh();setConnection(false);}}/>:null}
    {restore?<Modal title="Restaurar una copia" close={()=>setRestore(false)}><form className="settings-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await post('/v2/restore',{file,password,replace});setRestore(false);setFile('');setPassword('');});}}>
      <label className="field"><span>Archivo JSON de Plan B</span><input type="file" accept=".json" required onChange={async e=>{const selected=e.target.files?.[0];if(selected){if(selected.size>20_000_000){setError('El archivo supera 20 MB.');return;}setFile(await selected.text());}}}/></label><label className="field"><span>Contraseña de recuperación, si está cifrado</span><input type="password" value={password} autoComplete="off" onChange={e=>setPassword(e.target.value)}/></label>
      {status?.changes?<label className="checkbox-label"><input type="checkbox" required checked={replace} onChange={e=>setReplace(e.target.checked)}/>He guardado una exportación y quiero sustituir el espacio de trabajo.</label>:null}{error?<p className="error-box" role="alert">{error}</p>:null}<button className="button primary" disabled={busy||!file}>Validar y restaurar</button>
    </form></Modal>:null}
  </section>;
}
