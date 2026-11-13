import { READ_CHECK_ENTITIES, READ_CHECK_TTL_MS, type ObjectReadResult, type ReadCheckEnvironment, type ReadCheckResult } from '../shared/hubspot-read-check.js';
import { readonlyFetch } from './connection.js';

// Comprobación de LECTURA de HubSpot. Una sola pasada, sin reintentos y sin escribir: identidad de cuenta y un elemento de cada objeto solo para clasificar la respuesta (el cuerpo se descarta).
// Reutiliza el transporte de solo lectura (readonlyFetch: solo api.hubapi.com, solo GET/búsquedas, sin redirecciones). La credencial solo se envía en la cabecera Authorization y NO se copia a ningún resultado, error ni log.
// Rutas de 2026-09 según la documentación oficial vigente (account-info/details y crm/objects/{objeto}). Que esta función funcione contra un servidor ficticio NO prueba una conexión real.
export interface ReadCheckConnection { token: string; accountId: string; mode: 'test' | 'production_readonly' }
export interface ReadCheckOptions { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; signal?: AbortSignal }
const API = 'https://api.hubapi.com', DEFAULT_TIMEOUT_MS = 10_000;
const environmentOf = (type: string | null): ReadCheckEnvironment => type === 'DEVELOPER_TEST' || type === 'SANDBOX' ? 'rehearsal' : type === 'STANDARD' ? 'real' : 'unknown';

type Reply = { kind: 'ok'; json: unknown } | { kind: 'malformed' } | { kind: 'status'; status: number; retryAfter: number | null } | { kind: 'down' };
async function getJson(fetcher: typeof fetch, path: string, token: string, timeoutMs: number, signal?: AbortSignal): Promise<Reply> {
  let response: Response;
  try { response = await fetcher(API + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) }); }
  catch { return { kind: 'down' }; } // red, redirección rechazada, tiempo agotado o cancelación: sin respuesta útil. El motivo concreto puede llevar datos de la petición y no se conserva.
  if (!response.ok) {
    const raw = Number(response.headers.get('retry-after')), retryAfter = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 3600) : null;
    void response.body?.cancel().catch(() => undefined); return { kind: 'status', status: response.status, retryAfter };
  }
  try { return { kind: 'ok', json: await response.json() }; } catch { return { kind: 'malformed' }; } // incluye cuerpo cortado a mitad (respuesta parcial)
}

/** Devuelve siempre un resultado de dominio; nunca lanza por una respuesta del proveedor. Solo `read_verified`/`partial` implican que HubSpot respondió con lectura real. */
export async function checkHubspotRead(connection: ReadCheckConnection, options: ReadCheckOptions = {}): Promise<ReadCheckResult> {
  const now = options.now ?? Date.now, timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS, fetcher = readonlyFetch(options.fetcher ?? fetch);
  const finish = (state: ReadCheckResult['state'], message: string, extra: Partial<ReadCheckResult> = {}): ReadCheckResult => {
    const at = now(); return { state, evidence: extra.evidence ?? 'none', environment: 'unknown', accountId: null, accountType: null, checkedAt: new Date(at).toISOString(), freshUntil: new Date(at + READ_CHECK_TTL_MS).toISOString(), objects: [], retryAfterSeconds: null, message, ...extra };
  };
  if (!/^\d+$/.test(connection.accountId) || connection.token.length < 10) return finish('unavailable', 'La configuración guardada no es válida; no se ha llamado a HubSpot.');

  const identity = await getJson(fetcher, '/account-info/2026-09/details', connection.token, timeoutMs, options.signal);
  if (identity.kind === 'down') return finish('unavailable', 'HubSpot no respondió a tiempo o no se pudo contactar. El acceso actual no está comprobado.');
  if (identity.kind === 'status') {
    if (identity.status === 401) return finish('rejected', 'HubSpot no acepta la credencial guardada (caducada, revocada o incorrecta).', { evidence: 'provider_response' });
    if (identity.status === 403) return finish('insufficient_permissions', 'HubSpot rechazó leer los datos de la cuenta con esta credencial.', { evidence: 'provider_response' });
    return finish('unavailable', identity.status === 429 ? 'HubSpot pidió esperar (límite de uso). El acceso actual no está comprobado.' : 'HubSpot no pudo atender la comprobación (código ' + identity.status + '). El acceso actual no está comprobado.', { evidence: 'provider_response', retryAfterSeconds: identity.status === 429 ? identity.retryAfter : null });
  }
  const body = identity.kind === 'ok' && identity.json && typeof identity.json === 'object' ? identity.json as Record<string, unknown> : null;
  const portalId = body && (typeof body.portalId === 'number' || typeof body.portalId === 'string') ? String(body.portalId) : null, accountType = body && typeof body.accountType === 'string' && /^[A-Z_]{3,40}$/.test(body.accountType) ? body.accountType : null;
  if (!portalId || !accountType) return finish('unavailable', 'La respuesta de HubSpot no tiene el formato esperado; no se interpreta como una comprobación.', { evidence: 'provider_response' });
  if (portalId !== connection.accountId) return finish('identity_mismatch', 'La credencial guardada pertenece a un portal distinto del configurado.', { evidence: 'provider_response' });
  const environment = environmentOf(accountType);
  if (connection.mode === 'production_readonly' ? environment !== 'real' : environment !== 'rehearsal') return finish('account_type_mismatch', 'El tipo de cuenta (' + accountType + ') no coincide con el modo configurado.', { evidence: 'provider_response', environment, accountId: portalId, accountType });

  const objects: ObjectReadResult[] = [];
  let retryAfter: number | null = null, rejected = false;
  for (const entity of READ_CHECK_ENTITIES) {
    if (rejected) { objects.push({ entity, outcome: 'not_attempted', httpStatus: null }); continue; }
    const r = await getJson(fetcher, '/crm/objects/2026-09/' + entity + '?limit=1&properties=hs_object_id', connection.token, timeoutMs, options.signal);
    if (r.kind === 'down') objects.push({ entity, outcome: 'unavailable', httpStatus: null });
    else if (r.kind === 'malformed') objects.push({ entity, outcome: 'malformed', httpStatus: 200 });
    else if (r.kind === 'status') {
      if (r.status === 401) { rejected = true; objects.push({ entity, outcome: 'rejected', httpStatus: 401 }); }
      else if (r.status === 403) objects.push({ entity, outcome: 'forbidden', httpStatus: 403 });
      else { if (r.status === 429 && r.retryAfter) retryAfter = Math.max(retryAfter ?? 0, r.retryAfter); objects.push({ entity, outcome: 'unavailable', httpStatus: r.status }); }
    } else objects.push(r.json && typeof r.json === 'object' && Array.isArray((r.json as { results?: unknown }).results) ? { entity, outcome: 'readable', httpStatus: 200 } : { entity, outcome: 'malformed', httpStatus: 200 });
  }
  const common = { evidence: 'provider_response' as const, environment, accountId: portalId, accountType, objects, retryAfterSeconds: retryAfter };
  const readable = objects.filter(o => o.outcome === 'readable').length;
  if (rejected) return finish('rejected', 'HubSpot dejó de aceptar la credencial durante la comprobación.', common);
  if (readable === objects.length) return finish('read_verified', 'HubSpot respondió: cuenta ' + (environment === 'rehearsal' ? 'de ensayo' : 'real') + ' del portal esperado y lectura permitida en los cuatro objetos.', common);
  if (readable > 0) return finish('partial', 'La cuenta es la esperada, pero solo se pudo leer ' + readable + ' de ' + objects.length + ' objetos (' + objects.filter(o => o.outcome !== 'readable').map(o => o.entity).join(', ') + ').', common);
  if (objects.some(o => o.outcome === 'forbidden')) return finish('insufficient_permissions', 'La cuenta es la esperada, pero la credencial no tiene permiso de lectura sobre los objetos.', common);
  return finish('unavailable', 'La cuenta es la esperada, pero no se pudo comprobar la lectura de los objetos.', common);
}
