import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ActivationReview } from '../shared/activation-review.js';
import { AppError, type Store } from './store.js';

function context(store:Store):ActivationReview {
  const candidate=store.candidate,activeSnapshot=store.snapshot,activeSpec=store.spec,activeGeneration=store.generation;
  const snapshot=candidate?.snapshot??activeSnapshot,spec=candidate?candidate.spec:activeSpec,generation=candidate?candidate.generation:activeGeneration,reconciliation=candidate?.reconciliation??store.reconciliation;
  const error=candidate?candidate.error:store.get<string|null>('lastError',null),records=store.records(),changes=store.changes();
  const continuitySession=store.get('continuitySession',null),returnBusy=store.get('returnBusy',false);
  const revision=createHash('sha256').update(JSON.stringify({candidate,activeSnapshot,activeSpec,activeGeneration,reconciliation:store.reconciliation,ready:store.ready,records,changes,lastError:store.get('lastError',null),continuitySession,returnBusy})).digest('hex');
  const reasons:string[]=[];
  if(!snapshot||!spec||!generation)reasons.push('Genera primero una especificación para la captura que vas a activar.');
  if(error)reasons.push(error);
  if(!reconciliation?.complete)reasons.push('La captura necesita una conciliación completa.');
  if(continuitySession)reasons.push('Cierra la sesión de continuidad antes de activar otra versión.');
  if(returnBusy)reasons.push('Espera a que termine la devolución antes de activar otra versión.');
  if(candidate?.replaceRecords&&changes.length&&(!candidate.replaceApproved||candidate.baselineChanges!==changes.length))reasons.push('Hay cambios locales nuevos. Exporta y revisa otra vez la sustitución.');
  return {revision,kind:candidate?'candidate':store.ready?'active':'initial',target:{snapshot:snapshot?{...snapshot,records:[],links:[]}:null,spec,generation,reconciliation,error},records:candidate?.replaceRecords?snapshot?.records.length??0:records.length,localChanges:changes.length,replacesRecords:!!candidate?.replaceRecords,replacementConfirmed:!!candidate?.replaceApproved,canActivate:reasons.length===0,reasons};
}

export function registerActivationReview(app:FastifyInstance,store:Store,runtime:boolean) {
  const assertGenerator=()=>{if(runtime)throw new AppError(403,'La preparación y activación se revisan en el generador, no en el paquete independiente.');};
  app.get('/api/v4/activation-review',async()=>{assertGenerator();return context(store);});
  app.post('/api/v4/activate-reviewed',async request=>{
    assertGenerator();
    const {revision}=z.object({reviewed:z.literal(true),revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(request.body);
    // Read/check/activate are synchronous. No await or provider call can switch the target between this check and Store.activate.
    const current=context(store);
    if(current.revision!==revision)throw new AppError(409,'La preparación cambió después de revisarla. Actualiza el contenido y confirma de nuevo.');
    if(!current.canActivate)throw new AppError(409,current.reasons[0]??'La preparación requiere una nueva revisión.');
    store.activate();
    return {ready:true,reviewedRevision:revision,captureId:store.snapshot!.id+':'+store.snapshot!.capturedAt};
  });
}
