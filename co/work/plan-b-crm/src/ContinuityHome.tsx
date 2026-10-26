import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Database, Download, LockKeyhole, Play, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import type { AppState } from '../shared/model.js';
import type { ContinuityStatus } from '../shared/operations.js';
import { api, post, download } from './api.js';
import { Modal, Spinner } from './components.js';
import { ConnectionDialog } from './ConnectionDialog.js';
import { APP_VERSION } from '../shared/version.js';
export function ContinuityHome({state,refresh,work,prepare,protect,exportCopy,connectRequest=0}:{state:AppState;refresh:()=>Promise<AppState>;work:()=>void;prepare:()=>void;protect:()=>void;exportCopy:()=>void;connectRequest?:number}) {
  const [status,setStatus]=useState<ContinuityStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connection,setConnection]=useState(false),[restore,setRestore]=useState(false);
  const [file,setFile]=useState(''),[password,setPassword]=useState(''),[replace,setReplace]=useState(false);
  const load=()=>api<ContinuityStatus>('/v2/continuity').then(setStatus);
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
    {!state.runtime?<details className="capture-details" open={!latest}><summary>Preparación de tu Plan B</summary><ol className="setup-checklist">
      <li><span>{status?.protected?'✓':'1'} Proteger el acceso</span>{!status?.protected?<button className="text-button" onClick={protect}>Elegir contraseña</button>:null}</li>
      <li><span>{state.hubspotConfigured?'✓':'2'} Conectar y revisar alcance</span><button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>{status?.connection?'Portal '+status.connection.accountId+' · '+(production?'solo lectura':'ensayo'):'Conectar HubSpot'}</button></li>
      <li><span>{latest?'✓':'3'} Conservar una captura completa</span></li>
      <li><span>{diagnosis?.status==='passed'?'✓':'4'} Probar la misma copia</span></li>
      <li><span>{status?.recoveryCopy?.confirmedAt?'✓':'5'} Preparar recuperación</span><button className="text-button" disabled={!state.ready} onClick={exportCopy}>Crear copia cifrada</button>{status?.recoveryCopy&&!status.recoveryCopy.confirmedAt?<button className="text-button" onClick={()=>run(()=>post('/v3/recovery-copy/confirm',{storedSeparately:true}))}>Confirmo que conservé la copia fuera de este PC y la contraseña por separado</button>:null}</li>
    </ol><p className="helper">Una carpeta por portal. La copia necesita el PC encendido para actualizarse. Una descarga no comprueba la restauración: ensáyala en otra carpeta.</p></details>:null}
    <section className={'continuity-summary '+(status?.stale?'needs-attention':'')}>
      <ShieldCheck size={33}/><div><h2>{!latest?'Prepara tu primera copia':status?.stale?'Tu copia necesita actualizarse':'Tienes una copia disponible'}</h2>
      <p>{latest?'Última captura: '+new Date(latest.at).toLocaleString('es-ES'):'Elige los datos ficticios incluidos o conecta una cuenta de prueba de HubSpot.'}</p>
      {latest?<small>{Math.floor(status?.ageMinutes??0)} minutos de antigüedad · {summary?.records??'—'} registros en esta captura</small>:null}</div>
      <button className="button primary" disabled={busy||!!active} onClick={()=>status?.session||state.ready&&(status?.pendingChanges??0)>0?work():latest?run(async()=>{await post('/v2/session/begin',{captureId:latest.id});work();}):state.runtime?setRestore(true):prepare()}>{latest?'Continuar trabajando':state.runtime?'Restaurar archivo':'Preparar aplicación'}<ArrowRight size={17}/></button>
    </section>
    {summary?<details className="capture-details"><summary>Ver contenido de esta copia</summary><div className="capture-details-body">
      <p><strong>{summary.name}</strong><span>{summary.source==='hubspot'?'HubSpot · Portal '+summary.accountId:'Conjunto de ensayo local'}</span></p>
      <dl className="capture-counts">{([['contacts','Clientes'],['companies','Empresas'],['deals','Oportunidades'],['tasks','Tareas']] as const).map(([id,label])=><div key={id}><dt>{label}</dt><dd>{summary.counts[id]}</dd></div>)}</dl>
      <p className="helper">{summary.relations} relaciones · {summary.pipelines} {summary.pipelines===1?'proceso comercial':'procesos comerciales'} · {summary.fields} campos conservados</p>
      {state.ready&&state.snapshot&&state.snapshot.id+':'+state.snapshot.capturedAt!==summary.id?<p className="helper">El espacio de trabajo conserva otra versión. Abrir esta copia requiere cerrar la sesión anterior y resolver los cambios pendientes.</p>:null}
    </div></details>:null}
    {status?.session?<div className="info-box"><Unplug size={20}/><div><strong>Sesión de continuidad abierta</strong><p>Importaciones e IA pausadas. Tus cambios se conservan. La devolución a HubSpot tiene su propio proceso de revisión.</p><div className="button-row"><button className="text-button" onClick={work}>Abrir trabajo</button><button className="text-button" onClick={()=>run(()=>post('/v2/session/end',{}))}>Cerrar sesión de continuidad</button></div></div></div>:null}
    {active?<div className="job-progress" role="status"><Spinner text={active.message}/><progress max="100" value={active.progress}/><button className="text-button" onClick={()=>run(()=>post('/v2/jobs/'+active.id+'/cancel',{}))}>Cancelar trabajo</button></div>:null}
    <div className="continuity-actions">
      <article><div className="section-heading"><h2>Comprueba tu Plan B</h2><Play size={21}/></div><p>Prueba buscar y editar, avanzar una oportunidad, crear y completar una tarea, y reiniciar. En una copia aislada con red bloqueada.</p>
        <button className="button secondary" disabled={!latest||busy||!!active} onClick={()=>run(()=>post('/v2/drills',{captureId:latest!.id}))}>Probar mi Plan B</button>
        {diagnosis?<div className="drill-result"><strong className={diagnosis.status==='passed'?'green':diagnosis.status==='untested'||diagnosis.status==='empty'?'':'warning-text'} role="status">{readinessLabel}</strong>
          {diagnosis.issues.length?<ul>{diagnosis.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
          {diagnosis.status==='untested'&&!!status?.reports.length?<p className="helper">El informe anterior corresponde a otra captura. Ejecuta una prueba para comprobar esta copia.</p>:null}
          {report?<><small>{new Date(report.completedAt).toLocaleString('es-ES')} · {(report.durationMs/1000).toFixed(1)} s · {report.dataSource}</small>
            <ul>{report.checks.map(c=><li key={c.label}><span className={c.passed?'green':'warning-text'}>{c.passed?'✓':'·'}</span>{c.label}{!c.passed?<small>{c.detail}</small>:null}</li>)}</ul>
            <div className="button-row"><button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report?format=html','plan-b-informe-continuidad.html'))}><Download size={15}/>Informe para compartir</button>
              <button className="text-button" onClick={()=>run(()=>download('/v2/drills/'+report.id+'/report','plan-b-simulacro.json'))}>JSON</button></div>
            <p className="helper">Esta prueba ejercita un cliente, una oportunidad y una tarea. La devolución a HubSpot se valida por separado.</p></>:null}</div>:null}</article>
      <article><div className="section-heading"><h2>Mantén la copia al día</h2><Clock3 size={21}/></div><p>Una captura cada hora mientras el ordenador esté encendido, conectado y los servicios estén habilitados. Aviso de antigüedad a los 75 minutos.</p>
        {!state.runtime?<><label className="checkbox-label"><input type="checkbox" checked={status?.schedule.enabled??false} disabled={busy} onChange={e=>run(()=>post('/v2/schedule',{enabled:e.target.checked}))}/>Capturas y simulacro mensual automáticos</label>
        <div className="button-row"><button className="button secondary" disabled={busy||!!active||!status?.connected||!!status?.session} onClick={()=>run(()=>post('/v2/captures',{}))}><RefreshCw size={16}/>Capturar ahora</button>
          <button className="text-button" disabled={busy||!!status?.session} onClick={()=>run(()=>post('/v2/services',{enabled:!status?.connected}))}>{status?.connected?'Pausar servicios':'Habilitar servicios'}</button></div>
        <button className="text-button" onClick={()=>status?.protected?setConnection(true):protect()}>Configurar conexión HubSpot</button></>:<p className="helper">Este paquete no contiene conectores externos.</p>}
        <p className="helper">No se ofrece un SLA con el PC apagado. Cada captura comprueba su portal; producción permanece solo en lectura.</p><button className="text-button" onClick={()=>run(()=>download('/v3/diagnostics','plan-b-diagnostico.json'))}>Descargar diagnóstico sin fichas ni claves</button></article>
    </div>
    <section className="history-section"><div className="section-heading"><h2>Historial de capturas</h2><div className="button-row"><button className="text-button" onClick={()=>setRestore(true)}>Restaurar archivo</button><button className="text-button" onClick={protect}><LockKeyhole size={15}/>{status?.protected?'Protección configurada':'Proteger acceso local'}</button></div></div>
      {status?.captures.length?<div className="history-list">{status.captures.slice(0,12).map(item=><div key={item.id}><Database size={17}/><div><strong>{new Date(item.at).toLocaleString('es-ES')}</strong><small>{(item.bytes/1024).toFixed(0)} KB · Captura conciliada</small></div>
        <button className="text-button" disabled={busy||!!active||status.pendingChanges>0||!!status.session&&status.session.captureId!==item.id} onClick={()=>status.session?.captureId===item.id?work():run(async()=>{await post('/v2/session/begin',{captureId:item.id});work();})}>{status.session?.captureId===item.id?'Abrir trabajo':'Abrir copia'}<ArrowRight size={15}/></button></div>)}</div>:<p className="muted">Todavía no hay capturas verificadas.</p>}
      <p className="helper">Retención: hasta 24 capturas horarias y 30 diarias; las necesarias para una sesión pendiente se conservan. Límite local 2 GB.</p>
    </section>
    {status?.jobs.length?<details className="job-history"><summary>Trabajos recientes</summary>{status.jobs.slice(0,8).map(j=><div key={j.id}><strong>{({capture:'Captura',drill:'Simulacro',return:'Devolución'})[j.kind]}</strong><span>{({queued:'En cola',running:'En curso',succeeded:'Completado',failed:'Fallido',cancelled:'Cancelado',interrupted:'Interrumpido'})[j.status]}</span><small>{j.message}</small></div>)}</details>:null}
    {connection?<ConnectionDialog close={()=>setConnection(false)} done={async()=>{await load();await refresh();setConnection(false);}}/>:null}
    {restore?<Modal title="Restaurar una copia" close={()=>setRestore(false)}><form className="settings-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await post('/v2/restore',{file,password,replace});setRestore(false);setFile('');setPassword('');});}}>
      <label className="field"><span>Archivo JSON de Plan B</span><input type="file" accept=".json" required onChange={async e=>{const selected=e.target.files?.[0];if(selected){if(selected.size>20_000_000){setError('El archivo supera 20 MB.');return;}setFile(await selected.text());}}}/></label><label className="field"><span>Contraseña de recuperación, si está cifrado</span><input type="password" value={password} autoComplete="off" onChange={e=>setPassword(e.target.value)}/></label>
      {status?.changes?<label className="checkbox-label"><input type="checkbox" required checked={replace} onChange={e=>setReplace(e.target.checked)}/>He guardado una exportación y quiero sustituir el espacio de trabajo.</label>:null}{error?<p className="error-box" role="alert">{error}</p>:null}<button className="button primary" disabled={busy||!file}>Validar y restaurar</button>
    </form></Modal>:null}
  </section>;
}
