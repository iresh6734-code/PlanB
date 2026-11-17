import type { ContinuityStatus } from '../../shared/operations.js';

/** Cronología de la copia: qué días hubo captura, prueba o exportación y dónde están los huecos.
 *  Solo usa lo que ya devuelve `/v2/continuity`; no inventa estados. Un día sin captura antes de la primera conservada
 *  es «antes» (no un hueco) y el día de hoy sin captura todavía está «pendiente». */
export type TimelineSource = Pick<ContinuityStatus, 'captures' | 'reports' | 'jobs'> & { recoveryCopy?: ContinuityStatus['recoveryCopy'] };
/** «idle»: día sin captura en el que tampoco se intentó ninguna porque las capturas automáticas están detenidas. */
export type DayState = 'before' | 'covered' | 'gap' | 'idle' | 'pending';

/** Estado de la programación, requisitos para capturar y último fallo registrado. */
export interface CaptureAutomation { active: boolean; reason: string | null; lastAttempt: string | null; failed?: true }
export type AutomationSource = Pick<ContinuityStatus, 'runtime' | 'connected' | 'session' | 'schedule' | 'connection' | 'operations'> & { recoveryIntegrity?: { state: string } };
export function captureAutomation(status: AutomationSource): CaptureAutomation {
  const reason = status.runtime ? 'Este paquete no hace capturas'
    : status.recoveryIntegrity?.state === 'invalid' ? 'El plan de recuperación no es válido'
    : status.session ? 'Hay una sesión de continuidad abierta'
    : !status.connected ? 'Los servicios están en pausa'
    : !status.schedule.enabled ? 'Las capturas automáticas están desactivadas'
    : status.connection === null ? 'Falta configurar la conexión para capturar'
    : null;
  const error = status.operations?.error;
  const lastSuccess = status.operations?.lastSuccess;
  const failed = reason === null && error && (!lastSuccess || Date.parse(error.at) >= Date.parse(lastSuccess));
  return { active: reason === null, reason, lastAttempt: status.operations?.lastAttempt ?? status.schedule.lastAttempt ?? null, ...(failed ? { failed: true } : {}) };
}
export interface TimelineDay {
  key: string; date: Date; state: DayState; captures: number;
  drill: 'pass' | 'fail' | null; exported: boolean; failures: number;
}
export type EventKind = 'capture-first' | 'capture-last' | 'drill-pass' | 'drill-fail' | 'export' | 'confirm' | 'restore' | 'job-fail';
export interface TimelineEvent { at: string; kind: EventKind; label: string; detail?: string }
export interface CopyTimeline {
  days: TimelineDay[]; events: TimelineEvent[];
  summary: {
    covered: number; gaps: number; idle: number; longestGap: { from: Date; to: Date; length: number } | null; window: number;
    firstCaptureAt: string | null; lastCaptureAt: string | null; lastCaptureDays: number | null; automation: CaptureAutomation | null;
  };
}

const dayKey = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const valid = (value: string | null | undefined): value is string => !!value && !Number.isNaN(Date.parse(value));
const JOB_NAMES: Record<string, string> = { capture: 'Captura', drill: 'Prueba', return: 'Devolución' };

export function buildCopyTimeline(source: TimelineSource, now: Date, windowDays = 14, automation: CaptureAutomation | null = null): CopyTimeline {
  const today = startOfDay(now);
  const captures = source.captures.filter(item => valid(item.at)).map(item => new Date(item.at)).sort((a, b) => a.getTime() - b.getTime());
  const first = captures[0] ?? null;
  const reports = source.reports.filter(report => valid(report.completedAt));
  const failedJobs = source.jobs.filter(job => (job.status === 'failed' || job.status === 'interrupted') && valid(job.updatedAt));
  const copy = source.recoveryCopy ?? null;
  const exports = [copy?.exportedAt, copy?.previousConfirmedAt].filter(valid);
  const lastCapture = captures[captures.length - 1] ?? null;
  // Con las capturas automáticas detenidas, los días posteriores al último intento (o a la última captura) no tuvieron
  // ningún intento: no son un fallo de la copia. El día del último intento sin captura sí sigue siendo un hueco.
  const lastActivity = [lastCapture, automation && valid(automation.lastAttempt) ? new Date(automation.lastAttempt) : null].filter((date): date is Date => !!date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const idleFrom = automation && !automation.active ? (lastActivity ? startOfDay(lastActivity).getTime() : -Infinity) : Infinity;

  const days: TimelineDay[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset), key = dayKey(date);
    const count = captures.filter(at => dayKey(at) === key).length;
    const dayReports = reports.filter(report => dayKey(new Date(report.completedAt)) === key);
    const drill = dayReports.some(report => !report.passed) && !dayReports.some(report => report.passed) ? 'fail' : dayReports.length ? 'pass' : null;
    const state: DayState = count ? 'covered' : !first || date < startOfDay(first) ? 'before' : date.getTime() > idleFrom ? 'idle' : offset === 0 ? 'pending' : 'gap';
    days.push({ key, date, state, captures: count, drill, exported: exports.some(at => dayKey(new Date(at)) === key), failures: failedJobs.filter(job => dayKey(new Date(job.updatedAt)) === key).length });
  }

  let longestGap: CopyTimeline['summary']['longestGap'] = null, run: TimelineDay[] = [];
  const closeRun = () => { if (run.length && (!longestGap || run.length > longestGap.length)) longestGap = { from: run[0].date, to: run[run.length - 1].date, length: run.length }; run = []; };
  for (const day of days) { if (day.state === 'gap') run.push(day); else closeRun(); }
  closeRun();

  const events: TimelineEvent[] = [];
  if (first) events.push({ at: first.toISOString(), kind: 'capture-first', label: 'Primera captura conservada' });
  const last = captures[captures.length - 1];
  if (last && last !== first) events.push({ at: last.toISOString(), kind: 'capture-last', label: 'Última captura' });
  for (const report of reports) events.push({ at: report.completedAt, kind: report.passed ? 'drill-pass' : 'drill-fail', label: report.passed ? 'Prueba superada' : 'Prueba con fallos', detail: report.checks.filter(check => check.passed).length + ' de ' + report.checks.length + ' comprobaciones' });
  if (copy && valid(copy.exportedAt)) events.push({ at: copy.exportedAt, kind: 'export', label: 'Copia cifrada exportada', detail: copy.records !== undefined ? copy.records + ' registros' + (copy.changes ? ' · ' + copy.changes + ' cambios locales' : '') : undefined });
  if (copy && valid(copy.confirmedAt)) events.push({ at: copy.confirmedAt, kind: 'confirm', label: 'Copia conservada fuera de este PC', detail: copy.current === false ? 'Corresponde a otra revisión' : undefined });
  if (copy && valid(copy.restoredAt)) events.push({ at: copy.restoredAt, kind: 'restore', label: 'Restauración desde archivo' });
  for (const job of failedJobs) events.push({ at: job.updatedAt, kind: 'job-fail', label: (JOB_NAMES[job.kind] ?? 'Trabajo') + (job.status === 'interrupted' ? ' interrumpida' : ' fallida'), detail: job.message || undefined });
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return { days, events, summary: {
    covered: days.filter(day => day.state === 'covered').length, gaps: days.filter(day => day.state === 'gap').length, idle: days.filter(day => day.state === 'idle').length,
    longestGap, window: windowDays, firstCaptureAt: first ? first.toISOString() : null, lastCaptureAt: lastCapture ? lastCapture.toISOString() : null,
    lastCaptureDays: lastCapture ? Math.round((today.getTime() - startOfDay(lastCapture).getTime()) / 86_400_000) : null, automation,
  } };
}
