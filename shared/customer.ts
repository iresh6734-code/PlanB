import { z } from 'zod';
export const CustomerActionSchema=z.object({id:z.string().uuid(),sourceKey:z.string().min(1).max(160),title:z.string().trim().min(1).max(200),dueAt:z.string().datetime({offset:true})}).strict();
export type CustomerActionInput=z.infer<typeof CustomerActionSchema>;
export interface CustomerAction {id:string;title:string;due_at:string;status:'open'|'completed';version:number;created_at:string;}
export interface CustomerDossier {
  contact:{id:string;name:string;email:string;phone:string};
  source:{key:string;origin:'local'|'hubspot';capturedAt:string;isTestData:boolean;canPrepare:boolean};
  companies:{id:string;name:string}[];
  owner:{id:string|null;name:string|null};
  opportunities:{id:string;name:string;stage:string;amount:number|null;ownerId:string|null}[];
  capturedTasks:{id:string;title:string;dueAt:string|null;status:string;completed:boolean}[];
  actions:CustomerAction[];
}
