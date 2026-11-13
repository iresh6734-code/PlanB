// Transporte protegido para la comprobación REAL de lectura de HubSpot. Envuelve un fetch y garantiza, en el borde de red y con independencia de la lógica de `checkHubspotRead`:
// como máximo 5 GET, cada ruta exacta una sola vez (sin reintentos ni repeticiones), solo api.hubapi.com, solo las cabeceras y la consulta previstas, sin cuerpo, sin seguir redirecciones,
// tope de bytes por respuesta (al superarlo se rechaza la respuesta ENTERA, nunca se entrega un prefijo) y respuestas de error sin cuerpo. Lo que se rechaza se cuenta en `blocked` (sin copiar la URL completa ni cabeceras) para que la salida lo muestre.
export const LIVE_READ_PATHS = ['/account-info/2026-09/details', '/crm/objects/2026-09/contacts', '/crm/objects/2026-09/companies', '/crm/objects/2026-09/deals', '/crm/objects/2026-09/tasks'] as const;
export const LIVE_MAX_REQUESTS = LIVE_READ_PATHS.length, LIVE_MAX_BODY_BYTES = 64 * 1024;
const OBJECT_QUERY = 'limit=1&properties=hs_object_id';
export interface GuardStats { requests: number; blocked: string[]; truncated: number }
/** Respuesta cuyo cuerpo falla al leerse: `response.json()` rechaza y ningún byte de la respuesta original llega al llamador. */
const overLimit = (status: number): Response => new Response(new ReadableStream({ start: c => c.error(new Error('RESPUESTA_EXCEDE_TOPE')) }), { status, headers: { 'content-type': 'application/json' } });
export function guardedReadFetch(real: typeof fetch, options: { maxBodyBytes?: number } = {}): { fetch: typeof fetch; stats: () => GuardStats } {
  const cap = options.maxBodyBytes ?? LIVE_MAX_BODY_BYTES, used = new Set<string>(), stats: GuardStats = { requests: 0, blocked: [], truncated: 0 };
  const refuse = (why: string): never => { stats.blocked.push(why); throw new Error('PETICION_NO_PERMITIDA: ' + why); };
  const guarded = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    let url: URL; try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); } catch { return refuse('url-no-valida'); }
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') refuse('metodo-' + method.slice(0, 8));
    if (init?.body != null) refuse('con-cuerpo');
    if (url.origin !== 'https://api.hubapi.com' || url.username || url.password || url.hash) refuse('destino-no-permitido');
    if (!(LIVE_READ_PATHS as readonly string[]).includes(url.pathname)) refuse('ruta-no-prevista');
    if (url.search !== (url.pathname === LIVE_READ_PATHS[0] ? '' : '?' + OBJECT_QUERY)) refuse('consulta-no-prevista');
    if (used.has(url.pathname)) refuse('repeticion');
    if (stats.requests >= LIVE_MAX_REQUESTS) refuse('presupuesto-agotado');
    const names = new Headers(init?.headers).keys(); for (const n of names) if (n !== 'authorization' && n !== 'accept') refuse('cabecera-no-prevista');
    if (init?.redirect !== undefined && init.redirect !== 'error') refuse('redireccion');
    used.add(url.pathname); stats.requests++;
    const response = await real(url.href, { method: 'GET', headers: init?.headers, signal: init?.signal, redirect: 'error' });
    if (!response.ok) { void response.body?.cancel().catch(() => undefined); const retry = response.headers.get('retry-after'); return new Response(null, { status: response.status, headers: retry ? { 'retry-after': retry } : {} }); } // sin cuerpo de error
    // Una respuesta que supera el tope se RECHAZA ENTERA: se cancela la lectura y no se entrega ni un byte (un prefijo puede ser JSON completo seguido de relleno y el documento recibido, en cambio, no es válido).
    // El módulo la recibe como cuerpo ilegible (`malformed`): la identidad detiene la secuencia y un objeto nunca cuenta como legible. Un cuerpo de EXACTAMENTE `cap` bytes es válido.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) { stats.truncated++; void response.body?.cancel().catch(() => undefined); return overLimit(response.status); }
    const reader = response.body?.getReader(); if (!reader) return new Response('', { status: response.status });
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (total + value.byteLength > cap) { stats.truncated++; await reader.cancel().catch(() => undefined); return overLimit(response.status); }
      chunks.push(value); total += value.byteLength;
    }
    const all = new Uint8Array(total); let at = 0; for (const c of chunks) { all.set(c, at); at += c.byteLength; }
    return new Response(all, { status: response.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: guarded, stats: () => ({ requests: stats.requests, blocked: [...stats.blocked], truncated: stats.truncated }) };
}
