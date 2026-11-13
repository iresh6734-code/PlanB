import { z } from 'zod';
import { READ_CHECK_ENTITIES, READ_CHECK_TTL_MS } from './hubspot-read-check.js';

// Contrato PÚBLICO de la API de comprobación de lectura de HubSpot (unidad 212). Es lo único que sale del servidor hacia la interfaz:
// lista blanca estricta, sin credencial, sin cabeceras, sin cuerpos de registros y sin mensajes de excepción del proveedor.
// Una respuesta con campos de más no pasa el parser: un campo nuevo debe aceptarse a la vez que se muestra.
export const READ_CHECK_ROUTE = '/api/v2/connection/read-check';
export const READ_CHECK_API_FORMAT = 'planb-hubspot-read-check-api-v1';
/** Lecturas que la persona autoriza con «Comprobar lectura»: 1 identidad + 4 objetos de un elemento. Nunca escribe. */
export const READ_CHECK_AUTHORIZED_READS = 5;

export const READ_CHECK_ISSUES = [
  'NOT_CONFIGURED',             // no hay credencial guardada: sin tráfico
  'PORTAL_MISMATCH',            // la persona autorizó otro portal distinto del configurado ahora: sin tráfico
  'PRODUCTION_NOT_AUTHORIZED',  // la conexión es de producción y esta API solo comprueba cuentas de ensayo: sin tráfico
  'CONFIG_UNREADABLE',          // no se pudo leer la configuración guardada: sin tráfico
  'CONFIG_CHANGED',             // la configuración cambió durante la comprobación: el resultado se descartó
  'ORIGIN_REQUIRED',            // la acción debe venir de esta misma aplicación
  'INVALID_REQUEST',            // cuerpo o parámetros no válidos
  'ALREADY_RUNNING',            // ya hay una comprobación en curso para esta configuración: no se inició otra
  'CANCELLED',                  // la persona canceló: el resultado se descartó
  'EVIDENCE_UNREADABLE',        // la evidencia guardada no se pudo leer o no cumple el formato
  'EVIDENCE_INCONSISTENT',      // la evidencia guardada es legible pero no es coherente con la configuración, el recorrido o el reloj: no se acredita
] as const;
export type ReadCheckIssue = typeof READ_CHECK_ISSUES[number];

const iso = z.string().datetime();
const ObjectResultSchema = z.object({
  entity: z.enum(READ_CHECK_ENTITIES), outcome: z.enum(['readable', 'forbidden', 'rejected', 'unavailable', 'malformed', 'not_attempted']), httpStatus: z.number().int().min(100).max(599).nullable(),
}).strict();
export const ReadCheckEvidenceSchema = z.object({
  checkedAt: iso, freshUntil: iso,
  state: z.enum(['read_verified', 'partial', 'rejected', 'insufficient_permissions', 'unavailable', 'identity_mismatch', 'account_type_mismatch']),
  environment: z.enum(['rehearsal', 'real', 'unknown']), accountType: z.string().regex(/^[A-Z_]{3,40}$/).nullable(), portalId: z.string().regex(/^\d{1,20}$/).nullable(),
  objects: z.array(ObjectResultSchema).max(4),
  retryAfterSeconds: z.number().int().min(1).max(3600).nullable(),
  /** GET realizados, respuestas que superaron el tope, peticiones bloqueadas por el transporte y duración total de la comprobación. */
  requests: z.number().int().min(0).max(5), truncated: z.number().int().min(0).max(5), blocked: z.number().int().min(0).max(32), durationMs: z.number().int().min(0).max(600_000),
  message: z.string().max(400),
}).strict();
export type ReadCheckEvidence = z.infer<typeof ReadCheckEvidenceSchema>;

const ViewSchema = z.object({
  state: z.enum(['not_configured', 'saved_unchecked', 'checking', 'read_verified', 'partial', 'rejected', 'insufficient_permissions', 'unavailable', 'identity_mismatch', 'account_type_mismatch']),
  fresh: z.boolean(), label: z.string().max(200), detail: z.string().max(500), environment: z.enum(['rehearsal', 'real', 'unknown']), checkedAt: iso.nullable(),
}).strict();

export const ReadCheckApiStateSchema = z.object({
  format: z.literal(READ_CHECK_API_FORMAT),
  configured: z.boolean(),
  /** Portal de la configuración guardada AHORA (no es un secreto). `mode` es el de la conexión, no el de ninguna comprobación. */
  portal: z.object({ id: z.string().regex(/^\d{1,20}$/), mode: z.enum(['rehearsal', 'production']) }).strict().nullable(),
  consent: z.object({ reads: z.literal(READ_CHECK_AUTHORIZED_READS), writes: z.literal(0), freshnessMinutes: z.literal(READ_CHECK_TTL_MS / 60_000), allowed: z.boolean(), reason: z.string().max(300).nullable() }).strict(),
  running: z.object({ since: iso }).strict().nullable(),
  /** Lo que se muestra AHORA (`viewOfReadCheck`): una evidencia caducada o de otra configuración nunca se presenta como acceso actual. */
  view: ViewSchema,
  /** La última comprobación de ESTA configuración (puede estar caducada: entonces conserva su fecha y alcance, pero `view.fresh` es false). */
  evidence: ReadCheckEvidenceSchema.nullable(),
  /** Una comprobación guardada para una configuración anterior (otro portal o credencial). Es historia: no acredita nada de la configuración actual. */
  invalidated: z.object({ checkedAt: iso, portalId: z.string().regex(/^\d{1,20}$/).nullable(), state: ReadCheckEvidenceSchema.shape.state }).strict().nullable(),
  issue: z.enum(READ_CHECK_ISSUES).nullable(), message: z.string().max(400).nullable(),
  /** Solo en la respuesta de POST: false si ya había una comprobación en curso y NO se hizo ninguna lectura nueva. */
  started: z.boolean().optional(),
}).strict();
export type ReadCheckApiState = z.infer<typeof ReadCheckApiStateSchema>;

/** Cuerpo de POST: la persona confirma el portal exacto y las cinco lecturas. Cualquier otro campo se rechaza. */
export const ReadCheckPostBodySchema = z.object({ portalId: z.string().regex(/^\d{1,20}$/), authorizedReads: z.literal(READ_CHECK_AUTHORIZED_READS) }).strict();
export type ReadCheckPostBody = z.infer<typeof ReadCheckPostBodySchema>;

/** Parser estricto para el cliente: `null` si la respuesta no cumple el contrato (la interfaz debe tratarlo como «no disponible», nunca como éxito). */
export function parseReadCheckApiState(raw: unknown): ReadCheckApiState | null {
  const parsed = ReadCheckApiStateSchema.safeParse(raw); return parsed.success ? parsed.data : null;
}
export const READ_CHECK_ISSUE_MESSAGES: Record<ReadCheckIssue, string> = {
  NOT_CONFIGURED: 'No hay una credencial de HubSpot guardada. No se ha consultado al proveedor.',
  PORTAL_MISMATCH: 'El portal autorizado no coincide con el configurado ahora. No se ha consultado al proveedor; revisa la configuración y vuelve a confirmar.',
  PRODUCTION_NOT_AUTHORIZED: 'Esta comprobación solo está autorizada para cuentas de ensayo. No se ha consultado al proveedor.',
  CONFIG_UNREADABLE: 'No se pudo leer la configuración guardada. No se ha consultado al proveedor.',
  CONFIG_CHANGED: 'La configuración cambió mientras se comprobaba: el resultado se descartó y no acredita la configuración nueva.',
  ORIGIN_REQUIRED: 'La comprobación solo se inicia desde esta aplicación.',
  INVALID_REQUEST: 'La petición no es válida: confirma el portal y las cinco lecturas.',
  ALREADY_RUNNING: 'Ya hay una comprobación en curso para esta configuración: no se ha iniciado otra ni se ha repetido ninguna lectura.',
  CANCELLED: 'La comprobación se canceló: el resultado se descartó.',
  EVIDENCE_UNREADABLE: 'No se pudo leer la última comprobación guardada.',
  EVIDENCE_INCONSISTENT: 'La última comprobación guardada no es coherente con la configuración actual o con la fecha: no se acredita.',
};
