import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Unidad 199 · DOM del comparador de decisiones en Chromium real. Es un ARNÉS: monta TaskConflictReview aislado con datos ficticios de makeFixture
// (no la ficha 123, ni la App, ni un servidor). Acredita el componente y su modelo; NO acredita que el conflicto se resuelva desde Hoy.
const repo = process.cwd();
const root = path.resolve(process.env.PLANB_TCR199_ROOT ?? path.join(repo, 'tests', '.tmp', 'conflict199-' + randomUUID()));
const src = (name: string) => JSON.stringify(path.join(repo, name).replace(/\\/g, '/'));
const ENTRY = `import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskConflictReview } from ${src('src/TaskConflictReview.tsx')};
import { makeDemoSpec, makeFixture } from ${src('shared/fixtures.ts')};
import ${src('src/styles.css')}; import ${src('src/refinements.css')}; import ${src('src/design-system.css')}; import ${src('src/planb-ui.css')}; import ${src('src/local-task-focus.css')};
const w = window as any; w.__proposals = []; w.__keep = 0; w.__net = 0;
const realFetch = window.fetch.bind(window); window.fetch = (...args: any[]) => { w.__net++; return (realFetch as any)(...args); };
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot), entity = spec.entities.find(e => e.id === 'tasks')!;
const context = { instanceId: 'i-1', snapshotId: 's-1', snapshotName: 'Copia A', capturedAt: '2026-11-02T09:00:00Z', captureStartedAt: null, accountId: null, generatedAt: '2026-11-02T09:00:00Z', isTestData: true, ready: true, runtime: false };
const task = (id: string, patch: Record<string, any> = {}) => { const r = snapshot.records.find((x: any) => x.entity === 'tasks' && x.id === id)!; return { ...JSON.parse(JSON.stringify(r)), values: { ...JSON.parse(JSON.stringify(r.values)), ...patch } }; };
const LONG = ('Párrafo largo con palabras repetidas para forzar el ajuste. ').repeat(120);
const HOSTILE = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
function scenario(name: string, variant = 0): any {
  const base = task('task-2'), mk = (draft: any, current: any, over: any = {}) => ({ entity, spec, base, baseContext: context, draft: { ...base.values, ...draft }, current: task('task-2', current), currentContext: { ...context, ...(over.ctx ?? {}) }, ...over.rest });
  if (name === 'conflict') return mk({ subject: 'Asunto mío', notes: 'Notas mías', due_date: '2026-12-01' }, variant ? { notes: 'Notas ajenas v2', status: 'completed', due_date: '2026-12-01' } : { notes: 'Notas ajenas', status: 'completed', due_date: '2026-12-01' });
  if (name === 'long') return mk({ notes: LONG + 'MÍO ' + HOSTILE }, { notes: LONG + 'AJENO ' + HOSTILE });
  if (name === 'mismatch') return mk({ subject: 'Lo que escribí con esfuerzo', notes: 'Notas mías' }, { notes: 'Notas de otra captura' }, { ctx: { capturedAt: '2026-11-09T09:00:00Z' } });
  if (name === 'homonym') { const other = task('task-6'); other.values.subject = base.values.subject; return { entity, spec, base, baseContext: context, draft: { ...base.values, notes: 'Mías' }, current: other, currentContext: context }; }
  if (name === 'invalid') { const rule = { id: 'r1', entity: 'tasks', kind: 'conditional_required', field: 'notes', value: null, whenField: 'status', whenValue: 'completed', origin: 'configuration', description: 'Explica el resultado antes de completar.', evidence: 'prueba' }; return mk({ status: 'completed', notes: null, subject: 'Otro' }, { due_date: '2026-12-24', notes: null }, { rest: { spec: { ...spec, rules: [...spec.rules, rule] }, base: { ...base, values: { ...base.values, notes: null } } } }); }
  return mk({}, {});
}
function App() {
  const params = new URLSearchParams(location.search), name = params.get('s') ?? 'conflict';
  const [variant, setVariant] = useState(0);
  const input = scenario(name, variant); (window as any).__input = JSON.stringify(input);
  return <div style={{ width: 'min(560px,100vw)', margin: '0 auto', padding: '0 12px' }}>
    <button type="button" id="harness-new-read" onClick={() => setVariant(1)}>Nueva lectura</button>
    <TaskConflictReview input={input} onPropose={proposal => { w.__proposals.push(JSON.parse(JSON.stringify(proposal))); }} onKeepEditing={() => { w.__keep++; }} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
`;
let server: http.Server | undefined, origin = '';
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conflicto</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); return; }
    const match = /^\/out\/([\w.-]+)$/.exec(url.pathname);
    if (match && fs.existsSync(path.join(root, 'out', match[1]))) { response.writeHead(200, { 'content-type': match[1].endsWith('.css') ? 'text/css' : 'text/javascript' }); response.end(fs.readFileSync(path.join(root, 'out', match[1]))); return; }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});
test.afterAll(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); });

const requests: string[] = [];
async function open(page: Page, scenario: string, size = { width: 1440, height: 900 }) {
  requests.length = 0; await page.setViewportSize(size);
  page.on('request', request => { if (!request.url().startsWith(origin + '/out/') && request.url() !== origin + '/' && !request.url().startsWith(origin + '/?s=')) requests.push(request.method() + ' ' + request.url()); });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort());
  await page.goto(origin + '/?s=' + scenario);
}
const proposals = (page: Page) => page.evaluate(() => (window as any).__proposals as any[]);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);

test('teclado: sin decidir no hay propuesta y el foco va al primer campo pendiente; decidir con flechas y confirmar entrega UNA propuesta sin tocar la red', async ({ page }) => {
  await open(page, 'conflict');
  const main = page.getByRole('region', { name: /Revisa qué mantener/ }); await expect(main).toBeVisible(); await expect(page.locator('#tcr-title')).toBeFocused();
  await expect(page.locator('#tcr-status')).toHaveText('1 campo por decidir');
  const confirm = page.getByRole('button', { name: /Preparar el nuevo guardado/ }); await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await confirm.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Falta decidir' })).toBeVisible(); await expect(page.locator('#tcr-notes-mine')).toBeFocused(); expect(await proposals(page)).toHaveLength(0);
  await expect(page.locator('.tcr-row[data-state="conflict"] .tcr-error')).toHaveText('Elige una de las dos opciones.');
  // Teclado: la flecha dentro del grupo elige; Tab pasa al siguiente control.
  await page.keyboard.press('Space'); await expect(page.locator('#tcr-notes-mine')).toBeChecked(); await expect(page.locator('#tcr-status')).toHaveText('Todo decidido.');
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#tcr-notes-current')).toBeChecked(); await page.keyboard.press('ArrowLeft'); await expect(page.locator('#tcr-notes-mine')).toBeChecked();
  await confirm.focus(); await page.keyboard.press('Enter');
  const [proposal] = await proposals(page); expect(await proposals(page)).toHaveLength(1);
  expect(proposal.patch).toEqual({ subject: 'Asunto mío', notes: 'Notas mías' }); expect(proposal.baseline.values.status).toBe('completed'); expect(proposal.adopted).toEqual(['status']);
  expect(proposal.provenance).toBe('person-decision'); expect(await page.evaluate(() => (window as any).__net)).toBe(0); expect(requests).toEqual([]);
});

test('lo ajeno y lo convergente no piden decisión; lo propio sin conflicto viene marcado y se puede descartar con el teclado', async ({ page }) => {
  await open(page, 'conflict');
  await expect(page.locator('.tcr-row[data-state="theirs-only"]')).toContainText('Estado'); await expect(page.locator('.tcr-row[data-state="theirs-only"] input[type=radio]')).toHaveCount(0);
  await expect(page.locator('.tcr-row[data-state="converged"]')).toContainText('Fecha límite'); await expect(page.locator('.tcr-row[data-state="converged"] input[type=radio]')).toHaveCount(0);
  const mine = page.locator('.tcr-row[data-state="mine-only"]'); await expect(mine.locator('#tcr-subject-mine')).toBeChecked();
  await mine.locator('#tcr-subject-current').check(); await page.locator('#tcr-notes-current').check();
  await page.getByRole('button', { name: /Preparar el nuevo guardado/ }).click({ force: true });
  await expect(page.getByRole('alert').filter({ hasText: 'No hay nada que guardar' })).toBeVisible(); expect(await proposals(page)).toHaveLength(0);
  await mine.locator('#tcr-subject-mine').check(); await page.getByRole('button', { name: /Preparar el nuevo guardado/ }).click({ force: true });
  expect((await proposals(page))[0].patch).toEqual({ subject: 'Asunto mío' }); expect((await proposals(page))[0].discarded).toEqual(['notes']);
});

test('identidades distintas (mismo ID, otra captura): sin controles de mezcla, borrador visible y conservado; «Volver» no cambia nada', async ({ page }) => {
  await open(page, 'mismatch');
  await expect(page.getByRole('heading', { name: 'No se puede combinar esta tarea' })).toBeVisible(); await expect(page.getByRole('alert')).toContainText('otra copia aunque conserve el mismo ID');
  await expect(page.locator('input[type=radio]')).toHaveCount(0); await expect(page.getByRole('button', { name: /Preparar el nuevo guardado/ })).toHaveCount(0);
  await expect(page.getByText('Lo que escribiste (se conserva)')).toBeVisible(); await expect(page.locator('.tcr-kept')).toContainText('Lo que escribí con esfuerzo'); await expect(page.locator('.tcr-kept')).toContainText('Notas mías');
  await expect(page.locator('.tcr')).not.toContainText('Notas de otra captura');
  await page.getByRole('button', { name: 'Volver al formulario' }).click(); expect(await page.evaluate(() => (window as any).__keep)).toBe(1); expect(await proposals(page)).toHaveLength(0);
});

test('homónimas: mismo título y distinto ID no se mezclan', async ({ page }) => {
  await open(page, 'homonym'); await expect(page.locator('.tcr[data-identity="mismatch"]')).toBeVisible(); await expect(page.getByRole('alert')).toContainText('task-6'); await expect(page.locator('input[type=radio]')).toHaveCount(0);
});

test('texto largo y hostil: se muestra como texto (nada se ejecuta), se pliega y no desborda a 1440/390/320', async ({ page }, testInfo) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await open(page, 'long', size);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined(); await expect(page.locator('.tcr img, .tcr script')).toHaveCount(0);
    await expect(page.locator('.tcr-long')).toHaveCount(2); await expect(page.locator('.tcr-long').first()).toContainText('caracteres');
    await page.locator('.tcr-long').first().locator('summary').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.tcr-long').first()).toHaveAttribute('open', '');
    await expect(page.locator('.tcr-long').first().locator('p')).toContainText('<img src=x onerror=');   // el marcado hostil aparece literal
    expect(await noOverflow(page)).toBe(true);
    const file = path.join(root, 'long-' + size.width + '.png'); await page.screenshot({ path: file, fullPage: true }); await testInfo.attach('long-' + size.width, { path: file, contentType: 'image/png' });
  }
});

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) test('diseño a ' + size.width + ' px: tres valores legibles, controles alcanzables, objetivos táctiles y sin desbordamiento', async ({ page }, testInfo) => {
  await open(page, 'conflict', size); expect(await noOverflow(page)).toBe(true);
  const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tcr button, .tcr .tcr-choice')].filter(el => { const r = el.getBoundingClientRect(); return innerWidth <= 640 && r.height < 43.5; }).map(el => el.textContent));
  expect(tiny).toEqual([]);
  const outside = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tcr dd, .tcr label, .tcr button')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).map(el => el.textContent));
  expect(outside).toEqual([]);
  const labels = await page.locator('.tcr-row[data-state="conflict"] dt').allTextContents(); expect(labels).toEqual(['Lo que viste', 'Tu propuesta', 'Lo que hay ahora']);
  if (size.width >= 1000) { const columns = await page.locator('.tcr-row[data-state="conflict"] dl').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length); expect(columns).toBe(3); }
  else { const columns = await page.locator('.tcr-row[data-state="conflict"] dl').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length); expect(columns).toBe(1); }
  await page.locator('#tcr-notes-mine').check(); const file = path.join(root, 'conflict-' + size.width + '.png'); await page.screenshot({ path: file, fullPage: true }); await testInfo.attach('conflict-' + size.width, { path: file, contentType: 'image/png' });
});

test('propuesta inválida por una regla entre campos: se señala sin enviar; el borrador de entrada no se muta tras todas las interacciones', async ({ page }) => {
  await open(page, 'invalid'); const before = await page.evaluate(() => (window as any).__input);
  await page.getByRole('button', { name: /Preparar el nuevo guardado/ }).click({ force: true });
  await expect(page.getByRole('alert').filter({ hasText: 'Revisa la propuesta' })).toContainText('Explica el resultado antes de completar.'); expect(await proposals(page)).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__input)).toBe(before);
});

test('una nueva lectura (otra versión actual) invalida las elecciones anteriores y no las arrastra', async ({ page }) => {
  await open(page, 'conflict'); await page.locator('#tcr-notes-mine').check(); await expect(page.locator('#tcr-status')).toHaveText('Todo decidido.');
  await page.locator('#harness-new-read').click();
  await expect(page.locator('#tcr-status')).toHaveText('1 campo por decidir'); await expect(page.locator('#tcr-notes-mine')).not.toBeChecked(); await expect(page.locator('.tcr-row[data-state="conflict"]')).toContainText('Notas ajenas v2');
  // R2: tras cambiar la lectura, confirmar con lo decidido ANTES no emite ninguna propuesta (las elecciones de la revisión anterior no cuentan)
  await page.getByRole('button', { name: /Preparar el nuevo guardado/ }).click({ force: true }); await expect(page.getByRole('alert').filter({ hasText: 'Falta decidir' })).toBeVisible(); expect(await proposals(page)).toHaveLength(0);
});
