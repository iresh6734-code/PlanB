import { ArrowRight, Bot, Building2, CalendarCheck, CalendarDays, ChevronDown, Download, GitBranch, Home, ListTodo, Lock, PlugZap, Radar, Search, Settings2, ShieldCheck, Users } from 'lucide-react';
import type { AppState, EntityName } from '../../shared/model.js';
import { APP_VERSION } from '../../shared/version.js';
import { Brand } from '../components.js';
import { PreparationNavigation } from '../PreparationNavigation.js';
import { useTheme } from './theme.js';
import type { PageId } from './session.js';

const navigation = [
  { id: 'contacts', label: 'Clientes', icon: Users },
  { id: 'companies', label: 'Empresas', icon: Building2 },
  { id: 'deals', label: 'Oportunidades', icon: GitBranch },
  { id: 'tasks', label: 'Tareas', icon: ListTodo }
] as const;

type Toggle = (update: (open: boolean) => boolean) => void;
type Props = {
  state: AppState; page: PageId; entityName: EntityName;
  /** Hay una ficha abierta: la búsqueda global se desactiva y salir al espacio comercial pide confirmación. */ selected: boolean;
  /** Recuentos para los avisos del menú; null = sin dato. */ signals: { overdue: number | null; atRisk: number | null };
  teamOrigin: string | null; step: number; workOpen: boolean; preparationOpen: boolean;
  setPage: (page: PageId) => void; setSelected: (value: null) => void; setWorkOpen: Toggle; setPreparationOpen: Toggle;
  setGlobalSearch: (open: boolean) => void; setModal: (modal: 'settings') => void;
  openEntity: (entity: EntityName) => void; openPreparation: (step?: number) => void; protect: () => void;
};

/** Navegación principal de la App local. Solo cambia de apartado; no lee ni guarda datos. */
function ThemeSwitch() {
  const [theme, toggle] = useTheme();
  return <button type="button" className="gx-theme-switch" role="switch" aria-checked={theme === 'dark'} onClick={toggle}><span className="gx-theme-track" aria-hidden="true"><span /></span>Modo oscuro</button>;
}
export function Sidebar({ state, page, entityName, selected, signals, teamOrigin, step, workOpen, preparationOpen, setPage, setSelected, setWorkOpen, setPreparationOpen, setGlobalSearch, setModal, openEntity, openPreparation, protect }: Props) {
  return (
    <aside className="sidebar">
      <Brand />
      <button type="button" className="oc-search" disabled={!state.ready || !!selected} onClick={() => setGlobalSearch(true)}><Search size={16}/><span>Buscar en toda la copia</span></button>
      <nav aria-label="Navegación principal">
        <div className="oc-nav-group" role="group" aria-labelledby="oc-nav-trabajo"><p className="oc-nav-caption" id="oc-nav-trabajo">Trabajo</p>
        <button className={'nav-item '+(page==='home'?'active':'')} aria-current={page==='home'?'page':undefined} onClick={()=>{setPage('home');setSelected(null);}}><Home size={19}/>Inicio</button>
        {!state.runtime?<button className={'nav-item '+(page==='today'?'active':'')} aria-current={page==='today'?'page':undefined} onClick={()=>{setPage('today');setSelected(null);}}><CalendarDays size={19}/>Hoy{signals.overdue?<span className="gx-badge" data-tone="danger" aria-hidden="true" title={signals.overdue+(signals.overdue===1?' tarea vencida':' tareas vencidas')}>{signals.overdue}</span>:null}</button>:null}
        <button className={'nav-item work-toggle '+(page==='workspace'?'active':'')} aria-expanded={workOpen} aria-controls="work-navigation" disabled={!state.ready} onClick={()=>page==='workspace'?setWorkOpen(open=>!open):openEntity(entityName)}><Users size={19}/><span>Trabajar</span><ChevronDown size={15} aria-hidden="true" className={workOpen?'expanded':''}/></button>
        <div id="work-navigation" className={'work-disclosure '+(workOpen?'is-open':'')} aria-hidden={!workOpen} inert={!workOpen}><div><nav className="work-subnav" aria-label="Secciones de trabajo">{navigation.map(item=><button key={item.id} className={'nav-item '+(page==='workspace'&&entityName===item.id?'active':'')} aria-current={page==='workspace'&&entityName===item.id?'page':undefined} onClick={()=>openEntity(item.id)}><item.icon size={16}/>{item.label}</button>)}</nav></div></div>
        <button className={'nav-item '+(page==='changes'?'active':'')} aria-current={page==='changes'?'page':undefined} disabled={!state.ready} onClick={()=>{setPage('changes');setSelected(null);}}><GitBranch size={19}/>Cambios{state.changes?<span className="gx-badge" aria-hidden="true" title={state.changes+(state.changes===1?' cambio local':' cambios locales')}>{state.changes}</span>:null}</button>
        {!state.runtime?<button className={'nav-item '+(page==='agents'?'active':'')} aria-current={page==='agents'?'page':undefined} onClick={()=>{setPage('agents');setSelected(null);}}><Bot size={19}/>Agentes</button>:null}
        </div>
        <div className="oc-nav-group" role="group" aria-labelledby="oc-nav-operaciones"><p className="oc-nav-caption" id="oc-nav-operaciones">Operaciones</p>
        <button className={'nav-item '+(page==='radar'?'active':'')} aria-current={page==='radar'?'page':undefined} disabled={!state.ready} onClick={()=>{setPage('radar');setSelected(null);}}><Radar size={19}/>Radar{signals.atRisk?<span className="gx-badge" data-tone="danger" aria-hidden="true" title={signals.atRisk+(signals.atRisk===1?' compromiso en riesgo':' compromisos en riesgo')}>{signals.atRisk}</span>:null}</button>
        <button className={'nav-item '+(page==='date-check'?'active':'')} aria-current={page==='date-check'?'page':undefined} disabled={!state.ready} onClick={()=>{setPage('date-check');setSelected(null);}}><CalendarCheck size={19}/>Comprobar una fecha</button>
        </div>
      </nav>
      <div className="sidebar-secondary">
        <div className="oc-nav-group" role="group" aria-labelledby="oc-nav-copia"><p className="oc-nav-caption" id="oc-nav-copia">Tu copia</p>
        <button className={'nav-item '+(page==='continuity'?'active':'')} aria-current={page==='continuity'?'page':undefined} onClick={()=>{setPage('continuity');setSelected(null);}}><ShieldCheck size={19}/>Continuidad</button>
        {!state.runtime?<button className={'nav-item '+(page==='team-sync'?'active':'')} aria-current={page==='team-sync'?'page':undefined} onClick={()=>{setPage('team-sync');setSelected(null);}}><Building2 size={19}/>Copia de equipo</button>:null}
        <button className={'nav-item ' + (page === 'export' ? 'active' : '')} aria-current={page==='export'?'page':undefined} disabled={!state.ready} onClick={() => { setPage('export'); setSelected(null); }}><Download size={19} />Exportar</button>
        <button className="nav-item" onClick={protect}><Lock size={19}/>Proteger / bloquear</button>
        {!state.runtime&&teamOrigin?<a className="nav-item" href={teamOrigin+'/team?view=company'} onClick={event=>{if(selected&&!confirm('Hay una ficha abierta. ¿Salir del CRM y abrir el espacio comercial?'))event.preventDefault();}}><ArrowRight size={19}/>Espacio comercial</a>:null}
        </div>
        <div className="oc-nav-group" role="group" aria-labelledby="oc-nav-ajustes"><p className="oc-nav-caption" id="oc-nav-ajustes">Ajustes</p>
        {!state.runtime?<button className={'nav-item '+(page==='integrations'?'active':'')} aria-current={page==='integrations'?'page':undefined} onClick={()=>{setPage('integrations');setSelected(null);}}><PlugZap size={19}/>Integraciones</button>:null}
        {!state.runtime&&state.snapshot?.source.isTestData!==false ? <button className="nav-item" onClick={() => setModal('settings')}><Settings2 size={19} />Proveedor de IA</button> : null}
        {!state.runtime ? <PreparationNavigation active={page==='prepare'} expanded={preparationOpen} step={step} hasSnapshot={!!state.snapshot}
          onToggle={()=>page==='prepare'?setPreparationOpen(open=>!open):openPreparation()}
          onStep={next=>openPreparation(next)}/>:null}
        {page === 'prepare' ? <button className="nav-item" disabled={!state.ready} onClick={() => setPage('workspace')}><ArrowRight size={19} />Abrir aplicación</button> : null}
        </div>
      </div>
      <ThemeSwitch />
      <div className="sidebar-bottom"><span className="dot" />{state.snapshot?.source.isTestData===false?'Producción · lectura':'Datos de ensayo'}<small>{state.snapshot?.name ?? 'Tu copia, en tu ordenador'} · v{APP_VERSION}</small></div>
    </aside>
  );
}
