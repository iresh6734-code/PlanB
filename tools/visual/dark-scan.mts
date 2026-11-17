import { navigate } from './nav.mts';
// Con el modo oscuro activo, lista las superficies que siguen claras (fondo con luminancia > 0,45) en las 18 vistas,
// agrupadas por clase y con un texto de muestra. Solo lee.   npx tsx tools/visual/dark-scan.mts
import { chromium } from '@playwright/test';
const base = process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:4421/';
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const views: [string, string?][] = [['Inicio'], ['Hoy'], ['Clientes'], ['Empresas'], ['Oportunidades'], ['Tareas'], ['Cambios'], ['Agentes'], ['Radar'], ['Comprobar una fecha'], ['Continuidad'], ['Continuidad', 'Evidencia e impacto'], ['Continuidad', 'Copias y archivo'], ['Continuidad', 'Operaciones'], ['Copia de equipo'], ['Exportar'], ['Integraciones'], ['Preparación']];
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => { try { localStorage.setItem('planb:theme', 'dark'); } catch { /* */ } });
await page.goto(base); await page.waitForTimeout(4000);
await page.evaluate('globalThis.__name = v => v');
const found = new Map<string, Set<string>>();
for (const [label, tab] of views) {
  try {
    await navigate(page, label);
    if (tab) { await page.waitForTimeout(500); await page.getByRole('tab', { name: tab }).click({ timeout: 6000 }); }
    await page.waitForTimeout(1500);
    const hits = await page.evaluate(() => {
      const out: string[] = [];
      const lum = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return { l: 0, a: 0 }; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { l: 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]), a: p.length > 3 ? p[3] : 1 }; };
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
        const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') continue;
        const bg = lum(s.backgroundColor); if (bg.a < 0.5 || bg.l < 0.45) continue;
        if (e.closest('.fx-line .fx-dot, .brand, img, svg, .gx-badge, .avatar, .gx-theme-track')) continue;
        out.push(e.tagName.toLowerCase() + '.' + String((e as HTMLElement).className || '').trim().split(/\s+/).slice(0, 2).join('.') + ' ‹' + s.backgroundColor + '› «' + (e.textContent ?? '').trim().slice(0, 30) + '»');
      }
      return out;
    });
    for (const hit of hits) { const key = hit.split(' ‹')[0]; (found.get(key) ?? found.set(key, new Set()).get(key)!).add(label + (tab ? '›' + tab.slice(0, 8) : '') + ' ' + hit.slice(key.length)); }
  } catch (e) { console.log(label + ' NO ABRE ' + (e as Error).message.split('\n')[0].slice(0, 80)); }
}
await browser.close();
for (const [key, where] of [...found].sort((a, b) => b[1].size - a[1].size)) console.log(String(where.size).padStart(3) + '  ' + key + '   ' + [...where][0].slice(0, 90));
console.log('TOTAL selectores claros: ' + found.size);
