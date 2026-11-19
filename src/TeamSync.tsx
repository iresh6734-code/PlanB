import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { TeamRecord } from '../shared/team.js';
import { TeamReplicaViewSchema, completeReplica, replicaContacts, type TeamReplicaView } from '../shared/team-replica-view.js';
import { api, ApiError } from './api.js';
import { Modal, Spinner } from './components.js';
import './team-sync.css';

type Edit={record:TeamRecord;revision:string;stale:boolean};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const display=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v);
const title=(r:TeamRecord)=>[r.value.values.firstname,r.value.values.lastname].filter(v=>v!==null&&v!==undefined&&v!=='').join(' ')||r.id;
export function TeamSync(){
 const [state,setState]=useState<TeamReplicaView|null>(null),[tenantId,setTenantId]=useState(''),[token,setToken]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[needsRead,setNeedsRead]=useState(false);
 const [edit,setEdit]=useState<Edit|null>(null),[phone,setPhone]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const alive=useRef(true),read=useRef<{id:number;controller:AbortController}|null>(null),serial=useRef(0),command=useRef<AbortController|null>(null),authority=useRef(state),search=useRef<HTMLInputElement>(null),mustRead=useRef(false),editing=useRef(edit);
 authority.current=state;editing.current=edit;
 const updateEdit=(value:Edit|null)=>{editing.current=value;setEdit(value);};
 const markReadRequired=(value:boolean)=>{mustRead.current=value;setNeedsRead(value);};
 const load=async()=>{
  if(!alive.current)return false;
  read.current?.controller.abort();const request={id:++serial.current,controller:new AbortController()};read.current=request;setLoading(true);
  const owns=()=>alive.current&&read.current===request;
  try{const next=TeamReplicaViewSchema.safeParse(await api<unknown>('/v5/team-sync',{signal:request.controller.signal}));if(!owns())return false;if(!next.success)throw Error('El servidor no devolvió una réplica con identidades válidas.');authority.current=next.data;setState(next.data);markReadRequired(false);setError('');return true;}
  catch(f){if(owns()){setError(f instanceof Error?f.message:'No se pudo leer la copia de equipo.');markReadRequired(true);}return false;}
  finally{if(owns()){setLoading(false);read.current=null;}}
 };
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;read.current?.controller.abort();command.current?.abort();read.current=null;command.current=null;};},[]);
 const window=useMemo(()=>replicaContacts(state?.records??[],query,page),[state?.records,query,page]);
 const currentRow=edit?state?.records.find(r=>r.entity===edit.record.entity&&r.id===edit.record.id):undefined;
 const stale=!!edit&&(edit.stale||edit.revision!==state?.revision||!currentRow);
 const blocked=busy||loading||needsRead;
 const mutate=async(kind:'link'|'sync'|'edit')=>{
  const current=authority.current;
  if(!alive.current||command.current||read.current||mustRead.current||!current)return;
  if(kind==='link'&&(current.linked||!current.configured||!current.origin||!uuid.test(tenantId)||!/^([a-f0-9]{64})$/.test(token)))return;
  if(kind!=='link'&&!current.linked)return;
  if(kind==='edit'&&(!edit||editing.current!==edit||edit.stale||edit.revision!==current.revision||!current.revision||phone.length>10000))return;
  const request=new AbortController();command.current=request;++serial.current;setBusy(true);setError('');setMessage('');
  const owns=()=>alive.current&&command.current===request;
  const endpoint=kind==='edit'?'/v6/team-sync/edit':kind==='sync'?'/v5/team-sync/run':'/v5/team-sync/link';
  const body=kind==='edit'?{entity:edit!.record.entity,id:edit!.record.id,values:{phone},revision:edit!.revision}:kind==='sync'?{reviewed:true}:{url:current.origin,tenantId,token};
  try{
   const result=await api<unknown>(endpoint,{method:'POST',body:JSON.stringify(body),signal:request.signal});if(!owns())return;
   if(kind==='edit'){
    const ack=result as {queued?:boolean;pending?:number}|null;if(!ack||ack.queued!==true||typeof ack.pending!=='number'||!Number.isSafeInteger(ack.pending)||ack.pending<1||ack.pending>100)throw Error('El servidor no confirmó que el cambio quedara pendiente. Actualiza el estado antes de repetirlo.');
    editing.current=null;updateEdit(null);setPhone('');setMessage('El teléfono se guardó en la cola local. Todavía no se ha sincronizado con el equipo.');
   }else{
    const parsed=TeamReplicaViewSchema.safeParse(result);if(!parsed.success||!parsed.data.linked||parsed.data.tenantId!==(kind==='link'?tenantId:current.tenantId)||parsed.data.url!==(kind==='link'?current.origin:current.url))throw Error('El servidor no confirmó el intercambio con la empresa y el destino solicitados. Actualiza el estado antes de repetirlo.');
    authority.current=parsed.data;setState(parsed.data);
    if(kind==='link'){setToken('');setMessage('La vinculación quedó guardada en esta copia.');}else setMessage('El intercambio terminó. Revisa los cambios pendientes y los conflictos que indique la copia.');
   }
   markReadRequired(true);await load();
  }catch(f){if(!owns())return;setError(f instanceof ApiError&&f.status===404&&kind==='edit'?'Este servidor no admite guardar contra una revisión exacta. Actualiza Plan B; no se enviará por la ruta antigua.':f instanceof Error?f.message:'No se pudo completar el intercambio.');markReadRequired(true);if(kind==='edit'&&edit)updateEdit({...edit,stale:true});}
  finally{if(owns()){command.current=null;setBusy(false);}}
 };
 const closeEdit=()=>{if(!command.current){updateEdit(null);setPhone('');}};
 const reviewEdit=()=>{const current=authority.current;if(!edit||command.current||read.current||mustRead.current||!current?.revision)return;const row=current.records.find(r=>r.entity===edit.record.entity&&r.id===edit.record.id);if(row)updateEdit({record:row,revision:current.revision,stale:false});};
 return <section className="sales-page team-sync-page" aria-label="Copia de equipo"><header className="page-header"><div><h1>Copia de equipo</h1><p className="page-subtitle">Una réplica separada, con cambios pendientes y conflictos revisables.</p></div></header>
  {message?<p className="success-label" role="status">{message}</p>:null}
  {error&&!edit?<p className="error-box" role="alert">{error}</p>:null}
  {needsRead?<p className="info-box">Actualiza la lectura local antes de hacer otro intercambio. Este botón no repite la vinculación, el guardado ni la sincronización.</p>:null}
  <div className="team-sync-toolbar"><button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>{loading?'Leyendo copia…':'Actualizar copia local'}</button>{loading?<span role="status">Consultando el estado guardado en este ordenador.</span>:null}</div>
  {!state?(loading?<Spinner/>:<p>No hay un estado disponible. Reintenta la lectura local.</p>):!state.linked?<>
   <p className="helper">Protege esta copia y crea una vinculación desde Dispositivos en el servicio de equipo. La réplica se guarda separada del CRM activo.</p>
   {!state.configured?<p className="info-box">Esta instalación necesita un servicio de equipo configurado por su administrador.</p>:null}
   <form className="team-sync-link" onSubmit={e=>{e.preventDefault();void mutate('link');}}><label className="field"><span>Servicio de equipo configurado</span><input value={state.origin??''} readOnly/></label><label className="field"><span>ID de empresa</span><input disabled={busy} value={tenantId} onChange={e=>{if(!command.current)setTenantId(e.target.value);}} maxLength={36} autoComplete="off"/></label><label className="field"><span>Clave de vinculación</span><input disabled={busy} type="password" autoComplete="off" value={token} maxLength={64} onChange={e=>{if(!command.current)setToken(e.target.value);}}/></label><button className="button primary" disabled={blocked||!state.configured||!state.origin||!uuid.test(tenantId)||!/^([a-f0-9]{64})$/.test(token)}>Vincular copia protegida</button></form>
  </>:<>
   <div className="status-strip"><span>{state.pending} cambios pendientes · {state.conflicts.length} conflictos registrados</span><button type="button" className="button secondary" disabled={blocked||!!edit} onClick={()=>void mutate('sync')}><RefreshCw size={15}/>Sincronizar ahora</button></div>
   <p className="helper">Empresa: {state.tenantId} · Último intercambio: {state.lastSync?display(state.lastSync):'Todavía sin intercambios'}</p>{state.error?<p className="warning-text">{state.error}</p>:null}
   {state.conflicts.length?<p className="info-box">Revisa los conflictos en Dispositivos del equipo. Los cambios locales no sustituyen silenciosamente una revisión remota posterior.</p>:null}
   {!completeReplica(state)?<p className="info-box" role="status">No se ha podido comprobar que estén todos los registros. Recibidos: {state.records.length}{state.totalRecords!==undefined?' de '+state.totalRecords+' indicados':''}. Actualiza Plan B antes de dar la lista por completa.</p>:<p className="helper">{state.records.length} registros recibidos · {window.contacts} contactos en la réplica completa</p>}
   {!state.revision?<p className="info-box">Este servidor no identifica la revisión de la réplica. La edición queda deshabilitada hasta actualizar Plan B.</p>:null}
   <div className="team-sync-toolbar"><label className="field"><span>Buscar contactos de la copia</span><input type="search" ref={search} maxLength={160} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Nombre, ID o teléfono…"/></label>{query?<button type="button" className="button secondary" onClick={()=>{setQuery('');setPage(0);search.current?.focus();}}>Limpiar búsqueda</button>:null}</div>
   <p aria-live="polite">{window.total?window.start+'–'+window.end+' de '+window.total+' contactos recibidos':'No hay contactos que coincidan.'}{query?' · '+window.contacts+' contactos recibidos en total':''}</p>
   <ul className="team-sync-records" aria-label="Contactos de la copia">{window.items.map(r=><li key={JSON.stringify([r.entity,r.id])}><div><strong>{title(r)}</strong><small>ID {r.id}</small></div><div><small>Teléfono local</small><span>{display(r.value.values.phone)}</span></div><div><small>Revisión remota</small><span>{r.version}</span></div><button type="button" className="button secondary" aria-label={'Editar teléfono de '+r.id} disabled={blocked||!state.revision} onClick={()=>{if(command.current||read.current||!authority.current?.revision||mustRead.current)return;const row=authority.current.records.find(row=>row.entity===r.entity&&row.id===r.id);if(!row)return;updateEdit({record:row,revision:authority.current.revision,stale:false});setPhone(row.value.values.phone===null||row.value.values.phone===undefined?'':String(row.value.values.phone));}}>Editar sin conexión</button></li>)}</ul>
   {window.pages>1?<nav className="team-sync-toolbar" aria-label="Páginas de contactos"><button type="button" className="button secondary" disabled={window.page===0} onClick={()=>setPage(window.page-1)}>Anterior</button><span>Página {window.page+1} de {window.pages}</span><button type="button" className="button secondary" disabled={!window.hasMore} onClick={()=>setPage(window.page+1)}>Siguiente</button></nav>:null}
   {state.url?<a className="text-button" href={state.url+'/team'} target="_blank" rel="noreferrer">Abrir servicio de equipo</a>:null}
  </>}
  {edit?<Modal title="Cambiar teléfono en la copia" close={closeEdit}><form className="settings-form team-sync-edit" onSubmit={e=>{e.preventDefault();void mutate('edit');}}><p>{title(edit.record)} · ID {edit.record.id}</p>{error?<p className="error-box" role="alert">{error}</p>:null}{needsRead?<p className="helper">Actualiza la copia sin cerrar este formulario. Tu borrador se conserva y no se repite el guardado.</p>:null}<button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}>Actualizar copia sin perder borrador</button>{loading?<p role="status">Leyendo la versión actual de la copia.</p>:null}<label className="field"><span>Teléfono local</span><input value={phone} disabled={busy} maxLength={10000} onChange={e=>{if(!command.current)setPhone(e.target.value);}}/></label><p className="helper">El cambio quedará pendiente hasta sincronizar. No se envía a HubSpot.</p>{stale?<div className="info-box"><p>La réplica cambió. Se conserva tu borrador. Teléfono actual recibido: {currentRow?display(currentRow.value.values.phone):'Ficha ausente de la copia recibida'}.</p><button type="button" className="button secondary" disabled={blocked||!currentRow||!state?.revision} onClick={reviewEdit}>Revisar versión actual</button></div>:null}<button className="button primary" disabled={blocked||stale}>Guardar en la copia</button><button type="button" className="button secondary" disabled={busy} onClick={closeEdit}>Cancelar</button></form></Modal>:null}
 </section>;
}
