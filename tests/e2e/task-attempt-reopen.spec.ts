import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// REABRIR EL INTENTO EXACTO EN LA APP REAL (unidad 219, sobre la plantilla de U2-171). La App se compila desde una COPIA CONGELADA de los fuentes del cliente (manifiesto de hashes en <root>/manifest.json; si un fuente
// cambia mientras se copia, la prueba se niega a continuar) y se sirve desde el servidor REAL (createBaseApp, SQLite en memoria, 127.0.0.1, red externa bloqueada).
// Los fallos se inyectan en el navegador con page.route sobre ese servidor real: el servidor APLICA el PATCH y se retiene o pierde la RESPUESTA, o se sustituye la
// respuesta por un 401/404/409/422 sin que el PATCH llegue. Un arnés propio solo acreditaría lo que contiene: aquí todo pasa por la App, la barra lateral y Hoy reales.
// PLANB_U2_PRE=1 compila la App con App.tsx y LocalOperations.tsx ANTERIORES a U2 (contraprueba: estas pruebas deben fallar por falta de seguimiento).
const repo = process.cwd();
let root = path.resolve(process.env.PLANB_U219_ROOT ?? path.join(repo, 'tests', '.tmp', 'u219-run-' + randomUUID().slice(0, 8)));
const PRE = process.env.PLANB_U2_PRE === '1', PRE_DIR = path.resolve(process.env.PLANB_U2_PRE_DIR ?? path.join(repo, 'tests', '.tmp', 'u2-171', 'pre'));
const PASSWORD = 'ficticia-u2-171-solo-prueba';
const absolute = (name: string) => JSON.stringify(pathToFileURL(path.join(repo, name)).href);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SERVER = `import { createBaseApp } from ${absolute('server/app.ts')};
import { makeFixture, makeDemoSpec } from ${absolute('shared/fixtures.ts')};
const { app, store } = await createBaseApp({ root: process.env.ROOT!, dbPath: ':memory:', staticDir: process.env.ROOT! + '/dist', taskRevisions: true });
let patches = 0; app.addHook('onRequest', async request => { if (request.method === 'PATCH') patches++; });
const seed = () => { const snapshot: any = makeFixture('agency');
  for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.status = 'pending'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
  return snapshot; };
const gen = (snapshot: any) => store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false });
const first = seed(); store.importSnapshot(first); gen(first); store.activate();
app.post('/__h/counts', async () => ({ patches, changes: store.changes().map(c => ({ id: c.recordId, after: c.after.values })), task2: store.record('tasks', 'task-2')?.values ?? null, task3: store.record('tasks', 'task-3')?.values ?? null }));
app.post('/__h/edit', async request => { const b = request.body as any; store.saveRecord('tasks', b.values, b.id); return { ok: true }; });
app.post('/__h/swap', async () => { const next: any = makeFixture('distribution'); next.id = 'capture-otra'; next.name = 'Otra captura'; store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; });
await app.listen({ host: '127.0.0.1', port: 0 }); console.log('LISTEN ' + (app.server.address() as { port: number }).port);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
`;
/** Mutaciones del control causal (PLANB_U2_MUTATE=<nombre>): cada una quita UNA garantía del montaje y debe hacer fallar la prueba que la protege. */
const MUTATIONS: Record<string, { file: string; from: string; to: string }> = {
  'no-adoption': { file: 'LocalTaskFocus.tsx', from: "if (!outcomes || adoptAttemptId === undefined || view.k !== 'edit'", to: "if (true || !outcomes || adoptAttemptId === undefined || view.k !== 'edit'" },
  'adopt-other-copy': { file: '../shared/task-attempt-adoption.ts', from: 'if (contextKey(op.context) !== here) return', to: 'if (false) return' },
  'panel-without-attempt': { file: 'TaskSaveOutcomes.tsx', from: 'onClick={() => onOpenTask(op.taskId, op.attemptId)}', to: 'onClick={() => onOpenTask(op.taskId)}' },
  'dismiss-adopted': { file: 'LocalTaskFocus.tsx', from: 'if (adoptedRef.current !== op.attemptId) outcomes.dismiss(op.attemptId);', to: 'outcomes.dismiss(op.attemptId);' },
  'request-drops-attempt': { file: 'App.tsx', from: 'attemptId:attemptId??null,nonce', to: 'attemptId:null,nonce' },
};
let child: ChildProcess | undefined, origin = '';

test.beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  if (fs.existsSync(path.join(root, 'frozen'))) root = fs.mkdtempSync(path.join(root, 'worker-'));
  const frozen = path.join(root, 'frozen');
  for (const entry of ['src', 'shared', 'public']) fs.cpSync(path.join(repo, entry), path.join(frozen, entry), { recursive: true });
  for (const file of ['index.html', 'package.json', 'tsconfig.json']) fs.copyFileSync(path.join(repo, file), path.join(frozen, file));
  const manifest: Record<string, string> = {};
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(tsx?|css|html|json)$/.test(entry.name)) manifest[path.relative(frozen, full).replace(/\\/g, '/')] = sha(full); } };
  walk(path.join(frozen, 'src')); walk(path.join(frozen, 'shared'));
  for (const [file, hash] of Object.entries(manifest)) if (sha(path.join(repo, file)) !== hash) throw new Error('El fuente cambió durante la congelación: ' + file + '. Repite la prueba.');
  if (PRE) for (const file of ['App.tsx', 'LocalOperations.tsx']) fs.copyFileSync(path.join(PRE_DIR, file), path.join(frozen, 'src', file));   // montaje anterior a U2
  // Solo para el control causal: una mutación mínima y nombrada SOBRE LA COPIA congelada (nunca sobre el repositorio). Si el ancla ya no existe, la prueba se niega a continuar.
  const mutation = MUTATIONS[process.env.PLANB_U2_MUTATE ?? ''];
  if (mutation) { const file = path.join(frozen, 'src', mutation.file), source = fs.readFileSync(file, 'utf8'); if (!source.includes(mutation.from)) throw new Error('El ancla de la mutación ya no existe: ' + process.env.PLANB_U2_MUTATE); fs.writeFileSync(file, source.replace(mutation.from, mutation.to)); }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ frozenAt: new Date().toISOString(), pre: PRE, appTsx: sha(path.join(frozen, 'src', 'App.tsx')), localOperationsTsx: sha(path.join(frozen, 'src', 'LocalOperations.tsx')), host: manifest['src/TaskOutcomesHost.tsx'], files: manifest }, null, 1));
  // PLANB_U2_DEV=1: compilación de DESARROLLO (React en modo estricto simula desmontar y montar los efectos): el propietario no debe quedar cerrado tras ese doble montaje.
  await build({ root: frozen, configFile: false, envDir: path.join(root, 'empty-env'), base: './', mode: process.env.PLANB_U2_DEV === '1' ? 'development' : 'production', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: true, minify: false } });
  fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
});
async function start(page: Page, options: { protectedSession?: boolean } = {}) {
  child = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: repo, windowsHide: true, env: { ...process.env, ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó: ' + output)), 40_000);
    child!.stdout!.on('data', value => { output += String(value); const match = /LISTEN (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó con código ' + code + ' ' + output)); });
  });
  origin = 'http://127.0.0.1:' + port;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  if (options.protectedSession) expect((await page.request.post(origin + '/api/v2/auth/setup', { data: { password: PASSWORD } })).ok()).toBe(true);
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
  if (child && child.exitCode === null && child.signalCode === null) { const stopped = new Promise<void>(resolve => child!.once('close', () => resolve())); child.kill(); await stopped; } child = undefined;
});

const counts = async () => (await (await fetch(origin + '/__h/counts', { method: 'POST' })).json()) as { patches: number; changes: { id: string; after: Record<string, unknown> }[]; task2: Record<string, unknown> | null; task3: Record<string, unknown> | null };
const call = async (route: string, body: object) => (await fetch(origin + '/__h/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
void call;
const nav = (page: Page, name: string) => page.locator('.sidebar').getByRole('button', { name, exact: true });
const taskButton = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir Llamar a Ana (ID ' + id + ')', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Llamar a Ana' });
const surface = (page: Page) => page.locator('.toh');
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function openToday(page: Page, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await nav(page, 'Hoy').click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(page.locator('.lop-tasks li').first()).toBeVisible();
}
/** El servidor APLICA el PATCH; la respuesta se retiene y luego se pierde (`lose`) o se entrega. */
async function holdAck(page: Page, lose: boolean) {
  const barrier = gate(); let produced = 0;
  await page.route('**/api/v7/task-revision/task-2', async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; }
    produced++; await barrier.promise; if (lose) await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined);
  });
  return { release: barrier.release, produced: () => produced };
}
async function completeTask2(page: Page) {
  await taskButton(page, 'task-2').focus(); await page.keyboard.press('Enter');
  await expect(dialog(page)).toContainText('task-2');
  await dialog(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed');
}
const saveButton = (page: Page) => dialog(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
/** El detalle se abre solo cuando aparece algo que necesita atención: se asegura que quede ABIERTO sin cerrarlo por error. */
const openDetail = async (page: Page) => { const toggle = surface(page).getByRole('button', { name: /Ver detalle|Ocultar detalle/ }); if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); };
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = async (page: Page, name: string, testInfo: { attach: (n: string, o: { path: string; contentType: string }) => Promise<void> }) => { if (await surface(page).count()) await surface(page).scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => undefined); const file = path.join(root, name + '.png'); await page.screenshot({ path: file }); await testInfo.attach(name, { path: file, contentType: 'image/png' }); };
/** Cierra la ficha con Escape (con un intento en vuelo o incierto no pide descartar: el gestor es el dueño). */
async function leave(page: Page) { await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); }
/** Igual que holdAck pero para cualquier tarea (el servidor APLICA; la respuesta se retiene y se pierde o se entrega). */
async function holdAckFor(page: Page, id: string, lose: boolean) {
  const barrier = gate(); let produced = 0;
  await page.route('**/api/v7/task-revision/' + id, async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; }
    produced++; await barrier.promise; if (lose) await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined);
  });
  return { release: barrier.release, produced: () => produced };
}
async function completeTask(page: Page, id: string) {
  await taskButton(page, id).focus(); await page.keyboard.press('Enter'); await expect(dialog(page)).toContainText(id);
  await dialog(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed');
}
const panelItem = (page: Page, id: string) => surface(page).locator('.ltso-item[data-task="' + id + '"]');
const anyDialog = (page: Page) => page.getByRole('dialog');
const leaveAny = async (page: Page) => { await page.keyboard.press('Escape'); await expect(anyDialog(page)).toHaveCount(0); };
const openFromPanel = async (page: Page, id: string) => { await openDetail(page); await panelItem(page, id).getByRole('button', { name: /^Abrir la tarea: / }).click(); await expect(anyDialog(page)).toBeVisible(); };


test('UN INCIERTO SE RETOMA: guardo, cierro, navego, «Abrir la tarea» desde el panel → la ficha muestra ESE intento (incierto), sin PATCH y sin formulario de reenvío; comprobar solo lee y aceptar es humano', async ({ page }, testInfo) => {
  await start(page); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release();
  await expect(surface(page)).toContainText('1 guardado sin saber si se aplicó'); await nav(page, 'Continuidad').click();
  await openFromPanel(page, 'task-2');
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();                                      // «Abrir la tarea» navega a Hoy y abre la ficha
  await expect(dialog(page)).toContainText('No se sabe si el guardado llegó a aplicarse'); await expect(dialog(page)).toContainText('task-2');
  await expect(dialog(page).getByRole('button', { name: /Guardar cambios/ })).toHaveCount(0); await expect(dialog(page).getByRole('button', { name: /Reenviar/ })).toHaveCount(0);
  await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores que enviaste');                // comprobó SOLO leyendo
  expect((await counts()).patches).toBe(1);
  await dialog(page).getByRole('button', { name: 'Aceptar el estado leído' }).click(); await expect(dialog(page)).toContainText('Estado leído y aceptado por ti');
  expect((await counts()).patches).toBe(1); expect((await counts()).changes).toHaveLength(1);
  const shotPath = path.join(root, 'reopen-uncertain-1440.png'); await page.screenshot({ path: shotPath }); await testInfo.attach('reopen-uncertain-1440', { path: shotPath, contentType: 'image/png' });
});

test('REABRIR DESDE LA FILA (sin pedir intento): con UN intento incierto compatible se adopta; la tarea sigue el mismo estado y no hay otro PATCH', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release(); await expect(surface(page)).toContainText('sin saber si se aplicó');
  await taskButton(page, 'task-2').click(); await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('No se sabe si el guardado llegó a aplicarse'); await expect(dialog(page).getByRole('button', { name: /Guardar cambios/ })).toHaveCount(0);
  expect((await counts()).patches).toBe(1);
});

test('EN VUELO: reabrir mientras el envío sigue en curso muestra «Guardando… ya salió»; al llegar el acuse la ficha refleja el resultado sin otro PATCH', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await openFromPanel(page, 'task-2');
  await expect(dialog(page)).toContainText('El envío ya salió y no se puede cancelar'); await expect(dialog(page).getByRole('button', { name: /Guardar cambios/ })).toHaveCount(0);
  held.release(); await expect(dialog(page)).toContainText('Cambios guardados'); expect((await counts()).patches).toBe(1); expect((await counts()).changes).toHaveLength(1);
});

test('HOMÓNIMAS: dos tareas «Llamar a Ana» con guardados inciertos; «Abrir la tarea» de cada fila abre SU intento (por ID), nunca el de la homónima', async ({ page }) => {
  await start(page); await openToday(page); const h2 = await holdAckFor(page, 'task-2', true), h3 = await holdAckFor(page, 'task-3', true);
  await completeTask(page, 'task-2'); await saveButton(page).click(); await expect.poll(() => h2.produced()).toBe(1); await leave(page);
  await completeTask(page, 'task-3'); await saveButton(page).click(); await expect.poll(() => h3.produced()).toBe(1); await leave(page); h2.release(); h3.release();
  await expect(surface(page)).toContainText('2 guardados sin saber si se aplicaron');
  await openFromPanel(page, 'task-3'); await expect(dialog(page)).toContainText('Tarea task-3'); await expect(dialog(page)).toContainText('No se sabe si el guardado llegó a aplicarse'); await expect(dialog(page)).not.toContainText('Tarea task-2');
  await leave(page); await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('Tarea task-2'); await expect(dialog(page)).not.toContainText('Tarea task-3');
  expect((await counts()).patches).toBe(2);
});

test('MISMO ID EN OTRA CAPTURA: el aviso conserva su contexto; la tarea actual se abre como recorrido nuevo y separado y NO puede confirmar ni aceptar el intento antiguo', async ({ page }, testInfo) => {
  await start(page); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await call('swap', {}); held.release(); await expect(surface(page)).toContainText('1 guardado sin saber si se aplicó');
  await openFromPanel(page, 'task-2');
  await expect(anyDialog(page)).toContainText('Ese resultado es de otra copia'); await expect(anyDialog(page)).toContainText('recorrido nuevo y separado');
  await expect(anyDialog(page)).not.toContainText('No se sabe si el guardado llegó a aplicarse'); await expect(anyDialog(page)).not.toContainText('Estado leído y aceptado'); await expect(anyDialog(page)).not.toContainText('Cambios guardados');
  await leaveAny(page); await openDetail(page); await expect(panelItem(page, 'task-2')).toContainText('No se sabe si se guardó');          // el aviso sigue en su contexto
  expect((await counts()).patches).toBe(1);
  const shotPath = path.join(root, 'reopen-othercopy-1440.png'); await page.screenshot({ path: shotPath }); await testInfo.attach('reopen-othercopy-1440', { path: shotPath, contentType: 'image/png' });
});

test('RECHAZADO (422 con la ficha cerrada): «Abrir la tarea» restaura lo escrito como borrador sobre la tarea actual, el aviso sigue y no hay otro PATCH hasta guardar de nuevo', async ({ page }) => {
  await start(page); await openToday(page); const barrier = gate(); let patches = 0;
  await page.route('**/api/v7/task-revision/task-2', async route => { if (route.request().method() !== 'PATCH') return route.fallback(); patches++; await barrier.promise; await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Datos no válidos', details: { status: 'Valor no permitido por la regla' } }) }); });
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => patches).toBe(1); await leave(page); barrier.release();
  await expect(surface(page)).toContainText('no se aplicó'); await openFromPanel(page, 'task-2');
  await expect(dialog(page)).toContainText('Se restauró lo que escribiste'); await expect(dialog(page).getByRole('combobox', { name: 'Estado *', exact: true })).toHaveValue('completed');
  expect(patches).toBe(1); expect((await counts()).patches).toBe(0);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toContainText('Hay cambios sin guardar'); await dialog(page).getByRole('button', { name: 'Descartar y volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);   // lo restaurado es un borrador: salir lo descarta, el aviso sigue
  await openDetail(page); await expect(panelItem(page, 'task-2')).toContainText('No se guardó');
});


test('R2 · REABRIR un intento EN CURSO y que llegue un 422: la ficha muestra el error y conserva lo escrito; el aviso SIGUE en Resultados y se puede recuperar el mismo borrador tras cerrar', async ({ page }) => {
  await start(page); await openToday(page); const barrier = gate(); let patches = 0;
  await page.route('**/api/v7/task-revision/task-2', async route => { if (route.request().method() !== 'PATCH') return route.fallback(); patches++; await barrier.promise; await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Datos no válidos', details: { status: 'Valor no permitido por la regla' } }) }); });
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => patches).toBe(1); await leave(page);
  await expect(surface(page)).toContainText('1 guardado en curso'); await openFromPanel(page, 'task-2');
  await expect(dialog(page)).toContainText('El envío ya salió y no se puede cancelar'); barrier.release();       // llega el MISMO error con la ficha REABIERTA
  await expect(dialog(page)).toContainText('El servidor rechazó algunos valores'); await expect(dialog(page).getByRole('combobox', { name: 'Estado *', exact: true })).toHaveValue('completed');
  await page.keyboard.press('Escape'); await expect(dialog(page)).toContainText('Hay cambios sin guardar'); await dialog(page).getByRole('button', { name: 'Descartar y volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);
  await openDetail(page); await expect(panelItem(page, 'task-2')).toContainText('No se guardó');                         // el aviso NO se perdió
  await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('Se restauró lo que escribiste'); await expect(dialog(page).getByRole('combobox', { name: 'Estado *', exact: true })).toHaveValue('completed');
  expect(patches).toBe(1); expect((await counts()).patches).toBe(0);                                                          // reabrir y cerrar no escribió nada
});

test('R2 · REINTENTO EXPLÍCITO separado: tras restaurar el borrador rechazado, solo «Guardar cambios» envía; el aviso anterior sigue hasta que la persona lo descarta o el nuevo guardado se confirma', async ({ page }) => {
  await start(page); await openToday(page); let first = true; const barrier = gate();
  await page.route('**/api/v7/task-revision/task-2', async route => { if (route.request().method() !== 'PATCH') return route.fallback(); if (first) { first = false; await barrier.promise; await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Datos no válidos', details: { status: 'Valor no permitido' } }) }); return; } await route.fallback(); });
  await completeTask2(page); await saveButton(page).click(); await leave(page); barrier.release(); await expect(surface(page)).toContainText('no se aplicó');
  await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('Se restauró lo que escribiste'); expect((await counts()).patches).toBe(0);
  await saveButton(page).click(); await expect(dialog(page)).toContainText('Cambios guardados'); expect((await counts()).patches).toBe(1); expect((await counts()).changes).toHaveLength(1);
});

test('R2 · NO ENVIADO por prelectura con la ficha REABIERTA: «No se pudo comprobar antes de guardar», el aviso sigue en Resultados y se recupera el borrador; cero escrituras', async ({ page }) => {
  await start(page); await openToday(page); let armed = false; const barrier = gate();
  await page.route('**/api/v2/state', async route => { if (!armed || route.request().method() !== 'GET') return route.fallback(); armed = false; await barrier.promise; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'sin lectura' }) }); });
  await completeTask2(page); armed = true; await saveButton(page).click(); await expect(dialog(page)).toContainText('Comprobando la tarea antes de guardar'); await leave(page);
  await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('Todavía no se ha enviado nada'); barrier.release();
  await expect(dialog(page)).toContainText('No se pudo comprobar antes de guardar'); await expect(dialog(page).getByRole('combobox', { name: 'Estado *', exact: true })).toHaveValue('completed');
  await page.keyboard.press('Escape'); await dialog(page).getByRole('button', { name: 'Descartar y volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);
  await openDetail(page); await expect(panelItem(page, 'task-2')).toContainText('No se envió'); await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('Se restauró lo que escribiste'); expect((await counts()).patches).toBe(0);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px: la ficha reabierta con el intento incierto y el aviso de otra copia caben (sin desbordamiento), con teclado y capturas', async ({ page }, testInfo) => {
  await start(page); await openToday(page, { width, height: 900 }); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release(); await expect(surface(page)).toContainText('sin saber si se aplicó');
  await openFromPanel(page, 'task-2'); await expect(dialog(page)).toContainText('No se sabe si el guardado llegó a aplicarse'); expect(await noHorizontalOverflow(page)).toBe(true);
  const a = path.join(root, 'reopen-uncertain-' + width + '.png'); await page.screenshot({ path: a }); await testInfo.attach('reopen-uncertain-' + width, { path: a, contentType: 'image/png' });
  await leave(page); await call('swap', {}); await openFromPanel(page, 'task-2'); await expect(anyDialog(page)).toContainText('Ese resultado es de otra copia'); expect(await noHorizontalOverflow(page)).toBe(true);
  const b = path.join(root, 'reopen-othercopy-' + width + '.png'); await page.screenshot({ path: b }); await testInfo.attach('reopen-othercopy-' + width, { path: b, contentType: 'image/png' });
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body)).toBe(true);
});
