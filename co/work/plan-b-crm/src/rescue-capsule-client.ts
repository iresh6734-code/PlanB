// Cliente del Kit de Relevo: JSON acotado por BYTES reales, contratos completos (una respuesta incompleta no se interpreta como resultado) y errores que no se disfrazan de éxito.
// La contraseña solo viaja en el cuerpo de la petición; este módulo no la guarda, no la registra y no la incluye en URLs ni mensajes.
export const MAX_RESPONSE_BYTES = 2_000_000;
export class CapsuleApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); this.name = 'CapsuleApiError'; } }
export interface OriginInfo { roomId: string; stage: string; stageKey: string; version: number; revision: string; records: number; changes: number; journalEvents: number; simRecords: number; simCreates: number; simCreateCalls: number; uncertain: number; approvedPlan: boolean; policy: string; uncertainOps: { id: string; label: string }[]; planScope: string }
export interface CapsuleRow { name: string; imported: boolean; destination: string | null; export: { bytes: number; sha256: string; revision: string } | null }
export interface KitState { banner: string; origin: OriginInfo; capsules: CapsuleRow[]; opened: { folder: string; url: string }[]; limits: string[]; notProven: string[] }
export interface Summary { origin: { roomId: string; stage: string; version: number; label: string }; createdAt: string; revision: string; records: number; changes: number; journalEvents: number; idemRecords: number; simRecords: number; simCreates: number; uncertainOps: { id: string; label: string; error: string | null }[]; approvedPlan: boolean; stageLabel: string; policy: string; warnings: string[]; limits: string[] }
export interface ExportOk { name: string; bytes: number; sha256: string; revision: string; attempts: number; ms: number; summary: Summary }
export interface InspectOk { name: string; bytes: number; sha256: string; revision: string; summary: Summary; bundleCheck: string; inspectedAt: string }
export interface ImportOk { destination: { roomId: string; folder: string }; retired: string[]; ms: number; summary: Summary }
const bad = (what: string): never => { throw new CapsuleApiError(502, 'BAD_FORMAT', 'La respuesta no cumple el contrato esperado (' + what + '); no se interpreta como un resultado.'); };
const obj = (v: unknown, w: string) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad(w));
const str = (v: unknown, w: string) => (typeof v === 'string' ? v : bad(w));
const int = (v: unknown, w: string) => (Number.isInteger(v) && (v as number) >= 0 ? v as number : bad(w));
const bool = (v: unknown, w: string) => (typeof v === 'boolean' ? v : bad(w));
const arr = (v: unknown, w: string) => (Array.isArray(v) ? v as unknown[] : bad(w));
const hex = (v: unknown, w: string) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : bad(w));
async function readBody(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES) throw new CapsuleApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.');
  const reader = response.body?.getReader(); if (!reader) { const t = await response.text(); if (new TextEncoder().encode(t).byteLength > MAX_RESPONSE_BYTES) throw new CapsuleApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.'); return t; }
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); throw new CapsuleApiError(502, 'TOO_LARGE', 'La respuesta supera el tamaño admitido.'); } chunks.push(value); }
  const all = new Uint8Array(total); let at = 0; for (const c of chunks) { all.set(c, at); at += c.byteLength; } return new TextDecoder('utf-8').decode(all);
}
const summary = (v: unknown): Summary => { const s = obj(v, 'summary'); const o = obj(s.origin, 'summary.origin'); str(o.roomId, 'origin.roomId'); str(o.stage, 'origin.stage'); int(o.version, 'origin.version'); for (const k of ['createdAt', 'revision', 'stageLabel', 'policy']) str(s[k], 'summary.' + k); for (const k of ['records', 'changes', 'journalEvents', 'idemRecords', 'simRecords', 'simCreates']) int(s[k], 'summary.' + k); bool(s.approvedPlan, 'summary.approvedPlan'); arr(s.warnings, 'summary.warnings'); arr(s.limits, 'summary.limits'); for (const u of arr(s.uncertainOps, 'summary.uncertainOps')) { const x = obj(u, 'uncertain'); str(x.id, 'uncertain.id'); str(x.label, 'uncertain.label'); } return s as unknown as Summary; };
export function validateKitState(b: Record<string, unknown>): KitState {
  str(b.banner, 'banner'); const o = obj(b.origin, 'origin'); for (const k of ['roomId', 'stage', 'stageKey', 'revision', 'policy', 'planScope']) str(o[k], 'origin.' + k); for (const k of ['version', 'records', 'changes', 'journalEvents', 'simRecords', 'simCreates', 'simCreateCalls', 'uncertain']) int(o[k], 'origin.' + k); bool(o.approvedPlan, 'origin.approvedPlan'); arr(o.uncertainOps, 'origin.uncertainOps');
  for (const c of arr(b.capsules, 'capsules')) { const x = obj(c, 'capsule'); str(x.name, 'capsule.name'); bool(x.imported, 'capsule.imported'); if (x.export !== null) { const e = obj(x.export, 'capsule.export'); int(e.bytes, 'export.bytes'); hex(e.sha256, 'export.sha256'); hex(e.revision, 'export.revision'); } }
  for (const c of arr(b.opened, 'opened')) { const x = obj(c, 'opened'); str(x.folder, 'opened.folder'); str(x.url, 'opened.url'); } arr(b.limits, 'limits'); arr(b.notProven, 'notProven'); return b as unknown as KitState;
}
export class CapsuleClient {
  private reads = 0; private controller: AbortController | null = null;
  constructor(private base = '/api/capsule', private fetcher: typeof fetch = (i, n) => fetch(i, n)) {}
  private async call(path: string, init: RequestInit) {
    let response: Response;
    try { response = await this.fetcher(this.base + path, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }); }
    catch (error) { if ((error as { name?: string }).name === 'AbortError') throw error; throw new CapsuleApiError(0, 'NETWORK', 'No se pudo contactar con el kit. Tu trabajo escrito se conserva; reintenta.'); }
    if (!/application\/json/i.test(response.headers.get('content-type') ?? '')) throw new CapsuleApiError(response.status || 502, 'BAD_FORMAT', 'La respuesta no es JSON; no se interpreta como un resultado.');
    let body: unknown; try { body = JSON.parse(await readBody(response)); } catch (e) { if (e instanceof CapsuleApiError) throw e; throw new CapsuleApiError(response.status || 502, 'BAD_JSON', 'La respuesta no es un JSON válido.'); }
    const o = obj(body, 'respuesta'); if (!response.ok) throw new CapsuleApiError(response.status, String(o.code ?? 'ERROR'), String(o.error ?? 'No se pudo completar la operación.'));
    return o;
  }
  async state(): Promise<KitState | null> {
    this.controller?.abort(); const c = new AbortController(); this.controller = c; const ticket = ++this.reads;
    try { const b = await this.call('/state', { method: 'GET', signal: c.signal }); if (ticket !== this.reads) return null; return validateKitState(b); }
    catch (e) { if ((e as { name?: string }).name === 'AbortError' || ticket !== this.reads) return null; throw e; }
  }
  cancelReads() { this.controller?.abort(); this.reads++; }
  private ok(b: Record<string, unknown>) { if (b.ok !== true) throw new CapsuleApiError(502, 'BAD_ACK', 'La respuesta no confirma la operación; se trata como no confirmada.'); return b; }
  async seed(): Promise<void> { this.ok(await this.call('/seed-origin', { method: 'POST', body: '{}' })); }
  async exportCapsule(password: string): Promise<ExportOk> { const b = this.ok(await this.call('/export', { method: 'POST', body: JSON.stringify({ password }) })); str(b.name, 'name'); int(b.bytes, 'bytes'); hex(b.sha256, 'sha256'); hex(b.revision, 'revision'); summary(b.summary); return b as unknown as ExportOk; }
  async inspect(name: string, password: string): Promise<InspectOk> { const b = this.ok(await this.call('/inspect', { method: 'POST', body: JSON.stringify({ name, password }) })); str(b.name, 'name'); int(b.bytes, 'bytes'); hex(b.sha256, 'sha256'); hex(b.revision, 'revision'); summary(b.summary); str(b.inspectedAt, 'inspectedAt'); return b as unknown as InspectOk; }
  async importCapsule(input: { name: string; password: string; expectedSha256: string; expectedRevision: string }): Promise<ImportOk> { const b = this.ok(await this.call('/import', { method: 'POST', body: JSON.stringify(input) })); const d = obj(b.destination, 'destination'); str(d.roomId, 'destination.roomId'); if (!/^rescue106-[0-9a-f-]{36}$/.test(str(d.folder, 'destination.folder'))) bad('destination.folder'); arr(b.retired, 'retired'); int(b.ms, 'ms'); summary(b.summary); return b as unknown as ImportOk; }
  async openDestination(folder: string): Promise<{ url: string; reused: boolean }> { const b = this.ok(await this.call('/open', { method: 'POST', body: JSON.stringify({ folder }) })); str(b.url, 'url'); bool(b.reused, 'reused'); return b as unknown as { url: string; reused: boolean }; }
}
