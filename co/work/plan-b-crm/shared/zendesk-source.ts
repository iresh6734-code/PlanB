import { cleanLabelText, type SourceRecord } from './source-reading.js';

// ADAPTACIÓN PURA DE TICKETS DE ZENDESK (unidad Claude B · CLAUDE-SOURCE-ZENDESK). Sin red ni reloj: convierte lo que Zendesk devuelve en `SourceRecord` y decide qué se omite. Fuente: documentación
// oficial de Zendesk consultada el 8/11/2026 (Tickets, Pagination, Rate limits, Security and auth, Incremental exports). Lo que NO pudo confirmarse en esas páginas está en `ZENDESK_UNCONFIRMED`
// y se resuelve en el ensayo real, no aquí.
//
// Política de condición (explícita, configurable):
//   solved · closed                 → completed   (el ticket se resolvió; no prueba que el compromiso del cliente se cumpla)
//   hold  (política por defecto)    → blocked     (Zendesk: «en espera de un tercero»)
//   new · open · pending            → clear       (hay actividad y NO se observa bloqueo: no es «todo bien»)
//   cualquier otro estado           → se OMITE y se cuenta como valor desconocido (la lectura queda parcial): un estado futuro o personalizado no se interpreta como sano.
// La etiqueta lleva estado, prioridad conocida e ID; NO copia el asunto del ticket (puede contener datos personales) salvo `includeSubject`, y entonces limpio y recortado.
export const ZENDESK_KIND = 'support' as const;
export const ZENDESK_STATUSES = ['new', 'open', 'pending', 'hold', 'solved', 'closed'] as const;
export type ZendeskStatus = (typeof ZENDESK_STATUSES)[number];
const statusText: Record<ZendeskStatus, string> = { new: 'nuevo', open: 'abierto', pending: 'pendiente', hold: 'en espera', solved: 'resuelto', closed: 'cerrado' };
const priorityText: Record<string, string> = { urgent: 'urgente', high: 'alta', normal: 'normal', low: 'baja' };

export interface ZendeskPolicy { blockedStatuses: readonly ZendeskStatus[]; includeSubject: boolean }
export const defaultZendeskPolicy: ZendeskPolicy = { blockedStatuses: ['hold'], includeSubject: false };

/** Lo que la documentación consultada no permite afirmar. Cada punto queda pendiente de un ensayo real con una cuenta propia y autorizada. */
export const ZENDESK_UNCONFIRMED = [
  'La guía de migración OAuth documenta el alcance `tickets:read` (https://developer.zendesk.com/documentation/authentication/oauth-migration/): su existencia está en la documentación, pero qué concede una cuenta concreta y si basta para listar y consultar tickets NO se ha ensayado.',
  'Las claves de API figuran como obsoletas en la documentación de seguridad y autenticación (https://developer.zendesk.com/api-reference/introduction/security-and-auth/); no se afirma que todas hayan dejado de funcionar. Este adaptador solo admite OAuth Bearer.',
  'El `accountId` de una lectura live es el subdominio CONFIGURADO por quien monta el lector, no una identidad de cuenta comprobada con una respuesta del proveedor.',
  'Cuerpos y condiciones exactas de 401, 403 y 404 (aquí solo se usa el código de estado).',
  'Anulabilidad de los campos del ticket más allá de due_at.',
  'Comportamiento de un ticket borrado o archivado al consultarlo por ID.',
  'Hosts distintos de {subdominio}.zendesk.com.',
  'Alfabeto exacto de los cursores (se aceptan solo A-Z a-z 0-9 + / = _ - hasta 512 caracteres; uno distinto se rechaza como respuesta ilegible).',
  'Límite exacto por minuto de GET /api/v2/tickets (la documentación muestra 100 y 50 en tablas distintas): se respeta Retry-After y no se reintenta.',
] as const;

/** Límites que se declaran siempre junto a una lectura, aunque salga completa. */
export const ZENDESK_READ_LIMITS = [
  '«Completa» significa que se recorrieron todas las páginas visibles con la credencial: no es una captura atómica (los tickets pueden cambiar durante la paginación, https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/) ni el inventario íntegro de la cuenta.',
  'La lista de tickets solo trae los que la credencial puede ver: un agente restringido ve menos que la cuenta.',
  'Los tickets archivados no aparecen en la lista; la ausencia en un listado no prueba que el ticket no exista.',
  'Solo se pide support_type_scope por defecto (agent): los tickets de agente de IA no se leen.',
] as const;

export type ZendeskNormalized =
  | { kind: 'record'; record: SourceRecord }
  | { kind: 'unknown-value' }
  | { kind: 'malformed' };

const isoOrNull = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const idOf = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null);

export function normalizeZendeskTicket(raw: unknown, account: { provider: string; accountId: string }, policy: ZendeskPolicy = defaultZendeskPolicy): ZendeskNormalized {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed' };
  const ticket = raw as Record<string, unknown>, remoteId = idOf(ticket.id);
  if (!remoteId || typeof ticket.status !== 'string') return { kind: 'malformed' };
  if (!(ZENDESK_STATUSES as readonly string[]).includes(ticket.status)) return { kind: 'unknown-value' };
  const status = ticket.status as ZendeskStatus;
  const condition = status === 'solved' || status === 'closed' ? 'completed' : policy.blockedStatuses.includes(status) ? 'blocked' : 'clear';
  const priority = typeof ticket.priority === 'string' ? priorityText[ticket.priority] : undefined;
  const subject = policy.includeSubject && typeof ticket.subject === 'string' ? cleanLabelText(ticket.subject, 60) : '';
  const label = ['Ticket de soporte #' + remoteId, statusText[status], priority ? 'prioridad ' + priority : '', subject].filter(Boolean).join(' · ').slice(0, 160);
  const external = typeof ticket.external_id === 'string' ? cleanLabelText(ticket.external_id, 120) : '';
  return {
    kind: 'record',
    record: { provider: account.provider, accountId: account.accountId, objectType: 'ticket', remoteId, kind: ZENDESK_KIND, condition, updatedAt: isoOrNull(ticket.updated_at), label, externalRef: external || null, related: [] },
  };
}

export interface ZendeskPage { tickets: unknown[]; hasMore: boolean; afterCursor: string | null }
const cursorPattern = /^[A-Za-z0-9+/=_-]{1,512}$/;
/** Valida la forma de una página de cursor. Sin `meta.has_more` booleano NO se sabe si hay más: se rechaza (una lista vacía sin ese indicador no prueba un inventario completo). */
export function parseZendeskTicketsPage(body: unknown): ZendeskPage | null {
  if (!body || typeof body !== 'object') return null;
  const { tickets, meta } = body as { tickets?: unknown; meta?: unknown };
  if (!Array.isArray(tickets) || !meta || typeof meta !== 'object') return null;
  const { has_more: hasMore, after_cursor: after } = meta as { has_more?: unknown; after_cursor?: unknown };
  if (typeof hasMore !== 'boolean') return null;
  if (after !== undefined && after !== null && (typeof after !== 'string' || !cursorPattern.test(after))) return null;
  return { tickets, hasMore, afterCursor: typeof after === 'string' ? after : null };
}
export function parseZendeskTicketBody(body: unknown): unknown | null {
  if (!body || typeof body !== 'object') return null;
  const ticket = (body as { ticket?: unknown }).ticket;
  return ticket && typeof ticket === 'object' && !Array.isArray(ticket) ? ticket : null;
}
export const isZendeskCursor = (value: string) => cursorPattern.test(value);
