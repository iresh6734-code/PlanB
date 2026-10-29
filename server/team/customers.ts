import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../store.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { CrmRecord } from '../../shared/model.js';
import { CustomerActionSchema,type CustomerAction,type CustomerActionInput,type CustomerDossier } from '../../shared/customer.js';
import { TeamRepository } from './repository.js';
import { salesSource } from './sales-source.js';
import type { Sql } from './database.js';

export class CustomerService {
  constructor(private repo:TeamRepository){}
  private async source(sql:Sql,tenant:string,contactId:string,local=false){
    const source=await salesSource(sql,tenant,local),contact=source?.records.find(r=>r.entity==='contacts'&&r.id===contactId);
    if(!source||!contact)throw new AppError(404,'El cliente no pertenece a esta fuente de la empresa.');
    return {source,contact};
  }
  async dossier(tenant:string,user:TeamPrincipal,contactId:string,local=false):Promise<CustomerDossier>{return this.repo.scoped(tenant,user,'read',async sql=>{
    const {source,contact}=await this.source(sql,tenant,contactId,local);
    const key=(entity:string,id:string)=>JSON.stringify([entity,id]),graph=new Map<string,Set<string>>();
    const connect=(a:string,b:string)=>{if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a)!.add(b);graph.get(b)!.add(a);};
    for(const link of source.snapshot.links)connect(key(link.fromEntity,link.fromId),key(link.toEntity,link.toId));
    for(const record of source.records)for(const field of source.spec.entities.find(e=>e.id===record.entity)?.fields??[])if(field.referenceEntity&&record.values[field.key])connect(key(record.entity,record.id),key(field.referenceEntity,String(record.values[field.key])));
    const direct=graph.get(key(contact.entity,contact.id))??new Set<string>();
    const opportunities=source.records.filter(r=>r.entity==='deals'&&direct.has(key(r.entity,r.id))),context=new Set(direct);
    for(const deal of opportunities)for(const related of graph.get(key(deal.entity,deal.id))??[])context.add(related);
    const companies=source.records.filter(r=>r.entity==='companies'&&context.has(key(r.entity,r.id)));
    const tasks=source.records.filter(r=>r.entity==='tasks'&&context.has(key(r.entity,r.id)));
    const text=(value:unknown)=>String(value??'').slice(0,300);
    const date=(value:unknown)=>value&&Number.isFinite(Date.parse(String(value)))?new Date(String(value)).toISOString():null;
    const actions=(await sql.query<CustomerAction>('SELECT id,title,due_at,status,version,created_at FROM team_customer_actions WHERE tenant_id=$1 AND source_key=$2 AND contact_id=$3 ORDER BY status DESC,due_at,id LIMIT 100',[tenant,source.key,contactId])).rows;
    const active=await salesSource(sql,tenant);
    return {contact:{id:contactId,name:[text(contact.values.firstname),text(contact.values.lastname)].filter(Boolean).join(' ')||contactId,email:text(contact.values.email),phone:text(contact.values.phone)},source:{key:source.key,origin:source.origin,capturedAt:source.snapshot.capturedAt,isTestData:source.snapshot.source.isTestData,canPrepare:active?.key===source.key},
      companies:companies.map(r=>({id:r.id,name:text(r.values.name)||r.id})),owner:{id:contact.values.hubspot_owner_id?text(contact.values.hubspot_owner_id):null,name:contact.values.owner_name?text(contact.values.owner_name):null},
      opportunities:opportunities.map(r=>({id:r.id,name:text(r.values.dealname)||r.id,stage:source.spec.stages.find(s=>s.id===String(r.values[source.spec.roles?.stage??'dealstage']))?.label??'Sin etapa identificada',amount:r.values.amount!==null&&r.values.amount!==undefined&&r.values.amount!==''&&Number.isFinite(Number(r.values.amount))?Number(r.values.amount):null,ownerId:r.values.hubspot_owner_id?text(r.values.hubspot_owner_id):null})),
      capturedTasks:tasks.map(r=>{const status=text(r.values[source.spec.roles?.taskStatus??'status']??r.values.hs_task_status);return {id:r.id,title:text(r.values.subject??r.values.hs_task_subject)||r.id,dueAt:date(r.values[source.spec.roles?.dueDate??'due_date']??r.values.hs_timestamp),status,completed:/^(completed|done|completad[oa])$/i.test(status)};}).sort((a,b)=>(a.dueAt??'9999').localeCompare(b.dueAt??'9999')).slice(0,100),actions};
  });}
  async createAction(tenant:string,user:TeamPrincipal,contactId:string,raw:CustomerActionInput,local=false){
    const input=CustomerActionSchema.parse(raw);
    return this.repo.scoped(tenant,user,'write',async sql=>{
      const {source}=await this.source(sql,tenant,contactId,local);if(source.key!==input.sourceKey)throw new AppError(409,'La fuente cambió. Abre de nuevo la ficha antes de guardar.');
      const previous=(await sql.query<CustomerAction&{source_key:string;contact_id:string}>('SELECT * FROM team_customer_actions WHERE tenant_id=$1 AND id=$2',[tenant,input.id])).rows[0];
      if(previous){if(previous.source_key!==source.key||previous.contact_id!==contactId||previous.title!==input.title||Date.parse(previous.due_at)!==Date.parse(input.dueAt))throw new AppError(409,'El identificador corresponde a otra acción.');return {id:previous.id};}
      if(Date.parse(input.dueAt)<=this.repo.clock().getTime())throw new AppError(422,'Elige una fecha futura para la próxima acción.');
      const inserted=await sql.query('INSERT INTO team_customer_actions(tenant_id,id,source_key,contact_id,title,due_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,id) DO NOTHING RETURNING id',[tenant,input.id,source.key,contactId,input.title,input.dueAt,this.repo.clock().toISOString()]);
      if(!inserted.rows.length){const concurrent=(await sql.query<CustomerAction&{source_key:string;contact_id:string}>('SELECT * FROM team_customer_actions WHERE tenant_id=$1 AND id=$2',[tenant,input.id])).rows[0];if(!concurrent||concurrent.source_key!==source.key||concurrent.contact_id!==contactId||concurrent.title!==input.title||Date.parse(concurrent.due_at)!==Date.parse(input.dueAt))throw new AppError(409,'El identificador corresponde a otra acción.');return {id:input.id};}
      await this.repo.audit(sql,tenant,user.uid,'customer.action.create',input.id);return {id:input.id};
    });
  }
  async setStatus(tenant:string,user:TeamPrincipal,contactId:string,id:string,input:{sourceKey:string;version:number;status:'open'|'completed'},local=false){return this.repo.scoped(tenant,user,'write',async sql=>{
    const {source}=await this.source(sql,tenant,contactId,local);if(source.key!==input.sourceKey)throw new AppError(409,'La fuente cambió. Abre de nuevo la ficha.');
    const action=(await sql.query<CustomerAction>('SELECT * FROM team_customer_actions WHERE tenant_id=$1 AND source_key=$2 AND contact_id=$3 AND id=$4 FOR UPDATE',[tenant,source.key,contactId,id])).rows[0];
    if(!action)throw new AppError(404,'Acción fuera de esta ficha.');
    if(action.status===input.status)return {updated:true};
    if(action.version!==input.version)throw new AppError(409,'La acción cambió. Actualiza la ficha antes de editar.');
    await sql.query('UPDATE team_customer_actions SET status=$3,version=version+1 WHERE tenant_id=$1 AND id=$2',[tenant,id,input.status]);
    await this.repo.audit(sql,tenant,user.uid,'customer.action.'+input.status,id);return {updated:true};
  });}
}

export function registerCustomers(app:FastifyInstance,repo:TeamRepository,principal:(request:FastifyRequest)=>Promise<TeamPrincipal>){
  const service=new CustomerService(repo),root='/api/team/spaces/:tenant/v6/customers/:contact';
  const params=(r:FastifyRequest)=>z.object({tenant:z.string().uuid(),contact:z.string().min(1).max(100),id:z.string().uuid().optional()}).parse(r.params);
  const local=(r:FastifyRequest)=>z.object({source:z.enum(['local','active']).default('active')}).parse(r.query).source==='local';
  app.get(root,async r=>{const p=params(r);return service.dossier(p.tenant,await principal(r),p.contact,local(r));});
  app.post(root+'/actions',async r=>{const p=params(r);return service.createAction(p.tenant,await principal(r),p.contact,CustomerActionSchema.parse(r.body),local(r));});
  app.post(root+'/actions/:id',async r=>{const p=params(r),body=z.object({sourceKey:z.string().min(1).max(160),version:z.number().int().positive(),status:z.enum(['open','completed'])}).strict().parse(r.body);return service.setStatus(p.tenant,await principal(r),p.contact,p.id!,body,local(r));});
}
