import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { commitmentRevision } from '../shared/commitments.js';
import { registerCommitments } from './commitments.js';
import { initializeCommitmentScenarioSeed,readCommitmentScenarioSeed } from './commitment-scenario-seed.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError,type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

export const COMMITMENT_RADAR_CAPABILITY_PATH = '/api/v7/commitment-radar';
const registrations = new WeakMap<FastifyInstance,Store>();
const query = z.object({contextRevision:commitmentRevision.optional()}).strict();
const activation = z.object({contextRevision:commitmentRevision}).strict();
const emptyQuery = z.object({}).strict();
type Scope = {status:'inactive-copy'|'not-fiction'|'active';pin:string|null};
const changed = () => new AppError(409,'Actualiza la copia de ensayo antes de continuar.',{code:'COMMITMENT_CONTEXT_CHANGED'});
const unavailable = () => new AppError(503,'No se pudo comprobar el escenario local del Radar.',{code:'COMMITMENT_SCENARIO_UNAVAILABLE'});

/** Explicit composition opt-in. No main registration, provider access, or seed write on GET. */
export function mountCommitmentRadar(app: FastifyInstance,store: Store,options: {clock?:()=>number} = {}) {
  const prior = registrations.get(app);
  if (prior) { if (prior !== store) throw new Error('Radar already registered with another Store'); return; }
  const capture = getLocalAuthorizationCapture(app),clock = options.clock ?? Date.now;
  const authorized = (check:()=>boolean) => { if (!check()) throw new AppError(401,'Desbloquea tu copia local para continuar.'); };
  function scope(expected:string|undefined,check:()=>boolean):Scope {
    authorized(check);
    let ready:boolean,identity:ReturnType<typeof workspaceSearchIdentity>;
    try { ready=store.ready;identity=workspaceSearchIdentity(store); }
    catch { authorized(check);throw unavailable(); }
    authorized(check);
    if (!ready) { if (expected !== undefined) throw changed();return {status:'inactive-copy',pin:null}; }
    if (!identity) throw unavailable();
    if (identity.contextRevision !== expected) throw changed();
    return {status:identity.isTestData?'active':'not-fiction',pin:identity.contextRevision};
  }
  function recheck(initial:Scope,expected:string|undefined,check:()=>boolean) {
    const current=scope(expected,check);
    if (current.pin !== initial.pin || current.status !== initial.status) throw changed();
  }
  const state = (current:Scope) => {
    const base={format:'planb-commitment-radar-capability-v1' as const,mode:'fiction' as const,contextRevision:current.pin,
      seedAt:null as string|null,datasetRevision:null as string|null,provenance:null as 'durable'|'memory-only'|null};
    if (current.status !== 'active') return {...base,status:current.status,canActivate:false};
    const seed=readCommitmentScenarioSeed(store);
    if (seed.status === 'ready') return {...base,status:'available' as const,canActivate:false,
      seedAt:seed.seedAt,datasetRevision:seed.datasetRevision,provenance:seed.provenance};
    return {...base,status:seed.reason==='not-initialized'?'not-initialized' as const:'unavailable' as const,canActivate:seed.reason==='not-initialized'};
  };
  app.addHook('onSend',async(request,reply,payload)=>{
    const route=request.url.split('?')[0];
    if (route===COMMITMENT_RADAR_CAPABILITY_PATH||route.startsWith(COMMITMENT_RADAR_CAPABILITY_PATH+'/')||route==='/api/v7/commitments'||route.startsWith('/api/v7/commitments/')) {
      reply.header('Cache-Control','no-store').header('Pragma','no-cache');
      const vary=String(reply.getHeader('Vary')??'').split(',').map(s=>s.trim()).filter(Boolean);
      if (!vary.some(s=>s.toLowerCase()==='cookie'))vary.push('Cookie');reply.header('Vary',vary.join(', '));
    }
    return payload;
  });
  registerCommitments(app,store,()=>{const seed=readCommitmentScenarioSeed(store);return seed.status==='ready'?seed.dataset:null;},clock);
  app.get(COMMITMENT_RADAR_CAPABILITY_PATH,{exposeHeadRoute:false},request=>{
    const check=capture(request.headers.cookie),{contextRevision}=query.parse(request.query),current=scope(contextRevision,check);
    const result=state(current);recheck(current,contextRevision,check);return result;
  });
  app.post(COMMITMENT_RADAR_CAPABILITY_PATH+'/activate',{bodyLimit:1024},(request,reply)=>{
    const check=capture(request.headers.cookie);emptyQuery.parse(request.query);
    const {contextRevision}=activation.parse(request.body),current=scope(contextRevision,check);
    if (current.status!=='active') throw new AppError(409,'Activa una copia de datos de ensayo para habilitar el Radar.',{code:'COMMITMENT_TEST_COPY_REQUIRED'});
    const seed=initializeCommitmentScenarioSeed(store,()=>{
      const now=clock();recheck(current,contextRevision,check);return now;
    });
    recheck(current,contextRevision,check);
    if (seed.status!=='ready')throw unavailable();
    const result=state(current);recheck(current,contextRevision,check);
    if (result.status!=='available')throw unavailable();
    return reply.code(seed.created?201:200).send(result);
  });
  registrations.set(app,store);
}
