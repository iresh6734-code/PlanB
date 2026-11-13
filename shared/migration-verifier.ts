import { z } from 'zod';

// VERIFICADOR DE MIGRACIONES · CONTRATO Y MOTOR LOCAL (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-CORE). Fase 4 del plan, adelantada SOLO como motor interno: no es una pantalla, no está en la navegación, no
// toca el comparador de capturas y no llama a ningún proveedor. Compara DOS exportaciones (origen y destino) que alguien ha cargado, según un mapa de campos y claves que la PERSONA confirma.
//
// Reglas que impone el motor, con independencia del proveedor:
//   · La correspondencia entre registros se hace SOLO por las claves del mapa confirmado. Un ID igual en dos proveedores NO corresponde por sí solo: usar `$id` como clave exige
//     `acknowledgeIdEquivalence: true` (la persona declara que ambos sistemas comparten identificador).
//   · Lo ambiguo NO se resuelve: varios candidatos, clave repetida en el origen, destino reclamado por dos registros o clave vacía quedan como «dudosos» con sus candidatos.
//   · «No encontrado» solo es «ausente» si el destino se exportó COMPLETO. Con destino parcial o muestra es «no encontrado, sin concluir»: no equivale a que el proveedor no lo tenga. Lo mismo para «sobrante»
//     con un origen parcial. Un `declaredTotal` que no coincide con las filas degrada la cobertura a parcial.
//   · Fechas: una fecha con zona (Z o ±hh:mm) es un instante; una local sin zona exige la zona del volcado; sin ella, o con una hora local inexistente o ambigua (cambio de hora), el campo queda «sin concluir».
//   · Un valor que no se puede interpretar o un estado sin traducción en el mapa queda «sin concluir», nunca «igual».
//   · El resultado nunca dice «migración íntegra»: solo «sin diferencias en el alcance confirmado» cuando ambas exportaciones son completas y no queda nada dudoso ni sin concluir.
export const MIGRATION_EXPORT_FORMAT = 'planb-migration-export-v1' as const;
export const MIGRATION_MAP_FORMAT = 'planb-migration-map-v1' as const;
export const MIGRATION_COMPARISON_FORMAT = 'planb-migration-comparison-v1' as const;
export const MAX_ROWS_PER_OBJECT = 50_000;

const iso = z.iso.datetime();
const label = z.string().trim().min(1).max(160);
const providerId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const objectName = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const fieldName = z.string().regex(/^(?:\$id|[A-Za-z][A-Za-z0-9_.-]{0,79})$/);
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const zoneName = z.string().max(64).refine(name => { try { new Intl.DateTimeFormat('en-US', { timeZone: name }); return true; } catch { return false; } }, 'Zona horaria no válida');

const exportedRow = z.object({ id: z.string().min(1).max(120), values: z.record(z.string().max(80), scalar) }).strict();
const exportedObject = z.object({
  objectType: objectName,
  coverage: z.enum(['complete', 'partial', 'sample']),
  declaredTotal: z.number().int().min(0).nullable(),
  rows: z.array(exportedRow).max(MAX_ROWS_PER_OBJECT),
}).strict().refine(object => new Set(object.rows.map(row => row.id)).size === object.rows.length, 'Hay IDs repetidos dentro de un objeto exportado');

export const migrationExport = z.object({
  format: z.literal(MIGRATION_EXPORT_FORMAT),
  provider: providerId,
  accountId: label,
  exportedAt: iso,
  /** Zona horaria (IANA) de las fechas locales sin desfase de este volcado; null si no se declara. */
  timezone: zoneName.nullable(),
  objects: z.array(exportedObject).min(1).max(20),
}).strict().refine(file => new Set(file.objects.map(object => object.objectType)).size === file.objects.length, 'Objeto repetido');

const normalizer = z.enum(['exact', 'trim', 'lower', 'email', 'digits']);
const keyPart = z.object({ source: fieldName, target: fieldName, normalize: normalizer }).strict();
const fieldMapping = z.object({
  source: fieldName, target: fieldName,
  type: z.enum(['text', 'number', 'boolean', 'date', 'datetime']),
  normalize: normalizer,
  /** Si falta en el destino (y existe en el origen) cuenta como diferencia. Un campo opcional que falta no cuenta. */
  required: z.boolean(),
  /** Si es false, el campo se declara en el mapa pero sus diferencias no se reportan. */
  relevant: z.boolean(),
  /** Traducción de valores del origen (p. ej. etapas). Un valor no traducido queda sin concluir. */
  valueMap: z.record(z.string().max(200), z.string().max(200)).optional(),
  /** Tolerancia en segundos para fechas con hora. */
  toleranceSeconds: z.number().int().min(0).max(86_400).optional(),
}).strict();
const relationMapping = z.object({ sourceField: fieldName, sourceObject: objectName, targetField: fieldName, targetObject: objectName }).strict();
const objectMapping = z.object({
  sourceObject: objectName, targetObject: objectName,
  matchKey: z.array(keyPart).min(1).max(4),
  acknowledgeIdEquivalence: z.boolean(),
  fields: z.array(fieldMapping).max(100),
  relations: z.array(relationMapping).max(10),
}).strict().superRefine((value, ctx) => {
  const usesId = value.matchKey.some(part => part.source === '$id' || part.target === '$id');
  if (usesId && !value.acknowledgeIdEquivalence) ctx.addIssue({ code: 'custom', message: 'Usar $id como clave exige declarar que ambos sistemas comparten identificador' });
  if (!usesId && value.acknowledgeIdEquivalence) ctx.addIssue({ code: 'custom', message: 'acknowledgeIdEquivalence sin clave $id' });
});

export const migrationMap = z.object({
  format: z.literal(MIGRATION_MAP_FORMAT),
  sourceProvider: providerId, sourceAccountId: label, targetProvider: providerId, targetAccountId: label,
  /** Quién confirmó el mapa y cuándo. El motor no confirma nada por la persona. */
  confirmedBy: label, confirmedAt: iso,
  objects: z.array(objectMapping).min(1).max(20),
}).strict().refine(map => new Set(map.objects.map(object => object.sourceObject)).size === map.objects.length, 'Objeto de origen repetido en el mapa');

export type MigrationExport = z.infer<typeof migrationExport>;
export type MigrationMap = z.infer<typeof migrationMap>;
type ExportedRow = z.infer<typeof exportedRow>;
type ObjectMapping = z.infer<typeof objectMapping>;
type FieldMapping = z.infer<typeof fieldMapping>;
type Normalizer = z.infer<typeof normalizer>;
type Coverage = 'complete' | 'partial' | 'sample';

export class MigrationInputError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'MigrationInputError'; }
}

/* ───────────── utilidades puras ───────────── */

/** JSON canónico: claves ordenadas, sin espacios. Mismo contenido, mismos bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(item => canonicalJson(item === undefined ? null : item)).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** SHA-256 puro (sin node:crypto) para que el motor sea el mismo en servidor y navegador. Entrada: texto UTF-8. */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text), length = bytes.length, padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[length] = 0x80;
  const view = new DataView(padded.buffer); view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x1_0000_0000)); view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3), s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10); w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0, t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0; h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return [...h].map(word => word.toString(16).padStart(8, '0')).join('');
}

const formatters = new Map<string, Intl.DateTimeFormat>(), offsets = new Map<string, number>();
/** Desfase de la zona en minutos. Se calcula al inicio de cada tramo de 15 min (los cambios de hora caen en múltiplos de 15 min) y se guarda: formatear fechas es lo más caro del motor. */
function offsetMinutes(utcMs: number, zone: string): number {
  const bucket = Math.floor(utcMs / 900_000), key = zone + '|' + bucket, cached = offsets.get(key);
  if (cached !== undefined) return cached;
  if (offsets.size > 100_000) offsets.clear();
  const value = offsetAt(bucket * 900_000, zone); offsets.set(key, value); return value;
}
function offsetAt(utcMs: number, zone: string): number {
  let format = formatters.get(zone);
  if (!format) { format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); formatters.set(zone, format); }
  const parts = Object.fromEntries(format.formatToParts(new Date(Math.floor(utcMs / 1000) * 1000)).map(part => [part.type, part.value])) as Record<string, string>;
  return (Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(utcMs / 1000) * 1000) / 60_000;
}

export type Instant = { ok: true; ms: number } | { ok: false; reason: 'unparseable' | 'timezone-missing' | 'local-time-ambiguous' | 'local-time-nonexistent' };
const withZone = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;
const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
/** Convierte una fecha-hora a instante. Con zona explícita (Z, ±hh:mm) es exacta; sin ella usa `zone` y rechaza horas locales inexistentes o ambiguas; sin `zone`, no adivina. */
export function parseInstant(value: string, zone: string | null): Instant {
  const text = value.trim();
  const valid = (y: number, mo: number, d: number, h: number, mi: number, s: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate() && h <= 23 && mi <= 59 && s <= 59;
  const withOffset = withZone.exec(text);
  if (withOffset) {
    const [, y, mo, d, h, mi, s = '0'] = withOffset;
    if (!valid(+y!, +mo!, +d!, +h!, +mi!, +s)) return { ok: false, reason: 'unparseable' };
    const ms = Date.parse(text.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isFinite(ms) ? { ok: true, ms } : { ok: false, reason: 'unparseable' };
  }
  const local = naive.exec(text);
  if (!local) return { ok: false, reason: 'unparseable' };
  const [, y, mo, d, h, mi, s = '0'] = local;
  if (!valid(+y!, +mo!, +d!, +h!, +mi!, +s)) return { ok: false, reason: 'unparseable' };
  if (zone === null) return { ok: false, reason: 'timezone-missing' };
  const asUtc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s), found = new Set<number>();
  for (const probe of [asUtc - 86_400_000, asUtc, asUtc + 86_400_000]) {
    const offset = offsetMinutes(probe, zone), candidate = asUtc - offset * 60_000;
    if (offsetMinutes(candidate, zone) === offset) found.add(candidate);
  }
  if (found.size === 0) return { ok: false, reason: 'local-time-nonexistent' };
  if (found.size > 1) return { ok: false, reason: 'local-time-ambiguous' };
  return { ok: true, ms: [...found][0]! };
}

/** R2: todo acceso a datos por nombre exige propiedad PROPIA: `constructor`, `toString`… heredados de Object.prototype no son datos del objeto exportado ni traducciones del mapa. */
const hasOwn = (target: object, key: string) => Object.prototype.hasOwnProperty.call(target, key);
const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
function normalizeText(value: string | number | boolean, mode: Normalizer): string | null {
  const raw = String(value);
  if (mode === 'exact') return raw === '' ? null : raw;
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const out = mode === 'trim' ? trimmed : mode === 'digits' ? trimmed.replace(/\D+/g, '') : trimmed.toLowerCase();
  return out === '' ? null : out;
}
const valueOf = (row: ExportedRow, name: string): string | number | boolean | null | undefined => (name === '$id' ? row.id : hasOwn(row.values, name) ? row.values[name] : undefined);
/** R2: un día de calendario REAL (no basta con que Date.parse sea finito: normaliza 30 de febrero a marzo). Respeta años bisiestos y años de cuatro cifras. */
export function isCalendarDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text); if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]); if (month < 1 || month > 12 || day < 1) return false;
  const end = new Date(0); end.setUTCFullYear(year, month, 0);
  return day <= end.getUTCDate();
}

/* ───────────── resultado ───────────── */

export type FieldChange = { field: string; kind: 'different' | 'missing-in-target' | 'missing-in-source' | 'uncertain'; reason?: string; sourceValue?: string; targetValue?: string };
export type DoubtfulReason = 'multiple-candidates' | 'duplicate-source-key';
export type RelationState = 'ok' | 'broken' | 'inconclusive';
export interface RelationFinding { sourceObject: string; sourceId: string; sourceField: string; state: RelationState; reason: 'relation-missing' | 'relation-mismatch' | 'dangling-target-reference' | 'source-reference-missing' | 'dependency-unresolved' | 'target-reference-unverifiable' | null }
export interface ObjectComparison {
  sourceObject: string; targetObject: string;
  coverage: { source: Coverage; target: Coverage; sourceEffective: Coverage; targetEffective: Coverage; sourceRows: number; targetRows: number; sourceDeclared: number | null; targetDeclared: number | null };
  /** Todo registro del origen cae en EXACTAMENTE una de las siete primeras partidas; todo registro del destino, en una de las cinco últimas. */
  counts: { identical: number; changed: number; uncertain: number; absent: number; notFound: number; doubtful: number; missingKey: number; unmatchedTargetKeyless: number; extra: number; unverifiedExtra: number; doubtfulTargets: number; matchedTargets: number };
  findings: {
    changed: Array<{ sourceId: string; targetId: string; changes: FieldChange[] }>;
    uncertain: Array<{ sourceId: string; targetId: string; changes: FieldChange[] }>;
    absent: string[]; notFound: string[];
    doubtful: Array<{ sourceId: string; reason: DoubtfulReason; candidates: string[] }>;
    missingKey: string[];
    extra: string[]; unverifiedExtra: string[]; keylessTargets: string[];
  };
  relations: { total: number; ok: number; broken: number; inconclusive: number; findings: RelationFinding[] };
  fieldIssues: string[];
}
export interface MigrationComparison {
  format: typeof MIGRATION_COMPARISON_FORMAT;
  provenance: {
    source: { provider: string; accountId: string; exportedAt: string; timezone: string | null; sha256: string };
    target: { provider: string; accountId: string; exportedAt: string; timezone: string | null; sha256: string };
    map: { confirmedBy: string; confirmedAt: string; sha256: string };
  };
  objects: ObjectComparison[];
  verdict: 'no-differences-in-scope' | 'differences-found' | 'inconclusive';
  verdictReasons: string[];
  limits: string[];
}

export const MIGRATION_LIMITS = [
  'Solo se comparan los objetos, claves y campos del mapa confirmado por la persona; lo que no está en el mapa no se ha comprobado.',
  'Una exportación parcial o una muestra nunca acredita que la migración esté íntegra: «no encontrado» no equivale a «el proveedor no lo tiene».',
  'La correspondencia usa solo las claves del mapa. Un ID igual en dos proveedores no es una correspondencia.',
  'Los casos ambiguos se muestran con sus candidatos y no se resuelven automáticamente.',
  'La comparación no lee ningún proveedor: solo analiza las dos exportaciones aportadas, tal como llegaron.',
] as const;

/* ───────────── motor ───────────── */

export interface CompareOptions { includeValues?: boolean }

function effectiveCoverage(object: { coverage: Coverage; declaredTotal: number | null; rows: unknown[] }): Coverage {
  if (object.coverage !== 'complete') return object.coverage;
  return object.declaredTotal !== null && object.declaredTotal !== object.rows.length ? 'partial' : 'complete';
}
function keyOf(row: ExportedRow, parts: ObjectMapping['matchKey'], side: 'source' | 'target'): string | null {
  const values: string[] = [];
  for (const part of parts) {
    const raw = valueOf(row, part[side]);
    if (isEmpty(raw)) return null;
    const text = normalizeText(raw as string | number | boolean, part.normalize);
    if (text === null) return null;
    values.push(text);
  }
  return JSON.stringify(values);
}

function compareField(mapping: FieldMapping, source: ExportedRow, target: ExportedRow, sourceZone: string | null, targetZone: string | null, includeValues: boolean): FieldChange | null {
  if (!mapping.relevant) return null;
  const s = valueOf(source, mapping.source), t = valueOf(target, mapping.target), sEmpty = isEmpty(s), tEmpty = isEmpty(t);
  const shown = (value: unknown) => (includeValues && !isEmpty(value) ? String(value).slice(0, 80) : undefined);
  const make = (kind: FieldChange['kind'], reason?: string): FieldChange => ({ field: mapping.source + ' → ' + mapping.target, kind, ...(reason ? { reason } : {}), ...(includeValues ? { sourceValue: shown(s), targetValue: shown(t) } : {}) });
  if (sEmpty && tEmpty) return null;
  if (sEmpty) return mapping.required ? make('missing-in-source') : null;
  if (tEmpty) return mapping.required ? make('missing-in-target') : null;
  const sv = s as string | number | boolean, tv = t as string | number | boolean;
  let left: string = String(sv);
  if (mapping.valueMap) {
    if (!hasOwn(mapping.valueMap, left)) return make('uncertain', 'unmapped-value');
    left = mapping.valueMap[left]!;
  }
  switch (mapping.type) {
    case 'text': {
      const a = normalizeText(left, mapping.normalize), b = normalizeText(tv, mapping.normalize);
      return a === b ? null : make('different');
    }
    case 'number': {
      const parse = (value: string | number | boolean) => (typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);
      const a = parse(mapping.valueMap ? left : sv), b = parse(tv);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return make('uncertain', 'unparseable');
      return a === b ? null : make('different');
    }
    case 'boolean': {
      const parse = (value: string | number | boolean) => (typeof value === 'boolean' ? value : typeof value === 'string' && /^(true|false)$/i.test(value.trim()) ? value.trim().toLowerCase() === 'true' : null);
      const a = parse(mapping.valueMap ? left : sv), b = parse(tv);
      if (a === null || b === null) return make('uncertain', 'unparseable');
      return a === b ? null : make('different');
    }
    case 'date': {
      const a = left.trim(), b = typeof tv === 'string' ? tv.trim() : '';
      if (!isCalendarDay(a) || !isCalendarDay(b)) return make('uncertain', 'unparseable');
      return a === b ? null : make('different');
    }
    case 'datetime': {
      const a = parseInstant(left, sourceZone);
      const b = typeof tv === 'string' ? parseInstant(tv, targetZone) : ({ ok: false, reason: 'unparseable' } as const);
      if (!a.ok) return make('uncertain', a.reason);
      if (!b.ok) return make('uncertain', b.reason);
      return Math.abs(a.ms - b.ms) <= (mapping.toleranceSeconds ?? 0) * 1000 ? null : make('different');
    }
  }
}

/**
 * Compara dos exportaciones con un mapa confirmado. Puro y determinista: mismas entradas, mismo resultado. Las tres entradas se validan con su esquema y se lanza `MigrationInputError` si no son
 * coherentes (otro proveedor/cuenta que el mapa, objeto del mapa que no está en la exportación…).
 */
export function compareMigration(sourceInput: unknown, targetInput: unknown, mapInput: unknown, options: CompareOptions = {}): MigrationComparison {
  const parse = <T>(schema: z.ZodType<T>, input: unknown, code: string, name: string): T => {
    const result = schema.safeParse(input);
    if (!result.success) throw new MigrationInputError(code, name + ' no es válido: ' + result.error.issues.slice(0, 3).map(issue => issue.path.join('.') + ' ' + issue.message).join('; '));
    return result.data;
  };
  const source = parse(migrationExport, sourceInput, 'SOURCE_INVALID', 'La exportación de origen'), target = parse(migrationExport, targetInput, 'TARGET_INVALID', 'La exportación de destino'), map = parse(migrationMap, mapInput, 'MAP_INVALID', 'El mapa');
  if (map.sourceProvider !== source.provider || map.sourceAccountId !== source.accountId) throw new MigrationInputError('MAP_SOURCE_MISMATCH', 'El mapa no corresponde al proveedor y cuenta de la exportación de origen.');
  if (map.targetProvider !== target.provider || map.targetAccountId !== target.accountId) throw new MigrationInputError('MAP_TARGET_MISMATCH', 'El mapa no corresponde al proveedor y cuenta de la exportación de destino.');
  const includeValues = options.includeValues === true;
  const sourceObjects = new Map(source.objects.map(object => [object.objectType, object])), targetObjects = new Map(target.objects.map(object => [object.objectType, object]));
  for (const mapping of map.objects) {
    if (!sourceObjects.has(mapping.sourceObject)) throw new MigrationInputError('SOURCE_OBJECT_MISSING', 'El objeto de origen «' + mapping.sourceObject + '» del mapa no está en la exportación de origen.');
    if (!targetObjects.has(mapping.targetObject)) throw new MigrationInputError('TARGET_OBJECT_MISSING', 'El objeto de destino «' + mapping.targetObject + '» del mapa no está en la exportación de destino.');
  }
  const targetOf = new Map(map.objects.map(mapping => [mapping.sourceObject, mapping.targetObject]));
  // Pares emparejados de forma única, por objeto de origen: id de origen → id de destino. Los usa la fase de relaciones.
  const pairs = new Map<string, Map<string, string>>();

  const objects: ObjectComparison[] = map.objects.map(mapping => {
    const srcObject = sourceObjects.get(mapping.sourceObject)!, tgtObject = targetObjects.get(mapping.targetObject)!;
    const sourceEffective = effectiveCoverage(srcObject), targetEffective = effectiveCoverage(tgtObject);
    const fieldIssues: string[] = [];
    if (srcObject.coverage === 'complete' && sourceEffective !== 'complete') fieldIssues.push('El total declarado del origen (' + srcObject.declaredTotal + ') no coincide con las ' + srcObject.rows.length + ' filas recibidas: se trata como parcial.');
    if (tgtObject.coverage === 'complete' && targetEffective !== 'complete') fieldIssues.push('El total declarado del destino (' + tgtObject.declaredTotal + ') no coincide con las ' + tgtObject.rows.length + ' filas recibidas: se trata como parcial.');
    // Campos del mapa que NINGUNA fila de un lado tiene: se avisa una vez por objeto (el campo puede no haberse exportado).
    for (const field of mapping.fields) {
      if (field.source !== '$id' && !srcObject.rows.some(row => hasOwn(row.values, field.source)) && srcObject.rows.length > 0) fieldIssues.push('Ninguna fila del origen trae el campo «' + field.source + '».');
      if (field.target !== '$id' && !tgtObject.rows.some(row => hasOwn(row.values, field.target)) && tgtObject.rows.length > 0) fieldIssues.push('Ninguna fila del destino trae el campo «' + field.target + '».');
    }

    const targetByKey = new Map<string, ExportedRow[]>(), keylessTargets: string[] = [];
    for (const row of tgtObject.rows) { const key = keyOf(row, mapping.matchKey, 'target'); if (key === null) keylessTargets.push(row.id); else (targetByKey.get(key) ?? targetByKey.set(key, []).get(key)!).push(row); }
    const sourceByKey = new Map<string, ExportedRow[]>();
    for (const row of srcObject.rows) { const key = keyOf(row, mapping.matchKey, 'source'); if (key !== null) (sourceByKey.get(key) ?? sourceByKey.set(key, []).get(key)!).push(row); }

    const sortedSource = [...srcObject.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    type Tentative = { source: ExportedRow; key: string | null; candidates: ExportedRow[] };
    const tentative: Tentative[] = sortedSource.map(row => { const key = keyOf(row, mapping.matchKey, 'source'); return { source: row, key, candidates: key === null ? [] : targetByKey.get(key) ?? [] }; });

    const counts = { identical: 0, changed: 0, uncertain: 0, absent: 0, notFound: 0, doubtful: 0, missingKey: 0, unmatchedTargetKeyless: keylessTargets.length, extra: 0, unverifiedExtra: 0, doubtfulTargets: 0, matchedTargets: 0 };
    const findings: ObjectComparison['findings'] = { changed: [], uncertain: [], absent: [], notFound: [], doubtful: [], missingKey: [], extra: [], unverifiedExtra: [], keylessTargets };
    const matched = new Map<string, string>(), doubtfulTargetIds = new Set<string>();
    const doubt = (id: string, reason: DoubtfulReason, candidates: string[]) => { counts.doubtful++; findings.doubtful.push({ sourceId: id, reason, candidates }); for (const candidate of candidates) doubtfulTargetIds.add(candidate); };

    for (const item of tentative) {
      const id = item.source.id;
      if (item.key === null) { counts.missingKey++; findings.missingKey.push(id); continue; }
      if (sourceByKey.get(item.key)!.length > 1) { doubt(id, 'duplicate-source-key', item.candidates.map(row => row.id)); continue; }
      if (item.candidates.length === 0) {
        if (targetEffective === 'complete') { counts.absent++; findings.absent.push(id); } else { counts.notFound++; findings.notFound.push(id); }
        continue;
      }
      if (item.candidates.length > 1) { doubt(id, 'multiple-candidates', item.candidates.map(row => row.id)); continue; }
      const targetRow = item.candidates[0]!;
      matched.set(id, targetRow.id);
      const changes = mapping.fields.flatMap(field => { const change = compareField(field, item.source, targetRow, source.timezone, target.timezone, includeValues); return change ? [change] : []; });
      if (changes.length === 0) counts.identical++;
      else if (changes.every(change => change.kind === 'uncertain')) { counts.uncertain++; findings.uncertain.push({ sourceId: id, targetId: targetRow.id, changes }); }
      else { counts.changed++; findings.changed.push({ sourceId: id, targetId: targetRow.id, changes }); }
    }
    counts.matchedTargets = new Set(matched.values()).size;
    counts.doubtfulTargets = [...doubtfulTargetIds].filter(id => !new Set(matched.values()).has(id)).length;
    const claimed = new Set([...matched.values(), ...doubtfulTargetIds]);
    for (const row of [...tgtObject.rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (claimed.has(row.id) || keylessTargets.includes(row.id)) continue;
      if (sourceEffective === 'complete') { counts.extra++; findings.extra.push(row.id); } else { counts.unverifiedExtra++; findings.unverifiedExtra.push(row.id); }
    }
    pairs.set(mapping.sourceObject, matched);
    return {
      sourceObject: mapping.sourceObject, targetObject: mapping.targetObject,
      coverage: { source: srcObject.coverage, target: tgtObject.coverage, sourceEffective, targetEffective, sourceRows: srcObject.rows.length, targetRows: tgtObject.rows.length, sourceDeclared: srcObject.declaredTotal, targetDeclared: tgtObject.declaredTotal },
      counts, findings, relations: { total: 0, ok: 0, broken: 0, inconclusive: 0, findings: [] }, fieldIssues,
    };
  });

  // Relaciones: para cada par emparejado, la referencia del origen debe corresponder, en el destino, al registro emparejado con el referenciado.
  for (const mapping of map.objects) {
    const comparison = objects.find(object => object.sourceObject === mapping.sourceObject)!, srcObject = sourceObjects.get(mapping.sourceObject)!, tgtObject = targetObjects.get(mapping.targetObject)!;
    const matched = pairs.get(mapping.sourceObject)!, sourceRows = new Map(srcObject.rows.map(row => [row.id, row])), targetRows = new Map(tgtObject.rows.map(row => [row.id, row]));
    for (const relation of mapping.relations) {
      const referencedSource = sourceObjects.get(relation.sourceObject), referencedTarget = targetObjects.get(relation.targetObject), referencedPairs = pairs.get(relation.sourceObject);
      if (!referencedSource || !referencedTarget || !referencedPairs) throw new MigrationInputError('RELATION_OBJECT_MISSING', 'La relación «' + relation.sourceField + '» apunta a un objeto que no está mapeado.');
      if (targetOf.get(relation.sourceObject) !== relation.targetObject) throw new MigrationInputError('RELATION_OBJECT_MISMATCH', 'La relación «' + relation.sourceField + '» enlaza objetos que el mapa no empareja entre sí.');
      const referencedSourceRows = new Map(referencedSource.rows.map(row => [row.id, row])), targetCoverage = effectiveCoverage(referencedTarget);
      for (const [sourceId, targetId] of [...matched].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const sourceRow = sourceRows.get(sourceId)!, targetRow = targetRows.get(targetId)!, reference = valueOf(sourceRow, relation.sourceField);
        if (isEmpty(reference)) continue;
        comparison.relations.total++;
        const push = (state: RelationState, reason: RelationFinding['reason']) => { comparison.relations[state === 'ok' ? 'ok' : state]++; if (state !== 'ok') comparison.relations.findings.push({ sourceObject: mapping.sourceObject, sourceId, sourceField: relation.sourceField, state, reason }); };
        if (!referencedSourceRows.has(String(reference))) { push('inconclusive', 'source-reference-missing'); continue; }
        const expected = referencedPairs.get(String(reference));
        if (expected === undefined) { push('inconclusive', 'dependency-unresolved'); continue; }
        const actual = valueOf(targetRow, relation.targetField);
        if (isEmpty(actual)) { push('broken', 'relation-missing'); continue; }
        if (String(actual) === expected) { push('ok', null); continue; }
        const exists = referencedTarget.rows.some(row => row.id === String(actual));
        if (exists) push('broken', 'relation-mismatch');
        else if (targetCoverage === 'complete') push('broken', 'dangling-target-reference');
        else push('inconclusive', 'target-reference-unverifiable');
      }
    }
  }

  const reasons: string[] = [];
  const partialObjects = objects.filter(object => object.coverage.sourceEffective !== 'complete' || object.coverage.targetEffective !== 'complete');
  if (partialObjects.length) reasons.push('Exportación parcial o muestra en: ' + partialObjects.map(object => object.sourceObject).join(', ') + '.');
  const sum = (pick: (o: ObjectComparison) => number) => objects.reduce((total, object) => total + pick(object), 0);
  const differences = sum(o => o.counts.absent + o.counts.extra + o.counts.changed + o.relations.broken);
  const inconclusive = sum(o => o.counts.uncertain + o.counts.notFound + o.counts.unverifiedExtra + o.counts.doubtful + o.counts.missingKey + o.counts.unmatchedTargetKeyless + o.counts.doubtfulTargets + o.relations.inconclusive + o.fieldIssues.length);
  if (inconclusive) reasons.push('Hay ' + inconclusive + ' elemento(s) sin concluir o dudosos.');
  const verdict: MigrationComparison['verdict'] = partialObjects.length ? (differences ? 'differences-found' : 'inconclusive') : differences ? 'differences-found' : inconclusive ? 'inconclusive' : 'no-differences-in-scope';
  if (differences) reasons.push('Hay ' + differences + ' diferencia(s) confirmada(s).');
  return {
    format: MIGRATION_COMPARISON_FORMAT,
    provenance: {
      source: { provider: source.provider, accountId: source.accountId, exportedAt: source.exportedAt, timezone: source.timezone, sha256: sha256Hex(canonicalJson(source)) },
      target: { provider: target.provider, accountId: target.accountId, exportedAt: target.exportedAt, timezone: target.timezone, sha256: sha256Hex(canonicalJson(target)) },
      map: { confirmedBy: map.confirmedBy, confirmedAt: map.confirmedAt, sha256: sha256Hex(canonicalJson(map)) },
    },
    objects, verdict, verdictReasons: reasons, limits: [...MIGRATION_LIMITS],
  };
}

/** Comprueba que los contadores de cada objeto suman exactamente las filas de entrada. Lo usa el informe y las pruebas. */
export function countersAddUp(comparison: MigrationComparison): boolean {
  return comparison.objects.every(object => {
    const c = object.counts, s = c.identical + c.changed + c.uncertain + c.absent + c.notFound + c.doubtful + c.missingKey;
    const t = c.matchedTargets + c.extra + c.unverifiedExtra + c.doubtfulTargets + c.unmatchedTargetKeyless;
    return s === object.coverage.sourceRows && t === object.coverage.targetRows;
  });
}
