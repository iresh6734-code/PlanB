import { randomUUID } from 'node:crypto';
import { type CrmSnapshot, type CrmRecord, type EntityName, SnapshotSchema, reconcile } from '../shared/model.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { Store, AppError } from '../server/store.js';
import { Recovery, type Remote } from '../server/recovery.js';

export const REHEARSAL_PORTAL='149623339';
export interface Rehearsal {
  runId:string;label:string;schemaCaptureId:string;schemaCapturedAt:string;
  baseline:CrmSnapshot;pipeline:{id:string;label:string};stage:{id:string;label:string};
  initialStatus:string;completedStatus:string;dueAt:string;
}

/** Builds only new fictional values. No original CRM records or credentials are copied. */
export function defineRehearsal(input:CrmSnapshot,runId:string,now=new Date()):Rehearsal {
  const snapshot=SnapshotSchema.parse(input);
  if(snapshot.source.kind!=='hubspot'||!snapshot.source.isTestData||snapshot.source.accountId!==REHEARSAL_PORTAL||snapshot.source.accountType&&!['DEVELOPER_TEST','SANDBOX'].includes(snapshot.source.accountType))throw new AppError(403,'El ensayo requiere el esquema del portal ficticio 149623339.');
  if(!/^[a-z0-9-]{6,48}$/.test(runId))throw new AppError(422,'Identificador de ensayo no válido.');
  if(!reconcile(snapshot).complete)throw new AppError(422,'El esquema de partida debe proceder de una captura conciliada.');
  const pipeline=snapshot.pipelines?.find(p=>p.id==='4252418259'&&['Nuevos clientes','[FICTICIO] Plan B · Nuevos clientes'].includes(p.label));
  if(!pipeline)throw new AppError(422,'Revisa el pipeline Nuevos clientes del portal de ensayo.');
  const stage=snapshot.stages.find(s=>s.pipelineId===pipeline.id&&s.label==='Contacto inicial');
  if(!stage)throw new AppError(422,'Revisa la etapa Contacto inicial del pipeline elegido.');
  const task=snapshot.entities.find(e=>e.id==='tasks')!,status=task.fields.find(f=>f.key==='hs_task_status');
  if(!status||status.readOnly||status.type==='enum'&&(!status.options.some(o=>o.id==='NOT_STARTED')||!status.options.some(o=>o.id==='COMPLETED')))throw new AppError(422,'No se pueden ensayar los estados NOT_STARTED y COMPLETED con este esquema.');
  for(const [entity,keys] of Object.entries({companies:['name','domain'],contacts:['firstname','lastname','phone'],deals:['dealname','amount','pipeline','dealstage'],tasks:['hs_task_subject','hs_task_status','hs_timestamp']}))for(const key of keys){
    if(!snapshot.entities.find(e=>e.id===entity)?.fields.some(f=>f.key===key&&!f.readOnly))throw new AppError(422,'El esquema no permite preparar '+entity+'.'+key+'.');
  }
  const label='[FICTICIO] Plan B v0.3 QA '+runId;
  const baseline:CrmSnapshot={...structuredClone(snapshot),id:'rehearsal-'+runId,name:label,capturedAt:now.toISOString(),captureStartedAt:now.toISOString(),records:[],links:[],
    source:{kind:'fixture',accountId:REHEARSAL_PORTAL,isTestData:true,environment:'test',description:'Caso local nuevo construido con el esquema guardado de '+snapshot.id+':'+snapshot.capturedAt+'. No es una captura nueva del CRM; cuenta y metadatos actuales pendientes de verificar.'},
    manifest:{complete:true,expectedCounts:{contacts:0,companies:0,deals:0,tasks:0},expectedLinks:0}};
  const due=new Date(now.getTime()+2*86400_000);due.setUTCHours(10,0,0,0);
  return {runId,label,schemaCaptureId:snapshot.id+':'+snapshot.capturedAt,schemaCapturedAt:snapshot.capturedAt,baseline,pipeline,stage,initialStatus:'NOT_STARTED',completedStatus:'COMPLETED',dueAt:due.toISOString()};
}

export function seedRehearsal(store:Store,definition:Rehearsal){
  if(store.snapshot||store.records().length)throw new AppError(409,'Usa una carpeta vacía: no se sustituye un ensayo anterior.');
  store.importSnapshot(definition.baseline);store.saveGeneration(makeDemoSpec(definition.baseline),{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:false});store.activate();store.set('disconnected',true);
  const ref=(entity:EntityName,target:EntityName)=>{
    const fields=store.spec!.entities.find(e=>e.id===entity)!.fields.filter(f=>f.type==='reference'&&f.referenceEntity===target&&!f.readOnly);
    if(fields.length!==1)throw new AppError(422,'La relación '+entity+' → '+target+' requiere revisión.');return fields[0].key;
  };
  const company=store.saveRecord('companies',{name:definition.label+' Empresa',domain:'planb-'+definition.runId+'.invalid'});
  const contact=store.saveRecord('contacts',{firstname:definition.label+' Contacto',lastname:'Ensayo',phone:'000 000 001',[ref('contacts','companies')]:company.id});
  const deal=store.saveRecord('deals',{dealname:definition.label+' Oportunidad',amount:100,pipeline:definition.pipeline.id,dealstage:definition.stage.id,[ref('deals','companies')]:company.id,[ref('deals','contacts')]:contact.id});
  const task=store.saveRecord('tasks',{hs_task_subject:definition.label+' Tarea',hs_task_status:definition.initialStatus,hs_timestamp:definition.dueAt,[ref('tasks','contacts')]:contact.id,[ref('tasks','deals')]:deal.id});
  store.set('rehearsalDefinition',{runId:definition.runId,portalId:REHEARSAL_PORTAL,schemaCaptureId:definition.schemaCaptureId,createdAt:new Date().toISOString(),remoteWritesApproved:false});
  return {company,contact,deal,task};
}

/** Exercises the real Recovery engine against an in-memory destination, never HubSpot. */
export async function checkRehearsal(source:Store,definition:Rehearsal){
  const copy=new Store(':memory:');copy.restoreBundle(source.bundle());
  const records=new Map<string,CrmRecord>(),links=new Set<string>();let creates=0,updates=0,relations=0;
  const remote:Remote={source:'simulation',accountId:REHEARSAL_PORTAL,async verify(){},async read(entity,id){return structuredClone(records.get(entity+':'+id)??null);},
    async create(entity,values){const id=String(990000000000+(++creates));records.set(entity+':'+id,{entity,id,values:structuredClone(values)});return id;},
    async update(entity,id,values){const key=entity+':'+id,old=records.get(key);if(!old)throw Error('Alta remota ausente');updates++;records.set(key,{...old,values:{...old.values,...structuredClone(values)}});},
    async hasRelation(entity,id,target,targetId){return links.has([entity,id,target,targetId].join(':'));},async relate(entity,id,target,targetId){relations++;links.add([entity,id,target,targetId].join(':'));}};
  try{
    const engine=new Recovery(copy),first=await engine.preview(remote);
    if(first.operations.length!==4||first.operations.some(o=>o.kind!=='create')||first.operations.reduce((n,o)=>n+o.references.length,0)!==5)throw Error('El alcance no es de cuatro altas y cinco relaciones.');
    const proposed=structuredClone(first.operations);engine.approve(first.id);
    if((await engine.apply(first.id,remote)).status!=='complete')throw Error('El alta simulada no se completó.');
    let duplicateBlocked=false;try{await engine.apply(first.id,remote);}catch(error){if(error instanceof AppError&&error.status===409)duplicateBlocked=true;else throw error;}
    if(!duplicateBlocked||creates!==4||relations!==5)throw Error('No se comprobó el bloqueo de repetición.');
    const contact=copy.records('contacts')[0],task=copy.records('tasks')[0];
    copy.saveRecord('contacts',{phone:'000 000 002'},contact.id);copy.saveRecord('tasks',{hs_task_status:definition.completedStatus},task.id);
    const second=await engine.preview(remote);
    if(second.operations.length!==2||second.operations.some(o=>o.kind!=='update'))throw Error('La segunda fase debe modificar únicamente dos fichas nuevas.');
    engine.approve(second.id);if((await engine.apply(second.id,remote)).status!=='complete')throw Error('La actualización simulada no se completó.');
    if(creates!==4||updates!==2||relations!==5)throw Error('El destino recibió operaciones fuera del alcance.');
    const summarize=(operations:typeof first.operations)=>operations.map(o=>({entity:o.entity,kind:o.kind,localId:o.localId,label:o.label,fields:o.fields.map(f=>({field:f.field,label:f.label,before:f.base,after:f.local})),references:o.references,remoteIdPending:true}));
    return {passed:true,liveApi:false,hubspotWrites:0,simulatedCreates:creates,simulatedUpdates:updates,simulatedRelations:relations,duplicateBlocked,
      existingRecordsCopied:0,proposedCreates:summarize(proposed),proposedUpdates:summarize(second.operations),limitations:['Simulación local, no devolución auténtica.','Esquema guardado: confirmar cuenta, metadatos y workflows antes de autorizar el envío.','Los IDs remotos deben asignarse y verificarse durante el envío auténtico; este archivo no es un plan aprobado.']};
  }finally{copy.close();}
}

export function rehearsalRunId(){return randomUUID().slice(0,8);}
