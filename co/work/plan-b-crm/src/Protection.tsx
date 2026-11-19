import { useEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { api } from './api.js';
import { Brand, Spinner } from './components.js';
import './protection.css';

export function Protection({setup,done,cancel}:{setup:boolean;done:()=>void|Promise<void>;cancel?:()=>void}){
 const [credentials,setCredentials]=useState({setup,password:'',confirm:''}),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState<{version:number;text:string}|null>(null),[confirmed,setConfirmed]=useState<number|null>(null);
 const context=useRef({setup,version:0});if(context.current.setup!==setup)context.current={setup,version:context.current.version+1};
 const version=context.current.version,alive=useRef(true),flight=useRef<{version:number;controller:AbortController}|null>(null),ack=useRef<number|null>(null);
 const password=credentials.setup===setup?credentials.password:'',confirm=credentials.setup===setup?credentials.confirm:'';
 const current=()=>alive.current&&context.current.version===version;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;flight.current?.controller.abort();flight.current=null;};},[]);
 useEffect(()=>{setCredentials({setup,password:'',confirm:''});setError(null);setConfirmed(null);ack.current=null;return()=>{if(flight.current?.version===version){flight.current.controller.abort();flight.current=null;}};},[setup]);
 const edit=(field:'password'|'confirm',value:string)=>{if(!current()||flight.current||ack.current===version)return;setCredentials(c=>({...c,setup,password:c.setup===setup?c.password:'',confirm:c.setup===setup?c.confirm:'',[field]:value}));setError(null);};
 const complete=async(request:{version:number;controller:AbortController})=>{
  try{await done();}
  catch{if(current()&&flight.current===request)setError({version,text:'El servidor confirmó el acceso, pero no se pudo terminar de abrir la copia. Reintenta la apertura; no se enviará otra petición de autenticación.'});}
 };
 const submit=async()=>{
  if(!current()||flight.current||ack.current===version)return;
  if(password.length<(setup?12:1)||password.length>200){setError({version,text:setup?'La contraseña debe tener entre 12 y 200 caracteres.':'Introduce tu contraseña local (hasta 200 caracteres).'});return;}
  if(setup&&password!==confirm){setError({version,text:'Las contraseñas no coinciden.'});return;}
  const request={version,controller:new AbortController()};flight.current=request;setBusy(version);setError(null);
  const owns=()=>current()&&flight.current===request;
  try{
   const result=await api<unknown>('/v2/auth/'+(setup?'setup':'login'),{method:'POST',body:JSON.stringify({password}),signal:request.controller.signal});if(!owns())return;
   if(!result||typeof result!=='object'||(setup?(result as {configured?:unknown}).configured!==true:(result as {authenticated?:unknown}).authenticated!==true))throw Error('El servidor no confirmó '+(setup?'la creación de la protección.':'el desbloqueo de la copia.'));
   ack.current=version;setConfirmed(version);setCredentials({setup,password:'',confirm:''});await complete(request);
  }catch(f){if(owns())setError({version,text:f instanceof Error?f.message:'No se pudo completar el acceso.'});}
  finally{if(owns()){flight.current=null;setBusy(null);}}
 };
 const retry=async()=>{if(!current()||flight.current||ack.current!==version)return;const request={version,controller:new AbortController()};flight.current=request;setBusy(version);setError(null);try{await complete(request);}finally{if(current()&&flight.current===request){flight.current=null;setBusy(null);}}};
 const leave=()=>{if(!current()||flight.current)return;alive.current=false;cancel?.();};
 const isBusy=busy===version,isConfirmed=confirmed===version;
 return <main className="unlock-page protection-page"><Brand/><section><LockKeyhole size={28}/><h1>{isConfirmed?(setup?'Protección creada':'Copia desbloqueada'):setup?'Protege tu copia':'Tu copia está protegida'}</h1>
  <p>{isConfirmed?'El servidor local confirmó el acceso. Continúa con la apertura de esta copia.':setup?'Elige una contraseña local. Los datos y credenciales se cifran también para tu usuario de Windows.':'Desbloquea la aplicación para acceder a tus datos. La sesión se cierra tras 30 minutos sin actividad.'}</p>
  {isConfirmed?<div className="protection-completion">{error?.version===version?<p className="error-box" role="alert">{error.text}</p>:null}<button type="button" className="button primary" disabled={isBusy} onClick={()=>void retry()}>{isBusy?'Abriendo copia…':'Reintentar apertura'}</button></div>:<form aria-label={setup?'Configurar protección local':'Desbloquear copia local'} aria-busy={isBusy} onSubmit={e=>{e.preventDefault();void submit();}}>
   <label className="field"><span>Contraseña local</span><input type="password" value={password} disabled={isBusy} autoFocus minLength={setup?12:1} maxLength={200} required autoComplete={setup?'new-password':'current-password'} onChange={e=>edit('password',e.target.value)}/></label>
   {setup?<p className="helper">Usa entre 12 y 200 caracteres y repite la misma contraseña.</p>:null}{setup?<label className="field"><span>Repite la contraseña</span><input type="password" value={confirm} disabled={isBusy} minLength={12} maxLength={200} required autoComplete="new-password" onChange={e=>edit('confirm',e.target.value)}/></label>:null}
   {setup&&confirm&&password!==confirm?<p className="helper" aria-live="polite">Las contraseñas no coinciden.</p>:null}{error?.version===version?<p className="error-box" role="alert">{error.text}</p>:null}
   <button className="button primary" disabled={isBusy||password.length<(setup?12:1)||password.length>200||setup&&password!==confirm}>{isBusy?<Spinner text="Comprobando acceso…"/>:setup?'Guardar protección':'Desbloquear'}</button>
   {cancel?<button type="button" className="button secondary" disabled={isBusy} onClick={leave}>Volver a la aplicación</button>:null}
  </form>}
  <small>Para mover los datos a otro equipo usa una exportación cifrada y su contraseña de recuperación. La contraseña local no sustituye esa copia.</small>
 </section></main>;
}
