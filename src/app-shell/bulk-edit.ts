// Cambio en bloque (V3 del super plan): plan, ejecución uno a uno y deshacer del lote. Lógica pura, sin React ni red.
import type { AppState, CrmRecord } from '../../shared/model.js';

type Entity = NonNullable<AppState['spec']>['entities'][number];
type Field = Entity['fields'][number];
export type BulkItem = { record: CrmRecord; key: string; before: string | null; after: string | null };
export type BulkResult = { done: BulkItem[]; failed: { item: BulkItem; reason: string }[]; cancelled: number };
export const MAX_BULK = 200;

const text = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : String(value);

/** Campos que se pueden cambiar a la vez: listas y fechas editables, nunca el nombre del registro. */
export function bulkFields(entity: Entity): Field[] {
  return entity.fields.filter(field => !field.readOnly && field.key !== entity.displayField && ((field.type === 'enum' && field.options.length > 0) || field.type === 'date'));
}

/** Qué registros cambian de verdad: los que ya tienen ese valor se saltan y no cuentan como cambio. */
export function planBulk(records: CrmRecord[], key: string, value: string | null): { items: BulkItem[]; unchanged: number } {
  const after = text(value), items: BulkItem[] = [];
  let unchanged = 0;
  for (const record of records) {
    const before = text(record.values[key]);
    if (before === after) unchanged++; else items.push({ record, key, before, after });
  }
  return { items, unchanged };
}

/** Guarda uno a uno, en orden. Un fallo no para el lote; cancelar deja sin tocar los que faltaban. */
export async function runBulk(items: BulkItem[], save: (item: BulkItem) => Promise<string | null>, options: { signal?: AbortSignal; onProgress?: (handled: number, total: number) => void } = {}): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [], cancelled: 0 };
  for (const [index, item] of items.entries()) {
    if (options.signal?.aborted) { result.cancelled = items.length - index; break; }
    let reason: string | null;
    try { reason = await save(item); } catch (failure) { reason = failure instanceof Error ? failure.message : String(failure); }
    if (reason) result.failed.push({ item, reason }); else result.done.push(item);
    options.onProgress?.(index + 1, items.length);
  }
  return result;
}

/** El lote al revés: solo lo que se guardó, del último al primero. Parte del registro más reciente que se conozca;
 *  si alguien volvió a cambiar ese campo después del lote, ese registro se deja como está y se cuenta aparte. */
export function undoItems(result: Pick<BulkResult, 'done'>, fresh: (id: string) => CrmRecord | undefined = () => undefined): { items: BulkItem[]; skipped: number } {
  const items: BulkItem[] = [];
  let skipped = 0;
  for (const item of [...result.done].reverse()) {
    const latest = fresh(item.record.id) ?? { ...item.record, values: { ...item.record.values, [item.key]: item.after } };
    if (text(latest.values[item.key]) !== item.after) { skipped++; continue; }
    items.push({ record: latest, key: item.key, before: item.after, after: item.before });
  }
  return { items, skipped };
}

/** Resumen para el aviso: «12 cambiados · 1 sin cambiar: «Ana»: motivo». */
export function bulkSummary(result: BulkResult, nameOf: (record: CrmRecord) => string, undo = false): string {
  const n = result.done.length, one = n === 1;
  const parts = [undo ? 'Deshecho el cambio en ' + n + (one ? ' registro' : ' registros') : n + (one ? ' registro cambiado' : ' registros cambiados')];
  if (result.failed.length) {
    const first = result.failed[0];
    parts.push(result.failed.length + ' sin cambiar (' + '«' + nameOf(first.item.record) + '»: ' + first.reason + (result.failed.length > 1 ? ' y ' + (result.failed.length - 1) + ' más' : '') + ')');
  }
  if (result.cancelled) parts.push(result.cancelled + ' sin intentar por cancelar');
  return parts.join(' · ') + '.';
}
