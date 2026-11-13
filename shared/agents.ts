export type IntegrationId = 'hubspot' | 'gmail' | 'calendar' | 'drive' | 'docs' | 'sheets';
export interface IntegrationCapability { id:IntegrationId; label:string; mode:'simulation'|'readonly'|'unavailable'; description:string; actions:string[]; }
export interface AgentAction {
  kind:'task'|'email'|'meeting'; destination:'planb'|'gmail'|'calendar';
  title:string; detail:string; contactId:string|null; recipient:string|null; dueDate:string; timeZone:'Europe/Madrid';
}
export interface ActionProposal {
  id:string; runId:string; captureId:string; revision:string; contentHash:string; dealId:string; label:string; reason:string;
  evidence:{entity:'deals'|'tasks'|'contacts';id:string;label:string}[]; actions:AgentAction[];
  status:'review'|'approved'|'applying'|'verified'|'rejected'|'uncertain';
  createdAt:string; approvedAt:string|null; completedAt:string|null; error:string|null; stale?:boolean;
}
export interface AgentRun {
  id:string; status:'running'|'succeeded'|'failed'|'interrupted'; startedAt:string; completedAt:string|null;
  revision:string; proposals:number; toolCalls:number; costUsd:number; message:string;
}
export interface SimulationArtifact { key:string; proposalId:string; action:AgentAction; verifiedAt:string; }
export interface AgentState { runs:AgentRun[]; proposals:ActionProposal[]; artifacts:SimulationArtifact[]; }
export interface TodayStatus {
  available:boolean; date:string; openDeals:number; overdueTasks:number; dueToday:number;
  listTotals?:{opportunities:number;tasks:number};
  opportunities:{id:string;label:string;reason:string;contactId:string|null}[];
  tasks:{id:string;label:string;dueDate:string;overdue:boolean}[];
}
export interface AgentOverview extends AgentState {
  available:boolean; mode:'simulation'; limits:{maxToolCalls:number;maxDurationSeconds:number;maxConcurrent:number;monthlyBudgetUsd:number};
}
