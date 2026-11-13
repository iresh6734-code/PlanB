import { canonicalJson, countersAddUp, type FieldChange, type MigrationComparison, type ObjectComparison, type RelationFinding } from './migration-verifier.js';

// INFORME DEL VERIFICADOR DE MIGRACIONES (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-CORE). Convierte una `MigrationComparison` en JSON y HTML REPRODUCIBLES: mismas entradas y mismo `generatedAt`
// (lo da quien llama; no hay reloj aquí) → mismos bytes. Lleva procedencia (proveedor, cuenta, instante y huella de cada exportación y del mapa), cobertura, contadores que SUMAN las filas de entrada
// y los límites. Nunca dice «migración íntegra»: el mejor resultado posible es «sin diferencias en el alcance confirmado», y solo con ambas exportaciones completas. HTML sin scripts, todo escapado.
export const MIGRATION_REPORT_FORMAT = 'planb-migration-report-v1' as const;
export const REPORT_LIST_CAP = 200;

export interface CappedList<T> { total: number; items: T[]; truncated: boolean }
export interface ReportObject {
  sourceObject: string; targetObject: string; coverage: ObjectComparison['coverage']; counts: ObjectComparison['counts'];
  changed: CappedList<{ sourceId: string; targetId: string; changes: FieldChange[] }>;
  uncertain: CappedList<{ sourceId: string; targetId: string; changes: FieldChange[] }>;
  absent: CappedList<string>; notFound: CappedList<string>; extra: CappedList<string>; unverifiedExtra: CappedList<string>; missingKey: CappedList<string>; keylessTargets: CappedList<string>;
  doubtful: CappedList<{ sourceId: string; reason: string; candidates: string[] }>;
  relations: { total: number; ok: number; broken: number; inconclusive: number; findings: CappedList<RelationFinding> };
  fieldIssues: string[];
}
export interface MigrationReport {
  format: typeof MIGRATION_REPORT_FORMAT; generatedAt: string;
  verdict: MigrationComparison['verdict']; headline: string; scope: string; verdictReasons: string[];
  countersAddUp: boolean;
  provenance: MigrationComparison['provenance'];
  objects: ReportObject[];
  limits: string[];
}

const headlines = {
  'no-differences-in-scope': 'Sin diferencias en el alcance confirmado',
  'differences-found': 'Se encontraron diferencias entre las dos exportaciones',
  inconclusive: 'No se puede concluir',
} as const;
const SCOPE = 'Este informe compara solo los objetos, claves y campos del mapa que la persona confirmó, entre las dos exportaciones tal como llegaron. No acredita que la migración sea íntegra ni que el proveedor de destino contenga todos los datos.';
const doubtText: Record<string, string> = { 'multiple-candidates': 'Varios candidatos en el destino', 'duplicate-source-key': 'Clave repetida en el origen' };
const changeText: Record<FieldChange['kind'], string> = { different: 'valor distinto', 'missing-in-target': 'falta en el destino', 'missing-in-source': 'falta en el origen', uncertain: 'sin concluir' };
const reasonText: Record<string, string> = {
  'unmapped-value': 'valor sin traducción en el mapa', unparseable: 'valor no interpretable', 'timezone-missing': 'fecha local sin zona horaria declarada', 'local-time-ambiguous': 'hora local ambigua (cambio de hora)',
  'local-time-nonexistent': 'hora local inexistente (cambio de hora)',
};
const relationText: Record<string, string> = {
  'relation-missing': 'el destino no trae la relación', 'relation-mismatch': 'el destino relaciona con otro registro', 'dangling-target-reference': 'el destino apunta a un registro que no existe',
  'source-reference-missing': 'la referencia del origen no existe en el origen', 'dependency-unresolved': 'el registro relacionado no está emparejado', 'target-reference-unverifiable': 'no se puede verificar: exportación parcial',
};
const coverageText = { complete: 'completa', partial: 'parcial', sample: 'muestra' } as const;

const cap = <T>(items: T[]): CappedList<T> => ({ total: items.length, items: items.slice(0, REPORT_LIST_CAP), truncated: items.length > REPORT_LIST_CAP });

export function buildMigrationReport(comparison: MigrationComparison, options: { generatedAt: string }): MigrationReport {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(options.generatedAt) || Number.isNaN(Date.parse(options.generatedAt))) throw new Error('generatedAt debe ser un instante ISO en UTC.');
  return {
    format: MIGRATION_REPORT_FORMAT, generatedAt: options.generatedAt, verdict: comparison.verdict, headline: headlines[comparison.verdict], scope: SCOPE, verdictReasons: [...comparison.verdictReasons],
    countersAddUp: countersAddUp(comparison), provenance: comparison.provenance,
    objects: comparison.objects.map(object => ({
      sourceObject: object.sourceObject, targetObject: object.targetObject, coverage: object.coverage, counts: object.counts,
      changed: cap(object.findings.changed), uncertain: cap(object.findings.uncertain), absent: cap(object.findings.absent), notFound: cap(object.findings.notFound), extra: cap(object.findings.extra),
      unverifiedExtra: cap(object.findings.unverifiedExtra), missingKey: cap(object.findings.missingKey), keylessTargets: cap(object.findings.keylessTargets),
      doubtful: cap(object.findings.doubtful),
      relations: { total: object.relations.total, ok: object.relations.ok, broken: object.relations.broken, inconclusive: object.relations.inconclusive, findings: cap(object.relations.findings) },
      fieldIssues: [...object.fieldIssues],
    })),
    limits: [...comparison.limits],
  };
}

/** JSON canónico (claves ordenadas) con salto de línea final: mismo informe, mismos bytes. */
export const renderMigrationJson = (report: MigrationReport): string => canonicalJson(report) + '\n';

/** Caracteres de control y de dirección (U+202E y similares reordenan el texto que sigue y permitirían suplantar un ID): se muestran como «‹U+XXXX›» en vez de actuar. R2: los propios delimitadores «‹» (U+2039) y «›» (U+203A) también se escriben con esa notación, de modo que la notación solo aparece cuando la genera el informe y un ID con «‹U+202E›» LITERAL se distingue de uno con el carácter real (la correspondencia es inyectiva). Tabulador, salto de línea y retorno se conservan. */
const unsafe = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2039\u203a]/g;
const esc = (value: unknown) => String(value).replace(unsafe, char => '‹U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '›').replace(/[&<>"'`]/g, char => '&#' + char.charCodeAt(0) + ';');
const truncationNote = (list: { total: number; truncated: boolean }) => (list.truncated ? '<p class="note">Se muestran los primeros ' + REPORT_LIST_CAP + ' de ' + list.total + '; el recuento es exacto.</p>' : '');
const idList = (title: string, list: CappedList<string>, note = '') => list.total === 0 ? '' : '<details><summary>' + esc(title) + ' (' + list.total + ')</summary>' + (note ? '<p class="note">' + esc(note) + '</p>' : '')
  + '<ul class="ids">' + list.items.map(id => '<li><code>' + esc(id) + '</code></li>').join('') + '</ul>' + (list.truncated ? '<p class="note">Se muestran los primeros ' + REPORT_LIST_CAP + ' de ' + list.total + '; el recuento es exacto.</p>' : '') + '</details>';
const changeCells = (change: FieldChange) => esc(change.field) + ': ' + esc(changeText[change.kind]) + (change.reason ? ' (' + esc(reasonText[change.reason] ?? change.reason) + ')' : '')
  + (change.sourceValue !== undefined || change.targetValue !== undefined ? ' · origen «' + esc(change.sourceValue ?? '') + '» · destino «' + esc(change.targetValue ?? '') + '»' : '');
const pairList = (title: string, list: CappedList<{ sourceId: string; targetId: string; changes: FieldChange[] }>) => list.total === 0 ? '' : '<details><summary>' + esc(title) + ' (' + list.total + ')</summary><ul>'
  + list.items.map(item => '<li><code>' + esc(item.sourceId) + '</code> → <code>' + esc(item.targetId) + '</code><ul>' + item.changes.map(change => '<li>' + changeCells(change) + '</li>').join('') + '</ul></li>').join('') + '</ul>'
  + (list.truncated ? '<p class="note">Se muestran los primeros ' + REPORT_LIST_CAP + ' de ' + list.total + '; el recuento es exacto.</p>' : '') + '</details>';

function objectSection(object: ReportObject): string {
  const c = object.counts, cov = object.coverage;
  const row = (name: string, value: number, hint = '') => '<tr><th scope="row">' + esc(name) + (hint ? ' <span class="hint">' + esc(hint) + '</span>' : '') + '</th><td>' + value + '</td></tr>';
  const partial = cov.sourceEffective !== 'complete' || cov.targetEffective !== 'complete';
  return '<section aria-labelledby="o-' + esc(object.sourceObject) + '"><h2 id="o-' + esc(object.sourceObject) + '">' + esc(object.sourceObject) + ' → ' + esc(object.targetObject) + '</h2>'
    + '<p class="cov">Origen: ' + cov.sourceRows + ' filas, cobertura ' + coverageText[cov.source] + (cov.sourceEffective !== cov.source ? ' (tratada como ' + coverageText[cov.sourceEffective] + ')' : '') + '. Destino: ' + cov.targetRows + ' filas, cobertura '
    + coverageText[cov.target] + (cov.targetEffective !== cov.target ? ' (tratada como ' + coverageText[cov.targetEffective] + ')' : '') + '.</p>'
    + (partial ? '<p class="warn">Una exportación no está completa: «no encontrado» no significa que el proveedor no lo tenga.</p>' : '')
    + object.fieldIssues.map(issue => '<p class="warn">' + esc(issue) + '</p>').join('')
    + '<div class="scroll"><table><caption>Registros del origen</caption><tbody>'
    + row('Iguales', c.identical) + row('Con diferencias', c.changed) + row('Sin concluir (campos)', c.uncertain) + row('Ausentes en el destino', c.absent, 'destino completo')
    + row('No encontrados, sin concluir', c.notFound, 'destino incompleto') + row('Dudosos', c.doubtful) + row('Sin clave', c.missingKey)
    + '</tbody></table><table><caption>Registros del destino</caption><tbody>'
    + row('Emparejados', c.matchedTargets) + row('Sobrantes', c.extra, 'origen completo') + row('Sobrantes, sin concluir', c.unverifiedExtra, 'origen incompleto') + row('Dudosos', c.doubtfulTargets) + row('Sin clave', c.unmatchedTargetKeyless)
    + '</tbody></table></div>'
    + '<p>Relaciones comprobadas: ' + object.relations.total + ' · correctas ' + object.relations.ok + ' · rotas ' + object.relations.broken + ' · sin concluir ' + object.relations.inconclusive + '.</p>'
    + pairList('Registros con diferencias', object.changed) + pairList('Registros sin concluir', object.uncertain)
    + idList('Ausentes en el destino', object.absent) + idList('No encontrados, sin concluir', object.notFound, 'El destino no se exportó completo.')
    + (object.doubtful.total ? '<details><summary>Dudosos, sin resolver (' + object.doubtful.total + ')</summary><ul>' + object.doubtful.items.map(item => '<li><code>' + esc(item.sourceId) + '</code>: ' + esc(doubtText[item.reason] ?? item.reason)
      + (item.candidates.length ? ' · candidatos ' + item.candidates.map(id => '<code>' + esc(id) + '</code>').join(', ') : '') + '</li>').join('') + '</ul>' + truncationNote(object.doubtful) + '</details>' : '')
    + idList('Sin clave en el origen', object.missingKey, 'Falta algún valor de la clave: no se puede emparejar.') + idList('Sobrantes en el destino', object.extra) + idList('Sobrantes, sin concluir', object.unverifiedExtra, 'El origen no se exportó completo.')
    + idList('Sin clave en el destino', object.keylessTargets)
    + (object.relations.findings.total ? '<details><summary>Relaciones rotas o sin concluir (' + object.relations.findings.total + ')</summary><ul>' + object.relations.findings.items.map(item => '<li><code>' + esc(item.sourceId) + '</code> · '
      + esc(item.sourceField) + ': ' + (item.state === 'broken' ? 'rota' : 'sin concluir') + (item.reason ? ' (' + esc(relationText[item.reason] ?? item.reason) + ')' : '') + '</li>').join('') + '</ul>' + truncationNote(object.relations.findings) + '</details>' : '')
    + '</section>';
}

/** HTML autocontenido y estático: sin scripts ni recursos externos, todo escapado, legible de 1440 a 320 px y en modo oscuro. */
export function renderMigrationHtml(report: MigrationReport): string {
  const side = (title: string, p: MigrationReport['provenance']['source']) => '<tr><th scope="row">' + esc(title) + '</th><td>' + esc(p.provider) + ' · cuenta ' + esc(p.accountId) + '<br>Exportado ' + esc(p.exportedAt) + ' · zona '
    + esc(p.timezone ?? 'no declarada') + '<br><code>sha256 ' + esc(p.sha256) + '</code></td></tr>';
  const m = report.provenance.map;
  return '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
    + '<title>Verificación de migración</title><style>'
    + ':root{color-scheme:light dark;--bg:#fff;--fg:#14202e;--muted:#52606f;--line:#cdd6df;--warn:#8a4b00;--ok:#14633a;--bad:#a1281f}@media (prefers-color-scheme:dark){:root{--bg:#10161d;--fg:#e8edf2;--muted:#a3b0bd;--line:#2c3947;--warn:#f0b35a;--ok:#6fd49d;--bad:#ff8f87}}'
    + 'body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:960px;margin:0 auto}h1{font-size:1.5rem;margin:0 0 8px}h2{font-size:1.2rem;margin:24px 0 8px}'
    + 'code{font:13px ui-monospace,monospace}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{overflow-wrap:normal;word-break:normal}caption{text-align:left;font-weight:600;padding:4px 0}'
    + '.scroll{overflow-x:auto}.verdict{border:2px solid var(--line);padding:12px;border-radius:6px}.verdict.ok{border-color:var(--ok)}.verdict.bad{border-color:var(--bad)}.verdict.warn{border-color:var(--warn)}'
    + '.warn{color:var(--warn)}.note,.hint,.cov{color:var(--muted);font-size:.9rem}details{margin:6px 0}summary{cursor:pointer;min-height:24px}ul{padding-left:20px}.ids{columns:2}@media (max-width:480px){.ids{columns:1}body{padding:12px}}'
    + '</style></head><body><main><h1>Verificación de migración</h1>'
    + '<div class="verdict ' + (report.verdict === 'no-differences-in-scope' ? 'ok' : report.verdict === 'differences-found' ? 'bad' : 'warn') + '" role="status"><strong>' + esc(report.headline) + '</strong>'
    + '<p>' + esc(report.scope) + '</p>' + (report.verdictReasons.length ? '<ul>' + report.verdictReasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ul>' : '') + '</div>'
    + '<p class="note">Informe generado ' + esc(report.generatedAt) + '. Los contadores ' + (report.countersAddUp ? 'suman exactamente las filas de entrada.' : 'NO suman las filas de entrada: no confíes en este informe.') + '</p>'
    + '<h2>Procedencia</h2><div class="scroll"><table><tbody>' + side('Origen', report.provenance.source) + side('Destino', report.provenance.target)
    + '<tr><th scope="row">Mapa confirmado</th><td>Por ' + esc(m.confirmedBy) + ' el ' + esc(m.confirmedAt) + '<br><code>sha256 ' + esc(m.sha256) + '</code></td></tr></tbody></table></div>'
    + report.objects.map(objectSection).join('')
    + '<h2>Límites</h2><ul>' + report.limits.map(limit => '<li>' + esc(limit) + '</li>').join('') + '</ul></main></body></html>\n';
}
