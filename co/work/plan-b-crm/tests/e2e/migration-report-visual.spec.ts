import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMigrationDemo } from '../../shared/migration-demo.js';
import { buildMigrationReport, renderMigrationHtml, renderMigrationJson } from '../../shared/migration-report.js';
import { canonicalJson, compareMigration, parseInstant, sha256Hex } from '../../shared/migration-verifier.js';

// VERIFICADOR DE MIGRACIONES · VALIDACIÓN EN NAVEGADOR (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-VISUAL). Dos cosas, sobre el HTML y el motor REALES, sin servidor, sin proveedor y con todo bloqueado salvo el propio documento:
//  1 · COHERENCIA servidor/navegador: el motor empaquetado y ejecutado en Chromium da exactamente el MISMO JSON, el MISMO HTML y las MISMAS huellas que Node, también en zonas horarias y cambios de hora.
//  2 · MAQUETACIÓN: el informe con contenido arbitrario (IDs largos sin espacios, texto bidireccional, emoji, caracteres de control, cientos de elementos) a 1440/390/320 px en claro y oscuro: sin desbordamiento
//      horizontal de la página, sin texto fuera de la ventana, contraste suficiente, sin scripts ni recursos externos. El motor sigue INTERNO: no hay pantalla ni endpoint.
const repo = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-migvis-')), GENERATED = '2026-11-08T10:00:00.000Z';
const p = (file: string) => JSON.stringify(path.join(repo, file).replace(/\\/g, '/'));
let bundleText = '';
const evidence: Record<string, unknown> = {};

test.beforeAll(async () => {
  const entry = `import * as verifier from ${p('shared/migration-verifier.ts')}; import * as report from ${p('shared/migration-report.ts')}; import * as demo from ${p('shared/migration-demo.ts')}; import * as budget from ${p('shared/migration-budget.ts')};
(window as any).__mig = { ...verifier, ...report, ...demo, ...budget };`;
  const result = await build({ stdin: { contents: entry, resolveDir: repo, sourcefile: 'entry.ts', loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'iife', logLevel: 'error', target: 'es2022' });
  bundleText = result.outputFiles[0]!.text; evidence.bundleBytes = bundleText.length; evidence.bundleSha256 = createHash('sha256').update(bundleText).digest('hex');
  evidence.sources = Object.fromEntries(['shared/migration-verifier.ts', 'shared/migration-report.ts', 'shared/migration-demo.ts', 'shared/migration-budget.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')]));
});
test.afterAll(() => { fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('EVIDENCIA-MIGVIS ' + root + '\n' + JSON.stringify(evidence)); });

async function blank(page: Page) {
  const external: string[] = []; await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  await page.goto('about:blank'); await page.addScriptTag({ content: bundleText }); expect(await page.evaluate(() => typeof (window as any).__mig.compareMigration)).toBe('function'); return external;
}

test('COHERENCIA servidor/navegador: JSON, HTML, huellas, vectores de SHA-256 y resolución de zonas y cambios de hora son idénticos en Node y en Chromium', async ({ page }) => {
  await blank(page);
  const d = createMigrationDemo(), nodeReport = buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED }), withValues = buildMigrationReport(compareMigration(d.source, d.target, d.map, { includeValues: true }), { generatedAt: GENERATED });
  const inBrowser = await page.evaluate(({ source, target, map, generatedAt }) => {
    const m = (window as any).__mig, c = m.compareMigration(source, target, map), r = m.buildMigrationReport(c, { generatedAt }), v = m.buildMigrationReport(m.compareMigration(source, target, map, { includeValues: true }), { generatedAt });
    return { json: m.renderMigrationJson(r), html: m.renderMigrationHtml(r), htmlValues: m.renderMigrationHtml(v), hashes: [source, target, map].map((x: unknown) => m.sha256Hex(m.canonicalJson(x))), counts: c.objects.map((o: any) => o.counts) };
  }, { source: d.source, target: d.target, map: d.map, generatedAt: GENERATED });
  expect(inBrowser.json).toBe(renderMigrationJson(nodeReport)); expect(inBrowser.html).toBe(renderMigrationHtml(nodeReport)); expect(inBrowser.htmlValues).toBe(renderMigrationHtml(withValues));
  expect(inBrowser.hashes).toEqual([d.source, d.target, d.map].map(x => sha256Hex(canonicalJson(x)))); expect(inBrowser.counts).toEqual(compareMigration(d.source, d.target, d.map).objects.map(o => o.counts));
  const vectors: Array<[string, string]> = [['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'], ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'], ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0']];
  const unicode = ['á漢字🚀', '\u0000\u001f\u007f', '😀', '\ud800', 'ñ'.repeat(40_000)];
  const hashesInBrowser = await page.evaluate(({ vectors, unicode }) => { const m = (window as any).__mig; return { published: vectors.map(([text]: [string, string]) => m.sha256Hex(text)), unicode: unicode.map((text: string) => m.sha256Hex(text)) }; }, { vectors, unicode });
  expect(hashesInBrowser.published).toEqual(vectors.map(([, expected]) => expected)); expect(hashesInBrowser.unicode).toEqual(unicode.map(text => createHash('sha256').update(text, 'utf8').digest('hex')));
  const instants: Array<[string, string | null]> = [['2026-03-29 01:59:59', 'Europe/Madrid'], ['2026-03-29 02:00:00', 'Europe/Madrid'], ['2026-03-29 03:00:00', 'Europe/Madrid'], ['2026-10-25 01:59:59', 'Europe/Madrid'], ['2026-10-25 02:00:00', 'Europe/Madrid'], ['2026-10-25 02:59:59', 'Europe/Madrid'], ['2026-10-25 03:00:00', 'Europe/Madrid'],
    ['2026-03-08 02:30:00', 'America/New_York'], ['2026-11-01 01:30:00', 'America/New_York'], ['2026-11-01 02:30:00', 'America/New_York'], ['2026-07-01 12:00:00', 'Asia/Kolkata'], ['2026-07-01 12:00:00', 'Asia/Kathmandu'], ['2026-07-01 12:00:00+02:00', null], ['2026-07-01 12:00:00', null], ['2026-02-29 12:00:00', 'UTC'], ['2024-02-29 12:00:00', 'UTC'], ['2026-07-01 12:00:00', 'Australia/Lord_Howe'], ['2026-04-05 01:45:00', 'Australia/Lord_Howe']];
  const nodeInstants = instants.map(([value, zone]) => parseInstant(value, zone)), browserInstants = await page.evaluate(list => list.map(([value, zone]: [string, string | null]) => (window as any).__mig.parseInstant(value, zone)), instants);
  expect(browserInstants).toEqual(nodeInstants); evidence.instantsCompared = instants.length;
});

const long = (char: string, n: number) => char.repeat(n);
function adversarial() {
  const d = createMigrationDemo(); const bidi = 'שלום עולם العربية', emoji = '👩‍👩‍👧‍👦🚀', controls = 'a\u0007b‮c⁦d⁩e‏';
  d.source.provider = long('a', 64); d.target.provider = long('b', 64); d.source.accountId = long('A', 160); d.target.accountId = long('Ñ', 160);
  d.map.sourceProvider = d.source.provider; d.map.targetProvider = d.target.provider; d.map.sourceAccountId = d.source.accountId; d.map.targetAccountId = d.target.accountId; d.map.confirmedBy = long('P', 160);
  const contact = d.source.objects.find(o => o.objectType === 'contact')!, person = d.target.objects.find(o => o.objectType === 'person')!;
  // cientos de ausentes, dudosos y cambios con IDs largos o raros
  const weird = [long('I', 120), bidi.slice(0, 40), emoji.repeat(10), controls, '<script>alert(1)</script>"&\'`', long('漢', 100)];
  contact.rows = [...contact.rows, ...weird.map((id, i) => ({ id, values: { email: 'raro' + i + '@example.test', first_name: bidi, last_name: emoji, phone: long('9', 80), company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } })),
    ...Array.from({ length: 300 }, (_, i) => ({ id: 'ausente-' + long('x', 60) + '-' + i, values: { email: 'a' + i + '@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } })),
    ...Array.from({ length: 220 }, (_, i) => ({ id: 'dup-' + i, values: { email: 'duplicada@example.test', first_name: 'D', last_name: 'D', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } }))];
  contact.declaredTotal = contact.rows.length;
  d.map.objects[0]!.fields.push({ source: long('f', 80), target: long('g', 80), type: 'text', normalize: 'exact', required: true, relevant: true });
  contact.rows[0]!.values[long('f', 80)] = long('v', 70); person.rows[0]!.values[long('g', 80)] = long('w', 70);
  return d;
}

const luminance = (rgb: number[]) => { const [r, g, b] = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const ratio = (a: number[], b: number[]) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

test('MAQUETACIÓN a 1440, 390 y 320 px en claro y oscuro con contenido arbitrario: sin desbordamiento horizontal de la página, nada fuera de la ventana, contraste suficiente, sin scripts ni peticiones externas, caracteres de control y de dirección visibles en lugar de actuar', async ({ browser }, info) => {
  test.setTimeout(240_000); fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  const d = adversarial(), report = buildMigrationReport(compareMigration(d.source, d.target, d.map, { includeValues: true }), { generatedAt: GENERATED }), html = renderMigrationHtml(report);
  fs.writeFileSync(path.join(root, 'informe-adversarial.html'), html); expect(report.countersAddUp).toBe(true); evidence.adversarialHtmlBytes = html.length;
  for (const scheme of ['light', 'dark'] as const) for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 780 }, colorScheme: scheme }), page = await context.newPage(), requests: string[] = [];
    page.on('request', request => { if (!request.url().startsWith('about:') && !request.url().startsWith('data:')) requests.push(request.url()); }); await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    expect(await page.evaluate(() => document.scripts.length), 'sin scripts').toBe(0); expect(requests, 'sin peticiones externas').toEqual([]);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'none'");
    const raw = await page.evaluate(() => document.body.innerHTML); expect(/[\u0007‪-‮⁦-⁩‎‏]/.test(raw), 'sin caracteres de control ni de dirección sin neutralizar').toBe(false); expect(raw).toContain('‹U+202E›');
    await page.evaluate(() => document.querySelectorAll('details').forEach(node => { (node as HTMLDetailsElement).open = true; }));
    const metrics = await page.evaluate(() => {
      const view = innerWidth, inScroll = (el: Element) => !!el.closest('.scroll'), outside: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll('*'))) { if (inScroll(el)) continue; const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > view + 1 || r.left < -1)) outside.push(el.tagName + ':' + (el.textContent ?? '').slice(0, 30)); }
      const cs = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);
      const rgb = (value: string) => (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const pick = (selector: string) => { const el = document.querySelector(selector); return el ? { color: rgb(cs(el, 'color')), bg: rgb(getComputedStyle(document.body).backgroundColor) } : null; };
      // Las cabeceras de fila NO se parten por la mitad de una palabra: cada una ocupa como mucho tantas líneas como palabras tiene.
      const broken: string[] = [];
      for (const th of Array.from(document.querySelectorAll('th'))) { const words = (th.textContent ?? '').trim().split(/\s+/).filter(Boolean).length, range = document.createRange(); range.selectNodeContents(th); const tops = new Set(Array.from(range.getClientRects()).map(r => Math.round(r.top / 4))); if (tops.size > words) broken.push((th.textContent ?? '').trim().slice(0, 30) + ' (' + tops.size + ' líneas, ' + words + ' palabras)'); }
      return { doc: document.documentElement.scrollWidth, view, outside: outside.slice(0, 5), broken, scrollers: Array.from(document.querySelectorAll('.scroll')).filter(e => e.scrollWidth > e.clientWidth + 1).length, body: pick('body'), note: pick('.note'), warn: pick('.warn'), hint: pick('.hint'), cov: pick('.cov') };
    });
    const label = scheme + ' ' + width; expect(metrics.doc, label + ': la página no se desplaza horizontalmente').toBeLessThanOrEqual(metrics.view + 1); expect(metrics.outside, label + ': ningún elemento fuera de la ventana').toEqual([]); expect(metrics.broken, label + ': ninguna cabecera partida por la mitad de una palabra').toEqual([]);
    for (const key of ['body', 'note', 'warn', 'hint', 'cov'] as const) { const item = metrics[key]; if (item) expect(ratio(item.color, item.bg), label + ' · contraste de ' + key).toBeGreaterThanOrEqual(4.5); }
    await page.screenshot({ path: path.join(root, 'shots', 'informe-' + scheme + '-' + width + '.png'), fullPage: false });
    await page.locator('summary', { hasText: 'Dudosos, sin resolver' }).first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(root, 'shots', 'dudosos-' + scheme + '-' + width + '.png'), fullPage: false });
    await page.locator('summary', { hasText: 'Registros con diferencias' }).first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(root, 'shots', 'cambios-' + scheme + '-' + width + '.png'), fullPage: false });
    info.annotations.push({ type: 'medida ' + label, description: 'documento ' + metrics.doc + ' px en ventana de ' + metrics.view + '; tablas con desplazamiento propio: ' + metrics.scrollers });
    await context.close();
  }
  info.annotations.push({ type: 'capturas', description: path.join(root, 'shots') });
});

test('TECLADO Y ESTRUCTURA: los bloques plegables se alcanzan con Tab y se abren con Enter, los encabezados tienen jerarquía, el titular de veredicto es un estado y las tablas tienen leyenda o cabecera', async ({ page }) => {
  const d = createMigrationDemo(), html = renderMigrationHtml(buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED }));
  await page.route('**/*', route => route.abort()); await page.setContent(html, { waitUntil: 'load' });
  const summaries = page.locator('summary'); expect(await summaries.count()).toBeGreaterThan(3);
  await summaries.first().focus(); const closed = await page.evaluate(() => !(document.activeElement!.parentElement as HTMLDetailsElement).open); expect(closed).toBe(true); await page.keyboard.press('Enter'); expect(await page.evaluate(() => (document.activeElement!.parentElement as HTMLDetailsElement).open)).toBe(true);
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.activeElement!.tagName)).toBe('SUMMARY');
  expect(await page.locator('h1').count()).toBe(1); expect(await page.locator('h2').count()).toBeGreaterThanOrEqual(4); expect(await page.locator('[role="status"]').count()).toBe(1); expect(await page.locator('html').getAttribute('lang')).toBe('es');
  const tables = await page.locator('table').count(); expect(tables).toBeGreaterThan(2); expect(await page.locator('table:not(:has(caption)):not(:has(th))').count(), 'toda tabla tiene leyenda o cabeceras').toBe(0);
});

test('R2 · DOM: IDs distintos (carácter real U+202E, «‹U+202E›» literal, notación anidada y texto parecido) tienen texto VISIBLE distinto en Chromium y ninguno actúa como dirección', async ({ page }) => {
  const d = createMigrationDemo(), contact = d.source.objects.find(o => o.objectType === 'contact')!, ids = ['id-‮-final', 'id-‹U+202E›-final', 'id-‹U+2039›U+202E‹U+203A›-final', 'id-U+202E-final'];
  contact.rows.push(...ids.map((id, i) => ({ id, values: { email: 'dom' + i + '@example.test', first_name: 'A', last_name: 'B', phone: '1', company_id: null, created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null } }))); contact.declaredTotal = contact.rows.length;
  const html = renderMigrationHtml(buildMigrationReport(compareMigration(d.source, d.target, d.map), { generatedAt: GENERATED }));
  await page.route('**/*', route => route.abort()); await page.setContent(html, { waitUntil: 'load' });
  const visible = await page.evaluate(() => { const list = Array.from(document.querySelectorAll('details')).find(node => (node.querySelector('summary')?.textContent ?? '').startsWith('Ausentes en el destino'))!; (list as HTMLDetailsElement).open = true; return Array.from(list.querySelectorAll('code')).map(code => (code as HTMLElement).innerText).filter(text => text.startsWith('id-')); });
  expect(visible).toHaveLength(4); expect(new Set(visible).size, 'cuatro IDs distintos se ven distintos: ' + visible.join(' | ')).toBe(4);
  expect(visible.some(text => /[‪-‮⁦-⁩]/.test(text)), 'ningún carácter de dirección llega al DOM').toBe(false);
});
