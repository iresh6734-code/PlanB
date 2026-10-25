import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';

const root=resolve('.'),scratch=resolve('tests/.tmp');mkdirSync(scratch,{recursive:true});
const folder=mkdtempSync(join(scratch,'scale-http-'));
const {app,store}=await createBaseApp({dbPath:join(folder,'planb.sqlite'),root,staticDir:join(folder,'no-static')});
try{
  const snapshot=makeFixture(),template=snapshot.records.find(r=>r.entity==='contacts')!;
  for(let i=25;i<=9962;i++)snapshot.records.push({entity:'contacts',id:'scale-'+i,values:{...template.values,firstname:'Cliente '+i,email:'scale'+i+'@example.com'}});
  snapshot.manifest.expectedCounts.contacts=9962;
  store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});store.activate();
  const url=await app.listen({host:'127.0.0.1',port:0});
  const timings:number[]=[];
  for(let i=0;i<10;i++){
    const start=performance.now(),response=await fetch(url+'/api/v2/records/contacts?offset='+i*50);
    const page=await response.json() as {records:unknown[];total:number};
    if(!response.ok||page.records.length!==50||page.total!==9962)throw new Error('Paginación incorrecta.');
    timings.push(Math.round(performance.now()-start));
  }
  const start=performance.now(),search=await fetch(url+'/api/v2/records/contacts?q=Cliente%209962').then(r=>r.json()) as {records:unknown[]};
  const searchMs=Math.round(performance.now()-start);
  if(search.records.length!==1)throw new Error('Búsqueda incorrecta.');
  const sorted=[...timings].sort((a,b)=>a-b);
  const report={passed:Math.max(...timings,searchMs)<2000,records:10000,pageSize:50,encryptedSQLite:true,transport:'HTTP real en 127.0.0.1',requests:timings.length,
    pageMs:timings,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],searchMs,sqliteBytes:statSync(store.filename).size,
    environment:{node:process.version,platform:process.platform},limitations:['Medición local sin usuarios concurrentes; no es una garantía de rendimiento en otros equipos.']};
  writeFileSync(resolve('../../outputs/pruebas-rendimiento-v2.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await app.close();if(!folder.startsWith(scratch+requireSeparator()))throw new Error('Ruta temporal fuera del área de pruebas.');rmSync(folder,{recursive:true,force:true,maxRetries:3});}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
