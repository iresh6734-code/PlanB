import { useId, useMemo, useRef, useState } from 'react';
import { changedFields, historyPage, type HistoryScope, type HistoryValue } from '../shared/change-history.js';
import { entityNames, type Change, type EntityName } from '../shared/model.js';
import './change-history.css';

const names:Record<EntityName,string>={contacts:'Clientes',companies:'Empresas',deals:'Oportunidades',tasks:'Tareas'};
function Value({data}:{data:HistoryValue}) {
  if(!data.present)return <span className="change-history-value-note">Campo ausente</span>;
  if(data.value===null)return <span className="change-history-value-note">Sin valor · null</span>;
  return <><small>{typeof data.value==='string'?'Texto':typeof data.value==='number'?'Número':'Booleano'}</small><code>{JSON.stringify(data.value)}</code></>;
}
// Resumen de una operación para leerla sin desplegarla: hasta dos campos con su valor anterior y actual.
const show=(data:HistoryValue)=>!data.present?'—':data.value===null?'vacío':String(data.value).length>28?String(data.value).slice(0,27)+'…':String(data.value);
const brief=(change:Change)=>{const fields=changedFields(change);if(!fields.length)return 'Sin diferencias';if(change.operation==='create')return fields.length+(fields.length===1?' campo':' campos');return fields.slice(0,2).map(field=>field.key+': '+show(field.before)+' → '+show(field.after)).join(' · ')+(fields.length>2?' · +'+(fields.length-2):'');};
export function ChangeHistory({changes,watermark}:{changes:readonly Change[];watermark:number}) {
  const id=useId(),[query,setQuery]=useState(''),[entity,setEntity]=useState<EntityName|'all'>('all'),[operation,setOperation]=useState<'create'|'update'|'all'>('all'),[scope,setScope]=useState<HistoryScope>('all'),[page,setPage]=useState(0),input=useRef<HTMLInputElement>(null);
  const result=useMemo(()=>historyPage(changes,{query,entity,operation,scope,watermark,page}),[changes,query,entity,operation,scope,watermark,page]);
  const filtered=!!query||entity!=='all'||operation!=='all'||scope!=='all';
  return <section className="history-section change-history" aria-labelledby={id+'-title'}>
    <h2 id={id+'-title'}>Historial de operaciones</h2>
    <p className="helper">{result.counts.all} operaciones locales · {result.counts.pending} posteriores a la marca de devolución HubSpot. La marca registra lo ya incluido en una devolución o comprobación; no verifica que esos valores sigan disponibles en el destino. Las simulaciones no la avanzan.</p>
    {changes.length?<>
      <div className="change-history-filters">
        <label htmlFor={id+'-query'}>Buscar en el historial<input ref={input} id={id+'-query'} type="search" maxLength={200} placeholder="ID, campo o valor anterior/actual…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
        <label htmlFor={id+'-entity'}>Tipo de registro<select id={id+'-entity'} value={entity} onChange={e=>{setEntity(e.target.value as typeof entity);setPage(0);}}><option value="all">Todos</option>{entityNames.map(name=><option key={name} value={name}>{names[name]}</option>)}</select></label>
        <label htmlFor={id+'-operation'}>Operación<select id={id+'-operation'} value={operation} onChange={e=>{setOperation(e.target.value as typeof operation);setPage(0);}}><option value="all">Todas</option><option value="create">Altas</option><option value="update">Ediciones</option></select></label>
        <label htmlFor={id+'-scope'}>Marca de devolución<select id={id+'-scope'} value={scope} onChange={e=>{setScope(e.target.value as HistoryScope);setPage(0);}}><option value="all">Todo el historial</option><option value="pending">Posteriores a la marca</option><option value="marked">Incluidas en la marca</option></select></label>
      </div>
      <div className="change-history-status"><p aria-live="polite" aria-atomic="true">{result.total?`${result.start}–${result.end} de ${result.total} operaciones`:'No hay operaciones que coincidan con estos filtros.'}</p>{filtered?<button type="button" className="text-button" onClick={()=>{setQuery('');setEntity('all');setOperation('all');setScope('all');setPage(0);input.current?.focus();}}>Limpiar filtros</button>:null}</div>
      <div className="change-history-list">{result.items.map(change=><details key={change.id} data-change-id={change.id}><summary><span><strong>{names[change.entity]} · ID {change.recordId}</strong><small>Operación #{change.id} · {change.operation==='create'?'Alta local':'Edición local'} · {Number.isNaN(Date.parse(change.at))?'Fecha no disponible':new Date(change.at).toLocaleString('es-ES')}</small><em className="change-history-brief">{brief(change)}</em></span><span className="change-history-mark">{change.id>watermark?'Posterior a la marca':'Incluida en la marca'}</span></summary><div className="change-history-diff"><p className="helper">Diferencia de esta operación local. «Campo ausente» describe su presencia en esta versión; no indica un borrado en HubSpot.</p>{changedFields(change).length?<dl>{changedFields(change).map(field=><div key={field.key}><dt>{field.key}</dt><dd><span>Antes</span><Value data={field.before}/></dd><dd><span>Después</span><Value data={field.after}/></dd></div>)}</dl>:<p className="muted">No hay diferencias de valores entre el antes y el después registrados.</p>}</div></details>)}</div>
      {result.pages>1?<nav className="change-history-pages" aria-label="Páginas del historial"><button type="button" className="button secondary" disabled={!result.page} onClick={()=>setPage(result.page-1)}>Anterior</button><span>Página {result.page+1} de {result.pages}</span><button type="button" className="button secondary" disabled={!result.hasMore} onClick={()=>setPage(result.page+1)}>Siguiente</button></nav>:null}
    </>:<p className="muted">Tus próximas ediciones aparecerán aquí.</p>}
  </section>;
}
