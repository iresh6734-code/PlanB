import type { AppState, Field, FieldValue } from '../../shared/model.js';
import { stageKind } from './deal-insights.js';

type Spec = NonNullable<AppState['spec']>;
/** Lo que conviene tener en cada etapa. Son avisos: nunca impiden guardar (las reglas configuradas siguen bloqueando por su cuenta). */
export type StageNeeds = Map<string, Field[]>;

const empty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
export const closeFieldOf = (fields: Field[]) => fields.find(field => field.type === 'date' && /cierre|close/i.test(field.key + ' ' + field.label));

/** Por cada proceso (pipeline), en el orden de sus etapas abiertas:
 *  - desde la segunda etapa abierta, el importe;
 *  - en la mitad final (redondeando hacia arriba), también la fecha de cierre;
 *  - al ganar, las dos. Al perder, nada.
 *  Si una regla configurada ya exige ese campo en esa etapa, no se repite aquí. */
export function stageNeeds(spec: Spec): StageNeeds {
  const needs: StageNeeds = new Map();
  const entity = spec.entities.find(item => item.id === 'deals');
  if (!entity) return needs;
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const amount = entity.fields.find(field => field.key === amountKey && !field.readOnly);
  const close = closeFieldOf(entity.fields.filter(field => !field.readOnly));
  const ruled = new Set(spec.rules.filter(rule => rule.entity === 'deals' && rule.kind === 'conditional_required' && rule.whenField === stageKey).map(rule => rule.whenValue + ':' + rule.field));
  const pick = (stageId: string, list: (Field | undefined)[]) => {
    const fields = list.filter((field): field is Field => !!field && !ruled.has(stageId + ':' + field.key));
    if (fields.length) needs.set(stageId, fields);
  };
  const pipelines = new Map<string, Spec['stages']>();
  for (const stage of spec.stages) {
    const key = stage.pipelineId ?? '';
    pipelines.set(key, [...(pipelines.get(key) ?? []), stage]);
  }
  for (const stages of pipelines.values()) {
    const open = stages.filter(stage => stageKind(stage) === 'open');
    const half = Math.ceil(open.length / 2);
    open.forEach((stage, index) => pick(stage.id, [index >= 1 ? amount : undefined, index >= 1 && index >= half ? close : undefined]));
    for (const stage of stages) if (stageKind(stage) === 'won') pick(stage.id, [amount, close]);
  }
  return needs;
}

/** Campos que pide la etapa y están vacíos en estos valores. */
export const missingFor = (values: Record<string, FieldValue | undefined>, stageId: unknown, needs: StageNeeds): Field[] =>
  (needs.get(String(stageId ?? '')) ?? []).filter(field => empty(values[field.key]));

/** «importe y fecha de cierre» */
export const fieldList = (fields: Field[]) => {
  const names = fields.map(field => field.label.toLowerCase());
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0] ?? '';
};
