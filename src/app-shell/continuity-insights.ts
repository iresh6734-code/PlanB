import type { AppState } from '../../shared/model.js';
import type { ContinuityStatus, DrillReadiness, Job } from '../../shared/operations.js';
import { workspaceCopy } from './workspace-copy.js';

/** Lecturas derivadas de `/v2/continuity` para la portada de Continuidad. Todo es puro y local: no pide nada a ningún
 *  servidor ni inventa estados; si un dato falta, lo dice. */
export const STALE_MINUTES = 75;
const HOUR = 3_600_000, DAY = 86_400_000;
const valid = (value: string | null | undefined): value is string => !!value && !Number.isNaN(Date.parse(value));
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayKey = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
const number = new Intl.NumberFormat('es-ES');

export function formatAge(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return 'sin dato';
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return Math.round(minutes) + ' min';
  if (minutes < 48 * 60) return Math.round(minutes / 60) + ' h';
  return Math.round(minutes / 1440) + ' d';
}
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return number.format(Math.max(1, Math.round(bytes / 1024))) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' MB';
  return (bytes / 1024 ** 3).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' GB';
}
const ageOf = (status: Pick<ContinuityStatus, 'ageMinutes' | 'captures'>, now: Date): number | null => {
  if (status.ageMinutes !== null && Number.isFinite(status.ageMinutes)) return status.ageMinutes;
  const latest = status.captures.map(item => item.at).filter(valid).sort().pop();
  return latest ? Math.max(0, (now.getTime() - Date.parse(latest)) / 60_000) : null;
};

export type InsightSource = Pick<ContinuityStatus, 'captures' | 'reports' | 'jobs' | 'stale' | 'ageMinutes' | 'session' | 'connected' | 'protected' | 'pendingChanges' | 'latestCapture'>
  & Partial<Pick<ContinuityStatus, 'recoveryCopy' | 'connection'>>;
/** El estado del simulacro llega de la copia activa (puede no ser la última captura): la portada lo pasa aparte. */
export interface InsightContext { hubspotConfigured: boolean; drill: DrillReadiness['status'] | null; reportId?: string | null }

export type StepId = 'protect' | 'connect' | 'capture' | 'drill' | 'recovery';
export interface ReadinessStep { id: StepId; label: string; done: boolean; detail: string }
export type ReadinessLevel = 'ready' | 'almost' | 'risk' | 'start';
export type NextActionId = 'prepare' | 'refresh' | 'resume' | 'drill' | 'protect' | 'connect' | 'export' | 'confirm' | 'none';
export interface NextAction { id: NextActionId; label: string; detail: string }
export interface Readiness { steps: ReadinessStep[]; done: number; total: number; level: ReadinessLevel; title: string; next: NextAction }

const DRILL_DETAIL: Record<DrillReadiness['status'], string> = {
  empty: 'Sin captura no hay nada que probar',
  blocked: 'Faltan datos para el simulacro',
  untested: 'Esta copia todavía no se ha probado',
  passed: 'La copia se abrió, se editó y se reinició en aislamiento',
  failed: 'El último simulacro encontró fallos',
  expired: 'La prueba caducó: repítela con esta copia',
};

export function continuityReadiness(status: InsightSource, context: InsightContext, now: Date): Readiness {
  const age = ageOf(status, now), hasCapture = status.captures.length > 0, copy = status.recoveryCopy ?? null;
  const recoveryDone = !!(copy?.confirmedAt && copy.current);
  const steps: ReadinessStep[] = [
    { id: 'protect', label: 'Proteger el acceso', done: status.protected, detail: status.protected ? 'Contraseña local configurada' : 'Sin contraseña: quien use este PC puede abrir la copia' },
    { id: 'connect', label: 'Conectar y revisar alcance', done: context.hubspotConfigured, detail: status.connection ? 'Portal ' + status.connection.accountId + (status.connection.mode === 'production_readonly' ? ' · solo lectura' : ' · ensayo') : context.hubspotConfigured ? 'Conexión configurada' : 'Sin conexión: trabajas con datos de prueba' },
    { id: 'capture', label: 'Conservar una captura completa', done: hasCapture, detail: !hasCapture ? 'Todavía no hay ninguna captura' : status.stale ? 'La última tiene ' + formatAge(age) + ': conviene actualizarla' : 'Última captura hace ' + formatAge(age) },
    { id: 'drill', label: 'Probar la misma copia', done: context.drill === 'passed', detail: DRILL_DETAIL[context.drill ?? 'empty'] },
    { id: 'recovery', label: 'Preparar recuperación', done: recoveryDone, detail: recoveryDone ? 'Copia cifrada conservada fuera de este PC' : copy && !copy.current ? 'La copia conservada es de otra revisión' : copy ? 'Exportada; falta confirmar que está fuera de este PC' : 'Sin copia cifrada fuera de este PC' },
  ];
  const done = steps.filter(step => step.done).length;
  const level: ReadinessLevel = !hasCapture ? 'start'
    : context.drill === 'failed' || (status.stale && (age ?? 0) > 24 * 60) ? 'risk'
    : done === steps.length && !status.stale ? 'ready' : 'almost';
  const title = ({ ready: 'Tu Plan B está listo', almost: 'Tu Plan B está casi listo', risk: 'Tu Plan B necesita atención', start: 'Tu Plan B todavía no tiene copia' } as const)[level];
  return { steps, done, total: steps.length, level, title, next: nextAction(status, context, recoveryDone, age) };
}

function nextAction(status: InsightSource, context: InsightContext, recoveryDone: boolean, age: number | null): NextAction {
  const copy = status.recoveryCopy ?? null;
  if (!status.captures.length) return { id: 'prepare', label: 'Preparar la primera copia', detail: 'Sin una captura no hay nada con lo que seguir trabajando si el CRM cae.' };
  if (context.drill === 'failed') return { id: 'drill', label: 'Repetir la prueba', detail: 'El último simulacro encontró fallos. Revisa los puntos marcados y vuelve a probar.' };
  if (status.stale && !status.session) return status.connected
    ? { id: 'refresh', label: 'Actualizar la copia', detail: 'La última captura tiene ' + formatAge(age) + '. Una nueva reduce lo que perderías.' }
    : { id: 'resume', label: 'Reanudar las capturas', detail: 'Los servicios están en pausa y la copia envejece (' + formatAge(age) + ').' };
  if (!status.protected) return { id: 'protect', label: 'Poner contraseña', detail: 'Sin contraseña local, cualquiera con acceso a este PC puede abrir la copia.' };
  if (context.drill !== 'passed') return { id: 'drill', label: 'Probar esta copia', detail: 'Hasta que no se prueba, nadie sabe si la copia se abre. Tarda menos de un minuto.' };
  if (!recoveryDone) return copy?.current && !copy.confirmedAt
    ? { id: 'confirm', label: 'Confirmar dónde está', detail: 'La copia cifrada está exportada: confirma que la guardaste fuera de este PC.' }
    : { id: 'export', label: 'Exportar copia cifrada', detail: copy ? 'La copia conservada es de otra revisión: exporta la actual.' : 'Si este PC también falla, solo te salva una copia guardada en otro sitio.' };
  if (!context.hubspotConfigured) return { id: 'connect', label: 'Conectar tu portal', detail: 'Con la conexión, las capturas se hacen solas cada hora.' };
  return { id: 'none', label: 'Nada pendiente', detail: 'Repite la prueba cada mes y exporta de nuevo tras cambios importantes.' };
}

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';
export interface Vital { id: string; label: string; value: string; note: string; tone: Tone }

/** Calendario de simulacros (C5): uno cada 30 días desde el último superado, o antes si la copia cambió mucho desde entonces. */
export const DRILL_EVERY_DAYS = 30, DRILL_SOON_DAYS = 7;
export type DrillCalendarState = 'never' | 'ok' | 'soon' | 'due' | 'changed';
export interface DrillCalendar {
  state: DrillCalendarState; tone: Tone; title: string; detail: string;
  lastLabel: string | null; dueLabel: string | null;
  /** Parte de los 30 días ya consumida (0–1) y días que faltan (negativos si se pasó). */ elapsed: number; daysLeft: number | null;
  /** Variación de tamaño de la última captura frente a la probada (0,2 = +20 %); null si no se puede comparar. */ growth: number | null;
}
const shortDay = (time: number) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(new Date(time));
export function drillCalendar(status: Pick<ContinuityStatus, 'reports' | 'captures'>, now: Date): DrillCalendar {
  const last = status.reports.filter(report => report.passed && valid(report.completedAt)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
  if (!last) return {
    state: 'never', tone: 'warn', title: status.reports.length ? 'Ningún simulacro superado todavía' : 'Sin simulacros todavía',
    detail: status.captures.length ? 'Haz el primero ahora: tarda menos de un minuto y desde ahí se programa uno al mes.' : 'Primero necesitas una captura; después, un simulacro al mes.',
    lastLabel: null, dueLabel: null, elapsed: 0, daysLeft: null, growth: null,
  };
  const lastAt = Date.parse(last.completedAt), dueAt = lastAt + DRILL_EVERY_DAYS * DAY;
  const daysLeft = Math.ceil((dueAt - now.getTime()) / DAY), elapsed = Math.min(1, Math.max(0, (now.getTime() - lastAt) / (DRILL_EVERY_DAYS * DAY)));
  const tested = status.captures.find(capture => capture.id === last.captureId);
  const newest = status.captures.filter(capture => valid(capture.at)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const growth = tested && newest && newest.id !== tested.id && tested.bytes > 0 && Number.isFinite(newest.bytes) ? (newest.bytes - tested.bytes) / tested.bytes : null;
  const lastLabel = shortDay(lastAt), dueLabel = shortDay(dueAt), base = { lastLabel, dueLabel, elapsed, daysLeft, growth };
  if (daysLeft <= 0) return { ...base, state: 'due', tone: 'danger', title: 'Toca repetir el simulacro', detail: 'El último superado fue el ' + lastLabel + '; tocaba el ' + dueLabel + (daysLeft < 0 ? ' (hace ' + -daysLeft + (daysLeft === -1 ? ' día)' : ' días)') : '') + '.' };
  if (growth !== null && Math.abs(growth) > SHRINK_RATIO) return { ...base, state: 'changed', tone: 'warn', title: 'La copia cambió desde el último simulacro',
    detail: 'Ha ' + (growth > 0 ? 'crecido' : 'encogido') + ' un ' + Math.round(Math.abs(growth) * 100) + ' %. Conviene probarla otra vez sin esperar al ' + dueLabel + '.' };
  const days = daysLeft + (daysLeft === 1 ? ' día' : ' días');
  if (daysLeft <= DRILL_SOON_DAYS) return { ...base, state: 'soon', tone: 'warn', title: 'Próximo simulacro en ' + days, detail: 'El ' + dueLabel + '. Último superado: ' + lastLabel + '.' };
  return { ...base, state: 'ok', tone: 'ok', title: 'Próximo simulacro: ' + dueLabel, detail: 'Faltan ' + days + '. Último superado: ' + lastLabel + '.' };
}

/** Veredicto de preparación resumido para fuera de Continuidad (línea en Inicio y punto del menú). */
export interface ReadinessSignal { level: ReadinessLevel; tone: Tone; title: string; progress: string; next: string; steps: boolean[] }
const LEVEL_TONE: Record<ReadinessLevel, Tone> = { ready: 'ok', almost: 'warn', risk: 'danger', start: 'neutral' };
export function readinessSignal(readiness: Readiness): ReadinessSignal {
  return {
    level: readiness.level, tone: LEVEL_TONE[readiness.level], title: readiness.title,
    progress: readiness.done + ' de ' + readiness.total + ' pasos',
    next: readiness.next.id === 'none' ? 'Nada pendiente' : 'Siguiente: ' + readiness.next.label.charAt(0).toLowerCase() + readiness.next.label.slice(1),
    steps: readiness.steps.map(step => step.done),
  };
}
/** Mismo contexto que usa la portada de Continuidad: simulacro de la última captura y conexión configurada. Sin copia restaurada. */
export function readinessFor(state: Pick<AppState, 'snapshot' | 'ready' | 'hubspotConfigured' | 'runtime'>, status: ContinuityStatus | null, now: Date): ReadinessSignal | null {
  const detail = readinessDetailFor(state, status, now);
  return detail ? readinessSignal(detail) : null;
}
/** Índice de preparación ÚNICO (misión maestra, A1): los cinco pasos con su nombre, su detalle y el siguiente paso. Es la misma
 *  fuente que el veredicto de Continuidad y el punto del menú; Inicio lo enseña en lugar del sello y de los avisos que lo repetían. */
export function readinessDetailFor(state: Pick<AppState, 'snapshot' | 'ready' | 'hubspotConfigured' | 'runtime'>, status: ContinuityStatus | null, now: Date): Readiness | null {
  if (!status || state.runtime) return null;
  const diagnosis = workspaceCopy(state, status).latestReadiness;
  return continuityReadiness(status, { hubspotConfigured: !!state.hubspotConfigured, drill: diagnosis?.status ?? null, reportId: diagnosis?.reportId ?? null }, now);
}
/** Avisos de la copia que el índice de preparación NO dice ya: la prueba y la copia fuera del PC son pasos del índice. */
export const READINESS_ALERTS: readonly string[] = ['drill', 'recovery'];
/** Líneas de «Si HubSpot cae ahora» que el índice ya dice (la prueba y la copia fuera del PC): Continuidad › Estado no las repite. */
export const READINESS_OUTAGE_LINES: readonly string[] = ['drill', 'offsite'];

export function copyVitals(status: InsightSource, context: InsightContext, now: Date): Vital[] {
  const age = ageOf(status, now), summary = status.latestCapture;
  const report = (context.reportId ? status.reports.find(item => item.id === context.reportId) : undefined) ?? [...status.reports].filter(item => valid(item.completedAt)).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
  const total = status.captures.reduce((sum, item) => sum + (Number.isFinite(item.bytes) ? item.bytes : 0), 0);
  const weekStart = startOfDay(now).getTime() - 6 * DAY;
  const coveredDays = new Set(status.captures.filter(item => valid(item.at) && Date.parse(item.at) >= weekStart).map(item => dayKey(new Date(item.at)))).size;
  const passed = report ? report.checks.filter(check => check.passed).length : 0;
  return [
    { id: 'age', label: 'Antigüedad', value: status.captures.length ? formatAge(age) : '—', note: 'aviso a los ' + STALE_MINUTES + ' min', tone: !status.captures.length ? 'neutral' : age !== null && age <= STALE_MINUTES ? 'ok' : age !== null && age <= 24 * 60 ? 'warn' : 'danger' },
    { id: 'records', label: 'Registros', value: summary ? number.format(summary.records) : '—', note: summary ? number.format(summary.relations) + ' relaciones' : 'sin recuento', tone: 'neutral' },
    { id: 'changes', label: 'Cambios locales', value: number.format(status.pendingChanges), note: status.pendingChanges ? 'pendientes de devolver' : 'nada pendiente', tone: status.pendingChanges ? 'warn' : 'ok' },
    { id: 'drill', label: 'Última prueba', value: report ? passed + '/' + report.checks.length : '—', note: report ? (report.durationMs / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' s · ' + formatAge((now.getTime() - Date.parse(report.completedAt)) / 60_000) : 'sin probar', tone: !report ? 'warn' : report.passed && context.drill === 'passed' ? 'ok' : report.passed ? 'warn' : 'danger' },
    { id: 'kept', label: 'Capturas conservadas', value: number.format(status.captures.length), note: formatBytes(total) + ' en disco', tone: 'neutral' },
    { id: 'week', label: 'Días cubiertos', value: coveredDays + '/7', note: 'última semana', tone: !status.captures.length ? 'neutral' : coveredDays >= 6 ? 'ok' : coveredDays >= 3 ? 'warn' : 'danger' },
  ];
}

export interface OutageLine { id: string; tone: Exclude<Tone, 'neutral'>; text: string }
export interface OutageForecast { tone: Exclude<Tone, 'neutral'>; headline: string; lines: OutageLine[] }

/** «Si HubSpot cae ahora»: qué tendrías para seguir trabajando, escrito con lo que la copia acredita y nada más. */
export function outageForecast(status: InsightSource, context: InsightContext, now: Date): OutageForecast {
  const lines: OutageLine[] = [], age = ageOf(status, now), summary = status.latestCapture, copy = status.recoveryCopy ?? null;
  if (!status.captures.length) lines.push({ id: 'data', tone: 'danger', text: 'No tendrías datos: todavía no hay ninguna captura.' });
  else {
    lines.push({ id: 'data', tone: age !== null && age <= STALE_MINUTES ? 'ok' : age !== null && age <= 24 * 60 ? 'warn' : 'danger', text: 'Trabajarías con los datos de hace ' + formatAge(age) + '.' });
    if (summary) lines.push({ id: 'records', tone: 'ok', text: number.format(summary.counts.contacts) + ' clientes, ' + number.format(summary.counts.companies) + ' empresas, ' + number.format(summary.counts.deals) + ' oportunidades y ' + number.format(summary.counts.tasks) + ' tareas a mano.' });
  }
  lines.push(context.drill === 'passed' ? { id: 'drill', tone: 'ok', text: 'Está demostrado que la copia se abre, se edita y aguanta un reinicio.' }
    : context.drill === 'failed' ? { id: 'drill', tone: 'danger', text: 'La última prueba falló: no está demostrado que la copia funcione.' }
    : { id: 'drill', tone: 'warn', text: 'Nadie ha comprobado todavía que esta copia se abre.' });
  lines.push(copy?.confirmedAt && copy.current ? { id: 'offsite', tone: 'ok', text: 'Si además falla este PC, tienes una copia cifrada guardada fuera.' }
    : { id: 'offsite', tone: 'warn', text: 'Si además falla este PC, no hay copia fuera de él.' });
  if (status.pendingChanges > 0) lines.push({ id: 'pending', tone: 'warn', text: number.format(status.pendingChanges) + (status.pendingChanges === 1 ? ' cambio local sigue' : ' cambios locales siguen') + ' sin devolver a HubSpot.' });
  const tone = lines.some(line => line.tone === 'danger') ? 'danger' : lines.some(line => line.tone === 'warn') ? 'warn' : 'ok';
  const headline = ({ ok: 'Seguirías trabajando sin interrupción', warn: 'Podrías seguir, con reservas', danger: 'Hoy no podrías seguir con garantías' } as const)[tone];
  return { tone, headline, lines };
}

export interface HourSlot { at: Date; count: number; current: boolean }
/** Regla de las últimas 24 horas: una casilla por hora, la última es la hora en curso. */
export function hourlyCaptures(captures: ContinuityStatus['captures'], now: Date): { slots: HourSlot[]; covered: number } {
  const top = new Date(now); top.setMinutes(0, 0, 0);
  const slots: HourSlot[] = [];
  for (let offset = 23; offset >= 0; offset--) {
    const from = top.getTime() - offset * HOUR, to = from + HOUR;
    slots.push({ at: new Date(from), count: captures.filter(item => valid(item.at) && Date.parse(item.at) >= from && Date.parse(item.at) < to).length, current: offset === 0 });
  }
  return { slots, covered: slots.filter(slot => slot.count > 0).length };
}

export type LedgerFilter = 'all' | 'today' | 'week' | 'shrink';
export interface LedgerEntry { id: string; at: string; bytes: number; delta: number | null; shrink: boolean }
export interface LedgerDay { key: string; label: string; bytes: number; entries: LedgerEntry[] }
export interface CaptureLedger { days: LedgerDay[]; shown: number; total: number; shrinks: number; averageBytes: number }
/** Una captura que pierde más de este porcentaje frente a la anterior merece una mirada (filtro de alcance, borrados…). */
export const SHRINK_RATIO = 0.15;

export function captureLedger(captures: ContinuityStatus['captures'], now: Date, filter: LedgerFilter = 'all'): CaptureLedger {
  const sorted = captures.filter(item => valid(item.at)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const entries: LedgerEntry[] = sorted.map((item, index) => {
    const previous = sorted[index + 1];
    const delta = previous ? item.bytes - previous.bytes : null;
    return { id: item.id, at: item.at, bytes: item.bytes, delta, shrink: !!previous && previous.bytes > 0 && delta !== null && -delta / previous.bytes > SHRINK_RATIO };
  });
  const today = startOfDay(now).getTime(), yesterday = today - DAY, weekStart = today - 6 * DAY;
  const visible = entries.filter(entry => filter === 'all' || (filter === 'shrink' ? entry.shrink : Date.parse(entry.at) >= (filter === 'today' ? today : weekStart)));
  const dateLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const days: LedgerDay[] = [];
  for (const entry of visible) {
    const date = new Date(entry.at), key = dayKey(date), start = startOfDay(date).getTime();
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: start === today ? 'Hoy' : start === yesterday ? 'Ayer' : dateLabel.format(date), bytes: 0, entries: [] };
      days.push(day);
    }
    day.entries.push(entry); day.bytes += entry.bytes;
  }
  const total = sorted.reduce((sum, item) => sum + item.bytes, 0);
  return { days, shown: visible.length, total: sorted.length, shrinks: entries.filter(entry => entry.shrink).length, averageBytes: sorted.length ? total / sorted.length : 0 };
}

export interface JobKindStat { kind: Job['kind']; label: string; total: number; succeeded: number; failed: number; lastFailure: { at: string; message: string } | null }
export interface JobStats { kinds: JobKindStat[]; finished: number; succeeded: number; rate: number | null; running: number }
const JOB_LABELS: Record<Job['kind'], string> = { capture: 'Capturas', drill: 'Simulacros', return: 'Devoluciones' };

/** Fiabilidad de los procesos con los trabajos que conserva el servidor. Los cancelados no cuentan como fallo. */
export function jobStats(jobs: Job[]): JobStats {
  const kinds = (['capture', 'drill', 'return'] as const).map(kind => {
    const own = jobs.filter(job => job.kind === kind);
    const failures = own.filter(job => job.status === 'failed' || job.status === 'interrupted').sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { kind, label: JOB_LABELS[kind], total: own.length, succeeded: own.filter(job => job.status === 'succeeded').length, failed: failures.length, lastFailure: failures[0] ? { at: failures[0].updatedAt, message: failures[0].message } : null };
  }).filter(stat => stat.total > 0);
  const succeeded = kinds.reduce((sum, stat) => sum + stat.succeeded, 0), finished = succeeded + kinds.reduce((sum, stat) => sum + stat.failed, 0);
  return { kinds, finished, succeeded, rate: finished ? Math.round((succeeded / finished) * 100) : null, running: jobs.filter(job => job.status === 'queued' || job.status === 'running').length };
}
