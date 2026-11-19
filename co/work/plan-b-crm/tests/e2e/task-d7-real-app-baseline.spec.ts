import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openSection, place } from './menu';

// D7 EN LA APP REAL, MISMOS ESCENARIOS QUE LA LÍNEA BASE 153 (invertida por U2-171). La línea base original observaba el comportamiento ANTERIOR a U2: cerrar la ficha con un
// guardado en vuelo dejaba a Hoy sin ninguna mención al guardado (aserción `mentions` vacía, marcadas «U2 DEBE INVERTIR»). Tras U2 esas aserciones se INVIERTEN: la superficie fuera de
// Hoy dice qué pasó. La versión original (hash 10e077c2…) se conserva como evidencia histórica; con PLANB_U2_PRE=1 en tests/e2e/task-d7-real-app.spec.ts se reproduce la App anterior.
// Esta suite sigue sin probar la lógica del gestor (136/170): solo lo que la persona ve en la App real.
// La App se compila desde una COPIA CONGELADA de los fuentes del cliente (manifiesto de hashes en <root>/manifest.json): otras unidades
// editan App.tsx/LocalOperations.tsx y un corte móvil no sería reproducible. El servidor es el real (createBaseApp, SQLite en memoria).
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_D7BASE_ROOT ?? path.join(repo, 'tests', '.tmp', 'd7baseline153-' + randomUUID()));
const absolute = (name: string) => JSON.stringify(pathToFileURL(path.join(repo, name)).href);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SERVER = `import { createBaseApp } from ${absolute('server/app.ts')};
import { makeFixture, makeDemoSpec } from ${absolute('shared/fixtures.ts')};
const { app, store } = await createBaseApp({ root: process.env.ROOT!, dbPath: ':memory:', staticDir: process.env.ROOT! + '/dist' });
let patches = 0; app.addHook('onRequest', async request => { if (request.method === 'PATCH') patches++; });
const snapshot: any = makeFixture('agency');
for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.status = 'pending'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false }); store.activate();
app.post('/__h/counts', async () => ({ patches, changes: store.changes().map(c => ({ id: c.recordId, after: c.after.values })), task2: store.record('tasks', 'task-2')?.values ?? null }));
await app.listen({ host: '127.0.0.1', port: 0 }); console.log('LISTEN ' + (app.server.address() as { port: number }).port);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
`;
let child: ChildProcess | undefined, origin = '';

test.beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  const frozen = path.join(root, 'frozen'); fs.rmSync(frozen, { recursive: true, force: true });
  for (const entry of ['src', 'shared', 'public']) fs.cpSync(path.join(repo, entry), path.join(frozen, entry), { recursive: true });
  for (const file of ['index.html', 'package.json', 'tsconfig.json']) fs.copyFileSync(path.join(repo, file), path.join(frozen, file));
  // Solo para la prueba de sensibilidad: simula un Hoy que SÍ muestra seguimiento (no existe en el producto) y comprueba que la línea base lo detecta.
  if (process.env.PLANB_D7BASE_MUTATE === 'notice') {
    const file = path.join(frozen, 'src', 'LocalOperations.tsx'), source = fs.readFileSync(file, 'utf8'), anchor = '<section className="lop" aria-labelledby="lop-title">';
    if (!source.includes(anchor)) throw new Error('El ancla de la mutación ya no existe en LocalOperations.tsx');
    fs.writeFileSync(file, source.replace(anchor, anchor + '<p role="status">No se sabe si se guardó: seguimiento simulado</p>'));
  }
  const manifest: Record<string, string> = {};
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(tsx?|css|html|json)$/.test(entry.name)) manifest[path.relative(frozen, full).replace(/\\/g, '/')] = sha(full); } };
  walk(path.join(frozen, 'src')); walk(path.join(frozen, 'shared'));
  // Si un fuente cambió MIENTRAS se copiaba, la copia sería mezcla de dos momentos: se comprueba contra el original.
  for (const [file, hash] of Object.entries(manifest)) if (!process.env.PLANB_D7BASE_MUTATE && sha(path.join(repo, file)) !== hash) throw new Error('El fuente cambió durante la congelación: ' + file + '. Repite la prueba.');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ frozenAt: new Date().toISOString(), appTsx: manifest['src/App.tsx'], localOperationsTsx: manifest['src/LocalOperations.tsx'], localTaskFocusTsx: manifest['src/LocalTaskFocus.tsx'], files: manifest }, null, 1));
  await build({ root: frozen, configFile: false, envDir: path.join(root, 'empty-env'), base: './', plugins: [react()], logLevel: 'error', build: { outDir: path.join(root, 'dist'), emptyOutDir: true } });
  fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
});
async function start() {
  child = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: repo, windowsHide: true, env: { ...process.env, ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó: ' + output)), 40_000);
    child!.stdout!.on('data', value => { output += String(value); const match = /LISTEN (\d+)/.exec(output); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child!.stderr!.on('data', value => { output += String(value); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó con código ' + code + ' ' + output)); });
  });
  origin = 'http://127.0.0.1:' + port;
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
  if (child && child.exitCode === null && child.signalCode === null) { const stopped = new Promise<void>(resolve => child!.once('close', () => resolve())); child.kill(); await stopped; } child = undefined;
});

const counts = async () => (await (await fetch(origin + '/__h/counts', { method: 'POST' })).json()) as { patches: number; changes: { id: string; after: Record<string, unknown> }[]; task2: Record<string, unknown> | null };
const taskButton = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir Llamar a Ana (ID ' + id + ')', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Llamar a Ana' });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function openToday(page: Page, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
  await place(page, 'Hoy').click();
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await expect(page.locator('.lop-tasks li').first()).toBeVisible();
}
/** El servidor APLICA el PATCH; la respuesta se retiene y luego se pierde (`lose`) o se entrega. */
async function holdAck(page: Page, lose: boolean) {
  const barrier = gate(); let produced = 0;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; } produced++; await barrier.promise; if (lose) await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined); });
  return { release: barrier.release, produced: () => produced };
}
/** Texto visible de Hoy FUERA de la ficha (lo que la persona tiene delante tras cerrarla). */
const pageText = (page: Page) => page.evaluate(() => (document.querySelector('main')?.innerText ?? document.body.innerText));
async function completeAndLeave(page: Page) {
  await taskButton(page, 'task-2').focus(); await page.keyboard.press('Enter');
  await expect(dialog(page)).toContainText('task-2');
  await dialog(page).getByRole('combobox', { name: 'Estado *', exact: true }).selectOption('completed');
}

const ATTENTION = /incierto|No se sabe|se guard|guardando|cola de Hoy no|comprobar|sin saber si se aplic|guardado en curso|sin actualizar|confirmado/i;
const snapshot = async (page: Page) => { const text = await pageText(page); return { row2: await taskButton(page, 'task-2').count(), row3: await taskButton(page, 'task-3').count(), mentions: text.match(new RegExp(ATTENTION.source, 'gi')) ?? [], text }; };

test('D7 (App real, línea base 153 invertida): cierro la ficha con el PATCH aplicado y el acuse perdido → la superficie dice que no se sabe y la cola sigue vieja', async ({ page }, testInfo) => {
  await start(); await openToday(page); const held = await holdAck(page, true);
  await completeAndLeave(page); await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);                                                   // con el gestor, cerrar no descarta ni cancela: el intento sigue siendo suyo
  held.release(); await sleep(1500);
  const state = await counts(); expect(state.patches).toBe(1); expect(state.changes).toHaveLength(1); expect(state.task2?.status).toBe('completed');       // el servidor SÍ lo aplicó
  const seen = await snapshot(page);
  // INVERTIDO (antes: ninguna mención). El servidor ya tiene la tarea «completed» y Hoy sigue ofreciendo la fila (la cola no se relee mientras el resultado es incierto), pero ahora la
  // superficie montada FUERA de Hoy dice que no se sabe si se aplicó y permite comprobarlo.
  expect(seen.row2).toBe(1); expect(seen.row3).toBe(1); expect(seen.mentions.length).toBeGreaterThan(0); await expect(page.locator('.toh')).toContainText('sin saber si se aplicó');
  await page.screenshot({ path: path.join(root, 'd7-1440.png') }); await testInfo.attach('d7-1440', { path: path.join(root, 'd7-1440.png'), contentType: 'image/png' });
});

test('D7 (App real, línea base 153 invertida): al navegar a otra sección y volver, la cola refleja lo ocurrido Y el seguimiento lo explica', async ({ page }) => {
  await start(); await openToday(page); const held = await holdAck(page, true);
  await completeAndLeave(page); await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); held.release(); await sleep(800);
  await openSection(page, 'Propuestas'); await sleep(500);
  await place(page, 'Hoy').click(); await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible(); await sleep(800);
  const seen = await snapshot(page);
  // INVERTIDO (antes: ninguna explicación). Volver a Hoy recarga la cola (la fila desaparece, el estado ya es el real) Y el seguimiento sobrevivió a la navegación: el propietario es el de la sesión.
  expect(seen.row2).toBe(0); expect(seen.row3).toBe(1); expect(seen.mentions.length).toBeGreaterThan(0); await expect(page.locator('.toh')).toContainText('sin saber si se aplicó');
});

test('D7 (App real, línea base 153 invertida): el PATCH confirma DESPUÉS de cerrar la ficha → se actualiza la cola y se confirma a la persona', async ({ page }) => {
  await start(); await openToday(page); const held = await holdAck(page, false);
  await completeAndLeave(page); await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  const before = await snapshot(page); held.release(); await sleep(1500); const after = await snapshot(page);
  // INVERTIDO solo en la parte de la confirmación (antes: ninguna): la cola se refresca sola y la superficie confirma el guardado, sin segundo PATCH.
  expect(before.row2).toBe(1); expect(after.row2).toBe(0); expect(after.mentions.length).toBeGreaterThan(0); await expect(page.locator('.toh')).toContainText('1 confirmado');
  expect((await counts()).changes).toHaveLength(1);
});

test('D7 (App real, línea base 153 invertida): PATCH confirmado y la ficha se cierra mientras la recarga de la cola falla → el aviso sigue visible', async ({ page }) => {
  await start(); await openToday(page); let failReads = false;
  await page.route('**/api/v7/local-operations', route => failReads ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"sin lectura"}' }) : route.fallback());
  await completeAndLeave(page); failReads = true; await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog(page)).toContainText('El guardado está confirmado, pero la cola de Hoy no se actualizó');          // dentro de la ficha SÍ se ve
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0); await sleep(800);
  const seen = await snapshot(page);
  // INVERTIDO (antes: el aviso desaparecía al cerrar la ficha). La fila de una tarea ya completada sigue en Hoy, pero el fallo de la recarga SIGUE visible fuera de la ficha,
  // con «Reintentar la actualización» (que solo lee: ver task-d7-real-app.spec.ts).
  expect(seen.row2).toBe(1); expect(seen.mentions.length).toBeGreaterThan(0); await expect(page.locator('.toh')).toContainText('1 lista sin actualizar');
  expect((await counts()).changes).toHaveLength(1); failReads = false;
});

for (const width of [390, 320]) test('D7 (App real, línea base 153 invertida) a ' + width + ' px: el seguimiento tras cerrar la ficha cabe en pantalla (sin desbordamiento) y avisa', async ({ page }, testInfo) => {
  await start(); await openToday(page, { width, height: 900 }); const held = await holdAck(page, true);
  await completeAndLeave(page); await dialog(page).getByRole('button', { name: 'Guardar cambios' }).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); held.release(); await sleep(1200);
  await expect(page.locator('.toh')).toContainText('sin saber si se aplicó');                                                      // INVERTIDO: antes, ningún aviso
  const seen = await snapshot(page); expect(seen.row2).toBe(1); expect(seen.mentions.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const file = path.join(root, 'd7-' + width + '.png'); await page.screenshot({ path: file }); await testInfo.attach('d7-' + width, { path: file, contentType: 'image/png' });
});
