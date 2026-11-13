import type { SourceStop } from '../shared/source-reading.js';

// TRANSPORTE DE LECTURA PARA FUENTES EXTERNAS (unidad Claude B · CLAUDE-SOURCE-ZENDESK). Una sola operación: `get`. No existe forma de enviar un cuerpo ni otro método: la API del objeto no los
// admite, así que no es un transporte genérico capaz de escribir. En el borde de red acota, con independencia del adaptador:
//   · origen exacto (validado por una regla del llamador) y ninguna otra URL; rutas y consulta por regla del llamador; sin fragmento, credenciales en la URL ni `//`;
//   · solo las cabeceras previstas (`accept` y la credencial; la credencial llega por función y no se guarda ni se devuelve);
//   · sin seguir redirecciones: una 3xx es un fallo `redirect` (la credencial no viaja a otro sitio);
//   · tiempo por petición y tiempo total, presupuesto de peticiones y tope de bytes por respuesta (al superarlo se rechaza la respuesta ENTERA: nunca se entrega un prefijo);
//   · respuestas de error SIN cuerpo (ni se leen ni se copian) y solo `Retry-After` en segundos.
// R2 · LOS LÍMITES SON PROPIOS DEL TRANSPORTE. Enviar una señal a `fetch` no basta: un `fetch` o un `reader.read` inyectados pueden ignorarla. Cada espera (cabeceras y cada lectura del cuerpo) compite con una
// puerta de parada propia (aborto del llamador, plazo por petición o plazo total); si gana la puerta, la lectura termina YA con su categoría y lo que llegue después se DESCARTA: una respuesta o un error tardíos
// no publican nada ni provocan un rechazo no atendido. La limpieza (cancelar el cuerpo) se lanza sin esperarla: una limpieza no cooperativa no puede volver a bloquear la lectura. Los temporizadores y el
// oyente de la señal del llamador se retiran siempre al terminar. Lo que se rechaza se cuenta en `blocked` con un código corto, sin copiar la URL ni cabeceras.
export interface TransportOptions {
  /** Origen exacto (`https://acme.zendesk.com`). Debe pasar `allowOrigin`. */
  origin: string;
  allowOrigin: (origin: string) => boolean;
  allowPath: (pathname: string) => boolean;
  allowQuery: (params: URLSearchParams, pathname: string) => boolean;
  /** Se llama en cada petición. La función puede lanzar si no hay credencial. */
  credential: () => { name: 'authorization' | 'x-api-token'; value: string };
  fetch?: typeof fetch;
  maxRequests: number;
  maxBodyBytes: number;
  requestTimeoutMs: number;
  totalTimeoutMs: number;
  signal?: AbortSignal;
}

export type TransportResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; failure: SourceStop; status: number | null; retryAfterSeconds: number | null };
export interface SourceTransport {
  get(target: string): Promise<TransportResult>;
  stats(): { requests: number; blocked: string[]; truncated: number; bytes: number };
}

const fail = (failure: SourceStop, status: number | null = null, retryAfterSeconds: number | null = null): TransportResult => ({ ok: false, failure, status, retryAfterSeconds });
const retrySeconds = (value: string | null) => (value !== null && /^\d{1,5}$/.test(value.trim()) ? Math.min(3600, Number(value.trim())) : null);
const quiet = () => undefined;
type Stop = 'aborted' | 'timeout';
type Settled<T> = { stop: Stop } | { value: T } | { error: unknown };

export function createSourceReadTransport(options: TransportOptions): SourceTransport {
  let origin: string;
  try { origin = new URL(options.origin).origin; } catch { throw new Error('ORIGEN_NO_VALIDO'); }
  if (origin !== options.origin || !options.allowOrigin(origin)) throw new Error('ORIGEN_NO_PERMITIDO');
  for (const value of [options.maxRequests, options.maxBodyBytes, options.requestTimeoutMs, options.totalTimeoutMs]) if (!Number.isInteger(value) || value < 1) throw new Error('LIMITES_NO_VALIDOS');
  const real = options.fetch ?? fetch, blocked: string[] = [], state = { requests: 0, truncated: 0, bytes: 0 };
  const deadline = performance.now() + options.totalTimeoutMs;
  const refuse = (why: string): TransportResult => { if (blocked.length < 32) blocked.push(why); return fail('blocked'); };

  async function get(target: string): Promise<TransportResult> {
    if (typeof target !== 'string' || !/^\/[^\s#\\]*$/.test(target) || target.startsWith('//')) return refuse('destino-no-valido');
    let url: URL; try { url = new URL(target, origin); } catch { return refuse('destino-no-valido'); }
    if (url.origin !== origin || url.username || url.password || url.hash) return refuse('destino-no-permitido');
    if (!options.allowPath(url.pathname)) return refuse('ruta-no-prevista');
    if (!options.allowQuery(url.searchParams, url.pathname)) return refuse('consulta-no-prevista');
    if (options.signal?.aborted) return fail('aborted');
    if (deadline - performance.now() <= 0) return fail('timeout');
    if (state.requests >= options.maxRequests) return fail('budget');
    let header: { name: string; value: string };
    try { header = options.credential(); } catch { return fail('unauthorized'); }
    // R3 · La cancelación y el plazo total se REVALIDAN después de `credential` (un callback local puede haber abortado la señal o agotado el plazo) y ANTES de contar la petición o invocar fetch:
    // un listener añadido a una señal ya abortada no vuelve a emitir, así que sin esta puerta se llamaría a fetch pese a la cancelación.
    if (options.signal?.aborted) return fail('aborted');
    const remaining = deadline - performance.now(); if (remaining <= 0) return fail('timeout');
    if ((header.name !== 'authorization' && header.name !== 'x-api-token') || typeof header.value !== 'string' || !header.value || header.value.length > 4096 || /[\r\n]/.test(header.value)) return fail('unauthorized');
    state.requests++;

    // Puerta de parada PROPIA de esta petición: aborto del llamador, plazo por petición o plazo total (lo que ocurra primero). Resuelve una sola vez; lo posterior se ignora.
    const controller = new AbortController();
    let stopped: Stop | null = null, release!: (reason: Stop) => void;
    const gate = new Promise<Stop>(resolve => { release = resolve; });
    const trigger = (reason: Stop) => { if (stopped) return; stopped = reason; controller.abort(); release(reason); };
    const timer = setTimeout(() => trigger('timeout'), Math.max(1, Math.min(options.requestTimeoutMs, remaining)));
    const onCaller = () => trigger('aborted');
    options.signal?.addEventListener('abort', onCaller, { once: true });
    const stoppedFailure = () => fail(stopped ?? 'network');
    /** Espera `promise` o la puerta de parada, lo primero. La promesa abandonada nunca queda sin atender (un rechazo tardío no escapa). */
    const raced = <T,>(promise: Promise<T>): Promise<Settled<T>> => {
      promise.catch(quiet);
      return Promise.race<Settled<T>>([promise.then(value => ({ value }), error => ({ error })), gate.then(reason => ({ stop: reason }))]);
    };
    try {
      // R3 · Una excepción SÍNCRONA del `fetch` inyectado (antes de devolver una promesa) es un fallo de transporte como un rechazo asíncrono: categoría fija, sin su mensaje privado.
      let pending: Promise<Response>;
      try { pending = Promise.resolve(real(url.href, { method: 'GET', headers: { accept: 'application/json', [header.name]: header.value }, redirect: 'manual', signal: controller.signal })); } catch { return stopped ? stoppedFailure() : fail('network'); }
      // Si la parada gana, la respuesta que llegue después se descarta y su cuerpo se cancela sin esperarlo.
      pending.then(late => { if (stopped) void Promise.resolve(late.body?.cancel()).catch(quiet); }, quiet);
      const first = await raced(pending);
      if ('stop' in first || stopped) return stoppedFailure();
      if ('error' in first) return fail('network');
      const response = first.value, status = response.status;
      if (status >= 300 && status < 400 || status === 0) { void Promise.resolve(response.body?.cancel()).catch(quiet); return fail('redirect', status); }
      if (!response.ok) {
        void Promise.resolve(response.body?.cancel()).catch(quiet);
        const stop: SourceStop = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not-found' : status === 429 ? 'rate-limited' : status >= 500 ? 'server-error' : 'client-error';
        return fail(stop, status, status === 429 ? retrySeconds(response.headers.get('retry-after')) : null);
      }
      if (!/\bjson\b/i.test(response.headers.get('content-type') ?? '')) { void Promise.resolve(response.body?.cancel()).catch(quiet); return fail('malformed', status); }
      const lengthHeader = response.headers.get('content-length'), declared = Number(lengthHeader);
      if (lengthHeader !== null && Number.isFinite(declared) && declared > options.maxBodyBytes) { state.truncated++; void Promise.resolve(response.body?.cancel()).catch(quiet); return fail('oversize', status); }
      const reader = response.body?.getReader();
      if (!reader) return fail('malformed', status);
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const step = await raced(reader.read());
        if ('stop' in step || stopped) { void Promise.resolve(reader.cancel()).catch(quiet); return stoppedFailure(); }
        if ('error' in step) return fail('truncated', status);
        if (step.value.done) break;
        size += step.value.value.byteLength;
        if (size > options.maxBodyBytes) { state.truncated++; void Promise.resolve(reader.cancel()).catch(quiet); return fail('oversize', status); }
        chunks.push(step.value.value);
      }
      if (stopped) return stoppedFailure();                                        // última puerta: nada se publica si la parada ocurrió antes de entregar
      state.bytes += size;
      const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
      if (lengthHeader !== null && Number.isFinite(declared) && declared !== size) return fail('truncated', status);
      try { return { ok: true, status, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }; } catch { return fail('malformed', status); }
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener('abort', onCaller);
    }
  }
  return { get, stats: () => ({ requests: state.requests, blocked: [...blocked], truncated: state.truncated, bytes: state.bytes }) };
}
