// Plan B Verifica · migración verificada al CRM del comprador (fase 4).
// Convierte la captura del cierre en una exportación, la compara con la exportación del destino usando el verificador de
// migraciones (shared/migration-verifier.ts) y un mapa que confirma una persona, y redacta el informe de equivalencia.
// Antes de soltar el informe pasa la barrera de la sala limpia: si lleva un nombre, correo o ID del CRM, no sale nada.
// Los IDs reales solo van a la lista de trabajo, que se queda en el equipo de quien corrige la migración.
import { compareMigration, MIGRATION_EXPORT_FORMAT, MIGRATION_LIMITS, type FieldChange, type MigrationComparison, type MigrationExport, type MigrationMap, type ObjectComparison, type RelationFinding } from '../migration-verifier.js';
import { CleanRoomError, leaksIn, newSalt } from './clean-room.js';
import {
  EQUIVALENCE_FINDING_KINDS, EQUIVALENCE_FORMAT, EQUIVALENCE_OBJECTS, equivalenceFingerprint, equivalenceToJson, OBJECT_LABEL,
  type EquivalenceFinding, type EquivalenceObject, type EquivalenceObjectSummary, type EquivalenceReport,
} from './equivalence.js';
import type { FindingItem, VerificaCapture } from './model.js';
import { parseCaptureText, VerificaInputError } from './inputs.js';
import { describeCapture, fingerprintOf, pseudonymizer } from './report.js';
import { euros } from './rules.js';
import { parseWatchReport, verifyWatchReport, type WatchReport } from './watch.js';

export interface EquivalenceInput {
  asOf: string;
  /** La captura del cierre: la última de la vigilancia. */
  closing: VerificaCapture;
  /** Exportación del CRM del comprador (`planb-migration-export-v1`). */
  target: unknown;
  /** Mapa de objetos, claves y campos (`planb-migration-map-v1`), confirmado por una persona. */
  map: unknown;
  salt: string;
  /** Si se da, se comprueba que está intacto y que su última captura es `closing`. */
  watch?: WatchReport | null;
}

export interface EquivalenceOutput {
  report: EquivalenceReport;
  /** Comparación completa, con IDs reales. Nunca sale del equipo: solo sirve para la lista de trabajo. */
  comparison: MigrationComparison;
}

/** Los mismos archivos de trabajo sirven en el navegador y en el script. */
export function prepareEquivalenceFiles(files: {
  closing: string; target: string; map: string; watch?: string | null; salt?: string | null; asOf: string;
}): { input: EquivalenceInput; saltCreated: boolean } {
  const closing = parseCaptureText(files.closing, 'La captura de cierre');
  const targetValue: unknown = JSON.parse(files.target);
  const target = typeof targetValue === 'object' && targetValue !== null && 'format' in targetValue && targetValue.format === MIGRATION_EXPORT_FORMAT
    ? targetValue
    : captureToMigrationExport(parseCaptureText(files.target, 'El archivo de destino'));
  const map: unknown = JSON.parse(files.map);
  const watch = files.watch == null ? null : parseWatchReport(JSON.parse(files.watch));
  const savedSalt = files.salt == null ? null : files.salt.trim();
  if (savedSalt !== null && savedSalt.length < 16) throw new VerificaInputError('La sal guardada tiene menos de 16 caracteres.');
  if (savedSalt === null && watch) throw new VerificaInputError('Con un parte de vigilancia hace falta su sal para conservar las mismas referencias.');
  const cut = Date.parse(files.asOf);
  if (!Number.isFinite(cut)) throw new VerificaInputError('La fecha del informe no es válida.');
  return { input: { asOf: new Date(cut).toISOString(), closing, target, map, watch, salt: savedSalt ?? newSalt() }, saltCreated: savedSalt === null };
}

export class EquivalenceInputError extends Error {
  constructor(readonly code: 'WATCH_TAMPERED' | 'WATCH_MISMATCH', message: string) { super(message); this.name = 'EquivalenceInputError'; }
}

/** La captura del cierre como exportación del verificador: todo completo, sin comerciales (no se migran como registros). */
export function captureToMigrationExport(capture: VerificaCapture): MigrationExport {
  const object = (objectType: EquivalenceObject, rows: MigrationExport['objects'][number]['rows']) => ({ objectType, coverage: 'complete' as const, declaredTotal: rows.length, rows });
  return {
    format: MIGRATION_EXPORT_FORMAT, provider: capture.source, accountId: capture.id, exportedAt: capture.capturedAt, timezone: null,
    objects: [
      object('companies', capture.companies.map(c => ({ id: c.id, values: { name: c.name, customer: c.customer, taxId: c.taxId ?? null } }))),
      object('contacts', capture.contacts.map(p => ({ id: p.id, values: { name: p.name, email: p.email, companyId: p.companyId } }))),
      object('deals', capture.deals.map(d => ({ id: d.id, values: { name: d.name, companyId: d.companyId, ownerId: d.ownerId, status: d.status, amount: d.amount, createdAt: d.createdAt, closeDate: d.closeDate } }))),
    ],
  };
}

const KIND = { companies: 'company', contacts: 'contact', deals: 'deal' } as const;
const NOUN: Record<EquivalenceObject, [string, string]> = { companies: ['empresa', 'empresas'], contacts: ['contacto', 'contactos'], deals: ['oportunidad', 'oportunidades'] };
const count = (n: number, object: EquivalenceObject) => n + ' ' + NOUN[object][n === 1 ? 0 : 1];
const records = (n: number) => n + (n === 1 ? ' registro' : ' registros');
const REASON: Record<string, string> = {
  unparseable: 'no se entiende', 'unmapped-value': 'valor sin traducción en el mapa', 'timezone-missing': 'sin zona horaria',
  'local-time-ambiguous': 'hora ambigua por el cambio de hora', 'local-time-nonexistent': 'hora que no existe por el cambio de hora',
};
const RELATION: Record<NonNullable<RelationFinding['reason']>, string> = {
  'relation-missing': 'llegó sin enlace', 'relation-mismatch': 'enlazada con otro registro', 'dangling-target-reference': 'enlazada con un registro que no existe',
  'source-reference-missing': 'apunta a un registro que no está en el cierre', 'dependency-unresolved': 'el registro al que apunta no se pudo emparejar',
  'target-reference-unverifiable': 'el destino no se exportó completo',
};
const changeText = (c: FieldChange) => c.field + (c.kind === 'uncertain' ? ': ' + (REASON[c.reason ?? ''] ?? 'sin concluir') : c.kind === 'missing-in-target' ? ': vacío en el destino' : c.kind === 'missing-in-source' ? ': vacío al cierre' : '');

/** Compara y redacta el informe. No aplica la barrera: para eso, `releaseEquivalence`. */
export function buildEquivalence(input: EquivalenceInput): EquivalenceOutput {
  const closingFingerprint = fingerprintOf(input.closing);
  if (input.watch) {
    if (!verifyWatchReport(input.watch)) throw new EquivalenceInputError('WATCH_TAMPERED', 'El parte de vigilancia no coincide con su huella: se ha modificado.');
    if (input.watch.closing.to !== closingFingerprint) throw new EquivalenceInputError('WATCH_MISMATCH', 'La captura del cierre no es la última del parte de vigilancia.');
  }
  const comparison = compareMigration(captureToMigrationExport(input.closing), input.target, input.map, { includeValues: false });
  const map = input.map as MigrationMap;
  const pseudonym = pseudonymizer(input.salt);
  const amounts = new Map(input.closing.deals.map(d => [d.id, d.amount]));

  const objects: EquivalenceObjectSummary[] = [];
  const findings: EquivalenceFinding[] = [];
  for (const o of comparison.objects) {
    const object = o.sourceObject as EquivalenceObject;
    const source = (id: string, note?: string): FindingItem => ({ ref: pseudonym(KIND[object], id), amount: object === 'deals' ? amounts.get(id) ?? null : null, ...(note ? { note } : {}) });
    const target = (id: string, note?: string): FindingItem => ({ ref: pseudonym(KIND[object], 'destino|' + id), amount: null, ...(note ? { note } : {}) });
    const touched = new Set([...o.findings.changed, ...o.findings.uncertain].map(f => f.sourceId));
    const relationIssues = new Set(o.relations.findings.map(f => f.sourceId).filter(id => !touched.has(id)));
    objects.push({ object, targetObject: o.targetObject, closing: o.coverage.sourceRows, target: o.coverage.targetRows, intact: o.counts.identical - relationIssues.size });

    const add = (kind: EquivalenceFinding['kind'], title: string, alarm: boolean, items: FindingItem[], summary: (n: number, amount: string) => string, extra: Record<string, number> = {}) => {
      if (!items.length && !Object.values(extra).some(Boolean)) return;
      const total = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      const figures: Record<string, number> = { records: items.length, ...(object === 'deals' && total ? { amount: total } : {}), ...extra };
      findings.push({ object, kind, title, alarm, summary: summary(items.length, total ? ' por ' + euros(total) : ''), figures, items });
    };
    const tally = (list: { changes: FieldChange[] }[], text: (c: FieldChange) => string) => {
      const byField = new Map<string, number>();
      for (const f of list) for (const c of f.changes) byField.set(text(c), (byField.get(text(c)) ?? 0) + 1);
      return [...byField].map(([field, n]) => field + (list.length > 1 ? ' (' + n + ')' : '')).join(', ');
    };

    add('absent', 'No llegaron', true, o.findings.absent.map(id => source(id)),
      (n, amount) => count(n, object) + amount + ' estaban en la captura del cierre y no están en el destino.');
    add('changed', 'Llegaron con otro valor', true, o.findings.changed.map(f => source(f.sourceId, f.changes.map(changeText).join(', '))),
      (n, amount) => count(n, object) + amount + ' llegaron con algún campo distinto: ' + tally(o.findings.changed, changeText) + '.');
    const broken = o.relations.findings.filter(f => f.state === 'broken');
    add('relation-broken', 'Relaciones rotas', true, broken.map(f => source(f.sourceId, f.sourceField + ': ' + RELATION[f.reason!])),
      (n, amount) => count(n, object) + amount + ' llegaron colgadas de otro registro o sin enlace.');
    add('extra', 'Sobran en el destino', true, o.findings.extra.map(id => target(id, 'solo en el destino')),
      n => records(n) + ' de ' + o.targetObject + ' no corresponden a nada de la captura del cierre.');
    add('uncertain', 'Valores que no se entienden', false, o.findings.uncertain.map(f => source(f.sourceId, f.changes.map(changeText).join(', '))),
      (n, amount) => count(n, object) + amount + ' llegaron con un valor que no se puede comparar: ' + tally(o.findings.uncertain, changeText) + '.');
    add('doubtful', 'Ambiguos', false,
      o.findings.doubtful.map(f => source(f.sourceId, (f.reason === 'multiple-candidates' ? f.candidates.length + ' candidatos en el destino' : 'clave repetida en el cierre') + (f.candidates.length ? ': ' + f.candidates.map(id => target(id).ref).join(', ') : ''))),
      n => count(n, object) + ' tienen más de un candidato en el destino. No se elige ninguno.', { targets: o.counts.doubtfulTargets });
    add('not-concluded', 'Sin concluir', false, [
      ...o.findings.notFound.map(id => source(id, 'no encontrado; el destino no se exportó completo')),
      ...o.findings.missingKey.map(id => source(id, 'sin clave en el cierre')),
      ...o.findings.unverifiedExtra.map(id => target(id, 'solo en el destino; el cierre no se exportó completo')),
      ...o.findings.keylessTargets.map(id => target(id, 'sin clave en el destino')),
      ...o.relations.findings.filter(f => f.state === 'inconclusive').map(f => source(f.sourceId, f.sourceField + ': ' + RELATION[f.reason!])),
    ], n => records(n) + ' no se pueden concluir.' + (o.fieldIssues.length ? ' ' + o.fieldIssues.join(' ') : ''), o.fieldIssues.length ? { fieldIssues: o.fieldIssues.length } : {});
  }
  findings.sort((a, b) => EQUIVALENCE_OBJECTS.indexOf(a.object) - EQUIVALENCE_OBJECTS.indexOf(b.object) || EQUIVALENCE_FINDING_KINDS.indexOf(a.kind) - EQUIVALENCE_FINDING_KINDS.indexOf(b.kind));

  const body: Omit<EquivalenceReport, 'fingerprint'> = {
    format: EQUIVALENCE_FORMAT,
    asOf: input.asOf,
    closing: { at: input.closing.capturedAt, fingerprint: closingFingerprint, detail: describeCapture(input.closing), watch: input.watch ? input.watch.fingerprint : null },
    target: { provider: comparison.provenance.target.provider, exportedAt: comparison.provenance.target.exportedAt, fingerprint: comparison.provenance.target.sha256, detail: targetDetail(comparison) },
    map: { fingerprint: comparison.provenance.map.sha256, confirmedBy: comparison.provenance.map.confirmedBy, confirmedAt: comparison.provenance.map.confirmedAt },
    verdict: comparison.verdict,
    verdictReasons: comparison.verdictReasons,
    objects,
    findings,
    notCovered: notCovered(captureToMigrationExport(input.closing), map),
    limits: [
      ...MIGRATION_LIMITS,
      'Se compara la captura del cierre. Lo que cambió en el CRM del vendedor después del cierre no está en este informe.',
      'Las referencias son seudónimos con la sal del vendedor. Los identificadores reales solo van en la lista de trabajo de quien corrige la migración.',
    ],
  };
  return { report: { ...body, fingerprint: equivalenceFingerprint(body) }, comparison };
}

function targetDetail(comparison: MigrationComparison): string {
  const partial = comparison.objects.filter(o => o.coverage.targetEffective !== 'complete');
  return comparison.provenance.target.provider + ' · ' + comparison.objects.map(o => o.coverage.targetRows + ' ' + o.targetObject).join(', ')
    + (partial.length ? '; exportación parcial en ' + partial.map(o => o.targetObject).join(', ') : '');
}

/** Lo que la captura del cierre trae y el mapa no compara. */
function notCovered(closing: MigrationExport, map: MigrationMap): string[] {
  const out = ['Comerciales: no se comparan; se migran como usuarios del CRM del comprador.'];
  for (const object of closing.objects) {
    const label = OBJECT_LABEL[object.objectType as EquivalenceObject];
    const mapping = map.objects.find(m => m.sourceObject === object.objectType);
    if (!mapping) { out.push(label + ': no está en el mapa.'); continue; }
    const used = new Set([...mapping.fields.filter(f => f.relevant).map(f => f.source), ...mapping.relations.map(r => r.sourceField), ...mapping.matchKey.map(k => k.source)]);
    const fields = [...new Set(object.rows.flatMap(row => Object.keys(row.values)))].filter(field => !used.has(field));
    if (fields.length) out.push(label + ': ' + fields.join(', ') + '.');
  }
  return out;
}

/** Textos del CRM del vendedor que aparecen en el informe. Solo para mostrarlos en su equipo. */
export const findEquivalenceLeaks = (report: EquivalenceReport, closing: VerificaCapture): string[] => leaksIn(equivalenceToJson(report), [closing], null);

/** El informe que puede salir: la misma barrera que la sala limpia. */
export function releaseEquivalence(input: EquivalenceInput): EquivalenceOutput {
  const output = buildEquivalence(input);
  const leaks = findEquivalenceLeaks(output.report, input.closing).length;
  if (leaks) throw new CleanRoomError(leaks, 'El informe de equivalencia lleva ' + leaks + (leaks === 1 ? ' texto' : ' textos') + ' del CRM (nombres, correos, NIF o IDs). No sale nada.');
  return output;
}

const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
};

/**
 * Lista de trabajo para quien corrige la migración: una fila por registro con su ID real en el cierre y en el destino.
 * CSV con punto y coma. No es el informe y no sale del equipo.
 */
export function equivalenceWorkList(comparison: MigrationComparison): string {
  const rows: string[][] = [['objeto', 'tipo', 'id_cierre', 'id_destino', 'detalle']];
  const fields = (changes: FieldChange[]) => changes.map(changeText).join(', ');
  for (const o of comparison.objects as ObjectComparison[]) {
    const name = o.sourceObject;
    for (const id of o.findings.absent) rows.push([name, 'no-llego', id, '', '']);
    for (const f of o.findings.changed) rows.push([name, 'otro-valor', f.sourceId, f.targetId, fields(f.changes)]);
    for (const f of o.relations.findings.filter(r => r.state === 'broken')) rows.push([name, 'relacion-rota', f.sourceId, '', f.sourceField + ': ' + RELATION[f.reason!]]);
    for (const id of o.findings.extra) rows.push([name, 'sobra', '', id, '']);
    for (const f of o.findings.uncertain) rows.push([name, 'no-se-entiende', f.sourceId, f.targetId, fields(f.changes)]);
    for (const f of o.findings.doubtful) rows.push([name, 'ambiguo', f.sourceId, f.candidates.join(' | '), f.reason === 'multiple-candidates' ? 'varios candidatos' : 'clave repetida en el cierre']);
    for (const id of o.findings.notFound) rows.push([name, 'sin-concluir', id, '', 'no encontrado; el destino no se exportó completo']);
    for (const id of o.findings.missingKey) rows.push([name, 'sin-concluir', id, '', 'sin clave en el cierre']);
    for (const id of o.findings.unverifiedExtra) rows.push([name, 'sin-concluir', '', id, 'solo en el destino; el cierre no se exportó completo']);
    for (const id of o.findings.keylessTargets) rows.push([name, 'sin-concluir', '', id, 'sin clave en el destino']);
    for (const f of o.relations.findings.filter(r => r.state === 'inconclusive')) rows.push([name, 'sin-concluir', f.sourceId, '', f.sourceField + ': ' + RELATION[f.reason!]]);
  }
  return rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
