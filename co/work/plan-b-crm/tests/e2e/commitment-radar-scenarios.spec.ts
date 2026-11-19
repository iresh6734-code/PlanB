import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoyHarness, gate } from './hoy-recuperable-harness';

// RADAR · ALTERNATIVAS, CRONOLOGÍA Y EXPORTACIÓN (unidad CLAUDE-COMMITMENT-RADAR-SCENARIOS). Mismo arnés que commitment-radar-harness (servidor real de CORE con el conjunto ficticio y reloj fijo, SQLite de archivo, red bloqueada); el ENTRY de arnés fija el reloj de la simulación un minuto después del servidor para que la antigüedad de la evidencia no dependa del día en que se ejecuta. Aún NO está montado en la App.
const NOW = '2026-11-08T12:00:00.000Z';
const ENTRY_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Radar · arnés</title></head><body><div id="root"></div><script type="module" src="/src/radar-entry.tsx"></script></body></html>`;
const ENTRY_TSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css'; import './refinements.css'; import './sales.css'; import './team.css'; import './integrations.css'; import './design-system.css'; import './planb-ui.css'; import './customer-dossier.css';
import { CommitmentRadar } from './CommitmentRadar.js';
function Host() {
  const [pin, setPin] = React.useState<string | null | undefined>(undefined);
  const [id, setId] = React.useState<string | null>(new URLSearchParams(location.search).get('id'));
  async function refresh() { const state = await (await fetch('/api/v2/state')).json(); setPin(state.workspaceSearchContext?.contextRevision ?? null); }
  React.useEffect(() => { void refresh(); (window as any).__radar = { refresh, setPin, setId }; }, []);
  return pin === undefined ? <p>Cargando…</p> : <main style={{ padding: 16 }}><CommitmentRadar contextRevision={pin} commitmentId={id} clock={() => Date.parse('2026-11-08T12:01:00.000Z') + ((window as any).__clockOffset ?? 0)} onContextStale={() => { (window as any).__stale = ((window as any).__stale ?? 0) + 1; }} /></main>;
}
createRoot(document.getElementById('root')!).render(<Host />);
`;
class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const frozen = path.join(this.root, 'frozen'), priv = path.join(this.root, 'priv');
    fs.writeFileSync(path.join(frozen, 'radar.html'), ENTRY_HTML); fs.writeFileSync(path.join(frozen, 'src', 'radar-entry.tsx'), ENTRY_TSX);
    await build({ root: frozen, configFile: false, envDir: path.join(this.root, 'empty-env'), base: './', mode: 'production', plugins: [react()], logLevel: 'error', build: { outDir: path.join(priv, 'dist'), emptyOutDir: false, minify: false, rollupOptions: { input: path.join(frozen, 'radar.html') } } });
    const file = path.join(this.root, 'server.mts'), source = fs.readFileSync(file, 'utf8'), url = (name: string) => JSON.stringify(pathToFileURL(path.join(priv, name)).href);
    if (!source.includes('await app.listen(')) throw new Error('El servidor del arnés cambió: no se encuentra el punto de extensión.');
    const extra = `import { registerCommitments } from ${url('server/commitments.ts')};
import { createCommitmentDemoDataset } from ${url('shared/commitment-demo.ts')};
const RADAR_NOW = Date.parse(${JSON.stringify(NOW)});
registerCommitments(app, store, createCommitmentDemoDataset(RADAR_NOW), () => RADAR_NOW);
app.post('/__h/swap', async () => { const next: any = makeFixture('agency'); next.id = 'captura-otra'; next.name = 'Otra captura'; next.capturedAt = '2026-11-09T09:00:00.000Z'; store.importSnapshot(next, true); store.saveGeneration(makeDemoSpec(next), { provider: 'demo', model: null, generatedAt: '2026-11-09T09:30:00Z', prompt: '', approved: false }); store.activate(); return { ok: true }; });
`;
    fs.writeFileSync(file, source.replace('await app.listen(', extra + 'await app.listen('));
  }
  async swap() { expect((await fetch(this.origin + '/__h/swap', { method: 'POST' })).ok).toBe(true); }
  decisions() { return this.requests().filter(line => line.method === 'POST' && /^\/api\/v7\/commitments\/[^/]+\/decisions$/.test(line.path)); }
  async pin(): Promise<string> { return (await (await fetch(this.origin + '/api/v2/state')).json() as { workspaceSearchContext: { contextRevision: string } }).workspaceSearchContext.contextRevision; }
  async detail(id: string) { const pin = await this.pin(); return await (await fetch(this.origin + '/api/v7/commitments/' + id + '?contextRevision=' + pin)).json() as { item: { revision: string; status: string; action: unknown; closure: unknown }; events: { operationId: string; decision: { type: string }; evidence: unknown[] }[]; canCloseObserved: boolean; contextRevision: string }; }
  /** Otra persona decide por su cuenta (lo que hace que la revisión que ve la interfaz deje de ser la vigente). */
  async decideExternally(id: string, owner: string) {
    const pin = await this.pin(), detail = await this.detail(id);
    const response = await fetch(this.origin + '/api/v7/commitments/' + id + '/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contextRevision: pin, expectedRevision: detail.item.revision, operationId: crypto.randomUUID(), decision: { type: 'assign', owner, nextStep: 'Paso decidido por otra persona', dueAt: '2026-11-12T10:00:00.000Z' } }) });
    expect(response.status).toBe(200);
  }
}
const harness = new Harness();
test.use({ timezoneId: 'Europe/Madrid', locale: 'es-ES' });
test.setTimeout(150_000);
test.beforeAll(async () => { await harness.prepare(); });
test.beforeEach(() => { harness.reset(); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); await harness.stop(); });
test.afterAll(() => { harness.assertAllClosed(); });

const dlg = (page: Page) => page.getByRole('dialog');
const item = (page: Page, id: string) => page.locator('.cr-item[data-id="' + id + '"]');
const openButton = (page: Page, id: string) => item(page, id).getByRole('button', { name: /^Abrir / });
const source = (page: Page, role: string) => dlg(page).locator('.cr-source[data-role="' + role + '"]');
async function start(page: Page, query = '', size = { width: 1440, height: 900 }) {
  await harness.start(page); await page.setViewportSize(size); await page.goto(harness.origin + '/radar.html' + query);
  await expect(page.getByRole('heading', { name: 'Radar de compromisos' })).toBeVisible(); await expect(page.locator('.cr-item').first()).toBeVisible();
}
async function open(page: Page, id: string) { await openButton(page, id).click(); await expect(dlg(page)).toBeVisible(); await expect(dlg(page).locator('.cr-source')).toHaveCount(3); }
async function assign(page: Page, owner: string, step: string, due = '2026-11-12T10:00') {
  await dlg(page).getByLabel('Responsable', { exact: true }).fill(owner); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill(step); await dlg(page).getByLabel('Fecha para el siguiente paso').fill(due);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
}


const alt = (page: Page, id: string) => dlg(page).locator('.cr-alt[data-alt="' + id + '"]');
const bring = (page: Page, id: string) => alt(page, id).getByRole('button', { name: 'Llevar al formulario de decisión' });
const nonGet = (page: Page) => { const list: string[] = []; page.on('request', request => { if (request.method() !== 'GET') list.push(request.method() + ' ' + new URL(request.url()).pathname); }); return list; };
const confirmBox = (page: Page) => dlg(page).getByLabel(/Confirmo que llevo esta alternativa/);
const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const madridDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' });
const toInput = (iso: string) => { const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); return parts.replace(' ', 'T'); };

test('ALTERNATIVAS · instalación bloqueada: retrasar dos días desde la fecha comprometida y buscar stock alternativo, con supuestos, fecha propuesta y datos que faltan; simular NO escribe', async ({ page }) => {
  const writes = nonGet(page); await start(page); await open(page, 'installation-north'); const detail = await harness.detail('installation-north') as unknown as { item: { dueAt: string } };
  const projected = new Date(Date.parse(detail.item.dueAt) + 48 * 3600_000).toISOString();   // oráculo propio: fecha comprometida + 48 h
  const delay = alt(page, 'delay-two-days'), stock = alt(page, 'seek-stock'); await expect(dlg(page).locator('.cr-sim .cr-note').first()).toContainText('solo en memoria');
  await expect(delay).toContainText('Retrasar el compromiso dos días'); await expect(delay).toContainText('Fecha propuesta: ' + madridDate(projected)); await expect(delay).toContainText('posterior a la fecha comprometida original');
  await expect(delay).toContainText('desplaza exactamente 48 horas'); await expect(delay).toContainText('El riesgo no desaparece'); await expect(delay).toContainText('No faltan datos de evidencia');
  await expect(stock).toContainText('Buscar stock alternativo'); await expect(stock).toContainText('Fecha propuesta: ninguna: no se puede prometer una fecha'); await expect(stock).toContainText('Efecto sobre el plazo: desconocido');
  await expect(stock).toContainText('No se asume disponibilidad ni plazo hasta comprobarlos'); await expect(stock.locator('.cr-missing li')).toHaveCount(2); await expect(stock).toContainText('Comprobar stock disponible en otra fuente.'); await expect(stock).toContainText('Comprobar plazo de entrega del stock alternativo.');
  expect(writes, 'simular y leer: cero peticiones de escritura').toEqual([]); expect(harness.decisions()).toHaveLength(0);
});

test('DATOS AUSENTES · fuente caída y vínculo ambiguo: la fecha propuesta no se inventa y se nombra qué falta', async ({ page }) => {
  await start(page); await open(page, 'support-source-down');
  await expect(alt(page, 'delay-two-days')).toContainText('Fecha propuesta: ninguna'); await expect(alt(page, 'delay-two-days')).toContainText('Efecto sobre el plazo: desconocido'); await expect(alt(page, 'delay-two-days').locator('.cr-missing')).toContainText('support: evidencia unavailable');
  await page.keyboard.press('Escape'); await open(page, 'installation-lookalike'); await expect(alt(page, 'delay-two-days').locator('.cr-missing')).toContainText('delivery: evidencia ambiguous'); await expect(alt(page, 'delay-two-days')).toContainText('Fecha propuesta: ninguna');
  expect(harness.decisions()).toHaveLength(0);
});

test('LLEVAR AL FORMULARIO Y CONFIRMAR · el formulario único se rellena con la alternativa, falta responsable y confirmación explícitos; al confirmar, UN evento con la alternativa en su texto; la cronología lo distingue como decisión humana', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const before = await harness.detail('installation-north') as unknown as { item: { dueAt: string; revision: string } };
  const projected = new Date(Date.parse(before.item.dueAt) + 48 * 3600_000).toISOString();
  await bring(page, 'delay-two-days').focus(); await page.keyboard.press('Enter');
  await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el foco pasa al primer dato que falta').toBeFocused();
  await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toHaveValue(/^Alternativa «Retrasar el compromiso dos días»: /); await expect(dlg(page).getByLabel('Fecha para el siguiente paso')).toHaveValue(toInput(projected));
  await expect(dlg(page).locator('[data-from="delay-two-days"]')).toContainText('solo en memoria'); expect(harness.decisions(), 'llevarla al formulario no escribe').toHaveLength(0);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('Indica responsable'); expect(harness.decisions()).toHaveLength(0);
  await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('Confirma que llevas esta alternativa'); expect(harness.decisions(), 'sin confirmar no hay envío').toHaveLength(0);
  await confirmBox(page).check(); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.');
  expect(harness.decisions().map(line => line.status), 'un solo evento').toEqual([200]);
  const after = await harness.detail('installation-north') as unknown as { events: { decision: { type: string; owner: string; nextStep: string; dueAt: string } }[]; item: { revision: string } };
  expect(after.events).toHaveLength(1); expect(after.events[0].decision).toMatchObject({ type: 'assign', owner: 'Marta Ruiz', dueAt: projected }); expect(after.events[0].decision.nextStep).toMatch(/^Alternativa «Retrasar el compromiso dos días»: /); expect(after.item.revision).not.toBe(before.item.revision);
  await dlg(page).locator('.cr-timeline summary').click(); await expect(dlg(page).locator('.cr-tl').first()).toBeVisible();
  await expect(dlg(page).locator('.cr-tl[data-kind="decision"]')).toHaveCount(1); await expect(dlg(page).locator('.cr-tl[data-kind="decision"] .cr-kind')).toHaveText('Decisión humana'); expect(await dlg(page).locator('.cr-tl[data-kind="observation"]').count(), 'tres observaciones de evidencia').toBe(3);
  await expect(dlg(page).locator('.cr-alt').first(), 'las alternativas siguen siendo simulación: la decisión no las convierte en hecho').toBeVisible(); await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(1\)/ })).toBeVisible();
});

test('DOS PESTAÑAS · una decide y la otra conserva su borrador (desde una alternativa) contra la revisión antigua: 409, borrador intacto, confirmación obligada de nuevo y un evento por acción confirmada', async ({ page }) => {
  const second = await page.context().newPage(); await harness.start(page); await harness.guard(second);
  for (const p of [page, second]) { await p.setViewportSize({ width: 1440, height: 900 }); await p.goto(harness.origin + '/radar.html'); await expect(p.getByRole('heading', { name: 'Radar de compromisos' })).toBeVisible(); await expect(p.locator('.cr-item').first()).toBeVisible(); await open(p, 'installation-north'); }
  await bring(page, 'delay-two-days').click(); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await confirmBox(page).check();
  await dlg(second).getByLabel('Responsable', { exact: true }).fill('Otra persona'); await dlg(second).getByLabel('Siguiente paso', { exact: true }).fill('Paso de la otra pestaña'); await dlg(second).getByLabel('Fecha para el siguiente paso').fill('2026-11-13T09:00'); await dlg(second).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(second).locator('.cr-done')).toBeVisible();
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('El compromiso cambió mientras lo revisabas');
  await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el borrador sigue').toHaveValue('Marta Ruiz'); await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toHaveValue(/^Alternativa «Retrasar el compromiso dos días»/); await expect(dlg(page).locator('.cr-summary')).toContainText('Responsable: Otra persona');
  await expect(dlg(page).locator('[data-from]')).toContainText('ATENCIÓN: el compromiso cambió'); await expect(confirmBox(page), 'la confirmación anterior ya no vale').not.toBeChecked(); await expect(confirmBox(page)).toBeDisabled();
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('revisión anterior'); expect(harness.decisions().map(line => line.status), 'el borrador desactualizado no se reenvió').toEqual([200, 409]);
  await bring(page, 'delay-two-days').click(); await expect(confirmBox(page)).toBeEnabled(); await expect(confirmBox(page), 'volver a llevarla exige confirmar de nuevo').not.toBeChecked(); await expect(dlg(page).getByLabel('Responsable', { exact: true })).toHaveValue('Marta Ruiz'); await confirmBox(page).check(); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.');
  expect(harness.decisions().map(line => line.status)).toEqual([200, 409, 200]); expect(((await harness.detail('installation-north')) as unknown as { events: unknown[] }).events, 'un evento por acción confirmada').toHaveLength(2);
});

test('ACUSE PERDIDO con una alternativa · comprobar leyendo añade 0 envíos; el reintento explícito con la MISMA clave devuelve el recibo original (2 POST, 1 evento)', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); let lose = true; const keys: string[] = [];
  await page.route('**/api/v7/commitments/*/decisions', async (route: Route) => { keys.push(JSON.parse(route.request().postData() ?? '{}').operationId); if (lose) { lose = false; await route.fetch(); await route.abort('connectionreset').catch(() => undefined); } else await route.fallback(); });
  await bring(page, 'delay-two-days').click(); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await confirmBox(page).check(); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(dlg(page).locator('.cr-error')).toContainText('No se sabe si la decisión llegó a guardarse'); expect(harness.decisions()).toHaveLength(1);
  await dlg(page).getByRole('button', { name: 'Comprobar leyendo' }).click(); await expect(dlg(page).locator('.cr-done')).toContainText('ya estaba guardada'); expect(harness.decisions(), 'comprobar solo lee').toHaveLength(1);
  // Segundo intento perdido: el reintento explícito conserva la clave.
  await page.keyboard.press('Escape'); await open(page, 'delivery-healthy'); lose = true; await dlg(page).getByLabel('Cerrar el compromiso').check(); await dlg(page).getByLabel('Cierre manual').check(); await dlg(page).getByLabel('Nota del cierre').fill('Cierre de prueba'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click();
  await expect(dlg(page).locator('.cr-error')).toContainText('No se sabe'); await dlg(page).getByRole('button', { name: 'Reintentar con la misma clave' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Cierre guardado.');
  expect(keys[1], 'misma clave en el reintento').toBe(keys[2]); expect(harness.decisions().map(line => line.status)).toEqual([200, 200, 200]); expect(((await harness.detail('delivery-healthy')) as unknown as { events: unknown[] }).events, 'un solo evento').toHaveLength(1); expect(((await harness.detail('installation-north')) as unknown as { events: unknown[] }).events).toHaveLength(1);
});

test('CRONOLOGÍA Y EXPORTACIÓN · HTML y JSON salen de la misma lectura que se ve, escapan contenido arbitrario, se pueden abrir sin ejecutar nada y exportar NO escribe', async ({ page }, testInfo) => {
  await start(page); await open(page, 'installation-north'); const hostile = '<img src=x onerror="window.__pwned=1">', step = '"><script>window.__pwned=2</script>';
  await dlg(page).getByLabel('Responsable', { exact: true }).fill(hostile); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill(step); await dlg(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-12T10:00'); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toBeVisible();
  await expect(dlg(page).locator('.cr-summary')).toContainText(hostile); expect(await page.evaluate(() => (window as any).__pwned), 'la interfaz tampoco ejecuta el contenido').toBeUndefined();
  const posts = harness.decisions().length, writes = nonGet(page), shown = await harness.detail('installation-north') as unknown as { item: { id: string; revision: string }; contextRevision: string; events: { operationId: string }[] };
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), dlg(page).getByRole('button', { name: 'Descargar JSON' }).click()]); const jsonFile = path.join(harness.caseDir, jsonDownload.suggestedFilename()); await jsonDownload.saveAs(jsonFile);
  const report = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as { format: string; detail: { item: { id: string; revision: string; action: { owner: string } }; contextRevision: string; events: { operationId: string }[] }; timeline: { type: string }[] };
  expect(jsonDownload.suggestedFilename()).toBe('pelicula-installation-north-' + shown.item.revision.slice(0, 8) + '.json'); expect(report.format).toBe('planb-commitment-report-v1');
  expect(report.detail.item.id, 'el compromiso correcto').toBe('installation-north'); expect(report.detail.item.revision, 'la revisión correcta').toBe(shown.item.revision); expect(report.detail.contextRevision).toBe(shown.contextRevision); expect(report.detail.events.map(event => event.operationId)).toEqual(shown.events.map(event => event.operationId));
  expect(report.detail.item.action.owner, 'el contenido arbitrario viaja como DATO en JSON').toBe(hostile); expect(report.timeline.filter(entry => entry.type === 'decision')).toHaveLength(1); expect(report.timeline.filter(entry => entry.type === 'observation')).toHaveLength(3);
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), dlg(page).getByRole('button', { name: 'Descargar HTML' }).click()]); const htmlFile = path.join(harness.caseDir, htmlDownload.suggestedFilename()); await htmlDownload.saveAs(htmlFile); const html = fs.readFileSync(htmlFile, 'utf8');
  expect(html, 'sin etiquetas del contenido hostil sin escapar').not.toContain('<img src=x'); expect(html).not.toContain('<script>window'); expect(html).toContain('&#60;img src=x'); expect(html).toContain('Datos ficticios de demostración'); expect(html).toContain(shown.item.revision); expect(html).toContain('Película del incidente: Instalación de 12 equipos en Almacén Norte');
  expect(writes, 'exportar: cero peticiones de escritura').toEqual([]); expect(harness.decisions().length, 'ni un evento nuevo').toBe(posts);
  // El archivo se abre sin ejecutar nada y cabe a 320 px.
  const viewer = await page.context().newPage(); await viewer.setViewportSize({ width: 320, height: 800 }); await viewer.setContent(html, { waitUntil: 'load' }); expect(await viewer.evaluate(() => (window as any).__pwned), 'el archivo no ejecuta el contenido').toBeUndefined();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'el HTML exportado cabe a 320 px').toBeLessThanOrEqual(0); await expect(viewer.getByRole('heading', { level: 1 })).toContainText('Película del incidente');
  const shot = path.join(harness.caseDir, 'pelicula-320.png'); await viewer.screenshot({ path: shot, fullPage: true }); await testInfo.attach('pelicula-320', { path: shot, contentType: 'image/png' }); await viewer.close();
});

test('REINICIO · tras reiniciar el servidor sobre la misma base la ficha muestra el mismo historial, la misma revisión y la misma cronología', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); await assign(page, 'Marta Ruiz', 'Paso previo al reinicio'); await expect(dlg(page).locator('.cr-done')).toBeVisible();
  const before = await harness.detail('installation-north') as unknown as { item: { revision: string }; events: { operationId: string }[] }; const posts = harness.decisions().length;
  const { before: a, after: b } = await harness.restart(page); expect(b.pid, 'otro proceso').not.toBe(a.pid);
  await page.goto(harness.origin + '/radar.html'); await expect(item(page, 'installation-north')).toContainText('Marta Ruiz'); await open(page, 'installation-north');
  const again = await harness.detail('installation-north') as unknown as { item: { revision: string }; events: { operationId: string }[] }; expect(again.item.revision).toBe(before.item.revision); expect(again.events.map(event => event.operationId)).toEqual(before.events.map(event => event.operationId));
  await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(1\)/ })).toBeVisible(); await dlg(page).locator('.cr-timeline summary').click(); await expect(dlg(page).locator('.cr-tl[data-kind="decision"]')).toHaveCount(1); expect(harness.decisions().length, 'reabrir tras reiniciar no escribe').toBe(posts);
});

test('CERRADO · un compromiso cerrado no ofrece alternativas ni formulario; el cierre manual y el observado se distinguen en la cronología', async ({ page }) => {
  await start(page); await open(page, 'project-partial'); await dlg(page).getByLabel('Cerrar el compromiso').check(); await dlg(page).getByLabel('Cierre manual').check(); await dlg(page).getByLabel('Nota del cierre').fill('El cliente confirmó por teléfono'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click();
  await expect(dlg(page).locator('.cr-done')).toBeVisible(); await expect(dlg(page).locator('.cr-sim')).toHaveCount(0); await expect(dlg(page).getByRole('form')).toHaveCount(0); await expect(dlg(page)).toContainText('El compromiso está cerrado (manual); no procede simular alternativas');
  await dlg(page).locator('.cr-timeline summary').click(); await expect(dlg(page).locator('.cr-tl[data-basis="manual"] .cr-kind')).toHaveText('Cierre manual (decisión humana)'); await page.keyboard.press('Escape');
  await open(page, 'delivery-healthy'); await dlg(page).getByLabel('Cerrar el compromiso').check(); await dlg(page).getByLabel('Con evidencia observada').check(); await dlg(page).getByLabel('Nota del cierre').fill('Entrega confirmada por las tres fuentes'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click(); await expect(dlg(page).locator('.cr-done')).toBeVisible();
  await dlg(page).locator('.cr-timeline summary').click(); await expect(dlg(page).locator('.cr-tl[data-basis="observed"] .cr-kind')).toHaveText('Cierre con evidencia observada, confirmado por una persona'); await expect(dlg(page).locator('.cr-tl[data-kind="observation"]')).toHaveCount(3);
});


// ── R2 · VIGENCIA TEMPORAL DE LAS ALTERNATIVAS (dictamen 303) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// La ficha se deja abierta y el reloj del navegador avanza (el arnés lo desplaza con `window.__clockOffset`, sin tocar servidor ni esquema). Sin cambio de copia, de revisión ni de detalle: solo pasa el tiempo.
const advance = (page: Page, hours: number) => page.evaluate((ms: number) => { (window as any).__clockOffset = ((window as any).__clockOffset ?? 0) + ms; }, hours * 3600_000);
const field = (page: Page, name: string) => dlg(page).getByLabel(name, { exact: true });
const aged = (page: Page) => alt(page, 'delay-two-days').locator('.cr-missing');

test('R2 · LLEVAR TRAS 25 HORAS con la ficha abierta: se revalida con el reloj actual, la fecha propuesta desaparece, se nombra la antigüedad y no se inventa nada; sigue siendo posible decidir con confirmación clara', async ({ page }) => {
  const writes = nonGet(page); await start(page); await open(page, 'installation-north');
  await expect(alt(page, 'delay-two-days')).toContainText('Fecha propuesta: '); await expect(alt(page, 'delay-two-days')).toContainText('No faltan datos de evidencia'); await expect(alt(page, 'delay-two-days')).not.toContainText('ninguna: no se puede prometer');
  await advance(page, 25);   // la misma ficha, misma revisión: solo pasó el tiempo
  await bring(page, 'delay-two-days').click();
  await expect(alt(page, 'delay-two-days'), 'la alternativa mostrada ya refleja el reloj actual').toContainText('Fecha propuesta: ninguna'); await expect(aged(page)).toContainText('la observación supera 24 horas al evaluar'); await expect(alt(page, 'delay-two-days')).not.toContainText('No faltan datos de evidencia');
  await expect(field(page, 'Fecha para el siguiente paso'), 'no se arrastra la fecha propuesta antigua').toHaveValue(''); await expect(field(page, 'Siguiente paso')).toHaveValue(/^Alternativa «Retrasar el compromiso dos días»: /);
  await expect(dlg(page).locator('[data-from]')).toContainText('Faltan 3 datos de evidencia'); await expect(dlg(page).locator('[data-from]')).toContainText('puedes decidir igualmente'); await expect(confirmBox(page)).toBeVisible(); await expect(dlg(page).locator('.cr-confirm')).toContainText('faltan 3 datos de evidencia');
  expect(writes, 'revalidar es simular: 0 escrituras').toEqual([]); expect(harness.decisions()).toHaveLength(0);
  // Decidir con datos incompletos sigue permitido si la persona elige fecha y confirma sabiéndolo.
  await field(page, 'Responsable').fill('Marta Ruiz'); await field(page, 'Fecha para el siguiente paso').fill('2026-11-13T09:00'); await confirmBox(page).check(); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.');
  expect(harness.decisions().map(line => line.status)).toEqual([200]);
});

test('R2 · PREPARAR Y CONFIRMAR TRAS 25 HORAS sin cambio de revisión: al guardar se revalida, NO se envía, se explica qué cambió, se conservan las ediciones manuales y se exige confirmar de nuevo', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const before = await harness.detail('installation-north') as unknown as { item: { revision: string } };
  await bring(page, 'delay-two-days').click(); await expect(field(page, 'Fecha para el siguiente paso')).not.toHaveValue(''); await expect(dlg(page).locator('[data-from]')).not.toContainText('Faltan');
  await field(page, 'Responsable').fill('Marta Ruiz'); await field(page, 'Siguiente paso').fill((await field(page, 'Siguiente paso').inputValue()) + ' (texto editado a mano)'); await confirmBox(page).check();
  await advance(page, 25);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  expect(harness.decisions(), 'tras superar 24 h NO se envía lo preparado antes').toHaveLength(0);
  await expect(dlg(page).locator('.cr-error')).toContainText('revalidó con el reloj actual y cambió'); await expect(dlg(page).locator('[data-from]')).toContainText('La evidencia envejeció desde que preparaste esta alternativa'); await expect(dlg(page).locator('[data-from]')).toContainText('La fecha propuesta ya no es válida y se quitó');
  await expect(field(page, 'Siguiente paso'), 'la edición manual se conserva').toHaveValue(/\(texto editado a mano\)$/); await expect(field(page, 'Responsable')).toHaveValue('Marta Ruiz'); await expect(field(page, 'Fecha para el siguiente paso')).toHaveValue(''); await expect(confirmBox(page), 'hay que confirmar de nuevo').not.toBeChecked(); await expect(dlg(page).locator('.cr-confirm')).toContainText('faltan 3 datos');
  expect(((await harness.detail('installation-north')) as unknown as { item: { revision: string } }).item.revision, 'sin cambio de revisión').toBe(before.item.revision);
  // La persona puede seguir: elige fecha, confirma sabiendo qué falta y se envía UNA decisión.
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('Indica responsable, siguiente paso y una fecha válida'); expect(harness.decisions()).toHaveLength(0);
  await field(page, 'Fecha para el siguiente paso').fill('2026-11-13T09:00'); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-error')).toContainText('Confirma que llevas esta alternativa'); expect(harness.decisions()).toHaveLength(0);
  await confirmBox(page).check(); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.'); expect(harness.decisions().map(line => line.status)).toEqual([200]);
  const after = await harness.detail('installation-north') as unknown as { events: { decision: { nextStep: string; owner: string } }[] }; expect(after.events).toHaveLength(1); expect(after.events[0].decision.nextStep).toMatch(/\(texto editado a mano\)$/);
});

test('R2 · CONTROL con evidencia todavía vigente: una hora después se guarda sin aviso, con la fecha propuesta, y UN evento', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const detail = await harness.detail('installation-north') as unknown as { item: { dueAt: string } }; const projected = new Date(Date.parse(detail.item.dueAt) + 48 * 3600_000).toISOString();
  await bring(page, 'delay-two-days').click(); await field(page, 'Responsable').fill('Marta Ruiz'); await confirmBox(page).check(); await advance(page, 1);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.'); await expect(dlg(page).locator('[data-from]')).toHaveCount(0);
  expect(harness.decisions().map(line => line.status), 'evidencia vigente: se envía sin reconfirmar').toEqual([200]); const after = await harness.detail('installation-north') as unknown as { events: { decision: { dueAt: string } }[] }; expect(after.events).toHaveLength(1); expect(after.events[0].decision.dueAt).toBe(projected);
});

test('R2 · EDICIÓN MANUAL DE LA FECHA: si la persona fijó su propia fecha, revalidar no la sobrescribe', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); await bring(page, 'delay-two-days').click(); await field(page, 'Fecha para el siguiente paso').fill('2026-11-15T10:00'); await field(page, 'Responsable').fill('Marta Ruiz'); await confirmBox(page).check(); await advance(page, 25);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); expect(harness.decisions()).toHaveLength(0); await expect(field(page, 'Fecha para el siguiente paso'), 'la fecha escrita a mano se conserva').toHaveValue('2026-11-15T10:00'); await expect(dlg(page).locator('[data-from]')).toContainText('Se conservó lo que escribiste a mano'); await expect(dlg(page).locator('[data-from]')).not.toContainText('se quitó');
});

for (const width of [1440, 390, 320]) {
  test('TECLADO y ' + width + ' px · alternativas, formulario, cronología y descargas se alcanzan con teclado, sin desbordamiento y con objetivos táctiles; captura inspeccionable', async ({ page }, testInfo) => {
    await start(page, '', { width, height: 900 }); const button = openButton(page, 'installation-north'); await button.focus(); await page.keyboard.press('Enter'); await expect(dlg(page)).toBeVisible(); await expect(alt(page, 'delay-two-days')).toBeVisible();
    await bring(page, 'seek-stock').focus(); await page.keyboard.press('Space'); await expect(dlg(page).getByLabel('Responsable', { exact: true })).toBeFocused(); await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toHaveValue(/Buscar stock alternativo/); await expect(dlg(page).getByLabel('Fecha para el siguiente paso'), 'sin fecha inventada').toHaveValue('');
    await page.keyboard.press('Tab'); await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toBeFocused(); await dlg(page).locator('.cr-timeline summary').focus(); await page.keyboard.press('Enter'); await expect(dlg(page).locator('.cr-tl').first()).toBeVisible(); await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'sin desbordamiento horizontal').toBeLessThanOrEqual(0);
    const small = width > 650 ? [] : await dlg(page).locator('button, summary, .cr-confirm').evaluateAll(nodes => nodes.map(node => { const r = (node as HTMLElement).getBoundingClientRect(); return { name: (node.textContent || node.tagName).trim().slice(0, 40), h: Math.round(r.height) }; }).filter(box => box.h > 0 && box.h < 32)); expect(small, 'objetivos táctiles ≥ 32 px').toEqual([]);
    await alt(page, 'delay-two-days').scrollIntoViewIfNeeded(); const shot = path.join(harness.caseDir, 'alternativas-' + width + '.png'); await page.screenshot({ path: shot }); await testInfo.attach('alternativas-' + width, { path: shot, contentType: 'image/png' });
    await dlg(page).getByRole('button', { name: 'Descargar HTML' }).scrollIntoViewIfNeeded(); const film = path.join(harness.caseDir, 'cronologia-' + width + '.png'); await page.screenshot({ path: film }); await testInfo.attach('cronologia-' + width, { path: film, contentType: 'image/png' });
    await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); await expect(button, 'el foco vuelve al botón exacto').toBeFocused();
  });
}
