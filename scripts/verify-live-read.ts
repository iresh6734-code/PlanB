import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { localKey, open } from '../server/crypto.js';
import { importHubspot } from '../server/hubspot.js';
import { Store, AppError } from '../server/store.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { reconcile, validateRecord, validateSpec } from '../shared/model.js';

// Only the connector configured through Plan B's local form is used. No key is
// printed or supplied through command-line arguments, and the active DB is read-only.
const root=resolve('.'),folder=join(root,'data','hubspot-v2');
if(!existsSync(join(folder,'.planb-key')))throw new Error('Configura primero la cuenta de ensayo en el formulario local.');
const key=localKey(folder),db=new DatabaseSync(join(folder,'planb.sqlite'),{readOnly:true});
let connection:{token:string;accountId:string};
try{
  const row=db.prepare('SELECT value FROM meta WHERE key=?').get('hubspotConnection') as {value:string}|undefined;
  if(!row)throw new Error('No hay conexión configurada.');
  const sealed=JSON.parse(open(row.value,key)) as string;
  connection=JSON.parse(open(sealed,key));
}finally{db.close();}
const output=resolve('../../outputs/pruebas-hubspot-lectura-v2.json');
try{
  const snapshot=await importHubspot({...connection,confirmedTestAccount:true,progress:(message,percent)=>console.log(percent+'% · '+message)});
  const spec=makeDemoSpec(snapshot),reconciliation=reconcile(snapshot),issues=validateSpec(spec,snapshot);
  for(const record of snapshot.records)for(const [field,message] of Object.entries(validateRecord(spec,record)))issues.push(record.entity+'/'+record.id+'/'+field+': '+message);
  const isolated=join(root,'tests','.tmp','hubspot-live-read');mkdirSync(isolated,{recursive:true});
  const store=new Store(join(isolated,'planb.sqlite'));
  try{store.importSnapshot(snapshot,true);store.saveGeneration(spec,{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:false});if(!issues.length)store.activate();}finally{store.close();}
  const report={at:new Date().toISOString(),passed:reconciliation.complete&&issues.length===0,liveApi:true,readOnly:true,
    accountId:snapshot.source.accountId,accountEvidence:snapshot.source.description,counts:reconciliation.counts,
    relations:reconciliation.actualLinks,pipelines:snapshot.pipelines,stages:snapshot.stages.map(s=>({id:s.id,label:s.label,pipelineId:s.pipelineId})),
    customFields:snapshot.entities.map(e=>({entity:e.id,fields:e.fields.filter(f=>!f.key.startsWith('planb_')||f.type!=='reference').map(f=>({key:f.key,type:f.type,readOnly:f.readOnly}))})),
    specIssues:issues,limitations:['Se verifica el contenido actual del portal de ensayo; no acredita que el conjunto previsto esté completo.','No escribe en HubSpot ni modifica la base operativa de Plan B.','No acredita una devolución real ni generación IA.']};
  writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,accountId:report.accountId,counts:report.counts,relations:report.relations,specIssues:issues.length}));
  if(!report.passed)process.exitCode=1;
}catch(error){
  const message=error instanceof AppError?error.message:'No se completó la lectura real. La credencial no se ha expuesto.';
  writeFileSync(output,JSON.stringify({at:new Date().toISOString(),passed:false,liveApi:true,readOnly:true,error:message},null,2));console.error(message);process.exitCode=1;
}
