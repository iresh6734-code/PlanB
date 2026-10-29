import { useEffect,useId,useRef,useState } from 'react';
import { Check,RefreshCw } from 'lucide-react';
import type { CustomerDossier as Dossier,CustomerAction } from '../shared/customer.js';
import { Modal,Spinner } from './components.js';
import { LoadError } from './LoadError.js';
import './customer-dossier.css';
import { CustomerFiles } from './CustomerFiles.js';

type Call=<T>(path:string,body?:unknown)=>Promise<T>;
const date=(value:string)=>new Date(value).toLocaleString('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function CustomerDossier({tenant,contact,local,canWrite,canConnect,call,close,onPrepared}:{tenant:string;contact:string;local:boolean;canWrite:boolean;canConnect:boolean;call:Call;close:()=>void;onPrepared:(id:string)=>void}){
  const path='/spaces/'+tenant+'/v6/customers/'+encodeURIComponent(contact),query='?source='+(local?'local':'active');
  const [data,setData]=useState<Dossier|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[title,setTitle]=useState(''),[due,setDue]=useState(''),[operation,setOperation]=useState(()=>crypto.randomUUID()),[attempt,setAttempt]=useState(0),[filesPending,setFilesPending]=useState(0),[prepareId,setPrepareId]=useState(()=>crypto.randomUUID());
  const prepareReasonId=useId(),actionsHeading=useRef<HTMLHeadingElement>(null);
  const unsaved=!!title.trim()||!!due||filesPending>0;
  const prepareReasons=data?[
    busy?'Hay una operación en curso. Espera antes de preparar el seguimiento.':null,
    !canWrite?'Tu acceso es de solo lectura. Una persona con permiso de edición puede preparar el seguimiento.':null,
    !data.source.canPrepare?'Esta ficha no corresponde a la fuente comercial activa. Selecciona el contacto correcto en esa fuente para preparar el seguimiento.':null,
    !data.contact.email?'El contacto no tiene correo en estos datos guardados. Necesita un correo para preparar este seguimiento.':null
  ].filter((reason):reason is string=>reason!==null):[];
  useEffect(()=>{let alive=true;setError('');void call<Dossier>(path+query).then(next=>{if(alive)setData(next);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[path,query,attempt]);
  // La acción y la recarga se informan por separado: si la recarga falla, la acción ya realizada no se presenta como fallo.
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError((e as Error).message);setBusy(false);return;}
    try{setData(await call<Dossier>(path+query));}catch(e){setError('La acción se realizó, pero no se pudo actualizar la ficha: '+(e as Error).message+' Usa «Actualizar datos guardados».');}finally{setBusy(false);}};
  const save=()=>run(async()=>{await call(path+'/actions'+query,{id:operation,sourceKey:data!.source.key,title,dueAt:new Date(due).toISOString()});setTitle('');setDue('');setOperation(crypto.randomUUID());setNotice('Próxima acción guardada solo en Plan B.');});
  const status=(action:CustomerAction)=>run(async()=>{await call(path+'/actions/'+action.id+query,{sourceKey:data!.source.key,version:action.version,status:action.status==='open'?'completed':'open'});setNotice(action.status==='open'?'Acción completada en Plan B.':'Acción reabierta en Plan B.');actionsHeading.current?.focus();});
  return <Modal title={data?'Ficha de '+data.contact.name:'Ficha comercial'} close={close} side confirmClose={()=>!unsaved||confirm('Hay texto o archivos sin guardar en esta ficha. ¿Cerrar y descartarlos?')}>
    <div className="customer-dossier">
      {notice?<p role="status" className="success-label">{notice}</p>:null}
      {!data?(error?<LoadError message={error} onRetry={()=>setAttempt(n=>n+1)}/>:<Spinner text="Leyendo los datos guardados…"/>):<>{error?<p role="alert" className="error-box">{error}</p>:null}
        <div className="customer-origin"><span className="badge">{data.source.origin==='hubspot'?'Captura HubSpot':'Copia local'}</span>{data.source.isTestData?<span>Datos ficticios</span>:null}<small>Captura del {date(data.source.capturedAt)}</small></div>
        <p className="helper">Esta ficha usa datos guardados. Abrirla no consulta servicios externos.</p>
        <dl className="customer-facts"><div><dt>Empresa</dt><dd>{data.companies.map(c=>c.name).join(' · ')||'Sin empresa vinculada'}</dd></div><div><dt>Correo</dt><dd>{data.contact.email||'No disponible'}</dd></div><div><dt>Teléfono</dt><dd>{data.contact.phone||'No disponible'}</dd></div><div><dt>Responsable</dt><dd>{data.owner.name??(data.owner.id?'ID '+data.owner.id+' · nombre no conservado':'No conservado en los datos disponibles')}</dd></div></dl>
        <section><div className="customer-section-heading"><h3>Oportunidades</h3><button className="button secondary" disabled={prepareReasons.length>0} aria-describedby={prepareReasons.length?prepareReasonId:undefined} onClick={()=>void run(async()=>{const result=await call<{id:string}>('/spaces/'+tenant+'/v6/proposals',{contactId:contact,id:prepareId,intent:{sourceKey:data.source.key,internalOnly:true}});setPrepareId(crypto.randomUUID());onPrepared(result.id);})}>Preparar seguimiento</button></div>
          {prepareReasons.length?<p id={prepareReasonId} className="helper">{prepareReasons.join(' ')}</p>:null}
          {data.opportunities.length?<ul className="customer-opportunities">{data.opportunities.map(deal=><li key={deal.id}><strong>{deal.name}</strong><span>{deal.stage}{deal.ownerId?' · Responsable ID '+deal.ownerId:''}</span>{deal.amount!==null?<small>Importe: {deal.amount.toLocaleString('es-ES')} · moneda no conservada</small>:null}</li>)}</ul>:<p className="helper">No hay oportunidades vinculadas en estos datos.</p>}
          <p className="helper">Preparar crea un borrador sin seleccionar envíos, reuniones o archivos.</p>
        </section>
        <section><div className="customer-section-heading"><h3 ref={actionsHeading} tabIndex={-1}>Próxima acción</h3><span className="badge">Solo Plan B</span></div>
          {data.actions.filter(a=>a.status==='open').length?<ul className="customer-actions">{data.actions.filter(a=>a.status==='open').map(action=><li key={action.id}><div><strong>{action.title}</strong><small className={Date.parse(action.due_at)<Date.now()?'customer-overdue':''}>{Date.parse(action.due_at)<Date.now()?'Vencida · ':''}{date(action.due_at)}</small></div><button className="icon-button" aria-label={'Completar '+action.title} disabled={busy||!canWrite} onClick={()=>void status(action)}><Check size={17}/></button></li>)}</ul>:<p className="helper">{canWrite?'Sin próximas acciones internas. Puedes guardar una aquí.':'Sin próximas acciones internas. Tu acceso es de solo lectura; una persona con permiso de edición puede guardarlas.'}</p>}
          {canWrite?<form className="customer-action-form" onSubmit={event=>{event.preventDefault();void save();}}><label className="field"><span>Qué hay que hacer</span><input required maxLength={200} value={title} disabled={busy} onChange={e=>{setTitle(e.target.value);setOperation(crypto.randomUUID());}}/></label><div><label className="field"><span>Fecha y hora local</span><input required type="datetime-local" value={due} disabled={busy} onChange={e=>{setDue(e.target.value);setOperation(crypto.randomUUID());}}/></label><button className="button primary" disabled={busy||!title.trim()||!due}>Guardar próxima acción</button></div></form>:null}
          <p className="helper">Crear o completar una acción no envía correos ni modifica HubSpot.</p>
        </section>
        <section><h3>Actividad guardada</h3><p className="helper">Tareas de la captura y acciones internas. Las fechas CRM indican vencimiento; no es un historial completo de comunicaciones.</p>
          <ul className="customer-activity">{data.capturedTasks.map(task=><li key={'crm-'+task.id}><small>{data.source.origin==='hubspot'?'Captura CRM':'Copia local'} · {task.dueAt?'Vence '+date(task.dueAt):'Sin fecha'} · {task.completed?'Completada':task.status||'Estado desconocido'}</small><strong>{task.title}</strong></li>)}{data.actions.filter(a=>a.status==='completed').map(action=><li key={action.id}><small>Plan B · completada · vencimiento {date(action.due_at)}</small><div><strong>{action.title}</strong><button className="text-button" disabled={busy||!canWrite} onClick={()=>void status(action)}>Reabrir</button></div></li>)}</ul>
          {!data.capturedTasks.length&&!data.actions.some(a=>a.status==='completed')?<p className="helper">Sin actividad conservada para este cliente.</p>:null}
        </section>
        <CustomerFiles tenant={tenant} contact={contact} local={local} canWrite={canWrite} canConnect={canConnect} call={call} onPendingChange={setFilesPending}/>
        <button className="text-button" disabled={busy} onClick={()=>void run(async()=>{})}><RefreshCw size={14}/>Actualizar datos guardados</button>
      </>}
    </div>
  </Modal>;
}
