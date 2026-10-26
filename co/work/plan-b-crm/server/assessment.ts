import { entityNames, type CrmSnapshot } from '../shared/model.js';
import type { CaptureSummary, DrillReadiness, DrillReport } from '../shared/operations.js';
export function summarizeCapture(id:string,snapshot:CrmSnapshot):CaptureSummary {
  return {id,name:snapshot.name,source:snapshot.source.kind,environment:snapshot.source.isTestData?'test':'production',accountId:snapshot.source.accountId,capturedAt:snapshot.capturedAt,
    counts:Object.fromEntries(entityNames.map(entity=>[entity,snapshot.records.filter(r=>r.entity===entity).length])) as CaptureSummary['counts'],
    records:snapshot.records.length,relations:snapshot.links.length,pipelines:snapshot.pipelines?.length??1,
    fields:snapshot.entities.reduce((total,entity)=>total+entity.fields.length,0)};
}
export function assessDrill(capture:CaptureSummary|null,issues:string[],reports:DrillReport[],now=Date.now()):DrillReadiness {
  if(!capture)return {status:'empty',captureId:null,reportId:null,testedAt:null,issues:['Importa una captura verificada para preparar el simulacro.']};
  const report=reports.find(r=>r.captureId===capture.id);
  const base={captureId:capture.id,reportId:report?.id??null,testedAt:report?.completedAt??null};
  if(issues.length)return {...base,status:'blocked',issues};
  if(!report)return {...base,status:'untested',issues:[]};
  if(!report.passed||!report.isolated||report.checks.length!==5||report.checks.some(c=>!c.passed))return {...base,status:'failed',issues:report.checks.filter(c=>!c.passed).map(c=>c.detail)};
  const age=now-Date.parse(report.completedAt);
  if(!Number.isFinite(age)||age>30*86400_000||age<0)return {...base,status:'expired',issues:['Repite el simulacro: su comprobación tiene más de 30 días o una fecha no válida.']};
  return {...base,status:'passed',issues:[]};
}
