import type { AppState, CrmRecord, EntityName, FieldValue } from '../../shared/model.js';

type Spec = NonNullable<AppState['spec']>;
/** Valores de un registro nuevo enlazado a la ficha abierta. Las referencias heredadas conservan el papel del campo.
 *  Si no hay un único campo editable que apunte al origen, el enlace se elige en el formulario general. */
export function linkedPreset(spec: Spec, target: EntityName, record: CrmRecord): Record<string, FieldValue> | null {
  const entity = spec.entities.find(item => item.id === target);
  if (!entity || record.entity === target) return null;
  const targetRefs = entity.fields.filter(field => field.type === 'reference' && field.referenceEntity);
  const refs = targetRefs.filter(field => !field.readOnly);
  const direct = refs.filter(field => field.referenceEntity === record.entity);
  if (direct.length !== 1) return null;
  const [anchor] = direct;
  const preset: Record<string, FieldValue> = { [anchor.key]: record.id };
  const sourceRefs = spec.entities.find(item => item.id === record.entity)?.fields.filter(field => field.type === 'reference') ?? [];
  for (const field of refs) {
    if (field === anchor) continue;
    const candidates = sourceRefs.filter(item => item.referenceEntity === field.referenceEntity);
    const sameKey = candidates.find(item => item.key === field.key);
    const onlyTarget = targetRefs.filter(item => item.referenceEntity === field.referenceEntity).length === 1;
    const match = sameKey ?? (onlyTarget && candidates.length === 1 ? candidates[0] : undefined);
    const value = match ? record.values[match.key] : undefined;
    if (typeof value === 'string' && value.trim()) preset[field.key] = value;
  }
  return preset;
}
export const taskPreset = (spec: Spec, record: CrmRecord) => linkedPreset(spec, 'tasks', record);
