import type { AppSpec, EntityName, Field, FieldValue } from '../../shared/model.js';
import { closeStatus, dueStatus, stageKind } from './deal-insights.js';

/** K7 · La ficha como hoja: pares etiqueta · valor en dos columnas en escritorio. Ocupan el ancho entero el campo
 *  principal (salvo el nombre de pila, que va junto a los apellidos), las listas de varias opciones y los textos largos
 *  (descripción, notas, dirección…). */
const LONG_TEXT = /descrip|nota|note|coment|comment|direcci|address|observ|detalle|body|cuerpo/i;
export const isWideField = (field: Field, displayField?: string) =>
  (field.key === displayField && field.key !== 'firstname') || field.type === 'multiselect' || (field.type === 'text' && LONG_TEXT.test(field.key + ' ' + field.label));

/** K7 · El estado de la ficha, escrito como sello en su cabecera: la etapa de una oportunidad, el estado de una tarea
 *  o la fase de un cliente o una empresa. El tono sigue docs/historial/DESIGN.md: lacre si venció, ocre si vence en ≤ 7 días,
 *  verde botella si está ganada o hecha y neutro en lo demás. Se calcula con los valores del formulario, así que cambia
 *  en cuanto se cambia la etapa (aunque no se haya guardado). */
export type StampTone = 'danger' | 'warn' | 'ok' | 'neutral';
export interface RecordStamp { label: string; tone: StampTone; /** Frase para el título emergente: por qué tiene ese tono. */ note: string }

const DONE = /complet|hech|cerrad|termin|finaliz|done|closed/i;
const PHASE = /lifecycle|ciclo|fase|lead_?status|estado/i;
const toneOf = (tone: string): StampTone => tone === 'late' ? 'danger' : tone === 'soon' ? 'warn' : tone === 'won' ? 'ok' : 'neutral';

export function recordStamp(spec: AppSpec, entityName: EntityName, values: Record<string, FieldValue>, today: string): RecordStamp | null {
  const entity = spec.entities.find(item => item.id === entityName);
  if (!entity) return null;
  if (entityName === 'deals') {
    const stage = spec.stages.find(item => item.id === values[spec.roles?.stage ?? 'dealstage']);
    if (!stage) return null;
    const kind = stageKind(stage);
    const closeField = entity.fields.find(field => field.type === 'date' && /cierre|close|entrega|delivery/i.test(field.key + ' ' + field.label));
    const status = closeStatus(closeField ? values[closeField.key] : null, today, kind);
    return { label: stage.label, tone: kind === 'won' ? 'ok' : kind === 'lost' ? 'neutral' : toneOf(status.tone), note: kind === 'open' ? 'Cierre: ' + status.label : status.label };
  }
  if (entityName === 'tasks') {
    const statusField = entity.fields.find(field => field.key === (spec.roles?.taskStatus ?? 'status'));
    const option = statusField?.options.find(item => item.id === values[statusField.key]);
    if (!option) return null;
    const status = dueStatus(values[spec.roles?.dueDate ?? 'due_date'], today, DONE.test(option.label + ' ' + option.id));
    return { label: option.label, tone: toneOf(status.tone), note: status.label };
  }
  const phase = entity.fields.find(field => field.type === 'enum' && PHASE.test(field.key + ' ' + field.label));
  const option = phase?.options.find(item => item.id === values[phase.key]);
  return option ? { label: option.label, tone: 'neutral', note: phase!.label + ': ' + option.label } : null;
}
