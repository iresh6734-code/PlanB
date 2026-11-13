import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// DOM real en Chromium limpio contra el servidor REAL de Plan B (createBaseApp + Store en memoria, proceso hijo propio, 127.0.0.1
// con puerto efímero, red externa bloqueada). El montaje es un arnés mínimo de «Hoy» con filas y callbacks: NO es la App real.
// Los fallos de red (acuse perdido, lectura que falla, respuesta tardía) se inyectan con page.route sobre el servidor real.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_TF123_ROOT ?? path.join(repo, 'tests', '.tmp', 'taskfocus123-' + randomUUID()));
const rel = (target: string) => path.relative(root, path.join(repo, target)).replace(/\\/g, '/');
const SERVER = `import { createBaseApp } from '${rel('server/app.ts')}';
import { makeFixture, makeDemoSpec } from '${rel('shared/fixtures.ts')}';
import fs from 'node:fs'; import path from 'node:path';
const seed = JSON.parse(process.env.TF_SEED!), root = process.env.TF_ROOT!;
const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
let patches = 0; app.addHook('onRequest', async request => { if (request.method === 'PATCH') patches++; });
const gen = (snapshot: any) => store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
if (seed.phase !== 'empty') {
  const snapshot = makeFixture(seed.profile ?? 'agency');
  for (const id of ['task-2', 'task-3']) { const task = snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === id); task.values.subject = 'Llamar a Ana'; task.values.due_date = id === 'task-2' ? '2026-11-05' : '2026-11-09'; }
  for (const edit of seed.edits ?? []) Object.assign(snapshot.records.find((r: any) => r.entity === 'tasks' && r.id === edit.id).values, edit.values);
  store.importSnapshot(snapshot); if (seed.phase === 'active') { gen(snapshot); store.activate(); }
}
const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoy</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(html));
app.get('/out/:file', async (request, reply) => { const file = String((request.params as any).file); if (!/^[\\w.-]+$/.test(file)) return reply.code(404).send(''); return reply.type(file.endsWith('.css') ? 'text/css' : 'text/javascript').send(fs.readFileSync(path.join(root, 'out', file))); });
app.post('/__h/exec', async request => {
  const b = request.body as any;
  if (b.op === 'delete-record') { store.db.prepare('DELETE FROM records WHERE entity=? AND id=?').run(b.entity, b.id); return { ok: true }; }
  if (b.op === 'return-busy') { store.set('returnBusy', !!b.value); return { ok: true }; }
  if (b.op === 'edit') { store.saveRecord(b.entity, b.values, b.id); return { ok: true }; }
  if (b.op === 'replace') { const next = makeFixture('agency'); next.id = store.snapshot!.id; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; }
  if (b.op === 'swap') { const next = makeFixture('distribution'); next.id = 'capture-otra'; next.name = 'Otra captura'; store.importSnapshot(next, true); gen(next); store.activate(); return { ok: true }; }
  if (b.op === 'counts') return { patches, changes: store.changes().map(c => ({ id: c.recordId, entity: c.entity, before: c.before?.values, after: c.after.values })), tasks: store.records('tasks').length, task: b.id ? store.record('tasks', b.id)?.values ?? null : null };
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
const w = window as any; w.__log = []; w.__locked = 0; window.addEventListener('planb:locked', () => { w.__locked++; });
function Today() {
  const ids = (new URLSearchParams(location.search).get('tasks') ?? '').split(',').filter(Boolean);
  const [rows, setRows] = useState<Record<string, any>>({}), [open, setOpen] = useState<string | null>(null), [note, setNote] = useState('');
  const read = async (id: string) => { const response = await fetch('/api/v2/records/tasks/' + encodeURIComponent(id)); if (!response.ok) throw new Error(String(response.status)); const { record } = await response.json(); setRows(previous => ({ ...previous, [id]: record.values })); };
  useEffect(() => { ids.forEach(id => void read(id).catch(() => undefined)); }, []);
  w.__open = (id: string) => setOpen(id); w.__close = () => setOpen(null);
  return <div className="app-shell"><aside className="sidebar"><div className="brand">Plan <span>B</span></div></aside><main id="main-content" className="main-content">
    <h1>Hoy</h1><p role="status">{note}</p>
    <ul>{ids.map(id => <li key={id}><span>{rows[id]?.subject ?? id}</span> · <span data-testid={'due-' + id}>{rows[id]?.due_date ?? '…'}</span> · <span data-testid={'status-' + id}>{rows[id]?.status ?? '…'}</span> · <span data-testid={'notes-' + id}>{rows[id]?.notes ?? ''}</span>
      <button onClick={() => setOpen(id)}>Abrir tarea {id}</button></li>)}</ul>
    {open ? <LocalTaskFocus taskId={open} onClose={() => { w.__log.push('close'); setOpen(null); }} onPrepare={() => { w.__log.push('prepare'); setNote('Preparación abierta'); setOpen(null); }}
      onSaved={async record => { w.__log.push('saved:' + record.id); await read(record.id); }} /> : null}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Today />);
`;

test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const srcDir = process.env.PLANB_TF123_SRC ? path.resolve(process.env.PLANB_TF123_SRC) : path.join(repo, 'src');   // solo para pruebas de mutación
  const src = (name: string) => JSON.stringify(path.join(srcDir, name).replace(/\\/g, '/'));
  fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY(src)); fs.writeFileSync(path.join(root, 'server.mts'), SERVER);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
});

interface Srv { base: string; call: (body: object) => Promise<any>; counts: (id?: string) => Promise<{ patches: number; changes: any[]; tasks: number; task: any }>; stop: () => Promise<void>; }
const live: Srv[] = [];
async function start(seed: { phase?: 'active' | 'imported' | 'empty'; profile?: string; edits?: { id: string; values: Record<string, unknown> }[] } = {}): Promise<Srv> {
  const log = path.join(root, 'server-' + live.length + '-' + Date.now() + '.log');
  const child: ChildProcess = spawn(process.execPath, ['--require', path.join(repo, 'scripts', 'block-external.cjs'), '--import', 'tsx', path.join(root, 'server.mts')],
    { cwd: repo, env: { ...process.env, TF_SEED: JSON.stringify({ phase: 'active', ...seed }), TF_ROOT: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr!.on('data', chunk => fs.appendFileSync(log, chunk));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor de prueba no arrancó (ver ' + log + ')')), 40_000);
    child.stdout!.on('data', chunk => { const match = /LISTEN (\d+)/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor de prueba terminó con código ' + code + ' (ver ' + log + ')')); });
  });
  const base = 'http://127.0.0.1:' + port;
  const call = async (body: object) => (await fetch(base + '/__h/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const server: Srv = { base, call, counts: id => call({ op: 'counts', id }), stop: async () => { if (child.exitCode === null) { child.removeAllListeners('exit'); child.kill(); await new Promise(resolve => child.once('exit', resolve)); } } };
  live.push(server); return server;
}
test.afterEach(async () => { await Promise.all(live.splice(0).map(server => server.stop())); });

const SIZE = { width: 1440, height: 900 };
async function open(page: Page, srv: Srv, tasks: string[] = ['task-2', 'task-3'], size = SIZE) {
  const external: string[] = [];
  await page.setViewportSize(size);
  await page.route('**/*', async route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); await route.abort(); } else await route.fallback(); });
  await page.goto(srv.base + '/?tasks=' + tasks.join(','));
  await expect(page.getByTestId('status-' + tasks[0])).not.toHaveText('…');
  return external;
}
const dialog = (page: Page) => page.getByRole('dialog');
const trigger = (page: Page, id: string) => page.getByRole('button', { name: 'Abrir tarea ' + id });
const field = (page: Page, label: string) => dialog(page).getByLabel(label, { exact: false }).first();
const ackHeading = (page: Page) => dialog(page).getByRole('heading', { name: 'Cambios guardados' });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const log = (page: Page) => page.evaluate(() => (window as any).__log as string[]);
const saveButton = (page: Page) => dialog(page).getByRole('button', { name: /Guardar cambios|Guardando/ });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('abrir por ID, editar con el formulario del producto, guardar y volver a la cola con el acuse', async ({ page }) => {
  const srv = await start(), external = await open(page, srv), bodies: string[] = [];
  page.on('request', request => { if (request.method() === 'PATCH') bodies.push(request.postData() ?? ''); });
  await trigger(page, 'task-3').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAccessibleName('Llamar a Ana');
  await expect(dialog(page).locator('.ltf-context')).toContainText('task-3');
  await expect(dialog(page).locator('.ltf-context')).toContainText('Agencia Norte');
  await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-09');                 // la homónima task-2 tiene 2026-11-05
  expect(await page.evaluate(() => document.querySelector('[role="dialog"]')!.contains(document.activeElement))).toBe(true);
  await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
  await field(page, 'Estado').selectOption('completed'); await field(page, 'Notas').fill('Hecho por teléfono');
  await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  await expect(dialog(page)).toContainText('Estado: Pendiente → Completada'); await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('ltf-ack');
  const counts = await srv.counts('task-3');
  expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
  expect(bodies.map(body => JSON.parse(body))).toEqual([{ values: { status: 'completed', notes: 'Hecho por teléfono' } }]);   // solo los campos cambiados
  expect(counts.changes[0]).toMatchObject({ id: 'task-3', entity: 'tasks', before: { status: 'pending' }, after: { status: 'completed', notes: 'Hecho por teléfono', due_date: '2026-11-09' } });
  await expect(page.getByTestId('status-task-3')).toHaveText('completed');
  await expect(page.getByTestId('status-task-2')).toHaveText('pending');              // la homónima no se toca
  await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(trigger(page, 'task-3')).toBeFocused();                                // foco de retorno en el disparador
  expect(await log(page)).toEqual(['saved:task-3', 'close']); expect(external).toEqual([]);
});

test('teclado: abrir con Enter, validar, guardia de cierre con borrador y retorno del foco', async ({ page }) => {
  const srv = await start(); await open(page, srv);
  await trigger(page, 'task-2').focus(); await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await field(page, 'Asunto').fill(''); await page.keyboard.press('Enter');          // Enter dentro del campo envía el formulario
  await expect(dialog(page).getByText('Completa este campo.').first()).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('ltf-f-subject');
  expect((await srv.counts()).patches).toBe(0);
  await page.keyboard.press('Escape');                                                 // hay cambios: no se pierde nada en silencio
  await expect(dialog(page).getByText('Hay cambios sin guardar')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('ltf-discard');
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
  await expect(field(page, 'Asunto')).toHaveValue('');
  await page.keyboard.press('Escape'); await dialog(page).getByRole('button', { name: 'Descartar y volver a Hoy' }).click();
  await expect(dialog(page)).toHaveCount(0); await expect(trigger(page, 'task-2')).toBeFocused();
  // Sin cambios, Escape cierra directamente.
  await page.keyboard.press('Enter'); await expect(dialog(page)).toBeVisible(); await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0); await expect(trigger(page, 'task-2')).toBeFocused();
  expect((await srv.counts()).changes).toHaveLength(0);
  // Tab no escapa del panel.
  await page.keyboard.press('Enter'); await expect(dialog(page)).toBeVisible();
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.querySelector('[role="dialog"]')!.contains(document.activeElement))).toBe(true); }
});

test('copia importada sin activar: se ve la tarea, se explica qué falta y se ofrece continuar la preparación', async ({ page }) => {
  const srv = await start({ phase: 'imported' }); await open(page, srv);
  await trigger(page, 'task-2').click();
  await expect(dialog(page)).toContainText('importada, pero no activada'); await expect(dialog(page)).toContainText('No se activa de forma silenciosa');
  await expect(dialog(page).getByText('Pendiente')).toBeVisible(); await expect(dialog(page).getByText('2026-11-05'.split('-').reverse().map(Number).join('/'))).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: /Guardar/ })).toHaveCount(0); await expect(dialog(page).locator('input,select')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Continuar la preparación' }).click();
  expect(await log(page)).toEqual(['prepare']);
  const counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0); expect(counts.tasks).toBe(18);
});

test('copia vacía: sin tarea que editar, sin alta implícita', async ({ page }) => {
  const srv = await start({ phase: 'empty' }); await page.setViewportSize(SIZE); await page.goto(srv.base + '/?tasks=task-2'); await trigger(page, 'task-2').click();
  await expect(dialog(page)).toContainText('Todavía no hay una copia en esta instalación');
  await dialog(page).getByRole('button', { name: 'Continuar la preparación' }).click(); expect(await log(page)).toEqual(['prepare']);
  expect((await srv.counts()).tasks).toBe(0);
});

test('404 al abrir y 404 al guardar: la tarea no se recrea y lo escrito se conserva a la vista', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2', 'task-3']);
  await page.evaluate(() => (window as any).__open('no-existe'));
  await expect(dialog(page)).toContainText('Esta tarea ya no existe en esta copia'); await dialog(page).getByRole('button', { name: 'Volver a Hoy' }).click();
  await trigger(page, 'task-3').click(); await field(page, 'Notas').fill('texto largo que no debe perderse');
  await srv.call({ op: 'delete-record', entity: 'tasks', id: 'task-3' });
  await saveButton(page).click();
  await expect(dialog(page)).toContainText('Esta tarea ya no existe en esta copia'); await expect(dialog(page)).toContainText('Notas: texto largo que no debe perderse');
  const counts = await srv.counts(); expect(counts.patches).toBe(0); expect(counts.tasks).toBe(17); expect(counts.changes).toHaveLength(0);
});

test('422 real: el servidor rechaza la relación y el borrador queda intacto', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  const select = dialog(page).locator('select#ltf-f-contact_id'); await expect(select.locator('option')).not.toHaveCount(2);
  await select.selectOption({ index: 3 }); const chosen = await select.inputValue(); expect(chosen).toMatch(/^contact-/);
  await field(page, 'Notas').fill('nota nueva');
  await srv.call({ op: 'delete-record', entity: 'contacts', id: chosen });
  await saveButton(page).click();
  await expect(dialog(page).getByText('El registro relacionado no existe.')).toBeVisible(); await expect(dialog(page)).toContainText('El servidor rechazó algunos valores');
  await expect(field(page, 'Notas')).toHaveValue('nota nueva');
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(0); expect(counts.task.notes).not.toBe('nota nueva');
});

test('409 real (devolución en curso): no sobrescribe y conserva el borrador', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  await field(page, 'Estado').selectOption('completed'); await srv.call({ op: 'return-busy', value: true });
  await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Espera a que termine la devolución revisada.' })).toBeVisible();
  await expect(field(page, 'Estado')).toHaveValue('completed');
  expect((await srv.counts()).changes).toHaveLength(0);
  await srv.call({ op: 'return-busy', value: false }); await saveButton(page).click();     // decisión humana posterior: ahora sí
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); expect((await srv.counts()).changes).toHaveLength(1);
});

test('401 real: se respeta el bloqueo, no se envía nada y el borrador permanece', async ({ page, context }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await field(page, 'Notas').fill('borrador protegido');
  await expect(dialog(page).getByText(/Se muestran 24 de 24 resultados/)).toBeVisible(); await page.waitForLoadState('networkidle'); await sleep(400);   // ReferenceSelect termina sus lecturas: una respuesta tardía con Set-Cookie volvería a abrir la sesión
  const status = await page.evaluate(async () => (await fetch('/api/v2/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'una contraseña local larga' }) })).status);
  expect(status).toBe(200); await context.clearCookies(); expect(await context.cookies()).toHaveLength(0);                                // la sesión desaparece: el servidor real responde 401
  await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'La sesión está bloqueada' })).toBeVisible();
  await expect(field(page, 'Notas')).toHaveValue('borrador protegido');
  expect(await page.evaluate(() => (window as any).__locked)).toBeGreaterThan(0);
  expect((await srv.call({ op: 'counts' })).patches).toBe(0);
  await page.keyboard.press('Escape'); await dialog(page).getByRole('button', { name: 'Descartar y volver a Hoy' }).click();
  await trigger(page, 'task-2').click();                                                   // abrir con la sesión bloqueada: error claro, no «tarea vacía»
  await expect(dialog(page)).toContainText('sesión de Plan B está bloqueada');
});

test('acuse perdido tras aplicar: se declara incierto, se comprueba por lectura y no se reenvía', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { await route.fetch(); await route.abort('connectionreset'); });   // el servidor aplica y el acuse se pierde
  await field(page, 'Estado').selectOption('completed'); await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'No se sabe si el guardado llegó a aplicarse' })).toBeVisible();
  await expect(dialog(page)).toContainText('no se ha reenviado nada por cuenta propia'); await expect(dialog(page)).toContainText('ya tiene los valores que enviaste');
  await expect(dialog(page)).toContainText('No se puede distinguir si los aplicó tu envío o una edición idéntica');
  expect((await srv.counts()).patches).toBe(1); expect((await srv.counts()).changes).toHaveLength(1);
  await dialog(page).getByRole('button', { name: 'Aceptar el estado leído' }).click();
  // F3 (revisión 131): una decisión humana NO se presenta como acuse del servidor.
  await expect(dialog(page).getByRole('heading', { name: 'Estado leído y aceptado por ti' })).toBeVisible(); await expect(dialog(page)).toContainText('no confirmó');
  await expect(dialog(page)).not.toContainText('El servidor confirmó'); await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toHaveCount(0);
  await expect(page.getByTestId('status-task-2')).toHaveText('completed');
  expect((await srv.counts()).patches).toBe(1);
});

test('acuse perdido sin llegar al servidor: la lectura dice «sin cambios» y reenviar es decisión humana', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  let dropped = true; await page.route('**/api/records/tasks/task-2', async (route: Route) => { if (dropped) await route.abort('connectionreset'); else await route.fallback(); });
  await field(page, 'Notas').fill('para reenviar'); await saveButton(page).click();
  await expect(dialog(page)).toContainText('tu cambio no consta aplicado'); expect((await srv.counts()).patches).toBe(0);
  await dialog(page).getByRole('button', { name: 'Volver al formulario' }).click();
  await expect(field(page, 'Notas')).toHaveValue('para reenviar'); expect((await srv.counts()).patches).toBe(0);
  dropped = false; await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); expect((await srv.counts()).patches).toBe(1);
});

test('guardado confirmado y recarga de la cola fallida: no dice «falló el guardado» ni repite el PATCH', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  let broken = false;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); broken = true; await route.fulfill({ response }); });
  await page.route('**/api/v2/records/tasks/task-2', async (route: Route) => { if (broken) await route.abort('connectionreset'); else await route.fallback(); });
  await field(page, 'Estado').selectOption('completed'); await saveButton(page).click();
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'El guardado está confirmado, pero la cola de Hoy no se actualizó' })).toBeVisible();
  await expect(dialog(page)).not.toContainText('No se pudo guardar'); await expect(dialog(page).locator('form')).toHaveCount(0);   // no hay formulario desde el que reenviar
  expect((await srv.counts()).patches).toBe(1); expect((await srv.counts()).changes).toHaveLength(1);
  broken = false; await dialog(page).getByRole('button', { name: 'Reintentar la actualización' }).click();
  await expect(dialog(page)).toContainText('La cola de Hoy está actualizada.'); await expect(page.getByTestId('status-task-2')).toHaveText('completed');
  expect((await srv.counts()).patches).toBe(1); expect((await srv.counts()).changes).toHaveLength(1);
  expect(await log(page)).toEqual(['saved:task-2', 'saved:task-2']);                      // dos avisos de cola, un solo guardado
});

test('doble clic y Enter repetido: un único PATCH y el foco no sale del panel mientras se guarda', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  const hold = gate(); await page.route('**/api/records/tasks/task-2', async (route: Route) => { await hold.promise; await route.fallback(); });
  await field(page, 'Notas').fill('una vez'); const button = saveButton(page);
  await button.dblclick(); await field(page, 'Notas').press('Enter').catch(() => undefined); await button.click({ force: true }).catch(() => undefined);
  await expect(dialog(page).getByText('Guardando…').first()).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('[role="dialog"]')!.contains(document.activeElement))).toBe(true);
  await expect(field(page, 'Notas')).toBeDisabled();
  hold.release(); await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  const counts = await srv.counts(); expect(counts.patches).toBe(1); expect(counts.changes).toHaveLength(1);
});

test('respuesta antigua tardía (transporte sin cancelación) y cambio de tarea con borrador: nada se mezcla', async ({ page }) => {
  await page.addInitScript(() => { const real = window.fetch.bind(window); window.fetch = (input: RequestInfo | URL, init?: RequestInit) => real(input, init ? { ...init, signal: undefined } : init); });
  const srv = await start(); await open(page, srv, ['task-2', 'task-3']);
  const late = gate(); let held = false;
  await page.route('**/api/v2/records/tasks/task-2', async (route: Route) => { if (!held) { held = true; await late.promise; } await route.fallback(); });
  await trigger(page, 'task-2').click();                                                    // la lectura de task-2 queda retenida
  await expect(dialog(page).getByText('Leyendo la tarea…')).toBeVisible();
  await page.evaluate(() => (window as any).__open('task-3'));                              // la selección cambia: task-3 (mismo nombre, otro ID)
  await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-09');
  await field(page, 'Notas').fill('borrador de task-3');
  late.release(); await sleep(400);
  await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-09'); await expect(dialog(page).locator('.ltf-context')).toContainText('task-3');
  await expect(field(page, 'Notas')).toHaveValue('borrador de task-3');
  await page.evaluate(() => (window as any).__open('task-2'));                              // volver a task-2: sin rastro del borrador de task-3
  await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-05'); await expect(field(page, 'Notas')).not.toHaveValue('borrador de task-3');
  expect((await srv.counts()).patches).toBe(0);
});

test('otra pestaña editó el mismo campo: aviso previo, sin sobrescribir, y la garantía real se explica', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click();
  await dialog(page).getByText('Cómo se guarda').click(); await expect(dialog(page)).toContainText('La API actual no compara versiones'); await expect(dialog(page)).toContainText('no es atómica');
  await field(page, 'Notas').fill('mi nota'); await srv.call({ op: 'edit', entity: 'tasks', id: 'task-2', values: { notes: 'nota de otra pestaña', status: 'completed' } });
  await saveButton(page).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Otra edición cambió esta tarea' })).toBeVisible(); await expect(dialog(page)).toContainText('No se ha guardado nada.');
  await expect(dialog(page).locator('#ltf-f-notes-note')).toContainText('nota de otra pestaña'); await expect(field(page, 'Estado')).toHaveValue('completed');   // lo no editado toma el valor nuevo
  expect((await srv.counts('task-2')).patches).toBe(0); expect((await srv.counts('task-2')).task.notes).toBe('nota de otra pestaña');
  await saveButton(page).click();                                                           // decisión explícita tras verlo
  await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(1); expect(counts.task).toMatchObject({ notes: 'mi nota', status: 'completed' }); expect(counts.changes).toHaveLength(2);
});

test('la copia activa cambia con la ficha abierta: no se guarda en la copia equivocada', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await field(page, 'Notas').fill('para la copia anterior');
  await srv.call({ op: 'swap' });
  await saveButton(page).click();
  await expect(dialog(page)).toContainText('Esta ficha ya no corresponde a la copia actual'); await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0); expect(counts.task.notes).not.toBe('para la copia anterior');
});

test('fecha civil frente a instante: el día no se mueve con la zona horaria del navegador', async ({ browser }) => {
  const srv = await start();
  for (const timezoneId of ['Pacific/Auckland', 'America/Los_Angeles']) {
    const context = await browser.newContext({ timezoneId, viewport: SIZE }), page = await context.newPage();
    await page.goto(srv.base + '/?tasks=task-2'); await expect(page.getByTestId('status-task-2')).not.toHaveText('…'); await trigger(page, 'task-2').click();
    await expect(field(page, 'Fecha límite')).toHaveValue((await srv.counts('task-2')).task.due_date);
    await field(page, 'Fecha límite').fill('2026-11-30'); await saveButton(page).click();
    await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible();
    expect((await srv.counts('task-2')).task.due_date).toBe('2026-11-30');
    await srv.call({ op: 'edit', entity: 'tasks', id: 'task-2', values: { due_date: '2026-11-05' } });
    await context.close();
  }
  const last = (await srv.counts()).changes.filter(c => c.id === 'task-2' && c.after.due_date === '2026-11-30');
  expect(last).toHaveLength(2); for (const change of last) expect(change.before.due_date).toBe('2026-11-05');
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
  test('diseño ' + size.width + ' px: nombres y errores largos, sin desbordamiento, objetivos y capturas', async ({ page }, testInfo) => {
    const long = 'Preparar-la-propuesta-integral-con-nombre-larguísimo-'.repeat(4);
    const srv = await start({ edits: [{ id: 'task-4', values: { subject: long, notes: 'Notas '.repeat(120) } }] });
    await open(page, srv, ['task-4'], size); await trigger(page, 'task-4').click(); await expect(dialog(page).locator('form')).toBeVisible();
    fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
    const scenes: [string, () => Promise<void>][] = [
      ['edicion', async () => undefined],
      ['errores', async () => { await field(page, 'Asunto').fill(''); await field(page, 'Fecha límite').fill(''); await saveButton(page).click(); await expect(dialog(page).getByText('Completa este campo.').first()).toBeVisible(); }],
      ['guardado', async () => { await field(page, 'Asunto').fill('Llamar a Ana con un asunto muy largo '.repeat(5)); await field(page, 'Fecha límite').fill('2026-11-12'); await saveButton(page).click(); await expect(dialog(page).getByRole('heading', { name: 'Cambios guardados' })).toBeVisible(); }],
    ];
    for (const [name, step] of scenes) {
      await step(); await sleep(150);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[role="dialog"]')!, width = document.documentElement.clientWidth, mobile = window.innerWidth < 600;
        const rect = panel.getBoundingClientRect(), outside = [...panel.querySelectorAll('.ltf *')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && getComputedStyle(node).position !== 'absolute' && (r.right > rect.right + 1 || r.left < rect.left - 1); }).map(node => node.tagName + '.' + String((node as HTMLElement).className)).slice(0, 5);
        const mine = [...panel.querySelectorAll('.ltf-footer .button, .ltf-actions .button, .ltf-more > summary, .ltf-field > input, .ltf-field > select')].filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height < (mobile ? 43.5 : 31.5)).map(node => (node.textContent ?? '').trim().slice(0, 30));
        const refs = [...panel.querySelectorAll('.reference-picker input, .reference-picker select')].map(node => Math.round(node.getBoundingClientRect().height));
        const footer = panel.querySelector<HTMLElement>('.ltf-footer .button')?.getBoundingClientRect();
        return { width, scroll: document.documentElement.scrollWidth, panelScroll: panel.scrollWidth, panelClient: panel.clientWidth, outside, mine, refs, footerVisible: footer ? footer.bottom <= window.innerHeight + 1 && footer.top >= 0 : true };
      });
      expect(layout.scroll, name).toBeLessThanOrEqual(layout.width); expect(layout.panelScroll, name).toBeLessThanOrEqual(layout.panelClient + 1);
      expect(layout.outside, name + ' fuera del panel').toEqual([]); expect(layout.mine, name + ' objetivos pequeños').toEqual([]); expect(layout.footerVisible, name + ' pie visible').toBe(true);
      testInfo.annotations.push({ type: 'alturas ReferenceSelect (no es de este módulo) ' + name, description: layout.refs.join(',') });
      const file = path.join(root, 'shots', name + '-' + size.width + '.png'); await page.screenshot({ path: file }); await testInfo.attach(name + '-' + size.width, { path: file, contentType: 'image/png' });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Regresiones de la corrección tras la revisión independiente 131 (F1–F4) y de los defectos D1/D2/D3/D5 de la QA-130.
const quiet = (page: Page) => page.waitForLoadState('networkidle');

test('F1: acuse perdido y la copia cambia antes de verificar: la lectura es de otra copia, no hay evidencia ni «Aceptar», borrador intacto, sin reenvío', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await quiet(page); await sleep(300);
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { await route.fetch(); await srv.call({ op: 'replace' }); await route.abort('connectionreset'); });   // se aplica, se sustituye la captura, se pierde el acuse
  await field(page, 'Estado').selectOption('completed'); await saveButton(page).click();
  await expect(dialog(page)).toContainText('No se sabe si el guardado llegó a aplicarse');
  await expect(dialog(page)).toContainText('La copia activa cambió desde que abriste la ficha'); await expect(dialog(page)).toContainText('no sirve como evidencia');
  await expect(dialog(page).getByRole('button', { name: 'Aceptar el estado leído' })).toHaveCount(0); await expect(dialog(page).getByRole('button', { name: 'Volver al formulario' })).toHaveCount(0);
  expect((await srv.counts()).patches).toBe(1);                                                    // el único PATCH fue el original
});

test('F2: otra captura con el MISMO ID y otra fecha sustituye a la abierta: Guardar queda bloqueado y no se escribe en ella', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await quiet(page); await field(page, 'Notas').fill('para la captura anterior');
  await srv.call({ op: 'replace' });
  await saveButton(page).click();
  await expect(dialog(page)).toContainText('Esta ficha ya no corresponde a la copia actual'); await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
  const counts = await srv.counts('task-2'); expect(counts.patches).toBe(0); expect(counts.changes).toHaveLength(0); expect(counts.task.notes).not.toBe('para la captura anterior');
  await expect(field(page, 'Notas')).toHaveValue('para la captura anterior');                    // el texto del usuario sigue ahí
});

test('F4 / D1: con el PATCH en vuelo, salir NO dice «Nada se ha enviado»: avisa de que no se puede cancelar y no habrá resultado aquí', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await quiet(page); await sleep(300);
  const barrier = gate(); let produced = 0;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { await route.fetch(); produced++; await barrier.promise; await route.fallback(); });
  await field(page, 'Notas').fill('en vuelo'); await saveButton(page).click(); await expect.poll(() => produced).toBe(1);
  expect((await srv.counts()).changes).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(dialog(page).getByText('Hay un guardado en curso')).toBeVisible(); await expect(dialog(page)).toContainText('no se puede cancelar'); await expect(dialog(page)).not.toContainText('Nada se ha enviado');
  await expect(dialog(page).getByRole('button', { name: 'Seguir aquí' })).toBeVisible(); await expect(dialog(page).getByRole('button', { name: 'Salir de todos modos' })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'f4-en-vuelo.png') });
  await dialog(page).getByRole('button', { name: 'Seguir aquí' }).click(); barrier.release(); await expect(ackHeading(page)).toBeVisible();
});

test('F4: con el resultado incierto, salir tampoco afirma que no se envió nada', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await quiet(page); await sleep(300);
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { await route.fetch(); await route.abort('connectionreset'); });
  await field(page, 'Estado').selectOption('completed'); await saveButton(page).click(); await expect(dialog(page)).toContainText('ya tiene los valores que enviaste');
  await dialog(page).getByRole('button', { name: 'Cerrar sin guardar' }).click();
  await expect(dialog(page).getByText('El resultado del guardado es incierto')).toBeVisible(); await expect(dialog(page)).toContainText('puede haberse aplicado'); await expect(dialog(page)).not.toContainText('Nada se ha enviado');
  expect((await srv.counts()).patches).toBe(1);
});

test('D2: cambiar de tarea con un PATCH en vuelo no inutiliza el Guardar de la tarea nueva', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2', 'task-3']); await trigger(page, 'task-2').click(); await quiet(page); await sleep(300);
  const barrier = gate(); let reached = 0;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { reached++; await barrier.promise; await route.fallback(); });
  await field(page, 'Notas').fill('de task-2'); await saveButton(page).click(); await expect.poll(() => reached).toBe(1);
  await page.evaluate(() => (window as any).__open('task-3')); await expect(field(page, 'Fecha límite')).toHaveValue('2026-11-09'); await field(page, 'Notas').fill('de task-3');
  await saveButton(page).click(); await expect(ackHeading(page)).toBeVisible();                       // task-3 se guarda mientras task-2 sigue en vuelo
  expect((await srv.counts('task-3')).task.notes).toBe('de task-3');
  barrier.release(); await expect.poll(async () => (await srv.counts()).changes.length).toBe(2);
  expect((await srv.counts('task-2')).task.notes).toBe('de task-2'); expect((await srv.counts()).patches).toBe(2);
});

test('D3: sin respuesta, la lectura acaba en error con «Reintentar» y el guardado en «incierto» (no hay «Leyendo…»/«Guardando…» eternos)', async ({ page }) => {
  const srv = await start(); await page.clock.install(); await open(page, srv, ['task-2', 'task-3']);
  await page.route(/\/api\/v2\/records\/tasks\/task-3$/, async () => { /* nunca responde */ });
  await trigger(page, 'task-3').click(); await expect(dialog(page).getByText('Leyendo la tarea…')).toBeVisible();
  await page.clock.fastForward(16_000); await expect(dialog(page).getByRole('alert')).toContainText('tardó demasiado'); await expect(dialog(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.evaluate(() => (window as any).__close()); await page.unroute(/\/api\/v2\/records\/tasks\/task-3$/);
  await trigger(page, 'task-2').click(); await expect(field(page, 'Asunto')).toBeVisible();
  await page.route('**/api/records/tasks/task-2', async () => { /* el PATCH nunca responde */ });
  await field(page, 'Notas').fill('sin respuesta'); await saveButton(page).click(); await expect(dialog(page).getByText('Guardando…').first()).toBeVisible();
  await page.clock.fastForward(31_000); await expect(dialog(page).getByText('No se sabe si el guardado llegó a aplicarse')).toBeVisible();
});

test('D5: «Seguir editando» no oculta un fallo posterior de la actualización de la cola', async ({ page }) => {
  const srv = await start(); await open(page, srv, ['task-2']); await trigger(page, 'task-2').click(); await quiet(page); await sleep(300);
  const queue = gate(); let armed = false;
  await page.route('**/api/records/tasks/task-2', async (route: Route) => { const response = await route.fetch(); armed = true; await route.fulfill({ response }); });
  await page.route(/\/api\/v2\/records\/tasks\/task-2$/, async (route: Route) => { if (armed) { await queue.promise; await route.abort('connectionreset'); } else await route.fallback(); });
  await field(page, 'Notas').fill('guardada'); await saveButton(page).click(); await expect(dialog(page)).toContainText('Actualizando la cola de Hoy…');
  await dialog(page).getByRole('button', { name: 'Seguir editando' }).click(); await expect(field(page, 'Notas')).toBeVisible();
  queue.release();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'la cola de Hoy no se actualizó' })).toBeVisible();      // el aviso sobrevive al acuse
  await expect(page.getByTestId('notes-task-2')).not.toHaveText('guardada');
  armed = false; await dialog(page).getByRole('button', { name: 'Reintentar la actualización' }).click();
  await expect(page.getByTestId('notes-task-2')).toHaveText('guardada'); expect((await srv.counts()).patches).toBe(1);
});
