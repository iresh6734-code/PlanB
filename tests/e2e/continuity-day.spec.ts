import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Unidad 205 · DOM de la Jornada de continuidad en Chromium real. ARNÉS: monta ContinuityDay aislado con la cola REAL de makeFixture (buildResponseQueue)
// y callbacks espía. No es Hoy ni la App: acredita el componente, no que la jornada esté montada. Sin servidor ni red; el tráfico externo se aborta.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_CD205_ROOT ?? path.join(repo, 'tests', '.tmp', 'day205-' + randomUUID()));
const src = (name: string) => JSON.stringify(path.join(repo, name).replace(/\\/g, '/'));
const ENTRY = `import { createRoot } from 'react-dom/client';
import { ContinuityDay } from ${src('src/ContinuityDay.tsx')};
import { candidatesFromQueue } from ${src('shared/continuity-day.ts')};
import { buildResponseQueue } from ${src('shared/response-queue.ts')};
import { makeDemoSpec, makeFixture } from ${src('shared/fixtures.ts')};
import ${src('src/styles.css')}; import ${src('src/design-system.css')}; import ${src('src/planb-ui.css')};
const w = window as any; w.__opened = []; w.__net = 0; const realFetch = window.fetch.bind(window); window.fetch = (...a: any[]) => { w.__net++; return (realFetch as any)(...a); };
const name = new URLSearchParams(location.search).get('s') ?? 'basic';
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const queue = buildResponseQueue({ spec, records: snapshot.records, evaluatedAt: Date.parse('2026-11-05T09:00:00Z'), horizonHours: 24, limit: 200 });
let candidates = name === 'empty' ? [] : candidatesFromQueue(queue).slice(0, 8);
const synth = (id: string, label: string) => ({ id, label, bucket: 'overdue' as const, statusKnown: true, dueText: null, reasons: [] as string[], missingReferences: [] as string[] });
if (name === 'unknown') candidates = [synth('duration-unknown', 'Duración por estimar'), synth('duration-known', 'Duración conocida')];
if (name === 'property-ids') candidates = ['__proto__', 'constructor', 'toString'].map(id => synth(id, 'Ficha ' + id));
if (name === 'label-ids') candidates = [synth('segment/1', 'Primera ficha'), synth('segment:1', 'Segunda ficha')];
if (name === 'focus-id') candidates = [synth('record"1', 'Ficha con comillas'), synth('record1', 'Ficha sin comillas')];
if (name === 'homonyms') candidates = [{ ...candidates[0], id: 'twin-1', label: 'Llamar a Ana' }, { ...candidates[1], id: 'twin-2', label: 'Llamar a Ana' }];
w.__candidates = candidates.map(c => ({ id: c.id, label: c.label, bucket: c.bucket, statusKnown: c.statusKnown, missing: c.missingReferences.length }));
const owners = name === 'owners' ? Object.fromEntries(candidates.map((c, i) => [c.id, i % 2 ? 'Luis' : 'Ana'])) : undefined;
const hints = name === 'hints' ? { [candidates[0].id]: 'uncertain' as const } : undefined;
createRoot(document.getElementById('root')!).render(<main style={{ padding: '0 16px' }}><ContinuityDay candidates={candidates} notConsidered={queue.summary.totalQueued - queue.items.length} owners={owners} hints={hints} onOpenTask={id => { w.__opened.push(id); }} /></main>);
`;
let server: http.Server | undefined, origin = '';
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jornada</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); return; }
    const match = /^\/out\/([\w.-]+)$/.exec(url.pathname);
    if (match && fs.existsSync(path.join(root, 'out', match[1]))) { response.writeHead(200, { 'content-type': match[1].endsWith('.css') ? 'text/css' : 'text/javascript' }); response.end(fs.readFileSync(path.join(root, 'out', match[1]))); return; }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});
test.afterAll(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); });

async function open(page: Page, scenario = 'basic', size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin + '/?s=' + scenario); await expect(page.locator('#cd-title')).toBeVisible();
  return (await page.evaluate(() => (window as any).__candidates)) as { id: string; label: string; bucket: string; statusKnown: boolean; missing: number }[];
}
const summary = (page: Page) => page.locator('.cd-summary');
const chosenIds = (page: Page) => page.locator('#cd-chosen-h ~ ol > li').evaluateAll(items => items.map(item => (item as HTMLElement).dataset.id));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const effects = async (page: Page) => ({ net: await page.evaluate(() => (window as any).__net), opened: await page.evaluate(() => (window as any).__opened) });

for (const id of ['__proto__', 'constructor', 'toString']) test('275 · estimar, cambiar y borrar por ID exacto: ' + id, async ({ page }) => {
  const list = await open(page, 'property-ids');
  expect(list.map(task => task.id)).toEqual(['__proto__', 'constructor', 'toString']);
  const field = (taskId: string) => page.locator('.cd-item[data-id="' + taskId + '"] input[type=number]');
  const other = id === 'constructor' ? 'toString' : 'constructor';
  await field(id).fill('10');
  await expect(summary(page)).toContainText('1 tarea (10 min estimados');
  expect(await chosenIds(page)).toEqual([id]);
  await field(id).fill('15');
  await expect(summary(page)).toContainText('1 tarea (15 min estimados');
  await field(other).fill('5');
  await expect(summary(page)).toContainText('2 tareas (20 min estimados');
  await field(id).fill('');
  await expect(summary(page)).toContainText('1 tarea (5 min estimados');
  expect(await chosenIds(page)).toEqual([other]);
  await expect(field(other)).toHaveValue('5');
  await field(id).fill('25');
  await expect(summary(page)).toContainText('2 tareas (30 min estimados');
  expect(new Set(await chosenIds(page))).toEqual(new Set([id, other]));
  expect(await effects(page)).toEqual({ net: 0, opened: [] });
});

test('30 min por defecto: sin estimaciones no se inventa una jornada; declarar una duración la incluye y la suma, sin tocar la red', async ({ page }) => {
  const list = await open(page); expect(list.length).toBe(8);
  await expect(summary(page)).toContainText('En 30 min: 0 tareas (0 min'); await expect(page.locator('.cd-empty').first()).toContainText('no entra ninguna tarea');
  const target = list.find(c => c.statusKnown)!;
  await expect(page.locator('#cd-decide-h')).toContainText('Por decidir');
  await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + target.id + '"] input[type=number]').fill('25');
  await expect(summary(page)).toContainText('En 30 min: 1 tarea (25 min estimados, 5 min libres)'); expect(await chosenIds(page)).toEqual([target.id]);
  await expect(page.locator('#cd-chosen-h ~ ol > li').first()).toContainText('Estimación: 25 min'); await expect(page.locator('#cd-chosen-h ~ ol > li').first()).toContainText('Propuesta');
  const after = await effects(page); expect(after.net).toBe(0); expect(after.opened).toEqual([]);
});

test('cambiar el tiempo conserva lo fijado, lo elegido y lo descartado (y su orden); descartar es reversible', async ({ page }) => {
  const list = await open(page); const [a, b, c] = list.filter(x => x.statusKnown);
  for (const item of [a, b, c]) await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + item.id + '"] input[type=number]').fill('10');
  await page.getByRole('button', { name: new RegExp('^Fijar ' + c.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(ID ' + c.id + '\\)$') }).click();
  await page.getByRole('button', { name: new RegExp('^Quitar de la jornada .*\\(ID ' + b.id + '\\)$') }).click();
  expect((await chosenIds(page))[0]).toBe(c.id); await expect(page.locator('.cd-out')).toContainText('Fuera de la jornada');
  const before = await chosenIds(page);
  for (const minutes of [15, 120]) { await page.getByLabel(minutes + ' min').check(); }
  await page.locator('#cd-custom').fill('45'); await expect(summary(page)).toContainText('En 45 min');
  const afterIds = await chosenIds(page); expect(afterIds[0]).toBe(c.id); expect(afterIds).not.toContain(b.id); expect(afterIds.length).toBeGreaterThanOrEqual(before.length);
  await page.locator('.cd-out > summary').click(); await expect(page.locator('.cd-out li[data-id="' + b.id + '"]')).toContainText('La descartaste');
  await page.getByRole('button', { name: new RegExp('^Volver a incluir .*\\(ID ' + b.id + '\\)$') }).click(); expect(await chosenIds(page)).toContain(b.id);
  expect((await effects(page)).net).toBe(0);
});

test('reordenar con teclado: Subir/Bajar cambian el orden y el foco sigue en el mismo control; lo no fijado no cruza a lo fijado', async ({ page }) => {
  const list = await open(page); const [a, b, c] = list.filter(x => x.statusKnown);
  for (const item of [a, b, c]) await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + item.id + '"] input[type=number]').fill('5');
  const pin = (id: string) => page.locator('.cd-item[data-id="' + id + '"] [data-cd-focus="pin:' + id + '"]');
  await pin(a.id).focus(); await page.keyboard.press('Enter'); await pin(b.id).focus(); await page.keyboard.press('Enter'); await pin(c.id).focus(); await page.keyboard.press('Space');
  expect(await chosenIds(page)).toEqual([a.id, b.id, c.id]);
  const down = page.locator('[data-cd-focus="down:' + a.id + '"]'); await down.focus(); await page.keyboard.press('Enter');
  expect(await chosenIds(page)).toEqual([b.id, a.id, c.id]); await expect(page.locator('[data-cd-focus="down:' + a.id + '"]')).toBeFocused();
  await page.locator('[data-cd-focus="up:' + a.id + '"]').focus(); await page.keyboard.press('Enter'); expect(await chosenIds(page)).toEqual([a.id, b.id, c.id]);
  await expect(page.locator('[data-cd-focus="up:' + a.id + '"]')).toBeFocused(); await expect(page.locator('[data-cd-focus="up:' + a.id + '"]')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-cd-focus="pin:' + c.id + '"]').focus(); await page.keyboard.press('Enter');   // quitar fijación de c: baja a «elegida»
  await expect(page.locator('.cd-item[data-id="' + c.id + '"]')).toHaveAttribute('data-origin', 'manual'); expect((await chosenIds(page))[2]).toBe(c.id);
});

test('lo elegido que desborda el tiempo se incluye, se avisa y pasa a «por decidir»; no se descarta, y desplaza a lo automático', async ({ page }) => {
  const list = await open(page); const [a, b] = list.filter(x => x.statusKnown);
  await page.getByLabel('15 min').check();
  for (const [item, minutes] of [[a, 10], [b, 20]] as const) await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + item.id + '"] input[type=number]').fill(String(minutes));
  expect(await chosenIds(page)).toEqual([a.id]); await page.locator('.cd-out > summary').click();
  await expect(page.locator('.cd-out li[data-id="' + b.id + '"]')).toContainText('No cabe en el tiempo restante');
  await page.getByRole('button', { name: 'Elegir ' + b.label + ' (ID ' + b.id + ')', exact: true }).click();
  await page.locator('[data-cd-focus="pin:' + b.id + '"]').click();
  await expect(summary(page)).toHaveAttribute('data-over', 'true'); await expect(summary(page)).toContainText('5 min por encima');
  await expect(page.locator('#cd-chosen-h ~ ol .cd-item[data-id="' + b.id + '"] .cd-warnings')).toContainText('No se ha quitado'); expect(await chosenIds(page)).toEqual([b.id]);
  await expect(page.locator('section[aria-labelledby="cd-decide-h"]')).toContainText('Quitar alguna tarea, aumentar el tiempo o aceptar el desborde');
  await page.locator('.cd-out > summary').click(); await expect(page.locator('.cd-out li[data-id="' + a.id + '"]')).toContainText('No cabe en el tiempo restante');
});

test('homónimas: mismo título, distinto ID; cada acción lleva su ID y «Abrir la tarea» entrega el ID correcto', async ({ page }) => {
  await open(page, 'homonyms');
  await expect(page.locator('section[aria-labelledby="cd-decide-h"] .cd-item')).toHaveCount(2); await expect(page.locator('section[aria-labelledby="cd-decide-h"] code')).toHaveText(['twin-1', 'twin-2']);
  await page.getByRole('button', { name: 'Abrir la tarea Llamar a Ana (ID twin-2)' }).click();
  expect((await effects(page)).opened).toEqual(['twin-2']);
});

test('valores inválidos: la estimación y el tiempo fuera de rango se señalan y no cambian el plan', async ({ page }) => {
  const list = await open(page); const a = list.find(x => x.statusKnown)!;
  const field = page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + a.id + '"] input[type=number]');
  await field.fill('3'); await expect(field).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByRole('alert').filter({ hasText: 'Entre 5 y 480' })).toBeVisible(); await expect(summary(page)).toContainText('0 tareas');
  await page.locator('#cd-custom').fill('9999'); await expect(page.locator('#cd-custom')).toHaveAttribute('aria-invalid', 'true'); await expect(summary(page)).toContainText('En 30 min');
});

test('el filtro de responsable solo existe si hay dato real; y un guardado sin resolver pide comprobar antes de planificar', async ({ page }) => {
  await open(page, 'basic'); await expect(page.getByLabel('Responsable')).toHaveCount(0);
  await open(page, 'owners'); await expect(page.getByLabel('Responsable')).toBeVisible(); await expect(page.getByLabel('Responsable').locator('option')).toHaveText(['Todos', 'Ana', 'Luis']);
  const list = await open(page, 'hints'); await expect(page.locator('section[aria-labelledby="cd-decide-h"]')).toContainText('Su guardado está sin resolver');
  await page.locator('.cd-out > summary').click(); await expect(page.locator('.cd-out li[data-id="' + list[0].id + '"]')).toContainText('guardado está sin resolver');
});

test('estado vacío útil: sin tareas lo dice y no ofrece imprimir', async ({ page }) => {
  await open(page, 'empty'); await expect(page.locator('.cd-empty').first()).toContainText('No hay tareas que planificar'); await expect(page.getByRole('button', { name: 'Imprimir la lista' })).toBeDisabled();
});

test('impresión por lista blanca: solo título, ID, minutos y orden; nada de motivos, fechas ni referencias', async ({ page }) => {
  const list = await open(page); const a = list.find(x => x.statusKnown)!;
  await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + a.id + '"] input[type=number]').fill('20');
  await page.emulateMedia({ media: 'print' });
  const visible = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  expect(visible).toContain('Jornada de continuidad'); expect(visible).toContain(a.label + ' (' + a.id + ') · 20 min'); expect(visible).toContain('No indica que las tareas estén guardadas ni completadas');
  expect(visible).not.toMatch(/vencimiento|Madrid|Propuesta|Estimación|Por decidir|Abrir la tarea|relacionado/);
  await page.emulateMedia({ media: 'screen' }); await expect(page.getByTestId('cd-print')).toBeHidden();
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) test('diseño a ' + size.width + ' px: sin desbordamiento, controles alcanzables y objetivos táctiles', async ({ page }, testInfo) => {
  const list = await open(page, 'basic', size); const known = list.filter(x => x.statusKnown).slice(0, 3);
  for (const item of known) await page.locator('section[aria-labelledby="cd-decide-h"] .cd-item[data-id="' + item.id + '"] input[type=number]').fill('10');
  await page.locator('[data-cd-focus="pin:' + known[0].id + '"]').click();
  expect(await noOverflow(page)).toBe(true);
  const bad = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cd button, .cd input, .cd select, .cd summary')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5 || (innerWidth <= 640 && el.tagName === 'BUTTON' && r.height < 43.5)); }).map(el => (el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 40)));
  expect(bad).toEqual([]);
  const file = path.join(root, 'day-' + size.width + '.png'); await page.screenshot({ path: file, fullPage: true }); await testInfo.attach('day-' + size.width, { path: file, contentType: 'image/png' });
});

// ═══ R2 · dictamen 208 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
test('R2 F1 · una tarea elegida sin duración: el resumen muestra el subtotal conocido y el saldo INDETERMINADO, sin «minutos libres» ni inicio exacto; al declararla vuelve el saldo', async ({ page }, testInfo) => {
  await open(page, 'unknown', { width: 390, height: 844 });
  await page.getByRole('spinbutton', { name: /Duración conocida/ }).fill('25');
  await page.getByRole('button', { name: 'Incluir igualmente Duración por estimar (ID duration-unknown)', exact: true }).click();
  await expect(summary(page)).toContainText('25 min estimados + 1 tarea sin duración: el tiempo libre es indeterminado'); await expect(summary(page)).not.toContainText('libres'); await expect(summary(page)).toHaveAttribute('data-indeterminate', 'true');
  expect(await chosenIds(page)).toEqual(['duration-unknown', 'duration-known']);
  const auto = page.locator('#cd-chosen-h ~ ol > li[data-id="duration-known"]'); await expect(auto).toContainText('Provisional'); await expect(auto).toContainText('Propuesta provisional'); await expect(auto).not.toContainText('Cabe en el tiempo restante');
  const file = path.join(root, 'unknown-390.png'); await page.screenshot({ path: file, fullPage: true }); await testInfo.attach('unknown-390', { path: file, contentType: 'image/png' });
  await page.locator('#cd-chosen-h ~ ol > li[data-id="duration-unknown"] input[type=number]').fill('5');
  await expect(summary(page)).toContainText('30 min estimados'); await expect(summary(page)).not.toContainText('indeterminado'); await expect(summary(page)).toHaveAttribute('data-indeterminate', 'false'); await expect(auto).not.toContainText('Provisional'); await expect(auto).toContainText('Cabe en el tiempo restante');
  await page.emulateMedia({ media: 'print' }); expect(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).toContain('Estimado: 30 min'); await page.emulateMedia({ media: 'screen' });
});
test('R2 F1 · la lista imprimible dice «+ 1 tarea sin duración» y no inventa un total', async ({ page }) => {
  await open(page, 'unknown'); await page.getByRole('spinbutton', { name: /Duración conocida/ }).fill('25');
  await page.getByRole('button', { name: 'Incluir igualmente Duración por estimar (ID duration-unknown)', exact: true }).click();
  await page.emulateMedia({ media: 'print' }); const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  expect(text).toContain('Estimado: 25 min + 1 tarea sin duración'); expect(text).toContain('Duración por estimar (duration-unknown) · duración desconocida'); expect(text).toContain('Duración conocida (duration-known) · 25 min');
});
test('R2 F2 · IDs «segment/1» y «segment:1»: cada etiqueta activa el control de SU tarea (DOM y teclado), con identidades únicas', async ({ page }) => {
  await open(page, 'label-ids');
  const pairs = await page.locator('.cd-estimate label').evaluateAll(labels => labels.map(label => ({ row: label.closest<HTMLElement>('[data-id]')?.dataset.id, controlled: (label as HTMLLabelElement).control?.closest<HTMLElement>('[data-id]')?.dataset.id, htmlFor: (label as HTMLLabelElement).htmlFor })));
  expect(pairs.length).toBe(2); expect(pairs.filter(pair => pair.row !== pair.controlled)).toEqual([]); expect(new Set(pairs.map(pair => pair.htmlFor)).size).toBe(2);
  expect(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.length - new Set(ids).size; })).toBe(0);
  await page.locator('.cd-item[data-id="segment:1"] .cd-estimate label').click(); expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>('[data-id]')?.dataset.id)).toBe('segment:1');
  await page.getByRole('spinbutton', { name: /Primera ficha/ }).focus(); expect(await page.evaluate(() => document.activeElement?.closest<HTMLElement>('[data-id]')?.dataset.id)).toBe('segment/1');
  await page.getByRole('spinbutton', { name: /Segunda ficha/ }).fill('15'); await expect(page.locator('#cd-chosen-h ~ ol > li[data-id="segment:1"]')).toContainText('15 min');
  await expect(page.locator('#cd-chosen-h ~ ol > li[data-id="segment/1"]')).toHaveCount(0);
});
test('R2 F3 · IDs «record"1» y «record1»: fijar y mover mantienen el foco en la ficha CORRECTA (ID exacto, sin interpretar selectores)', async ({ page }) => {
  await open(page, 'focus-id');
  await page.getByRole('spinbutton', { name: /Ficha con comillas/ }).fill('10'); await page.getByRole('spinbutton', { name: /Ficha sin comillas/ }).fill('10');
  const activeRow = () => page.evaluate(() => document.activeElement?.closest<HTMLElement>('[data-id]')?.dataset.id);
  await page.getByRole('button', { name: /^Fijar Ficha con comillas/ }).press('Enter'); await page.getByRole('button', { name: /^Quitar la fijación de Ficha con comillas/ }).waitFor();
  expect(await activeRow()).toBe('record"1'); await expect(page.locator(':focus')).toHaveAccessibleName(/^Quitar la fijación de Ficha con comillas/);
  await page.getByRole('button', { name: /^Fijar Ficha sin comillas/ }).press('Enter'); await page.getByRole('button', { name: /^Quitar la fijación de Ficha sin comillas/ }).waitFor();
  expect(await activeRow()).toBe('record1'); expect(await chosenIds(page)).toEqual(['record"1', 'record1']);
  await page.getByRole('button', { name: /^Subir Ficha sin comillas/ }).press('Enter'); expect(await chosenIds(page)).toEqual(['record1', 'record"1']); expect(await activeRow()).toBe('record1'); await expect(page.locator(':focus')).toHaveAccessibleName(/^Subir Ficha sin comillas/);
  await page.getByRole('button', { name: /^Bajar Ficha sin comillas/ }).press('Enter'); expect(await chosenIds(page)).toEqual(['record"1', 'record1']); expect(await activeRow()).toBe('record1'); await expect(page.locator(':focus')).toHaveAccessibleName(/^Bajar Ficha sin comillas/);
});
