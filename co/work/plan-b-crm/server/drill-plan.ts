import { validateRecord, type AppSpec, type CrmRecord, type FieldValue } from '../shared/model.js';

export interface DrillPlan {
  contact:{id:string;field:string;value:string}|null;
  deal:{id:string;field:string;value:string}|null;
  task:{values:Record<string,FieldValue>;statusField:string;done:string}|null;
  issues:string[];
}

// Both the preparation diagnosis and the isolated worker use the same bounded
// operations. This does not write records or invent values for custom rules.
export function planDrill(spec:AppSpec,records:CrmRecord[],now=Date.now()):DrillPlan {
  const plan:DrillPlan={contact:null,deal:null,task:null,issues:[]};
  const contacts=records.filter(r=>r.entity==='contacts');
  const phone=spec.entities.find(e=>e.id==='contacts')?.fields.find(f=>!f.readOnly&&f.type==='text'&&/phone|tel/i.test(f.key+' '+f.label));
  if(phone)for(const record of contacts){
    const value=record.values[phone.key]==='600 123 456'?'600 123 457':'600 123 456';
    if(!Object.keys(validateRecord(spec,{...record,values:{...record.values,[phone.key]:value}},record)).length){plan.contact={id:record.id,field:phone.key,value};break;}
  }
  if(!plan.contact)plan.issues.push(!contacts.length?'Añade un cliente de ensayo para probar su edición.':'Revisa el teléfono editable y las reglas del cliente antes de probar su edición.');
  const stageField=spec.roles?.stage??'dealstage';
  for(const record of records.filter(r=>r.entity==='deals')){
    const stages=spec.stages.filter(s=>!s.pipelineId||s.pipelineId===record.values.pipeline),index=stages.findIndex(s=>s.id===record.values[stageField]);
    if(index<0)continue;
    const next=stages.slice(index+1).find(stage=>!Object.keys(validateRecord(spec,{...record,values:{...record.values,[stageField]:stage.id}},record)).length);
    if(next){plan.deal={id:record.id,field:stageField,value:next.id};break;}
  }
  if(!plan.deal)plan.issues.push(records.some(r=>r.entity==='deals')?'Necesitas una oportunidad con una etapa posterior permitida por sus reglas.':'Añade una oportunidad de ensayo para probar su avance.');
  const entity=spec.entities.find(e=>e.id==='tasks');
  if(entity){
    const statusField=spec.roles?.taskStatus??'status',due=spec.roles?.dueDate??'due_date';
    const options=entity.fields.find(f=>f.key===statusField&&!f.readOnly)?.options??[];
    const done=options.find(o=>/^(completed|complete|done|finished|completada|completado|terminada|terminado)$/i.test(o.id)||/^(completada|completado|terminada|terminado|completed|done)$/i.test(o.label));
    const pending=options.find(o=>o.id!==done?.id);
    const template=records.find(r=>r.entity==='tasks');
    if(done&&pending){
      const values:Record<string,FieldValue>=Object.fromEntries(entity.fields.filter(f=>!f.readOnly).map(f=>[f.key,template?.values[f.key]??null]));
      values[entity.displayField]='Simulacro · tarea temporal';values[statusField]=pending.id;
      values[due]=new Date(now+2*86400_000).toISOString();if(entity.fields.find(f=>f.key===due)?.type!=='datetime')values[due]=String(values[due]).slice(0,10);
      const created:CrmRecord={id:'drill-probe',entity:'tasks',values};
      const errors={...validateRecord(spec,created),...validateRecord(spec,{...created,values:{...values,[statusField]:done.id}},created)};
      if(Object.entries(values).some(([key,value])=>value!==null&&value!==''&&entity.fields.find(f=>f.key===key)?.readOnly))errors._form='La tarea de ensayo necesita escribir un campo de solo lectura.';
      if(!Object.keys(errors).length)plan.task={values,statusField,done:done.id};
      else plan.issues.push('La tarea de ensayo necesita datos o reglas adicionales: '+Object.values(errors).slice(0,2).join(' '));
    }else plan.issues.push('Configura un estado pendiente y otro completado reconocible para las tareas de ensayo.');
  }else plan.issues.push('Falta la configuración de tareas.');
  return plan;
}
