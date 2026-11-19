import type {ContinuityLabInput,ContinuityLabResult} from './continuity-lab.js';

export interface ContinuityEvidenceOptions {
  /** Namespace supplied by the authenticated caller; this service does not authorize tenants. */
  spaceId:string;
  scenario:ContinuityLabInput['scenario'];
  outageDurationMs:number;
  objectives:ContinuityLabInput['objectives'];
  /** Pin a previous context, including archived bytes and selected metadata, not only records. */
  expectedRevision?:string;
}
export interface ContinuityEvidenceFacts {
  snapshot:{capturedAt:string;locallyCheckedAt:string;validation:'local-schema-reconciliation';isTestData:boolean};
  workload:{total:number;completed:number;knownOpen:number;unknownStatus:number;dateOnly:number;invalidDates:number;missingDates:number;exactInstants:number;expressible:boolean};
  technicalReports:{stored:number;matchingCaptureId:number;declaredPassed:number;invalid:number;latestCompletedAt:string|null;binding:'capture-id-only';recoveryTime:'not-measured'};
  export:{present:boolean;matchesActiveRevision:boolean|null;custodyDeclared:boolean;artifactBytes:'not-examined';otherDevice:'not-demonstrated'};
}
export type ContinuityEvidenceReview={
  format:'planb-continuity-evidence-v1';available:false;
  issue:'INVALID_OPTIONS'|'NO_ACTIVE_COPY'|'RECOVERY_STATE_INVALID'|'SOURCE_UNREADABLE'|'SOURCE_CHANGED'|'INVALID_LOCAL_COPY'|'ARCHIVE_MISMATCH'|'EVIDENCE_LIMIT'|'FUTURE_CAPTURE';
  context:null;input:null;result:null;facts:null;limitations:string[];
}|{
  format:'planb-continuity-evidence-v1';available:true;issue:null;
  context:{revision:string;bundleRevision:string;view:'active-local-records';spaceId:string;sourceKey:string;captureId:string};
  input:ContinuityLabInput;result:ContinuityLabResult;facts:ContinuityEvidenceFacts;limitations:string[];
};
