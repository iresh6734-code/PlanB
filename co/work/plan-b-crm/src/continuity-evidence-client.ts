import {z} from 'zod';
import {DEFAULT_CONTINUITY_EVIDENCE_QUERY,type ContinuityEvidenceQuery,type ContinuityEvidenceApiResponse} from '../shared/continuity-evidence-api.js';
// Match the existing app's CSP-safe Zod configuration, including the isolated demonstration.
z.config({jitless:true});
const count=z.number().int().min(0).max(10_000),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().max(2000),when=z.string().datetime(),time=z.number().int().min(0).max(Date.parse('9999-12-31T23:59:59.999Z'));
const scope=z.object({spaceId:z.string().max(200),sourceKey:z.string().regex(/^source:[a-f0-9]{64}$/),captureId:z.string().regex(/^capture:[a-f0-9]{64}$/)}).strict();
const query=z.object({scenario:z.enum(['crm-outage','device-loss']),outageMinutes:z.number().int().min(1).max(43200),maxDataAgeMinutes:z.number().int().min(1).max(43200),maxRecoveryMinutes:z.number().int().min(1).max(43200),maxEvidenceAgeMinutes:z.number().int().min(1).max(129600)}).strict();
const wire=z.object({
  format:z.literal('planb-continuity-evidence-api-v1'),available:z.literal(true),issue:z.null(),error:z.null(),
  context:scope.extend({revision:hash,bundleRevision:hash,view:z.literal('active-local-records')}).strict(),parameters:query,
  // v1 never carries the recovery evidence required for a ready verdict.
  evaluation:z.object({scope,evaluatedAt:time,scenario:z.enum(['crm-outage','device-loss']),status:z.enum(['at-risk','unproven','blocked']),snapshotAgeMs:time.nullable(),measuredRecoveryMs:time.nullable(),
    exposure:z.object({overdueTasks:count,tasksDueDuringOutage:count,tasksWithoutDate:count,openTasks:count}).strict().nullable(),
    checks:z.array(z.object({code:z.string().min(1).max(80),category:z.enum(['blocker','evidence','objective']),status:z.enum(['pass','fail','unknown']),detail:text,nextAction:text.nullable()}).strict()).min(1).max(16),nextActions:z.array(text).max(32),limitations:z.array(text).max(32),
  }).strict(),
  facts:z.object({
    snapshot:z.object({capturedAt:when,locallyCheckedAt:when,validation:z.literal('local-schema-reconciliation'),isTestData:z.boolean()}).strict(),
    workload:z.object({total:count,completed:count,knownOpen:count,unknownStatus:count,dateOnly:count,invalidDates:count,missingDates:count,exactInstants:count,expressible:z.boolean()}).strict(),
    technicalReports:z.object({stored:z.number().int().min(0).max(1_000_000),matchingCaptureId:z.number().int().min(0).max(36),declaredPassed:z.number().int().min(0).max(36),invalid:z.number().int().min(0).max(1_000_000),latestCompletedAt:when.nullable(),binding:z.literal('capture-id-only'),recoveryTime:z.literal('not-measured')}).strict(),
    export:z.object({present:z.boolean(),matchesActiveRevision:z.boolean().nullable(),custodyDeclared:z.boolean(),artifactBytes:z.literal('not-examined'),otherDevice:z.literal('not-demonstrated')}).strict(),
  }).strict(),limitations:z.array(text).max(32),
}).strict();
export type EvidenceViewData=Extract<ContinuityEvidenceApiResponse,{available:true}>;
export class EvidenceReadError extends Error{
  constructor(public code:'locked'|'unsupported'|'stale'|'invalid'|'unavailable'|'protocol'|'network',message:string){super(message);this.name='EvidenceReadError';}
}
const protocol=()=>new EvidenceReadError('protocol','La respuesta no permite comprobar esta consulta. Actualiza la aplicación y vuelve a intentarlo.');
const abort=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Consulta cancelada.','AbortError');};
function checked(value:unknown,selection:ContinuityEvidenceQuery,revision?:string):EvidenceViewData{
  const parsed=wire.safeParse(value);if(!parsed.success)throw protocol();const d=parsed.data,w=d.facts.workload,e=d.evaluation.exposure;
  if(Object.keys(selection).some(k=>d.parameters[k as keyof ContinuityEvidenceQuery]!==selection[k as keyof ContinuityEvidenceQuery])||d.evaluation.scenario!==selection.scenario||revision&&revision!==d.context.revision)throw protocol();
  if(!/^local:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(d.context.spaceId)||['spaceId','sourceKey','captureId'].some(k=>d.evaluation.scope[k as keyof typeof d.evaluation.scope]!==d.context[k as keyof typeof d.evaluation.scope]))throw protocol();
  if(Date.parse(d.facts.snapshot.locallyCheckedAt)!==d.evaluation.evaluatedAt||Date.parse(d.facts.snapshot.capturedAt)>d.evaluation.evaluatedAt)throw protocol();
  if(w.total!==w.completed+w.knownOpen+w.unknownStatus||w.dateOnly+w.invalidDates+w.missingDates+w.exactInstants!==w.knownOpen+w.unknownStatus||w.expressible!==(e!==null))throw protocol();
  if(e&&(w.unknownStatus||w.dateOnly||w.invalidDates||e.openTasks!==w.knownOpen||e.tasksWithoutDate!==w.missingDates||e.overdueTasks+e.tasksDueDuringOutage+e.tasksWithoutDate>e.openTasks))throw protocol();
  if(d.evaluation.measuredRecoveryMs!==null||new Set(d.evaluation.checks.map(c=>c.code)).size!==d.evaluation.checks.length)throw protocol();
  if(d.facts.technicalReports.declaredPassed>d.facts.technicalReports.matchingCaptureId||d.facts.technicalReports.matchingCaptureId>d.facts.technicalReports.stored||d.facts.export.custodyDeclared&&d.facts.export.matchesActiveRevision!==true)throw protocol();
  return d;
}
async function boundedJson(response:Response,signal?:AbortSignal){
  const limit=128*1024,declared=response.headers.get('content-length');if(declared&&Number(declared)>limit){void response.body?.cancel().catch(()=>{});throw protocol();}
  if(!response.body)throw protocol();const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{for(;;){abort(signal);const {done,value}=await reader.read();abort(signal);if(done)break;total+=value.byteLength;if(total>limit)throw protocol();chunks.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}
  catch(error){cancel();throw error;}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}
/** One explicit same-origin GET, no retry/polling/storage or request-supplied installation identity. */
export async function loadContinuityEvidence(selection:ContinuityEvidenceQuery=DEFAULT_CONTINUITY_EVIDENCE_QUERY,options:{revision?:string;workspaceContextRevision?:string;signal?:AbortSignal;fetcher?:typeof fetch}={}):Promise<EvidenceViewData>{
  const {revision,workspaceContextRevision,signal,fetcher}=options;
  const selected=query.safeParse(selection);if(!selected.success||[revision,workspaceContextRevision].some(value=>value!==undefined&&!/^[a-f0-9]{64}$/.test(value)))throw new EvidenceReadError('invalid','Revisa el escenario y el horizonte antes de consultar.');
  abort(signal);const params=new URLSearchParams(Object.entries(selected.data).map(([k,v])=>[k,String(v)]));if(revision)params.set('revision',revision);if(workspaceContextRevision)params.set('workspaceContextRevision',workspaceContextRevision);
  try{const response=await (fetcher??fetch)('/api/v7/continuity/evidence?'+params,{method:'GET',credentials:'same-origin',cache:'no-store',signal:signal});abort(signal);
    if(response.status!==200){void response.body?.cancel().catch(()=>{});const status=response.status;if(status===401)throw new EvidenceReadError('locked','La copia está bloqueada. Desbloquéala en la aplicación y vuelve a consultar.');if(status===404)throw new EvidenceReadError('unsupported','Esta versión del servidor no ofrece la revisión de evidencia. Actualiza la aplicación.');if(status===409)throw new EvidenceReadError('stale','La referencia local cambió o necesita revisión. Consulta una referencia nueva antes de continuar.');if(status===422)throw new EvidenceReadError('invalid','El servidor no admite estos parámetros. Revisa la consulta.');throw new EvidenceReadError('unavailable','No se pudo consultar la copia local. Comprueba su disponibilidad y vuelve a intentarlo.');}
    if(workspaceContextRevision && response.headers.get('X-PlanB-Workspace-Revision')!==workspaceContextRevision){
      void response.body?.cancel().catch(()=>{});
      throw new EvidenceReadError('stale','No se pudo vincular la evidencia a la copia que tienes abierta. Actualiza el contexto antes de consultar.');
    }
    const value=await boundedJson(response,signal);abort(signal);return checked(value,selected.data,revision);
  }catch(error){if(signal?.aborted||error instanceof DOMException&&error.name==='AbortError')throw new DOMException('Consulta cancelada.','AbortError');if(error instanceof EvidenceReadError)throw error;if(error instanceof SyntaxError||error instanceof TypeError&&/encoded data/i.test(error.message))throw protocol();throw new EvidenceReadError('network','No se pudo leer una respuesta completa. Comprueba la conexión local y vuelve a intentarlo.');}
}
