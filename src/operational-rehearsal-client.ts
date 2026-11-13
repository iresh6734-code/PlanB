import type { z } from 'zod';
import {
  rehearsalAnalysis, rehearsalApiPath, rehearsalCheckFirst, rehearsalDecisionDraft, rehearsalOverview, rehearsalView,
  type RehearsalAnalysis, type RehearsalCheckFirst, type RehearsalDecisionDraft, type RehearsalOverview, type RehearsalView,
} from '../shared/operational-rehearsal-api.js';
import { readBoundedText } from './local-operations-client.js';

// Cliente de «Ensayar mi semana» (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). Cada respuesta se valida con su esquema y debe pertenecer al pin de copia pedido.
// Los textos de error son propios. 401 emite `planb:locked`, como el resto de clientes locales. Ninguna llamada sale de este origen.
export class RehearsalError extends Error {
  /** `unknown`: no se sabe si el servidor llegó a guardar (sin respuesta o ilegible). Solo cabe repetir con la MISMA clave o leer de nuevo. */
  constructor(public status: number, message: string, public code: string | null = null, public unknown = false) { super(message); }
}
const MAX_BYTES = 2_000_000;
const TEXT: Record<string, string> = {
  REHEARSAL_CONTEXT_CHANGED: 'La copia activa cambió. Se retiró lo que se mostraba: actualiza antes de seguir.',
  REHEARSAL_RADAR_REQUIRED: 'Activa primero el escenario de ensayo del Radar.',
  REHEARSAL_COMMITMENT_NOT_LINKED: 'Este compromiso no tiene semana de ensayo.',
  REHEARSAL_NOT_FOUND: 'Ese ensayo no está guardado en esta copia.',
  REHEARSAL_STALE: 'El compromiso o la semana cambiaron: el ensayo queda como borrador histórico. Ensaya de nuevo antes de confirmar.',
  REHEARSAL_NOT_CONFIRMABLE: 'Este ensayo no se puede confirmar: falta elegir una respuesta o ya tiene una decisión.',
  REHEARSAL_ID_REUSED: 'Esa clave pertenece a otro ensayo. Guarda de nuevo.',
  REHEARSAL_DECISION_NOT_FOUND: 'El Radar no tiene registrada esa decisión para este ensayo.',
  REHEARSAL_INVALID: 'El ensayo pedido no es válido.',
  REHEARSAL_STORAGE: 'No se pudo leer o guardar el ensayo en esta copia.',
};
function messageFor(status: number, code: string | null) {
  if (code && TEXT[code]) return TEXT[code];
  if (status === 401) return 'La sesión está bloqueada. Desbloquea Plan B para continuar.';
  if (status === 404) return 'El ensayo de la semana no está disponible en esta instalación.';
  if (status === 422 || status === 400) return 'Revisa los datos: responsable, siguiente paso y fecha.';
  return 'No se pudo completar el ensayo.';
}
const stale = () => new RehearsalError(409, TEXT.REHEARSAL_CONTEXT_CHANGED, 'REHEARSAL_CONTEXT_CHANGED');

async function call<T extends { contextRevision: string }>(schema: z.ZodType<T>, pin: string, path: string, init: RequestInit, mutation: boolean): Promise<T> {
  let response: Response;
  try { response = await fetch(path, init); }
  catch (failure) { if (init.signal?.aborted) throw failure; throw new RehearsalError(0, 'No hubo respuesta de tu copia local.', null, mutation); }
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new RehearsalError(401, messageFor(401, null));
  }
  let value: unknown;
  try { value = JSON.parse(await readBoundedText(response, MAX_BYTES)); }
  catch { if (init.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError'); throw new RehearsalError(response.status, 'La respuesta no se pudo leer.', null, mutation && response.ok); }
  if (!response.ok) {
    const details = (value as { details?: { code?: unknown } } | null)?.details, code = typeof details?.code === 'string' ? details.code : null;
    throw new RehearsalError(response.status, messageFor(response.status, code), code, mutation && response.status >= 500);
  }
  if (init.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RehearsalError(200, 'La respuesta no es compatible. Actualiza Plan B antes de continuar.', null, mutation);
  if (parsed.data.contextRevision !== pin) throw stale();
  return parsed.data;
}
const post = (body: unknown, signal?: AbortSignal): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
const query = (pin: string) => '?contextRevision=' + encodeURIComponent(pin);
export type RehearsalScenario = { commitmentId: string; perturbationIds: string[]; priority: 'focus' | 'rival' };

export const loadRehearsalOverview = (pin: string, commitmentId: string, signal: AbortSignal): Promise<RehearsalOverview> =>
  call(rehearsalOverview, pin, rehearsalApiPath + query(pin) + '&commitmentId=' + encodeURIComponent(commitmentId), { signal }, false);
export const analyzeRehearsal = (pin: string, scenario: RehearsalScenario, signal: AbortSignal): Promise<RehearsalAnalysis> =>
  call(rehearsalAnalysis, pin, rehearsalApiPath + '/analyze', post({ contextRevision: pin, ...scenario }, signal), false);
export const checkFirstRehearsal = (pin: string, scenario: RehearsalScenario, signal: AbortSignal): Promise<RehearsalCheckFirst> =>
  call(rehearsalCheckFirst, pin, rehearsalApiPath + '/check-first', post({ contextRevision: pin, ...scenario }, signal), false);
/** Guarda el ensayo. Idempotente por `id`: repetir con la misma clave devuelve el mismo registro. */
export const saveRehearsal = (pin: string, id: string, scenario: RehearsalScenario, signal?: AbortSignal): Promise<RehearsalView> =>
  call(rehearsalView, pin, rehearsalApiPath + '/rehearsals', post({ contextRevision: pin, id, ...scenario }, signal), true);
export const loadRehearsal = (pin: string, id: string, signal: AbortSignal): Promise<RehearsalView> =>
  call(rehearsalView, pin, rehearsalApiPath + '/rehearsals/' + encodeURIComponent(id) + query(pin), { signal }, false);
export const chooseRehearsalAlternative = (pin: string, id: string, alternativeId: string | null, signal?: AbortSignal): Promise<RehearsalView> =>
  call(rehearsalView, pin, rehearsalApiPath + '/rehearsals/' + encodeURIComponent(id) + '/choose', post({ contextRevision: pin, alternativeId }, signal), true);
/** Prepara la petición de decisión. No la envía: la confirma el cliente del Radar por su ruta. */
export const draftRehearsalDecision = (pin: string, id: string, input: { operationId: string; owner: string; nextStep: string; dueAt: string }, signal?: AbortSignal): Promise<RehearsalDecisionDraft> =>
  call(rehearsalDecisionDraft, pin, rehearsalApiPath + '/rehearsals/' + encodeURIComponent(id) + '/decision-draft', post({ contextRevision: pin, ...input }, signal), false);
export const linkRehearsalDecision = (pin: string, id: string, operationId: string, signal?: AbortSignal): Promise<RehearsalView> =>
  call(rehearsalView, pin, rehearsalApiPath + '/rehearsals/' + encodeURIComponent(id) + '/link', post({ contextRevision: pin, operationId }, signal), true);
