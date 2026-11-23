// Plan B Verifica · fase 5: autorización de lectura del portal de un cliente y acta de la lectura. Puro y sin red.
// La autorización es el registro técnico de un documento firmado aparte (el texto legal es de los abogados): qué portal,
// para qué encargo, quién firma, desde cuándo y hasta cuándo, y qué se puede leer. Sin ella no se hace ni una petición.
// El acta deja constancia de la lectura: quién la autorizó, qué peticiones se hicieron y la huella exacta de la captura.
import { sha256Hex } from '../sha256.js';
import { fingerprintOf } from './report.js';

/** Lo que lee siempre el lector de HubSpot. La autorización tiene que cubrirlo entero. */
export const READ_SCOPE = ['owners', 'companies', 'contacts', 'deals_with_history'] as const;
const SCOPE_LABEL: Record<(typeof READ_SCOPE)[number], string> = {
  owners: 'comerciales', companies: 'empresas', contacts: 'contactos', deals_with_history: 'oportunidades con historial',
};

export interface ReadAuthorization {
  kind: 'verifica-read-authorization';
  version: 1;
  /** ID del portal de HubSpot del cliente. */
  portalId: string;
  /** Referencia del encargo, la misma del contrato. */
  engagement: string;
  authorizedBy: { name: string; role: string; company: string };
  /** Fechas en AAAA-MM-DD, hora de Madrid. `validUntil` incluida. */
  signedOn: string;
  validUntil: string;
  scope: string[];
  /** sha256 del documento firmado (PDF u otro): se comprueba contra el archivo antes de leer. */
  signedDocumentSha256: string;
}

export class ReadAuthorizationError extends Error {
  constructor(readonly code: 'MALFORMED' | 'WRONG_PORTAL' | 'NOT_YET_VALID' | 'EXPIRED' | 'SCOPE' | 'DOCUMENT_MISMATCH', message: string) { super(message); this.name = 'ReadAuthorizationError'; }
}

const KEYS = ['kind', 'version', 'portalId', 'engagement', 'authorizedBy', 'signedOn', 'validUntil', 'scope', 'signedDocumentSha256'];
const PERSON_KEYS = ['name', 'role', 'company'];

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ReadAuthorizationError('MALFORMED', 'La autorización necesita «' + field + '» (texto de 1 a ' + max + ' caracteres).');
  return value.trim();
}

/** Fecha de hoy en Madrid, AAAA-MM-DD. */
export function madridDay(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Valida la forma. Rechaza claves desconocidas para que una errata (p. ej. «validUnitl») no pase en silencio. */
export function parseReadAuthorization(raw: unknown): ReadAuthorization {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ReadAuthorizationError('MALFORMED', 'La autorización no es un objeto JSON.');
  const value = raw as Record<string, unknown>;
  const unknown = Object.keys(value).filter(k => !KEYS.includes(k));
  if (unknown.length) throw new ReadAuthorizationError('MALFORMED', 'La autorización tiene campos que no se conocen: ' + unknown.join(', ') + '.');
  if (value.kind !== 'verifica-read-authorization' || value.version !== 1) throw new ReadAuthorizationError('MALFORMED', 'No es una autorización de lectura de Verifica (kind «verifica-read-authorization», version 1).');
  if (typeof value.portalId !== 'string' || !/^\d{1,20}$/.test(value.portalId)) throw new ReadAuthorizationError('MALFORMED', 'La autorización necesita «portalId», el ID numérico del portal, entre comillas.');
  const person = value.authorizedBy;
  if (typeof person !== 'object' || person === null || Array.isArray(person) || Object.keys(person).some(k => !PERSON_KEYS.includes(k))) throw new ReadAuthorizationError('MALFORMED', 'La autorización necesita «authorizedBy» con name, role y company.');
  const p = person as Record<string, unknown>;
  if (!isDay(value.signedOn) || !isDay(value.validUntil)) throw new ReadAuthorizationError('MALFORMED', '«signedOn» y «validUntil» tienen que ser fechas reales en formato AAAA-MM-DD.');
  if (value.validUntil < value.signedOn) throw new ReadAuthorizationError('MALFORMED', '«validUntil» es anterior a «signedOn».');
  if (!Array.isArray(value.scope) || !value.scope.every(s => typeof s === 'string')) throw new ReadAuthorizationError('MALFORMED', '«scope» tiene que ser una lista: ' + READ_SCOPE.join(', ') + '.');
  if (typeof value.signedDocumentSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.signedDocumentSha256)) throw new ReadAuthorizationError('MALFORMED', '«signedDocumentSha256» tiene que ser la huella sha256 del documento firmado (64 caracteres hexadecimales).');
  return {
    kind: 'verifica-read-authorization', version: 1, portalId: value.portalId, engagement: text(value.engagement, 'engagement', 80),
    authorizedBy: { name: text(p.name, 'authorizedBy.name', 120), role: text(p.role, 'authorizedBy.role', 120), company: text(p.company, 'authorizedBy.company', 200) },
    signedOn: value.signedOn, validUntil: value.validUntil, scope: [...value.scope as string[]], signedDocumentSha256: value.signedDocumentSha256.toLowerCase(),
  };
}

/** Comprueba que la autorización sirve para esta lectura, hoy y con este documento. Lanza el primer motivo que la para. */
export function checkReadAuthorization(auth: ReadAuthorization, context: { portalId: string; today: string; documentSha256: string }): void {
  if (auth.portalId !== context.portalId) throw new ReadAuthorizationError('WRONG_PORTAL', 'La autorización es del portal ' + auth.portalId + ', no del ' + context.portalId + '.');
  if (context.today < auth.signedOn) throw new ReadAuthorizationError('NOT_YET_VALID', 'La autorización vale desde el ' + auth.signedOn + '; hoy es ' + context.today + '.');
  if (context.today > auth.validUntil) throw new ReadAuthorizationError('EXPIRED', 'La autorización caducó el ' + auth.validUntil + '. Hace falta una nueva, firmada.');
  const unknownScope = auth.scope.filter(s => !(READ_SCOPE as readonly string[]).includes(s));
  if (unknownScope.length) throw new ReadAuthorizationError('SCOPE', 'El alcance tiene partes que no se conocen: ' + unknownScope.join(', ') + '. Valen: ' + READ_SCOPE.join(', ') + '.');
  const missing = READ_SCOPE.filter(s => !auth.scope.includes(s));
  if (missing.length) throw new ReadAuthorizationError('SCOPE', 'La autorización no cubre ' + missing.map(s => SCOPE_LABEL[s]).join(', ') + ', y el lector lee siempre las cuatro partes. No se lee nada.');
  if (context.documentSha256.toLowerCase() !== auth.signedDocumentSha256) throw new ReadAuthorizationError('DOCUMENT_MISMATCH', 'El documento firmado no coincide con la huella de la autorización. Comprueba que es el mismo archivo, sin retocar.');
}

export interface ReadRecord {
  kind: 'verifica-read-record';
  version: 1;
  mode: 'client';
  portalId: string;
  accountType: string;
  engagement: string;
  authorizedBy: ReadAuthorization['authorizedBy'];
  signedOn: string;
  validUntil: string;
  signedDocumentSha256: string;
  startedAt: string;
  finishedAt: string;
  /** Peticiones observadas en el transporte, por método. */
  requestsByMethod: Record<string, number>;
  /** Método y ruta de cada tipo de petición, sin parámetros. */
  endpoints: string[];
  counts: { owners: number; companies: number; contacts: number; deals: number };
  historyAvailable: boolean;
  captureId: string;
  /** sha256 del archivo de la captura tal como se guardó. */
  captureSha256: string;
  /** sha256 del acta sin este campo. */
  fingerprint: string;
}

export function buildReadRecord(input: Omit<ReadRecord, 'kind' | 'version' | 'mode' | 'fingerprint' | 'captureSha256' | 'endpoints'> & { endpoints: Iterable<string>; captureText: string }): ReadRecord {
  const { captureText, endpoints, ...rest } = input;
  const body: Omit<ReadRecord, 'fingerprint'> = { kind: 'verifica-read-record', version: 1, mode: 'client', ...rest, endpoints: [...new Set(endpoints)].sort(), captureSha256: sha256Hex(captureText) };
  return { ...body, fingerprint: fingerprintOf(body) };
}

/** El acta no se ha tocado y, si se da, la captura es exactamente la que se leyó. */
export function verifyReadRecord(record: ReadRecord, captureText?: string): boolean {
  const { fingerprint, ...body } = record;
  if (record.kind !== 'verifica-read-record' || fingerprintOf(body) !== fingerprint) return false;
  return captureText === undefined || sha256Hex(captureText) === record.captureSha256;
}
