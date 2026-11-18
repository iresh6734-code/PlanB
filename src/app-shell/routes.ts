// Direcciones de la App local (mejora B1 del informe; CLAUDE-URL-ROUTES, 17/11/2026). Lógica pura y sin dependencias:
// cada apartado y cada ficha tienen una dirección propia, así se pueden enlazar, recargar y recorrer con Atrás/Adelante.
// La raíz «/» no fija apartado (se abre el recordado). «/team» pertenece a la App de equipo y no pasa por aquí.
import type { EntityName } from '../../shared/model.js';
import type { PageId } from './session.js';

export type Place = { page: PageId; entity?: EntityName; recordId?: string };

const ENTITY_PATH: Record<EntityName, string> = { contacts: 'clientes', companies: 'empresas', deals: 'oportunidades', tasks: 'tareas' };
const PAGE_PATH: Record<Exclude<PageId, 'workspace'>, string> = {
  home: '/inicio', today: '/hoy', agents: '/hoy/propuestas',
  continuity: '/continuidad', changes: '/continuidad/cambios', export: '/continuidad/exportar', 'team-sync': '/continuidad/equipo',
  integrations: '/ajustes/integraciones', prepare: '/ajustes/preparacion',
  radar: '/laboratorio/radar', 'date-check': '/laboratorio/fecha',
};

/** Dirección de un lugar. Los registros llevan su ID codificado; una ficha nueva no tiene dirección propia. */
export function pathOf(place: Place): string {
  if (place.page !== 'workspace') return PAGE_PATH[place.page];
  const base = '/' + ENTITY_PATH[place.entity ?? 'contacts'];
  return place.recordId ? base + '/' + encodeURIComponent(place.recordId) : base;
}

/** Lugar de una dirección, o null si no es de la App (raíz, rutas desconocidas o mal formadas). */
export function placeOf(pathname: string): Place | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return null;
  for (const [page, value] of Object.entries(PAGE_PATH) as [PageId, string][]) if (path === value) return { page };
  const parts = path.split('/').filter(Boolean);
  const entity = (Object.entries(ENTITY_PATH) as [EntityName, string][]).find(([, value]) => value === parts[0])?.[0];
  if (!entity || parts.length > 2) return null;
  if (parts.length === 1) return { page: 'workspace', entity };
  let recordId: string;
  try { recordId = decodeURIComponent(parts[1]); } catch { return null; }
  return recordId && recordId.length <= 200 ? { page: 'workspace', entity, recordId } : null;
}

/** Mismo lugar (para no apilar entradas repetidas en el historial). */
export const samePlace = (a: Place | null, b: Place | null) => !!a && !!b && pathOf(a) === pathOf(b);

/**
 * ¿Sigue queriendo la persona la ficha pedida por la dirección? (R2, revisión 411 de Codex). Solo mientras siga en la
 * lista de ese tipo de registro: si se va a Inicio, a otro tipo o a otro apartado, la lectura pendiente se retira y ni
 * su resultado ni su error tocan la vista. Lógica pura.
 */
export const pendingStillWanted = (pending: { entity: EntityName }, current: { page: PageId; entity: EntityName }) =>
  current.page === 'workspace' && current.entity === pending.entity;
