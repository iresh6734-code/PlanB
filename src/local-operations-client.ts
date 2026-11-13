import { LocalOperationsSchema, LocalReviewResponseSchema, LocalWorkQueueSchema, WORK_QUEUE_CLIENT_MAX_BYTES } from '../shared/local-operations.js';

export class LocalOperationsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const MAX_RESPONSE_BYTES = 1_000_000;
/**
 * Lee el cuerpo contando BYTES UTF-8 reales (no caracteres) y aborta al superar el límite, con o sin `Content-Length` y aunque los fragmentos partan un carácter multibyte.
 * El `Content-Length` no se usa: ni uno falso a la baja relaja el límite ni uno falso al alza rechaza un cuerpo válido; manda lo que realmente llega.
 */
export async function readBoundedText(response: Response, limit: number = MAX_RESPONSE_BYTES): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      size += part.value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => undefined);
        throw new Error('La respuesta supera el tamaño permitido.');
      }
      text += decoder.decode(part.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
async function read(path: string, init: RequestInit, limit: number = MAX_RESPONSE_BYTES) {
  const response = await fetch(path, init);
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planb:locked'));
    if (response.body) void response.body.cancel().catch(() => undefined);
    throw new LocalOperationsError(401, 'La sesión está bloqueada. Desbloquea Plan B para continuar.');
  }
  const raw = await readBoundedText(response, limit);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('El servidor no devolvió una respuesta compatible.'); }
  if (!response.ok) {
    const error = value as { error?: unknown };
    const message = typeof error?.error === 'string' ? error.error : 'No se pudo consultar tu copia.';
    throw new LocalOperationsError(response.status, message);
  }
  return value;
}
export async function loadLocalOperations(signal: AbortSignal) {
  const value = await read('/api/v7/local-operations', { signal });
  if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = LocalOperationsSchema.safeParse(value);
  if (!parsed.success) throw new Error('El estado recibido no es compatible. Actualiza Plan B antes de continuar.');
  return parsed.data;
}
export async function runLocalReview(revision: string, idempotencyKey: string, signal: AbortSignal) {
  const value = await read('/api/v7/local-operations/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ revision, idempotencyKey }),
  });
  const parsed = LocalReviewResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.review.revision !== revision) throw new Error('No se pudo confirmar la revisión guardada. Reintenta la misma operación.');
  return parsed.data;
}
/** Cola de trabajo estructurada (unidad 230): estado, referencias e identidad completa de la copia. Esquema estricto; un servidor anterior sin este recurso da un error claro. */
export async function loadLocalWorkQueue(signal: AbortSignal) {
  const value = await read('/api/v7/local-operations/work', { signal }, WORK_QUEUE_CLIENT_MAX_BYTES);
  if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const parsed = LocalWorkQueueSchema.safeParse(value);
  if (!parsed.success) throw new Error('La cola de trabajo recibida no es compatible. Actualiza Plan B antes de continuar.');
  return parsed.data;
}
