import { z } from 'zod';
import { RecordSchema } from './model.js';
import type { TeamRecord } from './team.js';

const origin = z.string().url().refine(raw=>{const u=new URL(raw);return !u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname));},'Origen de equipo inválido.');
const row = z.object({entity:z.string(),id:z.string().min(1).max(100),version:z.number().int().positive(),value:RecordSchema}).refine(r=>r.entity===r.value.entity&&r.id===r.value.id,'Identidad de ficha discordante.');
export const TeamReplicaViewSchema=z.object({
  linked:z.boolean(),configured:z.boolean(),origin:origin.nullish(),url:origin.optional(),tenantId:z.string().uuid().optional(),
  records:z.array(row).max(10000),pending:z.number().int().min(0).max(100),
  conflicts:z.array(z.object({recordId:z.string(),conflictId:z.string().uuid().optional()})).max(10000),lastSync:z.string().nullable(),error:z.string().nullable(),
  revision:z.string().regex(/^[a-f0-9]{64}$/).optional(),totalRecords:z.number().int().min(0).max(10000).optional(),recordsComplete:z.boolean().optional()
}).superRefine((state,ctx)=>{
  const seen=new Set<string>();for(const r of state.records){const key=JSON.stringify([r.entity,r.id]);if(seen.has(key))ctx.addIssue({code:'custom',message:'Ficha duplicada.'});seen.add(key);}
  if(state.linked&&(!state.tenantId||!state.url))ctx.addIssue({code:'custom',message:'Falta la identidad de la réplica.'});
});
export type TeamReplicaView=z.infer<typeof TeamReplicaViewSchema>;
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
export function replicaContacts(records:readonly TeamRecord[],query:string,page:number,size=20){
  const terms=normalize(query).split(' ').filter(Boolean);
  const contacts=records.filter(r=>r.entity==='contacts');
  const matches=contacts.filter(r=>{const text=normalize([r.id,r.value.values.firstname??'',r.value.values.lastname??'',r.value.values.phone??''].join(' '));return terms.every(t=>text.includes(t));});
  const pages=Math.ceil(matches.length/size),current=Math.max(0,Math.min(Number.isSafeInteger(page)?page:0,Math.max(0,pages-1))),offset=current*size;
  return {items:matches.slice(offset,offset+size),total:matches.length,contacts:contacts.length,pages,page:current,start:matches.length?offset+1:0,end:Math.min(offset+size,matches.length),hasMore:offset+size<matches.length};
}
export function completeReplica(state:TeamReplicaView){return state.recordsComplete===true&&state.totalRecords===state.records.length;}
