import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { localKey, open } from '../server/crypto.js';
import { SnapshotSchema } from '../shared/model.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { checkFixture, type ExpectedFixture } from './check-fixture.js';
import type { DrillReport } from '../shared/operations.js';

const root=resolve('.'),folder=resolve(process.env.PLANB_DATA_DIR||join(root,'data','hubspot-v2'));
const output=resolve(process.env.PLANB_EVIDENCE_DIR||'../../outputs');
if(!existsSync(join(folder,'planb.sqlite'))||!existsSync(join(folder,'.planb-key'))) {
  throw new Error('Falta una instalación local de ensayo en este equipo. Indica su carpeta con PLANB_DATA_DIR. No accedas al ordenador corporativo original; este script no crea otra base ni solicita credenciales.');
}
const expected=JSON.parse(readFileSync(join(root,'scripts','hubspot-fixture.expected.json'),'utf8')) as ExpectedFixture;
const key=localKey(folder),db=new DatabaseSync(join(folder,'planb.sqlite'),{readOnly:true});
let capture:{id:string;at:string;payload:string}|undefined;
try {
  const selected=process.env.PLANB_CAPTURE_ID;
  const rows=(selected?db.prepare('SELECT id,at,payload FROM captures WHERE id=?').all(selected):db.prepare('SELECT id,at,payload FROM captures ORDER BY at DESC,rowid DESC').all()) as unknown as {id:string;at:string;payload:string}[];
  capture=rows.find(row=>{
    const s=SnapshotSchema.parse(JSON.parse(open(row.payload,key)));
    return s.source.kind==='hubspot'&&s.source.isTestData&&s.source.accountId===expected.account.verifiedPortalId;
  });
} finally { db.close(); }
if(!capture)throw new Error('No se encontró una captura guardada del portal de ensayo esperado en esta instalación. No se ha modificado la base.');
const snapshot=SnapshotSchema.parse(JSON.parse(open(capture.payload,key))),verification=checkFixture(snapshot,expected);
let drill:DrillReport|null=null;
if(verification.passed) {
  const worker=join(root,'build','drill.mjs'),guard=join(root,'scripts','block-external.cjs');
  if(!existsSync(worker))throw new Error('Ejecuta npm run build antes de comprobar el simulacro.');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/KEY|TOKEN|SECRET|NODE_OPTIONS|PLANB_/i.test(name)));
  const bundle={format:snapshot.version===3?'planb-continuity-v3':'planb-continuity-v2',exportedAt:new Date().toISOString(),snapshot,spec:makeDemoSpec(snapshot),
    generation:{provider:'demo',model:null,prompt:'',generatedAt:new Date().toISOString(),approved:true},records:snapshot.records,changes:[]};
  const child=spawnSync(process.execPath,['--require',guard,worker],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:90000,
    input:JSON.stringify({bundle,captureId:capture.id,scratch:join(root,'tests','.tmp','configured-capture')}),maxBuffer:1_000_000});
  if(child.status!==0)throw new Error('El proceso aislado no terminó correctamente. La instalación consultada no se ha modificado.');
  drill=JSON.parse(child.stdout) as DrillReport;
}
const evidence={at:new Date().toISOString(),captureId:capture.id,capturedAt:capture.at,
  accountId:snapshot.source.accountId,savedCapture:true,liveApi:false,operationalDatabaseReadOnly:true,hubspotWrites:false,
  ...verification,drill,
  limitations:['Verifica una captura guardada, no vuelve a consultar HubSpot.','No contiene credenciales ni valores de fichas.',
    'Los campos de tarea no capturados y los recordatorios requieren evidencia de interfaz.','No acredita devolución real ni generación IA.']};
// Overall acceptance requires both the expected fixture and the isolated drill.
evidence.passed=verification.passed&&!!drill?.passed;
mkdirSync(output,{recursive:true});
writeFileSync(join(output,'pruebas-hubspot-conjunto-v2.1.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({passed:evidence.passed,captureId:capture.id,matchedRecords:verification.matched.length,checks:verification.checks.length,drillPassed:drill?.passed??null}));
if(!evidence.passed)process.exitCode=1;
