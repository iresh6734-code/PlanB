import type { CrmRecord, CrmSnapshot, EntityName, FieldValue } from './model.js';
export interface Job {
  id: string; kind: 'capture' | 'drill' | 'return'; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: string; updatedAt: string; message: string; progress: number; result?: unknown;
}
export interface DrillReport {
  id: string; captureId: string; startedAt: string; completedAt: string;
  passed: boolean; isolated: boolean; checks: { label: string; passed: boolean; detail: string }[];
  durationMs: number; dataSource: string; limitations: string[];
}
export interface ContinuityStatus {
  captures: {id:string;at:string;bytes:number}[]; jobs: Job[]; reports: DrillReport[];
  latestCaptureAt: string | null; stale: boolean; ageMinutes: number | null;
  session: { id:string;captureId:string;startedAt:string } | null;
  schedule: { enabled:boolean; intervalMinutes:number; lastAttempt:string | null };
  connected: boolean; protected: boolean; accountId: string | null; changes: number; pendingChanges: number;
  runtime: boolean; realDataEnabled: boolean;
  latestCapture:CaptureSummary|null; readiness:DrillReadiness;
}
export interface CaptureSummary {
  id:string;name:string;source:CrmSnapshot['source']['kind'];accountId:string;capturedAt:string;
  counts:Record<EntityName,number>;records:number;relations:number;pipelines:number;fields:number;
}
export interface DrillReadiness {
  status:'empty'|'blocked'|'untested'|'passed'|'failed'|'expired';captureId:string|null;reportId:string|null;testedAt:string|null;issues:string[];
}
export interface RecoveryField { field: string; label:string; base:FieldValue; local:FieldValue; remote:FieldValue; conflict:boolean; decision:'local'|'remote'|null; }
export interface RecoveryOperation {
  id:string; entity:EntityName; localId:string; remoteId:string|null; kind:'create'|'update'; label:string;
  fields:RecoveryField[]; references: { field:string;entity:EntityName;id:string|null }[];
  remoteVersion:string|null; status:'pending'|'sending'|'applied'|'failed'|'uncertain'|'skipped'; error:string|null;
}
export interface RecoveryPlan {
  id:string; accountId:string; createdAt:string; revision:string; status:'review'|'approved'|'applying'|'complete'|'partial';
  operations:RecoveryOperation[]; source:'hubspot'|'simulation'; warning:string; approvedAt:string|null;
}
