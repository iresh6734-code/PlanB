import type { z } from 'zod';
import {
  dateCheckApiPath, dateCheckCatalog, dateCheckList, dateCheckRecordView, dateCheckView,
  type DateCheckCatalog, type DateCheckRecordView, type DateCheckView,
} from '../shared/date-check-api.js';
import type { DateCheckForm } from '../shared/date-check-demo.js';
import { readBoundedText } from './local-operations-client.js';

// Cliente de «Comprobar una fecha» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). Cada respuesta se valida con su esquema y debe pertenecer al pin de copia pedido.
// 401 emite `planb:locked`, como el resto de clientes locales. Ninguna llamada sale de este origen.
export class DateCheckError extends Error {
  /** `unknown`: no se sabe si el servidor llegó a guardar (sin respuesta o ilegible). Solo cabe repetir con la MISMA clave o leer de nuevo. */
  constructor(public status: number, message: string, public code: string | null = null, public unknown = false) { super(message); }
}
const MAX_BYTES = 2_000_000;
const TEXT: Record<string, string> = {
  DATE_CHECK_CONTEXT_CHANGED: 'La copia activa cambió. Se retiró lo que se mostraba: actualiza antes de seguir.',
  DATE_CHECK_INVALID: 'Revisa la solicitud: la fecha tiene que estar dentro de la semana de ensayo.',
  DATE_CHECK_NOT_FOUND: 'Esa comprobación no está guardada en esta copia.',
  DATE_CHECK_STALE: 'La cartera, las reservas o los cambios declarados cambiaron. Comprueba de nuevo antes de confirmar.',
  DATE_CHECK_ID_REUSED: 'Esa clave pertenece a otra comprobación. Comprueba de nuevo.',
  DATE_CHECK_ALREADY_DECIDED: 'Esta comprobación ya tiene un siguiente paso registrado.',
  DATE_CHECK_OPERATION_REUSED: 'Esa confirmación ya se registró con otros datos.',
  DATE_CHECK_NOT_CONFIRMABLE: 'Esa alternativa no se puede confirmar en esta comprobación.',
  DATE_CHECK_STORAGE: 'No se pudo leer o guardar la comprobación en esta copia.',
  DATE_CHECK_CANCELLED: 'Comprobación cancelada.',
};
function messageFor(status: number, code: string | null) {
  if (code && TEXT[code]) return TEXT[code];
  if (status === 401) return 'La sesión está bloqueada. Desbloquea Plan B para continuar.';
  if (status === 404) return 'Comprobar una fecha no está disponible en esta instalación.';
  if (status === 422 || status === 400) return 'Revisa los datos de la solicitud o del siguiente paso.';
  return 'No se pudo completar la comprobación.';
}
const stale = () => new DateCheckError(409, TEXT.DATE_CHECK_CONTEXT_CHANGED, 'DATE_CHECK_CONTEXT_CHANGED');

async function call<T extends { contextRevision: string }>(schema: z.ZodType<T>, pin: string, path: string, init: RequestInit, mutation: boolean): Promise<T> {
  let response: Response;
  try { response = await fetch(path, init); }
  catch (failure) { if (init.signal?.aborted) throw failure; throw new DateCheckError(0, 'No hubo respuesta de tu copia local.', null, mutation); }
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new DateCheckError(401, messageFor(401, null));
  }
  let value: unknown;
  try { value = JSON.parse(await readBoundedText(response, MAX_BYTES)); }
  catch { if (init.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError'); throw new DateCheckError(response.status, 'La respuesta no se pudo leer.', null, mutation && response.ok); }
  if (!response.ok) {
    const details = (value as { details?: { code?: unknown } } | null)?.details, code = typeof details?.code === 'string' ? details.code : null;
    throw new DateCheckError(response.status, messageFor(response.status, code), code, mutation && response.status >= 500);
  }
  if (init.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DateCheckError(200, 'La respuesta no es compatible. Actualiza Plan B antes de continuar.', null, mutation);
  if (parsed.data.contextRevision !== pin) throw stale();
  return parsed.data;
}
const post = (body: unknown, signal?: AbortSignal): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
const query = (pin: string) => '?contextRevision=' + encodeURIComponent(pin);

export const loadCatalog = (pin: string, signal: AbortSignal): Promise<DateCheckCatalog> => call(dateCheckCatalog, pin, `${dateCheckApiPath}/catalog${query(pin)}`, { signal }, false);
export const analyzeDate = (pin: string, form: DateCheckForm, signal: AbortSignal): Promise<DateCheckView> => call(dateCheckView, pin, `${dateCheckApiPath}/analyze`, post({ contextRevision: pin, form }, signal), false);
export const listChecks = (pin: string, signal: AbortSignal) => call(dateCheckList, pin, `${dateCheckApiPath}/checks${query(pin)}`, { signal }, false);
export const loadCheck = (pin: string, id: string, signal: AbortSignal): Promise<DateCheckRecordView> => call(dateCheckRecordView, pin, `${dateCheckApiPath}/checks/${encodeURIComponent(id)}${query(pin)}`, { signal }, false);
export const saveCheck = (pin: string, id: string, form: DateCheckForm, inputRevision: string): Promise<DateCheckRecordView> =>
  call(dateCheckRecordView, pin, `${dateCheckApiPath}/checks`, post({ contextRevision: pin, id, form, inputRevision }), true);
export const confirmCheck = (pin: string, id: string, input: { inputRevision: string; alternativeId: string; operationId: string; owner: string; nextStep: string; dueAt: string }): Promise<DateCheckRecordView> =>
  call(dateCheckRecordView, pin, `${dateCheckApiPath}/checks/${encodeURIComponent(id)}/confirm`, post({ contextRevision: pin, ...input }), true);
export const changeDemo = (pin: string, change: 'withdraw-slot' | 'restore-slot'): Promise<DateCheckCatalog> =>
  call(dateCheckCatalog, pin, `${dateCheckApiPath}/demo/revision`, post({ contextRevision: pin, change }), true);
