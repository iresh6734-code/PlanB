import type { ReactNode } from 'react';
import { CalendarDays, Home, LayoutGrid, ShieldCheck, Users } from 'lucide-react';
import type { EntityName } from '../../shared/model.js';
import { groupOfPage } from './navigation.js';
import type { PageId } from './session.js';

/** Navegación inferior para pantallas estrechas (solo visible por CSS a ≤ 760 px): los mismos lugares que el menú
 *  (Inicio, Hoy, Clientes y Continuidad) y «Más», que abre la paleta con todos los apartados y acciones. */
export function MobileNav({ page, runtime, ready, overdue, go, openEntity, openMore }: {
  page: PageId; entityName: EntityName; runtime: boolean; ready: boolean; overdue: number | null;
  go: (page: PageId) => void; openEntity: (entity: EntityName) => void; openMore: () => void;
}) {
  const current = groupOfPage(page);
  const item = (label: string, active: boolean, onClick: () => void, icon: ReactNode, disabled = false, badge?: number | null) =>
    <button type="button" className="gx-mnav-item" aria-current={active ? 'page' : undefined} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span>{badge ? <i aria-label={badge + ' vencidas'}>{badge}</i> : null}</button>;
  return <nav className="gx-mnav" aria-label="Navegación rápida">
    {item('Inicio', current === 'home', () => go('home'), <Home size={18} aria-hidden="true" />)}
    {!runtime ? item('Hoy', current === 'today', () => go('today'), <CalendarDays size={18} aria-hidden="true" />, false, overdue) : null}
    {item('Clientes', current === 'clients', () => openEntity('contacts'), <Users size={18} aria-hidden="true" />, !ready)}
    {item('Continuidad', current === 'continuity', () => go('continuity'), <ShieldCheck size={18} aria-hidden="true" />)}
    {item('Más', false, openMore, <LayoutGrid size={18} aria-hidden="true" />)}
  </nav>;
}
