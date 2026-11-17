import { useEffect,useState } from 'react';
import { ChevronRight,RefreshCw } from 'lucide-react';
import type { CommercialOverview } from '../shared/commercial.js';
import type { TeamRecord } from '../shared/team.js';
import { Spinner } from './components.js';
import { CustomerDossier } from './CustomerDossier.js';
import { LoadError } from './LoadError.js';
import { TabList,tabPanelProps } from './TabList.js';
import { filterContacts } from './commercial-drafts.js';
const sources=[{id:'crm',label:'HubSpot · Lectura'},{id:'local',label:'Copia local'}] as const;
const pageSize=100;
const displayName=(values:Record<string,unknown>)=>[values.firstname,values.lastname].map(v=>String(v??'').trim()).filter(Boolean).join(' ')||'Contacto sin nombre';
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]!.toLocaleUpperCase('es')).join('');
const tone=(id:string)=>[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%6;
const person=(id:string,name:string,onOpen:()=>void)=> <span className="person-cell"><span className="avatar" data-tone={tone(id)} aria-hidden="true">{initials(name)}</span><button className="customer-name-button" onClick={onOpen}>{name}</button></span>;
type Call=<T>(path:string,body?:unknown)=>Promise<T>;
export function TeamContacts({tenant,records,canWrite,busy,call,onRefresh,onEdit,onPrepared,canConnect,initialSelection}:{tenant:string;records:TeamRecord[];canWrite:boolean;canConnect:boolean;initialSelection?:{contact:string;local:boolean};busy:boolean;call:Call;onRefresh:()=>void;onEdit:(record:TeamRecord)=>void;onPrepared:(id:string)=>void}){
  const [selected,setSelected]=useState<string|null>(initialSelection?.contact??null);
  useEffect(()=>{if(initialSelection){setSelected(initialSelection.contact);setLocal(initialSelection.local);}},[initialSelection]);
  const [source,setSource]=useState<CommercialOverview|null>(null),[local,setLocal]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[limit,setLimit]=useState(pageSize);
  useEffect(()=>{let alive=true;setError('');void call<CommercialOverview>('/spaces/'+tenant+'/v6/commercial').then(data=>{if(alive)setSource(data);}).catch(f=>{if(alive)setError(f.message);});return()=>{alive=false;};},[tenant,records,attempt]);
  useEffect(()=>{setLimit(pageSize);},[query,local]);
  if(!source)return error?<LoadError message={error} onRetry={()=>setAttempt(n=>n+1)}/>:<Spinner text="Leyendo la fuente de contactos…"/>;
  const crm=source.source?.origin==='hubspot',showCrm=crm&&!local;
  const rows=showCrm?(source.contacts??[]).map(value=>({entity:value.entity,id:value.id,version:0,value})):records.filter(r=>r.entity==='contacts');
  const found=filterContacts(rows.map(row=>({id:row.id,values:row.value.values as Record<string,unknown>,row})),query,limit),visible=found.items.map(item=>item.row);
  return <>{crm?<TabList label="Fuente de contactos" prefix="contacts" tabs={sources} value={local?'local':'crm'} onChange={id=>setLocal(id==='local')}/>:null}
    {error?<LoadError message={error} onRetry={()=>setAttempt(n=>n+1)}/>:null}
    <section className="data-card">
    <div className="list-toolbar">
      <label className="field contacts-search"><span className="sr-only">Buscar por nombre, correo o teléfono</span><input type="search" placeholder="Buscar por nombre, correo o teléfono" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <span className="list-toolbar__meta">{showCrm?'Contactos de la última captura verificada de HubSpot':'Registros de la copia local · cambios versionados'} · {rows.length} contactos{query?` · ${found.total} coinciden`:''}</span>
      <button className="text-button" disabled={busy} onClick={onRefresh}><RefreshCw size={14}/>Actualizar</button>
    </div>
    <div className="table-container team-table" {...(crm?tabPanelProps('contacts',local?'local':'crm'):{})}><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th>{showCrm?null:<><th>Revisión</th><th><span className="sr-only">Editar</span></th></>}</tr></thead><tbody>{visible.map(record=><tr key={record.id}><td data-label="Nombre">{person(record.id,displayName(record.value.values as Record<string,unknown>),()=>setSelected(record.id))}</td><td data-label="Correo">{String(record.value.values.email??'—')}</td><td data-label="Teléfono">{String(record.value.values.phone??'—')}</td>{showCrm?null:<><td data-label="Revisión">{record.version}</td><td className="team-row-edit"><button className="icon-button" aria-label={'Editar teléfono de '+(String(record.value.values.firstname??'').trim()||String(record.value.values.email??'').trim()||'contacto sin nombre')} disabled={!canWrite} onClick={()=>onEdit(record)}><ChevronRight size={17}/></button></td></>}</tr>)}</tbody></table>{!rows.length?<p className="helper">{showCrm?'Todavía no hay contactos en la captura de este portal.':'Esta copia todavía no tiene contactos.'}</p>:rows.length&&!found.total?<p className="helper" role="status">Ningún contacto coincide con la búsqueda.</p>:null}{found.total>visible.length?<button className="text-button" onClick={()=>setLimit(n=>n+pageSize)}>Mostrar {Math.min(pageSize,found.total-visible.length)} más ({visible.length} de {found.total})</button>:null}</div>
    </section>
    <p className="helper list-note">{showCrm?'La captura conserva los datos tal como se leyeron. Para obtener cambios posteriores, usa Capturar en lectura en Integraciones. Esta tabla no modifica HubSpot.':'Editar esta copia guarda cambios dentro de Plan B. No envía modificaciones a HubSpot.'}</p>
    {selected?<CustomerDossier key={tenant+':'+selected+':'+showCrm} tenant={tenant} contact={selected} local={!showCrm} canWrite={canWrite} canConnect={canConnect} call={call} close={()=>setSelected(null)} onPrepared={onPrepared}/>:null}
  </>;
}
