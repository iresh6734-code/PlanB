import type { ContinuityStatus } from '../../shared/operations.js';
import { captureAutomation, buildCopyTimeline } from './copy-timeline.js';
import { continuityAlerts } from './continuity-alerts.js';

/** Parte de continuidad para compartir: qué está demostrado y qué no, con fecha.
 *  Solo usa `/v2/continuity` y NO incluye nombres de clientes, identificadores de captura ni de cuenta: recuentos, fechas y
 *  resultados. Es una página HTML autónoma (sin red ni scripts) para enviar, imprimir o guardar en PDF. */
export type Verdict = 'ok' | 'warn' | 'missing';
export interface ReportItem { label: string; verdict: Verdict; text: string }
export interface ContinuityReport {
  generatedAt: string; version: string; source: string | null;
  items: ReportItem[]; counts: { label: string; value: number }[] | null;
  window: { covered: number; gaps: number; idle: number; days: number; longest: string | null };
  alerts: string[]; limits: string[];
}
type Source = Pick<ContinuityStatus, 'captures' | 'reports' | 'jobs' | 'readiness' | 'runtime' | 'connected' | 'session' | 'schedule' | 'latestCapture'> & Partial<Pick<ContinuityStatus, 'operations' | 'connection' | 'recoveryCopy' | 'recoveryIntegrity' | 'latestCaptureAt' | 'stale'>>;

const madrid = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayOnly = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' });
const when = (value: string) => madrid.format(new Date(value));
const ageText = (from: string, now: Date) => { const days = Math.floor((now.getTime() - Date.parse(from)) / 86_400_000); return days <= 0 ? 'de hoy' : days === 1 ? 'de ayer' : 'de hace ' + days + ' días'; };
const ENTITY: Record<string, string> = { contacts: 'Clientes', companies: 'Empresas', deals: 'Oportunidades', tasks: 'Tareas' };

export function buildContinuityReport(status: Source, now: Date, version: string): ContinuityReport {
  const capture = status.latestCapture, latestAt = capture?.capturedAt ?? status.latestCaptureAt ?? status.captures[0]?.at ?? null;
  const items: ReportItem[] = [];
  items.push(latestAt
    ? { label: 'Copia conservada en este ordenador', verdict: status.stale ? 'warn' : 'ok', text: 'Última captura del ' + when(latestAt) + ' (' + ageText(latestAt, now) + ')' + (capture ? ', con ' + capture.records + ' registros, ' + capture.relations + ' relaciones y ' + capture.fields + ' campos.' : '.') }
    : { label: 'Copia conservada en este ordenador', verdict: 'missing', text: 'Todavía no hay ninguna captura.' });
  const readiness = status.readiness?.status, report = status.reports.find(item => item.id === status.readiness?.reportId);
  items.push(readiness === 'passed' && report
    ? { label: 'Probada en un entorno aparte', verdict: 'ok', text: 'Simulacro superado el ' + when(report.completedAt) + ': ' + report.checks.filter(check => check.passed).length + ' de ' + report.checks.length + ' comprobaciones' + (report.isolated ? ', en un proceso aislado.' : '.') }
    : readiness === 'failed' ? { label: 'Probada en un entorno aparte', verdict: 'warn', text: 'La última prueba de esta copia tuvo fallos' + (report ? ' (' + report.checks.filter(check => !check.passed).length + ' comprobaciones sin superar).' : '.') }
    : readiness === 'expired' ? { label: 'Probada en un entorno aparte', verdict: 'warn', text: 'La prueba de esta copia ha caducado y hay que repetirla.' }
    : { label: 'Probada en un entorno aparte', verdict: 'missing', text: latestAt ? 'Esta copia todavía no se ha probado.' : 'No hay copia que probar.' });
  const copy = status.recoveryCopy ?? null;
  items.push(copy?.confirmedAt && copy.current !== false
    ? { label: 'Copia cifrada fuera de este ordenador', verdict: 'ok', text: 'Exportada el ' + when(copy.exportedAt) + ' y confirmado su resguardo el ' + when(copy.confirmedAt) + '.' }
    : copy ? { label: 'Copia cifrada fuera de este ordenador', verdict: 'warn', text: copy.current === false ? 'Existe, pero corresponde a otra revisión de los datos.' : 'Exportada el ' + when(copy.exportedAt) + ', sin confirmar que se guarda fuera de este ordenador.' }
    : { label: 'Copia cifrada fuera de este ordenador', verdict: 'missing', text: 'No se ha exportado ninguna.' });
  const automation = captureAutomation(status);
  items.push(status.runtime ? { label: 'Capturas automáticas', verdict: 'missing', text: 'Este paquete restaurado no hace capturas.' }
    : automation.failed ? { label: 'Capturas automáticas', verdict: 'warn', text: 'La programación sigue habilitada. La última captura no se completó.' }
    : automation.active ? { label: 'Capturas automáticas', verdict: 'ok', text: 'Activas: una por hora mientras el ordenador esté encendido.' }
    : { label: 'Capturas automáticas', verdict: 'warn', text: 'Detenidas: ' + (automation.reason ?? '').replace(/^./, letter => letter.toLowerCase()) + '.' });
  const timeline = buildCopyTimeline(status, now, 14, automation), gap = timeline.summary.longestGap;
  return {
    generatedAt: now.toISOString(), version, source: capture ? (capture.source === 'hubspot' ? 'HubSpot' + (capture.environment === 'production' ? ' · producción, solo lectura' : ' · cuenta de prueba') : 'Conjunto de ensayo local') : null,
    items, counts: capture ? Object.entries(capture.counts).map(([key, value]) => ({ label: ENTITY[key] ?? key, value })) : null,
    window: { covered: timeline.summary.covered, gaps: timeline.summary.gaps, idle: timeline.summary.idle, days: timeline.summary.window, longest: gap && gap.length > 1 ? 'del ' + dayOnly.format(gap.from) + ' al ' + dayOnly.format(gap.to) : null },
    alerts: continuityAlerts(status, now).map(alert => alert.title + '. ' + alert.detail),
    limits: [
      'Describe lo guardado en este ordenador a la hora indicada; no acredita el estado actual del CRM.',
      'Un simulacro superado comprueba esa copia concreta, no las capturas posteriores.',
      'No incluye la devolución de cambios al CRM, que tiene su propio proceso de revisión.',
      'Sin el ordenador encendido no hay capturas: no se ofrece un plazo garantizado.',
    ],
  };
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const VERDICT: Record<Verdict, [string, string]> = { ok: ['✓', 'Demostrado'], warn: ['!', 'Con reservas'], missing: ['—', 'Pendiente'] };

/** HTML autónomo: estilos en línea, sin scripts ni recursos externos; se imprime bien en A4. */
export function reportHtml(report: ContinuityReport): string {
  const row = (item: ReportItem) => '<tr class="' + item.verdict + '"><th scope="row">' + escape(item.label) + '</th><td><span class="mark" aria-hidden="true">' + VERDICT[item.verdict][0] + '</span><strong>' + VERDICT[item.verdict][1] + '</strong></td><td>' + escape(item.text) + '</td></tr>';
  const win = report.window;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan B · Parte de continuidad</title><style>'
    + 'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2a2c;margin:0;background:#f4f6f5}main{max-width:820px;margin:0 auto;padding:32px 24px;background:#fff}'
    + 'h1{font:600 26px/1.2 Georgia,"Sitka Heading",serif;margin:0 0 4px;color:#0e2a2f}h2{font-size:15px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#4b5d60}'
    + '.meta{color:#4b5d60;font-size:13px;margin:0 0 20px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;padding:10px 8px;border-top:1px solid #dfe5e3}'
    + 'th{width:32%;font-weight:600}td:nth-child(2){width:18%;white-space:nowrap}.mark{display:inline-block;width:18px;font-weight:700}.ok .mark,.ok strong{color:#0d6b63}.warn .mark,.warn strong{color:#8a5300}.missing .mark,.missing strong{color:#5b6669}'
    + 'ul{margin:0;padding-left:20px;font-size:14px;line-height:1.6}.figures{display:flex;gap:28px;flex-wrap:wrap;font-size:14px}.figures b{display:block;font-size:22px}footer{margin-top:32px;font-size:12px;color:#5b6669}'
    + '@media print{body{background:#fff}main{padding:0}}</style></head><body><main>'
    + '<h1>Parte de continuidad</h1><p class="meta">Plan B v' + escape(report.version) + ' · generado el ' + escape(madrid.format(new Date(report.generatedAt))) + ' (hora de Madrid)' + (report.source ? ' · origen: ' + escape(report.source) : '') + '</p>'
    + '<h2>Qué está demostrado</h2><table><tbody>' + report.items.map(row).join('') + '</tbody></table>'
    + (report.counts ? '<h2>Contenido de la copia</h2><div class="figures">' + report.counts.map(item => '<span><b>' + item.value + '</b>' + escape(item.label) + '</span>').join('') + '</div>' : '')
    + '<h2>Últimos ' + win.days + ' días</h2><div class="figures"><span><b>' + win.covered + '</b>días con captura</span><span><b>' + win.gaps + '</b>huecos</span>' + (win.idle ? '<span><b>' + win.idle + '</b>días sin intentos (capturas detenidas)</span>' : '') + '</div>'
    + (win.longest ? '<p class="meta">Hueco más largo: ' + escape(win.longest) + '.</p>' : '')
    + '<h2>Avisos abiertos</h2>' + (report.alerts.length ? '<ul>' + report.alerts.map(text => '<li>' + escape(text) + '</li>').join('') + '</ul>' : '<p class="meta">Ninguno.</p>')
    + '<h2>Lo que este parte no acredita</h2><ul>' + report.limits.map(text => '<li>' + escape(text) + '</li>').join('') + '</ul>'
    + '<footer>Sin nombres de clientes ni identificadores: solo recuentos, fechas y resultados guardados en este ordenador.</footer></main></body></html>';
}
