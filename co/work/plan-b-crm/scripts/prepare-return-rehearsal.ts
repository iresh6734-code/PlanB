import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { localKey, open } from '../server/crypto.js';
import { Store, AppError } from '../server/store.js';
import { SnapshotSchema } from '../shared/model.js';
import { defineRehearsal, seedRehearsal, checkRehearsal, rehearsalRunId } from './return-rehearsal.js';

const root=resolve('.'),source=join(root,'planb-hubspot-149623339-2026-10-26','data');
const captureId='6d65d147-1ecd-4e87-bf56-9fb742f2e9ce:2026-10-26T10:58:24.957Z';
const evidence=resolve(process.env.PLANB_EVIDENCE_DIR||join(root,'delivery','ensayo-retorno'));
for(const file of ['planb.sqlite','.planb-key'])if(!existsSync(join(source,file)))throw new Error('Falta la captura de este Windows; no se consulta ningún otro equipo.');
const key=localKey(source),database=new DatabaseSync(join(source,'planb.sqlite'),{readOnly:true});let payload:string;
try{const row=database.prepare('SELECT payload FROM captures WHERE id=?').get(captureId) as {payload:string}|undefined;if(!row)throw new Error('Falta la captura conciliada prevista.');payload=row.payload;}finally{database.close();}
const schema=SnapshotSchema.parse(JSON.parse(open(payload,key)));
if(process.argv.includes('--describe-schema')){
  console.log(JSON.stringify({captureId,pipelines:schema.pipelines,stages:schema.stages,taskStatus:schema.entities.find(e=>e.id==='tasks')?.fields.find(f=>f.key==='hs_task_status')}));process.exit(0);
}
const definition=defineRehearsal(schema,rehearsalRunId());
const folder=join(root,'planb-ensayo-retorno-2026-10-26-'+definition.runId);
if(existsSync(folder))throw new Error('La carpeta de ensayo ya existe. No se sustituirá.');
mkdirSync(join(folder,'data'),{recursive:true});const store=new Store(join(folder,'data','planb.sqlite'));
try{
  seedRehearsal(store,definition);const check=await checkRehearsal(store,definition);
  const bundle=store.bundle();
  mkdirSync(evidence,{recursive:true});
  writeFileSync(join(evidence,'plan-retorno-'+definition.runId+'.json'),JSON.stringify({at:new Date().toISOString(),portalId:definition.baseline.source.accountId,runId:definition.runId,label:definition.label,sourceSchemaCapture:definition.schemaCaptureId,schemaCapturedAt:definition.schemaCapturedAt,pipeline:definition.pipeline,stage:definition.stage,dueAt:definition.dueAt,...check},null,2));
  writeFileSync(join(folder,'ensayo-preparado.json'),JSON.stringify(bundle,null,2));
  const runtime=join(root,'delivery','v0.3.0-final','Plan-B-CRM-v0.3.0');
  for(const file of ['server.mjs','runtime.mjs','drill.mjs','launch.cjs','block-external.cjs','node.exe','dist','node_modules','NODE-LICENSE.txt','THIRD-PARTY-LICENSES.txt','LEEME-v0.3.0.md'])cpSync(join(runtime,file),join(folder,file),{recursive:true});
  writeFileSync(join(folder,'ABRIR ENSAYO.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0node.exe" launch.cjs server.mjs\r\nif errorlevel 1 pause\r\n');
  writeFileSync(join(folder,'LEEME-ENSAYO.md'),'# Ensayo '+definition.runId+'\n\nCuatro fichas ficticias NUEVAS, cinco relaciones y una segunda fase de dos cambios únicamente sobre esas altas. No es una captura nueva del CRM. La simulación local ha pasado; HubSpot todavía no ha recibido estas operaciones.\n\nConfigura una contraseña local. Se mantiene separada la conexión de lectura de la credencial temporal de escritura. No pegues claves en chat ni en archivos. La clave temporal se introduce únicamente en Cambios, en el campo oculto de token de escritura. Antes del envío, verifica cuenta DEVELOPER_TEST 149623339, metadatos, workflows y el plan concreto. No aprobar todavía ningún envío.\n\nLa evidencia con las operaciones exactas está en plan-retorno-'+definition.runId+'.json, fuera de esta carpeta. No se copian registros previos, contraseñas ni claves desde la instalación de lectura.\n');
  console.log(JSON.stringify({prepared:true,liveApi:false,hubspotWrites:0,folder,runId:definition.runId,records:store.records().length,changes:store.changesCount,simulationPassed:check.passed,simulatedCreates:check.simulatedCreates,simulatedUpdates:check.simulatedUpdates,simulatedRelations:check.simulatedRelations,duplicateBlocked:check.duplicateBlocked}));
}catch(error){console.error(error instanceof AppError?error.message:error instanceof Error?error.message:'No se pudo preparar el ensayo.');process.exitCode=1;}finally{store.close();}
