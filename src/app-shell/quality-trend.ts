import type { EntityName } from '../../shared/model.js';
import type { EntityCompleteness } from './quality.js';

/** Un punto por día (hora de Madrid) con el porcentaje de registros completos de cada tipo. Solo cifras: ningún dato de registros. */
export type QualityPoint = { day: string; values: Partial<Record<EntityName, number>> };
export type QualityTrend = { from: number; to: number; delta: number; since: string; series: number[] };

export const TREND_KEY = 'planb.quality-trend.v1';
export const TREND_MAX = 14;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const pointFrom = (day: string, rows: EntityCompleteness[]): QualityPoint =>
  ({ day, values: Object.fromEntries(rows.map(row => [row.entity, row.pct])) });

/** Añade el punto del día (sustituye el del mismo día), ordena y se queda con los últimos `max`. */
export function addPoint(history: QualityPoint[], point: QualityPoint, max = TREND_MAX): QualityPoint[] {
  return [...history.filter(item => item.day !== point.day), point].sort((a, b) => a.day.localeCompare(b.day)).slice(-max);
}

/** Tendencia de un tipo: del primer punto guardado al último. Sin dos puntos con valor no hay tendencia. */
export function trendOf(history: QualityPoint[], entity: EntityName): QualityTrend | null {
  const known = history.filter(point => typeof point.values[entity] === 'number');
  if (known.length < 2) return null;
  const first = known[0], last = known[known.length - 1];
  const from = first.values[entity]!, to = last.values[entity]!;
  return { from, to, delta: to - from, since: first.day, series: known.map(point => point.values[entity]!) };
}

/** Lee el historial guardado, descartando lo que no tenga la forma esperada. */
export function parseHistory(raw: string | null, scope: string): QualityPoint[] {
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as unknown;
    const list = all && typeof all === 'object' ? (all as Record<string, unknown>)[scope] : null;
    if (!Array.isArray(list)) return [];
    return list.filter((point): point is QualityPoint => !!point && typeof point === 'object' && DAY.test(String((point as QualityPoint).day))
      && !!(point as QualityPoint).values && typeof (point as QualityPoint).values === 'object'
      && Object.values((point as QualityPoint).values).every(value => typeof value === 'number' && value >= 0 && value <= 100)).slice(-TREND_MAX);
  } catch { return []; }
}

export function serializeHistory(raw: string | null, scope: string, history: QualityPoint[]): string {
  let all: Record<string, unknown> = {};
  try { const parsed = raw ? JSON.parse(raw) as unknown : null; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) all = parsed as Record<string, unknown>; } catch { /* se rehace */ }
  return JSON.stringify({ ...all, [scope]: history });
}

/** Puntos de una línea de 0–100 en un lienzo `width`×`height` (eje Y invertido). */
export function sparkPoints(series: number[], width: number, height: number): string {
  if (series.length < 2) return '';
  const step = width / (series.length - 1);
  return series.map((value, index) => (index * step).toFixed(1) + ',' + (height - value / 100 * height).toFixed(1)).join(' ');
}
