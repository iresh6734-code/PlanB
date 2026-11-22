// Plan B Verifica · informe de equivalencia (fase 4, «Después del cierre», docs/plan-b-verifica-plan-de-producto.md).
// Compara la captura del cierre con lo que llegó al CRM del comprador y dice, por objeto, qué llegó igual, qué falta,
// qué llegó distinto, qué sobra, qué no se puede concluir y qué relaciones se rompieron. Nunca dice «migración íntegra».
// Este módulo solo define el informe, lo lee y comprueba su huella: no carga el verificador (ni zod), para que la página
// pueda abrir un informe sin traerlo. Lo construye migration.ts.
import type { FindingItem } from './model.js';
import { fingerprintOf } from './report.js';

export const EQUIVALENCE_FORMAT = 'planb-verifica-equivalence-v1';

export const EQUIVALENCE_OBJECTS = ['companies', 'contacts', 'deals'] as const;
export type EquivalenceObject = typeof EQUIVALENCE_OBJECTS[number];
export const OBJECT_LABEL: Record<EquivalenceObject, string> = { companies: 'Empresas', contacts: 'Contactos', deals: 'Oportunidades' };

/**
 * Diferencias confirmadas: `absent` (estaba al cierre y no llegó), `changed` (llegó con otro valor), `relation-broken`
 * (cuelga de otro registro) y `extra` (está en el destino y no al cierre).
 * Sin concluir: `uncertain` (un valor que no se entiende), `doubtful` (varios candidatos) y `not-concluded` (exportación
 * parcial, sin clave o referencia que no se puede comprobar).
 */
export const EQUIVALENCE_FINDING_KINDS = ['absent', 'changed', 'relation-broken', 'extra', 'uncertain', 'doubtful', 'not-concluded'] as const;
export type EquivalenceFindingKind = typeof EQUIVALENCE_FINDING_KINDS[number];

export type EquivalenceVerdict = 'no-differences-in-scope' | 'differences-found' | 'inconclusive';
const VERDICTS: readonly EquivalenceVerdict[] = ['no-differences-in-scope', 'differences-found', 'inconclusive'];
/** Nunca «migración íntegra»: como mucho, sin diferencias en lo que el mapa compara. */
export const VERDICT_TEXT: Record<EquivalenceVerdict, string> = {
  'no-differences-in-scope': 'Sin diferencias en lo que compara el mapa',
  'differences-found': 'Hay diferencias',
  inconclusive: 'No se puede concluir',
};

export interface EquivalenceObjectSummary {
  object: EquivalenceObject;
  /** Nombre del objeto en el CRM del comprador, tal como lo declara el mapa. */
  targetObject: string;
  /** Registros en la captura del cierre y en la exportación del destino. */
  closing: number;
  target: number;
  /** Emparejados con todos los campos del mapa iguales y sus relaciones bien. */
  intact: number;
}

export interface EquivalenceFinding {
  object: EquivalenceObject;
  kind: EquivalenceFindingKind;
  title: string;
  /** true: diferencia confirmada. false: no se puede concluir. */
  alarm: boolean;
  summary: string;
  figures: Record<string, number>;
  /** Seudónimos con la sal del vendedor. Los registros que solo están en el destino llevan su propio seudónimo. */
  items: FindingItem[];
}

export interface EquivalenceReport {
  format: typeof EQUIVALENCE_FORMAT;
  asOf: string;
  /** La captura del cierre. `watch`: huella del parte de vigilancia cuya última captura es esta, si se comprobó. */
  closing: { at: string; fingerprint: string; detail: string; watch: string | null };
  /** La exportación del CRM del comprador, tal como se comparó. */
  target: { provider: string; exportedAt: string; fingerprint: string; detail: string };
  /** El mapa de campos y claves. Lo confirma una persona; el motor no decide qué corresponde con qué. */
  map: { fingerprint: string; confirmedBy: string; confirmedAt: string };
  verdict: EquivalenceVerdict;
  verdictReasons: string[];
  objects: EquivalenceObjectSummary[];
  findings: EquivalenceFinding[];
  /** Campos y objetos de la captura del cierre que el mapa no cubre: no se han comprobado. */
  notCovered: string[];
  limits: string[];
  fingerprint: string;
}

export function equivalenceFingerprint(report: Omit<EquivalenceReport, 'fingerprint'> | EquivalenceReport): string {
  const { fingerprint: _ignored, ...body } = report as EquivalenceReport;
  return fingerprintOf(body);
}

/** true si el informe no se ha tocado desde que se firmó su huella. */
export const verifyEquivalenceReport = (report: EquivalenceReport): boolean => report.format === EQUIVALENCE_FORMAT && equivalenceFingerprint(report) === report.fingerprint;
export const equivalenceToJson = (report: EquivalenceReport): string => JSON.stringify(report, null, 2) + '\n';

export class EquivalenceFormatError extends Error { constructor(message: string) { super(message); this.name = 'EquivalenceFormatError'; } }

/** Comprueba que un JSON de fuera tiene la forma de un informe de equivalencia. La huella la comprueba `verifyEquivalenceReport`. */
export function parseEquivalenceReport(value: unknown): EquivalenceReport {
  const fail = (where: string): never => { throw new EquivalenceFormatError('No es un informe de equivalencia de Verifica (' + where + ').'); };
  const obj = (v: unknown, where: string) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail(where));
  const list = (v: unknown, where: string) => (Array.isArray(v) ? v as unknown[] : fail(where));
  const text = (v: unknown, where: string) => (typeof v === 'string' ? v : fail(where));
  const count = (v: unknown, where: string) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fail(where));
  const hex = (v: unknown, where: string) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : fail(where));
  const objectId = (v: unknown, where: string) => ((EQUIVALENCE_OBJECTS as readonly unknown[]).includes(v) ? v : fail(where));
  const r = obj(value, 'raíz');
  if (r.format !== EQUIVALENCE_FORMAT) fail('formato');
  text(r.asOf, 'fecha'); hex(r.fingerprint, 'huella');
  const closing = obj(r.closing, 'cierre');
  text(closing.at, 'cierre'); hex(closing.fingerprint, 'cierre'); text(closing.detail, 'cierre');
  if (closing.watch !== null) hex(closing.watch, 'cierre');
  const target = obj(r.target, 'destino');
  text(target.provider, 'destino'); text(target.exportedAt, 'destino'); hex(target.fingerprint, 'destino'); text(target.detail, 'destino');
  const map = obj(r.map, 'mapa');
  hex(map.fingerprint, 'mapa'); text(map.confirmedBy, 'mapa'); text(map.confirmedAt, 'mapa');
  if (!VERDICTS.includes(r.verdict as EquivalenceVerdict)) fail('veredicto');
  list(r.verdictReasons, 'veredicto').forEach(v => text(v, 'veredicto'));
  for (const o of list(r.objects, 'objetos').map(v => obj(v, 'objeto'))) {
    objectId(o.object, 'objeto'); text(o.targetObject, 'objeto');
    count(o.closing, 'objeto'); count(o.target, 'objeto'); count(o.intact, 'objeto');
  }
  for (const f of list(r.findings, 'hallazgos').map(v => obj(v, 'hallazgo'))) {
    objectId(f.object, 'hallazgo');
    if (!(EQUIVALENCE_FINDING_KINDS as readonly unknown[]).includes(f.kind)) fail('hallazgo');
    text(f.title, 'hallazgo'); text(f.summary, 'hallazgo');
    if (typeof f.alarm !== 'boolean') fail('hallazgo');
    if (!Object.values(obj(f.figures, 'cifras')).every(n => typeof n === 'number')) fail('cifras');
    for (const item of list(f.items, 'referencias').map(i => obj(i, 'referencia'))) {
      text(item.ref, 'referencia');
      if (item.amount !== null && typeof item.amount !== 'number') fail('referencia');
      if (item.note !== undefined) text(item.note, 'referencia');
    }
  }
  list(r.notCovered, 'sin cubrir').forEach(v => text(v, 'sin cubrir'));
  list(r.limits, 'límites').forEach(v => text(v, 'límites'));
  return value as EquivalenceReport;
}
