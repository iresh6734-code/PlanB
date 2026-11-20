// Reprogramar cierres pasados (Ronda D): reparte las oportunidades con la fecha de cierre ya pasada en los próximos días
// laborables, a un ritmo por día. Lógica pura, sin React ni red: el lote se guarda con el cambio en bloque (bulk-edit).
import type { CrmRecord } from '../../shared/model.js';
import { MAX_BULK, type BulkItem } from './bulk-edit.js';
import { addWorkingDays } from './sequences.js';

/** Ritmos que se ofrecen: cuántos cierres caen el mismo día. */
export const PACES = [1, 2, 3, 5] as const;
export interface ReschedulePlan { items: BulkItem[]; first: string | null; last: string | null; skipped: number }

const dayOf = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const nextDay = (day: string) => new Date(Date.parse(day + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10);

/** Nuevas fechas de cierre para las que ya pasaron: primero las de más importe (a igual importe, la que lleva más tiempo
 *  vencida), `perDay` por día laborable desde el primero después de hoy. Nunca hoy ni antes, nunca en fin de semana.
 *  Las que no tienen fecha o aún no vencen se quedan fuera; más de MAX_BULK se cuentan en `skipped`. */
export function planReschedule(records: readonly CrmRecord[], closeKey: string, today: string, { perDay = 2, amountKey }: { perDay?: number; amountKey?: string } = {}): ReschedulePlan {
  const pace = Math.max(1, Math.floor(perDay) || 1);
  const amount = (record: CrmRecord) => amountKey ? Number(record.values[amountKey]) || 0 : 0;
  const late = records.map(record => ({ record, day: dayOf(record.values[closeKey]) })).filter((entry): entry is { record: CrmRecord; day: string } => entry.day !== null && entry.day < today);
  late.sort((a, b) => amount(b.record) - amount(a.record) || a.day.localeCompare(b.day) || a.record.id.localeCompare(b.record.id));
  const start = nextDay(today), kept = late.slice(0, MAX_BULK);
  const items = kept.map(({ record }, index): BulkItem => ({ record, key: closeKey, before: String(record.values[closeKey]), after: addWorkingDays(start, Math.floor(index / pace)) }));
  return { items, first: items[0]?.after ?? null, last: items[items.length - 1]?.after ?? null, skipped: late.length - kept.length };
}
