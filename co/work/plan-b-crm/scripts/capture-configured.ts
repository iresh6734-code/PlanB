import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store, AppError } from '../server/store.js';
import { Continuity } from '../server/continuity.js';
import { importHubspot } from '../server/hubspot.js';
import { lockInstance } from '../server/instance.js';
import { reconcile } from '../shared/model.js';

// Maintenance entry for the development installation: the normal instance lock
// requires its server to be stopped. Existing encrypted connection and service/
// session restrictions are respected; no credentials are accepted as arguments.
const root=resolve('.'),folder=join(root,'data','hubspot-v2');
if(!existsSync(join(folder,'planb.sqlite')))throw new Error('No existe una instalación de ensayo configurada.');
const release=lockInstance(folder),store=new Store(join(folder,'planb.sqlite'));
const continuity=new Continuity(store,root,false,importHubspot);
try{
  const job=continuity.capture();let current=job;
  for(let i=0;i<1800;i++){
    current=continuity.jobs.list().find(item=>item.id===job.id)!;
    if(!['queued','running'].includes(current.status))break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(current.status!=='succeeded')throw new AppError(502,current.message);
  const result=current.result as {captureId:string};
  const snapshot=store.capture(result.captureId),report=reconcile(snapshot);
  const evidence={at:new Date().toISOString(),passed:report.complete,liveApi:true,hubspotReadOnly:true,
    storedInOperationalHistory:true,activeWorkspaceReplaced:false,accountId:snapshot.source.accountId,
    accountEvidence:snapshot.source.description,captureId:result.captureId,counts:report.counts,relations:report.actualLinks,
    limitations:['Conjunto de ensayo incompleto: no acredita el recorrido comercial completo ni devolución real.','Ninguna credencial se incluye en este informe.']};
  writeFileSync(resolve('../../outputs/pruebas-hubspot-captura-v2.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}catch(error){console.error(error instanceof AppError?error.message:'No se completó la captura; los datos activos se conservan.');process.exitCode=1;}
finally{await continuity.jobs.stop();store.close();release();}
