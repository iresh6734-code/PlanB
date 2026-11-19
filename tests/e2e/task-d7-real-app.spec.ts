import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lockButton, menuItem, openSection, place } from './menu';

// D7 EN LA APP REAL (unidad U2-171). La App se compila desde una COPIA CONGELADA de los fuentes del cliente (manifiesto de hashes en <root>/manifest.json; si un fuente
// cambia mientras se copia, la prueba se niega a continuar) y se sirve desde el servidor REAL (createBaseApp, SQLite en memoria, 127.0.0.1, red externa bloqueada).
// Los fallos se inyectan en el navegador con page.route sobre ese servidor real: el servidor APLICA el PATCH y se retiene o pierde la RESPUESTA, o se sustituye la
// respuesta por un 401/404/409/422 sin que el PATCH llegue. Un arnés propio solo acreditaría lo que contiene: aquí todo pasa por la App, la barra lateral y Hoy reales.
// PLANB_U2_PRE=1 compila la App con App.tsx y LocalOperations.tsx ANTERIORES a U2 (contraprueba: estas pruebas deben fallar por falta de seguimiento).
const repo = process.cwd();
let root = path.resolve(process.env.PLANB_U2_ROOT ?? path.join(repo, 'tests', '.tmp', 'u2-171-run-' + randomUUID().slice(0, 8)));
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
  'no-dispose': { file: 'TaskOutcomesHost.tsx', from: 'const summary = created.dispose();', to: 'const summary = { notDispatched: 0, dispatched: 0 };' },
  'consumer-never-updates': { file: 'TaskOutcomesHost.tsx', from: 'confirmationConsumer(() => latest.current.refreshState(), today), [today]);', to: 'confirmationConsumer(() => latest.current.refreshState(), null), [null]);' },
  'list-failure-ignored': { file: 'TaskOutcomesHost.tsx', from: 'catch { if (today.mounted()) throw new OutcomeRefreshError(\'list\');', to: 'catch { if (false) throw new OutcomeRefreshError(\'list\');' },
  'no-focus-restore': { file: 'LocalOperations.tsx', from: 'restoreFocusIfRowGone(); }', to: '}' },
  'accepted-as-confirmed': { file: 'TaskOutcomesHost.tsx', from: "const confirmed = live.filter(op => op.status === 'confirmed').length, accepted = live.filter(op => op.status === 'accepted').length;", to: "const confirmed = live.filter(op => op.status === 'confirmed' || op.status === 'accepted').length, accepted = 0;" },
  'no-seal-at-lock': { file: 'App.tsx', from: 'const outcomes=outcomesControl.current;outcomes?.seal();', to: 'const outcomes=outcomesControl.current;' },
  'no-resume-after-failed-lock': { file: 'App.tsx', from: 'outcomes?.resume();setError(', to: 'setError(' },
  'surface-not-hidden': { file: 'TaskOutcomesHost.tsx', from: 'hidden={context.ficha}', to: 'hidden={false}' },
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
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, name: string) => place(page, name);
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

test('RECORRIDO D7: guardo, cierro la ficha, navego, veo el seguimiento, vuelvo, el acuse se pierde → comprobar SIN escribir → aceptar el estado leído; un único PATCH', async ({ page }, testInfo) => {
  await start(page); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await leave(page);
  // Cerrada la ficha, el guardado está EN VUELO: la superficie (fuera de Hoy) lo dice y no promete cancelarlo.
  await expect(surface(page)).toContainText('1 guardado en curso'); await expect(surface(page)).toBeVisible();
  await nav(page, 'Continuidad').click(); await expect(surface(page)).toContainText('Resultados de guardado');          // navego: el seguimiento sobrevive
  held.release();                                                                                                          // el servidor ya lo aplicó; la respuesta se pierde
  await expect(surface(page)).toContainText('1 guardado sin saber si se aplicó'); await expect(surface(page)).toHaveAttribute('data-attention', 'true');
  await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await expect(item).toContainText('No se sabe si se guardó');
  await expect(item).toContainText('No se ha reenviado nada por cuenta propia');
  expect((await counts()).patches).toBe(1);
  await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(surface(page)).toContainText('sin saber si se aplicó');   // vuelvo a Hoy: sigue ahí
  await shot(page, 'u2-incierto-1440', testInfo);
  // Comprobar = una lectura. Nunca escribe.
  const before = (await counts()).patches;
  await item.getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item).toContainText('La lectura muestra la tarea con los valores que enviaste'); await expect(item).toContainText('No distingue si los aplicó tu envío o una edición idéntica');
  expect((await counts()).patches).toBe(before);
  await item.getByRole('button', { name: /Aceptar el estado leído/ }).click();
  await expect(item).toContainText('Estado leído y aceptado por ti'); await expect(item).toContainText('no se sabe si lo aplicó tu solicitud u otra edición idéntica');
  await expect(page.locator('.lop-tasks li', { hasText: 'task-2' })).toHaveCount(0);                                         // la cola de Hoy ya no ofrece la tarea completada
  await expect(surface(page).locator('.ltso-item')).toContainText('La cola de Hoy está actualizada');
  const final = await counts(); expect(final.patches).toBe(1); expect(final.changes).toHaveLength(1); expect(final.task2?.status).toBe('completed');
});

test('PATCH confirmado DESPUÉS de cerrar la ficha: la superficie lo confirma y la cola se actualiza por lectura, sin segundo PATCH', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await expect(surface(page)).toContainText('1 guardado en curso'); await expect(taskButton(page, 'task-2')).toHaveCount(1);
  held.release();
  await openDetail(page);
  await expect(surface(page).locator('.ltso-item')).toContainText('Guardado confirmado'); await expect(surface(page).locator('.ltso-item')).toContainText('La cola de Hoy está actualizada');
  await expect(taskButton(page, 'task-2')).toHaveCount(0); await expect(taskButton(page, 'task-3')).toHaveCount(1);
  const state = await counts(); expect(state.patches).toBe(1); expect(state.changes).toHaveLength(1);
});

test('DOBLE CLIC en Guardar: un único PATCH aunque se cierre la ficha y se confirme después', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false);
  await completeTask2(page); await saveButton(page).dblclick(); await expect.poll(() => held.produced()).toBe(1); await sleep(400);
  await leave(page); held.release(); await expect(taskButton(page, 'task-2')).toHaveCount(0);
  const state = await counts(); expect(state.patches).toBe(1); expect(state.changes).toHaveLength(1);
});

test('FALLA LA LISTA DE HOY tras confirmar: el guardado sigue confirmado, la causa es «lista», el aviso sobrevive al cierre de la ficha y «Reintentar la actualización» solo LEE', async ({ page }, testInfo) => {
  await start(page); await openToday(page); let failList = false;
  await page.route('**/api/v7/local-operations', route => failList ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"detalle-interno-secreto"}' }) : route.fallback());
  await completeTask2(page); failList = true; await saveButton(page).click();
  await expect(dialog(page)).toContainText('El guardado está confirmado, pero la cola de Hoy no se actualizó');
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect(surface(page)).toContainText('1 lista sin actualizar'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await expect(item).toContainText('Guardado confirmado'); await expect(item).toContainText('No se pudo actualizar la lista de Hoy');
  await expect(item).toContainText('Reintentar solo vuelve a leer, no envía otro guardado'); expect(await surface(page).innerText()).not.toContain('detalle-interno-secreto');   // el mensaje del servidor no entra en el aviso del gestor
  await expect(taskButton(page, 'task-2')).toHaveCount(1);                                         // la pantalla puede seguir mostrando lo anterior, y lo dice
  await shot(page, 'u2-lista-falla-1440', testInfo);
  expect((await counts()).patches).toBe(1);
  failList = false; await item.getByRole('button', { name: /Reintentar la actualización/ }).click();
  await expect(item).toContainText('La cola de Hoy está actualizada'); await expect(taskButton(page, 'task-2')).toHaveCount(0);
  expect((await counts()).patches).toBe(1); expect((await counts()).changes).toHaveLength(1);
});

test('FALLA EL ESTADO DE LA APP tras confirmar: causa «estado» (y la lista de Hoy ni se intenta); reintentar solo lee y entonces se actualizan estado y lista', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false); let failState = false, listReads = 0;
  await page.route('**/api/v2/state', route => failState ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"detalle-interno-secreto"}' }) : route.fallback());
  await page.route('**/api/v7/local-operations', route => { listReads++; return route.fallback(); });
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  failState = true; const readsBefore = listReads; held.release();
  await expect(surface(page)).toContainText('1 lista sin actualizar'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await expect(item).toContainText('No se pudo actualizar el estado de la aplicación'); expect(await surface(page).innerText()).not.toContain('detalle-interno-secreto');
  expect(listReads).toBe(readsBefore);                                                               // si falla el estado, la cola de Hoy no se relee
  expect((await counts()).patches).toBe(1);
  failState = false; await item.getByRole('button', { name: /Reintentar la actualización/ }).click();
  await expect(item).toContainText('La cola de Hoy está actualizada'); await expect(taskButton(page, 'task-2')).toHaveCount(0); expect((await counts()).patches).toBe(1);
});

for (const [status, body, expected] of [[401, { error: 'Sesión no válida' }, /bloqueada/], [404, { error: 'No existe' }, /ya no existe/], [409, { error: 'Otra edición cambió esta tarea.' }, /conflicto/], [422, { error: 'Datos no válidos', details: { status: 'Valor no permitido' } }, /Datos no válidos|Valor no permitido/]] as const) {
  test('RECHAZO ' + status + ' con la ficha abierta: lo presenta la ficha con su causa, el borrador se conserva y la superficie no duplica el aviso; no hay segundo PATCH', async ({ page }) => {
    await start(page); await openToday(page); let patches = 0;
    await page.route('**/api/v7/task-revision/task-2', route => { if (route.request().method() !== 'PATCH') return route.fallback(); patches++; return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); });
    await completeTask2(page); await saveButton(page).click(); await expect(page.getByRole('dialog')).toContainText(expected);
    if (status !== 404) await expect(dialog(page).getByRole('combobox', { name: 'Estado *', exact: true })).toHaveValue('completed');    // lo que escribí sigue ahí (con 404 la tarea ya no existe: la ficha no ofrece formulario)
    expect(patches).toBe(1); await expect(surface(page)).toHaveCount(0);
    expect((await counts()).patches).toBe(0); expect((await counts()).changes).toHaveLength(0);
  });
}

test('RECHAZO con la ficha YA CERRADA (409 tardío): la superficie conserva lo escrito, no promete haberlo guardado y «Abrir la tarea» reabre la ficha sin enviar nada', async ({ page }, testInfo) => {
  await start(page); await openToday(page); const barrier = gate(); let patches = 0;
  await page.route('**/api/v7/task-revision/task-2', async route => { if (route.request().method() !== 'PATCH') return route.fallback(); patches++; await barrier.promise; await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Otra edición cambió esta tarea.' }) }); });
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => patches).toBe(1); await leave(page);
  await expect(surface(page)).toContainText('1 guardado en curso'); barrier.release();
  await expect(surface(page)).toContainText('1 guardado que no se aplicó'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await expect(item).toContainText('No se guardó'); await expect(item).toContainText('El servidor rechazó la petición y no cambió nada');
  await item.locator('summary').click(); await expect(item).toContainText('Estado: completed');
  await shot(page, 'u2-rechazo-tardio-1440', testInfo);
  await openSection(page, 'Propuestas');                                                                                // «Abrir la tarea» navega a Hoy aunque estuviera en otra sección
  await item.getByRole('button', { name: /Abrir la tarea/ }).click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(dialog(page)).toContainText('task-2');
  await expect(surface(page)).toBeHidden();                                                                          // con la ficha abierta la superficie no duplica
  expect(patches).toBe(1); expect((await counts()).patches).toBe(0);
});

test('CAMBIO DE CAPTURA con el guardado incierto: comprobar da «otra copia»; no se acepta ni se reenvía nada y no se aplica el intento antiguo a la copia nueva', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await call('swap', {}); held.release(); await expect(surface(page)).toContainText('1 guardado sin saber si se aplicó'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await item.getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item).toContainText('La copia activa cambió desde que abriste la ficha');
  await expect(item.getByRole('button', { name: /Aceptar el estado leído/ })).toHaveCount(0); await expect(item.getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0);
  expect((await counts()).patches).toBe(1);
});

test('FOCO: al completarse una tarea y salir de la cola, el foco no se pierde: va al encabezado de la cola de Hoy', async ({ page }) => {
  await start(page); await openToday(page); await completeTask2(page); await saveButton(page).click();
  await expect(dialog(page)).toContainText('Cambios guardados'); await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect(taskButton(page, 'task-2')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('lop-queue');
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px: el seguimiento incierto, su detalle y el aviso caben en pantalla (sin desbordamiento) y se manejan con teclado', async ({ page }, testInfo) => {
  await start(page); await openToday(page, { width, height: 900 }); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release();
  await expect(surface(page)).toContainText('sin saber si se aplicó'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await expect(item).toBeVisible(); expect(await noHorizontalOverflow(page)).toBe(true);
  await shot(page, 'u2-incierto-' + width, testInfo);
  // Teclado: el botón de comprobar es alcanzable con Tab y se activa con Enter; los controles tienen al menos 44 px de alto en móvil.
  const check = item.getByRole('button', { name: /Comprobar ahora/ }); const box = await check.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(43);
  await check.focus(); await page.keyboard.press('Enter'); await expect(item).toContainText('La lectura muestra la tarea con los valores que enviaste');
  const accept = item.getByRole('button', { name: /Aceptar el estado leído/ }); await accept.focus(); await page.keyboard.press('Enter'); await expect(item).toContainText('Estado leído y aceptado por ti');
  expect(await noHorizontalOverflow(page)).toBe(true); await shot(page, 'u2-aceptado-' + width, testInfo);
  expect((await counts()).patches).toBe(1);
});

const unlock = async (page: Page) => { await page.locator('.protection-page').getByLabel('Contraseña local', { exact: true }).fill(PASSWORD); await page.locator('.protection-page').getByRole('button', { name: 'Desbloquear', exact: true }).click(); await expect(nav(page, 'Hoy')).toBeVisible(); };
const lockNotice = (page: Page) => page.getByTestId('outcomes-lock-notice');

test('BLOQUEAR DESPUÉS DEL DESPACHO: el PATCH ya salió y se aplica; al desbloquear hay un propietario NUEVO y vacío, un aviso con SOLO el recuento (sin textos) y ninguna mezcla; la respuesta tardía no llama a nadie', async ({ page }, testInfo) => {
  await start(page, { protectedSession: true }); await openToday(page); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await expect(surface(page)).toContainText('1 guardado en curso');
  await lockButton(page).click(); await expect(page.locator('.protection-page')).toBeVisible();
  await unlock(page);
  await expect(lockNotice(page)).toContainText('1 guardado ya había salido'); await expect(lockNotice(page)).toContainText('no se canceló');
  await expect(lockNotice(page)).toContainText('no puedes comprobarlo ni aceptarlo desde aquí');                      // un recuento NO es seguimiento: se dice
  const noticeText = await lockNotice(page).innerText(); expect(noticeText).not.toMatch(/Llamar a Ana|task-2|completed/);   // sin textos de tareas ni valores
  await expect(surface(page)).toHaveCount(0);                                                                          // propietario nuevo: nada heredado
  held.release(); await sleep(1200);                                                                                   // respuesta del envío antiguo: el propietario anterior ya terminó
  await expect(surface(page)).toHaveCount(0); await expect(lockNotice(page)).toContainText('1 guardado ya había salido');
  const state = await counts(); expect(state.patches).toBe(1); expect(state.task2?.status).toBe('completed');            // el servidor SÍ lo aplicó: no se canceló ni se deshizo
  await shot(page, 'u2-aviso-bloqueo-1440', testInfo);
  // El propietario nuevo funciona y no hereda: guardo OTRA tarea y solo aparece esa.
  await nav(page, 'Hoy').click(); await expect(page.locator('.lop-tasks li').first()).toBeVisible();
  await taskButton(page, 'task-3').focus(); await page.keyboard.press('Enter'); await expect(dialog(page)).toContainText('task-3');
  await dialog(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); await saveButton(page).click(); await expect(dialog(page)).toContainText('Cambios guardados');
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click();
  const after = await counts(); expect(after.patches).toBe(2); expect(after.task3?.status).toBe('completed');
  await lockNotice(page).getByRole('button', { name: 'Cerrar este aviso' }).click(); await expect(lockNotice(page)).toHaveCount(0);
});

test('BLOQUEAR ANTES DEL DESPACHO (comprobación previa en curso): no sale NINGÚN PATCH aunque la lectura termine después; el aviso cuenta «no llegó a enviarse»', async ({ page }) => {
  await start(page, { protectedSession: true }); await openToday(page); const barrier = gate(); let holding = false, held = 0;
  await page.route('**/api/v2/state', async route => { if (holding && route.request().method() === 'GET') { held++; await barrier.promise; } await route.fallback(); });
  await completeTask2(page); holding = true; await saveButton(page).click(); await expect.poll(() => held).toBeGreaterThan(0);
  expect((await counts()).patches).toBe(0);
  expect((await page.request.post(origin + '/api/v2/auth/lock', { data: {} })).ok()).toBe(true); await page.evaluate(() => window.dispatchEvent(new Event('planb:locked')));
  await expect(page.locator('.protection-page')).toBeVisible(); barrier.release(); await sleep(1000);
  expect((await counts()).patches).toBe(0); await unlock(page);
  await expect(lockNotice(page)).toContainText('1 guardado no llegó a enviarse'); await expect(lockNotice(page)).toContainText('no cambió nada en tu copia');
  await expect(surface(page)).toHaveCount(0); expect((await counts()).patches).toBe(0); expect((await counts()).task2?.status).toBe('pending');
});

test('NAVEGAR DURANTE LA RECARGA: Hoy se desmonta con la lectura de la cola retenida; el resultado se atribuye al consumidor vigente (estado primero, Hoy después), un único PATCH y la cola final es la real', async ({ page }) => {
  await start(page); await openToday(page); let hold = false, listReads = 0, held = 0; const barrier = gate();
  await page.route('**/api/v7/local-operations', async route => { listReads++; if (hold && held === 0) { held++; await barrier.promise; } await route.fallback(); });
  await completeTask2(page); hold = true; await saveButton(page).click(); await expect.poll(() => held).toBe(1);
  await expect(dialog(page)).toContainText('Actualizando la cola de Hoy'); await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click().catch(() => leave(page));
  await leave(page).catch(() => undefined);
  await openSection(page, 'Propuestas'); await expect(page.getByRole('heading', { name: 'Propuestas', exact: true })).toBeVisible();   // Hoy se desmonta con su lectura retenida
  await openSection(page, 'Tareas de hoy');   // dentro del grupo Hoy su cabecera solo pliega: se vuelve por su apartado (CLAUDE-UI-NAV-LAB) await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
  barrier.release();
  await expect(taskButton(page, 'task-2')).toHaveCount(0); await expect(taskButton(page, 'task-3')).toHaveCount(1);
  await openDetail(page).catch(() => undefined);
  await expect(surface(page).locator('.ltso-item')).toContainText('La cola de Hoy está actualizada');
  const state = await counts(); expect(state.patches).toBe(1); expect(state.changes).toHaveLength(1);
});

test('CONFIRMACIÓN MIENTRAS ESTOY EN OTRA SECCIÓN: el estado de la App se actualiza sin Hoy y al volver Hoy muestra la cola real (lee por su cuenta)', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await openSection(page, 'Cambios'); await expect(menuItem(page, 'Cambios')).toHaveAttribute('aria-current', 'page');
  held.release(); await expect(surface(page)).toContainText('1 confirmado');
  await nav(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(page.locator('.lop-tasks li').first()).toBeVisible();
  await expect(taskButton(page, 'task-2')).toHaveCount(0); await expect(taskButton(page, 'task-3')).toHaveCount(1); expect((await counts()).patches).toBe(1);
});

test('FOCO tras cerrar la ficha: la fila desaparece DESPUÉS de cerrarla (el gestor recarga más tarde) y el foco no se pierde en el documento: va al encabezado de la cola', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, false);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page);
  await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector('.lop-tasks li button'))).toBe(false);   // (el foco ya no está en una fila arbitraria)
  await taskButton(page, 'task-2').focus(); held.release();                                                                           // el foco está en la fila que va a desaparecer
  await expect(taskButton(page, 'task-2')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('lop-queue');
});

// ── R2 (dictamen 209) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
for (const width of [1440, 390]) test('PROCEDENCIA (209 F1) a ' + width + ' px: aceptar la lectura tras perder el acuse NO se cuenta como «confirmado» en el resumen; detalle y resumen dicen «aceptada por ti»; un solo PATCH', async ({ page }, testInfo) => {
  await start(page); await openToday(page, { width, height: 900 }); const held = await holdAck(page, true);
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release();
  await expect(surface(page)).toContainText('1 guardado sin saber si se aplicó'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await item.getByRole('button', { name: /Comprobar ahora/ }).click(); await expect(item).toContainText('La lectura muestra la tarea con los valores que enviaste');
  await item.getByRole('button', { name: /Aceptar el estado leído/ }).click(); await expect(item).toContainText('Estado leído y aceptado por ti'); await expect(item).toContainText('El servidor no confirmó tu envío'); await expect(item).toContainText('La cola de Hoy está actualizada');
  const summary = await surface(page).locator('.toh-line').innerText();
  expect(summary).toContain('1 lectura aceptada por ti'); expect(summary).not.toMatch(/confirmad/i); await shot(page, 'u2-r2-aceptado-resumen-' + width, testInfo);
  expect((await counts()).patches).toBe(1);
});

test('PROCEDENCIA (209 F1) con FALLO DE RECARGA: la lectura aceptada conserva su origen humano y la lista sin actualizar se cuenta como segunda dimensión', async ({ page }) => {
  await start(page); await openToday(page); const held = await holdAck(page, true); let failList = false;
  await page.route('**/api/v7/local-operations', route => failList ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"x"}' }) : route.fallback());
  await completeTask2(page); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); await leave(page); held.release();
  await expect(surface(page)).toContainText('sin saber si se aplicó'); await openDetail(page);
  const item = surface(page).locator('.ltso-item'); await item.getByRole('button', { name: /Comprobar ahora/ }).click(); await expect(item).toContainText('La lectura muestra la tarea');
  failList = true; await item.getByRole('button', { name: /Aceptar el estado leído/ }).click();
  await expect(surface(page)).toContainText('1 lista sin actualizar'); await expect(surface(page)).toContainText('1 lectura aceptada por ti'); expect(await surface(page).locator('.toh-line').innerText()).not.toMatch(/confirmad/i);
  await expect(item).toContainText('Estado leído y aceptado por ti'); await expect(item).toContainText('No se pudo actualizar la lista de Hoy'); expect((await counts()).patches).toBe(1);
});

test('SELLAR AL INICIAR EL BLOQUEO (209 F2): con la comprobación previa pendiente y el POST de bloqueo retenido, al liberar la lectura NO sale ningún PATCH ni cambia nada, ni siquiera antes del acuse de bloqueo', async ({ page }) => {
  await start(page, { protectedSession: true }); await openToday(page); const preflight = gate(), holdLock = gate(); let watch = false, preflightSeen = 0, lockSeen = 0, patchSeen = 0;
  await page.route('**/api/v2/state', async route => { if (watch && route.request().method() === 'GET') { preflightSeen++; await preflight.promise; } await route.fallback().catch(() => undefined); });
  await page.route('**/api/v7/task-revision/task-2', route => { if (route.request().method() === 'PATCH') patchSeen++; return route.fallback(); });
  await page.route('**/api/v2/auth/lock', async route => { if (route.request().method() === 'POST') { lockSeen++; await holdLock.promise; } await route.fallback().catch(() => undefined); });
  try {
    await completeTask2(page); watch = true; await saveButton(page).click(); await expect.poll(() => preflightSeen).toBeGreaterThan(0); await leave(page); expect((await counts()).patches).toBe(0);
    await lockButton(page).click(); await expect.poll(() => lockSeen).toBe(1);
    preflight.release(); await sleep(1500);                                                                   // la lectura previa termina MIENTRAS el bloqueo sigue sin llegar al servidor
    const before = await counts(); expect(patchSeen).toBe(0); expect(before.patches).toBe(0); expect(before.changes).toHaveLength(0); expect(before.task2?.status).toBe('pending');
    holdLock.release(); await expect(page.locator('.protection-page')).toBeVisible(); await unlock(page);
    await expect(lockNotice(page)).toContainText('1 guardado no llegó a enviarse'); await expect(surface(page)).toHaveCount(0);
    const after = await counts(); expect(after.patches).toBe(0); expect(after.task2?.status).toBe('pending');
  } finally { preflight.release(); holdLock.release(); }
});

test('BLOQUEO QUE NO SE COMPLETA (209 F2): el propietario sellado no se reactiva ni envía nada; empieza uno NUEVO que funciona y un aviso claro permite reintentar el bloqueo', async ({ page }, testInfo) => {
  await start(page, { protectedSession: true }); await openToday(page); const preflight = gate(); let watch = false, preflightSeen = 0, failLock = true, lockCalls = 0;
  await page.route('**/api/v2/state', async route => { if (watch && route.request().method() === 'GET') { preflightSeen++; await preflight.promise; } await route.fallback().catch(() => undefined); });
  await page.route('**/api/v2/auth/lock', route => { if (route.request().method() !== 'POST') return route.fallback(); lockCalls++; return failLock ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fallo ficticio del bloqueo"}' }) : route.fallback(); });
  await completeTask2(page); watch = true; await saveButton(page).click(); await expect.poll(() => preflightSeen).toBeGreaterThan(0); await leave(page);
  await lockButton(page).click(); await expect.poll(() => lockCalls).toBe(1);
  await expect(lockNotice(page)).toContainText('No se completó el bloqueo'); await expect(lockNotice(page)).toHaveAttribute('data-failed', 'true'); await expect(lockNotice(page)).toContainText('1 guardado no llegó a enviarse porque se pidió bloquear');
  await expect(page.locator('.protection-page')).toHaveCount(0); await expect(surface(page)).toHaveCount(0); await shot(page, 'u2-r2-bloqueo-fallido-1440', testInfo);
  preflight.release(); await sleep(1500); expect((await counts()).patches).toBe(0);                            // la lectura vieja termina: el propietario sellado no reactiva nada
  // Propietario NUEVO: guardar otra tarea funciona y se sigue en la superficie nueva (sin heredar nada del sellado).
  await taskButton(page, 'task-3').focus(); await page.keyboard.press('Enter'); await expect(dialog(page)).toContainText('task-3');
  await dialog(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed'); await saveButton(page).click(); await expect(dialog(page)).toContainText('Cambios guardados'); await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click();
  const mid = await counts(); expect(mid.patches).toBe(1); expect(mid.task3?.status).toBe('completed'); expect(mid.task2?.status).toBe('pending');
  failLock = false; await lockNotice(page).getByRole('button', { name: 'Reintentar el bloqueo' }).click(); await expect(page.locator('.protection-page')).toBeVisible(); await unlock(page);
  expect(lockCalls).toBe(2); expect((await counts()).patches).toBe(1);
});
