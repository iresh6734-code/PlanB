// Plan B Verifica · una lectura de HubSpot con su acta (fase 5 y mega plan 2, fase D, corte 3).
// La comparten scripts/verifica-hubspot.ts y el servidor local (pantalla de capturas): la misma credencial recibida en el
// momento, el mismo lector y la misma acta. El acta cuenta lo que pasó por el transporte (métodos y rutas), no lo que el
// lector dice que hizo. La credencial no se guarda ni se devuelve: solo viaja en la cabecera de cada petición.
import { buildReadRecord, type ReadAuthorization, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { sourceSizeProblem } from '../../shared/verifica/engagement.js';
import { VerificaReadError } from '../../shared/verifica/hubspot.js';
import { readHubspotForVerifica, type HubspotReading } from './hubspot-reader.js';

export interface ReadWithRecordInput {
  token: string;
  portalId: string;
  /** `client`: una cuenta STANDARD con autorización firmada y acta. `test`: solo cuentas de pruebas o sandbox. */
  mode: 'client' | 'test';
  /** Ya comprobada para este portal, hoy y con este documento (checkReadAuthorization). Solo en modo cliente. */
  authorization: ReadAuthorization | null;
  fetch: typeof fetch;
  now?: () => Date;
  taxIdProperty?: string | null;
  customerStages?: string[];
  progress?: (message: string) => void;
  signal?: AbortSignal;
  /** Máximo de la captura en bytes UTF-8 (por defecto, el común de una fuente del encargo). */
  maxCaptureBytes?: number;
}

export interface ReadWithRecordResult {
  reading: HubspotReading;
  /** La captura tal como se guarda (la huella del acta es la de este texto). */
  captureText: string;
  /** Solo en modo cliente con autorización. */
  record: ReadRecord | null;
}

export async function readWithRecord(input: ReadWithRecordInput): Promise<ReadWithRecordResult> {
  const now = () => input.now?.() ?? new Date();
  const requestsByMethod: Record<string, number> = {}, endpoints = new Set<string>();
  const fetcher = ((resource: string | URL | Request, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    requestsByMethod[method] = (requestsByMethod[method] ?? 0) + 1;
    endpoints.add(method + ' ' + new URL(resource instanceof Request ? resource.url : String(resource)).pathname);
    return input.fetch(resource, init);
  }) as typeof fetch;
  const startedAt = now().toISOString();
  const reading = await readHubspotForVerifica({
    token: input.token, accountId: input.portalId, mode: input.mode === 'client' ? 'production_readonly' : 'test', fetcher, now: input.now,
    taxIdProperty: input.taxIdProperty, ...(input.customerStages ? { customerStages: input.customerStages } : {}),
    progress: input.progress, signal: input.signal,
  });
  const { capture } = reading;
  const captureText = JSON.stringify(capture, null, 2) + '\n';
  const tooLarge = sourceSizeProblem('La captura de HubSpot', Buffer.byteLength(captureText, 'utf8'), input.maxCaptureBytes);
  if (tooLarge) throw new VerificaReadError('CAPTURE_BUDGET', tooLarge);
  const auth = input.authorization;
  const record = auth ? buildReadRecord({
    portalId: reading.account.portalId, accountType: reading.account.accountType, engagement: auth.engagement, authorizedBy: auth.authorizedBy,
    signedOn: auth.signedOn, validUntil: auth.validUntil, signedDocumentSha256: auth.signedDocumentSha256,
    startedAt, finishedAt: now().toISOString(), requestsByMethod, endpoints,
    counts: { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length },
    historyAvailable: capture.historyAvailable, captureId: capture.id, captureText,
  }) : null;
  return { reading, captureText, record };
}

/** El acta tal como se guarda y se descarga. */
export const recordToText = (record: ReadRecord) => JSON.stringify(record, null, 2) + '\n';

/** La misma forma que pide el script a una credencial: una sola línea, sin espacios ni caracteres de control. */
export const credentialProblem = (token: string): string | null =>
  token.length < 10 || token.length > 4096 || /[\s\u0000-\u001f]/.test(token) ? 'La credencial no tiene forma válida (una sola línea, sin espacios).' : null;
