import { z } from 'zod';
import { contextLabel, when, type PassportWorkSummary } from './continuity-passport.js';
import type { ContextualSource } from './impact-map.js';

// RESUMEN PÚBLICO DEL TRABAJO LOCAL (unidad 255) · lado CONSUMIDOR. El diario de intenciones (208, de Claude A) sigue en revisión y todavía no publica su resumen: este contrato es una PROPUESTA comunicada
// a la autora, no un acuerdo. Es la única forma en que Continuidad lee el trabajo local pendiente: ámbito autorizado, instante, origen, procedencia, estado, recuentos o `null` y cuarentena APARTE.
// Nunca contiene ids de tarea, texto de borradores, parches, valores ni datos personales. Cuatro situaciones que NO deben confundirse:
//   · vacía        → leída, cobertura completa, todos los recuentos son 0 (y nada en cuarentena);
//   · con trabajo  → leída con recuentos > 0;
//   · ilegible     → no disponible, o entradas en cuarentena (se desconoce lo que contienen, no se suman a nada);
//   · sin cobertura→ leída pero el cuaderno no cubre esta copia: los recuentos son `null` (desconocido, NO cero).
export const WORK_SUMMARY_FORMAT = 'planb-work-summary-v1';
export const WORK_SUMMARY_ROUTE = '/api/v7/local-operations/work-summary';
const iso = z.string().datetime();
const count = z.number().int().min(0).max(1_000_000);
export const WorkSummarySchema = z.object({
  format: z.literal(WORK_SUMMARY_FORMAT),
  status: z.enum(['read', 'unavailable']),
  /** Ámbito AUTORIZADO al que pertenece el resumen. `context` usa la notación de `context.captureId` de la evidencia de copia. */
  scope: z.object({ kind: z.enum(['active-copy', 'none']), context: z.string().regex(/^capture:[0-9a-f]{64}$/).nullable() }).strict(),
  at: iso,
  origin: z.literal('work-journal'),
  /** `durable`: leído del cuaderno guardado en disco; `memory-only`: solo seguimiento en memoria (no sobrevive a un reinicio). */
  provenance: z.enum(['durable', 'memory-only']),
  coverage: z.enum(['complete', 'partial', 'none']),
  counts: z.object({ drafts: count, unknownOutcome: count, settled: count, otherContext: count }).strict().nullable(),
  quarantine: z.object({ unreadable: count }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.status === 'unavailable' && (value.counts !== null || value.quarantine !== null || value.coverage !== 'none')) bad('no disponible no puede traer recuentos ni cobertura');
  if (value.status === 'read' && value.coverage === 'none' && (value.counts !== null || value.quarantine !== null)) bad('sin cobertura no puede traer recuentos: desconocido no es cero');
  if (value.status === 'read' && value.coverage !== 'none' && (value.counts === null || value.quarantine === null)) bad('con cobertura hacen falta recuentos y cuarentena');
  // Semántica acordada con la autora (propuesta, pendiente de cerrar con Codex): «parcial» = hay entradas ilegibles que pudieran ser de esta copia (los recuentos son cotas inferiores); «completa» = lectura completa sin cuarentena.
  if (value.status === 'read' && value.coverage === 'complete' && value.quarantine !== null && value.quarantine.unreadable > 0) bad('cobertura completa no admite entradas en cuarentena');
  if (value.status === 'read' && value.coverage === 'partial' && value.quarantine !== null && value.quarantine.unreadable === 0) bad('cobertura parcial exige entradas en cuarentena');
  if (value.scope.kind === 'none' &&(value.scope.context !== null || value.coverage !== 'none')) bad('sin ámbito no hay contexto ni cobertura');
  if (value.scope.kind === 'active-copy' && value.status === 'read' && value.scope.context === null) bad('el ámbito de una copia exige su contexto');
});
export type WorkSummary = z.infer<typeof WorkSummarySchema>;
export const parseWorkSummary = (raw: unknown): WorkSummary | null => { const parsed = WorkSummarySchema.safeParse(raw); return parsed.success ? parsed.data : null; };

/** Situación presentable, derivada SOLO del contrato (nunca de un cero implícito). */
export type WorkSituation = 'empty' | 'pending' | 'unreadable' | 'uncovered' | 'unavailable';
export function situationOf(summary: WorkSummary): WorkSituation {
  if (summary.status === 'unavailable') return 'unavailable';
  if (summary.coverage === 'none') return 'uncovered';
  const counts = summary.counts!, quarantined = summary.quarantine!.unreadable > 0;
  if (counts.drafts > 0 || counts.unknownOutcome > 0) return 'pending';
  return quarantined ? 'unreadable' : 'empty';
}
/** Requiere intervención de la persona: guardados por comprobar, borradores o entradas ilegibles. «Resueltos» y «de otra copia» no. */
export const needsAttention = (summary: WorkSummary): boolean => summary.status === 'read' && summary.coverage !== 'none' && (summary.counts!.drafts > 0 || summary.counts!.unknownOutcome > 0 || summary.quarantine!.unreadable > 0);

/** Fuente del hub/pasaporte a partir del resumen. Una lectura sin cobertura conserva `read`, su causa y recuentos `null`; un fallo conserva `unavailable`. La cuarentena viaja como `unreadable`. El contexto es el del ÁMBITO, no el que la pantalla esperaba. */
export function toWorkSource(summary: WorkSummary): ContextualSource<PassportWorkSummary> {
  const usable = summary.status === 'read' && summary.coverage !== 'none' && summary.counts !== null;
  return { status: summary.status, at: summary.at, context: summary.scope.context, value: { status: summary.status, at: summary.at, coverage: summary.coverage, counts: usable ? { ...summary.counts!, unreadable: summary.quarantine!.unreadable } : null } };
}

// ── Exportación breve por LISTA BLANCA ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const SITUATION_LABEL: Record<WorkSituation, string> = { empty: 'Sin trabajo local pendiente', pending: 'Hay trabajo local por atender', unreadable: 'Hay entradas ilegibles en cuarentena', uncovered: 'Sin cobertura: se desconoce', unavailable: 'No se pudo leer' };
export const PROVENANCE_LABEL = { durable: 'cuaderno guardado en disco', 'memory-only': 'solo memoria (no sobrevive a un reinicio)' } as const;
export const COVERAGE_LABEL = { complete: 'completa', partial: 'parcial: los recuentos pueden ser mayores', none: 'ninguna' } as const;
export function workSummaryExport(summary: WorkSummary) {
  return {
    format: 'planb-work-summary-export-v1',
    notice: 'Resumen del trabajo local pendiente: solo recuentos. No es una copia ni contiene borradores, parches, valores ni datos de personas, y no se puede restaurar.',
    generatedFrom: { format: summary.format, status: summary.status, at: summary.at, origin: summary.origin, provenance: summary.provenance, scope: { kind: summary.scope.kind, context: contextLabel(summary.scope.context) }, coverage: summary.coverage },
    situation: situationOf(summary), counts: summary.counts ? { ...summary.counts } : null, quarantine: summary.quarantine ? { ...summary.quarantine } : null,
    limits: ['Es lo que el cuaderno local había registrado en ese instante; no consulta el CRM.', summary.coverage === 'partial' ? 'La cobertura es parcial: los recuentos pueden ser mayores.' : summary.coverage === 'none' ? 'Sin cobertura no se sabe cuánto trabajo hay: desconocido no es cero.' : 'Los guardados por comprobar solo se confirman leyendo el estado real.', 'La cuarentena cuenta entradas ilegibles aparte: se desconoce lo que contienen.'],
  };
}
export const MAX_EXPORT_BYTES = 8 * 1024;
export const workSummaryToJson = (summary: WorkSummary): string => { const text = JSON.stringify(workSummaryExport(summary), null, 2) + '\n'; if (new TextEncoder().encode(text).length > MAX_EXPORT_BYTES) throw new Error('export-too-large'); return text; };
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function workSummaryToHtml(summary: WorkSummary): string {
  const e = workSummaryExport(summary), rows = e.counts ? [['Borradores sin enviar', e.counts.drafts], ['Guardados por comprobar', e.counts.unknownOutcome], ['Intentos resueltos', e.counts.settled], ['Intentos de otra copia (no se suman)', e.counts.otherContext]] as const : null;
  const css = 'body{font:15px/1.5 system-ui,sans-serif;max-width:40rem;margin:1.5rem auto;padding:0 1rem;color:#0f1a2b}h1{font-size:1.3rem}.n{background:#e8eefd;padding:.6rem;border-radius:6px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #d5dbe7;padding:.35rem .4rem;text-align:left}small{color:#394659}li{margin:.3rem 0;overflow-wrap:anywhere}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen del trabajo local</title><style>' + css + '</style></head><body>'
    + '<h1>Resumen del trabajo local</h1><p class="n">' + esc(e.notice) + '</p><p><strong>' + esc(SITUATION_LABEL[e.situation]) + '</strong><br><small>Leído el ' + esc(when(summary.at)) + ' · ' + esc(PROVENANCE_LABEL[summary.provenance]) + ' · cobertura ' + esc(COVERAGE_LABEL[summary.coverage]) + ' · ' + esc(summary.scope.kind === 'active-copy' ? 'copia activa' + (e.generatedFrom.scope.context ? ' ' + e.generatedFrom.scope.context : '') : 'sin ámbito') + '</small></p>'
    + (rows ? '<table><tbody>' + rows.map(([label, n]) => '<tr><th scope="row">' + esc(label) + '</th><td>' + n + '</td></tr>').join('') + '<tr><th scope="row">Entradas ilegibles (cuarentena)</th><td>' + e.quarantine!.unreadable + '</td></tr></tbody></table>' : '<p>Los recuentos son desconocidos (no son cero).</p>')
    + '<h2>Límites</h2><ul>' + e.limits.map(limit => '<li>' + esc(limit) + '</li>').join('') + '</ul></body></html>';
}
export const workSummaryFileName = (summary: WorkSummary, kind: 'html' | 'json') => 'resumen-trabajo-local-' + (summary.at.slice(0, 10) || 'sin-fecha') + '.' + kind;
