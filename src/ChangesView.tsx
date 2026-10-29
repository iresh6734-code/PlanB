import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Download, GitBranch } from 'lucide-react';
import type { Change } from '../shared/model.js';
import type { RecoveryPlan } from '../shared/operations.js';
import { api, post, download } from './api.js';
import { Spinner } from './components.js';
import { ManualRecovery } from './ManualRecovery.js';
import { SalesWorkspace } from './SalesWorkspace.js';
export function ChangesView({runtime,production=false}:{runtime:boolean;production?:boolean}) {
  const [changes,setChanges]=useState<Change[]>([]),[plan,setPlan]=useState<RecoveryPlan|null>(null),[simulation,setSimulation]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[token,setToken]=useState('');
  const [uncertainId,setUncertainId]=useState('');
  const [revision,setRevision]=useState(''),[pending,setPending]=useState(0),[watermark,setWatermark]=useState(0),[manualReport,setManualReport]=useState<{verifiedAt:string}|null>(null);
  const load=async()=>{const data=await api<{changes:Change[];plan:RecoveryPlan|null;revision:string;pendingChanges:number;watermark:number;manualReport:{verifiedAt:string}|null}>('/v2/changes');setChanges(data.changes);setPlan(data.plan);setRevision(data.revision);setPending(data.pendingChanges);setWatermark(data.watermark);setManualReport(data.manualReport);};
  useEffect(()=>{void load().catch(f=>setError((f as Error).message));const timer=setInterval(()=>void load().catch(()=>{}),2500);return()=>clearInterval(timer);},[]);
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await load();}catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  const destinations={simulation,token:token||undefined};
  return <section className="changes-page"><header className="page-header"><div><h1>El trabajo sigue contigo.</h1><p className="page-subtitle">{changes.length} operaciones guardadas en este ordenador.</p></div>
    <div className="button-row"><button className="button secondary" onClick={()=>run(()=>download('/export/changes?format=csv','plan-b-cambios.csv'))}><Download size={16}/>CSV</button><button className="button secondary" onClick={()=>run(()=>download('/export/changes','plan-b-cambios.json'))}>JSON</button></div></header>
    {error?<p role="alert" className="error-box">{error}</p>:null}
    {!runtime&&!production?<SalesWorkspace view="proposals"/>:null}
    {production&&!runtime?<><ManualRecovery changes={changes.filter(c=>c.id>watermark)} revision={revision} pending={pending} refresh={load}/>{manualReport?<p className="helper">Última comprobación manual: {new Date(manualReport.verifiedAt).toLocaleString('es-ES')}. No se enviaron datos mediante la API.</p>:null}</>:!runtime?<details className="return-section" open={changes.length>0||!!plan}><summary><div><h2>Devolución revisada</h2><p className="muted">Compara, resuelve conflictos y aprueba el estado final antes de enviarlo.</p></div><ChevronDown size={17} className="disclosure-indicator"/></summary>
      <label className="checkbox-label"><input type="checkbox" checked={simulation} disabled={busy} onChange={e=>{setSimulation(e.target.checked);setReviewed(false);}}/>Usar destino simulado para probar el recorrido (no envía datos a HubSpot)</label>
      {!simulation?<><p className="info-box">Solo cuentas HubSpot de prueba. La credencial necesita permisos de escritura adicionales. Revisa las automatizaciones con la agencia antes de aprobar.</p>
        <label className="field"><span>Token de escritura de esta cuenta (opcional si el guardado ya dispone de permisos)</span><input type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)}/></label></>:null}
      <div className="button-row"><button className="button secondary" disabled={!changes.length||busy} onClick={()=>run(async()=>{await post('/v2/return/preview',destinations);setReviewed(false);})}>{busy?<Spinner/>:'Preparar revisión'}</button>
        {plan?.status==='review'&&plan.operations.some(o=>o.status==='applied')?<button className="text-button" disabled={busy} onClick={()=>run(()=>post('/v2/return/refresh',{...destinations,planId:plan.id}))}>Actualizar conflictos remotos</button>:null}</div>
      {plan?<div className="recovery-plan"><div className="plan-status"><span className="badge">{plan.source==='simulation'?'Destino simulado · sin envío real':'HubSpot de prueba'}</span><strong>{({review:'Pendiente de revisión',approved:'Aprobado',applying:'Enviando y verificando',complete:'Completado',partial:'Devolución parcial'})[plan.status]}</strong></div>
        <p className="helper">{plan.warning}</p>
        {plan.operations.length?plan.operations.map(op=><article className="return-operation" key={op.id}><header><strong>{op.label}</strong><span>{op.kind==='create'?'Alta':'Cambio'} · {({pending:'Pendiente',sending:'Enviando',applied:'Verificado',failed:'Fallido',uncertain:'Resultado incierto',skipped:'Omitido'})[op.status]}</span></header>
          <div className="return-fields">{op.fields.map(field=><div className={field.conflict?'has-conflict':''} key={field.field}><div><strong>{field.label}</strong><span>Original: {String(field.base??'—')}</span></div><div><small>LOCAL</small><p>{String(field.local??'—')}</p></div><ArrowRight size={14}/><div><small>{plan.source==='simulation'?'DESTINO SIMULADO':'HUBSPOT'}</small><p>{String(field.remote??'—')}</p></div>
            <label><span className="sr-only">{'Decisión para '+field.label}</span><select aria-label={'Decisión para '+field.label} value={field.decision??''} disabled={busy||['applying','complete','partial'].includes(plan.status)} onChange={e=>run(()=>post('/v2/return/decisions',{planId:plan.id,decisions:[{operationId:op.id,field:field.field,decision:e.target.value}]}))}>
              <option value="" disabled>Resolver conflicto</option><option value="local">Usar local</option><option value="remote">Conservar remoto</option></select></label></div>)}</div>
          {op.references.length?<p className="helper">{op.references.length} relaciones se añadirán después de crear los registros necesarios.</p>:null}
          {op.error?<p role="alert" className="error-box">{op.error}</p>:null}
          {op.status==='uncertain'?<div className="uncertain-form"><label className="field"><span>ID remoto comprobado por la agencia</span><input value={uncertainId} onChange={e=>setUncertainId(e.target.value)}/></label><button className="button secondary" disabled={busy||!uncertainId} onClick={()=>run(()=>post('/v2/return/verify-uncertain',{...destinations,planId:plan.id,operationId:op.id,remoteId:uncertainId}))}>Verificar resultado</button></div>:null}
        </article>):<p className="muted">No quedan cambios nuevos para este destino.</p>}
        {['review','partial'].includes(plan.status)?<><label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>He revisado las decisiones, los permisos y el efecto de los workflows. Coordinaré una ventana sin ediciones simultáneas.</label>
          <button className="button primary" disabled={busy||!reviewed||plan.source!==(simulation?'simulation':'hubspot')||plan.operations.some(o=>o.fields.some(f=>f.decision===null)||o.status==='uncertain')} onClick={()=>run(()=>post('/v2/return/approve',{planId:plan.id,reviewedWorkflows:true}))}>Aprobar plan revisado</button></>:null}
        {plan.status==='approved'?<button className="button primary" disabled={busy||plan.source!==(simulation?'simulation':'hubspot')} onClick={()=>run(()=>post('/v2/return/apply',{...destinations,planId:plan.id,approved:true}))}>{plan.source==='simulation'?'Ejecutar devolución simulada':'Aplicar a HubSpot de prueba'}</button>:null}
        {plan.status==='complete'?<p className="success-label"><CheckCircle2 size={18}/>{plan.source==='simulation'?'Prueba completada. Los cambios locales siguen pendientes de devolución real.':'Los valores enviados se han leído y verificado en HubSpot.'}</p>:null}
      </div>:null}
    </details>:<p className="info-box">Exporta los cambios y abre la devolución en el generador con la agencia. Este paquete no contiene conectores externos.</p>}
    <section className="history-section"><h2>Historial de operaciones</h2>{changes.length?<div className="history-list">{changes.slice(-100).reverse().map(c=><details key={c.id}><summary><strong>{c.entity} · {c.recordId}</strong><span>{c.operation==='create'?'Creado':'Editado'} · {new Date(c.at).toLocaleString('es-ES')}</span></summary><pre>{JSON.stringify({antes:c.before?.values??null,despues:c.after.values},null,2)}</pre></details>)}</div>:<p className="muted">Tus próximas ediciones aparecerán aquí.</p>}</section>
  </section>;
}
