import { useState } from 'react';
import { entityNames, type ConnectionMode, type EntityName } from '../shared/model.js';
import { post } from './api.js';
import { Modal, Spinner } from './components.js';

type Inspection={accountId:string;accountType:string;mode:ConnectionMode;fields:Record<string,{key:string;label:string}[]>};
export function ConnectionDialog({close,done}:{close:()=>void;done:()=>Promise<void>}){
  const [mode,setMode]=useState<ConnectionMode>('test'),[accountId,setAccountId]=useState(''),[token,setToken]=useState('');
  const [confirmed,setConfirmed]=useState(false),[inspection,setInspection]=useState<Inspection|null>(null),[selected,setSelected]=useState<Partial<Record<EntityName,string[]>>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const body=()=>({accountId,token,mode,confirmedTestAccount:mode==='test'&&confirmed,confirmedProduction:mode==='production_readonly'&&confirmed,selectedFields:selected});
  const run=async(save:boolean)=>{setBusy(true);setError('');try{
    if(save){await post('/v2/connection',body());setToken('');await done();}
    else setInspection(await post<Inspection>('/v2/connection/inspect',body()));
  }catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  return <Modal title="Conectar HubSpot" close={close}><form className="settings-form" onSubmit={e=>{e.preventDefault();void run(!!inspection);}}>
    {!inspection?<>
      <p className="muted">Una instalación por portal. La clave se cifra para tu usuario de Windows y no se incluye en los paquetes.</p>
      <label className="field"><span>Modo de conexión</span><select value={mode} onChange={e=>{setMode(e.target.value as ConnectionMode);setConfirmed(false);setSelected({});}}><option value="test">Ensayo con datos ficticios</option><option value="production_readonly">Cliente real · solo lectura</option></select></label>
      <label className="field"><span>ID de cuenta</span><input required pattern="[0-9]+" value={accountId} onChange={e=>setAccountId(e.target.value)}/></label>
      <label className="field"><span>Service Key o token de lectura</span><input required type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)}/></label>
      <p className="helper">Lectura de contactos, empresas y oportunidades, y de sus esquemas. La conexión comprueba tareas, pipelines y asociaciones al capturar. Crea la credencial desde Desarrollo → Claves → Claves de servicio de HubSpot; no añadas permisos de escritura.</p>
      <label className="checkbox-label"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{mode==='test'?'Confirmo que la cuenta es de ensayo y contiene datos ficticios.':'Tengo autorización del cliente para conservar esta copia en su ordenador; he acordado su alcance y custodia.'}</label>
    </>:<>
      <p className="success-label">Portal {inspection.accountId} · {inspection.accountType} · {inspection.mode==='test'?'Ensayo':'Producción en lectura'}</p>
      <h3>Revisa los campos que conservarás</h3><p>Clientes, empresas, oportunidades y tareas, con sus campos básicos y relaciones. Máximo 10.000 registros totales.</p>
      {entityNames.map((entity,i)=><fieldset key={entity}><legend>{['Clientes','Empresas','Oportunidades','Tareas'][i]} · campos personalizados</legend>{inspection.fields[entity]?.length?inspection.fields[entity].map(field=><label className="checkbox-label" key={field.key}><input type="checkbox" checked={selected[entity]?.includes(field.key)??false} onChange={e=>setSelected(s=>({...s,[entity]:e.target.checked?[...(s[entity]??[]),field.key]:(s[entity]??[]).filter(key=>key!==field.key)}))}/>{field.label}</label>):<p className="helper">Sin campos personalizados disponibles.</p>}</fieldset>)}
      <p className="info-box">No se conservan adjuntos, campañas, correos ni cuerpo, tipo o recordatorios de tareas. La IA y las escrituras a portales reales están desactivadas. La captura se comprueba en el siguiente paso.</p>
      <button type="button" className="text-button" onClick={()=>setInspection(null)}>Revisar conexión</button>
    </>}
    {error?<p role="alert" className="error-box">{error}</p>:null}
    <button className="button primary" disabled={busy||!confirmed}>{busy?<Spinner/>:inspection?'Guardar conexión':'Comprobar cuenta y permisos'}</button>
  </form></Modal>;
}
