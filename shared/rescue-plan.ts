import type { ResponseBucket, ResponseQueue } from './response-queue.js';
import { MAX_ESTIMATE_MINUTES, MIN_ESTIMATE_MINUTES } from './rescue-room.js';
// Plan de trabajo por tiempo disponible sobre la cola EXISTENTE (buildResponseQueue). No vuelve a interpretar fechas ni estados:
// conserva el orden de negocio que devuelve la cola y añade solo la regla de cabida con estimaciones declaradas por el operador.
export type ExclusionReason = 'unknown-status' | 'blocked-by-operator' | 'no-estimate' | 'exceeds-remaining';
export interface PlanEntry { id: string; label: string; bucket: ResponseBucket; minutes: number; startMinute: number; endMinute: number }
export interface PlanExclusion { id: string; label: string; bucket: ResponseBucket; reason: ExclusionReason; detail: string; minutes: number | null }
export interface RescuePlan {
  budgetMinutes: number; usedMinutes: number; remainingMinutes: number; included: PlanEntry[]; excluded: PlanExclusion[];
  considered: number; notConsidered: number; unknownEstimates: number; method: string; limitations: string[];
}
const DETAIL: Record<ExclusionReason, string> = {
  'unknown-status': 'El estado no permite confirmar que la tarea siga abierta; no se planifica hasta revisarlo.',
  'blocked-by-operator': 'Marcada como bloqueada por el operador (declaración manual, no una dependencia inferida).',
  'no-estimate': 'Sin estimación declarada: una estimación ausente es desconocida, no cero.',
  'exceeds-remaining': 'No cabe en el tiempo restante del plan.',
};
export const validBudget = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ESTIMATE_MINUTES;

export function buildRescuePlan(queue: ResponseQueue, input: { budgetMinutes: number; estimates: Record<string, number>; blocked?: Record<string, string> }): RescuePlan {
  const { budgetMinutes, estimates, blocked = {} } = input;
  if (!validBudget(budgetMinutes)) throw new RangeError('El tiempo disponible admite entre 1 y ' + MAX_ESTIMATE_MINUTES + ' minutos enteros.');
  const included: PlanEntry[] = [], excluded: PlanExclusion[] = [];
  let used = 0, unknownEstimates = 0;
  for (const item of queue.items) {
    const raw = Object.prototype.hasOwnProperty.call(estimates, item.id) ? estimates[item.id] : undefined;
    const minutes = Number.isInteger(raw) && raw! >= MIN_ESTIMATE_MINUTES && raw! <= MAX_ESTIMATE_MINUTES ? raw! : null;
    const exclude = (reason: ExclusionReason) => excluded.push({ id: item.id, label: item.label, bucket: item.bucket, reason, detail: DETAIL[reason], minutes });
    if (minutes === null) unknownEstimates++;
    if (item.status === 'unknown') exclude('unknown-status');
    else if (Object.prototype.hasOwnProperty.call(blocked, item.id)) exclude('blocked-by-operator');
    else if (minutes === null) exclude('no-estimate');
    else if (used + minutes > budgetMinutes) exclude('exceeds-remaining');
    else { included.push({ id: item.id, label: item.label, bucket: item.bucket, minutes, startMinute: used, endMinute: used + minutes }); used += minutes; }
  }
  return {
    budgetMinutes, usedMinutes: used, remainingMinutes: budgetMinutes - used, included, excluded, considered: queue.items.length,
    notConsidered: Math.max(0, queue.summary.totalQueued - queue.items.length), unknownEstimates,
    method: 'Heurística voraz, no optimización: recorre la cola en su orden de negocio, incluye cada tarea cuya estimación declarada cabe en el tiempo restante y explica el resto. Una tarea posterior más corta puede entrar aunque una anterior no cupiera.',
    limitations: [
      'Que una tarea quepa en el plan no demuestra que se complete ni que se ahorre tiempo o dinero.',
      'Las estimaciones son manuales; este plan no las deduce ni las valida contra el CRM.',
      'La cola devuelve como máximo 200 tareas: las demás figuran en el resumen pero no se consideran en el plan.',
    ],
  };
}

export interface BudgetComparison { a: RescuePlan; b: RescuePlan; onlyInB: string[]; onlyInA: string[]; deltaMinutes: number }
export function compareBudgets(queue: ResponseQueue, a: number, b: number, estimates: Record<string, number>, blocked?: Record<string, string>): BudgetComparison {
  const planA = buildRescuePlan(queue, { budgetMinutes: a, estimates, blocked }), planB = buildRescuePlan(queue, { budgetMinutes: b, estimates, blocked });
  const inA = new Set(planA.included.map(e => e.id)), inB = new Set(planB.included.map(e => e.id));
  return { a: planA, b: planB, onlyInB: [...inB].filter(id => !inA.has(id)), onlyInA: [...inA].filter(id => !inB.has(id)), deltaMinutes: planB.usedMinutes - planA.usedMinutes };
}
