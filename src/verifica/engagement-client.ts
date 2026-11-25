// Plan B Verifica · cliente de los encargos del servidor local (fase D, corte 1). Solo se usa cuando verifica.html la
// sirve el servidor local; abierta suelta, la página no llama a nada.
import type { Engagement, EngagementRole, EngagementView, IssueResult, ReadJob, ReadRequest, RecordSummary } from '../../shared/verifica/engagement.js';
import { ENGAGEMENT_LIMITS, sourceSizeProblem } from '../../shared/verifica/engagement.js';
import type { ClosureRecord, ExpedienteView, IssueVersion } from '../../shared/verifica/expediente.js';
import type { ReportComparison } from '../../shared/verifica/comparacion.js';
import type { AnswersDocument, SellerQuestion } from '../../shared/verifica/preguntas.js';

export type EngagementSummary = Engagement & { ready: boolean; stored: number; issued: boolean };

export class EngagementApiError extends Error { constructor(message: string, public status: number) { super(message); this.name = 'EngagementApiError'; } }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  } catch {
    throw new EngagementApiError('No hubo respuesta del servidor local. Comprueba que Plan B sigue abierto y reintenta.', 0);
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* sin cuerpo */ }
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'No se pudo completar la operación.';
    throw new EngagementApiError(response.status === 401 ? 'Plan B está bloqueado: desbloquéalo en la app principal y vuelve a intentarlo.' : message, response.status);
  }
  return body as T;
}

/** true si la página la sirve el servidor local con encargos. Nunca lanza. */
export async function localAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/api/verifica/health', { signal });
    if (!response.ok) return false;
    const body = await response.json() as { ok?: unknown; engagements?: unknown };
    return body.ok === true && body.engagements === true;
  } catch { return false; }
}

export const listEngagements = () => call<{ engagements: EngagementSummary[] }>('/api/verifica/engagements').then(r => r.engagements);
export const createEngagement = (name: string) => call<EngagementView>('/api/verifica/engagements', { method: 'POST', body: JSON.stringify({ name }) });
export const readEngagement = (id: string) => call<EngagementView>(`/api/verifica/engagements/${id}`);
export const removeSource = (id: string, role: EngagementRole) => call<EngagementView>(`/api/verifica/engagements/${id}/sources/${role}`, { method: 'DELETE' });

export async function uploadSource(id: string, role: EngagementRole, file: File): Promise<EngagementView> {
  const tooLarge = sourceSizeProblem('«' + file.name + '»', file.size);
  if (tooLarge) throw new EngagementApiError(tooLarge, 413);
  let text: string;
  try { text = await file.text(); } catch { throw new EngagementApiError('No se pudo leer «' + file.name + '».', 0); }
  return call<EngagementView>(`/api/verifica/engagements/${id}/sources/${role}`, { method: 'PUT', body: JSON.stringify({ text, fileName: file.name.slice(0, ENGAGEMENT_LIMITS.fileNameChars) }) });
}

/** Sala limpia: devuelve la emisión y, solo esta vez, la llave de la copia. */
export const issueCleanRoom = (id: string) => call<IssueResult>(`/api/verifica/engagements/${id}/clean-room`, { method: 'POST' });

/** El informe o la copia custodiada tal como se emitieron, en texto. */
export async function issueFile(id: string, file: 'report' | 'custody'): Promise<string> {
  let response: Response;
  try { response = await fetch(`/api/verifica/engagements/${id}/issue/${file}`); }
  catch { throw new EngagementApiError('No hubo respuesta del servidor local. Comprueba que Plan B sigue abierto y reintenta.', 0); }
  if (!response.ok) throw new EngagementApiError(response.status === 401 ? 'Plan B está bloqueado: desbloquéalo en la app principal y vuelve a intentarlo.' : 'No se pudo descargar el archivo emitido.', response.status);
  return response.text();
}

/** Lectura de HubSpot (corte 3): el servidor la arranca y sigue en segundo plano. La credencial solo viaja en esta petición. */
export const startRead = (id: string, request: ReadRequest) => call<ReadJob>(`/api/verifica/engagements/${id}/read`, { method: 'POST', body: JSON.stringify(request) });
/** La lectura en marcha o la última de este encargo desde que se abrió Plan B. */
export const readStatus = (id: string) => call<{ job: ReadJob | null }>(`/api/verifica/engagements/${id}/read`).then(r => r.job);
export const listRecords = (id: string) => call<{ records: RecordSummary[] }>(`/api/verifica/engagements/${id}/records`).then(r => r.records);

/** El acta de una lectura tal como se guardó, en texto. */
export async function recordFile(id: string, captureId: string): Promise<string> {
  let response: Response;
  try { response = await fetch(`/api/verifica/engagements/${id}/records/${encodeURIComponent(captureId)}`); }
  catch { throw new EngagementApiError('No hubo respuesta del servidor local. Comprueba que Plan B sigue abierto y reintenta.', 0); }
  if (!response.ok) throw new EngagementApiError(response.status === 401 ? 'Plan B está bloqueado: desbloquéalo en la app principal y vuelve a intentarlo.' : 'No se pudo descargar el acta.', response.status);
  return response.text();
}

// Mega Plan 3 · expediente, versiones y comparación, preguntas, paquete del comprador y cierre.
export const readExpediente = (id: string) => call<ExpedienteView>(`/api/verifica/engagements/${id}/expediente`);
export const readIssues = (id: string) => call<{ versions: Omit<IssueVersion, 'reportJson'>[]; comparison: ReportComparison | null }>(`/api/verifica/engagements/${id}/issues`);
export const readQuestions = (id: string) => call<{ report: string | null; questions: SellerQuestion[]; answers: AnswersDocument | null }>(`/api/verifica/engagements/${id}/questions`);
export const saveAnswer = (id: string, rule: string, text: string) => call<{ answers: AnswersDocument }>(`/api/verifica/engagements/${id}/answers/${rule}`, { method: 'PUT', body: JSON.stringify({ text }) });
export const closeEngagement = (id: string, confirmName: string) => call<{ closure: ClosureRecord }>(`/api/verifica/engagements/${id}/close`, { method: 'POST', body: JSON.stringify({ confirmName }) });
export const listClosures = () => call<{ closures: ClosureRecord[] }>('/api/verifica/closures').then(r => r.closures);

/** El paquete del comprador en texto, tal como se descarga. */
export async function buyerPackage(id: string, include: { watch?: boolean; answers?: boolean; equivalence?: { fingerprint: string; reviewed: true } | null }): Promise<string> {
  let response: Response;
  try { response = await fetch(`/api/verifica/engagements/${id}/package`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...include, equivalence: include.equivalence ?? undefined }) }); }
  catch { throw new EngagementApiError('No hubo respuesta del servidor local. Comprueba que Plan B sigue abierto y reintenta.', 0); }
  if (!response.ok) {
    let message = 'No se pudo preparar el paquete.';
    try { const body = await response.json() as { error?: unknown }; if (typeof body.error === 'string') message = body.error; } catch { /* sin cuerpo */ }
    throw new EngagementApiError(response.status === 401 ? 'Plan B está bloqueado: desbloquéalo en la app principal y vuelve a intentarlo.' : message, response.status);
  }
  return response.text();
}
