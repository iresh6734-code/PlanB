import { test, expect, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
// Kit de Relevo · DOM real (Chromium headless limpio, sin Edge ni lector de pantalla). Cada prueba lanza SU servidor del kit (puerto libre, red externa bloqueada) y limpia sus carpetas sin borrado recursivo.
const REPO = resolve('.'), KIT_DIST = process.env.PLANB_KIT_DIST!, ROOM_DIST = process.env.PLANB_ROOM_DIST!, EVIDENCE = process.env.PLANB_KIT_EVIDENCE ?? resolve('test-results', 'rescue116'), TMP = resolve('tests', '.tmp');
const PW = 'contraseña-de-ensayo-116', OTHER = 'otra-contraseña-de-ensayo';
mkdirSync(EVIDENCE, { recursive: true });
const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const KNOWN = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'rescue-room.marker.json'];
const drop = (dir: string) => { if (!existsSync(dir)) return; for (const n of KNOWN) { try { unlinkSync(join(dir, n)); } catch { /* ausente */ } } try { if (!readdirSync(dir).length) rmdirSync(dir); } catch { /* conservada */ } };
const dropKit = (dir: string) => { const caps = join(dir, 'capsules'); if (existsSync(caps)) { for (const n of readdirSync(caps)) { try { unlinkSync(join(caps, n)); } catch { /* en uso */ } } try { rmdirSync(caps); } catch { /* conservada */ } } try { rmdirSync(dir); } catch { /* conservada */ } };
type Server = { port: number; url: string; origin: string; kit: string; proc: ChildProcess; stop: () => Promise<void> };
async function start(): Promise<Server> {
  if (!KIT_DIST || !ROOM_DIST) throw new Error('Faltan PLANB_KIT_DIST y PLANB_ROOM_DIST.'); const port = await freePort(), before = new Set(readdirSync(TMP));
  const proc = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/demo-rescue-capsule.ts', '--port', String(port), '--dist', KIT_DIST, '--dest-dist', ROOM_DIST, '--now', '2026-11-02T07:00:00.000Z'], { cwd: REPO, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout!.on('data', d => { out += d; }); proc.stderr!.on('data', d => { out += d; }); const exited = new Promise<void>(r => proc.once('exit', () => r())); const deadline = Date.now() + 40_000;
  for (;;) {
    const o = /Origen: (.+)/.exec(out), k = /Carpeta del kit: (.+)/.exec(out);
    if (o && k) { try { if ((await fetch('http://127.0.0.1:' + port + '/api/capsule/health')).ok) return { port, url: 'http://127.0.0.1:' + port, origin: o[1].trim(), kit: k[1].trim(), proc, stop: async () => { proc.kill(); await exited; for (const n of readdirSync(TMP)) if (!before.has(n) && /^rescue106-/.test(n)) drop(join(TMP, n)); drop(o[1].trim()); dropKit(k[1].trim()); } }; } catch { /* aún no */ } }
    if (proc.exitCode !== null) throw new Error('El kit terminó: ' + out.slice(-500)); if (Date.now() > deadline) { proc.kill(); throw new Error('El kit no arrancó: ' + out.slice(-500)); }
    await new Promise(r => setTimeout(r, 200));
  }
}
async function guard(page: Page, s: Server) {
  const errors: string[] = [], outside: string[] = [], urls: string[] = [], bodies: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { urls.push(r.url()); if (r.method() === 'POST') bodies.push(r.postData() ?? ''); });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== s.url) { outside.push(u.origin); return route.abort(); } return route.fallback(); });
  return { errors, outside, urls, bodies };
}
const notice = (page: Page) => page.locator('.rc-live'), pw = (page: Page) => page.getByLabel(/Contraseña del ensayo/);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function seedAndExport(page: Page) {
  await page.getByRole('button', { name: /Llevar el origen al caso de interés/ }).click(); await expect(notice(page)).toContainText('caso de interés'); await expect(page.getByText('Operaciones inciertas').first()).toBeVisible();
  await pw(page).fill(PW); await page.getByRole('button', { name: 'Exportar cápsula cifrada' }).click(); await expect(notice(page)).toContainText('Cápsula cifrada publicada'); await expect(pw(page), 'la contraseña se borra tras usarla').toHaveValue('');
}
async function inspect(page: Page, password = PW) { await page.getByRole('button', { name: 'Continuar: inspeccionar' }).click(); await page.getByRole('radio').first().check(); await pw(page).fill(password); await page.getByRole('button', { name: 'Inspeccionar (sin escribir)' }).click(); }

test('DOM · relevo completo: preparar, inspeccionar sin escribir, aprobar ligado al contenido, abrir el destino en un proceso nuevo, y la contraseña no se filtra', async ({ page }) => {
  test.setTimeout(180_000); const s = await start(), seen = await guard(page, s); await page.goto(s.url);
  await expect(page.getByText('Ensayo · datos ficticios · mismo equipo, carpeta nueva')).toBeVisible(); await expect(page.getByRole('heading', { name: '1. Preparar la cápsula' })).toBeVisible();
  await seedAndExport(page); await expect(page.getByText(/\.capsule/).first()).toBeVisible();
  await inspect(page); await expect(notice(page)).toContainText('Inspección completada sin escribir'); await expect(page.getByText('Confirmar entrega con el cliente: se conserva como incierta')).toBeVisible();
  const approve = page.getByRole('button', { name: 'Aprobar la importación en carpeta nueva' }); await expect(approve, 'sin revisar no se puede aprobar').toBeDisabled(); await page.getByLabel(/He revisado este contenido/).check(); await expect(approve, 'tampoco sin contraseña: la aprobación va ligada').toBeDisabled();
  await pw(page).fill(PW); await expect(approve).toBeEnabled(); await approve.click(); await expect(page.getByRole('heading', { name: '3. Abrir el destino' })).toBeFocused(); await expect(page.getByText(/rescue106-[0-9a-f-]{36}/).first()).toBeVisible(); await expect(page.getByText(/Aprobación|Idempotencia del origen/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Abrir el destino en un proceso nuevo' }).click(); const link = page.getByRole('link', { name: /http:\/\/127\.0\.0\.1:\d+\// }); await expect(link).toBeVisible({ timeout: 40_000 }); const destUrl = (await link.getAttribute('href'))!;
  const dest = await (await fetch(destUrl + 'api/rescue/state')).json() as { stage: string; crm: { stats: { calls: { create: number }; records: number } }; returnPlan: { operations: { status: string }[] } };
  expect(dest.stage).toBe('return-partial'); expect(dest.crm.stats.calls.create).toBe(1); expect(dest.crm.stats.records).toBe(63); expect(dest.returnPlan.operations.filter(o => o.status === 'uncertain')).toHaveLength(1);
  const name = ((await (await fetch(s.url + '/api/capsule/state')).json()) as { capsules: { name: string }[] }).capsules[0].name; const rep = await page.request.get(s.url + '/api/capsule/report.html?name=' + name); expect(rep.status()).toBe(200); expect(await rep.text()).toContain('Informe comparativo del relevo');
  // la contraseña no se filtra: solo en cuerpos POST, nunca en URL, almacenamiento ni DOM final
  expect(seen.urls.filter(u => u.includes(PW) || u.includes(encodeURIComponent(PW)))).toEqual([]); expect(seen.bodies.some(b => b.includes(PW))).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ l: localStorage, s: sessionStorage }))).not.toContain(PW); expect(await page.content()).not.toContain(PW); expect(await page.locator('input[type=password]').count()).toBeLessThanOrEqual(1);
  await page.screenshot({ path: join(EVIDENCE, 'kit-1440-destino.png'), fullPage: true }); expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]); await s.stop();
});

test('DOM · contraseña incorrecta: error útil con foco en la alerta, sin destino, y la cápsula sigue disponible; cancelar no borra nada', async ({ page }) => {
  test.setTimeout(120_000); const s = await start(), seen = await guard(page, s); await page.goto(s.url); await seedAndExport(page);
  await inspect(page, OTHER); const alert = page.getByRole('alert'); await expect(alert).toContainText('Contraseña incorrecta o archivo dañado'); await expect(alert).toBeFocused(); await expect(page.getByText('Lo que contiene')).toHaveCount(0); expect(await page.content()).not.toContain(OTHER);
  await page.getByRole('button', { name: 'Inspeccionar (sin escribir)' }).isVisible(); await pw(page).fill(PW); await page.getByRole('button', { name: 'Inspeccionar (sin escribir)' }).click(); await expect(page.getByText('Lo que contiene')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click(); await expect(notice(page)).toContainText('Cancelado: no se escribió ni se borró nada'); await expect(page.getByRole('heading', { name: '1. Preparar la cápsula' })).toBeFocused();
  const state = await (await fetch(s.url + '/api/capsule/state')).json() as { capsules: { name: string; imported: boolean }[]; opened: unknown[] }; expect(state.capsules).toHaveLength(1); expect(state.capsules[0].imported).toBe(false); expect(state.opened).toHaveLength(0);
  expect(readdirSync(TMP).filter(n => /^rescue106-/.test(n) && existsSync(join(TMP, n, 'rescue-room.marker.json'))).length).toBeGreaterThanOrEqual(1); expect(seen.errors).toEqual([]); await s.stop();
});

test('DOM · guardado confirmado y recarga fallida: la UI distingue ambos y no repite la exportación', async ({ page }) => {
  test.setTimeout(120_000); const s = await start(); await guard(page, s); await page.goto(s.url); await page.getByRole('button', { name: /Llevar el origen al caso de interés/ }).click(); await expect(notice(page)).toContainText('caso de interés');
  let exports = 0, failState = false; await page.route('**/api/capsule/export', async route => { exports++; const real = await route.fetch(); failState = true; await route.fulfill({ response: real }); });
  await page.route('**/api/capsule/state', route => failState ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Fallo de ensayo', code: 'INTERNAL' }) }) : route.continue());
  await pw(page).fill(PW); await page.getByRole('button', { name: 'Exportar cápsula cifrada' }).click();
  await expect(notice(page)).toContainText('Cápsula cifrada publicada'); await expect(notice(page)).toContainText('no se pudo recargar el estado del kit'); await expect(page.getByRole('alert'), 'no es un fallo de la exportación').toHaveCount(0);
  expect(exports).toBe(1); failState = false; await page.reload(); await page.getByRole('button', { name: /2\. Inspeccionar y revisar/ }).click(); await expect(page.getByRole('radio')).toHaveCount(1); expect(exports, 'ninguna repetición').toBe(1); await s.stop();
});

async function reach(page: Page, target: Locator, max = 120) { for (let i = 0; i < max; i++) { if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return; await page.keyboard.press('Tab'); } throw new Error('No se alcanzó con el teclado: ' + target); }
test('DOM · teclado completo sin ratón: sembrar, exportar, inspeccionar, revisar, aprobar y abrir el destino', async ({ page }) => {
  test.setTimeout(180_000); const s = await start(), seen = await guard(page, s); await page.goto(s.url); const press = async (loc: Locator, key = 'Enter') => { await reach(page, loc); await page.keyboard.press(key); };
  await press(page.getByRole('button', { name: /Llevar el origen al caso de interés/ })); await expect(notice(page)).toContainText('caso de interés');
  await reach(page, pw(page)); await page.keyboard.type(PW); await press(page.getByRole('button', { name: 'Exportar cápsula cifrada' })); await expect(notice(page)).toContainText('Cápsula cifrada publicada');
  await press(page.getByRole('button', { name: 'Continuar: inspeccionar' })); await expect(page.getByRole('heading', { name: '2. Inspeccionar y revisar' })).toBeFocused(); await press(page.getByRole('radio').first(), 'Space');
  await reach(page, pw(page)); await page.keyboard.type(PW); await press(page.getByRole('button', { name: 'Inspeccionar (sin escribir)' })); await expect(page.getByText('Lo que contiene')).toBeVisible();
  await press(page.getByLabel(/He revisado este contenido/), 'Space'); await reach(page, pw(page)); await page.keyboard.type(PW); await press(page.getByRole('button', { name: 'Aprobar la importación en carpeta nueva' })); await expect(page.getByRole('heading', { name: '3. Abrir el destino' })).toBeFocused();
  await press(page.getByRole('button', { name: 'Abrir el destino en un proceso nuevo' })); await expect(page.getByRole('link', { name: /http:\/\/127\.0\.0\.1:\d+\// })).toBeVisible({ timeout: 40_000 }); expect(seen.errors).toEqual([]); await s.stop();
});

for (const width of [1440, 390, 320]) test('DOM · capturas ' + width + ' px (paso 2 con inspección): sin desbordamiento, objetivos ≥ 44 px y foco visible', async ({ page }) => {
  test.setTimeout(150_000); const s = await start(); const seen = await guard(page, s); await page.setViewportSize({ width, height: 900 }); await page.goto(s.url); await seedAndExport(page); await inspect(page); await expect(page.getByText('Lo que contiene')).toBeVisible();
  await page.screenshot({ path: join(EVIDENCE, 'kit-' + width + '-inspeccion.png'), fullPage: true }); expect(await noOverflow(page), 'sin desbordamiento horizontal de la página').toBe(true);
  for (const name of ['Inspeccionar (sin escribir)', 'Aprobar la importación en carpeta nueva', 'Cancelar']) expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Tab'); await expect(page.locator(':focus')).toBeVisible(); expect(seen.errors).toEqual([]); await s.stop();
});
