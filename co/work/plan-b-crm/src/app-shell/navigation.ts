// Navegación de la App local en cinco lugares más el Laboratorio (CLAUDE-UI-NAV-LAB, decisión del usuario del 17/11/2026).
// Lógica pura: qué grupos y entradas se ven y a qué grupo pertenece cada apartado. Sin React ni CSS, para poder probarla.
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

export type GroupId = 'home' | 'today' | 'clients' | 'continuity' | 'settings' | 'lab';

/** Destino de una entrada: un apartado, un tipo de registro, la ventana del proveedor de IA o la preparación. */
export type NavTarget = { kind: 'page'; page: PageId } | { kind: 'entity'; entity: EntityName } | { kind: 'settings' } | { kind: 'prepare' };

export type NavItem = { id: string; label: string; target: NavTarget; badge?: 'overdue' | 'changes' | 'copy' | 'atRisk'; needsReady?: boolean };
export type NavGroup = { id: GroupId; label: string; target: NavTarget; items: NavItem[]; badge?: NavItem['badge']; needsReady?: boolean };

export type NavContext = {
  /** Copia independiente (paquete portátil): sin Hoy, Agentes, Integraciones, copia de equipo ni preparación. */ runtime: boolean;
  /** La copia activa es de datos de prueba: solo entonces existe el Laboratorio y se ofrece el proveedor de IA. */ testData: boolean;
  /** Hay copia con datos, reglas y aplicación activadas. */ ready: boolean;
};

/** El Laboratorio (Radar y «Comprobar una fecha») solo funciona con una copia de datos de prueba: el servidor rechaza cualquier otra. */
export const labVisible = (context: Pick<NavContext, 'testData'>) => context.testData;

/** Apartados que pertenecen al Laboratorio. */
export const LAB_PAGES: readonly PageId[] = ['radar', 'date-check'];

/** Grupos visibles, en orden. Como máximo cinco más el Laboratorio. */
export function navigationGroups(context: NavContext): NavGroup[] {
  const groups: NavGroup[] = [{ id: 'home', label: 'Inicio', target: { kind: 'page', page: 'home' }, items: [] }];
  if (!context.runtime) groups.push({ id: 'today', label: 'Hoy', target: { kind: 'page', page: 'today' }, badge: 'overdue', items: [
    { id: 'today', label: 'Tareas de hoy', target: { kind: 'page', page: 'today' }, badge: 'overdue' },
    { id: 'agents', label: 'Propuestas', target: { kind: 'page', page: 'agents' } },
  ] });
  groups.push({ id: 'clients', label: 'Clientes', target: { kind: 'entity', entity: 'contacts' }, needsReady: true, items: [
    { id: 'contacts', label: 'Clientes', target: { kind: 'entity', entity: 'contacts' }, needsReady: true },
    { id: 'companies', label: 'Empresas', target: { kind: 'entity', entity: 'companies' }, needsReady: true },
    { id: 'deals', label: 'Oportunidades', target: { kind: 'entity', entity: 'deals' }, needsReady: true },
    { id: 'tasks', label: 'Tareas', target: { kind: 'entity', entity: 'tasks' }, needsReady: true },
  ] });
  groups.push({ id: 'continuity', label: 'Continuidad', target: { kind: 'page', page: 'continuity' }, badge: 'copy', items: [
    { id: 'continuity', label: 'Estado', target: { kind: 'page', page: 'continuity' }, badge: 'copy' },
    { id: 'changes', label: 'Cambios', target: { kind: 'page', page: 'changes' }, badge: 'changes', needsReady: true },
    { id: 'export', label: 'Exportar', target: { kind: 'page', page: 'export' }, needsReady: true },
    ...(!context.runtime ? [{ id: 'team-sync', label: 'Copia de equipo', target: { kind: 'page', page: 'team-sync' } } satisfies NavItem] : []),
  ] });
  const settings: NavItem[] = [
    ...(!context.runtime ? [{ id: 'integrations', label: 'Integraciones', target: { kind: 'page', page: 'integrations' } } satisfies NavItem] : []),
    ...(!context.runtime && context.testData ? [{ id: 'provider', label: 'Proveedor de IA', target: { kind: 'settings' } } satisfies NavItem] : []),
    ...(!context.runtime ? [{ id: 'prepare', label: 'Preparación', target: { kind: 'prepare' } } satisfies NavItem] : []),
  ];
  if (settings.length) groups.push({ id: 'settings', label: 'Ajustes', target: settings[0].target, items: settings });
  if (labVisible(context)) groups.push({ id: 'lab', label: 'Laboratorio', target: { kind: 'page', page: 'radar' }, badge: 'atRisk', needsReady: true, items: [
    { id: 'radar', label: 'Radar', target: { kind: 'page', page: 'radar' }, badge: 'atRisk', needsReady: true },
    { id: 'date-check', label: 'Comprobar una fecha', target: { kind: 'page', page: 'date-check' }, needsReady: true },
  ] });
  return groups;
}

/** Grupo al que pertenece el apartado que se está viendo (para marcarlo y desplegarlo). */
export function groupOfPage(page: PageId): GroupId {
  switch (page) {
    case 'home': return 'home';
    case 'today': case 'agents': return 'today';
    case 'workspace': return 'clients';
    case 'continuity': case 'changes': case 'export': case 'team-sync': return 'continuity';
    case 'integrations': case 'prepare': return 'settings';
    case 'radar': case 'date-check': return 'lab';
  }
}

/** ¿Está activa esta entrada? Las de registros dependen también del tipo abierto. */
export function itemActive(item: NavItem, page: PageId, entity: EntityName): boolean {
  if (item.target.kind === 'entity') return page === 'workspace' && entity === item.target.entity;
  if (item.target.kind === 'page') return page === item.target.page;
  if (item.target.kind === 'prepare') return page === 'prepare';
  return false;
}

/**
 * Apartado al que hay que ir si el recordado ya no existe en esta copia: el Laboratorio sin datos de prueba, o
 * Hoy, Propuestas, Integraciones y copia de equipo en una copia independiente. null = el apartado sirve.
 */
export function fallbackPage(page: PageId, context: NavContext): PageId | null {
  if (LAB_PAGES.includes(page) && !labVisible(context)) return 'home';
  if (context.runtime && (page === 'today' || page === 'agents' || page === 'integrations' || page === 'team-sync')) return 'home';
  return null;
}
