import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AppSpecSchema, RecordSchema, SnapshotSchema, validateRecord, type AppSpec, type CrmRecord } from '../shared/model.js';
import { SyncOperationSchema, type SyncOperation, type SyncResult, type TeamRecord } from '../shared/team.js';
import { AppError, type Store } from './store.js';
interface Replica {url:string;token:string;tenantId:string;spec:AppSpec;records:TeamRecord[];outbox:SyncOperation[];conflicts:SyncResult[];cursor:number;lastSync:string|null;error:string|null;}
const bootstrapSchema=z.object({tenantId:z.string().uuid(),demo:z.boolean(),blueprint:z.object({snapshot:SnapshotSchema,spec:AppSpecSchema}),records:z.array(z.object({entity:z.string(),id:z.string(),version:z.number().int().positive(),value:RecordSchema})).max(10000),cursor:z.number().int().nonnegative()});
export class TeamSyncClient {
  private busy=false;
  constructor(private store:Store,private allowedOrigin?:string,private demo=false,private fetcher:typeof fetch=fetch){}
  private get(){return this.store.get<Replica|null>('teamReplica',null);}
  private save(replica:Replica|null){this.store.set('teamReplica',replica);}
  private available(){if(this.store.get('continuitySession',null))throw new AppError(409,'Cierra la sesión de continuidad antes de intercambiar datos con el equipo.');}
  private target(raw:string){const url=new URL(raw);if(!this.allowedOrigin||url.origin!==this.allowedOrigin||url.username||url.password||url.search||url.hash)throw new AppError(403,'El origen del equipo debe coincidir con el configurado para esta instalación.');
    if(url.protocol!=='https:'&&!(this.demo&&url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new AppError(403,'La vinculación requiere HTTPS.');return url.origin;
  }
  private async request(url:string,token:string,path:string,body?:unknown){const response=await this.fetcher(this.target(url)+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new AppError(response.status===401?401:502,response.status===401?'El equipo revocó la vinculación. Los cambios pendientes se conservan.':'No se pudo sincronizar. Los cambios pendientes se conservan.');
    const text=await response.text();if(text.length>20_000_000)throw new AppError(413,'Respuesta de sincronización demasiado grande.');return JSON.parse(text);
  }
  status(){const state=this.get();if(!state)return {linked:false,configured:!!this.allowedOrigin,origin:this.allowedOrigin??null,records:[],pending:0,conflicts:[],lastSync:null,error:null};
    const {token,outbox,...safe}=state;const projected=structuredClone(state.records.slice(0,100));for(const row of projected)for(const operation of outbox)if(operation.entity===row.entity&&operation.recordId===row.id)Object.assign(row.value.values,operation.values);
    return {...safe,linked:true,configured:true,pending:outbox.length,pendingOperations:outbox,records:projected};
  }
  async link(url:string,token:string,expectedTenantId:string){
    this.available();
    if(!this.store.get('password',null))throw new AppError(409,'Protege primero esta copia local antes de guardar una vinculación.');
    if(this.get())throw new AppError(409,'Esta copia ya tiene una vinculación. Revísala antes de cambiar de empresa.');
    const data=bootstrapSchema.parse(await this.request(url,token,'/api/team/device/bootstrap'));
    if(data.tenantId!==expectedTenantId)throw new AppError(403,'La clave pertenece a otra empresa.');
    if(!data.blueprint.snapshot.source.isTestData&&this.demo)throw new AppError(403,'La demo local solo admite datos ficticios.');
    if(data.records.some(record=>record.entity!==record.value.entity||record.id!==record.value.id))throw new AppError(422,'La réplica contiene registros incoherentes.');
    this.save({url:this.target(url),token,tenantId:data.tenantId,spec:data.blueprint.spec,records:data.records,outbox:[],conflicts:[],cursor:data.cursor,lastSync:new Date().toISOString(),error:null});return this.status();
  }
  queue(entity:CrmRecord['entity'],id:string,values:CrmRecord['values']){
    const state=this.get();if(!state)throw new AppError(409,'Vincula una copia de equipo.');if(state.outbox.length>=100)throw new AppError(409,'Sincroniza los cien cambios pendientes antes de añadir más.');
    const row=state.records.find(r=>r.entity===entity&&r.id===id);if(!row)throw new AppError(404,'Registro no encontrado en esta copia.');
    const pending=state.outbox.filter(op=>op.entity===entity&&op.recordId===id),previous=structuredClone(row.value) as CrmRecord;
    for(const op of pending)Object.assign(previous.values,op.values);const record={...previous,values:{...previous.values,...values}};
    const definition=state.spec.entities.find(e=>e.id===entity)!;
    if(Object.keys(values).some(key=>!definition.fields.some(f=>f.key===key&&!f.readOnly))||Object.keys(validateRecord(state.spec,record,previous)).length)throw new AppError(422,'El cambio no cumple las reglas de la copia.');
    const operation=SyncOperationSchema.parse({id:randomUUID(),entity,recordId:id,baseVersion:row.version+pending.length,values});state.outbox.push(operation);this.save(state);return {queued:true,pending:state.outbox.length};
  }
  async synchronize(){
    this.available();
    if(this.busy)throw new AppError(409,'Ya hay una sincronización en curso.');const initial=this.get();if(!initial)throw new AppError(409,'Vincula una copia de equipo.');this.busy=true;
    try {
      let more=true;let pages=0;while(more&&pages++<25){
        const before=this.get()!,sent=before.outbox.slice(0,100);
        const result=z.object({tenantId:z.string().uuid(),results:z.array(z.object({operationId:z.string().uuid(),status:z.enum(['applied','conflict']),version:z.number().int(),recordId:z.string(),conflictId:z.string().uuid().optional()})).max(100),events:z.array(z.object({seq:z.string(),entity:z.string(),record_id:z.string(),value:RecordSchema,version:z.number().int().positive()})).max(500),resolvedConflicts:z.array(z.string().uuid()).default([]),cursor:z.number().int().nonnegative(),hasMore:z.boolean()}).parse(await this.request(before.url,before.token,'/api/team/device/exchange',{operations:sent,cursor:before.cursor}));
        if(result.tenantId!==before.tenantId||result.cursor<before.cursor||result.results.some(r=>!sent.some(op=>op.id===r.operationId)))throw new AppError(422,'Respuesta de otra empresa o revisión inválida.');
        const state=this.get()!,ack=new Set(result.results.map(r=>r.operationId));state.outbox=state.outbox.filter(op=>!ack.has(op.id));
        for(const conflict of result.results.filter(r=>r.status==='conflict'))if(!state.conflicts.some(c=>c.operationId===conflict.operationId))state.conflicts.push(conflict);
        state.conflicts=state.conflicts.filter(c=>!result.resolvedConflicts.includes(c.operationId));
        for(const event of result.events){if(event.entity!==event.value.entity||event.record_id!==event.value.id)throw new AppError(422,'Evento incoherente.');const index=state.records.findIndex(r=>r.entity===event.entity&&r.id===event.record_id);if(index<0)state.records.push({entity:event.entity,id:event.record_id,value:event.value,version:event.version});else if(state.records[index].version<event.version)state.records[index]={entity:event.entity,id:event.record_id,value:event.value,version:event.version};}
        if(state.records.length>10000)throw new AppError(413,'La copia supera el límite de registros.');state.cursor=result.cursor;state.lastSync=new Date().toISOString();state.error=null;this.save(state);more=result.hasMore;
      }return this.status();
    }catch{const state=this.get();if(state){state.error='La sincronización no terminó. Se conservan la copia y los cambios pendientes.';this.save(state);}throw new AppError(502,'No se completó la sincronización. Comprueba la conexión o la revocación del dispositivo.');}
    finally{this.busy=false;}
  }
  unlink(){const state=this.get();if(this.busy||state?.outbox.length)throw new AppError(409,'Resuelve la sincronización pendiente antes de desvincular.');this.save(null);return {unlinked:true};}
}
export function registerTeamSync(app:FastifyInstance,store:Store,origin?:string,demo=false){const client=new TeamSyncClient(store,origin,demo);
  app.get('/api/v6/workspace',async()=>({origin:origin??null}));
  app.get('/api/v5/team-sync',async()=>client.status());
  app.post('/api/v5/team-sync/link',async request=>{const body=z.object({url:z.string().url(),token:z.string().regex(/^[a-f0-9]{64}$/),tenantId:z.string().uuid()}).strict().parse(request.body);return client.link(body.url,body.token,body.tenantId);});
  app.post('/api/v5/team-sync/edit',async request=>{const body=z.object({entity:z.enum(['contacts','companies','deals','tasks']),id:z.string(),values:SyncOperationSchema.shape.values}).strict().parse(request.body);return client.queue(body.entity,body.id,body.values);});
  app.post('/api/v5/team-sync/run',async request=>{z.object({reviewed:z.literal(true)}).strict().parse(request.body);return client.synchronize();});
  app.post('/api/v5/team-sync/unlink',async request=>{z.object({reviewed:z.literal(true)}).strict().parse(request.body);return client.unlink();});
}
