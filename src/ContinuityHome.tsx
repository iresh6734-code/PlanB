import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, CalendarRange, Check, CheckCircle2, ChevronDown, Circle, Clock3, Database, Download, FileDown, LockKeyhole, Play, RefreshCw, ShieldCheck, Siren, Unplug } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import type { ContinuityStatus } from '../shared/operations.js';
import { api, post, download } from './api.js';
import { Modal, Spinner } from './components.js';
import { ConnectionDialog } from './ConnectionDialog.js';
import { StatusTag } from './WorkspaceUI.js';
import { ContinuityOperations, type ComparePreset } from './ContinuityOperations.js';
import { previousCapture } from './app-shell/copy-diff.js';
import { APP_VERSION } from '../shared/version.js';
import { CopyInspection } from './CopyInspection.js';
import {INVALID_RECOVERY_MESSAGE} from '../shared/recovery-integrity.js';
import { ContinuityHub } from './ContinuityHub.js';
import { ContinuityEvidence } from './app-shell/lazy-pages.js';
import { WorkSummary } from './WorkSummary.js';
import { toWorkSource } from '../shared/work-summary.js';
import type { WorkSummaryResult } from './work-summary-client.js';
import { TabList, tabPanelProps } from './TabList.js';
import { CopyTimeline } from './app-shell/CopyTimeline.js';
import { buildContinuityReport, reportHtml } from './app-shell/continuity-report.js';
import { monthlyReport, monthlyReportHtml } from './app-shell/monthly-report.js';
import { continuitySeal, sealHtml } from './app-shell/continuity-seal.js';
import { SealCard } from './app-shell/ContinuitySeal.js';
import { ProBadge } from './app-shell/ProBadge.js';
import { captureAutomation } from './app-shell/copy-timeline.js';
import { pollWhileVisible, useReadHealth } from './app-shell/poll.js';
import { captureRecordCount, describeCapture, workspaceCopy } from './app-shell/workspace-copy.js';
import { startContingency } from './app-shell/contingency.js';
import { clockTime, durationText } from './app-shell/contingency-text.js';
import { useContingency, useLastIncident } from './app-shell/useContingency.js';
import { downloadIncident } from './app-shell/incident-download.js';
import { captureLedger, continuityReadiness, copyVitals, drillCalendar, DRILL_EVERY_DAYS, DRILL_SOON_DAYS, formatBytes, hourlyCaptures, jobStats, outageForecast, READINESS_OUTAGE_LINES, type LedgerFilter, type NextActionId, type StepId } from './app-shell/continuity-insights.js';
import './continuity-home-hub.css';
import { DowntimeCard } from './app-shell/DowntimeCard.js';
import { coverageStatement, notCopiedLine } from './app-shell/coverage.js';
import { shrinkText } from '../shared/capture-quarantine.js';
import { BrandPicker } from './app-shell/BrandPicker.js';
import { readBrand } from './app-shell/brand-store.js';
import { coveredHours, formatHours } from '../shared/downtime-cost.js';
import './continuity-insights.css';
import './continuity-evidence.css';
import { LEDGER_FILTERS, nextActionBlocked, pageLedger } from './app-shell/continuity-home-logic.js';
const hourLabel=new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'});
export type ContinuityTab='estado'|'evidencia'|'copias'|'operaciones';
const CONTINUITY_TABS=[{id:'estado',label:'Estado'},{id:'evidencia',label:'Evidencia e impacto'},{id:'copias',label:'Copias y archivo'},{id:'operaciones',label:'Operaciones'}] as const satisfies readonly {id:ContinuityTab;label:string}[];
/** Navegación hacia superficies que ya existen en la App. Una ausente NO se simula: el hub explica que se abre desde el menú. */
export interface ContinuityHubLinks { onOpenToday?: () => void; onOpenIntegrations?: () => void }
export function ContinuityHome({state,workspaceContextRevision,refresh,work,prepare,protect,exportCopy,onCoverage,connectRequest=0,onOpenToday,onOpenIntegrations,returnedFrom=null,drillNote=null,onReturnHandled,initialTab='estado',onStatus,onGuidedDrill}:{state:AppState;workspaceContextRevision?:string|null;refresh:()=>Promise<AppState>;work:()=>void;prepare:()=>void;protect:()=>void;exportCopy:()=>void;/** B4.5: la cobertura de la copia vive aquí y en la paleta, no en la barra de las listas. */onCoverage?:()=>void;connectRequest?:number;returnedFrom?:'integrations'|'drill'|null;drillNote?:string|null;onReturnHandled?:()=>void;initialTab?:ContinuityTab;onStatus?:(status:ContinuityStatus)=>void;onGuidedDrill?:()=>void}&ContinuityHubLinks) {
  const [status,setStatus]=useState<ContinuityStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connection,setConnection]=useState(false),[restore,setRestore]=useState(false);
  const [tab,setTab]=useState<ContinuityTab>(initialTab),[scenariosOpen,setScenariosOpen]=useState(false);
  const [file,setFile]=useState(''),[password,setPassword]=useState(''),[replace,setReplace]=useState(false);
  const [ledgerFilter,setLedgerFilter]=useState<LedgerFilter>('all'),[ledgerAll,setLedgerAll]=useState(false);
  const [comparePreset,setComparePreset]=useState<ComparePreset|null>(null);
  // Cada lectura se entrega también a la App (avisos del menú); la referencia evita usar una función antigua desde el temporizador.
  const statusOut=useRef(onStatus);statusOut.current=onStatus;
  const readHealth=useReadHealth();
  // R1/R2 · Modo contingencia y expediente del último incidente (solo horas en este navegador).
  const contingency=useContingency(),lastIncident=useLastIncident(),[incidentNote,setIncidentNote]=useState(''),[incidentBusy,setIncidentBusy]=useState(false);
  const saveIncident=(format:'html'|'json')=>{if(!lastIncident)return;setIncidentBusy(true);setIncidentNote('');const labels=Object.fromEntries((state.spec?.entities??[]).map(item=>[item.id,item.label]));void downloadIncident(lastIncident,format,labels).then(setIncidentNote,f=>setIncidentNote(f instanceof Error?f.message:'No se pudo generar el expediente.')).finally(()=>setIncidentBusy(false));};
  const load=()=>api<ContinuityStatus>('/v2/continuity').then(value=>{setStatus(value);statusOut.current?.(value);readHealth.ok();});
  // Remount the evidence consumer when the authorized App context changes, retiring its pending reads and visible results together.
  const hubRef=useRef<HTMLDetailsElement|null>(null),[returnNote,setReturnNote]=useState<'integrations'|'drill'|null>(null);
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
  useEffect(()=>{if(!returnedFrom)return;setTab('evidencia');setReturnNote(returnedFrom);const frame=requestAnimationFrame(()=>{const heading=(returnedFrom==='drill'?hubRef.current?.querySelector<HTMLElement>('.cpp-head > h2'):null)??hubRef.current?.querySelector<HTMLElement>('.cph > h2');if(heading){heading.tabIndex=-1;heading.focus();heading.scrollIntoView({block:'start'});}onReturnHandled?.();});return()=>cancelAnimationFrame(frame);},[returnedFrom]);
  useEffect(()=>{void load().catch(f=>setError((f as Error).message));return pollWhileVisible(()=>void load().catch(readHealth.fail),2500);},[]);
  useEffect(()=>{if(connectRequest)void api<{configured:boolean}>('/v2/auth/status').then(g=>g.configured?setConnection(true):protect()).catch(f=>setError(f.message));},[connectRequest]);
  // Parte de continuidad: se genera en el navegador con el estado ya leído y se descarga; no envía nada a ningún sitio.
  const saveHtml=(html:string,name:string)=>{const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10_000);};
  const shareReport=()=>{if(!status)return;saveHtml(reportHtml(buildContinuityReport(status,new Date(),APP_VERSION),readBrand()),'plan-b-parte-continuidad-'+new Date().toISOString().slice(0,10)+'.html');};
  const shareMonthly=()=>{if(!status)return;const report=monthlyReport(status,new Date());saveHtml(monthlyReportHtml(report,APP_VERSION,seal?sealHtml(seal):'',readBrand()),'plan-b-informe-'+report.current.month+'.html');};
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await load();await refresh();}catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  const active=status?.jobs.find(j=>['queued','running'].includes(j.status));
  const latest=status?.captures[0],summary=status?.latestCapture;
  const { activeId, latestReadiness: diagnosis } = workspaceCopy(state, status);
  const differentArchive = !!(activeId && latest && latest.id !== activeId);
  const continueActive = !!(status?.session || activeId && (differentArchive || (status?.pendingChanges ?? 0) > 0));
  // Misión maestra A2: la última captura encogió frente a la anterior y está retenida; se ofrece la anterior o confirmarla.
  const held=latest&&!continueActive?status?.quarantine?.[latest.id]:undefined;
  const previousGood=held?status?.captures.find(item=>item.id!==latest!.id&&!status.quarantine?.[item.id]):undefined;
  const canOpenToday = !state.runtime && onOpenToday;
  const captureDateLabel = describeCapture(latest?.at).date;
  const activeDate = describeCapture(state.snapshot?.capturedAt).date;
  const automation = status ? captureAutomation(status) : null;
  const operationsDiagnostic = status ? <ContinuityOperations
    captures={status.captures}
    activeCaptureId={activeId}
    refreshContext={refresh}
    comparePreset={comparePreset}
  /> : null;
  // «Ver qué falta»: compara una captura más pequeña con la anterior en Operaciones › Qué cambió (solo lectura).
  const compareWithPrevious=(id:string)=>{const previous=status?previousCapture(status.captures,id):null;if(!previous)return;setComparePreset({from:previous.id,to:id,nonce:Date.now()});setTab('operaciones');requestAnimationFrame(()=>{const details=document.querySelector<HTMLDetailsElement>('.ct-operations-details');if(details)details.open=true;document.querySelector('.continuity-operations')?.scrollIntoView({block:'start'});});};
  const report=status?.reports.find(r=>r.id===diagnosis?.reportId && r.captureId===diagnosis?.captureId);
  const readinessLabel=diagnosis?({empty:'Necesitas una captura',blocked:'Prepara los datos del simulacro',untested:'Esta copia todavía no se ha probado',passed:'Simulacro superado',failed:'Hay procesos por revisar',expired:'Repite el simulacro de esta copia'})[diagnosis.status]:'';
  const production=status?.connection?.mode==='production_readonly'||state.snapshot?.source.isTestData===false;
  const insightContext={hubspotConfigured:!!state.hubspotConfigured,drill:diagnosis?.status??null,reportId:diagnosis?.reportId??null};
  const now=new Date();
  const readiness=status&&!state.runtime?continuityReadiness(status,insightContext,now):null;
  const seal=status&&readiness?continuitySeal(status,{done:readiness.done,total:readiness.total,missing:readiness.steps.filter(item=>!item.done).map(item=>item.label)},now):null;
  const vitals=status?copyVitals(status,insightContext,now):null;
  const outage=status?outageForecast(status,insightContext,now):null;
  const coverage=state.spec?coverageStatement(state.spec,summary?.counts??null):null;
  const hours=status?.captures.length?hourlyCaptures(status.captures,now):null;
  const fresh=status?.captures.length?coveredHours(status.captures,new Date(now.getTime()-86_400_000),now):null;
  const ledger=status?captureLedger(status.captures,now,ledgerFilter):null;
  const stats=status?jobStats(status.jobs):null;
  const calendar=status&&!state.runtime?drillCalendar(status,now):null;
  const step=(id:StepId)=>readiness?.steps.find(item=>item.id===id);
  const stepDetail=(id:StepId)=>{const item=step(id);return item?<small className="ct-step-detail">{item.detail}</small>:null;};
  const nextDisabled=(id:NextActionId)=>nextActionBlocked(id,{busy,jobRunning:!!active,connected:!!status?.connected,inSession:!!status?.session,ready:!!state.ready,hasCapture:!!latest});
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
  const {days:ledgerDays,hidden:ledgerHidden}=pageLedger(ledger?.days??[],ledger?.shown??0,ledgerAll);
  return <section className="continuity-home"><header className="page-header"><div><h1>Continuidad</h1><p className="page-subtitle">Una copia utilizable y la prueba que lo demuestra.</p></div><div className="ct-head-side">{/* Misión maestra B4.2: los informes van juntos en un menú; la cabecera no compite con la acción principal. */}<details className="ct-reports"><summary className="button secondary"><FileDown size={15} aria-hidden="true"/>Informes<ChevronDown size={14} aria-hidden="true"/></summary><div className="ct-reports-menu"><p id="ct-share-help" className="ct-share-help">Para enviar o imprimir, sin nombres de clientes ni identificadores.</p><div className="ct-head-actions"><button type="button" className="button secondary" disabled={!status} aria-describedby="ct-share-help" onClick={shareReport}><Download size={15}/>Parte para compartir</button><button type="button" className="button secondary" disabled={!status} aria-describedby="ct-share-help" onClick={shareMonthly}><CalendarRange size={15}/>Informe del mes</button></div><BrandPicker/></div></details></div></header>
    {error?<p className="error-box" role="alert">{error}</p>:null}
    {readHealth.note&&!error?<p className="helper read-stale" role="status">{readHealth.note}</p>:null}
    {status?.recoveryIntegrity?.state==='invalid'?<p className="error-box" role="alert">{INVALID_RECOVERY_MESSAGE}</p>:null}
    <TabList label="Secciones de Continuidad" prefix="ct" tabs={CONTINUITY_TABS} value={tab} onChange={setTab}/>
    <div className="ct-panel ct-estado" {...tabPanelProps('ct','estado')} hidden={tab!=='estado'}>
      {/* Misión maestra B4.2 · UN índice de preparación: el veredicto, los cinco pasos con su acción y el siguiente paso como
          única acción principal de la pestaña. Antes la preparación se decía cuatro veces (veredicto, sello, lista lateral y aviso). */}
      {readiness?<section className="ct-ready" data-level={readiness.level} aria-labelledby="ct-ready-title">
        <div className="ct-ready-verdict"><h2 id="ct-ready-title">{readiness.title}</h2>
          <p><span className="ct-ready-count">{readiness.done} de {readiness.total}</span> pasos de preparación hechos</p></div>
        <div className="ct-ready-next"><p>{readiness.next.detail}</p>
          {readiness.next.id!=='none'?<button type="button" className="button primary" disabled={nextDisabled(readiness.next.id)} onClick={()=>runNext(readiness.next.id)}>{readiness.next.label}<ArrowRight size={15}/></button>:<span className="ct-ready-clear"><CheckCircle2 size={15}/>Nada pendiente</span>}</div>
        <ol className="ct-ready-steps" aria-label="Pasos de preparación">
          <li data-done={step('protect')?.done?'true':'false'}><span className="ct-step-name">{step('protect')?.done?<Check size={13} aria-hidden="true"/>:<Circle size={11} aria-hidden="true"/>}Proteger el acceso</span>{stepDetail('protect')}{!status?.protected?<button className="text-button" onClick={protect}>Elegir contraseña</button>:null}</li>
          <li data-done={step('connect')?.done?'true':'false'}><span className="ct-step-name">{step('connect')?.done?<Check size={13} aria-hidden="true"/>:<Circle size={11} aria-hidden="true"/>}Conectar y revisar alcance</span><button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>{status?.connection?'Portal '+status.connection.accountId+' · '+(production?'solo lectura':'ensayo'):'Conectar HubSpot'}</button></li>
          <li data-done={step('capture')?.done?'true':'false'}><span className="ct-step-name">{step('capture')?.done?<Check size={13} aria-hidden="true"/>:<Circle size={11} aria-hidden="true"/>}Conservar una captura completa</span>{stepDetail('capture')}</li>
          <li data-done={step('drill')?.done?'true':'false'}><span className="ct-step-name">{step('drill')?.done?<Check size={13} aria-hidden="true"/>:<Circle size={11} aria-hidden="true"/>}Probar la misma copia</span>{stepDetail('drill')}</li>
          <li data-done={step('recovery')?.done?'true':'false'}><span className="ct-step-name">{step('recovery')?.done?<Check size={13} aria-hidden="true"/>:<Circle size={11} aria-hidden="true"/>}Preparar recuperación</span>{stepDetail('recovery')}<button className="text-button" disabled={!state.ready} onClick={exportCopy}>Crear copia cifrada</button>{status?.recoveryCopy?.current&&!status.recoveryCopy.confirmedAt?<button id="ct-confirm-copy" className="text-button" onClick={()=>run(()=>post('/v3/recovery-copy/confirm',{storedSeparately:true,revision:status.recoveryCopy!.revision}))}>Confirmo que conservé la copia fuera de este PC y la contraseña por separado</button>:null}{status?.recoveryCopy&&!status.recoveryCopy.current?<p className="warning-text">La copia conservada corresponde a otra revisión. Exporta los cambios actuales.</p>:null}</li>
        </ol>
      </section>:null}
      {state.snapshot&&!state.runtime?<section className="ct-contingency" data-active={contingency?'true':undefined} aria-labelledby="ct-contingency-title">
        <span className="ct-contingency-icon" aria-hidden="true"><Siren size={18}/></span>
        <div className="ct-contingency-body"><h2 id="ct-contingency-title">{contingency?'Contingencia en curso desde las '+clockTime(contingency.startedAt):'¿HubSpot no responde?'}</h2>
          <p>{contingency?'La banda de arriba lleva el reloj y los primeros pasos. Termínala cuando HubSpot vuelva para guardar el expediente.':'Activa el modo contingencia: Hoy se centra en lo vencido y lo que vence en 24 horas, Cambios te recuerda no devolver todavía y Plan B cronometra el incidente.'}</p>
          {!contingency&&lastIncident?<p className="ct-contingency-last">Último incidente: {describeCapture(lastIncident.startedAt).date??clockTime(lastIncident.startedAt)} · {durationText(lastIncident.startedAt,lastIncident.endedAt)}</p>:null}
          {incidentNote?<p className="ct-contingency-note" role="status">{incidentNote}</p>:null}</div>
        <div className="ct-contingency-actions">{contingency?null:<button type="button" className="button secondary ct-contingency-start" onClick={()=>startContingency(new Date())}><Siren size={15}/>Activar modo contingencia</button>}
          {!contingency&&lastIncident?<><button type="button" className="button secondary" disabled={incidentBusy} onClick={()=>saveIncident('html')}><FileDown size={15}/>Expediente<ProBadge feature="incident-file" decorative/></button><button type="button" className="text-button" disabled={incidentBusy} onClick={()=>saveIncident('json')}>JSON con huella</button></>:null}</div>
      </section>:null}
      {vitals?<dl className="ct-vitals" aria-label="Constantes de la copia">{vitals.map(vital=><div key={vital.id} data-tone={vital.tone}><dt>{vital.label}</dt><dd className="ct-vital-value">{vital.value}</dd><dd className="ct-vital-note">{vital.note}</dd></div>)}</dl>:null}
      <div className="ct-main">
    <section className={'continuity-summary '+(status?.stale?'needs-attention':'')}>
      <ShieldCheck size={33}/><div><h2>{!latest?'Prepara tu primera copia':status?.stale?'Tu copia necesita actualizarse':'Tienes una copia disponible'}</h2>
      <p>{latest ? 'Última captura guardada: ' + (captureDateLabel ?? 'fecha no disponible') : state.runtime ? 'Restaura un archivo para abrir tu copia.' : 'Elige los datos ficticios incluidos o conecta una cuenta de prueba de HubSpot.'}</p>
      {latest ? <small>{summary && summary.id === latest.id ? captureRecordCount(summary.records) + ' en esta captura' : 'Recuento de esta captura no disponible'}{activeId && !differentArchive ? ' · Es la copia activa' : ''}</small> : null}
      {differentArchive ? <p><strong>Copia activa:</strong> {activeDate ?? 'fecha no disponible'}. Tu trabajo sigue en esta copia.</p> : null}
      {latest?<div className="continuity-facts"><StatusTag tone={diagnosis?.status==='passed'?'success':diagnosis?.status==='untested'?'warning':'neutral'}>{diagnosis?.status==='passed'?'Prueba vigente':diagnosis?.status==='untested'?'Prueba pendiente':'Verificación por revisar'}</StatusTag>{differentArchive?<span>Prueba de la última captura guardada</span>:null}<span>{status?.pendingChanges??0} cambios locales pendientes</span>{automation?<span>{automation.active?'Capturas automáticas habilitadas':automation.reason}</span>:null}</div>:null}</div>
      {held?<div className="info-box ct-held" role="alert"><div><strong>La última captura tiene menos registros que la anterior</strong>
        <p>{shrinkText(held)}. Se conserva, pero no se abre para trabajar sin confirmarlo: puede ser un borrado masivo, un cambio de permisos o una lectura incompleta.</p>
        <div className="button-row">{previousGood?<button type="button" className="button secondary" disabled={busy||!!active} onClick={()=>run(async()=>{await post('/v2/session/begin',{captureId:previousGood.id});work();})}>Abrir la captura anterior</button>:null}
          <button type="button" className="text-button" disabled={busy||!!active} onClick={()=>run(async()=>{await post('/v2/session/begin',{captureId:latest!.id,confirmQuarantine:latest!.id});work();})}>Sé por qué ha encogido: abrirla igualmente</button></div></div></div>:null}
      <button className={'button '+(readiness&&readiness.next.id!=='none'?'secondary':'primary')} disabled={busy||!!active||!!held} onClick={()=>continueActive?work():latest?run(async()=>{await post('/v2/session/begin',{captureId:latest.id});work();}):state.runtime?setRestore(true):prepare()}>{differentArchive?'Continuar con la copia activa':latest?'Continuar trabajando':state.runtime?'Restaurar archivo':'Preparar aplicación'}<ArrowRight size={17}/></button>
    </section>
    {outage?<article className="ct-outage" data-tone={outage.tone} aria-labelledby="ct-outage-title"><div className="section-heading"><h2 id="ct-outage-title">Si HubSpot cae ahora</h2><Unplug size={19}/></div>
      <p className="ct-outage-verdict">{outage.headline}</p>
      {/* La prueba y la copia fuera del PC ya son pasos del índice de arriba: aquí solo lo que tendrías para trabajar. */}
      <ul>{outage.lines.filter(line=>!readiness||!READINESS_OUTAGE_LINES.includes(line.id)).map(line=><li key={line.id} data-tone={line.tone}>{line.text}</li>)}</ul>
      {/* Misión maestra A10-2: lo que la copia no reproduce, dicho donde se decide si se puede seguir trabajando. */}
      {coverage&&notCopiedLine(coverage)?<p className="ct-not-copied">{notCopiedLine(coverage)} Una copia de estos datos no reproduce todas las funciones del CRM.</p>:null}
    </article>:null}
    {summary?<details className="capture-details ct-content"><summary>Ver contenido de esta copia</summary><div className="capture-details-body">
      <p><strong>{summary.name}</strong><span>{summary.source==='hubspot'?'HubSpot · Portal '+summary.accountId:'Conjunto de ensayo local'}</span></p>
      <dl className="capture-counts">{([['contacts','Clientes'],['companies','Empresas'],['deals','Oportunidades'],['tasks','Tareas']] as const).map(([id,label])=><div key={id}><dt>{label}</dt><dd>{summary.counts[id]}</dd></div>)}</dl>
      <p className="helper">{summary.relations} relaciones · {summary.pipelines} {summary.pipelines===1?'proceso comercial':'procesos comerciales'} · {summary.fields} campos conservados</p>
      {coverage?<div className="ct-coverage"><h3>Lo que no se copia</h3>{coverage.notCopied.length?<ul>{coverage.notCopied.map(item=><li key={item}>{item}</li>)}</ul>:<p className="helper">La captura no declara exclusiones.</p>}
        {coverage.readOnlyFields?<p className="helper">{coverage.readOnlyFields} {coverage.readOnlyFields===1?'campo se conserva':'campos se conservan'} solo para consulta: no se pueden editar en la copia.</p>:null}
        {coverage.supported.length?<p className="helper">Cubierto: {coverage.supported.join(' · ')}.</p>:null}</div>:null}
      {state.ready&&state.snapshot&&state.snapshot.id+':'+state.snapshot.capturedAt!==summary.id?<p className="helper">El espacio de trabajo conserva otra versión. Abrir esta copia requiere cerrar la sesión anterior y resolver los cambios pendientes.</p>:null}
    </div></details>:null}
    {status?.session?<div className="info-box"><Unplug size={20}/><div><strong>Sesión de continuidad abierta</strong><p>Importaciones e IA pausadas. Tus cambios se conservan. La devolución a HubSpot tiene su propio proceso de revisión.</p><div className="button-row"><button className="text-button" onClick={work}>Abrir trabajo</button><button className="text-button" onClick={()=>run(()=>post('/v2/session/end',{}))}>Cerrar sesión de continuidad</button></div></div></div>:null}
    {active?<div className="job-progress" role="status"><Spinner text={active.message}/><progress max="100" value={active.progress}/><button className="text-button" onClick={()=>run(()=>post('/v2/jobs/'+active.id+'/cancel',{}))}>Cancelar trabajo</button></div>:null}
      <article className="ct-verify"><div className="section-heading"><h2>Comprueba tu Plan B</h2><Play size={21}/></div><p>Prueba buscar y editar, avanzar una oportunidad, crear y completar una tarea, y reiniciar. En una copia aislada con red bloqueada.</p>
        {calendar?<div className="ct-cal" data-state={calendar.state} data-tone={calendar.tone}>
          <p className="ct-cal-title"><CalendarClock size={16} aria-hidden="true"/><strong>{calendar.title}</strong></p>
          <p className="ct-cal-detail">{calendar.detail}</p>
          {calendar.lastLabel?<><div className="ct-cal-track" role="img" aria-label={'Han pasado '+Math.round(calendar.elapsed*DRILL_EVERY_DAYS)+' de '+DRILL_EVERY_DAYS+' días desde el último simulacro superado'}><span style={{width:(calendar.elapsed*100)+'%'}}/><i style={{left:((DRILL_EVERY_DAYS-DRILL_SOON_DAYS)/DRILL_EVERY_DAYS*100)+'%'}}/></div>
            <div className="ct-cal-ends" aria-hidden="true"><small>{calendar.lastLabel}</small><small>{calendar.dueLabel}</small></div></>:null}
        </div>:null}
        <div className="button-row ct-verify-actions"><button className="button secondary" disabled={!latest||busy||!!active} onClick={()=>run(()=>post('/v2/drills',{captureId:latest!.id}))}>Probar mi Plan B</button>{onGuidedDrill?<button type="button" className="text-button" title="Cinco gestos con tu copia, como si el CRM se hubiera caído. No guarda nada." onClick={onGuidedDrill}>Práctica guiada: un día sin CRM (5 min)</button>:null}</div>
        {diagnosis?<div className="drill-result"><strong className={diagnosis.status==='passed'?'green':diagnosis.status==='untested'||diagnosis.status==='empty'?'':'warning-text'} role="status">{readinessLabel}</strong>
          {diagnosis.issues.length?<ul>{diagnosis.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
          {diagnosis.status==='untested'&&!!status?.reports.length?<p className="helper">El informe anterior corresponde a otra captura. Ejecuta una prueba para comprobar esta copia.</p>:null}
          {report?<><small>{new Date(report.completedAt).toLocaleString('es-ES')} · {(report.durationMs/1000).toFixed(1)} s · {report.dataSource}</small>
            <ul>{report.checks.map(c=><li key={c.label}><span className={c.passed?'green':'warning-text'}>{c.passed?'✓':'·'}</span>{c.label}{!c.passed?<small>{c.detail}</small>:null}</li>)}</ul>
            <div className="button-row"><button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report?format=html','plan-b-informe-continuidad.html'))}><Download size={15}/>Informe para compartir</button>
              <button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report','plan-b-simulacro.json'))}>JSON</button></div>
            <p className="helper">Esta prueba ejercita un cliente, una oportunidad y una tarea. La devolución a HubSpot se valida por separado.</p></>:null}</div>:null}</article>      </div>
      <aside className="ct-rail" aria-label="Mantenimiento de la copia">
      <article><div className="section-heading"><h2>Mantén la copia al día</h2><Clock3 size={21}/></div><p>Una captura cada hora mientras el ordenador esté encendido, conectado y los servicios estén habilitados. Aviso de antigüedad a los 75 minutos.</p>
        {status?.operations?<details className="maintenance-details" open={!!status.operations.error}><summary>Estado de las actualizaciones</summary><div className="operation-health"><strong>{status.operations.paused?'Actualización en pausa':'Servicios habilitados'}</strong><small>Último intento: {status.operations.lastAttempt?new Date(status.operations.lastAttempt).toLocaleString('es-ES'):'Todavía sin intentos'}</small><small>Última captura de conexión correcta: {status.operations.lastSuccess?new Date(status.operations.lastSuccess).toLocaleString('es-ES'):'Todavía sin resultado'}</small>{status.operations.error?<p role="alert" className="warning-text">{status.operations.error.message} {status.operations.error.action}</p>:null}</div></details>:null}
        {!state.runtime?<><label className="checkbox-label"><input type="checkbox" checked={status?.schedule.enabled??false} disabled={busy} onChange={e=>run(()=>post('/v2/schedule',{enabled:e.target.checked}))}/>Capturas y simulacro mensual automáticos</label>
        {status?.drillSchedule?.enabled&&status.drillSchedule.nextAt?<p className="helper">Próximo simulacro automático: {new Date(status.drillSchedule.nextAt).toLocaleString('es-ES',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}. Solo se hace con Plan B abierto; si un intento no termina, se reintenta a las 6 horas.</p>:null}
        <div className="button-row"><button className="button secondary" disabled={busy||!!active||!status?.connected||!!status?.session} onClick={()=>run(()=>post('/v2/captures',{}))}><RefreshCw size={16}/>Capturar ahora</button>
          <button className="text-button" disabled={busy||!!status?.session} onClick={()=>run(()=>post('/v2/services',{enabled:!status?.connected}))}>{status?.connected?'Pausar servicios':'Habilitar servicios'}</button></div>
        <button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>Configurar conexión HubSpot</button>{!status?.connected?<p className="capture-disabled-reason">La captura está deshabilitada mientras los servicios estén en pausa. Revisa primero la conexión y habilítalos cuando corresponda.</p>:status?.session?<p className="capture-disabled-reason">Las capturas están pausadas durante la sesión de continuidad.</p>:null}</>:<p className="helper">Este paquete no contiene conectores externos.</p>}
        <p className="helper">No se ofrece un SLA con el PC apagado. Cada captura comprueba su portal; producción permanece solo en lectura.</p>{onCoverage?<button className="text-button" onClick={onCoverage}>Ver cobertura</button>:null}<button className="text-button" onClick={()=>run(()=>download('/v3/diagnostics','plan-b-diagnostico.json'))}>Descargar diagnóstico sin fichas ni claves</button></article>
      </aside>
    </div>
    <div className="ct-panel ct-evidencia" {...tabPanelProps('ct','evidencia')} hidden={tab!=='evidencia'}>
    {/* Misión maestra B4.2: el sello (historial mensual del índice) y el coste de una caída son evidencia e impacto, no estado. */}
    {seal?<SealCard seal={seal}/>:null}
    {!state.runtime?<DowntimeCard spec={state.ready?state.spec:null} revision={(state.snapshot?.capturedAt??'')+':'+(state.changes??0)}/>:null}
    <details className="chub-block" ref={hubRef} open data-testid="continuity-hub-block"><summary>Evidencia, mapa de impacto y ensayo de relevo</summary>
      <p className="helper">Qué copia tienes, qué se observó de ella y de la lectura de HubSpot, y qué podría impedir seguir trabajando. «Probar mi Plan B» comprueba tu copia en un entorno aislado; el ensayo de relevo practica exportar e importar con datos ficticios y no la sustituye.</p>
      {returnNote==='integrations'?<p className="chub-return" role="status" data-testid="return-note">Has vuelto de Integraciones. Lo guardado allí se lee de nuevo aquí; no se ha pedido nada al proveedor.</p>:returnNote==='drill'&&drillNote?<p className="chub-return" role="status" data-testid="drill-note">{drillNote}</p>:null}
      {canReadWork?<WorkSummary key={workOwner+':'+(expectedWorkPin??'none')} expectedContext={expectedWorkPin} identityKey={workOwner} onOpenToday={onOpenToday} onSummary={receiveWork}/>:<p className="helper" role="status" data-testid="work-summary-awaiting-context">El resumen del trabajo espera una referencia autorizada de la copia. No se acredita ningún recuento mientras tanto.</p>}
      <ContinuityHub key={workspaceContextRevision??'unavailable'} workspaceContextRevision={workspaceContextRevision} navigate={hubNavigate} connectionKey={status?.connection?'portal:'+status.connection.accountId:null} evidenceLink="#/continuidad" extra={{work:workSource}} onCopyContext={receiveCopyContext}/>
    </details>
    <details className="chub-block ct-scenarios" data-testid="continuity-scenarios-block" onToggle={event=>setScenariosOpen(event.currentTarget.open)}><summary>¿Y si la caída dura más? Escenarios de 8 horas a 7 días</summary>
      <p className="helper">Elige caída del CRM o pérdida del equipo y cuánto dura: verás qué tareas vencerían en ese tiempo y qué falta demostrar. Solo se lee tu copia al pulsar «Consultar evidencia».</p>
      {scenariosOpen?<ContinuityEvidence active={tab==='evidencia'}/>:null}
    </details>
    </div>
    <div className="ct-panel ct-copias" {...tabPanelProps('ct','copias')} hidden={tab!=='copias'}>
      {status?<CopyTimeline status={status} onOpenStatus={()=>{setTab('estado');requestAnimationFrame(()=>document.getElementById('ct-tab-estado')?.focus());}}/>:null}
      {hours?<section className="ct-hours" aria-labelledby="ct-hours-title"><div className="section-heading"><h2 id="ct-hours-title">Últimas 24 horas</h2><span className="ct-hours-count"><span className="ct-ready-count">{hours.covered} de 24</span> horas con captura</span></div>
        <ol className="ct-hours-ruler" aria-hidden="true">{hours.slots.map(slot=><li key={slot.at.getTime()} data-count={Math.min(slot.count,3)} data-current={slot.current?'true':undefined} title={hourLabel.format(slot.at)+' · '+(slot.count?slot.count+(slot.count===1?' captura':' capturas'):'sin captura')}><span>{slot.at.getHours()%6===0?String(slot.at.getHours()).padStart(2,'0')+' h':''}</span></li>)}</ol>
        <p className="helper">{fresh?'La copia estuvo al día '+formatHours(fresh.hours)+' de las últimas 24 ('+Math.round(fresh.ratio*100)+' %). ':''}{automation?.active?'Con las capturas automáticas activas, cada hora con el PC encendido debería tener su marca.':'Las capturas automáticas no están activas: los huecos son esperables.'}</p>
      </section>:null}
      <section className="history-section"><div className="section-heading"><h2>Historial de capturas</h2><div className="button-row"><button className="text-button" onClick={()=>setRestore(true)}>Restaurar archivo</button><button className="text-button" onClick={protect}><LockKeyhole size={15}/>{status?.protected?'Protección configurada':'Proteger acceso local'}</button></div></div>
      {status?.captures.length&&ledger?<>
        <div className="ct-ledger-tools"><div className="ct-chips" role="group" aria-label="Filtrar capturas">{LEDGER_FILTERS.map(option=><button key={option.id} type="button" className="ct-chip" aria-pressed={ledgerFilter===option.id} onClick={()=>{setLedgerFilter(option.id);setLedgerAll(false);}}>{option.label}{option.id==='shrink'&&ledger.shrinks?<b>{ledger.shrinks}</b>:null}</button>)}</div>
          <p className="ct-ledger-sum">{ledger.total} {ledger.total===1?'captura':'capturas'} · {formatBytes(status.captures.reduce((sum,item)=>sum+item.bytes,0))} · media {formatBytes(ledger.averageBytes)}</p></div>
        {ledgerDays.length?<div className="history-list ct-ledger">{ledgerDays.map(day=><section key={day.key} className="ct-ledger-day" aria-label={day.label}><h3><span>{day.label}</span><small>{day.entries.length} · {formatBytes(day.bytes)}</small></h3>
          {day.entries.map(item=><div key={item.id} className="ct-ledger-row" data-shrink={item.shrink?'true':undefined}><Database size={16}/><div><strong>{hourLabel.format(new Date(item.at))}</strong><small>{(item.bytes/1024).toFixed(0)} KB · Captura conciliada</small>{item.delta!==null&&item.delta!==0?<small className="ct-ledger-delta" data-dir={item.delta>0?'up':'down'}>{(item.delta>0?'+':'−')+formatBytes(Math.abs(item.delta))}{item.shrink?' · más pequeña que la anterior: revisa el alcance':''}</small>:null}{item.shrink?<button type="button" className="text-button ct-ledger-diff" onClick={()=>compareWithPrevious(item.id)}>Ver qué falta</button>:null}</div>
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
