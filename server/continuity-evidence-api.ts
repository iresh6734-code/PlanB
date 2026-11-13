import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Store} from './store.js';
import {workspaceSearchIdentity} from './workspace-search.js';
import {getLocalAuthorizationCapture} from './security.js';
import {reviewContinuityEvidence} from './continuity-evidence.js';
import {DEFAULT_CONTINUITY_EVIDENCE_QUERY as defaults,type ContinuityEvidenceApiResponse} from '../shared/continuity-evidence-api.js';

type Issue=Extract<ContinuityEvidenceApiResponse,{available:false}>['issue'];
const messages:Record<Issue,string>={
  INVALID_OPTIONS:'Revisa los parámetros de la consulta de continuidad.',
  NO_ACTIVE_COPY:'Activa una copia conciliada antes de revisar su evidencia.',
  RECOVERY_STATE_INVALID:'El estado de devolución necesita revisión. Se conserva sin modificar.',
  SOURCE_UNREADABLE:'No se pudo leer una referencia local coherente. Revisa la instalación e inténtalo de nuevo.',
  SOURCE_CHANGED:'La referencia local cambió. Actualiza el contexto antes de usar este resultado.',
  INVALID_LOCAL_COPY:'La copia local no supera las comprobaciones de integridad.',
  ARCHIVE_MISMATCH:'La captura archivada no coincide con la copia activa.',
  EVIDENCE_LIMIT:'La evidencia supera el tamaño admitido para esta consulta.',
  FUTURE_CAPTURE:'La fecha de la captura es posterior al instante de evaluación.',
};
const status=(issue:Issue)=>issue==='INVALID_OPTIONS'?422:issue==='SOURCE_UNREADABLE'?503:409;
const failure=(issue:Issue):ContinuityEvidenceApiResponse=>({
  format:'planb-continuity-evidence-api-v1',available:false,issue,error:messages[issue],
  context:null,parameters:null,evaluation:null,facts:null,limitations:['No se ha publicado una evaluación. La consulta no modifica la copia local.'],
});
const minutes=(fallback:number,max:number)=>z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).pipe(z.number().int().min(1).max(max)).default(fallback);
const querySchema=z.object({
  scenario:z.enum(['crm-outage','device-loss']).default(defaults.scenario),
  outageMinutes:minutes(defaults.outageMinutes,43_200),
  maxDataAgeMinutes:minutes(defaults.maxDataAgeMinutes,43_200),
  maxRecoveryMinutes:minutes(defaults.maxRecoveryMinutes,43_200),
  maxEvidenceAgeMinutes:minutes(defaults.maxEvidenceAgeMinutes,129_600),
  revision:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  workspaceContextRevision:z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
const instance=(store:Store)=>{
  try{
    const id=store.get<unknown>('instanceId',null);
    return typeof id==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)?id:null;
  }catch{return null;}
};

/** Mount only on createBaseApp: inherits its local-host/origin and optional password/session hooks.
 * The caller supplies the already-open local Store, never a request-selected tenant/database.
 * This module does not register itself in either installed entry point.
 */
export function registerContinuityEvidenceApi(app:FastifyInstance,store:Store,clock:()=>number=Date.now){
  const captureAuthorization=getLocalAuthorizationCapture(app);
  app.get('/api/v7/continuity/evidence',{
    exposeHeadRoute:false,
    // Runs for early auth/host errors too; do not cache an authenticated representation or 401.
    onSend:async(_request,reply,payload)=>{
      reply.header('Cache-Control','no-store').header('Pragma','no-cache');
      const vary=String(reply.getHeader('vary')??'').split(',').map(x=>x.trim()).filter(Boolean);
      if(!vary.some(x=>x.toLowerCase()==='cookie'))vary.push('Cookie');
      reply.header('Vary',vary.join(', '));return payload;
    },
  },async(request,reply)=>{
    const authorized=captureAuthorization(request.headers.cookie);
    const locked=()=>reply.code(401).send({error:'Desbloquea tu copia local para continuar.'});
    if(!authorized())return locked();
    const parsed=querySchema.safeParse(request.query);
    if(!parsed.success||request.headers['transfer-encoding']||Number(request.headers['content-length']??0)!==0)return reply.code(422).send(failure('INVALID_OPTIONS'));
    const id=instance(store);if(!id)return reply.code(503).send(failure('SOURCE_UNREADABLE'));
    const {revision,workspaceContextRevision,...parameters}=parsed.data;
    const workspace=workspaceContextRevision ? workspaceSearchIdentity(store) : null;
    if(workspaceContextRevision && workspace?.contextRevision!==workspaceContextRevision){
      if(!authorized())return locked();
      return reply.code(409).send(failure('SOURCE_CHANGED'));
    }
    const result=reviewContinuityEvidence(store,{
      spaceId:'local:'+id,scenario:parameters.scenario,outageDurationMs:parameters.outageMinutes*60_000,
      objectives:{maxDataAgeMs:parameters.maxDataAgeMinutes*60_000,maxRecoveryMs:parameters.maxRecoveryMinutes*60_000,maxEvidenceAgeMs:parameters.maxEvidenceAgeMinutes*60_000},
      ...(revision?{expectedRevision:revision}:{}),
    },clock);
    const currentWorkspace=workspace ? workspaceSearchIdentity(store) : null;
    const currentId=instance(store);
    if(!authorized())return locked();
    if(currentId!==id || workspace && currentWorkspace?.contextRevision!==workspace.contextRevision)return reply.code(409).send(failure('SOURCE_CHANGED'));
    if(!result.available)return reply.code(status(result.issue)).send(failure(result.issue));
    const body:ContinuityEvidenceApiResponse={format:'planb-continuity-evidence-api-v1',available:true,issue:null,error:null,context:result.context,parameters,evaluation:result.result,facts:result.facts,limitations:result.limitations};
    if(workspace)reply.header('X-PlanB-Workspace-Revision',workspace.contextRevision);
    return body;
  });
}
