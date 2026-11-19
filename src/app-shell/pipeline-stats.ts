import type { AppSpec, Change, CrmRecord } from '../../shared/model.js';
import { dueDay, madridDay } from '../task-display.js';
import { stageKind } from './deal-insights.js';

/** F1 · Analítica del proceso. Los pasos de etapa salen del diario de cambios de ESTE ordenador (`/v2/changes`): lo que
 *  ocurrió antes de que existiera el diario no se ve. Las ganadas y perdidas sin paso registrado se sitúan por su fecha de
 *  cierre y se marcan como «aproximadas». Sin puntuaciones: solo recuentos, medias y de dónde salen. */
export type StatsPeriod = 'month' | 'quarter' | 'year';
export const PERIOD_LABEL: Record<StatsPeriod, string> = { month: 'Este mes', quarter: 'Últimos 90 días', year: 'Este año' };

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
const between = (from: string, to: string) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / DAY);

export function periodRange(period: StatsPeriod, today: string): { from: string; to: string } {
  if (period === 'month') return { from: today.slice(0, 7) + '-01', to: today };
  if (period === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  return { from: shift(today, -89), to: today };
}

export interface StageConversion { stageId: string; label: string; entered: number; advanced: number; lost: number; rate: number | null }
export interface LostStage { stageId: string | null; label: string; count: number }
export interface PipelineStats {
  from: string; to: string; journalFrom: string | null;
  won: { count: number; exact: number; approx: number; amount: number; average: number | null; missingAmount: number };
  lost: { count: number; exact: number; approx: number };
  winRate: number | null;
  cycle: { average: number | null; sample: number };
  conversion: StageConversion[];
  lostByStage: LostStage[];
  /** Hay algo aproximado: cierres sin paso registrado o un periodo que empieza antes que el diario. */
  approximate: boolean;
}

interface Step { id: number; day: string; recordId: string; from: string | null; to: string }

export function pipelineStats({ spec, deals, changes, from, to }: { spec: AppSpec; deals: readonly CrmRecord[]; changes: readonly Change[]; from: string; to: string }): PipelineStats {
  const stageKey = spec.roles?.stage ?? 'dealstage', amountKey = spec.roles?.amount ?? 'amount';
  const stagesById = new Map(spec.stages.map(stage => [stage.id, stage]));
  const kindOf = (id: string | null) => id === null ? null : stagesById.has(id) ? stageKind(stagesById.get(id)) : null;
  const closeKey = spec.entities.find(entity => entity.id === 'deals')?.fields.find(field => (field.type === 'date' || field.type === 'datetime') && /cierre|close/i.test(field.key + ' ' + field.label))?.key ?? null;
  const inPeriod = (day: string) => day >= from && day <= to;

  const steps: Step[] = [], created = new Map<string, string>();
  let journalFrom: string | null = null;
  for (const change of [...changes].sort((a, b) => a.id - b.id)) {
    const at = new Date(change.at);
    if (!Number.isFinite(at.getTime())) continue;
    const day = madridDay(at);
    if (journalFrom === null || day < journalFrom) journalFrom = day;
    if (change.entity !== 'deals') continue;
    const after = change.after?.values?.[stageKey], before = change.before?.values?.[stageKey];
    const next = after == null || after === '' ? null : String(after), previous = before == null || before === '' ? null : String(before);
    if (change.operation === 'create') { if (!created.has(change.recordId)) created.set(change.recordId, day); if (next) steps.push({ id: change.id, day, recordId: change.recordId, from: null, to: next }); }
    else if (next && next !== previous) steps.push({ id: change.id, day, recordId: change.recordId, from: previous, to: next });
  }

  // Cierre de cada oportunidad en el periodo: el último paso a ganada o perdida dentro del periodo.
  const closing = new Map<string, Step>(), everClosed = new Set<string>();
  for (const step of steps) {
    const kind = kindOf(step.to);
    if (kind !== 'won' && kind !== 'lost') continue;
    everClosed.add(step.recordId);
    if (inPeriod(step.day)) closing.set(step.recordId, step);
  }
  const current = new Map(deals.filter(deal => deal.entity === 'deals').map(deal => [deal.id, deal]));
  const won = { count: 0, exact: 0, approx: 0, amount: 0, average: null as number | null, missingAmount: 0 };
  const lost = { count: 0, exact: 0, approx: 0 };
  const lostFrom = new Map<string | null, number>();
  const cycles: number[] = [];
  const addAmount = (deal: CrmRecord | undefined) => {
    const raw = deal?.values[amountKey], amount = Number(raw);
    if (raw == null || raw === '' || !Number.isFinite(amount)) won.missingAmount++; else won.amount += amount;
  };
  for (const step of closing.values()) {
    const deal = current.get(step.recordId);
    if (kindOf(step.to) === 'won') {
      won.count++; won.exact++; addAmount(deal);
      const start = created.get(step.recordId);
      if (start) cycles.push(Math.max(0, between(start, step.day)));
    } else {
      lost.count++; lost.exact++;
      lostFrom.set(step.from, (lostFrom.get(step.from) ?? 0) + 1);
    }
  }
  for (const deal of current.values()) {
    if (everClosed.has(deal.id)) continue;
    const kind = kindOf(String(deal.values[stageKey] ?? ''));
    if (kind !== 'won' && kind !== 'lost') continue;
    const day = closeKey ? dueDay(deal.values[closeKey]) : null;
    if (day === null || !inPeriod(day)) continue;
    if (kind === 'won') { won.count++; won.approx++; addAmount(deal); }
    else { lost.count++; lost.approx++; lostFrom.set(null, (lostFrom.get(null) ?? 0) + 1); }
  }
  const known = won.count - won.missingAmount;
  won.average = known > 0 ? won.amount / known : null;

  // Conversión: de las que entraron en cada etapa abierta durante el periodo, cuántas pasaron después a una posterior o a ganada.
  const open = spec.stages.filter(stage => stageKind(stage) === 'open');
  const position = new Map(spec.stages.map((stage, index) => [stage.id, index]));
  const byRecord = new Map<string, Step[]>();
  for (const step of steps) byRecord.set(step.recordId, [...(byRecord.get(step.recordId) ?? []), step]);
  const conversion = open.map(stage => {
    let entered = 0, advanced = 0, dropped = 0;
    for (const list of byRecord.values()) {
      const entry = list.find(step => step.to === stage.id && inPeriod(step.day));
      if (!entry) continue;
      entered++;
      const later = list.filter(step => step.id > entry.id);
      if (later.some(step => kindOf(step.to) === 'won' || (kindOf(step.to) === 'open' && (position.get(step.to) ?? -1) > (position.get(stage.id) ?? -1) && (stagesById.get(step.to)?.pipelineId ?? '') === (stage.pipelineId ?? '')))) advanced++;
      else if (later.some(step => kindOf(step.to) === 'lost')) dropped++;
    }
    return { stageId: stage.id, label: stage.label, entered, advanced, lost: dropped, rate: entered ? advanced / entered : null };
  });

  const lostByStage: LostStage[] = [...lostFrom].map(([stageId, count]) => ({ stageId, label: stageId === null ? 'Etapa anterior desconocida' : stagesById.get(stageId)?.label ?? 'Etapa ya no existe', count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
  const closed = won.count + lost.count;
  return {
    from, to, journalFrom, won, lost,
    winRate: closed ? won.count / closed : null,
    cycle: { average: cycles.length ? cycles.reduce((sum, value) => sum + value, 0) / cycles.length : null, sample: cycles.length },
    conversion, lostByStage,
    approximate: won.approx + lost.approx > 0 || journalFrom === null || journalFrom > from,
  };
}

/** «Desde el 3 nov» / «Sin cambios registrados todavía»: de cuándo es lo que se puede contar con exactitud. */
export function journalNote(stats: Pick<PipelineStats, 'journalFrom' | 'from'>): string {
  if (stats.journalFrom === null) return 'Todavía no hay cambios registrados en este ordenador: todo lo que se ve sale de las fechas de cierre y es aproximado.';
  const [, month, day] = stats.journalFrom.split('-');
  return stats.journalFrom > stats.from
    ? 'El diario de este ordenador empieza el ' + Number(day) + '/' + Number(month) + ': lo anterior sale de las fechas de cierre y es aproximado.'
    : 'Todo el periodo está en el diario de este ordenador.';
}
