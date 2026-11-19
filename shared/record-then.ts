import { canonical, clip, compare, type ValuePreview } from './capture-comparison.js';
import type { CrmRecord, CrmSnapshot, EntityName } from './model.js';

export const THEN_FIELD_LIMIT = 80;
export interface FieldThen { key: string; then: ValuePreview; now: ValuePreview }
export interface RecordThen {
  /** The record was in that capture. */
  present: boolean;
  fields: FieldThen[];
  unchanged: number;
  total: number;
  truncated: boolean;
}

function preview(values: CrmRecord['values'] | undefined, key: string): ValuePreview {
  const present = !!values && Object.hasOwn(values, key), value = present ? values![key] : null;
  return { present, value: typeof value === 'string' ? clip(value, 500) : value, truncated: typeof value === 'string' && value.length > 500 };
}

/** «Ver cómo estaba»: how one record looked in a saved capture against how it is now in the local copy.
 *  Pure and read-only. A record missing from the capture never proves anything about the remote CRM. */
export function recordThen(snapshot: CrmSnapshot, entity: EntityName, id: string, now: CrmRecord | null, order: string[] = []): RecordThen {
  const then = snapshot.records.find(record => record.entity === entity && record.id === id);
  if (!then) return { present: false, fields: [], unchanged: 0, total: 0, truncated: false };
  const keys = new Set([...Object.keys(then.values), ...Object.keys(now?.values ?? {})]);
  const known = order.length ? order : snapshot.entities.find(item => item.id === entity)?.fields.map(field => field.key) ?? [];
  const rank = new Map(known.map((key, index) => [key, index]));
  const position = (key: string) => rank.get(key) ?? known.length;
  const fields: FieldThen[] = [];
  let unchanged = 0;
  for (const key of [...keys].sort((a, b) => position(a) - position(b) || compare(a, b))) {
    const before = Object.hasOwn(then.values, key), after = !!now && Object.hasOwn(now.values, key);
    if (before === after && (!before || canonical(then.values[key]) === canonical(now!.values[key]))) { unchanged++; continue; }
    fields.push({ key, then: preview(then.values, key), now: preview(now?.values, key) });
  }
  return { present: true, fields: fields.slice(0, THEN_FIELD_LIMIT), unchanged, total: fields.length, truncated: fields.length > THEN_FIELD_LIMIT };
}
