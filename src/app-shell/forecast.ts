import { dueDay } from '../task-display.js';

/** Previsión ponderada de oportunidades abiertas por mes de cierre (hora de Madrid).
 *  La probabilidad de cada etapa sale del porcentaje escrito en su nombre («Propuesta (40 %)») o, si no lo tiene,
 *  de su posición entre las etapas abiertas; la interfaz siempre dice cuál de las dos se usó. */
export const COMMITTED_FROM = 0.7;
export const FORECAST_MONTHS = 3;

export interface StageProbability { stageId: string; label: string; probability: number; source: 'label' | 'position' }
export interface ForecastDeal { stageId: string; amount: number | null; close: unknown }
export interface ForecastFigures { deals: number; committed: number; probable: number; optimistic: number; missingAmount: number }
export interface ForecastMonth extends ForecastFigures { month: string; label: string }
export interface Forecast {
  months: ForecastMonth[]; late: ForecastFigures; later: ForecastFigures; undated: ForecastFigures; total: ForecastFigures;
  probabilities: StageProbability[];
}

const round5 = (value: number) => Math.round(value * 20) / 20;
export function stageProbabilities(openStages: readonly { id: string; label: string }[]): StageProbability[] {
  return openStages.map((stage, index) => {
    const written = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(stage.label);
    const percent = written ? Number(written[1]!.replace(',', '.')) : NaN;
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) return { stageId: stage.id, label: stage.label, probability: percent / 100, source: 'label' as const };
    return { stageId: stage.id, label: stage.label, probability: round5((index + 1) / (openStages.length + 1)), source: 'position' as const };
  });
}

const empty = (): ForecastFigures => ({ deals: 0, committed: 0, probable: 0, optimistic: 0, missingAmount: 0 });
function add(target: ForecastFigures, amount: number | null, probability: number) {
  target.deals++;
  if (amount === null) { target.missingAmount++; return; }
  target.optimistic += amount;
  target.probable += amount * probability;
  if (probability >= COMMITTED_FROM) target.committed += amount;
}
export function addMonths(month: string, count: number): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (value - 1) + count;
  return Math.floor(index / 12) + '-' + String(index % 12 + 1).padStart(2, '0');
}
const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });
export const monthLabel = (month: string) => { const name = monthName.format(new Date(month + '-15T12:00:00Z')); return name.charAt(0).toUpperCase() + name.slice(1); };

/** `today` es el día de Madrid (AAAA-MM-DD). Las oportunidades de etapas que no están en `probabilities` no cuentan. */
export function weightedForecast(deals: readonly ForecastDeal[], probabilities: readonly StageProbability[], today: string, months = FORECAST_MONTHS): Forecast {
  const byStage = new Map(probabilities.map(item => [item.stageId, item.probability]));
  const first = today.slice(0, 7);
  const window = Array.from({ length: months }, (_, index) => addMonths(first, index));
  const result: Forecast = {
    months: window.map(month => ({ month, label: monthLabel(month), ...empty() })),
    late: empty(), later: empty(), undated: empty(), total: empty(), probabilities: [...probabilities],
  };
  for (const deal of deals) {
    const probability = byStage.get(deal.stageId);
    if (probability === undefined) continue;
    const day = dueDay(deal.close);
    const bucket = day === null ? result.undated : day < today ? result.late : result.months.find(item => item.month === day.slice(0, 7)) ?? result.later;
    add(bucket, deal.amount, probability);
    add(result.total, deal.amount, probability);
  }
  return result;
}
