import { useState } from 'react';
import { Modal } from './components.js';
type Call=<T>(path:string,body?:unknown)=>Promise<T>;

export function TeamSpaceCreate({call,onCreated}:{call:Call;onCreated:(id:string)=>Promise<void>}){
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [createdId,setCreatedId]=useState<string|null>(null);
  const close=()=>{if(!busy){setOpen(false);setName('');setCreatedId(null);setError('');}};
  const submit=async()=>{
    if(busy||name.trim().length<2)return;
    setBusy(true);setError('');
    try{
      const id=createdId??(await call<{id:string}>('/spaces',{name:name.trim()})).id;
      setCreatedId(id);await onCreated(id);
      setOpen(false);setName('');setCreatedId(null);
    }catch(f){setError((f as Error).message);}finally{setBusy(false);}
  };
  return <><button className="text-button" onClick={()=>setOpen(true)}>Crear espacio separado</button>{open?<Modal title="Nuevo espacio" close={close}><form className="settings-form" onSubmit={event=>{event.preventDefault();void submit();}}><p className="helper">Empieza vacío y conecta el portal que corresponde a este espacio. Las conexiones y los datos de los otros espacios se conservan.</p><label className="field"><span>Nombre del espacio</span><input autoFocus value={name} maxLength={80} disabled={busy||!!createdId} onChange={event=>setName(event.target.value)}/></label>{error?<p className="error-box" role="alert">{error}</p>:null}<button className="button primary" disabled={busy||name.trim().length<2}>{busy?'Preparando…':createdId?'Abrir espacio creado':'Crear espacio vacío'}</button></form></Modal>:null}</>;
}
