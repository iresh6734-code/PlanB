import type { AppSpec, CrmRecord } from '../../shared/model.js';

/** Campo de estado de las tareas y opción que significa «hecha», deducida por su nombre (completada, hecha, cerrada…).
 *  Si no hay ninguna opción reconocible, devuelve null y la interfaz no ofrece «Hecha». */
export function doneOption(spec: AppSpec): { key: string; id: string; label: string } | null {
  const tasks = spec.entities.find(entity => entity.id === 'tasks'); if (!tasks) return null;
  const field = tasks.fields.find(item => item.key === (spec.roles?.taskStatus ?? 'status'));
  if (!field || field.readOnly || field.type !== 'enum') return null;
  const option = field.options.find(item => /complet|hech|cerrad|termin|finaliz|done|closed/i.test(item.label + ' ' + item.id));
  return option ? { key: field.key, id: option.id, label: option.label } : null;
}

/** Tareas abiertas cuya fecha límite (día de Madrid) es anterior a `today` (AAAA-MM-DD), de la más antigua a la más reciente. */
export function overdueTasks(spec: AppSpec, records: CrmRecord[], today: string): CrmRecord[] {
  const dueKey = spec.roles?.dueDate ?? 'due_date', done = doneOption(spec);
  return records.filter(record => record.entity === 'tasks')
    .filter(record => { const due = record.values[dueKey]; return typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(due) && due.slice(0, 10) < today; })
    .filter(record => !done || String(record.values[done.key] ?? '') !== done.id)
    .sort((a, b) => String(a.values[dueKey]).localeCompare(String(b.values[dueKey])) || a.id.localeCompare(b.id));
}

/** Días completos entre una fecha AAAA-MM-DD y hoy. */
export const daysBetween = (from: string, today: string) => Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(from.slice(0, 10) + 'T12:00:00Z')) / 86_400_000);
