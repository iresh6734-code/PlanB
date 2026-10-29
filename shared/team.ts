import { z } from 'zod';
import { EntityNameSchema } from './model.js';
export const TeamRoleSchema=z.enum(['admin','manager','sales','viewer']);
export type TeamRole=z.infer<typeof TeamRoleSchema>;
export interface TeamPrincipal { uid:string; email:string; }
export const permissions:Record<TeamRole,readonly string[]>={admin:['read','write','jobs','devices','connections','members','resolve'],manager:['read','write','jobs','devices','connections','resolve'],sales:['read','write','jobs','devices'],viewer:['read']};
export const SyncOperationSchema=z.object({id:z.string().uuid(),entity:EntityNameSchema,recordId:z.string().min(1).max(100),baseVersion:z.number().int().min(0),values:z.record(z.string(),z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.null()])).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=60)}).strict();
export type SyncOperation=z.infer<typeof SyncOperationSchema>;
export interface TeamSpace { id:string; name:string; role:TeamRole; }
export interface TeamJob { id:string; kind:'sync-audit'|'hubspot-capture';status:'queued'|'running'|'succeeded'|'failed';attempts:number;created_at:string;error:string|null;result:unknown; }
export interface TeamRecord { entity:string;id:string;version:number;value:{entity:string;id:string;values:Record<string,string|number|boolean|null>}; }
export interface SyncResult { operationId:string;status:'applied'|'conflict';version:number;recordId:string;conflictId?:string; }
export interface TeamOverview { space:TeamSpace;members:{user_id:string;email:string;role:TeamRole}[];recordCount:number;jobs:TeamJob[];devices:{id:string;name:string;revoked_at:string|null;last_seen:string|null}[];conflicts:{id:string;entity:string;record_id:string;local_values:Record<string,unknown>;remote_value:TeamRecord['value'];remote_version:number;status:string}[];connection:{account_id:string;status:string;verified_at:string}|null; }
