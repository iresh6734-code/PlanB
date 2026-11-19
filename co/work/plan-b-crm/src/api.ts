export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
// Sin respuesta del servidor local (cerrado, red cortada): un mensaje claro en lugar del «Failed to fetch» del navegador.
// Solo se traduce el error de red propio del navegador (TypeError); cualquier otro error conserva su detalle original,
// y una lectura cancelada a propósito sigue saliendo como cancelación.
export const NO_RESPONSE = 'No hubo respuesta de tu copia local. Comprueba que Plan B sigue abierto y reintenta.';
async function reach(input: string, init?: RequestInit) { try { return await fetch(input, init); } catch (failure) { if (init?.signal?.aborted || !(failure instanceof TypeError)) throw failure; throw new ApiError(0, NO_RESPONSE); } }

async function readFailure(response: Response, fallback: string, signal?: AbortSignal | null): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
  }
  const fields = body && typeof body === 'object' && !Array.isArray(body)
    ? body as { error?: unknown; details?: unknown } : {};
  const message = typeof fields.error === 'string' && fields.error.trim() ? fields.error : fallback;
  if (response.status === 401 && message.includes('Desbloquea') && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('planb:locked'));
  }
  return new ApiError(response.status, message, fields.details);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach('/api' + path, {
    ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  if (!response.ok) throw await readFailure(response, 'No se pudo completar la operación.', init?.signal);
  try {
    return await response.json() as T;
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError(502, 'La copia local devolvió una respuesta que Plan B no pudo leer.');
  }
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function download(path: string, filename: string, body?:unknown) {
  const response = await reach('/api' + path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  if (!response.ok) throw await readFailure(response, 'No se pudo descargar el archivo.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
