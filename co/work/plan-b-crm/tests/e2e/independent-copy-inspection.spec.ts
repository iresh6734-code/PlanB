// QA081 · independent browser audit of the COPY074 inspector against a freshly built, isolated generator.
// Not part of the default Playwright project: it refuses to run unless baseURL is a loopback port in 4471-4479 and the
// runner provides PLANB_QA081_ATTEMPT (evidence folder). Real exported bytes, real 409, real file input, real keyboard.
// Interceptions below only DELAY or CORRUPT a real response on purpose; they never fabricate a positive comparison.
// Chromium headless shell only. No Edge, no screen reader.
import {test, expect, type Page, type Locator} from '@playwright/test';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PASSWORD = 'qa081-local-only-' + 'x'.repeat(6), RECOVERY = 'qa081-recovery-separate-0';
const EVIDENCE = process.env.PLANB_QA081_ATTEMPT ?? '';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const SUBMIT = 'Revisar archivo sin restaurar', RESULT = 'Resultado del archivo', PASSWORD_LABEL = 'Contraseña de recuperación, si está cifrado', FILE_LABEL = 'Archivo JSON portátil';
test.beforeEach(({baseURL}) => {
  const port = Number(new URL(baseURL ?? 'http://x').port);
  if (!baseURL?.startsWith('http://127.0.0.1:') || port < 4471 || port > 4479) throw Error('QA081 runs only on a fresh loopback port 4471-4479');
  if (!EVIDENCE) throw Error('QA081 needs PLANB_QA081_ATTEMPT (evidence folder)');
});
const note = (name: string, data: Record<string, unknown>) => { fs.mkdirSync(EVIDENCE, {recursive: true}); fs.appendFileSync(path.join(EVIDENCE, 'e2e.jsonl'), JSON.stringify({at: new Date().toISOString(), name, ...data}) + '\n'); };

async function persisted(page: Page) {
  return {state: await page.request.get('/api/v2/state').then(r => r.json()), changes: await page.request.get('/api/v2/changes').then(r => r.json()), custody: (await page.request.get('/api/v2/continuity').then(r => r.json())).recoveryCopy};
}
async function seed(page: Page) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const gate = await page.request.get('/api/v2/auth/status').then(r => r.json());
  expect((await page.request.post('/api/v2/auth/' + (gate.configured ? 'login' : 'setup'), {data: {password: PASSWORD}})).ok()).toBeTruthy();
  for (const [url, data] of [['/api/import/fixture', {profile: 'agency', replace: true}], ['/api/generate', {mode: 'demo'}], ['/api/activate', {reviewed: true}]] as const) expect((await page.request.post(url, {data})).ok(), url).toBeTruthy();
  const exported = await page.request.post('/api/v2/export/encrypted', {data: {password: RECOVERY}}); expect(exported.ok()).toBeTruthy();
  const bytes = await exported.body();
  const watch = {errors: [] as string[], outside: [] as string[], copyReview: [] as string[], writes: [] as string[]};
  page.on('pageerror', e => watch.errors.push(e.message));
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/v7/copy-review/')) watch.copyReview.push(r.method() + ' ' + u.pathname); if (r.method() !== 'GET') watch.writes.push(r.method() + ' ' + u.pathname); });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== origin && u.protocol.startsWith('http')) { watch.outside.push(u.origin); return route.abort(); } return route.fallback(); });
  return {bytes, hash: sha(bytes), before: await persisted(page), ...watch};
}
const region = (p: Locator) => p.getByRole('region', {name: RESULT, exact: true});
async function open(page: Page) {
  await page.goto('/'); await page.getByRole('button', {name: 'Continuidad', exact: true}).click();
  const block = page.locator('details.copy-inspection'); await expect(block.locator('summary')).toBeVisible();
  const panel = block.getByRole('region', {name: 'Revisión de copia', exact: true}); await expect(panel).toHaveCount(0);
  return {block, panel, openIt: async () => { await block.locator('summary').click(); await expect(panel).toBeVisible(); }};
}
const pick = (panel: Locator, bytes: Buffer, name = 'qa081.json') => panel.getByLabel(FILE_LABEL, {exact: true}).setInputFiles({name, mimeType: 'application/json', buffer: bytes});
const pass = (panel: Locator, value: string) => panel.getByLabel(PASSWORD_LABEL, {exact: true}).fill(value);
const submit = (panel: Locator) => panel.getByRole('button', {name: SUBMIT, exact: true}).click();
const hashText = async (panel: Locator) => (await region(panel).locator('dt:text-is("SHA-256 de los bytes") + dd').innerText()).trim();
const settleFrames = (page: Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const quiet = async (page: Page, h: Awaited<ReturnType<typeof seed>>, expectedWrites?: string[]) => {
  expect(h.errors).toEqual([]); expect(h.outside).toEqual([]); if (expectedWrites) expect(h.writes).toEqual(expectedWrites);
  expect(await persisted(page)).toEqual(h.before);
};

test('E1 real exported bytes: the displayed digest is the node:crypto digest of the chosen file; whitespace changes the digest not the verdict; broken bytes never go green', async ({page}) => {
  const h = await seed(page), {panel, openIt} = await open(page); await openIt();
  const cases: [string, Buffer][] = [['export', h.bytes], ['export+whitespace', Buffer.concat([h.bytes, Buffer.from(' \r\n\t ')])]];
  const seen: string[] = [];
  for (const [name, bytes] of cases) {
    await pick(panel, bytes, name + '.json'); await expect(panel.getByText('Seleccionado: ' + name + '.json · ' + bytes.length + ' bytes', {exact: true})).toBeVisible();
    await pass(panel, RECOVERY); await submit(panel);
    await expect(region(panel)).toContainText('Integridad del archivo: válida.'); await expect(region(panel)).toContainText('Coincide con la referencia local revisada.');
    expect(await hashText(panel)).toBe(sha(bytes)); seen.push(sha(bytes));
    await expect(panel.getByLabel(PASSWORD_LABEL, {exact: true})).toHaveValue('');
  }
  expect(new Set(seen).size).toBe(2); note('E1', {digests: seen.map(s => s.slice(0, 12)), sizes: cases.map(c => c[1].length)});
  // truncated, wrong password, invalid UTF-8
  const truncated = h.bytes.subarray(0, h.bytes.length - 9);
  await pick(panel, truncated, 'truncated.json'); await expect(region(panel)).toHaveCount(0); await pass(panel, RECOVERY); await submit(panel);
  await expect(region(panel)).toContainText('no supera la comprobación de integridad'); await expect(region(panel)).not.toContainText('Coincide con la referencia'); expect(await hashText(panel)).toBe(sha(truncated));
  await pick(panel, h.bytes, 'again.json'); await pass(panel, 'wrong-' + RECOVERY); await submit(panel);
  await expect(region(panel)).toContainText('no supera la comprobación de integridad'); await expect(region(panel)).not.toContainText('Coincide con la referencia');
  await pick(panel, Buffer.concat([h.bytes, Buffer.from([0xff, 0xfe])]), 'badutf8.json'); await submit(panel);
  await expect(panel.getByRole('alert')).toContainText('UTF-8'); await expect(region(panel)).toHaveCount(0);
  await quiet(page, h, Array(5).fill('POST /api/v7/copy-review/inspect'));
});

test('E2 an old copy lacks exactly the operations performed after it, even though a reverted value looks unchanged', async ({page}) => {
  const h = await seed(page);
  const c1 = (await page.request.get('/api/v2/records/contacts/contact-1').then(r => r.json())).record.values.phone as string;
  const patch = async (id: string, values: Record<string, string>) => expect((await page.request.patch('/api/records/contacts/' + id, {data: {values}})).ok()).toBeTruthy();
  await patch('contact-1', {phone: 'qa081-B'}); await patch('contact-1', {phone: c1});             // A→B→A
  await patch('contact-2', {email: 'qa081.c2@example.test'});
  expect((await page.request.post('/api/records/contacts', {data: {values: {firstname: 'Nuevo081', email: 'nuevo081@example.test'}}})).ok()).toBeTruthy();   // 4 operations in total
  Object.assign(h.before, await persisted(page)); // the derived custody flag 'current' legitimately flips after local edits
  const {panel, openIt} = await open(page); await openIt(); await pick(panel, h.bytes); await pass(panel, RECOVERY); await submit(panel);
  await expect(region(panel)).toContainText('Faltan 4 operaciones locales de la referencia.');
  const dd = (label: string) => region(panel).locator('dt:text-is("' + label + '") + dd').innerText();
  expect(await dd('Fichas de referencia ausentes')).toBe('1'); expect(await dd('Fichas distintas')).toBe('1');        // new contact; contact-2. contact-1 equals its old value
  expect(await dd('Operaciones en el archivo')).toBe('0');
  await quiet(page, h, ['POST /api/v7/copy-review/inspect']);
});

test('E3 real 409: password dropped, context re-read, no automatic POST; a failing re-read blocks submit until an explicit refresh', async ({page}) => {
  const h = await seed(page), {panel, openIt} = await open(page); await openIt();
  await pick(panel, h.bytes); await pass(panel, RECOVERY);
  expect((await page.request.patch('/api/records/contacts/contact-1', {data: {values: {phone: 'qa081-409'}}})).ok()).toBeTruthy();
  Object.assign(h.before, await persisted(page));
  let failReload = true; await page.route('**/api/v7/copy-review/context', route => failReload ? route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: 'QA081 simulated reload failure'})}) : route.fallback());
  const reload = page.waitForResponse(r => r.url().includes('/copy-review/context') && r.request().method() === 'GET');
  await submit(panel); await reload; await settleFrames(page);
  await expect(panel.getByRole('alert')).toContainText('La referencia local cambió'); await expect(panel.getByRole('alert')).toContainText('QA081 simulated reload failure');
  await expect(panel.getByLabel(PASSWORD_LABEL, {exact: true})).toHaveValue(''); await expect(region(panel)).toHaveCount(0);
  await expect(panel.getByRole('button', {name: SUBMIT, exact: true})).toBeDisabled();
  await settleFrames(page); expect(h.copyReview.filter(x => x.startsWith('POST'))).toHaveLength(1);
  failReload = false; await panel.getByRole('button', {name: 'Actualizar referencia local', exact: true}).click();
  await expect(panel.getByRole('button', {name: SUBMIT, exact: true})).toBeEnabled(); expect(h.copyReview.filter(x => x.startsWith('POST'))).toHaveLength(1);
  await pass(panel, RECOVERY); await submit(panel);
  await expect(region(panel)).toContainText('Faltan 1 operaciones locales de la referencia.');
  // second real 409, this time the automatic re-read succeeds: still exactly one POST per explicit click
  expect((await page.request.patch('/api/records/contacts/contact-1', {data: {values: {phone: 'qa081-409b'}}})).ok()).toBeTruthy();
  Object.assign(h.before, await persisted(page));
  await pass(panel, RECOVERY); const reload2 = page.waitForResponse(r => r.url().includes('/copy-review/context') && r.request().method() === 'GET'); await submit(panel); await reload2; await settleFrames(page); await settleFrames(page);
  await expect(panel.getByRole('alert')).toContainText('La referencia local cambió'); await expect(panel.getByRole('button', {name: SUBMIT, exact: true})).toBeEnabled(); await expect(panel.getByLabel(PASSWORD_LABEL, {exact: true})).toHaveValue('');
  expect(h.copyReview.filter(x => x.startsWith('POST'))).toHaveLength(3);
  await quiet(page, h, Array(3).fill('POST /api/v7/copy-review/inspect'));
});

test('E4 a corrupted answer is not shown; closing and a new selection with real bytes retire pending work', async ({page}) => {
  const h = await seed(page);
  // (a) a real answer whose hash and duplicate hash were both rewritten (the schema accepts it)
  let corrupt = true;
  await page.route('**/api/v7/copy-review/inspect', async route => { if (!corrupt) return route.fallback(); const response = await route.fetch(), body = await response.json(); body.artifact.sha256 = 'f'.repeat(64); body.inspection.artifactHash = 'f'.repeat(64); await route.fulfill({response, json: body}); });
  const {block, panel, openIt} = await open(page); await openIt();
  await pick(panel, h.bytes); await pass(panel, RECOVERY); await submit(panel);
  await expect(panel.getByRole('alert')).toContainText('No se mostrará como válido'); await expect(region(panel)).toHaveCount(0);
  note('E4', {passwordKeptAfterRejectedAnswer: (await panel.getByLabel(PASSWORD_LABEL, {exact: true}).inputValue()) !== ''}); // observation, not a defect by itself: a retry convenience
  corrupt = false; await page.unroute('**/api/v7/copy-review/inspect');
  // (b) hold a REAL answer, then close: the pending result must not appear after reopening. (The browser aborts the fetch on close, so this
  //     proves view-level retirement in a browser, not a transport that ignores abort: that property belongs to the hook bench.)
  let release!: () => void, arrived!: () => void; const held = new Promise<void>(r => release = r), got = new Promise<void>(r => arrived = r);
  await page.route('**/api/v7/copy-review/inspect', async route => { const response = await route.fetch(); arrived(); await held; await route.fulfill({response}).catch(() => { /* delivery to an aborted request may fail by design */ }); });
  await pick(panel, h.bytes); await pass(panel, RECOVERY); await submit(panel); await got;
  await block.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(panel).toHaveCount(0); release(); await settleFrames(page);
  await block.locator('summary').press('Enter'); await expect(panel).toBeVisible();
  await expect(region(panel)).toHaveCount(0); await expect(panel.getByRole('button', {name: SUBMIT, exact: true})).toBeDisabled(); await expect(panel.getByLabel(PASSWORD_LABEL, {exact: true})).toHaveValue('');
  // (c) select another file while an answer is held: the shown digest belongs to the second file only
  await page.unroute('**/api/v7/copy-review/inspect');
  const second = Buffer.concat([h.bytes, Buffer.from('\n')]);
  let release2!: () => void, arrived2!: () => void; const held2 = new Promise<void>(r => release2 = r), got2 = new Promise<void>(r => arrived2 = r);
  await page.route('**/api/v7/copy-review/inspect', async route => { const response = await route.fetch(); arrived2(); await held2; await route.fulfill({response}).catch(() => { /* aborted by the view */ }); });
  await pick(panel, h.bytes, 'first.json'); await pass(panel, RECOVERY); await submit(panel); await got2;
  await pick(panel, second, 'second.json'); release2(); await settleFrames(page); await expect(region(panel)).toHaveCount(0);
  await page.unroute('**/api/v7/copy-review/inspect'); await pass(panel, RECOVERY); await submit(panel);
  await expect(region(panel)).toContainText('Coincide con la referencia'); expect(await hashText(panel)).toBe(sha(second));
  expect(h.errors).toEqual([]); expect(h.outside).toEqual([]); expect(await persisted(page)).toEqual(h.before);
});

test('E5 keyboard path and lazy loading: folded block makes no request; Enter opens; Tab/Enter submits', async ({page}) => {
  const h = await seed(page), {block, panel} = await open(page);
  await settleFrames(page); expect(h.copyReview).toEqual([]);                                                // folded: no GET/POST of its own
  await block.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(panel).toBeVisible();
  await expect.poll(() => h.copyReview.length).toBe(1); await settleFrames(page); await settleFrames(page); expect(h.copyReview).toEqual(['GET /api/v7/copy-review/context']);
  await pick(panel, h.bytes); await panel.getByLabel(PASSWORD_LABEL, {exact: true}).focus(); await page.keyboard.type(RECOVERY);
  await page.keyboard.press('Tab'); await expect(panel.getByRole('button', {name: SUBMIT, exact: true})).toBeFocused(); await page.keyboard.press('Enter');
  await expect(region(panel)).toContainText('Coincide con la referencia local revisada.');
  await block.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(panel).toHaveCount(0);
  await page.keyboard.press('Enter'); await expect(panel).toBeVisible(); expect(h.copyReview.filter(x => x.startsWith('GET'))).toHaveLength(2);
  await quiet(page, h, ['POST /api/v7/copy-review/inspect']);
});

test('E6 layout at 1440/390/320: no horizontal overflow, 44px controls, full hash readable; screenshots kept', async ({page}) => {
  const h = await seed(page), {panel, openIt} = await open(page); await openIt();
  await pick(panel, h.bytes); await pass(panel, RECOVERY); await submit(panel); await expect(region(panel)).toContainText(h.hash);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 1000}); await panel.scrollIntoViewIfNeeded(); await settleFrames(page);
    const m = await page.evaluate(() => {
      const root = document.documentElement, dd = [...document.querySelectorAll('.copy-inspection-result dd')].find(d => /^[a-f0-9]{64}$/.test(d.textContent!.trim()))!, box = dd.getBoundingClientRect();
      const small = [...document.querySelectorAll('.copy-inspection-panel button, .copy-inspection-panel input:not([type=file])')].filter(e => (e as HTMLElement).offsetParent).map(e => ({tag: e.tagName, h: Math.round(e.getBoundingClientRect().height)})).filter(x => x.h < 44);
      const file = document.querySelector('.copy-inspection-panel input[type=file]')!.getBoundingClientRect();
      const summaryH = Math.round(document.querySelector('.copy-inspection > summary')!.getBoundingClientRect().height);
      return {overflowX: root.scrollWidth > innerWidth, hashRight: Math.round(box.right), hashFits: dd.scrollWidth <= (dd as HTMLElement).clientWidth + 1, vw: innerWidth, small, fileH: Math.round(file.height), summaryH, wrap: getComputedStyle(dd).overflowWrap};
    });
    expect(m.overflowX, 'horizontal overflow at ' + width).toBe(false); expect(m.hashFits, 'hash clipped at ' + width).toBe(true); expect(m.hashRight).toBeLessThanOrEqual(m.vw); expect(m.small).toEqual([]); expect(m.fileH).toBeGreaterThanOrEqual(44); expect(m.summaryH).toBeGreaterThanOrEqual(44);
    const shot = path.join(EVIDENCE, 'qa081-' + width + '.png'); fs.mkdirSync(EVIDENCE, {recursive: true}); await page.screenshot({path: shot}); const shotResult = path.join(EVIDENCE, 'qa081-' + width + '-result.png'); await region(panel).screenshot({path: shotResult}); note('E6', {width, ...m, shot: path.basename(shot), shotResult: path.basename(shotResult)});
  }
  expect(h.errors).toEqual([]);
});
