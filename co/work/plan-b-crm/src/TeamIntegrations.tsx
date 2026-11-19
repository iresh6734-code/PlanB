import { useEffect,useState } from 'react';
import type { CommercialOverview } from '../shared/commercial.js';
import { IntegrationEvidence } from './IntegrationEvidence.js';
import { Spinner } from './components.js';
type Call=<T>(path:string,body?:unknown)=>Promise<T>;
export function TeamIntegrations({tenant,call,onCommercial}:{tenant:string;call:Call;onCommercial:()=>void}){
  const [data,setData]=useState<CommercialOverview|null>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void call<CommercialOverview>('/spaces/'+tenant+'/v6/commercial').then(value=>{if(alive)setData(value);}).catch(f=>{if(alive)setError(f.message);});return()=>{alive=false;};},[tenant]);
  if(error)return <p className="error-box" role="alert">{error}</p>;
  if(!data)return <Spinner text="Comprobando configuración de herramientas…"/>;
  return <section className="integration-connect"><div className="status-strip"><strong>Google Workspace</strong><span>{data.demo?'Simulado':data.connection?'Cuenta autorizada · '+data.connection.account:data.configured?'Configurado · falta autorizar cuenta':'Sin configurar'}</span><button className="text-button" onClick={onCommercial}>Abrir conexión y seguimientos</button></div><IntegrationEvidence items={data.integrations??[]} visibleProposals={[]} onOpen={onCommercial}/><p className="helper">Gmail envía correos revisados; Calendar consulta disponibilidad y gestiona reuniones propias; Drive limita el acceso a archivos de la app; Docs y Sheets crean y verifican resultados aprobados. Una autorización no acredita que todas esas operaciones se hayan probado.</p></section>;
}
