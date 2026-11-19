import { useState } from 'react';
import { ArrowUpRight, Bot, Building2, ListTodo, PlugZap, Send, Users } from 'lucide-react';
import type { TeamOverview, TeamRecord } from '../shared/team.js';
import { TabList, tabPanelProps } from './TabList.js';
import './team-company.css';

const entities = [
  { id: 'contacts', label: 'Contactos' }, { id: 'companies', label: 'Empresas' },
  { id: 'deals', label: 'Oportunidades' }, { id: 'tasks', label: 'Tareas' },
] as const;
type Entity = typeof entities[number]['id'];
type Destination = 'records' | 'jobs' | 'connections' | 'commercial' | 'agent';
const jobLabels = { queued: 'En cola', running: 'En curso', succeeded: 'Completado', failed: 'Fallido' };
const connectionLabels: Record<string, string> = { readonly: 'Conexión de lectura', needs_reconnect: 'Necesita reconectar' };
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
function recordName(record: TeamRecord) {
  const v = record.value.values;
  if (record.entity === 'contacts') return [v.firstname, v.lastname].filter(Boolean).join(' ') || text(v.email);
  return text(v.name ?? v.dealname ?? v.hs_task_subject ?? v.subject);
}
function recordDetail(record: TeamRecord) {
  const v = record.value.values;
  return text(record.entity === 'contacts' ? v.email : record.entity === 'companies' ? v.domain : record.entity === 'deals' ? v.dealstage : v.hs_task_status ?? v.status);
}

export function TeamCompanyHome({ overview, records, localPilot, onNavigate }: {
  overview: TeamOverview; records: TeamRecord[]; localPilot: boolean; onNavigate: (view: Destination) => void;
}) {
  const [entity, setEntity] = useState<Entity>('contacts');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const counts = Object.fromEntries(entities.map(item => [item.id, records.filter(record => record.entity === item.id).length]));
  const normalized = query.trim().toLocaleLowerCase('es');
  const matches = records.filter(record => record.entity === entity && (!normalized || [recordName(record), recordDetail(record)].some(value => value.toLocaleLowerCase('es').includes(normalized))));
  const openJobs = overview.jobs.filter(job => job.status === 'queued' || job.status === 'running').length;
  const chooseEntity = (value: Entity) => { setEntity(value); setQuery(''); setLimit(50); };
  return <div className="company-home">
    <section className="company-overview" aria-labelledby="company-overview-title">
      <div><p className="company-eyebrow">TU ESPACIO DE TRABAJO</p><h2 id="company-overview-title">Resumen de la copia guardada</h2><p>Consulta la copia guardada y continúa con tus contactos, seguimientos y herramientas.</p></div>
      <button type="button" className="button primary" onClick={() => onNavigate('commercial')}>Abrir Comercial <ArrowUpRight size={16} aria-hidden="true"/></button>
    </section>
    <dl className="company-metrics" aria-label="Registros de la copia local">
      {entities.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{counts[item.id]}</dd></div>)}
    </dl>
    <p className="helper">Recuentos de la copia local de esta empresa. La conexión HubSpot y sus capturas se consultan por separado en Integraciones.</p>
    <div className="company-columns">
      <section className="company-section" aria-labelledby="company-work-title">
        <h2 id="company-work-title">Continúa trabajando</h2>
        <div className="company-shortcuts">
          {([
            { view: 'records', label: 'Contactos y fichas', detail: 'Actividad, documentos y próximas acciones.', icon: Users },
            { view: 'commercial', label: 'Seguimientos comerciales', detail: 'Borradores, revisión, archivos y hojas.', icon: Send },
            { view: 'agent', label: 'Agente', detail: 'Revisa el contexto y las propuestas del asistente.', icon: Bot },
            { view: 'connections', label: 'Integraciones', detail: 'Conexiones y capturas de esta empresa.', icon: PlugZap },
          ] as const).map(item => <button key={item.view} type="button" onClick={() => onNavigate(item.view)}><item.icon size={19} aria-hidden="true"/><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowUpRight size={15} aria-hidden="true"/></button>)}
        </div>
      </section>
      <section className="company-section" aria-labelledby="company-state-title">
        <h2 id="company-state-title">Estado de la empresa</h2>
        <dl className="company-status"><div><dt>HubSpot</dt><dd>{overview.connection ? `${connectionLabels[overview.connection.status] ?? 'Conexión no disponible'} · Portal ${overview.connection.account_id}` : 'Sin conexión en este espacio'}</dd></div><div><dt>Trabajos pendientes</dt><dd>{openJobs}</dd></div><div><dt>Conflictos por revisar</dt><dd>{overview.conflicts.length}</dd></div></dl>
        <button type="button" className="text-button" onClick={() => onNavigate('jobs')}>Ver trabajos y resultados <ArrowUpRight size={14} aria-hidden="true"/></button>
        {localPilot ? <p className="helper company-mode"><Building2 size={16} aria-hidden="true"/>Piloto local de un operador. El equipo compartido y la vinculación de dispositivos requieren el servicio de equipo.</p> : null}
      </section>
    </div>
    <section className="company-section company-saved" aria-labelledby="company-saved-title">
      <h2 id="company-saved-title">Registros guardados</h2><p className="helper">Consulta de la copia local. No cambia datos ni consulta servicios externos.</p>
      <TabList label="Tipo de registro guardado" prefix="company-records" tabs={entities} value={entity} onChange={chooseEntity}/>
      <div {...tabPanelProps('company-records', entity)}>
        <label className="field company-search"><span>Buscar en los registros guardados</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }}/></label>
        {!matches.length ? <p className="company-empty" role="status">{query ? 'Ningún registro coincide con la búsqueda.' : 'No hay registros de este tipo en la copia local de esta empresa.'}</p> : <><div className="company-table-scroll" tabIndex={0} role="region" aria-label="Lista de registros guardados"><table><thead><tr><th>Nombre</th><th>{entity === 'contacts' ? 'Correo' : entity === 'companies' ? 'Dominio' : entity === 'deals' ? 'Etapa guardada' : 'Estado guardado'}</th><th>Revisión</th></tr></thead><tbody>{matches.slice(0, limit).map(record => <tr key={record.id}><td data-label="Nombre">{recordName(record)}</td><td data-label={entity === 'contacts' ? 'Correo' : entity === 'companies' ? 'Dominio' : entity === 'deals' ? 'Etapa guardada' : 'Estado guardado'}>{recordDetail(record)}</td><td data-label="Revisión">{record.version}</td></tr>)}</tbody></table></div><p className="helper">{Math.min(limit, matches.length)} de {matches.length} registros</p>{matches.length > limit ? <button type="button" className="text-button" onClick={() => setLimit(value => value + 50)}>Mostrar más registros</button> : null}</>}
      </div>
    </section>
    {overview.jobs.length ? <section className="company-section"><h2>Últimos trabajos</h2><ul className="company-jobs">{overview.jobs.slice(0, 3).map(job => <li key={job.id}><span>{job.kind === 'hubspot-capture' ? 'Captura HubSpot' : 'Comprobación de sincronización'}</span><strong>{jobLabels[job.status]}</strong></li>)}</ul></section> : null}
  </div>;
}
