import { createHash, randomUUID } from 'node:crypto';
import { type CrmRecord, type EntityName } from '../shared/model.js';
import { AppError, Store } from './store.js';
import type { Remote } from './recovery.js';

export interface ManualMapping {entity:EntityName;localId:string;remoteId:string;}
/** This checker never invokes create/update/relate. An export alone changes nothing. */
export async function verifyManualRecovery(store:Store,remote:Remote,input:{revision:string;mapping:ManualMapping[]}){
  const revisionNow=()=>createHash('sha256').update(JSON.stringify({session:store.get('sessionId',''),changes:store.changes(),spec:store.spec})).digest('hex');
  const revision=revisionNow(),snapshot=store.snapshot;
  if(!snapshot||snapshot.source.isTestData||!store.ready)throw new AppError(409,'La comprobación manual corresponde a una copia de producción activa.');
  if(remote.source!=='hubspot'||remote.readOnly!==true||remote.accountId!==snapshot.source.accountId)throw new AppError(403,'Necesitas la conexión de lectura del mismo portal.');
  if(revision!==input.revision)throw new AppError(409,'Los cambios locales variaron. Revisa la lista actual.');
  const watermark=store.get<number>('returnWatermark:hubspot',0);
  const changes=store.changes().filter(c=>c.id>watermark);
  if(!changes.length)throw new AppError(409,'No hay cambios pendientes.');
  const changed=new Map<string,{before:CrmRecord|null;after:CrmRecord}>();
  for(const change of changes){const key=change.entity+':'+change.recordId;changed.set(key,{before:changed.has(key)?changed.get(key)!.before:change.before,after:change.after});}
  const mapping={...store.get<Record<string,string>>('remoteMapping:hubspot',{})};
  const provided=new Set<string>();
  for(const item of input.mapping){
    const key=item.entity+':'+item.localId;
    if(provided.has(key)||!changed.has(key)||changed.get(key)!.before)throw new AppError(422,'Asigna IDs una sola vez y únicamente a las altas locales pendientes.');
    if(!/^\d+$/.test(item.remoteId))throw new AppError(422,'El ID remoto debe ser numérico.');
    if(mapping[key]&&mapping[key]!==item.remoteId)throw new AppError(409,'El alta ya tiene otro ID confirmado.');
    if(snapshot.records.some(r=>r.entity===item.entity&&r.id===item.remoteId)||Object.entries(mapping).some(([other,id])=>other!==key&&other.startsWith(item.entity+':')&&id===item.remoteId))throw new AppError(422,'El ID ya corresponde a otro registro.');
    provided.add(key);mapping[key]=item.remoteId;
  }
  await remote.verify();
  const checks:{entity:EntityName;localId:string;passed:boolean;reason:string}[]=[];
  for(const [key,{before,after}] of changed){
    const remoteId=before?(mapping[key]??after.id):mapping[key];
    if(!remoteId){checks.push({entity:after.entity,localId:after.id,passed:false,reason:'Indica el ID de la nueva ficha en HubSpot.'});continue;}
    const current=await remote.read(after.entity,remoteId);
    let passed=!!current;
    const fields=store.spec!.entities.find(e=>e.id===after.entity)!.fields;
    const equal=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
    for(const field of fields){
      if(field.readOnly||before&&equal(before.values[field.key],after.values[field.key]))continue;
      if(field.type!=='reference'){if(!current||!equal(current.values[field.key],after.values[field.key]))passed=false;continue;}
      if(!remote.hasRelation)throw new AppError(409,'No se pueden comprobar las relaciones del destino.');
      const desired=after.values[field.key],old=before?.values[field.key];
      if(desired){const target=mapping[field.referenceEntity+':'+desired]??String(desired);if(!await remote.hasRelation(after.entity,remoteId,field.referenceEntity!,target))passed=false;}
      if(old&&old!==desired){const oldTarget=mapping[field.referenceEntity+':'+old]??String(old);if(await remote.hasRelation(after.entity,remoteId,field.referenceEntity!,oldTarget))passed=false;}
    }
    checks.push({entity:after.entity,localId:after.id,passed,reason:passed?'Valores y relaciones confirmados por lectura.':'Hay valores o relaciones distintos, o la ficha no existe. No se cerrará la sesión.'});
  }
  if(revisionNow()!==revision)throw new AppError(409,'Hay ediciones locales nuevas. Repite la comprobación.');
  const passed=checks.every(c=>c.passed);
  if(!passed)return {passed,checks,report:null};
  const end=Math.max(...changes.map(c=>c.id));
  const report={id:randomUUID(),method:'manual_verified' as const,sessionId:store.get<string>('sessionId',''),captureId:snapshot.id+':'+snapshot.capturedAt,revision,watermark:end,verifiedAt:new Date().toISOString(),records:checks.length};
  store.transaction(()=>{store.set('remoteMapping:hubspot',mapping);store.set('manualRecoveryReport',report);store.set('returnWatermark:hubspot',end);store.set('returnComplete',true);});
  return {passed,checks,report};
}
