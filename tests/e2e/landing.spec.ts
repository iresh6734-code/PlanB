import { expect, test } from '@playwright/test';

test('carga la simulación cuando el visitante se acerca a ella', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/plan-b.html');
  await expect(page.getByRole('heading', { level: 1, name: 'Cae la red. Sigue el trabajo.' })).toBeVisible();
  const story = page.locator('#continuity-story');
  await expect(story).toBeEmpty();
  await story.evaluate((element) => element.scrollIntoView({ behavior: 'instant' }));
  await expect(page.getByRole('heading', { name: 'El minuto cero.' })).toBeVisible();
});

test('recorre la interrupción, trabaja en la copia y revisa los cambios', async ({ page }) => {
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) errors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });

  const response = await page.goto('/plan-b.html');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Plan B · Continuidad local para HubSpot');
  await expect(page.getByRole('heading', { level: 1, name: 'Cae la red. Sigue el trabajo.' })).toBeVisible();
  const relay = page.getByRole('button', { name: 'Simular corte' });
  await relay.click();
  await expect(relay).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#relay-state')).toContainText('Corte simulado · copia disponible');
  await expect(page.getByRole('radio', { name: 'CRM no disponible' })).toBeChecked();
  await relay.click();
  await expect(relay).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('link', { name: 'Probar la continuidad' }).click();
  await expect(page).toHaveURL(/#simulador$/);
  await expect(page.getByRole('row', { name: /Lucía Mora/ })).toBeVisible();
  await page.getByRole('button', { name: 'Interrumpir HubSpot' }).press('Enter');
  await expect(page.getByText('HubSpot no responde.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir la copia local' }).press('Enter');
  const review = page.getByRole('link', { name: 'Ir a la revisión de cambios' });
  await expect(review).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Continuidad con Plan B' })).toBeChecked();
  await page.getByRole('button', { name: 'Oportunidades' }).click();
  await page.getByRole('button', { name: 'Mover a Negociación' }).click();
  await expect(page.getByRole('row', { name: /Renovación anual/ })).toContainText('Negociación');
  await page.getByRole('button', { name: 'Tareas' }).click();
  await page.getByRole('button', { name: 'Completar tarea' }).click();
  await expect(page.getByRole('row', { name: /Confirmar próxima reunión/ })).toContainText('Completada');
  await review.click();
  await expect(page).toHaveURL(/#recuperacion$/);
  const comparison = page.getByRole('list', { name: 'Comparación de valores' });
  await expect(comparison.getByRole('listitem')).toHaveCount(2);
  await expect(comparison.getByRole('listitem').filter({ hasText: 'Renovación anual' })).toContainText('Propuesta');

  await page.getByRole('radio', { name: 'Continuidad con Plan B' }).press('ArrowUp');
  await expect(page.getByRole('radio', { name: 'CRM no disponible' })).toBeChecked();
  await page.getByRole('radio', { name: 'CRM no disponible' }).press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Reabrir tarea' })).toBeVisible();
  await page.getByRole('button', { name: 'Reabrir tarea' }).click();
  await expect(comparison.getByRole('listitem')).toHaveCount(1);

  await page.getByText('Ensayar una copia', { exact: true }).click();
  await page.getByRole('button', { name: 'Ensayar el ejemplo' }).click();
  await expect(page.getByText('Comprobación en curso')).toBeVisible();
  await expect(page.getByText('Simulacro de ejemplo superado')).toBeVisible();
  await page.getByRole('link', { name: 'Ver qué incluye la copia' }).click();
  await expect(page).toHaveURL(/#alcance$/);
  const scope = page.locator('#alcance');
  await scope.locator('summary').filter({ hasText: 'Contactos y empresas' }).press('Enter');
  await expect(scope.getByText(/Abre las fichas de la captura/)).toBeVisible();
  await scope.getByText('Oportunidades', { exact: true }).click();
  await expect(scope.getByText(/Consulta la etapa/)).toBeVisible();
  await expect(scope.locator('details[name="copy-scope"][open]')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test('el desplazamiento cambia la ruta y una selección manual conserva el control', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/plan-b.html#simulador');
  const stage = page.locator('.scenario-stage');
  async function scrollToProgress(progress: number) {
    await stage.evaluate((element, fraction) => {
      const rect = element.getBoundingClientRect();
      window.scrollBy({ top: rect.top + rect.height * fraction - window.innerHeight * .22, behavior: 'instant' });
    }, progress);
  }
  await scrollToProgress(.16);
  await expect(page.getByRole('radio', { name: 'Operación normal' })).toBeChecked();

  await scrollToProgress(.5);
  await expect(page.getByRole('radio', { name: 'CRM no disponible' })).toBeChecked();
  await expect(stage.locator('.route-break')).toBeVisible();

  await scrollToProgress(.85);
  await expect(page.getByRole('radio', { name: 'Continuidad con Plan B' })).toBeChecked();
  await expect(stage.locator('.route-break')).toHaveCount(0);

  await page.locator('[data-chapter="online"]').click();
  await scrollToProgress(.85);
  await expect(page.getByRole('radio', { name: 'Operación normal' })).toBeChecked();
});

test('a 320 px permite el recorrido con movimiento reducido y conserva los destinos reales', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/plan-b.html#preparacion');
  await expect(page.getByRole('heading', { name: 'Antes de que haga falta.' })).toBeInViewport();
  await page.getByRole('button', { name: 'Ensayar el ejemplo' }).click();
  await expect(page.getByText('Simulacro de ejemplo superado')).toBeVisible();
  const elements = await page.locator('h1 span').evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(elements).toEqual({ animation: 'none', viewport: 320, content: 320 });

  for (const [name, path] of [
    ['Abrir Plan B', '/inicio'],
    ['Abrir Preparación', '/ajustes/preparacion'],
    ['Abrir Continuidad en Plan B', '/continuidad'],
    ['Abrir Cambios en Plan B', '/continuidad/cambios'],
  ]) {
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', path);
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  }
});
