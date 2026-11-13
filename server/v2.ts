import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Store, AppError } from './store.js';
import { EntityNameSchema } from '../shared/model.js';
import { Continuity, type CaptureImporter } from './continuity.js';
import { Recovery, simulatedRemote, type Remote } from './recovery.js';
import { decodePortable, encodePortable } from './crypto.js';
import { runtimeZip } from './exporter.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { drillReportHtml } from './drill-report.js';
import { summarizeCapture } from './assessment.js';
import { ConnectionSchema, type inspectConnection } from './connection.js';
import { verifyManualRecovery } from './manual-recovery.js';
import { APP_VERSION, RUNTIME_ZIP } from '../shared/version.js';
import { rememberExport, confirmRecoveryCopy, bundleRevision } from './recovery-copy.js';
import { registerCaptureComparison } from './capture-comparison.js';

export interface ExternalServices { capture:CaptureImporter; remote:(token:string,accountId:string,spec:import('../shared/model.js').AppSpec,fetcher?:typeof fetch,readOnly?:boolean)=>Remote; inspect?:typeof inspectConnection; }
export function registerV2(app:FastifyInstance,store:Store,root:string,runtime=false,external?:ExternalServices) {
  registerCaptureComparison(app,store);
  const continuity=new Continuity(store,root,runtime,external?.capture),recovery=new Recovery(store);
  const remoteSchema=z.object({simulation:z.boolean().default(false),token:z.string().max(4096).optional()});
  function remote(raw:unknown){
    store.assertRecoveryIntegrity();
    if(runtime)throw new AppError(403,'La devolución se prepara en el generador, no en el paquete independiente.');
    const options=remoteSchema.parse(raw);
    if(options.simulation)return simulatedRemote(store);
    if(store.snapshot?.source.isTestData===false)throw new AppError(403,'Las escrituras en producción están bloqueadas. Usa la comprobación manual.');
    const connection=continuity.connection();
    if(!connection||!store.spec)throw new AppError(422,'Configura el portal de prueba antes de devolver cambios.');
    if(!external)throw new AppError(503,'El conector no está disponible en este paquete.');
    return external.remote(options.token||connection.token,connection.accountId,store.spec);
  }
  app.get('/api/v2/continuity',async()=>continuity.status());
  app.get('/api/v2/candidate',async()=>({candidate:store.candidate}));
  app.post('/api/v2/candidate/discard',async()=>{store.set('candidate',null);return {discarded:true};});
  app.get('/api/v2/records/:entity',async request=>{
    const params=z.object({entity:EntityNameSchema}).parse(request.params);
    const query=z.object({q:z.string().max(200).default(''),offset:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(100).default(50),pipeline:z.string().default('')}).parse(request.query);
    return store.page(params.entity,query.q,query.offset,query.limit,query.pipeline);
  });
  app.get('/api/v2/records/:entity/:id',async request=>{
    const {entity,id}=z.object({entity:EntityNameSchema,id:z.string()}).parse(request.params);
    const record=store.record(entity,id);if(!record)throw new AppError(404,'Registro no encontrado.');return {record};
  });
  if(!runtime)app.post('/api/v2/connection',async request=>{
    const body=ConnectionSchema.parse(request.body);
    if(!store.get('password',null))throw new AppError(409,'Configura la contraseña local antes de guardar credenciales.');
    if(!external?.inspect)throw new AppError(503,'El conector no está disponible.');
    const verified=await external.inspect(body);
    const {token,accountId,...details}=body;
    continuity.saveConnection(token,accountId,details,verified);return {saved:true,...verified};
  });
  if(!runtime)app.post('/api/v2/connection/inspect',async request=>{
    if(!store.get('password',null))throw new AppError(409,'Protege primero la instalación.');
    if(!external?.inspect)throw new AppError(503,'El conector no está disponible.');
    return external.inspect(ConnectionSchema.parse(request.body));
  });
  if(!runtime)app.post('/api/v2/captures',async()=>continuity.capture());
  if(!runtime)app.post('/api/v2/schedule',async request=>{
    const {enabled}=z.object({enabled:z.boolean()}).strict().parse(request.body);return continuity.configureSchedule(enabled);
  });
  app.post('/api/v2/jobs/:id/cancel',async request=>continuity.jobs.cancel(z.object({id:z.string()}).parse(request.params).id));
  app.post('/api/v2/drills',async request=>{
    const {captureId}=z.object({captureId:z.string().optional()}).strict().parse(request.body??{});return continuity.drill(captureId);
  });
  app.get('/api/v2/drills/:id/report',async(request,reply)=>{
    const {id}=z.object({id:z.string()}).parse(request.params);
    const {format}=z.object({format:z.enum(['json','html']).default('json')}).parse(request.query);
    const report=continuity.status().reports.find(r=>r.id===id);if(!report)throw new AppError(404,'Informe no encontrado.');
    if(format==='html'){
      const present=store.captures().some(capture=>capture.id===report.captureId);
      const summary=present?summarizeCapture(report.captureId,store.capture(report.captureId)):null;
      return reply.type('text/html; charset=utf-8').header('Content-Disposition','attachment; filename="plan-b-informe-continuidad.html"').send(drillReportHtml(report,summary));
    }
    return reply.header('Content-Disposition','attachment; filename="plan-b-simulacro.json"').send(report);
  });
  app.post('/api/v2/session/begin',async request=>{
    const {captureId}=z.object({captureId:z.string()}).strict().parse(request.body);return continuity.begin(captureId);
  });
  app.post('/api/v2/session/end',async()=>continuity.end());
  app.post('/api/v2/services',async request=>{
    const {enabled}=z.object({enabled:z.boolean()}).strict().parse(request.body);
    if(runtime&&enabled)throw new AppError(403,'Este paquete es independiente.');
    if(continuity.status().session&&enabled)throw new AppError(409,'Cierra la sesión de continuidad para habilitar importación e IA. La devolución usa su propio recorrido revisado.');
    store.set('disconnected',!enabled);return {connected:enabled};
  });
  app.get('/api/v2/changes',async()=>{const recoveryState=store.recoveryState();return {changes:store.changes(),plan:recoveryState.plan,recoveryIntegrity:recoveryState.integrity,revision:recovery.revision(),pendingChanges:store.pendingChangesCount,watermark:store.get('returnWatermark:hubspot',0),manualReport:store.get('manualRecoveryReport',null)};});
  if(!runtime)app.post('/api/v3/manual-recovery/verify',async request=>{
    store.assertRecoveryIntegrity();
    const body=z.object({revision:z.string().min(1),mapping:z.array(z.object({entity:EntityNameSchema,localId:z.string(),remoteId:z.string().regex(/^\d+$/)}).strict()).max(10000),reviewed:z.literal(true)}).strict().parse(request.body);
    const connection=continuity.connection();
    if(!connection||connection.mode!=='production_readonly'||!store.spec||store.get<{mode?:string}|null>('connectionPublic',null)?.mode!=='production_readonly')throw new AppError(403,'Autoriza primero la conexión de producción de esta instalación.');
    if(continuity.jobs.list().some(j=>['running','queued'].includes(j.status)))throw new AppError(409,'Espera a que termine el trabajo actual.');
    store.set('returnBusy',true);
    try{if(!external)throw new AppError(503,'Conector no disponible.');return await verifyManualRecovery(store,external.remote(connection.token,connection.accountId,store.spec,fetch,true),body);}finally{store.set('returnBusy',false);}
  });
  if(!runtime) {
  app.post('/api/v2/return/preview',async request=>recovery.preview(remote(request.body)));
  app.post('/api/v2/return/refresh',async request=>{
    const body=z.object({planId:z.string(),simulation:z.boolean().default(false),token:z.string().max(4096).optional()}).strict().parse(request.body);
    return recovery.refresh(body.planId,remote(body));
  });
  app.post('/api/v2/return/decisions',async request=>{
    const {planId,decisions}=z.object({planId:z.string(),decisions:z.array(z.object({operationId:z.string(),field:z.string(),decision:z.enum(['local','remote'])})).max(1000)}).strict().parse(request.body);
    return recovery.decide(planId,decisions);
  });
  app.post('/api/v2/return/approve',async request=>{
    const {planId,reviewedWorkflows}=z.object({planId:z.string(),reviewedWorkflows:z.literal(true)}).strict().parse(request.body);
    return recovery.approve(planId);
  });
  app.post('/api/v2/return/apply',async request=>{
    const body=z.object({planId:z.string(),simulation:z.boolean().default(false),token:z.string().max(4096).optional(),approved:z.literal(true)}).strict().parse(request.body);
    const target=remote(body);
    return continuity.jobs.start('return',async(progress,signal)=>{
      store.set('returnBusy',true);
      try{return await recovery.apply(body.planId,target,signal,progress);}finally{store.set('returnBusy',false);}
    });
  });
  app.post('/api/v2/return/verify-uncertain',async request=>{
    const body=z.object({planId:z.string(),operationId:z.string(),remoteId:z.string().min(1),simulation:z.boolean().default(false),token:z.string().max(4096).optional()}).strict().parse(request.body);
    return recovery.resolveUncertain(body.planId,body.operationId,body.remoteId,remote(body));
  });
  }
  app.post('/api/v2/export/encrypted',async(request,reply)=>{
    const {password,revision}=z.object({password:z.string().min(12).max(200),revision:z.string().optional()}).strict().parse(request.body);
    const bundle=store.bundle();if(revision&&revision!==bundleRevision(bundle))throw new AppError(409,'El espacio cambió. Revisa de nuevo el contenido de la exportación.');
    const encrypted=encodePortable(bundle,password);rememberExport(store,bundle,encrypted);
    return reply.type('application/json').header('Content-Disposition','attachment; filename="plan-b-copia-cifrada.json"').send(encrypted);
  });
  app.post('/api/v2/export/package',async(request,reply)=>{
    const {password,revision}=z.object({password:z.string().min(12).max(200),revision:z.string().optional()}).strict().parse(request.body);
    const bundle=store.bundle();if(revision&&revision!==bundleRevision(bundle))throw new AppError(409,'El espacio cambió. Revisa de nuevo el contenido de la exportación.');
    const zip=await runtimeZip(bundle,root,password);rememberExport(store,bundle,zip);
    return reply.type('application/zip').header('Content-Disposition','attachment; filename="'+RUNTIME_ZIP+'"').send(zip);
  });
  app.post('/api/v2/restore',async request=>{
    if(continuity.jobs.list().some(j=>['running','queued'].includes(j.status)))throw new AppError(409,'Espera a que termine o cancela el trabajo actual antes de restaurar.');
    const {file,password,replace}=z.object({file:z.string().max(40_000_000),password:z.string().max(200).default(''),replace:z.boolean().default(false)}).strict().parse(request.body);
    if(store.changesCount&&!replace)throw new AppError(409,'Exporta tus cambios y confirma la sustitución antes de restaurar.');
    let bundle:unknown;try{const raw=JSON.parse(file);bundle=raw.format==='planb-encrypted-v2'?decodePortable(file,password):raw;}catch(error){throw new AppError(422,error instanceof Error?error.message:'Archivo inválido.');}
    if((bundle as any)?.snapshot?.source?.isTestData===false&&(!password||JSON.parse(file).format!=='planb-encrypted-v2'||!store.get('password',null)))throw new AppError(403,'Los datos reales requieren una copia cifrada y una contraseña local configurada antes de restaurar.');
    // Validate in a disposable store before touching the active database.
    const probe=new Store(':memory:');try{probe.restoreBundle(bundle);}finally{probe.close();}
    const old=store.bundleOrNull();
    if(old)store.set('lastRestoreArchive',old);
    store.restoreBundle(bundle);store.set('recoveryCopy',{exportedAt:(bundle as any).exportedAt,restoredAt:new Date().toISOString()});return {restored:true};
  });
  app.post('/api/v3/recovery-copy/confirm',async request=>{
    const {revision}=z.object({storedSeparately:z.literal(true),revision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(request.body);
    return confirmRecoveryCopy(store,revision);
  });
  app.get('/api/v3/diagnostics',async(_request,reply)=>{
    const status=continuity.status();
    return reply.header('Content-Disposition','attachment; filename="plan-b-diagnostico.json"').send({at:new Date().toISOString(),protected:status.protected,connected:status.connected,mode:status.connection?.mode??'test',records:status.latestCapture?.records??0,captures:status.captures.length,pendingChanges:status.pendingChanges,readiness:status.readiness.status,jobs:status.jobs.slice(0,10).map(j=>({kind:j.kind,status:j.status})),limits:{records:10000},recoveryCopy:status.recoveryCopy});
  });
  app.post('/api/v2/history/prepare',async request=>{
    const {captureId}=z.object({captureId:z.string()}).strict().parse(request.body);
    const snapshot=store.capture(captureId);store.importSnapshot(snapshot,false);
    store.saveGeneration(makeDemoSpec(snapshot),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false});
    return {prepared:true};
  });
  const timer=setInterval(()=>continuity.tick(),60_000);timer.unref();
  app.addHook('onClose',async()=>{clearInterval(timer);await continuity.jobs.stop();});
  let closed=false;app.addHook('onClose',async()=>{closed=true;});setImmediate(()=>{if(!closed)continuity.tick();});
  return {continuity,recovery};
}
