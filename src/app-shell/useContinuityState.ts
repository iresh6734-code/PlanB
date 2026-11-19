import { useCallback, useEffect, useState } from 'react';
import type { ContinuityStatus } from '../../shared/operations.js';
import type { ContinuityTab } from '../ContinuityHome.js';
import { continuityAlerts, type ContinuityAlert } from './continuity-alerts.js';
import type { PageId } from './session.js';

export type CopySignal = { count: number; tone: 'danger' | 'warn'; titles: string[] };

/** Señal del menú para la copia: cuántos avisos hay, el tono del más grave y sus títulos. Sin avisos, nada. */
export function copySignalOf(alerts: ContinuityAlert[] | null): CopySignal | null {
  if (!alerts?.length) return null;
  return { count: alerts.length, tone: alerts.some(alert => alert.tone === 'danger') ? 'danger' : 'warn', titles: alerts.map(alert => alert.title) };
}
/** Conserva la lista anterior si los avisos no cambian, para no repintar el menú en cada lectura. */
export const keepAlerts = (current: ContinuityAlert[] | null, next: ContinuityAlert[]) => current && JSON.stringify(current) === JSON.stringify(next) ? current : next;

/** T2 · Estado de continuidad que App comparte con el menú: el último estado leído por Inicio o Continuidad
 *  (sin otra lectura), sus avisos y la pestaña pedida al abrir Continuidad desde un aviso o el pasaporte. */
export function useContinuityState(page: PageId) {
  const [copyAlerts, setCopyAlerts] = useState<ContinuityAlert[] | null>(null), [continuityTab, setContinuityTab] = useState<ContinuityTab | null>(null);
  const [continuityStatus, setContinuityStatus] = useState<ContinuityStatus | null>(null);
  const receiveContinuity = useCallback((status: ContinuityStatus) => { setContinuityStatus(status); const next = continuityAlerts(status, new Date()); setCopyAlerts(current => keepAlerts(current, next)); }, []);
  useEffect(() => { if (page !== 'continuity') setContinuityTab(null); }, [page]);
  return { continuityStatus, receiveContinuity, continuityTab, setContinuityTab, copySignal: copySignalOf(copyAlerts) };
}
