import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { queueWindow, type QueueItem } from '../shared/work-queue.js';
import './work-queue.css';

export function WorkQueue<T extends QueueItem>({items,total,noun,label,listClass,rowClass,renderRow}:{
  items:readonly T[];total:number|undefined;noun:'prioridades'|'tareas';label:string;listClass:string;rowClass?:string;renderRow:(item:T)=>ReactNode;
}) {
  const [expanded,setExpanded]=useState(false),[query,setQuery]=useState(''),[page,setPage]=useState(0),id=useId();
  const input=useRef<HTMLInputElement>(null);
  const window=useMemo(()=>queueWindow(items,{query:expanded?query:'',page:expanded?page:0,size:expanded?20:5}),[items,query,page,expanded]);
  const complete=Number.isSafeInteger(total)&&total===items.length;
  return <section className="work-queue" aria-label={label}>
    {!complete?<p className="work-queue-coverage">No se ha podido comprobar que estén todas las {noun}. Se muestran {items.length} recibidas{typeof total==='number'&&total>items.length?' de '+total+' indicadas':''}. Actualiza Plan B antes de dar la lista por completa.</p>:null}
    {expanded?<div className="work-queue-tools"><label htmlFor={id}>Buscar {noun}<input ref={input} id={id} type="search" maxLength={160} value={query} placeholder="Nombre o ID…" onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>{query?<button type="button" className="text-button" onClick={()=>{setQuery('');setPage(0);input.current?.focus();}}>Limpiar búsqueda</button>:null}</div>:null}
    <p className="work-queue-count" aria-live="polite" aria-atomic="true">{window.total?`${window.start}–${window.end} de ${window.total} ${noun}`:`No hay ${noun} que coincidan.`}{query&&expanded?` · ${items.length} recibidas en total`:''}</p>
    <div className={listClass} role="list" aria-label={label}>{window.items.map(item=><div role="listitem" className={rowClass} key={item.id}>{renderRow(item)}</div>)}</div>
    {expanded&&window.pages>1?<nav className="work-queue-pages" aria-label={'Páginas de '+noun}><button type="button" className="button secondary" disabled={!window.page} onClick={()=>setPage(window.page-1)}>Anterior</button><span>Página {window.page+1} de {window.pages}</span><button type="button" className="button secondary" disabled={!window.hasMore} onClick={()=>setPage(window.page+1)}>Siguiente</button></nav>:null}
    {items.length>5?<button type="button" className="text-button list-more" aria-expanded={expanded} onClick={()=>{setExpanded(!expanded);setPage(0);setQuery('');}}>{expanded?'Mostrar menos':'Ver las '+items.length+' '+noun}</button>:null}
  </section>;
}
