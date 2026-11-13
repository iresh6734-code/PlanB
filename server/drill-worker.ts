import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from './store.js';
import type { ContinuityBundle } from '../shared/model.js';
import type { DrillReport } from '../shared/operations.js';
import { planDrill } from './drill-plan.js';
import { TECHNICAL_DRILL_CHECKS } from '../shared/drill-evidence.js';
const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
const input=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {bundle:ContinuityBundle;captureId:string;scratch:string};
const started=Date.now(), checks:DrillReport['checks']=[];
const scratch=resolve(input.scratch);mkdirSync(scratch,{recursive:true});
const folder=mkdtempSync(join(scratch,'drill-'));
let store:Store|null=null;
function check(label:string,fn:()=>void){try{fn();checks.push({label,passed:true,detail:'Comprobado en una copia aislada.'});}catch(error){checks.push({label,passed:false,detail:error instanceof Error?error.message:'No superado.'});}}
try {
  let blocked=false;
  try{await fetch('https://example.com');}catch(error){blocked=String(error).includes('EXTERNAL_');}
  check(TECHNICAL_DRILL_CHECKS[0],()=>{if(!blocked)throw new Error('El arnés no confirmó el bloqueo de red.');});
  if(!blocked)throw new Error('No se ejecutará un simulacro sin aislamiento.');
  store=new Store(join(folder,'drill.sqlite'));store.restoreBundle(input.bundle);
  const plan=planDrill(store.spec!,store.records());
  let taskId='';
  check(TECHNICAL_DRILL_CHECKS[1],()=>{
    const target=plan.contact;if(!target)throw new Error(plan.issues.find(issue=>/cliente|teléfono/.test(issue))??'No hay un cliente compatible para probar.');
    const found=store!.page('contacts','',0,100).records.find(r=>r.id===target.id)??store!.record('contacts',target.id);
    if(!found)throw new Error('El cliente de ensayo no se encuentra en la copia.');
    store!.saveRecord('contacts',{[target.field]:target.value},target.id);
  });
  check(TECHNICAL_DRILL_CHECKS[2],()=>{
    const target=plan.deal;if(!target)throw new Error(plan.issues.find(issue=>/oportunidad/.test(issue))??'No hay una oportunidad compatible para avanzar.');
    store!.saveRecord('deals',{[target.field]:target.value},target.id);
  });
  check(TECHNICAL_DRILL_CHECKS[3],()=>{
    const target=plan.task;if(!target)throw new Error(plan.issues.find(issue=>/tarea/.test(issue))??'No hay una tarea compatible para probar.');
    const task=store!.saveRecord('tasks',target.values);taskId=task.id;
    store!.saveRecord('tasks',{[target.statusField]:target.done},task.id);
  });
  const expected=JSON.stringify(store.records()),expectedChanges=JSON.stringify(store.changes());
  store.close();store=new Store(join(folder,'drill.sqlite'));
  check(TECHNICAL_DRILL_CHECKS[4],()=>{
    if(!plan.contact||!plan.deal||!plan.task||!taskId||
      store!.record('contacts',plan.contact.id)?.values[plan.contact.field]!==plan.contact.value||
      store!.record('deals',plan.deal.id)?.values[plan.deal.field]!==plan.deal.value||
      store!.record('tasks',taskId)?.values[plan.task.statusField]!==plan.task.done||
      JSON.stringify(store!.records())!==expected||JSON.stringify(store!.changes())!==expectedChanges)throw new Error('No se conservaron todas las operaciones, etapas, estados, relaciones e historial.');
  });
}catch(error){checks.push({label:'Preparación del simulacro',passed:false,detail:error instanceof Error?error.message:'Error del entorno.'});}
finally{store?.close();const absolute=resolve(folder);if(!absolute.startsWith(scratch+requireSeparator()))throw new Error('Ruta de limpieza no válida.');rmSync(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
const report:DrillReport={id:randomUUID(),captureId:input.captureId,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),
  passed:checks.length===5 && checks.every(c=>c.passed),isolated:true,checks,durationMs:Date.now()-started,
  environment:input.bundle.snapshot.source.isTestData?'test':'production',
  dataSource:input.bundle.snapshot.source.kind==='fixture'?'Conjunto ficticio incluido':input.bundle.snapshot.source.isTestData?'Cuenta HubSpot de prueba':'Copia local de HubSpot · producción',
  limitations:['Simulacro técnico, no certificación ni SLA.','Ejercita un cliente, una oportunidad y una tarea; no prueba todos los procesos de la empresa.','No acredita devolución real a HubSpot.','No modifica los datos operativos.']};
process.stdout.write(JSON.stringify(report));
