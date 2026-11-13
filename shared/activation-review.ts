import type { AppSpec, AppState, Generation, Reconciliation } from './model.js';

export interface ActivationReview {
  revision:string;
  kind:'candidate'|'initial'|'active';
  target:{snapshot:AppState['snapshot'];spec:AppSpec|null;generation:Generation|null;reconciliation:Reconciliation|null;error:string|null};
  records:number;localChanges:number;replacesRecords:boolean;replacementConfirmed:boolean;
  canActivate:boolean;reasons:string[];
}

/** A pending candidate is always the preparation target, including its missing spec or failure. Never fall back to active. */
export function preparationTarget(state:AppState):AppState {
  const candidate=state.candidate;
  return candidate?{...state,snapshot:candidate.snapshot,spec:candidate.spec,generation:candidate.generation,reconciliation:candidate.reconciliation,lastError:candidate.error,ready:false}:state;
}
