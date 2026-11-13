import {createHash} from 'node:crypto';
import {z} from 'zod';
import {Store} from './store.js';
import {bundleRevision} from './recovery-copy.js';
import {BundleSchema,SnapshotSchema,reconcile,type ContinuityBundle} from '../shared/model.js';
import {buildResponseQueue,type ResponseQueueItem} from '../shared/response-queue.js';
import {evaluateContinuityScenario,type ContinuityLabInput} from '../shared/continuity-lab.js';
import {TECHNICAL_DRILL_CHECKS} from '../shared/drill-evidence.js';
import type {ContinuityEvidenceFacts,ContinuityEvidenceOptions,ContinuityEvidenceReview} from '../shared/continuity-evidence.js';

const DAY=86_400_000,MAX_TIME=Date.parse('9999-12-01T00:00:00Z'),MAX_BYTES=32*1024*1024,MAX_META_BYTES=1024*1024;
const optionsSchema=z.object({spaceId:z.string().min(1).max(200).refine(v=>v.trim()===v),scenario:z.enum(['crm-outage','device-loss']),outageDurationMs:z.number().int().min(1).max(30*DAY),objectives:z.object({maxDataAgeMs:z.number().int().min(1).max(30*DAY),maxRecoveryMs:z.number().int().min(1).max(30*DAY),maxEvidenceAgeMs:z.number().int().min(1).max(90*DAY)}).strict(),expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
const limitations=[
  'Lee una revisión local y verifica estructura, conciliación e historial en memoria; no consulta o acredita el estado actual del CRM.',
  'La duración de una suite técnica no mide recuperación hasta un flujo utilizable. Los informes existentes no se convierten en RTO.',
  'Un registro de exportación o custodia declarada no verifica bytes presentes, contraseña, disponibilidad de otro equipo o restauración allí.',
  'No modifica la Store de origen, ejecuta ensayos, abre bases de disco o llama proveedores. El espacio y sus permisos deben ligarlos el adaptador autenticado.',
  'Repite lecturas síncronas para detectar cambios observados; no bloquea escritores privilegiados ni garantiza una instantánea atómica del sistema de archivos.',
];
type Issue=Extract<ContinuityEvidenceReview,{available:false}>['issue'];
class Refused extends Error{constructor(public issue:Issue){super(issue);}}
function refuse(issue:Issue):never{throw new Refused(issue);}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));return value;}
function encoded(value:unknown,limit:number){const text=JSON.stringify(value);if(text===undefined||Buffer.byteLength(text)>limit)refuse('EVIDENCE_LIMIT');return text;}
const instant=(value:unknown):number|null=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;const n=Date.parse(value);return Number.isSafeInteger(n)&&n>=0&&n<=MAX_TIME&&new Date(n).toISOString().slice(0,19)===value.slice(0,19)?n:null;};

/** Only these non-secret metadata keys are read. No connection, password, token or encryption key access. */
type Reader=Pick<Store,'ready'|'bundleOrNull'|'capture'|'get'|'recoveryIntegrity'>;
function read(reader:Reader){
  if(reader.recoveryIntegrity().state==='invalid')refuse('RECOVERY_STATE_INVALID');
  if(!reader.ready)refuse('NO_ACTIVE_COPY');
  const bundle=reader.bundleOrNull();if(!bundle)refuse('NO_ACTIVE_COPY');
  const bundleText=encoded(bundle,MAX_BYTES),copy=reader.get<unknown>('recoveryCopy',null),drills=reader.get<unknown>('drills',[]),metaText=encoded({copy,drills},MAX_META_BYTES);
  const captureKey=bundle.snapshot.id+':'+bundle.snapshot.capturedAt;
  const archive=reader.capture(captureKey),archiveText=encoded(archive,MAX_BYTES);
  // Detach getter-returned objects. Never publish references that a later read could mutate.
  const fixed=JSON.parse(bundleText) as ContinuityBundle,fixedArchive=JSON.parse(archiveText),meta=JSON.parse(metaText) as {copy:unknown;drills:unknown};
  const revision=hash(JSON.stringify(canonical({bundle:bundleRevision(fixed),archive:fixedArchive,meta})));
  if(reader.recoveryIntegrity().state==='invalid')refuse('RECOVERY_STATE_INVALID');
  return {bundle:fixed,archive:fixedArchive,meta,revision,captureKey};
}
function workload(bundle:ContinuityBundle,at:number,scope:ContinuityLabInput['scope']){
  const rows=bundle.records.filter(r=>r.entity==='tasks'),full=buildResponseQueue({spec:bundle.spec,records:bundle.records,evaluatedAt:at,horizonHours:1,limit:200});
  const items:ResponseQueueItem[]=rows.length<=200?full.items:rows.flatMap((_,i)=>i%200?[]:buildResponseQueue({spec:bundle.spec,records:rows.slice(i,i+200),evaluatedAt:at,horizonHours:1,limit:200}).items);
  const byId=new Map(items.map(i=>[i.id,i])),summary=full.summary;
  const facts:ContinuityEvidenceFacts['workload']={total:rows.length,completed:summary.completedTasks,knownOpen:summary.knownOpenTasks,unknownStatus:summary.unknownStatusTasks,dateOnly:items.filter(i=>i.due.kind==='date').length,invalidDates:items.filter(i=>i.due.kind==='invalid').length,missingDates:items.filter(i=>i.due.kind==='missing').length,exactInstants:items.filter(i=>i.due.kind==='instant').length,expressible:false};
  const taskEntity=bundle.spec.entities.find(e=>e.id==='tasks')!,dueKey=bundle.spec.roles?.dueDate??(taskEntity.fields.some(f=>f.key==='hs_timestamp')?'hs_timestamp':'due_date');
  facts.expressible=!facts.unknownStatus&&!facts.dateOnly&&!facts.invalidDates&&(!facts.knownOpen||taskEntity.fields.some(f=>f.key===dueKey&&['date','datetime'].includes(f.type)));
  // No conversion of date-only to midnight, no omitted rows or guesses for unknown states.
  const value:ContinuityLabInput['workload']=facts.expressible?{scope:{...scope},tasks:rows.map(row=>{const item=byId.get(row.id);return {id:'task:'+hash(row.id),status:item?'open' as const:'done' as const,dueAt:item?.due.at??null};})}:null;
  return {facts,value};
}
const drillSchema=z.object({id:z.string().min(1).max(200),captureId:z.string(),startedAt:z.string(),completedAt:z.string(),passed:z.boolean(),isolated:z.boolean(),durationMs:z.number().int().nonnegative(),checks:z.array(z.object({label:z.string(),passed:z.boolean(),detail:z.string()})).max(20),environment:z.enum(['test','production']).optional()});
function technical(raw:unknown,captureKey:string,isTestData:boolean,at:number):ContinuityEvidenceFacts['technicalReports']{
  const result:ContinuityEvidenceFacts['technicalReports']={stored:Array.isArray(raw)?raw.length:0,matchingCaptureId:0,declaredPassed:0,invalid:0,latestCompletedAt:null,binding:'capture-id-only',recoveryTime:'not-measured'};
  if(!Array.isArray(raw)||raw.length>36){result.invalid=1;return result;}
  const ids=new Set<string>();
  for(const value of raw){
    const parsed=drillSchema.safeParse(value);
    if(!parsed.success){result.invalid++;continue;}
    const d=parsed.data,start=instant(d.startedAt),end=instant(d.completedAt);
    if(ids.has(d.id)||start===null||end===null||start>end||end>at||d.environment!==undefined&&d.environment!==(isTestData?'test':'production')){
      result.invalid++;
      continue;
    }
    ids.add(d.id);
    if(d.captureId!==captureKey)continue;
    result.matchingCaptureId++;
    if(d.passed&&d.isolated&&d.checks.length===TECHNICAL_DRILL_CHECKS.length&&
       TECHNICAL_DRILL_CHECKS.every(label=>d.checks.some(check=>check.label===label&&check.passed)))result.declaredPassed++;
    if(!result.latestCompletedAt||end>instant(result.latestCompletedAt)!)result.latestCompletedAt=d.completedAt;
  }
  return result;
}

/** Service layer only; no route registration or UI integration. Existing technical/export metadata cannot establish readiness. */
export function reviewContinuityEvidence(reader:Reader,options:ContinuityEvidenceOptions,clock:()=>number=Date.now):ContinuityEvidenceReview{
  const empty=(issue:Issue):ContinuityEvidenceReview=>({format:'planb-continuity-evidence-v1',available:false,issue,context:null,input:null,result:null,facts:null,limitations:[...limitations]});
  const parsed=optionsSchema.safeParse(options);if(!parsed.success)return empty('INVALID_OPTIONS');
  try{
    const start=clock();if(!Number.isSafeInteger(start)||start<0||start>MAX_TIME)return empty('INVALID_OPTIONS');
    const first=read(reader),contextRevision=hash(JSON.stringify([parsed.data.spaceId,first.revision]));if(parsed.data.expectedRevision&&contextRevision!==parsed.data.expectedRevision)refuse('SOURCE_CHANGED');
    const valid=BundleSchema.safeParse(first.bundle),archive=SnapshotSchema.safeParse(first.archive);if(!valid.success||!archive.success||!reconcile(archive.data).complete)refuse('INVALID_LOCAL_COPY');
    if(JSON.stringify(canonical(valid.data.snapshot))!==JSON.stringify(canonical(archive.data)))refuse('ARCHIVE_MISMATCH');
    // Exercise the existing relational/replay contract in a disposable memory-only Store.
    const probe=new Store(':memory:');try{probe.restoreBundle(valid.data);}catch{refuse('INVALID_LOCAL_COPY');}finally{probe.close();}
    const at=clock();if(!Number.isSafeInteger(at)||at<start||at>MAX_TIME)refuse('SOURCE_CHANGED');
    const captured=instant(valid.data.snapshot.capturedAt);if(captured===null)refuse('INVALID_LOCAL_COPY');if(captured>at)refuse('FUTURE_CAPTURE');
    const s=valid.data.snapshot.source,sourceKey='source:'+hash(JSON.stringify([s.kind,s.accountId,s.isTestData,s.environment??null])),captureId='capture:'+hash(JSON.stringify(canonical(valid.data.snapshot))),scope={spaceId:parsed.data.spaceId,sourceKey,captureId};
    const tasks=workload(valid.data,at,scope),metaCopy=first.meta.copy;
    const copy=metaCopy&&typeof metaCopy==='object'&&!Array.isArray(metaCopy)?metaCopy as Record<string,unknown>:null,exported=instant(copy?.exportedAt),confirmed=instant(copy?.confirmedAt);
    const same=!!copy&&exported!==null&&exported>=captured&&exported<=at&&copy.revision===bundleRevision(valid.data)&&copy.captureId===first.captureKey;
    const facts:ContinuityEvidenceFacts={snapshot:{capturedAt:valid.data.snapshot.capturedAt,locallyCheckedAt:new Date(at).toISOString(),validation:'local-schema-reconciliation',isTestData:valid.data.snapshot.source.isTestData},workload:tasks.facts,technicalReports:technical(first.meta.drills,first.captureKey,valid.data.snapshot.source.isTestData,at),export:{present:metaCopy!==null,matchesActiveRevision:metaCopy===null?null:same,custodyDeclared:same&&confirmed!==null&&confirmed>=exported!&&confirmed<=at,artifactBytes:'not-examined',otherDevice:'not-demonstrated'}};
    const input:ContinuityLabInput={scope,evaluatedAt:at,scenario:parsed.data.scenario,outageDurationMs:parsed.data.outageDurationMs,objectives:{...parsed.data.objectives},snapshot:{scope:{...scope},capturedAt:captured,verifiedAt:at},localRuntime:'unknown',recoveryKit:'unknown',backup:null,localDrill:null,restoreDrill:null,workload:tasks.value};
    const result=evaluateContinuityScenario(input),last=read(reader);if(first.revision!==last.revision)refuse('SOURCE_CHANGED');
    return {format:'planb-continuity-evidence-v1',available:true,issue:null,context:{revision:contextRevision,bundleRevision:bundleRevision(valid.data),view:'active-local-records',...scope},input,result,facts,limitations:[...limitations,...(!tasks.facts.expressible?['El inventario no puede expresarse sin perder estados o precisión de fecha: no se calcula exposición como si fuese completo.']:[])]};
  }catch(error){return empty(error instanceof Refused?error.issue:'SOURCE_UNREADABLE');}
}
