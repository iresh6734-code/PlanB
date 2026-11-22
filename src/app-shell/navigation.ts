// Navegación de la App local en cinco lugares. El Laboratorio se aparcó el 22/11/2026 (rama archivo/aparcado-2026-11-22).
// Lógica pura: qué grupos y entradas se ven y a qué grupo pertenece cada apartado. Sin React ni CSS, para poder probarla.
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

export type GroupId = 'home' | 'today' | 'clients' | 'continuity' | 'settings';

/** Destino de una entrada: un apartado, un tipo de registro, la ventana del proveedor de IA o la preparación. */
export type NavTarget = { kind: 'page'; page: PageId } | { kind: 'entity'; entity: EntityName } | { kind: 'settings' } | { kind: 'prepare' };

export type NavItem = { id: string; label: string; target: NavTarget; badge?: 'overdue' | 'changes' | 'copy'; needsReady?: boolean };
export type NavGroup = { id: GroupId; label: string; target: NavTarget; items: NavItem[]; badge?: NavItem['badge']; needsReady?: boolean };

export type NavContext = {
  /** Copia independiente (paquete portátil): sin Hoy, Agentes, Integraciones, copia de equipo ni preparación. */ runtime: boolean;
  /** La copia activa es de datos de prueba: solo entonces se ofrece el proveedor de IA. */ testData: boolean;
  /** Hay copia con datos, reglas y aplicación activadas. */ ready: boolean;
  /** El servidor local ya ha comunicado un origen de equipo configurado. */ teamConfigured?: boolean;
};

/** Grupos visibles, en orden. Como máximo cinco. */
export function navigationGroups(context: NavContext): NavGroup[] {
  const groups: NavGroup[] = [{ id: 'home', label: 'Inicio', target: { kind: 'page', page: 'home' }, items: [] }];
  if (!context.runtime) groups.push({ id: 'today', label: 'Hoy', target: { kind: 'page', page: 'today' }, badge: 'overdue', items: [
    { id: 'today', label: 'Tareas de hoy', target: { kind: 'page', page: 'today' }, badge: 'overdue' },
    { id: 'week', label: 'Revisión semanal', target: { kind: 'page', page: 'week' }, needsReady: true },
    { id: 'agenda', label: 'Agenda', target: { kind: 'page', page: 'agenda' }, needsReady: true },
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
    ...(!context.runtime && context.teamConfigured ? [{ id: 'team-sync', label: 'Copia de equipo', target: { kind: 'page', page: 'team-sync' } } satisfies NavItem] : []),
    ...(!context.runtime ? [{ id: 'prepare', label: 'Configurar Plan B', target: { kind: 'prepare' } } satisfies NavItem] : []),
  ] });
  const settings: NavItem[] = [
    ...(!context.runtime ? [{ id: 'integrations', label: 'Integraciones', target: { kind: 'page', page: 'integrations' } } satisfies NavItem] : []),
    ...(!context.runtime && context.testData ? [{ id: 'provider', label: 'Proveedor de IA', target: { kind: 'settings' } } satisfies NavItem] : []),
    ...(!context.runtime ? [{ id: 'plan', label: 'Plan y licencia', target: { kind: 'page', page: 'plan' } } satisfies NavItem] : []),
  ];
  if (settings.length) groups.push({ id: 'settings', label: 'Ajustes', target: settings[0].target, items: settings });
  return groups;
}

/** Grupo al que pertenece el apartado que se está viendo (para marcarlo y desplegarlo). */
export function groupOfPage(page: PageId): GroupId {
  switch (page) {
    case 'home': return 'home';
    case 'today': case 'week': case 'agenda': case 'agents': return 'today';
    case 'workspace': return 'clients';
    case 'continuity': case 'changes': case 'export': case 'team-sync': case 'prepare': return 'continuity';
    case 'integrations': case 'plan': return 'settings';
  }
}

/** ¿Está activa esta entrada? Las de registros dependen también del tipo abierto. */
/**
 * Qué hace pulsar la cabecera de un grupo (CLAUDE-NAV-GROUP-RETURN, 19/11/2026): ir a su primer apartado si estás fuera
 * del grupo o dentro pero en otro apartado (desde Propuestas, «Hoy» vuelve a la cola de Hoy); solo pliega o despliega
 * si ya estás en ese primer apartado. Lógica pura.
 */
export function headerPress(group: NavGroup, page: PageId, entity: EntityName): 'go' | 'toggle' {
  if (!group.items.length || groupOfPage(page) !== group.id) return 'go';
  return itemActive(group.items[0], page, entity) ? 'toggle' : 'go';
}

export function itemActive(item: NavItem, page: PageId, entity: EntityName): boolean {
  if (item.target.kind === 'entity') return page === 'workspace' && entity === item.target.entity;
  if (item.target.kind === 'page') return page === item.target.page;
  if (item.target.kind === 'prepare') return page === 'prepare';
  return false;
}

/**
 * Apartado al que hay que ir si el recordado ya no existe en esta copia: Hoy, Propuestas, Integraciones y copia de
 * equipo en una copia independiente. null = el apartado sirve.
 */
export function fallbackPage(page: PageId, context: NavContext): PageId | null {
  if (context.runtime && (page === 'today' || page === 'week' || page === 'agenda' || page === 'agents' || page === 'integrations' || page === 'team-sync' || page === 'plan')) return 'home';
  return null;
}
