export interface QueueItem { id:string; label:string }
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-ES').replace(/\s+/gu,' ').trim();

/** Local presentation only: preserve business ordering, match every term across public label/ID, never mutate inputs. */
export function queueWindow<T extends QueueItem>(items:readonly T[], options:{query?:string;page?:number;size?:number}={}) {
  const query=options.query??'',requested=options.page??0,size=options.size??20;
  if(query.length>160||!Number.isSafeInteger(requested)||requested<0||!Number.isSafeInteger(size)||size<1||size>50)throw new RangeError('Lista fuera de límites.');
  const terms=[...new Set(normalize(query).split(' ').filter(Boolean))];
  const matches=terms.length?items.filter(item=>{const text=normalize(item.label+' '+item.id);return terms.every(term=>text.includes(term));}):items;
  const pages=Math.max(1,Math.ceil(matches.length/size)),page=Math.min(requested,pages-1),start=page*size;
  return {items:matches.slice(start,start+size),total:matches.length,page,pages,start:matches.length?start+1:0,end:Math.min(start+size,matches.length),hasMore:page+1<pages};
}
