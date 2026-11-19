import { test, expect, type Page } from '@playwright/test';
import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { build as bundle } from 'esbuild';
import { createServer } from 'node:http';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../server/store.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
// @ts-expect-error módulo .mjs sin tipos
import { buildRelayKit } from '../../scripts/build-relay-kit.mjs';

process.env.NODE_ENV = 'test';
// UNIDAD 254 · ENSAYO DE RELEVO EMPAQUETADO en una App compilada que arranca en una CARPETA NUEVA FUERA DEL REPOSITORIO (sin tests/.tmp, sin src, sin node_modules propios: el servidor va empaquetado entero y el Kit trae su
// propio node_modules mínimo). Servidor = `server/main.ts` real con el montaje de relevo integrado.
// Interfaz = la real: App.tsx monta Continuidad y `main` registra evidencia y relevo. Kit REAL con API 216 R4. Mide procesos vivos del Kit, estados HTTP, archivos, peticiones externas y cambios del CRM.
const repo = process.cwd(), fresh = path.join(os.tmpdir(), 'planb-pack254-' + randomUUID().slice(0, 8)), proj = path.join(repo, 'tests', '.tmp', 'pack254-' + randomUUID().slice(0, 8));
const password = 'contraseña-ficticia-254';
const MAIN_ANCHOR = 'mountHubspotReadCheck(app, store, security);';
let child: ChildProcess | undefined, base = '', port = '', external = 0;
const dataDir = path.join(fresh, 'data'), runs = path.join(dataDir, 'relay-rehearsals');
const envFor = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'].includes(name.toLowerCase())));

test.beforeAll(async () => {
  fs.mkdirSync(fresh, { recursive: true }); fs.mkdirSync(proj, { recursive: true });
  // 1 · Interfaz: la de la candidata aceptada (sin parche de App: ya integrado).
  for (const dir of ['src', 'shared', 'public']) fs.cpSync(path.join(repo, dir), path.join(proj, dir), { recursive: true });
  for (const file of ['index.html', 'package.json']) fs.copyFileSync(path.join(repo, file), path.join(proj, file));
  const app = fs.readFileSync(path.join(proj, 'src', 'App.tsx'), 'utf8');
  for (const marker of ["setIntegrationsFrom('continuity')", 'returnedFrom', '<ContinuityHome']) expect(app.includes(marker), 'App.tsx ya integra la navegación de Continuidad: ' + marker).toBe(true);
  await viteBuild({ root: proj, configFile: false, envDir: path.join(proj, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(fresh, 'dist'), emptyOutDir: false, minify: false } });
  // 2 · Servidor: punto de entrada normal, sin proyectar ni sustituir el registro.
  const main = fs.readFileSync(path.join(repo, 'server', 'main.ts'), 'utf8');
  expect(main.split(MAIN_ANCHOR).length - 1, 'ancla de main.ts').toBe(1);
  expect(main.split('registerContinuityEvidenceApi(app, store);').length - 1, 'main registra la evidencia').toBe(1);
  expect(main.split('mountRelayRehearsal(app, store, security);').length - 1, 'main registra el relevo una sola vez').toBe(1);
  await bundle({ entryPoints: [path.join(repo, 'server', 'main.ts')], outfile: path.join(fresh, 'build', 'server.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  // 3 · Paquete del Kit junto al servidor (kit/), como lo encontraría `mountRelayRehearsal` por defecto.
  buildRelayKit({ repo, out: path.join(fresh, 'kit') });
  fs.copyFileSync(path.join(repo, 'scripts', 'block-external.cjs'), path.join(fresh, 'build', 'block-external.cjs'));   // el servidor arranca con el bloqueo de red aunque falte el paquete
  // 4 · Datos: una copia ficticia activa y clave de prueba; nada más.
  fs.mkdirSync(dataDir); const key = randomBytes(32); fs.writeFileSync(path.join(dataDir, '.planb-key'), JSON.stringify({ kind: 'test', data: key.toString('base64') }), { flag: 'wx' });
  const store = new Store(path.join(dataDir, 'planb.sqlite'));
  try { const snapshot = makeFixture('agency'); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false }); store.activate(); } finally { store.close(); }
});
test.afterEach(async () => { await stop(); });
test.afterAll(async () => {
  await stop(); if (process.env.PLANB_KEEP254) return;
  // Limpieza propia: primero se retiran las uniones de node_modules de las carpetas de ejecución (sin seguirlas) y luego las carpetas de esta prueba, que son nuevas y están bajo nombres propios.
  try { if (fs.existsSync(runs)) for (const name of fs.readdirSync(runs)) { const link = path.join(runs, name, 'node_modules'); try { if (fs.lstatSync(link).isSymbolicLink()) fs.rmSync(link, { force: true }); } catch { /* sin enlace */ } } fs.rmSync(fresh, { recursive: true, force: true }); fs.rmSync(proj, { recursive: true, force: true }); } catch { /* se conserva si no se pudo */ }
});

async function start() {
  if (!port) { const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); port = String((probe.address() as { port: number }).port); await new Promise<void>(resolve => probe.close(() => resolve())); }
  child = spawn(process.execPath, ['--require', path.join(fresh, 'build', 'block-external.cjs'), path.join(fresh, 'build', 'server.mjs')], { cwd: fresh, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...envFor(), NODE_ENV: 'test', PLANB_PORT: port, PLANB_DATA_DIR: dataDir } });
  let output = ''; await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('main no arrancó: ' + output)), 60_000);
    child!.stdout!.on('data', value => { output += String(value); if (output.includes('Abre http://127.0.0.1:' + port)) { clearTimeout(timer); resolve(); } }); child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('main terminó ' + code + ': ' + output)); });
  });
  base = 'http://127.0.0.1:' + port;
}
async function stop() { if (child && child.exitCode === null && child.signalCode === null) { const current = child; const closed = new Promise<void>(resolve => current.once('close', () => resolve())); current.kill(); await closed; } child = undefined; }
/** Procesos VIVOS del Kit (hijo y destino): por la carpeta propia de cada ejecución en su línea de órdenes, no por el nombre. */
function kitProcesses(): number[] {
  const script = "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*" + runs.replace(/'/g, "''") + "*' } | ForEach-Object { $_.ProcessId }";
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map(line => Number(line.trim())).filter(pid => Number.isInteger(pid) && pid > 0);
}
const until = async <T,>(probe: () => T | null | false | Promise<T | null | false>, ms: number, label: string): Promise<T> => { const end = Date.now() + ms; for (;;) { const value = await probe(); if (value) return value; if (Date.now() > end) throw new Error('Tiempo agotado: ' + label); await new Promise(r => setTimeout(r, 300)); } };
const runDirs = () => fs.existsSync(runs) ? fs.readdirSync(runs).filter(name => name.startsWith('run-')) : [];
const hub = (page: Page) => page.locator('.cph'), message = (page: Page) => page.getByTestId('hub-message'), src = (page: Page, key: string) => page.locator('.cph-sources [data-source="' + key + '"]');
async function login(page: Page) {
  await page.route('**/*', route => { if (new URL(route.request().url()).origin === base) return route.fallback(); external++; return route.abort(); });
  const status = await page.request.get(base + '/api/v2/auth/status').then(r => r.json()) as { configured: boolean };
  const reply = status.configured ? await page.request.post(base + '/api/v2/auth/login', { data: { password }, headers: { origin: base } }) : await page.request.post(base + '/api/v2/auth/setup', { data: { password }, headers: { origin: base } }); expect(reply.ok()).toBe(true);
}
async function openContinuity(page: Page) {
  await page.goto(base); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo'); await page.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click();
  await expect(page.getByTestId('continuity-hub-block')).toBeVisible(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}
const openMore = async (page: Page, summary: string) => { const details = page.locator('.imp details', { has: page.locator('summary', { hasText: summary }) }).first(); if (await details.count() && !(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click(); };
const rehearsalButton = async (page: Page) => { await openMore(page, 'Sin comprobar'); await openMore(page, 'Sin incidencia'); return page.locator('.imp [data-row="recovery:rehearsal"]').getByRole('button', { name: 'Ensayar un relevo' }); };
const relayState = (page: Page) => page.request.get(base + '/api/v2/relay/rehearsal').then(async r => ({ status: r.status(), body: await r.json() as { last: null | { outcome: string; createCalls: number; duplicates: number; wrongIdRejected: boolean; reconciledOnce: boolean; capsule: { sha16: string } | null }; running: unknown; stopping?: { reason: string } | null; issue: string | null } }));
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('ARRANQUE EN CARPETA NUEVA: sin árbol de fuentes ni node_modules propios, el paquete se verifica y el ensayo queda registrado con sesión, Host y Origin; en reposo hay cero procesos del Kit', async ({ page }) => {
  await start(); await login(page);
  expect(fs.readdirSync(fresh).sort()).toEqual(['build', 'data', 'dist', 'kit']);                                    // sin tests/, src/, node_modules/ ni .tmp
  const bundleText = fs.readFileSync(path.join(fresh, 'build', 'server.mjs'), 'utf8'); for (const spelling of [repo, repo.replace(/\\/g, '/')]) expect(bundleText.includes(spelling), 'el servidor empaquetado no referencia el repositorio').toBe(false);
  expect(fs.existsSync(path.join(fresh, 'node_modules'))).toBe(false); const relation = path.relative(repo, fresh); expect(path.isAbsolute(relation) || relation.startsWith('..'), 'la instalación está fuera del repositorio').toBe(true);
  const manifest = JSON.parse(fs.readFileSync(path.join(fresh, 'kit', 'kit-manifest.json'), 'utf8')); expect(manifest.format).toBe('planb-relay-kit-v2'); expect(Object.keys(manifest.code).some((file: string) => file.startsWith('tests/'))).toBe(false);
  const state = await relayState(page); expect(state.status).toBe(200); expect(state.body.last).toBeNull(); expect(state.body.running).toBeNull();
  const anonymous = await fetch(base + '/api/v2/relay/rehearsal'); expect(anonymous.status).toBe(401);                                                        // sin sesión
  const hostile = await fetch(base + '/api/v2/relay/rehearsal', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example', host: '127.0.0.1:' + port }, body: JSON.stringify({ fiction: true }) }); expect(hostile.status).toBeGreaterThanOrEqual(400);
  expect(kitProcesses()).toEqual([]); expect(runDirs()).toEqual([]);
});

test('PAQUETE AUSENTE, ALTERADO O ENLAZADO: el ensayo no se registra (404) y el resto de la App sigue; restaurado, vuelve a registrarse', async ({ page }) => {
  test.setTimeout(300_000); const kit = path.join(fresh, 'kit'), relay = () => page.request.get(base + '/api/v2/relay/rehearsal').then(r => r.status());
  const cycle = async (label: string, mutate: () => () => void, expected: number) => {
    const restore = mutate(); try { await start(); await login(page); expect(await relay(), label).toBe(expected); expect((await page.request.get(base + '/api/v2/auth/status')).status(), label + ': el resto de la App sigue').toBe(200); } finally { await stop(); restore(); }
  };
  await cycle('paquete ausente', () => { const away = path.join(fresh, 'kit-ausente'); fs.renameSync(kit, away); return () => fs.renameSync(away, kit); }, 404);
  await cycle('paquete alterado (mismo tamaño)', () => { const f = path.join(kit, 'node_modules', 'tsx', 'package.json'), original = fs.readFileSync(f), altered = Buffer.from(original), at = altered.findIndex(byte => byte >= 0x61 && byte <= 0x7a); altered[at] = altered[at] === 0x61 ? 0x62 : 0x61; fs.writeFileSync(f, altered); return () => fs.writeFileSync(f, original); }, 404);
  await cycle('carpeta enlazada con contenido idéntico', () => { const away = path.join(fresh, 'server-real'); fs.renameSync(path.join(kit, 'server'), away); fs.symlinkSync(away, path.join(kit, 'server'), process.platform === 'win32' ? 'junction' : 'dir'); return () => { fs.rmSync(path.join(kit, 'server'), { force: true }); fs.renameSync(away, path.join(kit, 'server')); }; }, 404);
  await cycle('paquete íntegro', () => () => undefined, 200);
});

test('ENSAYO REAL desde Continuidad: cancelar el consentimiento no ejecuta; cancelación a mitad con procesos reales medidos; segunda pestaña; ensayo completo (un create, ID equivocado rechazado); descargas; reinicio con el resultado persistido; ficticio ≠ copia activa; 1440/390/320', async ({ page, context }, ti) => {
  test.setTimeout(900_000); await start(); await login(page); const posts: string[] = []; page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/v2/relay/rehearsal')) posts.push(request.url()); });
  await openContinuity(page); await expect(src(page, 'relay')).toHaveAttribute('data-state', 'read'); await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read'); await expect(page.locator('.cpp [data-section="copy"]')).toContainText('Copia local capturada');
  // 1 · cancelar el consentimiento: cero ejecución
  await (await rehearsalButton(page)).click(); const confirm = page.getByTestId('confirm-relay'); await expect(confirm).toContainText('datos ficticios'); await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(posts).toEqual([]); expect(kitProcesses()).toEqual([]); expect(runDirs()).toEqual([]);
  // 2 · iniciar y cancelar con el destino ya abierto en otro proceso
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(page.getByTestId('relay-live')).toBeVisible({ timeout: 20_000 }); const alive = await until(() => { const list = kitProcesses(); return list.length >= 2 ? list : false; }, 150_000, 'hijo y destino del Kit vivos'); ti.annotations.push({ type: 'procesos-en-vivo', description: String(alive.length) });
  // 2b · segunda pestaña: ve el ensayo en curso, no puede iniciar otro (UI y servidor) y no cambia los procesos
  const second = await context.newPage(); await second.route('**/*', route => { if (new URL(route.request().url()).origin === base) return route.fallback(); external++; return route.abort(); });
  await second.goto(base); await second.locator('.sidebar').getByRole('button', { name: 'Continuidad', exact: true }).click(); await expect(second.getByTestId('relay-live')).toBeVisible({ timeout: 30_000 });
  const direct = await second.request.post(base + '/api/v2/relay/rehearsal', { data: { fiction: true }, headers: { origin: base } }); expect(direct.status()).toBe(202); expect((await direct.json()).issue).toBe('ALREADY_RUNNING'); expect(runDirs().length, 'una sola carpeta de ejecución: el segundo POST no arrancó otro ejecutor').toBe(1);
  await second.close();
  await page.getByTestId('relay-live').getByRole('button', { name: 'Cancelar el ensayo' }).click();
  await expect(page.getByTestId('relay-stopping')).toContainText('Se pidió detener el ensayo (cancelación)', { timeout: 20_000 }); await expect(message(page)).toContainText('resultado de ese ensayo se descartó', { timeout: 20_000 });
  const stopping = await relayState(page); expect(stopping.body.last).toBeNull();                                          // nada publicado
  if (kitProcesses().length > 0) { const again = await page.request.post(base + '/api/v2/relay/rehearsal', { data: { fiction: true }, headers: { origin: base } }); expect(again.status()).toBe(409); expect((await again.json()).issue).toBe('STOPPING'); }   // mientras el árbol siga vivo no se admite otro
  await until(() => kitProcesses().length === 0, 120_000, 'cero procesos del Kit tras cancelar'); await expect(page.getByTestId('relay-stopping')).toHaveCount(0, { timeout: 30_000 });
  const partial = runDirs(); expect(partial.length).toBe(1); expect(JSON.parse(fs.readFileSync(path.join(runs, partial[0]!, '.planb-relay-run.json'), 'utf8')).status).toBe('partial');   // lo incierto se conserva con marca
  expect((await relayState(page)).body.last).toBeNull();
  // 3 · ensayo completo real
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(message(page)).toContainText('Ensayo completado con datos ficticios', { timeout: 240_000 }); await until(() => kitProcesses().length === 0, 60_000, 'cero procesos tras completar');
  const done = await relayState(page); expect(done.body.last).toMatchObject({ outcome: 'completed', createCalls: 1, duplicates: 0, wrongIdRejected: true, reconciledOnce: true }); const sha16 = done.body.last!.capsule!.sha16;
  expect(runDirs()).toEqual(partial);                                                                                      // el completado retiró su carpeta; solo queda el parcial conservado
  await expect(page.locator('.cpp [data-section="rehearsal"]')).toContainText('se concilió una sola operación sin duplicar'); await expect(page.locator('.cpp [data-section="unproven"]')).toContainText('ESTA copia activa');
  await openMore(page, 'Sin incidencia'); await expect(page.locator('.imp [data-row="recovery:practice"]')).toContainText('no acredita la recuperación de la copia activa');
  // 4 · descargas (HTML y JSON) del pasaporte y del resumen de turno: nombre y tipo, alcance y sin rutas ni claves
  const grab = async (name: string, within: string) => { const details = page.locator(within + ' details', { hasText: 'Exportar' }).first(); const prov = page.locator(within + ' .cpp-prov, ' + within + ' .imp-export').first(); if (!(await prov.evaluate(element => (element as HTMLDetailsElement).open))) await prov.locator('summary').click(); void details; const [download] = await Promise.all([page.waitForEvent('download'), prov.getByRole('button', { name }).click()]); const file = path.join(fresh, download.suggestedFilename()); await download.saveAs(file); return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') }; };
  const files = [await grab('Descargar JSON', '.cpp'), await grab('Descargar HTML', '.cpp'), await grab('Descargar JSON', '.imp'), await grab('Descargar HTML', '.imp')];
  expect(files.map(f => f.name.replace(/\d{4}-\d{2}-\d{2}/, 'DIA'))).toEqual(['pasaporte-continuidad-DIA.json', 'pasaporte-continuidad-DIA.html', 'resumen-de-turno-DIA.json', 'resumen-de-turno-DIA.html']);
  for (const f of files) { expect(f.text).not.toContain(fresh); expect(f.text).not.toContain(repo); expect(f.text).not.toMatch(/run-[0-9a-f]{8}-|contraseña-ficticia|planb\.sqlite/); expect(f.text).not.toMatch(/restaurable|cápsula cifrada de recuperación/i); }
  expect(JSON.parse(files[0]!.text).format).toBe('planb-continuity-passport-v1'); expect(JSON.parse(files[2]!.text).format).toBe('planb-impact-map-v1'); expect(files[1]!.text).toMatch(/Content-Security-Policy[^>]*default-src 'none'/); expect(files[3]!.text).not.toMatch(/<script/i);
  expect(files[0]!.text).toContain('datos ficticios');
  // 5 · reinicio de main: el resultado persiste y no se acredita la copia activa
  await stop(); expect(kitProcesses()).toEqual([]); await start(); await login(page); await openContinuity(page);
  const after = await relayState(page); expect(after.body.last).toMatchObject({ outcome: 'completed', createCalls: 1, duplicates: 0 }); expect(after.body.last!.capsule!.sha16).toBe(sha16);
  await expect(page.locator('.cpp [data-section="rehearsal"]')).toContainText('completado'); await expect(page.locator('.cpp [data-section="rehearsal"]')).toContainText('datos ficticios');
  await openMore(page, 'Sin incidencia'); await expect(page.locator('.imp [data-row="recovery:practice"]')).toContainText('no acredita la recuperación de la copia activa');
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await overflow(page)).toBe(true); const f = path.join(fresh, 'relevo-' + width + '.png'); await page.locator('.cpp [data-section="rehearsal"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: f }); await ti.attach('relevo-' + width, { path: f, contentType: 'image/png' }); }
  // 6 · medidas finales
  expect(posts).toHaveLength(2); expect(external).toBe(0); expect(kitProcesses()).toEqual([]);
  const state = await page.request.get(base + '/api/v2/state').then(r => r.json()) as { changes: number }; expect(state.changes).toBe(0);
  const entries = fs.readdirSync(dataDir); ti.annotations.push({ type: 'archivos-de-datos', description: entries.join(', ') }); expect(entries.filter(name => !/^(.planb-key|.endpoint.json|planb.sqlite.*|relay-rehearsals|.*lock.*|.*instance.*)$/i.test(name))).toEqual([]);
});
