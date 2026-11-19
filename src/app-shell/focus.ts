import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { MAX_PAGES, PAGE_SIZE } from './related.js';

type FocusPage = { records: CrmRecord[]; related: CrmRecord[]; total: number };

export async function loadFocusReview(
  spec: AppSpec,
  today: string,
  readPage: (offset: number, limit: number, signal: AbortSignal) => Promise<FocusPage>,
  signal: AbortSignal,
) {
  const records = new Map<string, CrmRecord>();
  const related: CrmRecord[] = [];
  let total = 0, consistent = true;

  for (let page = 0; page < MAX_PAGES; page++) {
    signal.throwIfAborted();
    const data = await readPage(page * PAGE_SIZE, PAGE_SIZE, signal);
    signal.throwIfAborted();
    if (page > 0 && data.total !== total) consistent = false;
    total = Math.max(total, data.total);
    for (const record of data.records) {
      if (record.entity !== 'tasks' || records.has(record.id)) {
        consistent = false;
        continue;
      }
      records.set(record.id, record);
    }
    related.push(...data.related);
    if (records.size >= total || data.records.length === 0) break;
  }

  return {
    tasks: overdueTasks(spec, [...records.values()], today),
    related, scanned: records.size, total, complete: consistent && records.size === total,
  };
}

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
