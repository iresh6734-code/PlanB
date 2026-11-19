/** Lectura rápida de una oportunidad para el tablero y el panel: de qué tipo es su etapa y en qué punto está su cierre.
 *  Solo interpreta valores que ya tiene la oportunidad; no inventa fechas ni probabilidades. */
export type StageKind = 'open' | 'won' | 'lost';
export type CloseTone = 'ok' | 'soon' | 'late' | 'won' | 'lost' | 'none';
export interface CloseStatus { label: string; tone: CloseTone }

/** «Ganada» / «Perdida» se deducen del nombre o del identificador de la etapa (también en inglés, como llegan de HubSpot). */
export function stageKind(stage: { id: string; label: string } | undefined): StageKind {
  if (!stage) return 'open';
  const text = (stage.label + ' ' + stage.id).toLowerCase();
  if (/perdid|lost|descartad|closedlost/.test(text)) return 'lost';
  if (/ganad|won|closedwon|firmad/.test(text)) return 'won';
  return 'open';
}

const DAY = 86_400_000;
const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayStart = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Estado de la fecha de cierre respecto a «hoy» (AAAA-MM-DD). Abierta y pasada → tarde; en ≤ 7 días → pronto. */
export function closeStatus(value: unknown, today: string, kind: StageKind): CloseStatus {
  if (kind === 'won') return { label: 'Ganada', tone: 'won' };
  if (kind === 'lost') return { label: 'Perdida', tone: 'lost' };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return { label: 'Sin fecha de cierre', tone: 'none' };
  const days = Math.round((dayStart(value.slice(0, 10)) - dayStart(today)) / DAY);
  const date = shortDate.format(new Date(dayStart(value.slice(0, 10))));
  if (days < 0) return { label: 'Venció hace ' + (-days === 1 ? '1 día' : -days + ' días') + ' · ' + date, tone: 'late' };
  if (days === 0) return { label: 'Cierra hoy', tone: 'soon' };
  if (days <= 7) return { label: 'Cierra en ' + (days === 1 ? '1 día' : days + ' días') + ' · ' + date, tone: 'soon' };
  return { label: 'Cierra el ' + date, tone: 'ok' };
}

/** Importe en euros con separador de miles y sin decimales, igual que los totales («1.200 €»). */
export const euros = (value: unknown) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(value) || 0);
