import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { localKey, open } from '../server/crypto.js';
import { readonlyFetch, inspectConnection } from '../server/connection.js';
import { REHEARSAL_PORTAL } from './return-rehearsal.js';

// Current-PC connection is consumed only in-process. No token, cookie, key or raw
// API response is written to the report. This script has no mutation transport.
const root=resolve('.'),runId=process.env.PLANB_REHEARSAL_ID??'';
if(!/^[a-f0-9]{8}$/.test(runId))throw new Error('Indica el identificador del ensayo preparado.');
const evidence=resolve(process.env.PLANB_EVIDENCE_DIR||join(root,'delivery','ensayo-retorno'));
const plan=JSON.parse(readFileSync(join(evidence,'plan-retorno-'+runId+'.json'),'utf8'));
if(plan.runId!==runId||plan.portalId!==REHEARSAL_PORTAL||plan.hubspotWrites!==0)throw new Error('El plan no corresponde al ensayo esperado.');
const source=join(root,'planb-hubspot-149623339-2026-10-26','data');
for(const name of ['planb.sqlite','.planb-key'])if(!existsSync(join(source,name)))throw new Error('Falta la conexión de lectura en este PC.');
const key=localKey(source),database=new DatabaseSync(join(source,'planb.sqlite'),{readOnly:true});let saved:string;
try{
  const row=database.prepare('SELECT value FROM meta WHERE key=?').get('hubspotConnection') as {value:string}|undefined;
  if(!row)throw new Error('No hay conexión de lectura guardada.');
  saved=JSON.parse(open(row.value,key));
}finally{database.close();}
const connection=JSON.parse(open(saved,key));
if(connection.accountId!==REHEARSAL_PORTAL||typeof connection.token!=='string')throw new Error('La conexión guardada no corresponde al ensayo.');
const get=readonlyFetch(fetch);
async function json(path:string){
  const response=await get('https://api.hubapi.com'+path,{headers:{Authorization:'Bearer '+connection.token},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('HubSpot no confirmó los metadatos de lectura ('+response.status+').');return response.json();
}
try{
  const inspected=await inspectConnection({token:connection.token,accountId:REHEARSAL_PORTAL,mode:'test',confirmedTestAccount:true});
  if(inspected.accountType!=='DEVELOPER_TEST')throw new Error('El portal ya no está identificado como DEVELOPER_TEST.');
  const pipelines=await json('/crm/pipelines/2026-09/deals');
  const pipeline=pipelines.results?.find((p:{id:string;label:string})=>p.id===plan.pipeline.id&&p.label===plan.pipeline.label);
  const stage=pipeline?.stages?.find((s:{id:string;label:string})=>s.id===plan.stage.id&&s.label===plan.stage.label);
  if(!pipeline||!stage)throw new Error('El pipeline o la etapa cambiaron desde la preparación.');
  let fields=0;const metadata=new Map<string,any>();
  for(const operation of [...plan.proposedCreates,...plan.proposedUpdates]){
    if(!metadata.has(operation.entity))metadata.set(operation.entity,await json('/crm/properties/2026-09/'+operation.entity));
    const properties=metadata.get(operation.entity);
    for(const field of operation.fields.filter((f:{after:unknown})=>f.after!==null&&f.after!==undefined)){
      const property=properties.results?.find((p:{name:string})=>p.name===field.field);
      if(!property||property.archived||property.calculated||property.modificationMetadata?.readOnlyValue)throw new Error('Un campo propuesto ya no está disponible para editar.');
      if(property.type==='enumeration'&&Array.isArray(property.options)&&property.options.length&&!property.options.some((o:{value:string})=>o.value===String(field.after)))throw new Error('Cambió una opción de los campos propuestos.');
      fields++;
    }
  }
  const report={at:new Date().toISOString(),passed:true,runId,portalId:REHEARSAL_PORTAL,accountType:inspected.accountType,liveApi:true,readOnly:true,hubspotWrites:0,pipelineId:pipeline.id,stageId:stage.id,proposedFieldsVerified:fields,sourceInstallationModified:false,credentialCopied:false,workflowsReviewed:false,temporaryWriteKeyPrepared:false,readyToSend:false,remaining:['Revisar workflows por interfaz con el administrador.','Proteger la instalación de ensayo y configurar lectura.','Preparar clave temporal separada y revisar sus scopes.','Aprobar el plan concreto antes de enviar.']};
  writeFileSync(join(evidence,'preflight-'+runId+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error(error instanceof Error?error.message:'No se confirmó la preparación por lectura.');process.exitCode=1;}
