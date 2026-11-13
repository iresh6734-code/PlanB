import { useEffect, useRef, useState } from 'react';
import type { Change, EntityName } from '../shared/model.js';
import { api, ApiError } from './api.js';
import './manual-recovery.css';

type Check = {entity:EntityName;localId:string;passed:boolean;reason:string};
type Result = {passed:boolean;checks:Check[];report:null|{id:string;method:'manual_verified';revision:string;sessionId:string;captureId:string;watermark:number;verifiedAt:string;records:number}};
type Props = {changes:Change[];revision:string;pending:number;refresh:()=>Promise<void>;integrityBlocked?:boolean};
const identity = (entity:string,id:string)=>JSON.stringify([entity,id]);

function validResult(value:unknown,expected:Set<string>,revision:string,end:number):value is Result {
  if(!value||typeof value!=='object')return false;
  const r=value as Result;
  if(typeof r.passed!=='boolean'||!Array.isArray(r.checks)||r.checks.length!==expected.size||!expected.size)return false;
  const seen=new Set<string>();
  for(const c of r.checks){
    if(!c||typeof c.entity!=='string'||typeof c.localId!=='string'||typeof c.passed!=='boolean'||typeof c.reason!=='string')return false;
    const key=identity(c.entity,c.localId);if(!expected.has(key)||seen.has(key))return false;seen.add(key);
  }
  if(r.passed!==r.checks.every(c=>c.passed))return false;
  if(!r.passed)return r.report===null;
  const report=r.report;
  return !!report&&report.method==='manual_verified'&&report.revision===revision&&typeof report.id==='string'&&!!report.id&&typeof report.sessionId==='string'&&!!report.sessionId&&typeof report.captureId==='string'&&!!report.captureId&&report.watermark===end&&report.records===expected.size&&typeof report.verifiedAt==='string'&&Number.isFinite(Date.parse(report.verifiedAt));
}

export function ManualRecovery({changes,revision,pending,refresh,integrityBlocked=false}:Props){
  const [mapping,setMapping]=useState<Record<string,string>>({}),[approved,setApproved]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState<{key:string;text:string}|null>(null);
  const [result,setResult]=useState<{key:string;value:Result}|null>(null),[refreshFailed,setRefreshFailed]=useState<string|null>(null);
  const created=[...new Map(changes.filter(c=>c.operation==='create').map(c=>[identity(c.entity,c.recordId),c])).values()];
  const entries=created.map(c=>({entity:c.entity,localId:c.recordId,remoteId:mapping[identity(c.entity,c.recordId)]??''}));
  // Bind the human approval to exactly these pending operations and mappings.
  const key=JSON.stringify([revision,pending,changes,entries]);
  const latest=useRef(key);latest.current=key;
  const alive=useRef(true),flight=useRef<{key:string;controller:AbortController}|null>(null),acknowledged=useRef(new Set<string>());
  const allowed=useRef(!integrityBlocked);allowed.current=!integrityBlocked;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;flight.current?.controller.abort();flight.current=null;};},[]);
  useEffect(()=>{setApproved(null);setResult(null);setError(null);setRefreshFailed(null);return()=>{if(flight.current?.key===key){flight.current.controller.abort();flight.current=null;}};},[key]);
  useEffect(()=>{if(integrityBlocked)setApproved(null);},[integrityBlocked]);
  const current=()=>alive.current&&latest.current===key;
  const inFlight=busy===key;
  const shown=result?.key===key?result.value:null;
  let validation='';const ids=new Set<string>();
  for(const e of entries){
    if(!/^(?:0|[1-9]\d{0,99})$/.test(e.remoteId)){validation='Indica un ID remoto numérico para cada alta (hasta 100 dígitos, sin ceros iniciales).';break;}
    const id=identity(e.entity,e.remoteId);if(ids.has(id)){validation='Dos altas de la misma entidad no pueden compartir el ID remoto.';break;}ids.add(id);
  }
  const updateLocal=async(isCurrent:()=>boolean)=>{
    try{await refresh();if(isCurrent())setRefreshFailed(null);}
    catch{if(isCurrent())setRefreshFailed(key);}
  };
  const verify=async()=>{
    if(!current()||!allowed.current||flight.current||acknowledged.current.has(key)||approved!==key||validation||!pending||!changes.length)return;
    const request={key,controller:new AbortController()};flight.current=request;
    setApproved(null);setBusy(key);setError(null);setResult(null);setRefreshFailed(null);
    const owns=()=>current()&&flight.current===request;
    try{
      const value=await api<unknown>('/v3/manual-recovery/verify',{method:'POST',signal:request.controller.signal,body:JSON.stringify({revision,reviewed:true,mapping:entries})});
      if(!owns())return;
      if(!validResult(value,new Set(changes.map(c=>identity(c.entity,c.recordId))),revision,Math.max(...changes.map(c=>c.id))))throw Error('La respuesta no identifica todos los registros o no corresponde a esta revisión. Actualiza el estado antes de comprobar de nuevo.');
      if(value.passed)acknowledged.current.add(key);
      setResult({key,value});
      // An acknowledgement is retained even if the subsequent local read fails.
      await updateLocal(owns);
    }catch(f){
      if(!owns())return;
      setError({key,text:f instanceof Error?f.message:'No se pudo comprobar el resultado.'});
      if(f instanceof ApiError&&f.status===409)await updateLocal(owns);
    }finally{if(owns()){flight.current=null;setBusy(null);}}
  };
  const retryLocal=async()=>{
    if(!current()||flight.current)return;
    const request={key,controller:new AbortController()};flight.current=request;setBusy(key);
    try{await updateLocal(()=>current()&&flight.current===request);}finally{if(current()&&flight.current===request){flight.current=null;setBusy(null);}}
  };
  return <section className="return-section manual-recovery" aria-label="Comprobación manual">
    <h2>Recuperación manual verificada</h2>
    <p>Esta copia procede de un portal real. Su conexión solo admite lectura. Exporta los cambios, revísalos con la agencia y aplícalos manualmente en HubSpot. Plan B comprobará después los valores y relaciones.</p>
    <p className="helper">Exportar no marca cambios como devueltos. Aplica el estado final del historial y coordina la comprobación sin ediciones simultáneas.</p>
    <p className="manual-recovery-context">{pending} operaciones pendientes · {new Set(changes.map(c=>identity(c.entity,c.recordId))).size} registros por comprobar</p>
    {integrityBlocked?<p className="helper">El estado guardado necesita revisión antes de otra comprobación. Una confirmación anterior se conserva para su revisión; puedes reintentar solo la lectura local.</p>:null}
    {created.map(c=><label className="field" key={identity(c.entity,c.recordId)}><span>ID remoto para el alta {c.entity} · {c.recordId}</span><input inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" maxLength={100} disabled={integrityBlocked||inFlight||!!shown?.passed} value={mapping[identity(c.entity,c.recordId)]??''} onChange={e=>{if(!current()||!allowed.current||flight.current||acknowledged.current.has(key))return;const value=e.target.value;setApproved(null);setMapping(m=>({...m,[identity(c.entity,c.recordId)]:value}));}}/></label>)}
    {pending>0&&!shown?.passed?<>
      {validation?<p className="helper">{validation}</p>:null}
      <label className="checkbox-label"><input type="checkbox" disabled={integrityBlocked||inFlight||!!validation} checked={approved===key} onChange={e=>{if(current()&&allowed.current&&!flight.current&&!validation)setApproved(e.target.checked?key:null);}}/>He revisado y aplicado manualmente los cambios en el portal correcto. Coordinaré la comprobación sin ediciones simultáneas.</label>
      <button type="button" className="button primary" disabled={integrityBlocked||approved!==key||inFlight||!!validation||!changes.length} onClick={()=>void verify()}>{inFlight?'Comprobando por lectura…':'Comprobar resultado en HubSpot'}</button>
    </>:null}
    {error?.key===key?<p className="error-box" role="alert">{error.text}</p>:null}
    {shown?<div role="status" className="manual-recovery-result"><p>{shown.passed?'El servidor confirmó la comprobación de esta revisión.':'Hay diferencias. Los cambios siguen pendientes; corrige el estado y vuelve a revisarlo.'}</p><ul>{shown.checks.map(c=><li key={identity(c.entity,c.localId)}><strong>{c.entity} · {c.localId}</strong><span>{c.passed?'Confirmado: ':'Por revisar: '}{c.reason}</span></li>)}</ul>{shown.report?<p className="helper">Comprobación por lectura · {shown.report.records} registros · {shown.report.verifiedAt}</p>:null}</div>:null}
    {refreshFailed===key?<div className="error-box" role="alert"><p>{shown?.passed?'La comprobación se confirmó, pero no se pudo actualizar el estado local.':'No se pudo actualizar el estado local.'} Reintenta la actualización; no se repetirá la comprobación remota.</p><button type="button" className="button secondary" disabled={inFlight} onClick={()=>void retryLocal()}>Reintentar actualización local</button></div>:null}
    {!pending&&!integrityBlocked?<p className="success-label">Sin cambios pendientes. Puedes cerrar la sesión de continuidad.</p>:null}
  </section>;
}
