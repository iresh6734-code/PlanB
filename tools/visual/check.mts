// Red de seguridad visual de Plan B.
//   npx tsx tools/visual/check.mts reference   → guarda la referencia (capturas + huellas)
//   npx tsx tools/visual/check.mts compare     → vuelve a capturar y dice qué vistas han cambiado
// Necesita la app servida con una copia de ensayo (PLANB_VISUAL_URL, por defecto http://127.0.0.1:5199/).
// Solo navega y lee: no guarda nada en la app. Lo que depende del reloj (antigüedad de la copia, saludo) se tapa
// para que dos capturas del mismo código sean idénticas byte a byte.
import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] ?? 'compare';
const base = process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:5199/';
const dir = path.resolve(process.env.PLANB_VISUAL_DIR ?? 'tests/.tmp/visual');
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
// PLANB_VISUAL_ONLY="390-clientes,1366-" limita la comparación a las vistas cuyo nombre contiene alguno de esos textos.
const only = (process.env.PLANB_VISUAL_ONLY ?? '').split(',').map(text => text.trim()).filter(Boolean);
const wanted = (key: string) => !only.length || only.some(text => key.includes(text));
const sizes: [number, number][] = [[1440, 900], [1366, 768], [1280, 800], [390, 844]];
const views: [string, string, string?][] = [
  ['inicio', 'Inicio'], ['hoy', 'Hoy'], ['clientes', 'Clientes'], ['empresas', 'Empresas'], ['oportunidades', 'Oportunidades'], ['tareas', 'Tareas'],
  ['cambios', 'Cambios'], ['agentes', 'Agentes'], ['radar', 'Radar'], ['fecha', 'Comprobar una fecha'],
  ['continuidad', 'Continuidad'], ['continuidad-evidencia', 'Continuidad', 'Evidencia e impacto'], ['continuidad-copias', 'Continuidad', 'Copias y archivo'], ['continuidad-operaciones', 'Continuidad', 'Operaciones'],
  ['equipo', 'Copia de equipo'], ['exportar', 'Exportar'], ['integraciones', 'Integraciones'], ['preparacion', 'Preparación']
];
// Zonas cuyo texto depende de la hora a la que se captura.
const clockBound = ['.gx-copy', '.oc-status', '.oc-home-head', '.fx-next', '.continuity-summary', '.cph-sources', '.wks-meta', '.co-provenance', '.lint-space', '.cr > p', '[data-testid="work-summary-awaiting-context"]', '.cpp', '.imp', '.continuity-operations', '.history-list', '.preparation-review-identity', '.export-revision', '.sidebar-bottom', '.wks-head', '.chub-block > section:first-of-type'];
const still = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

async function open(page: Page, label: string, tab?: string) {
  const nav = page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first();
  if (await nav.isVisible().catch(() => false)) await nav.click({ timeout: 6000 });
  else {
    // En móvil no hay barra lateral: se navega como lo haría la persona, con «Más» (la paleta de órdenes).
    await page.locator('.gx-mnav').getByRole('button', { name: 'Más' }).click({ timeout: 6000 });
    await page.locator('.gx-commands input').fill(label);
    const option = page.locator('.gx-commands li').filter({ has: page.locator('span', { hasText: new RegExp('^(Ir a |Ir al )?' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).first();
    await option.click({ timeout: 6000 });
  }
  if (tab) { await page.waitForTimeout(500); await page.getByRole('tab', { name: tab }).click({ timeout: 6000 }); }
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(900);
}

const browser = await chromium.launch({ executablePath });
const out = path.join(dir, mode === 'reference' ? 'reference' : 'current');
mkdirSync(out, { recursive: true });
const manifest: Record<string, { hash: string; height: number; overflow: boolean }> = {};
const problems: string[] = [];
for (const [width, height] of sizes) {
  if (!views.some(([name]) => wanted(width + '-' + name))) continue;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(base); await page.waitForTimeout(3000);
  await page.addStyleTag({ content: still });
  for (const [name, label, tab] of views) {
    const key = width + '-' + name;
    if (!wanted(key)) continue;
    try {
      await open(page, label, tab);
      const info = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
      const image = await page.screenshot({ path: path.join(out, key + '.png'), fullPage: true, animations: 'disabled', mask: clockBound.map(selector => page.locator(selector)), maskColor: '#7f7f7f' });
      manifest[key] = { hash: createHash('sha256').update(image).digest('hex').slice(0, 16), ...info };
      if (info.overflow) problems.push(key + ': desborde horizontal');
    } catch (failure) { problems.push(key + ': ' + (failure as Error).message.split('\n')[0].slice(0, 120)); }
  }
  await page.close();
}
await browser.close();
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
if (mode === 'reference' && only.length) { console.error('La referencia se toma siempre completa: quita PLANB_VISUAL_ONLY.'); process.exit(2); }
if (mode === 'reference') { console.log('Referencia guardada: ' + Object.keys(manifest).length + ' vistas en ' + out); if (problems.length) console.log(problems.join('\n')); process.exit(problems.length ? 1 : 0); }
const referenceFile = path.join(dir, 'reference', 'manifest.json');
if (!existsSync(referenceFile)) { console.error('No hay referencia: ejecuta antes «reference».'); process.exit(2); }
const reference = JSON.parse(readFileSync(referenceFile, 'utf8')) as typeof manifest;
const compared = Object.keys(reference).filter(wanted);
const changed = compared.filter(key => !manifest[key] || manifest[key].hash !== reference[key].hash);
for (const key of changed) console.log('CAMBIA ' + key + (manifest[key] ? '  alto ' + reference[key].height + ' → ' + manifest[key].height : '  (no se pudo capturar)'));
console.log(compared.length - changed.length + ' vistas idénticas, ' + changed.length + ' distintas' + (problems.length ? '\n' + problems.join('\n') : ''));
process.exit(changed.length || problems.length ? 1 : 0);
