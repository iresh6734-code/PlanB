import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBaseApp } from '../../server/app.js';
import { registerContinuityEvidenceApi } from '../../server/continuity-evidence-api.js';
import { registerHubspotReadCheckApi, storeReadCheckEvidence, type ReadCheckConfig } from '../../server/hubspot-read-check-api.js';
import { registerRelayRehearsalApi, storeRelayRecord } from '../../server/relay-rehearsal-api.js';
import { createRelayExecutor } from '../../server/relay-rehearsal-executor.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import type { RehearsalResultLike } from '../../shared/relay-rehearsal.js';

// EXTREMO A EXTREMO (unidad 217, R2): el ContinuityHub REAL en Chromium contra createBaseApp REAL con las TRES APIs registradas como las registraría Codex (evidencia de continuidad, lectura HubSpot 212
// y ensayo de relevo 216 con RunLease/224), un proveedor FICTICIO de loopback para HubSpot y el Kit real (una prueba, con el ejecutor 224 desde un código desplegado) o un ejecutor simulado/retenido (el resto,
// para inyectar errores). Es un arnés: NO es la App ni su montaje. «Abrir Integraciones» NAVEGA (se cuenta en `__nav`); la comprobación de lectura se hace desde «otra superficie» (la API directa), como haría el panel de Integraciones.
const repo = process.cwd(), root = path.resolve(process.env.PLANB_HUB217_ROOT ?? path.join(repo, 'tests', '.tmp', 'hub217-' + randomUUID().slice(0, 8)));
const TOKEN = 'pat-ficticio-9876543210-secreto', PORTAL = '12345', PASSWORD = 'contraseña-ficticia-217', OTHER_CAPTURE = 'capture:' + 'b'.repeat(64);
const p = (f: string) => JSON.stringify(path.join(repo, f).replace(/\\/g, '/'));
const ENTRY = `import { createRoot } from 'react-dom/client';
import { ContinuityHub } from ${p('src/ContinuityHub.tsx')};
import ${p('src/styles.css')}; import ${p('src/design-system.css')}; import ${p('src/planb-ui.css')};
const w = window as any; w.__nav = []; w.__skew = 0;
const base = { navigate: Object.fromEntries(['open-preparation', 'open-integrations', 'open-today', 'open-export', 'open-continuity'].map(a => [a, () => w.__nav.push(a)])), now: () => Date.now() + w.__skew };
const rootNode = createRoot(document.getElementById('root')!);
w.__render = (props: any) => rootNode.render(<main style={{ padding: 16, maxWidth: 960 }}><ContinuityHub {...base} {...props} /></main>);
w.__render(JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')));
`;
/** Un transporte que IGNORA AbortSignal: la petición real sigue y su respuesta solo se entrega al «liberar». Retiene una vez la primera petición que coincida con el patrón. */
const HOLD = `(() => { const real = window.fetch.bind(window); const w = window; w.__held = []; w.__hold = null;
  w.fetch = (input, init) => { const url = String(typeof input === 'string' ? input : input.url), method = (init && init.method) || 'GET';
    if (w.__hold && new RegExp(w.__hold).test(method + ' ' + url)) { w.__hold = null; const rest = Object.assign({}, init || {}); delete rest.signal; return real(input, rest).then(res => new Promise(resolve => { w.__held.push(() => resolve(res)); })); }
    return real(input, init); };
  w.__release = () => { const next = w.__held.shift(); if (next) next(); return !!next; }; })();`;
const GOOD: RehearsalResultLike = { ok: true, wrongIdRejected: true, createCalls: 1, duplicates: 0, records: 63, finalStage: 'return-verified', capsule: { bytes: 100063, sha256: 'a'.repeat(64) }, ms: { export: 93, import: 1231 } };
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const json = (body: unknown, code = 200): Handler => (_q, r) => { r.statusCode = code; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(body)); };
const ID = '/account-info/2026-09/details', O = (e: string) => '/crm/objects/2026-09/' + e, OBJECTS = ['contacts', 'companies', 'deals', 'tasks'];
const healthy = (over: Record<string, Handler> = {}) => ({ [ID]: json({ portalId: Number(PORTAL), accountType: 'SANDBOX' }), ...Object.fromEntries(OBJECTS.map(e => [O(e), over[O(e)] ?? json({ results: [{ id: '1' }] })])) }) as Record<string, Handler | undefined>;
async function provider(routes: Record<string, Handler | undefined>) {
  const seen: { method: string; path: string }[] = [], sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => { seen.push({ method: req.method!, path: new URL(req.url!, 'http://x').pathname }); (routes[new URL(req.url!, 'http://x').pathname] ?? routes['*'] ?? ((_q, r) => { r.statusCode = 404; r.end('{}'); }))(req, res); });
  server.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok)); const port = (server.address() as AddressInfo).port;
  return { seen, fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(String(input).replace('https://api.hubapi.com', 'http://127.0.0.1:' + port), init)) as typeof fetch, stop: () => new Promise<void>(ok => { for (const s of sockets) s.destroy(); server.close(() => ok()); }) };
}
/** Código «desplegado» para el Kit real: server/, shared/, cuatro scripts, package.json y un enlace a node_modules; SIN el árbol de pruebas. */
function deployKit(target: string) {
  fs.mkdirSync(target, { recursive: true });
  for (const dir of ['server', 'shared']) fs.cpSync(path.join(repo, dir), path.join(target, dir), { recursive: true, filter: source => !/[\\/]server[\\/]team$/.test(source) });
  fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
  for (const file of ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs']) fs.cpSync(path.join(repo, 'scripts', file), path.join(target, 'scripts', file));
  fs.cpSync(path.join(repo, 'package.json'), path.join(target, 'package.json')); fs.symlinkSync(path.join(repo, 'node_modules'), path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}
test.beforeAll(async () => {
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'entry.tsx'), ENTRY);
  await build({ entryPoints: [path.join(root, 'entry.tsx')], bundle: true, outdir: path.join(root, 'out'), format: 'iife', jsx: 'automatic', logLevel: 'error', loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
});
test.afterAll(() => { try { fs.rmSync(path.join(root, 'kit', 'node_modules'), { force: true }); } catch { /* sin Kit */ } });
interface Gate { release: () => void }
interface Rig {
  base: string; seen: { method: string; path: string }[]; relayRuns: () => number; relayFinished: () => number; savedRelay: () => unknown; gate: Gate; provider: Awaited<ReturnType<typeof provider>>;
  unlock: (page: Page) => Promise<void>; login: (page: Page) => Promise<void>; lock: (page: Page) => Promise<void>; readCheck: (page: Page) => Promise<unknown>; evidenceContext: (page: Page) => Promise<string>; close: () => Promise<void>;
}
const live: Rig[] = [];
async function start(options: { routes?: Record<string, Handler | undefined>; relay?: 'quick' | 'gated' | 'kit' } = {}): Promise<Rig> {
  const prov = await provider(options.routes ?? healthy()), { app, store, security } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  const snapshot = makeFixture('agency'); snapshot.capturedAt = new Date(Date.now() - 45 * 60_000).toISOString(); store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
  const config: ReadCheckConfig = { token: TOKEN, accountId: PORTAL, mode: 'test' }; let runs = 0, finished = 0, open: () => void = () => undefined;
  const gate: Gate = { release: () => open() };
  registerContinuityEvidenceApi(app, store);
  registerHubspotReadCheckApi(app, { captureAuthorization: security.captureAuthorization, config: () => config, evidence: storeReadCheckEvidence(store), fetch: prov.fetch, timeoutMs: 3000 });
  const mode = options.relay ?? 'quick';
  let run: (context: { signal: AbortSignal }) => Promise<RehearsalResultLike>;
  if (mode === 'kit') { const code = path.join(root, 'kit'); if (!fs.existsSync(code)) deployKit(code); run = createRelayExecutor({ installRoot: path.join(root, 'install-' + randomUUID().slice(0, 6)), appRoot: code }).run; }
  else run = async () => {   // ejecutor simulado: «gated» espera la barrera y IGNORA la señal (el trabajo físico sigue aunque se cancele); «quick» tarda 400 ms
    runs++;
    if (mode === 'gated') await new Promise<void>(resolve => { open = resolve; }); else await new Promise(r => setTimeout(r, 400));
    finished++; return GOOD;
  };
  registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run, timeoutMs: 100_000 });
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hub</title><link rel="stylesheet" href="/out/entry.css"></head><body><div id="root"></div><script src="/out/entry.js"></script></body></html>';
  app.get('/', async (_q, reply) => reply.type('text/html; charset=utf-8').send(html));
  app.get('/out/:file', async (request, reply) => { const file = String((request.params as { file: string }).file); if (!/^[\w.-]+$/.test(file) || !fs.existsSync(path.join(root, 'out', file))) return reply.code(404).send(''); return reply.type(file.endsWith('.css') ? 'text/css' : 'text/javascript').send(fs.readFileSync(path.join(root, 'out', file))); });
  await app.listen({ host: '127.0.0.1', port: 0 }); const base = 'http://127.0.0.1:' + (app.server.address() as AddressInfo).port, origin = { origin: base };
  const rig: Rig = {
    base, seen: prov.seen, relayRuns: () => runs, relayFinished: () => finished, savedRelay: () => storeRelayRecord(store).load(), gate, provider: prov,
    unlock: async page => { const reply = await page.request.post(base + '/api/v2/auth/setup', { data: { password: PASSWORD }, headers: origin }); expect(reply.ok()).toBe(true); },
    login: async page => { expect((await page.request.post(base + '/api/v2/auth/login', { data: { password: PASSWORD }, headers: origin })).ok()).toBe(true); },
    lock: async page => { expect((await page.request.post(base + '/api/v2/auth/lock', { data: {}, headers: origin })).ok()).toBe(true); },
    readCheck: async page => (await page.request.post(base + '/api/v2/connection/read-check', { data: { portalId: PORTAL, authorizedReads: 5 }, headers: origin })).json(),
    evidenceContext: async page => ((await (await page.request.get(base + '/api/v7/continuity/evidence')).json()) as { context: { captureId: string } }).context.captureId,
    close: async () => { open(); await app.close(); await prov.stop(); },
  };
  live.push(rig); return rig;
}
test.afterEach(async () => { await Promise.all(live.splice(0).map(r => r.close())); });
const hub = (page: Page) => page.locator('.cph'), passport = (page: Page) => page.locator('.cpp'), impact = (page: Page) => page.locator('.imp'), message = (page: Page) => page.getByTestId('hub-message');
const src = (page: Page, key: string) => page.locator('.cph-sources [data-source="' + key + '"]');
async function open(page: Page, rig: Rig, props: Record<string, unknown> = {}, size = { width: 1440, height: 900 }) {
  await page.addInitScript(HOLD); await page.setViewportSize(size); await page.route('**/*', route => new URL(route.request().url()).origin === rig.base ? route.fallback() : route.abort());
  await rig.unlock(page); await page.goto(rig.base + '/#' + encodeURIComponent(JSON.stringify(props)));
  await expect(page.getByRole('heading', { name: 'Continuidad: evidencia y ensayo', level: 2 })).toBeVisible(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 }); await expect(passport(page)).toBeVisible();
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = async (page: Page, name: string, ti: { attach: (n: string, o: { path: string; contentType: string }) => Promise<void> }) => { const f = path.join(root, name + '.png'); await page.screenshot({ path: f }); await ti.attach(name, { path: f, contentType: 'image/png' }); };
const openMore = async (page: Page, summary: string) => { const details = impact(page).locator('details', { has: page.locator('summary', { hasText: summary }) }).first(); if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click(); };
/** La fila del ensayo está entre lo «sin comprobar» (plegado): se despliega y se pulsa su acción. */
const rehearsalButton = async (page: Page) => { await openMore(page, 'Sin comprobar'); return impact(page).locator('[data-row="recovery:rehearsal"]').getByRole('button', { name: 'Ensayar un relevo' }); };
const nextStepButton = (page: Page, name: string) => passport(page).locator('.cpp-next').getByRole('button', { name });
const count = (page: Page, pattern: RegExp) => { const urls: string[] = []; page.on('request', request => { if (pattern.test(request.method() + ' ' + new URL(request.url()).pathname)) urls.push(request.method() + ' ' + new URL(request.url()).pathname); }); return urls; };

test('PORTABLE: lee y refresca la copia sin consultar ni ofrecer conexiones o ensayos', async ({ page }) => {
  const rig = await start();
  const optional = count(page, /\/api\/v2\/(connection\/read-check|relay\/rehearsal)$/);
  const evidence = count(page, /GET \/api\/v7\/continuity\/evidence$/);
  await open(page, rig, { portable: true });
  await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read');
  for (const key of ['hubspot', 'relay']) {
    await expect(src(page, key)).toContainText('No incluida en el paquete portable');
  }
  await expect(hub(page).getByRole('button', { name: /Abrir Integraciones|Ensayar un relevo/i, includeHidden: true })).toHaveCount(0);
  expect(evidence).toHaveLength(1);
  await hub(page).getByRole('button', { name: 'Leer el estado guardado' }).click();
  await expect(hub(page)).toHaveAttribute('aria-busy', 'false');
  await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read');
  expect(evidence).toHaveLength(2);
  expect(optional).toEqual([]);
  expect(rig.relayRuns()).toBe(0);
});
const hold = (page: Page, pattern: string) => page.evaluate(value => { (window as unknown as { __hold: string }).__hold = value; }, pattern);
const release = (page: Page) => page.evaluate(() => (window as unknown as { __release: () => boolean }).__release());
const render = (page: Page, props: Record<string, unknown>) => page.evaluate(value => (window as unknown as { __render: (p: unknown) => void }).__render(value), props);

test('ABRIR y RECARGAR = cero tráfico hacia el proveedor; las tres fuentes se leen por GET; «Abrir Integraciones» NAVEGA (sin consentimiento propio ni tráfico) y el pasaporte dice que la lectura guardada no está comprobada', async ({ page }, ti) => {
  const rig = await start(); await open(page, rig);
  for (const key of ['copy', 'hubspot', 'relay']) await expect(src(page, key)).toHaveAttribute('data-state', 'read');
  await expect(passport(page).locator('[data-section="read"]')).toContainText('no prueba que dé acceso hoy'); await expect(passport(page).locator('[data-section="copy"] .cpp-claim').first()).toHaveAttribute('data-basis', 'observed'); await expect(impact(page)).toBeVisible();
  await page.reload(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 }); await page.reload(); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await nextStepButton(page, 'Abrir Integraciones').click(); expect(await page.evaluate(() => (window as unknown as { __nav: string[] }).__nav)).toEqual(['open-integrations']);
  await expect(page.getByTestId('confirm-read')).toHaveCount(0); await expect(page.getByRole('button', { name: /Confirmar y comprobar/ })).toHaveCount(0);
  expect(rig.seen).toEqual([]); expect(await overflow(page)).toBe(true); await shot(page, 'hub-1440', ti);
});

test('PUBLICACIÓN PARCIAL: con la tercera fuente RETENIDA, copia y lectura ya se muestran y sus acciones se pueden usar; no hay exportación incompleta; al soltarla se completa', async ({ page }, ti) => {
  const rig = await start(); await page.addInitScript(HOLD); await page.setViewportSize({ width: 1440, height: 900 }); await page.route('**/*', route => new URL(route.request().url()).origin === rig.base ? route.fallback() : route.abort());
  await rig.unlock(page); await page.goto(rig.base + '/#' + encodeURIComponent('{}')); await hold(page, 'GET /api/v2/relay/rehearsal'); await render(page, { sessionKey: 'parcial' });
  await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read', { timeout: 15_000 }); await expect(src(page, 'hubspot')).toHaveAttribute('data-state', 'read'); await expect(src(page, 'relay')).toHaveAttribute('data-state', 'loading');
  await expect(hub(page)).toHaveAttribute('data-partial', 'true'); await expect(hub(page)).toHaveAttribute('aria-busy', 'true');
  await expect(passport(page).locator('[data-section="copy"] .cpp-claim').first()).toHaveAttribute('data-basis', 'observed'); await expect(passport(page).locator('[data-section="read"]')).toContainText('credencial guardada');
  await expect(passport(page).locator('[data-section="rehearsal"]')).toHaveCount(0, { timeout: 2000 }); await expect(impact(page).locator('[data-testid="shift-summary"]')).toContainText('Leyendo: último ensayo de relevo');
  await expect(impact(page).locator('[data-row="recovery:rehearsal"]')).toHaveCount(0); await expect(page.locator('.cph .cpp-prov')).toBeHidden(); await expect(page.locator('.cph .imp-export')).toBeHidden();
  await openMore(page, 'Sin comprobar'); await impact(page).locator('[data-row="access:hubspot"]').getByRole('button', { name: 'Abrir Integraciones' }).click(); expect(await page.evaluate(() => (window as unknown as { __nav: string[] }).__nav)).toEqual(['open-integrations']);   // la acción de lo ya leído funciona
  await shot(page, 'hub-parcial', ti);
  expect(await release(page)).toBe(true); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 }); await expect(hub(page)).toHaveAttribute('data-partial', 'false'); await expect(src(page, 'relay')).toHaveAttribute('data-state', 'read'); await expect(passport(page).locator('[data-section="rehearsal"]')).toBeVisible(); expect(rig.seen).toEqual([]);
});

test('FUENTE FALLIDA y FUENTE BLOQUEADA se distinguen de cargar y de ausencia: el ensayo guardado falla (500) y lo demás sigue mostrándose; nunca cero ni éxito', async ({ page }) => {
  const rig = await start(); await page.route('**/api/v2/relay/rehearsal', route => route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }) : route.fallback());
  await open(page, rig); await expect(src(page, 'relay')).toHaveAttribute('data-state', 'unavailable'); await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read');
  await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('No se pudo leer el resultado del último ensayo'); await expect(passport(page).locator('[data-section="copy"] .cpp-claim').first()).toHaveAttribute('data-basis', 'observed'); expect(rig.seen).toEqual([]);
});

test('401 DESPUÉS DE MOSTRAR DATOS: al bloquear y releer, las tres fuentes quedan «bloqueadas», los datos anteriores desaparecen y no hay tráfico de proveedor', async ({ page }) => {
  const rig = await start(); await open(page, rig); await expect(passport(page).locator('[data-section="copy"]')).toContainText('Copia local capturada');
  await rig.lock(page); await page.getByRole('button', { name: 'Leer el estado guardado' }).click();
  for (const key of ['copy', 'hubspot', 'relay']) await expect(src(page, key)).toHaveAttribute('data-state', 'locked', { timeout: 15_000 });
  await expect(passport(page).locator('[data-section="copy"]')).not.toContainText('Copia local capturada'); await expect(passport(page).locator('[data-section="copy"]')).toContainText('No se pudo leer la evidencia de la copia local'); expect(rig.seen).toEqual([]);
});

test('IDENTIDAD DEL ANFITRIÓN: la evidencia de la captura A no se acredita cuando el anfitrión declara la captura B (con A ya visible y con la lectura de A retenida); una identidad ausente no se rellena', async ({ page }) => {
  const rig = await start(); await page.addInitScript(HOLD); await page.setViewportSize({ width: 1440, height: 900 }); await page.route('**/*', route => new URL(route.request().url()).origin === rig.base ? route.fallback() : route.abort()); await rig.unlock(page);
  const captureA = await rig.evidenceContext(page); await page.goto(rig.base + '/#' + encodeURIComponent(JSON.stringify({ context: captureA }))); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await expect(passport(page).locator('[data-section="copy"]')).toContainText('Copia local capturada'); await expect(page.getByTestId('hub-context')).toHaveCount(0);                                  // A declarada = A leída: se acredita
  await render(page, { context: OTHER_CAPTURE });                                                                                                                                             // A ya visible; el anfitrión pasa a B
  await expect(page.getByTestId('hub-context')).toBeVisible({ timeout: 15_000 }); await expect(passport(page).locator('[data-section="copy"]')).not.toContainText('Copia local capturada'); await expect(impact(page).locator('[data-row="age:copy"]')).toHaveCount(0);
  await openMore(page, 'Sin comprobar'); await expect(impact(page).locator('[data-row="other-context:copy"]')).toContainText('otra captura');
  // lectura de A RETENIDA: la respuesta tardía de A llega cuando el anfitrión ya es B y no se publica
  await render(page, { context: captureA }); await expect(hub(page)).toHaveAttribute('aria-busy', 'false', { timeout: 15_000 });
  await hold(page, 'GET /api/v7/continuity/evidence'); await render(page, { context: captureA, sessionKey: 1 }); await render(page, { context: OTHER_CAPTURE, sessionKey: 1 });
  await expect(page.getByTestId('hub-context')).toBeVisible({ timeout: 15_000 }); expect(await release(page)).toBe(true);
  await page.waitForTimeout(400); await expect(passport(page).locator('[data-section="copy"]')).not.toContainText('Copia local capturada'); await expect(page.getByTestId('hub-context')).toBeVisible();
  await render(page, {}); await expect(passport(page).locator('[data-section="copy"]')).toContainText('Copia local capturada', { timeout: 15_000 }); await expect(page.getByTestId('hub-context')).toHaveCount(0);   // sin declaración del anfitrión: se confía en la respuesta (documentado)
  expect(rig.seen).toEqual([]);
});

test('RESPUESTA TARDÍA con transporte que IGNORA AbortSignal: al cambiar la sesión se descarta y no sobrescribe la lectura nueva (la tardía no tenía comprobación; la nueva sí)', async ({ page }) => {
  const rig = await start(); await open(page, rig);
  await hold(page, 'GET /api/v2/connection/read-check'); await render(page, { sessionKey: 'a' });                                       // consulta A: su lectura de HubSpot queda retenida (sin comprobación guardada)
  await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read', { timeout: 15_000 });
  await rig.readCheck(page);                                                                                                                         // otra superficie comprueba la lectura (5 GET al proveedor ficticio)
  await render(page, { sessionKey: 'b' });                                                                                                           // cambia la sesión: consulta B lee la comprobación ya guardada
  await expect(passport(page).locator('[data-section="read"]')).toContainText('Lectura comprobada', { timeout: 15_000 });
  expect(await release(page)).toBe(true); await page.waitForTimeout(500);                                                                               // llega la respuesta antigua (sin comprobación)
  await expect(passport(page).locator('[data-section="read"]')).toContainText('Lectura comprobada'); await expect(passport(page).locator('[data-section="read"]')).not.toContainText('La lectura no se ha comprobado'); expect(rig.seen).toHaveLength(5);
});

test('CADUCIDAD CON LA PÁGINA ABIERTA: la lectura comprobada pasa a «caducada» al avanzar el reloj local, al recuperar el foco, sin NINGUNA petición nueva; el resultado antiguo conserva fecha y alcance', async ({ page }, ti) => {
  const rig = await start(); await open(page, rig); const hubspotRequests = count(page, /\/api\/v2\/connection\/read-check/);
  await rig.readCheck(page); expect(rig.seen).toHaveLength(5); await page.getByRole('button', { name: 'Leer el estado guardado' }).click();
  await expect(passport(page).locator('[data-section="read"]')).toContainText('Lectura comprobada de clientes, empresas, oportunidades, tareas', { timeout: 15_000 }); await expect(passport(page).locator('[data-section="read"] .cpp-chip-expired')).toHaveCount(0); await expect(impact(page).locator('[data-row="access:hubspot"]')).toHaveAttribute('data-status', 'ok');
  hubspotRequests.length = 0; const allRequests = count(page, /\/api\//);
  await page.evaluate(() => { (window as unknown as { __skew: number }).__skew = 16 * 60_000; window.dispatchEvent(new Event('focus')); });
  await expect(passport(page).locator('[data-section="read"] .cpp-chip-expired').first()).toBeVisible({ timeout: 5000 }); await expect(passport(page).locator('[data-section="read"]')).toContainText('caducó'); await expect(passport(page).locator('[data-section="read"]')).toContainText('Comprobado el');
  await expect(impact(page).locator('[data-row="access:hubspot"]')).toHaveAttribute('data-status', 'attention'); await expect(impact(page).locator('[data-row="access:hubspot"]').getByRole('button', { name: 'Abrir Integraciones' })).toBeVisible();
  expect(allRequests).toEqual([]); expect(hubspotRequests).toEqual([]); expect(rig.seen).toHaveLength(5); await shot(page, 'hub-caducada', ti);
});

test('ENSAYAR UN RELEVO (ejecutor simulado): confirmación explícita con alcance de ficción; cancelar el consentimiento no ejecuta; un solo ensayo aunque se haga doble clic; el pasaporte y el mapa lo muestran con su alcance PROPIO (ficticio) y sin acreditar la copia activa', async ({ page }, ti) => {
  const rig = await start(); await open(page, rig);
  await (await rehearsalButton(page)).click(); const confirm = page.getByTestId('confirm-relay');
  await expect(confirm).toContainText('datos ficticios'); await expect(confirm).toContainText('No exporta tu copia activa'); await expect(confirm).toContainText('ni prueba otro ordenador'); await expect(confirm.getByRole('heading')).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click(); expect(rig.relayRuns()).toBe(0);
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).dblclick();
  await expect(message(page)).toContainText('Ensayo completado con datos ficticios', { timeout: 20_000 }); expect(rig.relayRuns()).toBe(1);
  await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('Ensayo de relevo'); await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('mismo equipo · datos ficticios · destino nuevo');
  await openMore(page, 'Sin incidencia'); await expect(impact(page).locator('[data-row="recovery:practice"]')).toContainText('no acredita la recuperación de la copia activa'); await expect(impact(page).locator('[data-row="recovery:rehearsal"]')).toHaveCount(0); await expect(impact(page).locator('[data-row="other-context:relay"]')).toHaveCount(0);
  expect(rig.seen).toEqual([]); await shot(page, 'hub-relevo-1440', ti);
});

test('CANCELACIÓN VISIBLE: solicitud → resultado descartado → fin físico; mientras el ejecutor sigue vivo no se admite otro ensayo (UI y servidor); al terminar de verdad se vuelve a poder', async ({ page }) => {
  const rig = await start({ relay: 'gated' }); await open(page, rig); const posts = count(page, /^POST \/api\/v2\/relay\/rehearsal/);
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(page.getByTestId('relay-live')).toBeVisible({ timeout: 10_000 }); expect(rig.relayRuns()).toBe(1);
  await page.getByTestId('relay-live').getByRole('button', { name: 'Cancelar el ensayo' }).click();                                  // solicitud
  await expect(page.getByTestId('relay-stopping')).toContainText('Se pidió detener el ensayo (cancelación)', { timeout: 10_000 }); await expect(message(page)).toContainText('resultado de ese ensayo se descartó', { timeout: 10_000 });   // resultado descartado (409 CANCELLED)
  expect(rig.savedRelay()).toBeNull(); await openMore(page, 'Sin comprobar'); await impact(page).locator('[data-row="recovery:rehearsal"]').getByRole('button', { name: 'Ensayar un relevo' }).click();
  await expect(message(page)).toContainText('todavía se está deteniendo'); await expect(page.getByTestId('confirm-relay')).toHaveCount(0);                                         // UI: no ofrece otro
  const direct = await page.request.post(rig.base + '/api/v2/relay/rehearsal', { data: { fiction: true }, headers: { origin: rig.base } }); expect(direct.status()).toBe(409); expect(rig.relayRuns()).toBe(1);   // servidor: STOPPING, sin segundo ejecutor
  rig.gate.release();                                                                                                                      // fin físico
  await expect(page.getByTestId('relay-stopping')).toHaveCount(0, { timeout: 15_000 }); expect(rig.savedRelay()).toBeNull(); expect(rig.relayFinished()).toBe(1); expect(posts.length).toBeGreaterThanOrEqual(1);
  await (await rehearsalButton(page)).click(); await expect(page.getByTestId('confirm-relay')).toBeVisible();
});

test('PÉRDIDA DE RESPUESTA tras guardarse el ensayo: no dice «no se cambió nada», consulta el estado guardado (sin otro POST) y lo muestra sin adjudicarlo a la acción', async ({ page }) => {
  const rig = await start(); await open(page, rig); const posts = count(page, /^POST \/api\/v2\/relay\/rehearsal/);
  await page.route('**/api/v2/relay/rehearsal', async route => { if (route.request().method() !== 'POST') return route.fallback(); await route.fetch(); await route.abort('failed'); });   // el servidor responde y guarda; se pierde SOLO la respuesta
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(message(page)).toContainText('No se recibió una respuesta utilizable del ensayo', { timeout: 20_000 }); await expect(message(page)).toContainText('Estado guardado ahora:'); await expect(message(page)).toContainText('último ensayo'); await expect(message(page)).toContainText('No se atribuye a la acción');
  await expect(message(page)).not.toContainText('No se cambió nada'); await expect(message(page)).not.toContainText('No se ensayó nada');
  expect(rig.relayRuns()).toBe(1); expect(posts).toHaveLength(1); expect((rig.savedRelay() as { outcome: string }).outcome).toBe('completed'); await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('completado');
});

test('PÉRDIDA DE RESPUESTA con el ejecutor aún vivo: no se ofrece otro ensayo hasta saber el estado; el aviso dice que hay uno en curso', async ({ page }) => {
  const rig = await start({ relay: 'gated' }); await open(page, rig);
  await page.route('**/api/v2/relay/rehearsal', async route => { if (route.request().method() !== 'POST') return route.fallback(); const pending = route.fetch().catch(() => undefined); await new Promise(r => setTimeout(r, 400)); await route.abort('failed'); await pending; });   // el servidor ya arrancó el ejecutor; el cliente pierde la respuesta
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(message(page)).toContainText('No se recibió una respuesta utilizable del ensayo', { timeout: 20_000 });
  await expect(page.getByTestId('relay-live')).toBeVisible({ timeout: 10_000 }); await expect(message(page)).toContainText('hay un ensayo en curso');
  await impact(page).locator('[data-row="recovery:rehearsal"]').getByRole('button', { name: 'Ensayar un relevo' }).click(); await expect(message(page)).toContainText('Ya hay un ensayo en curso'); await expect(page.getByTestId('confirm-relay')).toHaveCount(0);
  rig.gate.release();
});

test('BLOQUEO DURANTE EL ENSAYO: el aviso no afirma que no se ensayó nada, se retira lo leído y no se guarda ningún resultado; tras desbloquear y releer se ve el estado guardado', async ({ page }) => {
  const rig = await start(); await open(page, rig);
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click(); await page.waitForTimeout(150); await rig.lock(page);
  await expect(message(page)).toContainText('Plan B se bloqueó durante el ensayo', { timeout: 20_000 }); await expect(message(page)).not.toContainText('No se ensayó nada'); await expect(message(page)).toContainText('pudo haber empezado');
  for (const key of ['copy', 'hubspot', 'relay']) await expect(src(page, key)).toHaveAttribute('data-state', 'locked', { timeout: 15_000 });
  expect(rig.relayRuns()).toBe(1); expect(rig.savedRelay()).toBeNull(); await expect(passport(page).locator('[data-section="copy"]')).not.toContainText('Copia local capturada');
  await rig.login(page); await page.getByRole('button', { name: 'Leer el estado guardado' }).click(); await expect(src(page, 'copy')).toHaveAttribute('data-state', 'read', { timeout: 15_000 }); await expect(passport(page).locator('[data-section="copy"]')).toContainText('Copia local capturada');
});

test('KIT REAL (ejecutor 224 desde un código desplegado sin árbol de pruebas): el ensayo completo se hace desde el hub y queda en el pasaporte como observado, completado y de mismo equipo', async ({ page }) => {
  test.setTimeout(240_000); const rig = await start({ relay: 'kit' }); await open(page, rig);
  await (await rehearsalButton(page)).click(); await page.getByTestId('confirm-relay').getByRole('button', { name: 'Confirmar y ensayar' }).click();
  await expect(message(page)).toContainText('Ensayo completado con datos ficticios', { timeout: 150_000 });
  await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('completado'); await expect(passport(page).locator('[data-section="rehearsal"]')).toContainText('se concilió una sola operación sin duplicar'); expect(rig.seen).toEqual([]);
});

for (const width of [390, 320]) test('MÓVIL ' + width + ' px: hub, fuentes, confirmación y resultado caben en pantalla (sin desbordamiento), controles ≥ 44 px y teclado', async ({ page }, ti) => {
  const rig = await start(); await open(page, rig, {}, { width, height: 900 }); expect(await overflow(page)).toBe(true);
  await openMore(page, 'Sin comprobar'); const button = impact(page).locator('[data-row="recovery:rehearsal"]').getByRole('button', { name: 'Ensayar un relevo' }); await button.focus(); await page.keyboard.press('Enter');
  const confirm = page.getByTestId('confirm-relay'); await expect(confirm).toBeVisible(); await expect(confirm.getByRole('heading')).toBeFocused();
  const ok = confirm.getByRole('button', { name: 'Confirmar y ensayar' }); expect((await ok.boundingBox())!.height).toBeGreaterThanOrEqual(43); expect(await overflow(page)).toBe(true); await shot(page, 'hub-confirm-' + width, ti);
  await ok.focus(); await page.keyboard.press('Enter'); await expect(message(page)).toContainText('Ensayo completado', { timeout: 20_000 }); expect(rig.relayRuns()).toBe(1); expect(await overflow(page)).toBe(true);
  const reread = page.getByRole('button', { name: 'Leer el estado guardado' }); expect((await reread.boundingBox())!.height).toBeGreaterThanOrEqual(43);
});
