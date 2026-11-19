import type {ContinuityEvidenceReview} from './continuity-evidence.js';

export interface ContinuityEvidenceQuery {
  scenario:'crm-outage'|'device-loss';
  outageMinutes:number;
  maxDataAgeMinutes:number;
  maxRecoveryMinutes:number;
  maxEvidenceAgeMinutes:number;
}
export const DEFAULT_CONTINUITY_EVIDENCE_QUERY:Readonly<ContinuityEvidenceQuery>=Object.freeze({
  scenario:'crm-outage',outageMinutes:480,maxDataAgeMinutes:60,maxRecoveryMinutes:15,maxEvidenceAgeMinutes:1440,
});
type Success=Extract<ContinuityEvidenceReview,{available:true}>;
type Issue=Extract<ContinuityEvidenceReview,{available:false}>['issue'];
/** Wire contract deliberately omits the service's internal input/workload and individual record IDs. */
export type ContinuityEvidenceApiResponse={
  format:'planb-continuity-evidence-api-v1';available:true;issue:null;error:null;
  context:Success['context'];parameters:ContinuityEvidenceQuery;
  evaluation:Success['result'];facts:Success['facts'];limitations:string[];
}|{
  format:'planb-continuity-evidence-api-v1';available:false;issue:Issue;error:string;
  context:null;parameters:null;evaluation:null;facts:null;limitations:string[];
};
