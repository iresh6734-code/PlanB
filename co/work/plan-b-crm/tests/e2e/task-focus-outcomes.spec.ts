import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Unidad U1-148. La ficha REAL (LocalTaskFocus) delega en el gestor de resultados de 136 mediante la prop opcional `outcomes`.
// DOM real en Chromium limpio contra el servidor REAL de Plan B (createBaseApp + Store en memoria, proceso hijo propio, 127.0.0.1 con
// puerto efímero, red externa bloqueada, datos ficticios). El montaje es un ARNÉS de «Hoy»: filas, la superficie TaskSaveOutcomesPanel y la
// ficha real; NO es la App real (eso es U2). Los fallos de red se fabrican con barreras sobre page.route: se deja pasar la petición al
// servidor real y se retiene o se pierde la RESPUESTA.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_TF148_ROOT ?? path.join(repo, 'tests', '.tmp', 'taskoutcomes148-' + randomUUID()));
const rel = (target: string) => path.relative(root, path.join(repo, target)).replace(/\\/g, '/');
const SERVER = `import { createBaseApp } from '${rel('server/app.ts')}';
import { makeFixture, makeDemoSpec } from '${rel('shared/fixtures.ts')}';
import fs from 'node:fs'; import path from 'node:path';
const root = process.env.TF_ROOT!;
const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
let patches = 0; app.addHook('onRequest', async request => { if (request.method === 'PATCH') patches++; });
const gen = (snapshot: any) => store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false });
const snapshot: any = makeFixture('agency');
for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === 'task-4').values.subject = 'Preparar-la-propuesta-integral-con-nombre-larguisimo-'.repeat(3);
store.importSnapshot(snapshot); gen(snapshot); store.activate();
const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoy</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(html));
app.get('/out/:file', async (request, reply) => { const file = String((request.params as any).file); if (!/^[\\w.-]+$/.test(file)) return reply.code(404).send(''); return reply.type(file.endsWith('.css') ? 'text/css' : 'text/javascript').send(fs.readFileSync(path.join(root, 'out', file))); });
app.post('/__h/exec', async request => {
  const b = request.body as any;
  if (b.op === 'edit') { store.saveRecord(b.entity, b.values, b.id); return { ok: true }; }
  if (b.op === 'return-busy') { store.set('returnBusy', !!b.value); return { ok: true }; }
  if (b.op === 'delete-record') { store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run(b.entity, b.id); return { ok: true }; }
  if (b.op === 'replace') { const next = makeFixture('agency'); next.id = store.snapshot!.id; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; }
  if (b.op === 'counts') return { patches, changes: store.changes().map(c => ({ id: c.recordId, before: c.before?.values, after: c.after.values })), task: b.id ? store.record('tasks', b.id)?.values ?? null : null };
  return { ok: false };
});
await app.listen({ host: '127.0.0.1', port: 0 });
console.log('LISTEN ' + (app.server.address() as any).port);
`;
const ENTRY = (src: (name: string) => string) => `import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalTaskFocus } from ${src('LocalTaskFocus.tsx')};
import { TaskSaveOutcomesPanel } from ${src('TaskSaveOutcomes.tsx')};
import { createTaskSaveOutcomes, legacyStrategy } from ${src('task-save-outcome.ts')};
import { browserTransport } from ${src('local-task-focus-client.ts')};
import ${src('styles.css')}; import ${src('refinements.css')}; import ${src('sales.css')}; import ${src('team.css')};
import ${src('integrations.css')}; import ${src('design-system.css')}; import ${src('planb-ui.css')};
const w = window as any; w.__queueReads = 0; w.__onSaved = 0; w.__locked = 0; w.__log = []; window.addEventListener('planb:locked', () => { w.__locked++; });
const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(browserTransport()), onConfirmed: async record => { w.__queueReads++; await w.__readRow(record.id); } });
w.__controller = controller;
const legacy = new URLSearchParams(location.search).get('legacy') === '1';
function Today() {
  const ids = (new URLSearchParams(location.search).get('tasks') ?? '').split(',').filter(Boolean);
  const [rows, setRows] = useState<Record<string, any>>({}), [open, setOpen] = useState<string | null>(null);
  const read = async (id: string) => { const response = await fetch('/api/v2/records/tasks/' + encodeURIComponent(id)); if (!response.ok) throw new Error(String(response.status)); const { record } = await response.json(); setRows(previous => ({ ...previous, [id]: record.values })); };
  w.__readRow = read; w.__open = (id: string) => setOpen(id);
  useEffect(() => { ids.forEach(id => void read(id).catch(() => undefined)); }, []);
  return <div className="app-shell"><aside className="sidebar"><div className="brand">Plan <span>B</span></div></aside><main id="main-content" className="main-content">
    <h1>Hoy</h1>
    <ul>{ids.map(id => <li key={id} style={{ overflowWrap: 'anywhere' }}><span>{rows[id]?.subject ?? id}</span> · <span data-testid={'status-' + id}>{rows[id]?.status ?? '…'}</span> · <span data-testid={'notes-' + id}>{rows[id]?.notes ?? ''}</span> <button onClick={() => setOpen(id)}>Abrir tarea {id}</button></li>)}</ul>
    {legacy ? null : <TaskSaveOutcomesPanel controller={controller} onOpenTask={id => setOpen(id)} />}
    {open ? <LocalTaskFocus taskId={open} outcomes={legacy ? undefined : controller} onClose={() => { w.__log.push('close:' + open); setOpen(null); }} onPrepare={() => { w.__log.push('prepare'); setOpen(null); }}
      onSaved={async record => { w.__onSaved++; await read(record.id); }} /> : null}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Today />);
`;
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const srcDir = process.env.PLANB_TF148_SRC ? path.resolve(process.env.PLANB_TF148_SRC) : path.join(repo, 'src');   // solo para contrapruebas con fuentes anteriores o mutadas
  const src = (name: string) => JSON.stringify(path.join(srcDir, name).replace(/\\/g, '/'));
  fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY(src)); fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
});

interface Srv { base: string; call: (body: object) => Promise<any>; counts: (id?: string) => Promise<{ patches: number; changes: any[]; task: any }>; stop: () => Promise<void>; }
const live: Srv[] = [];
async function start(): Promise<Srv> {
  const log = path.join(root, 'server-' + Date.now() + '-' + live.length + '.log');
  const child: ChildProcess = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: repo, env: { ...process.env, TF_ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr!.on('data', chunk => fs.appendFileSync(log, chunk));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó (ver ' + log + ')')), 40_000);
    child.stdout!.on('data', chunk => { const match = /LISTEN (\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor terminó con código ' + code + ' (ver ' + log + ')')); });
  });
  const base = 'http://127.0.0.1:' + port, call = async (body: object) => (await fetch(base + '/__h/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const server: Srv = { base, call, counts: id => call({ op: 'counts', id }), stop: async () => { if (child.exitCode === null) { child.removeAllListeners('exit'); child.kill(); await new Promise(resolve => child.once('exit', resolve)); } } };
  live.push(server); return server;
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await Promise.all(live.splice(0).map(server => server.stop())); });

const SIZE = { width: 1440, height: 900 };
async function open(page: Page, srv: Srv, tasks = ['task-2', 'task-3'], size = SIZE, extra = '') {
  const external: string[] = [];
  await page.setViewportSize(size);
  await page.route('**/*', async route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); await route.abort(); } else await route.fallback(); });
  await page.goto(srv.base + '/?tasks=' + tasks.join(',') + extra);
  await expect(page.getByTestId('status-' + tasks[0])).not.toHaveText('…');
  return external;
}
const dialog = (page: Page) => page.getByRole('dialog');
const trigger = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir tarea ' + id });
const field = (page: Page, label: string) => dialog(page).getByLabel(label, { exact: false }).first();
const surface = (page: Page) => page.locator('section.ltso');
const item = (page: Page, taskId: string) => page.locator('li.ltso-item[data-task="' + taskId + '"]');
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const saveButton = (page: Page) => dialog(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const status = (page: Page, taskId: string) => page.getByTestId('status-' + taskId);
const notesCell = (page: Page, taskId: string) => page.getByTestId('notes-' + taskId);
const num = (page: Page, name: string) => page.evaluate(n => (window as any)[n] as number, name);
const ops = (page: Page) => page.evaluate(() => (window as any).__controller.list().map((op: any) => ({ id: op.attemptId, task: op.taskId, status: op.status, phase: op.phase, queue: op.queue.status, n: op.attemptNumber })));
/** Abre la ficha real, edita y deja el formulario listo (sin guardar). */
async function openAndEdit(page: Page, id: string, edit: { status?: string; notes?: string }) {
  await trigger(page, id).click(); await expect(field(page, 'Notas')).toBeVisible();
  if (edit.status) await field(page, 'Estado').selectOption(edit.status); if (edit.notes !== undefined) await field(page, 'Notas').fill(edit.notes);
}
/** El servidor APLICA el PATCH; la respuesta se retiene y luego se pierde (`lose`) o se entrega. */
async function holdAck(page: Page, taskId: string, lose: boolean) {
  const barrier = gate(); let produced = 0;
  await page.route('**/api/records/tasks/' + taskId, async (route: Route) => { let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; } produced++; await barrier.promise; if (lose) await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined); });
  return { release: barrier.release, produced: () => produced };
}
/** Retiene el PATCH ANTES de que llegue al servidor (para observar «enviado» sin que se haya aplicado). */
async function holdBeforeServer(page: Page, taskId: string) {
  const barrier = gate(); let reached = 0;
  await page.route('**/api/records/tasks/' + taskId, async (route: Route) => { reached++; await barrier.promise; await route.fallback(); });
  return { release: barrier.release, reached: () => reached };
}
const post = (page: Page, url: string, body?: object) => page.evaluate(async ([target, payload]) => (await fetch(target as string, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : { method: 'POST' })).status, [url, body ?? null] as const);

test('D7 con la ficha REAL: PATCH aplicado, ficha cerrada sin aviso de descarte, acuse perdido → «incierto» en la superficie; comprobar solo lee; aceptar es decisión humana', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', true);
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click();
  await expect.poll(() => held.produced()).toBe(1);
  // La operación estaba registrada en el gestor antes de que el PATCH llegara al servidor, y la ficha lo refleja sin prometer cancelar.
  expect(await ops(page)).toEqual([expect.objectContaining({ task: 'task-2', status: 'in_flight', phase: 'sent', n: 1 })]);
  await expect(dialog(page).locator('#ltf-status')).toContainText('El envío ya salió y no se puede cancelar'); await expect(dialog(page).locator('#ltf-status')).toContainText('Resultados de guardado');
  await expect(field(page, 'Estado')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);                                              // cerrar con el guardado en curso NO pide «descartar»: el gestor sigue
  await expect(item(page, 'task-2')).toContainText('Guardando'); await expect(item(page, 'task-2')).toContainText('no se puede cancelar');
  held.release();
  await expect(item(page, 'task-2').getByRole('alert')).toContainText('No se sabe si se guardó'); await expect(item(page, 'task-2')).toContainText('No se ha reenviado nada por cuenta propia');
  await sleep(600); let counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  await item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item(page, 'task-2')).toContainText('No distingue si los aplicó tu envío o una edición idéntica'); counts = await srv.counts('task-2'); expect(counts.patches).toBe(1);
  await item(page, 'task-2').getByRole('button', { name: /Aceptar el estado leído/ }).click();
  await expect(item(page, 'task-2')).toContainText('Estado leído y aceptado por ti'); await expect(item(page, 'task-2')).not.toContainText('Guardado confirmado');
  await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.'); await expect(status(page, 'task-2')).toHaveText('completed');
  counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  expect(await num(page, '__queueReads')).toBe(1); expect(await num(page, '__onSaved')).toBe(0);   // la cola la actualiza el gestor, no la ficha
});

test('ficha ABIERTA y acuse perdido: la ficha refleja la operación, comprueba sola con una lectura, no reenvía y «Aceptar» pasa por el gestor', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', true);
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(dialog(page).getByText('No se sabe si el guardado llegó a aplicarse')).toBeVisible();
  await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores que enviaste'); await expect(dialog(page)).toContainText('Si cierras la ficha, el seguimiento continúa en «Resultados de guardado»');
  await sleep(500); expect((await srv.counts()).patches).toBe(1);
  expect(await ops(page)).toEqual([expect.objectContaining({ status: 'uncertain' })]);
  await dialog(page).getByRole('button', { name: 'Aceptar el estado leído' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Estado leído y aceptado por ti' })).toBeVisible(); await expect(dialog(page)).toContainText('no confirmó');
  await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.');
  expect(await ops(page)).toEqual([expect.objectContaining({ status: 'accepted', queue: 'ok' })]);
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1); expect(await num(page, '__queueReads')).toBe(1); expect(await num(page, '__onSaved')).toBe(0);
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0); await expect(surface(page)).toHaveCount(0);   // lo ya visto y con la cola al día no deja aviso
});

test('cerrar la ficha con el resultado INCIERTO a la vista: sin aviso de descarte; el seguimiento sigue en la superficie, sin reenvío', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', true);
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores que enviaste');
  await dialog(page).getByRole('button', { name: 'Cerrar la ficha' }).click(); await expect(dialog(page)).toHaveCount(0);   // sin «Hay un guardado…» ni «se descarta»
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await expect(item(page, 'task-2')).toContainText('No distingue si los aplicó tu envío');
  expect(await ops(page)).toEqual([expect.objectContaining({ status: 'uncertain' })]); await sleep(500); expect((await srv.counts()).patches).toBe(1);
  await item(page, 'task-2').getByRole('button', { name: /Aceptar el estado leído/ }).click(); await expect(item(page, 'task-2')).toContainText('Estado leído y aceptado por ti');
  expect((await srv.counts()).patches).toBe(1);
});

test('guardado normal: «Cambios guardados» y cola actualizada por el gestor (onSaved de la ficha NO se llama); lo visto no deja aviso al cerrar', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  await openAndEdit(page, 'task-2', { notes: 'hecho por teléfono' }); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.');
  await expect(notesCell(page, 'task-2')).toHaveText('hecho por teléfono');
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  expect(await num(page, '__queueReads')).toBe(1); expect(await num(page, '__onSaved')).toBe(0);
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(surface(page)).toHaveCount(0);
});

test('PATCH confirmado DESPUÉS de cerrar la ficha: la superficie lo confirma y la cola se actualiza solo por lectura', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', false);
  await openAndEdit(page, 'task-2', { notes: 'tras cerrar' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(notesCell(page, 'task-2')).not.toHaveText('tras cerrar');
  held.release();
  await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.');
  await expect(notesCell(page, 'task-2')).toHaveText('tras cerrar'); expect(await num(page, '__queueReads')).toBe(1); expect(await num(page, '__onSaved')).toBe(0);
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('cerrar durante la COMPROBACIÓN previa no cancela el guardado: el gestor lo termina y lo muestra', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  await openAndEdit(page, 'task-2', { notes: 'cerrada en la comprobación' });
  const barrier = gate(); let reads = 0;
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { reads++; await barrier.promise; await route.fallback(); });
  await saveButton(page).click(); await expect.poll(() => reads).toBeGreaterThan(0);
  expect(await ops(page)).toEqual([expect.objectContaining({ status: 'in_flight', phase: 'checking' })]); expect((await srv.counts()).patches).toBe(0);
  await expect(dialog(page).locator('#ltf-status')).toContainText('Todavía no se ha enviado nada');
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await expect(item(page, 'task-2')).toContainText('Comprobando antes de guardar');
  barrier.release();
  await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('la recarga de la cola falla: el guardado sigue CONFIRMADO en la ficha y en la superficie; reintentar solo lee', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let broken = false;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); broken = true; await route.fulfill({ response }); });
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await openAndEdit(page, 'task-2', { notes: 'guardada' }); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'La cola de Hoy no se actualizó' })).toContainText('El guardado está confirmado'); await expect(dialog(page)).not.toContainText('No se ha guardado');
  await expect(notesCell(page, 'task-2')).not.toHaveText('guardada'); expect((await srv.counts()).patches).toBe(1);
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect(item(page, 'task-2').getByRole('alert')).toContainText('La cola de Hoy no se actualizó'); await expect(item(page, 'task-2')).toContainText('Guardado confirmado');   // no se descarta: la cola sigue vieja
  broken = false; await item(page, 'task-2').getByRole('button', { name: /Reintentar la actualización/ }).click();
  await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.'); await expect(notesCell(page, 'task-2')).toHaveText('guardada');
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1); expect(await num(page, '__onSaved')).toBe(0);
});

test('F1 (revisión 174): aceptar el estado leído + recarga rechazada NO afirma «guardado confirmado», tampoco tras «Seguir editando»; reintentar solo lee', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', true); let broken = false;
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores que enviaste');
  broken = true;                                                                       // la lectura que actualizaría Hoy falla; la comprobación anterior ya terminó
  await dialog(page).getByRole('button', { name: 'Aceptar el estado leído' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Estado leído y aceptado por ti' })).toBeVisible();
  const warning = dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' });
  await expect(warning).toContainText('Aceptaste el estado leído, pero la cola de Hoy no se actualizó'); await expect(warning).toContainText('el servidor no confirmó tu envío');
  await expect(dialog(page)).not.toContainText('El guardado está confirmado'); await expect(dialog(page)).not.toContainText('El servidor confirmó el guardado');
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();                       // la procedencia se conserva fuera del acuse
  const editWarning = dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' });
  await expect(editWarning).toContainText('Aceptaste el estado leído'); await expect(dialog(page)).not.toContainText('El guardado está confirmado');
  let counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  broken = false; await editWarning.getByRole('button', { name: 'Reintentar la actualización' }).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' })).toHaveCount(0); await expect(status(page, 'task-2')).toHaveText('completed');
  counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('F1 en la ruta SIN gestor (el helper de aviso es el mismo): aceptar el estado leído + recarga rechazada no afirma «confirmado»', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2'], SIZE, '&legacy=1');
  const held = await holdAck(page, 'task-2', true); let broken = false;
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores que enviaste');
  broken = true; await dialog(page).getByRole('button', { name: 'Aceptar el estado leído' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Estado leído y aceptado por ti' })).toBeVisible();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' })).toContainText('Aceptaste el estado leído');
  await expect(dialog(page)).not.toContainText('El guardado está confirmado');
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click(); await expect(dialog(page)).toContainText('Aceptaste el estado leído, pero la cola de Hoy no se actualizó'); await expect(dialog(page)).not.toContainText('El guardado está confirmado');
  expect((await srv.counts()).patches).toBe(1);
});

test('reintentar la actualización DESDE LA FICHA solo vuelve a leer', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let broken = false;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); broken = true; await route.fulfill({ response }); });
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await openAndEdit(page, 'task-2', { notes: 'desde la ficha' }); await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'La cola de Hoy no se actualizó' })).toBeVisible(); broken = false;
  await dialog(page).getByRole('button', { name: 'Reintentar la actualización' }).click();
  await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.'); await expect(notesCell(page, 'task-2')).toHaveText('desde la ficha');
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1); expect(await num(page, '__queueReads')).toBe(2);
});

test('sin vista de Hoy registrada la cola ESPERA: la ficha lo dice y, al registrarse la vista, se actualiza una sola vez y solo por lectura', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  await page.evaluate(() => (window as any).__controller.setOnConfirmed(null));
  await openAndEdit(page, 'task-2', { notes: 'sin vista' }); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); await expect(dialog(page)).toContainText('La cola de Hoy se actualizará cuando vuelvas a esa vista');
  await expect(dialog(page)).not.toContainText('La cola de Hoy está actualizada.'); await expect(notesCell(page, 'task-2')).not.toHaveText('sin vista'); expect(await num(page, '__queueReads')).toBe(0);
  await page.evaluate(() => { const w = window as any; w.__controller.setOnConfirmed(async (record: any) => { w.__queueReads++; await w.__readRow(record.id); }); });
  await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.'); await expect(notesCell(page, 'task-2')).toHaveText('sin vista');
  expect(await num(page, '__queueReads')).toBe(1); const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('doble clic en Guardar: un solo PATCH y ningún aviso falso de «ya hay un guardado»', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', false);
  await openAndEdit(page, 'task-2', { notes: 'una sola vez' });
  await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(b => /Guardar cambios/.test(b.textContent ?? ''))!; button.click(); button.click(); button.click(); });
  await expect.poll(() => held.produced()).toBe(1); expect(await ops(page)).toHaveLength(1); await expect(dialog(page)).not.toContainText('ya tiene un guardado sin resolver');
  held.release(); await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('busy: reabrir la MISMA tarea con un guardado en vuelo y guardar otra vez → no se envía nada, el borrador se conserva y se remite a la superficie', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', false);
  await openAndEdit(page, 'task-2', { notes: 'primera' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await trigger(page, 'task-2').click(); await expect(field(page, 'Notas')).toBeVisible(); await field(page, 'Notas').fill('segunda'); await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Esta tarea ya tiene un guardado sin resolver' })).toBeVisible(); await expect(dialog(page)).toContainText('No se ha enviado nada y tu borrador se conserva');
  await expect(field(page, 'Notas')).toHaveValue('segunda'); await sleep(300); expect(held.produced()).toBe(1); expect(await ops(page)).toHaveLength(1);
  held.release(); await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  await expect(field(page, 'Notas')).toHaveValue('segunda');                                // el borrador sigue ahí; guardarlo ahora sería una decisión nueva
});

test('dos tareas HOMÓNIMAS y llegada tardía: cada resultado queda unido a su ID y una respuesta tardía no toca la ficha de la otra', async ({ page }) => {
  const srv = await start(); await open(page, srv);
  const held = await holdAck(page, 'task-2', true);
  await openAndEdit(page, 'task-2', { notes: 'de A' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
  await openAndEdit(page, 'task-3', { notes: 'de B' }); await expect(dialog(page).locator('.ltf-context')).toContainText('task-3'); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();   // task-3 NO queda bloqueada por task-2
  held.release();                                                                               // llega (perdida) la respuesta de task-2 con la ficha de task-3 abierta
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó');
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); await expect(dialog(page).locator('.ltf-context')).toContainText('task-3'); await expect(dialog(page)).not.toContainText('No se sabe si');
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click();
  await expect(item(page, 'task-2')).toContainText('(task-2)'); await expect(item(page, 'task-3')).toHaveCount(0);                // lo de task-3 ya se vio y no deja aviso
  const counts = await srv.counts(); expect(counts.patches).toBe(2); expect(counts.changes.map(c => c.id).sort()).toEqual(['task-2', 'task-3']);
  expect(await ops(page)).toEqual([expect.objectContaining({ task: 'task-2', status: 'uncertain' })]);
});

test('422 real: el servidor rechaza la relación; la ficha conserva el borrador, muestra el campo y no deja un aviso duplicado', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  const select = dialog(page).locator('select#ltf-f-contact_id'); await expect(select.locator('option')).not.toHaveCount(2);
  await select.selectOption({ index: 3 }); const chosen = await select.inputValue(); expect(chosen).toMatch(/^contact-/);
  await field(page, 'Notas').fill('nota nueva'); await srv.call({ op: 'delete-record', entity: 'contacts', id: chosen });
  await saveButton(page).click();
  await expect(dialog(page).getByText('El registro relacionado no existe.')).toBeVisible(); await expect(dialog(page)).toContainText('El servidor rechazó algunos valores'); await expect(field(page, 'Notas')).toHaveValue('nota nueva');
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(0); expect(counts.task.notes).not.toBe('nota nueva');
  expect(await ops(page)).toEqual([]);                                                                              // la ficha se hizo cargo del aviso
});

test('409 real (devolución en curso): conserva el borrador; guardar otra vez es una decisión nueva', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await openAndEdit(page, 'task-2', { status: 'completed' });
  await srv.call({ op: 'return-busy', value: true }); await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Espera a que termine la devolución revisada.' })).toBeVisible(); await expect(dialog(page)).toContainText('tu borrador se conserva');
  await expect(field(page, 'Estado')).toHaveValue('completed'); expect((await srv.counts()).changes).toHaveLength(0); expect((await srv.counts()).patches).toBe(1); expect(await ops(page)).toEqual([]);
  await sleep(400); expect((await srv.counts()).patches).toBe(1);                                                    // nada se reintenta solo
  await srv.call({ op: 'return-busy', value: false }); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); const counts = await srv.counts(); expect(counts.changes).toHaveLength(1); expect(counts.patches).toBe(2);
});

test('409 real MIENTRAS la ficha está cerrada: el rechazo queda en la superficie con lo escrito y sin «Reenviar»', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await srv.call({ op: 'return-busy', value: true });
  const held = await holdBeforeServer(page, 'task-2');
  await openAndEdit(page, 'task-2', { notes: 'durante la devolución' }); await saveButton(page).click(); await expect.poll(() => held.reached()).toBe(1);
  await page.keyboard.press('Escape'); held.release();
  await expect(item(page, 'task-2')).toContainText('No se guardó'); await expect(item(page, 'task-2')).toContainText('conflicto'); await expect(item(page, 'task-2').locator('.ltso-written')).toContainText('Notas');
  await expect(item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0);
  await sleep(300); expect((await srv.counts()).patches).toBe(1); expect((await srv.counts()).changes).toHaveLength(0);
});

test('404 antes de enviar: la tarea no se recrea, lo escrito se conserva a la vista y no sale ningún PATCH', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2', 'task-3']);
  await openAndEdit(page, 'task-3', { notes: 'texto largo que no debe perderse' }); await srv.call({ op: 'delete-record', entity: 'tasks', id: 'task-3' }); await saveButton(page).click();
  await expect(dialog(page)).toContainText('Esta tarea ya no existe en esta copia'); await expect(dialog(page)).toContainText('Notas: texto largo que no debe perderse');
  const counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0); expect(await ops(page)).toEqual([]);
});

test('404 DESPUÉS de enviar (la tarea desaparece entre la comprobación y el PATCH): rechazo, no «guardado», borrador visible', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await openAndEdit(page, 'task-2', { notes: 'se borra en medio' });
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { await srv.call({ op: 'delete-record', entity: 'tasks', id: 'task-2' }); await route.fallback(); });
  await saveButton(page).click();
  await expect(dialog(page)).toContainText('Esta tarea ya no existe en esta copia'); await expect(dialog(page)).toContainText('Notas: se borra en medio'); await expect(dialog(page)).not.toContainText('Cambios guardados');
  expect((await srv.counts()).changes).toHaveLength(0);
});

test('401 real: se respeta el bloqueo, no se envía nada y el borrador permanece', async ({ page, context }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await openAndEdit(page, 'task-2', { notes: 'borrador protegido' });
  await expect(dialog(page).getByText(/Se muestran 24 de 24 resultados/)).toBeVisible(); await page.waitForLoadState('networkidle'); await sleep(400);
  expect(await post(page, '/api/v2/auth/setup', { password: 'una contraseña local larga' })).toBe(200); await context.clearCookies();
  await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'La sesión está bloqueada' })).toBeVisible(); await expect(field(page, 'Notas')).toHaveValue('borrador protegido');
  expect(await num(page, '__locked')).toBeGreaterThan(0); expect((await srv.call({ op: 'counts' })).patches).toBe(0); expect(await ops(page)).toEqual([]);
});

test('otra pestaña editó el mismo campo: aviso previo desde el gestor (no se envió), el borrador se rebasa y guardar de nuevo es explícito', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await openAndEdit(page, 'task-2', { notes: 'mi nota' });
  await srv.call({ op: 'edit', entity: 'tasks', id: 'task-2', values: { notes: 'nota de otra pestaña', status: 'completed' } }); await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Otra edición cambió esta tarea' })).toBeVisible(); await expect(dialog(page)).toContainText('No se ha guardado nada.');
  await expect(dialog(page).locator('#ltf-f-notes-note')).toContainText('nota de otra pestaña'); await expect(field(page, 'Notas')).toHaveValue('mi nota'); await expect(field(page, 'Estado')).toHaveValue('completed');
  expect((await srv.counts('task-2')).patches).toBe(0); expect(await ops(page)).toEqual([]);
  await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.task.notes).toBe('mi nota');
});

test('cambio de captura (misma ID, otra fecha) con el guardado incierto: la lectura es de otra copia; sin «Aceptar» ni reenvío; solo lecturas', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); const held = await holdAck(page, 'task-2', true);
  await openAndEdit(page, 'task-2', { status: 'completed' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); held.release();
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await srv.call({ op: 'replace' }); const before = (await srv.counts()).patches;
  await item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item(page, 'task-2')).toContainText('otra copia y no sirve como evidencia'); await expect(item(page, 'task-2').getByRole('button', { name: /Aceptar el estado leído/ })).toHaveCount(0);
  await expect(item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0); expect((await srv.counts()).patches).toBe(before);
});

test('«Volver al formulario» tras comprobar: el intento deja de seguirse a propósito, el borrador se rebasa y guardar de nuevo es un guardado nuevo', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let drop = true;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { if (drop) await route.abort('connectionreset'); else await route.fallback(); });   // el PATCH nunca llega
  await openAndEdit(page, 'task-2', { notes: 'no llegó' }); await saveButton(page).click();
  await expect(dialog(page).getByText('No se sabe si el guardado llegó a aplicarse')).toBeVisible(); await expect(dialog(page)).toContainText('tu cambio no consta aplicado');
  expect((await srv.counts()).patches).toBe(0); await expect(dialog(page).getByRole('button', { name: 'Aceptar el estado leído' })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Volver al formulario' }).click(); await expect(field(page, 'Notas')).toHaveValue('no llegó'); expect(await ops(page)).toEqual([]);
  drop = false; await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('sin la prop `outcomes` la ficha es la de siempre: sin gestor, avisa antes de salir con un guardado en curso y usa su propio onSaved', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2'], SIZE, '&legacy=1');
  const held = await holdAck(page, 'task-2', false);
  await openAndEdit(page, 'task-2', { notes: 'sin gestor' }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog(page).getByText('Hay un guardado en curso')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Seguir aquí' }).click(); held.release();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.');
  expect(await num(page, '__onSaved')).toBe(1); expect(await num(page, '__queueReads')).toBe(0); await expect(surface(page)).toHaveCount(0);
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
  test('diseño ' + size.width + ' px: guardado en curso, incierto y aceptado en la ficha real; sin desbordamiento, objetivos, teclado y capturas', async ({ page }, testInfo) => {
    const srv = await start(); await open(page, srv, ['task-4'], size); const held = await holdAck(page, 'task-4', true);
    await openAndEdit(page, 'task-4', { notes: 'larga-' + 'x'.repeat(90) }); await saveButton(page).click(); await expect.poll(() => held.produced()).toBe(1);
    const metrics = () => page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.modal.modal-side')!, box = panel.getBoundingClientRect(), mobile = window.innerWidth < 600;
      const outside = [...panel.querySelectorAll('.ltf *')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); }).map(node => node.tagName + '.' + String((node as HTMLElement).className)).slice(0, 5);
      const small = [...panel.querySelectorAll('.ltf button, .ltf summary')].filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height < (mobile ? 43.5 : 31.5)).map(node => (node.textContent ?? '').trim().slice(0, 30));
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: panel.scrollWidth - panel.clientWidth, outside, small };
    });
    const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
    const shoot = async (name: string) => { const file = path.join(shots, name + '-' + size.width + '.png'); await page.screenshot({ path: file }); await testInfo.attach(name + '-' + size.width, { path: file, contentType: 'image/png' }); };
    await expect(dialog(page).locator('#ltf-status')).toContainText('Resultados de guardado'); let m = await metrics(); expect(m.page).toBeLessThanOrEqual(0); expect(m.panel).toBeLessThanOrEqual(0); expect(m.outside).toEqual([]); expect(m.small).toEqual([]); await shoot('en-curso');
    held.release(); await expect(dialog(page).getByText('No se sabe si el guardado llegó a aplicarse')).toBeVisible(); await expect(dialog(page)).toContainText('La lectura muestra que la tarea ya tiene los valores');
    m = await metrics(); expect(m.page).toBeLessThanOrEqual(0); expect(m.panel).toBeLessThanOrEqual(0); expect(m.outside).toEqual([]); expect(m.small).toEqual([]); await shoot('incierto');
    // Teclado: la ficha deja el foco en el aviso; Tab llega a «Aceptar el estado leído» y Enter lo activa.
    for (let i = 0; i < 12 && !(await page.evaluate(() => (document.activeElement?.textContent ?? '').trim() === 'Aceptar el estado leído')); i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (document.activeElement?.textContent ?? '').trim())).toBe('Aceptar el estado leído'); await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('heading', { name: 'Estado leído y aceptado por ti' })).toBeVisible(); await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('ltf-ack');
    m = await metrics(); expect(m.page).toBeLessThanOrEqual(0); expect(m.panel).toBeLessThanOrEqual(0); expect(m.outside).toEqual([]); expect(m.small).toEqual([]); await shoot('aceptado');
    await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    expect((await srv.counts()).patches).toBe(1);
  });
}
