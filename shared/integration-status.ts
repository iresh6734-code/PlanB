import type { CommercialEvidence } from './commercial.js';

export interface IntegrationStatus {
  id:'gmail'|'calendar'|'drive'|'docs'|'sheets';
  name:string;
  state:'simulated'|'not_configured'|'disconnected'|'authorized'|'accepted'|'verified'|'incomplete';
  detail:string;
  evidenceAt:string|null;
  proposalId:string|null;
}
export interface IntegrationOperation {
  id:string;
  started_at:string|Date|null;
  evidence:CommercialEvidence[];
}
// Operations supplied here have already been restricted to the current tenant
// and Google identity by the repository. These are historical results, not a
// health check or proof that a token still works today.
export function googleIntegrationStatus(demo:boolean,configured:boolean,connected:boolean,operations:IntegrationOperation[]):IntegrationStatus[]{
  const definitions=[
    ['gmail','Gmail','email'],['calendar','Calendar','meeting'],['drive','Drive',null],
    ['docs','Docs','document'],['sheets','Sheets','spreadsheet'],
  ] as const;
  return definitions.map(([id,name,step])=>{
    const base={id,name,evidenceAt:null,proposalId:null};
    if(demo)return {...base,state:'simulated',detail:'Adaptador ficticio. Sin acceso a cuentas.'};
    if(!configured)return {...base,state:'not_configured',detail:'Configuración del servicio pendiente.'};
    if(!connected)return {...base,state:'disconnected',detail:'Falta autorizar una cuenta en este espacio.'};
    if(!step)return {...base,state:'authorized',detail:'Archivos creados o seleccionados para la app. La lectura se comprueba al cargar archivos.'};
    const candidates=operations.flatMap(operation=>operation.evidence
      .filter(e=>e.step===step&&e.remoteId&&!e.remoteId.startsWith('simulated-'))
      .map(e=>({operation,e,time:operation.started_at?new Date(operation.started_at).getTime():NaN})))
      .filter(item=>Number.isFinite(item.time)).sort((a,b)=>b.time-a.time);
    const latest=candidates[0];
    if(!latest)return {...base,state:'authorized',detail:'Permiso autorizado; sin operación real registrada para esta cuenta.'};
    const result={...base,evidenceAt:new Date(latest.time).toISOString(),proposalId:latest.operation.id};
    if(step==='email')return {...result,state:'accepted',detail:'Gmail aceptó un envío. Este registro no acredita entrega ni lectura.'};
    if(latest.e.status!=='verified')return {...result,state:'incomplete',detail:'Existe un resultado parcial; requiere conciliación antes de darlo por comprobado.'};
    return {...result,state:'verified',detail:'Resultado remoto comprobado en la operación registrada. No es una comprobación del acceso actual.'};
  });
}
