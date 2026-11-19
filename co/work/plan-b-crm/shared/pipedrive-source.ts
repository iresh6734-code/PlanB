import { cleanLabelText, type SourceRecord } from './source-reading.js';

// ADAPTACIÓN PURA DE PIPEDRIVE (unidad Claude B · CLAUDE-SOURCE-PIPEDRIVE). Sin red ni reloj: convierte lo que devuelve la API v2 de Pipedrive en `SourceRecord` y decide qué se omite. Fuente: documentación
// oficial de Pipedrive consultada el 8/11/2026 (API v2, migración v1→v2, paginación, límites, autenticación y OpenAPI v2). Lo que NO pudo confirmarse está en `PIPEDRIVE_UNCONFIRMED` y queda para el
// ensayo real; no se completa por analogía con HubSpot o Zendesk.
//
// Objetos y su papel:
//   deal (oportunidad)   → rol `sale` del Radar. won → completado · open → sin bloqueo observado · lost → bloqueado (una oportunidad perdida pone en riesgo el compromiso; política configurable) ·
//                          deleted/`is_deleted` → bloqueado con etiqueta propia · cualquier otro valor → se OMITE con contador (lectura parcial): un estado futuro no se interpreta como sano.
//   person · organization · activity → objetos de CONTEXTO sin rol (`kind: null`): se conservan con sus relaciones (person_id, org_id, deal_id) pero NUNCA se proyectan al Radar ni se convierten en vínculos.
// Las etiquetas llevan tipo, ID y estado; no copian títulos, nombres ni asuntos (datos personales).
export const PIPEDRIVE_OBJECTS = {
  deal: { path: '/api/v2/deals', pluralPath: 'deals', maxPage: 500, kind: 'sale' as const },
  person: { path: '/api/v2/persons', pluralPath: 'persons', maxPage: 100, kind: null },
  organization: { path: '/api/v2/organizations', pluralPath: 'organizations', maxPage: 500, kind: null },
  activity: { path: '/api/v2/activities', pluralPath: 'activities', maxPage: 500, kind: null },
} as const;
export type PipedriveObject = keyof typeof PIPEDRIVE_OBJECTS;
export const PIPEDRIVE_DEAL_STATUSES = ['open', 'won', 'lost', 'deleted'] as const;
export type PipedriveDealStatus = (typeof PIPEDRIVE_DEAL_STATUSES)[number];
const dealText: Record<PipedriveDealStatus, string> = { open: 'abierta', won: 'ganada', lost: 'perdida', deleted: 'eliminada' };

export interface PipedrivePolicy { lostIs: 'blocked' | 'clear' }
export const defaultPipedrivePolicy: PipedrivePolicy = { lostIs: 'blocked' };

/** Lo que la documentación consultada no permite afirmar. Cada punto queda pendiente de un ensayo real con una cuenta propia y autorizada. */
export const PIPEDRIVE_UNCONFIRMED = [
  'Esquema de personas y organizaciones de la API v2 (solo se lee `id`, `update_time` y, en personas, `org_id`, cada uno solo si llega con el tipo esperado).',
  'Personas: la referencia oficial actual indica máximo 500 y 100 por defecto; este lector pide como mucho 100 por POLÍTICA PROPIA conservadora (no por un límite documental desconocido). Una prueba sintética acredita el comportamiento del lector con ese contrato, no una lectura real.',
  'Alfabeto exacto de los cursores `next_cursor` (opacos): se aceptan A-Z a-z 0-9 + / = _ . ~ - hasta 1024 caracteres y se envían codificados.',
  'Si la cabecera `x-api-token` y el host `{dominio}.pipedrive.com` son intercambiables con `api.pipedrive.com` y con OAuth (solo se admite `{dominio}.pipedrive.com`).',
  'Nombres y alcance exactos de los permisos OAuth de solo lectura más allá de `deals:read` y `activities:read` (no se usan `contacts:read` ni otros sin confirmarlos).',
  'Cuerpos y condiciones exactas de 401, 403 y 404 (aquí solo se usa el código de estado; un 403 con página HTML de Cloudflare tras un 429 persistente se trata como permisos/acceso, no como un dato).',
  '`Retry-After` no figura en la documentación de límites: si llega, se respeta; si no, no se supone ninguno y NO se reintenta.',
  'Si `update_time` cumple RFC 3339 en todos los objetos: una fecha con forma válida pero imposible (30 de febrero, 31 de abril, hora 24) o con otro formato queda en `updatedAt: null`; nunca se normaliza a otro día.',
  'Los indicadores `is_deleted` e `is_archived` se leen solo como booleanos reales (ausente = no marcado); un valor de otro tipo omite la oportunidad (`unknown-value`) en vez de tomarse por false.',
  'El host `{dominio}.pipedrive.com` y la cabecera `x-api-token` están documentados (autenticación y patrón de peticiones), pero ninguna prueba sintética demuestra autorización ni lectura real.',
] as const;

/** Límites que se declaran siempre junto a una lectura, aunque salga completa. */
export const PIPEDRIVE_READ_LIMITS = [
  '«Completa» significa que se recorrieron todas las páginas visibles con la credencial: no es una captura atómica (los datos pueden cambiar durante la paginación) ni el inventario íntegro de la cuenta.',
  'La lista de oportunidades no incluye las archivadas ni las eliminadas (la documentación las separa y borra a los 30 días): la ausencia en un listado no prueba que no existan.',
  'El presupuesto diario de la API de Pipedrive es compartido por todos los usuarios de la empresa (una lista cuesta 10 unidades en v2): cada lectura se acota a pocas páginas y no se reintenta.',
  'Personas, organizaciones y actividades se leen como contexto: no son evidencia de compromiso mientras no exista una decisión de contrato.',
] as const;

export type PipedriveNormalized = { kind: 'record'; record: SourceRecord } | { kind: 'unknown-value' } | { kind: 'malformed' };

const idOf = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null);
/**
 * R2 · Fecha RFC 3339 con día de calendario REAL, hora 00–23, minutos y segundos 00–59 y desfase ±hh:mm con hh ≤ 23 y mm ≤ 59. La forma y `Date.parse` no bastan: normalizan el 30 de febrero a marzo y la hora 24 al día
 * siguiente, es decir, inventan un instante. Una fecha ilegible da `null` (nunca otra fecha) y por tanto no puede desplazar a un duplicado válido.
 */
/**
 * R3 · El instante normalizado debe PERTENECER al formato público de `SourceRecord.updatedAt` (año de cuatro dígitos, milisegundos, `Z`). Un desfase puede sacar un instante válido de ese rango
 * (`9999-12-31T23:45:00-01:00` es el año 10000 UTC; `0000-01-01T00:15:00+01:00` es el año -1): eso no se publica ni se deja que rechace la lectura entera, queda como fecha desconocida (`null`) y
 * la fila conserva su condición. Además se conserva la precisión SUBMILISEGUNDO (hasta nueve dígitos) solo como clave de orden interna (`sub`), nunca en el campo público.
 */
const PUBLIC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const instant = (value: unknown): { iso: string; sub: string } | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value); if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, , offsetHour, offsetMinute] = match.map(part => part ?? '');
  const end = new Date(0); end.setUTCFullYear(Number(year), Number(month), 0);
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > end.getUTCDate() || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offsetHour !== '' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return null;
  const time = Date.parse(value); if (!Number.isFinite(time)) return null;
  const iso = new Date(time).toISOString(); if (!PUBLIC_INSTANT.test(iso)) return null;
  return { iso, sub: fraction.padEnd(9, '0').slice(3) };
};
const rfc3339 = (value: unknown) => instant(value)?.iso ?? null;
/** R3 · Clave para elegir el duplicado MÁS RECIENTE: el instante público más los seis dígitos por debajo del milisegundo. Fecha ilegible o fuera de rango = clave vacía (nunca desplaza a una válida). Dos claves iguales no se distinguen. */
export function pipedriveUpdateOrder(raw: unknown): string {
  const stamp = raw && typeof raw === 'object' && !Array.isArray(raw) ? instant((raw as Record<string, unknown>).update_time) : null;
  return stamp ? stamp.iso + stamp.sub : '';
}
/** R2 · Indicador booleano de la API: `true`/`false` reales son datos; AUSENTE es «no marcado» (comportamiento documentado de los campos que no llegan); cualquier otro tipo (cadena, número, null, objeto) es ILEGIBLE y no se coacciona. */
const flag = (value: unknown): boolean | 'unreadable' => (value === undefined ? false : typeof value === 'boolean' ? value : 'unreadable');
const related = (objectType: PipedriveObject, value: unknown) => { const id = idOf(value); return id ? [{ objectType, remoteId: id }] : []; };

export function normalizePipedriveRecord(object: PipedriveObject, raw: unknown, account: { provider: string; accountId: string }, policy: PipedrivePolicy = defaultPipedrivePolicy): PipedriveNormalized {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed' };
  const item = raw as Record<string, unknown>, remoteId = idOf(item.id);
  if (!remoteId) return { kind: 'malformed' };
  const base = { provider: account.provider, accountId: account.accountId, objectType: object, remoteId, updatedAt: rfc3339(item.update_time), externalRef: null };
  if (object === 'deal') {
    const status = typeof item.status === 'string' ? item.status : null, deleted = flag(item.is_deleted), archived = flag(item.is_archived);
    if (deleted === 'unreadable' || archived === 'unreadable') return { kind: 'unknown-value' };      // un indicador ilegible no se toma por false: la oportunidad se omite con contador y la lectura queda parcial
    if (deleted) return { kind: 'record', record: { ...base, kind: 'sale', condition: 'blocked', label: 'Oportunidad #' + remoteId + ' · eliminada', related: [...related('person', item.person_id), ...related('organization', item.org_id)] } };
    if (status === null || !(PIPEDRIVE_DEAL_STATUSES as readonly string[]).includes(status)) return { kind: 'unknown-value' };
    const known = status as PipedriveDealStatus;
    const condition = known === 'won' ? 'completed' : known === 'lost' ? (policy.lostIs === 'blocked' ? 'blocked' : 'clear') : known === 'deleted' ? 'blocked' : 'clear';
    return { kind: 'record', record: { ...base, kind: 'sale', condition, label: ('Oportunidad #' + remoteId + ' · ' + dealText[known] + (archived ? ' · archivada' : '')).slice(0, 160), related: [...related('person', item.person_id), ...related('organization', item.org_id)] } };
  }
  if (object === 'person') return { kind: 'record', record: { ...base, kind: null, condition: null, label: 'Persona #' + remoteId, related: related('organization', item.org_id) } };
  if (object === 'organization') return { kind: 'record', record: { ...base, kind: null, condition: null, label: 'Organización #' + remoteId, related: [] } };
  if (typeof item.done !== 'boolean') return { kind: 'unknown-value' };
  return { kind: 'record', record: { ...base, kind: null, condition: null, label: 'Actividad #' + remoteId + ' · ' + (item.done ? 'hecha' : 'pendiente'), related: [...related('deal', item.deal_id), ...related('person', item.person_id), ...related('organization', item.org_id)].slice(0, 6) } };
}

export interface PipedrivePage { data: unknown[]; nextCursor: string | null }
export const pipedriveCursorPattern = /^[A-Za-z0-9+/=_.~-]{1,1024}$/;
/** Valida la forma de una página v2. Sin `success: true` y sin `additional_data.next_cursor` (cadena o null) NO se sabe si hay más: se rechaza (una página vacía no prueba un inventario completo). */
export function parsePipedrivePage(body: unknown): PipedrivePage | null {
  if (!body || typeof body !== 'object') return null;
  const { success, data, additional_data: additional } = body as { success?: unknown; data?: unknown; additional_data?: unknown };
  if (success !== true || !Array.isArray(data) || !additional || typeof additional !== 'object' || Array.isArray(additional)) return null;
  const next = (additional as { next_cursor?: unknown }).next_cursor;     // la clave ausente (undefined) no es null ni cadena: se rechaza
  if (next !== null && (typeof next !== 'string' || !pipedriveCursorPattern.test(next))) return null;
  return { data, nextCursor: next as string | null };
}
export function parsePipedriveItemBody(body: unknown): unknown | null {
  if (!body || typeof body !== 'object') return null;
  const { success, data } = body as { success?: unknown; data?: unknown };
  return success === true && data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}
export const cleanText = cleanLabelText;
