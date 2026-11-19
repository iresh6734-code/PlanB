import type { z } from 'zod';
import { reviewApiPath, reviewList, reviewView, type ReviewList, type ReviewView } from '../shared/date-check-review-api.js';
import { readBoundedText } from './local-operations-client.js';

// Cliente de «Revisar una decisión» (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). Esquema y pin en cada respuesta; 401 emite `planb:locked`; nada sale de este origen.
export class ReviewError extends Error {
  /** `unknown`: no se sabe si el servidor llegó a guardar. Solo cabe repetir con la MISMA clave o leer de nuevo. */
  constructor(public status: number, message: string, public code: string | null = null, public unknown = false) { super(message); }
}
const TEXT: Record<string, string> = {
  REVIEW_CONTEXT_CHANGED: 'La copia activa cambió. Actualiza antes de seguir.',
  REVIEW_NOT_FOUND: 'Esa comprobación no está guardada en esta copia.',
  REVIEW_NO_DECISION: 'Esa comprobación todavía no tiene un siguiente paso registrado.',
  REVIEW_ALREADY_RECORDED: 'Esta decisión ya tiene un desenlace registrado.',
  REVIEW_ENDING_NOT_APPLICABLE: 'Ese desenlace no se aplica a esta decisión.',
  REVIEW_INPUT_UNAVAILABLE: 'No se puede reconstruir la entrada exacta de esta decisión.',
  REVIEW_SOURCE: 'No se pudo leer la comprobación.',
  REVIEW_STORAGE: 'No se pudo leer o guardar el desenlace en esta copia.',
};
const messageFor = (status: number, code: string | null) => (code && TEXT[code]) || (status === 401 ? 'La sesión está bloqueada. Desbloquea Plan B para continuar.' : status === 404 ? 'Revisar una decisión no está disponible en esta instalación.' : 'No se pudo completar la revisión.');

async function call<T extends { contextRevision: string }>(schema: z.ZodType<T>, pin: string, path: string, init: RequestInit, mutation: boolean): Promise<T> {
  let response: Response;
  try { response = await fetch(path, init); }
  catch (failure) { if (init.signal?.aborted) throw failure; throw new ReviewError(0, 'No hubo respuesta de tu copia local.', null, mutation); }
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new ReviewError(401, messageFor(401, null));
  }
  let value: unknown;
  try { value = JSON.parse(await readBoundedText(response, 1_000_000)); }
  catch { if (init.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError'); throw new ReviewError(response.status, 'La respuesta no se pudo leer.', null, mutation && response.ok); }
  if (!response.ok) {
    const details = (value as { details?: { code?: unknown } } | null)?.details, code = typeof details?.code === 'string' ? details.code : null;
    throw new ReviewError(response.status, messageFor(response.status, code), code, mutation && response.status >= 500);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ReviewError(200, 'La respuesta no es compatible. Actualiza Plan B antes de continuar.', null, mutation);
  if (parsed.data.contextRevision !== pin) throw new ReviewError(409, TEXT.REVIEW_CONTEXT_CHANGED, 'REVIEW_CONTEXT_CHANGED');
  return parsed.data;
}
const query = (pin: string) => '?contextRevision=' + encodeURIComponent(pin);
export const listDecisions = (pin: string, signal: AbortSignal): Promise<ReviewList> => call(reviewList, pin, `${reviewApiPath}/decisions${query(pin)}`, { signal }, false);
export const loadReview = (pin: string, id: string, signal: AbortSignal): Promise<ReviewView> => call(reviewView, pin, `${reviewApiPath}/decisions/${encodeURIComponent(id)}${query(pin)}`, { signal }, false);
export const recordEnding = (pin: string, id: string, ending: 'met' | 'supplier-late', operationId: string): Promise<ReviewView> =>
  call(reviewView, pin, `${reviewApiPath}/decisions/${encodeURIComponent(id)}/outcome`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contextRevision: pin, ending, operationId }) }, true);
