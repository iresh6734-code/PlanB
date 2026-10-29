import type { AppSpec,CrmRecord,Link } from './model.js';

export function followupDraft(contact:CrmRecord,records:CrmRecord[],spec:AppSpec,links:Link[]=[]){
  const value=(raw:unknown)=>String(raw??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240);
  const related=(a:CrmRecord,b:CrmRecord)=>{
    const refs=spec.entities.find(e=>e.id===a.entity)?.fields.filter(f=>f.referenceEntity===b.entity&&a.values[f.key])??[];
    if(refs.length)return refs.some(f=>String(a.values[f.key])===b.id);
    return links.some(l=>l.fromEntity===a.entity&&l.fromId===a.id&&l.toEntity===b.entity&&l.toId===b.id||l.toEntity===a.entity&&l.toId===a.id&&l.fromEntity===b.entity&&l.fromId===b.id);
  };
  const name=value(contact.values.firstname)||'equipo',company=records.find(r=>r.entity==='companies'&&related(contact,r));
  const stageKey=spec.roles?.stage??'dealstage';
  const stageOf=(r:CrmRecord)=>spec.stages.find(s=>s.id===String(r.values[stageKey]))?.label??'';
  const deals=records.filter(r=>r.entity==='deals'&&related(r,contact));
  const deal=deals.find(r=>!/(ganad|perdid|completad|cerrad|closed|won|lost)/i.test(stageOf(r)));
  const serviceField=spec.entities.find(e=>e.id==='contacts')?.fields.find(f=>f.key==='service');
  const service=serviceField?.options.find(o=>o.id===contact.values.service)?.label;
  const topic=deal?value(deal.values.dealname):service??'';
  const context=[{label:'Cliente',value:[name,value(contact.values.lastname)].filter(Boolean).join(' ')},
    ...(company?[{label:'Empresa',value:value(company.values.name)}]:[]),
    ...(deal?[{label:'Oportunidad',value:topic},{label:'Etapa',value:stageOf(deal)||'Sin etapa identificada'}]:[]),
    ...(service?[{label:'Servicio',value:service}]:[])];
  const companyName=company?value(company.values.name):'';
  const opening=topic?`Te escribo para concretar el siguiente paso de «${topic}»${companyName&&!topic.toLocaleLowerCase('es').includes(companyName.toLocaleLowerCase('es'))?' con '+companyName:''}.`:'Me gustaría concretar contigo el siguiente paso y revisar qué necesitas para avanzar.';
  const question=deal&&/propuesta|negociaci/i.test(stageOf(deal))?'¿Hay algún punto del alcance o de las condiciones que necesites aclarar antes de continuar?':'¿Qué objetivo te gustaría priorizar y qué información necesitas para tomar la siguiente decisión?';
  return {subject:('Siguiente paso · '+(topic||name)).slice(0,180),body:`Hola ${name},\n\n${opening}\n\n${question}\n\nTe propongo una conversación de 30 minutos para resolverlo y acordar una próxima acción. Si el horario propuesto no te encaja, dime qué alternativa te viene mejor.\n\nGracias,`,context};
}
