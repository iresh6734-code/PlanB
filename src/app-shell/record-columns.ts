import type { Field } from '../../shared/model.js';

/** B4.5 · Peso de cada columna de una lista según el tipo de dato, para repartir el ancho con proporción. */
export type ColumnPlan = { key: string; weight: number; align: 'start' | 'end'; width: string };

const WIDE_TEXT = /web|website|domain|dominio|url|sitio/i;

export function columnWeight(field: Field, displayField: string): number {
  if (field.key === displayField || field.type === 'email') return 2;
  if (field.type === 'text' && WIDE_TEXT.test(field.key + ' ' + field.label)) return 2;
  return 1;
}

/** Con pocas columnas la tabla deja de estirarse a todo el ancho: más de 4 ya necesita el espacio. */
export const NARROW_COLUMNS = 4;

export function columnPlan(columns: string[], fields: Field[], displayField: string): ColumnPlan[] {
  const picked = columns.map(key => fields.find(field => field.key === key)).filter((field): field is Field => !!field);
  const weights = picked.map(field => columnWeight(field, displayField));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return picked.map((field, index) => ({
    key: field.key, weight: weights[index], align: field.type === 'number' ? 'end' : 'start',
    width: Math.round(weights[index] / total * 1000) / 10 + '%',
  }));
}
