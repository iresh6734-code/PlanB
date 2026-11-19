import type { CrmRecord } from '../../shared/model.js';
import { dueDay } from '../task-display.js';
import { stageKind } from './deal-insights.js';

/** F2 · Objetivo del mes: una cifra guardada como preferencia de este navegador (nunca en la copia) y cuánto la cubren
 *  lo ganado, lo comprometido y lo probable del mes en curso, con el ritmo que falta por día laborable. */
export const GOAL_KEY = 'planb:goal:month';
export const GOAL_MAX = 1e12;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storeOf = (store?: Store | null) => store === undefined ? globalThis.localStorage : store;

export function readGoal(store?: Store | null): number | null {
  try {
    const value = Number(storeOf(store)?.getItem(GOAL_KEY));
    return Number.isFinite(value) && value > 0 && value <= GOAL_MAX ? Math.round(value) : null;
  } catch { return null; }
}
/** `null` o un valor no válido lo quita. Devuelve false si el navegador no deja guardar. */
export function writeGoal(value: number | null, store?: Store | null): boolean {
  try {
    const target = storeOf(store);
    if (!target) return false;
    if (value === null || !Number.isFinite(value) || value <= 0 || value > GOAL_MAX) target.removeItem(GOAL_KEY);
    else target.setItem(GOAL_KEY, String(Math.round(value)));
    return true;
  } catch { return false; }
}
/** «12.500», «12500 €», «12,5k» → 12500. Lo que no se entiende, null. */
export function parseGoal(text: string): number | null {
  const clean = text.trim().toLowerCase().replace(/€|eur|\s/g, '');
  const match = /^(\d+(?:[.,]\d+)*)(k|mil)?$/.exec(clean);
  if (!match) return null;
  let digits = match[1]!;
  // Con «k» la coma o el punto es decimal; sin ella, los puntos son de miles y la coma decimal.
  digits = match[2] ? digits.replace(',', '.') : digits.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const value = Number(digits) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) && value > 0 && value <= GOAL_MAX ? Math.round(value) : null;
}

/** Días de lunes a viernes desde hoy (incluido) hasta el último del mes. Los festivos no se conocen: se dice en la interfaz. */
export function workdaysLeft(today: string): number {
  const start = Date.parse(today + 'T12:00:00Z');
  if (!Number.isFinite(start)) return 0;
  const month = today.slice(0, 7);
  let count = 0;
  for (let at = start; new Date(at).toISOString().slice(0, 7) === month; at += 86_400_000) {
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export interface WonInMonth { amount: number; deals: number; missingAmount: number; undated: number }
/** Ganadas con la fecha de cierre en el mes de `today`. Las ganadas sin fecha no se pueden situar y se cuentan aparte. */
export function wonInMonth(deals: readonly CrmRecord[], keys: { stageKey: string; amountKey: string; closeKey: string | null; stages: ReadonlyMap<string, { id: string; label: string }> }, today: string): WonInMonth {
  const result: WonInMonth = { amount: 0, deals: 0, missingAmount: 0, undated: 0 };
  const month = today.slice(0, 7);
  for (const deal of deals) {
    const stage = keys.stages.get(String(deal.values[keys.stageKey] ?? ''));
    if (!stage || stageKind(stage) !== 'won') continue;
    const day = keys.closeKey ? dueDay(deal.values[keys.closeKey]) : null;
    if (day === null) { result.undated++; continue; }
    if (day.slice(0, 7) !== month) continue;
    result.deals++;
    const amount = Number(deal.values[keys.amountKey]);
    if (deal.values[keys.amountKey] == null || deal.values[keys.amountKey] === '' || !Number.isFinite(amount)) result.missingAmount++;
    else result.amount += amount;
  }
  return result;
}

export type GoalStatus = 'reached' | 'covered' | 'reachable' | 'short';
export interface GoalProgress {
  goal: number; won: number; committed: number; probable: number;
  /** Partes de la barra (0–1), ya recortadas para no pasar del total. */
  bars: { won: number; committed: number; probable: number };
  /** Dónde cae el objetivo en la barra (1 salvo que se haya superado). */
  mark: number;
  gap: number; daysLeft: number; perDay: number | null; status: GoalStatus;
}
/** `committed`: importe completo de las abiertas del mes en etapas seguras. `probable`: el ponderado de todas las abiertas del mes;
 *  en la barra solo se pinta lo que supera a lo comprometido, para no contar dos veces. */
export function goalProgress({ goal, won, committed, probable, today }: { goal: number; won: number; committed: number; probable: number; today: string }): GoalProgress {
  const extra = Math.max(0, probable - committed);
  const scale = Math.max(goal, won + committed + extra, 1);
  const gap = Math.max(0, goal - won);
  const daysLeft = workdaysLeft(today);
  const status: GoalStatus = won >= goal ? 'reached' : won + committed >= goal ? 'covered' : won + committed + extra >= goal ? 'reachable' : 'short';
  return {
    goal, won, committed, probable,
    bars: { won: won / scale, committed: committed / scale, probable: extra / scale }, mark: goal / scale,
    gap, daysLeft, perDay: gap > 0 && daysLeft > 0 ? gap / daysLeft : null, status,
  };
}
