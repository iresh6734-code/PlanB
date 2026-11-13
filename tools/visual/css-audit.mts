// Auditoría de reglas CSS sin uso, por hoja.
//   npx tsx tools/visual/css-audit.mts
// Para cada regla de src/*.css comprueba si su selector encuentra algún elemento en alguna de las vistas de la app local
// (18 vistas en escritorio, 6 en móvil, una ficha abierta y el buscador). Los estados (:hover, :focus…) se ignoran al probar.
// LÍMITE: «sin coincidencia» no significa «muerta». No se visitan /team, la copia restaurada, la pantalla de bloqueo
// ni los estados de error, de carga o con datos distintos. Sirve para priorizar qué hoja retirar primero, no para borrar a ciegas.
import { chromium } from '@playwright/test';
import postcss from 'postcss';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.PLANB_VISUAL_URL ?? 'http://127.0.0.1:5199/';
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const views: [string, string?][] = [['Inicio'], ['Hoy'], ['Clientes'], ['Empresas'], ['Oportunidades'], ['Tareas'], ['Cambios'], ['Agentes'], ['Radar'], ['Comprobar una fecha'], ['Continuidad'], ['Continuidad', 'Evidencia e impacto'], ['Continuidad', 'Copias y archivo'], ['Continuidad', 'Operaciones'], ['Copia de equipo'], ['Exportar'], ['Integraciones'], ['Preparación']];

const rules: { file: string; selector: string; bytes: number }[] = [];
const sizes = new Map<string, number>();
for (const file of readdirSync('src').filter(name => name.endsWith('.css'))) {
  const text = readFileSync(path.join('src', file), 'utf8'); sizes.set(file, text.length);
  postcss.parse(text).walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test((rule.parent as postcss.AtRule).name)) return;
    const bytes = rule.toString().length / rule.selectors.length;
    for (const selector of rule.selectors) rules.push({ file, selector, bytes });
  });
}
const probe = (selector: string) => selector.replace(/::?(before|after|placeholder|selection|marker|-webkit-[a-z-]+|-moz-[a-z-]+)/g, '').replace(/:(hover|focus-visible|focus-within|focus|active|disabled|checked|visited|target|invalid|required|read-only|placeholder-shown|indeterminate|enabled|default)(\([^)]*\))?/g, '').trim() || '*';
const probes = rules.map(rule => probe(rule.selector));
const matched = new Set<number>();
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const sweep = async () => { const hits = await page.evaluate(list => list.map((selector, index) => { try { return document.querySelector(selector) ? index : -1; } catch { return -2 - index; } }).filter(index => index !== -1), probes); for (const hit of hits) if (hit >= 0) matched.add(hit); };
const open = async (label: string, tab?: string) => { await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first().click({ timeout: 6000 }); if (tab) { await page.waitForTimeout(400); await page.getByRole('tab', { name: tab }).click({ timeout: 6000 }); } await page.waitForTimeout(1300); await sweep(); };
await page.goto(base); await page.waitForTimeout(3000); await sweep();
for (const [label, tab] of views) await open(label, tab).catch(() => undefined);
await open('Clientes').catch(() => undefined);
await page.locator('.record-link').first().click().catch(() => undefined); await page.waitForTimeout(700); await sweep(); await page.keyboard.press('Escape');
await page.keyboard.press('Control+k'); await page.waitForTimeout(600); await page.keyboard.type('norte'); await page.waitForTimeout(900); await sweep(); await page.keyboard.press('Escape');
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
for (const [label, tab] of views.slice(0, 6)) await open(label, tab).catch(() => undefined);
await browser.close();

const byFile = new Map<string, { rules: number; used: number; bytes: number; usedBytes: number }>();
rules.forEach((rule, index) => { const row = byFile.get(rule.file) ?? { rules: 0, used: 0, bytes: 0, usedBytes: 0 }; row.rules++; row.bytes += rule.bytes; if (matched.has(index)) { row.used++; row.usedBytes += rule.bytes; } byFile.set(rule.file, row); });
const rows = [...byFile].map(([file, row]) => ({ hoja: file, kB: +((sizes.get(file) ?? 0) / 1024).toFixed(1), reglas: row.rules, conCoincidencia: row.used, usoPorPeso: row.bytes ? Math.round(row.usedBytes / row.bytes * 100) : 0 })).sort((a, b) => b.kB * (100 - b.usoPorPeso) - a.kB * (100 - a.usoPorPeso));
mkdirSync('tests/.tmp/visual', { recursive: true }); writeFileSync('tests/.tmp/visual/css-audit.json', JSON.stringify(rows, null, 1));
console.log('hoja'.padEnd(32) + 'kB'.padStart(7) + 'reglas'.padStart(8) + 'en uso'.padStart(8) + '  % del peso en uso');
for (const row of rows) console.log(row.hoja.padEnd(32) + String(row.kB).padStart(7) + String(row.reglas).padStart(8) + String(row.conCoincidencia).padStart(8) + String(row.usoPorPeso).padStart(8) + ' %');
const total = rows.reduce((sum, row) => sum + row.kB, 0), unused = rows.reduce((sum, row) => sum + row.kB * (100 - row.usoPorPeso) / 100, 0);
console.log('TOTAL ' + total.toFixed(0) + ' kB · sin coincidencia en estas vistas: ' + unused.toFixed(0) + ' kB (' + Math.round(unused / total * 100) + ' %)');
