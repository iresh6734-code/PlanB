import { test, expect, type Page } from '@playwright/test';

// Servidor aislado con datos ficticios: tres capturas (la activa, una anterior con un cliente extra y otra de un portal distinto).
const RADAR = '**/api/v2/continuity/response-queue*', COMPARE = '**/api/v2/captures/compare*';
async function open(page: Page) {
  const external: string[] = [], errors: string[] = [], notFound: string[] = [], calls: { method: string; url: string }[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() === 404) notFound.push(response.url()); });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/response-queue|captures\/compare/.test(request.url())) calls.push({ method: request.method(), url: request.url() }); });
  await page.route('**/*', route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); } return route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuidad', exact: true }).click();
  // Desde el rediseño «Faro» (13/11/2026) las operaciones viven en su propia pestaña de Continuidad.
  await page.getByRole('tab', { name: 'Operaciones', exact: true }).click();
  const block = page.locator('.continuity-operations');
  await expect(block.getByRole('heading', { name: 'Operaciones de la copia' })).toBeVisible();
  return { external, errors, notFound, calls, block };
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('radar y comparador: recorrido real con teclado, sin escrituras, sin red externa y sin errores de consola', async ({ page }, testInfo) => {
  const { external, errors, notFound, calls, block } = await open(page);
  await expect(block.getByRole('tab', { name: 'Qué atender' })).toHaveAttribute('aria-selected', 'true');
  await expect(block.getByText(/Calculado por el servidor el/)).toBeVisible();
  await expect(block.getByText(/Copia activa · datos de ensayo/)).toBeVisible();
  await expect(block.getByRole('region', { name: 'Vencidas' }).or(block.getByRole('region', { name: 'Por revisar' })).first()).toBeVisible();
  const horizon = block.getByLabel('Horizonte', { exact: true });
  await horizon.selectOption('72');
  await expect.poll(() => calls.some(c => c.url.includes('horizonHours=72&limit=50'))).toBeTruthy();
  await expect(block.getByText(/horizonte de 72 h/)).toBeVisible();
  await block.getByRole('button', { name: 'Actualizar radar' }).focus();
  await expect(block.getByRole('button', { name: 'Actualizar radar' })).toBeFocused();
  // Teclado: flecha derecha pasa a la otra pestaña.
  await block.getByRole('tab', { name: 'Qué atender' }).focus(); await page.keyboard.press('ArrowRight');
  await expect(block.getByRole('tab', { name: 'Qué cambió' })).toHaveAttribute('aria-selected', 'true'); await expect(block.getByRole('tab', { name: 'Qué cambió' })).toBeFocused();
  const compare = block.getByRole('button', { name: 'Comparar capturas' });
  await expect(compare).toBeDisabled();
  const before = calls.length;
  await block.getByLabel('Primera captura').selectOption({ index: 2 }); await block.getByLabel('Segunda captura').selectOption({ index: 1 });
  expect(calls.length, 'elegir no consulta').toBe(before);
  await expect(compare).toBeEnabled(); await compare.click();
  await expect(block.getByRole('heading', { name: 'Resultado de la comparación' })).toBeVisible();
  await expect(block.getByText(/no prueba que se borrara en HubSpot/)).toBeVisible();
  await expect(block.getByRole('region', { name: 'Registros' }).getByText(/Ausente en la segunda captura|Añadido en la segunda captura|Modificado/).first()).toBeVisible();
  await expect(block.getByText('Propiedad ausente').first()).toBeVisible(); await expect(block.getByText('Texto vacío').first()).toBeVisible();
  await expect(block.getByText('valor nulo').first()).toBeVisible();
  await expect(block.getByText(/Vista previa recortada a 500 caracteres/).first()).toBeVisible();
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 700]]) {
    await page.setViewportSize({ width, height });
    expect(await overflow(page), 'sin desbordamiento de página a ' + width).toBeTruthy();
    await block.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('comparador-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // El orden elegido no se invierte: intercambiar las capturas pide el par al revés.
  await block.getByLabel('Primera captura').selectOption({ index: 1 }); await block.getByLabel('Segunda captura').selectOption({ index: 2 });
  await expect(block.getByRole('heading', { name: 'Resultado de la comparación' }), 'cambiar una captura retira el resultado').toHaveCount(0);
  await compare.click(); await expect(block.getByText(/comparación inversa/)).toBeVisible();
  const last = new URL(calls.at(-1)!.url).searchParams, ids = await block.getByLabel('Primera captura').inputValue();
  expect(last.get('from')).toBe(ids); expect(last.get('offset')).toBe('0');
  await block.getByRole('tab', { name: 'Qué atender' }).click();
  await block.getByRole('button', { name: 'Ocultar operaciones' }).click(); await expect(block.getByRole('tab')).toHaveCount(0);
  await block.getByRole('button', { name: 'Mostrar operaciones' }).click(); await expect(block.getByRole('tab', { name: 'Qué atender' })).toBeVisible();
  expect(calls.filter(c => c.method !== 'GET'), 'ninguna escritura sale de este bloque').toEqual([]);
  expect(external, 'sin red externa').toEqual([]); // /api/v6/workspace lo pide la app existente y este servidor aislado no lo registra; no pertenece a este bloque.
  const own = notFound.filter(url => !/favicon|\/api\/v6\/workspace/.test(url)); expect(own, 'ningún recurso propio falta').toEqual([]);
  expect(errors.filter(text => !(/status of 404/.test(text) && !own.length)), 'consola sin errores').toEqual([]);
});

test('comparador: portales distintos dan un 409 claro del servidor real y la selección se conserva', async ({ page }) => {
  const { block, calls } = await open(page);
  await block.getByRole('tab', { name: 'Qué cambió' }).click();
  const first = block.getByLabel('Primera captura'), second = block.getByLabel('Segunda captura');
  const options = await first.locator('option').evaluateAll(nodes => nodes.map(n => ({ value: (n as HTMLOptionElement).value, label: n.textContent })));
  expect(options.length).toBe(4);
  // Cada par incluye la captura de otro portal en alguna posición; probamos todas hasta provocar el 409 real.
  let seen = false;
  for (const a of options.slice(1)) for (const b of options.slice(1)) {
    if (a.value === b.value) continue;
    await first.selectOption(a.value); await second.selectOption(b.value); await block.getByRole('button', { name: 'Comparar capturas' }).click();
    await expect(block.getByRole('heading', { name: 'Resultado de la comparación' }).or(block.getByRole('alert'))).toBeVisible();
    if (await block.getByRole('alert').filter({ hasText: /mismo portal/ }).count()) {
      seen = true; await expect(first).toHaveValue(a.value); await expect(second).toHaveValue(b.value);
      await block.getByRole('button', { name: 'Reintentar consulta' }).click(); await expect(block.getByRole('alert').filter({ hasText: /mismo portal/ })).toBeVisible(); await expect(first).toHaveValue(a.value);
    }
    if (seen) break;
  }
  expect(seen, 'el servidor real devolvió 409 por portal distinto').toBeTruthy();
  expect(calls.every(c => c.method === 'GET')).toBeTruthy();
});

test('servidor antiguo (404), captura inexistente (404), validación (422) y bloqueo (401) no fingen resultado', async ({ page }) => {
  const { block } = await open(page);
  await page.route(RADAR, route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Operación no disponible en esta aplicación.' }) }));
  await block.getByRole('button', { name: 'Actualizar radar' }).click();
  await expect(block.getByRole('alert').filter({ hasText: /no incluye esta consulta/ })).toBeVisible(); await expect(block.getByText(/Calculado por el servidor/)).toHaveCount(0);
  await page.unroute(RADAR);
  await block.getByRole('button', { name: 'Reintentar consulta' }).click(); await expect(block.getByText(/Calculado por el servidor/)).toBeVisible();
  await block.getByRole('tab', { name: 'Qué cambió' }).click();
  await block.getByLabel('Primera captura').selectOption({ index: 2 }); await block.getByLabel('Segunda captura').selectOption({ index: 1 });
  const body = (status: number, error: string) => (route: any) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error }) });
  const compare = block.getByRole('button', { name: 'Comparar capturas' });
  for (const [status, error, expected] of [[404, 'No se encontró la captura.', /ya no existe en el historial/], [422, 'Las dos capturas deben tener formato válido y estar conciliadas.', /formato válido/], [404, 'Operación no disponible en esta aplicación.', /no incluye esta consulta/]] as const) {
    await page.route(COMPARE, body(status, error)); await compare.click();
    await expect(block.getByRole('alert').filter({ hasText: expected })).toBeVisible(); await page.unroute(COMPARE);
  }
  await expect(block.getByRole('heading', { name: 'Resultado de la comparación' })).toHaveCount(0);
  await page.route(COMPARE, body(401, 'Desbloquea tu copia local para continuar.')); await compare.click();
  await expect(block.getByRole('alert').filter({ hasText: /Desbloquea/ }).or(page.getByText(/Desbloquea/).first())).toBeVisible();
  await expect(block.getByText('Resultado de la comparación')).toHaveCount(0);
});

test('una captura retirada del historial con la comparación en vuelo no deja resultado ni paginación y la selección se conserva', async ({ page }) => {
  const { block, calls } = await open(page);
  await block.getByRole('tab', { name: 'Qué cambió' }).click();
  const first = block.getByLabel('Primera captura'), second = block.getByLabel('Segunda captura');
  await first.selectOption({ index: 2 }); await second.selectOption({ index: 1 });
  const keepFrom = await first.inputValue(), removed = await second.inputValue();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false;
  await page.route(COMPARE, async route => { held = true; const real = await route.fetch(); await gate; await route.fulfill({ response: real }); });
  await block.getByRole('button', { name: 'Comparar capturas' }).click();
  await expect.poll(() => held).toBeTruthy();
  // El refresco normal de Continuidad devuelve ahora el historial sin la segunda captura.
  await page.route('**/api/v2/continuity', async route => { const real = await route.fetch(), body = await real.json(); body.captures = body.captures.filter((c: { id: string }) => c.id !== removed); await route.fulfill({ response: real, json: body }); });
  await expect(block.getByText(/ya no está en el historial/)).toBeVisible({ timeout: 10000 });
  release(); await page.waitForTimeout(500);
  await expect(block.getByRole('heading', { name: 'Resultado de la comparación' })).toHaveCount(0);
  await expect(block.getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
  await expect(first).toHaveValue(keepFrom); await expect(second).toHaveValue(removed);
  await expect(block.getByRole('button', { name: 'Comparar capturas' })).toBeDisabled();
  expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
});

test('lo existente sigue accesible: historial, simulacro, copia/recuperación y navegación; móvil sin desbordamiento', async ({ page }) => {
  const { block } = await open(page);
  await expect(page.getByRole('heading', { name: 'Tu negocio puede seguir.' })).toBeVisible();
  // Con las pestañas de Continuidad cada bloque sigue a un clic: historial y restauración en «Copias y archivo»; simulacro y mantenimiento en «Estado».
  await page.getByRole('tab', { name: 'Copias y archivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Historial de capturas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar archivo', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Estado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Comprueba tu Plan B' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Probar mi Plan B', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mantén la copia al día' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar trabajando' })).toBeVisible();
  await page.getByRole('tab', { name: 'Operaciones', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await expect(block).toBeVisible();
  expect(await overflow(page)).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 700 }); expect(await overflow(page)).toBeTruthy();
});
