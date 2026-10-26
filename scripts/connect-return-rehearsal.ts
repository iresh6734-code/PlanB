import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { localKey, open } from '../server/crypto.js';
import { Store } from '../server/store.js';
import { lockInstance } from '../server/instance.js';
import { Continuity } from '../server/continuity.js';
import { inspectConnection } from '../server/connection.js';
import { REHEARSAL_PORTAL } from './return-rehearsal.js';

const root=resolve('.'),runId=process.env.PLANB_REHEARSAL_ID??'';
if(!/^[a-f0-9]{8}$/.test(runId))throw new Error('Indica un ensayo local preparado.');
const target=join(root,'planb-ensayo-retorno-2026-10-26-'+runId,'data'),source=join(root,'planb-hubspot-149623339-2026-10-26','data');
for(const folder of [source,target])for(const name of ['planb.sqlite','.planb-key'])if(!existsSync(join(folder,name)))throw new Error('Falta una de las instalaciones de este PC.');
const release=lockInstance(target),store=new Store(join(target,'planb.sqlite'));
try{
  const definition=store.get<{runId:string;portalId:string}|null>('rehearsalDefinition',null);
  if(definition?.runId!==runId||definition.portalId!==REHEARSAL_PORTAL||!store.get('password',null))throw new Error('El ensayo debe estar identificado y protegido antes de configurar lectura.');
  if(store.get('hubspotConnection',null))throw new Error('Ya existe una conexión; no se sobrescribirá.');
  if(store.records().length!==4||store.changesCount!==4||store.changes().some(c=>c.operation!=='create'))throw new Error('El ensayo cambió desde su revisión. Conserva la carpeta y revisa antes de configurar.');
  const key=localKey(source),database=new DatabaseSync(join(source,'planb.sqlite'),{readOnly:true});let encrypted:string;
  try{const row=database.prepare('SELECT value FROM meta WHERE key=?').get('hubspotConnection') as {value:string}|undefined;if(!row)throw new Error();encrypted=JSON.parse(open(row.value,key));}finally{database.close();}
  const connection=JSON.parse(open(encrypted,key));
  if(connection.accountId!==REHEARSAL_PORTAL||typeof connection.token!=='string')throw new Error('La conexión no corresponde al portal de ensayo.');
  const verified=await inspectConnection({token:connection.token,accountId:REHEARSAL_PORTAL,mode:'test',confirmedTestAccount:true});
  if(verified.accountType!=='DEVELOPER_TEST')throw new Error('La cuenta de destino ya no es DEVELOPER_TEST.');
  new Continuity(store,root).saveConnection(connection.token,REHEARSAL_PORTAL,{mode:'test',confirmedTestAccount:true},verified);
  const report={at:new Date().toISOString(),configured:true,runId,portalId:REHEARSAL_PORTAL,accountType:verified.accountType,localProtectionRequired:true,mode:'test',existingReadCredentialUsed:true,storedEncryptedWithOwnWindowsKey:true,sourceInstallationModified:false,temporaryWriteCredentialStored:false,hubspotWrites:0,changes:store.changesCount};
  const evidence=resolve(process.env.PLANB_EVIDENCE_DIR||join(root,'delivery','ensayo-retorno'));
  writeFileSync(join(evidence,'conexion-lectura-'+runId+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{console.error('No se pudo configurar la lectura. No se ha expuesto ninguna credencial. Conserva el ensayo y revisa su protección, conexión y estado.');process.exitCode=1;}finally{store.close();release();}
