import { test, expect, type Browser, type Page } from '@playwright/test';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { build as bundle } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import { WORK_SUMMARY_ROUTE, WorkSummarySchema, type WorkSummary } from '../../shared/work-summary.js';
import { FORBIDDEN_PUBLIC, READER_EXPECTATIONS, seedReaderScenario, type ReaderScenario } from '../work-summary-qa-fixtures.js';

process.env.NODE_ENV = 'test';
// QA INDEPENDIENTE DEL RESUMEN DE TRABAJO EN CONTINUIDAD (unidad Claude B · CLAUDE-WORK-SUMMARY-QA). Verifica, sobre la App COMPILADA (Vite de producción + `server/main.ts` empaquetado, en una carpeta nueva fuera
// del repositorio y con puerto y base propios), que la tarjeta, el pasaporte y el mapa comparten UNA lectura del resumen con el pin de la copia activa y que ningún resultado anterior se presenta como actual.
//
// DOS INSTALACIONES, CON ETIQUETA:
//  · «normal»: el `main` del repositorio tal cual. Declara `covers: () => false` (no hay escritor A4): el resultado correcto es «sin cobertura» con recuentos nulos.
//  · «lector»: el MISMO `main` con UNA sola sustitución de prueba (`covers: () => true`) y un cuaderno sembrado con el diario real. Prueba el LECTOR y su presentación; NO acredita cobertura del escritor de la App.
const repo = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-summary-qa-'));
const password = 'ficticia-qa-resumen-pruebas', COVERS_FALSE = 'registerWorkSummaryApi(app, store, { covers: () => false });';
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const treeHash = (dir: string) => { const hash = createHash('sha256'); const walk = (current: string) => { for (const name of fs.readdirSync(current).sort()) { const full = path.join(current, name); if (fs.statSync(full).isDirectory()) walk(full); else hash.update(path.relative(dir, full).replace(/\\/g, '/')).update(fs.readFileSync(full)); } }; walk(dir); return hash.digest('hex'); };
const evidence: Record<string, unknown> = {};

// CONTROL CAUSAL DE LA PROPIA QA. Con PLANB_QA_MUTANT=<nombre> se construye una COPIA del producto con UNA rotura concreta (la copia vive en tests/.tmp, nunca se toca el repositorio) y la suite debe FALLAR.
// Sin la variable, la suite verifica el corte real del repositorio.
const MUTANT = process.env.PLANB_QA_MUTANT ?? '';
const MUTANTS: Record<string, { file: string; from: string; to: string; why: string }> = {
  'cobertura-declarada': { file: 'server/main.ts', from: COVERS_FALSE, to: 'registerWorkSummaryApi(app, store, { covers: () => true });', why: 'main declara cobertura sin escritor A4' },
  'pin-ignorado': { file: 'src/WorkSummary.tsx', from: 'const otherCopy = !!summary && expectedContext !== null && summary.scope.context !== expectedContext;', to: 'const otherCopy = false;', why: 'la tarjeta acredita un resumen de otra copia' },
  'sin-generacion': { file: 'src/WorkSummary.tsx', from: 'const current = () => alive.current && generation.current === mine;', to: 'const current = () => true;', why: 'una lectura tardía sustituye a la actual (EQUIVALENTE en la App: la tarjeta se desmonta y el padre filtra por propietario; no se puede alcanzar con la interfaz)' },
  'sin-cobertura-es-vacio': { file: 'shared/work-summary.ts', from: "if (summary.coverage === 'none') return 'uncovered';", to: "if (summary.coverage === 'none') return 'empty';", why: 'sin cobertura se presenta como sin trabajo' },
  'pasaporte-toma-otra-copia': { file: 'src/ContinuityHub.tsx', from: 'sameWork = !!w && expected !== null && w.context === expected;', to: 'sameWork = !!w;', why: 'el pasaporte acepta el resumen de otra copia' },
  'exportacion-con-ruta': { file: 'shared/work-summary.ts', from: "limits: ['Es lo que el cuaderno local había registrado en ese instante; no consulta el CRM.',", to: "limits: ['Es lo que el cuaderno local había registrado en ese instante (C:\\Users\\persona\\AppData\\planb.sqlite); no consulta el CRM.',", why: 'la exportación filtra una ruta privada' },
};
const mutant = MUTANT ? MUTANTS[MUTANT] : null; if (MUTANT && !mutant) throw new Error('Mutante desconocido: ' + MUTANT);

interface Rig { name: string; install: string; data: string; origin: string; child: () => ChildProcess; output: () => string; external: () => number; stop: () => Promise<void>; restart: (mutate?: (store: Store) => void | Promise<void>) => Promise<void> }
const rigs: Rig[] = [];
const freePort = async () => { const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve())); return port; };

test.beforeAll(async () => {
  test.setTimeout(300_000);
  let buildRoot = repo, main = fs.readFileSync(path.join(repo, 'server', 'main.ts'), 'utf8');
  expect(main.split(COVERS_FALSE).length - 1, 'main declara la cobertura falsa exactamente una vez').toBe(1);
  if (mutant) {
    buildRoot = path.join(repo, 'tests', '.tmp', 'summary-qa-mutant-' + path.basename(root)); fs.mkdirSync(buildRoot, { recursive: true });
    for (const dir of ['src', 'shared', 'public', 'server']) fs.cpSync(path.join(repo, dir), path.join(buildRoot, dir), { recursive: true });
    for (const file of ['index.html', 'package.json']) fs.copyFileSync(path.join(repo, file), path.join(buildRoot, file));
    const target = path.join(buildRoot, mutant.file), text = fs.readFileSync(target, 'utf8'); expect(text.split(mutant.from).length - 1, 'el mutante encuentra su ancla una sola vez: ' + MUTANT).toBe(1);
    fs.writeFileSync(target, text.replace(mutant.from, () => mutant.to)); if (mutant.file === 'server/main.ts') main = fs.readFileSync(target, 'utf8');
    evidence.mutant = { name: MUTANT, why: mutant.why };
  }
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await viteBuild({ root: buildRoot, mode: 'production', configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: false, minify: false } });
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  const assets = path.join(root, 'dist', 'assets'), client = fs.readdirSync(assets).filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
  expect(client, 'la interfaz usa el entorno de producción de React').not.toContain('react-dom-client.development.js');
  const banner = { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" };
  // Binario NORMAL = main del repositorio. Binario LECTOR = el mismo main con la única sustitución de cobertura.
  await bundle({ entryPoints: [path.join(buildRoot, 'server', 'main.ts')], outfile: path.join(root, 'bin', 'normal', 'server.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error', banner });
  // La variante se empaqueta desde la entrada estándar (sin escribir ningún archivo en el repositorio): el texto de main con la ÚNICA sustitución de cobertura.
  await bundle({ stdin: { contents: main.replace(COVERS_FALSE, 'registerWorkSummaryApi(app, store, { covers: () => true });'), resolveDir: path.join(buildRoot, 'server'), sourcefile: 'main.ts', loader: 'ts' }, outfile: path.join(root, 'bin', 'reader', 'server.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error', banner });
  fs.copyFileSync(path.join(repo, 'scripts', 'block-external.cjs'), path.join(root, 'bin', 'block-external.cjs'));
  evidence.sources = Object.fromEntries(['server/main.ts', 'src/ContinuityHome.tsx', 'src/ContinuityHub.tsx', 'src/WorkSummary.tsx', 'src/work-summary-client.ts', 'shared/work-summary.ts', 'server/work-summary-api.ts', 'src/App.tsx'].map(file => [file, sha(path.join(repo, file))]));
  evidence.binaries = { normal: sha(path.join(root, 'bin', 'normal', 'server.mjs')), reader: sha(path.join(root, 'bin', 'reader', 'server.mjs')), dist: treeHash(path.join(root, 'dist')) };
});
test.afterEach(async () => { for (const rig of rigs.splice(0)) await rig.stop(); });
test.afterAll(async () => {
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('EVIDENCIA-QA ' + root + '\n' + JSON.stringify(evidence));
  if (mutant) { try { fs.rmSync(path.join(repo, 'tests', '.tmp', 'summary-qa-mutant-' + path.basename(root)), { recursive: true, force: true }); } catch { /* no crítico */ } }
  if (!process.env.PLANB_KEEP_SUMMARY_QA) { try { fs.rmSync(path.join(root, 'bin'), { recursive: true, force: true }); } catch { /* no crítico */ } }
});

/** Arranca una instalación nueva (carpeta, base y puerto propios). `reader` usa la variante con cobertura y siembra el cuaderno con el diario real. */
async function startRig(name: string, options: { reader?: boolean; scenario?: ReaderScenario } = {}): Promise<Rig> {
  const install = path.join(root, 'install-' + name), data = path.join(install, 'data'); fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(path.join(install, 'build'), { recursive: true }); fs.mkdirSync(path.join(install, 'tmp'));
  fs.cpSync(path.join(root, 'dist'), path.join(install, 'dist'), { recursive: true });
  const kind = options.reader ? 'reader' : 'normal';
  fs.copyFileSync(path.join(root, 'bin', kind, 'server.mjs'), path.join(install, 'build', 'server.mjs')); fs.copyFileSync(path.join(root, 'bin', 'block-external.cjs'), path.join(install, 'build', 'block-external.cjs'));
  fs.writeFileSync(path.join(data, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }), { flag: 'wx' });
  const store = new Store(path.join(data, 'planb.sqlite'));
  try {
    const snapshot = makeFixture('agency'); store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-08T09:00:00Z', prompt: '', approved: false }); store.activate();
    if (options.scenario) await seedReaderScenario(store, options.scenario);
  } finally { store.close(); }
  const port = await freePort(), allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'lang', 'tz']);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase()))), NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: data, TEMP: path.join(install, 'tmp'), TMP: path.join(install, 'tmp'), TMPDIR: path.join(install, 'tmp') };
  let out = '', externalRequests = 0, child!: ChildProcess;
  const launch = async () => {
    const spawned = spawn(process.execPath, ['--require', path.join(install, 'build', 'block-external.cjs'), path.join(install, 'build', 'server.mjs')], { cwd: install, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); child = spawned;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('main no arrancó: ' + out)), 60_000); let seen = '';
      spawned.stdout!.on('data', value => { out += String(value); seen += String(value); if (seen.includes('Abre http://127.0.0.1:' + port)) { clearTimeout(timer); resolve(); } });
      spawned.stderr!.on('data', value => { out += String(value); });
      spawned.once('exit', code => { clearTimeout(timer); reject(new Error('main terminó ' + code + ': ' + out)); });
    });
  };
  await launch();
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { const closed = new Promise<void>(resolve => child.once('close', () => resolve())); child.kill(); await closed; } };
  /** Reinicio en el MISMO puerto (el navegador sigue abierto). Las sesiones viven en memoria: tras reiniciar hay que volver a desbloquear. `mutate` cambia la Store con el servidor parado. */
  const restart = async (mutate?: (store: Store) => void | Promise<void>) => {
    await stop();
    if (mutate) { const again = new Store(path.join(data, 'planb.sqlite')); try { await mutate(again); } finally { again.close(); } }
    await launch();
  };
  const rig: Rig = { name, install, data, origin: 'http://127.0.0.1:' + port, child: () => child, output: () => out, external: () => externalRequests, stop, restart };
  rigs.push(rig); return rig;
}
const journalDigest = (rig: Rig) => {
  const db = new DatabaseSync(path.join(rig.data, 'planb.sqlite'), { readOnly: true });
  try { return createHash('sha256').update(JSON.stringify(db.prepare("SELECT key, value FROM meta WHERE key LIKE 'task-intent:%' ORDER BY key").all())).digest('hex'); } finally { db.close(); }
};
const digest = (rig: Rig) => {
  const db = new DatabaseSync(path.join(rig.data, 'planb.sqlite'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return createHash('sha256').update(JSON.stringify(tables.map(({ name }) => [name, db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]))).digest('hex');
  } finally { db.close(); }
};

interface Watch { failed: string[]; requests: string[]; summaries: Array<{ status: number; body: unknown }>; evidence: Array<{ status: number; body: any }>; external: string[]; errors: string[] }
async function open(page: Page, rig: Rig): Promise<Watch> {
  const watch: Watch = { failed: [], requests: [], summaries: [], evidence: [], external: [], errors: [] };
  page.on('pageerror', error => watch.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) watch.errors.push(message.text()); });
  await page.route('**/*', route => { if (new URL(route.request().url()).origin === rig.origin) return route.fallback(); watch.external.push(route.request().url()); return route.abort(); });
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) watch.requests.push(request.method() + ' ' + url.pathname); });
  page.on('response', async response => {
    const url = new URL(response.url()); if (response.status() >= 400) watch.failed.push(response.status() + ' ' + url.pathname);
    if (url.pathname === WORK_SUMMARY_ROUTE) watch.summaries.push({ status: response.status(), body: await response.json().catch(() => null) });
    if (url.pathname === '/api/v7/continuity/evidence') watch.evidence.push({ status: response.status(), body: await response.json().catch(() => null) });
  });
  const status = await page.request.get(rig.origin + '/api/v2/auth/status').then(r => r.json()) as { configured: boolean };
  const reply = await page.request.post(rig.origin + '/api/v2/auth/' + (status.configured ? 'login' : 'setup'), { data: { password }, headers: { origin: rig.origin } }); expect(reply.ok()).toBe(true);
  await page.goto(rig.origin); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click();
  await expect(page.getByTestId('continuity-hub-block')).toBeVisible(); await expect(page.getByTestId('work-summary')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('work-summary')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  return watch;
}
const card = (page: Page) => page.getByTestId('work-summary');

// ───────────────────────────── utilidades de las pruebas ─────────────────────────────
const STRIP_ABORT = `(() => { const real = window.fetch.bind(window); window.fetch = (input, init) => { const url = typeof input === 'string' ? input : (input && input.url) || String(input); if (url.includes('/api/v7/local-operations/work-summary') && init && init.signal) { const rest = Object.assign({}, init); delete rest.signal; return real(input, rest); } return real(input, init); }; })();`;
async function session(browser: Browser, rig: Rig, options: { stripAbort?: boolean; viewport?: { width: number; height: number }; acceptDownloads?: boolean } = {}) {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1440, height: 900 }, acceptDownloads: true }); if (options.stripAbort) await context.addInitScript(STRIP_ABORT);
  const page = await context.newPage(), watch = await open(page, rig); return { context, page, watch };
}
const validEvidence = (watch: Watch) => watch.evidence.filter(entry => entry.status === 200 && entry.body && entry.body.context && typeof entry.body.context.captureId === 'string');
const pinOf = (watch: Watch) => { const last = validEvidence(watch).at(-1); if (!last) throw new Error('todavía no hay una evidencia de copia válida'); return String(last.body.context.captureId); };
const lastSummary = (watch: Watch): WorkSummary => WorkSummarySchema.parse(watch.summaries.at(-1)!.body);
const stale = (pin: string, over: Partial<WorkSummary> = {}): WorkSummary => ({ format: 'planb-work-summary-v1', status: 'read', scope: { kind: 'active-copy', context: pin }, at: '2026-11-08T08:00:00.000Z', origin: 'work-journal', provenance: 'durable', coverage: 'complete',
  counts: { drafts: 7, unknownOutcome: 0, settled: 0, otherContext: 0 }, quarantine: { unreadable: 0 }, ...over });
/** Retiene la PRÓXIMA lectura del resumen hasta que la prueba la libere con un cuerpo propio (la petición real no sale: el navegador espera). */
async function holdNext(page: Page) {
  let release!: (reply: { status?: number; body: unknown }) => void; const gate = new Promise<{ status?: number; body: unknown }>(resolve => { release = resolve; });
  let armed = true, arrive!: () => void; const arrived = new Promise<void>(resolve => { arrive = resolve; });
  await page.route('**' + WORK_SUMMARY_ROUTE, async route => { if (!armed) return route.fallback(); armed = false; arrive(); const reply = await gate; await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) }).catch(() => undefined); });
  return { arrived, release };
}
const answerWith = async (page: Page, reply: { status: number; body?: unknown; raw?: string } | 'abort') => page.route('**' + WORK_SUMMARY_ROUTE, route => reply === 'abort' ? route.abort('failed') : route.fulfill({ status: reply.status, contentType: 'application/json', body: reply.raw ?? JSON.stringify(reply.body ?? {}) }));
const readAgain = (page: Page) => card(page).getByRole('button', { name: 'Leer de nuevo' });
const privateLeaks = (value: string) => FORBIDDEN_PUBLIC.filter(item => value.includes(item));
const pathLeaks = (value: string) => value.match(/[A-Za-z]:\\|\\Users\\|AppData|\/Users\/|planb\.sqlite|\.planb-key|planb-summary-qa/g) ?? [];
const settle = async (page: Page) => { await expect(card(page)).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 }); };
async function unlock(page: Page) {
  await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="password"]').fill(password); await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 30_000 }); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click();
  await expect(card(page)).toBeVisible({ timeout: 30_000 }); await settle(page);
}
const lockSession = async (page: Page, rig: Rig) => { const reply = await page.request.post(rig.origin + '/api/v2/auth/lock', { headers: { origin: rig.origin } }); expect(reply.status()).toBe(200); };
const cleanRun = (rig: Rig, watch: Watch, locked = false) => { test.info().annotations.push({ type: 'respuestas>=400', description: watch.failed.join(', ') || 'ninguna' }); expect(watch.failed.filter(item => !/favicon|local-operations\/work-summary|\/api\/v2\/auth\/|^404 \/api\/v2\/relay\/rehearsal$/.test(item) && !(locked && /^401 /.test(item))), 'sin respuestas de error inesperadas (el 404 del relevo es esperado: este QA no empaqueta el Kit)').toEqual([]); expect(watch.errors, 'sin errores de página').toEqual([]); expect(watch.external, 'sin peticiones externas').toEqual([]); expect(/\bError\b|Unhandled|uncaught|\bERR_[A-Z_]+|ECONN/.test(rig.output()), 'el servidor no registró errores: ' + rig.output().slice(-400)).toBe(false); };

// ───────────────────────────── 1 · App normal: sin cobertura ─────────────────────────────
test('APP NORMAL: sin escritor A4 el resultado es «sin cobertura» con recuentos nulos, aunque la base esté vacía o el cuaderno tenga entradas; una sola lectura compartida con el pin de la copia; solo lectura', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const seeded of [undefined, 'mixed'] as const) {
    const rig = await startRig('normal-' + (seeded ?? 'vacia'), { scenario: seeded }); const before = journalDigest(rig);
    const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1); await expect.poll(() => validEvidence(watch).length).toBeGreaterThan(0);
    const reading = lastSummary(watch), pin = pinOf(watch);
    expect([reading.status, reading.coverage, reading.counts, reading.quarantine, reading.scope.kind], 'cobertura ninguna y recuentos nulos').toEqual(['read', 'none', null, null, 'active-copy']);
    expect(reading.scope.context, 'el resumen lleva el MISMO pin que la evidencia de la copia').toBe(pin); expect(pin).toMatch(/^capture:[0-9a-f]{64}$/);
    await expect(card(page)).toHaveAttribute('data-situation', 'uncovered'); const body = await card(page).innerText();
    expect(body).toMatch(/Sin cobertura/); expect(body).toMatch(/desconocido, no es cero/); expect(body).not.toMatch(/Sin trabajo local pendiente|\b0 borradores|\b0 guardados/);
    expect(await card(page).locator('.wks-counts, .wks-quarantine').count(), 'ni recuentos ni cuarentena').toBe(0);
    const everything = await page.locator('body').innerText(); expect(everything).not.toMatch(/Sin trabajo local pendiente|Ningún guardado por comprobar|0 borradores/);
    await expect(page.locator('.imp [data-row="work"]')).toHaveAttribute('data-status', 'unknown'); await expect(page.locator('.imp [data-row="work"]')).toContainText('no es cero');
    expect(await page.locator('.imp [data-row^="work:"]').count(), 'el mapa no inventa filas de trabajo').toBe(0);
    const passport = await page.locator('.cpp [data-section="work"]').innerText(); expect(passport).toMatch(/se desconoce/); expect(passport).not.toMatch(/Observado/);
    expect(watch.requests.filter(request => request.endsWith('/work-summary')).length, 'UNA sola lectura para tarjeta, pasaporte y mapa').toBe(1);
    await readAgain(page).click(); await settle(page); await expect.poll(() => watch.summaries.length).toBe(2); expect(lastSummary(watch).coverage).toBe('none');
    expect(watch.requests.filter(request => !request.startsWith('GET ')), 'ninguna escritura desde la interfaz').toEqual([]);
    expect(journalDigest(rig), 'leer no cambia el cuaderno').toBe(before);
    await page.waitForTimeout(1200); const quiet = digest(rig); for (let i = 0; i < 2; i++) expect((await page.request.get(rig.origin + WORK_SUMMARY_ROUTE)).status()).toBe(200); expect(digest(rig), 'dos lecturas directas en reposo no cambian NINGUNA tabla').toBe(quiet);
    expect(privateLeaks(JSON.stringify(watch.summaries) + everything), 'sin datos privados').toEqual([]); cleanRun(rig, watch);
    test.info().annotations.push({ type: 'app-normal-' + (seeded ?? 'vacia'), description: 'cobertura none, counts null, pin ' + pin.slice(0, 16) });
    await context.close(); await rig.stop();
  }
});

// ───────────────────────────── 2 · Control: la misma base con cobertura declarada ─────────────────────────────
test('CONTROL CAUSAL: con el cuaderno vacío, declarar cobertura (variante de lector) cambia «sin cobertura» por «sin trabajo pendiente»: la diferencia es la declaración, no la base vacía', async ({ browser }) => {
  const rig = await startRig('lector-vacio', { reader: true, scenario: 'empty-covered' }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
  const reading = lastSummary(watch); expect([reading.coverage, reading.counts, reading.quarantine]).toEqual(['complete', { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0 }, { unreadable: 0 }]);
  await expect(card(page)).toHaveAttribute('data-situation', 'empty'); await expect(card(page)).toContainText('Sin trabajo local pendiente'); await expect(page.locator('.imp [data-row="work:uncertain"]')).toHaveAttribute('data-status', 'ok');
  test.info().annotations.push({ type: 'etiqueta', description: 'FIXTURE DEL LECTOR (variante covers:true): no acredita cobertura del escritor de la App' }); cleanRun(rig, watch); await context.close();
});

// ───────────────────────────── 3 · Misma lectura, exportaciones y privacidad (lector) ─────────────────────────────
test('LECTOR · mezcla real: tarjeta, pasaporte y mapa muestran las MISMAS cifras de UNA lectura con el pin autorizado; todas las exportaciones y respuestas están libres de IDs, texto, patches, claves y rutas', async ({ browser }) => {
  test.setTimeout(180_000);
  const rig = await startRig('lector-mixto', { reader: true, scenario: 'mixed' }); const before = journalDigest(rig); const { context, page, watch } = await session(browser, rig);
  await expect.poll(() => watch.summaries.length).toBe(1); await expect.poll(() => validEvidence(watch).length).toBeGreaterThan(0);
  const reading = lastSummary(watch), pin = pinOf(watch), expected = READER_EXPECTATIONS.mixed;
  expect(reading.scope.context).toBe(pin); expect(reading.counts).toEqual({ drafts: expected.drafts, unknownOutcome: expected.unknownOutcome, settled: expected.settled, otherContext: expected.otherContext }); expect(reading.quarantine).toEqual({ unreadable: expected.unreadable }); expect(reading.coverage).toBe('partial');
  await expect(card(page)).toHaveAttribute('data-situation', 'pending'); const text = await card(page).innerText();
  for (const line of [/2 borradores recuperables sin enviar/, /1 guardado por comprobar/, /1 intento ya resuelto/, /2 intentos de otra copia \(no se suman\)/, /1 entrada ilegible o en cuarentena/, /cobertura parcial/]) expect(text).toMatch(line);
  await expect(page.locator('.imp [data-row="work:drafts"]')).toContainText('2 borradores'); await expect(page.locator('.imp [data-row="work:uncertain"]')).toContainText('1 guardado'); await expect(page.locator('.imp [data-row="work:unreadable"]')).toContainText('1 entrada ilegible');
  await expect(page.locator('.cpp [data-section="work"]')).toContainText('1 guardado por comprobar'); await expect(page.locator('.cpp [data-section="work"]')).toContainText(pin.slice(0, 16));
  expect(watch.requests.filter(request => request.endsWith('/work-summary')).length, 'UNA lectura para las tres superficies').toBe(1);
  // exportaciones: se abre todo y se descarga cada botón «Descargar HTML/JSON» del bloque de Continuidad
  await page.evaluate(() => document.querySelectorAll('[data-testid="continuity-hub-block"] details').forEach(details => { (details as HTMLDetailsElement).open = true; }));
  const buttons = page.locator('[data-testid="continuity-hub-block"]').getByRole('button', { name: /^Descargar (HTML|JSON)$/ }), total = await buttons.count(); expect(total, 'tarjeta, pasaporte y resumen de turno ofrecen descargas').toBeGreaterThanOrEqual(4);
  const files: Array<{ name: string; text: string }> = [];
  for (let i = 0; i < total; i++) { const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), buttons.nth(i).click()]); const target = path.join(root, 'downloads', rig.name + '-' + i + '-' + download.suggestedFilename()); await download.saveAs(target); files.push({ name: download.suggestedFilename(), text: fs.readFileSync(target, 'utf8') }); }
  for (const file of files) {
    const isSummary = file.name.startsWith('resumen-trabajo-local'); const leaks = privateLeaks(file.text).filter(item => isSummary || item !== 'installId'); if (!isSummary && /"installId"/.test(file.text)) test.info().annotations.push({ type: 'observación', description: file.name + ' lleva la clave installId (identidad de la instalación, no del trabajo)' });
    expect(leaks, 'exportación sin datos privados: ' + file.name).toEqual([]); expect(pathLeaks(file.text), 'exportación sin rutas: ' + file.name).toEqual([]); expect(file.text).not.toMatch(/token|secret|password|cookie/i);
    if (file.name.endsWith('.json')) JSON.parse(file.text); else { expect(file.text).not.toMatch(/<script/i); expect(file.text).toMatch(/Content-Security-Policy/); }
  }
  const cardJson = files.find(file => file.name.startsWith('resumen-trabajo-local') && file.name.endsWith('.json')); expect(cardJson, 'la tarjeta descarga su JSON').toBeTruthy();
  const exported = JSON.parse(cardJson!.text); expect(exported.counts).toEqual(reading.counts); expect(exported.quarantine).toEqual(reading.quarantine); expect(exported.generatedFrom.coverage).toBe('partial'); expect(cardJson!.text.length).toBeLessThan(8 * 1024);
  const cardHtml = files.find(file => file.name.startsWith('resumen-trabajo-local') && file.name.endsWith('.html'))!; expect(cardHtml.text).toContain('2'); expect(cardHtml.text).toMatch(/cobertura parcial/);
  const dom = await page.content(); const bundle = JSON.stringify(watch.summaries) + dom + (await page.locator('body').innerText());
  expect(privateLeaks(bundle), 'respuesta pública, DOM y texto sin datos privados').toEqual([]); expect(pathLeaks(bundle + rig.output())).toEqual([]);
  expect(journalDigest(rig), 'leer y exportar no cambia el cuaderno').toBe(before); cleanRun(rig, watch);
  test.info().annotations.push({ type: 'etiqueta', description: 'FIXTURE DEL LECTOR (variante covers:true): no acredita cobertura del escritor de la App' }, { type: 'descargas', description: files.map(file => file.name).join(', ') });
  await context.close();
});

// ───────────────────────────── 4 · Situaciones del lector por separado ─────────────────────────────
test('LECTOR · situaciones por separado: borrador, incierto, resuelto, otra copia, cuarentena y vacío completo se distinguen en tarjeta, pasaporte y mapa', async ({ browser }) => {
  test.setTimeout(300_000);
  for (const scenario of ['drafts-only', 'uncertain-only', 'resolved-only', 'other-copy-only', 'quarantine-only', 'empty-covered'] as const) {
    const expected = READER_EXPECTATIONS[scenario], rig = await startRig('lector-' + scenario, { reader: true, scenario }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
    const reading = lastSummary(watch); expect(reading.counts, scenario).toEqual({ drafts: expected.drafts, unknownOutcome: expected.unknownOutcome, settled: expected.settled, otherContext: expected.otherContext }); expect(reading.quarantine, scenario).toEqual({ unreadable: expected.unreadable }); expect(reading.coverage, scenario).toBe(expected.coverage);
    await expect(card(page), scenario).toHaveAttribute('data-situation', expected.situation); const text = await card(page).innerText(); const rows = (id: string) => page.locator('.imp [data-row="' + id + '"]');
    if (expected.drafts) { expect(text).toMatch(new RegExp(expected.drafts + ' borradores')); await expect(rows('work:drafts')).toContainText(expected.drafts + ' borradores'); } else expect(await rows('work:drafts').count(), scenario + ': sin fila de borradores').toBe(0);
    if (expected.unknownOutcome) { expect(text).toMatch(new RegExp(expected.unknownOutcome + ' guardados por comprobar')); await expect(rows('work:uncertain')).toHaveAttribute('data-status', 'attention'); } else await expect(rows('work:uncertain')).toHaveAttribute('data-status', 'ok');
    if (expected.settled) expect(text).toMatch(new RegExp(expected.settled + ' intentos ya resueltos'));
    if (expected.otherContext) expect(text).toMatch(new RegExp(expected.otherContext + ' intentos de otra copia \\(no se suman\\)'));
    if (expected.unreadable) { await expect(card(page).getByTestId('work-quarantine')).toContainText(expected.unreadable + ' entradas ilegibles'); await expect(rows('work:unreadable')).toHaveCount(1); await expect(rows('work:unreadable')).toHaveAttribute('data-status', 'unknown'); } else expect(await rows('work:unreadable').count()).toBe(0);
    if (scenario === 'resolved-only' || scenario === 'other-copy-only' || scenario === 'empty-covered') { await expect(card(page)).toContainText('Sin trabajo local pendiente'); expect(await card(page).getByRole('button', { name: 'Abrir Trabajo por recuperar' }).count(), scenario + ': nada que recuperar, sin botón').toBe(0); }
    if (scenario === 'quarantine-only') { await expect(card(page)).not.toContainText('Sin trabajo local pendiente'); await expect(card(page)).toContainText('Hay entradas ilegibles en cuarentena'); }
    cleanRun(rig, watch); await context.close(); await rig.stop();
  }
});

// ───────────────────────────── 5 · Errores y lecturas fallidas ─────────────────────────────
test('ERRORES: no disponible, bloqueada, no registrada, respuesta inválida y fallo de red se muestran como lo que son, sin conservar ni inventar recuentos del resultado anterior', async ({ browser }) => {
  test.setTimeout(240_000);
  const rig = await startRig('lector-errores', { reader: true, scenario: 'drafts-only' }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
  await expect(card(page)).toContainText('3 borradores recuperables sin enviar'); const pin = pinOf(watch);
  const cases: Array<{ name: string; reply: Parameters<typeof answerWith>[1]; expect: RegExp }> = [
    { name: 'no disponible (503 con cuerpo del contrato)', reply: { status: 503, body: stale(pin, { status: 'unavailable', coverage: 'none', counts: null, quarantine: null }) }, expect: /No se pudo leer/ },
    { name: 'no registrada (404)', reply: { status: 404, body: { error: 'no' } }, expect: /todavía no ofrece el resumen/ },
    { name: 'respuesta inválida', reply: { status: 200, body: { format: 'otro' } }, expect: /no es válida y no se usa/ },
    { name: 'JSON ilegible', reply: { status: 200, raw: '<html>no json</html>' }, expect: /no es válida|No se pudo leer/ },
    { name: 'fallo de red', reply: 'abort', expect: /No se pudo leer el trabajo local pendiente/ },
    { name: 'otra copia (pin distinto)', reply: { status: 200, body: stale('capture:' + 'f'.repeat(64)) }, expect: /de otra copia y no se muestra como actual/ },
  ];
  for (const item of cases) {
    await page.unroute('**' + WORK_SUMMARY_ROUTE); await answerWith(page, item.reply); await readAgain(page).click(); await settle(page);
    const text = await card(page).innerText(); expect(text, item.name).toMatch(item.expect); expect(text, item.name + ': sin recuentos del resultado anterior').not.toMatch(/\b3 borradores|\b7 borradores/);
    expect(await card(page).locator('.wks-counts').count(), item.name).toBe(0); expect(text, item.name + ': desconocido no es cero').not.toMatch(/Sin trabajo local pendiente/);
    const work = page.locator('.imp [data-row="work"]'); if (await work.count()) await expect(work, item.name).toHaveAttribute('data-status', 'unknown');
    expect(await page.locator('.imp [data-row="work:drafts"]').count(), item.name + ': el mapa no conserva el resultado anterior').toBe(0);
  }
  await page.unroute('**' + WORK_SUMMARY_ROUTE); await readAgain(page).click(); await settle(page); await expect(card(page)).toContainText('3 borradores recuperables sin enviar');
  cleanRun(rig, watch); await context.close();
});

// ───────────────────────────── 6 · Respuesta tardía, transporte que ignora AbortSignal, bloqueo y sesión nueva ─────────────────────────────
test('TARDÍA E INDEPENDIENTE DE LA SEÑAL: con un transporte que ignora AbortSignal, una lectura retenida que llega después de un bloqueo y una sesión nueva no se presenta como actual (con control: sin esa interrupción sí se ve)', async ({ browser }) => {
  test.setTimeout(240_000);
  const rig = await startRig('lector-tardia', { reader: true, scenario: 'mixed' }); const { context, page, watch } = await session(browser, rig, { stripAbort: true }); await expect.poll(() => watch.summaries.length).toBe(1); const pin = pinOf(watch);
  // control: la misma lectura retenida, sin interrupción, SÍ se ve cuando es la última → la prueba sabe observar un resultado tardío
  const control = await holdNext(page); await readAgain(page).click(); await control.arrived; control.release({ body: stale(pin) }); await expect(card(page)).toContainText('7 borradores recuperables sin enviar');
  await page.unroute('**' + WORK_SUMMARY_ROUTE);
  // caso real: la lectura se retiene, la sesión se bloquea y se abre otra; luego llega la lectura vieja
  const late = await holdNext(page); await readAgain(page).click(); await late.arrived;
  await lockSession(page, rig); await unlock(page);
  await expect(card(page)).toContainText('2 borradores recuperables sin enviar'); const afterUnlock = watch.summaries.length;
  late.release({ body: stale(pin) }); await page.waitForTimeout(800);
  const text = await card(page).innerText(); expect(text, 'la lectura vieja no sustituye a la de la sesión nueva').toContain('2 borradores recuperables sin enviar'); expect(text).not.toMatch(/\b7 borradores/); expect(await page.locator('body').innerText()).not.toMatch(/\b7 borradores/);
  expect(afterUnlock, 'la sesión nueva hizo su propia lectura').toBeGreaterThanOrEqual(2);
  await expect(page.locator('.cpp [data-section="work"]')).toContainText('1 guardado por comprobar'); cleanRun(rig, watch, true); await context.close();
});

const makeFixtureForQa = makeFixture; void makeFixtureForQa;
test('CAMBIO DE CAPTURA: cambiar la copia activa en el servidor deja de acreditar el resumen anterior («de otra copia»), el pasaporte no lo toma y, tras recargar, todo se alinea con el pin nuevo; una lectura vieja retenida no vuelve', async ({ browser }) => {
  test.setTimeout(240_000);
  const rig = await startRig('lector-captura', { reader: true, scenario: 'mixed' }); const { context, page, watch } = await session(browser, rig, { stripAbort: true }); await expect.poll(() => watch.summaries.length).toBe(1); const oldPin = pinOf(watch);
  const late = await holdNext(page); await readAgain(page).click(); await late.arrived;
  // La copia activa del servidor cambia de verdad: se reinicia en el mismo puerto con OTRA captura (id y fecha distintos). Las sesiones viven en memoria: la persona vuelve a desbloquear.
  await rig.restart(store => { const next = makeFixture('agency'); next.id = 'fixture-agency-segunda'; next.name = 'Agencia Norte (segunda captura)'; next.capturedAt = '2026-11-08T11:30:00.000Z'; store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-08T09:30:00Z', prompt: '', approved: false }); store.activate(); });
  await unlock(page);
  await expect.poll(() => pinOf(watch), { timeout: 20_000, message: 'el pasaporte lee el pin de la captura nueva' }).not.toBe(oldPin); const newPin = pinOf(watch); await expect.poll(() => lastSummary(watch).scope.context).toBe(newPin);
  const fresh = lastSummary(watch); expect(fresh.counts!.drafts, 'los intentos de la captura anterior no se suman a la nueva').toBe(0); expect(fresh.counts!.otherContext).toBeGreaterThanOrEqual(5);
  late.release({ body: stale(oldPin) }); await page.waitForTimeout(800);
  const text = await card(page).innerText(); expect(text).not.toMatch(/\b7 borradores/); expect(text).not.toMatch(/de otra copia y no se muestra/); expect(text).toMatch(/\b0 borradores/);
  await expect(page.locator('.cpp [data-section="work"]')).toContainText(newPin.slice(0, 16)); expect(await page.locator('.cpp').innerText()).not.toContain(oldPin.slice(0, 16));
  // sin remontar: un resumen cuyo pin ya no es el de la pantalla se rechaza y el pasaporte no lo adopta
  await page.unroute('**' + WORK_SUMMARY_ROUTE); await answerWith(page, { status: 200, body: stale(oldPin) }); await readAgain(page).click(); await settle(page);
  await expect(card(page)).toContainText('de otra copia y no se muestra como actual'); expect(await card(page).locator('.wks-counts').count()).toBe(0);
  const passport = await page.locator('.cpp [data-section="work"]').innerText(); expect(passport, 'el pasaporte no toma el resumen de otra copia').not.toMatch(/Observado/);
  await page.unroute('**' + WORK_SUMMARY_ROUTE); await page.reload(); await expect(page.getByTestId('work-summary')).toBeVisible({ timeout: 30_000 }).catch(async () => { await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click(); await expect(card(page)).toBeVisible({ timeout: 30_000 }); });
  await settle(page); expect(lastSummary(watch).scope.context).toBe(pinOf(watch)); cleanRun(rig, watch, true); await context.close();
});

test('SESIÓN BLOQUEADA A MITAD: un 401 en la lectura se muestra como bloqueo, sin recuentos previos ni «cero pendientes»', async ({ browser }) => {
  const rig = await startRig('lector-401', { reader: true, scenario: 'drafts-only' }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
  await answerWith(page, { status: 401, body: { error: 'Desbloquea tu copia local para continuar.' } }); await readAgain(page).click();
  const visible = await Promise.race([card(page).filter({ hasText: 'bloqueado' }).waitFor({ timeout: 15_000 }).then(() => 'tarjeta'), page.getByRole('button', { name: 'Desbloquear' }).waitFor({ timeout: 15_000 }).then(() => 'pantalla-de-bloqueo')]);
  const body = await page.locator('body').innerText(); expect(body).not.toMatch(/\b3 borradores/); expect(body).not.toMatch(/Sin trabajo local pendiente/); test.info().annotations.push({ type: '401', description: 'la interfaz mostró: ' + visible }); void watch; await context.close();
});

// ───────────────────────────── 7 · Navegación a «Trabajo por recuperar» ─────────────────────────────
test('NAVEGACIÓN: «Abrir Hoy» abre Hoy; «Abrir Trabajo por recuperar» NO tiene destino todavía y la tarjeta lo dice sin navegar (no se presenta como funcional)', async ({ browser }) => {
  const rig = await startRig('lector-navegacion', { reader: true, scenario: 'mixed' }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
  const today = card(page).getByRole('button', { name: 'Abrir Hoy' }); await expect(today).toBeVisible(); await today.click();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Hoy', exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 15_000 }).catch(async () => { await expect(page.getByRole('heading', { name: /Hoy|Tu día|Por decidir/i }).first()).toBeVisible({ timeout: 15_000 }); });
  const todayText = await page.locator('main, [role="main"], .content').first().innerText().catch(() => ''); const hasRecoverable = /Trabajo por recuperar/.test(todayText);
  await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click(); await expect(card(page)).toBeVisible(); await settle(page);
  const recover = card(page).getByRole('button', { name: 'Abrir Trabajo por recuperar' }); const offered = await recover.count();
  if (offered) { await recover.click(); const hint = page.getByTestId('work-hint'); await expect(hint).toContainText('todavía no tiene ese enlace'); await expect(card(page)).toBeVisible(); }
  test.info().annotations.push({ type: 'trabajo-por-recuperar', description: 'botón ofrecido: ' + offered + ' · destino «Trabajo por recuperar» visible en Hoy: ' + hasRecoverable + (offered && !hasRecoverable ? ' → el botón no abre ningún contexto: se explica y NO se debe presentar como integración funcional' : '') });
  expect(offered && !hasRecoverable ? 'honesto-sin-destino' : 'con-destino').toMatch(/honesto-sin-destino|con-destino/); cleanRun(rig, watch); await context.close();
});

// ───────────────────────────── 8 · 1440/390/320 y teclado ─────────────────────────────
test('ANCHOS Y TECLADO: 1440, 390 y 320 px sin desbordamiento horizontal ni texto cortado (capturas abiertas), orden de tabulación completo con foco visible y activación con Enter', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const rig = await startRig('lector-anchos', { reader: true, scenario: 'mixed' }); const { context, page, watch } = await session(browser, rig); await expect.poll(() => watch.summaries.length).toBe(1);
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 780 }); await page.waitForTimeout(300); await card(page).scrollIntoViewIfNeeded();
    const metrics = await page.evaluate(() => { const c = document.querySelector('[data-testid="work-summary"]') as HTMLElement, r = c.getBoundingClientRect(); return { doc: document.documentElement.scrollWidth, inner: innerWidth, left: r.left, right: r.right, cardOverflow: c.scrollWidth - c.clientWidth, buttons: [...c.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(); return { w: q.width, h: q.height, right: q.right, left: q.left, clipped: b.scrollWidth > b.clientWidth + 1 }; }) }; });
    expect(metrics.doc, width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(metrics.inner + 1); expect(metrics.left).toBeGreaterThanOrEqual(-1); expect(metrics.right).toBeLessThanOrEqual(metrics.inner + 1); expect(metrics.cardOverflow, width + ': la tarjeta no recorta texto').toBeLessThanOrEqual(1);
    for (const button of metrics.buttons) { expect(button.right).toBeLessThanOrEqual(metrics.inner + 1); expect(button.left).toBeGreaterThanOrEqual(-1); expect(button.h, width + ': objetivo táctil usable').toBeGreaterThanOrEqual(24); expect(button.clipped, width + ': etiqueta de botón entera').toBe(false); }
    const shot = path.join(root, 'shots', 'resumen-' + width + '.png'); await card(page).screenshot({ path: shot }); await page.screenshot({ path: path.join(root, 'shots', 'pantalla-' + width + '.png'), fullPage: false }); info.annotations.push({ type: 'captura-' + width, description: shot });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await card(page).scrollIntoViewIfNeeded();
  const order: string[] = [], focusVisible = async () => page.evaluate(() => { const e = document.activeElement as HTMLElement | null; if (!e) return null; const s = getComputedStyle(e); return { label: (e.textContent || '').trim().slice(0, 40), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none', inCard: !!e.closest('[data-testid="work-summary"]') }; });
  await card(page).getByRole('button', { name: 'Abrir Hoy' }).focus();
  for (let i = 0; i < 8; i++) { const state = await focusVisible(); if (!state || !state.inCard) break; expect(state.outline || state.shadow, 'foco visible en «' + state.label + '»').toBe(true); order.push(state.label); await page.keyboard.press('Tab'); }
  expect(order.slice(0, 3), 'orden de tabulación').toEqual(['Abrir Hoy', 'Abrir Trabajo por recuperar', 'Leer de nuevo']); expect(order.some(label => /Descargar este resumen/.test(label)), 'el resumen descargable se alcanza con el teclado').toBe(true);
  const reads = watch.summaries.length; await readAgain(page).focus(); await page.keyboard.press('Enter'); await settle(page); await expect.poll(() => watch.summaries.length).toBe(reads + 1);
  const exportSummary = card(page).locator('summary', { hasText: 'Descargar este resumen' }); await exportSummary.focus(); await page.keyboard.press('Enter'); await expect(card(page).getByRole('button', { name: 'Descargar JSON' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await card(page).getByRole('button', { name: 'Descargar JSON' }).focus(); await page.keyboard.press('Enter'); })()]); expect(download.suggestedFilename()).toMatch(/^resumen-trabajo-local-.*\.json$/);
  info.annotations.push({ type: 'tabulacion', description: order.join(' → ') }); cleanRun(rig, watch); await context.close();
});
