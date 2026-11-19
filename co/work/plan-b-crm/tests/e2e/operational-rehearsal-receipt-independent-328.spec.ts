import { expect, test } from '@playwright/test';

const commitmentId = 'ms-installation-hubspot';
const title = 'Instalación de 12 equipos en Almacén Norte';
const decisionPath = '/api/v7/commitments/' + commitmentId + '/decisions';

test('328 · el recibo muestra la decisión persistida al recuperar un acuse perdido', async ({ page }, info) => {
  const origin = process.env.PLANB_REHEARSAL_APP_ORIGIN;
  if (!origin || new URL(origin).hostname !== '127.0.0.1') throw new Error('Se necesita un servidor ficticio en loopback para el banco 328.');
  const submitted: { operationId: string; contextRevision: string; decision: { owner: string; nextStep: string; dueAt: string } }[] = [];
  await page.route('**' + decisionPath, async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    submitted.push(request.postDataJSON());
    if (submitted.length !== 1) return route.continue();
    const response = await route.fetch();
    expect(response.status(), 'el servidor ya ha guardado la decisión').toBe(200);
    await route.abort('failed');
  });

  await page.goto(origin);
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await page.getByRole('button', { name: 'Activar el escenario de ensayo' }).click();
  await page.getByRole('button', { name: 'Abrir ' + title + ' (ID ' + commitmentId + ')' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ensayar mi semana' }).click();
  const view = page.locator('.or');
  await view.getByRole('button', { name: 'Ensayar', exact: true }).click();
  const results = view.locator('.or-results');
  await expect(results.getByRole('heading', { name: 'Resultado del ensayo' })).toBeVisible({ timeout: 60_000 });
  await results.locator('.or-card').filter({ hasText: 'Usar equipos equivalentes del Almacén Sur' }).getByRole('radio').check();
  const form = results.locator('.or-decision');
  await form.getByLabel('Quién se encarga').fill('Marta (ficción)');
  await form.getByLabel('Siguiente paso concreto').fill('Confirmar los equipos equivalentes con Almacén Sur.');
  await form.getByLabel('Para cuándo').fill('2026-11-12T11:00');
  await form.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(form.getByRole('alert')).toContainText('No se sabe si la decisión llegó a guardarse', { timeout: 60_000 });
  expect(submitted).toHaveLength(1);

  const readRadar = async () => {
    const response = await page.request.get(origin + '/api/v7/commitments/' + commitmentId + '?contextRevision=' + submitted[0]!.contextRevision);
    expect(response.status()).toBe(200);
    return response.json();
  };
  const before = await readRadar();
  expect(before.events).toHaveLength(1);
  expect(before.events[0].operationId).toBe(submitted[0]!.operationId);
  expect(before.item.action.owner).toBe('Marta (ficción)');

  await form.getByLabel('Quién se encarga').fill('Lucía (ficción)');
  await form.getByLabel('Siguiente paso concreto').fill('Cancelar el pedido de mañana.');
  await form.getByRole('button', { name: 'Reintentar con la misma clave' }).click();
  const receipt = results.locator('.or-receipt');
  await expect(receipt.getByRole('heading', { name: 'Decisión registrada' })).toBeVisible({ timeout: 60_000 });
  expect(submitted).toHaveLength(2);
  expect(submitted[1]).toEqual(submitted[0]);
  const after = await readRadar();
  expect(after.events).toEqual(before.events);
  expect(after.item.action).toEqual(before.item.action);
  await page.screenshot({ path: info.outputPath('recibo-328.png'), fullPage: true });
  const shownDecision = receipt.locator('div').filter({ has: page.getByText('Decisión', { exact: true }) }).locator('dd');
  await expect(shownDecision).toContainText(after.item.action.owner);
  await expect(shownDecision).toContainText(after.item.action.nextStep);
});
