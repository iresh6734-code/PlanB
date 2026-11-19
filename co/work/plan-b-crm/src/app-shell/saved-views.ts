import type { AppState, CrmRecord, EntityName } from '../../shared/model.js';

/** Vistas de las listas de registros.
 *  · Inteligentes: preguntas frecuentes ya resueltas («Vencidas», «Más de 3.000 €», «Sin correo»…), según los campos que la
 *    especificación tenga de verdad; si falta el campo, la vista no aparece.
 *  · Guardadas: búsqueda, filtro rápido, orden y vista inteligente con un nombre, en este navegador (nunca datos de registros).
 *  Las dos filtran los registros ya cargados; la búsqueda guardada sí vuelve a pedir al servidor. */
type Spec = NonNullable<AppState['spec']>;
type Entity = Spec['entities'][number];
export interface SmartContext { today: string; looksDone: (record: CrmRecord) => boolean }
export interface SmartView { id: string; label: string; hint: string; test: (record: CrmRecord, context: SmartContext) => boolean }
export interface SavedView { id: string; name: string; query: string; pick: string | null; sort: { key: string; dir: 1 | -1 } | null; smart: string | null }

const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

export function smartViews(entityName: EntityName, entity: Entity, spec: Spec): SmartView[] {
  const has = (key: string | undefined) => !!key && entity.fields.some(field => field.key === key);
  const views: SmartView[] = [];
  if (entityName === 'tasks') {
    const due = spec.roles?.dueDate ?? 'due_date';
    if (has(due)) {
      views.push({ id: 'overdue', label: 'Vencidas', hint: 'Fecha límite anterior a hoy y sin cerrar', test: (record, context) => isDate(record.values[due]) && String(record.values[due]).slice(0, 10) < context.today && !context.looksDone(record) });
      views.push({ id: 'today', label: 'Para hoy', hint: 'Fecha límite hoy y sin cerrar', test: (record, context) => isDate(record.values[due]) && String(record.values[due]).slice(0, 10) === context.today && !context.looksDone(record) });
      views.push({ id: 'no-date', label: 'Sin fecha', hint: 'Tareas abiertas sin fecha límite', test: (record, context) => empty(record.values[due]) && !context.looksDone(record) });
    }
  }
  if (entityName === 'deals') {
    const amount = spec.roles?.amount ?? 'amount';
    if (has(amount)) {
      views.push({ id: 'big', label: 'Más de 3.000 €', hint: 'Importe superior a 3.000 €', test: record => Number(record.values[amount]) > 3000 });
      views.push({ id: 'no-amount', label: 'Sin importe', hint: 'Oportunidades sin importe', test: record => empty(record.values[amount]) || Number(record.values[amount]) === 0 });
    }
  }
  if (entityName === 'contacts' || entityName === 'companies') {
    const email = entity.fields.find(field => field.type === 'email');
    const phone = entity.fields.find(field => /phone|tel[eé]fono|m[oó]vil/i.test(field.key + ' ' + field.label));
    if (email) views.push({ id: 'no-email', label: 'Sin correo', hint: 'Sin ' + email.label.toLowerCase(), test: record => empty(record.values[email.key]) });
    if (phone) views.push({ id: 'no-phone', label: 'Sin teléfono', hint: 'Sin ' + phone.label.toLowerCase(), test: record => empty(record.values[phone.key]) });
  }
  return views;
}

const KEY = (entity: EntityName) => 'planb:views:' + entity;
export const MAX_SAVED = 8;

/** Lee las vistas guardadas descartando lo que no tenga la forma esperada (almacenamiento antiguo o manipulado). */
export function readSavedViews(entity: EntityName, storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): SavedView[] {
  try {
    const raw = JSON.parse(storage?.getItem(KEY(entity)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim() && typeof item.query === 'string')
      .map(item => ({ id: item.id, name: String(item.name).slice(0, 40), query: String(item.query).slice(0, 160), pick: typeof item.pick === 'string' ? item.pick : null,
        sort: item.sort && typeof item.sort.key === 'string' && (item.sort.dir === 1 || item.sort.dir === -1) ? { key: item.sort.key, dir: item.sort.dir } : null,
        smart: typeof item.smart === 'string' ? item.smart : null }))
      .slice(0, MAX_SAVED);
  } catch { return []; }
}
export function writeSavedViews(entity: EntityName, views: SavedView[], storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.setItem(KEY(entity), JSON.stringify(views.slice(0, MAX_SAVED))); return true; } catch { return false; }
}

export type ViewState = Omit<SavedView, 'id' | 'name'>;
/** Una vista guardada está «aplicada» si lo que se ve coincide con ella (la búsqueda se compara sin espacios sobrantes). */
export const sameView = (view: ViewState, current: ViewState) => view.query.trim() === current.query.trim() && view.pick === current.pick && view.smart === current.smart
  && (view.sort?.key ?? null) === (current.sort?.key ?? null) && (view.sort?.dir ?? null) === (current.sort?.dir ?? null);
/** Añade (o sustituye por nombre, sin distinguir mayúsculas) y deja la más reciente primero. */
export function addSavedView(views: SavedView[], name: string, state: ViewState, id: string): SavedView[] {
  const clean = name.trim().slice(0, 40);
  if (!clean) return views;
  const rest = views.filter(view => view.name.toLocaleLowerCase('es') !== clean.toLocaleLowerCase('es'));
  return [{ id, name: clean, ...state, query: state.query.trim() }, ...rest].slice(0, MAX_SAVED);
}
/** Resumen legible de lo que guarda una vista, para su título y para lectores de pantalla. */
export function describeView(view: ViewState, labels: { pick?: (id: string) => string | undefined; sort?: (key: string) => string | undefined; smart?: (id: string) => string | undefined }) {
  const parts: string[] = [];
  if (view.query.trim()) parts.push('búsqueda «' + view.query.trim() + '»');
  if (view.smart) parts.push(labels.smart?.(view.smart) ?? view.smart);
  if (view.pick) parts.push(labels.pick?.(view.pick) ?? view.pick);
  if (view.sort) parts.push('orden por ' + (labels.sort?.(view.sort.key) ?? view.sort.key).toLowerCase() + (view.sort.dir === 1 ? ' ↑' : ' ↓'));
  return parts.length ? parts.join(' · ') : 'todos los registros';
}
