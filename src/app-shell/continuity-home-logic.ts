import type { LedgerDay, LedgerFilter, NextActionId } from './continuity-insights.js';

/** T4 · Lógica pura de Continuidad: el componente solo pinta. */
export const LEDGER_FILTERS: readonly { id: LedgerFilter; label: string }[] = [{ id: 'all', label: 'Todas' }, { id: 'today', label: 'Hoy' }, { id: 'week', label: '7 días' }, { id: 'shrink', label: 'Más pequeñas' }];
export const LEDGER_PAGE = 12;

/** Recorta el diario de capturas a una página (o lo deja entero) sin dejar días vacíos, y cuenta cuántas quedan ocultas. */
export function pageLedger(days: readonly LedgerDay[], shown: number, all: boolean, page = LEDGER_PAGE) {
  let budget = all ? Infinity : page;
  const visible = days.map(day => { const entries = day.entries.slice(0, Math.max(0, budget)); budget -= entries.length; return { ...day, entries }; }).filter(day => day.entries.length);
  return { days: visible, hidden: shown - visible.reduce((sum, day) => sum + day.entries.length, 0) };
}

export interface NextActionGate { busy: boolean; jobRunning: boolean; connected: boolean; inSession: boolean; ready: boolean; hasCapture: boolean }
/** Cuándo no se puede pulsar la siguiente acción recomendada: nada mientras se trabaja, ni capturar, reanudar o ensayar con un trabajo en marcha. */
export function nextActionBlocked(id: NextActionId, gate: NextActionGate) {
  return gate.busy || ((id === 'refresh' || id === 'resume' || id === 'drill') && gate.jobRunning) || (id === 'refresh' && (!gate.connected || gate.inSession)) || (id === 'export' && !gate.ready) || (id === 'drill' && !gate.hasCapture);
}
