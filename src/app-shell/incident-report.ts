import type { Change } from '../../shared/model.js';
import { changedFields } from '../../shared/change-history.js';
import { sha256Hex } from '../../shared/sha256.js';
import { BRAND_CSS, brandHtml, type ReportBrand } from '../../shared/report-brand.js';
import type { IncidentWindow } from './contingency.js';
import { clockTime, durationText } from './contingency-text.js';

/** R2 · Expediente del incidente: qué se hizo en Plan B mientras HubSpot no respondía. Se calcula en este navegador con el historial
 *  local (`/v2/changes`) y las capturas ya leídas. Solo recuentos, horas y NOMBRES de campo: ningún valor de registro ni nombre de cliente. */
export interface IncidentInput {
  window: IncidentWindow;
  changes: readonly Change[];
  /** Marca de devolución: los cambios con id ≤ marca están marcados como devueltos. */ watermark: number;
  captures: readonly { at: string }[];
  /** Nombre en plural de cada tipo de registro (Clientes, Tareas…). */ labels?: Readonly<Record<string, string>>;
  version: string;
  generatedAt: Date;
  /** A10-1 · Cómo se acreditó la vuelta: comprobación por relectura (fecha) y estados del plan de devolución, si lo hay. */
  returnInfo?: { verifiedAt: string | null; operations: readonly { status: string }[] };
}
/** A10-1 · La vuelta separada por certeza: comprobado por relectura, enviado sin confirmar (incierto), fallido y pendiente. */
export interface IncidentReturn { verifiedAt: string | null; uncertain: number; failed: number }
export interface IncidentEntity { entity: string; label: string; created: number; updated: number; returned: number; pending: number; fields: string[] }
export interface IncidentHour { key: string; label: string; created: number; updated: number }
export type ReturnState = 'none' | 'pending' | 'partial' | 'returned';
export interface IncidentReport {
  format: 'planb-incident/1';
  version: string; generatedAt: string;
  startedAt: string; endedAt: string; durationMinutes: number; duration: string;
  totals: { changes: number; created: number; updated: number; returned: number; pending: number; records: number };
  entities: IncidentEntity[];
  hours: IncidentHour[];
  copyAtStart: string | null;
  capturesDuring: string[];
  returnState: ReturnState;
  /** A10-1 · Presente solo si se conoce cómo se acreditó la vuelta. */ returnEvidence?: IncidentReturn;
  /** Huella de las operaciones incluidas (id, hora, tipo, operación e identificador interno), para cotejarlas después con el historial. */ evidenceDigest: string;
}

const HOUR = 3_600_000;
const hourKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const dayLabel = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' });
const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const keyOf = (time: number) => { const parts = Object.fromEntries(hourKey.formatToParts(new Date(time)).map(part => [part.type, part.value])); return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour; };

export function incidentReport(input: IncidentInput): IncidentReport {
  const start = Date.parse(input.window.startedAt), end = Math.max(start, Date.parse(input.window.endedAt));
  const inside = input.changes.filter(change => { const at = Date.parse(change.at); return at >= start && at <= end; }).sort((a, b) => a.id - b.id);
  const entities = new Map<string, IncidentEntity & { fieldSet: Set<string> }>();
  const records = new Set<string>();
  for (const change of inside) {
    const row = entities.get(change.entity) ?? { entity: change.entity, label: input.labels?.[change.entity] ?? change.entity, created: 0, updated: 0, returned: 0, pending: 0, fields: [], fieldSet: new Set<string>() };
    row[change.operation === 'create' ? 'created' : 'updated']++;
    row[change.id <= input.watermark ? 'returned' : 'pending']++;
    for (const field of changedFields(change)) row.fieldSet.add(field.key);
    entities.set(change.entity, row);
    records.add(change.entity + '\u0000' + change.recordId);
  }
  // Una fila por hora (hora de Madrid) desde el inicio hasta el final, también las horas sin actividad: el hueco también cuenta.
  const hours: IncidentHour[] = [], byKey = new Map<string, IncidentHour>();
  const multiDay = keyOf(start).slice(0, 10) !== keyOf(end).slice(0, 10);
  for (let time = start - (start % HOUR), guard = 0; time <= end && guard < 24 * 14; time += HOUR, guard++) {
    const key = keyOf(time);
    if (byKey.has(key)) continue;
    const hour = { key, label: (multiDay ? dayLabel.format(new Date(time)) + ' · ' : '') + key.slice(11) + ':00', created: 0, updated: 0 };
    hours.push(hour); byKey.set(key, hour);
  }
  for (const change of inside) { const hour = byKey.get(keyOf(Date.parse(change.at))); if (hour) hour[change.operation === 'create' ? 'created' : 'updated']++; }
  const captureTimes = input.captures.map(capture => Date.parse(capture.at)).filter(time => !Number.isNaN(time)).sort((a, b) => a - b);
  const before = captureTimes.filter(time => time <= start);
  const returned = inside.filter(change => change.id <= input.watermark).length, pending = inside.length - returned;
  const created = inside.filter(change => change.operation === 'create').length;
  return {
    format: 'planb-incident/1', version: input.version, generatedAt: input.generatedAt.toISOString(),
    startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(),
    durationMinutes: Math.round((end - start) / 60_000), duration: durationText(new Date(start).toISOString(), new Date(end).toISOString()),
    totals: { changes: inside.length, created, updated: inside.length - created, returned, pending, records: records.size },
    entities: [...entities.values()].sort((a, b) => (b.created + b.updated) - (a.created + a.updated) || a.label.localeCompare(b.label, 'es')).map(({ fieldSet, ...row }) => ({ ...row, fields: [...fieldSet].sort() })),
    hours,
    copyAtStart: before.length ? new Date(before[before.length - 1]).toISOString() : null,
    capturesDuring: captureTimes.filter(time => time > start && time <= end).map(time => new Date(time).toISOString()),
    returnState: !inside.length ? 'none' : !pending ? 'returned' : !returned ? 'pending' : 'partial',
    ...(input.returnInfo ? { returnEvidence: { // una comprobación anterior al inicio del incidente no acredita nada de él
      verifiedAt: input.returnInfo.verifiedAt && Date.parse(input.returnInfo.verifiedAt) >= start ? new Date(input.returnInfo.verifiedAt).toISOString() : null,
      uncertain: input.returnInfo.operations.filter(op => op.status === 'uncertain' || op.status === 'sending').length,
      failed: input.returnInfo.operations.filter(op => op.status === 'failed').length } } : {}),
    evidenceDigest: sha256Hex(inside.map(change => [change.id, change.at, change.entity, change.operation, change.recordId].join('|')).join('\n')),
  };
}

/** JSON firmado con su propia huella: cambiar cualquier cifra cambia `digest`. */
export function incidentReportJson(report: IncidentReport): string {
  const body = JSON.stringify(report);
  return JSON.stringify({ ...report, digest: sha256Hex(body) }, null, 2) + '\n';
}

export function incidentHeadline(report: IncidentReport): string {
  const { totals } = report;
  if (!totals.changes) return 'Durante ' + report.duration + ' de contingencia no se guardó ningún cambio en Plan B.';
  const work = totals.changes + (totals.changes === 1 ? ' cambio' : ' cambios') + ' en ' + totals.records + (totals.records === 1 ? ' registro' : ' registros');
  const state = report.returnState === 'returned' ? 'todos marcados como devueltos a HubSpot' : report.returnState === 'pending' ? 'ninguno devuelto todavía' : totals.returned + ' devueltos y ' + totals.pending + ' pendientes de devolver';
  return 'Durante ' + report.duration + ' se trabajó en Plan B: ' + work + ', ' + state + '.';
}

/** A10-1 · La vuelta en frases, sin convertir una acción aceptada en un resultado verificado. */
export function returnLines(report: IncidentReport): string[] {
  const evidence = report.returnEvidence;
  if (!evidence) return [];
  const { returned, pending } = report.totals;
  return [
    evidence.verifiedAt ? 'Comprobado por relectura de HubSpot el ' + when(evidence.verifiedAt) + ': ' + returned + (returned === 1 ? ' cambio' : ' cambios') + ' de este incidente.' : returned ? returned + (returned === 1 ? ' cambio marcado' : ' cambios marcados') + ' como devueltos sin una comprobación por relectura registrada.' : 'Ningún cambio de este incidente se ha devuelto todavía.',
    evidence.uncertain ? evidence.uncertain + (evidence.uncertain === 1 ? ' operación enviada' : ' operaciones enviadas') + ' sin confirmar (resultado incierto): no se repiten solas; se comprueban por relectura.' : '',
    evidence.failed ? evidence.failed + (evidence.failed === 1 ? ' operación falló' : ' operaciones fallaron') + ' al enviarse.' : '',
    pending ? pending + (pending === 1 ? ' cambio sigue pendiente' : ' cambios siguen pendientes') + ' de devolver.' : '',
  ].filter(Boolean);
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const when = (value: string) => stamp.format(new Date(value));
const RETURN_TEXT: Record<ReturnState, string> = { none: 'Sin cambios que devolver', pending: 'Pendiente de devolver', partial: 'Devolución a medias', returned: 'Todo marcado como devuelto' };

/** Página autónoma (sin scripts ni recursos externos), lista para imprimir o guardar en PDF. `brand` (N2) añade la marca arriba. */
export function incidentReportHtml(report: IncidentReport, digest: string, brand: ReportBrand | null = null): string {
  const peak = Math.max(1, ...report.hours.map(hour => hour.created + hour.updated));
  const metric = (label: string, value: string) => '<div class="m"><span>' + escape(label) + '</span><strong>' + escape(value) + '</strong></div>';
  const timeline = report.hours.map(hour => {
    const total = hour.created + hour.updated, width = Math.round((total / peak) * 100);
    return '<tr><th scope="row">' + escape(hour.label) + '</th><td class="bar"><i style="width:' + width + '%"></i></td><td>' + (total ? total + (hour.created ? ' (' + hour.created + ' altas)' : '') : '—') + '</td></tr>';
  }).join('');
  const entities = report.entities.map(row => '<tr><th scope="row">' + escape(row.label) + '</th><td>' + row.created + '</td><td>' + row.updated + '</td><td>' + row.returned + '</td><td>' + row.pending + '</td><td class="f">' + (row.fields.length ? row.fields.map(escape).join(', ') : '—') + '</td></tr>').join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan B · Expediente del incidente ' + escape(when(report.startedAt)) + '</title><style>'
    + 'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f1c17;margin:0;background:#f5f1e6}main{max-width:820px;margin:0 auto;padding:32px 24px;background:#fffcf4}'
    + 'h1{font:600 26px/1.2 Georgia,"Sitka Heading",serif;margin:0 0 4px}h2{font-size:13px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#5b5447}'
    + '.seal{display:inline-block;margin:0 0 10px;padding:3px 10px;border:1.5px solid #9b2c1f;border-radius:999px;color:#9b2c1f;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}'
    + '.meta{color:#5b5447;font-size:13px;margin:0 0 18px}.lede{font-size:17px;margin:0 0 18px;line-height:1.45}'
    + '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.m{border:1px solid #e3dccb;border-radius:10px;padding:10px 12px}.m span{display:block;font-size:12px;color:#5b5447}.m strong{font-size:20px;font-variant-numeric:tabular-nums}'
    + 'table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:7px 8px;border-top:1px solid #e3dccb;vertical-align:top}thead th{font-size:12px;color:#5b5447;text-transform:uppercase;letter-spacing:.04em}'
    + '.bar{width:55%}.bar i{display:block;height:10px;min-width:2px;border-radius:5px;background:#9b2c1f}.f{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#5b5447}'
    + 'ul{margin:0;padding-left:20px;font-size:14px;line-height:1.6}code{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}footer{margin-top:30px;font-size:12px;color:#5b5447}@media print{body{background:#fff}main{padding:0}}' + BRAND_CSS + '</style></head><body><main>' + brandHtml(brand)
    + '<p class="seal">Expediente de incidente</p><h1>HubSpot sin respuesta · ' + escape(when(report.startedAt)) + '</h1>'
    + '<p class="meta">De ' + escape(clockTime(report.startedAt)) + ' a ' + escape(clockTime(report.endedAt)) + ' (hora de Madrid) · Plan B v' + escape(report.version) + ' · generado el ' + escape(when(report.generatedAt)) + '</p>'
    + '<p class="lede">' + escape(incidentHeadline(report)) + '</p>'
    + '<div class="grid">' + metric('Duración', report.duration) + metric('Cambios guardados', String(report.totals.changes)) + metric('Altas', String(report.totals.created)) + metric('Registros tocados', String(report.totals.records)) + metric('Devolución', RETURN_TEXT[report.returnState]) + '</div>'
    + '<h2>Línea temporal</h2><table><thead><tr><th scope="col">Hora</th><th scope="col">Actividad</th><th scope="col">Cambios</th></tr></thead><tbody>' + (timeline || '<tr><td colspan="3">Sin horas que mostrar.</td></tr>') + '</tbody></table>'
    + '<h2>Por tipo de registro</h2>' + (entities ? '<table><thead><tr><th scope="col">Tipo</th><th scope="col">Altas</th><th scope="col">Cambios</th><th scope="col">Devueltos</th><th scope="col">Pendientes</th><th scope="col">Campos tocados</th></tr></thead><tbody>' + entities + '</tbody></table>' : '<p class="meta">No se guardaron cambios durante la contingencia.</p>')
    + (report.returnEvidence ? '<h2>Vuelta a HubSpot</h2><ul>' + returnLines(report).map(line => '<li>' + escape(line) + '</li>').join('') + '</ul>' : '')
    + '<h2>Copias</h2><ul><li>Copia en uso al empezar: ' + (report.copyAtStart ? escape(when(report.copyAtStart)) : 'no consta ninguna anterior al inicio') + '.</li><li>Capturas durante la contingencia: ' + (report.capturesDuring.length ? report.capturesDuring.map(value => escape(clockTime(value))).join(', ') : 'ninguna') + '.</li></ul>'
    + '<h2>Huellas</h2><ul><li>Operaciones incluidas (SHA-256): <code>' + escape(report.evidenceDigest) + '</code></li><li>Este expediente en JSON (SHA-256): <code>' + escape(digest) + '</code></li></ul>'
    + '<h2>Límites</h2><ul><li>Las horas de inicio y fin las marcó la persona al activar y terminar el modo contingencia; Plan B no consulta HubSpot para saber si responde.</li><li>«Devuelto» significa marcado como devuelto en este ordenador; no acredita que HubSpot lo conserve.</li><li>Solo cuenta lo que este ordenador guarda: cambios hechos en otro equipo no aparecen.</li></ul>'
    + '<footer>Sin nombres de clientes ni valores de los registros: solo recuentos, horas y nombres de campo guardados en este ordenador.</footer></main></body></html>';
}

/** Ambos ficheros del expediente, con la misma huella en los dos. */
export function incidentFiles(report: IncidentReport, brand: ReportBrand | null = null): { html: string; json: string; digest: string } {
  const digest = sha256Hex(JSON.stringify(report));
  return { html: incidentReportHtml(report, digest, brand), json: incidentReportJson(report), digest };
}
