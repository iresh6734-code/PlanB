import { z } from 'zod';
import type { RelayRehearsalRecord } from './continuity-passport.js';

// Contrato del ENSAYO DE RELEVO desde el recorrido (unidad 216). Puente entre el Kit 116/QA136 (aceptados) y el pasaporte: un registro estricto de lo OBSERVADO en un ensayo con ficción.
// Alcance fijo: mismo equipo, datos ficticios, carpeta y proceso nuevos. NO acredita otro ordenador, HubSpot real, RTO/RPO ni autoría. El texto no contiene rutas, contraseñas ni errores crudos.
export const RELAY_REHEARSAL_FORMAT = 'planb-relay-rehearsal-v1';
export const RELAY_REHEARSAL_ROUTE = '/api/v2/relay/rehearsal';
/** Qué viaja en la cápsula (sus cuatro componentes) y qué NO se hereda: política del Kit, no un recuento de intentos en memoria. */
export const RELAY_INCLUDED = ['copia local y su historial de cambios', 'estado y diario del incidente', 'plan de devolución con la operación incierta conservada como incierta', 'estado del CRM simulado'] as const;
export const RELAY_NOT_INHERITED = ['la aprobación ejecutable del origen (se retira: hay que revisar y aprobar de nuevo)', 'el fallo de acuse armado en el simulador (el destino lo desarma)', 'los intentos de guardado de tareas que solo viven en memoria (no viajan en la cápsula)'] as const;
export const RELAY_NOT_PROVEN = ['Traslado a otro ordenador', 'Comportamiento con HubSpot real', 'Tiempo de recuperación (RTO/RPO)', 'Autoría de la cápsula'] as const;

/** Lo que el ejecutor del Kit devuelve (subconjunto de `rehearse()` de 116). */
export interface RehearsalResultLike { ok: boolean; wrongIdRejected: boolean; createCalls: number; duplicates: number; records: number; finalStage: string; capsule: { bytes: number; sha256: string }; ms: { export: number; import: number } }

const iso = z.string().datetime();
export const RelayRehearsalStoredSchema = z.object({
  format: z.literal(RELAY_REHEARSAL_FORMAT),
  rehearsedAt: iso,
  outcome: z.enum(['completed', 'failed', 'interrupted']),
  scope: z.object({ computer: z.literal('same'), data: z.literal('fiction'), destination: z.literal('new-folder-and-process') }).strict(),
  destinationOpened: z.boolean(), wrongIdRejected: z.boolean(), reconciledOnce: z.boolean(),
  createCalls: z.number().int().min(0).max(1000), duplicates: z.number().int().min(0).max(1000), finalStage: z.string().regex(/^[a-z-]{1,40}$/).nullable(),
  capsule: z.object({ bytes: z.number().int().min(0), sha16: z.string().regex(/^[0-9a-f]{16}$/) }).strict().nullable(),
  durationMs: z.object({ export: z.number().int().min(0).max(3_600_000), import: z.number().int().min(0).max(3_600_000) }).strict().nullable(),
  included: z.array(z.string().max(200)).max(12), notInherited: z.array(z.string().max(200)).max(12), notProven: z.array(z.string().max(200)).max(12),
}).strict();
export type RelayRehearsalStored = z.infer<typeof RelayRehearsalStoredSchema>;

/**
 * Coherencia SEMÁNTICA: «completado» exige destino abierto, ID equivocado rechazado, UN solo create, cero duplicados y retorno verificado; un fallo o una interrupción
 * nunca pueden declarar conciliación ni destino verificado. `null` = coherente.
 */
export function inspectRelayRecord(record: RelayRehearsalStored, now: number): string | null {
  const at = Date.parse(record.rehearsedAt); if (!Number.isFinite(at) || at > now) return 'fecha';
  const clean = record.createCalls === 1 && record.duplicates === 0 && record.finalStage === 'return-verified';
  if (record.outcome === 'completed') return record.destinationOpened && record.wrongIdRejected && record.reconciledOnce && clean && !!record.capsule && !!record.durationMs ? null : 'completado-sin-pruebas';
  if (record.reconciledOnce && !clean) return 'conciliacion-sin-create-unico';
  if (record.outcome === 'interrupted' && (record.reconciledOnce || record.finalStage === 'return-verified')) return 'interrumpido-con-exito';
  return null;
}

/** Construye el registro a partir del resultado REAL del Kit (o de su fallo). Nunca copia mensajes de error. */
export function recordFromRehearsal(input: { now: number; result: RehearsalResultLike | null; interrupted?: boolean }): RelayRehearsalStored {
  const r = input.result, base = { format: RELAY_REHEARSAL_FORMAT as typeof RELAY_REHEARSAL_FORMAT, rehearsedAt: new Date(input.now).toISOString(), scope: { computer: 'same', data: 'fiction', destination: 'new-folder-and-process' } as const, included: [...RELAY_INCLUDED], notInherited: [...RELAY_NOT_INHERITED], notProven: [...RELAY_NOT_PROVEN] };
  if (!r) return { ...base, outcome: input.interrupted ? 'interrupted' : 'failed', destinationOpened: false, wrongIdRejected: false, reconciledOnce: false, createCalls: 0, duplicates: 0, finalStage: null, capsule: null, durationMs: null };
  const clean = r.createCalls === 1 && r.duplicates === 0 && r.finalStage === 'return-verified';
  return { ...base, outcome: r.ok && clean && r.wrongIdRejected ? 'completed' : 'failed', destinationOpened: true, wrongIdRejected: r.wrongIdRejected, reconciledOnce: r.ok && clean,
    createCalls: Math.max(0, Math.min(1000, Math.round(r.createCalls))), duplicates: Math.max(0, Math.min(1000, Math.round(r.duplicates))), finalStage: /^[a-z-]{1,40}$/.test(r.finalStage) ? r.finalStage : null,
    capsule: { bytes: Math.max(0, Math.round(r.capsule.bytes)), sha16: r.capsule.sha256.slice(0, 16) }, durationMs: { export: Math.max(0, Math.round(r.ms.export)), import: Math.max(0, Math.round(r.ms.import)) } };
}
/** Forma que consume el pasaporte (`RelayRehearsalRecord`): el ensayo es con ficción, no con una captura concreta de la copia activa. */
export const toPassportRecord = (record: RelayRehearsalStored): RelayRehearsalRecord => ({ rehearsedAt: record.rehearsedAt, captureId: null, scope: 'fiction', outcome: record.outcome, destinationOpened: record.destinationOpened, wrongIdRejected: record.wrongIdRejected, reconciledOnce: record.reconciledOnce, included: [...record.included], notInherited: [...record.notInherited] });

// ── Contrato público de la API ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const RELAY_ISSUES = ['ORIGIN_REQUIRED', 'INVALID_REQUEST', 'ALREADY_RUNNING', 'STOPPING', 'CANCELLED', 'RECORD_UNREADABLE', 'RECORD_INCONSISTENT', 'RUN_FAILED'] as const;
export type RelayIssue = typeof RELAY_ISSUES[number];
export const RELAY_ISSUE_MESSAGES: Record<RelayIssue, string> = {
  ORIGIN_REQUIRED: 'El ensayo solo se inicia desde esta aplicación.', INVALID_REQUEST: 'Confirma que es un ensayo con datos ficticios.',
  ALREADY_RUNNING: 'Ya hay un ensayo en curso: no se ha iniciado otro.', STOPPING: 'El ensayo anterior todavía se está deteniendo: espera a que termine antes de iniciar otro.', CANCELLED: 'Se pidió cancelar: el resultado de ese ensayo se descartó. El proceso puede tardar unos segundos en cerrarse del todo.',
  RECORD_UNREADABLE: 'No se pudo leer el último ensayo guardado.', RECORD_INCONSISTENT: 'El último ensayo guardado no es coherente: no se acredita.', RUN_FAILED: 'El ensayo no pudo completarse.',
};
export const RelayRehearsalApiStateSchema = z.object({
  format: z.literal('planb-relay-rehearsal-api-v1'),
  /** Último ensayo guardado (nunca ejecuta nada al consultarlo). */
  last: RelayRehearsalStoredSchema.nullable(), running: z.object({ since: iso }).strict().nullable(),
  /** Ya se pidió detener la ejecución (cancelación, sesión revocada, cierre o tiempo agotado) pero el trabajo físico sigue terminando: no se admite otro ensayo hasta que acabe. */
  stopping: z.object({ since: iso, reason: z.enum(['cancelled', 'revoked', 'closing', 'timeout']) }).strict().nullable().optional(),
  /** Qué es y qué no es un ensayo: siempre presente, para que la interfaz no lo presente como exportación del espacio activo. */
  scope: z.object({ fiction: z.literal(true), exportsActiveSpace: z.literal(false), notProven: z.array(z.string()).max(12) }).strict(),
  issue: z.enum(RELAY_ISSUES).nullable(), message: z.string().max(300).nullable(), started: z.boolean().optional(),
}).strict();
export type RelayRehearsalApiState = z.infer<typeof RelayRehearsalApiStateSchema>;
export const RelayRehearsalPostBodySchema = z.object({ fiction: z.literal(true) }).strict();
export const parseRelayRehearsalState = (raw: unknown): RelayRehearsalApiState | null => { const p = RelayRehearsalApiStateSchema.safeParse(raw); return p.success ? p.data : null; };
