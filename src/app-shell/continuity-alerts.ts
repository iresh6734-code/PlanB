import type { ContinuityStatus } from '../../shared/operations.js';
import { captureAutomation } from './copy-timeline.js';

/** Avisos de la copia que deben verse fuera de Continuidad (Inicio y menú): lo que, si se deja, hace que el Plan B no sirva
 *  el día que haga falta. Solo usa `/v2/continuity`; cada aviso dice qué pasa y lleva a donde se arregla. */
export type AlertTarget = 'estado' | 'copias' | 'export';
export interface ContinuityAlert { id: string; tone: 'danger' | 'warn'; title: string; detail: string; action: { label: string; target: AlertTarget } }
export type AlertSource = Pick<ContinuityStatus, 'captures' | 'readiness' | 'runtime' | 'connected' | 'session' | 'schedule'> & Partial<Pick<ContinuityStatus, 'operations' | 'connection' | 'recoveryCopy' | 'recoveryIntegrity' | 'latestCaptureAt' | 'stale'>>;

const DAY = 86_400_000;
const span = (ms: number) => { const hours = Math.floor(ms / 3_600_000), days = Math.floor(ms / DAY); return days >= 2 ? days + ' días' : days === 1 ? '1 día' : hours >= 2 ? hours + ' horas' : 'una hora'; };

export function continuityAlerts(status: AlertSource, now: Date): ContinuityAlert[] {
  const alerts: ContinuityAlert[] = [];
  if (status.recoveryIntegrity?.state === 'invalid') alerts.push({ id: 'integrity', tone: 'danger', title: 'El plan de recuperación no es válido', detail: 'Las capturas y la devolución están bloqueadas hasta revisarlo.', action: { label: 'Ver Continuidad', target: 'estado' } });
  const latest = status.latestCaptureAt ?? status.captures[0]?.at ?? null;
  if (!latest) {
    if (!status.runtime) alerts.push({ id: 'no-copy', tone: 'warn', title: 'Todavía no hay ninguna copia', detail: 'Sin una captura no hay nada que consultar ni que probar si el CRM falla.', action: { label: 'Preparar copia', target: 'estado' } });
    return alerts;
  }
  const age = now.getTime() - Date.parse(latest);
  const automation = captureAutomation(status);
  if (!status.runtime && (status.stale ?? age > 75 * 60_000)) alerts.push({ id: 'stale', tone: age >= 7 * DAY ? 'danger' : 'warn', title: 'La copia tiene ' + span(age), detail: 'Lo que haya cambiado en el CRM desde entonces no está en ella.', action: { label: 'Ver cronología', target: 'copias' } });
  if (!status.runtime && !automation.active && status.recoveryIntegrity?.state !== 'invalid') alerts.push({ id: 'stopped', tone: 'warn', title: 'Capturas automáticas detenidas', detail: automation.reason + '.', action: { label: 'Revisar', target: 'estado' } });
  if (automation.failed) alerts.push({ id: 'capture-failed', tone: 'warn', title: 'La última captura no se completó', detail: 'La programación sigue habilitada. Revisa la conexión y el último intento.', action: { label: 'Revisar', target: 'estado' } });
  const readiness = status.readiness?.status;
  if (readiness === 'failed') alerts.push({ id: 'drill', tone: 'danger', title: 'La última prueba de la copia tuvo fallos', detail: 'Revisa qué comprobaciones no pasaron antes de confiar en ella.', action: { label: 'Ver la prueba', target: 'estado' } });
  else if (readiness === 'untested' || readiness === 'expired' || readiness === 'blocked') alerts.push({ id: 'drill', tone: 'warn', title: readiness === 'expired' ? 'La prueba de la copia ha caducado' : readiness === 'blocked' ? 'La copia no se puede probar todavía' : 'Esta copia no se ha probado', detail: readiness === 'blocked' ? 'Faltan datos para el simulacro.' : 'Nadie ha comprobado aún que podrías trabajar con ella sin el CRM.', action: { label: 'Probar', target: 'estado' } });
  const copy = status.recoveryCopy ?? null;
  if (!status.runtime) {
    if (!copy) alerts.push({ id: 'recovery', tone: 'warn', title: 'Sin copia cifrada fuera de este PC', detail: 'Si este ordenador falla, la copia se pierde con él.', action: { label: 'Exportar', target: 'export' } });
    else if (copy.current === false) alerts.push({ id: 'recovery', tone: 'warn', title: 'La copia cifrada está desfasada', detail: 'Corresponde a otra revisión; exporta los cambios actuales.', action: { label: 'Exportar', target: 'export' } });
    else if (!copy.confirmedAt) alerts.push({ id: 'recovery', tone: 'warn', title: 'Confirma dónde guardaste la copia cifrada', detail: 'Exportada, pero sin confirmar que se conserva fuera de este PC.', action: { label: 'Confirmar', target: 'estado' } });
  }
  return alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));
}
