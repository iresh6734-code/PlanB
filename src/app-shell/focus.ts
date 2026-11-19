import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { dueDay } from '../task-display.js';
import { readPages, type ListPage } from './pager.js';

export async function loadFocusReview(
  spec: AppSpec,
  today: string,
  readPage: (offset: number, limit: number, signal: AbortSignal) => Promise<ListPage>,
  signal: AbortSignal,
  includeToday = false,
) {
  const read = await readPages(readPage, signal, { accept: record => record.entity === 'tasks' });
  return {
    tasks: pendingTasks(spec, read.records, today, includeToday),
    related: read.related, scanned: read.scanned, total: read.total, complete: read.complete,
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
  return pendingTasks(spec, records, today, false);
}

/** Igual que `overdueTasks`, y con `includeToday` también las que vencen hoy (el barrido de la mañana), detrás de las vencidas. */
export function pendingTasks(spec: AppSpec, records: CrmRecord[], today: string, includeToday: boolean): CrmRecord[] {
  const dueKey = spec.roles?.dueDate ?? 'due_date', done = doneOption(spec);
  return records.filter(record => record.entity === 'tasks')
    .filter(record => { const day = dueDay(record.values[dueKey]); return day !== null && (day < today || includeToday && day === today); })
    .filter(record => !done || String(record.values[done.key] ?? '') !== done.id)
    .sort((a, b) => String(a.values[dueKey]).localeCompare(String(b.values[dueKey])) || a.id.localeCompare(b.id));
}

/** Próximo lunes (AAAA-MM-DD) después de `today`; si hoy es lunes, el de la semana siguiente. */
export const nextMonday = (today: string) => { const date = new Date(today + 'T12:00:00Z'), ahead = ((8 - date.getUTCDay()) % 7) || 7; return new Date(date.getTime() + ahead * 86_400_000).toISOString().slice(0, 10); };

/** Días completos entre una fecha límite (fecha o instante, en día de Madrid) y hoy. */
export const daysBetween = (from: string, today: string) => Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse((dueDay(from) ?? from.slice(0, 10)) + 'T12:00:00Z')) / 86_400_000);
