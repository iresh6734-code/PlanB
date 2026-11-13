import { expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ARNÉS de las sondas de App de Hoy (encargo 240 · Claude A, R2). No es una prueba: lo importan las especificaciones `hoy-recuperable-240` y `hoy-ficha-condicionada`.
//
// QUÉ HACE.
//  1. RAÍZ PROPIA y verificada: se crea bajo un padre de pruebas (por defecto `tests/.tmp`) que resuelve dentro del repositorio. Rechaza un destino que ya exista (no lo creó esta ejecución), que
//     resuelva fuera del padre o que lo alcance por `..`/enlaces. Nada se borra de forma recursiva: cada CASO usa un directorio de datos NUEVO y solo un reinicio del mismo caso reutiliza su base.
//  2. COPIA PRIVADA del corte que se ejecuta: cliente (src, shared, public, index.html…) Y servidor (server, shared, scripts/block-external.cjs…) se copian a la raíz, se coteja cada archivo
//     contra el checkout (si algo cambia mientras se copia, se niega a continuar) y el manifiesto lista hash de fuentes de cliente, de servidor y de los activos compilados (`dist`).
//     La App se compila con Vite desde esa copia y el servidor arranca DESDE esa copia, con entorno mínimo, clave de ensayo recién generada por caso y red exterior bloqueada.
//  3. Registro de peticiones `/api/` hecho POR EL SERVIDOR (método, ruta, estado, PID e identidad de ejecución) y estado/historial leídos de la base: los recuentos no salen de la interfaz.
//  4. IDENTIDAD DE EJECUCIÓN: cada arranque conserva su ChildProcess original y su recibo de cierre (PID, código, señal). El sistema puede reutilizar un PID; no identifica por sí solo al hijo.
//  5. `assertApplied`: separa respuesta RECIBIDA (estado HTTP exitoso para el ID exacto), aplicación OBSERVADA (valor persistido y fila de historial de ese ID) y homónima intacta. Un PATCH
//     rechazado antes de escribir cuenta como petición pero NO satisface la aplicación.
//
// QUÉ NO HACE. No prueba `main` compilado con esbuild ni el menú del empaquetado final (eso es la prueba de salida); no monta nada; no usa datos reales ni cuentas.
const repo = process.cwd();
const absolute = (name: string) => JSON.stringify(pathToFileURL(name).href);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const within = (parent: string, child: string) => { const relative = path.relative(parent, child); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); };
const PARENT_DEFAULT = path.join(repo, 'tests', '.tmp');

/** Verifica el padre de pruebas y reclama una raíz NUEVA bajo él. Lanza si el destino ya existe, resuelve fuera del padre o el padre no está dentro del repositorio. */
export function claimRoot(parent: string = PARENT_DEFAULT, requested?: string): string {
  const realRepo = fs.realpathSync(repo);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  if (!within(path.join(realRepo, 'tests'), realParent)) throw new Error('El padre de pruebas debe estar dentro de tests/ del repositorio: ' + realParent);
  const target = requested ? path.resolve(requested) : path.join(realParent, 'hoy240-run-' + randomUUID().slice(0, 8));
  if (!within(path.resolve(parent), target) && !within(realParent, target)) throw new Error('La raíz resuelve fuera del padre de pruebas: ' + target);
  if (fs.existsSync(target)) throw new Error('La raíz ya existe y no la creó esta ejecución: ' + target);
  // El ancestro existente más profundo debe resolver DENTRO del padre (o ser el padre): un enlace intermedio no puede sacar la creación fuera.
  let ancestor = path.dirname(target); while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor); if (realAncestor !== realParent && !within(realParent, realAncestor)) throw new Error('La raíz resuelve fuera del padre de pruebas por un enlace: ' + realAncestor);
  fs.mkdirSync(target);   // no recursivo: si otro proceso la creó entre medias, falla
  fs.writeFileSync(path.join(target, '.creada-por-el-arnes'), JSON.stringify({ at: new Date().toISOString() }), { flag: 'wx' });
  return fs.realpathSync(target);
}

/** Servidor de prueba (copia PRIVADA). Siembra solo si la base de ESTE caso está vacía. `HOY_FAIL_FIRST_PATCH=1` rechaza con 500 el primer PATCH ANTES de escribir (contraprueba). */
const SERVER = `import { appendFileSync } from 'node:fs';
import { createBaseApp } from './server/app.ts';
import { makeFixture, makeDemoSpec } from './shared/fixtures.ts';
const root = process.env.ROOT!, dir = process.env.CASE_DIR!, runId = process.env.RUN_ID!;
const { app, store } = await createBaseApp({ root: dir, dbPath: dir + '/planb.sqlite', staticDir: root + '/dist', taskRevisions: true });
appendFileSync(dir + '/starts.jsonl', JSON.stringify({ runId, pid: process.pid, at: new Date().toISOString() }) + '\\n');
let failed = false;
app.addHook('onRequest', async (request, reply) => { if (process.env.HOY_FAIL_FIRST_PATCH === '1' && !failed && request.method === 'PATCH' && request.url.startsWith('/api/')) { failed = true; return reply.code(500).send({ error: 'Fallo previo a escribir (contraprueba)' }); } });
app.addHook('onResponse', async (request, reply) => {
  const path = request.url.split('?')[0];
  if (path.startsWith('/api/') && request.method !== 'OPTIONS') appendFileSync(dir + '/requests.jsonl', JSON.stringify({ method: request.method, path, status: reply.statusCode, pid: process.pid, runId }) + '\\n');
});
const gen = (snapshot: any) => store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false });
if (!store.snapshot) {
  const snapshot: any = makeFixture('agency');
  for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.status = 'pending'; task.values.notes = 'Nota inicial'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
  store.importSnapshot(snapshot); gen(snapshot); store.activate();
}
app.post('/__h/state', async () => ({ changes: store.changes().length, changesCount: store.changesCount, task2: store.record('tasks', 'task-2')?.values ?? null, task3: store.record('tasks', 'task-3')?.values ?? null,
  history: store.changes().map(c => ({ id: c.id, at: c.at, recordId: c.recordId, entity: c.entity, after: c.after.values })) }));
await app.listen({ host: '127.0.0.1', port: 0 }); console.log('LISTEN ' + (app.server.address() as { port: number }).port);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
`;

export interface RequestLine { method: string; path: string; status: number; pid: number; runId?: string }
export interface Counts { conditionedPatches: number; legacyPatches: number; conflicts409: number; workQueueReads: number; workSummaryReads: number; otherPatches: number; attempts: number; applied: number }
export interface HistoryRow { id: number; at: string; recordId: string; entity: string; after: Record<string, unknown> }
export interface HarnessState { changes: number; changesCount: number; task2: Record<string, unknown> | null; task3: Record<string, unknown> | null; history: HistoryRow[] }
export interface StartReceipt { pid: number; runId: string; port: number; case: number }
export interface CloseReceipt { pid: number; code: number | null; signal: string | null }
interface ChildRun { child: ChildProcess; closed: Promise<void>; receipt: CloseReceipt | null; start: StartReceipt | null }
const isTaskPatch = (line: RequestLine, taskId: string) => line.method === 'PATCH' && (line.path === '/api/v7/task-revision/' + taskId || line.path === '/api/records/tasks/' + taskId);

export class HoyHarness {
  /** Raíz propia (creada por esta ejecución, bajo el padre verificado). */
  readonly root: string;
  /** Identidad de ESTA ejecución del arnés: la llevan el servidor, su registro y los recibos. */
  readonly runId = randomUUID();
  origin = '';
  private child: ChildProcess | undefined;
  private readonly children: ChildRun[] = [];
  private caseNo = 0;
  readonly starts: StartReceipt[] = [];
  readonly closes: CloseReceipt[] = [];
  private claimed: string | null;
  private requestedRoot: string | undefined;
  private parent: string | undefined;
  private failFirstPatch = false;
  constructor(options: { root?: string; parent?: string } = {}) {
    this.requestedRoot = options.root ?? process.env.PLANB_HOY_ROOT; this.parent = options.parent; this.claimed = null; this.root = '';
  }
  /** Raíz reclamada tras `prepare()`; antes de eso lanza (no se ha creado nada). */
  get dir(): string { if (!this.claimed) throw new Error('prepare() todavía no reclamó la raíz'); return this.claimed; }
  get caseDir(): string { return path.join(this.dir, 'cases', String(this.caseNo).padStart(3, '0') + '-' + this.runId.slice(0, 8)); }

  /** Reclama la raíz, copia y coteja el corte (cliente + servidor), compila la App y escribe el servidor. Se llama una vez (beforeAll). */
  async prepare() {
    this.claimed = claimRoot(this.parent, this.requestedRoot);
    (this as { root: string }).root = this.claimed;
    const root = this.claimed, frozen = path.join(root, 'frozen'), priv = path.join(root, 'priv');
    const copies: [string, string][] = [];
    for (const entry of ['src', 'shared', 'public']) copies.push([entry, path.join(frozen, entry)]);
    for (const file of ['index.html', 'package.json', 'tsconfig.json']) copies.push([file, path.join(frozen, file)]);
    for (const entry of ['server', 'shared']) copies.push([entry, path.join(priv, entry)]);
    for (const file of ['package.json', 'tsconfig.json', 'scripts/block-external.cjs']) copies.push([file, path.join(priv, file)]);
    for (const [from, to] of copies) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(path.join(repo, from), to, { recursive: true, errorOnExist: true }); }
    // Manifiesto: TODOS los archivos de cada árbol copiado (cualquier extensión, activos públicos incluidos) contra el checkout. Si algo cambió durante la copia, se niega a continuar.
    const hashes: Record<string, Record<string, string>> = { client: {}, server: {} };
    const walk = (base: string, rel: string, into: Record<string, string>) => {
      const full = path.join(base, rel), stat = fs.statSync(full);
      if (stat.isDirectory()) { for (const name of fs.readdirSync(full)) walk(base, path.posix.join(rel.split(path.sep).join('/'), name), into); return; }
      into[rel.split(path.sep).join('/')] = sha(full);
    };
    for (const [, to] of copies) { const client = to.startsWith(frozen), base = client ? frozen : priv; walk(base, path.relative(base, to), client ? hashes.client : hashes.server); }
    for (const [group, into] of Object.entries(hashes)) for (const [file, hash] of Object.entries(into)) {
      if (sha(path.join(repo, file)) !== hash) throw new Error('El fuente cambió durante la copia (' + group + '): ' + file + '. Repite la prueba.');
    }
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(priv, 'node_modules'), 'junction');   // dependencias de terceros; el CÓDIGO del servidor es la copia privada
    await build({ root: frozen, configFile: false, envDir: path.join(root, 'empty-env'), base: './', mode: 'production', plugins: [react()], logLevel: 'error', build: { outDir: path.join(priv, 'dist'), emptyOutDir: true, minify: false } });
    const assets: Record<string, string> = {}; walk(priv, 'dist', assets);
    fs.writeFileSync(path.join(root, 'server.mts'),   // el guion vive en la raíz (las especificaciones pueden extenderlo); sus imports apuntan a la COPIA PRIVADA del servidor
       SERVER.split("from './server/app.ts'").join('from ' + absolute(path.join(priv, 'server', 'app.ts'))).split("from './shared/fixtures.ts'").join('from ' + absolute(path.join(priv, 'shared', 'fixtures.ts'))));
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ runId: this.runId, preparedAt: new Date().toISOString(), counts: { client: Object.keys(hashes.client).length, server: Object.keys(hashes.server).length, assets: Object.keys(assets).length }, hashes: { ...hashes, assets } }, null, 1));
  }

  /** CASO NUEVO: directorio de datos nuevo (nada se borra). Solo un reinicio del mismo caso reutiliza su base. Genera una clave de ensayo recién creada para el caso. */
  reset() {
    this.caseNo++; const dir = this.caseDir; fs.mkdirSync(path.dirname(dir), { recursive: true }); fs.mkdirSync(dir, { recursive: false });   // el directorio del caso es NUEVO: si existe, falla
    fs.writeFileSync(path.join(dir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'requests.jsonl'), '', { flag: 'wx' });
  }
  /** Pide que el PRÓXIMO arranque rechace con 500 el primer PATCH antes de escribir (contraprueba de `assertApplied`). */
  failFirstPatchOnNextStart(on = true) { this.failFirstPatch = on; }

  /** Arranca el servidor privado sobre el caso actual (misma base si ya existe). Con `page`, bloquea todo origen distinto del servidor. */
  async start(page?: Page): Promise<StartReceipt> {
    if (this.child && !this.children.find(run => run.child === this.child)?.receipt) throw new Error('Hay un servidor de prueba pendiente de cierre.');
    const priv = path.join(this.dir, 'priv'), env: Record<string, string> = { ROOT: priv, CASE_DIR: this.caseDir, RUN_ID: this.runId, NODE_ENV: 'test', NO_COLOR: '1' };
    for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'ComSpec']) if (process.env[name] !== undefined) env[name] = process.env[name]!;
    if (this.failFirstPatch) env.HOY_FAIL_FIRST_PATCH = '1';
    const child = spawn(process.execPath, ['--require', path.join(priv, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(this.dir, 'server.mts')], { cwd: priv, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child; let output = '';
    let resolveClosed!: () => void;
    const run: ChildRun = { child, closed: new Promise<void>(resolve => { resolveClosed = resolve; }), receipt: null, start: null };
    this.children.push(run);
    const caseDir = this.caseDir;
    child.once('close', (code, signal) => {
      const receipt: CloseReceipt = { pid: child.pid ?? -1, code, signal }; run.receipt = receipt; this.closes.push(receipt);
      try { fs.appendFileSync(path.join(caseDir, 'closes.jsonl'), JSON.stringify(receipt) + '\n'); } finally { resolveClosed(); }
    });
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó: ' + output)), 60_000);
      child.stdout!.on('data', value => { output += String(value); const match = /LISTEN (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
      child.stderr!.on('data', value => { output += String(value); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó con código ' + code + ' ' + output)); });
      child.once('error', error => { clearTimeout(timer); reject(new Error('No se pudo arrancar el servidor de prueba: ' + error.message)); });
    });
    this.origin = 'http://127.0.0.1:' + port;
    const receipt: StartReceipt = { pid: child.pid ?? -1, runId: this.runId, port, case: this.caseNo }; run.start = receipt; this.starts.push(receipt);
    if (page) await this.guard(page);
    return receipt;
  }
  /** Bloqueo de red exterior en el navegador: solo el servidor de prueba responde. */
  async guard(page: Page) { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await page.route('**/*', route => new URL(route.request().url()).origin === this.origin ? route.fallback() : route.abort()); }
  /** Cierra el servidor y espera su recibo de cierre. */
  async stop() {
    const child = this.child; if (!child) return;
    const run = this.children.find(entry => entry.child === child); if (!run) throw new Error('Falta el seguimiento del proceso de prueba.');
    if (!run.receipt && child.exitCode === null && child.signalCode === null) child.kill();
    await run.closed;
    if (this.child === child) this.child = undefined;
  }
  /** Reinicia con otro ChildProcess sobre el mismo caso y exige el cierre del anterior. El sistema puede reutilizar PID o puerto. */
  async restart(page?: Page): Promise<{ before: StartReceipt; after: StartReceipt }> {
    const previous = this.children.find(run => run.child === this.child), before = previous?.start; if (!before) throw new Error('No hay un arranque previo que reiniciar.');
    await this.stop(); const after = await this.start(page);
    if (this.child === previous.child) throw new Error('El reinicio no cambió de proceso.');
    if (!previous.receipt || !this.closes.includes(previous.receipt)) throw new Error('Falta el recibo de cierre del proceso ' + before.pid);
    return { before, after };
  }
  /** Cada hijo original (incluso un arranque fallido) emitió close y conserva su propio recibo. No se sondea un PID que puede haber sido reutilizado. */
  assertAllClosed() {
    for (const run of this.children) {
      if (!run.receipt || !this.closes.includes(run.receipt)) throw new Error('El proceso ' + (run.child.pid ?? -1) + ' no tiene recibo de cierre de su hijo original.');
      if (run.child.exitCode === null && run.child.signalCode === null) throw new Error('El proceso ' + (run.child.pid ?? -1) + ' sigue vivo tras su cierre.');
    }
  }

  async state(): Promise<HarnessState> { return await (await fetch(this.origin + '/__h/state', { method: 'POST' })).json() as HarnessState; }
  requests(): RequestLine[] { const file = path.join(this.caseDir, 'requests.jsonl'); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as RequestLine) : []; }
  /** Recuentos DEL SERVIDOR (sobreviven a reinicios del mismo caso). `attempts` = PATCH recibidos (con cualquier estado); `applied` = PATCH con respuesta 2xx. */
  counts(): Counts {
    const lines = this.requests(), patches = lines.filter(line => line.method === 'PATCH'), conditioned = (line: RequestLine) => line.path.startsWith('/api/v7/task-revision/'), legacy = (line: RequestLine) => line.path.startsWith('/api/records/');
    return {
      conditionedPatches: patches.filter(conditioned).length, legacyPatches: patches.filter(legacy).length, otherPatches: patches.filter(line => !conditioned(line) && !legacy(line)).length,
      conflicts409: patches.filter(line => line.status === 409).length, attempts: patches.length, applied: patches.filter(line => line.status >= 200 && line.status < 300).length,
      workQueueReads: lines.filter(line => line.method === 'GET' && line.path === '/api/v7/local-operations/work').length, workSummaryReads: lines.filter(line => line.method === 'GET' && line.path === '/api/v7/local-operations/work-summary').length,
    };
  }
  /**
   * Separa RECEPCIÓN, APLICACIÓN y PÉRDIDA DE ACUSE. Exige, para la tarea EXACTA: (1) un PATCH a su ruta con respuesta exitosa; (2) el valor esperado persistido; (3) al menos una fila de historial
   * de ESE ID cuyo `after` contiene lo esperado; (4) la homónima sin cambios. Un PATCH rechazado antes de escribir (500) cuenta como petición pero NO supera (1) ni (3).
   * Devuelve la evidencia (incluida la identidad de la última fila) para cotejarla tras un reinicio.
   */
  async assertApplied(input: { taskId: string; expected: Record<string, unknown>; homonymId: string; homonymBefore: Record<string, unknown> }) {
    const lines = this.requests().filter(line => isTaskPatch(line, input.taskId)), ok = lines.filter(line => line.status >= 200 && line.status < 300);
    if (!ok.length) throw new Error('Aplicación NO acreditada: el servidor no devolvió éxito a ningún PATCH de ' + input.taskId + ' (recibidos: ' + JSON.stringify(lines.map(line => line.status)) + ').');
    const state = await this.state(), values = (input.taskId === 'task-2' ? state.task2 : input.taskId === 'task-3' ? state.task3 : null) ?? {};
    for (const [key, value] of Object.entries(input.expected)) if (values[key] !== value) throw new Error('Aplicación NO acreditada: ' + input.taskId + '.' + key + ' es ' + JSON.stringify(values[key]) + ', se esperaba ' + JSON.stringify(value) + '.');
    const rows = state.history.filter(row => row.recordId === input.taskId && Object.entries(input.expected).every(([key, value]) => row.after[key] === value));
    if (!rows.length) throw new Error('Aplicación NO acreditada: no hay fila de historial de ' + input.taskId + ' con el efecto esperado (filas totales: ' + state.history.length + ').');
    const other = (input.homonymId === 'task-2' ? state.task2 : state.task3) ?? {};
    if (JSON.stringify(other) !== JSON.stringify(input.homonymBefore)) throw new Error('La homónima ' + input.homonymId + ' cambió.');
    return { received: ok.map(line => line.status), row: rows.at(-1)!, rows: state.history.filter(row => row.recordId === input.taskId), task: values, homonym: other, historyTotal: state.history.length };
  }
}

// ── Localizadores compartidos por las sondas (la App real: barra lateral, Hoy, ficha) ───────────────────────────────────────────────────────────────────────────────────────────
export const nav = (page: Page, name: string) => page.locator('.sidebar').getByRole('button', { name, exact: true });
export const taskButton = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir Llamar a Ana (ID ' + id + ')', exact: true });
export const ficha = (page: Page) => page.getByRole('dialog', { name: 'Llamar a Ana' });
export const resultados = (page: Page) => page.locator('.toh');
export async function openToday(page: Page, origin: string, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size); await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(page.locator('.lop-tasks li').first()).toBeVisible();
}
export async function openTask(page: Page, id: string) { await taskButton(page, id).focus(); await page.keyboard.press('Enter'); await expect(ficha(page)).toContainText(id); }
export const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
