// Red visual de Verifica (plan de diseño «una sola app», corte 0). Prepara un encargo de ejemplo por la API del servidor de
// capturas (tests/.tmp/verifica-vista/start-api-visual.mjs: reloj y sal fijos, HubSpot simulado) y captura las vistas de
// Verifica en escritorio, móvil y oscuro, más el visor sin servidor (el que recibe el comprador).
//   npx tsx tools/visual/verifica.mts reference   → guarda las capturas y sus huellas como referencia
//   npx tsx tools/visual/verifica.mts compare     → vuelve a capturar y lista lo que ya no coincide (código 1 si algo cambió)
//   PLANB_VISUAL_DIR=tests/.tmp/visual-verifica npx tsx tools/visual/diff.mts escritorio-fuentes   → dónde difiere
// Las huellas de documentos (<code>) dependen del identificador aleatorio del encargo y se tapan en gris.
import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exampleFiles } from '../../scripts/verifica-ejemplo.js';

const mode = process.argv[2];
if (mode !== 'reference' && mode !== 'compare') throw new Error('Uso: npx tsx tools/visual/verifica.mts reference|compare');
const base = process.env.PLANB_VISUAL_VERIFICA_URL ?? 'http://127.0.0.1:4583';
const dir = path.resolve(process.env.PLANB_VISUAL_DIR ?? 'tests/.tmp/visual-verifica');
const out = path.join(dir, mode === 'reference' ? 'reference' : 'current');
mkdirSync(out, { recursive: true });
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright', 'chromium_headless_shell-1228', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const still = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

// 1 · Un encargo de ejemplo, siempre el mismo (el servidor de capturas empieza vacío y con el reloj fijo).
const api = async (method: string, route: string, body?: unknown) => {
  const response = await fetch(base + '/api/verifica' + route, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) throw new Error(method + ' ' + route + ' → ' + response.status + ' ' + text.slice(0, 200));
  return text;
};
const listed = JSON.parse(await api('GET', '/engagements')).engagements as { id: string }[];
if (listed.length) throw new Error('El servidor de capturas tiene que empezar vacío: reinícialo (preview «verifica-visual»).');
const files = exampleFiles(true);
const id = JSON.parse(await api('POST', '/engagements', { name: 'Distribuidora del norte' })).engagement.id as string;
for (const [role, file] of [['previous', 'antes.json'], ['latest', 'ahora.json'], ['declarations', 'declaraciones.json']] as const) await api('PUT', `/engagements/${id}/sources/${role}`, { text: files.get(file), fileName: file });
await api('POST', `/engagements/${id}/clean-room`);
await api('PUT', `/engagements/${id}/sources/invoices`, { text: files.get('facturas.csv'), fileName: 'facturas.csv' });
await api('POST', `/engagements/${id}/clean-room`);
const question = JSON.parse(await api('GET', `/engagements/${id}/questions`)).questions[0].id as string;
await api('PUT', `/engagements/${id}/answers/${question}`, { text: 'Son pedidos firmados en octubre; adjuntamos los contratos.' });
const packagePath = path.join(dir, 'paquete.json');
writeFileSync(packagePath, await api('POST', `/engagements/${id}/package`, { answers: true }));

// 2 · Las vistas.
type View = { key: string; offline?: boolean; go: (page: Page) => Promise<void> };
const toSources = async (page: Page) => { await page.getByRole('button', { name: 'Abrir fuentes' }).click(); await page.getByRole('heading', { level: 2, name: 'Expediente' }).waitFor(); await page.locator('.vf-ledger-entry').first().waitFor(); };
const step = (label: string) => async (page: Page) => { await toSources(page); await page.locator('.vf-step', { hasText: label }).click(); await page.waitForLoadState('networkidle'); };
const views: View[] = [
  { key: 'operacion', go: async page => { await page.getByRole('heading', { level: 1, name: 'Encargos de este equipo' }).waitFor(); } },
  { key: 'fuentes', go: toSources },
  { key: 'capturas', go: async page => { await step('Capturas')(page); await page.getByRole('heading', { level: 1, name: 'Leer HubSpot' }).waitFor(); } },
  { key: 'informe', go: async page => { await step('Hallazgos e informe')(page); await page.locator('.vf-findings').waitFor(); } },
  { key: 'vigilancia', go: step('Vigilancia') },
  { key: 'despues', go: step('Después del cierre') },
  { key: 'paquete', go: async page => { await page.locator('.vf-bar input[type=file]').setInputFiles(packagePath); await page.getByRole('heading', { level: 1, name: 'El paquete está íntegro' }).waitFor(); } },
  { key: 'suelta-informe', offline: true, go: async page => { await page.locator('.vf-findings').waitFor(); } },
  { key: 'suelta-vigilancia', offline: true, go: async page => { await page.locator('.vf-step', { hasText: 'Vigilancia' }).click(); await page.waitForLoadState('networkidle'); } },
  { key: 'suelta-migracion', offline: true, go: async page => { await page.locator('.vf-step', { hasText: 'Después del cierre' }).click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); } },
];
const modes = [
  { name: 'escritorio', viewport: { width: 1440, height: 900 }, dark: false },
  { name: 'movil', viewport: { width: 390, height: 844 }, dark: false },
  { name: 'oscuro', viewport: { width: 1440, height: 900 }, dark: true },
] as const;

const browser = await chromium.launch({ executablePath });
const manifest: Record<string, { hash: string; overflow: boolean }> = {};
for (const m of modes) {
  for (const view of views) {
    const page = await browser.newPage({ viewport: m.viewport, deviceScaleFactor: 1 });
    if (m.dark) await page.addInitScript(() => { try { localStorage.setItem('planb:theme', 'dark'); } catch { /* sin almacenamiento */ } });
    if (view.offline) await page.route('**/api/verifica/health', route => route.abort());
    await page.goto(base + '/verifica.html', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: still });
    await view.go(page);
    await page.evaluate(() => document.fonts.ready);
    const key = m.name + '-' + view.key;
    const image = await page.screenshot({ path: path.join(out, key + '.png'), fullPage: true, animations: 'disabled', mask: [page.locator('code')], maskColor: '#7f7f7f' });
    manifest[key] = { hash: createHash('sha256').update(image).digest('hex').slice(0, 16), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
    await page.close();
  }
}
await browser.close();
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (mode === 'reference') {
  console.log('Referencia de Verifica guardada: ' + Object.keys(manifest).length + ' capturas en ' + out);
} else {
  const reference = JSON.parse(readFileSync(path.join(dir, 'reference', 'manifest.json'), 'utf8')) as typeof manifest;
  const differing = Object.keys(manifest).filter(key => reference[key]?.hash !== manifest[key].hash);
  // Una captura que no coincide byte a byte puede ser solo suavizado de texto (unos pocos píxeles). Se cuentan los píxeles
  // distintos dentro del navegador, sin dependencias, como tools/visual/diff.mts.
  const noise: string[] = [], changed: string[] = [];
  if (differing.length) {
    const checker = await chromium.launch({ executablePath });
    const page = await checker.newPage();
    await page.evaluate('globalThis.__name = value => value');
    for (const key of differing) {
      const [a, b] = ['reference', 'current'].map(kind => 'data:image/png;base64,' + readFileSync(path.join(dir, kind, key + '.png')).toString('base64'));
      const pixels = await page.evaluate(async ([first, second]) => {
        const load = (src: string) => new Promise<HTMLImageElement>(resolve => { const image = new Image(); image.onload = () => resolve(image); image.src = src; });
        const [x, y] = await Promise.all([load(first), load(second)]);
        if (x.width !== y.width || x.height !== y.height) return -1;
        const data = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); return context.getImageData(0, 0, image.width, image.height).data; };
        const p = data(x), q = data(y); let count = 0;
        for (let i = 0; i < p.length; i += 4) if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) count++;
        return count;
      }, [a, b]);
      (pixels >= 0 && pixels <= 40 ? noise : changed).push(key + (pixels < 0 ? ' (otro tamaño)' : ' (' + pixels + ' px)'));
    }
    await checker.close();
  }
  const overflow = Object.keys(manifest).filter(key => manifest[key].overflow);
  console.log(changed.length ? 'Cambian ' + changed.length + ' de ' + Object.keys(manifest).length + ': ' + changed.join(', ') : 'Las ' + Object.keys(manifest).length + ' capturas coinciden con la referencia.');
  if (noise.length) console.log('Solo ruido de suavizado (≤ 40 px): ' + noise.join(', '));
  if (overflow.length) console.log('Desborde horizontal en: ' + overflow.join(', '));
  process.exitCode = changed.length || overflow.length ? 1 : 0;
}
