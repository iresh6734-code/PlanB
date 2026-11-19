import type { CrmRecord, FieldValue } from './model.js';
import { contextKey, type TaskContext } from './local-task-focus.js';

// Cuaderno reiniciable de intenciones de guardado (unidad 208). Modelo y PROTOCOLO puros: sin Store, sin red, sin React. El almacenamiento llega por la interfaz
// `IntentStorage` (el adaptador de servidor usa Store.meta, que ya sella cada valor con la clave local).
//
// Garantías (acotadas a lo que este módulo controla):
//  · NINGÚN envío antes de que el intento sea duradero: `attempt()` escribe y confirma el registro ANTES de llamar a `send`. Si esa escritura falla, `send` no se llama.
//  · tras un reinicio, lo que no tiene acuse NO se reenvía ni se da por perdido: un intento sin resolver queda `unknown-outcome` (incierto). El arranque solo CLASIFICA
//    (`boot` no escribe) y esta API no contiene ninguna función que envíe una cola.
//  · un registro corrupto, truncado, de versión distinta o de otra captura/instalación se CONSERVA sin aplicarse, y nunca se ofrece en otra copia.
//  · nunca se borra por retención lo que no está resuelto; al llegar al tope se rechaza el alta con un motivo claro.
//  · escritura con comparación (`expected`): dos escritores no se pisan en silencio.
// Lo que NO garantiza: que un PATCH ya entregado a la red llegue o no, ni distinguir «salió» de «nunca salió» cuando el proceso muere entre la escritura de
// `attempt` y el envío (por eso se trata como incierto); ni resistencia a manipulación (el checksum detecta corrupción accidental, no ataques);
// ni cifrado propio (lo da el almacenamiento); ni exclusión entre procesos (la da el candado de instancia del almacenamiento).

export const KEY_PREFIX = 'task-intent:';
export const INTENT_VERSION = 1, MAX_RECORDS = 200, SETTLED_TTL_MS = 14 * 24 * 3_600_000, MAX_RECORD_BYTES = 200_000;
export type IntentPhase = 'draft' | 'attempt' | 'settled';
/** Cómo terminó un intento. `accepted-read` es una decisión de la persona tras una lectura; `acknowledged` solo lo registra el acuse del servidor. */
export type SettledOutcome = 'acknowledged' | 'rejected' | 'not-sent' | 'accepted-read' | 'abandoned';
export type Provenance = 'server-ack' | 'person-accepted-read' | null;
export interface ReadEvidence { kind: 'applied' | 'unchanged' | 'diverged'; at: string; }
export interface IntentRecord {
  v: typeof INTENT_VERSION;
  /** Identidad del intento (ID local); un borrador usa el suyo. */
  id: string;
  /** Instalación y captura/generación con las que se abrió la tarea (`contextKey`). Sin ambas coincidentes un registro no se aplica. */
  installId: string | null; contextKey: string; taskId: string;
  phase: IntentPhase; outcome: SettledOutcome | null; provenance: Provenance;
  /** Solo los campos cambiados y su valor base: DATOS SENSIBLES de cliente, viven únicamente en el almacenamiento sellado. */
  patch: Record<string, FieldValue>; baseline: Record<string, FieldValue>;
  /** Token de la lectura revisada (128/166), si la estrategia lo usa. Nunca se renueva para reenviar. */
  revision: string | null;
  createdAt: string; updatedAt: string; evidence: ReadEvidence | null;
  /** Contador de escrituras del registro (detección de carreras). */
  seq: number;
}
export type StorageWrite = 'ok' | 'conflict' | 'failed' | 'full';
export interface StoredEntry { key: string; raw: string | null; unreadable?: boolean; }
export interface IntentStorage {
  /** Todas las entradas bajo el prefijo del cuaderno. `raw: null` + `unreadable` = el valor existe pero no se pudo leer/descifrar. */
  readAll(): Promise<StoredEntry[]>;
  /** Escribe `raw` solo si el valor actual es `expected` (null = no existe). DEBE ser duradero al resolverse con 'ok'. */
  write(key: string, raw: string, expected: string | null, options?: { maxEntries?: number }): Promise<StorageWrite>;
  /** Con `maxEntries`, un ALTA (expected = null) se rechaza con 'full' si ya hay ese número de entradas bajo el prefijo: la comprobación y la escritura son atómicas en el almacenamiento. Editar uno existente nunca se rechaza por el tope. */
  remove(key: string, expected: string): Promise<StorageWrite>;
}

// ── Codificación con checksum (detecta corrupción accidental, no manipulación) ───────────────────────────────────────────────────
const fnv = (text: string) => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const stable = (value: unknown): string => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : value && typeof value === 'object'
  ? '{' + Object.keys(value as object).sort().map(k => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(value ?? null);
export const encodeRecord = (record: IntentRecord): string => JSON.stringify({ ...record, sum: fnv(stable(record)) });
export type DecodeFailure = 'not-json' | 'bad-shape' | 'bad-checksum' | 'unsupported-version' | 'too-large' | 'incoherent';
const PHASES = ['draft', 'attempt', 'settled'], OUTCOMES = ['acknowledged', 'rejected', 'not-sent', 'accepted-read', 'abandoned'], EVIDENCE = ['applied', 'unchanged', 'diverged'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Formas ISO admitidas: `YYYY-MM-DD` y `YYYY-MM-DDTHH:MM:SS[.mmm](Z|±HH:MM)` (con o sin milisegundos), validadas contra el CALENDARIO (bisiestos incluidos): un 30 de febrero no es una fecha. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2})))?$/;
const daysIn = (year: number, month: number) => month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
export function validDate(v: unknown): boolean {
  if (typeof v !== 'string' || v.length > 40) return false;
  const m = ISO.exec(v); if (!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return false;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59)) return false;
  if (m[8] !== undefined && (Number(m[8]) > 23 || Number(m[9]) > 59)) return false;
  return Number.isFinite(Date.parse(v));
}
const validValues = (v: unknown) => isObj(v) && Object.keys(v).length <= 200 && Object.values(v).every(x => x === null || ['string', 'number', 'boolean'].includes(typeof x) && (typeof x !== 'number' || Number.isFinite(x)));
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w.:-]{1,120}$/.test(id);
/** Procedencia que corresponde a cada resultado: solo el acuse del servidor y la aceptación de la persona tienen procedencia. */
const PROVENANCE_OF: Record<string, Provenance> = { acknowledged: 'server-ack', 'accepted-read': 'person-accepted-read', rejected: null, 'not-sent': null, abandoned: null };
/** Valida la forma COMPLETA, la coherencia fase/resultado/procedencia y, si se da la clave, que el ID interno coincida con ella. Un registro incoherente es `quarantined`. */
export function decodeRecord(raw: string, key?: string): { ok: true; record: IntentRecord } | { ok: false; reason: DecodeFailure } {
  if (raw.length > MAX_RECORD_BYTES) return { ok: false, reason: 'too-large' };
  let value: unknown; try { value = JSON.parse(raw); } catch { return { ok: false, reason: 'not-json' }; }
  if (!isObj(value)) return { ok: false, reason: 'bad-shape' };
  if (typeof value.v === 'number' && value.v !== INTENT_VERSION) return { ok: false, reason: 'unsupported-version' };
  const { sum, ...rest } = value;
  if (!shapeOk(value)) return { ok: false, reason: 'bad-shape' };
  if (sum !== fnv(stable(rest))) return { ok: false, reason: 'bad-checksum' };
  const r = rest as unknown as IntentRecord;
  if (!coherentOk(r) || (key !== undefined && key !== KEY_PREFIX + r.id)) return { ok: false, reason: 'incoherent' };
  return { ok: true, record: r };
}
/** Forma COMPLETA de un registro (persistido o EN MEMORIA): se aplica al leer y, antes de serializar, a todo lo que el diario va a escribir. `NaN`, infinitos y `undefined` NO son valores válidos (JSON los volvería `null`); `null` explícito sí. */
function shapeOk(value: Record<string, unknown>): boolean {
  return value.v === INTENT_VERSION && validId(value.id) && typeof value.contextKey === 'string' && typeof value.taskId === 'string' && PHASES.includes(String(value.phase))
    && (value.outcome === null || OUTCOMES.includes(String(value.outcome))) && validValues(value.patch) && validValues(value.baseline) && validDate(value.createdAt) && validDate(value.updatedAt)
    && Number.isInteger(value.seq) && (value.seq as number) >= 1 && (value.installId === null || typeof value.installId === 'string') && (value.revision === null || typeof value.revision === 'string')
    && (value.evidence === null || (isObj(value.evidence) && EVIDENCE.includes(String(value.evidence.kind)) && validDate(value.evidence.at)))
    && (value.provenance === null || value.provenance === 'server-ack' || value.provenance === 'person-accepted-read');
}
const coherentOk = (r: IntentRecord) => r.phase === 'settled' ? r.outcome !== null && r.provenance === PROVENANCE_OF[r.outcome] : r.outcome === null && r.provenance === null && (r.phase === 'attempt' || r.evidence === null);
/** ¿Se puede persistir tal cual y clasificar luego? Mismas reglas que el arranque, comprobadas ANTES de serializar. */
export const validateRecord = (record: IntentRecord) => isObj(record) && shapeOk(record as unknown as Record<string, unknown>) && coherentOk(record);
export const validEvidence = (value: unknown): value is ReadEvidence => isObj(value) && EVIDENCE.includes(String(value.kind)) && validDate(value.at) && Object.keys(value).length === 2;

// ── Clasificación al arrancar (SOLO lectura: no escribe, no envía) ─────────────────────────────────────────────────────────────────
export type BootClass =
  | 'restorable-draft'   // borrador de esta copia que se puede restaurar en la ficha
  | 'unknown-outcome'    // el intento salió o pudo salir y no hay acuse: incierto; solo se puede COMPROBAR leyendo
  | 'settled'            // terminado, con su procedencia
  | 'other-context'      // de otra instalación/captura/generación: se conserva, no se ofrece aquí
  | 'quarantined';       // ilegible, corrupto o de otra versión: se conserva sin tocar
/** `unavailable` = NO se pudo leer el cuaderno completo: no afirma nada (ni «vacío» ni «sin pendientes»). */
export type BootReport = { status: 'read'; entries: BootEntry[] } | { status: 'unavailable'; entries: [] };
export interface BootEntry { key: string; cls: BootClass; record: IntentRecord | null; reason: string; action: 'restore-draft' | 'check-by-reading' | 'review' | 'none'; }
export interface Current { installId: string | null; contextKey: string; }
export const currentOf = (context: TaskContext): Current => ({ installId: context.instanceId, contextKey: contextKey(context) });
export function classify(entries: readonly StoredEntry[], current: Current): BootEntry[] {
  return entries.map(entry => {
    if (entry.raw === null) return { key: entry.key, cls: 'quarantined' as const, record: null, reason: entry.unreadable ? 'No se pudo leer el valor (bytes ilegibles o clave distinta). Se conserva sin modificar.' : 'Entrada vacía.', action: 'none' as const };
    const decoded = decodeRecord(entry.raw, entry.key);
    if (!decoded.ok) return { key: entry.key, cls: 'quarantined' as const, record: null, reason: ({ 'not-json': 'No es un registro legible.', 'bad-shape': 'Su forma no es la esperada.', 'bad-checksum': 'Su contenido no coincide con su comprobación (corrupto o incompleto).', 'unsupported-version': 'Es de otra versión del cuaderno.', 'too-large': 'Supera el tamaño admitido.', incoherent: 'Sus campos son incoherentes (fechas, fase, procedencia o identificador).' } as const)[decoded.reason] + ' Se conserva sin modificar.', action: 'none' as const };
    const record = decoded.record;
    if (record.installId !== current.installId || record.contextKey !== current.contextKey) return { key: entry.key, cls: 'other-context' as const, record, reason: 'Pertenece a otra instalación o captura: no se aplica ni se ofrece en esta copia.', action: 'none' as const };
    if (record.phase === 'draft') return { key: entry.key, cls: 'restorable-draft' as const, record, reason: 'Borrador de esta copia; nunca se envió.', action: 'restore-draft' as const };
    if (record.phase === 'attempt') return { key: entry.key, cls: 'unknown-outcome' as const, record, reason: 'El intento se inició y no hay acuse: pudo aplicarse o no. No se reenvía; se comprueba leyendo.', action: 'check-by-reading' as const };
    return { key: entry.key, cls: 'settled' as const, record, reason: record.provenance === 'server-ack' ? 'Confirmado por el servidor.' : record.provenance === 'person-accepted-read' ? 'Aceptado por la persona tras una lectura; el servidor no confirmó el envío.' : 'Terminado sin envío confirmado (' + (record.outcome ?? '—') + ').', action: 'review' as const };
  });
}

// ── Cuaderno ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Refusal = 'storage-failed' | 'conflict' | 'journal-full' | 'too-large' | 'not-found' | 'wrong-phase' | 'wrong-context' | 'wrong-task' | 'invalid-input' | 'no-evidence';
export type Result<T = IntentRecord> = { ok: true; record: T } | { ok: false; reason: Refusal; message: string };
const MESSAGES: Record<Refusal, string> = {
  'storage-failed': 'No se pudo guardar en el almacenamiento local.', conflict: 'Otro proceso cambió este registro a la vez; vuelve a leerlo.', 'journal-full': 'El cuaderno está lleno de intentos sin resolver; resuélvelos antes de iniciar otro.',
  'too-large': 'El contenido es demasiado grande para conservarlo.', 'not-found': 'El registro ya no existe.', 'wrong-phase': 'El registro no está en la fase que exige esta operación.', 'wrong-context': 'El registro es de otra instalación o captura.', 'wrong-task': 'El registro es de otra tarea.', 'invalid-input': 'El identificador o los datos de entrada no son válidos.', 'no-evidence': 'Falta una lectura que muestre el cambio aplicado: sin ella no se puede aceptar.',
};
const declined = (reason: Refusal) => ({ journaled: false as const, reason, message: MESSAGES[reason] });
const refuse = (reason: Refusal): { ok: false; reason: Refusal; message: string } => ({ ok: false, reason, message: MESSAGES[reason] });
export interface JournalOptions { storage: IntentStorage; now?: () => string; newId?: () => string; ttlMs?: number; maxRecords?: number; }
export interface DraftInput { current: Current; taskId: string; patch: Record<string, FieldValue>; baseline: CrmRecord | Record<string, FieldValue>; revision?: string | null; id?: string; }
export type SendResult = { kind: 'ack'; record?: CrmRecord } | { kind: 'rejected' } | { kind: 'not-sent' } | { kind: 'unknown' };
export interface IntentJournal {
  /** Conserva el borrador. El resultado DICE si pudo conservarse: quien lo muestre no debe prometer más. */
  saveDraft(input: DraftInput): Promise<Result>;
  /** Solo lectura: clasifica lo guardado respecto a la copia actual. No escribe ni envía. */
  boot(current: Current): Promise<BootReport>;
  /**
   * Protocolo de envío: 1) `attempt` DURABLE; 2) solo si 1 tuvo éxito, `send`; 3) `settle` con el resultado (mejor esfuerzo: si falla, el registro queda `attempt` = incierto).
   * Si 1 falla NO se llama a `send` y se devuelve el motivo.
   */
  attempt<T extends SendResult>(input: DraftInput, send: (record: IntentRecord) => Promise<T>): Promise<{ journaled: true; record: IntentRecord; result: T; settled: boolean } | { journaled: false; reason: Refusal; message: string }>;
  /** Evidencia de una lectura posterior (solo GET). No cambia la fase. */
  recordEvidence(current: Current, id: string, evidence: ReadEvidence): Promise<Result>;
  /** Decisión humana: acepta el estado leído (procedencia `person-accepted-read`; no prueba autoría del envío). */
  acceptRead(current: Current, id: string): Promise<Result>;
  /** Cierra sin envío un borrador o un intento que la lectura muestra sin aplicar y la persona descarta. */
  abandon(current: Current, id: string): Promise<Result>;
  /** Retención: quita solo registros TERMINADOS más viejos que el TTL. Nunca toca draft ni attempt. */
  prune(): Promise<{ removed: number }>;
}
export function createIntentJournal(options: JournalOptions): IntentJournal {
  const { storage } = options, rawNow = options.now ?? (() => new Date().toISOString()), newId = options.newId ?? (() => crypto.randomUUID()), ttl = options.ttlMs ?? SETTLED_TTL_MS, max = options.maxRecords ?? MAX_RECORDS;
  const keyOf = (id: string) => KEY_PREFIX + id;
  /** El reloj es una ENTRADA más: un instante imposible (o que lanza) no se escribe jamás; `null` = no hay hora fiable. */
  const tick = (): string | null => { try { const at = rawNow(); return validDate(at) ? at : null; } catch { return null; } };
  const readAll = async () => { try { return await storage.readAll(); } catch { return null; } };
  const find = async (id: string) => { const all = await readAll(); const entry = all?.find(item => item.key === keyOf(id)); return { all, entry }; };
  async function put(record: IntentRecord, expected: string | null): Promise<Result> {
    // 1) la forma y la coherencia se validan ANTES de serializar (JSON volvería `null` un NaN o un infinito); 2) lo escrito se relee y debe ser IDÉNTICO a lo validado; el resultado
    // devuelve esa lectura: lo que recibe `send` es, byte a byte, lo que queda en el almacenamiento. Una entrada inválida ni ocupa plaza, ni dispara la poda, ni toca la versión anterior.
    if (!validateRecord(record)) return refuse('invalid-input');
    const raw = encodeRecord(record); if (raw.length > MAX_RECORD_BYTES) return refuse('too-large');
    const back = decodeRecord(raw, keyOf(record.id)); if (!back.ok || stable(back.record) !== stable(record)) return refuse('invalid-input');
    // El tope se hace cumplir EN el punto de escritura (atómico en el almacenamiento): una alta concurrente que llegue al último hueco tarde recibe 'full'.
    let written: StorageWrite; try { written = await storage.write(keyOf(record.id), raw, expected, expected === null ? { maxEntries: max } : undefined); } catch { written = 'failed'; }
    return written === 'ok' ? { ok: true, record: back.record } : refuse(written === 'conflict' ? 'conflict' : written === 'full' ? 'journal-full' : 'storage-failed');
  }
  /** Construye y VALIDA la intención en memoria: `null` si la entrada (parche, base, reloj) no se puede conservar tal cual. Nada de esto toca el almacenamiento. */
  const prepare = (input: DraftInput, phase: IntentPhase): IntentRecord | null => { try { const record = build(input, phase); return record && validateRecord(record) ? record : null; } catch { return null; } };
  const build = (input: DraftInput, phase: IntentPhase): IntentRecord | null => {
    const at = tick(); if (at === null) return null;
    const base = input.baseline as Record<string, unknown>, values = (isObj(base.values) ? base.values : base) as Record<string, FieldValue>;
    return { v: INTENT_VERSION, id: input.id ?? newId(), installId: input.current.installId, contextKey: input.current.contextKey, taskId: input.taskId, phase, outcome: null, provenance: null,
      patch: structuredClone(input.patch), baseline: Object.fromEntries(Object.keys(input.patch).map(key => [key, structuredClone(values[key] ?? null)])), revision: input.revision ?? null, createdAt: at, updatedAt: at, evidence: null, seq: 1 };
  };
  async function prune(): Promise<{ removed: number }> {
    const all = await readAll(); const at = tick(); if (!all || at === null) return { removed: 0 }; let removed = 0; const limit = Date.parse(at) - ttl;   // sin hora fiable no se acredita que nada haya vencido
    for (const entry of all) {
      if (entry.raw === null) continue; const d = decodeRecord(entry.raw, entry.key);
      // Sin una fecha de liquidación VÁLIDA no se acredita que haya vencido (el decodificador ya rechaza fechas inválidas: queda en cuarentena, intacto).
      if (!d.ok || d.record.phase !== 'settled' || !(Date.parse(d.record.updatedAt) <= limit)) continue;
      try { if (await storage.remove(entry.key, entry.raw) === 'ok') removed++; } catch { /* se reintenta en otra pasada */ }
    }
    return { removed };
  }
  // Al llegar al tope se intenta primero la retención (solo terminados con TTL cumplido); si sigue lleno se rechaza el alta: nunca se desplaza lo no resuelto.
  const capacity = async (): Promise<Refusal | null> => {
    let all = await readAll(); if (all === null) return 'storage-failed';
    if (all.length >= max) { await prune(); all = await readAll(); if (all === null) return 'storage-failed'; }
    return all.length >= max ? 'journal-full' : null;
  };
  /** Lee UNA vez, valida sobre ESA lectura (fase y `guard`) y escribe con esa misma lectura como precondición: lo comprobado y lo liquidado son la misma versión del registro. */
  async function change(current: Current, id: string, from: IntentPhase[], mutate: (record: IntentRecord) => IntentRecord, guard?: (record: IntentRecord) => Refusal | null): Promise<Result> {
    // El ÁMBITO se fija al entrar, ANTES del primer await: un llamador que mute su objeto mientras el almacenamiento lee no cambia a qué copia pertenece esta solicitud.
    const scope = { installId: current.installId, contextKey: current.contextKey };
    const { all, entry } = await find(id); if (all === null) return refuse('storage-failed'); if (!entry || entry.raw === null) return refuse('not-found');
    const decoded = decodeRecord(entry.raw, entry.key); if (!decoded.ok) return refuse('storage-failed');
    const record = decoded.record; if (record.installId !== scope.installId || record.contextKey !== scope.contextKey) return refuse('wrong-context');
    if (!from.includes(record.phase)) return refuse('wrong-phase');
    const denied = guard?.(record) ?? null; if (denied) return refuse(denied);
    const at = tick(); if (at === null) return refuse('invalid-input');
    return put({ ...mutate(record), updatedAt: at, seq: record.seq + 1 }, entry.raw);
  }
  return {
    async saveDraft(input) {
      // 1.º la ENTRADA (id, parche, base, reloj) en memoria: una entrada inválida no lee capacidad, no poda y no toca el almacenamiento.
      if (!validId(input.id ?? 'x')) return refuse('invalid-input');
      const prepared = prepare(input, 'draft'); if (!prepared) return refuse('invalid-input');
      const existing = input.id ? await find(prepared.id) : null;
      if (existing?.all === null) return refuse('storage-failed');
      if (existing?.entry) {
        if (existing.entry.raw === null) return refuse('storage-failed');
        const decoded = decodeRecord(existing.entry.raw, existing.entry.key); if (!decoded.ok) return refuse('storage-failed');
        const record = decoded.record;   // identidad COMPLETA antes de escribir nada: instalación, captura y tarea
        if (record.installId !== prepared.installId || record.contextKey !== prepared.contextKey) return refuse('wrong-context');   // `prepared` se construyó ANTES del primer await
        if (record.taskId !== prepared.taskId) return refuse('wrong-task');
        if (record.phase !== 'draft') return refuse('wrong-phase');
        return put({ ...prepared, createdAt: record.createdAt, seq: record.seq + 1 }, existing.entry.raw);
      }
      const full = await capacity(); if (full) return refuse(full);
      return put(prepared, null);
    },
    async boot(current) { const scope = { installId: current.installId, contextKey: current.contextKey }; const all = await readAll(); return all === null ? { status: 'unavailable' as const, entries: [] as [] } : { status: 'read' as const, entries: classify(all, scope) }; },
    async attempt(input, send) {
      if (!validId(input.id ?? 'x')) return declined('invalid-input');
      const prepared = prepare(input, 'attempt'); if (!prepared) return { journaled: false, reason: 'invalid-input', message: MESSAGES['invalid-input'] + ' No se envió nada: tu borrador sigue en pantalla.' };
      let record: IntentRecord, expected: string | null = null;
      const existing = input.id ? await find(prepared.id) : null;
      if (existing?.all === null) return declined('storage-failed');
      if (existing?.entry) {   // un borrador que pasa a intento: PRIMERO la identidad completa; si no coincide, ni se escribe ni se llama a `send`
        if (existing.entry.raw === null) return declined('storage-failed');
        const decoded = decodeRecord(existing.entry.raw, existing.entry.key); if (!decoded.ok) return declined('storage-failed');
        const old = decoded.record;
        if (old.installId !== prepared.installId || old.contextKey !== prepared.contextKey) return declined('wrong-context');
        if (old.taskId !== prepared.taskId) return declined('wrong-task');
        if (old.phase !== 'draft') return declined('wrong-phase');
        // Parche, valor base de ESOS campos y revisión viajan juntos (los del intento, no los del borrador): lo que se recupera es lo que se envió.
        record = { ...prepared, id: old.id, createdAt: old.createdAt, seq: old.seq + 1 }; expected = existing.entry.raw;
      } else {
        const full = await capacity(); if (full) return declined(full);
        record = prepared;
      }
      const written = await put(record, expected);
      if (!written.ok) return { journaled: false, reason: written.reason, message: written.message + ' No se envió nada: tu borrador sigue en pantalla.' };   // `send` NO se llama
      const sent = written.record;   // lo que recibe `send` es la relectura de lo escrito: idéntico al almacenamiento
      // El transporte recibe una COPIA: nada de lo que haga con ella puede cambiar qué intento se liquida; `sent` (propia) es la referencia interna.
      const result = await send(structuredClone(sent));
      const outcome: SettledOutcome | null = result.kind === 'ack' ? 'acknowledged' : result.kind === 'rejected' ? 'rejected' : result.kind === 'not-sent' ? 'not-sent' : null;
      if (!outcome) return { journaled: true, record: sent, result, settled: false };   // incierto: el registro se queda en `attempt`
      const settled = await change({ installId: sent.installId, contextKey: sent.contextKey }, sent.id, ['attempt'], r => ({ ...r, phase: 'settled', outcome, provenance: PROVENANCE_OF[outcome] }));
      return { journaled: true, record: settled.ok ? settled.record : sent, result, settled: settled.ok };
    },
    // La evidencia es una ENTRADA: si su forma o su fecha (calendario incluido) no son válidas se rechaza sin tocar el registro, que seguirá siendo un intento comprobable.
    async recordEvidence(current, id, evidence) {
      if (!validEvidence(evidence)) return refuse('invalid-input');
      const clean: ReadEvidence = { kind: evidence.kind, at: evidence.at };
      return change(current, id, ['attempt'], record => ({ ...record, evidence: clean }));
    },
    // Aceptar exige una lectura que muestre el cambio APLICADO (evidencia `applied`) SOBRE LA MISMA VERSIÓN del registro que se liquida (una única lectura + precondición de escritura:
    // si otro escritor cambia la evidencia entre medias, la liquidación se rechaza con `conflict`). Sigue sin probar autoría: la procedencia es `person-accepted-read`.
    acceptRead: (current, id) => change(current, id, ['attempt'], record => ({ ...record, phase: 'settled', outcome: 'accepted-read', provenance: 'person-accepted-read' }), record => record.evidence?.kind === 'applied' ? null : 'no-evidence'),
    abandon: (current, id) => change(current, id, ['draft', 'attempt'], record => ({ ...record, phase: 'settled', outcome: 'abandoned', provenance: null })),
    prune,
  };
}

/**
 * PROVISIONAL (a coordinar con el pasaporte): resumen por contexto, SOLO alcance, instante y recuentos. Sin IDs de tarea, valores ni borradores.
 * «No sé» ≠ «cero»: si el cuaderno no se pudo leer, `status: 'unavailable'` y `counts: null`. `unreadable` cuenta lo presente pero ilegible o en cuarentena.
 * `observed: true` = lo vio una lectura en `at`; un recuento de borradores no demuestra que la copia esté actualizada ni que un envío se aplicara.
 */
export interface IntentPassportSummary {
  source: 'intent-journal'; observed: boolean; scope: { installId: string | null; contextKey: string }; status: 'read' | 'unavailable'; at: string;
  counts: { drafts: number; unknownOutcome: number; settled: number; otherContext: number; unreadable: number } | null;
}
export function summarizeForPassport(report: BootReport, current: Current, at: string): IntentPassportSummary {
  const scope = { installId: current.installId, contextKey: current.contextKey };
  if (report.status === 'unavailable') return { source: 'intent-journal', observed: false, scope, status: 'unavailable', at, counts: null };
  const count = (cls: BootClass) => report.entries.filter(entry => entry.cls === cls).length;
  return { source: 'intent-journal', observed: true, scope, status: 'read', at, counts: { drafts: count('restorable-draft'), unknownOutcome: count('unknown-outcome'), settled: count('settled'), otherContext: count('other-context'), unreadable: count('quarantined') } };
}
