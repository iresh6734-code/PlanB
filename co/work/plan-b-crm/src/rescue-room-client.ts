import type { RescueRoom } from '../server/rescue-room.js';
import { MAX_JSON_BYTES, type RescueContext } from '../shared/rescue-room.js';
// Cliente de Modo Rescate: JSON con límite de tamaño, errores que no se disfrazan de éxito, cancelación de lecturas obsoletas y
// descarte de respuestas válidas pero tardías de otro contexto. Los borradores los conserva el componente, nunca este módulo.
export type RoomView = Exclude<ReturnType<RescueRoom['view']>, { blocked: true }>;
export type BlockedView = Extract<ReturnType<RescueRoom['view']>, { blocked: true }>;
export type RoomResponse = RoomView | BlockedView;
export class RescueApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); this.name = 'RescueApiError'; }
  get isConflict() { return this.status === 409 && (this.code === 'VERSION_CONFLICT' || this.code === 'CONTEXT_MISMATCH' || this.code === 'PLAN_STALE'); }
}
export interface MutationAck { ok: true; outcome: 'saved' | 'uncertain'; replayed: boolean; version: number; result: Record<string, unknown> }
type Fetch = typeof fetch;
export const contextKey = (c: Pick<RescueContext, 'workspaceId' | 'captureRevision'>) => c.workspaceId + ':' + c.captureRevision;
export const isBlocked = (view: RoomResponse): view is BlockedView => (view as BlockedView).blocked === true;
/** Lee el cuerpo como máximo MAX_JSON_BYTES BYTES reales (no unidades UTF-16), con cancelación del flujo al superarlo y también sin Content-Length. */
async function readBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_JSON_BYTES) throw new RescueApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.');
  const reader = response.body?.getReader();
  if (!reader) { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new RescueApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.'); return text; }
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength; if (total > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); throw new RescueApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.'); }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let at = 0; for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder('utf-8').decode(all);
}
async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? '';
  if (!/application\/json/i.test(type)) throw new RescueApiError(response.status || 502, 'BAD_FORMAT', 'La respuesta no es JSON; no se interpreta como un resultado.');
  const text = await readBody(response);
  try { return JSON.parse(text); } catch { throw new RescueApiError(response.status || 502, 'BAD_JSON', 'La respuesta no es un JSON válido; no se interpreta como un resultado.'); }
}
// Contratos completos: una respuesta incompleta NO se acepta por cast (ni se confirma una acción ni se borra un borrador con ella).
const bad = (what: string): never => { throw new RescueApiError(502, 'BAD_FORMAT', 'La respuesta no cumple el contrato esperado (' + what + '); no se interpreta como un resultado.'); };
const obj = (v: unknown, what: string) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad(what));
const str = (v: unknown, what: string) => (typeof v === 'string' ? v : bad(what));
const int = (v: unknown, what: string, min = 0) => (Number.isInteger(v) && (v as number) >= min ? v as number : bad(what));
const bool = (v: unknown, what: string) => (typeof v === 'boolean' ? v : bad(what));
const arr = (v: unknown, what: string) => (Array.isArray(v) ? v as unknown[] : bad(what));
export function validateState(body: Record<string, unknown>): RoomResponse {
  str(body.roomId, 'roomId'); const blocked = bool(body.blocked, 'blocked');
  if (blocked) { str(obj(body.integrity, 'integrity').status, 'integrity.status'); return body as unknown as BlockedView; }
  int(body.version, 'version', 1); str(body.stage, 'stage'); str(body.stageLabel, 'stageLabel'); str(body.banner, 'banner'); bool(body.closed, 'closed');
  const ctx = obj(body.context, 'context'); for (const k of ['workspaceId', 'accountId', 'captureId', 'captureRevision']) str(ctx[k], 'context.' + k);
  const inc = obj(body.incident, 'incident'); for (const k of ['startedAt', 'openedAt', 'now']) str(inc[k], 'incident.' + k); int(inc.hours, 'incident.hours', 1); int(inc.horizonHours, 'incident.horizonHours', 1);
  const cap = obj(body.capture, 'capture'); for (const k of ['id', 'name', 'capturedAt', 'accountId', 'revision']) str(cap[k], 'capture.' + k); int(cap.records, 'capture.records'); obj(cap.counts, 'capture.counts');
  const q = obj(body.queue, 'queue'), s = obj(q.summary, 'queue.summary'); for (const k of ['totalTasks', 'completedTasks', 'knownOpenTasks', 'unknownStatusTasks', 'totalQueued', 'returned']) int(s[k], 'queue.summary.' + k); bool(s.truncated, 'queue.summary.truncated');
  for (const i of arr(q.items, 'queue.items')) { const it = obj(i, 'queue.item'); str(it.id, 'item.id'); str(it.label, 'item.label'); str(it.bucket, 'item.bucket'); obj(it.due, 'item.due'); arr(it.reasons, 'item.reasons'); }
  arr(q.limitations, 'queue.limitations'); arr(body.presets, 'presets'); arr(body.comparison, 'comparison'); const er = obj(body.estimateRange, 'estimateRange'); int(er.min, 'estimateRange.min', 1); int(er.max, 'estimateRange.max', 1);
  if (body.budgetMinutes !== null) int(body.budgetMinutes, 'budgetMinutes', 1);
  if (body.plan !== null) { const p = obj(body.plan, 'plan'); arr(p.included, 'plan.included'); arr(p.excluded, 'plan.excluded'); for (const k of ['budgetMinutes', 'usedMinutes', 'remainingMinutes', 'notConsidered']) int(p[k], 'plan.' + k); str(p.method, 'plan.method'); }
  if (body.selected !== null) { const sel = obj(body.selected, 'selected'); str(obj(sel.record, 'selected.record').id, 'selected.record.id'); arr(sel.fields, 'selected.fields'); }
  for (const c of arr(body.localChanges, 'localChanges')) arr(obj(c, 'localChange').fields, 'localChange.fields');
  const crm = obj(body.crm, 'crm'); bool(crm.online, 'crm.online'); bool(crm.lostAckArmed, 'crm.lostAckArmed'); const st = obj(crm.stats, 'crm.stats'); int(st.records, 'crm.stats.records'); int(st.duplicateCreates, 'crm.stats.duplicateCreates'); const calls = obj(st.calls, 'crm.stats.calls'); for (const k of ['read', 'create', 'update', 'relate']) int(calls[k], 'crm.stats.calls.' + k);
  str(obj(body.recoveryIntegrity, 'recoveryIntegrity').state, 'recoveryIntegrity.state');
  if (body.returnPlan !== null) { const rp = obj(body.returnPlan, 'returnPlan'); str(rp.id, 'returnPlan.id'); str(rp.status, 'returnPlan.status'); for (const o of arr(rp.operations, 'returnPlan.operations')) { const op = obj(o, 'operation'); str(op.id, 'operation.id'); str(op.label, 'operation.label'); str(op.kind, 'operation.kind'); str(op.status, 'operation.status'); for (const f of arr(op.fields, 'operation.fields')) { const fl = obj(f, 'field'); str(fl.field, 'field.field'); str(fl.label, 'field.label'); bool(fl.conflict, 'field.conflict'); } } }
  const j = obj(body.journal, 'journal'); int(j.total, 'journal.total'); for (const e of arr(j.events, 'journal.events')) { const ev = obj(e, 'event'); str(ev.id, 'event.id'); str(ev.at, 'event.at'); str(ev.actor, 'event.actor'); str(ev.summary, 'event.summary'); }
  return body as unknown as RoomView;
}
/** Resultado mínimo que cada acción debe devolver para darla por confirmada. */
const RESULT_KEYS: Record<string, string[]> = { plan: ['budgetMinutes'], 'estimates-script': ['count'], estimate: ['taskId'], note: ['taskId'], blocker: ['taskId'], select: ['taskId'], edit: ['taskId', 'changeId'], create: ['recordId'], 'crm-return': ['changed'], 'arm-lost-ack': ['armed'], prepare: ['planId'], decide: ['planId', 'status'], approve: ['planId', 'status'], refresh: ['planId'], apply: ['planId', 'status', 'applied', 'uncertain', 'failed'], resolve: ['planId', 'status'], close: ['closed'] };
export function validateAck(route: string, ack: Record<string, unknown>): MutationAck {
  if (ack.ok !== true || (ack.outcome !== 'saved' && ack.outcome !== 'uncertain')) throw new RescueApiError(502, 'BAD_ACK', 'La respuesta no confirma que la operación se guardara; se trata como no confirmada.');
  if (typeof ack.replayed !== 'boolean' || !Number.isInteger(ack.version) || (ack.version as number) < 1 || !ack.result || typeof ack.result !== 'object' || Array.isArray(ack.result)) throw new RescueApiError(502, 'BAD_ACK', 'El acuse está incompleto (versión, repetición o resultado); se trata como no confirmado y se conserva el borrador.');
  for (const k of RESULT_KEYS[route] ?? []) if (!(k in (ack.result as object))) throw new RescueApiError(502, 'BAD_ACK', 'El acuse no incluye «' + k + '» de esta acción; se trata como no confirmado y se conserva el borrador.');
  return ack as unknown as MutationAck;
}

export class RescueClient {
  private fetcher: Fetch; private reads = 0; private readController: AbortController | null = null;
  constructor(private base = '/api/rescue', fetcher?: Fetch) { this.fetcher = fetcher ?? ((input, init) => fetch(input, init)); }
  private async call(path: string, init: RequestInit & { signal?: AbortSignal }) {
    let response: Response;
    try { response = await this.fetcher(this.base + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, cache: 'no-store' }); }
    catch (error) { if ((error as { name?: string }).name === 'AbortError') throw error; throw new RescueApiError(0, 'NETWORK', 'No se pudo contactar con la sala. Tu trabajo escrito se conserva; reintenta.'); }
    const body = await readJson(response) as Record<string, unknown> | null;
    if (!response.ok) throw new RescueApiError(response.status, String(body?.code ?? 'ERROR'), String(body?.error ?? 'No se pudo completar la operación.'), body?.details);
    if (body === null || typeof body !== 'object') throw new RescueApiError(502, 'BAD_FORMAT', 'La respuesta no tiene la forma esperada.');
    return body;
  }
  /** Lectura del estado. Una lectura nueva cancela la anterior; devuelve null si esta quedó obsoleta o es de otro contexto. */
  async state(expected?: Pick<RescueContext, 'workspaceId' | 'captureRevision'> | null): Promise<RoomResponse | null> {
    this.readController?.abort(); const controller = new AbortController(); this.readController = controller; const ticket = ++this.reads;
    let body: Record<string, unknown>;
    try { body = await this.call('/state', { method: 'GET', signal: controller.signal }); }
    catch (error) { if ((error as { name?: string }).name === 'AbortError' || ticket !== this.reads) return null; throw error; }
    if (ticket !== this.reads) return null;
    const view = validateState(body);
    if (expected && !isBlocked(view) && contextKey(view.context) !== contextKey(expected)) return null; // válida pero de otro contexto: no sustituye a la actual
    return view;
  }
  cancelReads() { this.readController?.abort(); this.reads++; }
  async mutate(route: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<MutationAck> {
    const ack = await this.call('/' + route, { method: 'POST', body: JSON.stringify(body), signal });
    return validateAck(route, ack);
  }
  async preview(taskId: string, values: Record<string, unknown>, signal?: AbortSignal) {
    return await this.call('/preview-edit', { method: 'POST', body: JSON.stringify({ taskId, values }), signal }) as unknown as { ok: boolean; issues: Record<string, string>; diff: { key: string; before: unknown; after: unknown }[]; stage: string };
  }
  async candidates(planId: string, operationId: string, signal?: AbortSignal) {
    const q = new URLSearchParams({ planId, operationId });
    const body = await this.call('/candidates?' + q.toString(), { method: 'GET', signal });
    if (!Array.isArray(body.candidates)) throw new RescueApiError(502, 'BAD_FORMAT', 'La lista de candidatos no tiene la forma esperada.');
    return body.candidates as { id: string; summary: string; values: Record<string, unknown> }[];
  }
}
/** Una intención de usuario = una clave de idempotencia. Se reutiliza al reintentar (timeout, doble clic) y se renueva solo con una intención nueva. */
export function newIntentKey(prefix: string) { return prefix + '-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)); }
export const envelopeFor = (view: RoomView, key: string) => ({ idempotencyKey: key, expectedVersion: view.version, context: view.context });
