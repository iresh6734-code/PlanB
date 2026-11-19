import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeLifecycleCopy, startLifecycleCopy } from '../helpers/app-lifecycle-harness.js';
import { openSection, place } from './menu';

test.setTimeout(120_000);
// Lugares del menú en escritorio (menú lateral) o en el móvil (barra inferior): ver tests/e2e/menu.ts.
const nav = (page: Page, label: string) => place(page, label);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function observe(page: Page, origin: string) {
  const errors: string[] = [], consoleLogs: string[] = [], outside: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleLogs.push(message.text()); });
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method() + ' ' + new URL(request.url()).pathname); });
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) { outside.push(route.request().url()); return route.abort(); }
    return route.fallback();
  });
  return { errors, consoleLogs, outside, writes };
}
async function generateAndActivate(page: Page) {
  await page.getByRole('button', { name: 'Crear especificación de ensayo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu aplicación.', exact: true })).toBeVisible();
  const approval = page.getByRole('checkbox', { name: 'He revisado los campos, las reglas y las funciones pendientes.' });
  await expect(approval).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Activar y abrir aplicación', exact: true })).toBeDisabled();
  await approval.check();
  await page.getByRole('button', { name: 'Activar y abrir aplicación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
}

test('empty -> import -> useful Hoy -> explicit activation -> disconnected edit -> CSV -> own process restart preserves identity and records', async ({ page, request }) => {
  const copy = makeLifecycleCopy(4592);
  let server = await startLifecycleCopy(copy);
  const seen = await observe(page, server.url);
  try {
    const empty = await request.get(server.url + '/api/v2/state').then(r => r.json());
    expect(empty.snapshot).toBeNull(); expect(empty.ready).toBe(false);
    await page.goto(server.url); await expect(page).toHaveTitle('Plan B · Tu CRM sigue contigo');
    await nav(page, 'Preparación').click();
    await page.getByRole('button', { name: 'Continuar con Agencia Norte', exact: true }).click();
    await expect(page.getByText('Captura conciliada', { exact: true })).toBeVisible();
    const imported = await request.get(server.url + '/api/v2/state').then(r => r.json());
    expect(imported.spec).toBeNull(); expect(imported.ready).toBe(false);
    await nav(page, 'Hoy').click();
    await expect(page.locator('.lop-tasks li')).toHaveCount(14);
    await expect(page.getByText('Captura importada · pendiente de activar', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar preparación', exact: true }).click();
    await page.getByRole('navigation', { name: 'Secciones de preparación' }).getByRole('button', { name: 'Procesos', exact: true }).click();
    await generateAndActivate(page);
    await page.getByRole('button', { name: 'Desconectar servicios', exact: true }).click();
    await expect(page.getByText('Modo independiente', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar Lucía Martín', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Lucía Martín', exact: true });
    await editor.getByLabel('Teléfono', { exact: true }).fill('600 126 126');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('cell', { name: '600 126 126', exact: true })).toBeVisible();
    const state = await request.get(server.url + '/api/v2/state').then(r => r.json());
    expect(state.ready).toBe(true); expect(state.disconnected).toBe(true); expect(state.changes).toBe(1);
    const records = await request.get(server.url + '/api/records').then(r => r.json());
    expect(records.records).toHaveLength(62);
    const record = records.records.find((row: { entity: string; id: string }) => row.entity === 'contacts' && row.id === 'contact-1');
    expect(record.values.phone).toBe('600 126 126');
    await nav(page, 'Cambios').click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const file = path.join(copy.root, 'local-changes.csv'); await (await download).saveAs(file);
    expect(fs.readFileSync(file, 'utf8')).toContain('600 126 126');
    const originalInstance = server.instanceId, originalPid = server.pid;
    // Close the document before stopping its server so background polling cannot race
    // the deliberately unavailable endpoint. This tests a clean close/reopen cycle.
    await page.goto('about:blank');
    await server.stop(); server = await startLifecycleCopy(copy);
    expect(server.pid).not.toBe(originalPid); expect(server.instanceId).toBe(originalInstance);
    expect(await request.get(server.url + '/api/v2/state').then(r => r.json())).toMatchObject({ ready: true, disconnected: true, changes: 1 });
    expect(digest(await request.get(server.url + '/api/records').then(r => r.json()))).toBe(digest(records));
    await page.goto(server.url); await openSection(page, 'Clientes');
    await expect(page.getByRole('cell', { name: '600 126 126', exact: true })).toBeVisible();
    await nav(page, 'Hoy').click(); await expect(page.locator('.lop-tasks li')).toHaveCount(14);
    await page.screenshot({ path: path.join(copy.root, 'after-restart-today.png'), fullPage: false });
    fs.writeFileSync(path.join(copy.root, 'observed.json'), JSON.stringify({ originalPid, pid: server.pid, instanceId: server.instanceId, recordDigest: digest(records), writes: seen.writes, errors: seen.errors, console: seen.consoleLogs, outside: seen.outside }, null, 2));
    expect(seen.writes).toContain('POST /api/import/fixture'); expect(seen.writes).toContain('POST /api/generate'); expect(seen.writes).toContain('POST /api/v4/activate-reviewed');
    expect(seen.writes.some(value => /hubspot|connection|\/v7\/local-operations\/reviews/.test(value))).toBe(false);
    expect(seen.errors).toEqual([]); expect(seen.consoleLogs).toEqual([]); expect(seen.outside).toEqual([]);
  } finally { await server.stop(); }
});

test('a second empty installation prepares Distribution, shows its captured fields and rejects an invalid delivery without saving', async ({ page, request }) => {
  const copy = makeLifecycleCopy(4593), server = await startLifecycleCopy(copy), seen = await observe(page, server.url);
  try {
    await page.goto(server.url); await nav(page, 'Preparación').click();
    await page.getByRole('button', { name: /Distribuidora Atlas.*Clientes, pedidos/ }).click();
    await page.getByRole('button', { name: 'Continuar con Distribuidora Atlas', exact: true }).click();
    await expect(page.getByText('Captura conciliada', { exact: true })).toBeVisible();
    await generateAndActivate(page);
    await page.getByRole('button', { name: 'Editar Lucía Martín', exact: true }).click();
    await expect(page.getByLabel('Código de cliente', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Servicio contratado', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar edición', exact: true }).click();
    await page.getByRole('navigation', { name: 'Clientes', exact: true }).getByRole('button', { name: 'Oportunidades', exact: true }).click();
    await expect(page.getByRole('heading', { name: /En entrega/ })).toBeVisible();
    await page.getByRole('button', { name: /Suministro · Estudio Arce/ }).first().click();
    const editor = page.getByRole('dialog');
    const reference = editor.locator('#record-reference');
    const before = await request.get(server.url + '/api/records').then(r => r.json());
    await editor.getByLabel('Etapa', { exact: false }).selectOption('delivery');
    await expect(reference).toHaveAccessibleName('Referencia del pedido');
    await reference.fill('');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Indica la referencia');
    await expect(reference).toHaveAttribute('aria-invalid', 'true');
    expect(digest(await request.get(server.url + '/api/records').then(r => r.json()))).toBe(digest(before));
    await reference.fill('ENSAYO-126');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(editor).toHaveCount(0);
    const after = await request.get(server.url + '/api/records').then(r => r.json());
    expect(after.records.find((row: { entity: string; id: string }) => row.entity === 'deals' && row.id === 'deal-1').values.reference).toBe('ENSAYO-126');
    await nav(page, 'Hoy').click(); await expect(page.locator('.lop-tasks li')).toHaveCount(14);
    await page.screenshot({ path: path.join(copy.root, 'distribution-today.png'), fullPage: false });
    // The rejected validation is an expected 422 resource error; distinguish it from uncaught JS errors.
    expect(seen.errors).toEqual([]); expect(seen.outside).toEqual([]);
    expect(seen.consoleLogs.filter(text => !text.includes('422'))).toEqual([]);
    fs.writeFileSync(path.join(copy.root, 'observed.json'), JSON.stringify({ instanceId: server.instanceId, writes: seen.writes, errors: seen.errors, console: seen.consoleLogs, outside: seen.outside }, null, 2));
  } finally { await server.stop(); }
});
