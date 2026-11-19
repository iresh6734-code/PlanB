import type { Page } from '@playwright/test';

/** Navega a un apartado como lo haría la persona y sin depender de cómo esté agrupado el menú:
 *  1) si el botón está a la vista en la barra lateral y no es la cabecera de un grupo, se pulsa;
 *  2) si no, se abre la paleta de órdenes (Ctrl J en escritorio, «Más» en móvil) y se elige «Ir a …» o el nombre exacto. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Nombres que cambiaron con el menú de cinco lugares (17/11): la vista sigue siendo la misma.
const ALIAS: Record<string, string> = { Agentes: 'Propuestas', Radar: 'Radar de compromisos' };
export async function navigate(page: Page, label: string) {
  const wanted = ALIAS[label] ?? label;
  const direct = page.locator('.sidebar').getByRole('button', { name: label, exact: true }).first();
  const isGroup = await direct.getAttribute('aria-expanded').then(value => value !== null).catch(() => false);
  if (!isGroup && await direct.isVisible().catch(() => false)) { await direct.click({ timeout: 6000 }); return; }
  const more = page.locator('.gx-mnav').getByRole('button', { name: 'Más' });
  const narrow = (page.viewportSize()?.width ?? 1440) <= 760;
  if (narrow) {
    // En móvil nunca se pulsa Ctrl J (en un navegador real abre «Descargas»): se cierra lo abierto y se usa «Más».
    for (let i = 0; i < 3 && !(await more.isVisible().catch(() => false)); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await more.click({ timeout: 6000 });
  } else { await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined); await page.keyboard.press('Control+KeyJ'); }
  const input = page.locator('.gx-commands input');
  await input.waitFor({ timeout: 6000 });
  await input.fill(wanted);
  const pattern = new RegExp('^(Ir a |Ir al |Abrir |Laboratorio: )?' + escape(wanted) + '$');
  const option = page.locator('.gx-commands li').filter({ has: page.locator('span', { hasText: pattern }) }).first();
  await option.click({ timeout: 6000 });
}
