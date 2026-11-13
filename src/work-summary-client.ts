import { z } from 'zod';
import { WORK_SUMMARY_ROUTE, parseWorkSummary, type WorkSummary } from '../shared/work-summary.js';
z.config({ jitless: true });   // misma configuración compatible con la política de contenido de la App

// Cliente same-origin del resumen público del trabajo local (unidad 255). Un GET, sin reintentos, sin sondeo, sin almacenamiento y sin identidad aportada por la petición. Parser ESTRICTO y tope de bytes:
// una respuesta que no cumple el contrato es «formato no válido», nunca un cero. Estados distintos: 401 bloqueado, 404 «esta versión todavía no lo ofrece», red/5xx no disponible.
// CANCELACIÓN (R2): la señal se comprueba antes de enviar, después de CADA espera (respuesta y cada fragmento del cuerpo) y antes de devolver cualquier resultado, aunque el transporte la ignore. Una operación
// cancelada nunca devuelve datos ni una categoría del transporte (401/404/5xx): lanza AbortError, cancela el flujo y libera el lector; el cuerpo recibido se descarta.
export type WorkSummaryResult =
  | { kind: 'read'; summary: WorkSummary }
  | { kind: 'locked' } | { kind: 'not-registered' } | { kind: 'invalid' } | { kind: 'failed' };
const MAX_BYTES = 64 * 1024;
const cancelled = () => new DOMException('Consulta cancelada.', 'AbortError');
const live = (signal?: AbortSignal) => { if (signal?.aborted) throw cancelled(); };
const discard = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
async function boundedJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0); if (declared > MAX_BYTES) { discard(response); throw new Error('grande'); }
  if (!response.body) throw new Error('vacío');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0; const cancel = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      live(signal); const { done, value } = await reader.read(); live(signal);   // tras esperar un fragmento la operación pudo cancelarse
      if (done) break; total += value.byteLength; if (total > MAX_BYTES) { cancel(); throw new Error('grande'); } chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { if (signal?.aborted) { cancel(); throw cancelled(); } throw error; }
  finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export async function loadWorkSummary(options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<WorkSummaryResult> {
  const { signal } = options;
  try {
    live(signal);                                                                       // ya cancelada: ni se entra en el transporte
    const response = await (options.fetcher ?? fetch)(WORK_SUMMARY_ROUTE, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal });
    if (signal?.aborted) { discard(response); throw cancelled(); }                        // el transporte pudo ignorar la señal: la respuesta tardía se descarta
    const done = (result: WorkSummaryResult): WorkSummaryResult => { live(signal); return result; };   // última guarda antes de devolver cualquier resultado
    if (response.status === 401) { discard(response); return done({ kind: 'locked' }); }
    if (response.status === 404) { discard(response); return done({ kind: 'not-registered' }); }
    if (response.status !== 200) { discard(response); return done({ kind: 'failed' }); }
    const summary = parseWorkSummary(await boundedJson(response, signal)); return done(summary ? { kind: 'read', summary } : { kind: 'invalid' });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw cancelled();
    return error instanceof SyntaxError ? { kind: 'invalid' } : { kind: 'failed' };
  }
}
