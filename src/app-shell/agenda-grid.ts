import type { AppSpec, CrmRecord } from '../../shared/model.js';
import { dueDay } from '../task-display.js';
import { euros, stageKind } from './deal-insights.js';
import { doneOption } from './focus.js';

/**
 * Agenda (F3, super plan 2): semana o mes con las tareas pendientes con fecha y los cierres previstos de las
 * oportunidades abiertas. Lógica pura sobre lo que ya hay en la copia; no inventa fechas. Solo el cierre de una
 * oportunidad se puede mover desde aquí (con el guardado de siempre); las tareas se abren en su ficha.
 */
export type AgendaView = 'week' | 'month';
export type AgendaTone = 'late' | 'today' | 'soon' | 'later';
export interface AgendaItem {
  key: string; kind: 'task' | 'close'; record: CrmRecord; name: string; day: string; tone: AgendaTone;
  amount: number | null; stage: string | null;
}
export interface AgendaDay { day: string; inPeriod: boolean; today: boolean; past: boolean; weekend: boolean; items: AgendaItem[] }
export interface Agenda {
  view: AgendaView; anchor: string; from: string; to: string; title: string; days: AgendaDay[];
  /** Pendiente con fecha pasada, también la anterior al periodo que se ve. */ overdue: AgendaItem[];
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
const toneOf = (day: string, today: string): AgendaTone => day < today ? 'late' : day === today ? 'today' : day <= shiftDay(today, SOON_DAYS) ? 'soon' : 'later';

type ItemsInput = { spec: AppSpec; tasks: readonly CrmRecord[]; deals: readonly CrmRecord[]; today: string; nameOf: (record: CrmRecord) => string };

/** Lo que cabe en la agenda: tareas sin hacer con fecha y oportunidades abiertas con cierre. `undated`: tareas pendientes sin fecha. */
export function agendaItems({ spec, tasks, deals, today, nameOf }: ItemsInput): { items: AgendaItem[]; undated: number } {
  const dueKey = spec.roles?.dueDate ?? 'due_date', stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const done = doneOption(spec), close = closeFieldFor(spec);
  const stages = new Map(spec.stages.map(stage => [stage.id, stage]));
  const items: AgendaItem[] = [];
  let undated = 0;
  for (const record of tasks) {
    if (record.entity !== 'tasks' || (done && String(record.values[done.key] ?? '') === done.id)) continue;
    const day = dueDay(record.values[dueKey]);
    if (!day || !isDay(day)) { undated++; continue; }
    items.push({ key: 'tasks:' + record.id, kind: 'task', record, name: nameOf(record), day, tone: toneOf(day, today), amount: null, stage: null });
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
    overdue: items.filter(item => item.tone === 'late'),
    totals: {
      tasks: shown.filter(item => item.kind === 'task').length,
      closes: shown.filter(item => item.kind === 'close').length,
      amount: shown.reduce((sum, item) => sum + (item.kind === 'close' ? item.amount ?? 0 : 0), 0),
      late: shown.filter(item => item.tone === 'late').length,
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
    for (const item of day.items) lines.push('– ' + (item.kind === 'close' ? 'Cierre: ' + item.name + (item.amount !== null ? ' · ' + euros(item.amount) : '') : 'Tarea: ' + item.name) + (item.tone === 'late' ? ' (vencida)' : ''));
  }
  if (!days.length) lines.push('', agenda.view === 'week' ? 'Nada previsto esta semana.' : 'Nada previsto este mes.');
  return lines.join('\n') + '\n';
}

/** ¿Se puede mover este elemento a ese día? Solo cierres, a un día válido distinto del actual. */
export const canMoveClose = (item: Pick<AgendaItem, 'kind' | 'day'>, day: string, editable: boolean) => editable && item.kind === 'close' && isDay(day) && day !== item.day;
