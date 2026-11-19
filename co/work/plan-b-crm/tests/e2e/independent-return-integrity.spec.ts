import { test, expect, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// QA091 · navegador real (Chromium en caché) contra servidores EFÍMEROS propios con bases ficticias nuevas.
// Entorno obligatorio: QA091_RUN (carpeta con server.mjs, dist/ y scripts/block-external.cjs compilados aparte),
// QA091_SRC (fuente con la que se siembran las bases), QA091_E2E_DIR (evidencias propias). Todo bajo tests/.tmp/qa091-*.
// Ningún puerto fuera de QA091_PORT_BASE..+8, nunca 4420/4421/4331/4334. Todo remoto distinto del servidor propio se aborta y se cuenta.
// La corrupción se inyecta con SQL sobre el fichero del fixture mientras el servidor está en marcha (nunca con un endpoint de la app).
const RUN = process.env.QA091_RUN, SRC = process.env.QA091_SRC, WORK = process.env.QA091_E2E_DIR, PORT0 = Number(process.env.QA091_PORT_BASE ?? 4481);
if (!RUN || !SRC || !WORK) throw new Error('QA091 E2E necesita QA091_RUN, QA091_SRC y QA091_E2E_DIR (carpetas propias bajo tests/.tmp/qa091-*)');
for (const p of [RUN, SRC, WORK]) if (!/[\\/]tests[\\/]\.tmp[\\/]qa091-/.test(path.resolve(p))) throw new Error('Ruta fuera de tests/.tmp/qa091-*: ' + p);
if (PORT0 < 4481 || PORT0 > 4481 + 8) throw new Error('Solo se permiten los puertos 4481-4489');
const MARK = 'PRIVATE_QA091_E2E_MARKER', MESSAGE_START = 'El plan de devolución guardado no se puede validar';
const BAD_SHAPE = JSON.stringify({ id: 'qa091-bad', status: 'bogus', warning: MARK });
fs.mkdirSync(path.join(WORK, 'evidence'), { recursive: true });

const SEED = `
import {pathToFileURL} from 'node:url'; import path from 'node:path';
const src=process.env.QA091_SRC, dir=process.env.QA091_SEED_DIR, mode=process.env.QA091_SEED_MODE;
const load=rel=>import(pathToFileURL(path.join(src,rel)).href);
const {Store}=await load('server/store.ts'); const {makeFixture,makeDemoSpec}=await load('shared/fixtures.ts'); const {Recovery,simulatedRemote}=await load('server/recovery.ts');
const s=new Store(path.join(dir,'planb.sqlite')); const snap=makeFixture();
if(mode==='production'){snap.version=3;Object.assign(snap.source,{kind:'hubspot',accountId:'91091',isTestData:false,environment:'production',accountType:'STANDARD'});}
s.importSnapshot(snap); s.saveGeneration(makeDemoSpec(snap),{provider:'demo',model:null,generatedAt:new Date().toISOString(),prompt:'',approved:false}); s.activate();
s.saveRecord('contacts',{firstname:'Nuria',lastname:'Qa091',email:'nuria.qa091@example.test',company_id:'company-1'});
s.saveRecord('companies',{phone:'900 091 091'},'company-1'); s.saveRecord('contacts',{phone:'600 091 091'},'contact-1');
if(process.env.QA091_SEED_PLAN==='1'){await new Recovery(s).preview(simulatedRemote(s));}
if(process.env.QA091_SEED_BAD){s.set('recoveryPlan',JSON.parse(process.env.QA091_SEED_BAD));}
s.close();`;

let serial = 0;
interface Srv { base: string; dir: string; file: string; child: ChildProcess; stop: () => Promise<void>; out: () => string }
async function server(opts: { mode?: 'test' | 'production'; plan?: boolean; bad?: string } = {}): Promise<Srv> {
  const port = PORT0 + (serial++ % 9), dir = path.join(WORK!, 'srv-' + randomUUID().slice(0, 8)); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.planb-key'), JSON.stringify({ kind: 'test', data: randomBytes(32).toString('base64') }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PLANB_|TOKEN|SECRET|API_KEY|NODE_OPTIONS/i.test(k))) as Record<string, string>;
  const seeded = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', SEED], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 90000,
    env: { ...env, NODE_ENV: 'test', QA091_SRC: SRC!, QA091_SEED_DIR: dir, QA091_SEED_MODE: opts.mode ?? 'test', QA091_SEED_PLAN: opts.plan ? '1' : '0', ...(opts.bad ? { QA091_SEED_BAD: opts.bad } : {}) }
  });
  if (seeded.status !== 0) throw new Error('Siembra fallida: ' + seeded.stderr.slice(-500));
  const child = spawn(process.execPath, ['--require', path.join(RUN!, 'scripts', 'block-external.cjs'), path.join(RUN!, 'server.mjs')], {
    cwd: RUN!, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, NODE_ENV: 'test', PLANB_PORT: String(port), PLANB_DATA_DIR: dir }
  });
  let out = ''; child.stdout!.on('data', x => out += x); child.stderr!.on('data', x => out += x);
  let exited = false; child.on('exit', () => { exited = true; });
  const base = 'http://127.0.0.1:' + port, t0 = Date.now();
  for (;;) {
    if (exited) throw new Error('El servidor propio terminó: ' + out.slice(-400));
    try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* arrancando */ }
    if (Date.now() - t0 > 60000) { child.kill(); throw new Error('El servidor propio no arrancó'); }
    await new Promise(r => setTimeout(r, 200));
  }
  return { base, dir, file: path.join(dir, 'planb.sqlite'), child, out: () => out, stop: async () => { if (!exited) { child.kill(); await new Promise(r => setTimeout(r, 300)); } fs.writeFileSync(path.join(dir, 'server.log'), out); } };
}
const sql = (s: Srv, text: string) => { const db = new DatabaseSync(s.file); try { db.exec('PRAGMA busy_timeout=5000'); db.prepare("INSERT INTO meta(key,value) VALUES('recoveryPlan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(text); } finally { db.close(); } };
const planBytes = (s: Srv) => { const db = new DatabaseSync(s.file); try { const r = db.prepare("SELECT hex(value) AS h FROM meta WHERE key='recoveryPlan'").get() as any; return r?.h ?? null; } finally { db.close(); } };
const tableCounts = (s: Srv) => { const db = new DatabaseSync(s.file); try { return ['records', 'changes', 'archives', 'captures'].map(t => (db.prepare('SELECT COUNT(*) AS n FROM ' + t).get() as any).n); } finally { db.close(); } };

async function watch(page: Page, base: string) {
  const errors: string[] = [], outside: string[] = [], writes: string[] = [], gets: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { const u = new URL(r.url()); if (u.origin === base && u.pathname.startsWith('/api/')) { if (r.method() === 'GET') gets.push(u.pathname); else writes.push(r.method() + ' ' + u.pathname); } });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== base) { outside.push(u.origin); return route.abort(); } return route.fallback(); });
  return { errors, outside, writes, gets };
}
async function openChanges(page: Page, base: string) {
  const w = await watch(page, base); await page.goto(base + '/'); await page.getByRole('button', { name: 'Cambios', exact: true }).click();
  const view = page.locator('.changes-page'); await expect(view).toBeVisible(); return { w, view };
}
const quiet = (w: { errors: string[]; outside: string[] }) => { expect(w.errors).toEqual([]); expect(w.outside).toEqual([]); };
const prepare = (view: ReturnType<Page['locator']>) => view.getByRole('button', { name: 'Preparar revisión', exact: true });

test.describe.configure({ mode: 'serial' });
test('E1 arranque con plan sellado e inválido: historial y CSV legibles, mensaje fijo, sin eco, sin escrituras y la base no cambia', async ({ page }) => {
  const s = await server({ bad: BAD_SHAPE });
  try {
    const row = planBytes(s), counts = tableCounts(s), { w, view } = await openChanges(page, s.base);
    await expect(view).toContainText(MESSAGE_START); await expect(view).toContainText('3 operaciones guardadas'); await expect(view.getByRole('region', { name: 'Historial de operaciones' })).toContainText('1–3 de 3 operaciones');
    await expect(prepare(view)).toBeDisabled(); expect(await page.locator('body').innerText()).not.toContain(MARK);
    await expect(view.locator('.return-section input:not([disabled]), .return-section select:not([disabled]), .return-section textarea:not([disabled]), .return-section button:not([disabled])')).toHaveCount(0); // ningún formulario que autorice
    const dto = await page.request.get(s.base + '/api/v2/changes'); const body = await dto.text(); expect(body).not.toContain(MARK); expect(JSON.parse(body).recoveryIntegrity.state).toBe('invalid'); expect(JSON.parse(body).plan).toBeNull();
    const [csv] = await Promise.all([page.waitForEvent('download'), view.getByRole('button', { name: 'CSV', exact: true }).click()]);
    expect(csv.suggestedFilename()).toBe('plan-b-cambios.csv'); let text = ''; for await (const chunk of (await csv.createReadStream())!) text += chunk.toString();
    expect(text.split('\r\n').length).toBe(4); expect(text).toContain('nuria.qa091@example.test'); expect(text).not.toContain(MARK);
    await page.screenshot({ path: path.join(WORK, 'evidence', 'E1-1440.png') });
    expect(w.writes).toEqual([]); expect(planBytes(s)).toBe(row); expect(tableCounts(s)).toEqual(counts); quiet(w);
  } finally { await s.stop(); }
});
test('E2 servidor antiguo sin metadato: historial visible, devolución bloqueada y ni siquiera un clic forzado produce peticiones', async ({ page }) => {
  const s = await server();
  try {
    await page.route('**/api/v2/changes', async route => { const r = await route.fetch(), b = await r.json(); delete b.recoveryIntegrity; await route.fulfill({ response: r, json: b }); });
    const { w, view } = await openChanges(page, s.base);
    await expect(view).toContainText('Devolución bloqueada'); await expect(view).toContainText('no permite comprobar el estado del plan'); await expect(view).toContainText('3 operaciones guardadas'); await expect(prepare(view)).toBeDisabled();
    await prepare(view).dispatchEvent('click'); await page.waitForTimeout(400); expect(w.writes).toEqual([]); quiet(w);
  } finally { await s.stop(); }
});
for (const [name, patch] of [
  ['valid sin plan', (b: any) => { b.recoveryIntegrity = { state: 'valid', code: null, message: null }; b.plan = null; }],
  ['invalid con plan', (b: any) => { b.recoveryIntegrity = { state: 'invalid', code: 'RECOVERY_PLAN_INVALID', message: MESSAGE_START }; b.plan = { id: 'x' }; }],
  ['historia válida con metadatos desconocidos', (b: any) => { b.recoveryIntegrity = { state: 'unknown', code: null, message: null }; }]
] as [string, (b: any) => void][]) {
  test('E3 incoherencia · ' + name + ' → historial conservado, nada de plan, devolución bloqueada, sin peticiones', async ({ page }) => {
    const s = await server();
    try {
      await page.route('**/api/v2/changes', async route => { const r = await route.fetch(), b = await r.json(); patch(b); await route.fulfill({ response: r, json: b }); });
      const { w, view } = await openChanges(page, s.base);
      await expect(view).toContainText('Devolución bloqueada'); await expect(view).toContainText('3 operaciones guardadas'); await expect(view).not.toContainText('Aprobar plan revisado'); await expect(prepare(view)).toBeDisabled();
      await prepare(view).dispatchEvent('click'); await page.waitForTimeout(300); expect(w.writes).toEqual([]); quiet(w);
    } finally { await s.stop(); }
  });
}
test('E4 respuesta SANA antigua retenida (transporte que ignora la cancelación) llega tras una INVÁLIDA real: nunca se reabre la devolución', async ({ page }) => {
  const s = await server({ plan: true });
  try {
    await page.addInitScript(() => {
      const w = window as any; w.__qa = { hold: false, held: [] as (() => void)[], enabledSeen: false }; const orig = w.fetch.bind(w);
      w.fetch = (input: any, init: any = {}) => {
        const url = String(input?.url ?? input);
        if (w.__qa.hold && url.includes('/api/v2/changes')) { const { signal: _ignored, ...rest } = init; const real = orig(input, rest); return new Promise((res, rej) => { w.__qa.held.push(() => real.then(res, rej)); }); }
        return orig(input, init);
      };
    });
    const { w, view } = await openChanges(page, s.base); await expect(prepare(view)).toBeEnabled(); await expect(view).toContainText('Destino simulado');
    await page.evaluate(() => { (window as any).__qa.hold = true; }); await page.waitForFunction(() => (window as any).__qa.held.length >= 1, null, { timeout: 9000 });
    sql(s, BAD_SHAPE); const row = planBytes(s); await page.evaluate(() => { (window as any).__qa.hold = false; });
    await expect(view).toContainText('Devolución bloqueada', { timeout: 9000 }); await expect(prepare(view)).toBeDisabled();
    await page.evaluate(() => {
      const w = window as any; const check = () => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Preparar revisión') as HTMLButtonElement | undefined; if (b && !b.disabled) w.__qa.enabledSeen = true; };
      new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, childList: true }); check(); w.__qa.held.shift()();
    });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => (window as any).__qa.enabledSeen)).toBe(false); await expect(view).toContainText('Devolución bloqueada'); await expect(view).not.toContainText('Aprobar plan revisado');
    expect(w.writes).toEqual([]); expect(planBytes(s)).toBe(row); quiet(w);
  } finally { await s.stop(); }
});
test('E5 manejador React capturado antes del bloqueo y doble clic síncrono, en el DOM real', async ({ page }) => {
  const s = await server({ plan: true });
  try {
    const { w, view } = await openChanges(page, s.base); await expect(prepare(view)).toBeEnabled();
    expect(await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Preparar revisión') as any; const key = Object.keys(b).find(k => k.startsWith('__reactProps$'))!;
      (window as any).__captured = b[key].onClick; return typeof b[key].onClick;
    })).toBe('function');
    sql(s, BAD_SHAPE); await expect(view).toContainText('Devolución bloqueada', { timeout: 9000 });
    await page.evaluate(async () => { await (window as any).__captured(); await (window as any).__captured(); }); await page.waitForTimeout(500);
    expect(w.writes).toEqual([]);
    // Doble acción síncrona sobre un estado sano (control positivo, mismo servidor tras reparar el fixture)
    sql(s, 'null'); await page.getByRole('button', { name: 'Actualizar estado guardado', exact: true }).click(); await expect(prepare(view)).toBeEnabled({ timeout: 9000 });
    await page.route('**/api/v2/return/preview', async route => { await new Promise(r => setTimeout(r, 900)); await route.continue(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Preparar revisión') as HTMLButtonElement; b.click(); b.click(); });
    await expect(view).toContainText('Destino simulado', { timeout: 15000 });
    expect(w.writes.filter(x => x.includes('/api/v2/return/preview'))).toHaveLength(1); expect(w.writes).toHaveLength(1); quiet(w);
  } finally { await s.stop(); }
});
test('E6 aviso de bloqueo: botón de 44 px, alcanzable con teclado, foco retenido tras actualizar, sin desbordamiento a 1440/390/320', async ({ page }) => {
  const s = await server({ bad: BAD_SHAPE });
  try {
    const { w, view } = await openChanges(page, s.base); const refresh = view.getByRole('button', { name: 'Actualizar estado guardado', exact: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await refresh.scrollIntoViewIfNeeded(); const box = (await refresh.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5); expect(box.width).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: path.join(WORK, 'evidence', 'E6-' + width + '.png'), fullPage: false });
    }
    await page.setViewportSize({ width: 390, height: 900 }); await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let reached = false; for (let i = 0; i < 60 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.textContent === 'Actualizar estado guardado'); }
    expect(reached).toBe(true); const before = w.gets.filter(x => x === '/api/v2/changes').length;
    await page.keyboard.press('Enter'); await expect.poll(() => w.gets.filter(x => x === '/api/v2/changes').length, { timeout: 6000 }).toBeGreaterThan(before);
    await expect(refresh).toBeFocused(); expect(w.writes).toEqual([]); quiet(w);
  } finally { await s.stop(); }
});
test('E7 acuse manual ya confirmado y GET local fallido: se conserva el acuse, se reintenta solo la lectura y el POST remoto no se repite', async ({ page }) => {
  const s = await server({ mode: 'production' });
  try {
    let failGets = false, verifyCalls = 0;
    await page.route('**/api/v2/changes', async route => { if (failGets) return route.fulfill({ status: 500, json: { error: 'GET local caído (simulado)' } }); return route.fallback(); });
    await page.route('**/api/v3/manual-recovery/verify', async route => {
      verifyCalls++; const sent = route.request().postDataJSON(); const dto = await (await page.request.get(s.base + '/api/v2/changes')).json();
      const pending = dto.changes.filter((c: any) => c.id > dto.watermark), unique = [...new Map(pending.map((c: any) => [JSON.stringify([c.entity, c.recordId]), c])).values()] as any[];
      failGets = true; // el GET posterior a la confirmación falla
      await route.fulfill({ json: { passed: true, checks: unique.map(c => ({ entity: c.entity, localId: c.recordId, passed: true, reason: 'Valores y relaciones confirmados por lectura (simulado).' })),
        report: { id: 'qa091-report', method: 'manual_verified', revision: sent.revision, sessionId: 'qa091', captureId: 'qa091', watermark: Math.max(...pending.map((c: any) => c.id)), verifiedAt: new Date().toISOString(), records: unique.length } } });
    });
    const { w, view } = await openChanges(page, s.base); const section = view.locator('.manual-recovery');
    await expect(section).toContainText('Recuperación manual verificada');
    await section.locator('input[inputmode="numeric"]').first().fill('5001'); await section.getByRole('checkbox').check();
    await section.getByRole('button', { name: 'Comprobar resultado en HubSpot', exact: true }).click();
    await expect(section).toContainText('El servidor confirmó la comprobación de esta revisión'); await expect(section).toContainText('no se pudo actualizar el estado local');
    const retry = section.getByRole('button', { name: 'Reintentar actualización local', exact: true });
    await retry.click(); await expect(section).toContainText('El servidor confirmó la comprobación de esta revisión'); await expect(section).toContainText('no se pudo actualizar el estado local');
    failGets = false; await retry.click(); await expect(section).not.toContainText('no se pudo actualizar el estado local', { timeout: 9000 });
    await expect(section).toContainText('El servidor confirmó la comprobación'); expect(verifyCalls).toBe(1); expect(w.writes.filter(x => x.includes('manual-recovery'))).toHaveLength(1); quiet(w);
  } finally { await s.stop(); }
});
test('E8 control positivo de extremo a extremo: reparar el fixture y actualizar reabre la devolución y una vista previa simulada produce un plan válido', async ({ page }) => {
  const s = await server({ bad: BAD_SHAPE });
  try {
    const { w, view } = await openChanges(page, s.base); await expect(view).toContainText(MESSAGE_START); await expect(prepare(view)).toBeDisabled();
    sql(s, 'null'); await view.getByRole('button', { name: 'Actualizar estado guardado', exact: true }).click();
    await expect(prepare(view)).toBeEnabled({ timeout: 9000 }); await expect(view).not.toContainText('Devolución bloqueada');
    await prepare(view).click(); await expect(view).toContainText('Destino simulado'); await expect(view).toContainText('Pendiente de revisión');
    expect(w.writes).toEqual(['POST /api/v2/return/preview']); const raw = planBytes(s); expect(raw).not.toBeNull(); quiet(w);
    await page.screenshot({ path: path.join(WORK, 'evidence', 'E8-1440.png') });
  } finally { await s.stop(); }
});
