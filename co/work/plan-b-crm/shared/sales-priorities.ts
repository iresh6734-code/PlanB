import type { AppSpec,CrmRecord,Link } from './model.js';
export interface SalesPriority {id:string;label:string;contactId:string|null;reason:string;stage:string;}
export function salesPriorities(records:CrmRecord[],spec:AppSpec,links:Link[],now:Date,internal:{contactId:string;dueAt:string}[]=[]):SalesPriority[]{
  const related=(a:CrmRecord,b:CrmRecord)=>links.some(l=>l.fromEntity===a.entity&&l.fromId===a.id&&l.toEntity===b.entity&&l.toId===b.id||l.toEntity===a.entity&&l.toId===a.id&&l.fromEntity===b.entity&&l.fromId===b.id)||spec.entities.find(e=>e.id===a.entity)?.fields.some(f=>f.referenceEntity===b.entity&&String(a.values[f.key]??'')===b.id)||spec.entities.find(e=>e.id===b.entity)?.fields.some(f=>f.referenceEntity===a.entity&&String(b.values[f.key]??'')===a.id);
  const contacts=records.filter(r=>r.entity==='contacts'),tasks=records.filter(r=>r.entity==='tasks'&&!/^(completed|done|completad[oa])$/i.test(String(r.values[spec.roles?.taskStatus??'hs_task_status']??r.values.status??'')));
  const horizon=now.getTime()+7*86400000;
  return records.filter(r=>r.entity==='deals').flatMap(deal=>{
    const stageId=String(deal.values[spec.roles?.stage??'dealstage']??''),stage=spec.stages.find(s=>s.id===stageId)?.label??'';
    if(/^(closedwon|closedlost|won|lost)$/i.test(stageId)||/(ganad|perdid|cerrad|closed|won|lost)/i.test(stage))return [];
    const contact=contacts.find(c=>related(deal,c));
    const next=tasks.some(task=>{const raw=String(task.values[spec.roles?.dueDate??'hs_timestamp']??task.values.due_date??''),at=Date.parse(raw);return Number.isFinite(at)&&at>=now.getTime()&&at<=horizon&&(related(task,deal)||!!contact&&related(task,contact));});
    const nextInternal=!!contact&&internal.some(action=>action.contactId===contact.id&&Date.parse(action.dueAt)>=now.getTime()&&Date.parse(action.dueAt)<=horizon);
    return next||nextInternal?[]:[{id:deal.id,label:String(deal.values.dealname??deal.id).slice(0,180),contactId:contact?.id??null,stage:stage||'Etapa sin identificar',reason:'En los datos disponibles no consta una tarea abierta con fecha en los próximos siete días.'}];
  }).slice(0,20);
}
