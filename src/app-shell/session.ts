import type { EntityName } from '../../shared/model.js';

/** Apartados de la App local. */
export const PAGES = ['home', 'continuity', 'changes', 'prepare', 'workspace', 'export', 'today', 'week', 'agenda', 'agents', 'integrations', 'plan'] as const;
export type PageId = typeof PAGES[number];

// Recordar dónde estabas: solo el apartado y el tipo de registro, en la sesión de esta pestaña. Nunca datos.
const stored = (key: string) => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key); } catch { return null; } };
export const storedPage = (): PageId => { const value = stored('planb:page'); return value && value !== 'prepare' && (PAGES as readonly string[]).includes(value) ? value as PageId : 'home'; };
export const storedEntity = (): EntityName => { const value = stored('planb:entity'); return value === 'companies' || value === 'deals' || value === 'tasks' ? value : 'contacts'; };
export const rememberPlace = (page: PageId, entity: EntityName) => { try { sessionStorage.setItem('planb:page', page); sessionStorage.setItem('planb:entity', entity); } catch { /* sin almacenamiento de sesión: se abre en Inicio */ } };

export const eur = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
