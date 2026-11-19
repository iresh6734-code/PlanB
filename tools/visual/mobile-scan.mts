// Medición del móvil (CLAUDE-MOBILE-D5, 18/11/2026; R2 por la revisión 437): en cada vista y anchura, ¿se llegó de verdad
// a esa vista?, ¿se desplaza la página de lado?, ¿hay contenido que se sale de la pantalla sin estar en una fila que
// desplace por sí misma?, ¿hay controles recortados por algún contenedor (no solo el más cercano)?
//   npx tsx tools/visual/mobile-scan.mts               (PLANB_VISUAL_URL, por defecto http://127.0.0.1:4421/; PLANB_WIDTHS=390,320)
//   npx tsx tools/visual/mobile-scan.mts --self-test   (comprueba el propio escáner con páginas sintéticas, sin servidor)
// Solo lee. Llegar a la vista = respuesta HTTP 200, la misma dirección final (sin redirección) y su título principal
// visible; si falta algo o se agota el tiempo, la vista cuenta como fallida. Las filas que desplazan por sí mismas
// (overflow-x auto o scroll) son un patrón buscado: lo que contienen se mide contra la fila, y la fila contra lo de fuera.
// Sale con código 1 si alguna vista tiene problemas.
import { chromium, type Page } from '@playwright/test';
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const paths = ['/inicio', '/hoy', '/clientes', '/empresas', '/oportunidades', '/tareas', '/continuidad', '/continuidad/cambios', '/continuidad/exportar', '/ajustes/integraciones'];

/** Mide una vista. Devuelve los problemas encontrados (vacío = bien). `marker`: selector del destino (por defecto, el h1 de main). */
export async function scanPage(page: Page, url: string, width: number, marker = 'main h1'): Promise<string[]> {
  const response = await page.goto(url).catch(error => { throw new Error('No se pudo abrir ' + url + ': ' + error.message); });
  const issues: string[] = [];
  if (!response || response.status() !== 200) issues.push('respuesta HTTP ' + (response?.status() ?? 'ninguna'));
  if (new URL(page.url()).pathname !== new URL(url).pathname) issues.push('no se llegó a la vista: acabó en ' + new URL(page.url()).pathname);
  const arrived = await page.locator(marker).first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
  if (!arrived) issues.push('sin el título de la vista (' + marker + ') tras 30 s');
  if (issues.length) return issues;
  await page.waitForTimeout(800);
  const found = await page.evaluate(() => {
    const vw = innerWidth, out: string[] = [];
    const name = (e: Element) => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const scrolls = (c: Element) => ['auto', 'scroll'].includes(getComputedStyle(c).overflowX);
    const clips = (c: Element) => { const s = getComputedStyle(c); return ['hidden', 'clip'].includes(s.overflowX) || ['hidden', 'clip'].includes(s.overflow); };
    const outside = (a: DOMRect, b: DOMRect) => a.right > b.right + 1 || a.left < b.left - 1;
    const inScroller = (e: Element) => { for (let c = e.parentElement; c && c !== document.body; c = c.parentElement) if (scrolls(c)) return true; return false; };
    for (const e of document.querySelectorAll('main *, .gx-mnav *')) {
      const box = e.getBoundingClientRect(); if (box.width < 2 || box.height < 2) continue;
      if (getComputedStyle(e).visibility === 'hidden' || e.closest('[aria-hidden="true"],.sr-only,.ui-sr,[hidden]')) continue;
      if (box.right > vw + 1 && !inScroller(e)) out.push('se sale ' + Math.round(box.right - vw) + ' px: ' + e.tagName.toLowerCase() + ' «' + name(e) + '»');
      if (!/^(button|a|select|input)$/i.test(e.tagName)) continue;
      // Toda la cadena hasta la vista: lo que recorta, recorta aunque haya otro contenedor más cerca. Dentro de una fila que
      // desplaza, el control se alcanza desplazándola: desde ahí se mide la fila contra lo que haya fuera.
      let measured: DOMRect = box;
      for (let c = e.parentElement; c && c !== document.documentElement; c = c.parentElement) {
        if (scrolls(c)) { measured = c.getBoundingClientRect(); continue; }
        if (clips(c) && outside(measured, c.getBoundingClientRect())) { out.push('recortado: «' + name(e) + '» por .' + (c.className.toString().split(' ')[0] || c.tagName.toLowerCase())); break; }
      }
    }
    return { page: document.documentElement.scrollWidth, issues: [...new Set(out)] };
  });
  if (found.page > width) issues.push('LA PÁGINA SE DESPLAZA DE LADO (' + found.page + ' px)');
  return [...issues, ...found.issues];
}

const browser = await chromium.launch({ executablePath });
if (process.argv.includes('--self-test')) {
  // Controles independientes de la revisión 437 con páginas sintéticas servidas por page.route (sin red ni servidor).
  const origin = 'http://autoprueba.local';
  const html = (body: string) => '<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><main>' + body + '</main></body>';
  const serve = (route: import('@playwright/test').Route) => {
    const path = new URL(route.request().url()).pathname;
    // Como una App de una sola página que manda a la persona a iniciar sesión: misma respuesta 200, otra dirección final.
    if (path === '/redirige') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>location.replace("/sesion")</script>' });
    if (path === '/sesion') return route.fulfill({ contentType: 'text/html', body: html('<h1>Inicia sesión</h1>') });
    if (path === '/doble') return route.fulfill({ contentType: 'text/html', body: html('<h1>Doble</h1><div style="width:100px;overflow:hidden"><div style="width:220px;overflow:hidden"><button style="margin-left:150px;width:50px">Fuera</button></div></div>') });
    if (path === '/directo') return route.fulfill({ contentType: 'text/html', body: html('<h1>Directo</h1><div style="width:100px;overflow:hidden"><button style="margin-left:150px;width:50px">Fuera</button></div>') });
    if (path === '/fila') return route.fulfill({ contentType: 'text/html', body: html('<h1>Fila</h1><div style="width:200px;overflow-x:auto;white-space:nowrap"><button style="width:300px">Ancho</button><button>Último</button></div>') });
    if (path === '/sin-titulo') return route.fulfill({ contentType: 'text/html', body: html('<p>Sin título</p>') });
    return route.fulfill({ contentType: 'text/html', body: html('<h1>Bien</h1><button>Uno</button>') });
  };
  const cases: [string, (issues: string[]) => boolean, string][] = [
    ['/bien', issues => issues.length === 0, 'una vista correcta pasa'],
    ['/redirige', issues => issues.some(i => i.startsWith('no se llegó')), 'una redirección (p. ej. a /sesion) no cuenta como la vista pedida'],
    ['/sin-titulo', issues => issues.some(i => i.startsWith('sin el título')), 'sin marcador del destino, la vista falla'],
    ['/doble', issues => issues.some(i => i.startsWith('recortado: «Fuera»')), 'un contenedor exterior que recorta se detecta aunque el interior quepa'],
    ['/directo', issues => issues.some(i => i.startsWith('recortado: «Fuera»')), 'el recorte directo se sigue detectando'],
    ['/fila', issues => issues.length === 0, 'una fila que desplaza por sí misma es válida'],
  ];
  let failures = 0;
  for (const [path, ok, what] of cases) {
    // Una página por control: así ningún caso hereda una navegación del anterior.
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true });
    await page.addInitScript('globalThis.__name = v => v'); await page.route(origin + '/**', serve);
    const issues = await scanPage(page, origin + path, 390).catch(error => ['error: ' + error.message]);
    await page.close();
    const pass = ok(issues); if (!pass) failures++;
    console.log((pass ? 'ok   ' : 'FALLA ') + what + (issues.length ? ' — ' + issues.join('; ') : ''));
  }
  await browser.close();
  console.log(failures ? failures + ' controles fallidos' : 'Autoprueba: ' + cases.length + '/' + cases.length + ' controles');
  process.exit(failures ? 1 : 0);
}

const base = (process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:4421/').replace(/\/$/, '');
const widths = (process.env.PLANB_WIDTHS ?? '390,320').split(',').map(Number);
let problems = 0;
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 760 }, isMobile: true, hasTouch: true });
  await page.addInitScript('globalThis.__name = v => v');
  for (const path of paths) {
    const issues = await scanPage(page, base + path, width).catch(error => [String(error.message)]);
    if (issues.length) problems++;
    console.log(String(width).padEnd(4) + path.padEnd(24) + (issues.length ? '\n    ' + issues.slice(0, 8).join('\n    ') : 'ok'));
  }
  await page.close();
}
await browser.close();
console.log(problems ? problems + ' vistas con problemas' : 'Sin problemas en ' + paths.length * widths.length + ' vistas');
process.exitCode = problems ? 1 : 0;
