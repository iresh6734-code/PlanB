export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, {
    ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  const data = await response.json();
  if (!response.ok) {if(response.status===401&&String(data.error).includes('Desbloquea'))window.dispatchEvent(new Event('planb:locked'));throw new ApiError(response.status, data.error ?? 'No se pudo completar la operación.', data.details);}
  return data as T;
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function download(path: string, filename: string, body?:unknown) {
  const response = await fetch('/api' + path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  if (!response.ok) {
    const data = await response.json();
    throw new ApiError(response.status, data.error ?? 'No se pudo descargar el archivo.');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
