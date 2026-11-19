// Navegación por el menú de cinco lugares para las pruebas de navegador (CLAUDE-E2E-MENU-HELPER, 18/11/2026).
// Desde CLAUDE-UI-NAV-LAB el menú tiene grupos (Inicio, Hoy, Clientes, Continuidad, Ajustes y, con datos de prueba,
// Laboratorio) y cada apartado vive dentro del suyo; un grupo solo enseña sus apartados cuando está desplegado.
// Equivalencias con el menú anterior: «Trabajar» → grupo «Clientes»; «Agentes» → «Hoy › Propuestas»;
// «Proteger / bloquear» → botón «Bloquear Plan B» de la barra superior; «Espacio comercial» → «Espacio de equipo» (barra superior).
import type { Locator, Page } from '@playwright/test';

/** Apartado → [grupo, nombre del apartado en el menú]. */
const SECTIONS: Record<string, [string, string]> = {
  'Tareas de hoy': ['Hoy', 'Tareas de hoy'], 'Revisión semanal': ['Hoy', 'Revisión semanal'], Agenda: ['Hoy', 'Agenda'], Propuestas: ['Hoy', 'Propuestas'],
  Clientes: ['Clientes', 'Clientes'], Empresas: ['Clientes', 'Empresas'], Oportunidades: ['Clientes', 'Oportunidades'], Tareas: ['Clientes', 'Tareas'],
  Estado: ['Continuidad', 'Estado'], Cambios: ['Continuidad', 'Cambios'], Exportar: ['Continuidad', 'Exportar'], 'Copia de equipo': ['Continuidad', 'Copia de equipo'],
  Integraciones: ['Ajustes', 'Integraciones'], 'Proveedor de IA': ['Ajustes', 'Proveedor de IA'], Preparación: ['Ajustes', 'Preparación'],
  Radar: ['Laboratorio', 'Radar'], 'Comprobar una fecha': ['Laboratorio', 'Comprobar una fecha'],
};

/** Botón de cabecera de un grupo del menú lateral (`.work-toggle`; su apartado homónimo, p. ej. «Clientes», no cuenta). */
export const menuGroup = (page: Page, group: string): Locator =>
  page.locator('.sidebar .work-toggle').filter({ hasText: new RegExp('^\\s*' + group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'u') });

/** Botón de un apartado dentro de su grupo (el grupo debe estar desplegado para que sea visible). */
export const menuItem = (page: Page, section: string): Locator => {
  const [group, name] = SECTIONS[section] ?? [section, section];
  return page.locator('.sidebar').getByRole('navigation', { name: group, exact: true }).getByRole('button', { name, exact: true });
};

/** Orden de la paleta (Ctrl J o «Más» en el móvil) que abre cada apartado. */
const COMMANDS: Record<string, string> = {
  'Tareas de hoy': 'Ir a Hoy', 'Revisión semanal': 'Ir a Revisión semanal', Agenda: 'Ir a Agenda', Propuestas: 'Ir a Propuestas', Clientes: 'Ir a Clientes', Empresas: 'Ir a Empresas', Oportunidades: 'Ir a Oportunidades', Tareas: 'Ir a Tareas',
  Estado: 'Ir a Continuidad', Cambios: 'Ir a Cambios', Exportar: 'Ir a Exportar', 'Copia de equipo': 'Ir a Copia de equipo',
  Integraciones: 'Ir a Integraciones', 'Proveedor de IA': 'Proveedor de IA', Preparación: 'Ir a Preparación',
  Radar: 'Laboratorio: Radar de compromisos', 'Comprobar una fecha': 'Laboratorio: Comprobar una fecha',
};

/**
 * Abre un apartado como lo haría una persona: en escritorio despliega su grupo del menú lateral si hace falta y lo pulsa;
 * en el móvil (sin menú lateral) pulsa «Más» en la barra inferior y elige su orden en la paleta.
 */
export async function openSection(page: Page, section: string) {
  // Primero, que la App haya pintado alguno de los dos menús: decidir antes confundía «todavía cargando» con «móvil».
  await page.locator('.sidebar, .gx-mnav').filter({ visible: true }).first().waitFor();
  if (!(await page.locator('.sidebar').isVisible())) {
    await page.locator('.gx-mnav').getByRole('button', { name: 'Más', exact: true }).click();
    await page.getByRole('combobox', { name: 'Escribe una orden o un nombre' }).fill(COMMANDS[section] ?? section);
    await page.locator('#gx-commands-list [role="option"]').filter({ hasText: COMMANDS[section] ?? section }).first().click();
    return;
  }
  const item = menuItem(page, section);
  if (!(await item.isVisible())) await menuGroup(page, (SECTIONS[section] ?? [section])[0]).first().click();
  await item.click();
}

/**
 * Un lugar del menú (Inicio, Hoy, Clientes, Continuidad…) donde esté visible: en el menú lateral en escritorio o en la
 * barra inferior en el móvil (bajo 768 px el menú lateral no se muestra). Para apartados dentro de un grupo, `openSection`.
 */
export const place = (page: Page, name: string): Locator =>
  page.locator('.sidebar, .gx-mnav').getByRole('button', { name, exact: true }).filter({ visible: true }).first();

/** Botón «Bloquear Plan B» (antes «Proteger / bloquear» en el menú). */
export const lockButton = (page: Page): Locator => page.locator('.gx-topbar').getByRole('button', { name: 'Bloquear Plan B', exact: true });

/** Direcciones de cada apartado (src/app-shell/routes.ts), para recorrer vistas en el móvil sin depender del menú. */
export const sectionPath: Record<string, string> = {
  Inicio: '/inicio', Hoy: '/hoy', 'Revisión semanal': '/hoy/semana', Agenda: '/hoy/agenda', Propuestas: '/hoy/propuestas', Clientes: '/clientes', Empresas: '/empresas', Oportunidades: '/oportunidades', Tareas: '/tareas',
  Continuidad: '/continuidad', Cambios: '/continuidad/cambios', Exportar: '/continuidad/exportar', 'Copia de equipo': '/continuidad/equipo',
  Integraciones: '/ajustes/integraciones', Preparación: '/ajustes/preparacion',
};
