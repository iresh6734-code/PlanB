import { useEffect,useState } from 'react';
import { ChevronRight,RefreshCw } from 'lucide-react';
import type { CommercialOverview } from '../shared/commercial.js';
import type { TeamRecord } from '../shared/team.js';
import { Spinner } from './components.js';
import { CustomerDossier } from './CustomerDossier.js';
type Call=<T>(path:string,body?:unknown)=>Promise<T>;
export function TeamContacts({tenant,records,canWrite,busy,call,onRefresh,onEdit,onPrepared,canConnect,initialSelection}:{tenant:string;records:TeamRecord[];canWrite:boolean;canConnect:boolean;initialSelection?:{contact:string;local:boolean};busy:boolean;call:Call;onRefresh:()=>void;onEdit:(record:TeamRecord)=>void;onPrepared:(id:string)=>void}){
  const [selected,setSelected]=useState<string|null>(initialSelection?.contact??null);
  useEffect(()=>{if(initialSelection){setSelected(initialSelection.contact);setLocal(initialSelection.local);}},[initialSelection]);
  const [source,setSource]=useState<CommercialOverview|null>(null),[local,setLocal]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void call<CommercialOverview>('/spaces/'+tenant+'/v6/commercial').then(data=>{if(alive)setSource(data);}).catch(f=>{if(alive)setError(f.message);});return()=>{alive=false;};},[tenant,records]);
  if(error)return <p role="alert" className="error-box">{error}</p>;
  if(!source)return <Spinner text="Leyendo la fuente de contactos…"/>;
  const crm=source.source?.origin==='hubspot',showCrm=crm&&!local;
  const rows=showCrm?(source.contacts??[]).map(value=>({entity:value.entity,id:value.id,version:0,value})):records.filter(r=>r.entity==='contacts');
  return <>{crm?<div className="commercial-tabs" role="tablist" aria-label="Fuente de contactos"><button role="tab" aria-selected={!local} onClick={()=>setLocal(false)}>HubSpot · Lectura</button><button role="tab" aria-selected={local} onClick={()=>setLocal(true)}>Copia local</button></div>:null}
    <div className="status-strip"><span>{showCrm?'Contactos de la última captura verificada de HubSpot':'Registros de la copia local · cambios versionados'} · {rows.length} contactos</span><button className="text-button" disabled={busy} onClick={onRefresh}><RefreshCw size={14}/>Actualizar</button></div>
    <p className="helper">{showCrm?'La captura conserva los datos tal como se leyeron. Para obtener cambios posteriores, usa Capturar en lectura en Integraciones. Esta tabla no modifica HubSpot.':'Editar esta copia guarda cambios dentro de Plan B. No envía modificaciones a HubSpot.'}</p>
    <div className="table-container team-table"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th>{showCrm?null:<><th>Revisión</th><th><span className="sr-only">Editar</span></th></>}</tr></thead><tbody>{rows.map(record=><tr key={record.id}><td><button className="customer-name-button" onClick={()=>setSelected(record.id)}>{String(record.value.values.firstname??record.id)} {String(record.value.values.lastname??'')}</button></td><td>{String(record.value.values.email??'—')}</td><td>{String(record.value.values.phone??'—')}</td>{showCrm?null:<><td>{record.version}</td><td><button className="icon-button" aria-label={'Editar teléfono de '+record.value.values.firstname} disabled={!canWrite} onClick={()=>onEdit(record)}><ChevronRight size={17}/></button></td></>}</tr>)}</tbody></table>{!rows.length?<p className="helper">{showCrm?'Todavía no hay contactos en la captura de este portal.':'Esta copia todavía no tiene contactos.'}</p>:null}</div>
    {selected?<CustomerDossier key={tenant+':'+selected+':'+showCrm} tenant={tenant} contact={selected} local={!showCrm} canWrite={canWrite} canConnect={canConnect} call={call} close={()=>setSelected(null)} onPrepared={onPrepared}/>:null}
  </>;
}
