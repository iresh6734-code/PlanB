import { useEffect, useRef, useState } from 'react';
import { RecordSchema, type AppSpec, type CrmRecord, type EntityName } from '../shared/model.js';
import { api } from './api.js';
import { recordName } from './components.js';
import './reference-select.css';

type Lookup={key:string;record:CrmRecord|null;error:string};
type Results={key:string;records:CrmRecord[];total:number|null;error:string};
export function ReferenceSelect({id,value,entity,spec,disabled,onChange,label}:{id:string;value:string;entity:EntityName;spec:AppSpec;disabled:boolean;onChange:(id:string|null)=>void;label?:string}) {
  const [query,setQuery]=useState(''),[lookup,setLookup]=useState<Lookup|null>(null),[results,setResults]=useState<Results|null>(null);
  const [lookupRetry,setLookupRetry]=useState(0),[listRetry,setListRetry]=useState(0);
  const lookupKey=JSON.stringify([id,entity,value,lookupRetry]),listKey=JSON.stringify([id,entity,query,listRetry,disabled]);
  const latest=useRef({lookupKey,listKey,disabled,onChange});latest.current={lookupKey,listKey,disabled,onChange};
  useEffect(()=>{
    if(!value)return;
    const controller=new AbortController();let active=true;
    const current=()=>active&&!controller.signal.aborted&&latest.current.lookupKey===lookupKey;
    void api<{record:CrmRecord}>('/v2/records/'+entity+'/'+encodeURIComponent(value),{signal:controller.signal}).then(response=>{
      if(!current())return;const record=RecordSchema.parse(response.record);
      if(record.entity!==entity||record.id!==value)throw Error('Identity mismatch');
      setLookup({key:lookupKey,record,error:''});
    }).catch(()=>{if(current())setLookup({key:lookupKey,record:null,error:'No se pudo verificar la relación elegida. Se conserva su ID; no se ha sustituido por otro registro.'});});
    return()=>{active=false;controller.abort();};
  },[lookupKey]);
  useEffect(()=>{
    if(disabled)return;
    const controller=new AbortController();let active=true;
    const current=()=>active&&!controller.signal.aborted&&latest.current.listKey===listKey&&!latest.current.disabled;
    const timer=setTimeout(()=>void api<{records:CrmRecord[];total?:number}>('/v2/records/'+entity+'?limit=50&q='+encodeURIComponent(query),{signal:controller.signal}).then(response=>{
      if(!current())return;if(!Array.isArray(response.records)||response.records.length>50)throw Error('Invalid search response');
      const records=response.records.map(raw=>RecordSchema.parse(raw));
      if(records.some(record=>record.entity!==entity)||new Set(records.map(record=>record.id)).size!==records.length)throw Error('Identity mismatch');
      const claimedTotal=response.total;
      const total=typeof claimedTotal==='number'&&Number.isSafeInteger(claimedTotal)&&claimedTotal>=records.length&&claimedTotal<=10000?claimedTotal:null;
      if(total!==null&&records.length!==Math.min(50,total))throw Error('Incomplete search response');
      setResults({key:listKey,records,total,error:''});
    }).catch(()=>{if(current())setResults({key:listKey,records:[],total:null,error:'No se pudieron buscar registros. La relación elegida se conserva.'});}),180);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[listKey]);
  const chosen=value&&lookup?.key===lookupKey?lookup:null,found=results?.key===listKey?results:null;
  const selected=chosen?.record??null,options=found?.records??[];
  const pinned=!!selected&&!options.some(record=>record.id===selected.id),choices=selected&&pinned?[selected,...options]:options;
  const selectedError=chosen?.error??'',listError=found?.error??'',unresolved=!!value&&!choices.some(record=>record.id===value);
  const lookupStatus=id+'-reference-lookup',listStatus=id+'-reference-list',lookupErrorId=id+'-reference-lookup-error',listErrorId=id+'-reference-list-error';
  return <span className="reference-picker">
    <input type="search" maxLength={200} className="reference-search" aria-label={'Buscar relación '+spec.entities.find(e=>e.id===entity)!.singular} aria-describedby={listError?listErrorId:listStatus} aria-invalid={!!listError} placeholder="Buscar por nombre…" value={query} onChange={event=>{if(!latest.current.disabled&&latest.current.listKey===listKey)setQuery(event.target.value);}} disabled={disabled}/>
    <select className="reference-select" id={id} aria-label={label} value={value} disabled={disabled} aria-busy={!!value&&!chosen} aria-invalid={!!selectedError} aria-describedby={selectedError?lookupErrorId:lookupStatus} onChange={event=>{
      if(latest.current.disabled||latest.current.lookupKey!==lookupKey||latest.current.listKey!==listKey)return;
      const next=event.target.value;if(next&&!choices.some(record=>record.id===next))return;
      latest.current.onChange(next||null);
    }}><option value="">Seleccionar…</option>{unresolved?<option value={value} disabled>{selectedError?'Relación sin verificar':'Cargando relación'} · ID {value}</option>:null}{choices.map(record=>{const name=recordName(record,spec);/* El ID solo distingue homónimos: si el nombre es único, no se enseña el identificador interno. */const twin=choices.some(other=>other.id!==record.id&&recordName(other,spec)===name);return <option key={record.id} value={record.id}>{twin?name+' · ID '+record.id:name}</option>;})}</select>
    <small id={lookupStatus} className="reference-picker-status" aria-live="polite">{value&&!chosen?'Comprobando la relación elegida · ID '+value:selected&&pinned&&found&&!listError?'La relación elegida se conserva aparte de estos resultados.':''}</small>
    <small id={listStatus} className="reference-picker-status" aria-live="polite">{disabled?'':!found?'Buscando registros…':listError?'':!options.length?'No hay coincidencias en esta búsqueda.':`${options.length===1?'Se muestra':'Se muestran'} ${options.length}${found.total!==null?' de '+found.total:''} ${options.length===1&&(found.total===null||found.total===1)?'resultado':'resultados'}.${found.total===null||found.total>options.length?' Escribe para afinar la búsqueda.':''}`}</small>
    {selectedError?<small id={lookupErrorId} className="reference-picker-error" role="alert">{selectedError}<button type="button" className="text-button" disabled={disabled} onClick={()=>{if(!latest.current.disabled)setLookupRetry(value=>value+1);}}>Reintentar relación</button></small>:null}
    {listError?<small id={listErrorId} className="reference-picker-error" role="alert">{listError}<button type="button" className="text-button" disabled={disabled} onClick={()=>{if(!latest.current.disabled)setListRetry(value=>value+1);}}>Reintentar búsqueda</button></small>:null}
  </span>;
}
