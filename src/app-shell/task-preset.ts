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

const FOLLOW_PREFIX = 'Seguimiento: ';
const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const mondayAfter = (day: string) => { const date = new Date(day + 'T12:00:00Z'); return addDays(day, ((8 - date.getUTCDay()) % 7) || 7); };

/** Fechas rápidas del siguiente paso (H2), a partir de hoy en Madrid (AAAA-MM-DD). */
export function followUpDates(today: string): { id: 'tomorrow' | 'monday' | 'week'; label: string; key: string; date: string }[] {
  return [
    { id: 'tomorrow', label: 'Mañana', key: 'M', date: addDays(today, 1) },
    { id: 'monday', label: 'El lunes', key: 'L', date: mondayAfter(today) },
    { id: 'week', label: 'En una semana', key: 'U', date: addDays(today, 7) },
  ];
}

/** Asunto propuesto para el seguimiento: «Seguimiento: …» sin encadenar prefijos si la tarea ya era un seguimiento. */
export function followUpSubject(spec: Spec, done: CrmRecord): string {
  const tasks = spec.entities.find(item => item.id === 'tasks');
  const title = String(tasks ? done.values[tasks.displayField] ?? '' : '').trim();
  const base = title.startsWith(FOLLOW_PREFIX) ? title.slice(FOLLOW_PREFIX.length).trim() : title;
  return base ? FOLLOW_PREFIX + base : 'Seguimiento';
}

/** Valores de la tarea de seguimiento: los mismos enlaces editables que la tarea hecha, el asunto, la fecha y el estado abierto.
 *  El resto de campos queda como en una ficha nueva. Null si no hay tareas, asunto o estado abierto reconocible. */
export function followUpTask(spec: Spec, done: CrmRecord, subject: string, due: string): Record<string, FieldValue> | null {
  const tasks = spec.entities.find(item => item.id === 'tasks');
  const text = subject.trim();
  if (!tasks || done.entity !== 'tasks' || !text || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const dueKey = spec.roles?.dueDate ?? 'due_date', statusKey = spec.roles?.taskStatus ?? 'status';
  const values: Record<string, FieldValue> = {};
  for (const field of tasks.fields) {
    if (field.readOnly) continue;
    if (field.type === 'reference') { const value = done.values[field.key]; values[field.key] = typeof value === 'string' && value.trim() ? value : ''; }
    else values[field.key] = field.type === 'boolean' ? false : field.type === 'number' && field.required ? 0 : '';
  }
  const status = tasks.fields.find(field => field.key === statusKey);
  if (status && !status.readOnly && status.type === 'enum') {
    const open = status.options.find(option => !/complet|hech|cerrad|termin|finaliz|done|closed/i.test(option.label + ' ' + option.id));
    if (!open) return null;
    values[status.key] = open.id;
  }
  values[tasks.displayField] = text;
  values[dueKey] = due;
  return values;
}
