import type { IntegrationId } from '../shared/agents.js';
export function IntegrationLogo({id}:{id:IntegrationId}){return <img className="integration-logo" src={'/integrations/'+id+(id==='hubspot'?'.svg':'.png')} alt="" width="35" height="35" decoding="async"/>;}
