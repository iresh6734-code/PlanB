import { commitmentDecisionRequest, commitmentDecisionResponse, commitmentDetailResponse, commitmentListResponse, commitmentPath } from '../shared/commitments.js';
import { z } from 'zod';
import { readBoundedText } from './local-operations-client.js';

// Cliente del Radar de compromisos (unidad CLAUDE-COMMITMENT-RADAR-UI). Consume SOLO el contrato aceptado de `shared/commitments.ts`: cada respuesta se valida con su esquema y, además,
// debe pertenecer al pin de copia que se pidió (y al compromiso que se pidió). Una respuesta de otra copia nunca llega a la interfaz: se convierte en el mismo error que un 409 de contexto.
// Los textos de error son PROPIOS (no se muestra tal cual lo que devuelva el servidor). 401 emite `planb:locked` como el resto de clientes de Hoy.
export type CommitmentRequest = z.input<typeof commitmentDecisionRequest>;
export class CommitmentError extends Error {
  /** `unknown` = no se sabe si el servidor llegó a aplicar la decisión (sin respuesta o respuesta ilegible): solo cabe un reintento explícito con la MISMA clave o comprobar leyendo. */
  constructor(public status: number, message: string, public code: string | null = null, public unknown = false) { super(message); }
}
const MAX_BYTES = 1_000_000;
const TEXT: Record<string, string> = {
  COMMITMENT_REVISION_CHANGED: 'El compromiso cambió mientras lo revisabas. Se recargó su estado actual: revisa tu borrador antes de confirmar.',
  COMMITMENT_CONTEXT_CHANGED: 'La copia activa cambió. Se retiró lo que se mostraba: actualiza el Radar.',
  COMMITMENT_OPERATION_REUSED: 'Esa clave de operación pertenece a otra decisión distinta. Prepara la decisión de nuevo.',
  COMMITMENT_CLOSED: 'El compromiso ya está cerrado.',
  COMMITMENT_EVIDENCE_REQUIRED: 'Falta evidencia reciente de las tres fuentes para confirmar el desenlace observado.',
  COMMITMENT_HISTORY_FULL: 'El historial de ensayo de este compromiso llegó a su límite de 100 decisiones.',
};
function messageFor(status: number, code: string | null) {
  if (code && TEXT[code]) return TEXT[code];
  if (status === 401) return 'La sesión está bloqueada. Desbloquea Plan B para continuar.';
  if (status === 404) return 'El compromiso no está en esta copia, o el Radar no está activado en esta instalación.';
  if (status === 409) return 'El Radar cambió mientras lo consultabas. Actualízalo y vuelve a intentarlo.';
  if (status === 422 || status === 400) return 'La decisión no es válida: revisa responsable, siguiente paso, fecha y nota.';
  if (status === 503) return 'No se pudo comprobar el historial local del compromiso. Inténtalo de nuevo más tarde.';
  return 'No se pudo completar la operación con el Radar.';
}
const staleContext = () => new CommitmentError(409, TEXT.COMMITMENT_CONTEXT_CHANGED, 'COMMITMENT_CONTEXT_CHANGED');

async function call(path: string, init: RequestInit, mutation: boolean): Promise<unknown> {
  let response: Response;
  try { response = await fetch(path, init); }
  catch (failure) { if (init.signal?.aborted) throw failure; throw new CommitmentError(0, 'No hubo respuesta del Radar.', null, mutation); }
  // Una respuesta de una petición ya cancelada o sustituida no produce efectos globales (315 F2): un 401 obsoleto no puede bloquear una sesión nueva.
  if (init.signal?.aborted) { if (response.body) void response.body.cancel().catch(() => undefined); throw new DOMException('Consulta cancelada', 'AbortError'); }
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new CommitmentError(401, messageFor(401, null));
  }
  let raw: string;
  try { raw = await readBoundedText(response, MAX_BYTES); } catch { throw new CommitmentError(response.status, 'La respuesta del Radar no se pudo leer.', null, mutation); }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new CommitmentError(response.status, 'El servidor no devolvió una respuesta compatible.', null, mutation && response.ok); }
  if (!response.ok) {
    const details = (value as { details?: { code?: unknown } } | null)?.details, code = typeof details?.code === 'string' ? details.code : null;
    throw new CommitmentError(response.status, messageFor(response.status, code), code, mutation && response.status >= 500);
  }
  return value;
}
const query = (contextRevision: string) => '?contextRevision=' + encodeURIComponent(contextRevision);
const incompatible = (mutation: boolean) => new CommitmentError(200, 'La respuesta del Radar no es compatible. Actualiza Plan B antes de continuar.', null, mutation);

export async function loadCommitments(contextRevision: string, signal: AbortSignal) {
  const value = await call(commitmentPath + query(contextRevision), { signal }, false);
  if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = commitmentListResponse.safeParse(value); if (!parsed.success) throw incompatible(false);
  if (parsed.data.contextRevision !== contextRevision) throw staleContext();
  return parsed.data;
}
export async function loadCommitment(id: string, contextRevision: string, signal: AbortSignal) {
  const value = await call(commitmentPath + '/' + encodeURIComponent(id) + query(contextRevision), { signal }, false);
  if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = commitmentDetailResponse.safeParse(value); if (!parsed.success) throw incompatible(false);
  if (parsed.data.contextRevision !== contextRevision) throw staleContext();
  if (parsed.data.item.id !== id) throw incompatible(false);
  return parsed.data;
}
/** Confirma UNA decisión. El cuerpo se valida antes de salir; el recibo debe ser del mismo pin, compromiso y clave de operación. Un recibo de reintento exacto es el original (puede ser de una revisión anterior). */
export async function decideCommitment(id: string, request: CommitmentRequest, signal?: AbortSignal) {
  const body = commitmentDecisionRequest.safeParse(request); if (!body.success) throw new CommitmentError(422, messageFor(422, null));
  const value = await call(commitmentPath + '/' + encodeURIComponent(id) + '/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.data), signal }, true);
  const parsed = commitmentDecisionResponse.safeParse(value); if (!parsed.success) throw incompatible(true);
  if (parsed.data.contextRevision !== body.data.contextRevision) throw staleContext();
  if (parsed.data.commitmentId !== id || parsed.data.event.operationId !== body.data.operationId) throw incompatible(true);
  return parsed.data;
}

// ── Capacidad del Radar (montaje explícito del servidor): `/api/v7/commitment-radar` ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// El estado de la capacidad lo publica `mountCommitmentRadar` (sin esquema compartido): se valida aquí de forma estricta y mínima. Leer NO escribe; activar es una acción explícita que crea la semilla
// persistente UNA vez (201) y es idempotente después (200). El recibo debe ser del mismo pin pedido.
export const capabilityPath = '/api/v7/commitment-radar';
const capabilityResponse = z.object({
  format: z.literal('planb-commitment-radar-capability-v1'), mode: z.literal('fiction'), contextRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  seedAt: z.string().nullable(), datasetRevision: z.string().nullable(), provenance: z.enum(['durable', 'memory-only']).nullable(),
  status: z.enum(['inactive-copy', 'not-fiction', 'not-initialized', 'unavailable', 'available']), canActivate: z.boolean(),
}).strict();
export type RadarCapability = z.infer<typeof capabilityResponse>;
export async function loadRadarCapability(contextRevision: string | null, signal: AbortSignal): Promise<RadarCapability> {
  const value = await call(capabilityPath + (contextRevision ? query(contextRevision) : ''), { signal }, false);
  if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = capabilityResponse.safeParse(value); if (!parsed.success) throw incompatible(false);
  if (contextRevision && parsed.data.contextRevision !== null && parsed.data.contextRevision !== contextRevision) throw staleContext();
  return parsed.data;
}
/** Plazo de la activación completa (transporte, cabeceras y cuerpo). Al vencer NO se sabe si el servidor creó la semilla: el error lleva `unknown` y nunca se reenvía solo. */
export const ACTIVATION_TIMEOUT_MS = 15_000;
/** Activación EXPLÍCITA del escenario de ensayo (la persona la pide): crea la semilla persistente una vez. No contacta con ningún proveedor.
 *  El plazo es PROPIO: no depende de que el transporte atienda la cancelación (la carrera lo libera aunque fetch o la lectura del cuerpo ignoren la señal). Una respuesta posterior al plazo se descarta. */
export function activateRadar(contextRevision: string, signal?: AbortSignal, timeoutMs: number = ACTIVATION_TIMEOUT_MS): Promise<{ created: boolean; capability: RadarCapability }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new CommitmentError(0, 'La activación tardó demasiado: no se sabe si el servidor llegó a crear el escenario.', null, true)); controller.abort(); }, timeoutMs);
    if (signal) { onAbort = () => { reject(new DOMException('Activación cancelada', 'AbortError')); controller.abort(); }; if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  });
  const work = sendActivation(contextRevision, controller.signal);
  work.catch(() => undefined);   // el resultado o fallo posterior al plazo no produce un rechazo sin atender
  return Promise.race([work, limit]).finally(() => { clearTimeout(timer); if (signal && onAbort) signal.removeEventListener('abort', onAbort); });
}
async function sendActivation(contextRevision: string, signal: AbortSignal): Promise<{ created: boolean; capability: RadarCapability }> {
  let response: Response;
  try { response = await fetch(capabilityPath + '/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contextRevision }), signal }); }
  catch (failure) { if (signal?.aborted) throw failure; throw new CommitmentError(0, 'No hubo respuesta del servidor al activar el escenario.', null, true); }
  // Tras el plazo o una cancelación, la respuesta tardía se descarta sin efectos globales (315 F2).
  if (signal?.aborted) { if (response.body) void response.body.cancel().catch(() => undefined); throw new DOMException('Activación cancelada', 'AbortError'); }
  if (response.status === 401) { if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked')); throw new CommitmentError(401, messageFor(401, null)); }
  let value: unknown; try { value = JSON.parse(await readBoundedText(response, MAX_BYTES)); } catch { throw new CommitmentError(response.status, 'El servidor no devolvió una respuesta compatible.', null, response.ok); }
  if (!response.ok) { const details = (value as { details?: { code?: unknown } } | null)?.details, code = typeof details?.code === 'string' ? details.code : null; throw new CommitmentError(response.status, code === 'COMMITMENT_TEST_COPY_REQUIRED' ? 'Activa una copia de datos de ensayo para habilitar el Radar.' : code === 'COMMITMENT_SCENARIO_UNAVAILABLE' ? 'No se pudo comprobar el escenario local del Radar.' : messageFor(response.status, code), code, response.status >= 500); }
  const parsed = capabilityResponse.safeParse(value); if (!parsed.success) throw incompatible(true);
  if (parsed.data.contextRevision !== contextRevision) throw staleContext();
  return { created: response.status === 201, capability: parsed.data };
}
