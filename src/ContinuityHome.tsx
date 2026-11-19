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
import { buildContinuityReport, reportHtml } from './app-shell/continuity-report.js';
import { captureAutomation } from './app-shell/copy-timeline.js';
import { pollWhileVisible, useReadHealth } from './app-shell/poll.js';
import { captureRecordCount, describeCapture, workspaceCopy } from './app-shell/workspace-copy.js';
import { captureLedger, continuityReadiness, copyVitals, formatBytes, hourlyCaptures, jobStats, outageForecast, type LedgerFilter, type NextActionId, type StepId } from './app-shell/continuity-insights.js';
import './continuity-home-hub.css';
import './continuity-insights.css';
const LEDGER_FILTERS:readonly {id:LedgerFilter;label:string}[]=[{id:'all',label:'Todas'},{id:'today',label:'Hoy'},{id:'week',label:'7 días'},{id:'shrink',label:'Más pequeñas'}];
const LEDGER_PAGE=12;
const hourLabel=new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'});
export type ContinuityTab='estado'|'evidencia'|'copias'|'operaciones';
const CONTINUITY_TABS=[{id:'estado',label:'Estado'},{id:'evidencia',label:'Evidencia e impacto'},{id:'copias',label:'Copias y archivo'},{id:'operaciones',label:'Operaciones'}] as const satisfies readonly {id:ContinuityTab;label:string}[];
/** Navegación hacia superficies que ya existen en la App. Una ausente NO se simula: el hub explica que se abre desde el menú. */
export interface ContinuityHubLinks { onOpenToday?: () => void; onOpenIntegrations?: () => void }
export function ContinuityHome({state,workspaceContextRevision,refresh,work,prepare,protect,exportCopy,connectRequest=0,onOpenToday,onOpenIntegrations,returnedFrom=null,onReturnHandled,initialTab='estado',onStatus,onGuidedDrill}:{state:AppState;workspaceContextRevision?:string|null;refresh:()=>Promise<AppState>;work:()=>void;prepare:()=>void;protect:()=>void;exportCopy:()=>void;connectRequest?:number;returnedFrom?:'integrations'|null;onReturnHandled?:()=>void;initialTab?:ContinuityTab;onStatus?:(status:ContinuityStatus)=>void;onGuidedDrill?:()=>void}&ContinuityHubLinks) {
  const [status,setStatus]=useState<ContinuityStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connection,setConnection]=useState(false),[restore,setRestore]=useState(false);
  const [tab,setTab]=useState<ContinuityTab>(initialTab);
  const [file,setFile]=useState(''),[password,setPassword]=useState(''),[replace,setReplace]=useState(false);
  const [ledgerFilter,setLedgerFilter]=useState<LedgerFilter>('all'),[ledgerAll,setLedgerAll]=useState(false);
  // Cada lectura se entrega también a la App (avisos del menú); la referencia evita usar una función antigua desde el temporizador.
  const statusOut=useRef(onStatus);statusOut.current=onStatus;
  const readHealth=useReadHealth();
  const load=()=>api<ContinuityStatus>('/v2/continuity').then(value=>{setStatus(value);statusOut.current?.(value);readHealth.ok();});
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
  useEffect(()=>{void load().catch(f=>setError((f as Error).message));return pollWhileVisible(()=>void load().catch(readHealth.fail),2500);},[]);
  useEffect(()=>{if(connectRequest)void api<{configured:boolean}>('/v2/auth/status').then(g=>g.configured?setConnection(true):protect()).catch(f=>setError(f.message));},[connectRequest]);
  // Parte de continuidad: se genera en el navegador con el estado ya leído y se descarga; no envía nada a ningún sitio.
  const shareReport=()=>{if(!status)return;const html=reportHtml(buildContinuityReport(status,new Date(),APP_VERSION));const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='plan-b-parte-continuidad-'+new Date().toISOString().slice(0,10)+'.html';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10_000);};
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await load();await refresh();}catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  const active=status?.jobs.find(j=>['queued','running'].includes(j.status));
  const latest=status?.captures[0],summary=status?.latestCapture;
  const { activeId, latestReadiness: diagnosis } = workspaceCopy(state, status);
  const differentArchive = !!(activeId && latest && latest.id !== activeId);
  const continueActive = !!(status?.session || activeId && (differentArchive || (status?.pendingChanges ?? 0) > 0));
  const canOpenToday = !state.runtime && onOpenToday;
  const captureDateLabel = describeCapture(latest?.at).date;
  const activeDate = describeCapture(state.snapshot?.capturedAt).date;
  const automation = status ? captureAutomation(status) : null;
  const operationsDiagnostic = status ? <ContinuityOperations
    captures={status.captures}
    activeCaptureId={activeId}
    refreshContext={refresh}
  /> : null;
  const report=status?.reports.find(r=>r.id===diagnosis?.reportId && r.captureId===diagnosis?.captureId);
  const readinessLabel=diagnosis?({empty:'Necesitas una captura',blocked:'Prepara los datos del simulacro',untested:'Esta copia todavía no se ha probado',passed:'Simulacro superado',failed:'Hay procesos por revisar',expired:'Repite el simulacro de esta copia'})[diagnosis.status]:'';
  const production=status?.connection?.mode==='production_readonly'||state.snapshot?.source.isTestData===false;
  const insightContext={hubspotConfigured:!!state.hubspotConfigured,drill:diagnosis?.status??null,reportId:diagnosis?.reportId??null};
  const now=new Date();
  const readiness=status&&!state.runtime?continuityReadiness(status,insightContext,now):null;
  const vitals=status?copyVitals(status,insightContext,now):null;
  const outage=status?outageForecast(status,insightContext,now):null;
  const hours=status?.captures.length?hourlyCaptures(status.captures,now):null;
  const ledger=status?captureLedger(status.captures,now,ledgerFilter):null;
  const stats=status?jobStats(status.jobs):null;
  const step=(id:StepId)=>readiness?.steps.find(item=>item.id===id);
  const stepDetail=(id:StepId)=>{const item=step(id);return item?<small className="ct-step-detail">{item.detail}</small>:null;};
  const nextDisabled=(id:NextActionId)=>busy||(['refresh','resume','drill'].includes(id)&&!!active)||(id==='refresh'&&(!status?.connected||!!status?.session))||(id==='export'&&!state.ready)||(id==='drill'&&!latest);
  const runNext=(id:NextActionId)=>{
    if(id==='prepare')prepare();
    else if(id==='refresh')void run(()=>post('/v2/captures',{}));
    else if(id==='resume')void run(()=>post('/v2/services',{enabled:true}));
    else if(id==='drill'&&latest)void run(()=>post('/v2/drills',{captureId:latest.id}));
    else if(id==='protect')protect();
    else if(id==='connect')status?.protected?setConnection(true):protect();
    else if(id==='export')exportCopy();
    else if(id==='confirm')document.getElementById('ct-confirm-copy')?.focus();
  };
  let ledgerBudget=ledgerAll?Infinity:LEDGER_PAGE;
  const ledgerDays=(ledger?.days??[]).map(day=>{const entries=day.entries.slice(0,Math.max(0,ledgerBudget));ledgerBudget-=entries.length;return {...day,entries};}).filter(day=>day.entries.length);
  const ledgerHidden=(ledger?.shown??0)-ledgerDays.reduce((sum,day)=>sum+day.entries.length,0);
  return <section className="continuity-home"><header className="page-header"><div><h1>Continuidad</h1><p className="page-subtitle">Una copia utilizable y la prueba que lo demuestra.</p></div><div className="ct-head-side"><button type="button" className="button secondary" disabled={!status} aria-describedby="ct-share-help" onClick={shareReport}><Download size={15}/>Parte para compartir</button><p id="ct-share-help" className="ct-share-help">Página para enviar o imprimir: qué está demostrado y qué no, sin nombres de clientes ni identificadores.</p></div></header>
    {error?<p className="error-box" role="alert">{error}</p>:null}
    {readHealth.note&&!error?<p className="helper read-stale" role="status">{readHealth.note}</p>:null}
    {status?.recoveryIntegrity?.state==='invalid'?<p className="error-box" role="alert">{INVALID_RECOVERY_MESSAGE}</p>:null}
    <TabList label="Secciones de Continuidad" prefix="ct" tabs={CONTINUITY_TABS} value={tab} onChange={setTab}/>
    <div className="ct-panel ct-estado" {...tabPanelProps('ct','estado')} hidden={tab!=='estado'}>
      {readiness?<section className="ct-ready" data-level={readiness.level} aria-labelledby="ct-ready-title">
        <div className="ct-ready-verdict"><h2 id="ct-ready-title">{readiness.title}</h2>
          <p><span className="ct-ready-count">{readiness.done} de {readiness.total}</span> pasos de preparación hechos</p>
          <ol className="ct-ready-meter" aria-hidden="true">{readiness.steps.map(item=><li key={item.id} data-done={item.done?'true':'false'} title={item.label+': '+item.detail}/>)}</ol></div>
        <div className="ct-ready-next"><p>{readiness.next.detail}</p>
          {readiness.next.id!=='none'?<button type="button" className="button secondary" disabled={nextDisabled(readiness.next.id)} onClick={()=>runNext(readiness.next.id)}>{readiness.next.label}<ArrowRight size={15}/></button>:<span className="ct-ready-clear"><CheckCircle2 size={15}/>Nada pendiente</span>}</div>
      </section>:null}
      {vitals?<dl className="ct-vitals" aria-label="Constantes de la copia">{vitals.map(vital=><div key={vital.id} data-tone={vital.tone}><dt>{vital.label}</dt><dd className="ct-vital-value">{vital.value}</dd><dd className="ct-vital-note">{vital.note}</dd></div>)}</dl>:null}
      <div className="ct-main">
    <section className={'continuity-summary '+(status?.stale?'needs-attention':'')}>
      <ShieldCheck size={33}/><div><h2>{!latest?'Prepara tu primera copia':status?.stale?'Tu copia necesita actualizarse':'Tienes una copia disponible'}</h2>
      <p>{latest ? 'Última captura guardada: ' + (captureDateLabel ?? 'fecha no disponible') : state.runtime ? 'Restaura un archivo para abrir tu copia.' : 'Elige los datos ficticios incluidos o conecta una cuenta de prueba de HubSpot.'}</p>
      {latest ? <small>{summary && summary.id === latest.id ? captureRecordCount(summary.records) + ' en esta captura' : 'Recuento de esta captura no disponible'}{activeId && !differentArchive ? ' · Es la copia activa' : ''}</small> : null}
      {differentArchive ? <p><strong>Copia activa:</strong> {activeDate ?? 'fecha no disponible'}. Tu trabajo sigue en esta copia.</p> : null}
      {latest?<div className="continuity-facts"><StatusTag tone={diagnosis?.status==='passed'?'success':diagnosis?.status==='untested'?'warning':'neutral'}>{diagnosis?.status==='passed'?'Prueba vigente':diagnosis?.status==='untested'?'Prueba pendiente':'Verificación por revisar'}</StatusTag>{differentArchive?<span>Prueba de la última captura guardada</span>:null}<span>{status?.pendingChanges??0} cambios locales pendientes</span>{automation?<span>{automation.active?'Capturas automáticas habilitadas':automation.reason}</span>:null}</div>:null}</div>
      <button className="button primary" disabled={busy||!!active} onClick={()=>continueActive?work():latest?run(async()=>{await post('/v2/session/begin',{captureId:latest.id});work();}):state.runtime?setRestore(true):prepare()}>{differentArchive?'Continuar con la copia activa':latest?'Continuar trabajando':state.runtime?'Restaurar archivo':'Preparar aplicación'}<ArrowRight size={17}/></button>
    </section>
    {outage?<article className="ct-outage" data-tone={outage.tone} aria-labelledby="ct-outage-title"><div className="section-heading"><h2 id="ct-outage-title">Si HubSpot cae ahora</h2><Unplug size={19}/></div>
      <p className="ct-outage-verdict">{outage.headline}</p>
      <ul>{outage.lines.map(line=><li key={line.id} data-tone={line.tone}>{line.text}</li>)}</ul>
    </article>:null}
    {summary?<details className="capture-details ct-content"><summary>Ver contenido de esta copia</summary><div className="capture-details-body">
      <p><strong>{summary.name}</strong><span>{summary.source==='hubspot'?'HubSpot · Portal '+summary.accountId:'Conjunto de ensayo local'}</span></p>
      <dl className="capture-counts">{([['contacts','Clientes'],['companies','Empresas'],['deals','Oportunidades'],['tasks','Tareas']] as const).map(([id,label])=><div key={id}><dt>{label}</dt><dd>{summary.counts[id]}</dd></div>)}</dl>
      <p className="helper">{summary.relations} relaciones · {summary.pipelines} {summary.pipelines===1?'proceso comercial':'procesos comerciales'} · {summary.fields} campos conservados</p>
      {state.ready&&state.snapshot&&state.snapshot.id+':'+state.snapshot.capturedAt!==summary.id?<p className="helper">El espacio de trabajo conserva otra versión. Abrir esta copia requiere cerrar la sesión anterior y resolver los cambios pendientes.</p>:null}
    </div></details>:null}
    {status?.session?<div className="info-box"><Unplug size={20}/><div><strong>Sesión de continuidad abierta</strong><p>Importaciones e IA pausadas. Tus cambios se conservan. La devolución a HubSpot tiene su propio proceso de revisión.</p><div className="button-row"><button className="text-button" onClick={work}>Abrir trabajo</button><button className="text-button" onClick={()=>run(()=>post('/v2/session/end',{}))}>Cerrar sesión de continuidad</button></div></div></div>:null}
    {active?<div className="job-progress" role="status"><Spinner text={active.message}/><progress max="100" value={active.progress}/><button className="text-button" onClick={()=>run(()=>post('/v2/jobs/'+active.id+'/cancel',{}))}>Cancelar trabajo</button></div>:null}
      <article className="ct-verify"><div className="section-heading"><h2>Comprueba tu Plan B</h2><Play size={21}/></div><p>Prueba buscar y editar, avanzar una oportunidad, crear y completar una tarea, y reiniciar. En una copia aislada con red bloqueada.</p>
        <div className="button-row ct-verify-actions"><button className="button secondary" disabled={!latest||busy||!!active} onClick={()=>run(()=>post('/v2/drills',{captureId:latest!.id}))}>Probar mi Plan B</button>{onGuidedDrill?<button type="button" className="text-button" title="Cinco gestos con tu copia, como si el CRM se hubiera caído. No guarda nada." onClick={onGuidedDrill}>Práctica guiada: un día sin CRM (5 min)</button>:null}</div>
        {diagnosis?<div className="drill-result"><strong className={diagnosis.status==='passed'?'green':diagnosis.status==='untested'||diagnosis.status==='empty'?'':'warning-text'} role="status">{readinessLabel}</strong>
          {diagnosis.issues.length?<ul>{diagnosis.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
          {diagnosis.status==='untested'&&!!status?.reports.length?<p className="helper">El informe anterior corresponde a otra captura. Ejecuta una prueba para comprobar esta copia.</p>:null}
          {report?<><small>{new Date(report.completedAt).toLocaleString('es-ES')} · {(report.durationMs/1000).toFixed(1)} s · {report.dataSource}</small>
            <ul>{report.checks.map(c=><li key={c.label}><span className={c.passed?'green':'warning-text'}>{c.passed?'✓':'·'}</span>{c.label}{!c.passed?<small>{c.detail}</small>:null}</li>)}</ul>
            <div className="button-row"><button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report?format=html','plan-b-informe-continuidad.html'))}><Download size={15}/>Informe para compartir</button>
              <button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report','plan-b-simulacro.json'))}>JSON</button></div>
            <p className="helper">Esta prueba ejercita un cliente, una oportunidad y una tarea. La devolución a HubSpot se valida por separado.</p></>:null}</div>:null}</article>      </div>
      <aside className="ct-rail" aria-label="Preparación y mantenimiento">
    {!state.runtime?<details className="capture-details" open><summary onClick={event => event.preventDefault()}>Preparación de tu Plan B</summary>{readiness?<p className="ct-steps-progress"><span className="ct-ready-count">{readiness.done} de {readiness.total}</span> completados</p>:null}<ol className="setup-checklist ct-steps">
      <li data-done={step('protect')?.done?'true':'false'}><span>{status?.protected?'✓':'1'} Proteger el acceso</span>{stepDetail('protect')}{!status?.protected?<button className="text-button" onClick={protect}>Elegir contraseña</button>:null}</li>
      <li data-done={step('connect')?.done?'true':'false'}><span>{state.hubspotConfigured?'✓':'2'} Conectar y revisar alcance</span><button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>{status?.connection?'Portal '+status.connection.accountId+' · '+(production?'solo lectura':'ensayo'):'Conectar HubSpot'}</button></li>
      <li data-done={step('capture')?.done?'true':'false'}><span>{latest?'✓':'3'} Conservar una captura completa</span>{stepDetail('capture')}</li>
      <li data-done={step('drill')?.done?'true':'false'}><span>{diagnosis?.status==='passed'?'✓':'4'} Probar la misma copia</span>{stepDetail('drill')}</li>
      <li data-done={step('recovery')?.done?'true':'false'}><span>{status?.recoveryCopy?.confirmedAt&&status.recoveryCopy.current?'✓':'5'} Preparar recuperación</span>{stepDetail('recovery')}<button className="text-button" disabled={!state.ready} onClick={exportCopy}>Crear copia cifrada</button>{status?.recoveryCopy?.current&&!status.recoveryCopy.confirmedAt?<button id="ct-confirm-copy" className="text-button" onClick={()=>run(()=>post('/v3/recovery-copy/confirm',{storedSeparately:true,revision:status.recoveryCopy!.revision}))}>Confirmo que conservé la copia fuera de este PC y la contraseña por separado</button>:null}{status?.recoveryCopy&&!status.recoveryCopy.current?<p className="warning-text">La copia conservada corresponde a otra revisión. Exporta los cambios actuales.</p>:null}</li>
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
      {status?<CopyTimeline status={status} onOpenStatus={()=>{setTab('estado');requestAnimationFrame(()=>document.getElementById('ct-tab-estado')?.focus());}}/>:null}
      {hours?<section className="ct-hours" aria-labelledby="ct-hours-title"><div className="section-heading"><h2 id="ct-hours-title">Últimas 24 horas</h2><span className="ct-hours-count"><span className="ct-ready-count">{hours.covered} de 24</span> horas con captura</span></div>
        <ol className="ct-hours-ruler" aria-hidden="true">{hours.slots.map(slot=><li key={slot.at.getTime()} data-count={Math.min(slot.count,3)} data-current={slot.current?'true':undefined} title={hourLabel.format(slot.at)+' · '+(slot.count?slot.count+(slot.count===1?' captura':' capturas'):'sin captura')}><span>{slot.at.getHours()%6===0?String(slot.at.getHours()).padStart(2,'0')+' h':''}</span></li>)}</ol>
        <p className="helper">{automation?.active?'Con las capturas automáticas activas, cada hora con el PC encendido debería tener su marca.':'Las capturas automáticas no están activas: los huecos son esperables.'}</p>
      </section>:null}
      <section className="history-section"><div className="section-heading"><h2>Historial de capturas</h2><div className="button-row"><button className="text-button" onClick={()=>setRestore(true)}>Restaurar archivo</button><button className="text-button" onClick={protect}><LockKeyhole size={15}/>{status?.protected?'Protección configurada':'Proteger acceso local'}</button></div></div>
      {status?.captures.length&&ledger?<>
        <div className="ct-ledger-tools"><div className="ct-chips" role="group" aria-label="Filtrar capturas">{LEDGER_FILTERS.map(option=><button key={option.id} type="button" className="ct-chip" aria-pressed={ledgerFilter===option.id} onClick={()=>{setLedgerFilter(option.id);setLedgerAll(false);}}>{option.label}{option.id==='shrink'&&ledger.shrinks?<b>{ledger.shrinks}</b>:null}</button>)}</div>
          <p className="ct-ledger-sum">{ledger.total} {ledger.total===1?'captura':'capturas'} · {formatBytes(status.captures.reduce((sum,item)=>sum+item.bytes,0))} · media {formatBytes(ledger.averageBytes)}</p></div>
        {ledgerDays.length?<div className="history-list ct-ledger">{ledgerDays.map(day=><section key={day.key} className="ct-ledger-day" aria-label={day.label}><h3><span>{day.label}</span><small>{day.entries.length} · {formatBytes(day.bytes)}</small></h3>
          {day.entries.map(item=><div key={item.id} className="ct-ledger-row" data-shrink={item.shrink?'true':undefined}><Database size={16}/><div><strong>{hourLabel.format(new Date(item.at))}</strong><small>{(item.bytes/1024).toFixed(0)} KB · Captura conciliada</small>{item.delta!==null&&item.delta!==0?<small className="ct-ledger-delta" data-dir={item.delta>0?'up':'down'}>{(item.delta>0?'+':'−')+formatBytes(Math.abs(item.delta))}{item.shrink?' · más pequeña que la anterior: revisa el alcance':''}</small>:null}</div>
            <button className="text-button" disabled={busy||!!active||status.pendingChanges>0||!!status.session&&status.session.captureId!==item.id} onClick={()=>status.session?.captureId===item.id?work():run(async()=>{await post('/v2/session/begin',{captureId:item.id});work();})}>{status.session?.captureId===item.id?'Abrir trabajo':'Abrir copia'}<ArrowRight size={15}/></button></div>)}</section>)}</div>:<p className="muted ui-empty">Ninguna captura coincide con este filtro.</p>}
        {ledgerHidden>0?<button type="button" className="text-button ct-ledger-more" onClick={()=>setLedgerAll(true)}>Mostrar {ledgerHidden} {ledgerHidden===1?'captura más':'capturas más'}</button>:null}
      </>:<p className="muted ui-empty">Todavía no hay capturas verificadas.</p>}
      <p className="helper">Retención: hasta 24 capturas horarias y 30 diarias; las necesarias para una sesión pendiente se conservan. Límite local 2 GB.</p>
    </section>
    {!state.runtime?<CopyInspection contextKey={JSON.stringify([state.snapshot?.id,state.snapshot?.capturedAt,state.changes,state.generation?.approved])}/>:null}
    {status?.jobs.length?<details className="job-history"><summary>Trabajos recientes</summary>{status.jobs.slice(0,8).map(j=><div key={j.id}><strong>{({capture:'Captura',drill:'Simulacro',return:'Devolución'})[j.kind]}</strong><span>{({queued:'En cola',running:'En curso',succeeded:'Completado',failed:'Fallido',cancelled:'Cancelado',interrupted:'Interrumpido'})[j.status]}</span><small>{j.message}</small></div>)}</details>:null}
    </div>
    <div className="ct-panel ct-operaciones" {...tabPanelProps('ct','operaciones')} hidden={tab!=='operaciones'}>
      {stats?<section className="ct-reliability" aria-labelledby="ct-rel-title"><div className="section-heading"><h2 id="ct-rel-title">Fiabilidad de los procesos</h2>{stats.rate!==null?<span className="ct-rel-rate" data-tone={stats.rate>=95?'ok':stats.rate>=75?'warn':'danger'}><span className="ct-ready-count">{stats.rate} %</span> correctos</span>:null}</div>
        {stats.kinds.length?<ul className="ct-rel-list">{stats.kinds.map(kind=>{const finished=kind.succeeded+kind.failed;return <li key={kind.kind}>
          <strong>{kind.label}</strong>
          <span className="ct-rel-bar" aria-hidden="true"><i style={{width:(finished?kind.succeeded/finished*100:0)+'%'}}/></span>
          <span className="ct-rel-figure">{kind.succeeded} de {finished} correctos{kind.total>finished?' · '+(kind.total-finished)+' sin terminar o cancelados':''}</span>
          {kind.lastFailure?<small className="ct-rel-fail">Último fallo, {new Date(kind.lastFailure.at).toLocaleString('es-ES')}: {kind.lastFailure.message||'sin mensaje'}</small>:null}
        </li>;})}</ul>:<p className="muted ui-empty">Todavía no hay trabajos registrados en esta copia.</p>}
        <p className="helper">Cuenta los trabajos que conserva tu copia local{stats.running?' ('+stats.running+' en curso)':''}; los cancelados no cuentan como fallo.</p>
      </section>:null}
      {canOpenToday ? <>
        <div className="ct-operations-route">
          <p>Abre Hoy para priorizar y gestionar tareas de la copia activa.</p>
          <button type="button" className="button primary" onClick={canOpenToday}>Abrir cola de Hoy <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <details className="ct-operations-details">
          <summary>Consultar diagnóstico de tareas y cambios</summary>
          {operationsDiagnostic}
        </details>
      </> : operationsDiagnostic}
    </div>
    {connection?<ConnectionDialog close={()=>setConnection(false)} done={async()=>{await load();await refresh();setConnection(false);}}/>:null}
    {restore?<Modal title="Restaurar una copia" close={()=>setRestore(false)}><form className="settings-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await post('/v2/restore',{file,password,replace});setRestore(false);setFile('');setPassword('');});}}>
      <label className="field"><span>Archivo JSON de Plan B</span><input type="file" accept=".json" required onChange={async e=>{const selected=e.target.files?.[0];if(selected){if(selected.size>20_000_000){setError('El archivo supera 20 MB.');return;}setFile(await selected.text());}}}/></label><label className="field"><span>Contraseña de recuperación, si está cifrado</span><input type="password" value={password} autoComplete="off" onChange={e=>setPassword(e.target.value)}/></label>
      {status?.changes?<label className="checkbox-label"><input type="checkbox" required checked={replace} onChange={e=>setReplace(e.target.checked)}/>He guardado una exportación y quiero sustituir el espacio de trabajo.</label>:null}{error?<p className="error-box" role="alert">{error}</p>:null}<button className="button primary" disabled={busy||!file}>Validar y restaurar</button>
    </form></Modal>:null}
  </section>;
}
