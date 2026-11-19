import { createHash, randomUUID } from 'node:crypto';
import { AppError, type Store } from './store.js';
import { EventSchema, JournalSchema, MAX_EVENTS_PER_RUN, MAX_JOURNAL_EVENTS, RescueError, StateSchema, sameContext, type MutationOutcome, type RescueContext, type RescueEvent, type RescueState } from '../shared/rescue-room.js';
// Diario y estado del incidente sobre las primitivas de Store (meta + transaction). No es un segundo sistema de cambios de CRM:
// los cambios de registros siguen siendo los de Store; aquí solo hay hechos operativos, versión esperada e idempotencia.
// Límite honesto: un solo proceso escritor por carpeta (lockInstance de la demo) y un mutex en proceso; el diario NO es resistente a manipulación.
const K_STATE = 'rescue:state', K_JOURNAL = 'rescue:journal', K_IDEM = 'rescue:idem:';
export type Integrity = { status: 'none' } | { status: 'ok' } | { status: 'corrupt'; reason: string };
export type EventDraft = Pick<RescueEvent, 'actor' | 'kind' | 'summary' | 'data'>;
export class RescueAmbiguous extends RescueError { constructor(message: string) { super(409, 'AMBIGUOUS_RECOVERY', message); this.name = 'RescueAmbiguous'; } }
export interface Attribution { claimedChangeIds: Set<number>; claimedRecordIds: Set<string>; otherStartedSameIntent: boolean }
export interface IdemRecord { contextKey?: string; hash: string; route: string; status: 'started' | 'done'; baseVersion: number; baseChangeId: number; startedAt: string; result?: unknown; outcome?: MutationOutcome; version?: number }
export const stableStringify = (value: unknown): string => stable(value);
const stable = (value: unknown): string => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value as object).sort().map(k => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(value ?? null);
export const hashPayload = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
export interface Work<T> { next: (state: RescueState) => RescueState; events: EventDraft[]; result: T; outcome?: MutationOutcome }
export interface RunOptions<T> {
  route: string; envelope: { idempotencyKey: string; expectedVersion: number; context: RescueContext }; payload: unknown;
  work: (ctx: { state: RescueState; resume: boolean; baseChangeId: number; attribution: Attribution }) => Promise<Work<T>>;
}
export interface RunResult<T> { result: T; replayed: boolean; outcome: MutationOutcome; version: number }
export class RescueLedger {
  private chain: Promise<void> = Promise.resolve();
  constructor(private store: Store, private clock: () => number, private changeMarker: () => number) {}
  private readKey(key: string): unknown { return this.store.get<unknown>(key, null); }
  /** Lee estado y diario completos. Un fallo de descifrado, JSON o forma NO produce un incidente vacío: devuelve corrupt y no se escribe nada. */
  inspect(): { integrity: Integrity; state: RescueState | null; journal: RescueEvent[] } {
    let rawState: unknown, rawJournal: unknown;
    try { rawState = this.readKey(K_STATE); rawJournal = this.readKey(K_JOURNAL); }
    catch { return { integrity: { status: 'corrupt', reason: 'No se pudo leer el estado del incidente guardado (bytes ilegibles). Se conservan sin modificar.' }, state: null, journal: [] }; }
    if (rawState === null && rawJournal === null) return { integrity: { status: 'none' }, state: null, journal: [] };
    const state = StateSchema.safeParse(rawState), journal = JournalSchema.safeParse(rawJournal);
    if (!state.success || !journal.success) return { integrity: { status: 'corrupt', reason: 'El estado o el diario del incidente no tienen la forma esperada. Se conservan sin modificar y los flujos afectados quedan bloqueados.' }, state: null, journal: [] };
    const events = journal.data;
    const known = new Set([state.data.context.workspaceId, ...(state.data.lineage?.origins ?? [])]);
    const consistent = events.every((e, i) => e.seq === i + 1 && known.has(e.workspaceId)) && (events.at(-1)?.stateVersion ?? 0) <= state.data.version;
    if (!consistent) return { integrity: { status: 'corrupt', reason: 'El diario no es coherente con el estado (secuencia, espacio o versión). Se conserva sin modificar.' }, state: null, journal: [] };
    return { integrity: { status: 'ok' }, state: state.data, journal: events };
  }
  private assertOk() { const s = this.inspect(); if (s.integrity.status === 'corrupt') throw new RescueError(409, 'RESCUE_CORRUPT', s.integrity.reason); return s; }
  /** Efectos ya atribuidos a OTRAS intenciones terminadas, y si hay otra intención iniciada con el mismo contenido (no se puede atribuir por igualdad de contenido). */
  private attribution(key: string, hash: string): Attribution {
    const claimedChangeIds = new Set<number>(), claimedRecordIds = new Set<string>(); let otherStartedSameIntent = false;
    for (const row of this.store.db.prepare("SELECT key FROM meta WHERE key LIKE 'rescue:idem:%'").all() as { key: string }[]) {
      if (row.key === K_IDEM + key) continue; const r = this.readKey(row.key) as IdemRecord | null; if (!r) continue;
      if (r.status === 'done') { const res = (r.result ?? {}) as { changeId?: unknown; recordId?: unknown }; if (typeof res.changeId === 'number') claimedChangeIds.add(res.changeId); if (typeof res.recordId === 'string') claimedRecordIds.add(res.recordId); }
      else if (r.hash === hash) otherStartedSameIntent = true;
    }
    return { claimedChangeIds, claimedRecordIds, otherStartedSameIntent };
  }
  private idem(key: string): IdemRecord | null { const v = this.readKey(K_IDEM + key); return v as IdemRecord | null; }
  private event(draft: EventDraft, seq: number, state: RescueState): RescueEvent {
    return EventSchema.parse({ seq, id: randomUUID(), at: new Date(this.clock()).toISOString(), actor: draft.actor, kind: draft.kind, stateVersion: state.version,
      workspaceId: state.context.workspaceId, captureRevision: state.context.captureRevision, summary: draft.summary, data: draft.data });
  }
  /** Primera escritura del incidente. Se niega si ya existe (una carpeta existente nunca se vuelve a sembrar). */
  init(state: RescueState, draft: EventDraft) {
    const current = this.inspect();
    if (current.integrity.status !== 'none') throw new RescueError(409, 'RESCUE_EXISTS', 'Esta carpeta ya contiene un incidente; no se vuelve a sembrar.');
    const first = { ...state, version: 1 };
    this.store.transaction(() => { this.store.set(K_STATE, first); this.store.set(K_JOURNAL, [this.event(draft, 1, first)]); });
    return first;
  }
  /** Sección exclusiva: ninguna mutación del ledger (ni, por tanto, del Store, Recovery o simulador) corre mientras `fn` está activa. */
  async exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.chain; let release!: () => void; this.chain = new Promise<void>(r => { release = r; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
  /** Lectura con LISTA PERMITIDA de claves rescue:* (estado, diario, idempotencia). No vuelca la tabla meta. */
  readAllowlist(): { state: unknown; journal: unknown; idem: Record<string, unknown> } {
    const idem: Record<string, unknown> = {};
    for (const row of this.store.db.prepare("SELECT key FROM meta WHERE key LIKE 'rescue:idem:%' ORDER BY key").all() as { key: string }[]) idem[row.key.slice(K_IDEM.length)] = this.readKey(row.key);
    return { state: this.readKey(K_STATE), journal: this.readKey(K_JOURNAL), idem };
  }
  /** Escribe estado, diario e idempotencia de una sala IMPORTADA en una sola transacción (solo si no existe incidente). */
  restoreImported(state: RescueState, journal: RescueEvent[], idem: Record<string, unknown>) {
    if (this.inspect().integrity.status !== 'none') throw new RescueError(409, 'RESCUE_EXISTS', 'Esta carpeta ya contiene un incidente; no se vuelve a sembrar.');
    const parsedState = StateSchema.parse(state), parsedJournal = JournalSchema.parse(journal);
    this.store.transaction(() => { this.store.set(K_STATE, parsedState); this.store.set(K_JOURNAL, parsedJournal); for (const [key, value] of Object.entries(idem)) this.store.set(K_IDEM + key, value); });
  }
  async run<T>(options: RunOptions<T>): Promise<RunResult<T>> {
    const previous = this.chain; let release!: () => void; this.chain = new Promise<void>(r => { release = r; });
    await previous;
    try { return await this.runLocked(options); } finally { release(); }
  }
  private async runLocked<T>(options: RunOptions<T>): Promise<RunResult<T>> {
    const { route, envelope, payload } = options, hash = hashPayload({ route, payload }), key = envelope.idempotencyKey;
    const existing = this.assertOk(), prior = this.idem(key), state = existing.state, ctxKey = envelope.context.workspaceId + ':' + envelope.context.accountId + ':' + envelope.context.captureId + ':' + envelope.context.captureRevision;
    if (!state) throw new RescueError(409, 'RESCUE_EMPTY', 'No hay un incidente abierto en esta carpeta.');
    // Idempotencia no es autorización: el sobre debe pertenecer al contexto vigente Y al contexto con el que se registró la intención, también al repetir un acuse.
    if (!sameContext(state.context, envelope.context) || (prior?.contextKey && prior.contextKey !== ctxKey)) throw new RescueError(409, 'CONTEXT_MISMATCH', 'La operación pertenece a otro espacio o a otra captura. Recarga la sala.', { current: state.context });
    if (prior) {
      if (prior.hash !== hash) throw new RescueError(422, 'IDEMPOTENCY_KEY_REUSED', 'Esta clave de operación ya se usó con otro contenido. Genera una clave nueva.');
      if (prior.status === 'done') return { result: prior.result as T, replayed: true, outcome: prior.outcome ?? 'saved', version: prior.version ?? existing.state!.version };
    }
    if (!prior && envelope.expectedVersion !== state.version) throw new RescueError(409, 'VERSION_CONFLICT', 'La sala cambió desde que la abriste (versión ' + state.version + '). Actualiza para ver los cambios; tu borrador no se descarta.', { currentVersion: state.version });
    if (!prior && existing.journal.length + MAX_EVENTS_PER_RUN > MAX_JOURNAL_EVENTS) throw new RescueError(409, 'JOURNAL_FULL', 'El diario alcanzó su capacidad (' + MAX_JOURNAL_EVENTS + ' hechos). No se aplica ninguna operación nueva para no dejar un efecto sin recibo; el estado y el diario se conservan. Cierra el ensayo o abre otro.', { events: existing.journal.length, limit: MAX_JOURNAL_EVENTS });
    const baseChangeId = prior?.baseChangeId ?? this.changeMarker();
    if (!prior) this.store.transaction(() => { this.assertOk(); this.store.set(K_IDEM + key, { contextKey: ctxKey, hash, route, status: 'started', baseVersion: state.version, baseChangeId, startedAt: new Date(this.clock()).toISOString() } satisfies IdemRecord); });
    let work: Work<T>;
    try { work = await options.work({ state, resume: !!prior, baseChangeId, attribution: this.attribution(key, hash) }); }
    catch (error) {
      if (error instanceof RescueAmbiguous) throw error; // la intención iniciada se conserva: no se puede atribuir un efecto por contenido
      if (error instanceof RescueError || error instanceof AppError) { this.store.transaction(() => { this.store.db.prepare('DELETE FROM meta WHERE key=?').run(K_IDEM + key); }); throw error; }
      throw new RescueError(500, 'OUTCOME_UNKNOWN', 'No se pudo confirmar el resultado. Repite la operación con la misma clave: no se aplicará dos veces.');
    }
    return this.store.transaction(() => {
      const now = this.assertOk(), base = now.state!;
      if (base.version !== state.version) throw new RescueError(409, 'VERSION_CONFLICT', 'La sala cambió durante la operación.', { currentVersion: base.version });
      const next = { ...work.next(base), version: base.version + 1 }, parsed = StateSchema.parse(next);
      const journal = [...now.journal]; for (const draft of work.events) journal.push(this.event(draft, journal.length + 1, parsed)); JournalSchema.parse(journal); // validar el diario NUEVO antes de publicarlo
      const outcome = work.outcome ?? 'saved';
      this.store.set(K_STATE, parsed); this.store.set(K_JOURNAL, journal);
      this.store.set(K_IDEM + key, { contextKey: ctxKey, hash, route, status: 'done', baseVersion: state.version, baseChangeId, startedAt: new Date(this.clock()).toISOString(), result: work.result, outcome, version: parsed.version } satisfies IdemRecord);
      return { result: work.result, replayed: false, outcome, version: parsed.version };
    });
  }
}
