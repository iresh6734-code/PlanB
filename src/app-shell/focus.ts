import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { localDay, taskRule } from '../../shared/overdue.js';
import { dueDay } from '../task-display.js';
import { readPages, type ListPage } from './pager.js';

export async function loadFocusReview(
  spec: AppSpec,
  now: number,
  readPage: (offset: number, limit: number, signal: AbortSignal) => Promise<ListPage>,
  signal: AbortSignal,
  includeToday = false,
) {
  const read = await readPages(readPage, signal, { accept: record => record.entity === 'tasks' });
  return {
    tasks: pendingTasks(spec, read.records, now, includeToday),
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

/** Tareas vencidas en el instante `now` con la regla de Hoy (shared/overdue), de la más antigua a la más reciente. */
export function overdueTasks(spec: AppSpec, records: CrmRecord[], now: number): CrmRecord[] {
  return pendingTasks(spec, records, now, false);
}

/** Igual que `overdueTasks`, y con `includeToday` también las abiertas que vencen hoy en Madrid (el barrido de la mañana), detrás de las vencidas. */
export function pendingTasks(spec: AppSpec, records: CrmRecord[], now: number, includeToday: boolean): CrmRecord[] {
  const rule = taskRule(spec), today = localDay(now), done = doneOption(spec);
  const picked = records.filter(record => record.entity === 'tasks' && (!done || String(record.values[done.key] ?? '') !== done.id) && rule.status(record) === 'open')
    .map(record => ({ record, due: rule.due(record), late: rule.overdue(record, now, today) }))
    .filter(item => item.late || includeToday && item.due.localDate === today);
  return picked.sort((a, b) => Number(b.late) - Number(a.late) || (a.due.localDate ?? '').localeCompare(b.due.localDate ?? '') || (a.due.at ?? 0) - (b.due.at ?? 0) || a.record.id.localeCompare(b.record.id)).map(item => item.record);
}

/** Próximo lunes (AAAA-MM-DD) después de `today`; si hoy es lunes, el de la semana siguiente. */
export const nextMonday = (today: string) => { const date = new Date(today + 'T12:00:00Z'), ahead = ((8 - date.getUTCDay()) % 7) || 7; return new Date(date.getTime() + ahead * 86_400_000).toISOString().slice(0, 10); };

/** Días completos entre una fecha límite (fecha o instante, en día de Madrid) y hoy. */
export const daysBetween = (from: string, today: string) => Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse((dueDay(from) ?? from.slice(0, 10)) + 'T12:00:00Z')) / 86_400_000);
