import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../store.js';
import type { CrmSnapshot } from '../../shared/model.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { TeamRepository } from './repository.js';
import type { TeamOAuth } from './oauth.js';
import { salesSource } from './sales-source.js';
export function registerHubspotContext(app:FastifyInstance,repo:TeamRepository,oauth:TeamOAuth,principal:(r:FastifyRequest)=>Promise<TeamPrincipal>,demo=false){
  const params=(r:FastifyRequest)=>z.object({tenant:z.string().uuid(),contact:z.string().min(1).max(100).optional()}).parse(r.params);
  app.get('/api/team/spaces/:tenant/v6/hubspot/:contact',async request=>{
    const user=await principal(request),{tenant,contact}=params(request);
    const currentSource=()=>repo.scoped(tenant,user,'read',async sql=>{
      const source=await salesSource(sql,tenant);
      if(demo){const local=(await sql.query("SELECT id FROM team_records WHERE tenant_id=$1 AND entity='contacts' AND id=$2",[tenant,contact])).rows.length;if(!local&&!source?.records.some(r=>r.entity==='contacts'&&r.id===contact))throw new AppError(404,'Cliente fuera de esta empresa.');return null;}
      if(source?.origin!=='hubspot'||source.snapshot.source.kind!=='hubspot'||!source.records.some(r=>r.entity==='contacts'&&r.id===contact))throw new AppError(404,'Esta ficha no pertenece a la captura de HubSpot conectada.');
      const {accountId,isTestData,environment,accountType}=source.snapshot.source;
      if(!isTestData&&(environment!=='production'||accountType!=='STANDARD'))throw new AppError(409,'La captura no identifica un portal de producción verificado.');
      return {accountId,mode:isTestData?'test' as const:'production_readonly' as const};
    });
    const source=await currentSource();
    if(demo)return {contactId:contact,owner:{id:'demo-owner',name:'Responsable de ensayo'},ownerPermission:true,partial:true,description:'Actividad ficticia para revisar la ficha comercial.',timeline:[{kind:'notes',id:'demo-note',at:'2026-10-26T10:00:00Z',title:'Revisar propuesta',body:'El cliente ficticio solicita aclarar el alcance y preparar una reunión.'},{kind:'tasks',id:'demo-task',at:'2026-10-27T10:00:00Z',title:'Preparar seguimiento',body:'Comprobar los próximos pasos antes de compartir la propuesta.'}]};
    const result=await oauth.context(tenant,contact!,source!);
    const current=await currentSource();
    if(current?.accountId!==source?.accountId||current?.mode!==source?.mode)throw new AppError(409,'La fuente cambió mientras se leía la ficha. Vuelve a abrirla.');
    return result;
  });
  app.get('/api/team/spaces/:tenant/v6/capture-diff',async request=>repo.scoped(params(request).tenant,await principal(request),'read',async sql=>{
    const snapshots=(await sql.query<{id:string;snapshot:CrmSnapshot}>('SELECT id,snapshot FROM team_captures WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 2',[params(request).tenant])).rows;
    if(snapshots.length<2)return {available:false,reason:'Se necesitan dos capturas guardadas para comparar.'};
    const [latest,prior]=snapshots,old=new Map(prior.snapshot.records.map(r=>[r.entity+':'+r.id,r])),current=new Map(latest.snapshot.records.map(r=>[r.entity+':'+r.id,r]));
    const added=[...current.keys()].filter(k=>!old.has(k)),removed=[...old.keys()].filter(k=>!current.has(k)),changed=[...current].filter(([key,r])=>old.has(key)&&JSON.stringify(r.values)!==JSON.stringify(old.get(key)!.values)).map(([key])=>key);
    const link=(l:CrmSnapshot['links'][number])=>JSON.stringify(l),oldLinks=new Set(prior.snapshot.links.map(link)),newLinks=new Set(latest.snapshot.links.map(link));
    return {available:true,from:prior.id,to:latest.id,counts:{added:added.length,removed:removed.length,changed:changed.length,linksAdded:[...newLinks].filter(l=>!oldLinks.has(l)).length,linksRemoved:[...oldLinks].filter(l=>!newLinks.has(l)).length},examples:{added:added.slice(0,30),removed:removed.slice(0,30),changed:changed.slice(0,30)}};
  }));
}
