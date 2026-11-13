import { z } from 'zod';
import { SOURCE_READING_HISTORY_PATH, sourceHistoryQuery, sourceHistoryResponse, type SourceHistoryBinding, type SourceHistoryResponse } from '../shared/source-reading-history.js';
import { describeStop } from '../shared/source-reading.js';
import { evidenceOf, type EvidenceKind } from '../shared/source-status.js';
z.config({ jitless: true });   // misma configuración compatible con la política de contenido de la App

// Cliente same-origin del HISTORIAL LOCAL de lecturas de una fuente (GET 298 sobre el diario 297). Un GET, sin reintentos, sin sondeo, sin almacenamiento, sin identidad aportada por la petición y SIN tocar nunca
// al proveedor: la consulta solo lee el estado local. El ámbito (fuente exacta y pin de la copia) lo fija el ANFITRIÓN; la respuesta se acepta solo si corresponde EXACTAMENTE a lo pedido (misma copia, misma
// fuente, mismo tamaño de página, paginación coherente): lo demás es «formato no válido» y no se publica nada. Estados distintos: 401 bloqueado, 403 fuera de ámbito, 409 cambio de copia o de historial, 422
// cursor no válido, 503 historial no disponible, 404 «esta versión todavía no lo ofrece», red/5xx fallo.
// CANCELACIÓN: la señal se comprueba antes de enviar, tras CADA espera (respuesta y cada fragmento) y antes de devolver cualquier resultado, aunque el transporte la ignore. Una operación cancelada nunca
// devuelve datos ni una categoría del transporte: lanza AbortError, cancela el flujo y libera el lector.
export type HistorySource = SourceHistoryBinding['source'];
export type HistoryEntry = SourceHistoryResponse['entries'][number];
export type HistoryFailure = 'locked' | 'not-registered' | 'out-of-scope' | 'changed' | 'bad-cursor' | 'unavailable' | 'invalid' | 'failed';
export type HistoryResult = { kind: 'read'; response: SourceHistoryResponse } | { kind: HistoryFailure };
export const HISTORY_DEFAULT_LIMIT = 10;
const MAX_BYTES = 128 * 1024, MAX_ERROR_BYTES = 16 * 1024;
const cancelled = () => new DOMException('Consulta cancelada.', 'AbortError');
const live = (signal?: AbortSignal) => { if (signal?.aborted) throw cancelled(); };
const discard = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
async function boundedJson(response: Response, max: number, signal?: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0); if (declared > max) { discard(response); throw new Error('grande'); }
  if (!response.body) throw new Error('vacío');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0; const cancel = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      live(signal); const { done, value } = await reader.read(); live(signal);   // tras esperar un fragmento la operación pudo cancelarse
      if (done) break; total += value.byteLength; if (total > max) { cancel(); throw new Error('grande'); } chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { if (signal?.aborted) { cancel(); throw cancelled(); } throw error; }
  finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}
/** Consulta exacta: la fuente que fija el anfitrión y el pin de la copia; nunca se amplía con datos del usuario. */
export function historyUrl(source: HistorySource, contextRevision: string, limit: number, cursor: string | null): string | null {
  const params: Record<string, string> = { contextRevision, provider: source.provider, accountId: source.accountId, objectType: source.objectType, mode: source.mode, limit: String(limit) };
  if (source.mode === 'lookup') { if (!source.target) return null; params.role = source.target.kind; params.remoteId = source.target.remoteId; }
  if (cursor) params.cursor = cursor;
  if (!sourceHistoryQuery.safeParse(params).success) return null;
  return SOURCE_READING_HISTORY_PATH + '?' + new URLSearchParams(params).toString();
}
const sameSource = (a: HistorySource, b: HistorySource) => a.provider === b.provider && a.accountId === b.accountId && a.objectType === b.objectType && a.mode === b.mode
  && (a.target === null ? b.target === null : b.target !== null && a.target.kind === b.target.kind && a.target.remoteId === b.target.remoteId);
/** La respuesta solo se acepta si responde a LO PEDIDO. Una respuesta de otra copia, de otra fuente o con paginación incoherente no se publica. */
export function answersRequest(response: SourceHistoryResponse, expected: { source: HistorySource; contextRevision: string; limit: number; cursor: string | null }): boolean {
  if (response.contextRevision !== expected.contextRevision || !sameSource(response.source, expected.source) || response.page.limit !== expected.limit) return false;
  const { entries, page } = response;
  if (entries.length > expected.limit || (expected.cursor === null ? page.offset !== 0 : page.offset < 1)) return false;
  if ((page.nextCursor === null) !== (page.offset + entries.length >= page.total)) return false;
  if (response.journalRevision === null && page.total !== 0) return false;
  return entries.every((entry, index) => index === 0 || entry.sequence > entries[index - 1]!.sequence);
}
async function errorCode(response: Response, signal?: AbortSignal): Promise<string | null> {
  try {
    const body = await boundedJson(response, MAX_ERROR_BYTES, signal), details = body && typeof body === 'object' ? (body as { details?: unknown }).details : null;
    const code = details && typeof details === 'object' ? (details as { code?: unknown }).code : null; return typeof code === 'string' ? code : null;
  } catch (error) { if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw cancelled(); return null; }
}
export async function loadSourceHistory(options: { source: HistorySource; contextRevision: string; limit?: number; cursor?: string | null; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<HistoryResult> {
  const { signal, source, contextRevision } = options, limit = options.limit ?? HISTORY_DEFAULT_LIMIT, cursor = options.cursor ?? null;
  try {
    live(signal);                                                                       // ya cancelada: ni se entra en el transporte
    const url = historyUrl(source, contextRevision, limit, cursor); if (!url) return { kind: 'invalid' };   // el anfitrión no dio un ámbito válido: no se envía nada
    const response = await (options.fetcher ?? fetch)(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal });
    if (signal?.aborted) { discard(response); throw cancelled(); }                        // el transporte pudo ignorar la señal: la respuesta tardía se descarta
    const done = (result: HistoryResult): HistoryResult => { live(signal); return result; };   // última guarda antes de devolver cualquier resultado
    if (response.status === 401) { discard(response); return done({ kind: 'locked' }); }
    if (response.status === 404) { discard(response); return done({ kind: 'not-registered' }); }
    if (response.status !== 200) {
      const status = response.status, code = [403, 409, 422, 503].includes(status) ? await errorCode(response, signal) : (discard(response), null);
      const kind: HistoryFailure = status === 403 && code === 'SOURCE_HISTORY_SCOPE' ? 'out-of-scope' : status === 409 && code === 'SOURCE_HISTORY_CHANGED' ? 'changed'
        : status === 422 && code === 'SOURCE_HISTORY_CURSOR' ? 'bad-cursor' : status === 503 && code === 'SOURCE_HISTORY_UNAVAILABLE' ? 'unavailable' : 'failed';
      return done({ kind });
    }
    const parsed = sourceHistoryResponse.safeParse(await boundedJson(response, MAX_BYTES, signal));
    return done(parsed.success && answersRequest(parsed.data, { source, contextRevision, limit, cursor }) ? { kind: 'read', response: parsed.data } : { kind: 'invalid' });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw cancelled();
    return error instanceof SyntaxError ? { kind: 'invalid' } : { kind: 'failed' };
  }
}

// ---- Presentación (pura, sin red): una sola redacción para el componente y las pruebas ----
export const COVERAGE_TEXT: Record<HistoryEntry['coverage'], string> = { complete: 'Lectura completa', partial: 'Lectura parcial', unavailable: 'Sin lectura útil' };
export const EVIDENCE_TEXT: Record<EvidenceKind, string> = {
  data: 'Llegaron datos de la fuente de ensayo',
  'not-sent': 'No salió ninguna petición',
  'no-response': 'Salió una petición y falló la red antes de recibir respuesta',
  // R3 de SourceStatus: un plazo o una cancelación con la petición enviada no distinguen si llegaron las cabeceras; no se afirma ni que llegó ni que no llegó respuesta.
  interrupted: 'Salió una petición y se interrumpió (plazo o cancelación) antes de completar una página: no se sabe si la fuente llegó a responder',
  'error-response': 'La fuente respondió con un error',
  'unusable-response': 'Llegó una respuesta que no se pudo usar',
};
/**
 * Clave de identidad INEQUÍVOCA para `identityKey`: serializa un arreglo de cadenas con JSON, así que ningún valor (ni siquiera uno con separadores) puede confundirse con otro reparto. El montador pasa aquí TODO lo que, si cambia, obliga a descartar lo leído:
 * `session` (contador que el anfitrión incrementa al desbloquear: el cliente no ve la cookie de sesión), `instance`, `context` (`contextRevision`), `capture` (captura activa), y la fuente (`provider`, `account`, `object`, `mode`, `target` o '').
 */
export function historyIdentityKey(parts: { session: string; instance: string; context: string; capture: string; provider: string; account: string; object: string; mode: string; target: string }): string {
  return JSON.stringify([parts.session, parts.instance, parts.context, parts.capture, parts.provider, parts.account, parts.object, parts.mode, parts.target]);
}
export const FAILURE_TEXT: Record<HistoryFailure, { head: string; detail: string }> = {
  locked: { head: 'Plan B está bloqueado: desbloquéalo para consultar el historial local.', detail: 'No se muestra nada hasta desbloquear.' },
  'not-registered': { head: 'Esta versión todavía no ofrece el historial de lecturas.', detail: 'No es que no haya recibos: simplemente no se pueden consultar desde aquí.' },
  'out-of-scope': { head: 'Esta fuente no pertenece al ámbito autorizado de esta pantalla.', detail: 'No se muestra ningún recibo. Vuelve a abrir la fuente desde Integraciones.' },
  changed: { head: 'La copia o el historial cambiaron mientras se leía.', detail: 'Lo leído antes se descartó. Actualiza para consultar el estado local actual.' },
  'bad-cursor': { head: 'La página pedida ya no corresponde al historial actual.', detail: 'Lo leído antes se descartó. Actualiza para empezar de nuevo.' },
  unavailable: { head: 'No se pudo comprobar el historial local.', detail: 'Se desconoce cuántos recibos hay (no es cero). Se conserva sin repararlo: puedes reintentar la consulta local.' },
  invalid: { head: 'La respuesta del historial no es válida y no se usa.', detail: 'Se desconoce cuántos recibos hay (no es cero).' },
  failed: { head: 'No se pudo leer el historial local.', detail: 'Se desconoce cuántos recibos hay (no es cero).' },
};
export interface HistoryHeadline { lastSaved: HistoryEntry | null; latestObserved: HistoryEntry | null; sameEntry: boolean; complete: boolean }
/** «Último guardado» (mayor orden de inserción) y «observación más reciente» (mayor hora observada) son cosas distintas. Solo se afirman cuando se ha leído TODO el historial: los recibos van en orden de inserción y el último puede estar en una página sin cargar. */
export function headlineOf(entries: HistoryEntry[], complete: boolean): HistoryHeadline {
  if (!complete || entries.length === 0) return { lastSaved: null, latestObserved: null, sameEntry: false, complete };
  const lastSaved = entries.reduce((a, b) => (b.sequence > a.sequence ? b : a));
  const latestObserved = entries.reduce((a, b) => (Date.parse(b.completedAt) > Date.parse(a.completedAt) ? b : a));
  return { lastSaved, latestObserved, sameEntry: lastSaved.sequence === latestObserved.sequence, complete };
}
export function entryFacts(entry: HistoryEntry) {
  const evidence = evidenceOf(entry);
  return {
    coverage: COVERAGE_TEXT[entry.coverage], evidence: EVIDENCE_TEXT[evidence], evidenceKind: evidence,
    cause: entry.stoppedBy ? describeStop(entry.stoppedBy) : null,
    records: entry.storedRecords === null ? 'Recuento desconocido (no es cero)' : entry.storedRecords + (entry.storedRecords === 1 ? ' registro guardado en el recibo' : ' registros guardados en el recibo'),
  };
}
