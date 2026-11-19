import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// CLAUDE-LAB-036: demo aislada del laboratorio de caídas en un navegador real. Un trabajador, un navegador, red local solamente.
// PLANB_LAB_DIST: carpeta ya compilada de design/continuity-lab. Sin ella, la prueba compila la demo con Vite en tests/.tmp/lab036-<uuid>.
// PLANB_LAB_PORT: puerto del servidor estático (4491-4499; por defecto 4491). PLANB_LAB_SHOTS: carpeta opcional para capturas.
test.describe.configure({ mode: 'serial' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.PLANB_LAB_PORT || 4491);
const origin = 'http://127.0.0.1:' + port;
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
let server: http.Server;

test.beforeAll(async () => {
  expect(port, 'puerto reservado a LAB036').toBeGreaterThanOrEqual(4491); expect(port).toBeLessThanOrEqual(4499);
  let dist = process.env.PLANB_LAB_DIST;
  if (!dist) {
    const { build } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    dist = path.join(root, 'tests/.tmp', 'lab036-' + randomUUID(), 'dist');
    await build({ configFile: false, root: path.join(root, 'design/continuity-lab'), base: './', logLevel: 'warn', plugins: [react()], build: { outDir: dist, emptyOutDir: true } });
  }
  const base = path.resolve(dist);
  expect(fs.existsSync(path.join(base, 'index.html')), 'hace falta la demo compilada').toBeTruthy();
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', origin), file = path.resolve(base, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('no encontrado'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
});
test.afterAll(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); });

const status = (page: Page) => page.getByTestId('status-label');
const result = (page: Page) => page.locator('.clab-result');
async function open(page: Page, caseLabel?: string) {
  await page.goto(origin + '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio de caídas' })).toBeVisible();
  if (caseLabel) await page.getByLabel('Caso de ejemplo').selectOption({ label: caseLabel });
}
const setNum = async (page: Page, label: string | RegExp, value: string) => { const f = page.getByLabel(label); await f.fill(value); return f; };
async function shot(page: Page, name: string) {
  if (process.env.PLANB_LAB_SHOTS) { fs.mkdirSync(process.env.PLANB_LAB_SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.PLANB_LAB_SHOTS, name + '.png'), fullPage: true }); }
}

test('aislamiento: banner visible, solo peticiones locales, sin enlaces ni almacenamiento', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await open(page);
  await expect(page.getByTestId('simulation-banner')).toHaveText('Simulación · datos ficticios · no ejecuta recuperación');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  // Recorre casos y ediciones: nada sale del origen local, nada se guarda en el navegador.
  for (const label of ['Pérdida del equipo sin restauración', 'Sin evidencia', 'Simulacro fallido']) await page.getByLabel('Caso de ejemplo').selectOption({ label });
  await page.getByRole('button', { name: 'Vaciar la simulación' }).click();
  await expect(page.getByRole('heading', { name: 'Sin simulación cargada' })).toBeVisible();
  await expect(page.getByTestId('simulation-banner')).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) expect(url.startsWith(origin + '/'), url).toBeTruthy();
  expect(await page.locator('a[href]').count()).toBe(0);
  const stored = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, databases: (await indexedDB.databases()).length }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: '', databases: 0 });
  const buttons = await page.getByRole('button').allInnerTexts();
  for (const label of buttons) expect(label, 'ningún botón ejecuta o simula una recuperación').not.toMatch(/ejecut|recuper|restaur|simular|iniciar|probar|conectar|enviar/i);
});

test('pérdida del equipo sin restauración no está preparada y el simulacro local no la sustituye', async ({ page }) => {
  await open(page, 'Pérdida del equipo sin restauración');
  await expect(status(page)).toHaveText('Sin comprobar');
  await expect(page.getByTestId('cause')).toContainText('Restauración en otro equipo');
  await expect(page.getByTestId('next-step')).toContainText('Ensayar restauración en otro equipo');
  // Las tres evidencias están separadas y solo cuentan las del escenario.
  await expect(page.getByRole('group', { name: 'Disponibilidad declarada' })).toBeVisible();
  const local = page.getByRole('group', { name: 'Simulacro local' }), restore = page.getByRole('group', { name: 'Restauración en otro equipo' });
  await expect(local).toContainText('No cuenta en este escenario'); await expect(restore).toContainText('Cuenta en este escenario');
  // Registrar la restauración en otro equipo es un dato escrito, no una acción: el motor decide.
  await restore.getByLabel('Resultado del ensayo').selectOption('passed');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  await expect(page.getByTestId('cause')).toContainText('Todas las comprobaciones aportadas cumplen');
  await restore.getByLabel('Resultado del ensayo').selectOption('failed');
  await expect(status(page)).toHaveText('Bloqueado');
  await restore.getByLabel('Resultado del ensayo').selectOption('none');
  await expect(status(page)).toHaveText('Sin comprobar');
  await expect(result(page).locator('[data-measure="recovery"]')).toHaveAttribute('data-state', 'missing');
});

test('comparar escenarios muestra qué evidencia falta al cambiar', async ({ page }) => {
  await open(page, 'Caída del CRM con simulacro local');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  await expect(page.getByTestId('comparison-diff')).toContainText('Pasar a «Pérdida del equipo» añade estas pruebas pendientes');
  await expect(page.getByTestId('comparison-diff')).toContainText('Restauración en otro equipo');
  await page.getByRole('radio', { name: /Pérdida del equipo/ }).check();
  await expect(status(page)).toHaveText('Sin comprobar');
  await expect(result(page).getByRole('heading', { level: 2 })).toHaveText('Resultado: Pérdida del equipo');
  await expect(page.getByTestId('comparison').locator('[data-scenario="crm-outage"]')).toContainText('Preparado según estas entradas');
});

test('dato ausente no es cero: sin captura ni inventario no hay cifras, y el orden de los datos importa', async ({ page }) => {
  await open(page, 'Sin evidencia');
  await expect(status(page)).toHaveText('Sin comprobar');
  for (const key of ['age', 'recovery']) await expect(result(page).locator('[data-measure="' + key + '"]')).toHaveAttribute('data-state', 'missing');
  await expect(page.getByTestId('exposure-missing')).toContainText('no equivale a 0 tareas');
  for (const id of ['overdue', 'during', 'undated', 'open']) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(result(page)).not.toContainText(/\b0 min\b/);
  // Un inventario vacío sin captura sigue sin dar cifras.
  await page.getByLabel('Inventario', { exact: true }).selectOption('present');
  await expect(page.getByText('Inventario vacío: 0 tareas declaradas.')).toBeVisible();
  await expect(page.getByTestId('exposure-missing')).toBeVisible();
  // Al registrar la captura, ese inventario pertenece a otra generación: no se reetiqueta y sigue sin contar.
  await page.getByLabel('Captura verificada', { exact: true }).selectOption('present');
  await expect(page.getByTestId('stale-evidence')).toContainText('Inventario de tareas (demo-capture)');
  await expect(page.getByTestId('exposure-missing')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar este inventario' }).click();
  await page.getByLabel('Inventario', { exact: true }).selectOption('present');
  await expect(page.getByTestId('open')).toHaveText('0');
  await expect(page.getByText('Aquí 0 es un dato declarado')).toBeVisible();
  await expect(page.getByTestId('exposure-missing')).toHaveCount(0);
});

test('cambiar la duración mueve las tareas en los límites exactos', async ({ page }) => {
  await open(page, 'Caída del CRM con simulacro local');
  for (const [minutes, during] of [['60', '1'], ['59', '0'], ['61', '1'], ['1', '0']] as const) {
    await setNum(page, 'Duración de la caída', minutes);
    await expect(page.getByTestId('during')).toHaveText(during);
    await expect(page.getByTestId('overdue')).toHaveText('1'); await expect(page.getByTestId('undated')).toHaveText('1'); await expect(page.getByTestId('open')).toHaveText('3');
  }
  // Editar una tarea: marcarla como hecha la saca del inventario abierto; cambiar su vencimiento la mueve de grupo.
  await setNum(page, 'Duración de la caída', '60');
  await page.getByLabel('Estado de la tarea 2').selectOption('done');
  await expect(page.getByTestId('during')).toHaveText('0'); await expect(page.getByTestId('open')).toHaveText('2');
  await page.getByLabel('Estado de la tarea 2').selectOption('open');
  await setNum(page, /Vence en .* tarea 2/, '61');
  await expect(page.getByTestId('during')).toHaveText('0');
  await setNum(page, /Vence en .* tarea 2/, '60');
  await expect(page.getByTestId('during')).toHaveText('1');
  await setNum(page, /Vence en .* tarea 1/, '0');
  await expect(page.getByTestId('overdue')).toHaveText('0'); await expect(page.getByTestId('during')).toHaveText('2');
});

test('editar la captura invalida la evidencia anterior sin reetiquetarla', async ({ page }) => {
  await open(page, 'Pérdida del equipo con restauración');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  await setNum(page, 'Antigüedad de la captura', '40');
  await expect(status(page)).toHaveText('Sin comprobar');
  await expect(page.getByText('Generación actual:')).toContainText('demo-capture-r2');
  const stale = page.getByTestId('stale-evidence');
  for (const item of ['Copia (demo-capture)', 'Simulacro local (demo-capture)', 'Restauración en otro equipo (demo-capture)', 'Inventario de tareas (demo-capture)']) await expect(stale).toContainText(item);
  await expect(page.getByTestId('exposure-missing')).toBeVisible();
  // Los registros ajenos no se pueden editar: solo descartar. Después se registran de nuevo, como datos nuevos.
  const restore = page.getByRole('group', { name: 'Restauración en otro equipo' });
  await expect(restore.getByLabel('Resultado del ensayo')).toHaveCount(0);
  await restore.getByRole('button', { name: 'Descartar este registro' }).click();
  await page.getByRole('group', { name: 'Copia para otro equipo' }).getByRole('button', { name: 'Descartar esta copia' }).click();
  await page.getByRole('group', { name: 'Tareas de la captura' }).getByRole('button', { name: 'Descartar este inventario' }).click();
  await expect(status(page)).toHaveText('Sin comprobar');
  await page.getByLabel('Copia', { exact: true }).selectOption('present');
  await restore.getByLabel('Resultado del ensayo').selectOption('passed');
  await page.getByLabel('Inventario', { exact: true }).selectOption('present');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  await expect(page.getByTestId('stale-evidence')).toContainText('Simulacro local (demo-capture)');
});

test('objetivos, duración medida y ensayo fallido cambian el veredicto por causas distintas', async ({ page }) => {
  await open(page, 'Captura fuera de objetivo');
  await expect(status(page)).toHaveText('Fuera de objetivo');
  await expect(page.getByTestId('cause')).toContainText('Antigüedad de la captura');
  await expect(result(page).locator('[data-measure="age"]')).toContainText('Fuera del objetivo');
  await expect(result(page).locator('[data-measure="age"]')).toContainText('45 min');
  await setNum(page, 'Antigüedad máxima de la captura', '45');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  const local = page.getByRole('group', { name: 'Simulacro local' });
  await setNum(page, /Duración medida/, '20');
  await expect(status(page)).toHaveText('Fuera de objetivo');
  await expect(page.getByTestId('cause')).toContainText('Tiempo de recuperación medido');
  await expect(result(page).locator('[data-measure="recovery"]')).toContainText('20 min');
  await setNum(page, /Duración medida/, '0');
  await expect(result(page).locator('[data-measure="recovery"]')).toContainText('0 min');
  await expect(result(page).locator('[data-measure="recovery"]')).toHaveAttribute('data-state', 'measured');
  await local.getByLabel('Resultado del ensayo').selectOption('failed');
  await expect(status(page)).toHaveText('Bloqueado');
  await expect(page.getByTestId('next-step')).toContainText('Resolver el fallo');
  // Un ensayo que empieza antes de verificar la captura no cuenta, aunque salga bien.
  await local.getByLabel('Resultado del ensayo').selectOption('passed');
  await setNum(page, /Empezó hace/, '50');
  await expect(status(page)).toHaveText('Sin comprobar');
});

test('entradas inválidas se explican, bloquean el resultado y no quedan como éxito', async ({ page }) => {
  await open(page, 'Caída del CRM con simulacro local');
  const duration = page.getByLabel('Duración de la caída');
  for (const [value, message] of [['abc', 'solo cifras enteras'], ['', 'número entero'], ['1,5', 'solo cifras enteras'], ['0', 'Debe estar entre 1 y 43.200'], ['99999', 'Debe estar entre 1 y 43.200']] as const) {
    await duration.fill(value);
    await expect(duration).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page.locator('.clab-result')).toHaveAttribute('data-state', 'invalid');
    await expect(status(page)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Sin resultado: hay entradas inválidas' })).toBeVisible();
    await expect(duration).toHaveAccessibleDescription(new RegExp(message.split(' ')[0]));
  }
  await duration.fill('120');
  await expect(duration).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.clab-result')).toHaveAttribute('data-state', 'result');
  await expect(status(page)).toHaveText('Preparado según estas entradas');
  // Cambiar de caso con un borrador inválido lo descarta.
  await duration.fill('x');
  await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Simulacro fallido' });
  await expect(page.getByLabel('Duración de la caída')).toHaveValue('480');
  await expect(status(page)).toHaveText('Bloqueado');
});

test('estado vacío y recuperación del laboratorio', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Vaciar la simulación' }).click();
  const empty = page.getByRole('heading', { name: 'Sin simulación cargada' });
  await expect(empty).toBeVisible(); await expect(status(page)).toHaveCount(0);
  await expect(page.getByText('Preparado según estas entradas')).toHaveCount(0);
  await expect(page.getByLabel('Caso de ejemplo')).toHaveValue('');
  await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Simulacro fallido' });
  await expect(status(page)).toHaveText('Bloqueado');
});

test('teclado: el escenario cambia con flechas, los campos tienen nombre y el foco es visible', async ({ page }) => {
  await open(page, 'Caída del CRM con simulacro local');
  await page.getByRole('radio', { name: /Caída del CRM/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Pérdida del equipo/ })).toBeChecked();
  await expect(status(page)).toHaveText('Sin comprobar');
  // Todo control tiene un nombre accesible.
  const unnamed = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.clab input, .clab select, .clab button')]
    .filter(el => !((el as HTMLInputElement).labels?.length || el.getAttribute('aria-label') || el.textContent?.trim()))
    .map(el => el.outerHTML.slice(0, 80)));
  expect(unnamed).toEqual([]);
  // Se recorre con Tab y cada parada muestra un anillo de foco de al menos 2 px; nada atrapa el foco.
  await page.getByLabel('Caso de ejemplo').focus();
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const target = el.matches('input[type="radio"], input[type="checkbox"]') ? (el.closest('label') as HTMLElement ?? el) : el;
      const style = getComputedStyle(target);
      return { key: el.tagName + ':' + (el.id || el.getAttribute('name') || el.textContent), ring: parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none' };
    });
    if (!info) break;
    seen.add(info.key); expect(info.ring, 'sin foco visible en ' + info.key).toBeTruthy();
  }
  expect(seen.size).toBeGreaterThan(15);
  // Enter/Espacio sobre «Añadir tarea ficticia» y «Quitar» con teclado.
  await page.getByRole('radio', { name: /Caída del CRM/ }).check();
  const add = page.getByRole('button', { name: 'Añadir tarea ficticia' });
  await add.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('open')).toHaveText('4');
  await page.getByRole('button', { name: 'Quitar la tarea ficticia 4' }).focus(); await page.keyboard.press('Space');
  await expect(page.getByTestId('open')).toHaveText('3');
});

for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]] as const) {
  test('diseño a ' + width + ' px: sin desbordamiento, objetivos táctiles y capturas', async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const touch = width <= 640 ? 44 : 32;
    for (const label of ['Caída del CRM con simulacro local', 'Pérdida del equipo sin restauración', 'Sin evidencia', 'Captura fuera de objetivo', 'Simulacro fallido', 'Pérdida del equipo con restauración']) {
      await page.getByLabel('Caso de ejemplo').selectOption({ label });
      const overflow = await page.evaluate(() => {
        const limit = innerWidth + 1, bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('.clab *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > limit || r.left < -1)) bad.push(el.tagName + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        }
        return { page: document.documentElement.scrollWidth <= innerWidth + 1, bad: bad.slice(0, 5) };
      });
      expect(overflow.page, label + ' desborda la página').toBeTruthy(); expect(overflow.bad, label).toEqual([]);
      const small = await page.evaluate(min => [...document.querySelectorAll<HTMLElement>('.clab input, .clab select, .clab button')]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => {
          const target = el.matches('input[type="radio"], input[type="checkbox"]') ? (el.closest('label') as HTMLElement ?? el) : el;
          const r = target.getBoundingClientRect(); return { name: (el.id || el.textContent || el.tagName).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
        }).filter(t => t.h < min || t.w < min), touch);
      expect(small, label + ': controles por debajo de ' + touch + ' px').toEqual([]);
    }
    await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Pérdida del equipo sin restauración' });
    await shot(page, 'lab-' + width + '-device-no-restore');
    await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Caída del CRM con simulacro local' });
    await shot(page, 'lab-' + width + '-crm-local');
    await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Sin evidencia' });
    await shot(page, 'lab-' + width + '-no-evidence');
    await page.getByLabel('Caso de ejemplo').selectOption({ label: 'Captura fuera de objetivo' });
    await shot(page, 'lab-' + width + '-old-capture');
    await page.getByLabel('Duración de la caída').fill('abc');
    await shot(page, 'lab-' + width + '-invalid');
    await page.getByRole('button', { name: 'Vaciar la simulación' }).click();
    await shot(page, 'lab-' + width + '-empty');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  });
}
