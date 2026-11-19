import type { ContinuityStatus } from '../../shared/operations.js';

/** Informe mensual de continuidad (super plan M3): el mes en curso frente al anterior, calculado en local con lo que
 *  `/v2/continuity` conserva. Solo cifras y fechas: ni clientes, ni identificadores de captura o de cuenta. */
type Source = Pick<ContinuityStatus, 'captures' | 'jobs' | 'reports'>;
export interface MonthStats {
  month: string; label: string; partial: boolean;
  captures: number; daysCovered: number; daysInScope: number; failedCaptures: number;
  drillsPassed: number; drillsFailed: number;
  /** Mayor tiempo sin copia que toca el mes, en horas (incluye el hueco abierto hasta ahora en el mes en curso). */ longestGapHours: number | null;
  longestGap: { from: string; to: string | null } | null;
}
export interface MonthlyReport { generatedAt: string; current: MonthStats; previous: MonthStats; verdict: 'ok' | 'warn' | 'missing'; headline: string; notes: string[] }

const HOUR = 3_600_000;
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
const monthName = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const valid = (value: string | undefined | null): value is string => !!value && !Number.isNaN(Date.parse(value));
/** Día en Madrid como AAAA-MM-DD. */
export const madridDay = (value: string | number | Date) => dayKey.format(new Date(value));
export const monthOf = (value: string | number | Date) => madridDay(value).slice(0, 7);
export function previousMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? (year - 1) + '-12' : year + '-' + String(number - 1).padStart(2, '0');
}
export const monthLabel = (month: string) => { const [year, number] = month.split('-').map(Number); return monthName.format(new Date(Date.UTC(year, number - 1, 15))); };

export function monthStats(status: Source, month: string, now: Date): MonthStats {
  const [year, number] = month.split('-').map(Number), today = madridDay(now), current = today.slice(0, 7) === month;
  const daysInMonth = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const daysInScope = current ? Number(today.slice(8, 10)) : month > today.slice(0, 7) ? 0 : daysInMonth;
  const shots = status.captures.filter(capture => valid(capture.at)).map(capture => Date.parse(capture.at)).sort((a, b) => a - b);
  const inMonth = (time: number) => monthOf(time) === month;
  const inside = shots.filter(inMonth);
  const succeeded = status.jobs.filter(job => job.kind === 'capture' && job.status === 'succeeded' && valid(job.createdAt) && inMonth(Date.parse(job.createdAt))).length;
  const failedCaptures = status.jobs.filter(job => job.kind === 'capture' && (job.status === 'failed' || job.status === 'interrupted') && valid(job.createdAt) && inMonth(Date.parse(job.createdAt))).length;
  const drills = status.reports.filter(report => valid(report.completedAt) && inMonth(Date.parse(report.completedAt)));
  let longest: { from: number; to: number | null; hours: number } | null = null;
  const consider = (from: number, to: number | null) => { const hours = ((to ?? now.getTime()) - from) / HOUR; if (!longest || hours > longest.hours) longest = { from, to, hours }; };
  for (let index = 1; index < shots.length; index++) if (inMonth(shots[index - 1]) || inMonth(shots[index])) consider(shots[index - 1], shots[index]);
  const last = shots[shots.length - 1];
  if (current && last !== undefined) consider(last, null);
  const gap = longest as { from: number; to: number | null; hours: number } | null;
  return {
    month, label: monthLabel(month), partial: current,
    captures: Math.max(inside.length, succeeded), daysCovered: new Set(inside.map(madridDay)).size, daysInScope, failedCaptures,
    drillsPassed: drills.filter(report => report.passed).length, drillsFailed: drills.filter(report => !report.passed).length,
    longestGapHours: gap ? Math.round(gap.hours * 10) / 10 : null,
    longestGap: gap ? { from: new Date(gap.from).toISOString(), to: gap.to === null ? null : new Date(gap.to).toISOString() } : null,
  };
}

export function monthlyReport(status: Source, now: Date): MonthlyReport {
  const current = monthStats(status, monthOf(now), now), previous = monthStats(status, previousMonth(current.month), now);
  const notes: string[] = [];
  if (current.failedCaptures) notes.push(current.failedCaptures + (current.failedCaptures === 1 ? ' captura no se completó' : ' capturas no se completaron') + ' este mes.');
  if (current.drillsFailed) notes.push(current.drillsFailed + (current.drillsFailed === 1 ? ' simulacro tuvo fallos.' : ' simulacros tuvieron fallos.'));
  if (!current.drillsPassed) notes.push('Ningún simulacro superado este mes' + (previous.drillsPassed ? ' (el mes anterior, ' + previous.drillsPassed + ').' : '.'));
  if (current.longestGapHours !== null && current.longestGapHours >= 24) notes.push('El mayor hueco sin copia fue de ' + formatHours(current.longestGapHours) + '.');
  const verdict = !current.captures ? 'missing' : notes.length ? 'warn' : 'ok';
  const headline = !current.captures ? 'Sin capturas en ' + current.label + (current.partial ? ' por ahora.' : '.')
    : current.daysCovered + ' de ' + current.daysInScope + (current.daysInScope === 1 ? ' día' : ' días') + ' con copia en ' + current.label + (current.partial ? ' (mes en curso).' : '.');
  return { generatedAt: now.toISOString(), current, previous, verdict, headline, notes };
}

export function formatHours(hours: number) {
  if (hours < 1) return Math.max(1, Math.round(hours * 60)) + ' min';
  if (hours < 48) return (Math.round(hours * 10) / 10).toLocaleString('es-ES') + ' h';
  return Math.round(hours / 24) + ' días';
}
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const gapText = (stats: MonthStats) => stats.longestGapHours === null ? '—' : formatHours(stats.longestGapHours) + (stats.longestGap ? ' (desde el ' + stamp.format(new Date(stats.longestGap.from)) + (stats.longestGap.to ? '' : ', sigue abierto') + ')' : '');

/** Página autónoma (sin scripts ni recursos externos), lista para imprimir o guardar en PDF. */
export function monthlyReportHtml(report: MonthlyReport, version: string): string {
  const { current: a, previous: b } = report;
  const rows: [string, string, string][] = [
    ['Días con copia', a.daysCovered + ' de ' + a.daysInScope, b.daysCovered + ' de ' + b.daysInScope],
    ['Capturas guardadas', String(a.captures), String(b.captures)],
    ['Capturas que no se completaron', String(a.failedCaptures), String(b.failedCaptures)],
    ['Simulacros superados', String(a.drillsPassed), String(b.drillsPassed)],
    ['Simulacros con fallos', String(a.drillsFailed), String(b.drillsFailed)],
    ['Mayor tiempo sin copia', gapText(a), gapText(b)],
  ];
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan B · Informe de ' + escape(a.label) + '</title><style>'
    + 'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f1c17;margin:0;background:#f5f1e6}main{max-width:760px;margin:0 auto;padding:32px 24px;background:#fffcf4}'
    + 'h1{font:600 26px/1.2 Georgia,"Sitka Heading",serif;margin:0 0 4px}h2{font-size:14px;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#5b5447}'
    + '.meta{color:#5b5447;font-size:13px;margin:0 0 18px}.lede{font-size:17px;margin:0 0 6px}.ok{color:#2f6b3a}.warn{color:#8a5300}.missing{color:#5b5447}'
    + 'table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:9px 8px;border-top:1px solid #e3dccb}thead th{font-size:12px;color:#5b5447;text-transform:uppercase;letter-spacing:.04em}'
    + 'ul{margin:0;padding-left:20px;font-size:14px;line-height:1.6}footer{margin-top:30px;font-size:12px;color:#5b5447}@media print{body{background:#fff}main{padding:0}}</style></head><body><main>'
    + '<h1>Informe de continuidad · ' + escape(a.label) + '</h1><p class="meta">Plan B v' + escape(version) + ' · generado el ' + escape(stamp.format(new Date(report.generatedAt))) + ' (hora de Madrid)</p>'
    + '<p class="lede ' + report.verdict + '">' + escape(report.headline) + '</p>'
    + '<h2>Este mes frente al anterior</h2><table><thead><tr><th scope="col">Indicador</th><th scope="col">' + escape(a.label) + (a.partial ? ' (en curso)' : '') + '</th><th scope="col">' + escape(b.label) + '</th></tr></thead><tbody>'
    + rows.map(([label, now, before]) => '<tr><th scope="row">' + escape(label) + '</th><td>' + escape(now) + '</td><td>' + escape(before) + '</td></tr>').join('') + '</tbody></table>'
    + '<h2>A tener en cuenta</h2>' + (report.notes.length ? '<ul>' + report.notes.map(note => '<li>' + escape(note) + '</li>').join('') + '</ul>' : '<p class="meta">Nada que destacar.</p>')
    + '<h2>Límites</h2><ul><li>Cuenta lo que este ordenador conserva: las capturas y los trabajos ya podados no aparecen.</li><li>Un día «con copia» tiene al menos una captura guardada; no acredita que esa copia se probara.</li><li>Sin el ordenador encendido no hay capturas.</li></ul>'
    + '<footer>Sin nombres de clientes ni identificadores: solo recuentos y fechas guardados en este ordenador.</footer></main></body></html>';
}
