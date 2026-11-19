import { madridDay } from '../task-display.js';

/** Lectura rápida de una oportunidad para el tablero y el panel: de qué tipo es su etapa y en qué punto está su cierre.
 *  Solo interpreta valores que ya tiene la oportunidad; no inventa fechas ni probabilidades. */
export type StageKind = 'open' | 'won' | 'lost';
export type CloseTone = 'ok' | 'soon' | 'late' | 'won' | 'lost' | 'none';
export interface CloseStatus { label: string; tone: CloseTone }

/** «Ganada» / «Perdida» se deducen del nombre o del identificador de la etapa (también en inglés, como llegan de HubSpot). */
export function stageKind(stage: { id: string; label: string } | undefined): StageKind {
  if (!stage) return 'open';
  const text = (stage.label + ' ' + stage.id).toLowerCase();
  if (/perdid|lost|descartad|closedlost/.test(text)) return 'lost';
  if (/ganad|won|closedwon|firmad/.test(text)) return 'won';
  return 'open';
}

const DAY = 86_400_000;
const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const calendarDay = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function dateStart(day: string): number {
  const at = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day ? at : NaN;
}

function displayedDay(value: unknown, useMadridInstant: boolean): number {
  const match = typeof value === 'string' ? calendarDay.exec(value) : null;
  if (!match) return NaN;
  const [iso, day, zone] = match;
  const start = dateStart(day);
  if (!Number.isFinite(start) || !zone) return start;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return NaN;
  return useMadridInstant ? dateStart(madridDay(new Date(at))) : start;
}

/** Estado de la fecha de cierre respecto a «hoy» (AAAA-MM-DD). Abierta y pasada → tarde; en ≤ 7 días → pronto. */
export function closeStatus(value: unknown, today: string, kind: StageKind): CloseStatus {
  if (kind === 'won') return { label: 'Ganada', tone: 'won' };
  if (kind === 'lost') return { label: 'Perdida', tone: 'lost' };
  if (value == null || value === '') return { label: 'Sin fecha de cierre', tone: 'none' };
  const start = displayedDay(value, false);
  const days = (start - dateStart(today)) / DAY;
  if (!Number.isFinite(days)) return { label: 'Fecha de cierre no válida', tone: 'none' };
  const date = shortDate.format(start);
  if (days < 0) return { label: 'Venció hace ' + (-days === 1 ? '1 día' : -days + ' días') + ' · ' + date, tone: 'late' };
  if (days === 0) return { label: 'Cierra hoy', tone: 'soon' };
  if (days <= 7) return { label: 'Cierra en ' + (days === 1 ? '1 día' : days + ' días') + ' · ' + date, tone: 'soon' };
  return { label: 'Cierra el ' + date, tone: 'ok' };
}

/** Importe en euros con separador de miles y sin decimales, igual que los totales («1.200 €»). */
export const euros = (value: unknown) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(value) || 0);

/** Fecha límite de una tarea respecto a «hoy». Una tarea hecha nunca se marca como vencida. */
export function dueStatus(value: unknown, today: string, done: boolean): CloseStatus {
  if (done) return { label: 'Hecha', tone: 'won' };
  if (value == null || value === '') return { label: 'Sin fecha límite', tone: 'none' };
  const start = displayedDay(value, true);
  const days = (start - dateStart(today)) / DAY;
  if (!Number.isFinite(days)) return { label: 'Fecha límite no válida', tone: 'none' };
  const date = shortDate.format(start);
  if (days < 0) return { label: 'Venció hace ' + (-days === 1 ? '1 día' : -days + ' días') + ' · ' + date, tone: 'late' };
  if (days === 0) return { label: 'Vence hoy', tone: 'soon' };
  if (days === 1) return { label: 'Vence mañana · ' + date, tone: 'soon' };
  if (days <= 7) return { label: 'Vence en ' + days + ' días · ' + date, tone: 'soon' };
  return { label: 'Vence el ' + date, tone: 'ok' };
}

/** Iniciales para el avatar (dos letras como mucho). */
export const initials = (name: string) => name.trim().split(/\s+/).filter(word => /\p{L}/u.test(word[0] ?? '')).slice(0, 2).map(word => word[0]!.toUpperCase()).join('') || '·';
