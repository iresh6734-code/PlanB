import { z } from 'zod';
import type { SalesPriority } from './sales-priorities.js';
export const AgentDraftSchema=z.object({subject:z.string().trim().min(1).max(180).refine(s=>!/[\u0000-\u001f\u007f]/.test(s)),body:z.string().trim().min(1).max(12000)}).strict();
export type AgentDraft=z.infer<typeof AgentDraftSchema>;
export interface AgentPreview {opportunityId:string;contactId:string;revision:string;sourceKey?:string;context:{label:string;value:string}[];draft:AgentDraft;}
export interface TeamAgentOverview {configured:boolean;connected:boolean;account:string|null;localAI?:{available:boolean;enabled:boolean;model:string;revision:string;monthlyLimit:number};source:{origin:'local'|'hubspot';id:string;isTestData:boolean}|null;priorities:SalesPriority[];runs:{id:string;provider?:string;model?:string;status:string;created_at:string;result:AgentDraft|null;error:string|null;proposal_id:string|null}[];monthlyLimit:number;}
