import type { ReactNode } from 'react';
import { CalendarDays, Home, LayoutGrid, ListTodo, Users } from 'lucide-react';
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

/** Navegación inferior para pantallas estrechas (solo visible por CSS a ≤ 760 px): los cuatro destinos más usados
 *  y «Más», que abre la paleta con todos los apartados y acciones. */
export function MobileNav({ page, entityName, runtime, ready, overdue, go, openEntity, openMore }: {
  page: PageId; entityName: EntityName; runtime: boolean; ready: boolean; overdue: number | null;
  go: (page: PageId) => void; openEntity: (entity: EntityName) => void; openMore: () => void;
}) {
  const item = (label: string, active: boolean, onClick: () => void, icon: ReactNode, disabled = false, badge?: number | null) =>
    <button type="button" className="gx-mnav-item" aria-current={active ? 'page' : undefined} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span>{badge ? <i aria-label={badge + ' vencidas'}>{badge}</i> : null}</button>;
  return <nav className="gx-mnav" aria-label="Navegación rápida">
    {item('Inicio', page === 'home', () => go('home'), <Home size={18} aria-hidden="true" />)}
    {!runtime ? item('Hoy', page === 'today', () => go('today'), <CalendarDays size={18} aria-hidden="true" />, false, overdue) : null}
    {item('Clientes', page === 'workspace' && entityName === 'contacts', () => openEntity('contacts'), <Users size={18} aria-hidden="true" />, !ready)}
    {item('Tareas', page === 'workspace' && entityName === 'tasks', () => openEntity('tasks'), <ListTodo size={18} aria-hidden="true" />, !ready)}
    {item('Más', false, openMore, <LayoutGrid size={18} aria-hidden="true" />)}
  </nav>;
}
