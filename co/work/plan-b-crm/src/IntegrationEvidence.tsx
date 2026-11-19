import type { IntegrationStatus } from '../shared/integration-status.js';
import { IntegrationLogo } from './IntegrationLogo.js';
import './integration-evidence.css';
const labels:Record<IntegrationStatus['state'],string>={simulated:'Simulado',not_configured:'Sin configurar',disconnected:'Sin cuenta',authorized:'Autorizado',accepted:'Envío aceptado',verified:'Operación comprobada',incomplete:'Resultado parcial'};
export function IntegrationEvidence({items,visibleProposals,onOpen}:{items:IntegrationStatus[];visibleProposals:string[];onOpen:(id:string)=>void}){
  return <details className="integration-evidence"><summary>Estado de cada herramienta</summary>
    <p className="helper">Autorizar una cuenta no prueba todas sus funciones. Las evidencias corresponden a operaciones anteriores de esta misma cuenta; no comprueban el acceso actual.</p>
    <ul>{items.map(item=><li key={item.id}>
      <div className="integration-evidence-name"><IntegrationLogo id={item.id}/><strong>{item.name}</strong><span className={'integration-state state-'+item.state}>{labels[item.state]}</span></div>
      <p>{item.detail}</p>
      {item.evidenceAt?<small>Operación del <time dateTime={item.evidenceAt}>{new Date(item.evidenceAt).toLocaleString('es-ES',{timeZone:'Europe/Madrid'})}</time> · Madrid</small>:null}
      {item.proposalId&&visibleProposals.includes(item.proposalId)?<button className="text-button" onClick={()=>onOpen(item.proposalId!)}>Ver propuesta y evidencias</button>:null}
    </li>)}</ul>
  </details>;
}
