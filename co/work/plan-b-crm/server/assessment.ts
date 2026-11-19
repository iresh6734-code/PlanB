import { entityNames, type CrmSnapshot } from '../shared/model.js';
import type { CaptureSummary, DrillReadiness } from '../shared/operations.js';
import { inspectDrillEvidence } from '../shared/drill-evidence.js';
export function summarizeCapture(id:string,snapshot:CrmSnapshot):CaptureSummary {
  return {id,name:snapshot.name,source:snapshot.source.kind,environment:snapshot.source.isTestData?'test':'production',accountId:snapshot.source.accountId,capturedAt:snapshot.capturedAt,
    counts:Object.fromEntries(entityNames.map(entity=>[entity,snapshot.records.filter(r=>r.entity===entity).length])) as CaptureSummary['counts'],
    records:snapshot.records.length,relations:snapshot.links.length,pipelines:snapshot.pipelines?.length??1,
    fields:snapshot.entities.reduce((total,entity)=>total+entity.fields.length,0)};
}
export function assessDrill(capture:CaptureSummary|null,issues:string[],reports:unknown,now=Date.now()):DrillReadiness {
  if(!capture)return {status:'empty',captureId:null,reportId:null,testedAt:null,issues:['Importa una captura verificada para preparar el simulacro.']};
  const empty={captureId:capture.id,reportId:null,testedAt:null};
  if(!Array.isArray(reports))return {...empty,status:'failed',issues:['No se puede interpretar el historial de simulacros. Repite la comprobación.']};
  const report=(reports as unknown[]).find(r=>r!==null&&typeof r==='object'&&'captureId' in r&&r.captureId===capture.id);
  const evidence=inspectDrillEvidence(report,capture);
  const base={captureId:capture.id,reportId:evidence.report?.id??null,testedAt:evidence.report?.completedAt??null};
  if(issues.length)return {...base,status:'blocked',issues};
  if(report===undefined)return {...empty,status:'untested',issues:[]};
  if(!evidence.passed)return {...base,status:'failed',issues:evidence.issues};
  const age=now-Date.parse(evidence.report.completedAt);
  if(!Number.isFinite(age)||age>30*86400_000||age<0)return {...base,status:'expired',issues:['Repite el simulacro: su comprobación tiene más de 30 días o una fecha no válida.']};
  return {...base,status:'passed',issues:[]};
}
