import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { validateRecord, type CrmRecord, type CrmSnapshot, type EntityName } from '../shared/model.js';
import type { RecoveryPlan } from '../shared/operations.js';
import { buildResponseQueue, type ResponseQueue } from '../shared/response-queue.js';
import { buildRescuePlan, compareBudgets, type RescuePlan } from '../shared/rescue-plan.js';
import { buildRescueReport, escapeHtml, renderReportHtml, serializeReport, type RescueReport, type SimulatorStats } from '../shared/rescue-report.js';
import { BUDGET_PRESETS, MAX_ESTIMATE_MINUTES, MIN_ESTIMATE_MINUTES, RESCUE_FORMAT, RescueError, STAGE_LABEL, assertTransition, type RescueContext, type RescueEvent, type RescueStage, type RescueState } from '../shared/rescue-room.js';
import { Recovery, type Remote } from './recovery.js';
import { AppError, Store } from './store.js';
import { RescueAmbiguous, RescueLedger, stableStringify } from './rescue-room-journal.js';
import { SimSchema, type Components, type SimData } from '../shared/rescue-capsule.js';
// Sala de Rescate: orquesta un Store ficticio propio, el Recovery existente y un CRM simulado con fallos reproducibles. Todo envío es simulado.
const MARKER = 'rescue-room.marker.json', SIM_FILE = 'crm-sim.json', TIME_ZONE = 'Europe/Madrid';
const dayFormat = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function madridDay(ms: number) {
  const p = dayFormat.formatToParts(ms);
  return ['year', 'month', 'day'].map(k => p.find(x => x.type === k)!.value).join('-');
}
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const sha = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
export const TASK_EDITABLE = ['status', 'due_date', 'subject', 'notes'] as const;
export const TASK_CREATABLE = ['subject', 'due_date', 'status', 'notes'] as const;
const OFFSETS = [-3, -2, -1, 0, 0, 0, 1, 1, 2, 3, 5, 7, 9, 12, 15, 20, 25, 30];
export const SCRIPT_ESTIMATES: Record<string, number> = { 'task-2': 20, 'task-3': 15, 'task-4': 25, 'task-5': 30, 'task-7': 20, 'task-8': 30, 'task-9': 45, 'task-10': 30, 'task-12': 40, 'task-13': 20, 'task-14': 60, 'task-15': 25 };

export interface RemoteDrift { entity: EntityName; id: string; values: CrmRecord['values'] }
/** Captura ficticia reproducible: fechas relativas al reloj inyectado (día civil de Madrid) y portal propio. */
export function buildRescueFixture(now: number, extraTasks = 0) {
  const base = makeFixture('agency'), today = madridDay(now);
  const snapshot: CrmSnapshot = { ...base, id: 'rescue-106-capture', name: 'Agencia Norte · ensayo de rescate', capturedAt: new Date(now - 8.5 * 3_600_000).toISOString(),
    source: { kind: 'fixture', accountId: 'demo-rescue-106', isTestData: true, description: 'Captura sintética del ensayo de rescate. No procede de una cuenta real de HubSpot.' } };
  snapshot.records = base.records.map(r => r.entity === 'tasks' ? { ...r, values: { ...r.values, due_date: addDays(today, OFFSETS[Number(r.id.slice(5)) - 1]) } } : r);
  if (extraTasks) {
    if (!Number.isInteger(extraTasks) || extraTasks < 0 || snapshot.records.length + extraTasks > 10000) throw new RangeError('El ensayo admite hasta 10.000 registros en total.');
    for (let i = 0; i < extraTasks; i++) snapshot.records.push({ entity: 'tasks', id: 'bulk-' + (i + 1), values: { subject: 'Seguimiento masivo ' + (i + 1), due_date: addDays(today, (i % 60) - 10), status: 'pending', notes: 'Registro ficticio de volumen.' } });
    snapshot.manifest = { ...snapshot.manifest!, expectedCounts: { ...snapshot.manifest!.expectedCounts, tasks: snapshot.manifest!.expectedCounts.tasks + extraTasks } };
  }
  const drift: RemoteDrift[] = [
    { entity: 'tasks', id: 'task-5', values: { due_date: addDays(today, 7) } },
    { entity: 'tasks', id: 'task-7', values: { notes: 'Actualizado en el CRM durante la caída.' } },
  ];
  return { snapshot, drift };
}
export function captureRevision(snapshot: CrmSnapshot) {
  const records = [...snapshot.records].sort((a, b) => (a.entity + '/' + a.id < b.entity + '/' + b.id ? -1 : 1));
  return sha(JSON.stringify({ id: snapshot.id, capturedAt: snapshot.capturedAt, account: snapshot.source.accountId, records }));
}

interface SimState { format: 'planb-rescue-sim-v1'; online: boolean; counter: number; records: CrmRecord[]; calls: { read: number; create: number; update: number; relate: number }; creates: { operationId: string; remoteId: string; subject: string }[]; lostAckArmed: boolean; driftApplied: boolean }
/** CRM simulado con estado propio (fichero aparte, no la tabla del Store). El efecto de create se persiste ANTES de fallar el acuse. */
export class SimulatedCrm implements Remote {
  readonly source = 'simulation' as const; readonly readOnly = false;
  constructor(private file: string, public accountId: string) {}
  static seed(file: string, accountId: string, records: CrmRecord[]) {
    const state: SimState = { format: 'planb-rescue-sim-v1', online: false, counter: 0, records: structuredClone(records), calls: { read: 0, create: 0, update: 0, relate: 0 }, creates: [], lostAckArmed: false, driftApplied: false };
    writeFileSync(file, JSON.stringify(state), { flag: 'wx' });
    return new SimulatedCrm(file, accountId);
  }
  private load(): SimState {
    let parsed: SimState;
    try { parsed = JSON.parse(readFileSync(this.file, 'utf8')) as SimState; } catch { throw new RescueError(409, 'SIM_CORRUPT', 'El estado del CRM simulado es ilegible. Se conserva sin modificar.'); }
    if (parsed?.format !== 'planb-rescue-sim-v1' || !Array.isArray(parsed.records)) throw new RescueError(409, 'SIM_CORRUPT', 'El estado del CRM simulado no tiene la forma esperada.');
    return parsed;
  }
  private save(state: SimState) { const tmp = this.file + '.tmp'; writeFileSync(tmp, JSON.stringify(state)); renameSync(tmp, this.file); }
  /** Copia validada del estado persistido del simulador (para una cápsula). */
  readState(): SimData { const parsed = SimSchema.safeParse(this.load()); if (!parsed.success) throw new RescueError(409, 'SIM_CORRUPT', 'El estado del CRM simulado no tiene la forma esperada.'); return parsed.data; }
  static seedFrom(file: string, accountId: string, data: SimData) { writeFileSync(file, JSON.stringify(data), { flag: 'wx' }); return new SimulatedCrm(file, accountId); }
  stats(): SimulatorStats {
    const s = this.load();
    return { online: s.online, records: s.records.length, calls: { ...s.calls }, creates: [...s.creates], duplicateCreates: s.creates.length - new Set(s.creates.map(c => c.operationId)).size };
  }
  records(entity?: EntityName) { return this.load().records.filter(r => !entity || r.entity === entity); }
  returnOnline(drift: { entity: EntityName; id: string; values: CrmRecord['values'] }[]) {
    const s = this.load();
    if (!s.driftApplied) { s.records = s.records.map(r => { const d = drift.find(x => x.entity === r.entity && x.id === r.id); return d ? { ...r, values: { ...r.values, ...d.values } } : r; }); s.driftApplied = true; }
    s.online = true; this.save(s); return drift;
  }
  setLostAck(armed: boolean) { const s = this.load(); s.lostAckArmed = armed; this.save(s); }
  private requireOnline(s: SimState) { if (!s.online) throw new AppError(503, 'El CRM simulado no está disponible todavía.'); }
  async verify() { this.requireOnline(this.load()); }
  async read(entity: EntityName, id: string) { const s = this.load(); this.requireOnline(s); s.calls.read++; this.save(s); return s.records.find(r => r.entity === entity && r.id === id) ?? null; }
  async create(entity: EntityName, values: CrmRecord['values'], operationId: string) {
    const s = this.load(); this.requireOnline(s); s.calls.create++;
    const id = 'crm-' + entity.slice(0, -1) + '-' + String(++s.counter).padStart(4, '0');
    s.records.push({ entity, id, values: structuredClone(values) }); s.creates.push({ operationId, remoteId: id, subject: String(values.subject ?? values.name ?? '') });
    const lose = s.lostAckArmed; if (lose) s.lostAckArmed = false;
    this.save(s);
    if (lose) throw new Error('Tiempo de espera agotado esperando el acuse del CRM simulado.');
    return id;
  }
  async update(entity: EntityName, id: string, values: CrmRecord['values']) {
    const s = this.load(); this.requireOnline(s); s.calls.update++;
    s.records = s.records.map(r => r.entity === entity && r.id === id ? { ...r, values: { ...r.values, ...values } } : r); this.save(s);
  }
  async relate() { const s = this.load(); s.calls.relate++; this.save(s); /* El simulador NO observa relaciones: no hay hasRelation, así que no se verifican asociaciones. */ }
  lostAckArmed() { return this.load().lostAckArmed; }
}

/** Una carpeta de ensayo reanudable solo si la creó este lanzador: bajo tests/.tmp/rescue106-*, sin enlaces y con marcador válido. */
export function assertOwnRoot(dir: string, repo = process.cwd()) {
  const full = resolve(dir), allowedBase = join(realpathSync(resolve(repo)), 'tests', '.tmp');
  if (!existsSync(full)) throw new RescueError(400, 'ROOT_MISSING', 'La carpeta de ensayo no existe.');
  if (lstatSync(full).isSymbolicLink()) throw new RescueError(400, 'ROOT_LINK', 'La carpeta de ensayo no puede ser un enlace.');
  const real = realpathSync(full);
  if (real !== full && real.toLowerCase() !== full.toLowerCase()) throw new RescueError(400, 'ROOT_LINK', 'La ruta de la carpeta de ensayo atraviesa un enlace.');
  if (dirname(real).toLowerCase() !== allowedBase.toLowerCase() || !basename(real).startsWith('rescue106-')) throw new RescueError(400, 'ROOT_OUTSIDE', 'Solo se reanudan carpetas creadas por este lanzador bajo tests/.tmp/rescue106-*.');
  const markerPath = join(real, MARKER);
  if (!existsSync(markerPath) || lstatSync(markerPath).isSymbolicLink()) throw new RescueError(400, 'ROOT_NO_MARKER', 'La carpeta no tiene el marcador del lanzador.');
  let marker: { format?: string; kind?: string; roomId?: string };
  try { marker = JSON.parse(readFileSync(markerPath, 'utf8')); } catch { throw new RescueError(400, 'ROOT_NO_MARKER', 'El marcador de la carpeta es ilegible.'); }
  if (!marker || typeof marker !== 'object') throw new RescueError(400, 'ROOT_NO_MARKER', 'El marcador de la carpeta es ilegible.');
  if (marker.format !== 'planb-rescue-marker-v1' || marker.kind !== 'rescue106' || basename(real) !== 'rescue106-' + marker.roomId) throw new RescueError(400, 'ROOT_NO_MARKER', 'El marcador no corresponde a esta carpeta.');
  return { real, roomId: marker.roomId! };
}

export interface RoomOptions { clock?: () => number; extraTasks?: number }
const taskIssues = (room: RescueRoom, id: string, values: Record<string, unknown>) => {
  const spec = room.store.spec!, previous = room.store.record('tasks', id);
  if (!previous) return { previous: null, issues: { _form: 'No se encontró la tarea.' } as Record<string, string> };
  return { previous, issues: validateRecord(spec, { ...previous, values: { ...previous.values, ...values } as CrmRecord['values'] }, previous) };
};
export class RescueRoom {
  readonly store: Store; readonly recovery: Recovery; readonly ledger: RescueLedger; readonly crm: SimulatedCrm; readonly clock: () => number;
  private constructor(public readonly root: string, public readonly roomId: string, store: Store, crm: SimulatedCrm, clock: () => number, private drift: RemoteDrift[]) {
    this.store = store; this.crm = crm; this.clock = clock; this.recovery = new Recovery(store);
    this.ledger = new RescueLedger(store, clock, () => Number((store.db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM changes').get() as { n: number }).n));
  }
  /** Raíz nueva: nunca reutiliza ni siembra sobre una carpeta existente. */
  static create(parent: string, options: RoomOptions = {}) {
    const clock = options.clock ?? Date.now, roomId = randomUUID(), root = join(resolve(parent), 'rescue106-' + roomId);
    mkdirSync(root, { recursive: false });
    writeFileSync(join(root, MARKER), JSON.stringify({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId, createdAt: new Date(clock()).toISOString() }), { flag: 'wx' });
    const { snapshot, drift } = buildRescueFixture(clock(), options.extraTasks ?? 0), store = new Store(join(root, 'planb.sqlite'));
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(clock()).toISOString(), prompt: '', approved: false });
    store.activate();
    const crm = SimulatedCrm.seed(join(root, SIM_FILE), snapshot.source.accountId, snapshot.records);
    const room = new RescueRoom(root, roomId, store, crm, clock, drift);
    const captured = store.snapshot!;
    const context: RescueContext = { workspaceId: roomId, accountId: captured.source.accountId, captureId: captured.id, captureRevision: captureRevision(captured) };
    const startedAt = new Date(clock() - 8 * 3_600_000).toISOString();
    room.ledger.init({ format: RESCUE_FORMAT, version: 1, incidentId: randomUUID(), context, stage: 'preparation', openedAt: new Date(clock()).toISOString(), incidentStartedAt: startedAt, incidentHours: 8, horizonHours: 24,
      budgetMinutes: null, estimates: {}, notes: {}, blocked: {}, selectedTaskId: null, crmOnline: false, faults: { lostAck: false }, returnPlanId: null, closedAt: null, closeNote: '' },
    { actor: 'system', kind: 'incident-opened', summary: 'Incidente ficticio abierto: el CRM lleva 8 h caído.', data: { captureRevision: context.captureRevision, records: captured.records.length } });
    return room;
  }
  static open(dir: string, options: RoomOptions = {}, repo = process.cwd()) {
    const { real, roomId } = assertOwnRoot(dir, repo), store = new Store(join(real, 'planb.sqlite')), clock = options.clock ?? Date.now;
    const snap = store.snapshot;
    if (!snap) { store.close(); throw new RescueError(409, 'ROOM_EMPTY', 'La carpeta no contiene una captura. No se vuelve a sembrar.'); }
    const room = new RescueRoom(real, roomId, store, new SimulatedCrm(join(real, SIM_FILE), snap.source.accountId), clock, buildRescueFixture(clock()).drift);
    return room;
  }
  close() { this.store.close(); }
  /** Digest canónico del contenido lógico de la sala (registros, cambios, estado, diario, idempotencia, plan, simulación). Igualdad de contenido, no autenticidad. */
  logicalDigest(): string {
    const l = this.ledger.readAllowlist(), sim = this.crm.readState();
    return createHash('sha256').update(stableStringify({ records: this.store.records(), changes: this.store.changes(), allow: l, plan: this.store.recoveryState().plan, watermark: this.store.get('returnWatermark:simulation', 0), mapping: this.store.get('remoteMapping:simulation', {}), sim })).digest('hex');
  }
  /** Captura COHERENTE de todos los componentes bajo exclusión de las mutaciones de la sala. Si el contenido cambia durante la lectura (escritor ajeno) se reintenta de forma acotada y, si persiste, se rechaza. No escribe en el origen. */
  async captureComponents(options: { hook?: (step: string) => void | Promise<void>; maxAttempts?: number } = {}): Promise<{ components: Omit<Components, 'bundle'> & { bundle: unknown }; attempts: number }> {
    const max = options.maxAttempts ?? 3;
    return this.ledger.exclusive(async () => {
      for (let attempt = 1; attempt <= max; attempt++) {
        const before = this.logicalDigest(); await options.hook?.('capture:start');
        const bundle = this.store.bundle(); await options.hook?.('capture:after-bundle');
        const allow = this.ledger.readAllowlist(), recovery = this.store.recoveryState(); const sim = this.crm.readState(); await options.hook?.('capture:after-sim');
        const after = this.logicalDigest();
        if (before !== after) continue;
        const state = allow.state as Components['rescue']['state'], journal = allow.journal as Components['rescue']['journal'];
        if (!state || !Array.isArray(journal)) throw new RescueError(409, 'RESCUE_CORRUPT', 'El estado o el diario del incidente no se pueden leer: no se exporta.');
        return { attempts: attempt, components: { bundle, rescue: { state, journal, idem: allow.idem as Components['rescue']['idem'] }, recovery: { plan: recovery.plan, watermark: this.store.get('returnWatermark:simulation', 0), mapping: this.store.get('remoteMapping:simulation', {}) }, sim } };
      }
      throw new RescueError(409, 'CAPTURE_UNSTABLE', 'El contenido de la sala cambió durante la captura en cada intento (' + max + '). No se exporta una mezcla de instantes; repite cuando no haya otro escritor.');
    });
  }
  /**
   * Importa componentes YA validados a una sala NUEVA: staging → restoreBundle (comprobación estándar) → claves de devolución del simulador → estado/diario/idempotencia
   * → validación → publicación por renombrado → primer arranque por la ruta normal (assertOwnRoot). Un fallo no deja un destino parcial presentado como válido.
   */
  static importComponents(parent: string, c: Components, meta: { capsuleRevision: string }, options: RoomOptions & { onStep?: (step: string) => void; roomId?: string } = {}) {
    const clock = options.clock ?? Date.now, step = options.onStep ?? (() => undefined), base = resolve(parent), newId = options.roomId ?? randomUUID();
    if (!/^[0-9a-f-]{36}$/.test(newId)) throw new RescueError(400, 'BAD_ROOM_ID', 'Identificador de sala no válido.');
    const finalRoot = join(base, 'rescue106-' + newId), staging = join(base, 'rescue116-staging-' + newId), retired: string[] = [];
    mkdirSync(staging, { recursive: false }); let store: Store | null = null;
    const KNOWN = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'planb.sqlite-journal', MARKER];
    const dropStaging = () => { try { store?.close(); } catch { /* ya cerrado */ } for (const n of KNOWN) { try { unlinkSync(join(staging, n)); } catch { /* ausente */ } } try { if (!readdirSync(staging).length) rmdirSync(staging); } catch { /* conservado */ } };
    try {
      const origin = c.rescue.state, now = new Date(clock()).toISOString();
      writeFileSync(join(staging, MARKER), JSON.stringify({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId: newId, createdAt: now, pid: process.pid, capsuleRevision: meta.capsuleRevision }), { flag: 'wx' }); step('staging-created');
      store = new Store(join(staging, 'planb.sqlite')); store.restoreBundle(c.bundle); step('bundle-restored');
      let plan = c.recovery.plan ? structuredClone(c.recovery.plan) : null;
      if (plan) {
        for (const op of plan.operations) if (op.status === 'sending') { op.status = 'uncertain'; op.error = 'La cápsula se exportó durante un envío. Verifica el resultado remoto antes de repetir.'; }
        if (plan.approvedAt || plan.status === 'approved') retired.push('Aprobación del plan retirada: hay que revisar y aprobar de nuevo en el destino.');
        if (plan.status === 'applying' || plan.operations.some(o => o.status === 'uncertain')) { plan.status = 'partial'; plan.approvedAt = null; } else if (plan.status === 'approved') { plan.status = 'review'; plan.approvedAt = null; }
        if (plan.operations.some(o => o.status === 'uncertain')) retired.push('Operaciones inciertas CONSERVADAS como inciertas (no pasan a pendientes ni se reenvían).');
      }
      const inner = store; inner.transaction(() => { if (plan) inner.set('recoveryPlan', plan); inner.set('returnWatermark:simulation', c.recovery.watermark); inner.set('remoteMapping:simulation', c.recovery.mapping); });
      if (plan && new Recovery(store).revision() !== plan.revision) throw new RescueError(422, 'REVISION_MISMATCH', 'La revisión local del plan de devolución no coincide con la copia restaurada: el plan no es aplicable en el destino.');
      const sim: SimData = { ...c.sim, lostAckArmed: false }; if (c.sim.lostAckArmed) retired.push('Fallo de acuse perdido armado en el origen: desarmado en el destino.');
      SimulatedCrm.seedFrom(join(staging, SIM_FILE), store.snapshot!.source.accountId, sim);
      const version = origin.version + 1, state = { ...origin, version, context: { ...origin.context, workspaceId: newId }, faults: { lostAck: false }, lineage: { origins: [...(origin.lineage?.origins ?? []), origin.context.workspaceId], importedAt: now, capsuleRevision: meta.capsuleRevision } };
      retired.push('Idempotencia del origen conservada solo como historia: sus claves pertenecen al contexto del origen y no se repiten en el destino.');
      const event = { seq: c.rescue.journal.length + 1, id: randomUUID(), at: now, actor: 'system' as const, kind: 'capsule-imported' as const, stateVersion: version, workspaceId: newId, captureRevision: origin.context.captureRevision,
        summary: 'Sala creada desde una cápsula del origen ' + origin.context.workspaceId.slice(0, 8) + '. No se envía nada automáticamente.', data: { originWorkspaceId: origin.context.workspaceId, originVersion: origin.version, capsuleRevision: meta.capsuleRevision, retired } };
      const ledger = new RescueLedger(store, clock, () => 0); ledger.restoreImported(state, [...c.rescue.journal, event], c.rescue.idem);
      if (ledger.inspect().integrity.status !== 'ok') throw new RescueError(422, 'IMPORT_INCOHERENT', 'El destino no supera la comprobación de integridad.'); step('components-written');
      if (store.records().length !== c.bundle.records.length || store.changes().length !== c.bundle.changes.length) throw new RescueError(422, 'IMPORT_INCOHERENT', 'El destino no conserva los registros o cambios del origen.'); step('validated');
      store.close(); store = null; step('before-publish'); renameSync(staging, finalRoot); step('published');
      try { const first = RescueRoom.open(finalRoot, { clock }); const view = first.view(); first.close(); if (view.blocked) throw new RescueError(422, 'FIRST_START_BLOCKED', 'El destino se publicó pero no abre de forma coherente.'); }
      catch (error) { try { renameSync(finalRoot, join(base, 'rescue116-failed-' + newId)); } catch { /* se conserva donde esté */ } throw error; }
      step('first-start-ok'); return { root: finalRoot, roomId: newId, retired };
    } catch (error) { dropStaging(); throw error; }
  }
  private current(): RescueState { const s = this.ledger.inspect(); if (s.integrity.status === 'corrupt') throw new RescueError(409, 'RESCUE_CORRUPT', s.integrity.reason); if (!s.state) throw new RescueError(409, 'RESCUE_EMPTY', 'No hay incidente.'); return s.state; }
  private openTask(id: string) { const t = this.store.record('tasks', id); if (!t) throw new RescueError(404, 'TASK_NOT_FOUND', 'No existe esa tarea en esta captura.'); return t; }
  private requireStage(state: RescueState, stages: RescueStage[], what: string) { if (!stages.includes(state.stage)) throw new RescueError(409, 'STAGE_BLOCKED', what + ' no está disponible en «' + STAGE_LABEL[state.stage] + '».'); }
  queue(state = this.current(), limit = 200): ResponseQueue { return buildResponseQueue({ spec: this.store.spec!, records: this.store.records(), evaluatedAt: this.clock(), horizonHours: state.horizonHours, limit }); }
  private planFor(state: RescueState, queue: ResponseQueue): RescuePlan | null { return state.budgetMinutes ? buildRescuePlan(queue, { budgetMinutes: state.budgetMinutes, estimates: state.estimates, blocked: state.blocked }) : null; }
  localChanges() {
    return this.store.changes().map(c => ({ entity: c.entity, recordId: c.recordId, operation: c.operation, at: c.at,
      fields: c.before ? Object.keys(c.after.values).filter(k => JSON.stringify(c.before!.values[k] ?? null) !== JSON.stringify(c.after.values[k] ?? null)) : Object.keys(c.after.values),
      completed: !!c.before && c.before.values.status !== 'completed' && c.after.values.status === 'completed' }));
  }
  /** Modelo de lectura completo. No cambia estado. */
  view() {
    const loaded = this.ledger.inspect();
    if (loaded.integrity.status !== 'ok' || !loaded.state) return { integrity: loaded.integrity, roomId: this.roomId, blocked: true as const };
    const state = loaded.state, queue = this.queue(state), plan = this.planFor(state, queue), snap = this.store.snapshot!;
    const spec = this.store.spec!, taskEntity = spec.entities.find(e => e.id === 'tasks')!;
    const included = new Map(plan?.included.map(e => [e.id, e]) ?? []), excluded = new Map(plan?.excluded.map(e => [e.id, e]) ?? []);
    const items = queue.items.map(i => ({ ...i, estimate: state.estimates[i.id] ?? null, blocked: state.blocked[i.id] ?? null, note: state.notes[i.id] ?? '', plan: included.has(i.id) ? { included: true as const, ...included.get(i.id)! } : excluded.has(i.id) ? { included: false as const, reason: excluded.get(i.id)!.reason, detail: excluded.get(i.id)!.detail } : null }));
    const selected = state.selectedTaskId ? this.store.record('tasks', state.selectedTaskId) : null;
    const recovery = this.store.recoveryState();
    const counts = Object.fromEntries((['contacts', 'companies', 'deals', 'tasks'] as EntityName[]).map(e => [e, this.store.records(e).length]));
    return {
      blocked: false as const, integrity: loaded.integrity, roomId: this.roomId, format: RESCUE_FORMAT, context: state.context, stage: state.stage, stageLabel: STAGE_LABEL[state.stage], version: state.version,
      incident: { startedAt: state.incidentStartedAt, hours: state.incidentHours, openedAt: state.openedAt, now: new Date(this.clock()).toISOString(), horizonHours: state.horizonHours },
      capture: { id: snap.id, name: snap.name, capturedAt: snap.capturedAt, accountId: snap.source.accountId, revision: state.context.captureRevision, records: this.store.records().length, counts },
      banner: 'Ensayo · datos ficticios · no conecta con HubSpot',
      queue: { summary: queue.summary, evaluatedAt: queue.evaluatedAt, horizonEndsAt: queue.horizonEndsAt, limitations: queue.limitations, items },
      budgetMinutes: state.budgetMinutes, plan, presets: BUDGET_PRESETS, comparison: compareBudgets(queue, 30, 60, state.estimates, state.blocked).onlyInB,
      estimateRange: { min: MIN_ESTIMATE_MINUTES, max: MAX_ESTIMATE_MINUTES }, selected: selected && { record: selected, fields: taskEntity.fields.map(f => ({ key: f.key, label: f.label, type: f.type, required: f.required, readOnly: f.readOnly, editable: (TASK_EDITABLE as readonly string[]).includes(f.key), options: f.options })) },
      localChanges: this.localChanges(), crm: { online: state.crmOnline, lostAckArmed: this.crm.lostAckArmed(), stats: this.crm.stats() },
      recoveryIntegrity: recovery.integrity, returnPlan: recovery.plan as RecoveryPlan | null, journal: { total: loaded.journal.length, events: loaded.journal.slice(-60).reverse() }, closed: state.stage === 'closed',
    };
  }
  previewEdit(taskId: string, values: Record<string, unknown>) {
    const state = this.current(); this.openTask(taskId);
    const bad = Object.keys(values).filter(k => !(TASK_EDITABLE as readonly string[]).includes(k));
    if (bad.length) return { ok: false, issues: Object.fromEntries(bad.map(k => [k, 'Este campo no se edita en la sala.'])), diff: [] as { key: string; before: unknown; after: unknown }[], stage: state.stage };
    const { previous, issues } = taskIssues(this, taskId, values);
    return { ok: !Object.keys(issues).length, issues, diff: Object.entries(values).filter(([k, v]) => JSON.stringify(previous!.values[k] ?? null) !== JSON.stringify(v ?? null)).map(([key, after]) => ({ key, before: previous!.values[key] ?? null, after })), stage: state.stage };
  }
  candidates(planId: string, operationId: string) {
    const plan = this.recovery.plan(); const op = plan?.id === planId ? plan.operations.find(o => o.id === operationId) : undefined;
    if (!op || op.status !== 'uncertain') throw new RescueError(404, 'NO_UNCERTAIN', 'No hay una operación incierta con ese identificador.');
    const wanted = op.fields.filter(f => f.decision === 'local');
    return this.crm.records(op.entity).filter(r => wanted.every(f => JSON.stringify(r.values[f.field] ?? null) === JSON.stringify(f.local ?? null))).map(r => ({ id: r.id, summary: String(r.values.subject ?? r.id), values: r.values }));
  }
  // ---------------------------------------------------------------- mutaciones (todas con versión esperada, contexto e idempotencia)
  private ev = (actor: RescueEvent['actor'], kind: RescueEvent['kind'], summary: string, data: Record<string, unknown> = {}) => ({ actor, kind, summary, data });
  choosePlan(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; budgetMinutes: number }) {
    return this.ledger.run({ route: 'plan', envelope: req, payload: { budgetMinutes: req.budgetMinutes }, work: async ({ state }) => {
      this.requireStage(state, ['preparation', 'local-work'], 'Elegir el plan');
      const to: RescueStage = 'local-work'; assertTransition(state.stage, to);
      return { next: s => ({ ...s, stage: to, budgetMinutes: req.budgetMinutes }), events: [this.ev('operator', 'plan-chosen', 'Plan de ' + req.budgetMinutes + ' min elegido.', { budgetMinutes: req.budgetMinutes })], result: { budgetMinutes: req.budgetMinutes } };
    } });
  }
  loadScriptEstimates(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext }) {
    return this.ledger.run({ route: 'estimates-script', envelope: req, payload: {}, work: async ({ state }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review'], 'Cargar estimaciones');
      const known = Object.fromEntries(Object.entries(SCRIPT_ESTIMATES).filter(([id]) => this.store.record('tasks', id)));
      return { next: s => ({ ...s, estimates: { ...s.estimates, ...known } }), events: [this.ev('operator', 'estimates-loaded', 'Estimaciones del guion cargadas (declaradas, editables): ' + Object.keys(known).length + ' tareas.', { source: 'script', count: Object.keys(known).length })], result: { count: Object.keys(known).length } };
    } });
  }
  setEstimate(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; taskId: string; minutes: number | null }) {
    return this.ledger.run({ route: 'estimate', envelope: req, payload: { taskId: req.taskId, minutes: req.minutes }, work: async ({ state }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review', 'return-partial'], 'Estimar'); this.openTask(req.taskId);
      return { next: s => { const estimates = { ...s.estimates }; if (req.minutes === null) delete estimates[req.taskId]; else estimates[req.taskId] = req.minutes; return { ...s, estimates }; },
        events: [this.ev('operator', 'estimate-set', req.minutes === null ? 'Estimación retirada de ' + req.taskId + '.' : 'Estimación de ' + req.minutes + ' min para ' + req.taskId + '.', { taskId: req.taskId, minutes: req.minutes })], result: { taskId: req.taskId, minutes: req.minutes } };
    } });
  }
  saveNote(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; taskId: string; text: string }) {
    return this.ledger.run({ route: 'note', envelope: req, payload: { taskId: req.taskId, text: req.text }, work: async ({ state }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review', 'return-partial'], 'Guardar notas'); this.openTask(req.taskId);
      return { next: s => { const notes = { ...s.notes }; if (req.text.trim()) notes[req.taskId] = req.text; else delete notes[req.taskId]; return { ...s, notes }; },
        events: [this.ev('operator', 'note-saved', 'Nota operativa de ' + req.taskId + ' guardada (separada de los campos del CRM).', { taskId: req.taskId, chars: req.text.length })], result: { taskId: req.taskId } };
    } });
  }
  declareBlocker(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; taskId: string; reason: string }) {
    return this.ledger.run({ route: 'blocker', envelope: req, payload: { taskId: req.taskId, reason: req.reason }, work: async ({ state }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review', 'return-partial'], 'Declarar un bloqueo'); this.openTask(req.taskId);
      return { next: s => { const blocked = { ...s.blocked }; if (req.reason.trim()) blocked[req.taskId] = req.reason; else delete blocked[req.taskId]; return { ...s, blocked }; },
        events: [this.ev('operator', 'blocker-declared', req.reason.trim() ? 'Bloqueo declarado por el operador en ' + req.taskId + '.' : 'Bloqueo retirado de ' + req.taskId + '.', { taskId: req.taskId })], result: { taskId: req.taskId } };
    } });
  }
  select(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; taskId: string | null }) {
    return this.ledger.run({ route: 'select', envelope: req, payload: { taskId: req.taskId }, work: async () => {
      if (req.taskId) this.openTask(req.taskId);
      return { next: s => ({ ...s, selectedTaskId: req.taskId }), events: [], result: { taskId: req.taskId } };
    } });
  }
  editTask(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; taskId: string; values: Record<string, unknown> }) {
    return this.ledger.run({ route: 'edit', envelope: req, payload: { taskId: req.taskId, values: req.values }, work: async ({ state, resume, baseChangeId, attribution }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review'], 'Editar una tarea');
      const bad = Object.keys(req.values).filter(k => !(TASK_EDITABLE as readonly string[]).includes(k));
      if (bad.length) throw new RescueError(422, 'FIELD_NOT_EDITABLE', 'Estos campos no se editan en la sala: ' + bad.join(', ') + '.');
      const before = this.openTask(req.taskId);
      // Recuperación tras una interrupción: SOLO un efecto posterior a la intención, con su contenido y NO atribuido ya a otra intención terminada. Si es ambiguo no se adopta.
      const found = resume ? this.store.changes().filter(c => c.id > baseChangeId && c.entity === 'tasks' && c.recordId === req.taskId && !attribution.claimedChangeIds.has(c.id) && Object.entries(req.values).every(([k, v]) => JSON.stringify(c.after.values[k] ?? null) === JSON.stringify(v ?? null))) : [];
      if (found.length > 1 || found.length === 1 && attribution.otherStartedSameIntent) throw new RescueAmbiguous('No se puede atribuir el cambio a esta intención: hay otra intención iniciada con el mismo contenido. Revisa la copia local; no se adopta ni se repite el cambio.');
      const already = found[0];
      let changeId: number;
      if (already) changeId = already.id;
      else {
        const saved = this.store.saveRecord('tasks', req.values as CrmRecord['values'], req.taskId); void saved;
        changeId = Math.max(...this.store.changes().map(c => c.id));
      }
      const diff = Object.entries(req.values).filter(([k, v]) => JSON.stringify(before.values[k] ?? null) !== JSON.stringify(v ?? null)).map(([key, after]) => ({ key, before: before.values[key] ?? null, after }));
      return { next: s => ({ ...s, stage: s.stage === 'preparation' ? 'preparation' : s.stage }), events: [this.ev('operator', 'local-edit', 'Cambio local confirmado en ' + req.taskId + ': ' + diff.map(d => d.key).join(', ') + '.', { taskId: req.taskId, changeId, diff })], result: { taskId: req.taskId, changeId, diff, recovered: !!already } };
    } });
  }
  createTask(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; values: Record<string, unknown> }) {
    return this.ledger.run({ route: 'create', envelope: req, payload: { values: req.values }, work: async ({ state, resume, baseChangeId, attribution }) => {
      this.requireStage(state, ['preparation', 'local-work', 'return-review'], 'Crear una tarea');
      const bad = Object.keys(req.values).filter(k => !(TASK_CREATABLE as readonly string[]).includes(k));
      if (bad.length) throw new RescueError(422, 'FIELD_NOT_CREATABLE', 'Estos campos no se admiten al crear en la sala (las relaciones no se pueden devolver ni verificar en el simulador): ' + bad.join(', ') + '.');
      const candidates = resume ? this.store.changes().filter(c => c.id > baseChangeId && c.entity === 'tasks' && c.operation === 'create' && !attribution.claimedRecordIds.has(c.recordId) && Object.entries(req.values).every(([k, v]) => JSON.stringify(c.after.values[k] ?? null) === JSON.stringify(v ?? null))) : [];
      if (candidates.length > 1 || candidates.length === 1 && attribution.otherStartedSameIntent) throw new RescueAmbiguous('No se puede atribuir la tarea creada a esta intención: hay otra intención iniciada con el mismo contenido. Revisa la copia local; no se adopta ni se repite la creación.');
      const found = candidates[0];
      const recordId = found ? found.recordId : this.store.saveRecord('tasks', req.values as CrmRecord['values']).id;
      return { next: s => s, events: [this.ev('operator', 'local-create', 'Tarea nueva creada en la copia local: ' + String(req.values.subject ?? '') + '.', { recordId })], result: { recordId, recovered: !!found } };
    } });
  }
  crmReturn(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext }) {
    return this.ledger.run({ route: 'crm-return', envelope: req, payload: {}, work: async ({ state }) => {
      this.requireStage(state, ['local-work'], 'Simular la vuelta del CRM');
      const changed = this.crm.returnOnline(this.drift);
      return { next: s => ({ ...s, crmOnline: true }), events: [this.ev('simulator', 'crm-returned', 'El CRM simulado vuelve. Durante la caída cambió: ' + changed.map(c => c.id).join(', ') + '.', { changed: changed.map(c => ({ id: c.id, fields: Object.keys(c.values) })) })], result: { changed: changed.map(c => c.id) } };
    } });
  }
  armLostAck(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; armed: boolean }) {
    return this.ledger.run({ route: 'arm-lost-ack', envelope: req, payload: { armed: req.armed }, work: async ({ state }) => {
      if (state.stage === 'closed') throw new RescueError(409, 'STAGE_BLOCKED', 'El ensayo está cerrado.');
      this.crm.setLostAck(req.armed);
      return { next: s => ({ ...s, faults: { lostAck: req.armed } }), events: [this.ev('operator', 'fault-armed', req.armed ? 'Armado: el simulador aplicará el próximo create y perderá el acuse.' : 'Fallo de acuse perdido desarmado.', { lostAck: req.armed })], result: { armed: req.armed } };
    } });
  }
  prepareReturn(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext }) {
    return this.ledger.run({ route: 'prepare', envelope: req, payload: {}, work: async ({ state }) => {
      this.requireStage(state, ['local-work', 'return-review', 'return-partial'], 'Preparar el retorno');
      if (!state.crmOnline) throw new RescueError(409, 'CRM_OFFLINE', 'El CRM todavía no ha vuelto: no hay con qué comparar.');
      const plan = await this.recovery.preview(this.crm);
      const to: RescueStage = state.stage === 'return-partial' ? 'return-partial' : 'return-review'; assertTransition(state.stage, to);
      return { next: s => ({ ...s, stage: to, returnPlanId: plan.id }), events: [this.ev('system', 'return-prepared', 'Retorno preparado: ' + plan.operations.length + ' operaciones, ' + plan.operations.flatMap(o => o.fields).filter(f => f.conflict).length + ' campos en conflicto.', { planId: plan.id, operations: plan.operations.length })], result: { planId: plan.id } };
    } });
  }
  decide(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; planId: string; decisions: { operationId: string; field: string; decision: 'local' | 'remote' }[] }) {
    return this.ledger.run({ route: 'decide', envelope: req, payload: { planId: req.planId, decisions: req.decisions }, work: async ({ state }) => {
      this.requireStage(state, ['return-review', 'return-partial'], 'Decidir');
      this.assertPlan(state, req.planId); const plan = this.recovery.decide(req.planId, req.decisions);
      return { next: s => s, events: [this.ev('operator', 'decision-recorded', 'Decisión registrada en ' + req.decisions.length + ' campo(s). La aprobación anterior queda sin efecto.', { decisions: req.decisions })], result: { planId: plan.id, status: plan.status } };
    } });
  }
  approve(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; planId: string }) {
    return this.ledger.run({ route: 'approve', envelope: req, payload: { planId: req.planId }, work: async ({ state }) => {
      this.requireStage(state, ['return-review', 'return-partial'], 'Aprobar'); this.assertPlan(state, req.planId); const plan = this.recovery.approve(req.planId);
      return { next: s => s, events: [this.ev('operator', 'return-approved', 'Plan aprobado (ligado a la revisión local vigente). Todo envío es simulado.', { planId: plan.id, revision: plan.revision.slice(0, 12) })], result: { planId: plan.id, status: plan.status } };
    } });
  }
  refresh(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext }) {
    return this.ledger.run({ route: 'refresh', envelope: req, payload: {}, work: async ({ state }) => {
      this.requireStage(state, ['return-review', 'return-partial'], 'Actualizar la revisión'); if (!state.returnPlanId) throw new RescueError(409, 'NO_PLAN', 'No hay plan que actualizar.');
      const plan = await this.recovery.refresh(state.returnPlanId, this.crm);
      return { next: s => s, events: [this.ev('system', 'return-refreshed', 'Revisión actualizada contra el CRM simulado; las decisiones se recalculan.', { planId: plan.id })], result: { planId: plan.id } };
    } });
  }
  private assertPlan(state: RescueState, planId: string) { if (!state.returnPlanId || state.returnPlanId !== planId) throw new RescueError(409, 'PLAN_STALE', 'Ese plan ya no es el vigente. Actualiza la sala.'); }
  apply(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; planId: string }) {
    return this.ledger.run({ route: 'apply', envelope: req, payload: { planId: req.planId }, work: async ({ state }) => {
      this.requireStage(state, ['return-review', 'return-partial'], 'Aplicar'); this.assertPlan(state, req.planId);
      const started = Date.now(); const plan = await this.recovery.apply(req.planId, this.crm); const ms = Date.now() - started;
      const to: RescueStage = plan.status === 'complete' ? 'return-verified' : plan.status === 'review' ? 'return-review' : 'return-partial'; assertTransition(state.stage, to);
      const counts = { applied: plan.operations.filter(o => o.status === 'applied').length, uncertain: plan.operations.filter(o => o.status === 'uncertain').length, failed: plan.operations.filter(o => o.status === 'failed').length };
      const faults = this.crm.lostAckArmed();
      return { next: s => ({ ...s, stage: to, faults: { lostAck: faults } }), outcome: counts.uncertain ? 'uncertain' as const : 'saved' as const,
        events: [this.ev('simulator', 'apply-attempted', 'Envío simulado: ' + counts.applied + ' verificadas, ' + counts.uncertain + ' inciertas, ' + counts.failed + ' fallidas.', { planId: plan.id, status: plan.status, ...counts, durationMs: ms })], result: { planId: plan.id, status: plan.status, ...counts } };
    } });
  }
  resolve(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; planId: string; operationId: string; remoteId: string }) {
    return this.ledger.run({ route: 'resolve', envelope: req, payload: { planId: req.planId, operationId: req.operationId, remoteId: req.remoteId }, work: async ({ state }) => {
      this.requireStage(state, ['return-partial'], 'Conciliar un resultado incierto'); this.assertPlan(state, req.planId);
      const plan = await this.recovery.resolveUncertain(req.planId, req.operationId, req.remoteId, this.crm);
      return { next: s => s, events: [this.ev('operator', 'uncertain-resolved', 'Resultado incierto conciliado con el ID remoto ' + req.remoteId + ' sin repetir el envío.', { operationId: req.operationId, remoteId: req.remoteId })], result: { planId: plan.id, status: plan.status } };
    } });
  }
  closeIncident(req: { idempotencyKey: string; expectedVersion: number; context: RescueContext; note: string }) {
    return this.ledger.run({ route: 'close', envelope: req, payload: { note: req.note }, work: async ({ state }) => {
      assertTransition(state.stage, 'closed');
      return { next: s => ({ ...s, stage: 'closed', closedAt: new Date(this.clock()).toISOString(), closeNote: req.note, crmOnline: s.crmOnline }), events: [this.ev('operator', 'closed', 'Ensayo cerrado. Esto no significa que el negocio se haya recuperado.', { fromStage: state.stage })], result: { closed: true } };
    } });
  }
  // ---------------------------------------------------------------- informe
  report(): RescueReport {
    const loaded = this.ledger.inspect(); if (loaded.integrity.status !== 'ok' || !loaded.state) throw new RescueError(409, 'RESCUE_CORRUPT', 'No se genera informe de un diario ilegible.');
    const state = loaded.state, queue = this.queue(state), snap = this.store.snapshot!, recovery = this.store.recoveryState();
    return buildRescueReport({ generatedAt: new Date(this.clock()).toISOString(), state, capture: { name: snap.name, capturedAt: snap.capturedAt, records: this.store.records().length, counts: Object.fromEntries((['contacts', 'companies', 'deals', 'tasks'] as EntityName[]).map(e => [e, this.store.records(e).length])) },
      queue: { totalTasks: queue.summary.totalTasks, completedTasks: queue.summary.completedTasks, knownOpenTasks: queue.summary.knownOpenTasks, unknownStatusTasks: queue.summary.unknownStatusTasks, totalQueued: queue.summary.totalQueued, returned: queue.summary.returned, truncated: queue.summary.truncated },
      plan: this.planFor(state, queue), journal: loaded.journal, returnPlan: recovery.plan as RecoveryPlan | null, simulator: this.crm.stats(), localChanges: this.localChanges() });
  }
  reportJson() { return serializeReport(this.report()); }
  reportHtml() { return renderReportHtml(this.report()); }
}
export { escapeHtml };
