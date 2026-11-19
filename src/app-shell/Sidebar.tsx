import { useEffect, useState, type ComponentType } from 'react';
import { ArrowRight, Building2, CalendarCheck, CalendarDays, ChevronDown, Download, FlaskConical, GitBranch, Home, Inbox, ListTodo, PlugZap, Radar, Search, Settings2, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import type { AppState, EntityName } from '../../shared/model.js';
import { APP_VERSION } from '../../shared/version.js';
import { Brand } from '../components.js';
import { PreparationNavigation } from '../PreparationNavigation.js';
import { groupOfPage, headerPress, itemActive, navigationGroups, type GroupId, type NavGroup, type NavItem, type NavTarget } from './navigation.js';
import type { PageId } from './session.js';
import type { ReadinessSignal } from './continuity-insights.js';

type Toggle = (update: (open: boolean) => boolean) => void;
type Signals = { overdue: number | null; atRisk: number | null; copy?: { count: number; tone: 'danger' | 'warn'; titles: string[] } | null; readiness?: ReadinessSignal | null };
type Props = {
  state: AppState; page: PageId; entityName: EntityName;
  /** Hay una ficha abierta: la búsqueda global se desactiva. */ selected: boolean;
  /** Recuentos para los avisos del menú; null = sin dato. */ signals: Signals;
  step: number; preparationOpen: boolean;
  setPage: (page: PageId) => void; setSelected: (value: null) => void; setPreparationOpen: Toggle;
  setGlobalSearch: (open: boolean) => void; setModal: (modal: 'settings') => void;
  openEntity: (entity: EntityName) => void; openPreparation: (step?: number) => void;
};

const GROUP_ICON: Record<GroupId, ComponentType<{ size?: number }>> = { home: Home, today: CalendarDays, clients: Users, continuity: ShieldCheck, settings: SlidersHorizontal, lab: FlaskConical };
const ITEM_ICON: Record<string, ComponentType<{ size?: number }>> = {
  today: CalendarDays, agents: Inbox, contacts: Users, companies: Building2, deals: GitBranch, tasks: ListTodo,
  continuity: ShieldCheck, changes: GitBranch, export: Download, 'team-sync': Building2, integrations: PlugZap, provider: Settings2, radar: Radar, 'date-check': CalendarCheck,
};

/**
 * Navegación principal en cinco lugares (Inicio, Hoy, Clientes, Continuidad y Ajustes) más el Laboratorio cuando la
 * copia es de datos de prueba (CLAUDE-UI-NAV-LAB). Solo cambia de apartado; no lee ni guarda datos.
 */
export function Sidebar({ state, page, entityName, selected, signals, step, preparationOpen, setPage, setSelected, setPreparationOpen, setGlobalSearch, setModal, openEntity, openPreparation }: Props) {
  const context = { runtime: !!state.runtime, testData: state.snapshot?.source.isTestData !== false, ready: !!state.ready };
  const groups = navigationGroups(context), current = groupOfPage(page);
  const [open, setOpen] = useState<Set<GroupId>>(() => new Set([current]));
  // Al cambiar de lugar queda desplegado solo el suyo (el menú no crece al navegar); dentro del mismo lugar se respeta lo que la persona abra o cierre.
  useEffect(() => { setOpen(new Set([current])); }, [current]);

  const badgeOf = (badge: NavItem['badge']) => {
    if (badge === 'overdue' && signals.overdue) return <span className="gx-badge" data-tone="danger" aria-hidden="true" title={signals.overdue + (signals.overdue === 1 ? ' tarea vencida' : ' tareas vencidas')}>{signals.overdue}</span>;
    if (badge === 'changes' && state.changes) return <span className="gx-badge" aria-hidden="true" title={state.changes + (state.changes === 1 ? ' cambio local' : ' cambios locales')}>{state.changes}</span>;
    if (badge === 'copy' && signals.copy) return <span className="gx-badge" data-tone={signals.copy.tone} aria-hidden="true" title={signals.copy.titles.join(' · ')}>{signals.copy.count}</span>;
    if (badge === 'atRisk' && signals.atRisk) return <span className="gx-badge" data-tone="danger" aria-hidden="true" title={signals.atRisk + (signals.atRisk === 1 ? ' compromiso en riesgo' : ' compromisos en riesgo')}>{signals.atRisk}</span>;
    return null;
  };
  // Punto de preparación junto a «Continuidad»: el mismo veredicto que Inicio. Oculto al lector (ya lo lee en Inicio) para no cambiar el nombre del botón.
  const readinessDot = (group: NavGroup) => group.id === 'continuity' && signals.readiness
    ? <span className="gx-ready-dot" data-tone={signals.readiness.tone} aria-hidden="true" title={signals.readiness.title + ' · ' + signals.readiness.progress} />
    : null;
  const go = (target: NavTarget) => {
    if (target.kind === 'entity') openEntity(target.entity);
    else if (target.kind === 'settings') setModal('settings');
    else if (target.kind === 'prepare') openPreparation();
    else { setPage(target.page); setSelected(null); }
  };
  const disabled = (item: { needsReady?: boolean }) => !!item.needsReady && !state.ready;

  const header = (group: NavGroup) => {
    const Icon = GROUP_ICON[group.id], active = current === group.id;
    if (!group.items.length) return <button type="button" className={'nav-item ' + (active ? 'active' : '')} aria-current={active ? 'page' : undefined} onClick={() => go(group.target)}><Icon size={19} />{group.label}</button>;
    const expanded = open.has(group.id), id = 'nav-group-' + group.id;
    // Fuera del grupo, o dentro pero en otro apartado, la cabecera lleva a su primer apartado y lo deja desplegado; ya en
    // él, pliega o despliega (headerPress, CLAUDE-NAV-GROUP-RETURN).
    const press = () => headerPress(group, page, entityName) === 'toggle'
      ? setOpen(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })
      : (go(group.target), setOpen(previous => new Set([...previous, group.id])));
    return <>
      <button type="button" className={'nav-item work-toggle ' + (active ? 'active' : '')} aria-expanded={expanded} aria-controls={id} disabled={disabled(group)} onClick={press}>
        <Icon size={19} /><span>{group.label}</span>{readinessDot(group)}{!expanded ? badgeOf(group.badge) : null}<ChevronDown size={15} aria-hidden="true" className={expanded ? 'expanded' : ''} />
      </button>
      <div id={id} className={'work-disclosure ' + (expanded ? 'is-open' : '')} aria-hidden={!expanded} inert={!expanded}><div>
        <nav className="work-subnav" aria-label={group.label}>
          {group.items.map(item => {
            if (item.target.kind === 'prepare') return <PreparationNavigation key={item.id} active={page === 'prepare'} expanded={preparationOpen} step={step} hasSnapshot={!!state.snapshot}
              onToggle={() => page === 'prepare' ? setPreparationOpen(value => !value) : openPreparation()} onStep={next => openPreparation(next)} />;
            const ItemIcon = ITEM_ICON[item.id] ?? ArrowRight, on = itemActive(item, page, entityName);
            return <button key={item.id} type="button" className={'nav-item ' + (on ? 'active' : '')} aria-current={on ? 'page' : undefined} disabled={disabled(item)} onClick={() => go(item.target)}><ItemIcon size={16} />{item.label}{badgeOf(item.badge)}</button>;
          })}
          {group.id === 'settings' && page === 'prepare' ? <button type="button" className="nav-item" disabled={!state.ready} onClick={() => setPage('workspace')}><ArrowRight size={16} />Abrir aplicación</button> : null}
        </nav>
      </div></div>
    </>;
  };

  const main = groups.filter(group => group.id !== 'lab'), lab = groups.find(group => group.id === 'lab');
  return (
    <aside className="sidebar">
      <Brand />
      <button type="button" className="oc-search" disabled={!state.ready || !!selected} onClick={() => setGlobalSearch(true)}><Search size={16} /><span>Buscar en toda la copia</span></button>
      <nav aria-label="Navegación principal">
        <div className="oc-nav-group" role="group" aria-label="Lugares">{main.map(group => <div key={group.id} className="gx-nav-place">{header(group)}</div>)}</div>
        {lab ? <div className="oc-nav-group gx-nav-lab" role="group" aria-label="Laboratorio">{header(lab)}</div> : null}
      </nav>
      <div className="sidebar-bottom"><span>{state.snapshot?.name ?? 'Tu copia, en tu ordenador'}</span><small>Plan B · v{APP_VERSION}</small></div>
    </aside>
  );
}
