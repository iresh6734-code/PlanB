// Medición del móvil (CLAUDE-MOBILE-D5, 18/11/2026): en cada vista y anchura, ¿se desplaza la página de lado?, ¿hay
// contenido que se sale de la pantalla sin estar en una fila que desplace por sí misma?, ¿hay controles recortados por un
// contenedor que oculta su desbordamiento?
//   npx tsx tools/visual/mobile-scan.mts            (PLANB_VISUAL_URL, por defecto http://127.0.0.1:4421/; PLANB_WIDTHS=390,320)
// Solo lee. Las filas que desplazan por sí mismas (overflow-x auto o scroll: filtros, vistas, pestañas, la semana) son un
// patrón buscado y no cuentan. Sale con código 1 si alguna vista tiene problemas, para usarlo como comprobación.
import { chromium } from '@playwright/test';
const base = (process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:4421/').replace(/\/$/, '');
const widths = (process.env.PLANB_WIDTHS ?? '390,320').split(',').map(Number);
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const paths = ['/inicio', '/hoy', '/clientes', '/empresas', '/oportunidades', '/tareas', '/continuidad', '/continuidad/cambios', '/continuidad/exportar', '/ajustes/integraciones'];

const browser = await chromium.launch({ executablePath });
let problems = 0;
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 760 }, isMobile: true, hasTouch: true });
  await page.addInitScript('globalThis.__name = v => v');
  for (const path of paths) {
    await page.goto(base + path);
    await page.waitForSelector('.gx-topbar', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const vw = innerWidth, issues: string[] = [];
      const name = (e: Element) => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const scrollsAlone = (e: Element) => { for (let c = e.parentElement; c && c !== document.body; c = c.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(c).overflowX)) return true; return false; };
      for (const e of document.querySelectorAll('main *, .gx-mnav *')) {
        const box = e.getBoundingClientRect(); if (box.width < 2 || box.height < 2) continue;
        if (getComputedStyle(e).visibility === 'hidden' || e.closest('[aria-hidden="true"],.sr-only,.ui-sr,[hidden]')) continue;
        if (box.right > vw + 1 && !scrollsAlone(e)) issues.push('se sale ' + Math.round(box.right - vw) + ' px: ' + e.tagName.toLowerCase() + ' «' + name(e) + '»');
        if (/^(button|a|select|input)$/i.test(e.tagName)) for (let c = e.parentElement; c && c !== document.body; c = c.parentElement) {
          const s = getComputedStyle(c); if (['auto', 'scroll'].includes(s.overflowX)) break;
          if (s.overflowX === 'hidden' || s.overflowX === 'clip') { const p = c.getBoundingClientRect(); if (box.right > p.right + 1 || box.left < p.left - 1) issues.push('recortado: «' + name(e) + '»'); break; }
        }
      }
      return { page: document.documentElement.scrollWidth, issues: [...new Set(issues)] };
    });
    const sideways = result.page > width;
    if (sideways || result.issues.length) problems++;
    console.log(String(width).padEnd(4) + path.padEnd(24) + (sideways ? 'LA PÁGINA SE DESPLAZA DE LADO (' + result.page + ' px)' : 'ok') + (result.issues.length ? '\n    ' + result.issues.slice(0, 8).join('\n    ') : ''));
  }
  await page.close();
}
await browser.close();
console.log(problems ? problems + ' vistas con problemas' : 'Sin problemas en ' + paths.length * widths.length + ' vistas');
process.exitCode = problems ? 1 : 0;
