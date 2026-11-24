// Plan B Verifica · cliente de los encargos del servidor local (fase D, corte 1). Solo se usa cuando verifica.html la
// sirve el servidor local; abierta suelta, la página no llama a nada.
import type { Engagement, EngagementRole, EngagementView, IssueResult } from '../../shared/verifica/engagement.js';
import { ENGAGEMENT_LIMITS } from '../../shared/verifica/engagement.js';

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
  if (file.size > ENGAGEMENT_LIMITS.sourceBytes) throw new EngagementApiError('«' + file.name + '» es demasiado grande para una fuente del encargo.', 413);
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
