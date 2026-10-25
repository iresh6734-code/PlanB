import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, AppError } from './store.js';
import { Jobs } from './jobs.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { localKey, seal, open } from './crypto.js';
import type { ContinuityStatus, DrillReport } from '../shared/operations.js';
import type { ContinuityBundle } from '../shared/model.js';
import { planDrill } from './drill-plan.js';
import { assessDrill, summarizeCapture } from './assessment.js';

export class Continuity {
  jobs:Jobs;
  private analysis:{id:string;summary:ReturnType<typeof summarizeCapture>;issues:string[]}|null=null;
  constructor(public store:Store,private root:string,private runtime=false,private importer?:CaptureImporter){this.jobs=new Jobs(store);}
  status():ContinuityStatus {
    const captures=this.store.captures(),at=captures[0]?.at??null,age=at?Math.max(0,(Date.now()-Date.parse(at))/60_000):null;
    if(captures[0]&&this.analysis?.id!==captures[0].id){
      const snapshot=this.store.capture(captures[0].id);
      this.analysis={id:captures[0].id,summary:summarizeCapture(captures[0].id,snapshot),issues:planDrill(makeDemoSpec(snapshot),snapshot.records).issues};
    }
    if(!captures.length)this.analysis=null;
    const reports=this.store.get<DrillReport[]>('drills',[]),latestCapture=this.analysis?.summary??null;
    return {captures,jobs:this.jobs.list(),reports,latestCapture,readiness:assessDrill(latestCapture,this.analysis?.issues??[],reports),latestCaptureAt:at,ageMinutes:age,stale:age===null || age>75,
      session:this.store.get('continuitySession',null),schedule:this.store.get('schedule',{enabled:false,intervalMinutes:60,lastAttempt:null}),
      connected:!this.store.disconnected,protected:!!this.store.get('password',null),accountId:this.store.snapshot?.source.accountId??null,
      changes:this.store.changesCount,pendingChanges:this.store.pendingChangesCount,runtime:this.runtime,realDataEnabled:false};
  }
  private secretKey(){return localKey(dirname(this.store.filename));}
  connection() { const text=this.store.get<string|null>('hubspotConnection',null); return text?JSON.parse(open(text,this.secretKey())) as {token:string;accountId:string}:null; }
  saveConnection(token:string,accountId:string) {
    if(this.runtime)throw new AppError(403,'El paquete independiente no contiene conectores.');
    if(!/^\d+$/.test(accountId)||token.length<10)throw new AppError(422,'Revisa el ID de cuenta y la credencial.');
    if(this.store.snapshot?.source.kind==='hubspot'&&this.store.snapshot.source.accountId!==accountId)throw new AppError(409,'Esta instalación ya pertenece a otro portal. Usa una carpeta nueva por empresa.');
    this.store.set('hubspotConnection',seal(JSON.stringify({token,accountId}),this.secretKey()));
  }
  capture() {
    if(this.runtime || this.store.disconnected || this.status().session)throw new AppError(409,'Habilita los servicios fuera de una sesión de continuidad.');
    const connection=this.connection();if(!connection)throw new AppError(422,'Configura una cuenta de prueba de HubSpot.');
    return this.jobs.start('capture',async(progress,signal)=>{
      if(!this.importer)throw new AppError(503,'El importador no está incluido en este paquete.');
      const snapshot=await this.importer({...connection,confirmedTestAccount:true,progress,signal});
      signal.throwIfAborted();
      if(snapshot.records.length>10000)throw new AppError(413,'El piloto admite hasta 10.000 registros totales.');
      if(snapshot.source.accountId!==connection.accountId)throw new AppError(422,'La captura pertenece a otro portal.');
      const id=this.store.addCapture(snapshot);return {captureId:id,records:snapshot.records.length,links:snapshot.links.length};
    });
  }
  begin(captureId:string) {
    if(this.status().session)throw new AppError(409,'Ya hay una sesión de continuidad abierta. Continúa trabajando o ciérrala antes de abrir otra copia.');
    if(this.jobs.list().some(j=>['queued','running'].includes(j.status)))throw new AppError(409,'Espera a que termine el trabajo actual.');
    if(this.store.pendingChangesCount)throw new AppError(409,'Conserva y cierra los cambios pendientes antes de abrir otra captura.');
    const snapshot=this.store.capture(captureId);
    this.store.importSnapshot(snapshot,true);this.store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
    this.store.activate();const session={id:randomUUID(),captureId,startedAt:new Date().toISOString()};
    this.store.set('sessionId',session.id);this.store.set('sessionCapture',captureId);this.store.set('continuitySession',session);this.store.set('disconnected',true);
    return session;
  }
  end() {
    if(this.store.pendingChangesCount)throw new AppError(409,'Devuelve los cambios o conserva la sesión. Exportar no los marca como devueltos.');
    this.store.set('continuitySession',null);this.store.set('sessionCapture','');this.store.set('returnComplete',false);return {ended:true};
  }
  drill(captureId?:string) {
    const id=captureId ?? this.store.captures()[0]?.id;if(!id)throw new AppError(409,'Necesitas una captura verificada.');
    const snapshot=this.store.capture(id);
    const bundle:ContinuityBundle={format:'planb-continuity-v2',exportedAt:new Date().toISOString(),snapshot,spec:makeDemoSpec(snapshot),
      generation:{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:true},records:snapshot.records,changes:[]};
    return this.jobs.start('drill',async(progress,signal)=>{
      progress('Probando una copia aislada con red bloqueada',15);
      const built=existsSync(join(this.root,'drill.mjs'))?join(this.root,'drill.mjs'):join(this.root,'build','drill.mjs');
      const worker=existsSync(built)?[built]:['--import','tsx',join(this.root,'server','drill-worker.ts')];
      const guard=existsSync(join(this.root,'block-external.cjs'))?join(this.root,'block-external.cjs'):join(this.root,'scripts','block-external.cjs');
      const report=await new Promise<DrillReport>((resolve,reject)=>{
        const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/KEY|TOKEN|SECRET|NODE_OPTIONS|PLANB_/i.test(key)));
        const child=spawn(process.execPath,['--require',guard,...worker],{cwd:this.root,windowsHide:true,stdio:['pipe','pipe','pipe'],signal,env});
        let stdout='',stderr='';const timeout=setTimeout(()=>child.kill(),90_000);
        child.stdout.on('data',data=>{stdout+=data;if(stdout.length>1_000_000)child.kill();});
        child.stderr.on('data',data=>{stderr+=data;});
        child.on('error',reject);
        child.on('close',code=>{clearTimeout(timeout);if(code!==0)return reject(new AppError(500,'No se completó el proceso aislado. Revisa la instalación de Node.'));try{resolve(JSON.parse(stdout));}catch{reject(new AppError(500,'El simulacro no devolvió un informe válido.'));}});
        child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({bundle,captureId:id,scratch:join(dirname(this.store.filename),'scratch')}));
      });
      signal.throwIfAborted();this.store.set('drills',[report,...this.store.get<DrillReport[]>('drills',[])].slice(0,36));return report;
    });
  }
  configureSchedule(enabled:boolean){this.store.set('schedule',{...this.status().schedule,enabled,intervalMinutes:60});return this.status().schedule;}
  tick() {
    const status=this.status();if(this.runtime || !status.schedule.enabled || !status.connected || status.session || this.jobs.list().some(j=>['running','queued'].includes(j.status)))return;
    const now=new Date().toISOString();
    if(!status.schedule.lastAttempt || Date.now()-Date.parse(status.schedule.lastAttempt)>=3600_000){
      this.store.set('schedule',{...status.schedule,lastAttempt:now});
      try{this.capture();}catch(error){this.store.set('scheduleError',error instanceof Error?error.message:'No se pudo iniciar la captura.');}
      return;
    }
    const last=status.reports[0];if(status.captures.length && (!last || Date.now()-Date.parse(last.completedAt)>30*86400_000)){try{this.drill();}catch{}}
  }
}
export type CaptureImporter=(options:{token:string;accountId:string;confirmedTestAccount:boolean;progress?:(message:string,percent:number)=>void;signal?:AbortSignal})=>Promise<import('../shared/model.js').CrmSnapshot>;
