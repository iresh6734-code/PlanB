import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Unidad 136 (D7). DOM real en Chromium limpio contra el servidor REAL de Plan B (createBaseApp + Store en memoria, proceso hijo propio,
// 127.0.0.1 puerto efímero, red externa bloqueada). El montaje es un ARNÉS: una página de «Hoy» con una mini-ficha propia (NO la ficha
// 123 ni la App) que entrega cada guardado al gestor y se CIERRA al instante, más la superficie persistente TaskSaveOutcomesPanel. Los
// fallos de red se fabrican con barreras sobre page.route (se deja pasar la petición al servidor real y se retiene/pierde la RESPUESTA).
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_TS136_ROOT ?? path.join(repo, 'tests', '.tmp', 'taskuncertainty136-' + randomUUID()));
const rel = (target: string) => path.relative(root, path.join(repo, target)).replace(/\\/g, '/');
const PASSWORD = 'una contraseña local larga';
const SERVER = `import { createBaseApp } from '${rel('server/app.ts')}';
import { makeFixture, makeDemoSpec } from '${rel('shared/fixtures.ts')}';
import fs from 'node:fs'; import path from 'node:path';
const root = process.env.TS_ROOT!;
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
import { TaskSaveOutcomesPanel } from ${src('TaskSaveOutcomes.tsx')};
import { createTaskSaveOutcomes, legacyStrategy } from ${src('task-save-outcome.ts')};
import { browserTransport, loadTask } from ${src('local-task-focus-client.ts')};
import { buildPatch } from ${src('../shared/local-task-focus.ts')};
import ${src('styles.css')}; import ${src('refinements.css')}; import ${src('sales.css')}; import ${src('team.css')};
import ${src('integrations.css')}; import ${src('design-system.css')}; import ${src('planb-ui.css')};
const w = window as any; w.__queueReads = 0; w.__locked = 0; window.addEventListener('planb:locked', () => { w.__locked++; });
const controller = createTaskSaveOutcomes({ strategy: legacyStrategy(browserTransport()), onConfirmed: async record => { w.__queueReads++; await w.__readRow(record.id); } });
w.__controller = controller;
function MiniFicha({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState<any>(null), [error, setError] = useState(''), [status, setStatus] = useState(''), [notes, setNotes] = useState('');
  useEffect(() => { const abort = new AbortController(); loadTask(taskId, abort.signal).then((result: any) => { if (result.kind !== 'ok') { setError(result.kind); return; } setLoaded(result); setStatus(String(result.record.values.status ?? '')); setNotes(String(result.record.values.notes ?? '')); }).catch((e: Error) => setError(e.message)); return () => abort.abort(); }, [taskId]);
  const save = () => {
    const entity = loaded.schema.entity, patch = buildPatch(entity, loaded.record, { ...loaded.record.values, status, notes });
    const submission = controller.submit({ taskId, taskLabel: String(loaded.record.values.subject) + ' (' + taskId + ')', baseline: loaded.record, entity, patch, context: loaded.context });
    w.__submission = submission.kind; onClose();                                  // la ficha se cierra al entregar la operación
  };
  return <section role="dialog" aria-label={'Ficha de ' + taskId} className="mini">
    {error ? <p role="alert">{error}</p> : !loaded ? <p>Leyendo…</p> : <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>Estado <select value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pendiente</option><option value="completed">Completada</option></select></label>
      <label>Notas <input value={notes} onChange={event => setNotes(event.target.value)} /></label>
      <button type="submit">Guardar y cerrar</button> <button type="button" onClick={onClose}>Cancelar</button></form>}
  </section>;
}
function Today() {
  const ids = (new URLSearchParams(location.search).get('tasks') ?? '').split(',').filter(Boolean);
  const [rows, setRows] = useState<Record<string, any>>({}), [open, setOpen] = useState<string | null>(null);
  const read = async (id: string) => { const response = await fetch('/api/v2/records/tasks/' + encodeURIComponent(id)); if (!response.ok) throw new Error(String(response.status)); const { record } = await response.json(); setRows(previous => ({ ...previous, [id]: record.values })); };
  w.__readRow = read; w.__open = (id: string) => setOpen(id);
  useEffect(() => { ids.forEach(id => void read(id).catch(() => undefined)); }, []);
  return <div className="app-shell"><aside className="sidebar"><div className="brand">Plan <span>B</span></div></aside><main id="main-content" className="main-content">
    <h1>Hoy</h1>
    <ul>{ids.map(id => <li key={id}><span>{rows[id]?.subject ?? id}</span> · <span data-testid={'status-' + id}>{rows[id]?.status ?? '…'}</span> · <span data-testid={'notes-' + id}>{rows[id]?.notes ?? ''}</span> <button onClick={() => setOpen(id)}>Abrir tarea {id}</button></li>)}</ul>
    <TaskSaveOutcomesPanel controller={controller} onOpenTask={id => setOpen(id)} />
    {open ? <MiniFicha key={open} taskId={open} onClose={() => setOpen(null)} /> : null}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Today />);
`;
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const srcDir = process.env.PLANB_TS136_SRC ? path.resolve(process.env.PLANB_TS136_SRC) : path.join(repo, 'src');   // solo para pruebas de mutación
  const src = (name: string) => JSON.stringify(path.join(srcDir, name).replace(/\\/g, '/'));
  fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY(src)); fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
});

interface Srv { base: string; call: (body: object) => Promise<any>; counts: (id?: string) => Promise<{ patches: number; changes: any[]; task: any }>; stop: () => Promise<void>; }
const live: Srv[] = [];
async function start(): Promise<Srv> {
  const log = path.join(root, 'server-' + Date.now() + '-' + live.length + '.log');
  const child: ChildProcess = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')], { cwd: repo, env: { ...process.env, TS_ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
async function open(page: Page, srv: Srv, tasks = ['task-2', 'task-3'], size = SIZE) {
  await page.setViewportSize(size);
  await page.route('**/*', async route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') await route.abort(); else await route.fallback(); });
  await page.goto(srv.base + '/?tasks=' + tasks.join(','));
  await expect(page.getByTestId('status-' + tasks[0])).not.toHaveText('…');
}
const surface = (page: Page) => page.getByRole('region', { name: 'Resultados de guardado de tareas' });
const item = (page: Page, taskId: string) => surface(page).locator('li.ltso-item[data-task="' + taskId + '"]');
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const mini = (page: Page) => page.getByRole('dialog');
async function saveAndClose(page: Page, id: string, edit: { status?: string; notes?: string }) {
  await page.getByRole('button', { name: 'Abrir tarea ' + id }).click(); await expect(mini(page).getByLabel('Estado')).toBeVisible();
  if (edit.status) await mini(page).getByLabel('Estado').selectOption(edit.status); if (edit.notes !== undefined) await mini(page).getByLabel('Notas').fill(edit.notes);
  await mini(page).getByRole('button', { name: 'Guardar y cerrar' }).click(); await expect(mini(page)).toHaveCount(0);
}
/** El servidor APLICA el PATCH; la respuesta se retiene y luego se pierde (`lose`) o se entrega. */
async function holdAck(page: Page, taskId: string, lose: boolean) {
  const barrier = gate(); let produced = 0;
  await page.route('**/api/records/tasks/' + taskId, async (route: Route) => { let response; try { response = await route.fetch(); } catch { await route.abort().catch(() => undefined); return; } produced++; await barrier.promise; if (lose) await route.abort('connectionreset').catch(() => undefined); else await route.fulfill({ response }).catch(() => undefined); });
  return { release: barrier.release, produced: () => produced };
}
const post = (page: Page, url: string, body?: object) => page.evaluate(async ([target, payload]) => (await fetch(target as string, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : { method: 'POST' })).status, [url, body ?? null] as const);
const status = (page: Page, taskId: string) => page.getByTestId('status-' + taskId);

test('D7: PATCH aplicado, ficha cerrada, acuse perdido → la superficie sigue mostrando «en curso» y luego INCIERTO; no se reenvía; comprobar solo lee; aceptar es decisión humana', async ({ page }, testInfo) => {
  const srv = await start(); await open(page, srv);
  const held = await holdAck(page, 'task-2', true);
  await saveAndClose(page, 'task-2', { status: 'completed' });
  await expect.poll(() => held.produced()).toBe(1);
  await expect(item(page, 'task-2')).toContainText('Guardando'); await expect(item(page, 'task-2')).toContainText('no se puede cancelar'); await expect(mini(page)).toHaveCount(0);
  held.release();
  await expect(item(page, 'task-2').getByRole('alert')).toContainText('No se sabe si se guardó'); await expect(item(page, 'task-2')).toContainText('No se ha reenviado nada por cuenta propia');
  await sleep(600); let counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  await expect(item(page, 'task-2').locator('.ltso-written')).toContainText('Estado: completed'.slice(0, 7));
  await page.screenshot({ path: path.join(root, 'incierto-1440.png') }); await testInfo.attach('incierto-1440', { path: path.join(root, 'incierto-1440.png'), contentType: 'image/png' });
  await item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item(page, 'task-2')).toContainText('No distingue si los aplicó tu envío o una edición idéntica'); counts = await srv.counts('task-2'); expect(counts.patches).toBe(1);
  await item(page, 'task-2').getByRole('button', { name: /Aceptar el estado leído/ }).click();
  await expect(item(page, 'task-2')).toContainText('Estado leído y aceptado por ti'); await expect(item(page, 'task-2')).toContainText('no confirmó tu envío'); await expect(item(page, 'task-2')).not.toContainText('Guardado confirmado');
  await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.'); await expect(status(page, 'task-2')).toHaveText('completed');
  counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('PATCH confirmado DESPUÉS de cerrar la ficha: se muestra «Guardado confirmado» y la cola se actualiza solo por lectura', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']);
  const held = await holdAck(page, 'task-2', false); await saveAndClose(page, 'task-2', { notes: 'tras cerrar' }); await expect.poll(() => held.produced()).toBe(1);
  await expect(status(page, 'task-2')).toHaveText('pending'); held.release();
  await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.');
  await expect(page.getByTestId('notes-task-2')).toHaveText('tras cerrar'); expect(await page.evaluate(() => (window as any).__queueReads)).toBe(1);
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('la recarga de la cola falla: el guardado sigue CONFIRMADO, el aviso es persistente y reintentar solo lee', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let broken = false;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); broken = true; await route.fulfill({ response }); });
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await saveAndClose(page, 'task-2', { notes: 'guardada' });
  await expect(item(page, 'task-2').getByRole('alert')).toContainText('La cola de Hoy no se actualizó'); await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); await expect(item(page, 'task-2')).not.toContainText('No se guardó');
  await expect(page.getByTestId('notes-task-2')).not.toHaveText('guardada');
  let counts = await srv.counts(); expect(counts.patches).toBe(1);
  broken = false; await item(page, 'task-2').getByRole('button', { name: /Reintentar la actualización/ }).click();
  await expect(item(page, 'task-2')).toContainText('La cola de Hoy está actualizada.'); await expect(page.getByTestId('notes-task-2')).toHaveText('guardada');
  counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('PATCH que NUNCA llegó: no se declara guardado; «Comprobar» dice sin cambios; reenviar es una acción explícita que crea un intento nuevo', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let drop = true;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { if (drop) await route.abort('connectionreset'); else await route.fallback(); });
  await saveAndClose(page, 'task-2', { notes: 'no llegó' });
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await expect(item(page, 'task-2')).not.toContainText('Guardado confirmado'); expect((await srv.counts()).patches).toBe(0);
  await expect(item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0);                  // sin evidencia no se ofrece
  await item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item(page, 'task-2')).toContainText('sin tu cambio'); await expect(item(page, 'task-2')).not.toContainText('Guardado confirmado'); expect((await srv.counts()).patches).toBe(0);
  drop = false; await item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ }).click();
  await expect(item(page, 'task-2')).toContainText('Intento 2'); await expect(item(page, 'task-2')).toContainText('Guardado confirmado');
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1); await expect(surface(page).locator('li.ltso-item')).toHaveCount(1);
});

test('cierre, otra tarea HOMÓNIMA y llegada tardía: cada resultado queda unido a su ID', async ({ page }) => {
  const srv = await start(); await open(page, srv);
  const held = await holdAck(page, 'task-2', true); await saveAndClose(page, 'task-2', { notes: 'de A' }); await expect.poll(() => held.produced()).toBe(1);
  await saveAndClose(page, 'task-3', { notes: 'de B' });
  await expect(item(page, 'task-3')).toContainText('Guardado confirmado'); await expect(item(page, 'task-2')).toContainText('Guardando');
  held.release(); await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await expect(item(page, 'task-3')).toContainText('Guardado confirmado');
  await expect(item(page, 'task-2')).toContainText('(task-2)'); await expect(item(page, 'task-3')).toContainText('(task-3)');
  const counts = await srv.counts(); expect(counts.patches).toBe(2); expect(counts.changes.map(c => c.id).sort()).toEqual(['task-2', 'task-3']);
});

test('cambio de captura (misma ID, otra fecha) tras el acuse perdido: la lectura es de otra copia, sin «Aceptar» ni «Reenviar»', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); const held = await holdAck(page, 'task-2', true);
  await saveAndClose(page, 'task-2', { status: 'completed' }); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await srv.call({ op: 'replace' });
  const patchesBefore = (await srv.counts()).patches;
  await item(page, 'task-2').getByRole('button', { name: /Comprobar ahora/ }).click();
  await expect(item(page, 'task-2')).toContainText('otra copia y no sirve como evidencia');
  await expect(item(page, 'task-2').getByRole('button', { name: /Aceptar el estado leído/ })).toHaveCount(0); await expect(item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0);
  expect((await srv.counts()).patches).toBe(patchesBefore);
});

test('doble envío de la misma tarea: el gestor rechaza el segundo (un solo PATCH); lo que sigue siendo del servidor se declara', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); const held = await holdAck(page, 'task-2', false);
  await saveAndClose(page, 'task-2', { notes: 'una vez' }); await expect.poll(() => held.produced()).toBe(1);
  const second = await page.evaluate(async () => { const c = (window as any).__controller, op = c.list()[0]; return c.submit({ taskId: op.taskId, taskLabel: op.taskLabel, baseline: op.baseline, entity: { fields: [] }, patch: { notes: 'otra vez' }, context: op.context }).kind; });
  expect(second).toBe('busy'); held.release(); await expect(item(page, 'task-2')).toContainText('Guardado confirmado'); expect((await srv.counts()).patches).toBe(1);
});

test('409, 422, 404 y 401: estados honestos, lo escrito se conserva a la vista y nada se reintenta solo', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2', 'task-3', 'task-4', 'task-5']);
  await srv.call({ op: 'return-busy', value: true }); await saveAndClose(page, 'task-2', { notes: 'durante la devolución' }); await expect(item(page, 'task-2')).toContainText('No se guardó'); await srv.call({ op: 'return-busy', value: false });
  await expect(item(page, 'task-2')).toContainText('No se guardó'); await expect(item(page, 'task-2')).toContainText('conflicto'); await expect(item(page, 'task-2').locator('.ltso-written')).toContainText('Notas: durante la devolución'.slice(0, 6));
  await saveAndClose(page, 'task-3', { notes: 'x'.repeat(10_001) }); await expect(item(page, 'task-3')).toContainText('No se guardó'); await expect(item(page, 'task-3')).toContainText('demasiado largo');
  await page.getByRole('button', { name: 'Abrir tarea task-4' }).click(); await expect(mini(page).getByLabel('Estado')).toBeVisible(); await mini(page).getByLabel('Notas').fill('borrada');
  await srv.call({ op: 'delete-record', entity: 'tasks', id: 'task-4' }); await mini(page).getByRole('button', { name: 'Guardar y cerrar' }).click();
  await expect(item(page, 'task-4')).toContainText('No se envió'); await expect(item(page, 'task-4')).toContainText('ya no existe');
  await sleep(400); const counts = await srv.counts(); expect(counts.patches).toBe(2); expect(counts.changes).toHaveLength(0);
  await expect(item(page, 'task-2').getByRole('button', { name: /Reenviar el guardado/ })).toHaveCount(0);   // un rechazo del servidor no se reenvía a ciegas
  // 401: la ficha se abre con sesión válida, la sesión se bloquea y al guardar la comprobación previa corta el envío («No se envió»).
  expect(await post(page, '/api/v2/auth/setup', { password: PASSWORD })).toBe(200);
  await page.getByRole('button', { name: 'Abrir tarea task-5' }).click(); await expect(mini(page).getByLabel('Estado')).toBeVisible(); await mini(page).getByLabel('Notas').fill('con la sesión bloqueada');
  expect(await post(page, '/api/v2/auth/lock')).toBe(200); await mini(page).getByRole('button', { name: 'Guardar y cerrar' }).click();
  await expect(item(page, 'task-5')).toContainText('No se envió'); await expect(item(page, 'task-5')).toContainText('bloqueada'); expect(await page.evaluate(() => (window as any).__locked)).toBeGreaterThan(0);
  expect((await srv.counts()).patches).toBe(2);
  expect(await post(page, '/api/v2/auth/login', { password: PASSWORD })).toBe(200);                                 // reenviar es explícito y solo cuando consta que no salió
  await item(page, 'task-5').getByRole('button', { name: /Reenviar el guardado/ }).click(); await expect(item(page, 'task-5')).toContainText('Guardado confirmado');
  expect((await srv.counts()).patches).toBe(3);
});

test('solo memoria: nada se guarda en el navegador y recargar la página pierde el seguimiento (el servidor conserva el cambio)', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); const held = await holdAck(page, 'task-2', true);
  await saveAndClose(page, 'task-2', { status: 'completed' }); await expect.poll(() => held.produced()).toBe(1); held.release();
  await expect(item(page, 'task-2')).toContainText('No se sabe si se guardó'); await expect(surface(page)).toContainText('solo mientras esta ventana siga abierta'); await expect(surface(page)).toContainText('no se guarda nada en el navegador');
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, idb: (await (indexedDB as any).databases?.())?.length ?? 0 }))).toEqual({ local: 0, session: 0, idb: 0 });
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.reload(); await expect(page.getByTestId('status-task-2')).not.toHaveText('…');
  await expect(surface(page)).toHaveCount(0);                                                                   // el seguimiento se perdió: límite real
  const counts = await srv.counts('task-2'); expect(counts.changes).toHaveLength(1); await expect(status(page, 'task-2')).toHaveText('completed');
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
  test('diseño ' + size.width + ' px: superficie con incierto, rechazado y cola fallida; sin desbordamiento, objetivos, teclado y capturas', async ({ page }, testInfo) => {
    const srv = await start(); await open(page, srv, ['task-2', 'task-3', 'task-4'], size); let broken = false;
    await page.route('**/api/records/tasks/task-4', async (route: Route) => { const response = await route.fetch(); await route.abort('connectionreset'); void response; });   // aplica y pierde el acuse
    await page.route('**/api/records/tasks/task-3', async (route: Route) => { const response = await route.fetch(); broken = true; await route.fulfill({ response }); });
    await page.route(/\/api\/v2\/records\/tasks\/task-3$/, async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
    await srv.call({ op: 'return-busy', value: true }); await saveAndClose(page, 'task-2', { notes: 'rechazada ' + 'larga '.repeat(30) }); await expect(item(page, 'task-2')).toContainText('No se guardó'); await srv.call({ op: 'return-busy', value: false });
    await saveAndClose(page, 'task-3', { notes: 'cola' }); await saveAndClose(page, 'task-4', { notes: 'incierta-' + 'x'.repeat(80) });
    await expect(item(page, 'task-2')).toContainText('No se guardó'); await expect(item(page, 'task-3')).toContainText('La cola de Hoy no se actualizó'); await expect(item(page, 'task-4')).toContainText('No se sabe si se guardó');
    // Teclado: Tab llega a «Comprobar ahora» de task-4 y Enter lo activa; todos los botones tienen nombre propio por tarea.
    for (let i = 0; i < 60 && !(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('Comprobar ahora'))); i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toContain('Comprobar ahora: Preparar'); await page.keyboard.press('Enter');
    await expect(item(page, 'task-4')).toContainText('No distingue si los aplicó');
    const layout = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('.ltso')!, width = document.documentElement.clientWidth, box = region.getBoundingClientRect(), mobile = window.innerWidth < 600;
      const outside = [...region.querySelectorAll('*')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); }).map(node => node.tagName + '.' + String((node as HTMLElement).className)).slice(0, 5);
      const small = [...region.querySelectorAll('button, summary')].filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height < (mobile ? 43.5 : 31.5)).map(node => (node.textContent ?? '').trim().slice(0, 30));
      const names = [...region.querySelectorAll('button')].map(node => node.getAttribute('aria-label') ?? node.textContent ?? '');
      return { scroll: document.documentElement.scrollWidth, width, outside, small, unnamed: names.filter(name => !name.trim()).length, duplicates: names.length - new Set(names).size };
    });
    expect(layout.scroll).toBeLessThanOrEqual(layout.width); expect(layout.outside).toEqual([]); expect(layout.small).toEqual([]); expect(layout.unnamed).toBe(0); expect(layout.duplicates).toBe(0);
    fs.mkdirSync(path.join(root, 'shots'), { recursive: true }); const file = path.join(root, 'shots', 'superficie-' + size.width + '.png'); await page.screenshot({ path: file, fullPage: true });
    await testInfo.attach('superficie-' + size.width, { path: file, contentType: 'image/png' });
  });
}

test('F1 (R2 de 147): «Reenviar» un intento no enviado mientras OTRO de la misma tarea está en vuelo → la superficie lo explica, no se envía nada más y ambos intentos se conservan', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); let failRead = false; const barrier = gate(); let reached = 0;
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (failRead) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fallo ficticio"}' }); else await route.fallback(); });
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { reached++; await barrier.promise; await route.fallback(); });
  await page.getByRole('button', { name: 'Abrir tarea task-2' }).click(); await expect(mini(page).getByLabel('Estado')).toBeVisible();
  await mini(page).getByLabel('Notas').fill('intento A'); failRead = true;                                  // la comprobación previa de A falla → «No se envió»
  await mini(page).getByRole('button', { name: 'Guardar y cerrar' }).click();
  const notSent = surface(page).locator('li.ltso-item[data-status="not_sent"]'); await expect(notSent).toContainText('No se envió'); failRead = false;
  await page.evaluate(() => { const c = (window as any).__controller, op = c.list()[0]; (window as any).__sub = c.submit({ taskId: op.taskId, taskLabel: op.taskLabel, baseline: op.baseline, entity: (window as any).__entity ?? { fields: Object.keys(op.fieldLabels).map(key => ({ key, label: op.fieldLabels[key], readOnly: false })) }, patch: { status: 'completed' }, context: op.context }).kind; });
  expect(await page.evaluate(() => (window as any).__sub)).toBe('started'); await expect.poll(() => reached).toBe(1);               // B queda retenida en el transporte
  const before = await page.evaluate(() => JSON.stringify((window as any).__controller.list().map((op: any) => [op.attemptId, op.status, op.supersededBy])));
  await notSent.getByRole('button', { name: /Reenviar el guardado/ }).click();
  await expect(notSent.locator('.ltso-notice')).toContainText('esta tarea ya tiene un guardado en curso o sin resolver');
  expect(await page.evaluate(() => JSON.stringify((window as any).__controller.list().map((op: any) => [op.attemptId, op.status, op.supersededBy])))).toBe(before);
  await sleep(300); expect(reached).toBe(1);
  barrier.release(); await expect(surface(page).locator('li.ltso-item[data-status="confirmed"]')).toBeVisible();
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  await expect(notSent.getByRole('button', { name: /Reenviar el guardado/ })).toBeVisible();                                          // A sigue disponible cuando B se resuelve
});
