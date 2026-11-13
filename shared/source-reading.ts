import { z } from 'zod';
import { commitmentId, commitmentRoles, sourceObservation, type CommitmentObservation } from './commitments.js';

// MODELO NEUTRO DE LECTURA DE UNA FUENTE EXTERNA (unidad Claude B · CLAUDE-SOURCE-ZENDESK). Un adaptador (Zendesk, Pipedrive…) lee un proveedor SOLO EN LECTURA y devuelve una `SourceReading`:
// los registros normalizados y, sobre todo, cuánto de la fuente se ha visto de verdad. De ahí sale, con una proyección pura, la observación del contrato aceptado `shared/commitments.ts`
// (que no se toca aquí). Reglas que este módulo impone, con independencia del proveedor:
//   · `complete` SOLO si se llegó al final de la paginación y no se omitió nada. Una página vacía, un fin sin indicador explícito, un presupuesto agotado, un fallo tardío o una respuesta
//     truncada NUNCA dan `complete`. «Sin registros» no es «el proveedor no lo tiene» salvo lectura completa.
//   · `unavailable` no lleva registros (no se sabe nada), y su observación no lleva condición (como exige el contrato).
//   · Un adaptador nunca vincula: no hay enlaces por igualdad de ID ni de nombre. Las observaciones tienen solo la referencia (proveedor, cuenta, rol, ID remoto) del propio registro.
//   · `observedAt` de la observación es el instante en que TERMINÓ la lectura (no la fecha de edición del registro): así el Radar envejece la evidencia con su reloj.
export const SOURCE_READING_FORMAT = 'planb-source-reading-v1' as const;
export const MAX_READING_RECORDS = 500;

/** Por qué se detuvo (o no pudo empezar) una lectura. Las cuatro últimas no son fallos de red: son límites propios del lector. */
export const sourceStops = [
  'unauthorized', 'forbidden', 'not-found', 'rate-limited', 'timeout', 'aborted', 'truncated', 'oversize', 'server-error', 'client-error', 'network', 'blocked', 'malformed', 'redirect', 'budget',
  'page-budget', 'record-budget', 'cursor-loop', 'missing-pagination', 'unsupported-value',
] as const;
export type SourceStop = (typeof sourceStops)[number];

const iso = z.iso.datetime();
const label = z.string().trim().min(1).max(160);
const objectType = z.string().regex(/^[a-z][a-z-]{0,39}$/);
const condition = z.enum(['clear', 'blocked', 'completed']);

export const sourceRecord = z.object({
  provider: commitmentId,
  accountId: label,
  objectType,
  remoteId: label,
  /** Rol del Radar al que puede aportar evidencia, o null si es un objeto de contexto (persona, organización…) que no se proyecta. */
  kind: z.enum(commitmentRoles).nullable(),
  condition: condition.nullable(),
  /** Última modificación según el proveedor; no es el instante de lectura. */
  updatedAt: iso.nullable(),
  label,
  /** Referencia externa que el propio proveedor guarda (p. ej. `external_id`). Se conserva como dato: NUNCA se usa aquí para vincular. */
  externalRef: z.string().max(120).nullable(),
  related: z.array(z.object({ objectType, remoteId: label }).strict()).max(6),
}).strict().refine(record => (record.kind === null) === (record.condition === null), 'El rol y la condición van juntos');

export const sourceReading = z.object({
  format: z.literal(SOURCE_READING_FORMAT),
  provider: commitmentId,
  accountId: label,
  objectType,
  mode: z.enum(['listing', 'lookup']),
  /** Solo en consultas por ID: el objeto que se buscaba (permite una observación «no disponible» sin registro). */
  target: z.object({ kind: z.enum(commitmentRoles), remoteId: label }).strict().nullable(),
  startedAt: iso,
  completedAt: iso,
  coverage: z.enum(['complete', 'partial', 'unavailable']),
  stoppedBy: z.enum(sourceStops).nullable(),
  pages: z.number().int().min(0).max(100),
  requests: z.number().int().min(0).max(100),
  records: z.array(sourceRecord).max(MAX_READING_RECORDS),
  skipped: z.object({ unknownValue: z.number().int().min(0), malformed: z.number().int().min(0), duplicates: z.number().int().min(0) }).strict(),
  retryAfterSeconds: z.number().int().min(0).max(3600).nullable(),
}).strict().superRefine((reading, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  const skipped = reading.skipped.unknownValue + reading.skipped.malformed + reading.skipped.duplicates;
  if (Date.parse(reading.completedAt) < Date.parse(reading.startedAt)) bad('La lectura termina antes de empezar');
  if (reading.coverage === 'complete') {
    if (reading.stoppedBy !== null || skipped > 0) bad('Una lectura completa no se detuvo ni omitió nada');
    if (reading.pages < 1) bad('Una lectura completa leyó al menos una página');
    if (reading.mode === 'lookup' && reading.records.length !== 1) bad('Una consulta por ID completa devuelve exactamente un registro');
  }
  if (reading.coverage === 'unavailable' && reading.records.length > 0) bad('Una lectura no disponible no trae registros');
  if (reading.coverage !== 'complete' && reading.stoppedBy === null && skipped === 0) bad('Una lectura incompleta explica por qué');
  if (reading.mode === 'lookup' && (reading.target === null || reading.records.length > 1)) bad('Una consulta por ID tiene objetivo y a lo sumo un registro');
  if (reading.mode === 'listing' && reading.target !== null) bad('Un listado no tiene objetivo');
  const keys = reading.records.map(record => JSON.stringify([record.provider, record.accountId, record.objectType, record.remoteId]));
  if (new Set(keys).size !== keys.length) bad('Registro repetido');
  if (reading.records.some(record => record.provider !== reading.provider || record.accountId !== reading.accountId)) bad('Un registro de otra cuenta en la misma lectura');
  // Coherencia de identidad (R2): cada registro tiene el tipo de la lectura y, en una consulta por ID, el MISMO ID y rol que el objetivo. Un registro ajeno no puede convertirse en una observación del objetivo.
  if (reading.records.some(record => record.objectType !== reading.objectType)) bad('Un registro de otro tipo de objeto en la misma lectura');
  if (reading.mode === 'lookup' && reading.target && reading.records.some(record => record.remoteId !== reading.target!.remoteId)) bad('El registro de una consulta por ID no es el objetivo');
  if (reading.mode === 'lookup' && reading.target && reading.records.some(record => record.kind !== reading.target!.kind)) bad('El rol del registro de una consulta por ID no es el del objetivo');
});

export type SourceRecord = z.infer<typeof sourceRecord>;
export type SourceReading = z.infer<typeof sourceReading>;

const stopText: Record<SourceStop, string> = {
  unauthorized: 'acceso perdido', forbidden: 'permisos insuficientes', 'not-found': 'no encontrado', 'rate-limited': 'límite de peticiones', timeout: 'sin respuesta a tiempo', aborted: 'lectura cancelada',
  truncated: 'respuesta truncada', oversize: 'respuesta demasiado grande', 'server-error': 'error del proveedor', 'client-error': 'petición rechazada', network: 'sin conexión', blocked: 'petición no permitida',
  malformed: 'respuesta ilegible', redirect: 'redirección no seguida', budget: 'presupuesto de peticiones agotado', 'page-budget': 'páginas sin leer', 'record-budget': 'registros sin leer',
  'cursor-loop': 'paginación incoherente', 'missing-pagination': 'paginación sin indicador de fin', 'unsupported-value': 'valor no reconocido',
};
export const describeStop = (stop: SourceStop | null) => (stop ? stopText[stop] : 'completa');

/**
 * Proyección PURA al contrato del Radar. Un registro con rol aporta una observación con la cobertura de la lectura (completa o parcial); una consulta por ID no disponible aporta una observación
 * «no disponible» sin condición. Los registros sin rol (personas, organizaciones…) y los listados no disponibles no aportan nada: de lo que no se sabe no se afirma nada. Cada observación pasa por
 * el esquema del contrato antes de devolverse.
 */
export function readingObservations(input: SourceReading): CommitmentObservation[] {
  const reading = sourceReading.parse(input);
  if (reading.coverage === 'unavailable') {
    if (!reading.target) return [];
    return [sourceObservation.parse({
      reference: { provider: reading.provider, accountId: reading.accountId, kind: reading.target.kind, remoteId: reading.target.remoteId },
      observedAt: reading.completedAt, coverage: 'unavailable', condition: null, label: ('Lectura no disponible · ' + describeStop(reading.stoppedBy)).slice(0, 160),
    })];
  }
  const coverage = reading.coverage === 'complete' ? 'complete' : 'partial';
  return reading.records.flatMap(record => record.kind === null || record.condition === null ? [] : [sourceObservation.parse({
    reference: { provider: record.provider, accountId: record.accountId, kind: record.kind, remoteId: record.remoteId },
    observedAt: reading.completedAt, coverage, condition: record.condition, label: record.label,
  })]);
}

/** ¿La lectura sigue siendo reciente para el instante `now`? Una lectura del futuro (reloj atrasado) tampoco se acepta. */
export function isReadingFresh(reading: Pick<SourceReading, 'completedAt'>, now: number, maxAgeMs = 24 * 60 * 60_000): boolean {
  const age = now - Date.parse(reading.completedAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

/** Limpia texto procedente del proveedor antes de ponerlo en una etiqueta: sin controles, sin saltos, espacios normalizados, recortado. */
export function cleanLabelText(value: string, max = 80): string {
  const text = value.replace(new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+', 'g'), ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
