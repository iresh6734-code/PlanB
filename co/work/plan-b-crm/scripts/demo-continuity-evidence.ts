import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../server/store.js';
import {makeFixture,makeDemoSpec} from '../shared/fixtures.js';
import {reviewContinuityEvidence} from '../server/continuity-evidence.js';

/** Two new memory-only fictional workspaces. No supplied path, existing database, network or model. */
export function demoContinuityEvidence(){
  const now=Date.now();return ['date-only','precise-instants'].map(kind=>{
    const store=new Store(':memory:');try{const snapshot=makeFixture();snapshot.capturedAt=new Date(now-45*60_000).toISOString();if(kind==='precise-instants'){snapshot.entities.find(e=>e.id==='tasks')!.fields.find(f=>f.key==='due_date')!.type='datetime';snapshot.records.filter(r=>r.entity==='tasks').forEach((r,i)=>{r.values.due_date=new Date(now+(i-5)*30*60_000).toISOString();});}store.importSnapshot(snapshot);store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date(now).toISOString(),prompt:'',approved:false});store.activate();const review=reviewContinuityEvidence(store,{spaceId:'fictional-demo101-'+kind,scenario:'crm-outage',outageDurationMs:8*3_600_000,objectives:{maxDataAgeMs:3_600_000,maxRecoveryMs:15*60_000,maxEvidenceAgeMs:86_400_000}},()=>now);return {fixture:kind,...review};}finally{store.close();}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2){console.error('Uso: tsx scripts/demo-continuity-evidence.ts. Solo datos ficticios nuevos en memoria.');process.exitCode=2;}
  else console.log(JSON.stringify(demoContinuityEvidence(),null,2));
}
