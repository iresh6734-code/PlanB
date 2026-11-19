// Orden y filtro de una lista de registros en el servidor (V1 del super plan): antes solo se ordenaba la página cargada.
// Lógica pura, compartida por el servidor (store.page) y el cliente (dirección de la consulta).
import type { CrmRecord, Entity, EntityName, Field, FieldValue } from './model.js';

export type RecordSort = { key: string; dir: 1 | -1 };

const KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,99}$/;

/** «campo:asc» / «campo:desc» → orden; cualquier otra forma, null. */
export function parseRecordSort(raw: string): RecordSort | null {
  const match = /^([a-zA-Z][a-zA-Z0-9_]{0,99}):(asc|desc)$/.exec(raw);
  return match ? { key: match[1], dir: match[2] === 'asc' ? 1 : -1 } : null;
}

export const formatRecordSort = (sort: RecordSort | null) => (sort && KEY.test(sort.key) ? sort.key + ':' + (sort.dir === 1 ? 'asc' : 'desc') : '');

/** Nombre visible de un registro, igual que en la App: campo principal (+ apellido en clientes) o su id. */
export function recordLabel(record: CrmRecord, entity: Entity | undefined): string {
  const name = entity ? record.values[entity.displayField] : undefined;
  return String(name || record.id) + (record.entity === 'contacts' && record.values.lastname ? ' ' + record.values.lastname : '');
}

const empty = (value: FieldValue | undefined) => value === null || value === undefined || value === '';

/** Coincidencia exacta con el valor pedido; en selección múltiple basta con que esté entre los elegidos. */
export function matchesField(record: CrmRecord, field: Field, wanted: string): boolean {
  const value = record.values[field.key];
  if (field.type === 'multiselect') return String(value ?? '').split(';').map(item => item.trim()).includes(wanted);
  if (field.type === 'boolean') return String(value === true || value === 'true') === wanted;
  return String(value ?? '') === wanted;
}

/**
 * Comparador por un campo según su tipo. Los vacíos van siempre al final, en las dos direcciones.
 * Números por valor, fechas por instante, listas por el orden de sus opciones (el del embudo), referencias por el nombre
 * del registro enlazado y el resto como texto en español con números naturales.
 */
export function compareByField(field: Field, dir: 1 | -1, nameOf: (entity: EntityName, id: string) => string | undefined) {
  const text = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  const order = new Map(field.options.map((option, index) => [option.id, index]));
  const key = (value: FieldValue | undefined): number | string | null => {
    if (empty(value)) return null;
    switch (field.type) {
      case 'number': { const n = Number(value); return Number.isNaN(n) ? null : n; }
      case 'date': case 'datetime': { const t = Date.parse(String(value)); return Number.isNaN(t) ? String(value) : t; }
      case 'boolean': return value === true || value === 'true' ? 1 : 0;
      case 'enum': return order.get(String(value)) ?? field.options.length;
      case 'reference': return field.referenceEntity ? nameOf(field.referenceEntity, String(value)) ?? String(value) : String(value);
      default: return String(value);
    }
  };
  return (a: CrmRecord, b: CrmRecord) => {
    const x = key(a.values[field.key]), y = key(b.values[field.key]);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return dir * (x - y);
    return dir * text(String(x), String(y));
  };
}

/** Aplica filtros y orden sobre una lista ya limitada a un tipo de registro. Los campos se validan antes de llamar. */
export function orderRecords(records: CrmRecord[], entity: Entity, filters: Record<string, string>, sort: RecordSort | null, nameOf: (entity: EntityName, id: string) => string | undefined): CrmRecord[] {
  const fields = new Map(entity.fields.map(field => [field.key, field]));
  let list = records;
  for (const [key, wanted] of Object.entries(filters)) { const field = fields.get(key); if (field) list = list.filter(record => matchesField(record, field, wanted)); }
  const field = sort ? fields.get(sort.key) : undefined;
  return field && sort ? [...list].sort(compareByField(field, sort.dir, nameOf)) : list;
}

/** Recuento por opción de un campo de lista, para los botones de filtro rápido (antes contaban solo la página). */
export function facetCounts(records: CrmRecord[], field: Field): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(field.options.map(option => [option.id, 0]));
  for (const record of records) { const value = String(record.values[field.key] ?? ''); if (Object.hasOwn(counts, value)) counts[value]++; }
  return counts;
}
