import { reconcile, type CrmSnapshot, type EntityName } from '../shared/model.js';

interface ExpectedRecord { ref:string; actualHubspotId?:string; properties:Record<string,string>; pipelineRef?:string; stageRef?:string; }
export interface ExpectedFixture {
  account:{verifiedPortalId:string};
  pipelines:{ref:string;label:string;actualHubspotId:string;stages:{ref:string;label:string;actualHubspotId:string}[]}[];
  customProperties:{objectType:EntityName;name:string;options:{value:string;label:string}[]}[];
  companies:ExpectedRecord[];contacts:ExpectedRecord[];deals:ExpectedRecord[];tasks:ExpectedRecord[];
  associations:{from:string;to:string}[];
}

// Compare a saved capture with the preparation specification, without making
// any request to HubSpot or treating the specification as captured evidence.
export function checkFixture(snapshot:CrmSnapshot, expected:ExpectedFixture) {
  const checks:{name:string;passed:boolean}[]=[], matched:{ref:string;entity:EntityName;id:string}[]=[], notCaptured:string[]=[];
  const check=(name:string,passed:boolean)=>checks.push({name,passed});
  const correctAccount=snapshot.source.kind==='hubspot' && snapshot.source.isTestData && snapshot.source.accountId===expected.account.verifiedPortalId;
  check('Portal de ensayo esperado',correctAccount);
  const reconciliation=reconcile(snapshot);
  check('Captura completa y conciliada',reconciliation.complete);
  // Avoid exposing record IDs from another portal in the report.
  if(!correctAccount)return {passed:false,checks,matched,notCaptured,counts:reconciliation.counts,relations:snapshot.links.length};
  for(const pipeline of expected.pipelines) {
    check('Pipeline '+pipeline.ref,snapshot.pipelines?.some(p=>p.id===pipeline.actualHubspotId&&p.label===pipeline.label)??false);
    for(const stage of pipeline.stages)check('Etapa '+stage.ref,snapshot.stages.some(s=>s.id===stage.actualHubspotId&&s.pipelineId===pipeline.actualHubspotId&&s.label===stage.label));
  }
  for(const property of expected.customProperties) {
    const field=snapshot.entities.find(e=>e.id===property.objectType)?.fields.find(f=>f.key===property.name);
    check('Campo '+property.name,!!field && property.options.every(o=>field.options.some(v=>v.id===o.value&&v.label===o.label)));
  }
  for(const entity of ['companies','contacts','deals','tasks'] as const)for(const planned of expected[entity]) {
    const display=entity==='tasks'?'hs_task_subject':entity==='deals'?'dealname':entity==='companies'?'name':'email';
    const found=snapshot.records.filter(r=>r.entity===entity && (planned.actualHubspotId?r.id===planned.actualHubspotId:r.values[display]===planned.properties[display]));
    check('Registro '+planned.ref,found.length===1);
    if(found.length!==1)continue;
    const record=found[0];matched.push({ref:planned.ref,entity,id:record.id});
    for(const [field,value] of Object.entries(planned.properties)) {
      if(!snapshot.entities.find(e=>e.id===entity)?.fields.some(f=>f.key===field)) {
        notCaptured.push(entity+'.'+field);
        // Task body/type are outside the connector's documented basic scope.
        if(entity!=='tasks'||!['hs_task_body','hs_task_type'].includes(field))check('Campo capturado '+planned.ref+'.'+field,false);
        continue;
      }
      const actual=record.values[field];
      const same=field==='hs_timestamp'
        ? typeof actual==='string'&&Number.isFinite(Date.parse(actual))&&Date.parse(actual)===Date.parse(value)
        : field==='closedate' ? typeof actual==='string'&&actual.slice(0,10)===value : String(actual??'')===value;
      check('Valor '+planned.ref+'.'+field,same);
    }
    if(planned.pipelineRef) {
      const pipeline=expected.pipelines.find(p=>p.ref===planned.pipelineRef);
      check('Pipeline de '+planned.ref,!!pipeline&&record.values.pipeline===pipeline.actualHubspotId);
      check('Etapa de '+planned.ref,!!pipeline&&record.values.dealstage===pipeline.stages.find(s=>s.ref===planned.stageRef)?.actualHubspotId);
    }
  }
  const linkKey=(entity:EntityName,id:string,toEntity:EntityName,toId:string)=>[entity+':'+id,toEntity+':'+toId].sort().join('|');
  const links=new Set(snapshot.links.map(l=>linkKey(l.fromEntity,l.fromId,l.toEntity,l.toId)));
  for(const association of expected.associations) {
    const from=matched.find(r=>r.ref===association.from),to=matched.find(r=>r.ref===association.to);
    check('Relación '+association.from+' → '+association.to,!!from&&!!to&&links.has(linkKey(from.entity,from.id,to.entity,to.id)));
  }
  const expectedIds=new Set(matched.map(r=>r.entity+':'+r.id));
  const otherRecords=snapshot.records.filter(r=>!expectedIds.has(r.entity+':'+r.id)).map(r=>({entity:r.entity,id:r.id}));
  return {passed:checks.every(c=>c.passed),checks,matched,notCaptured:[...new Set(notCaptured)],counts:reconciliation.counts,relations:snapshot.links.length,otherRecords};
}
