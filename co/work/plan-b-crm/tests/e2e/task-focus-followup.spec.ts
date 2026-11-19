import { test, expect, type Page, type Route, type BrowserContext } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// QA-130: ampliación de QA de MI entrega 123 (no es revisión independiente). DOM real en Chromium limpio contra el servidor REAL
// de Plan B (createBaseApp + Store en memoria, proceso hijo propio, 127.0.0.1 puerto efímero, red externa bloqueada) con un arnés
// mínimo de «Hoy» (NO es la App). Las carreras se fabrican con barreras explícitas sobre page.route (se deja pasar la petición al
// servidor y se retiene la RESPUESTA, o se retiene la petición).
// Historia: se escribió contra la PRIMERA presentación de 123, donde los casos D1/D2/D3/D5 reproducían defectos (pasaban mientras el
// defecto existía). Tras la devolución 131 y la corrección de 123 se INVIRTIERON: ahora son regresiones de lo corregido («CORREGIDO
// en 123»). El caso D7 sigue siendo un LÍMITE ABIERTO (reproducido y ahora divulgado al usuario). Las huellas de las fuentes de 123
// están fijadas en tests/task-focus-followup.test.ts: si 123 cambia, aquel test falla a propósito y hay que repetir esta QA.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_TF130_ROOT ?? path.join(repo, 'tests', '.tmp', 'taskfocusqa130-' + randomUUID()));
const rel = (target: string) => path.relative(root, path.join(repo, target)).replace(/\\/g, '/');
const PASSWORD = 'una contraseña local larga';
const SERVER = `import { createBaseApp } from '${rel('server/app.ts')}';
import { makeFixture, makeDemoSpec } from '${rel('shared/fixtures.ts')}';
import fs from 'node:fs'; import path from 'node:path';
const seed = JSON.parse(process.env.TF_SEED!), root = process.env.TF_ROOT!;
const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
let patches = 0; app.addHook('onRequest', async request => { if (request.method === 'PATCH') patches++; });
const gen = (snapshot: any) => store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
const snapshot: any = makeFixture('agency');
for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
if (seed.datetime) { snapshot.entities.find((e: any) => e.id === 'tasks').fields.find((f: any) => f.key === 'due_date').type = 'datetime'; for (const r of snapshot.records) if (r.entity === 'tasks') r.values.due_date = '2026-11-05T09:30:00.000Z'; }
store.importSnapshot(snapshot); gen(snapshot); store.activate();
const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoy</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(html));
app.get('/out/:file', async (request, reply) => { const file = String((request.params as any).file); if (!/^[\\w.-]+$/.test(file)) return reply.code(404).send(''); return reply.type(file.endsWith('.css') ? 'text/css' : 'text/javascript').send(fs.readFileSync(path.join(root, 'out', file))); });
app.post('/__h/exec', async request => {
  const b = request.body as any;
  if (b.op === 'edit') { store.saveRecord(b.entity, b.values, b.id); return { ok: true }; }
  if (b.op === 'swap') { const next = makeFixture('distribution'); next.id = 'capture-otra'; next.name = 'Otra captura'; store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; }
  if (b.op === 'counts') return { patches, changes: store.changes().map(c => ({ id: c.recordId, before: c.before?.values, after: c.after.values })), task: b.id ? store.record('tasks', b.id)?.values ?? null : null };
  return { ok: false };
});
await app.listen({ host: '127.0.0.1', port: 0 });
console.log('LISTEN ' + (app.server.address() as any).port);
`;
const ENTRY = (src: (name: string) => string) => `import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalTaskFocus } from ${src('LocalTaskFocus.tsx')};
import ${src('styles.css')}; import ${src('refinements.css')}; import ${src('sales.css')}; import ${src('team.css')};
import ${src('integrations.css')}; import ${src('design-system.css')}; import ${src('planb-ui.css')};
const w = window as any; w.__log = []; w.__locked = 0; w.__errors = []; window.addEventListener('planb:locked', () => { w.__locked++; }); window.addEventListener('error', e => w.__errors.push(String(e.message)));
function Today() {
  const ids = (new URLSearchParams(location.search).get('tasks') ?? '').split(',').filter(Boolean);
  const [rows, setRows] = useState<Record<string, any>>({}), [open, setOpen] = useState<string | null>(null);
  const read = async (id: string) => { const response = await fetch('/api/v2/records/tasks/' + encodeURIComponent(id)); if (!response.ok) throw new Error(String(response.status)); const { record } = await response.json(); setRows(previous => ({ ...previous, [id]: record.values })); };
  useEffect(() => { ids.forEach(id => void read(id).catch(() => undefined)); }, []);
  w.__open = (id: string) => setOpen(id); w.__close = () => setOpen(null);
  return <div className="app-shell"><aside className="sidebar"><div className="brand">Plan <span>B</span></div></aside><main id="main-content" className="main-content">
    <h1>Hoy</h1>
    <ul>{ids.map(id => <li key={id}><span>{rows[id]?.subject ?? id}</span> · <span data-testid={'due-' + id}>{rows[id]?.due_date ?? '…'}</span> · <span data-testid={'status-' + id}>{rows[id]?.status ?? '…'}</span> · <span data-testid={'notes-' + id}>{rows[id]?.notes ?? ''}</span>
      <button onClick={() => setOpen(id)}>Abrir tarea {id}</button></li>)}</ul>
    {open ? <LocalTaskFocus taskId={open} onClose={() => { w.__log.push('close'); setOpen(null); }} onPrepare={() => { w.__log.push('prepare'); setOpen(null); }}
      onSaved={async record => { w.__log.push('saved:' + record.id); await read(record.id); }} /> : null}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Today />);
`;
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const srcDir = process.env.PLANB_TF130_SRC ? path.resolve(process.env.PLANB_TF130_SRC) : path.join(repo, 'src');   // solo para pruebas de mutación
  const src = (name: string) => JSON.stringify(path.join(srcDir, name).replace(/\\/g, '/'));
  fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY(src)); fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
});

interface Srv { base: string; call: (body: object) => Promise<any>; counts: (id?: string) => Promise<{ patches: number; changes: any[]; task: any }>; stop: () => Promise<void>; }
const live: Srv[] = [];
async function start(seed: { datetime?: boolean } = {}): Promise<Srv> {
  const log = path.join(root, 'server-' + Date.now() + '-' + live.length + '.log');
  const child: ChildProcess = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')],
    { cwd: repo, env: { ...process.env, TF_SEED: JSON.stringify(seed), TF_ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr!.on('data', chunk => fs.appendFileSync(log, chunk));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó (ver ' + log + ')')), 40_000);
    child.stdout!.on('data', chunk => { const match = /LISTEN (\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó con código ' + code + ' (ver ' + log + ')')); });
  });
  const base = 'http://127.0.0.1:' + port;
  const call = async (body: object) => (await fetch(base + '/__h/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const server: Srv = { base, call, counts: id => call({ op: 'counts', id }), stop: async () => { if (child.exitCode === null) { child.removeAllListeners('exit'); child.kill(); await new Promise(resolve => child.once('exit', resolve)); } } };
  live.push(server); return server;
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);   // sin manejadores en vuelo contra un servidor que se va a parar
  await Promise.all(live.splice(0).map(server => server.stop()));
});

const SIZE = { width: 1440, height: 900 };
async function open(page: Page, srv: Srv, tasks = ['task-2', 'task-3']) {
  await page.setViewportSize(SIZE);
  await page.route('**/*', async route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') await route.abort(); else await route.fallback(); });
  await page.goto(srv.base + '/?tasks=' + tasks.join(','));
  await expect(page.getByTestId('status-' + tasks[0])).not.toHaveText('…');
}
const dialog = (page: Page) => page.getByRole('dialog');
const trigger = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir tarea ' + id });
const field = (page: Page, label: string) => dialog(page).getByLabel(label, { exact: false }).first();
const saveButton = (page: Page) => dialog(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const ackHeading = (page: Page) => dialog(page).getByRole('heading', { name: 'Cambios guardados' });
const lockedBanner = (page: Page) => dialog(page).getByRole('alert').filter({ hasText: 'La sesión está bloqueada' });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const post = (page: Page, url: string, body?: object) => page.evaluate(async ([target, payload]) => (await fetch(target as string, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : { method: 'POST' })).status, [url, body ?? null] as const);
const protect = async (page: Page) => expect(await post(page, '/api/v2/auth/setup', { password: PASSWORD })).toBe(200);   // crea la sesión (cookie)
const lock = async (page: Page) => expect(await post(page, '/api/v2/auth/lock')).toBe(200);                              // bloqueo REAL: borra la sesión en el servidor
const unlock = async (page: Page) => expect(await post(page, '/api/v2/auth/login', { password: PASSWORD })).toBe(200);
const stateStatus = (page: Page) => page.evaluate(async () => (await fetch('/api/v2/state')).status);
const logOf = (page: Page) => page.evaluate(() => (window as any).__log as string[]);
const lockedEvents = (page: Page) => page.evaluate(() => (window as any).__locked as number);
// Deja pasar la petición al servidor (que responde con la sesión VÁLIDA) y retiene la respuesta hasta soltar la barrera.
async function holdResponse(page: Page, pattern: RegExp, onProduced?: () => void) {
  const barrier = gate(); let produced = 0;
  await page.route(pattern, async (route: Route) => { let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; } produced++; onProduced?.(); await barrier.promise; try { await route.fulfill({ response }); } catch { /* petición cancelada */ } });
  return { release: barrier.release, produced: () => produced };
}
const CONTACTS = /\/api\/v2\/records\/contacts\?/;
async function openWithRefs(page: Page, srv: Srv, id = 'task-2') {
  await open(page, srv, ['task-2', 'task-3']); await trigger(page, id).click();
  await expect(dialog(page).getByText(/Se muestran 24 de 24 resultados/)).toBeVisible(); await page.waitForLoadState('networkidle'); await sleep(300);
}

// ---------------------------------------------------------------------------------------------------------------------------
// MISIÓN 2 · 401
test.describe('401 determinista', () => {
  test('ventana 1a: búsqueda de referencias empezada con sesión válida y ENTREGADA después de un bloqueo real: no reabre la sesión ni el guardado', async ({ page, context }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page);
    const held = await holdResponse(page, CONTACTS);
    await dialog(page).getByPlaceholder('Buscar por nombre…').first().fill('a');                      // la búsqueda sale con la sesión válida
    await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await lock(page);                                                                                    // el servidor borra la sesión; la respuesta de la búsqueda sigue retenida
    held.release();                                                                                      // se entrega la respuesta antigua (con su Set-Cookie)
    await expect.poll(async () => (await context.cookies()).some(cookie => cookie.name === 'planb_session' && cookie.value !== '')).toBe(true);   // la cookie vuelve al navegador…
    expect(await stateStatus(page)).toBe(401);                                                           // …pero la sesión NO existe en el servidor: el bloqueo real no se reabre
    await field(page, 'Notas').fill('borrador conservado'); await saveButton(page).click();
    await expect(lockedBanner(page)).toBeVisible(); expect(await lockedEvents(page)).toBeGreaterThan(0);
    await expect(field(page, 'Notas')).toHaveValue('borrador conservado');
    const counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0);
  });

  test('ventana 1b: bloqueo → Guardar (401) con la búsqueda aún retenida: el componente de producto la CANCELA al deshabilitarse y la respuesta antigua ya no llega', async ({ page, context }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page);
    const held = await holdResponse(page, CONTACTS);
    await dialog(page).getByPlaceholder('Buscar por nombre…').first().fill('a'); await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await lock(page); await field(page, 'Notas').fill('borrador 1b'); await saveButton(page).click();
    await expect(lockedBanner(page)).toBeVisible();
    held.release(); await sleep(600);
    expect((await context.cookies()).some(cookie => cookie.name === 'planb_session' && cookie.value !== '')).toBe(false);   // la respuesta cancelada no entregó su Set-Cookie
    expect(await stateStatus(page)).toBe(401); await expect(lockedBanner(page)).toBeVisible(); await expect(field(page, 'Notas')).toHaveValue('borrador 1b');
    const counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0);
  });

  test('ventana 1 (mecanismo de la hipótesis): si el «bloqueo» es solo borrar la cookie del navegador, la respuesta tardía con Set-Cookie la restaura y el guardado SÍ pasa', async ({ page, context }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page);
    const held = await holdResponse(page, CONTACTS);
    await dialog(page).getByPlaceholder('Buscar por nombre…').first().fill('a');
    await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await context.clearCookies(); expect(await context.cookies()).toHaveLength(0);                       // lo que hacía la prueba «401 real» de 123
    held.release(); await expect.poll(async () => (await context.cookies()).some(cookie => cookie.name === 'planb_session')).toBe(true);   // reproducido: la cookie vuelve
    expect(await stateStatus(page)).toBe(200);                                                           // y es una sesión válida en el servidor
    await field(page, 'Notas').fill('pasa sin bloqueo'); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
    expect((await srv.counts()).patches).toBe(1);
    // Conclusión acotada: demuestra un camino determinista por el que «clearCookies» NO equivale a bloquear (artefacto del arnés).
    // No demuestra que fuera la causa del fallo único observado en 123, ni descarta otras ventanas.
  });

  test('carga inicial con la sesión bloqueada: error explícito (no «tarea vacía»); tras desbloquear, Reintentar abre la ficha', async ({ page }) => {
    const srv = await start(); await open(page, srv); await protect(page); await lock(page);
    await trigger(page, 'task-2').click();
    await expect(dialog(page)).toContainText('sesión de Plan B está bloqueada'); await expect(dialog(page).locator('form')).toHaveCount(0); expect(await lockedEvents(page)).toBeGreaterThan(0);
    await unlock(page); await dialog(page).getByRole('button', { name: 'Reintentar' }).click();
    await expect(field(page, 'Asunto')).toHaveValue('Llamar a Ana');
  });

  test('401 entre las dos lecturas de estado de la carga (la lectura del registro queda retenida): error, sin ficha con datos de antes del bloqueo', async ({ page }) => {
    const srv = await start(); await open(page, srv); await protect(page);
    const held = await holdResponse(page, /\/api\/v2\/records\/tasks\/task-2$/);
    await trigger(page, 'task-2').click(); await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await lock(page); held.release();
    await expect(dialog(page)).toContainText('sesión de Plan B está bloqueada'); await expect(dialog(page).locator('form')).toHaveCount(0);
  });

  test('lectura auxiliar (ReferenceSelect) con 401: su error es local, el borrador se conserva y tras desbloquear se guarda UNA vez', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page); await field(page, 'Notas').fill('borrador y relación'); await lock(page);
    await dialog(page).getByPlaceholder('Buscar por nombre…').first().fill('b');
    await expect(dialog(page).getByText('No se pudieron buscar registros.').first()).toBeVisible();
    await expect(field(page, 'Notas')).toHaveValue('borrador y relación'); expect((await srv.counts()).patches).toBe(0);
    await unlock(page); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
    const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1); expect(counts.task.notes).toBe('borrador y relación');
  });

  test('401 en el PATCH (la comprobación previa pasó y el bloqueo ocurre con la petición retenida): no se ejecuta, borrador intacto, un solo guardado tras desbloquear', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page);
    const barrier = gate(); let reached = 0;
    await page.route('**/api/records/tasks/task-2', async (route: Route) => { reached++; await barrier.promise; await route.fallback(); });
    await field(page, 'Notas').fill('en vuelo durante el bloqueo'); await saveButton(page).click();
    await expect.poll(() => reached).toBe(1); await lock(page); barrier.release();
    await expect(lockedBanner(page)).toBeVisible(); await expect(field(page, 'Notas')).toHaveValue('en vuelo durante el bloqueo');
    let counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0);       // el 401 cortó la petición antes de ejecutarse
    await page.unroute('**/api/records/tasks/task-2'); await unlock(page); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
    counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  });

  test('401 en la lectura posterior de la cola: el acuse del guardado permanece, la cola se declara sin actualizar y el reintento solo LEE', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv); await protect(page);
    const queue = gate(); let armed = false;
    await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); armed = true; await route.fulfill({ response }); });
    await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (armed) await queue.promise; await route.fallback(); });
    await field(page, 'Estado').selectOption('completed'); await saveButton(page).click();
    await expect(ackHeading(page)).toBeVisible(); await expect(dialog(page)).toContainText('Actualizando la cola de Hoy…');
    await lock(page); queue.release();
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'El guardado está confirmado, pero la cola de Hoy no se actualizó' })).toBeVisible();
    await expect(dialog(page)).toContainText('Cambios guardados'); await expect(page.getByTestId('status-task-2')).toHaveText('pending');   // la cola sigue vieja y se dice
    await dialog(page).getByRole('button', { name: 'Reintentar la actualización' }).click(); await sleep(400);
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' })).toBeVisible();   // sigue bloqueado: sin éxito falso
    let counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
    await unlock(page); await dialog(page).getByRole('button', { name: 'Reintentar la actualización' }).click();
    await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.'); await expect(page.getByTestId('status-task-2')).toHaveText('completed');
    counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  });

  test('respuesta tardía (producida con sesión válida) tras bloqueo + cambio de ID: no sustituye el error de la tarea nueva ni muestra datos antiguos', async ({ page }) => {
    const srv = await start(); await open(page, srv); await protect(page);
    const held = await holdResponse(page, /\/api\/v2\/records\/tasks\/task-2$/);
    await trigger(page, 'task-2').click(); await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await lock(page); await page.evaluate(() => (window as any).__open('task-3'));
    await expect(dialog(page)).toContainText('sesión de Plan B está bloqueada');
    held.release(); await sleep(500);
    await expect(dialog(page)).toContainText('sesión de Plan B está bloqueada'); await expect(dialog(page).locator('form')).toHaveCount(0);
    await expect(dialog(page).locator('.ltf-context')).toHaveCount(0);
    expect((await srv.counts()).patches).toBe(0);
  });

  test('respuesta tardía tras cerrar la ficha o desmontar: sin errores de página y sin ficha fantasma', async ({ page }) => {
    const srv = await start(); await open(page, srv); await protect(page);
    const held = await holdResponse(page, /\/api\/v2\/records\/tasks\/task-2$/);
    await trigger(page, 'task-2').click(); await expect.poll(() => held.produced()).toBeGreaterThan(0);
    await lock(page); await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    held.release(); await sleep(500);
    await expect(dialog(page)).toHaveCount(0); expect(await page.evaluate(() => (window as any).__errors)).toEqual([]);
    await trigger(page, 'task-3').click(); await sleep(300); await page.evaluate(() => (window as any).__close()); await expect(dialog(page)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// MISIÓN 3 · acuse, recarga, concurrencia y defectos reproducidos
test.describe('acuse, recarga y concurrencia', () => {
  test('D1/F4 CORREGIDO en 123: con el PATCH ya aplicado y su respuesta retenida, salir avisa de que hay un guardado en curso (no «Nada se ha enviado») y la cola se actualiza si confirma', async ({ page }, testInfo) => {
    const srv = await start(); await openWithRefs(page, srv);
    const held = await holdResponse(page, /\/api\/records\/tasks\/task-2$/);                         // el servidor APLICA y la respuesta queda retenida
    await field(page, 'Notas').fill('ya enviado'); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
    expect((await srv.counts()).changes).toHaveLength(1);                                              // hecho: el cambio ya está en el historial
    await page.keyboard.press('Escape');
    await expect(dialog(page).getByText('Hay un guardado en curso')).toBeVisible(); await expect(dialog(page)).toContainText('no se puede cancelar'); await expect(dialog(page)).not.toContainText('Nada se ha enviado');
    await page.screenshot({ path: path.join(root, 'd1-corregido.png') }); await testInfo.attach('d1-corregido', { path: path.join(root, 'd1-corregido.png'), contentType: 'image/png' });
    await dialog(page).getByRole('button', { name: 'Salir de todos modos' }).click(); await expect(dialog(page)).toHaveCount(0);
    held.release(); await sleep(400);
    expect(await logOf(page)).toContain('saved:task-2'); await expect(page.getByTestId('notes-task-2')).toHaveText('ya enviado');   // un guardado CONFIRMADO tras cerrar sí llega a la cola
  });

  test('D2 CORREGIDO en 123: cambiar de tarea con un PATCH en vuelo no inutiliza el «Guardar» de la tarea nueva', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv, 'task-2');
    const barrier = gate(); let reached = 0;
    await page.route('**/api/records/tasks/task-2', async (route: Route) => { reached++; await barrier.promise; await route.fallback(); });
    await field(page, 'Notas').fill('de task-2'); await saveButton(page).click(); await expect.poll(() => reached).toBe(1);
    await page.evaluate(() => (window as any).__open('task-3'));
    await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-09'); await field(page, 'Notas').fill('de task-3');
    await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();                       // task-3 se guarda con task-2 aún en vuelo
    expect((await srv.counts('task-3')).task.notes).toBe('de task-3');
    barrier.release(); await expect.poll(async () => (await srv.counts()).patches).toBe(2);
    const counts = await srv.counts(); expect(counts.changes.map(change => change.id).sort()).toEqual(['task-2', 'task-3']);
  });

  test('D3 CORREGIDO en 123: 16 s / 31 s virtuales después, la lectura da error con reintento y el guardado queda «incierto»', async ({ page }) => {
    const srv = await start(); await page.clock.install(); await open(page, srv, ['task-2', 'task-3']);
    await page.route(/\/api\/v2\/records\/tasks\/task-3$/, async () => { /* nunca responde */ });
    await trigger(page, 'task-3').click(); await expect(dialog(page).getByText('Leyendo la tarea…')).toBeVisible();
    await page.clock.fastForward(16_000); await expect(dialog(page).getByRole('alert')).toContainText('tardó demasiado'); await expect(dialog(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await page.evaluate(() => (window as any).__close()); await page.unroute(/\/api\/v2\/records\/tasks\/task-3$/);
    await trigger(page, 'task-2').click(); await expect(field(page, 'Asunto')).toBeVisible();
    await page.route('**/api/records/tasks/task-2', async () => { /* el PATCH nunca responde ni llega */ });
    await field(page, 'Notas').fill('sin respuesta'); await saveButton(page).click(); await expect(dialog(page).getByText('Guardando…').first()).toBeVisible();
    await page.clock.fastForward(31_000); await expect(dialog(page).getByText('No se sabe si el guardado llegó a aplicarse')).toBeVisible();
    expect((await srv.counts()).patches).toBe(0);                                                       // el PATCH colgado nunca llegó: la lectura de verificación dirá «sin cambios»
  });

  test('D5 CORREGIDO en 123: «Seguir editando» no oculta un fallo posterior de la actualización de la cola', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv);
    const queue = gate(); let armed = false;
    await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); armed = true; await route.fulfill({ response }); });
    await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (armed) { await queue.promise; await route.abort('connectionreset'); } else await route.fallback(); });
    await field(page, 'Notas').fill('guardada'); await saveButton(page).click();
    await expect(dialog(page)).toContainText('Actualizando la cola de Hoy…');
    await dialog(page).getByRole('button', { name: 'Seguir editando' }).click(); await expect(field(page, 'Notas')).toBeVisible();
    queue.release();
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' })).toBeVisible();   // el aviso sobrevive al acuse
    await expect(page.getByTestId('notes-task-2')).not.toHaveText('guardada'); expect((await srv.counts()).changes).toHaveLength(1);
  });

  test('LÍMITE ABIERTO D7 (reproducido, ahora DIVULGADO): PATCH aplicado, ficha cerrada y respuesta perdida → ni acuse ni actualización de la cola, pero la ficha avisó antes de salir', async ({ page }) => {
    const srv = await start(); await openWithRefs(page, srv);
    const barrier = gate(); let produced = 0;
    await page.route('**/api/records/tasks/task-2', async (route: Route) => { await route.fetch(); produced++; await barrier.promise; await route.abort('connectionreset'); });
    await field(page, 'Notas').fill('aplicado y perdido'); await saveButton(page).click(); await expect.poll(() => produced).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toContainText('no sabrás el resultado'); await expect(dialog(page)).toContainText('ni se actualizará la cola de Hoy');   // divulgado ANTES de salir
    await dialog(page).getByRole('button', { name: 'Salir de todos modos' }).click(); await expect(dialog(page)).toHaveCount(0);
    barrier.release(); await sleep(600);
    expect((await srv.counts()).changes).toHaveLength(1);                                              // el servidor lo aplicó
    expect(await logOf(page)).toEqual(['close']);                                                       // nadie recibió ni acuse ni incertidumbre
    await expect(page.getByTestId('notes-task-2')).not.toHaveText('aplicado y perdido');                // y la cola de Hoy sigue mostrando lo viejo (necesita un contrato nuevo)
  });

  test('contraprueba de CAS en DOM: dos pestañas guardan el mismo campo a la vez; ambas confirman, 2 filas de historial y gana la última sin aviso', async ({ browser }) => {
    const srv = await start(); const context: BrowserContext = await browser.newContext({ viewport: SIZE }), a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) { await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await expect(field(page, 'Notas')).toBeVisible(); await page.waitForLoadState('networkidle'); }
    let sent = 0; const barrier = gate();
    for (const page of [a, b]) await page.route('**/api/records/tasks/task-2', async (route: Route) => { if (++sent === 2) barrier.release(); await barrier.promise; await route.fallback(); });
    await field(a, 'Notas').fill('pestaña A'); await field(b, 'Notas').fill('pestaña B');
    await Promise.all([saveButton(a).click(), saveButton(b).click()]);
    await expect(ackHeading(a)).toBeVisible(); await expect(ackHeading(b)).toBeVisible();
    const counts = await srv.counts('task-2'); expect(counts.patches).toBe(2); expect(counts.changes).toHaveLength(2);
    expect(counts.task.notes).toBe(counts.changes[1].after.notes);                                       // la última escritura gana
    for (const page of [a, b]) await expect(dialog(page)).not.toContainText('Otra edición');            // ninguna lo detectó
    await context.close();
  });

  test('misma ID de tarea en dos capturas: la ficha muestra la copia vigente y guarda en ella', async ({ page }) => {
    const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
    await expect(dialog(page).locator('.ltf-context')).toContainText('Agencia Norte'); await expect(field(page, 'Asunto')).toHaveValue('Llamar a Ana'); await page.keyboard.press('Escape');
    await srv.call({ op: 'swap' }); await trigger(page, 'task-2').click();
    await expect(dialog(page).locator('.ltf-context')).toContainText('Otra captura'); await expect(dialog(page).locator('.ltf-context')).not.toContainText('Agencia Norte');
    await expect(field(page, 'Asunto')).not.toHaveValue('Llamar a Ana');                                // el ID coincide, la tarea es la de la otra captura
    await field(page, 'Notas').fill('en la captura nueva'); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
    expect((await srv.counts('task-2')).task.notes).toBe('en la captura nueva');
  });

  test('tarea con fecha-hora (DOM real, Auckland y Los Ángeles): se muestra en hora local, un campo no editado no viaja y el instante guardado es exacto', async ({ browser }) => {
    const srv = await start({ datetime: true });
    const cases = [{ tz: 'Pacific/Auckland', shown: '2026-11-05T22:30', typed: '2026-11-06T08:15', iso: '2026-11-05T19:15:00.000Z' }, { tz: 'America/Los_Angeles', shown: '2026-11-05T01:30', typed: '2026-11-06T08:15', iso: '2026-11-06T16:15:00.000Z' }];
    for (const item of cases) {
      const context = await browser.newContext({ timezoneId: item.tz, viewport: SIZE }), page = await context.newPage(), bodies: string[] = [];
      page.on('request', request => { if (request.method() === 'PATCH') bodies.push(request.postData() ?? ''); });
      await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
      await expect(field(page, 'Fecha límite')).toHaveAttribute('type', 'datetime-local'); await expect(field(page, 'Fecha límite')).toHaveValue(item.shown);
      await field(page, 'Notas').fill('solo notas ' + item.tz); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
      expect(JSON.parse(bodies[0])).toEqual({ values: { notes: 'solo notas ' + item.tz } });            // el instante no editado no se reenvía
      await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
      await field(page, 'Fecha límite').fill(item.typed); await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();
      expect(JSON.parse(bodies[1])).toEqual({ values: { due_date: item.iso } });
      expect((await srv.counts('task-2')).task.due_date).toBe(item.iso);
      await srv.call({ op: 'edit', entity: 'tasks', id: 'task-2', values: { due_date: '2026-11-05T09:30:00.000Z' } });
      await context.close();
    }
  });

  test('respuestas truncadas o demasiado grandes en el DOM: error visible, nunca una ficha vacía', async ({ page }) => {
    const srv = await start(); await open(page, srv);
    await page.route(/\/api\/v2\/state$/, async (route: Route) => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).slice(0, 400) }); });
    await trigger(page, 'task-2').click();
    await expect(dialog(page).getByRole('alert')).toContainText('respuesta compatible'); await expect(dialog(page).locator('form')).toHaveCount(0);
    await page.keyboard.press('Escape'); await page.unroute(/\/api\/v2\/state$/);
    await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"record":"' + 'x'.repeat(3_000_000) + '"}' }));
    await trigger(page, 'task-2').click();
    await expect(dialog(page).getByRole('alert')).toContainText('supera el tamaño permitido'); await expect(dialog(page).locator('form')).toHaveCount(0);
  });
});
