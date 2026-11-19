import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Download, GitBranch } from 'lucide-react';
import type { AppState, Change } from '../shared/model.js';
import {INVALID_RECOVERY_MESSAGE,RecoveryChangesSchema,SavedChangesSchema,type RecoveryIntegrity} from '../shared/recovery-integrity.js';
import type { RecoveryField, RecoveryOperation, RecoveryPlan } from '../shared/operations.js';
import { useReturnExplanation } from './app-shell/useReturnExplanation.js';
import { api, post, download } from './api.js';
import { Spinner } from './components.js';
import { ManualRecovery } from './ManualRecovery.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { ChangeHistory } from './ChangeHistory.js';
export function ChangesView({runtime,production=false,spec=null}:{runtime:boolean;production?:boolean;spec?:AppState['spec']|null}) {
  const [changes,setChanges]=useState<Change[]>([]),[plan,setPlan]=useState<RecoveryPlan|null>(null),[simulation,setSimulation]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[token,setToken]=useState('');
  const [uncertainId,setUncertainId]=useState('');
  const [revision,setRevision]=useState(''),[pending,setPending]=useState(0),[watermark,setWatermark]=useState(0),[manualReport,setManualReport]=useState<{verifiedAt:string}|null>(null);
  const [integrity,setIntegrity]=useState<RecoveryIntegrity|null>(null),[loadError,setLoadError]=useState(''),[checking,setChecking]=useState(true),[hasRead,setHasRead]=useState(false);
  const alive=useRef(true),sequence=useRef(0),controller=useRef<AbortController|null>(null),trusted=useRef(false),action=useRef(false);
  const blocked=integrity===null||integrity.state==='invalid';
  const load=async()=>{
    const ticket=++sequence.current;controller.current?.abort();const current=new AbortController();controller.current=current;setChecking(true);
    const owns=()=>alive.current&&ticket===sequence.current;
    try{
      const data=await api<{changes:Change[];plan:unknown;recoveryIntegrity:unknown;revision:string;pendingChanges:number;watermark:number;manualReport:{verifiedAt:string}|null}>('/v2/changes',{signal:current.signal});if(!owns())return;
      const saved=SavedChangesSchema.safeParse(data.changes);if(!saved.success)throw Error('No se pudo leer un historial de cambios válido.');setChanges(saved.data);setHasRead(true);
      const checked=RecoveryChangesSchema.safeParse(data);
      if(!checked.success)throw Error('Este servidor no permite comprobar el estado del plan. La devolución queda bloqueada; puedes consultar el historial guardado.');
      const currentState=checked.data;
      trusted.current=currentState.recoveryIntegrity.state!=='invalid';setIntegrity(currentState.recoveryIntegrity);setPlan(currentState.plan);setRevision(currentState.revision);setPending(currentState.pendingChanges);setWatermark(currentState.watermark);setManualReport(currentState.manualReport);setLoadError('');
      if(!trusted.current)setReviewed(false);
    }catch(f){if(!owns())return;trusted.current=false;setIntegrity(null);setPlan(null);setReviewed(false);setLoadError(f instanceof Error?f.message:'No se pudo comprobar el estado guardado.');throw f;}
    finally{if(owns()){controller.current=null;setChecking(false);}}
  };
  useEffect(()=>{alive.current=true;void load().catch(()=>{});const timer=setInterval(()=>void load().catch(()=>{}),2500);return()=>{alive.current=false;sequence.current++;controller.current?.abort();clearInterval(timer);};},[]);
  const run=async(fn:()=>Promise<unknown>,requiresIntegrity=false)=>{if(action.current||requiresIntegrity&&!trusted.current)return;action.current=true;setBusy(true);setError('');try{await fn();await load();}catch(f){if(alive.current)setError((f as Error).message);}finally{action.current=false;if(alive.current)setBusy(false);}};
  const destinations={simulation,token:token||undefined};
  // C4 (CLAUDE-RETURN-EXPLAIN-UI): la devolución explicada por cliente. Mientras carga o si falla, la vista anterior.
  const explained=useReturnExplanation(plan,spec);
  const decide=(op:RecoveryOperation,field:RecoveryField,mine:string,theirs:string)=><label><span className="sr-only">{'Decisión para '+field.label}</span><select aria-label={'Decisión para '+field.label} value={field.decision??''} disabled={busy||blocked||!plan||['applying','complete','partial'].includes(plan.status)} onChange={e=>run(()=>post('/v2/return/decisions',{planId:plan!.id,decisions:[{operationId:op.id,field:field.field,decision:e.target.value}]}),true)}>
              <option value="" disabled>Resolver conflicto</option><option value="local">{mine}</option><option value="remote">{theirs}</option></select></label>;
  const tail=(op:RecoveryOperation)=><>{op.error?<p role="alert" className="error-box">{op.error}</p>:null}
          {op.status==='uncertain'?<div className="uncertain-form"><label className="field"><span>ID remoto comprobado por la agencia</span><input value={uncertainId} disabled={busy||blocked} onChange={e=>{if(trusted.current)setUncertainId(e.target.value);}}/></label><button className="button secondary" disabled={busy||blocked||!uncertainId} onClick={()=>run(()=>post('/v2/return/verify-uncertain',{...destinations,planId:plan!.id,operationId:op.id,remoteId:uncertainId}),true)}>Verificar resultado</button></div>:null}</>;
  const STATUS={pending:'Pendiente',sending:'Enviando',applied:'Verificado',failed:'Fallido',uncertain:'Resultado incierto',skipped:'Omitido'} as const;
  const count=(n:number,one:string,many:string)=>n+' '+(n===1?one:many);
  return <section className="changes-page"><header className="page-header"><div><h1>El trabajo sigue contigo.</h1><p className="page-subtitle">{hasRead?changes.length+' operaciones guardadas en este ordenador.':'Leyendo las operaciones guardadas…'}</p></div>
    <div className="button-row"><button className="button secondary" onClick={()=>run(()=>download('/export/changes?format=csv','plan-b-cambios.csv'))}><Download size={16}/>CSV</button><button className="button secondary" onClick={()=>run(()=>download('/export/changes','plan-b-cambios.json'))}>JSON</button></div></header>
    {error||loadError?<p role="alert" className="error-box">{error||loadError}</p>:null}
    {blocked?<div className="error-box" role={checking&&!hasRead?'status':'alert'}><strong>{checking&&!hasRead?'Comprobando el estado de devolución…':'Devolución bloqueada hasta revisar el estado guardado'}</strong><p>{integrity?.state==='invalid'?INVALID_RECOVERY_MESSAGE:!checking||hasRead?'No se ha podido confirmar la integridad del plan. No se enviarán cambios desde esta pantalla.':'Los controles se habilitarán cuando termine la lectura.'}</p><button type="button" className="button secondary" style={{minHeight:44}} aria-disabled={busy||checking} onClick={()=>{if(action.current||controller.current)return;setError('');void load().catch(()=>{});}}>Actualizar estado guardado</button></div>:null}
    {!runtime&&!production?<SalesWorkspace view="proposals"/>:null}
    {production&&!runtime?<><ManualRecovery changes={changes.filter(c=>c.id>watermark)} revision={revision} pending={pending} refresh={load} integrityBlocked={blocked}/>{manualReport?<p className="helper">Última comprobación manual: {new Date(manualReport.verifiedAt).toLocaleString('es-ES')}. No se enviaron datos mediante la API.</p>:null}</>:!runtime?<details className="return-section" open={changes.length>0||!!plan||blocked}><summary><div><h2>Devolución revisada</h2><p className="muted">Compara, resuelve conflictos y aprueba el estado final antes de enviarlo.</p></div><ChevronDown size={17} className="disclosure-indicator"/></summary>
      <label className="checkbox-label"><input type="checkbox" checked={simulation} disabled={busy||blocked} onChange={e=>{if(!trusted.current)return;setSimulation(e.target.checked);setReviewed(false);}}/>Usar destino simulado para probar el recorrido (no envía datos a HubSpot)</label>
      {!simulation?<><p className="info-box">Solo cuentas HubSpot de prueba. La credencial necesita permisos de escritura adicionales. Revisa las automatizaciones con la agencia antes de aprobar.</p>
        <label className="field"><span>Token de escritura de esta cuenta (opcional si el guardado ya dispone de permisos)</span><input type="password" autoComplete="new-password" value={token} disabled={busy||blocked} onChange={e=>{if(trusted.current)setToken(e.target.value);}}/></label></>:null}
      <div className="button-row"><button className="button secondary" disabled={!changes.length||busy||blocked} onClick={()=>run(async()=>{await post('/v2/return/preview',destinations);setReviewed(false);},true)}>{busy?<Spinner/>:'Preparar revisión'}</button>
        {plan?.status==='review'&&plan.operations.some(o=>o.status==='applied')?<button className="text-button" disabled={busy||blocked} onClick={()=>run(()=>post('/v2/return/refresh',{...destinations,planId:plan.id}),true)}>Actualizar conflictos remotos</button>:null}</div>
      {plan?<div className="recovery-plan"><div className="plan-status"><span className="badge">{plan.source==='simulation'?'Destino simulado · sin envío real':'HubSpot de prueba'}</span><strong>{({review:'Pendiente de revisión',approved:'Aprobado',applying:'Enviando y verificando',complete:'Completado',partial:'Devolución parcial'})[plan.status]}</strong></div>
        <p className="helper">{plan.warning}</p>
        {plan.operations.length?(explained?<>
          <p className="return-summary" role="status">{[explained.summary.conflicts?count(explained.summary.conflicts,'conflicto por decidir','conflictos por decidir'):'',explained.summary.send+explained.summary.overwrite?count(explained.summary.send+explained.summary.overwrite,'campo se enviará','campos se enviarán'):'',explained.summary.creates?count(explained.summary.creates,'registro nuevo por crear','registros nuevos por crear'):'',explained.summary.keep?count(explained.summary.keep,'cambio se queda solo en tu copia','cambios se quedan solo en tu copia'):'',explained.summary.same?count(explained.summary.same,'campo ya coincide','campos ya coinciden'):'',explained.summary.done?count(explained.summary.done,'campo ya verificado','campos ya verificados'):'',explained.summary.uncertain?count(explained.summary.uncertain,'campo incierto: compruébalo','campos inciertos: compruébalos'):''].filter(Boolean).join(' · ')}.</p>
          {explained.groups.map(group=><section className="return-group" key={group.key} aria-label={'Cambios de '+group.title}><h3>{group.title}{group.conflicts?<span className="badge return-conflicts">{count(group.conflicts,'conflicto por decidir','conflictos por decidir')}</span>:null}</h3>
            {group.operations.map(item=>{const op=plan.operations.find(o=>o.id===item.id);if(!op)return null;return <article className="return-operation" key={op.id}><header><strong>{item.entityLabel.charAt(0).toUpperCase()+item.entityLabel.slice(1)} · {op.label}</strong><span>{op.kind==='create'?'Alta':'Cambio'} · {STATUS[op.status]}</span></header>
              <ul className="return-explained">{item.fields.filter(f=>!(f.tone==='create'&&f.local==='vacío')).map(f=>{const field=op.fields.find(x=>x.field===f.field)!;return <li key={f.field} className={'return-tone-'+f.tone}><p><strong>{f.label}.</strong> {f.text}</p>{op.kind==='update'?decide(op,field,'Quedarme con lo mío',plan.source==='simulation'?'Quedarme con lo del CRM de prueba':'Quedarme con lo de HubSpot'):null}</li>;})}</ul>
              {item.relations.map(text=><p className="helper" key={text}>{text}</p>)}
              {tail(op)}
            </article>;})}
          </section>)}
        </>:plan.operations.map(op=><article className="return-operation" key={op.id}><header><strong>{op.label}</strong><span>{op.kind==='create'?'Alta':'Cambio'} · {({pending:'Pendiente',sending:'Enviando',applied:'Verificado',failed:'Fallido',uncertain:'Resultado incierto',skipped:'Omitido'})[op.status]}</span></header>
          <div className="return-fields">{op.fields.map(field=><div className={field.conflict?'has-conflict':''} key={field.field}><div><strong>{field.label}</strong><span>Original: {String(field.base??'—')}</span></div><div><small>LOCAL</small><p>{String(field.local??'—')}</p></div><ArrowRight size={14}/><div><small>{plan.source==='simulation'?'DESTINO SIMULADO':'HUBSPOT'}</small><p>{String(field.remote??'—')}</p></div>
            {decide(op,field,'Usar local','Conservar remoto')}</div>)}</div>
          {op.references.length?<p className="helper">{op.references.length} relaciones se añadirán después de crear los registros necesarios.</p>:null}
          {tail(op)}
        </article>)):<p className="muted">No quedan cambios nuevos para este destino.</p>}
        {['review','partial'].includes(plan.status)?<><label className="checkbox-label"><input type="checkbox" checked={reviewed} disabled={busy||blocked} onChange={e=>{if(trusted.current)setReviewed(e.target.checked);}}/>He revisado las decisiones, los permisos y el efecto de los workflows. Coordinaré una ventana sin ediciones simultáneas.</label>
          <button className="button primary" disabled={busy||blocked||!reviewed||plan.source!==(simulation?'simulation':'hubspot')||plan.operations.some(o=>o.fields.some(f=>f.decision===null)||['sending','uncertain'].includes(o.status))} onClick={()=>run(()=>post('/v2/return/approve',{planId:plan.id,reviewedWorkflows:true}),true)}>Aprobar plan revisado</button></>:null}
        {plan.status==='approved'?<button className="button primary" disabled={busy||blocked||plan.source!==(simulation?'simulation':'hubspot')} onClick={()=>run(()=>post('/v2/return/apply',{...destinations,planId:plan.id,approved:true}),true)}>{plan.source==='simulation'?'Ejecutar devolución simulada':'Aplicar a HubSpot de prueba'}</button>:null}
        {plan.status==='complete'?<p className="success-label"><CheckCircle2 size={18}/>{plan.source==='simulation'?'Prueba completada. Los cambios locales siguen pendientes de devolución real.':'Los valores enviados se han leído y verificado en HubSpot.'}</p>:null}
      </div>:null}
    </details>:<p className="info-box">Exporta los cambios y abre la devolución en el generador con la agencia. Este paquete no contiene conectores externos.</p>}
    <ChangeHistory changes={changes} watermark={watermark} spec={spec}/>
  </section>;
}
