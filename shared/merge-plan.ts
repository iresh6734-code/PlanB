import type { AppSpec, CrmRecord, FieldValue } from './model.js';

/** F8 «Fusionar duplicados»: lógica pura. La ficha que se queda («principal») puede tomar valores del duplicado campo a campo;
 *  el duplicado no se borra ni se toca: queda apartado para fusionarlo a mano en HubSpot. */
export const MERGE_TAKE_LIMIT = 100;

export type MergeChoice = {
  key: string; label: string;
  keeper: FieldValue; duplicate: FieldValue;
  /** Si se puede traer el valor del duplicado. Un campo de solo lectura o un hueco en el duplicado no se traen. */
  choosable: boolean; reason?: 'readonly' | 'empty';
};
export type MergePlan =
  | { ok: true; values: Record<string, FieldValue>; before: Record<string, FieldValue> }
  | { ok: false; reason: string; field?: string };

const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const valueOf = (record: CrmRecord, key: string): FieldValue => record.values[key] ?? null;
const sameValue = (a: FieldValue, b: FieldValue) => (empty(a) && empty(b)) || a === b;

/** Nombre visible de una ficha (en clientes, nombre y apellidos). */
export function recordLabel(spec: AppSpec, record: CrmRecord): string {
  const entity = spec.entities.find(item => item.id === record.entity);
  const base = String(record.values[entity?.displayField ?? ''] ?? '').trim();
  const last = record.entity === 'contacts' && record.values.lastname ? ' ' + String(record.values.lastname).trim() : '';
  return (base + last).trim() || record.id;
}

/** Campos en los que difieren las dos fichas, en el orden del modelo. */
export function mergeFields(spec: AppSpec, keeper: CrmRecord, duplicate: CrmRecord): MergeChoice[] {
  const entity = spec.entities.find(item => item.id === keeper.entity);
  if (!entity || keeper.entity !== duplicate.entity) return [];
  const result: MergeChoice[] = [];
  for (const field of entity.fields) {
    const mine = valueOf(keeper, field.key), theirs = valueOf(duplicate, field.key);
    if (sameValue(mine, theirs)) continue;
    const reason = field.readOnly ? 'readonly' as const : empty(theirs) ? 'empty' as const : undefined;
    result.push({ key: field.key, label: field.label, keeper: mine, duplicate: theirs, choosable: !reason, ...(reason ? { reason } : {}) });
  }
  return result;
}

/** Valores que se escriben en la principal (`values`) y los que tenía antes (`before`), para poder deshacer. */
export function planMerge(spec: AppSpec, keeper: CrmRecord, duplicate: CrmRecord, take: readonly string[]): MergePlan {
  if (keeper.entity !== duplicate.entity) return { ok: false, reason: 'Las dos fichas tienen que ser del mismo tipo.' };
  if (keeper.id === duplicate.id) return { ok: false, reason: 'Elige dos fichas distintas.' };
  if (take.length > MERGE_TAKE_LIMIT) return { ok: false, reason: 'Demasiados campos elegidos.' };
  if (new Set(take).size !== take.length) return { ok: false, reason: 'Un campo aparece repetido.' };
  const choices = new Map(mergeFields(spec, keeper, duplicate).map(choice => [choice.key, choice]));
  const values: Record<string, FieldValue> = {}, before: Record<string, FieldValue> = {};
  for (const key of take) {
    const choice = choices.get(key);
    if (!choice) return { ok: false, reason: 'Ese campo ya coincide o no existe.', field: key };
    if (!choice.choosable) return { ok: false, reason: choice.reason === 'readonly' ? 'Ese campo es de solo lectura.' : 'El duplicado no tiene ese dato.', field: key };
    values[key] = choice.duplicate;
    before[key] = choice.keeper;
  }
  return { ok: true, values, before };
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
};

/** Huella corta de los valores de una ficha (FNV-1a sobre JSON canónico): sirve para saber si la ficha cambió desde que se vio. */
export function fingerprint(values: Record<string, unknown>): string {
  const text = JSON.stringify(canonical(values));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return text.length.toString(36) + '-' + hash.toString(16).padStart(8, '0');
}
