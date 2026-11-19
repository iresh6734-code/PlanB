// Recordatorio dentro de la app (H4 del super plan): qué tareas con hora vencen en los próximos minutos o acaban de vencer
// durante la sesión. Lógica pura, sin React ni red; nunca usa notificaciones del sistema.
import type { CrmRecord } from '../../shared/model.js';

/** Se avisa desde 15 minutos antes de la hora límite. */
export const REMINDER_WINDOW_MIN = 15;
/** Una tarea que venció durante la sesión se sigue recordando hasta 60 minutos después. */
export const REMINDER_GRACE_MIN = 60;
const minute = 60_000;

export type Reminder = { record: CrmRecord; at: number };

/** Instante (ms) de una fecha límite con hora; null si es solo un día (no hay hora a la que avisar) o no es legible. */
export function dueInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/** Clave de un aviso: si la tarea cambia de hora, el aviso descartado vuelve a valer para la hora nueva. */
export const reminderKey = (reminder: Reminder) => reminder.record.id + '@' + reminder.at;

/** Tareas abiertas cuya hora límite cae entre el inicio de la sesión (como mucho una hora atrás) y dentro de 15 minutos,
 *  de la más próxima a la más lejana. Las ya descartadas no se repiten. */
export function dueReminders(tasks: CrmRecord[], options: {
  dueKey: string; isDone: (task: CrmRecord) => boolean; now: number; since: number; dismissed?: ReadonlySet<string>;
  windowMin?: number; graceMin?: number;
}): Reminder[] {
  const { dueKey, isDone, now, since, dismissed, windowMin = REMINDER_WINDOW_MIN, graceMin = REMINDER_GRACE_MIN } = options;
  const from = Math.max(since, now - graceMin * minute), to = now + windowMin * minute;
  const found: Reminder[] = [];
  for (const record of tasks) {
    if (record.entity !== 'tasks' || isDone(record)) continue;
    const at = dueInstant(record.values[dueKey]);
    if (at === null || at < from || at > to) continue;
    const reminder = { record, at };
    if (!dismissed?.has(reminderKey(reminder))) found.push(reminder);
  }
  return found.sort((a, b) => a.at - b.at || a.record.id.localeCompare(b.record.id));
}

/** «vence en 12 min», «vence ahora», «venció hace 5 min». */
export function reminderText(at: number, now: number): string {
  const diff = at - now;
  if (diff > 30_000) return 'vence en ' + Math.ceil(diff / minute) + ' min';
  if (diff >= -minute) return 'vence ahora';
  return 'venció hace ' + Math.floor(-diff / minute) + ' min';
}
