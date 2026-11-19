// F5 del super plan 2 · Recientes y anclados. En este navegador solo se guardan el tipo y el ID de cada registro, por copia;
// el nombre se lee de la copia al mostrarlo (nunca se guardan datos de registros). Lógica pura.
import { entityNames, type EntityName } from '../../shared/model.js';

export type RecordRef = { entity: EntityName; id: string };
export type RecordShortcuts = { recent: RecordRef[]; pinned: RecordRef[] };
export const RECENT_MAX = 8, PINNED_MAX = 12;
export const EMPTY_SHORTCUTS: RecordShortcuts = { recent: [], pinned: [] };

export const refKey = (ref: RecordRef) => ref.entity + ':' + ref.id;
const same = (a: RecordRef, b: RecordRef) => a.entity === b.entity && a.id === b.id;
/** Una clave por copia: los ID de una copia no significan nada en otra. */
export const shortcutsKey = (scope: string) => 'planb:records:shortcuts:' + scope.replace(/[^\w:.-]/g, '').slice(0, 80);

function clean(list: unknown, max: number): RecordRef[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>(), out: RecordRef[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { entity, id } = item as Record<string, unknown>;
    if (!entityNames.includes(entity as EntityName) || typeof id !== 'string' || !id || id.length > 200 || id === 'new') continue;
    const ref = { entity: entity as EntityName, id };
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref)); out.push(ref);
  }
  return out.slice(0, max);
}

/** Lee recientes y anclados descartando lo que no tenga la forma esperada (almacenamiento antiguo o manipulado). */
export function readShortcuts(scope: string, storage?: Pick<Storage, 'getItem'> | null): RecordShortcuts {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    const raw = JSON.parse(store?.getItem(shortcutsKey(scope)) ?? 'null') as Record<string, unknown> | null;
    return raw && typeof raw === 'object' ? { recent: clean(raw.recent, RECENT_MAX), pinned: clean(raw.pinned, PINNED_MAX) } : EMPTY_SHORTCUTS;
  } catch { return EMPTY_SHORTCUTS; }
}
export function writeShortcuts(scope: string, value: RecordShortcuts, storage?: Pick<Storage, 'setItem'> | null): boolean {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    if (!store) return false;
    store.setItem(shortcutsKey(scope), JSON.stringify({ recent: clean(value.recent, RECENT_MAX), pinned: clean(value.pinned, PINNED_MAX) }));
    return true;
  } catch { return false; }
}

/** Registro abierto: pasa a ser el primero de los recientes (sin repetir y como mucho RECENT_MAX). */
export function rememberOpened(shortcuts: RecordShortcuts, ref: RecordRef): RecordShortcuts {
  if (!ref.id || ref.id === 'new') return shortcuts;
  if (shortcuts.recent[0] && same(shortcuts.recent[0], ref)) return shortcuts;
  return { ...shortcuts, recent: [ref, ...shortcuts.recent.filter(item => !same(item, ref))].slice(0, RECENT_MAX) };
}

export const isPinned = (shortcuts: RecordShortcuts, ref: RecordRef) => shortcuts.pinned.some(item => same(item, ref));

/** Ancla o desancla. Con los PINNED_MAX huecos ocupados no ancla (`full`): mejor avisar que expulsar uno sin preguntar. */
export function togglePin(shortcuts: RecordShortcuts, ref: RecordRef): { shortcuts: RecordShortcuts; pinned: boolean; full: boolean } {
  if (isPinned(shortcuts, ref)) return { shortcuts: { ...shortcuts, pinned: shortcuts.pinned.filter(item => !same(item, ref)) }, pinned: false, full: false };
  if (shortcuts.pinned.length >= PINNED_MAX) return { shortcuts, pinned: false, full: true };
  return { shortcuts: { ...shortcuts, pinned: [...shortcuts.pinned, ref] }, pinned: true, full: false };
}

/** Mueve un anclado una posición (−1 arriba, +1 abajo); fuera de rango no cambia nada. */
export function movePinned(shortcuts: RecordShortcuts, ref: RecordRef, step: -1 | 1): RecordShortcuts {
  const index = shortcuts.pinned.findIndex(item => same(item, ref)), target = index + step;
  if (index < 0 || target < 0 || target >= shortcuts.pinned.length) return shortcuts;
  const pinned = [...shortcuts.pinned];
  [pinned[index], pinned[target]] = [pinned[target], pinned[index]];
  return { ...shortcuts, pinned };
}

/** Para mostrar: primero los anclados y luego los recientes que no estén anclados. */
export const shortcutRefs = (shortcuts: RecordShortcuts) => [
  ...shortcuts.pinned.map(ref => ({ ref, pinned: true })),
  ...shortcuts.recent.filter(ref => !isPinned(shortcuts, ref)).map(ref => ({ ref, pinned: false })),
];
