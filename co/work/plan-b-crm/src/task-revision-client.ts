import { TaskRevisionParams, TaskRevisionResult, TaskRevisionView } from '../shared/task-revision.js';
import { TaskRevisionWrite } from '../shared/task-revision.js';
import type { FieldValue } from '../shared/model.js';

export type RevisionIdentity = Pick<TaskRevisionView, 'instanceId' | 'captureId' | 'capturedAt'>;
export type RevisionRead = { kind: 'read'; current: TaskRevisionView } | { kind: 'context-changed' } | { kind: 'failed'; status: number; message: string };
export type RevisionSave =
  | { kind: 'changed' | 'unchanged'; current: TaskRevisionView }
  | { kind: 'conflict'; status: 409; message: string }
  | { kind: 'rejected'; status: number; message: string; details: unknown }
  | { kind: 'not-sent' | 'uncertain'; message: string };
const sameIdentity = (a: RevisionIdentity, b: RevisionIdentity) => a.instanceId === b.instanceId && a.captureId === b.captureId && a.capturedAt === b.capturedAt;
const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** No retries, legacy fallback, storage or optimistic confirmation. The server still requires one cooperative writer. */
export function createTaskRevisionClient(options: { base?: string; fetch?: typeof fetch; timeoutMs?: number; maxResponseBytes?: number } = {}) {
  const transport = options.fetch ?? ((input, init) => fetch(input, init));
  const base = options.base ?? '', timeout = options.timeoutMs ?? 20_000, limit = options.maxResponseBytes ?? 2 * 1024 * 1024;
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid revision client limits.');
  async function request(id: string, init: RequestInit, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    let rejectAbort!: () => void;
    const canceled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('Revision request canceled or timed out.')); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
    if (controller.signal.aborted) rejectAbort();
    const work = async () => {
      if (controller.signal.aborted) throw new Error('Aborted');
      const response = await transport(base + '/api/v7/task-revision/' + encodeURIComponent(id), { ...init, signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => undefined); throw new Error('Aborted'); }
      const decode = async () => {
        if (Number(response.headers.get('content-length') ?? 0) > limit) { await response.body?.cancel(); throw new Error('Oversized response'); }
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !response.body) { await response.body?.cancel(); throw new Error('Invalid response'); }
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
        const cancel = () => { void reader.cancel().catch(() => undefined); }; controller.signal.addEventListener('abort', cancel, { once: true });
        try {
          for (;;) { const item = await reader.read(); if (controller.signal.aborted) throw new Error('Aborted'); if (item.done) break; bytes += item.value.byteLength; if (bytes > limit) { await reader.cancel(); throw new Error('Oversized response'); } chunks.push(item.value); }
          const all = new Uint8Array(bytes); let at = 0; for (const chunk of chunks) { all.set(chunk, at); at += chunk.byteLength; }
          return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)) as unknown;
        } finally { controller.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
      };
      try { return { status: response.status, body: await decode() }; }
      catch (error) { if (controller.signal.aborted || response.status < 400 || response.status >= 500) throw error; return { status: response.status, body: null }; }
    };
    try { return await Promise.race([work(), canceled]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectAbort); }
  }
  return {
    async read(id: string, expected?: RevisionIdentity, signal?: AbortSignal): Promise<RevisionRead> {
      if (!TaskRevisionParams.safeParse({ id }).success) return { kind: 'failed', status: 422, message: 'El identificador de tarea no es válido.' };
      const identity = expected ? { ...expected } : undefined;
      try {
        const result = await request(id, { method: 'GET' }, signal);
        if (result.status !== 200) return { kind: 'failed', status: result.status, message: typeof object(result.body).error === 'string' ? String(object(result.body).error) : 'No se pudo leer la revisión de la tarea.' };
        const current = TaskRevisionView.parse(result.body);
        if (current.record.id !== id) throw new Error('Wrong task');
        return identity && !sameIdentity(current, identity) ? { kind: 'context-changed' } : { kind: 'read', current };
      } catch { return { kind: 'failed', status: 0, message: 'No se pudo obtener una revisión completa y válida de la tarea.' }; }
    },
    async save(reviewed: TaskRevisionView, values: Record<string, FieldValue>, signal?: AbortSignal): Promise<RevisionSave> {
      const view = TaskRevisionView.safeParse(reviewed), write = TaskRevisionWrite.safeParse({ expectedRevision: reviewed?.revision, values });
      if (!view.success || !write.success || !TaskRevisionParams.safeParse({ id: view.data.record.id }).success || signal?.aborted) return { kind: 'not-sent', message: 'Revisa los campos y la revisión antes de guardar. No se envió ningún cambio.' };
      try {
        const result = await request(view.data.record.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(write.data) }, signal);
        if (result.status >= 400 && result.status < 500) {
          const body = object(result.body), details = object(body.details), message = typeof body.error === 'string' ? body.error : 'El servidor rechazó el guardado.';
          return result.status === 409 && details.code === 'TASK_REVISION_CHANGED' ? { kind: 'conflict', status: 409, message } : { kind: 'rejected', status: result.status, message, details: body.details ?? null };
        }
        if (result.status !== 200) throw new Error('No acknowledgement');
        const ack = TaskRevisionResult.parse(result.body), current = ack.current;
        if (current.record.id !== view.data.record.id || !sameIdentity(current, view.data) || Object.entries(write.data.values).some(([key, value]) => current.record.values[key] !== value) || (ack.changed ? current.revision === view.data.revision : current.revision !== view.data.revision)) throw new Error('Mismatched acknowledgement');
        return { kind: ack.changed ? 'changed' : 'unchanged', current };
      } catch { return { kind: 'uncertain', message: 'No llegó una confirmación válida. El cambio pudo aplicarse; compruébalo leyendo, sin reenviar automáticamente.' }; }
    },
  };
}
