import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { startLifecycleCopy } from '../helpers/app-lifecycle-harness.js';
import { makePortableProducer, extractPortable, startExtractedPortable, databaseDigest } from '../helpers/portable-lifecycle-harness.js';

// The real ZIP extraction copies thousands of dependency files on Windows.
test.setTimeout(480_000);
test.use({ actionTimeout: 15_000 });
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function openSection(page: Page, place: string, section: string) {
  const navigation = page.getByRole('navigation', { name: 'Navegación principal', exact: true });
  const toggle = navigation.getByRole('button', { name: place, exact: true }).and(navigation.locator('button[aria-expanded]'));
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await navigation.getByRole('navigation', { name: place, exact: true }).getByRole('button', { name: section, exact: true }).click();
}

async function protect(page: Page, password: string) {
  await openSection(page, 'Continuidad', 'Estado');
  await page.getByRole('tab', { name: 'Copias y archivo', exact: true }).click();
  await page.getByRole('button', { name: 'Proteger acceso local', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Protege tu copia', exact: true })).toBeVisible();
  await page.getByLabel('Contraseña local', { exact: true }).fill(password);
  await page.getByLabel('Repite la contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Guardar protección', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Protege tu copia', exact: true })).toHaveCount(0);
}

async function portableEvidence(page: Page, url: string, instanceId: string) {
  const response = await page.request.get(url + '/api/v2/state');
  expect(response.status()).toBe(200);
  const state = await response.json();
  expect(state.workspaceSearchContext.instanceId).toBe(instanceId);
  const pin = state.workspaceSearchContext.contextRevision;
  expect(pin).toMatch(/^[a-f0-9]{64}$/);
  await openSection(page, 'Continuidad', 'Estado');
  await page.getByRole('tab', { name: 'Evidencia e impacto', exact: true }).click();
  await expect(page.locator('.cph[aria-busy="false"]')).toBeVisible();
  const [evidence] = await Promise.all([
    page.waitForResponse(response => {
      const request = new URL(response.url());
      return request.origin === url && request.pathname === '/api/v7/continuity/evidence' && request.searchParams.get('workspaceContextRevision') === pin;
    }),
    page.getByRole('button', { name: 'Leer el estado guardado', exact: true }).click(),
  ]);
  expect(evidence.status()).toBe(200);
  expect(evidence.headers()['x-planb-workspace-revision']).toBe(pin);
  await expect(page.locator('.cph[aria-busy="false"]')).toBeVisible();
  await expect(page.locator('.cpp [data-section="copy"] [data-basis="observed"]').filter({ hasText: 'Copia local capturada' })).toBeVisible();
  // The component can cancel a same-context refresh while Chromium releases its body handle.
  // Confirm the consumed UI state, then read the protected response independently with that exact pin.
  const proof = await page.request.get(url + '/api/v7/continuity/evidence?workspaceContextRevision=' + pin);
  expect(proof.status()).toBe(200);
  expect(proof.headers()['x-planb-workspace-revision']).toBe(pin);
  const result = await proof.json();
  expect(result).toMatchObject({ available: true, evaluation: { status: 'unproven' }, facts: { snapshot: { isTestData: true } } });
  return { pin, bundleRevision: result.context.bundleRevision, status: evidence.status() };
}

test('UI downloads a real encrypted package; its bundled Node restores edited records in an unrelated empty directory and survives restart', async ({ page }) => {
  const copy = makePortableProducer(), source = await startLifecycleCopy(copy);
  let portable: Awaited<ReturnType<typeof startExtractedPortable>> | undefined;
  const recoveryPassword = 'fixture137-' + randomUUID(), sourcePassword = 'source137-' + randomUUID(), destinationPassword = 'destination137-' + randomUUID();
  const errors: string[] = [], consoleErrors: string[] = [], outside: string[] = [], writes: string[] = [], restoreStatuses: number[] = [];
  const missingCapabilities: string[] = [];
  const optionalCapabilities = new Set(['/api/v2/connection/read-check', '/api/v2/relay/rehearsal']);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (!['warning', 'error'].includes(m.type())) return;
    const url = m.location().url;
    const capability = url ? new URL(url).pathname : '';
    if (/status of 404/.test(m.text()) && optionalCapabilities.has(capability)) return;
    consoleErrors.push(m.text());
  });
  page.on('request', r => { if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.method() + ' ' + new URL(r.url()).pathname); });
  page.on('response', r => {
    const route = new URL(r.url()).pathname;
    if (route === '/api/v2/restore') restoreStatuses.push(r.status());
    if (r.status() === 404 && optionalCapabilities.has(route)) missingCapabilities.push(route);
  });
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    if (![source.url, 'http://127.0.0.1:4593'].includes(origin)) { outside.push(origin); return route.abort(); }
    return route.fallback();
  });
  try {
    await page.goto(source.url); await openSection(page, 'Ajustes', 'Preparación');
    await page.getByRole('button', { name: 'Continuar con Agencia Norte', exact: true }).click();
    await expect(page.getByText('Captura conciliada', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Crear especificación de ensayo', exact: true }).click();
    await page.getByRole('checkbox', { name: 'He revisado los campos, las reglas y las funciones pendientes.' }).check();
    await page.getByRole('button', { name: 'Activar y abrir aplicación', exact: true }).click();
    await page.getByRole('button', { name: 'Desconectar servicios', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Lucía Martín', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Lucía Martín', exact: true });
    await editor.getByLabel('Teléfono', { exact: true }).fill('600 137 137');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await expect(editor).toHaveCount(0);
    await protect(page, sourcePassword);
    const records = await page.request.get(source.url + '/api/records').then(r => r.json());
    const sourceCookie = (await page.context().cookies(source.url)).filter(c => c.name === 'planb_session').map(c => c.name + '=' + c.value).join('; ');
    const sourceState = await page.request.get(source.url + '/api/v2/state').then(r => r.json());
    const changes = await page.request.get(source.url + '/api/v2/changes').then(r => r.json());
    expect(records.records).toHaveLength(62); expect(sourceState.changes).toBe(1); expect(changes.changes).toHaveLength(1);
    await openSection(page, 'Continuidad', 'Exportar');
    const view = page.locator('.export-page');
    await expect(view.getByRole('heading', { name: 'Qué contiene esta descarga' })).toBeVisible();
    const summary = await page.request.get(source.url + '/api/v4/export-summary').then(r => r.json());
    await view.getByLabel('Contraseña de recuperación', { exact: true }).fill(recoveryPassword);
    await view.getByLabel('Repite la contraseña', { exact: true }).fill(recoveryPassword);
    await expect(view.getByRole('button', { name: 'Descargar aplicación independiente', exact: true })).toBeDisabled();
    await view.getByLabel('He revisado la captura y los cambios incluidos en esta descarga.').check();
    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
    await view.getByRole('button', { name: 'Descargar aplicación independiente', exact: true }).click();
    const download = await downloadPromise, zip = path.join(copy.root, 'downloaded-package.zip');
    await download.saveAs(zip); expect(await download.failure()).toBeNull();
    await expect(view.getByRole('status')).toContainText('No se ha verificado una restauración');
    expect(digest(await page.request.get(source.url + '/api/records').then(r => r.json()))).toBe(digest(records));
    const extracted = extractPortable(zip, copy.root);
    const relativeDestination = path.relative(process.cwd(), extracted);
    expect(path.isAbsolute(relativeDestination) || relativeDestination.startsWith('..' + path.sep)).toBe(true);
    for (const name of ['runtime.mjs', 'node.exe', 'launch.cjs', 'ABRIR PLAN B.cmd', 'continuity.encrypted.json', 'dist/index.html', 'block-external.cjs']) expect(fs.existsSync(path.join(extracted, name)), name).toBe(true);
    for (const name of ['data', '.env.local', '.ai.local', 'continuity.seed.json', 'server.mjs']) expect(fs.existsSync(path.join(extracted, name)), name).toBe(false);
    const encryptedFile = path.join(extracted, 'continuity.encrypted.json'), encryptedText = fs.readFileSync(encryptedFile, 'utf8');
    expect(JSON.parse(encryptedText).format).toBe('planb-encrypted-v2');
    for (const plaintext of ['600 137 137', sourcePassword, recoveryPassword, 'Lucía Martín']) expect(encryptedText).not.toContain(plaintext);
    portable = await startExtractedPortable(extracted, copy.root);
    expect(portable.instanceId).not.toBe(source.instanceId);
    expect((await page.request.get(portable.url + '/api/v2/auth/status').then(r => r.json())).configured).toBe(false);
    expect((await page.request.get(portable.url + '/api/v2/state').then(r => r.json())).snapshot).toBeNull();
    await page.goto(portable.url); await protect(page, destinationPassword);
    const before = databaseDigest(portable.data);
    await page.getByRole('tab', { name: 'Copias y archivo', exact: true }).click();
    await page.locator('.history-section').getByRole('button', { name: 'Restaurar archivo', exact: true }).click();
    const restore = page.getByRole('dialog', { name: 'Restaurar una copia' });
    await restore.getByLabel('Archivo JSON de Plan B', { exact: true }).setInputFiles(encryptedFile);
    await restore.getByLabel('Contraseña de recuperación, si está cifrado', { exact: true }).fill('incorrect fixture password');
    await restore.getByRole('button', { name: 'Validar y restaurar', exact: true }).click();
    await expect(restore.getByRole('alert')).toContainText('La contraseña es incorrecta o el archivo está dañado');
    expect(databaseDigest(portable.data)).toBe(before);
    const tampered = JSON.parse(encryptedText) as { data: string }; const index = Math.floor(tampered.data.length / 2);
    tampered.data = tampered.data.slice(0, index) + (tampered.data[index] === 'A' ? 'B' : 'A') + tampered.data.slice(index + 1);
    await restore.getByLabel('Archivo JSON de Plan B', { exact: true }).setInputFiles({ name: 'tampered-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
    await restore.getByLabel('Contraseña de recuperación, si está cifrado', { exact: true }).fill(recoveryPassword);
    await restore.getByRole('button', { name: 'Validar y restaurar', exact: true }).click();
    await expect.poll(() => restoreStatuses.length).toBe(2); expect(databaseDigest(portable.data)).toBe(before);
    expect(restoreStatuses).toEqual([422, 422]);
    await restore.getByLabel('Archivo JSON de Plan B', { exact: true }).setInputFiles(encryptedFile);
    await restore.getByRole('button', { name: 'Validar y restaurar', exact: true }).click(); await expect(restore).toHaveCount(0);
    expect(restoreStatuses).toEqual([422, 422, 200]);
    const restored = await page.request.get(portable.url + '/api/v2/state').then(r => r.json());
    expect(restored).toMatchObject({ ready: true, runtime: true, disconnected: true, aiConfigured: false, hubspotConfigured: false, changes: 1 });
    expect(restored.snapshot).toEqual(sourceState.snapshot); expect(restored.spec).toEqual(sourceState.spec);
    expect(digest(await page.request.get(portable.url + '/api/records').then(r => r.json()))).toBe(digest(records));
    expect((await page.request.get(portable.url + '/api/v2/changes').then(r => r.json())).changes).toEqual(changes.changes);
    const custody = await page.request.get(portable.url + '/api/v2/continuity').then(r => r.json());
    expect(custody.recoveryCopy.restoredAt).toBeTruthy(); expect(custody.recoveryCopy.confirmedAt).toBeFalsy();
    const digestBeforeEvidence = databaseDigest(portable.data);
    const initialEvidence = await portableEvidence(page, portable.url, portable.instanceId);
    expect(databaseDigest(portable.data)).toBe(digestBeforeEvidence);
    await openSection(page, 'Clientes', 'Clientes'); await expect(page.getByRole('cell', { name: '600 137 137', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(copy.root, 'portable-restored.png'), fullPage: false });
    const oldPid = portable.pid, identity = portable.instanceId;
    await page.goto('about:blank'); await portable.stop(); portable = await startExtractedPortable(extracted, copy.root);
    expect(portable.pid).not.toBe(oldPid); expect(portable.instanceId).toBe(identity);
    await page.goto(portable.url); await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toBeVisible();
    await page.getByLabel('Contraseña local', { exact: true }).fill(destinationPassword); await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tu copia está protegida' })).toHaveCount(0);
    const restartedEvidence = await portableEvidence(page, portable.url, identity);
    expect(restartedEvidence).toEqual(initialEvidence);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('.cpp [data-section="copy"]').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(copy.root, 'portable-continuity-390.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openSection(page, 'Clientes', 'Clientes'); await expect(page.getByRole('cell', { name: '600 137 137', exact: true })).toBeVisible();
    expect(digest(await page.request.get(portable.url + '/api/records').then(r => r.json()))).toBe(digest(records));
    expect((await page.request.get(source.url + '/api/v2/auth/status').then(r => r.json())).configured).toBe(true);
    expect(digest(await page.request.get(source.url + '/api/records', { headers: { Cookie: sourceCookie } }).then(r => r.json()))).toBe(digest(records));
    expect(errors).toEqual([]); expect(outside).toEqual([]);
    expect(consoleErrors.filter(m => !/422|401/.test(m))).toEqual([]);
    expect(writes.some(p => /hubspot|connection|\/return\//.test(p))).toBe(false);
    fs.writeFileSync(path.join(copy.root, 'observed-portable.json'), JSON.stringify({ sourceInstance: source.instanceId, portableInstance: identity, portablePidBefore: oldPid, portablePidAfter: portable.pid, extracted, recordDigest: digest(records), changesDigest: digest(changes.changes), reviewedRevision: summary.revision, restoreStatuses, initialEvidence, restartedEvidence, missingCapabilities, writes, errors, consoleErrors, outside, zipBytes: fs.statSync(zip).size, zipSha256: createHash('sha256').update(fs.readFileSync(zip)).digest('hex') }, null, 2));
  } finally {
    try { if (portable) await portable.stop(); }
    finally { await source.stop(); }
  }
});
