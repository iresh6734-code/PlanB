import type { AppSpec, Change, CrmRecord, FieldValue } from '../../shared/model.js';
import { dueDay, madridDay } from '../task-display.js';
import { dealPulse, euros, stageKind } from './deal-insights.js';
import { doneOption } from './focus.js';
import { dealTaskField } from './saved-views.js';
import { taskPreset } from './task-preset.js';

/**
 * Revisión semanal (H3, super plan): mirar atrás los últimos siete días y dejar la semana siguiente limpia.
 * Lógica pura sobre lo que ya hay en la copia: tareas, oportunidades y el diario de cambios locales (`GET /v2/changes`),
 * que guarda el registro antes y después de cada guardado. Por eso «hecha esta semana» y «pospuesta» salen del diario y
 * no de una marca nueva: lo cambiado en el CRM de origen y capturado después no deja rastro aquí, y se dice.
 */
export const REVIEW_DAYS = 7;
/** «Pospuesta más de dos veces»: la fecha límite se movió hacia delante tres o más veces. */
export const POSTPONE_LIMIT = 2;

export interface ReviewTask { record: CrmRecord; name: string; due: string | null; late: number | null; postponed: number }
export interface ReviewDone { id: string; name: string; at: string }
export interface ReviewWon { id: string; name: string; at: string; amount: number | null }
export interface ReviewDeal { record: CrmRecord; name: string; stage: string; amount: number | null }
export interface WeeklyReview {
  from: string; to: string;
  done: ReviewDone[]; won: ReviewWon[];
  postponed: ReviewTask[]; overdue: ReviewTask[];
  /** null: el modelo no enlaza tareas con oportunidades, o no se pudieron leer todas las tareas. */
  noNext: ReviewDeal[] | null;
  /** Cuántas cosas piden una decisión: pospuestas, vencidas y oportunidades sin próximo paso. */
  pending: number;
}

type Input = { spec: AppSpec; tasks: CrmRecord[]; deals: CrmRecord[]; changes: readonly Change[]; now: Date; tasksComplete: boolean; nameOf: (record: CrmRecord) => string };

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
const between = (day: string, from: string, to: string) => day >= from && day <= to;
function amountOf(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
function changeDay(at: string): string | null {
  const time = Date.parse(at);
  return Number.isFinite(time) ? madridDay(new Date(time)) : null;
}

/** Veces que se movió hacia delante la fecha límite de cada tarea, según el diario de cambios. */
export function postponeCounts(changes: readonly Change[], dueKey: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const change of changes) {
    if (change.entity !== 'tasks' || change.operation !== 'update' || !change.before) continue;
    const before = dueDay(change.before.values[dueKey]), after = dueDay(change.after.values[dueKey]);
    if (before && after && after > before) counts.set(change.recordId, (counts.get(change.recordId) ?? 0) + 1);
  }
  return counts;
}

export function weeklyReview({ spec, tasks, deals, changes, now, tasksComplete, nameOf }: Input): WeeklyReview {
  const to = madridDay(now), from = shift(to, -(REVIEW_DAYS - 1));
  const dueKey = spec.roles?.dueDate ?? 'due_date', stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const done = doneOption(spec);
  const isDone = (record: CrmRecord | null) => !!record && !!done && String(record.values[done.key] ?? '') === done.id;
  const stages = new Map(spec.stages.map(stage => [stage.id, stage]));
  const kindOf = (record: CrmRecord | null) => record ? stageKind(stages.get(String(record.values[stageKey] ?? ''))) : null;

  // Lo último de cada registro en la ventana: una tarea marcada, desmarcada y vuelta a marcar cuenta una vez.
  const doneMap = new Map<string, ReviewDone>(), wonMap = new Map<string, ReviewWon>();
  for (const change of changes) {
    const day = changeDay(change.at);
    if (!day || !between(day, from, to)) continue;
    if (change.entity === 'tasks' && isDone(change.after) && !isDone(change.before)) doneMap.set(change.recordId, { id: change.recordId, name: nameOf(change.after), at: change.at });
    if (change.entity === 'deals' && kindOf(change.after) === 'won' && kindOf(change.before) !== 'won') wonMap.set(change.recordId, { id: change.recordId, name: nameOf(change.after), at: change.at, amount: amountOf(change.after.values[amountKey]) });
  }
  // Si después se deshizo (la tarea ya no está hecha o la oportunidad ya no está ganada), no se cuenta.
  const current = new Map([...tasks, ...deals].map(record => [record.entity + ':' + record.id, record]));
  const stillDone = [...doneMap.values()].filter(item => { const record = current.get('tasks:' + item.id); return !record || isDone(record); });
  const stillWon = [...wonMap.values()].filter(item => { const record = current.get('deals:' + item.id); return !record || kindOf(record) === 'won'; });
  const recent = <T extends { at: string }>(list: T[]) => list.sort((a, b) => b.at.localeCompare(a.at));

  const counts = postponeCounts(changes, dueKey);
  const open = tasks.filter(record => record.entity === 'tasks' && !isDone(record)).map(record => {
    const due = dueDay(record.values[dueKey]);
    const late = due && due < to ? Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(due + 'T12:00:00Z')) / DAY) : null;
    return { record, name: nameOf(record), due, late, postponed: counts.get(record.id) ?? 0 };
  });
  const postponed = open.filter(item => item.postponed > POSTPONE_LIMIT).sort((a, b) => b.postponed - a.postponed || (b.late ?? -1) - (a.late ?? -1) || a.record.id.localeCompare(b.record.id));
  const chronic = new Set(postponed.map(item => item.record.id));
  const overdue = open.filter(item => item.late !== null && !chronic.has(item.record.id)).sort((a, b) => (b.late ?? 0) - (a.late ?? 0) || a.record.id.localeCompare(b.record.id));

  const link = dealTaskField(spec);
  let noNext: ReviewDeal[] | null = null;
  if (link && tasksComplete) {
    const pulse = dealPulse(tasks, { dealKey: link.key, dueKey, isDone: task => isDone(task) });
    noNext = deals.filter(record => record.entity === 'deals' && kindOf(record) === 'open' && !(pulse.get(record.id)?.open))
      .map(record => ({ record, name: nameOf(record), stage: stages.get(String(record.values[stageKey] ?? ''))?.label ?? 'Etapa por revisar', amount: amountOf(record.values[amountKey]) }))
      .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || a.record.id.localeCompare(b.record.id));
  }
  return { from, to, done: recent(stillDone), won: recent(stillWon), postponed, overdue, noNext, pending: postponed.length + overdue.length + (noNext?.length ?? 0) };
}

/**
 * Valores de la tarea «Seguimiento: …» para una oportunidad sin próximo paso: los enlaces que la ficha nueva heredaría
 * (`taskPreset`), el asunto, la fecha y el primer estado que no sea «hecha». Null si el modelo no permite enlazarla.
 */
export function nextStepTask(spec: AppSpec, deal: CrmRecord, name: string, due: string): Record<string, FieldValue> | null {
  const tasks = spec.entities.find(entity => entity.id === 'tasks');
  const preset = taskPreset(spec, deal);
  if (!tasks || !preset || deal.entity !== 'deals' || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const dueKey = spec.roles?.dueDate ?? 'due_date', statusKey = spec.roles?.taskStatus ?? 'status';
  const values: Record<string, FieldValue> = { ...preset, [tasks.displayField]: 'Seguimiento: ' + (name.trim() || 'oportunidad'), [dueKey]: due };
  const status = tasks.fields.find(field => field.key === statusKey);
  if (status?.type === 'enum' && !status.readOnly) {
    const done = doneOption(spec), open = status.options.find(option => option.id !== done?.id);
    if (!open) return null;
    values[status.key] = open.id;
  }
  return values;
}

const dayLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const reviewDay = (day: string) => dayLabel.format(Date.parse(day + 'T12:00:00Z'));

/** Una frase que resume la semana, para la cabecera y el texto copiado. */
export function reviewHeadline(review: WeeklyReview): string {
  const parts = [
    review.done.length === 1 ? '1 tarea hecha' : review.done.length + ' tareas hechas',
    ...(review.won.length ? [review.won.length === 1 ? '1 oportunidad ganada' : review.won.length + ' oportunidades ganadas'] : []),
  ];
  const tail = review.pending === 0 ? 'nada pendiente de decidir' : review.pending === 1 ? '1 cosa por decidir' : review.pending + ' cosas por decidir';
  return parts.join(', ') + ' · ' + tail + '.';
}

/** Texto plano para copiar o pegar en un correo. Sin identificadores internos. */
export function reviewText(review: WeeklyReview, title = 'Plan B'): string {
  const lines = [title + ' · revisión del ' + reviewDay(review.from) + ' al ' + reviewDay(review.to), reviewHeadline(review), ''];
  const section = (head: string, items: string[]) => { if (items.length) lines.push(head + ' (' + items.length + ')', ...items.map(item => '- ' + item), ''); };
  section('Hechas', review.done.map(item => item.name));
  section('Ganadas', review.won.map(item => item.name + (item.amount === null ? '' : ' · ' + euros(item.amount))));
  section('Pospuestas más de ' + POSTPONE_LIMIT + ' veces', review.postponed.map(item => item.name + ' · ' + item.postponed + ' veces'));
  section('Vencidas', review.overdue.map(item => item.name + ' · ' + (item.late === 1 ? '1 día' : item.late + ' días')));
  section('Oportunidades sin próximo paso', (review.noNext ?? []).map(item => item.name + ' · ' + item.stage));
  return lines.join('\n').trim() + '\n';
}
