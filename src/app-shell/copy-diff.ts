import { SHRINK_RATIO } from './continuity-insights.js';

type Counts = { added: number; absent: number; changed: number; unchanged: number };
export interface DiffRow extends Counts { entity: string; label: string; before: number; after: number; net: number; ratio: number | null; alert: boolean }
export interface DiffDigest { rows: DiffRow[]; totals: Counts & { before: number; after: number; net: number }; headline: string; alert: boolean }

const NAMES: Record<string, [string, string]> = { contacts: ['cliente', 'clientes'], companies: ['empresa', 'empresas'], deals: ['oportunidad', 'oportunidades'], tasks: ['tarea', 'tareas'] };
const noun = (entity: string, count: number) => { const [one, many] = NAMES[entity] ?? ['registro', 'registros']; return count === 1 ? one : many; };
const number = new Intl.NumberFormat('es-ES');
const percent = (ratio: number) => Math.round(ratio * 100) + ' %';

/** Captura inmediatamente anterior (más antigua) a `id`, para comparar una captura con la que la precede. */
export function previousCapture<T extends { id: string; at: string }>(captures: readonly T[], id: string): T | null {
  const sorted = captures.filter(item => Number.isFinite(Date.parse(item.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const index = sorted.findIndex(item => item.id === id);
  return index >= 0 ? sorted[index + 1] ?? null : null;
}

/** Resumen por objeto de una comparación de capturas: cuántos había, cuántos hay y qué parte falta en la segunda.
 *  Un objeto con más del 15 % ausente se marca: no prueba un borrado remoto, pero merece revisar el alcance. */
export function diffDigest(counts: Record<string, Counts>, label: (entity: string) => string = entity => entity): DiffDigest {
  const rows: DiffRow[] = Object.entries(counts).map(([entity, c]) => {
    const before = c.absent + c.changed + c.unchanged, after = c.added + c.changed + c.unchanged;
    const ratio = before > 0 ? c.absent / before : null;
    return { entity, label: label(entity), ...c, before, after, net: after - before, ratio, alert: ratio !== null && ratio > SHRINK_RATIO };
  });
  const sum = (key: keyof Counts | 'before' | 'after') => rows.reduce((total, row) => total + row[key], 0);
  const totals = { added: sum('added'), absent: sum('absent'), changed: sum('changed'), unchanged: sum('unchanged'), before: sum('before'), after: sum('after'), net: sum('after') - sum('before') };
  const worst = rows.filter(row => row.alert).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
  let headline: string;
  if (worst) headline = 'Faltan ' + number.format(worst.absent) + ' ' + noun(worst.entity, worst.absent) + ' de ' + number.format(worst.before) + ' (' + percent(worst.ratio!) + ') en la segunda captura. Revisa el alcance de la conexión antes de confiar en ella.';
  else if (!totals.added && !totals.absent && !totals.changed) headline = 'Las dos capturas tienen los mismos registros con los mismos valores.';
  else headline = [totals.added ? number.format(totals.added) + (totals.added === 1 ? ' alta' : ' altas') : '', totals.changed ? number.format(totals.changed) + (totals.changed === 1 ? ' cambio' : ' cambios') : '', totals.absent ? number.format(totals.absent) + (totals.absent === 1 ? ' ausencia' : ' ausencias') : ''].filter(Boolean).join(', ') + ' entre las dos capturas.';
  return { rows, totals, headline: headline[0].toUpperCase() + headline.slice(1), alert: !!worst };
}

/** Anchuras (en %) de la barra apilada de una fila, relativas al mayor tamaño de cualquier objeto para comparar a simple vista. */
export function diffBar(row: DiffRow, scale: number): { unchanged: number; changed: number; added: number; absent: number } {
  const base = Math.max(scale, 1), width = (value: number) => Math.round((value / base) * 1000) / 10;
  return { unchanged: width(row.unchanged), changed: width(row.changed), added: width(row.added), absent: width(row.absent) };
}
