import { entityNames, type Change, type EntityName, type FieldValue } from './model.js';

export type HistoryScope='all'|'pending'|'marked';
export type HistoryValue={present:false}|{present:true;value:FieldValue};
export interface HistoryField { key:string;before:HistoryValue;after:HistoryValue }
export function changedFields(change:Change):HistoryField[] {
  const before=change.before?.values??{},after=change.after.values;
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>{
    const a:HistoryValue=Object.hasOwn(before,key)?{present:true,value:before[key]}:{present:false};
    const b:HistoryValue=Object.hasOwn(after,key)?{present:true,value:after[key]}:{present:false};
    return a.present===b.present&&(!a.present||b.present&&a.value===b.value)?[]:[{key,before:a,after:b}];
  });
}
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-ES').replace(/\s+/gu,' ').trim();
const valueText=(value:FieldValue)=>value===null?'null':String(value);
/** Read-only view of the supplied local history. Watermark is reported as a marker, never proof of remote availability. */
export function historyPage(changes:readonly Change[],options:{query?:string;entity?:EntityName|'all';operation?:'create'|'update'|'all';scope?:HistoryScope;watermark?:number;page?:number;size?:number}={}) {
  const {query='',entity='all',operation='all',scope='all',watermark=0,page:requested=0,size=20}=options;
  if(query.length>200||!Number.isSafeInteger(requested)||requested<0||!Number.isSafeInteger(size)||size<1||size>50||!Number.isSafeInteger(watermark)||watermark<0)throw new RangeError('Historial fuera de límites.');
  if(entity!=='all'&&!entityNames.includes(entity)||!['all','create','update'].includes(operation)||!['all','pending','marked'].includes(scope))throw new TypeError('Filtro de historial inválido.');
  const counts={all:changes.length,pending:0,marked:0,create:0,update:0},terms=[...new Set(normalize(query).split(' ').filter(Boolean))];
  const filtered=changes.filter(change=>{
    counts[change.id>watermark?'pending':'marked']++;counts[change.operation]++;
    if(entity!=='all'&&change.entity!==entity||operation!=='all'&&change.operation!==operation||scope==='pending'&&change.id<=watermark||scope==='marked'&&change.id>watermark)return false;
    if(!terms.length)return true;
    const searchable=normalize([String(change.id),change.entity,change.recordId,change.operation,...Object.entries(change.before?.values??{}).flatMap(([key,value])=>[key,valueText(value)]),...Object.entries(change.after.values).flatMap(([key,value])=>[key,valueText(value)])].join(' '));
    return terms.every(term=>searchable.includes(term));
  }).map((change,index)=>({change,index})).sort((a,b)=>b.change.id-a.change.id||a.index-b.index).map(item=>item.change);
  const pages=Math.max(1,Math.ceil(filtered.length/size)),page=Math.min(requested,pages-1),start=page*size;
  return {items:filtered.slice(start,start+size),total:filtered.length,counts,page,pages,start:filtered.length?start+1:0,end:Math.min(start+size,filtered.length),hasMore:page+1<pages};
}
