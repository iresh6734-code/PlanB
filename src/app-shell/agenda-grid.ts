import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { localDay, taskRule } from '../../shared/overdue.js';
import { dueDay } from '../task-display.js';
import { euros, stageKind } from './deal-insights.js';
import { doneOption } from './focus.js';

/**
 * Agenda (F3, super plan 2): semana o mes con las tareas pendientes con fecha y los cierres previstos de las
 * oportunidades abiertas. Lógica pura sobre lo que ya hay en la copia; no inventa fechas. Solo el cierre de una
 * oportunidad se puede mover desde aquí (con el guardado de siempre); las tareas se abren en su ficha.
 */
export type AgendaView = 'week' | 'month';
/** `review`: tarea con un día ya pasado que la regla de Hoy no puede dar por vencida (estado desconocido o fecha que no casa con el campo). */
export type AgendaTone = 'late' | 'review' | 'today' | 'soon' | 'later';
export interface AgendaItem {
  key: string; kind: 'task' | 'close'; record: CrmRecord; name: string; day: string; tone: AgendaTone;
  amount: number | null; stage: string | null;
}
export interface AgendaDay { day: string; inPeriod: boolean; today: boolean; past: boolean; weekend: boolean; items: AgendaItem[] }
export interface Agenda {
  view: AgendaView; anchor: string; from: string; to: string; title: string; days: AgendaDay[];
  /** Tareas vencidas con la regla de Hoy, también las anteriores al periodo que se ve. Los cierres pasados no cuentan: siguen en su día. */ overdue: AgendaItem[];
  totals: { tasks: number; closes: number; amount: number; late: number };
  /** Día del periodo con más cosas (null si el periodo está vacío). */ busiest: { day: string; count: number } | null;
}

const DAY = 86_400_000;
const SOON_DAYS = 7;
const isDay = (value: string) => { const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + 'T12:00:00Z') : NaN; return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; };
export const shiftDay = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(Date.parse(day + 'T12:00:00Z')).getUTCDay();
/** Lunes de la semana del día (semana europea). */
export const weekStart = (day: string) => shiftDay(day, -((weekday(day) + 6) % 7));
const monthStart = (day: string) => day.slice(0, 8) + '01';
function monthEnd(day: string): string {
  const [year, month] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}

/** Primer y último día que pinta la vista: la semana de lunes a domingo, o el mes completo en semanas enteras. */
export function agendaRange(view: AgendaView, anchor: string): { from: string; to: string } {
  if (view === 'week') { const from = weekStart(anchor); return { from, to: shiftDay(from, 6) }; }
  const from = weekStart(monthStart(anchor));
  return { from, to: shiftDay(weekStart(monthEnd(anchor)), 6) };
}

/** Día de referencia del periodo anterior o siguiente. En el mes, siempre el día 1 para no saltarse febrero. */
export function stepAnchor(view: AgendaView, anchor: string, step: number): string {
  if (view === 'week') return shiftDay(anchor, 7 * step);
  const [year, month] = anchor.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + step, 1, 12)).toISOString().slice(0, 10);
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' });
const dayMonth = fmt({ day: 'numeric', month: 'long' }), dayOnly = fmt({ day: 'numeric' }), monthYear = fmt({ month: 'long', year: 'numeric' });
const longDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' }), shortWeekday = fmt({ weekday: 'short' });
const at = (day: string) => Date.parse(day + 'T12:00:00Z');
const capital = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

export function agendaTitle(view: AgendaView, anchor: string): string {
  if (view === 'month') return capital(monthYear.format(at(monthStart(anchor))));
  const { from, to } = agendaRange('week', anchor);
  return from.slice(0, 7) === to.slice(0, 7) ? 'Del ' + dayOnly.format(at(from)) + ' al ' + dayMonth.format(at(to)) : 'Del ' + dayMonth.format(at(from)) + ' al ' + dayMonth.format(at(to));
}
export const agendaDayLabel = (day: string) => capital(longDay.format(at(day)));
export const agendaWeekday = (day: string) => shortWeekday.format(at(day)).replace('.', '');

/** Campo de fecha de cierre (o de entrega) de las oportunidades, y si se puede editar. */
export function closeFieldFor(spec: AppSpec): { key: string; label: string; editable: boolean } | null {
  const deals = spec.entities.find(entity => entity.id === 'deals');
  const field = deals?.fields.find(item => (item.type === 'date' || item.type === 'datetime') && /cierre|close|entrega|delivery/i.test(item.key + ' ' + item.label));
  return field ? { key: field.key, label: field.label, editable: !field.readOnly && field.type === 'date' } : null;
}

function amountOf(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
/** Cómo se nombra lo que ya pasó: una tarea «vencida» (regla de Hoy); un cierre en un día pasado, «fecha pasada», porque no cuenta como vencida. */
export const pastWord = (item: Pick<AgendaItem, 'kind' | 'tone'>) => item.tone !== 'late' ? null : item.kind === 'task' ? 'vencida' : 'fecha pasada';
const toneOf = (day: string, today: string): AgendaTone => day < today ? 'late' : day === today ? 'today' : day <= shiftDay(today, SOON_DAYS) ? 'soon' : 'later';

/** 
ow: instante de evaluación; una tarea con hora vence en cuanto pasa y una de solo día, al acabar ese día en Madrid. */
type ItemsInput = { spec: AppSpec; tasks: readonly CrmRecord[]; deals: readonly CrmRecord[]; now: number; nameOf: (record: CrmRecord) => string };

/** Lo que cabe en la agenda: tareas sin hacer con fecha y oportunidades abiertas con cierre. `undated`: tareas pendientes sin fecha. */
export function agendaItems({ spec, tasks, deals, now, nameOf }: ItemsInput): { items: AgendaItem[]; undated: number } {
  const today = localDay(now), rule = taskRule(spec);
  const dueKey = spec.roles?.dueDate ?? 'due_date', stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const done = doneOption(spec), close = closeFieldFor(spec);
  const stages = new Map(spec.stages.map(stage => [stage.id, stage]));
  const items: AgendaItem[] = [];
  let undated = 0;
  for (const record of tasks) {
    if (record.entity !== 'tasks' || (done && String(record.values[done.key] ?? '') === done.id) || rule.status(record) === 'completed') continue;
    const day = dueDay(record.values[dueKey]);
    if (!day || !isDay(day)) { undated++; continue; }
    const tone: AgendaTone = rule.overdue(record, now, today) ? 'late' : day < today ? 'review' : toneOf(day, today);
    items.push({ key: 'tasks:' + record.id, kind: 'task', record, name: nameOf(record), day, tone, amount: null, stage: null });
  }
  if (close) for (const record of deals) {
    const stage = stages.get(String(record.values[stageKey] ?? ''));
    if (record.entity !== 'deals' || stageKind(stage) !== 'open') continue;
    const day = dueDay(record.values[close.key]);
    if (!day || !isDay(day)) continue;
    items.push({ key: 'deals:' + record.id, kind: 'close', record, name: nameOf(record), day, tone: toneOf(day, today), amount: amountOf(record.values[amountKey]), stage: stage?.label ?? null });
  }
  items.sort(compareItems);
  return { items, undated };
}

/** Orden de la agenda: por día, los cierres antes que las tareas y, dentro, por nombre. */
export function compareItems(a: AgendaItem, b: AgendaItem): number {
  return a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'close' ? -1 : 1) || a.name.localeCompare(b.name, 'es') || a.key.localeCompare(b.key);
}

/** Rejilla del periodo con lo de cada día, los totales del periodo y lo vencido (de este periodo o de antes). */
export function buildAgenda({ view, anchor, today, items }: { view: AgendaView; anchor: string; today: string; items: readonly AgendaItem[] }): Agenda {
  const { from, to } = agendaRange(view, anchor);
  const month = anchor.slice(0, 7);
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) if (item.day >= from && item.day <= to) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  const days: AgendaDay[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const wd = weekday(day);
    days.push({ day, inPeriod: view === 'week' || day.slice(0, 7) === month, today: day === today, past: day < today, weekend: wd === 0 || wd === 6, items: byDay.get(day) ?? [] });
  }
  const shown = days.filter(day => day.inPeriod).flatMap(day => day.items);
  const busiest = days.filter(day => day.inPeriod && day.items.length).reduce<{ day: string; count: number } | null>((best, day) => !best || day.items.length > best.count ? { day: day.day, count: day.items.length } : best, null);
  return {
    view, anchor, from, to, title: agendaTitle(view, anchor), days,
    overdue: items.filter(item => item.kind === 'task' && item.tone === 'late'),
    totals: {
      tasks: shown.filter(item => item.kind === 'task').length,
      closes: shown.filter(item => item.kind === 'close').length,
      amount: shown.reduce((sum, item) => sum + (item.kind === 'close' ? item.amount ?? 0 : 0), 0),
      late: shown.filter(item => item.kind === 'task' && item.tone === 'late').length,
    },
    busiest,
  };
}

/** El mismo elemento en otro día (para reflejar un cierre movido mientras la copia se vuelve a leer). */
export const itemOnDay = (item: AgendaItem, day: string, today: string): AgendaItem => ({ ...item, day, tone: toneOf(day, today) });

const count = (value: number, one: string, many: string) => value + ' ' + (value === 1 ? one : many);
/** El periodo visible en texto plano, agrupado por día, para pegarlo en un correo o en un chat interno. Solo días con algo. */
export function agendaText(agenda: Agenda): string {
  const { totals } = agenda;
  const figures = [count(totals.tasks, 'tarea', 'tareas')];
  if (totals.closes) figures.push(count(totals.closes, 'cierre', 'cierres') + (totals.amount ? ' (' + euros(totals.amount) + ')' : ''));
  if (totals.late) figures.push(count(totals.late, 'vencida', 'vencidas'));
  const lines = ['Agenda · ' + agenda.title, figures.join(' · ')];
  const days = agenda.days.filter(day => day.inPeriod && day.items.length);
  for (const day of days) {
    lines.push('', agendaDayLabel(day.day) + (day.today ? ' (hoy)' : ''));
    for (const item of day.items) lines.push('– ' + (item.kind === 'close' ? 'Cierre: ' + item.name + (item.amount !== null ? ' · ' + euros(item.amount) : '') : 'Tarea: ' + item.name) + (pastWord(item) ? ' (' + pastWord(item) + ')' : ''));
  }
  if (!days.length) lines.push('', agenda.view === 'week' ? 'Nada previsto esta semana.' : 'Nada previsto este mes.');
  return lines.join('\n') + '\n';
}

/** ¿Se puede mover este elemento a ese día? Solo cierres, a un día válido distinto del actual. */
export const canMoveClose = (item: Pick<AgendaItem, 'kind' | 'day'>, day: string, editable: boolean) => editable && item.kind === 'close' && isDay(day) && day !== item.day;

// iCalendar (RFC 5545): texto escapado, líneas CRLF de 75 octetos como máximo (se pliegan sin partir un carácter UTF-8).
const icsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utf8 = new TextEncoder();
function foldIcs(line: string): string {
  const parts: string[] = [];
  let current = '', size = 0, limit = 75;
  for (const char of line) {
    const bytes = utf8.encode(char).length;
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; limit = 74; }
    current += char; size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
const icsDay = (day: string) => day.replace(/-/g, '');
const icsStamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Nombre del archivo .ics del periodo visible. */
export const agendaIcsName = (agenda: Pick<Agenda, 'days'>) => {
  const days = agenda.days.filter(day => day.inPeriod);
  return 'agenda-planb-' + days[0].day + '_' + days[days.length - 1].day + '.ics';
};

/** El periodo visible como calendario .ics para importarlo en Outlook o Google Calendar: un evento de día completo por
 *  tarea o cierre, sin ocupar la jornada. El UID sale del registro, así que importar otra vez actualiza en lugar de duplicar. */
export function agendaIcs(agenda: Agenda, now: Date): { text: string; count: number } {
  const stamp = icsStamp(now);
  const items = agenda.days.filter(day => day.inPeriod).flatMap(day => day.items);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan B//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText('Plan B · ' + agenda.title)];
  for (const item of items) {
    const close = item.kind === 'close';
    const summary = (close ? 'Cierre: ' : 'Tarea: ') + item.name + (close && item.amount !== null ? ' · ' + euros(item.amount) : '');
    const detail = [close ? item.stage ?? 'Oportunidad abierta' : 'Tarea pendiente', pastWord(item)].filter(Boolean).join(' · ');
    lines.push('BEGIN:VEVENT', 'UID:planb-' + item.key.replace(/[^\w-]/g, '-') + '@agenda.planb', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + icsDay(item.day), 'DTEND;VALUE=DATE:' + icsDay(shiftDay(item.day, 1)),
      'SUMMARY:' + icsText(summary), 'DESCRIPTION:' + icsText(detail + '. Desde la agenda de Plan B.'), 'CATEGORIES:' + (close ? 'Cierre' : 'Tarea'), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldIcs).join('\r\n') + '\r\n', count: items.length };
}
