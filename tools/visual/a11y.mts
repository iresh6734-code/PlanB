// Auditoría de accesibilidad automatizada (WCAG 2.1 AA, la parte que se puede medir sin una persona).
//   npx tsx tools/visual/a11y.mts            (PLANB_VISUAL_URL, por defecto http://127.0.0.1:4421/; PLANB_THEME=dark para el modo oscuro)
// Por cada vista: contraste real de cada texto visible contra su fondo efectivo, controles sin nombre accesible,
// campos sin etiqueta, imágenes sin texto alternativo, objetivos táctiles diminutos y foco visible al tabular.
// Solo lee. LÍMITE: no sustituye una revisión con lector de pantalla ni juzga si un texto es comprensible.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:4421/';
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const views: [string, string?][] = [['Inicio'], ['Hoy'], ['Clientes'], ['Empresas'], ['Oportunidades'], ['Tareas'], ['Cambios'], ['Agentes'], ['Radar'], ['Comprobar una fecha'], ['Continuidad'], ['Continuidad', 'Evidencia e impacto'], ['Continuidad', 'Copias y archivo'], ['Continuidad', 'Operaciones'], ['Copia de equipo'], ['Exportar'], ['Integraciones'], ['Preparación']];
const browser = await chromium.launch({ executablePath });
// PLANB_VIEWPORT=390x844 mide el móvil (se navega con «Más» y la paleta, como la persona).
const [vw, vh] = (process.env.PLANB_VIEWPORT ?? '1366x768').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const navTo = async (label: string) => {
  const nav = page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first();
  if (await nav.isVisible().catch(() => false)) { await nav.click({ timeout: 6000 }); return; }
  await page.locator('.gx-mnav').getByRole('button', { name: 'Más' }).click({ timeout: 6000 });
  await page.locator('.gx-commands input').fill(label);
  await page.locator('.gx-commands li').filter({ has: page.locator('span', { hasText: new RegExp('^(Ir a |Ir al )?' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).first().click({ timeout: 6000 });
};
// PLANB_THEME=dark mide el modo oscuro.
if (process.env.PLANB_THEME === 'dark') await page.addInitScript(() => { try { localStorage.setItem('planb:theme', 'dark'); } catch { /* */ } });
await page.goto(base); await page.waitForTimeout(4000);
await page.evaluate('globalThis.__name = v => v');
const all: Record<string, string[]> = {};
const audit = (scope = 'main *, .sidebar *, .gx-topbar *', page1 = true) => page.evaluate(([scope, page1]) => {
  const out: string[] = [];
  const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number }) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a) });
  const background = (el: Element | null): { r: number; g: number; b: number } | null => {
    const stack: { r: number; g: number; b: number; a: number }[] = [];
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url')) return null; const c = parse(s.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
    let color = { r: 255, g: 255, b: 255 }; for (const c of stack.reverse()) color = blend(c, color); return color;
  };
  const visible = (e: Element) => { const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false; const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.1 && !e.closest('[aria-hidden="true"],[inert],.ui-sr,.oc-sr,.sr-only'); };
  const name = (e: Element) => (e.getAttribute('aria-label') || e.getAttribute('title') || (e.getAttribute('aria-labelledby') ? document.getElementById(e.getAttribute('aria-labelledby')!)?.textContent : '') || (e as HTMLElement).innerText || e.textContent || (e as HTMLInputElement).value || '').trim();
  // Contraste
  const seen = new Set<string>();
  for (const node of document.querySelectorAll(scope as string)) {
    const own = [...node.childNodes].some(child => child.nodeType === 3 && child.textContent!.trim().length > 1);
    if (!own || !visible(node) || (node as HTMLElement).closest('button:disabled,[aria-disabled="true"],select:disabled,input:disabled')) continue;
    const s = getComputedStyle(node), fg = parse(s.color), bg = background(node); if (!fg || !bg) continue;
    const text = blend(fg, bg), ratio = (Math.max(lum(text), lum(bg)) + 0.05) / (Math.min(lum(text), lum(bg)) + 0.05);
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700, large = size >= 24 || (bold && size >= 18.66);
    if (ratio < (large ? 3 : 4.5)) { const key = 'contraste ' + ratio.toFixed(2) + ' «' + (node.textContent ?? '').trim().slice(0, 40) + '» (' + node.tagName.toLowerCase() + '.' + String((node as HTMLElement).className).split(' ')[0] + ')'; if (!seen.has(key)) { seen.add(key); out.push(key); } }
  }
  // Nombres y etiquetas
  for (const e of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], select, input:not([type="hidden"]), textarea')) {
    if (!visible(e)) continue;
    const tag = e.tagName.toLowerCase();
    if ((tag === 'input' || tag === 'select' || tag === 'textarea')) { const id = e.id; const labelled = (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || e.closest('label') || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title'); if (!labelled) out.push('campo sin etiqueta (' + tag + (e.getAttribute('type') ? '[' + e.getAttribute('type') + ']' : '') + ' ' + ((e as HTMLInputElement).placeholder || '') + ')'); }
    else if (!name(e)) out.push('control sin nombre ' + e.outerHTML.slice(0, 160));
    const r = e.getBoundingClientRect(); if ((tag === 'button' || tag === 'a') && r.width < 20 && r.height < 20 && !e.closest('.fx-days')) out.push('objetivo muy pequeño ' + Math.round(r.width) + '×' + Math.round(r.height) + ' (' + (name(e).slice(0, 30) || tag) + ')');
  }
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt')) out.push('imagen sin alt');
  if (page1) { // Cuenta los h1 del árbol de accesibilidad (visibles o solo para lectores, p. ej. .sr-only), no los ocultos con display, visibility o aria-hidden.
    const exposed = (el: Element) => !el.closest('[aria-hidden="true"], [hidden]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const h1 = [...document.querySelectorAll('main h1')].filter(exposed).length; if (h1 !== 1) out.push('títulos h1 en main (árbol de accesibilidad): ' + h1); }
  return out;
}, [scope, page1] as const);
for (const [label, tab] of views) {
  try {
    await navTo(label);
    if (tab) { await page.waitForTimeout(500); await page.getByRole('tab', { name: tab }).click({ timeout: 6000 }); }
    await page.waitForTimeout(1600);
    const issues = await audit();
    // Foco visible: tabula 6 veces desde el contenido y comprueba que el elemento enfocado dibuja contorno o sombra.
    await page.locator('main').focus().catch(() => undefined);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const shown = await page.evaluate(() => { const e = document.activeElement as HTMLElement | null; if (!e || e === document.body) return 'sin-foco'; const s = getComputedStyle(e); const ring = (x: Element | null) => { if (!x) return false; const t = getComputedStyle(x); return (t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) > 0) || t.boxShadow !== 'none'; }; return ring(e) || ring(e.closest('.search-field')) ? 'ok' : 'foco invisible en ' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' «' + (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30) + '»'; }); if (shown !== 'ok' && shown !== 'sin-foco') issues.push(shown); }
    all[label + (tab ? ' › ' + tab : '')] = [...new Set(issues)];
  } catch (e) { all[label] = ['NO ABRE: ' + (e as Error).message.split('\n')[0].slice(0, 100)]; }
}
// Capas: fichas, ventanas, paleta y buscador. Se abren, se auditan dentro de la capa y se cierran sin guardar nada.
const overlay = async (name: string, open: () => Promise<unknown>, scope = '[role="dialog"] *') => {
  try {
    await open(); await page.waitForTimeout(1300);
    const issues = (await audit(scope, false)).filter(issue => !issue.startsWith('títulos'));
    all['capa · ' + name] = [...new Set(issues)];
  } catch (e) { all['capa · ' + name] = ['NO ABRE: ' + (e as Error).message.split('\n')[0].slice(0, 100)]; }
  for (let i = 0; i < 2 && await page.locator('[role="dialog"]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
};
const go = async (label: string) => { await navTo(label); await page.waitForTimeout(1500); };
await go('Clientes');
await overlay('ficha de cliente', () => page.locator('.record-link').first().click());
await overlay('ficha nueva', () => page.locator('.gx-records-head .button.primary').click());
await overlay('cobertura', () => page.getByRole('button', { name: 'Ver cobertura' }).click());
await overlay('paleta de órdenes', () => page.locator('.gx-cmd:not(.gx-theme)').click());
if (vw > 760) await overlay('atajos', () => page.getByRole('button', { name: 'Atajos de teclado' }).click()); // en móvil no hay atajos de teclado
await overlay('buscador', async () => { if (vw > 760) await page.getByRole('button', { name: /Buscar en toda la copia/ }).first().click(); else { await page.locator('.gx-mnav').getByRole('button', { name: 'Más' }).click(); await page.locator('.gx-commands input').fill('Buscar en toda la copia'); await page.locator('.gx-commands li').first().click(); } await page.waitForTimeout(500); await page.keyboard.type('norte'); }, '.workspace-search *');
await go('Inicio');
await overlay('resumen de la semana', () => page.getByRole('button', { name: 'Resumen de la semana' }).click());
if (await page.locator('.gx-dispatch').count()) await overlay('despachar vencidas', async () => { await page.locator('.gx-dispatch').click(); await page.waitForTimeout(1500); });
await go('Tareas');
await overlay('ficha de tarea', () => page.locator('.record-link').first().click());
await browser.close();
mkdirSync('tests/.tmp/visual', { recursive: true }); writeFileSync('tests/.tmp/visual/a11y.json', JSON.stringify(all, null, 1));
let count = 0; for (const [view, issues] of Object.entries(all)) { count += issues.length; console.log(view.padEnd(34) + issues.length + (issues.length ? '\n   ' + issues.slice(0, 14).join('\n   ') : '')); }
console.log('TOTAL ' + count);
