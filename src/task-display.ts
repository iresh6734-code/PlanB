/** Presentación compartida de tareas (Inicio y Hoy): fecha legible en Madrid, días de retraso y etiqueta de estado. Solo formatea; no decide nada. */
const dayMs = 86_400_000;
export const madridDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
/** Día de Madrid (AAAA-MM-DD) de una fecha límite: una fecha sola se toma tal cual y un instante se pasa a Madrid; null si no es legible. */
export function dueDay(due: unknown): string | null {
  if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const parsed = new Date(due);
  return Number.isNaN(parsed.getTime()) ? due.slice(0, 10) : madridDay(parsed);
}
/** Días completos de retraso respecto a hoy en Madrid; null si la fecha no es legible. */
export function daysLate(due: string | null, now = new Date()): number | null {
  if (!due) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(due) ? due + 'T12:00:00Z' : due);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.round((Date.parse(madridDay(now) + 'T12:00:00Z') - Date.parse(madridDay(parsed) + 'T12:00:00Z')) / dayMs);
}
export function dueLabel(due: string | null, kind: string, now = new Date()): string {
  if (kind === 'missing' || !due) return 'Sin fecha';
  if (kind === 'invalid') return 'Fecha no legible';
  const late = daysLate(due, now);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(due) ? due + 'T12:00:00Z' : due);
  const day = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(parsed);
  const time = kind === 'instant' ? ' · ' + new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(parsed) : '';
  if (late === 0) return 'Hoy' + time;
  if (late === -1) return 'Mañana' + time;
  return day + time;
}
export function taskChip(bucket: string, due: string | null, now = new Date()): { tone: 'danger' | 'warn' | 'neutral'; text: string } {
  if (bucket === 'overdue') { const late = daysLate(due, now); return { tone: 'danger', text: late && late > 0 ? 'Vencida · ' + late + ' d' : 'Vencida' }; }
  if (bucket === 'due-in-window') return { tone: 'warn', text: 'Próximas 24 h' };
  if (bucket === 'needs-review') return { tone: 'neutral', text: 'Revisar datos' };
  return { tone: 'neutral', text: 'Más adelante' };
}
/** Separa «Acción · Cliente» en dos trozos para atenuar el segundo; sin separador, todo es la acción. El texto completo no cambia. */
export function splitTaskLabel(label: string): [string, string] {
  const at = label.indexOf(' · ');
  return at > 0 && at + 3 < label.length ? [label.slice(0, at), label.slice(at)] : [label, ''];
}
