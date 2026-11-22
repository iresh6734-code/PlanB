// Plan B Verifica · lector de HubSpot en solo lectura (fase 1).
// Recorre comerciales, etapas, empresas, contactos y oportunidades con su historial, comprueba los recuentos y
// devuelve la captura solo si llegó entera. La traducción es pura y está en shared/verifica/hubspot.ts.
// Reglas: solo GET a api.hubapi.com, más las búsquedas de recuento (POST /search); la credencial va en la cabecera,
// nunca en la URL; sin redirecciones. No importa server/store.ts para no cargar el cifrado local.
// No se ejecuta en el equipo de la empresa: allí solo corre con un `fetch` simulado (tests/verifica-lectores.test.ts).
import {
  ACCOUNT_PATH, HUBSPOT_API, PIPELINES_PATH, VerificaReadError, countPath, hubspotCapture, nextCursor, objectsPath, ownersPath, pageResults,
  type HubspotObject, type HubspotVerificaOptions,
} from '../../shared/verifica/hubspot.js';
import type { VerificaCapture } from '../../shared/verifica/model.js';

export interface HubspotReaderLimits { maxPages: number; maxRecords: number; requestTimeoutMs: number }
export const defaultHubspotReaderLimits: HubspotReaderLimits = { maxPages: 2_000, maxRecords: 100_000, requestTimeoutMs: 30_000 };

export interface HubspotReaderOptions extends HubspotVerificaOptions {
  token: string;
  /** ID de la cuenta (portal) que se espera leer. Si la credencial es de otra, se para. */
  accountId: string;
  /** `test`: solo cuentas de pruebas (DEVELOPER_TEST o SANDBOX). `production_readonly`: una cuenta STANDARD, en lectura. */
  mode: 'test' | 'production_readonly';
  fetcher: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
  limits?: Partial<HubspotReaderLimits>;
  /** Espera entre reintentos (429 o 5xx). Inyectable para las pruebas. */
  sleep?: (ms: number) => Promise<void>;
  progress?: (message: string) => void;
}

export interface HubspotReading { capture: VerificaCapture; account: { portalId: string; accountType: string }; requests: number }

const COUNT_POST = /^\/crm\/v3\/objects\/(contacts|companies|deals)\/search$/;
const ACCOUNT_TYPES: Record<HubspotReaderOptions['mode'], readonly string[]> = { test: ['DEVELOPER_TEST', 'SANDBOX'], production_readonly: ['STANDARD'] };

export async function readHubspotForVerifica(options: HubspotReaderOptions): Promise<HubspotReading> {
  const limits = { ...defaultHubspotReaderLimits, ...options.limits };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  if (!/^\d{1,20}$/.test(options.accountId)) throw new VerificaReadError('INVALID_OPTION', 'Indica el ID numérico de la cuenta de HubSpot.');
  if (!options.token || options.token.length < 10 || /\s/.test(options.token)) throw new VerificaReadError('INVALID_OPTION', 'Falta una credencial de lectura de HubSpot.');
  let requests = 0, pages = 0, records = 0;

  async function call(path: string, body?: unknown): Promise<unknown> {
    const method = body === undefined ? 'GET' : 'POST';
    const url = new URL(path, HUBSPOT_API);
    if (url.origin !== HUBSPOT_API || (method === 'POST' && !COUNT_POST.test(url.pathname))) throw new VerificaReadError('BLOCKED', 'El lector de Verifica solo hace lecturas en HubSpot.');
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      requests++;
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(limits.requestTimeoutMs);
        response = await options.fetcher(url.toString(), {
          method, redirect: 'error',
          headers: { Authorization: 'Bearer ' + options.token, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        });
      } catch {
        options.signal?.throwIfAborted();
        throw new VerificaReadError('NETWORK', 'No se pudo conectar con HubSpot.');
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const seconds = Math.min(Math.max(Number(response.headers.get('retry-after')) || 1, 1), 10);
        await response.body?.cancel().catch(() => undefined);
        await sleep(seconds * 1000);
        continue;
      }
      if (response.status === 401) throw new VerificaReadError('UNAUTHORIZED', 'HubSpot no aceptó la credencial.');
      if (response.status === 403) throw new VerificaReadError('FORBIDDEN', 'Faltan permisos de lectura en HubSpot (oportunidades, empresas, contactos o comerciales).');
      if (response.status === 400) throw new VerificaReadError('BAD_REQUEST', 'HubSpot rechazó la petición (400). Puede que la cuenta no admita el historial de propiedades.');
      if (response.status !== 200) throw new VerificaReadError('INCOMPLETE', 'HubSpot devolvió una lectura incompleta (' + response.status + ').');
      try { return await response.json(); } catch { throw new VerificaReadError('MALFORMED', 'HubSpot devolvió una respuesta que no es JSON.'); }
    }
  }

  async function collect(pathFor: (after: string | null) => string, what: string): Promise<unknown[]> {
    const items: unknown[] = [];
    const seen = new Set<string>();
    let after: string | null = null;
    do {
      if (++pages > limits.maxPages) throw new VerificaReadError('PAGE_BUDGET', 'La lectura supera el máximo de páginas. No se publica una captura a medias.');
      const page = await call(pathFor(after));
      const results = pageResults(page);
      records += results.length;
      if (records > limits.maxRecords) throw new VerificaReadError('RECORD_BUDGET', 'La cuenta supera el máximo de registros de una lectura.');
      const next = nextCursor(page);
      if (!results.length && next !== null) throw new VerificaReadError('MALFORMED', 'HubSpot devolvió una página vacía con cursor siguiente.');
      if (next !== null && seen.has(next)) throw new VerificaReadError('CURSOR_LOOP', 'HubSpot repitió un cursor de paginación.');
      if (next !== null) seen.add(next);
      items.push(...results);
      after = next;
    } while (after !== null);
    options.progress?.(what + ': ' + items.length);
    return items;
  }

  async function checkCount(object: HubspotObject, items: unknown[]) {
    const result = await call(countPath(object), { limit: 1 });
    const total = typeof result === 'object' && result !== null ? (result as { total?: unknown }).total : undefined;
    if (typeof total !== 'number' || total !== items.length) throw new VerificaReadError('COUNT_MISMATCH', 'El recuento de ' + object + ' no coincide con lo leído. Espera a que el CRM termine de actualizarse y vuelve a leer.');
  }

  const account = await call(ACCOUNT_PATH) as { portalId?: unknown; accountType?: unknown } | null;
  const portalId = String(account?.portalId ?? ''), accountType = String(account?.accountType ?? '');
  if (portalId !== options.accountId) throw new VerificaReadError('WRONG_ACCOUNT', 'La credencial no corresponde a la cuenta indicada.');
  if (!ACCOUNT_TYPES[options.mode].includes(accountType)) throw new VerificaReadError('WRONG_ACCOUNT_TYPE', options.mode === 'test' ? 'En modo de pruebas solo se leen cuentas de pruebas o sandbox.' : 'En producción solo se lee una cuenta STANDARD.');

  const pipelines = await call(PIPELINES_PATH);
  const owners = await collect(ownersPath, 'comerciales');
  const companies = await collect(after => objectsPath('companies', after, options), 'empresas');
  await checkCount('companies', companies);
  const contacts = await collect(after => objectsPath('contacts', after, options), 'contactos');
  await checkCount('contacts', contacts);
  const deals = await collect(after => objectsPath('deals', after, options), 'oportunidades');
  await checkCount('deals', deals);

  const capturedAt = (options.now?.() ?? new Date()).toISOString();
  const capture = hubspotCapture({ capturedAt, accountId: portalId, pipelines, owners, companies, contacts, deals }, options);
  return { capture, account: { portalId, accountType }, requests };
}
