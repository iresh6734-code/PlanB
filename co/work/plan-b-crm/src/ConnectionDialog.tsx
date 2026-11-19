import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { entityNames, type ConnectionMode, type EntityName } from '../shared/model.js';
import { api } from './api.js';
import { Modal, Spinner } from './components.js';
import './connection-dialog.css';

type Inspection={accountId:string;accountType:string;mode:ConnectionMode;fields:Record<string,{key:string;label:string}[]>};
const fieldSchema=z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/),label:z.string().min(1).max(1000)});
const inspectionSchema=z.object({accountId:z.string().regex(/^\d+$/),accountType:z.string().min(1),mode:z.enum(['test','production_readonly']),fields:z.object({contacts:z.array(fieldSchema).max(5000),companies:z.array(fieldSchema).max(5000),deals:z.array(fieldSchema).max(5000),tasks:z.array(fieldSchema).max(5000)})});
export function ConnectionDialog({close,done}:{close:()=>void;done:()=>Promise<void>}){
  const [mode,setMode]=useState<ConnectionMode>('test'),[accountId,setAccountId]=useState(''),[token,setToken]=useState('');
  const [confirmed,setConfirmed]=useState(false),[inspection,setInspection]=useState<{data:Inspection;version:number}|null>(null),[selected,setSelected]=useState<Partial<Record<EntityName,string[]>>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const alive=useRef(true),flight=useRef(false),savedRef=useRef(false),sequence=useRef(0),version=useRef(0),controller=useRef<AbortController|null>(null),callbacks=useRef({close,done});callbacks.current={close,done};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;controller.current?.abort();};},[]);
  const cancel=()=>{alive.current=false;sequence.current++;controller.current?.abort();callbacks.current.close();};
  const edit=(change:()=>void)=>{if(flight.current||savedRef.current)return;version.current++;setInspection(null);setSelected({});setError('');change();};
  const refreshSaved=async()=>{
    if(flight.current||!alive.current)return;flight.current=true;setBusy(true);setError('');const request=++sequence.current;
    try{await callbacks.current.done();if(alive.current&&sequence.current===request)callbacks.current.close();}
    catch{if(alive.current&&sequence.current===request)setError('La conexión se guardó, pero no se pudo actualizar la pantalla. Reintenta la actualización; no se enviará otra petición de guardado.');}
    finally{if(alive.current&&sequence.current===request){flight.current=false;setBusy(false);}}
  };
  const run=async()=>{
    if(flight.current||savedRef.current||!alive.current)return;
    if(!/^\d+$/.test(accountId)||token.length<10||token.length>4096||!confirmed){setError('Indica el ID numérico, una credencial de entre 10 y 4096 caracteres y la confirmación del modo elegido.');return;}
    if(inspection&&inspection.version!==version.current){setInspection(null);setSelected({});setError('La conexión cambió. Comprueba de nuevo la cuenta antes de guardar.');return;}
    const save=!!inspection,body={accountId,token,mode,confirmedTestAccount:mode==='test'&&confirmed,confirmedProduction:mode==='production_readonly'&&confirmed,selectedFields:save?selected:{}};
    flight.current=true;setBusy(true);setError('');const request=++sequence.current,context=version.current,abort=new AbortController();controller.current=abort;
    const current=()=>alive.current&&sequence.current===request&&version.current===context&&!abort.signal.aborted;
    try{
      const response=await api<unknown>(save?'/v2/connection':'/v2/connection/inspect',{method:'POST',body:JSON.stringify(body),signal:abort.signal});
      if(!current())return;
      if(save){
        if(!response||typeof response!=='object'||(response as {saved?:boolean}).saved!==true)throw Error('El servidor no confirmó el guardado. No se da la conexión por guardada.');
        savedRef.current=true;setToken('');setConfirmed(false);setSelected({});setInspection(null);setSaved(true);
        try{await callbacks.current.done();if(current())callbacks.current.close();}
        catch{if(current())setError('La conexión se guardó, pero no se pudo actualizar la pantalla. Reintenta la actualización; no se enviará otra petición de guardado.');}
      }else{
        const verified=inspectionSchema.parse(response);
        if(verified.accountId!==accountId||verified.mode!==mode||(mode==='test'?!['DEVELOPER_TEST','SANDBOX'].includes(verified.accountType):verified.accountType!=='STANDARD')||entityNames.some(entity=>new Set(verified.fields[entity].map(field=>field.key)).size!==verified.fields[entity].length))throw Error('La respuesta no corresponde al portal, modo o esquema revisado. Comprueba de nuevo la conexión.');
        setInspection({data:verified,version:context});setSelected({});
      }
    }catch(f){if(current())setError(f instanceof z.ZodError?'El servidor devolvió una comprobación incompleta o incompatible. No se habilita el guardado.':f instanceof Error?f.message:'No se pudo completar la comprobación.');}
    finally{if(current()){flight.current=false;setBusy(false);}}
  };
  const verified=inspection?.version===version.current?inspection.data:null;
  return <Modal title="Conectar HubSpot" close={cancel}>{saved?<section className="connection-dialog"><h2>Conexión guardada</h2><p>La credencial se retiró del formulario. El guardado no acredita una captura conciliada.</p>{error?<p role="alert" className="error-box">{error}</p>:null}<button type="button" className="button primary" disabled={busy} onClick={()=>void refreshSaved()}>{busy?<Spinner/>:'Reintentar actualización'}</button></section>:<form className="settings-form connection-dialog" onSubmit={e=>{e.preventDefault();void run();}}>
    <fieldset className="connection-dialog-fields" disabled={busy} aria-busy={busy}>
    {!verified?<>
      <p className="muted">Una instalación por portal. La clave se cifra para tu usuario de Windows y no se incluye en los paquetes.</p>
      <label className="field"><span>Modo de conexión</span><select value={mode} disabled={busy} onChange={e=>edit(()=>{setMode(e.target.value as ConnectionMode);setConfirmed(false);})}><option value="test">Ensayo con datos ficticios</option><option value="production_readonly">Cliente real · solo lectura</option></select></label>
      <label className="field"><span>ID de cuenta</span><input required pattern="[0-9]+" maxLength={100} value={accountId} disabled={busy} onChange={e=>edit(()=>setAccountId(e.target.value))}/></label>
      <label className="field"><span>Service Key o token de lectura</span><input required type="password" minLength={10} maxLength={4096} autoComplete="new-password" value={token} disabled={busy} onChange={e=>edit(()=>setToken(e.target.value))}/></label>
      <p className="helper">Lectura de contactos, empresas y oportunidades, y de sus esquemas. La conexión comprueba tareas, pipelines y asociaciones al capturar. Crea la credencial desde Desarrollo → Claves → Claves de servicio de HubSpot; no añadas permisos de escritura.</p>
      <label className="checkbox-label"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e=>edit(()=>setConfirmed(e.target.checked))}/>{mode==='test'?'Confirmo que la cuenta es de ensayo y contiene datos ficticios.':'Tengo autorización del cliente para conservar esta copia en su ordenador; he acordado su alcance y custodia.'}</label>
    </>:<>
      <p className="success-label">Portal {verified.accountId} · {verified.accountType} · {verified.mode==='test'?'Ensayo':'Producción en lectura'}</p>
      <h3>Revisa los campos que conservarás</h3><p>Clientes, empresas, oportunidades y tareas, con sus campos básicos y relaciones. Máximo 10.000 registros totales.</p>
      {entityNames.map((entity,i)=>{const chosen=selected[entity]??[];return <fieldset key={entity}><legend>{['Clientes','Empresas','Oportunidades','Tareas'][i]} · campos personalizados</legend><p className="helper">{chosen.length} de 60 seleccionados · {verified.fields[entity].length} disponibles</p>{verified.fields[entity].length?verified.fields[entity].map(field=><label className="checkbox-label" key={field.key}><input type="checkbox" checked={chosen.includes(field.key)} disabled={busy||chosen.length>=60&&!chosen.includes(field.key)} onChange={e=>{if(flight.current||inspection?.version!==version.current)return;const checked=e.target.checked;setSelected(s=>{const previous=s[entity]??[];return {...s,[entity]:checked?previous.includes(field.key)||previous.length>=60?previous:[...previous,field.key]:previous.filter(key=>key!==field.key)};});}}/>{field.label}</label>):<p className="helper">Sin campos personalizados disponibles.</p>}</fieldset>;})}
      <p className="info-box">No se conservan adjuntos, campañas, correos ni cuerpo, tipo o recordatorios de tareas. La IA y las escrituras a portales reales están desactivadas. La captura se comprueba en el siguiente paso.</p>
      <button type="button" className="text-button" disabled={busy} onClick={()=>edit(()=>{})}>Revisar conexión</button>
    </>}
    </fieldset>
    {error?<p role="alert" className="error-box">{error}</p>:null}
    <button className="button primary" disabled={busy||!confirmed}>{busy?<Spinner/>:verified?'Guardar conexión':'Comprobar cuenta y permisos'}</button>
  </form>}</Modal>;
}
