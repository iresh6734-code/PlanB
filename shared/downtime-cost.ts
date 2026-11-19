/**
 * Coste de una caída (N3, super plan 2). Cálculo puro y orientativo con cifras que escribe la persona:
 * comerciales × horas sin CRM × coste de una hora de trabajo, más lo que está en juego en las oportunidades que
 * cierran durante esas horas (de la copia, o escrito a mano en la landing). También mide cuántas horas de un periodo
 * hubo una copia al día (no más vieja que el aviso de antigüedad). No guarda ni envía nada.
 */
export interface DowntimeInput { sellers: number; hours: number; hourlyCost: number; deals?: number; dealAmount?: number }
export interface DowntimeCost {
  /** Horas de trabajo que se quedarían sin CRM (comerciales × horas). */
  teamHours: number;
  /** Coste de esas horas. */
  teamCost: number;
  /** Oportunidades que cierran en ese tiempo y su importe. */
  deals: number;
  atStake: number;
}

export const DOWNTIME_LIMITS = {
  sellers: { min: 1, max: 500, initial: 5 },
  hours: { min: 1, max: 72, initial: 4 },
  hourlyCost: { min: 0, max: 500, initial: 35 },
  deals: { min: 0, max: 200, initial: 2 },
  dealAmount: { min: 0, max: 1_000_000, initial: 3000 },
} as const;
export const FRESH_MINUTES = 75;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Cifras saneadas: fuera de rango se recortan y lo ilegible vuelve al valor inicial. */
export function cleanDowntime(input: Partial<Record<keyof DowntimeInput, unknown>>): Required<DowntimeInput> {
  const pick = (key: keyof typeof DOWNTIME_LIMITS) => { const limit = DOWNTIME_LIMITS[key]; return clamp(input[key], limit.min, limit.max, limit.initial); };
  return { sellers: Math.round(pick('sellers')), hours: pick('hours'), hourlyCost: pick('hourlyCost'), deals: Math.round(pick('deals')), dealAmount: pick('dealAmount') };
}

export function downtimeCost(input: Partial<Record<keyof DowntimeInput, unknown>>): DowntimeCost {
  const clean = cleanDowntime(input);
  const teamHours = clean.sellers * clean.hours;
  return { teamHours, teamCost: Math.round(teamHours * clean.hourlyCost), deals: clean.deals, atStake: Math.round(clean.deals * clean.dealAmount) };
}

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const formatEuros = (value: number) => euros.format(Math.round(value));
export const formatHours = (value: number) => plain.format(value) + (value === 1 ? ' hora' : ' horas');

/** Oportunidades abiertas con cierre previsto entre dos días (incluidos), con su importe. */
export function dealsClosing(deals: readonly { close: string | null | undefined; open: boolean; amount: number | null | undefined }[], fromDay: string, toDay: string) {
  let count = 0, amount = 0;
  for (const deal of deals) {
    if (!deal.open || !deal.close || !/^\d{4}-\d{2}-\d{2}/.test(deal.close)) continue;
    const day = deal.close.slice(0, 10);
    if (day < fromDay || day > toDay) continue;
    count++;
    if (typeof deal.amount === 'number' && Number.isFinite(deal.amount)) amount += deal.amount;
  }
  return { count, amount };
}

/** Horas del periodo [from, to) en las que había una copia con menos de `freshMinutes` de antigüedad. */
export function coveredHours(captures: readonly { at: string }[], from: Date, to: Date, freshMinutes = FRESH_MINUTES): { hours: number; total: number; ratio: number } {
  const start = from.getTime(), end = to.getTime(), fresh = freshMinutes * 60_000;
  const total = Math.max(0, end - start);
  const spans = captures.map(item => Date.parse(item.at)).filter(Number.isFinite).sort((a, b) => a - b)
    .map(at => [Math.max(start, at), Math.min(end, at + fresh)] as const).filter(([a, b]) => b > a);
  let covered = 0, reach = -Infinity;
  for (const [a, b] of spans) {
    if (b <= reach) continue;
    covered += b - Math.max(a, reach);
    reach = b;
  }
  const hours = Math.round(covered / 360_000) / 10;
  return { hours, total: Math.round(total / 360_000) / 10, ratio: total ? covered / total : 0 };
}

/** Comienzo del mes en curso, en la hora local del equipo. */
export const monthStart = (now: Date) => new Date(now.getFullYear(), now.getMonth(), 1);
