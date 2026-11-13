import { useEffect,useId,useRef,useState } from 'react';
import { Check,RefreshCw } from 'lucide-react';
import type { CustomerDossier as Dossier,CustomerAction } from '../shared/customer.js';
import { Modal,Spinner } from './components.js';
import { LoadError } from './LoadError.js';
import './customer-dossier.css';
import { CustomerFiles } from './CustomerFiles.js';

type Call=<T>(path:string,body?:unknown)=>Promise<T>;
type Operation='save'|'status'|'prepare'|'refresh';
type FocusTarget='title'|'actions';
const date=(value:string)=>new Date(value).toLocaleString('es-ES',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function CustomerDossier({tenant,contact,local,canWrite,canConnect,call,close,onPrepared}:{tenant:string;contact:string;local:boolean;canWrite:boolean;canConnect:boolean;call:Call;close:()=>void;onPrepared:(id:string)=>void}){
  const path='/spaces/'+tenant+'/v6/customers/'+encodeURIComponent(contact),query='?source='+(local?'local':'active');
  const [data,setData]=useState<Dossier|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState(''),[stale,setStale]=useState(false),[restore,setRestore]=useState(0),[title,setTitle]=useState(''),[due,setDue]=useState(''),[operation,setOperation]=useState(()=>crypto.randomUUID()),[attempt,setAttempt]=useState(0),[filesPending,setFilesPending]=useState(0),[prepareId,setPrepareId]=useState(()=>crypto.randomUUID());
  const prepareReasonId=useId(),errorId=useId(),actionsHeading=useRef<HTMLHeadingElement>(null),titleField=useRef<HTMLInputElement>(null),errorBox=useRef<HTMLParagraphElement>(null);
  // `busy` solo llega con el siguiente render: dos activaciones seguidas lo verían libre. La guarda síncrona es la que impide duplicados y peticiones en paralelo.
  const lock=useRef<Operation|null>(null),mounted=useRef(true),focusAfter=useRef<FocusTarget|null>(null);
  const busy=pending!=='';
  const unsaved=!!title.trim()||!!due||filesPending>0;
  const prepareReasons=data?[
    busy?'Hay una operación en curso. Espera antes de preparar el seguimiento.':null,
    !canWrite?'Tu acceso es de solo lectura. Una persona con permiso de edición puede preparar el seguimiento.':null,
    !data.source.canPrepare?'Esta ficha no corresponde a la fuente comercial activa. Selecciona el contacto correcto en esa fuente para preparar el seguimiento.':null,
    !data.contact.email?'El contacto no tiene correo en estos datos guardados. Necesita un correo para preparar este seguimiento.':null
  ].filter((reason):reason is string=>reason!==null):[];
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{let alive=true;setError('');void call<Dossier>(path+query).then(next=>{if(alive)setData(next);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[path,query,attempt]);
  // El foco se recoloca después de pintar y solo si se perdió (el control desapareció o quedó deshabilitado). Si la persona lo movió, no se le quita; tras cerrar la ficha no se toca.
  useEffect(()=>{const target=focusAfter.current;focusAfter.current=null;if(!target||!mounted.current||typeof document==='undefined')return;const at=document.activeElement as HTMLElement|null;if(at&&at!==document.body&&at.isConnected&&!(at as HTMLButtonElement).disabled)return;(target==='title'?titleField:actionsHeading).current?.focus();},[restore]);
  // El aviso de fallo aparece arriba de la ficha; si la acción estaba más abajo, se acerca a la vista sin mover el foco.
  useEffect(()=>{if(error)errorBox.current?.scrollIntoView?.({block:'nearest'});},[error]);
  // Tres resultados distintos: la acción falla (`failure`), se realiza y la ficha se recarga, o se realiza y la recarga falla.
  // En el último caso la ficha mostrada es anterior a la acción: `stale` bloquea cambios de estado (llevan la versión vieja) hasta recargar, y reintentar la recarga no repite la acción.
  const run=async(label:Operation,text:string,action:()=>Promise<void>,failure:(cause:string)=>string,focus:FocusTarget|null=null)=>{
    if(lock.current)return;
    lock.current=label;setPending(text);setError('');setNotice('');
    try{await action();}catch(e){lock.current=null;if(mounted.current){setError(failure((e as Error).message));setPending('');}return;}
    try{if(mounted.current){const next=await call<Dossier>(path+query);if(mounted.current){setData(next);setStale(false);}}}
    catch(e){if(mounted.current){const cause=(e as Error).message;
      if(label!=='refresh'){setStale(true);setError('La acción se realizó, pero no se pudo actualizar la ficha: '+cause+' No la repitas; usa «Actualizar datos guardados».');}
      else setError(stale?'Sigue sin poder actualizarse la ficha: '+cause+' La acción anterior ya se realizó; no la repitas.':'No se pudo actualizar la ficha: '+cause);}}
    finally{lock.current=null;if(mounted.current){setPending('');if(focus){focusAfter.current=focus;setRestore(n=>n+1);}}}};
  const save=()=>{if(!canWrite||!data||!title.trim()||!due)return;const source=data.source.key;
    return run('save','Guardando la próxima acción…',async()=>{await call(path+'/actions'+query,{id:operation,sourceKey:source,title,dueAt:new Date(due).toISOString()});if(!mounted.current)return;setTitle('');setDue('');setOperation(crypto.randomUUID());setNotice('Próxima acción guardada solo en Plan B.');},
      cause=>'No se pudo guardar la próxima acción: '+cause+' Tus datos siguen en el formulario; si reintentas con los mismos datos no se duplicará.','title');};
  const status=(action:CustomerAction)=>{if(!canWrite||stale||!data)return;const completing=action.status==='open',source=data.source.key;
    return run('status',completing?'Completando la acción…':'Reabriendo la acción…',async()=>{await call(path+'/actions/'+action.id+query,{sourceKey:source,version:action.version,status:completing?'completed':'open'});if(mounted.current)setNotice(completing?'Acción completada en Plan B.':'Acción reabierta en Plan B.');},
      cause=>'No se pudo '+(completing?'completar':'reabrir')+' la acción «'+action.title+'»: '+cause+' Si la acción ya cambió, usa «Actualizar datos guardados» antes de reintentar.','actions');};
  const prepare=()=>{if(!data||busy||lock.current)return;const source=data.source.key;
    return run('prepare','Preparando el seguimiento…',async()=>{const result=await call<{id:string}>('/spaces/'+tenant+'/v6/proposals',{contactId:contact,id:prepareId,intent:{sourceKey:source,internalOnly:true}});if(mounted.current)setPrepareId(crypto.randomUUID());onPrepared(result.id);},cause=>cause);};
  const refresh=()=>run('refresh','Actualizando los datos guardados…',async()=>{},cause=>cause);
  const blockedBy=busy||stale?true:undefined;
  return <Modal title={data?'Ficha de '+data.contact.name:'Ficha comercial'} close={close} side confirmClose={()=>{
      if(lock.current&&lock.current!=='refresh')return confirm('Hay una operación en curso en esta ficha. Si la cierras ahora no verás su resultado. ¿Cerrar de todos modos?');
      return !unsaved||confirm('Hay texto o archivos sin guardar en esta ficha. ¿Cerrar y descartarlos?');}}>
    <div className="customer-dossier">
      {pending||notice?<p role="status" className={pending?'helper':'success-label'}>{pending||notice}</p>:null}
      {!data?(error?<LoadError message={error} onRetry={()=>setAttempt(n=>n+1)}/>:<Spinner text="Leyendo los datos guardados…"/>):<>{error?<p id={errorId} ref={errorBox} role="alert" className="error-box">{error}</p>:null}
        <div className="customer-origin"><span className="badge">{data.source.origin==='hubspot'?'Captura HubSpot':'Copia local'}</span>{data.source.isTestData?<span>Datos ficticios</span>:null}<small>Captura del {date(data.source.capturedAt)}</small></div>
        <p className="helper">Esta ficha usa datos guardados. Abrirla no consulta servicios externos.</p>
        <dl className="customer-facts"><div><dt>Empresa</dt><dd>{data.companies.map(c=>c.name).join(' · ')||'Sin empresa vinculada'}</dd></div><div><dt>Correo</dt><dd>{data.contact.email||'No disponible'}</dd></div><div><dt>Teléfono</dt><dd>{data.contact.phone||'No disponible'}</dd></div><div><dt>Responsable</dt><dd>{data.owner.name??(data.owner.id?'ID '+data.owner.id+' · nombre no conservado':'No conservado en los datos disponibles')}</dd></div></dl>
        <section><div className="customer-section-heading"><h3>Oportunidades</h3><button className="button secondary" disabled={prepareReasons.length>0} aria-describedby={prepareReasons.length?prepareReasonId:undefined} onClick={()=>void prepare()}>Preparar seguimiento</button></div>
          {prepareReasons.length?<p id={prepareReasonId} className="helper">{prepareReasons.join(' ')}</p>:null}
          {data.opportunities.length?<ul className="customer-opportunities">{data.opportunities.map(deal=><li key={deal.id}><strong>{deal.name}</strong><span>{deal.stage}{deal.ownerId?' · Responsable ID '+deal.ownerId:''}</span>{deal.amount!==null?<small>Importe: {deal.amount.toLocaleString('es-ES')} · moneda no conservada</small>:null}</li>)}</ul>:<p className="helper">No hay oportunidades vinculadas en estos datos.</p>}
          <p className="helper">Preparar crea un borrador sin seleccionar envíos, reuniones o archivos.</p>
        </section>
        <section><div className="customer-section-heading"><h3 ref={actionsHeading} tabIndex={-1}>Próxima acción</h3><span className="badge">Solo Plan B</span></div>
          {data.actions.filter(a=>a.status==='open').length?<ul className="customer-actions">{data.actions.filter(a=>a.status==='open').map(action=><li key={action.id}><div><strong>{action.title}</strong><small className={Date.parse(action.due_at)<Date.now()?'customer-overdue':''}>{Date.parse(action.due_at)<Date.now()?'Vencida · ':''}{date(action.due_at)}</small></div><button className="icon-button" aria-label={'Completar '+action.title} disabled={!canWrite} aria-disabled={blockedBy} aria-describedby={stale?errorId:undefined} onClick={()=>void status(action)}><Check size={17}/></button></li>)}</ul>:<p className="helper">{canWrite?'Sin próximas acciones internas. Puedes guardar una aquí.':'Sin próximas acciones internas. Tu acceso es de solo lectura; una persona con permiso de edición puede guardarlas.'}</p>}
          {canWrite?<form className="customer-action-form" aria-busy={busy||undefined} onSubmit={event=>{event.preventDefault();void save();}}><label className="field"><span>Qué hay que hacer</span><input ref={titleField} required maxLength={200} value={title} readOnly={busy} onChange={e=>{if(busy)return;setTitle(e.target.value);setOperation(crypto.randomUUID());}}/></label><div><label className="field"><span>Fecha y hora local</span><input required type="datetime-local" value={due} readOnly={busy} onChange={e=>{if(busy)return;setDue(e.target.value);setOperation(crypto.randomUUID());}}/></label><button className="button primary" disabled={!title.trim()||!due} aria-disabled={busy||undefined}>Guardar próxima acción</button></div></form>:null}
          <p className="helper">Crear o completar una acción no envía correos ni modifica HubSpot.</p>
        </section>
        <section><h3>Actividad guardada</h3><p className="helper">Tareas de la captura y acciones internas. Las fechas CRM indican vencimiento; no es un historial completo de comunicaciones.</p>
          <ul className="customer-activity">{data.capturedTasks.map(task=><li key={'crm-'+task.id}><small>{data.source.origin==='hubspot'?'Captura CRM':'Copia local'} · {task.dueAt?'Vence '+date(task.dueAt):'Sin fecha'} · {task.completed?'Completada':task.status||'Estado desconocido'}</small><strong>{task.title}</strong></li>)}{data.actions.filter(a=>a.status==='completed').map(action=><li key={action.id}><small>Plan B · completada · vencimiento {date(action.due_at)}</small><div><strong>{action.title}</strong><button className="text-button" disabled={!canWrite} aria-disabled={blockedBy} aria-describedby={stale?errorId:undefined} onClick={()=>void status(action)}>Reabrir</button></div></li>)}</ul>
          {!data.capturedTasks.length&&!data.actions.some(a=>a.status==='completed')?<p className="helper">Sin actividad conservada para este cliente.</p>:null}
        </section>
        <CustomerFiles tenant={tenant} contact={contact} local={local} canWrite={canWrite} canConnect={canConnect} call={call} onPendingChange={setFilesPending}/>
        <button className="text-button" aria-disabled={busy||undefined} onClick={()=>void refresh()}><RefreshCw size={14}/>Actualizar datos guardados</button>
      </>}
    </div>
  </Modal>;
}
