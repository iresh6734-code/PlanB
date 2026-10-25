import { useEffect, useState } from 'react';
import type { AppSpec, CrmRecord, EntityName } from '../shared/model.js';
import { api } from './api.js';
import { recordName } from './components.js';
export function ReferenceSelect({id,value,entity,spec,disabled,onChange}:{id:string;value:string;entity:EntityName;spec:AppSpec;disabled:boolean;onChange:(id:string|null)=>void}) {
  const [query,setQuery]=useState(''),[options,setOptions]=useState<CrmRecord[]>([]),[selected,setSelected]=useState<CrmRecord|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!value){setSelected(null);return;}
    let active=true;void api<{record:CrmRecord}>('/v2/records/'+entity+'/'+encodeURIComponent(value)).then(r=>{if(active)setSelected(r.record);}).catch(()=>{if(active)setError('No se pudo cargar la relación.');});
    return()=>{active=false;};
  },[value,entity]);
  useEffect(()=>{
    const controller=new AbortController(),timer=setTimeout(()=>void api<{records:CrmRecord[]}>('/v2/records/'+entity+'?limit=50&q='+encodeURIComponent(query),{signal:controller.signal}).then(r=>{setOptions(r.records);setError('');}).catch(f=>{if(f.name!=='AbortError')setError('No se pudieron buscar registros.');}),180);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,entity]);
  const choices=selected&&!options.some(r=>r.id===selected.id)?[selected,...options]:options;
  return <><input type="search" className="reference-search" aria-label={'Buscar relación '+spec.entities.find(e=>e.id===entity)!.singular} placeholder="Buscar por nombre…" value={query} onChange={e=>setQuery(e.target.value)} disabled={disabled}/>
    <select id={id} value={value} disabled={disabled} onChange={e=>onChange(e.target.value||null)}><option value="">Seleccionar…</option>{choices.map(r=><option key={r.id} value={r.id}>{recordName(r,spec)}</option>)}</select>{error?<small role="alert">{error}</small>:null}</>;
}
