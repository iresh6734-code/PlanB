import { useState } from 'react';
import type { Change, EntityName } from '../shared/model.js';
import { post } from './api.js';

export function ManualRecovery({changes,revision,pending,refresh}:{changes:Change[];revision:string;pending:number;refresh:()=>Promise<void>}){
  const [mapping,setMapping]=useState<Record<string,string>>({}),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [checks,setChecks]=useState<{localId:string;passed:boolean;reason:string}[]>([]);
  const created=[...new Map(changes.filter(c=>c.operation==='create').map(c=>[c.entity+':'+c.recordId,c])).values()];
  const verify=async()=>{setBusy(true);setError('');try{
    const result=await post<{passed:boolean;checks:typeof checks}>('/v3/manual-recovery/verify',{revision,reviewed:true,mapping:created.filter(c=>mapping[c.entity+':'+c.recordId]).map(c=>({entity:c.entity as EntityName,localId:c.recordId,remoteId:mapping[c.entity+':'+c.recordId]}))});
    setChecks(result.checks);await refresh();
  }catch(f){setError((f as Error).message);}finally{setBusy(false);}};
  return <section className="return-section"><h2>Recuperación manual verificada</h2>
    <p>Este portal real está conectado solo en lectura. Exporta los cambios, revísalos con la agencia y aplícalos manualmente en HubSpot. Plan B comprobará después los valores y relaciones.</p>
    <p className="helper">Exportar no marca cambios como devueltos. Los cambios intermedios están en el historial; aplica el estado final. Si hay diferencias, la sesión permanece abierta.</p>
    {created.map(change=><label className="field" key={change.entity+':'+change.recordId}><span>ID remoto para el alta {change.entity} · {change.recordId}</span><input inputMode="numeric" pattern="[0-9]+" value={mapping[change.entity+':'+change.recordId]??''} onChange={e=>setMapping(m=>({...m,[change.entity+':'+change.recordId]:e.target.value}))}/></label>)}
    <label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>He revisado y aplicado manualmente los cambios en el portal correcto. Coordinaré la comprobación sin ediciones simultáneas.</label>
    <button className="button primary" disabled={!reviewed||busy||!pending} onClick={()=>void verify()}>{busy?'Comprobando por lectura…':'Comprobar resultado en HubSpot'}</button>
    {error?<p className="error-box" role="alert">{error}</p>:null}
    {checks.length?<ul role="status">{checks.map(c=><li key={c.localId}>{c.passed?'✓':'·'} {c.reason}</li>)}</ul>:null}
    {!pending?<p className="success-label">Sin cambios pendientes. Puedes cerrar la sesión de continuidad.</p>:null}
  </section>;
}
