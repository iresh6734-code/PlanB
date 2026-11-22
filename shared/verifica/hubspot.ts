// Plan B Verifica · traducción de las respuestas de HubSpot (API v3 de CRM) a una captura de Verifica.
// Puro: recibe el JSON ya leído y no hace red. El recorrido está en server/verifica/hubspot-reader.ts.
// Estricto como el importador de la App: un registro ilegible para la lectura entera; nunca se publica una captura a medias.
//
// Lo que se pide a HubSpot y por qué:
//   · oportunidades: importe, etapa, fecha de cierre, fecha de creación y comercial, más el historial de importe y fecha de cierre
//     (`propertiesWithHistory`, que obliga a páginas de 50) y la empresa asociada (`associations=companies`);
//   · etapas del proceso comercial: `metadata.isClosed` y `metadata.probability` dicen si una etapa es ganada o perdida;
//   · comerciales (`/crm/v3/owners`), empresas (fase del ciclo de vida) y contactos (empresa principal).
// Sin validar contra una cuenta real: el formato del historial sale de la documentación pública de HubSpot. Ver la prueba
// en el portal de pruebas (scripts/verifica-hubspot.ts) antes de prometer la trampa de fechas aplazadas.
import type { DealStatus, HistoryEntry, VerificaCapture, VerificaCompany, VerificaContact, VerificaDeal, VerificaOwner } from './model.js';

export const HUBSPOT_API = 'https://api.hubapi.com';
/** HubSpot rechaza con 400 más de 50 registros por página cuando se pide `propertiesWithHistory`. */
export const HUBSPOT_HISTORY_PAGE = 50;
export const HUBSPOT_PAGE = 100;

export type HubspotObject = 'deals' | 'companies' | 'contacts';

export interface HubspotVerificaOptions {
  /** Fases del ciclo de vida de empresa que cuentan como cliente. Por defecto, `customer`. */
  customerStages?: readonly string[];
  /** Propiedad de empresa con el NIF o CIF, si el CRM la tiene. Sin ella, las facturas se cruzan solo por nombre. */
  taxIdProperty?: string | null;
}

const PROPERTY_NAME = /^[a-z][a-z0-9_]{0,99}$/;
const DEAL_PROPERTIES = ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate', 'hubspot_owner_id'] as const;
const DEAL_HISTORY = ['amount', 'closedate'] as const;
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'associatedcompanyid'] as const;

export class VerificaReadError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'VerificaReadError'; }
}
const fail = (code: string, message: string): never => { throw new VerificaReadError(code, message); };

export function companyProperties(options: HubspotVerificaOptions = {}): string[] {
  const extra = options.taxIdProperty ?? null;
  if (extra !== null && !PROPERTY_NAME.test(extra)) fail('INVALID_OPTION', 'El nombre de la propiedad del NIF no es válido.');
  return ['name', 'lifecyclestage', ...(extra && extra !== 'name' && extra !== 'lifecyclestage' ? [extra] : [])];
}

/** Ruta de una página de objetos. El cursor se vuelve a codificar: nunca se sigue una URL de la respuesta. */
export function objectsPath(object: HubspotObject, after: string | null, options: HubspotVerificaOptions = {}): string {
  const params = new URLSearchParams({ archived: 'false' });
  if (object === 'deals') {
    params.set('limit', String(HUBSPOT_HISTORY_PAGE));
    params.set('properties', DEAL_PROPERTIES.join(','));
    params.set('propertiesWithHistory', DEAL_HISTORY.join(','));
    params.set('associations', 'companies');
  } else {
    params.set('limit', String(HUBSPOT_PAGE));
    params.set('properties', (object === 'companies' ? companyProperties(options) : [...CONTACT_PROPERTIES]).join(','));
  }
  if (after !== null) params.set('after', after);
  return '/crm/v3/objects/' + object + '?' + params.toString();
}

export const ownersPath = (after: string | null) => '/crm/v3/owners?' + new URLSearchParams({ limit: String(HUBSPOT_PAGE), archived: 'false', ...(after === null ? {} : { after }) }).toString();
export const PIPELINES_PATH = '/crm/v3/pipelines/deals';
export const ACCOUNT_PATH = '/account-info/v3/details';
export const countPath = (object: HubspotObject) => '/crm/v3/objects/' + object + '/search';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() !== '' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;

/** Cursor de la página siguiente, o null al final. Un cursor raro para la lectura. */
export function nextCursor(page: unknown): string | null {
  if (!isRecord(page)) return fail('MALFORMED', 'HubSpot devolvió una página no válida.');
  const next = isRecord(page.paging) && isRecord(page.paging.next) ? page.paging.next.after : undefined;
  if (next === undefined || next === null) return null;
  if (typeof next === 'number' && Number.isSafeInteger(next) && next >= 0) return String(next);
  if (typeof next === 'string' && /^[A-Za-z0-9_=+/-]{1,200}$/.test(next)) return next;
  return fail('MALFORMED', 'HubSpot devolvió un cursor de paginación no válido.');
}

export function pageResults(page: unknown): unknown[] {
  if (!isRecord(page) || !Array.isArray(page.results)) return fail('MALFORMED', 'HubSpot no devolvió la colección completa.');
  return page.results;
}

/** Instante ISO desde lo que use HubSpot: texto ISO o milisegundos (número o texto de dígitos). */
export function hubspotInstant(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : typeof value === 'string' && /^\d{10,16}$/.test(value) ? Number(value) : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Fecha AAAA-MM-DD de una fecha de cierre. HubSpot guarda las fechas como medianoche UTC. */
export function hubspotDate(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return hubspotInstant(value)?.slice(0, 10) ?? null;
}

export function hubspotAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(amount) ? amount : fail('MALFORMED', 'Hay un importe no numérico en una oportunidad.');
}

/** Estado de cada etapa según los metadatos del proceso comercial. */
export function stageStatuses(pipelines: unknown): Map<string, DealStatus> {
  const statuses = new Map<string, DealStatus>();
  for (const pipeline of pageResults(pipelines)) {
    if (!isRecord(pipeline) || !Array.isArray(pipeline.stages)) fail('MALFORMED', 'HubSpot devolvió un proceso comercial sin etapas.');
    for (const stage of (pipeline as { stages: unknown[] }).stages) {
      const id = isRecord(stage) ? text(stage.id) : null;
      const metadata = isRecord(stage) && isRecord(stage.metadata) ? stage.metadata : null;
      if (!id || !metadata) return fail('MALFORMED', 'HubSpot devolvió una etapa sin metadatos.');
      const closed = String(metadata.isClosed) === 'true';
      const probability = Number(metadata.probability);
      if (closed && !(probability === 0 || probability === 1)) return fail('UNKNOWN_STAGE', 'Una etapa cerrada no dice si es ganada o perdida (probabilidad ' + String(metadata.probability) + ').');
      const status: DealStatus = !closed ? 'open' : probability === 1 ? 'won' : 'lost';
      if (statuses.has(id) && statuses.get(id) !== status) return fail('UNKNOWN_STAGE', 'Dos etapas con el mismo ID tienen distinto estado.');
      statuses.set(id, status);
    }
  }
  if (!statuses.size) fail('MALFORMED', 'La cuenta no tiene ningún proceso comercial.');
  return statuses;
}

function recordOf(raw: unknown, object: string): { id: string; properties: Record<string, unknown> } {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !/^\S{1,64}$/.test(raw.id) || !isRecord(raw.properties)) return fail('MALFORMED', 'HubSpot devolvió un registro de ' + object + ' no válido.');
  return { id: raw.id, properties: raw.properties };
}

export function parseOwner(raw: unknown): VerificaOwner {
  if (!isRecord(raw)) return fail('MALFORMED', 'HubSpot devolvió un comercial no válido.');
  const id = text(raw.id);
  if (!id) return fail('MALFORMED', 'HubSpot devolvió un comercial sin ID.');
  const name = [text(raw.firstName), text(raw.lastName)].filter(Boolean).join(' ') || text(raw.email) || 'Comercial ' + id;
  return { id, name };
}

export function parseCompany(raw: unknown, options: HubspotVerificaOptions = {}): VerificaCompany {
  const { id, properties } = recordOf(raw, 'empresas');
  const stages = options.customerStages ?? ['customer'];
  const stage = text(properties.lifecyclestage);
  const company: VerificaCompany = { id, name: text(properties.name) ?? 'Empresa ' + id, customer: stage !== null && stages.includes(stage) };
  if (options.taxIdProperty) company.taxId = text(properties[options.taxIdProperty]);
  return company;
}

export function parseContact(raw: unknown): VerificaContact {
  const { id, properties } = recordOf(raw, 'contactos');
  const email = text(properties.email);
  return { id, name: [text(properties.firstname), text(properties.lastname)].filter(Boolean).join(' ') || email || 'Contacto ' + id, email, companyId: text(properties.associatedcompanyid) };
}

/** Historial de una propiedad, del más antiguo al más reciente. HubSpot lo devuelve del más reciente al más antiguo. */
export function parseHistory(raw: unknown, kind: 'amount' | 'date'): HistoryEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return fail('MALFORMED', 'HubSpot devolvió un historial de propiedad no válido.');
  const entries = raw.map((entry, index) => {
    if (!isRecord(entry)) return fail('MALFORMED', 'HubSpot devolvió un cambio de propiedad no válido.');
    const at = hubspotInstant(entry.timestamp);
    if (!at) return fail('MALFORMED', 'Un cambio de propiedad no tiene fecha.');
    const value = kind === 'amount' ? hubspotAmount(entry.value) : hubspotDate(entry.value);
    return { index, entry: { value, at } as HistoryEntry };
  });
  // Estable: a igual instante se respeta el orden inverso de HubSpot (el último de la lista es el más antiguo).
  return entries.sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at) || b.index - a.index).map(item => item.entry);
}

function primaryCompany(raw: Record<string, unknown>): string | null {
  const associations = isRecord(raw.associations) && isRecord(raw.associations.companies) ? raw.associations.companies.results : undefined;
  if (associations === undefined) return null;
  if (!Array.isArray(associations)) return fail('MALFORMED', 'HubSpot devolvió asociaciones no válidas.');
  const links = associations.filter(isRecord).map(link => ({ id: text(link.id), type: typeof link.type === 'string' ? link.type : '' })).filter(link => link.id);
  return (links.find(link => link.type === 'deal_to_company') ?? links[0])?.id ?? null;
}

/** Una oportunidad. `history` es null si HubSpot no devolvió `propertiesWithHistory` para ella. */
export function parseDeal(raw: unknown, statuses: Map<string, DealStatus>): VerificaDeal {
  const { id, properties } = recordOf(raw, 'oportunidades');
  const stage = text(properties.dealstage);
  const status = stage ? statuses.get(stage) : undefined;
  if (!status) return fail('UNKNOWN_STAGE', 'Una oportunidad está en una etapa que no aparece en los procesos comerciales.');
  const createdAt = hubspotInstant(properties.createdate);
  if (!createdAt) return fail('MALFORMED', 'Una oportunidad no tiene fecha de creación.');
  const withHistory = (raw as Record<string, unknown>).propertiesWithHistory;
  const history = isRecord(withHistory) ? { amount: parseHistory(withHistory.amount, 'amount'), closeDate: parseHistory(withHistory.closedate, 'date') } : null;
  return {
    id, name: text(properties.dealname) ?? 'Oportunidad ' + id, companyId: primaryCompany(raw as Record<string, unknown>), ownerId: text(properties.hubspot_owner_id),
    status, amount: hubspotAmount(properties.amount), createdAt, closeDate: hubspotDate(properties.closedate), history,
  };
}

export interface HubspotPages {
  capturedAt: string;
  accountId: string;
  pipelines: unknown;
  owners: unknown[];
  companies: unknown[];
  contacts: unknown[];
  deals: unknown[];
}

/** Una captura de Verifica a partir de las páginas ya leídas. Hay historial solo si llegó en todas las oportunidades. */
export function hubspotCapture(pages: HubspotPages, options: HubspotVerificaOptions = {}): VerificaCapture {
  const statuses = stageStatuses(pages.pipelines);
  const unique = <T extends { id: string }>(items: T[], what: string): T[] => {
    const seen = new Set<string>();
    for (const item of items) { if (seen.has(item.id)) fail('DUPLICATE_ID', 'HubSpot repitió un ID en ' + what + '.'); seen.add(item.id); }
    return items;
  };
  const deals = unique(pages.deals.map(raw => parseDeal(raw, statuses)), 'oportunidades');
  const historyAvailable = deals.every(deal => deal.history !== null);
  return {
    id: 'hubspot-' + pages.accountId + '-' + pages.capturedAt,
    capturedAt: pages.capturedAt,
    source: 'hubspot',
    historyAvailable,
    owners: unique(pages.owners.map(parseOwner), 'comerciales'),
    companies: unique(pages.companies.map(raw => parseCompany(raw, options)), 'empresas'),
    contacts: unique(pages.contacts.map(parseContact), 'contactos'),
    // Si falta el historial en alguna, no se mezclan oportunidades con y sin él: las reglas lo tratan como «sin historial».
    deals: historyAvailable ? deals : deals.map(deal => ({ ...deal, history: null })),
  };
}
