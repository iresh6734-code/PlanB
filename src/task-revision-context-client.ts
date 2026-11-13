import { sameTaskCapture, judgeAfterUncertain, type Evidence, type TaskContext, type TaskSchema } from '../shared/local-task-focus.js';
import type { FieldValue } from '../shared/model.js';
import { TaskRevisionView, TaskRevisionWrite } from '../shared/task-revision.js';
import { readContext, TaskFocusError, type Transport } from './local-task-focus-client.js';
import { createTaskRevisionClient, type RevisionSave } from './task-revision-client.js';

/** Keep the observed full context beside the original revision. No controller, storage or retries. */
export interface ContextualTaskRevision { context: TaskContext; schema: TaskSchema | null; current: TaskRevisionView; }
export type ContextualRevisionRead =
  | { kind: 'read'; opened: ContextualTaskRevision }
  | { kind: 'context-changed' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; status: number; message: string };
export type ContextualRevisionSave = RevisionSave
  | { kind: 'context-changed' }
  | { kind: 'preflight-failed'; status: number; message: string };
export type ContextualRevisionVerification =
  | { kind: 'read'; evidence: Evidence; opened: ContextualTaskRevision }
  | { kind: 'context-changed' | 'locked' | 'missing' | 'unknown' };

const hasContext = (context: TaskContext) => context.ready && !!context.instanceId && !!context.snapshotId && !!context.capturedAt;
const matchesView = (context: TaskContext, view: TaskRevisionView) => hasContext(context)
  && context.instanceId === view.instanceId && context.snapshotId === view.captureId && context.capturedAt === view.capturedAt;
const sameContext = (a: TaskContext, b: TaskContext) => hasContext(a) && hasContext(b) && sameTaskCapture(a, b);
const failure = (error: unknown) => ({ kind: 'failed' as const, status: error instanceof TaskFocusError ? error.status : 0,
  message: 'No se pudo comprobar el contexto completo de la copia.' });

/**
 * Context reads are observations, not a transaction spanning the HTTP requests. The server's original
 * revision protects its own snapshot/spec/record fingerprint, under its single cooperative writer.
 * Never replace that revision with a newer GET before saving, or silently fall back to the legacy API.
 */
export function createContextualTaskRevisionClient(options: {
  base?: string; fetch?: typeof fetch; timeoutMs?: number; contextTimeoutMs?: number; maxResponseBytes?: number;
} = {}) {
  if (options.contextTimeoutMs !== undefined && (!Number.isFinite(options.contextTimeoutMs) || options.contextTimeoutMs <= 0)) throw Error('Invalid context read timeout.');
  const fetcher = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const transport: Transport = { base: options.base ?? '', fetch: (input, init) => fetcher(input, { ...init, cache: 'no-store', credentials: 'same-origin', redirect: 'error' }), readTimeoutMs: options.contextTimeoutMs };
  const client = createTaskRevisionClient(options);
  async function read(taskId: string, expected?: TaskContext, signal?: AbortSignal): Promise<ContextualRevisionRead> {
    let identity: TaskContext | undefined;
    try { identity = expected ? structuredClone(expected) : undefined; } catch { return { kind: 'failed', status: 422, message: 'El contexto de la tarea no es válido.' }; }
    try {
      const before = await readContext(signal, transport);
      if (!hasContext(before.context)) return identity ? { kind: 'context-changed' } : { kind: 'unavailable' };
      if (identity && !sameContext(before.context, identity)) return { kind: 'context-changed' };
      const revision = await client.read(taskId, { instanceId: before.context.instanceId!, captureId: before.context.snapshotId!, capturedAt: before.context.capturedAt! }, signal);
      const after = await readContext(signal, transport);
      if (signal?.aborted) return { kind: 'failed', status: 0, message: 'La lectura se canceló antes de terminar.' };
      if (!sameContext(before.context, after.context) || (identity && !sameContext(after.context, identity))) return { kind: 'context-changed' };
      if (revision.kind !== 'read') return revision;
      if (!matchesView(after.context, revision.current)) return { kind: 'context-changed' };
      return { kind: 'read', opened: { context: after.context, schema: after.schema, current: revision.current } };
    } catch (error) {
      return error instanceof TaskFocusError && error.kind === 'context' ? { kind: 'context-changed' } : failure(error);
    }
  }
  return {
    read,
    async save(opened: ContextualTaskRevision, values: Record<string, FieldValue>, signal?: AbortSignal): Promise<ContextualRevisionSave> {
      let context: TaskContext, reviewed: TaskRevisionView, patch: Record<string, FieldValue>;
      try {
        context = structuredClone(opened.context);
        reviewed = TaskRevisionView.parse(opened.current);
        patch = TaskRevisionWrite.parse({ expectedRevision: reviewed.revision, values }).values;
        if (!matchesView(context, reviewed) || signal?.aborted) throw Error('Invalid reviewed context');
      } catch { return { kind: 'not-sent', message: 'Revisa la tarea, el contexto y los campos antes de guardar. No se envió ningún cambio.' }; }
      try {
        const now = await readContext(signal, transport);
        if (signal?.aborted) return { kind: 'not-sent', message: 'La operación se canceló antes de enviar.' };
        if (!sameContext(context, now.context)) return { kind: 'context-changed' };
      } catch (error) {
        if (error instanceof TaskFocusError && error.kind === 'context') return { kind: 'context-changed' };
        return { kind: 'preflight-failed', status: error instanceof TaskFocusError ? error.status : 0, message: 'No se pudo comprobar la copia antes de enviar. No se envió ningún cambio.' };
      }
      return client.save(reviewed, patch, signal);
    },
    async verify(opened: ContextualTaskRevision, values: Record<string, FieldValue>, signal?: AbortSignal): Promise<ContextualRevisionVerification> {
      let original: ContextualTaskRevision, patch: Record<string, FieldValue>;
      try {
        original = structuredClone(opened);
        original.current = TaskRevisionView.parse(original.current);
        patch = TaskRevisionWrite.parse({ expectedRevision: original.current.revision, values }).values;
        if (!matchesView(original.context, original.current)) return { kind: 'unknown' };
      } catch { return { kind: 'unknown' }; }
      const observed = await read(original.current.record.id, original.context, signal);
      if (observed.kind === 'read') return { kind: 'read', evidence: judgeAfterUncertain(original.current.record, observed.opened.current.record, patch), opened: observed.opened };
      if (observed.kind === 'context-changed' || observed.kind === 'unavailable') return { kind: 'context-changed' };
      return observed.status === 401 ? { kind: 'locked' } : observed.status === 404 ? { kind: 'missing' } : { kind: 'unknown' };
    },
  };
}
