import { z } from 'zod';
import { RuleSchema, validateSpec, type AppSpec, type CrmSnapshot } from '../shared/model.js';
import { makeDemoSpec } from '../shared/fixtures.js';
import { AppError } from './store.js';
export const AppSpecPatchSchema=z.object({
  title:z.string().min(1).max(100).nullable(),description:z.string().max(500).nullable(),
  views:z.array(z.object({entity:z.enum(['contacts','companies','deals','tasks']),columns:z.array(z.string()).min(1)}).strict()).max(4),
  rules:z.array(RuleSchema).max(40),unsupported:z.array(z.string().max(500)).max(40)
}).strict();
const ruleProperties={
  id:{type:'string'},entity:{type:'string',enum:['contacts','companies','deals','tasks']},
  kind:{type:'string',enum:['required','email','min','conditional_required','allowed_transition']},
  field:{type:'string'},value:{type:['string','null']},whenField:{type:['string','null']},whenValue:{type:['string','null']},
  origin:{type:'string',enum:['user']},description:{type:'string'},evidence:{type:'string'}
};
export const patchJsonSchema={
  type:'object',additionalProperties:false,properties:{
    title:{type:['string','null']},description:{type:['string','null']},
    views:{type:'array',items:{type:'object',additionalProperties:false,properties:{entity:{type:'string',enum:['contacts','companies','deals','tasks']},columns:{type:'array',items:{type:'string'}}},required:['entity','columns']}},
    rules:{type:'array',items:{type:'object',additionalProperties:false,properties:ruleProperties,required:Object.keys(ruleProperties)}},
    unsupported:{type:'array',items:{type:'string'}}
  },required:['title','description','views','rules','unsupported']
};
export function applyAppSpecPatch(snapshot:CrmSnapshot,raw:unknown,prompt:string):AppSpec {
  const patch=AppSpecPatchSchema.parse(raw),spec=makeDemoSpec(snapshot);
  if(patch.title)spec.title=patch.title;if(patch.description)spec.description=patch.description;
  const seen=new Set<string>();
  for(const view of patch.views){
    if(seen.has(view.entity))throw new AppError(422,'La IA repitió una vista.');seen.add(view.entity);
    if(new Set(view.columns).size!==view.columns.length)throw new AppError(422,'La IA repitió columnas.');
    spec.entities.find(e=>e.id===view.entity)!.columns=view.columns;
  }
  if(patch.rules.some(r=>r.origin!=='user'))throw new AppError(422,'La IA no puede inventar configuración importada.');
  spec.rules.push(...patch.rules);spec.coverage.unsupported=[...new Set([...spec.coverage.unsupported,...patch.unsupported])];
  const issues=validateSpec(spec,snapshot,prompt);
  if(issues.length)throw new AppError(422,'La propuesta de IA no superó las validaciones.',issues);
  return spec;
}
