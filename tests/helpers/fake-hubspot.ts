// HubSpot falso en memoria para las pruebas de Verifica (sin red). Sirve una captura como lo haría la API v3: páginas,
// historial del más reciente al más antiguo, fechas en ISO o en milisegundos, recuentos por búsqueda. Lo usan
// tests/verifica-lectores.test.ts, tests/verifica-lectura.test.ts y el servidor de ensayo de la pantalla de capturas.
import type { HistoryEntry, VerificaCapture } from '../../shared/verifica/model.js';

export const FAKE_PORTAL = '4400123';
const STAGE = { open: 'appointmentscheduled', won: 'closedwon', lost: 'closedlost' } as const;

export interface FakeOptions {
  accountType?: string;
  portalId?: string;
  /** Oportunidades a las que HubSpot no devuelve el historial. */
  withoutHistory?: string[];
  /** Diferencia que se suma al total de la búsqueda de recuento. */
  countSkew?: number;
  /** Respuestas forzadas por orden de petición (status), antes de la respuesta normal. */
  failures?: number[];
  loopCursor?: boolean;
}

export interface Logged { method: string; url: URL; auth: string | null; body: string | null }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Un HubSpot en memoria con una captura de la empresa con trampas. */
export function fakeHubspot(capture: VerificaCapture, options: FakeOptions = {}) {
  const log: Logged[] = [];
  const failures = [...(options.failures ?? [])];
  const stamp = (at: string, i: number) => i % 2 ? String(Date.parse(at)) : at;
  const history = (entries: HistoryEntry[], i: number) => [...entries].reverse().map(e => ({ value: e.value === null ? '' : String(e.value), timestamp: stamp(e.at, i), sourceType: 'CRM_UI' }));
  const deals = capture.deals.map((d, i) => ({
    id: d.id,
    properties: {
      dealname: d.name, amount: d.amount === null ? null : String(d.amount), dealstage: STAGE[d.status], pipeline: 'default',
      closedate: d.closeDate === null ? null : d.closeDate + 'T00:00:00Z', createdate: d.createdAt, hubspot_owner_id: d.ownerId,
    },
    ...(d.history && !options.withoutHistory?.includes(d.id) ? { propertiesWithHistory: { amount: history(d.history.amount, i), closedate: history(d.history.closeDate, i + 1) } } : {}),
    ...(d.companyId ? { associations: { companies: { results: [{ id: d.companyId, type: 'deal_to_company_unlabeled' }, { id: d.companyId, type: 'deal_to_company' }] } } } : {}),
  }));
  const objects: Record<string, unknown[]> = {
    deals,
    companies: capture.companies.map(c => ({ id: c.id, properties: { name: c.name, lifecyclestage: c.customer ? 'customer' : 'lead' } })),
    contacts: capture.contacts.map(p => ({ id: p.id, properties: { firstname: p.name, lastname: null, email: p.email, associatedcompanyid: p.companyId } })),
  };
  const owners = capture.owners.map(o => ({ id: o.id, firstName: o.name, lastName: '', email: o.id + '@vendedor.example' }));
  const page = (items: unknown[], url: URL) => {
    const limit = Number(url.searchParams.get('limit')), offset = Number(url.searchParams.get('after') ?? 0);
    const next = offset + limit < items.length ? String(options.loopCursor ? limit : offset + limit) : null;
    return json({ results: items.slice(offset, offset + limit), ...(next ? { paging: { next: { after: next, link: 'https://api.hubapi.com/no-seguir' } } } : {}) });
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    log.push({ method: init?.method ?? 'GET', url, auth: headers.get('authorization'), body: typeof init?.body === 'string' ? init.body : null });
    const forced = failures.shift();
    if (forced) return json({ status: 'error' }, forced);
    if (url.origin !== 'https://api.hubapi.com') return json({}, 404);
    if (url.pathname === '/account-info/v3/details') return json({ portalId: Number(options.portalId ?? FAKE_PORTAL), accountType: options.accountType ?? 'DEVELOPER_TEST', timeZone: 'Europe/Madrid' });
    if (url.pathname === '/crm/v3/pipelines/deals') return json({ results: [{ id: 'default', stages: [
      { id: STAGE.open, metadata: { isClosed: 'false', probability: '0.2' } },
      { id: STAGE.won, metadata: { isClosed: 'true', probability: '1.0' } },
      { id: STAGE.lost, metadata: { isClosed: 'true', probability: '0.0' } },
    ] }] });
    if (url.pathname === '/crm/v3/owners') return page(owners, url);
    const search = /^\/crm\/v3\/objects\/(\w+)\/search$/.exec(url.pathname);
    if (search && init?.method === 'POST') return json({ total: objects[search[1]!]!.length + (search[1] === 'deals' ? options.countSkew ?? 0 : 0), results: [] });
    const list = /^\/crm\/v3\/objects\/(\w+)$/.exec(url.pathname);
    if (list && objects[list[1]!]) return page(objects[list[1]!]!, url);
    return json({}, 404);
  }) as typeof fetch;
  return { fetcher, log };
}
