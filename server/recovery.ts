import { createHash, randomUUID } from 'node:crypto';
import type { CrmRecord, EntityName, FieldValue } from '../shared/model.js';
import { validateRecord, RecoveryPlanSchema } from '../shared/model.js';
import type { RecoveryOperation, RecoveryPlan } from '../shared/operations.js';
import { checkReturn } from '../shared/return-check.js';
import { Store, AppError } from './store.js';
export interface Remote {
  source:'hubspot'|'simulation'; accountId:string;
  readOnly?:boolean;
  verify():Promise<void>;
  read(entity:EntityName,id:string):Promise<CrmRecord|null>;
  create(entity:EntityName,values:CrmRecord['values'],operationId:string):Promise<string>;
  update(entity:EntityName,id:string,values:CrmRecord['values']):Promise<void>;
  relate(entity:EntityName,id:string,target:EntityName,targetId:string):Promise<void>;
  hasRelation?(entity:EntityName,id:string,target:EntityName,targetId:string):Promise<boolean>;
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class Recovery {
  constructor(private store:Store) {
    store.set('returnBusy',false);
    if(store.recoveryIntegrity().state==='invalid')return;
    const plan=this.plan();
    if(plan&&(plan.status==='applying'||plan.operations.some(op=>op.status==='sending'||op.status==='uncertain'))){
      for(const op of plan.operations)if(op.status==='sending'){op.status='uncertain';op.error='La petición pudo llegar a HubSpot. Verifica el resultado antes de repetir.';}
      plan.status='partial';plan.approvedAt=null;this.save(plan);
    }
  }
  plan(){return this.store.validatedRecoveryPlan();}
  private save(plan:RecoveryPlan,mapping?:{key:string;value:Record<string,string>}){this.store.transaction(()=>{this.store.assertRecoveryIntegrity();if(!RecoveryPlanSchema.safeParse(plan).success)throw new AppError(502,'No se pudo validar el plan de devolución generado. Se conserva el estado guardado.');if(mapping)this.store.set(mapping.key,mapping.value);this.store.set('recoveryPlan',plan);});}
  private localRecord(op:RecoveryOperation){const record=this.store.record(op.entity,op.localId);if(!record)throw new AppError(409,'El registro local del plan ya no está disponible. Prepara otra revisión.');return record;}
  private async checkedRemote<T>(request:()=>Promise<T>):Promise<T>{this.store.assertRecoveryIntegrity();const result=await request();this.store.assertRecoveryIntegrity();return result;}
  revision(){return hash({session:this.store.get('sessionId',''),changes:this.store.changes(),spec:this.store.spec});}
  async preview(remote:Remote):Promise<RecoveryPlan> {
    this.store.assertRecoveryIntegrity();
    if(!this.store.snapshot?.source.isTestData && remote.source!=='simulation')throw new AppError(403,'Producción solo permite comprobación manual por lectura.');
    if(!this.store.ready || !this.store.snapshot)throw new AppError(409,'Necesitas una copia activa.');
    if(this.plan()?.operations.some(o=>['sending','uncertain','applied'].includes(o.status)) && this.plan()?.status!=='complete')throw new AppError(409,'Resuelve o termina el envío actual antes de crear otro plan.');
    const localRevision=this.revision();
    await this.checkedRemote(()=>remote.verify());
    if(remote.accountId!==this.store.snapshot.source.accountId)throw new AppError(422,'El portal remoto no coincide con la captura.');
    const changed=new Map<string,{before:CrmRecord|null;after:CrmRecord}>();
    const watermark=this.store.get<number>('returnWatermark:'+remote.source,0);
    const mapping=this.store.get<Record<string,string>>('remoteMapping:'+remote.source,{});
    for(const c of this.store.changes().filter(c=>c.id>watermark)){
      const key=c.entity+':'+c.recordId,old=changed.get(key);
      changed.set(key,{before:old?old.before:c.before,after:c.after});
    }
    const operations:RecoveryOperation[]=[];
    for(const change of changed.values()){
      const record=change.after,definition=this.store.spec!.entities.find(e=>e.id===record.entity)!;
      const mappedId=mapping[record.entity+':'+record.id]??record.id;
      const current=change.before?await this.checkedRemote(()=>remote.read(record.entity,mappedId)):null;
      if(change.before&&!current)throw new AppError(409,'El registro '+record.id+' está ausente o archivado en HubSpot. No se recreará automáticamente.');
      const fields=definition.fields.filter(f=>!f.readOnly&&f.type!=='reference'&&(!change.before||!equal(change.before.values[f.key],record.values[f.key]))).map(f=>{
        const base=change.before?.values[f.key]??null,local=record.values[f.key]??null,actual=current?.values[f.key]??null;
        const conflict=!!change.before&&!equal(base,actual)&&!equal(local,actual);
        return {field:f.key,label:f.label,base,local,remote:actual,conflict,decision:conflict?null:equal(local,actual)?'remote' as const:'local' as const};
      });
      const references=definition.fields.filter(f=>f.type==='reference'&&(change.before?!equal(change.before.values[f.key],record.values[f.key]):record.values[f.key]!==undefined&&record.values[f.key]!==null&&record.values[f.key]!=='')).map(f=>({field:f.key,entity:f.referenceEntity!,id:record.values[f.key]?String(record.values[f.key]):null}));
      if(references.some(r=>!r.id || change.before?.values[r.field]))throw new AppError(422,'Cambiar o quitar una relación principal requiere revisión manual en HubSpot. Exporta esos cambios; esta versión solo añade relaciones.');
      if(!fields.length&&!references.length)continue;
      operations.push({id:randomUUID(),entity:record.entity,localId:record.id,remoteId:change.before?mappedId:null,kind:change.before?'update':'create',
        label:String(record.values[definition.displayField]??record.id),fields,references,
        remoteVersion:current?this.remoteHash(current,fields.map(f=>f.field)):null,status:'pending',error:null});
    }
    if(localRevision!==this.revision())throw new AppError(409,'Los datos locales cambiaron durante la revisión. Vuelve a prepararla.');
    const plan:RecoveryPlan={id:randomUUID(),accountId:remote.accountId,createdAt:new Date().toISOString(),revision:localRevision,status:'review',operations,source:remote.source,approvedAt:null,
      warning:'Revisa workflows y coordina una ventana sin ediciones. Se aplica el estado final; no se reproducen estados intermedios ni se desactivan automatizaciones.'};
    this.save(plan);return plan;
  }
  private remoteHash(record:CrmRecord,fields:string[]){return hash(fields.map(key=>[key,record.values[key]??null]));}
  decide(planId:string,decisions:{operationId:string;field:string;decision:'local'|'remote'}[]) {
    const plan=this.require(planId);
    if(!['review','approved'].includes(plan.status))throw new AppError(409,'El envío ya se ha iniciado.');
    for(const choice of decisions){
      const op=plan.operations.find(o=>o.id===choice.operationId),field=op?.fields.find(f=>f.field===choice.field);
      if(!field)throw new AppError(422,'La decisión no pertenece al plan.');
      field.decision=choice.decision;
    }
    plan.status='review';plan.approvedAt=null;this.save(plan);return plan;
  }
  approve(planId:string) {
    const plan=this.require(planId);
    if(plan.revision!==this.revision())throw new AppError(409,'Hay cambios locales nuevos. Prepara otra revisión.');
    if(plan.operations.some(op=>op.fields.some(f=>f.decision===null)||['sending','uncertain'].includes(op.status)))throw new AppError(409,'Resuelve todos los conflictos y resultados inciertos.');
    if(!['review','partial','approved'].includes(plan.status))throw new AppError(409,'El plan no admite otra aprobación.');
    for(const op of plan.operations.filter(o=>!['applied','skipped'].includes(o.status))){
      const local=this.localRecord(op);
      const values={...local.values,...Object.fromEntries(op.fields.map(f=>[f.field,f.decision==='local'?f.local:f.remote]))};
      if(Object.keys(validateRecord(this.store.spec!,{...local,values})).length)throw new AppError(422,'Las decisiones dejan un registro inválido: '+op.label+'. Revisa campos obligatorios y reglas.');
    }
    plan.status='approved';plan.approvedAt=new Date().toISOString();this.save(plan);return plan;
  }
  private require(id:string){const plan=this.plan();if(!plan||plan.id!==id)throw new AppError(404,'El plan no existe.');return plan;}
  async refresh(planId:string,remote:Remote){
    const plan=this.require(planId);
    if(plan.status==='applying'||plan.source!==remote.source||plan.accountId!==remote.accountId||plan.revision!==this.revision())throw new AppError(409,'El plan no admite esta revisión.');
    if(plan.operations.some(o=>['sending','uncertain'].includes(o.status)))throw new AppError(409,'Verifica primero los resultados inciertos.');
    await this.checkedRemote(()=>remote.verify());
    for(const op of plan.operations.filter(o=>o.kind==='update'&&o.status!=='applied')){
      const current=await this.checkedRemote(()=>remote.read(op.entity,op.remoteId!));
      if(!current)throw new AppError(409,'Registro remoto ausente. Revisión manual necesaria.');
      for(const f of op.fields){f.remote=current.values[f.field]??null;f.conflict=!equal(f.base,f.remote)&&!equal(f.local,f.remote);f.decision=f.conflict?null:equal(f.local,f.remote)?'remote':'local';}
      op.remoteVersion=this.remoteHash(current,op.fields.map(f=>f.field));op.status='pending';op.error=null;
    }
    plan.status='review';plan.approvedAt=null;this.save(plan);return plan;
  }
  async apply(planId:string,remote:Remote,signal?:AbortSignal,progress?:(message:string,percent:number)=>void) {
    if(remote.readOnly||!this.store.snapshot?.source.isTestData&&remote.source!=='simulation')throw new AppError(403,'Las escrituras en producción están bloqueadas.');
    const plan=this.require(planId);
    if(plan.status!=='approved'||plan.source!==remote.source||plan.accountId!==remote.accountId||plan.revision!==this.revision())throw new AppError(409,'Revisa y aprueba un plan vigente antes de aplicarlo.');
    if(plan.operations.some(op=>['sending','uncertain'].includes(op.status)))throw new AppError(409,'Verifica los resultados inciertos antes de continuar.');
    for(const op of plan.operations.filter(o=>!['applied','skipped'].includes(o.status)))this.localRecord(op);
    await this.checkedRemote(()=>remote.verify());
    const order:EntityName[]=['companies','contacts','deals','tasks'];
    plan.operations.sort((a,b)=>order.indexOf(a.entity)-order.indexOf(b.entity));
    const mapping=this.store.get<Record<string,string>>('remoteMapping:'+remote.source,{});
    plan.status='applying';this.save(plan);
    for(const [index,op] of plan.operations.entries()){
      if(['applied','skipped'].includes(op.status))continue;
      if(signal?.aborted)break;
      if(op.status==='uncertain')break;
      try{
        let current:CrmRecord|null=null;
        if(op.kind==='update'){
          current=await this.checkedRemote(()=>remote.read(op.entity,op.remoteId!));
          if(!current||this.remoteHash(current,op.fields.map(f=>f.field))!==op.remoteVersion){plan.status='review';plan.approvedAt=null;op.error='HubSpot cambió desde la revisión. Prepara otro plan.';this.save(plan);throw new AppError(409,op.error);}
        }
        const values=Object.fromEntries(op.fields.filter(f=>f.decision==='local').map(f=>[f.field,f.local]));
        const local=this.localRecord(op);
        const selected=Object.fromEntries(op.fields.map(f=>[f.field,f.decision==='local'?f.local:f.remote]));
        const combined={...local,values:{...local.values,...current?.values,...(op.kind==='create'?selected:values)}};
        const issues=validateRecord(this.store.spec!,combined,current?{...combined,values:{...local.values,...current.values}}:null);
        if(Object.keys(issues).length)throw new AppError(422,'El estado final incumple una regla. Revisa '+op.label+' antes de enviar.');
        op.status='sending';op.error=null;this.save(plan);
        if(op.kind==='create'&&!op.remoteId){const createdId:unknown=await this.checkedRemote(()=>remote.create(op.entity,values,op.id));if(typeof createdId!=='string'||createdId.length===0)throw new AppError(502,'El destino no confirmó un identificador de registro válido.');op.remoteId=createdId;mapping[op.entity+':'+op.localId]=createdId;this.save(plan,{key:'remoteMapping:'+remote.source,value:mapping});}
        else if(op.kind==='update'&&Object.keys(values).length)await this.checkedRemote(()=>remote.update(op.entity,op.remoteId!,values));
        for(const ref of op.references){
          const target=mapping[ref.entity+':'+ref.id]??ref.id!;
          if(target.startsWith('local-'))throw new AppError(422,'Falta devolver primero el registro relacionado.');
          if(!remote.hasRelation||!await this.checkedRemote(()=>remote.hasRelation!(op.entity,op.remoteId!,ref.entity,target)))await this.checkedRemote(()=>remote.relate(op.entity,op.remoteId!,ref.entity,target));
          if(remote.hasRelation&&!await this.checkedRemote(()=>remote.hasRelation!(op.entity,op.remoteId!,ref.entity,target)))throw new AppError(502,'HubSpot no confirmó la relación enviada.');
        }
        const verified=await this.checkedRemote(()=>remote.read(op.entity,op.remoteId!));
        if(!verified||Object.entries(values).some(([k,v])=>!equal(verified.values[k],v)))throw new AppError(502,'HubSpot no confirmó los valores enviados.');
        op.status='applied';
      }catch(error){
        if(op.status==='sending'){op.status='uncertain';plan.approvedAt=null;op.error='El envío puede haberse aplicado parcial o totalmente. Comprueba el ID remoto antes de continuar.';}
        else if(plan.status!=='review'){op.status='failed';op.error=error instanceof AppError?error.message:'No se pudo consultar el destino.';}
        this.save(plan);break;
      }
      this.save(plan);progress?.('Verificado: '+op.label,Math.round((index+1)/Math.max(1,plan.operations.length)*100));
    }
    plan.status=plan.operations.every(o=>['applied','skipped'].includes(o.status))?'complete':plan.status==='review'?'review':'partial';
    this.save(plan);
    // A simulation never marks real changes as returned.
    if(plan.status==='complete'){
      this.store.transaction(()=>{
      this.store.assertRecoveryIntegrity();
      this.store.set('returnWatermark:'+remote.source,Math.max(0,...this.store.changes().map(c=>c.id)));
      if(remote.source==='hubspot')this.store.set('returnComplete',true);
      });
    }
    return plan;
  }
  async resolveUncertain(planId:string,operationId:string,remoteId:string,remote:Remote) {
    const plan=this.require(planId),op=plan.operations.find(o=>o.id===operationId);
    if(!op||op.status!=='uncertain'||plan.source!==remote.source||plan.accountId!==remote.accountId)throw new AppError(409,'No hay una operación incierta compatible.');
    await this.checkedRemote(()=>remote.verify());const record=await this.checkedRemote(()=>remote.read(op.entity,remoteId));
    if(!record||op.fields.filter(f=>f.decision==='local').some(f=>!equal(record.values[f.field],f.local)))throw new AppError(409,'El registro remoto no confirma los valores. Revisión manual necesaria.');
    const mappingBefore=this.store.get<Record<string,string>>('remoteMapping:'+remote.source,{});
    const other=Object.entries(mappingBefore).find(([key,value])=>value===remoteId&&key!==op.entity+':'+op.localId&&key.startsWith(op.entity+':'));
    if(other||op.remoteId&&op.remoteId!==remoteId)throw new AppError(409,'El ID remoto no corresponde a esta operación.');
    let pendingRelations=false;
    for(const ref of op.references){
      if(!remote.hasRelation)throw new AppError(409,'El destino no permite verificar relaciones.');
      const target=mappingBefore[ref.entity+':'+ref.id]??ref.id!;
      if(!await this.checkedRemote(()=>remote.hasRelation!(op.entity,remoteId,ref.entity,target)))pendingRelations=true;
    }
    op.remoteId=remoteId;op.status=pendingRelations?'pending':'applied';op.error=pendingRelations?'Registro verificado. Revisa y aprueba únicamente las relaciones pendientes.':null;
    const mapping=this.store.get<Record<string,string>>('remoteMapping:'+remote.source,{});mapping[op.entity+':'+op.localId]=remoteId;
    plan.status='partial';this.save(plan,{key:'remoteMapping:'+remote.source,value:mapping});return plan;
  }
  /** T6: relee en el destino lo ya verificado y dice si sigue igual. Solo lee: no guarda el plan ni toca la copia. */
  async check(planId:string,remote:Remote){
    const plan=this.require(planId);
    if(plan.source!==remote.source||plan.accountId!==remote.accountId)throw new AppError(409,'Comprueba con el mismo destino que usó la devolución.');
    if(plan.status==='applying'||this.store.get('returnBusy',false))throw new AppError(409,'Espera a que termine la devolución en curso.');
    if(!plan.operations.some(op=>op.status==='applied'&&op.remoteId))throw new AppError(409,'Este plan aún no tiene nada enviado que comprobar.');
    await this.checkedRemote(()=>remote.verify());
    return checkReturn(plan,(entity,id)=>this.checkedRemote(()=>remote.read(entity,id)),new Date().toISOString());
  }
}
export function simulatedRemote(store:Store):Remote {
  const snapshot=store.snapshot!;
  const records=()=>store.get<CrmRecord[]|null>('simulatedRemote',null)??snapshot.records;
  return {source:'simulation',accountId:snapshot.source.accountId,async verify(){},
    async read(entity,id){return records().find(r=>r.entity===entity&&r.id===id)??null;},
    async create(entity,values){const id='sim-'+randomUUID();store.set('simulatedRemote',[...records(),{entity,id,values}]);return id;},
    async update(entity,id,values){store.set('simulatedRemote',records().map(r=>r.entity===entity&&r.id===id?{...r,values:{...r.values,...values}}:r));},
    async relate(){/* This simulator tests the return protocol; real associations require the live connector. */}
  };
}
