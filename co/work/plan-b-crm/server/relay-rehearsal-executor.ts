import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { RehearsalResultLike } from '../shared/relay-rehearsal.js';

// EJECUTOR REAL del ensayo de relevo (unidad 224). Corre el Kit 116 en un PROCESO propio con un cwd aislado bajo una raíz de la INSTALACIÓN (`<installRoot>/relay-rehearsals/run-<uuid>`), sin tocar el cwd del
// servidor, sin leer ni escribir la base activa, las exportaciones ni las copias, y sin ver el árbol de pruebas del repositorio. Cada ejecución tiene su carpeta nueva y MARCADA, con copias verificadas por hash
// del código del Kit (server/, shared/, cuatro scripts y package.json) y un enlace a node_modules. La contraseña ficticia se genera aquí y viaja por la entrada estándar del hijo: no sale en argumentos,
// entorno, salida ni estado público. El resultado se reduce a una lista blanca. `run()` solo se asienta cuando TODO el árbol de procesos ha cerrado (ver `RunLease`: la capacidad no se libera antes).
export interface ProcessTools {
  /** Mata el proceso y todos sus descendientes y espera a que la orden termine. */
  killTree(pid: number): Promise<void>;
  /**
   * PIDs de procesos cuya línea de órdenes contiene la marca (la carpeta de la ejecución), excluyendo al que pregunta.
   * Devuelve una lista SOLO si el inventario se completó (la herramienta terminó bien y su salida está completa); `[]` significa «confirmado: ninguno».
   * Si la herramienta falla, se deniega o su salida queda incompleta, RECHAZA: el estado es desconocido y nunca equivale a «no queda nada».
   */
  findByMarker(marker: string): Promise<number[]>;
}
export interface RelayExecutorOptions {
  /** Carpeta de datos de la instalación (absoluta). Se crea `relay-rehearsals` dentro; nunca se usa la base activa ni las exportaciones. */
  installRoot: string;
  /** Raíz del código desplegado que contiene `server/`, `shared/`, `scripts/`, `package.json` y `node_modules/` (con `tsx`). No necesita `tests/`. */
  appRoot: string;
  nodePath?: string;
  /** Carpetas con resultado parcial o incierto que se conservan (las más recientes). Por defecto 3. */
  keepPartial?: number;
  /** Antigüedad máxima de una carpeta conservada. Por defecto 24 h. */
  maxAgeMs?: number;
  /** Tope de espacio de todas las ejecuciones y de cada una. Por defecto 256 MiB y 64 MiB. */
  maxTotalBytes?: number; maxRunBytes?: number;
  /** Tope de memoria del proceso hijo (MiB). Por defecto 256. */
  maxOldSpaceMb?: number;
  tools?: ProcessTools;
  /** Solo pruebas: sustituye `spawn` para observar argumentos, entorno y cwd del hijo. */
  spawnImpl?: typeof spawn;
  now?: () => number;
  /** Intervalo de comprobación del cierre de procesos y del tamaño. Por defecto 300 ms y 2 s. */
  pollMs?: number; sizeCheckMs?: number;
}
export type ExecutorFailure = 'aborted' | 'space' | 'child-failed' | 'bad-output' | 'setup-failed';
export class ExecutorError extends Error { constructor(readonly code: ExecutorFailure) { super(code); this.name = 'ExecutorError'; } }
export interface SweepReport { removed: number; kept: number; skipped: number }
export interface RelayExecutor {
  run(context: { signal: AbortSignal }): Promise<RehearsalResultLike>;
  sweep(): SweepReport;
  /** Ejecuciones de este proceso aún sin cerrar (incluye las que están drenando). */
  active(): number;
  /** Estado de la comprobación de cierre de procesos: `none` (nada pendiente), `verifying` (se está comprobando) o `unverified` (el inventario falla y NO se puede acreditar el cierre: la plaza sigue ocupada). */
  closure(): 'none' | 'verifying' | 'unverified';
  readonly root: string;
}

export const RUN_MARKER = '.planb-relay-run.json';
const RUN_NAME = /^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MARKER_FORMAT = 'planb-relay-run-v1';
const MarkerSchema = z.object({ format: z.literal(MARKER_FORMAT), id: z.string().regex(RUN_NAME), createdAt: z.string().datetime(), ownerPid: z.number().int().positive(), status: z.enum(['running', 'completed', 'partial']), codeDigest: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
type Marker = z.infer<typeof MarkerSchema>;
const ResultSchema = z.object({
  ok: z.boolean(), wrongIdRejected: z.boolean(), createCalls: z.number().int().min(0).max(1000), duplicates: z.number().int().min(0).max(1000), records: z.number().int().min(0).max(1_000_000),
  finalStage: z.string().regex(/^[a-z-]{1,40}$/), capsule: z.object({ bytes: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(), ms: z.object({ export: z.number().int().min(0).max(3_600_000), import: z.number().int().min(0).max(3_600_000) }).strict(),
}).strict();
const RESULT_PREFIX = 'RELAY_RESULT ';
const SCRIPTS = ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs'] as const;
const ENV_ALLOW = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'] as const;
const sleep = (ms: number) => new Promise<void>(done => { const timer = setTimeout(done, ms); timer.unref?.(); });
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Ejecuta una herramienta del sistema. `ok` solo si arrancó, terminó con código 0 y no excedió el tope de salida; si no, la salida no prueba nada. */
function capture(command: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise(done => {
    let out = '', overflow = false; const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 1_000_000) { overflow = true; out = out.slice(-1_000_000); } });
    child.once('error', () => done({ ok: false, out })); child.once('close', code => done({ ok: code === 0 && !overflow, out }));
  });
}
const INVENTORY_END = 'INVENTORY_COMPLETE';
export const defaultProcessTools: ProcessTools = {
  async killTree(pid) {
    if (process.platform === 'win32') { await capture('taskkill', ['/PID', String(pid), '/T', '/F']); return; }
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* ya no existe */ } }
  },
  async findByMarker(marker) {
    if (!/^run-[0-9a-f-]{36}$/.test(marker)) throw new Error('inventory-invalid-marker');
    if (process.platform === 'win32') {
      const script = "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*" + marker + "*' } | ForEach-Object { $_.ProcessId }; '" + INVENTORY_END + "'";
      const { ok, out } = await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
      const lines = out.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (!ok || lines.at(-1) !== INVENTORY_END) throw new Error('inventory-failed');   // fallo, denegación o salida incompleta: desconocido
      return lines.slice(0, -1).map(Number).filter(pid => Number.isInteger(pid) && pid > 0);
    }
    const { ok, out } = await capture('ps', ['-eo', 'pid=,args=']);
    if (!ok || out.trim() === '') throw new Error('inventory-failed');
    return out.split('\n').filter(line => line.includes(marker)).map(line => Number(line.trim().split(/\s+/)[0])).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  },
};

/** Tamaño de una carpeta SIN seguir enlaces (un enlace a node_modules no cuenta ni se recorre). */
export function folderBytes(dir: string): number {
  let total = 0;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { try { walk(full); } catch { /* desaparece mientras se mide */ } } else { try { total += lstatSync(full).size; } catch { /* idem */ } }
    }
  };
  try { walk(dir); } catch { return 0; }
  return total;
}
const WIN = process.platform === 'win32';
/** Forma comparable de una ruta: sin prefijo de ruta larga de Windows, normalizada y, en Windows, sin distinguir mayúsculas. */
const stripLong = (path: string) => WIN ? path.replace(/^\\\\[?.]\\/, '') : path;
const canon = (path: string) => { const full = resolve(stripLong(path)); return WIN ? full.toLowerCase() : full; };
const inside = (child: string, parent: string) => { const rel = relative(canon(parent), canon(child)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
/** Destino REAL de una ruta aunque aún no exista: resuelve enlaces y uniones del ancestro existente más profundo y le añade el resto. */
export function realTarget(path: string): string {
  let current = resolve(stripLong(path)); const tail: string[] = [];
  for (;;) {
    try { return resolve(realpathSync.native(current), ...[...tail].reverse()); } catch {
      const parent = dirname(current); if (parent === current) return resolve(stripLong(path));
      tail.push(basename(current)); current = parent;
    }
  }
}
/** Carpetas del árbol de fuentes en las que NUNCA puede vivir la raíz de datos (ni por alias): código, dependencias, compilados, pruebas y diseño. */
const CODE_DIRS = ['server', 'shared', 'scripts', 'node_modules', 'src', 'dist', 'build', 'tests', 'design', 'coordination'] as const;
const isLink = (path: string) => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };
function readMarker(dir: string): Marker | null {
  try { const parsed = MarkerSchema.safeParse(JSON.parse(readFileSync(join(dir, RUN_MARKER), 'utf8'))); return parsed.success ? parsed.data : null; } catch { return null; }
}
const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; } };

function sourceFiles(appRoot: string): { from: string; to: string }[] {
  const files: { from: string; to: string }[] = [];
  const walk = (dir: string, prefix: string, skip: (name: string) => boolean) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new ExecutorError('setup-failed');
      if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + '/', () => false); else if (entry.isFile()) files.push({ from: join(dir, entry.name), to: prefix + entry.name });
    }
  };
  walk(join(appRoot, 'server'), 'server/', name => name === 'team'); walk(join(appRoot, 'shared'), 'shared/', () => false);
  for (const script of SCRIPTS) files.push({ from: join(appRoot, 'scripts', script), to: 'scripts/' + script });
  files.push({ from: join(appRoot, 'package.json'), to: 'package.json' });
  if (existsSync(join(appRoot, 'tsconfig.json'))) files.push({ from: join(appRoot, 'tsconfig.json'), to: 'tsconfig.json' });
  return files;
}

export function createRelayExecutor(options: RelayExecutorOptions): RelayExecutor {
  if (!isAbsolute(options.installRoot) || !isAbsolute(options.appRoot)) throw new Error('installRoot y appRoot deben ser rutas absolutas.');
  const appRoot = resolve(options.appRoot);
  if (!existsSync(join(appRoot, 'node_modules')) || !existsSync(join(appRoot, 'server'))) throw new Error('appRoot no contiene el código del Kit ni node_modules.');
  // La raíz se decide por su DESTINO REAL (enlaces, uniones, mayúsculas y prefijos de Windows ya resueltos), no por el texto recibido. Se escribe, barre y borra siempre en esa ruta fijada.
  const realApp = realTarget(appRoot), realInstall = realTarget(options.installRoot), root = join(realInstall, 'relay-rehearsals');
  if (inside(realInstall, realApp) && (canon(realInstall) === canon(realApp) || CODE_DIRS.some(dir => inside(realInstall, join(realApp, dir))))) throw new Error('La raíz de datos no puede estar dentro del código (ni por un alias).');
  if (canon(realTarget(root)) !== canon(root)) throw new Error('La carpeta de ensayos es un alias hacia otro destino: no se usa.');
  /** Antes de escribir, barrer o borrar: la raíz sigue siendo la fijada y no se ha sustituido por un enlace o unión. */
  const rootIntact = () => { try { return canon(realTarget(join(realTarget(options.installRoot), 'relay-rehearsals'))) === canon(root) && !isLink(root); } catch { return false; } };
  const node = options.nodePath ?? process.execPath, tools = options.tools ?? defaultProcessTools, clock = options.now ?? Date.now;
  const keepPartial = Math.max(0, options.keepPartial ?? 3), maxAgeMs = options.maxAgeMs ?? 24 * 3_600_000, maxTotal = options.maxTotalBytes ?? 256 * 1024 * 1024, maxRun = options.maxRunBytes ?? 64 * 1024 * 1024;
  const heap = Math.min(2048, Math.max(64, options.maxOldSpaceMb ?? 256)), poll = Math.max(10, options.pollMs ?? 300), sizeEvery = Math.max(50, options.sizeCheckMs ?? 2_000);
  const running = new Set<string>(), closing = new Map<string, 'verifying' | 'unverified'>();

  /** Borra SOLO una carpeta propia con marca verificable. Los enlaces se retiran sin seguirlos y nada fuera de la carpeta se toca. */
  function removeOwn(dir: string): boolean {
    try {
      if (!rootIntact()) return false;
      const full = resolve(dir), name = full.slice(root.length + 1);
      if (canon(resolve(full, '..')) !== canon(root) || canon(realTarget(full)) !== canon(full) || !RUN_NAME.test(name) || isLink(full) || !lstatSync(full).isDirectory()) return false;
      const marker = readMarker(full); if (!marker || marker.id !== name) return false;
      const link = join(full, 'node_modules'); if (isLink(link)) rmSync(link, { force: true });
      const stray: string[] = [];
      const find = (current: string) => { for (const entry of readdirSync(current, { withFileTypes: true })) { const child = join(current, entry.name); if (entry.isSymbolicLink()) stray.push(child); else if (entry.isDirectory()) find(child); } };
      find(full); for (const path of stray) rmSync(path, { force: true });
      rmSync(full, { recursive: true, force: true }); return true;
    } catch { return false; }
  }
  function sweep(): SweepReport {
    const report: SweepReport = { removed: 0, kept: 0, skipped: 0 };
    if (!existsSync(root) || !rootIntact()) return report;
    const own: { dir: string; marker: Marker }[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const dir = join(root, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink() || !RUN_NAME.test(entry.name)) { report.skipped++; continue; }
      const marker = readMarker(dir); if (!marker || marker.id !== entry.name) { report.skipped++; continue; }   // sin marca verificable: no es nuestra, no se toca
      if (running.has(entry.name) || (marker.status === 'running' && marker.ownerPid !== process.pid && pidAlive(marker.ownerPid))) { report.skipped++; continue; }
      own.push({ dir, marker });
    }
    own.sort((a, b) => Date.parse(b.marker.createdAt) - Date.parse(a.marker.createdAt));
    let keptSoFar = 0;   // el tope de «conservadas» cuenta solo las parciales o inciertas, de la más reciente a la más antigua
    for (const { dir, marker } of own) {
      const old = clock() - Date.parse(marker.createdAt) > maxAgeMs, surplus = marker.status !== 'completed' && keptSoFar >= keepPartial;
      if (marker.status === 'completed' || old || surplus) { if (removeOwn(dir)) report.removed++; else report.skipped++; } else { keptSoFar++; report.kept++; }
    }
    return report;
  }
  function usedBytes() { try { return folderBytes(root); } catch { return 0; } }

  function prepare(name: string): { dir: string; digest: string } {
    if (!rootIntact()) throw new ExecutorError('setup-failed');
    const dir = join(root, name);
    mkdirSync(dir, { recursive: false });
    try {
      const manifest: string[] = [];
      for (const file of sourceFiles(appRoot)) {
        const target = join(dir, ...file.to.split('/')); mkdirSync(resolve(target, '..'), { recursive: true }); cpSync(file.from, target);
        const copied = sha(readFileSync(target)); if (copied !== sha(readFileSync(file.from))) throw new ExecutorError('setup-failed');
        manifest.push(file.to + ':' + copied);
      }
      manifest.sort(); const digest = sha(manifest.join('\n'));
      mkdirSync(join(dir, 'tests', '.tmp'), { recursive: true });
      symlinkSync(join(realpathSync(appRoot), 'node_modules'), join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      const marker: Marker = { format: MARKER_FORMAT, id: name, createdAt: new Date(clock()).toISOString(), ownerPid: process.pid, status: 'running', codeDigest: digest };
      writeFileSync(join(dir, RUN_MARKER), JSON.stringify(marker));
      return { dir, digest };
    } catch (error) { removeOwnForced(dir); throw error instanceof ExecutorError ? error : new ExecutorError('setup-failed'); }
  }
  /** Limpieza de una carpeta recién creada por esta ejecución cuyo montaje falló (aún sin marca): solo si cuelga directamente de nuestra raíz y se retiran antes los enlaces. */
  function removeOwnForced(dir: string) {
    try {
      const full = resolve(dir); if (!rootIntact() || canon(resolve(full, '..')) !== canon(root) || !RUN_NAME.test(full.slice(root.length + 1)) || isLink(full)) return;
      const link = join(full, 'node_modules'); if (isLink(link)) rmSync(link, { force: true });
      rmSync(full, { recursive: true, force: true });
    } catch { /* se queda para el barrido */ }
  }
  function setStatus(dir: string, status: Marker['status']) {
    const marker = readMarker(dir); if (!marker) return;
    try { writeFileSync(join(dir, RUN_MARKER), JSON.stringify({ ...marker, status })); } catch { /* el barrido lo tratará como parcial */ }
  }
  /** Espera a que NO quede ningún proceso con la marca. Un inventario que falla es «desconocido»: no acredita cierre, se reintenta y la plaza sigue ocupada (no hay plazo que la libere sin pruebas). */
  async function ensureGone(marker: string) {
    try {
      for (;;) {
        let pids: number[];
        try { pids = await tools.findByMarker(marker); closing.set(marker, 'verifying'); } catch { closing.set(marker, 'unverified'); await sleep(poll); continue; }
        if (pids.length === 0) return;
        await Promise.all(pids.map(pid => tools.killTree(pid).catch(() => undefined)));
        await sleep(poll);
      }
    } finally { closing.delete(marker); }
  }

  async function run({ signal }: { signal: AbortSignal }): Promise<RehearsalResultLike> {
    if (signal.aborted) throw new ExecutorError('aborted');
    if (!rootIntact()) throw new ExecutorError('setup-failed');
    mkdirSync(root, { recursive: true });
    if (!rootIntact()) throw new ExecutorError('setup-failed');
    sweep();
    if (usedBytes() > maxTotal) throw new ExecutorError('space');
    const name = 'run-' + randomUUID(), { dir } = prepare(name);
    running.add(name);
    try {
      const password = randomBytes(24).toString('base64url');
      const env: Record<string, string> = {}; for (const key of ENV_ALLOW) { const value = process.env[key]; if (value !== undefined) env[key] = value; }
      let child: ChildProcess;
      try {
        child = (options.spawnImpl ?? spawn)(node, ['--max-old-space-size=' + heap, '--require', join(dir, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/relay-rehearsal-child.ts', '--run', name], { cwd: dir, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { removeOwn(dir); throw new ExecutorError('setup-failed'); }
      let out = '', terminated = false, oversize = false, spawnFailed = false, exitCode: number | null = null, exitSignal: NodeJS.Signals | null = null;
      child.stdout!.on('data', chunk => { if (out.length < 65_536) out += chunk; }); child.stderr!.on('data', () => undefined);
      child.stdin!.on('error', () => undefined); child.stdin!.end(password + '\n');
      const exited = new Promise<void>(done => { child.once('error', () => { spawnFailed = true; done(); }); child.once('close', (code: number | null, signalName: NodeJS.Signals | null) => { exitCode = code; exitSignal = signalName; done(); }); });
      const terminate = async () => { terminated = true; if (child.pid) await tools.killTree(child.pid); };
      const onAbort = () => { void terminate(); };
      signal.addEventListener('abort', onAbort, { once: true }); if (signal.aborted) onAbort();
      const watch = setInterval(() => { if (!terminated && folderBytes(dir) > maxRun) { oversize = true; void terminate(); } }, sizeEvery); watch.unref?.();
      try { await exited; } finally { clearInterval(watch); signal.removeEventListener('abort', onAbort); }
      await ensureGone(name);   // el árbol entero (incluido el destino abierto en otro proceso) debe haber cerrado antes de asentar
      let parsed: z.infer<typeof ResultSchema> | null = null;
      const line = out.split(/\r?\n/).reverse().find(l => l.startsWith(RESULT_PREFIX));
      if (line && !terminated) { try { const result = ResultSchema.safeParse(JSON.parse(line.slice(RESULT_PREFIX.length))); parsed = result.success ? result.data : null; } catch { parsed = null; } }
      // Un resultado válido solo cuenta si el hijo cerró de forma coherente con él (0 si ok, 1 si el Kit informó fallo): una línea válida seguida de otro código o de una señal es incierta y se conserva.
      const cleanExit = !spawnFailed && exitSignal === null && exitCode === (parsed?.ok ? 0 : 1);
      if (parsed && parsed.ok && cleanExit) removeOwn(dir); else setStatus(dir, 'partial');   // lo parcial o incierto se conserva (con tope) para que se pueda revisar
      sweep();
      if (signal.aborted || terminated) throw new ExecutorError(oversize ? 'space' : 'aborted');
      if (spawnFailed) throw new ExecutorError('setup-failed');
      if (!line) throw new ExecutorError('child-failed');
      if (!parsed) throw new ExecutorError('bad-output');
      if (!cleanExit) throw new ExecutorError('child-failed');
      return parsed;
    } finally { running.delete(name); }
  }
  return { run, sweep, active: () => running.size, closure: () => [...closing.values()].includes('unverified') ? 'unverified' : closing.size > 0 ? 'verifying' : 'none', root };
}

