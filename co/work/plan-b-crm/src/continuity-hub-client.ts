import { z } from 'zod';
import { READ_CHECK_ISSUE_MESSAGES, READ_CHECK_ROUTE, parseReadCheckApiState, type ReadCheckApiState, type ReadCheckPostBody } from '../shared/hubspot-read-check-api.js';
import { RELAY_ISSUE_MESSAGES, RELAY_REHEARSAL_ROUTE, parseRelayRehearsalState, type RelayRehearsalApiState } from '../shared/relay-rehearsal.js';

// Clientes same-origin de las APIs de lectura de HubSpot (212) y de ensayo de relevo (216) para el consumidor del pasaporte (unidad 217). Una petición cada vez, sin reintentos,
// sin sondeo, sin almacenamiento y sin identidad aportada por la petición. Límite de bytes, cancelación y parsers ESTRICTOS: una respuesta que no cumple el contrato es «no disponible»,
// nunca un éxito. Un 401 es «bloqueada». Los mensajes de error son propios: no se copia texto del servidor.
z.config({ jitless: true });   // misma configuración compatible con la política de contenido de la App
export type Loaded<T> = { status: 'read'; at: string; value: T } | { status: 'unavailable'; at: string; value: null; reason: 'locked' | 'failed' };
export type ActionResult<T> = { kind: 'state'; code: number; state: T } | { kind: 'locked' } | { kind: 'failed' };
const MAX_BYTES = 128 * 1024;

async function boundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0); if (declared > MAX_BYTES) { void response.body?.cancel().catch(() => undefined); throw new Error('grande'); }
  if (!response.body) throw new Error('vacío');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { cancel(); throw new Error('grande'); } chunks.push(value); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}
async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body: unknown, parse: (raw: unknown) => T | null, options: { signal?: AbortSignal; fetcher?: typeof fetch }): Promise<ActionResult<T>> {
  try {
    const response = await (options.fetcher ?? fetch)(path, { method, credentials: 'same-origin', cache: 'no-store', signal: options.signal, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (response.status === 401) { void response.body?.cancel().catch(() => undefined); return { kind: 'locked' }; }
    const state = parse(await boundedJson(response, options.signal)); if (!state) return { kind: 'failed' };
    return { kind: 'state', code: response.status, state };
  } catch (error) { if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw new DOMException('Consulta cancelada.', 'AbortError'); return { kind: 'failed' }; }
}
const loaded = <T>(result: ActionResult<T>, now: () => string): Loaded<T> => result.kind === 'state' && result.code === 200 ? { status: 'read', at: now(), value: result.state } : { status: 'unavailable', at: now(), value: null, reason: result.kind === 'locked' ? 'locked' : 'failed' };
const stamp = () => new Date().toISOString();

/** GET: solo lo guardado. NUNCA genera tráfico hacia el proveedor. */
export async function loadReadCheck(options: { signal?: AbortSignal; fetcher?: typeof fetch; now?: () => string } = {}): Promise<Loaded<ReadCheckApiState>> { return loaded(await call('GET', READ_CHECK_ROUTE, undefined, parseReadCheckApiState, options), options.now ?? stamp); }
/** GET: solo el último ensayo guardado. NUNCA ejecuta un ensayo. */
export async function loadRelay(options: { signal?: AbortSignal; fetcher?: typeof fetch; now?: () => string } = {}): Promise<Loaded<RelayRehearsalApiState>> { return loaded(await call('GET', RELAY_REHEARSAL_ROUTE, undefined, parseRelayRehearsalState, options), options.now ?? stamp); }
/** POST explícito: las cinco lecturas de solo lectura sobre el portal confirmado. Devuelve el estado (con su incidencia, si la hay) o «bloqueada». */
export const startReadCheck = (portalId: string, options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) => call<ReadCheckApiState>('POST', READ_CHECK_ROUTE, { portalId, authorizedReads: 5 } satisfies ReadCheckPostBody, parseReadCheckApiState, options);
/** POST explícito: un ensayo de relevo con ficción (no exporta el espacio activo). */
export const startRelay = (options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) => call<RelayRehearsalApiState>('POST', RELAY_REHEARSAL_ROUTE, { fiction: true }, parseRelayRehearsalState, options);
/** DELETE explícito: pide descartar el ensayo en curso. No libera la plaza: el servidor la libera cuando el proceso termina de verdad. */
export const cancelRelay = (options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}) => call<RelayRehearsalApiState>('DELETE', RELAY_REHEARSAL_ROUTE, undefined, parseRelayRehearsalState, options);
export const readCheckMessage = (state: ReadCheckApiState): string | null => state.issue ? READ_CHECK_ISSUE_MESSAGES[state.issue] : null;
export const relayMessage = (state: RelayRehearsalApiState): string | null => state.issue ? RELAY_ISSUE_MESSAGES[state.issue] : null;
