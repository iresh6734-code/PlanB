import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from './store.js';
import { decodePortable, encodePortable } from './crypto.js';
import { RescueRoom } from './rescue-room.js';
import { stableStringify } from './rescue-room-journal.js';
import { BANNER, CAPSULE_FORMAT, CapsuleError, CapsuleSchema, MAX_CAPSULE_BYTES, NOT_PROVEN, STAGE_POLICY, buildComparison, coherenceProblems, renderComparisonHtml, summarize, type Capsule, type CapsuleSummary, type CompareReport, type CompareSide } from '../shared/rescue-capsule.js';
import { RescueError } from '../shared/rescue-room.js';
// Servicio del Kit de Relevo. Reutiliza encodePortable/decodePortable y Store.restoreBundle; no inventa cifrado. La contraseña solo viaja por el cuerpo de una llamada local o por stdin
// y NUNCA se escribe en logs, manifiesto, URL ni mensajes de error. Un hash acredita igualdad de contenido, no autoría.
const NAME_RE = /^[A-Za-z0-9._-]{8,100}\.capsule$/;
export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const digestOf = (value: unknown) => sha256(stableStringify(value));
export interface Kit { dir: string; capsules: string; clock?: () => number; onStep?: (step: string) => void | Promise<void>; destParent?: string }
/** Carpeta propia del kit (tests/.tmp/rescue116-*) con su subcarpeta de cápsulas. */
export function openKit(root: string): Kit {
  const full = resolve(root), base = resolve('tests', '.tmp');
  if (resolve(full, '..').toLowerCase() !== base.toLowerCase() || !/^rescue116-/.test(full.slice(base.length + 1))) throw new CapsuleError(400, 'KIT_ROOT', 'La carpeta del kit debe colgar directamente de tests/.tmp y llamarse rescue116-*.');
  mkdirSync(full, { recursive: true }); const capsules = join(full, 'capsules'); mkdirSync(capsules, { recursive: true });
  return { dir: full, capsules, destParent: base };
}
const stepOf = async (kit: Kit, name: string) => { await kit.onStep?.(name); };
function pathFor(kit: Kit, name: string) {
  if (!NAME_RE.test(name)) throw new CapsuleError(400, 'BAD_NAME', 'Nombre de cápsula no válido.');
  const path = join(kit.capsules, name);
  if (resolve(path, '..').toLowerCase() !== resolve(kit.capsules).toLowerCase()) throw new CapsuleError(400, 'BAD_NAME', 'Nombre de cápsula no válido.');
  return path;
}
export interface ExportResult { name: string; bytes: number; sha256: string; revision: string; attempts: number; ms: number; summary: CapsuleSummary }
/** Exporta la sala (origen) a una cápsula cifrada. El origen no se modifica: se captura bajo exclusión y se comprueba que su contenido no cambió. */
export async function exportCapsule(room: RescueRoom, password: string, kit: Kit, options: { maxAttempts?: number; captureHook?: (step: string) => void | Promise<void> } = {}): Promise<ExportResult> {
  const started = Date.now();
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new CapsuleError(422, 'BAD_PASSWORD', 'Usa una contraseña de entre 12 y 200 caracteres.');
  await stepOf(kit, 'export:start');
  // La verificación «el contenido no cambió durante la lectura» ocurre DENTRO de la sección exclusiva (captureComponents): una mutación legítima encolada justo después no invalida la captura.
  const { components, attempts } = await room.captureComponents({ maxAttempts: options.maxAttempts, hook: options.captureHook });
  await stepOf(kit, 'export:captured');
  const rescueState = components.rescue.state, plan = components.recovery.plan, view = room.view();
  if (view.blocked) throw new RescueError(409, 'RESCUE_CORRUPT', 'La sala está bloqueada por integridad: no se exporta.');
  const digests = { bundle: digestOf(components.bundle), rescue: digestOf(components.rescue), recovery: digestOf(components.recovery), sim: digestOf(components.sim) };
  const set = sha256(digests.bundle + digests.rescue + digests.recovery + digests.sim);
  const capsule: Capsule = CapsuleSchema.parse({
    format: CAPSULE_FORMAT, createdAt: new Date((kit.clock ?? Date.now)()).toISOString(),
    origin: { roomId: rescueState.context.workspaceId, incidentId: rescueState.incidentId, context: rescueState.context, stage: rescueState.stage, version: rescueState.version, label: 'Ensayo ficticio · ' + rescueState.stage },
    capture: { stateVersion: rescueState.version, journalEvents: components.rescue.journal.length, idemRecords: Object.keys(components.rescue.idem).length, changeMaxId: (components.bundle as { changes: { id: number }[] }).changes.reduce((m, c) => Math.max(m, c.id), 0), changeCount: (components.bundle as { changes: unknown[] }).changes.length,
      recordCount: (components.bundle as { records: unknown[] }).records.length, simCalls: components.sim.calls.read + components.sim.calls.create + components.sim.calls.update + components.sim.calls.relate, simRecords: components.sim.records.length,
      uncertainOps: plan?.operations.filter(o => o.status === 'uncertain' || o.status === 'sending').length ?? 0, approvedPlan: plan?.status === 'approved', attempts },
    components, digests: { ...digests, set }, limits: ['Cápsula de ENSAYO con datos ficticios.', 'Cabida del diario: 5000 hechos; el plan considera como máximo las 200 tareas visibles de la cola.'], notProven: NOT_PROVEN,
  });
  const problems = coherenceProblems(capsule); if (problems.length) throw new CapsuleError(422, 'INCOHERENT_CAPTURE', 'La captura no es coherente: ' + problems[0], problems);
  const encoded = encodePortable(capsule, password); await stepOf(kit, 'export:encrypted');
  const bytes = Buffer.byteLength(encoded, 'utf8'); if (bytes > MAX_CAPSULE_BYTES) throw new CapsuleError(413, 'TOO_LARGE', 'La cápsula supera el tamaño admitido (' + MAX_CAPSULE_BYTES + ' bytes).');
  const name = 'relevo-' + randomUUID().slice(0, 12) + '.capsule', path = pathFor(kit, name), tmp = path + '.tmp';
  const fd = openSync(tmp, 'wx'); try { writeFileSync(fd, encoded); fsyncSync(fd); } finally { closeSync(fd); }
  await stepOf(kit, 'export:before-publish'); renameSync(tmp, path); await stepOf(kit, 'export:published');
  return { name, bytes, sha256: sha256(encoded), revision: set, attempts, ms: Date.now() - started, summary: summarize(capsule, set) };
}
export interface Loaded { capsule: Capsule; bytes: number; sha256: string; revision: string }
/** Lectura segura: tamaño ANTES de leer/parsear/descifrar, descifrado, forma estricta, digests y coherencia. Sin escrituras. */
export function loadCapsule(kit: Kit, name: string, password: string): Loaded {
  const path = pathFor(kit, name);
  if (!existsSync(path)) throw new CapsuleError(404, 'NOT_FOUND', 'No existe esa cápsula.');
  const st = lstatSync(path); if (st.isSymbolicLink() || !st.isFile()) throw new CapsuleError(400, 'NOT_A_FILE', 'La cápsula debe ser un archivo regular.');
  if (st.size > MAX_CAPSULE_BYTES) throw new CapsuleError(413, 'TOO_LARGE', 'La cápsula supera el tamaño admitido; no se lee.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new CapsuleError(422, 'BAD_PASSWORD', 'Usa una contraseña de entre 12 y 200 caracteres.');
  const raw = readFileSync(path, 'utf8'); let decoded: unknown;
  try { decoded = decodePortable(raw, password); } catch { throw new CapsuleError(422, 'DECRYPT_FAILED', 'Contraseña incorrecta o archivo dañado.'); } // mensaje único: no revela qué falló
  if (!decoded || typeof decoded !== 'object' || (decoded as { format?: unknown }).format !== CAPSULE_FORMAT) throw new CapsuleError(422, 'FORMAT_UNSUPPORTED', 'El archivo no es una cápsula de relevo compatible (formato desconocido).');
  const parsed = CapsuleSchema.safeParse(decoded); if (!parsed.success) throw new CapsuleError(422, 'SCHEMA', 'La cápsula no cumple el contrato esperado.', parsed.error.issues.slice(0, 5).map(i => i.path.join('.') + ': ' + i.message));
  const capsule = parsed.data, d = capsule.digests;
  const recomputed = { bundle: digestOf(capsule.components.bundle), rescue: digestOf(capsule.components.rescue), recovery: digestOf(capsule.components.recovery), sim: digestOf(capsule.components.sim) };
  for (const k of ['bundle', 'rescue', 'recovery', 'sim'] as const) if (d[k] !== recomputed[k]) throw new CapsuleError(422, 'DIGEST_MISMATCH', 'El componente «' + k + '» no coincide con su digest declarado.');
  const set = sha256(recomputed.bundle + recomputed.rescue + recomputed.recovery + recomputed.sim); if (d.set !== set) throw new CapsuleError(422, 'DIGEST_MISMATCH', 'La revisión del conjunto no coincide.');
  const problems = coherenceProblems(capsule); if (problems.length) throw new CapsuleError(422, 'INCOHERENT', 'Los componentes no son coherentes entre sí: ' + problems[0], problems);
  return { capsule, bytes: st.size, sha256: sha256(raw), revision: set };
}
export interface Inspection { name: string; bytes: number; sha256: string; revision: string; summary: CapsuleSummary; bundleCheck: 'ok'; inspectedAt: string }
/** Inspección SIN escritura: valida la capa estándar con un Store en memoria (no toca disco) y devuelve procedencia, recuentos, incertidumbres y advertencias. */
export async function inspectCapsule(kit: Kit, name: string, password: string): Promise<Inspection> {
  await stepOf(kit, 'inspect:start');
  const loaded = loadCapsule(kit, name, password), memory = new Store(':memory:');
  try { memory.restoreBundle(loaded.capsule.components.bundle); } catch (error) { throw new CapsuleError(422, 'BUNDLE_REJECTED', 'La copia de la cápsula no supera la comprobación estándar de integridad.', error instanceof Error ? error.message : undefined); } finally { memory.close(); }
  return { name, bytes: loaded.bytes, sha256: loaded.sha256, revision: loaded.revision, summary: summarize(loaded.capsule, loaded.revision), bundleCheck: 'ok', inspectedAt: new Date((kit.clock ?? Date.now)()).toISOString() };
}
export interface ImportResult { destination: { roomId: string; folder: string }; retired: string[]; ms: number; summary: CapsuleSummary }
const alive = (pid: unknown) => { if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
const KNOWN_ROOM_FILES = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'planb.sqlite-journal', 'rescue-room.marker.json'];
/** Barrido de staging PROPIO y HUÉRFANO: solo carpetas rescue116-staging-<uuid> con marcador válido (roomId = nombre) cuyo importador DEJÓ de existir (el marcador lleva su pid y ya no está vivo);
 *  nunca una importación activa ni una carpeta sin pid (de otro origen o de una versión anterior). Solo ficheros conocidos y carpeta vacía (sin recursión). */
export function sweepStaging(parent = resolve('tests', '.tmp')): string[] {
  const swept: string[] = [];
  for (const name of readdirSync(parent)) {
    const m = /^rescue116-staging-([0-9a-f-]{36})$/.exec(name); if (!m) continue; const dir = join(parent, name);
    try { const st = lstatSync(dir); if (st.isSymbolicLink() || !st.isDirectory()) continue; const marker = JSON.parse(readFileSync(join(dir, 'rescue-room.marker.json'), 'utf8')) as { kind?: string; roomId?: string; pid?: unknown }; if (marker.kind !== 'rescue106' || marker.roomId !== m[1]) continue; if (typeof marker.pid !== 'number' || alive(marker.pid)) continue; } catch { continue; }
    for (const f of KNOWN_ROOM_FILES) { try { unlinkSync(join(dir, f)); } catch { /* ausente */ } } try { if (!readdirSync(dir).length) { rmdirSync(dir); swept.push(name); } } catch { /* conservada */ }
  }
  return swept;
}
interface Claim { status?: string; destination?: string; pid?: number; owner?: string; sha256?: string; revision?: string; at?: string; recovered?: boolean }
/** Identidad de ESTA instancia del módulo. Dos instancias (p. ej. dos hilos o dos copias cargadas) pueden compartir PID: el PID solo dice que «hay un proceso vivo», no QUIÉN importa.
 *  Un reclamo se trata como obsoleto solo si (a) su proceso ya no existe, o (b) lo escribió ESTA instancia y esta instancia no tiene una importación activa sobre él. Todo lo demás (PID vivo con otro propietario, propietario desconocido) es ambiguo y bloquea.
 *  Ni un PID ni este token prueban identidad entre equipos ni frente a escritores que no cooperen. */
const INSTANCE = randomUUID();
const activeClaims = new Set<string>();
const readRaw = (path: string): string | null => { try { return readFileSync(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
const parseClaim = (raw: string | null): Claim | null => { if (raw === null) return null; try { const v = JSON.parse(raw) as unknown; return v && typeof v === 'object' && !Array.isArray(v) ? v as Claim : null; } catch { return null; } };
/** ¿Se publicó el destino de este reclamo? «published» solo con el marcador PROPIO (roomId y, si consta, la revisión de la cápsula); «absent» si no hay carpeta publicada (un fallo del primer arranque la renombra aparte);
 *  «unknown» ante cualquier duda (carpeta sin marcador propio, error de lectura): nunca se actúa a ciegas. */
function publication(parent: string, claim: Claim): 'published' | 'absent' | 'unknown' {
  const id = claim.destination; if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return 'unknown';
  const root = join(parent, 'rescue106-' + id);
  try {
    if (!existsSync(root)) return 'absent';
    const marker = JSON.parse(readFileSync(join(root, 'rescue-room.marker.json'), 'utf8')) as { kind?: string; roomId?: string; capsuleRevision?: string };
    if (marker.kind !== 'rescue106' || marker.roomId !== id) return 'unknown';
    if (claim.revision && marker.capsuleRevision && marker.capsuleRevision !== claim.revision) return 'unknown';
    return 'published';
  } catch { return 'unknown'; }
}
/** Importa siempre en una carpeta NUEVA. La aprobación está ligada al contenido exacto inspeccionado (sha256 + revisión) y es de un solo uso por cápsula.
 *  El reclamo registra el destino ANTES de publicarlo y NUNCA se libera si el destino pudo publicarse: tras un fallo se distingue publicado / no publicado / dudoso y solo el «no publicado» verificado libera.
 *  La recuperación de un reclamo obsoleto es exclusiva (fichero .takeover) y revalida su contenido bajo esa exclusión: dos procesos no pueden recuperar el mismo reclamo a la vez. */
export async function importCapsule(kit: Kit, input: { name: string; password: string; expectedSha256: string; expectedRevision: string }): Promise<ImportResult> {
  const started = Date.now(), path = pathFor(kit, input.name), claim = path + '.import-claim', takeover = claim + '.takeover', roomId = randomUUID(), parent = kit.destParent ?? resolve('tests', '.tmp');
  await stepOf(kit, 'import:start');
  if (resolve(parent).toLowerCase() !== resolve('tests', '.tmp').toLowerCase()) throw new CapsuleError(400, 'DEST_NOT_ALLOWED', 'El destino debe ser una carpeta nueva bajo tests/.tmp.');
  const mine = JSON.stringify({ status: 'importing', destination: roomId, pid: process.pid, owner: INSTANCE, sha256: input.expectedSha256, revision: input.expectedRevision, at: new Date().toISOString() });
  const take = () => writeFileSync(claim, mine, { flag: 'wx' });
  const busy = (info: Claim | null) => new CapsuleError(409, 'ALREADY_IMPORTED', 'Esta cápsula ya se importó o hay una importación en curso; no se repite.', info?.destination ? { destination: 'rescue106-' + info.destination } : null);
  /** Confirma el reclamo de forma atómica (fichero temporal + renombrado): un fallo no deja un reclamo a medias. */
  const confirm = (info: Claim, expected: string, extra: Partial<Claim> = {}) => { const tmp = claim + '.tmp'; try { if (readRaw(claim) !== expected) throw new Error('el reclamo ya no es el que se iba a confirmar'); writeFileSync(tmp, JSON.stringify({ status: 'imported', destination: info.destination, sha256: info.sha256, revision: info.revision, at: new Date().toISOString(), ...extra })); renameSync(tmp, claim); } catch (error) { try { unlinkSync(tmp); } catch { /* ausente */ } throw error; } };
  /** La exclusión de recuperación existe: la tiene otro recuperador o quedó abandonada. Nunca se retira sola: se informa de lo verificable (quién, desde cuándo, si ese pid existe) y el paso humano que sí es seguro. */
  const busyRecovery = () => {
    let holder: { pid?: number; at?: string } | null = null; try { holder = parseClaim(readRaw(takeover)); } catch { /* ilegible */ }
    const alive_ = typeof holder?.pid === 'number' ? alive(holder.pid) : null, state = alive_ === null ? 'su contenido no se puede leer' : alive_ ? 'el proceso ' + holder!.pid + ' existe' : 'el proceso ' + holder!.pid + ' ya no existe';
    return new CapsuleError(409, 'CLAIM_RECOVERY_BUSY', 'Hay una recuperación del reclamo de esta cápsula en curso o interrumpida («' + input.name + '.import-claim.takeover»: ' + state + '). No se importa. Si ese proceso ya no existe, comprueba con describeClaim el reclamo y si el destino se publicó antes de decidir nada; mientras exista o haya dudas, espera.', { holderPid: holder?.pid ?? null, holderAlive: alive_, since: holder?.at ?? null });
  };
  const unconfirmed = (id: string) => new CapsuleError(409, 'IMPORT_PUBLISHED_UNCONFIRMED', 'El destino «rescue106-' + id + '» se publicó, pero no se pudo confirmar el reclamo. La cápsula NO se vuelve a importar: el reclamo se conserva y se consolidará al reintentar cuando sea escribible.', { destination: 'rescue106-' + id });
  /** Sustituye el reclamo obsoleto verificado por el PROPIO con un renombrado atómico (fichero temporal propio). Quien crea el reclamo inicial (`wx`) no pasa por la exclusión: si el reclamo se borrara antes de tomar el nuevo, un importador nuevo podría
   *  crearlo y publicar entre ambos pasos. Con el renombrado el reclamo existe siempre y ese importador ve «obsoleto + recuperación en curso». Si falla, se comprueba qué quedó y se informa solo lo comprobado. */
  const replaceStale = (expected: string) => {
    const tmp = claim + '.' + randomUUID().slice(0, 8) + '.recover.tmp';
    try {
      writeFileSync(tmp, mine, { flag: 'wx' });
      for (let n = 0; ; n++) { try { renameSync(tmp, claim); break; } catch (e) { if (n >= 12 || !['EPERM', 'EBUSY', 'EACCES'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); } } // Windows: un lector concurrente del reclamo puede bloquear el renombrado un instante
    } catch (error) {
      try { unlinkSync(tmp); } catch { /* ausente */ }
      let now: string | null | undefined; try { now = readRaw(claim); } catch { now = undefined; }
      throw new CapsuleError(409, 'CLAIM_RECOVERY_FAILED', now === expected
        ? 'No se pudo sustituir el reclamo obsoleto de esta cápsula (' + String((error as NodeJS.ErrnoException).code ?? 'error') + '). El reclamo anterior se conserva sin cambios (comprobado) y no se importó nada; revisa los permisos de «' + input.name + '.import-claim» y reintenta.'
        : 'No se pudo sustituir el reclamo obsoleto de esta cápsula (' + String((error as NodeJS.ErrnoException).code ?? 'error') + ') y no se puede comprobar en qué estado quedó el reclamo. No se importó nada en esta llamada; revisa «' + input.name + '.import-claim» con describeClaim antes de reintentar.', { claimUnchanged: now === expected });
    }
  };
  /** Un error de sistema durante el reclamo no se muestra como «no se pudo completar»: esta llamada aún no importó nada, pero el estado del reclamo solo se afirma si se pudo comprobar. */
  try {
  for (let attempt = 0; ; attempt++) {
    try { take(); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (attempt >= 3) throw busy(null);
      let raw: string | null; try { raw = readRaw(claim); } catch { throw new CapsuleError(409, 'CLAIM_UNREADABLE', 'El reclamo de esta cápsula existe pero no se puede leer (¿es una carpeta o no hay permiso?). No se importa a ciegas: revisa «' + input.name + '.import-claim».'); }
      const info = parseClaim(raw);
      if (raw === null) continue; // se liberó entre medias
      if (!info || info.status !== 'importing') throw busy(info); // ilegible o ya importado: nunca se pisa
      void kit.onStep?.('import:claim-read');
      const ownStale = info.owner === INSTANCE && info.pid === process.pid && !activeClaims.has(claim); // escrito por ESTA instancia, que no tiene importación activa sobre él (p. ej. tras un error)
      if (!ownStale && alive(info.pid)) throw busy(info); // PID vivo con otro propietario (u propietario desconocido): ambiguo, no se recupera
      const lockBody = JSON.stringify({ pid: process.pid, owner: INSTANCE, token: randomUUID(), at: new Date().toISOString() });
      try { writeFileSync(takeover, lockBody, { flag: 'wx' }); }
      catch (lockError) { if ((lockError as NodeJS.ErrnoException).code === 'EEXIST') throw busyRecovery(); throw lockError; }
      try {
        void kit.onStep?.('import:recovery-locked');
        if (readRaw(claim) !== raw) continue; // cambió mientras esperábamos la exclusión: se reevalúa
        const state = publication(parent, info);
        if (state === 'published') { try { confirm(info, raw!, { recovered: true }); } catch { throw unconfirmed(info.destination!); } throw new CapsuleError(409, 'ALREADY_IMPORTED', 'Esta cápsula ya se había importado (el destino se publicó y el reclamo quedó sin confirmar): no se repite.', { destination: 'rescue106-' + info.destination }); }
        if (state === 'unknown') throw new CapsuleError(409, 'IMPORT_AMBIGUOUS', 'No se puede saber si el destino de un intento anterior se publicó. No se importa a ciegas: revisa la carpeta «rescue106-' + String(info.destination) + '» y el reclamo.', info.destination ? { destination: 'rescue106-' + info.destination } : null);
        void kit.onStep?.('import:recovery-verified'); // «absent» verificado bajo la exclusión: último punto antes de sustituir el reclamo
        if (readRaw(claim) !== raw) continue; // cambió tras verificar: se reevalúa, nunca se pisa
        replaceStale(raw!); break; // el reclamo pasa del obsoleto al propio en UNA operación atómica: nunca queda ausente para un importador nuevo
      } finally { try { if (readRaw(takeover) === lockBody) unlinkSync(takeover); } catch { /* se conserva */ } } // solo se retira la exclusión PROPIA
    }
  }
  } catch (error) {
    if (error instanceof CapsuleError) throw error;
    throw new CapsuleError(500, 'CLAIM_CHECK_FAILED', 'No se pudo comprobar o tomar el reclamo de esta cápsula (' + String((error as NodeJS.ErrnoException).code ?? 'error') + '). Esta llamada no importó nada; el estado del reclamo no está comprobado: revísalo con describeClaim antes de reintentar.');
  }
  activeClaims.add(claim);
  try {
    const loaded = loadCapsule(kit, input.name, input.password);
    if (loaded.sha256 !== input.expectedSha256 || loaded.revision !== input.expectedRevision) throw new CapsuleError(409, 'CONTENT_CHANGED', 'El contenido de la cápsula no es el que se inspeccionó y aprobó. Inspecciónala de nuevo.');
    const result = RescueRoom.importComponents(parent, loaded.capsule.components, { capsuleRevision: loaded.revision }, { clock: kit.clock, roomId, onStep: s => { void kit.onStep?.('import:' + s); } });
    try { confirm({ destination: result.roomId, sha256: input.expectedSha256, revision: input.expectedRevision }, mine); } catch { throw unconfirmed(result.roomId); }
    return { destination: { roomId: result.roomId, folder: 'rescue106-' + result.roomId }, retired: result.retired, ms: Date.now() - started, summary: summarize(loaded.capsule, loaded.revision) };
  } catch (error) {
    if (error instanceof CapsuleError && error.code === 'IMPORT_PUBLISHED_UNCONFIRMED') throw error;
    const mineInfo: Claim = { destination: roomId, sha256: input.expectedSha256, revision: input.expectedRevision }, state = publication(parent, mineInfo);
    if (state === 'absent') { try { if (readRaw(claim) === mine) unlinkSync(claim); } catch { /* se conserva */ } throw error; } // verificado: no se publicó nada ⇒ el reclamo se libera (solo si sigue siendo el nuestro)
    if (state === 'published') { try { confirm(mineInfo, mine); } catch { throw unconfirmed(roomId); } throw new CapsuleError(409, 'IMPORT_PUBLISHED_WITH_ERROR', 'El destino «rescue106-' + roomId + '» se publicó pero la importación terminó con un error. No se repite ni se borra el destino; revísalo antes de usarlo.', { destination: 'rescue106-' + roomId }); }
    throw new CapsuleError(409, 'IMPORT_AMBIGUOUS', 'La importación falló y no se puede saber si el destino «rescue106-' + roomId + '» se publicó. El reclamo se conserva y no se importa a ciegas.', { destination: 'rescue106-' + roomId });
  } finally { activeClaims.delete(claim); }
}
export interface ClaimReport { claim: null | { status: string | null; destination: string | null; pid: number | null; pidAlive: boolean | null; ownedByThisInstance: boolean; activeHere: boolean; readable: boolean }; takeover: null | { pid: number | null; pidAlive: boolean | null; since: string | null; readable: boolean }; publication: 'published' | 'absent' | 'unknown' | null; verdict: string }
/** Informe SOLO DE LECTURA del estado del reclamo de una cápsula (no cambia nada): para decidir con datos verificables, no a ciegas. */
export function describeClaim(kit: Kit, name: string): ClaimReport {
  const claim = pathFor(kit, name) + '.import-claim', takeover = claim + '.takeover', parent = kit.destParent ?? resolve('tests', '.tmp');
  const read = (p: string): { ok: boolean; raw: string | null } => { try { return { ok: true, raw: readRaw(p) }; } catch { return { ok: false, raw: null }; } };
  const c = read(claim), tk = read(takeover), info = parseClaim(c.raw), holder = parseClaim(tk.raw);
  const claimR = c.raw === null && c.ok ? null : { status: info?.status ?? null, destination: info?.destination ?? null, pid: typeof info?.pid === 'number' ? info.pid : null, pidAlive: typeof info?.pid === 'number' ? alive(info.pid) : null, ownedByThisInstance: info?.owner === INSTANCE, activeHere: activeClaims.has(claim), readable: c.ok && info !== null };
  const takeoverR = tk.raw === null && tk.ok ? null : { pid: typeof holder?.pid === 'number' ? holder.pid : null, pidAlive: typeof holder?.pid === 'number' ? alive(holder.pid) : null, since: holder?.at ?? null, readable: tk.ok && holder !== null };
  const pub = info?.destination ? publication(parent, info) : null;
  const verdict = !claimR ? 'Sin reclamo: la cápsula no está reclamada.' : !claimR.readable ? 'Reclamo ilegible: ambiguo; no se importa ni se retira nada.' : info!.status === 'imported' ? 'Importada: no se repite.'
    : takeoverR ? 'Hay una exclusión de recuperación (' + (takeoverR.pidAlive ? 'su proceso existe' : takeoverR.pidAlive === false ? 'su proceso ya no existe' : 'ilegible') + '): no se importa mientras exista.'
    : claimR.pidAlive && !(claimR.ownedByThisInstance && !claimR.activeHere) ? 'Importación posiblemente en curso (PID vivo con otro propietario): se espera; no se recupera.'
    : pub === 'published' ? 'Obsoleto con destino publicado: al reintentar se consolida sin importar de nuevo.' : pub === 'absent' ? 'Obsoleto sin destino publicado: al reintentar se recupera y se importa una vez.' : 'Obsoleto con destino dudoso: ambiguo; revisar la carpeta antes de nada.';
  return { claim: claimR, takeover: takeoverR, publication: pub, verdict };
}
export interface Opened { url: string; port: number; pid: number; output: () => string; stop: () => Promise<void> }
/** Abre el destino en un PROCESO nuevo (la demo de Rescate con --resume). Falla si el puerto está ocupado o el bloqueo no se adquiere; no mata procesos ajenos. */
export async function openDestination(folder: string, options: { port: number; dist?: string; now?: string }): Promise<Opened> {
  const root = join(resolve('tests', '.tmp'), folder);
  if (!/^rescue106-[0-9a-f-]{36}$/.test(folder)) throw new CapsuleError(400, 'BAD_DEST', 'Destino no válido.');
  const proc: ChildProcess = spawn(process.execPath, ['--require', join(resolve('.'), 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/demo-rescue-room.ts', '--port', String(options.port), ...(options.dist ? ['--dist', options.dist] : []), ...(options.now ? ['--now', options.now] : []), '--resume', root], { cwd: resolve('.'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout!.on('data', d => { out += d; }); proc.stderr!.on('data', d => { out += d; }); const exited = new Promise<void>(r => proc.once('exit', () => r()));
  const deadline = Date.now() + 40_000;
  for (;;) {
    if (/Carpeta del ensayo:/.test(out)) { try { if ((await fetch('http://127.0.0.1:' + options.port + '/api/rescue/health')).ok) return { url: 'http://127.0.0.1:' + options.port + '/', port: options.port, pid: proc.pid!, output: () => out, stop: async () => { proc.kill(); await exited; } }; } catch { /* aún no escucha */ } }
    if (proc.exitCode !== null) throw new CapsuleError(409, 'OPEN_FAILED', 'El destino no se abrió: ' + out.replace(/\(node:\d+\)[^\n]*\n?/g, '').slice(-300));
    if (Date.now() > deadline) { proc.kill(); throw new CapsuleError(504, 'OPEN_TIMEOUT', 'El destino no arrancó a tiempo.'); }
    await new Promise(r => setTimeout(r, 200));
  }
}
export function sideOf(room: RescueRoom): CompareSide {
  const v = room.view(); if (v.blocked) throw new RescueError(409, 'RESCUE_CORRUPT', 'La sala está bloqueada por integridad.');
  const sim = room.crm.stats(), plan = v.returnPlan;
  return { roomId: v.context.workspaceId, stage: v.stageLabel, version: v.version, revision: v.context.captureRevision, records: v.capture.records, changes: v.localChanges.length, journalEvents: v.journal.total, simRecords: sim.records, simCreates: sim.creates.length, simCreateCalls: sim.calls.create,
    uncertain: plan?.operations.filter(o => o.status === 'uncertain' || o.status === 'sending').length ?? 0, approvedPlan: plan?.status === 'approved' };
}
export function comparisonReport(input: { capsule: { sha256: string; bytes: number; revision: string; createdAt: string }; origin: CompareSide; destination: CompareSide | null; retired: string[]; timings: { label: string; ms: number }[]; scope: string; notes?: string[] }): { json: CompareReport; html: string } {
  const preserved = ['Registros y cambios locales de la copia (restoreBundle).', 'Diario de hechos del origen, atribuidos a su espacio de origen.', 'Estado persistido del CRM simulado: registros, creates y contadores.', 'Plan de devolución con sus operaciones, incluidas las inciertas.'];
  const json = buildComparison({ generatedAt: new Date().toISOString(), capsule: input.capsule, origin: input.origin, destination: input.destination, retired: input.retired, preserved, estimatedPlanScope: input.scope, timings: { technical: input.timings }, notes: input.notes ?? [BANNER] });
  return { json, html: renderComparisonHtml(json) };
}
export { STAGE_POLICY };

