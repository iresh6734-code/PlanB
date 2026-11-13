import { test, expect, type Page, type Route } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HoyHarness, gate } from './hoy-recuperable-harness';

// RADAR DE COMPROMISOS · PRUEBAS DE ARNÉS (unidad CLAUDE-COMMITMENT-RADAR-UI). ESTADO: la interfaz pasa SOLO por este arnés; todavía NO está montada en Hoy ni en la App (eso es de
// `CODEX-COMMITMENT-RADAR-MOUNT`). Lo que se ejecuta es real: el servidor de `registerCommitments` (CORE aceptado) con el conjunto ficticio de `createCommitmentDemoDataset` y un reloj fijo, SQLite
// de archivo, 127.0.0.1 y red exterior bloqueada; el cliente es el de producción. Lo único ficticio del arnés es la página que monta `<CommitmentRadar>` con el pin leído de `/api/v2/state`
// (una entrada `radar.html` que se compila aparte, solo aquí, sin tocar `App.tsx`). Los recuentos de peticiones los lleva el servidor.
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
  return pin === undefined ? <p>Cargando…</p> : <main style={{ padding: 16 }}><CommitmentRadar contextRevision={pin} commitmentId={id} onContextStale={() => { (window as any).__stale = ((window as any).__stale ?? 0) + 1; }} /></main>;
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

test('LISTA · cuatro estados distintos: riesgo, sin confirmar y «sin riesgo detectado con los datos disponibles» (resuelto aún vacío); responsable, fecha, causa y siguiente paso; títulos iguales se distinguen por ID', async ({ page }) => {
  await start(page);
  await expect(page.locator('.cr-group')).toHaveCount(3);
  await expect(page.locator('.cr-group[data-status="at-risk"] .cr-item')).toHaveCount(1); await expect(item(page, 'installation-north').locator('xpath=ancestor::section[@data-status]')).toHaveAttribute('data-status', 'at-risk');
  await expect(page.locator('.cr-group[data-status="unconfirmed"] .cr-item')).toHaveCount(4);
  await expect(page.locator('.cr-group[data-status="no-risk-detected"] h3')).toHaveText('Sin riesgo detectado con los datos disponibles (1)'); await expect(item(page, 'delivery-healthy').locator('xpath=ancestor::section[@data-status]')).toHaveAttribute('data-status', 'no-risk-detected');
  await expect(page.locator('.cr-group[data-status="resolved"]'), 'sin cierres todavía: no se inventa un grupo vacío').toHaveCount(0);
  for (const unsound of ['support-source-down', 'project-partial', 'stale-evidence', 'installation-lookalike']) await expect(item(page, unsound).locator('xpath=ancestor::section[@data-status]'), unsound + ' no es «sin riesgo»').toHaveAttribute('data-status', 'unconfirmed');
  const north = item(page, 'installation-north');
  await expect(north.locator('dt', { hasText: 'Responsable' }).locator('xpath=following-sibling::dd')).toHaveText('Sin asignar'); await expect(north).toContainText('10 nov 2026'); await expect(north).toContainText('Una fuente observó un bloqueo (entrega)'); await expect(north).toContainText('Sin siguiente paso definido');
  await expect(item(page, 'support-source-down')).toContainText('Faltan datos: alguna fuente es parcial, antigua, no responde o no está vinculada');
  // Dos compromisos con el MISMO título: dos botones con nombre distinto por ID.
  await expect(page.getByRole('button', { name: 'Abrir Instalación de 12 equipos en Almacén Norte (ID installation-north)' })).toHaveCount(1); await expect(page.getByRole('button', { name: 'Abrir Instalación de 12 equipos en Almacén Norte (ID installation-lookalike)' })).toHaveCount(1);
  expect(harness.decisions(), 'leer no escribe').toHaveLength(0);
});

test('FICHA BLOQUEADA · venta, entrega y soporte con proveedor, cuenta, observación, cobertura y vínculo; la entrega observada como bloqueada explica el riesgo', async ({ page }) => {
  await start(page); await open(page, 'installation-north');
  await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('En riesgo'); await expect(dlg(page).locator('.cr-summary')).toContainText('Una fuente observó un bloqueo (entrega)');
  await expect(source(page, 'sale')).toContainText('Vínculo: hubspot-fixture · cuenta fixture-sales-a · deal-1001 (referencia explícita)'); await expect(source(page, 'sale')).toContainText('Observación: Venta con fecha de instalación comprometida · Sin bloqueo · cobertura completa');
  await expect(source(page, 'delivery')).toContainText('orders-fixture · cuenta fixture-orders-a · order-4821'); await expect(source(page, 'delivery')).toContainText('Pedido retenido por falta de stock · Bloqueada · cobertura completa'); await expect(source(page, 'delivery').locator('.cr-state')).toHaveText('Observada');
  await expect(source(page, 'support')).toContainText('zendesk-fixture · cuenta fixture-support-a · ticket-7001');
  await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(0\)/ })).toBeVisible(); await expect(dlg(page)).toContainText('Las observaciones de las fuentes no figuran aquí');
});

test('FUENTE CAÍDA, PARCIAL Y ANTIGUA · no se convierten en sanas: sin confirmar, con la causa explicada y sin condición inventada', async ({ page }) => {
  await start(page); await open(page, 'support-source-down');
  await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('Sin confirmar'); await expect(source(page, 'support').locator('.cr-state')).toHaveText('No disponible'); await expect(source(page, 'support')).toContainText('La fuente no respondió: se desconoce su estado, no se supone sano');
  await expect(source(page, 'support')).toContainText('sin dato de estado · fuente no disponible'); await expect(dlg(page).getByLabel('Cómo se cierra')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0);
  await open(page, 'project-partial'); await expect(source(page, 'delivery').locator('.cr-state')).toHaveText('Parcial'); await expect(source(page, 'delivery')).toContainText('Lectura parcial: no basta para afirmar el estado de esta fuente'); await page.keyboard.press('Escape');
  await open(page, 'stale-evidence'); for (const role of ['sale', 'delivery', 'support']) await expect(source(page, role).locator('.cr-state')).toHaveText('Antigua'); await expect(source(page, 'sale')).toContainText('más de 24 horas');
});

test('AMBIGUO · el mismo ID remoto en dos cuentas queda como CANDIDATO: sin vínculo, sin observación y sin contagiar a otro compromiso', async ({ page }) => {
  await start(page); await open(page, 'installation-lookalike');
  await expect(source(page, 'delivery').locator('.cr-state')).toHaveText('Ambigua: sin confirmar'); await expect(source(page, 'delivery')).toContainText('Vínculo: ninguno confirmado'); await expect(source(page, 'delivery')).toContainText('Observación: ninguna');
  const candidates = source(page, 'delivery').locator('.cr-candidates li'); await expect(candidates).toHaveCount(2); await expect(candidates.nth(0)).toContainText('fixture-orders-a'); await expect(candidates.nth(1)).toContainText('fixture-orders-b'); await expect(candidates.nth(1)).toContainText('order-4821');
  await expect(source(page, 'delivery')).toContainText('un mismo ID en otra cuenta no crea un vínculo');
  await expect(dlg(page).locator('.cr-summary .cr-chip'), 'la entrega completada de la otra cuenta no hace sano al compromiso').toHaveText('Sin confirmar');
  await page.keyboard.press('Escape'); await open(page, 'installation-north'); await expect(source(page, 'delivery')).toContainText('Bloqueada'); await expect(source(page, 'delivery').locator('.cr-candidates')).toHaveCount(0);
});

test('ASIGNAR · una decisión con pin, revisión esperada y clave: un POST, el efecto en el servidor, la lista con responsable y el historial como decisión humana', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const before = await harness.detail('installation-north');
  await assign(page, 'Marta Ruiz', 'Pedir stock a otro almacén');
  await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.'); await expect(dlg(page).locator('.cr-summary')).toContainText('Responsable: Marta Ruiz'); await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(1\)/ })).toBeVisible();
  await expect(dlg(page).locator('.cr-event')).toContainText('decisión humana del operador local'); await expect(dlg(page).locator('.cr-event')).toContainText('Asignado a Marta Ruiz: Pedir stock a otro almacén');
  expect(harness.decisions().map(line => line.status)).toEqual([200]);
  const after = await harness.detail('installation-north'); expect(after.events).toHaveLength(1); expect(after.events[0].decision).toMatchObject({ type: 'assign', owner: 'Marta Ruiz', nextStep: 'Pedir stock a otro almacén' }); expect(after.item.revision, 'la revisión cambió').not.toBe(before.item.revision);
  expect((after.events[0] as { revisionBefore?: string }).revisionBefore).toBe(before.item.revision);
  await page.keyboard.press('Escape'); await expect(item(page, 'installation-north')).toContainText('Marta Ruiz'); await expect(item(page, 'installation-north')).toContainText('Pedir stock a otro almacén');
  for (const other of ['delivery-healthy', 'support-source-down']) await expect(item(page, other)).toContainText('Sin asignar');
});

test('CERRAR · con evidencia observada solo cuando las tres fuentes lo permiten; cierre manual con nota; ambos pasan a «Resuelto» y se distinguen', async ({ page }) => {
  await start(page); await open(page, 'delivery-healthy'); await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('Sin riesgo detectado');
  await dlg(page).getByLabel('Cerrar el compromiso').check(); const observed = dlg(page).getByLabel('Con evidencia observada'); await expect(observed).toBeEnabled(); await observed.check();
  await dlg(page).getByLabel('Nota del cierre').fill('Entrega confirmada por las tres fuentes'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click();
  await expect(dlg(page).locator('.cr-done')).toHaveText('Cierre guardado.'); await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('Resuelto'); await expect(dlg(page).locator('.cr-summary')).toContainText('Cierre: con evidencia observada, confirmado por una persona');
  await expect(dlg(page).locator('.cr-event[data-basis="observed"]')).toContainText('Cierre con evidencia observada, confirmado por una persona'); await expect(dlg(page).locator('.cr-event[data-basis="observed"] .cr-evidence-used li')).toHaveCount(3); await expect(dlg(page).getByRole('form', { name: 'Decidir sobre el compromiso' }), 'cerrado: ya no se decide').toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.locator('.cr-group[data-status="resolved"] .cr-item')).toHaveCount(1);
  // Cierre MANUAL de uno sin confirmar: la evidencia observada no está disponible y se explica.
  await open(page, 'project-partial'); await dlg(page).getByLabel('Cerrar el compromiso').check(); await expect(dlg(page).getByLabel('Con evidencia observada')).toBeDisabled(); await expect(dlg(page)).toContainText('hacen falta las tres fuentes recientes y completas');
  await dlg(page).getByLabel('Cierre manual').check(); await dlg(page).getByLabel('Nota del cierre').fill('El cliente confirmó por teléfono'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click();
  await expect(dlg(page).locator('.cr-summary')).toContainText('Cierre: manual · El cliente confirmó por teléfono'); await expect(dlg(page).locator('.cr-event[data-basis="manual"] .cr-evidence-used')).toHaveCount(0);
  await expect(dlg(page).locator('.cr-summary')).toContainText('Cerrado manualmente por una persona'); expect(harness.decisions().map(line => line.status)).toEqual([200, 200]);
});

test('409 DE REVISIÓN · otra persona decide mientras tú escribes: se recarga el estado, el borrador SE CONSERVA y un segundo clic explícito guarda con la revisión nueva', async ({ page }) => {
  await start(page); await open(page, 'installation-north');
  await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill('Reasignar el pedido'); await dlg(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-13T09:00');
  await harness.decideExternally('installation-north', 'Otra persona');
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(dlg(page).locator('.cr-error')).toContainText('El compromiso cambió mientras lo revisabas');
  await expect(dlg(page).locator('.cr-summary'), 'se recargó el estado actual').toContainText('Responsable: Otra persona');
  await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el borrador sigue').toHaveValue('Marta Ruiz'); await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toHaveValue('Reasignar el pedido'); await expect(dlg(page).getByLabel('Fecha para el siguiente paso')).toHaveValue('2026-11-13T09:00');
  expect(harness.decisions().map(line => line.status), 'la decisión ajena (200) y UN solo intento propio (409): el 409 no se reenvió solo').toEqual([200, 409]);
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.');
  expect(harness.decisions().map(line => line.status)).toEqual([200, 409, 200]); const after = await harness.detail('installation-north'); expect(after.events).toHaveLength(2); expect(after.events.map(event => event.decision.type)).toEqual(['assign', 'assign']);
  await expect(dlg(page).locator('.cr-summary')).toContainText('Responsable: Marta Ruiz');
});

test('ACUSE PERDIDO · el servidor aplica y la respuesta se pierde: nada se reenvía solo; «Comprobar leyendo» no escribe y encuentra la decisión; el historial tiene UNA fila', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const barrier = gate(); let held = 0;
  await page.route('**/api/v7/commitments/*/decisions', async (route: Route) => { held++; await route.fetch(); await barrier.promise; await route.abort('connectionreset').catch(() => undefined); });
  await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill('Pedir stock'); await dlg(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-12T10:00'); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  await expect.poll(() => held).toBe(1);
  try { await expect.poll(async () => (await harness.detail('installation-north')).events.length, { message: 'el servidor aplicó antes de cortar el acuse' }).toBe(1); } finally { barrier.release(); }
  await expect(dlg(page).locator('.cr-error')).toContainText('No se sabe si la decisión llegó a guardarse'); await expect(dlg(page).getByRole('button', { name: 'Reintentar con la misma clave' })).toBeVisible(); await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el borrador no se edita mientras se resuelve').toBeDisabled();
  expect(harness.decisions(), 'un solo intento: nunca se reenvía automáticamente').toHaveLength(1); await page.waitForTimeout(600); expect(harness.decisions()).toHaveLength(1);
  await dlg(page).getByRole('button', { name: 'Comprobar leyendo' }).click(); await expect(dlg(page).locator('.cr-done')).toContainText('La decisión ya estaba guardada: se comprobó leyendo, sin reenviar');
  expect(harness.decisions(), 'comprobar solo lee').toHaveLength(1); expect((await harness.detail('installation-north')).events).toHaveLength(1); await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(1\)/ })).toBeVisible(); await expect(dlg(page).getByRole('button', { name: 'Reintentar con la misma clave' })).toHaveCount(0);
});

test('ACUSE PERDIDO · el reintento explícito con la MISMA clave devuelve el recibo original: dos POST, un solo evento', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); let lose = true; const keys: string[] = [];
  await page.route('**/api/v7/commitments/*/decisions', async (route: Route) => { keys.push(JSON.parse(route.request().postData() ?? '{}').operationId); if (lose) { lose = false; await route.fetch(); await route.abort('connectionreset').catch(() => undefined); } else await route.fallback(); });
  await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill('Pedir stock'); await dlg(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-12T10:00'); await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(dlg(page).locator('.cr-error')).toContainText('No se sabe si la decisión llegó a guardarse'); expect(harness.decisions()).toHaveLength(1);
  await dlg(page).getByRole('button', { name: 'Reintentar con la misma clave' }).click(); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.');
  expect(keys, 'misma clave de operación').toHaveLength(2); expect(keys[0]).toBe(keys[1]); expect(harness.decisions().map(line => line.status)).toEqual([200, 200]); expect((await harness.detail('installation-north')).events, 'un solo efecto').toHaveLength(1);
});

test('CAMBIO DE COPIA y RESPUESTA TARDÍA · otro pin retira lista, ficha y borrador; la respuesta atrasada de la copia anterior (con una decisión que la nueva no tiene) no se pinta; una copia sin pin no muestra compromisos', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); await assign(page, 'Marta Ruiz', 'Paso de la copia anterior'); await expect(dlg(page).locator('.cr-done')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(item(page, 'installation-north'), 'la copia anterior tiene responsable').toContainText('Marta Ruiz');
  await open(page, 'delivery-healthy'); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Borrador de la copia anterior'); await page.keyboard.press('Escape');
  // Respuesta atrasada: la lectura de la copia anterior (que CONTIENE a Marta Ruiz) queda retenida mientras la copia cambia.
  const barrier = gate(); let held = 0; await page.route('**/api/v7/commitments?*', async (route: Route) => { if (held++ > 0) return route.fallback(); const response = await route.fetch(); await barrier.promise; await route.fulfill({ response }).catch(() => undefined); });
  await page.getByRole('button', { name: 'Actualizar' }).click(); await expect.poll(() => held).toBe(1);
  await harness.swap(); await page.evaluate(() => (window as any).__radar.refresh());
  try { await expect(page.locator('.cr-item'), 'la copia nueva reemplazó lo anterior').toHaveCount(6); await expect(item(page, 'installation-north'), 'la copia nueva no tiene esa decisión').toContainText('Sin asignar'); } finally { barrier.release(); }
  await page.waitForTimeout(500); await expect(page.locator('section.cr'), 'la respuesta tardía de la copia anterior no se pinta').not.toContainText('Marta Ruiz'); await expect(item(page, 'installation-north')).toContainText('Sin asignar');
  await open(page, 'delivery-healthy'); await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el borrador de la copia anterior no sobrevive').toHaveValue(''); await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__radar.setPin(null)); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(page.getByRole('status').filter({ hasText: 'No hay una copia de ensayo activa' })).toBeVisible();
});

test('CONTEXTO CAMBIADO (409) y SESIÓN BLOQUEADA (401) · se retira todo, se avisa a quien monta el Radar y se muestran textos propios', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Marta Ruiz'); await dlg(page).getByLabel('Siguiente paso', { exact: true }).fill('Paso'); await dlg(page).getByLabel('Fecha para el siguiente paso').fill('2026-11-12T10:00');
  await harness.swap();   // la copia activa cambió por debajo: el pin que usa la interfaz ya no es el vigente
  await dlg(page).getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(page.locator('.cr-item'), 'se retiraron los datos').toHaveCount(0); await expect(dlg(page)).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('La copia activa cambió'); expect(await page.evaluate(() => (window as any).__stale)).toBe(1);
  expect(harness.decisions().map(line => line.status)).toEqual([409]); await page.evaluate(() => (window as any).__radar.refresh()); await expect(page.locator('.cr-item').first()).toBeVisible();
  // 401 (sesión bloqueada): simulada en el borde del navegador; el cliente emite `planb:locked` y la interfaz retira los datos.
  await open(page, 'delivery-healthy'); let locked = 0; await page.evaluate(() => window.addEventListener('planb:locked', () => { (window as any).__locked = ((window as any).__locked ?? 0) + 1; }));
  await page.route('**/api/v7/commitments/*/decisions', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'bloqueada' }) })); locked++;
  await dlg(page).getByLabel('Cerrar el compromiso').check(); await dlg(page).getByLabel('Nota del cierre').fill('Nota'); await dlg(page).getByRole('button', { name: 'Cerrar compromiso' }).click();
  await expect(page.locator('.cr-item')).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('La sesión está bloqueada'); expect(await page.evaluate(() => (window as any).__locked)).toBe(locked);
});

test('ID EXACTO · abrir un compromiso por su ID; uno desconocido no abre nada', async ({ page }) => {
  await start(page, '?id=support-source-down'); await expect(dlg(page)).toBeVisible(); await expect(dlg(page).locator('.cr-summary .cr-chip')).toHaveText('Sin confirmar'); await expect(source(page, 'support').locator('.cr-state')).toHaveText('No disponible');
  await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).__radar.setId('no-existe')); await page.waitForTimeout(300); await expect(dlg(page)).toHaveCount(0);
});

// ── R2 · UN ENVÍO PERTENECE A SU COMPROMISO Y A SU GENERACIÓN (devolución del dictamen independiente) ───────────────────────────────────────────────────────────────────────────────────
const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const listReads = () => harness.requests().filter(line => line.method === 'GET' && line.path === '/api/v7/commitments').length;
const detailReads = () => harness.requests().filter(line => line.method === 'GET' && /^\/api\/v7\/commitments\/[^/]+$/.test(line.path)).length;
/** Retiene la respuesta de la decisión DESPUÉS de que el servidor la procesó. `mode`: 'ok' entrega el acuse real; '409' entrega un conflicto de revisión. `arrived` espera la llegada real al navegador. */
async function holdDecision(page: Page, mode: 'ok' | '409') {
  const barrier = gate(); let held = 0;
  await page.route('**/api/v7/commitments/*/decisions', async (route: Route) => {
    held++; const response = await route.fetch(); await barrier.promise;
    if (mode === 'ok') await route.fulfill({ response }).catch(() => undefined);
    else await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'x', details: { code: 'COMMITMENT_REVISION_CHANGED' } }) }).catch(() => undefined);
  });
  return { release: barrier.release, held: () => held };
}

test('R2 · F1 · ACUSE DE A CON LA FICHA DE B ABIERTA: el formulario, el aviso y los indicadores de B no se tocan; A actualiza su lista y su nota se ve al reabrirlo', async ({ page }) => {
  await start(page); await open(page, 'delivery-healthy'); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Borrador de B'); await page.keyboard.press('Escape');
  await open(page, 'installation-north'); const hold = await holdDecision(page, 'ok');
  try {
    await assign(page, 'Marta Ruiz', 'Paso de A'); await expect.poll(() => hold.held()).toBe(1); await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0);
    await open(page, 'delivery-healthy'); await expect(dlg(page).getByLabel('Responsable', { exact: true })).toHaveValue('Borrador de B'); await expect(dlg(page).getByRole('button', { name: 'Guardar asignación' }), 'el envío de A no deja a B «guardando»').toBeEnabled();
    const arrived = page.waitForResponse(response => /\/installation-north\/decisions$/.test(response.url())); hold.release(); await arrived;
    await expect.poll(() => listReads(), { message: 'la respuesta de A refresca la lista' }).toBeGreaterThan(1); const details = detailReads(); await page.waitForTimeout(500); await nextFrames(page);
    await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el formulario visible de B conserva su borrador').toHaveValue('Borrador de B'); await expect(dlg(page).locator('.cr-done')).toHaveCount(0); await expect(dlg(page).locator('.cr-error')).toHaveCount(0);
    await expect(dlg(page).locator('.cr-summary')).toContainText('Responsable: Sin asignar'); expect(detailReads(), 'no se releyó el detalle de B por el acuse de A').toBe(details);
  } finally { hold.release(); }
  expect((await harness.detail('installation-north')).events, 'A tiene su evento').toHaveLength(1); expect((await harness.detail('delivery-healthy')).events, 'B ninguno').toHaveLength(0); expect(harness.decisions().map(line => line.status)).toEqual([200]);
  await page.keyboard.press('Escape'); await expect(item(page, 'installation-north')).toContainText('Marta Ruiz');
  await open(page, 'installation-north'); await expect(dlg(page).locator('.cr-done')).toHaveText('Asignación guardada.'); await expect(dlg(page).getByRole('heading', { name: /Historial de decisiones \(1\)/ })).toBeVisible();
  await page.keyboard.press('Escape'); await open(page, 'delivery-healthy'); await expect(dlg(page).getByLabel('Responsable', { exact: true })).toHaveValue('Borrador de B');
});

test('R2 · F1 · RECHAZO DE A CON LA FICHA DE B ABIERTA: el error de A no aparece en B ni recarga el detalle de B; B no queda bloqueada', async ({ page }) => {
  await start(page); await open(page, 'installation-north'); const hold = await holdDecision(page, '409');
  try {
    await assign(page, 'Marta Ruiz', 'Paso de A'); await expect.poll(() => hold.held()).toBe(1); await page.keyboard.press('Escape'); await open(page, 'delivery-healthy'); await dlg(page).getByLabel('Responsable', { exact: true }).fill('Borrador de B');
    const details = detailReads(), arrived = page.waitForResponse(response => /\/installation-north\/decisions$/.test(response.url())); hold.release(); await arrived; await page.waitForTimeout(500); await nextFrames(page);
    await expect(dlg(page).locator('.cr-error'), 'el rechazo de A no se muestra en B').toHaveCount(0); await expect(dlg(page).getByLabel('Responsable', { exact: true })).toHaveValue('Borrador de B'); expect(detailReads(), 'sin recarga del detalle de B').toBe(details);
  } finally { hold.release(); }
  await page.keyboard.press('Escape'); await open(page, 'installation-north'); await expect(dlg(page).locator('.cr-error')).toContainText('El compromiso cambió mientras lo revisabas'); await expect(dlg(page).getByLabel('Responsable', { exact: true }), 'el borrador de A sigue').toHaveValue('Marta Ruiz');
});

for (const mode of ['ok', '409'] as const) {
  test('R2 · F2 · BLOQUEO CON UNA DECISIÓN EN VUELO (' + mode + '): al llegar el acuse tras el bloqueo no hay lecturas nuevas ni se repuebla nada, ni se limpia el estado de un intento posterior', async ({ page }) => {
    await start(page); await open(page, 'installation-north'); const hold = await holdDecision(page, mode);
    try {
      await assign(page, 'Marta Ruiz', 'Paso de A'); await expect.poll(() => hold.held()).toBe(1);
      await page.evaluate(() => window.dispatchEvent(new Event('planb:locked'))); await expect(page.locator('.cr-item')).toHaveCount(0); await expect(dlg(page)).toHaveCount(0);
      const lists = listReads(), details = detailReads(), arrived = page.waitForResponse(response => /\/installation-north\/decisions$/.test(response.url())); hold.release(); await arrived;
      await page.waitForTimeout(500); await nextFrames(page);
      await expect(page.locator('.cr-item'), 'el acuse tardío no repuebla el Radar').toHaveCount(0); await expect(dlg(page)).toHaveCount(0);
      expect(listReads(), 'ninguna lectura nueva de la lista').toBe(lists); expect(detailReads(), 'ninguna lectura nueva del detalle').toBe(details);
    } finally { hold.release(); }
    // La decisión ya aplicada no se deshace: retirar la vista no es cancelar.
    expect((await harness.detail('installation-north')).events).toHaveLength(1);
  });
}

for (const width of [1440, 390, 320]) {
  test('TECLADO y ' + width + ' px · lista y ficha se recorren con Tab, el foco vuelve a su botón, sin desbordamiento, con objetivos táctiles y captura inspeccionable', async ({ page }, testInfo) => {
    await start(page, '', { width, height: 900 }); await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'lista sin desbordamiento').toBeLessThanOrEqual(0);
    const listShot = path.join(harness.caseDir, 'radar-lista-' + width + '.png'); await page.screenshot({ path: listShot }); await testInfo.attach('lista-' + width, { path: listShot, contentType: 'image/png' });
    const button = openButton(page, 'installation-north'); await button.focus(); await page.keyboard.press('Enter'); await expect(dlg(page)).toBeVisible(); await expect(dlg(page).locator('.cr-source')).toHaveCount(3);
    await dlg(page).getByLabel('Responsable', { exact: true }).focus(); await page.keyboard.press('Tab'); await expect(dlg(page).getByLabel('Siguiente paso', { exact: true })).toBeFocused(); await page.waitForTimeout(450);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'ficha sin desbordamiento').toBeLessThanOrEqual(0);
    if (width < 651) {
      const small = await dlg(page).locator('button, input[type="radio"], input[type="datetime-local"], textarea, input:not([type])').evaluateAll(nodes => nodes.map(node => { const box = (node as HTMLElement).getBoundingClientRect(); const label = (node as HTMLElement).closest('label'); const target = label ?? node; const t = (target as HTMLElement).getBoundingClientRect(); return { name: (node.textContent || (node as HTMLInputElement).type || node.tagName).trim().slice(0, 30), h: Math.round(Math.max(box.height, t.height)) }; }).filter(box => box.h < 32));
      expect(small, 'objetivos táctiles ≥ 32 px').toEqual([]);
    }
    const detailShot = path.join(harness.caseDir, 'radar-ficha-' + width + '.png'); await page.screenshot({ path: detailShot }); await testInfo.attach('ficha-' + width, { path: detailShot, contentType: 'image/png' });
    await page.keyboard.press('Escape'); await expect(dlg(page)).toHaveCount(0); await expect(button, 'el foco vuelve al botón exacto').toBeFocused();
  });
}
