// Medidor de composición de la «Misión maestra» (21/11/2026). Solo lee: recorre las rutas de la App de ensayo (4572),
// guarda capturas y mide, por ruta y ancho, lo que la misión pide comprobar:
//  - scroll: alto del documento / alto de ventana (pantallas de scroll);
//  - desborde horizontal del documento;
//  - hueco muerto: mayor rectángulo vacío dentro del área principal, en la primera pantalla y en la página entera
//    (rejilla de 16 px; ocupan celda las hojas visibles —texto, controles, imágenes, iconos— con 8 px de margen);
//  - coherencia: alturas distintas de botones y campos, tamaños de letra, radios de borde, botones primarios a la vista.
// Uso: npx tsx tools/visual/composition.mts <etiqueta> [anchos separados por coma] [rutas separadas por coma]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.argv[2] ?? 'antes';
const sizes = (process.argv[3] ?? '1440x900,1366x768,390x844').split(',').map(s => s.split('x').map(Number) as [number, number]);
const ALL = ['/inicio', '/hoy', '/hoy/semana', '/hoy/agenda', '/hoy/propuestas', '/clientes', '/empresas', '/oportunidades', '/tareas',
  '/continuidad', '/continuidad/cambios', '/continuidad/exportar', '/continuidad/equipo', '/ajustes/integraciones', '/ajustes/preparacion',
  '/ajustes/plan'];
const routes = process.argv[4] ? process.argv[4].split(',') : ALL;
const base = process.env.MISION_URL ?? 'http://127.0.0.1:4572';
const outDir = join(process.env.MISION_OUT ?? 'tests/.tmp/mision/shots', tag);
mkdirSync(outDir, { recursive: true });

const MEASURE = `(() => {
  const main = document.querySelector('main') || document.body;
  const vw = innerWidth, vh = innerHeight;
  const mr = main.getBoundingClientRect();
  const left = Math.max(0, mr.left + scrollX), right = Math.min(vw, mr.right);
  const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const top = mr.top + scrollY;
  const bottom = Math.min(docH, top + main.scrollHeight);
  const visible = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const leaves = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT);
  let n; while ((n = walker.nextNode())) {
    const tagn = n.tagName;
    const isCtl = ['INPUT','SELECT','TEXTAREA','BUTTON','IMG','SVG','CANVAS','VIDEO','PROGRESS','METER'].includes(tagn) || n.getAttribute('role') === 'img';
    const hasText = Array.from(n.childNodes).some(c => c.nodeType === 3 && c.textContent.trim());
    const s = getComputedStyle(n);
    const painted = (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && n.getBoundingClientRect().height < 40) || s.backgroundImage !== 'none';
    if ((isCtl || hasText || painted) && visible(n)) {
      if (n.closest('.sr-only')) continue;
      const r = n.getBoundingClientRect();
      leaves.push([r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]);
    }
  }
  const C = 16, M = 8;
  const cols = Math.max(1, Math.floor((right - left) / C)), rows = Math.max(1, Math.ceil((bottom - top) / C));
  const grid = new Uint8Array(cols * rows);
  for (const [x1, y1, x2, y2] of leaves) {
    const c1 = Math.max(0, Math.floor((x1 - M - left) / C)), c2 = Math.min(cols - 1, Math.floor((x2 + M - left) / C));
    const r1 = Math.max(0, Math.floor((y1 - M - top) / C)), r2 = Math.min(rows - 1, Math.floor((y2 + M - top) / C));
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) grid[r * cols + c] = 1;
  }
  const largest = (rowFrom, rowTo) => {
    const h = new Array(cols).fill(0); let best = { area: 0 };
    for (let r = rowFrom; r < rowTo; r++) {
      for (let c = 0; c < cols; c++) h[c] = grid[r * cols + c] ? 0 : h[c] + 1;
      const st = [];
      for (let c = 0; c <= cols; c++) {
        const cur = c === cols ? 0 : h[c];
        while (st.length && h[st[st.length - 1]] >= cur) {
          const hh = h[st.pop()]; const w = st.length ? c - st[st.length - 1] - 1 : c;
          const area = hh * w;
          if (area > best.area) best = { area, w: w * C, h: hh * C, x: (st.length ? st[st.length - 1] + 1 : 0) * C + left, y: (r - hh + 1) * C + top };
        }
        st.push(c);
      }
    }
    return best;
  };
  const foldRows = Math.min(rows, Math.ceil((vh - (top - scrollY)) / C));
  const fold = largest(0, Math.max(1, foldRows));
  const page = largest(0, rows);
  const mainArea = (right - left) * Math.min(vh - top, bottom - top);
  const btns = Array.from(main.querySelectorAll('button, a.button, [role=button]')).filter(visible);
  const inputs = Array.from(main.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select')).filter(visible);
  const heights = list => { const m = {}; for (const el of list) { const h = Math.round(el.getBoundingClientRect().height); m[h] = (m[h] || 0) + 1; } return m; };
  const fonts = {}; const radii = {};
  for (const el of main.querySelectorAll('*')) { if (!visible(el)) continue; const s = getComputedStyle(el);
    if (Array.from(el.childNodes).some(c => c.nodeType === 3 && c.textContent.trim())) fonts[s.fontSize] = (fonts[s.fontSize] || 0) + 1;
    if (s.borderTopLeftRadius !== '0px' && (s.borderTopWidth !== '0px' || s.backgroundColor !== 'rgba(0, 0, 0, 0)')) radii[s.borderTopLeftRadius] = (radii[s.borderTopLeftRadius] || 0) + 1; }
  const foldPrimary = Array.from(main.querySelectorAll('.button.primary, button.primary, .primary')).filter(el => visible(el) && el.getBoundingClientRect().top < vh).length;
  const headings = Array.from(main.querySelectorAll('h1,h2,h3')).filter(visible).map(h => h.tagName + ':' + h.textContent.trim().slice(0, 40));
  const h1 = Array.from(main.querySelectorAll('h1')).filter(h => visible(h)).map(h => ({ text: h.textContent.trim().slice(0, 40), size: getComputedStyle(h).fontSize }));
  const surfaces = Array.from(main.querySelectorAll('section, article, .card, [class*=card], [class*=panel]')).filter(el => { if (!visible(el)) return false; const s = getComputedStyle(el); return s.borderTopWidth !== '0px' || s.boxShadow !== 'none' || s.backgroundColor !== 'rgba(0, 0, 0, 0)'; }).length;
  return { vw, vh, docH, scrollScreens: +(docH / vh).toFixed(2), hOverflow: document.documentElement.scrollWidth - vw,
    fold: { w: fold.w || 0, h: fold.h || 0, x: fold.x, y: fold.y, pct: +((fold.area * C * C) / Math.max(1, mainArea) * 100).toFixed(1) },
    page: { w: page.w || 0, h: page.h || 0, x: page.x, y: page.y },
    buttonHeights: heights(btns), inputHeights: heights(inputs), fonts, radii, foldPrimary, surfaces, headings: headings.slice(0, 14), h1 };
})()`;

const results: Record<string, unknown>[] = [];
const browser = await chromium.launch(process.env.MISION_CHROME ? { executablePath: process.env.MISION_CHROME } : {});
for (const [w, h] of sizes) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: (process.env.MISION_THEME as 'dark' | 'light') ?? 'light' });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('pageerror', w, e.message.slice(0, 160)));
  for (const route of routes) {
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(900);
      const m = await page.evaluate(MEASURE) as Record<string, unknown>;
      const file = join(outDir, route.replace(/^\//, '').replace(/\//g, '_') + '-' + w + '.png');
      await page.screenshot({ path: file, fullPage: true });
      results.push({ route, w, h, ...m });
      const f = m.fold as { w: number; h: number; pct: number }; const pg = m.page as { w: number; h: number };
      console.log(route.padEnd(24), String(w).padStart(4), 'scroll', String(m.scrollScreens).padStart(5), 'hOver', String(m.hOverflow).padStart(3),
        'hueco1ª', (f.w + 'x' + f.h).padEnd(9), String(f.pct).padStart(5) + '%', 'huecoPág', (pg.w + 'x' + pg.h).padEnd(9),
        'btnH', Object.keys(m.buttonHeights as object).length, 'inpH', Object.keys(m.inputHeights as object).length, 'fonts', Object.keys(m.fonts as object).length,
        'radii', Object.keys(m.radii as object).length, 'prim', m.foldPrimary, 'sup', m.surfaces);
    } catch (e) { console.error('FAIL', route, w, (e as Error).message.slice(0, 120)); }
  }
  await context.close();
}
await browser.close();
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(results, null, 1));
console.log('OK', results.length, 'mediciones en', outDir);
