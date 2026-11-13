import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { build as bundle } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBaseApp } from '../../server/app.js';
import { makeDemoSpec, makeFixture } from '../../shared/fixtures.js';
import type { SourceReading } from '../../shared/source-reading.js';
import type { SourceHistoryBinding } from '../../shared/source-reading-history.js';
import { registerSourceReadingHistory } from '../../server/source-reading-history.js';
import { appendSourceReading, readSourceReadingJournal, SOURCE_READING_JOURNAL_KEY } from '../../server/source-reading-journal.js';
import { workspaceSearchIdentity } from '../../server/workspace-search.js';

process.env.NODE_ENV = 'test';
// BANCO REAL DEL CONSUMIDOR «HISTORIAL DE LECTURAS» (unidad Claude B · CLAUDE-SOURCE-READING-HISTORY-UI). El componente REAL (src/SourceReadingHistory.tsx) se empaqueta con esbuild y se monta en una página de ensayo servida
// por un servidor Fastify REAL (createBaseApp + SQLite de fichero + diario 297 + registerSourceReadingHistory con un ámbito ficticio inyectado por el banco). El navegador hace GET REALES al endpoint 298; NO hay respuestas de éxito
// inventadas. El banco escribe lecturas de ensayo en el diario desde el propio proceso de prueba (appendSourceReading) porque la App todavía no tiene la acción de lectura. Raíz y puerto propios (efímeros, 127.0.0.1); no usa
// 4601, 4331 ni 4334. NO es la App compilada ni una conexión con un proveedor: el montaje en Integraciones lo hace el coordinador.
const repo = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'planb-history-ui-')), web = path.join(root, 'web'), password = 'ficticia-historial-ui-pruebas';
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence: Record<string, unknown> = {};
// COMBINACIÓN CONGELADA. Las dependencias aceptadas que entran en el componente se fijan por huella: si cambian, el banco FALLA (hay que repetir y fijar otra combinación). `shared/continuity-passport.ts` (solo se usa `when`) está reservado
// por otra unidad (308, en revisión); el banco usa los bytes ACEPTADOS de la unidad 214, de huella PINNED_PASSPORT, tomados del primer candidato cuya huella coincida (el archivo del repositorio si aún es el aceptado, la variable
// PLANB_FROZEN_PASSPORT o la copia del revisor 306) y los inyecta en el bundle SIN copiar el checkout. No se adopta ningún otro cambio de ese módulo.
const PINNED_PASSPORT = '9b22877f0c1589ebfc071f35dd0c3e8963e1d44848575e5dbc9caf8898c50870';
const PINNED: Record<string, string> = {
  'shared/source-status.ts': 'fddfda1bd5b73d4b5a32e0eca96e6b58a9188d6b7b50be911421c37cf2a08da1',      // SourceStatus R3 aceptada
  'shared/source-reading.ts': '5e487a65916d2f3e7af5afb328235960acb4d51ab58da01f19ce8b241f34192a',      // modelo común aceptado (Zendesk R3)
  'shared/source-reading-history.ts': '8dc9d7e744f8bb4afa7f4b126975edd1d954a953a72ef0b1ee32d0345ecf645f', // contrato 298 aceptado
};
const passportCandidates = [path.join(repo, 'shared', 'continuity-passport.ts'), process.env.PLANB_FROZEN_PASSPORT ?? '', path.join(repo, 'tests', '.tmp', 'history306-9eLdSR', 's', 'shared', 'continuity-passport.ts')].filter(Boolean);
const NOW = Date.parse('2026-11-09T10:00:00Z'), PRIVATE = ['private-label-ui', 'private-external-ui'];
const SOURCE_A: SourceHistoryBinding['source'] = { provider: 'zendesk-fixture', accountId: 'fixture-ui-a', objectType: 'ticket', mode: 'listing', target: null };
const SOURCE_B: SourceHistoryBinding['source'] = { ...SOURCE_A, accountId: 'fixture-ui-b' };
const FORBIDDEN_UI = /\bconectar\b|conectado(?!:)|leer (del )?proveedor|leer ahora|proveedor vac[ií]o|sin registros/i;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  for (const [file, expected] of Object.entries(PINNED)) expect(sha(path.join(repo, file)), 'la dependencia aceptada ' + file + ' cambió: repetir y fijar la combinación').toBe(expected);
  const frozenFrom = passportCandidates.find(candidate => fs.existsSync(candidate) && sha(candidate) === PINNED_PASSPORT);
  expect(frozenFrom, 'ningún candidato tiene los bytes aceptados de continuity-passport (214, ' + PINNED_PASSPORT.slice(0, 8) + '…): ' + passportCandidates.join(' | ')).toBeTruthy();
  fs.mkdirSync(path.join(root, 'frozen'), { recursive: true }); const frozenPassport = path.join(root, 'frozen', 'continuity-passport.ts'); fs.copyFileSync(frozenFrom!, frozenPassport);
  expect(sha(frozenPassport)).toBe(PINNED_PASSPORT);
  evidence.passport = { acceptedHash214: PINNED_PASSPORT, usedFrom: frozenFrom === passportCandidates[0] ? 'repositorio (aún es el aceptado)' : frozenFrom === process.env.PLANB_FROZEN_PASSPORT ? 'PLANB_FROZEN_PASSPORT (copia privada con la huella aceptada)' : 'copia del revisor 306 (tests/.tmp/history306-9eLdSR)', repoWorkingHash: sha(path.join(repo, 'shared', 'continuity-passport.ts')) };
  const entry = [
    "import { createRoot } from 'react-dom/client';", "import '" + repo.replace(/\\/g, '/') + "/shared/model';", "import { useState } from 'react';",
    "import '" + repo.replace(/\\/g, '/') + "/src/styles.css';", "import '" + repo.replace(/\\/g, '/') + "/src/design-system.css';", "import '" + repo.replace(/\\/g, '/') + "/src/planb-ui.css';",
    "import { SourceReadingHistory } from '" + repo.replace(/\\/g, '/') + "/src/SourceReadingHistory';",
    // El transporte del banco hace GET REALES. «hold» retiene la respuesta (ya producida por el servidor con el estado de ESE momento) hasta liberarla; ignora la señal de cancelación como un transporte defectuoso.
    "const realFetch = window.fetch.bind(window);",
    "const gate = { hold: false, ignoreSignal: true, started: 0, waiting: [] as Array<() => void>, releaseAll() { for (const release of gate.waiting.splice(0)) release(); } };",
    "const gated: typeof fetch = async (input, init) => { gate.started++; const hold = gate.hold; const real = await realFetch(input, { ...init, signal: gate.ignoreSignal ? undefined : init?.signal }); if (hold) await new Promise<void>(resolve => gate.waiting.push(resolve)); return real; };",
    "function Host() { const [props, setProps] = useState<any>(null); (window as any).harness = { set: (next: any) => setProps((current: any) => ({ ...current, ...next })), unmount: () => setProps(null), gate }; return props ? <SourceReadingHistory {...props} fetcher={gated} /> : null; }",
    "createRoot(document.getElementById('root')!).render(<Host />);",
  ].join('\n');
  const built = await bundle({ metafile: true, plugins: [{ name: 'freeze-continuity-passport', setup(build) { build.onResolve({ filter: /continuity-passport(\.js)?$/ }, () => ({ path: frozenPassport })); } }], stdin: { contents: entry, resolveDir: repo, sourcefile: 'history-harness.tsx', loader: 'tsx' }, outdir: web, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', logLevel: 'error', minify: false,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, assetNames: '[name]-[hash]', entryNames: 'harness' });
  evidence.sources = Object.fromEntries(['src/SourceReadingHistory.tsx', 'src/source-reading-history-client.ts', 'src/source-reading-history.css', 'shared/source-reading-history.ts', 'server/source-reading-history.ts', 'server/source-reading-journal.ts'].map(file => [file, sha(path.join(repo, file))]));
  evidence.bundle = sha(path.join(web, 'harness.js'));
  // Huella de CADA archivo del repositorio que entra en el componente empaquetado (SourceStatus incluido): la combinación exacta que se probó.
  evidence.imports = Object.fromEntries(Object.keys(built.metafile!.inputs).filter(file => !file.includes('node_modules') && !file.startsWith('<stdin>')).map(file => path.resolve(repo, file)).filter(file => fs.existsSync(file)).sort().map(file => [file === frozenPassport ? 'shared/continuity-passport.ts (bytes aceptados 214, congelados)' : path.relative(repo, file).replace(/\\/g, '/'), sha(file)]));
});
test.afterAll(async () => {
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('EVIDENCIA-HISTORIAL ' + root + '\n' + JSON.stringify(evidence));
  if (!process.env.PLANB_KEEP_HISTORY_UI) { try { fs.rmSync(path.join(root, 'web'), { recursive: true, force: true }); } catch { /* no crítico */ } }
});

function reading(source: SourceHistoryBinding['source'] = SOURCE_A, extra: Partial<SourceReading> = {}, id = '1'): SourceReading {
  return { format: 'planb-source-reading-v1', ...source, startedAt: new Date(NOW - 1000).toISOString(), completedAt: new Date(NOW).toISOString(), coverage: 'complete', stoppedBy: null, pages: 1, requests: 1,
    records: [{ provider: source.provider, accountId: source.accountId, objectType: source.objectType, remoteId: id, kind: 'support', condition: 'blocked', updatedAt: null, label: PRIVATE[0]!, externalRef: PRIVATE[1]!, related: [] }],
    skipped: { unknownValue: 0, malformed: 0, duplicates: 0 }, retryAfterSeconds: null, ...extra };
}
async function startRig(context: BrowserContext, page: Page) {
  const dir = fs.mkdtempSync(path.join(root, 'rig-')), f = await createBaseApp({ dbPath: path.join(dir, 'planb.sqlite'), root: dir, staticDir: 'none' });
  const activate = (profile: 'agency' | 'distribution', replace: boolean) => {
    const snapshot = makeFixture(profile); f.store.importSnapshot(snapshot, replace);
    f.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date(NOW).toISOString(), prompt: '', approved: false }); f.store.activate();
  };
  activate('agency', false);
  let source = structuredClone(SOURCE_A), scopeRevision = 'a'.repeat(64);
  const identity = () => workspaceSearchIdentity(f.store)!;
  registerSourceReadingHistory(f.app, f.store, { scopeForRequest: () => ({ instanceId: identity().instanceId, contextRevision: identity().contextRevision, scopeRevision, source }) });
  const asset = (name: string) => path.join(web, path.basename(name));
  f.app.get('/harness.html', async (_request, reply) => reply.type('text/html; charset=utf-8').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco historial</title><link rel="stylesheet" href="/web/harness.css"></head><body><main id="root" style="padding:16px;max-width:760px;margin:0 auto"></main><script type="module" src="/web/harness.js"></script></body></html>'));
  f.app.get('/web/:name', async (request, reply) => {
    const file = asset((request.params as { name: string }).name); if (!fs.existsSync(file)) return reply.code(404).send('no');
    return reply.type(file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream').send(fs.readFileSync(file));
  });
  await f.app.listen({ host: '127.0.0.1', port: 0 }); const origin = 'http://127.0.0.1:' + (f.app.server.address() as AddressInfo).port;
  const created = await context.request.post(origin + '/api/v2/auth/setup', { data: { password } }); expect(created.status()).toBe(200);
  const requests: string[] = [], problems: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === origin && url.pathname.startsWith('/api/')) requests.push(request.method() + ' ' + url.pathname); else if (url.origin !== origin) requests.push('EXTERNA ' + request.url()); });
  page.on('pageerror', error => problems.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
  const journalRow = () => (f.store.db.prepare('SELECT value FROM meta WHERE key=?').get(SOURCE_READING_JOURNAL_KEY) as { value: string } | undefined)?.value;
  const rig = {
    f, origin, requests, problems, pin: () => identity().contextRevision,
    append: (input: SourceReading = reading(), at = NOW + 5000) => {
      const journal = readSourceReadingJournal(f.store); expect(journal.status).toBe('ready');
      expect(appendSourceReading(f.store, { expectedRevision: journal.status === 'ready' ? journal.revision : null, reading: input }, () => at).status).toBe('saved');
    },
    setSource: (next: SourceHistoryBinding['source']) => { source = structuredClone(next); }, setScope: (next: string) => { scopeRevision = next; },
    switchCapture: () => activate('distribution', true),
    tables: () => JSON.stringify(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table, f.store.db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()])),
    journalRow, setJournalRow: (value: string) => { f.store.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(SOURCE_READING_JOURNAL_KEY, value); },
    props: (extra: Record<string, unknown> = {}) => ({ source: SOURCE_A, contextRevision: identity().contextRevision, label: 'Zendesk de ensayo', environment: 'ensayo', identityKey: 'k1', pageSize: 5, ...extra }),
    open: async () => { await page.goto(origin + '/harness.html'); await page.waitForFunction(() => !!(window as unknown as { harness?: unknown }).harness); },
    mount: async (extra: Record<string, unknown> = {}) => { await page.evaluate(props => (window as unknown as { harness: { set: (p: unknown) => void } }).harness.set(props), rig.props(extra)); },
    set: async (extra: Record<string, unknown>) => { await page.evaluate(props => (window as unknown as { harness: { set: (p: unknown) => void } }).harness.set(props), extra); },
    gate: async (patch: { hold?: boolean }) => { await page.evaluate(next => Object.assign((window as unknown as { harness: { gate: object } }).harness.gate, next), patch); },
    releaseAll: async () => { await page.evaluate(() => (window as unknown as { harness: { gate: { releaseAll: () => void } } }).harness.gate.releaseAll()); },
    waiting: () => page.evaluate(() => (window as unknown as { harness: { gate: { waiting: unknown[] } } }).harness.gate.waiting.length),
    lock: async () => { expect((await context.request.post(origin + '/api/v2/auth/lock')).status()).toBe(200); },
    login: async () => { expect((await context.request.post(origin + '/api/v2/auth/login', { data: { password } })).status()).toBe(200); },
    // Las conexiones persistentes del navegador no deben retener el cierre del servidor del banco.
    close: async () => { f.app.server.closeAllConnections(); await f.app.close(); },
  };
  return rig;
}
const root_ = (page: Page) => page.getByTestId('source-history');
const state = (page: Page, value: string) => expect(root_(page)).toHaveAttribute('data-state', value);
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
const pageText = (page: Page) => page.evaluate(() => document.body.innerText);
const htmlOf = (page: Page) => page.evaluate(() => document.documentElement.outerHTML);
function noForbidden(text: string) { expect(text).not.toMatch(FORBIDDEN_UI); for (const secret of PRIVATE) expect(text).not.toContain(secret); expect(text).not.toContain('externalRef'); }
async function cleanRun(rig: Awaited<ReturnType<typeof startRig>>) {
  expect(rig.problems, 'sin errores de página ni de consola').toEqual([]);
  expect(rig.requests.filter(r => !r.startsWith('GET /api/v7/source-reading-history')), 'solo se consulta el historial local: ni proveedor ni escritura').toEqual([]);
}

test('vacío local: «sin recibos locales para esta fuente», ensayo y no conectado siempre visibles, sin Conectar ni Leer; abrir y actualizar solo consultan lo local y no escriben', async ({ page, context }) => {
  const rig = await startRig(context, page); const before = rig.tables();
  try {
    await rig.open(); await rig.mount(); await state(page, 'empty');
    const text = await pageText(page);
    expect(text).toContain('Historial de lecturas · Zendesk de ensayo'); expect(text).toContain('Zendesk de ensayo · cuenta fixture-ui-a · ticket (listado) · entorno de ensayo');
    expect(text).toContain('Historial local de ensayo: los recibos no acreditan acceso o conexión con el proveedor.'); expect(text).toContain('Sin recibos locales para esta fuente.');
    expect(text).toContain('Que no haya recibos no dice nada de lo que tenga el proveedor'); expect(text).toContain('No conectado: este historial no prueba una conexión');
    noForbidden(text);
    await expect(button(page, /conectar|leer/i)).toHaveCount(0); await expect(button(page, 'Actualizar historial local')).toBeVisible(); await expect(button(page, /^Historial \(/)).toHaveCount(0);
    await button(page, 'Actualizar historial local').click(); await state(page, 'empty');
    expect(rig.tables(), 'consultar no escribe nada').toBe(before);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('recibos: último guardado y observación más reciente por separado, hora observada y guardada, causa, evidencia, recuento desconocido (no cero) en un fallo, omitidos y espera; nada de etiquetas ni referencias', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    // 1: observado tarde pero guardado primero; 2: fallo sin datos; 3: parcial con omitidos; 4: observado ANTES pero guardado el último
    rig.append(reading(SOURCE_A, { completedAt: new Date(NOW).toISOString() }), NOW + 1000);
    rig.append(reading(SOURCE_A, { records: [], coverage: 'unavailable', stoppedBy: 'forbidden', pages: 0, requests: 1, retryAfterSeconds: 30 }), NOW + 2000);
    rig.append(reading(SOURCE_A, { coverage: 'partial', stoppedBy: 'page-budget', skipped: { unknownValue: 2, malformed: 1, duplicates: 3 } }), NOW + 3000);
    rig.append(reading(SOURCE_A, { startedAt: new Date(NOW - 9000).toISOString(), completedAt: new Date(NOW - 8000).toISOString() }, '9'), NOW + 4000);
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete');
    const summary = page.getByTestId('history-summary'); await expect(summary).toContainText('Último guardado'); await expect(summary).toContainText('Recibo 4'); await expect(summary).toContainText('Observación más reciente');
    await expect(summary).toContainText('Recibo 1'); await expect(summary).toContainText('no es el último guardado');
    await expect(page.getByTestId('history-provenance')).toContainText('Guardado en el almacén local de esta copia.');
    await expect(page.getByTestId('history-list')).toHaveCount(0);                                   // cerrado hasta pedirlo
    await button(page, 'Historial (4)').click(); await expect(button(page, 'Ocultar recibos')).toHaveAttribute('aria-expanded', 'true');
    const items = page.getByTestId('history-list').locator('li'); await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveAttribute('data-sequence', '1'); await expect(items.nth(3)).toHaveAttribute('data-sequence', '4');   // orden de inserción del contrato
    const failed = items.nth(1); await expect(failed).toHaveAttribute('data-coverage', 'unavailable'); await expect(failed).toContainText('Sin lectura útil'); await expect(failed).toContainText('Recuento desconocido (no es cero)');
    await expect(failed).toContainText('Causa: permisos insuficientes'); await expect(failed).toContainText('La fuente respondió con un error'); await expect(failed).toContainText('La fuente pidió esperar 30 s');
    await expect(failed).not.toContainText(/\b0 registros/);
    const partial = items.nth(2); await expect(partial).toContainText('Lectura parcial'); await expect(partial).toContainText('Causa: páginas sin leer'); await expect(partial).toContainText('Omitidos: 2 de valor no reconocido, 1 ilegibles, 3 repetidos');
    await expect(items.nth(0)).toContainText('1 registro guardado en el recibo'); await expect(items.nth(0)).toContainText('Observado'); await expect(items.nth(0)).toContainText('guardado');
    noForbidden(await pageText(page)); noForbidden(await htmlOf(page));
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('dos páginas: el último guardado solo se afirma con todo cargado; Cargar más trae la siguiente; un recibo nuevo invalida el cursor y se vuelve a leer desde el principio; Actualizar deja solo el corte nuevo', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    for (let n = 1; n <= 12; n++) rig.append(reading(SOURCE_A, {}, String(n)), NOW + 1000 * n);
    await rig.open(); await rig.mount(); await state(page, 'partial-view');
    await expect(page.getByTestId('history-summary')).toHaveCount(0);
    await expect(root_(page)).toContainText('Hay 12 recibos locales de esta fuente; se han cargado 5.'); await expect(root_(page)).toContainText('El último guardado está en una página sin cargar');
    await button(page, 'Historial (5)').click(); await expect(page.getByTestId('history-list').locator('li')).toHaveCount(5);
    await button(page, 'Cargar más recibos').click(); await expect(page.getByTestId('history-list').locator('li')).toHaveCount(10);
    // un recibo nuevo cambia el corte: el cursor de la tercera página ya no sirve
    rig.append(reading(SOURCE_A, {}, '99'), NOW + 20_000);
    await button(page, 'Cargar más recibos').click();
    await expect(page.getByTestId('history-notice-reread')).toContainText('El historial cambió mientras se leía; se volvió a consultar desde el principio.');
    await state(page, 'partial-view'); await expect(root_(page)).toContainText('Hay 13 recibos locales de esta fuente; se han cargado 5.');
    // el panel sigue abierto pero SOLO con la primera página del corte nuevo: lo leído antes (las diez entradas del corte viejo) se descartó
    expect(await page.getByTestId('history-list').locator('li').evaluateAll(list => list.map(li => li.getAttribute('data-sequence')))).toEqual(['1', '2', '3', '4', '5']);
    await button(page, 'Cargar más recibos').click(); await button(page, 'Cargar más recibos').click(); await state(page, 'complete');
    const items = page.getByTestId('history-list').locator('li');
    await expect(items).toHaveCount(13); expect(await items.evaluateAll(list => list.map(li => li.getAttribute('data-sequence')))).toEqual(Array.from({ length: 13 }, (_v, i) => String(i + 1)));
    await expect(page.getByTestId('history-summary')).toContainText('Recibo 13');
    // Actualizar tras un recibo más: queda la primera página del corte nuevo, sin duplicar ni mezclar
    rig.append(reading(SOURCE_A, {}, '100'), NOW + 30_000); await button(page, 'Actualizar historial local').click(); await state(page, 'partial-view');
    await expect(root_(page)).toContainText('Hay 14 recibos locales de esta fuente; se han cargado 5.'); await expect(page.getByTestId('history-summary')).toHaveCount(0);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('bloqueo y sesión nueva: tras bloquear, ni Actualizar ni Cargar más muestran recibos; al desbloquear y cambiar la clave de identidad se vuelve a consultar', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    for (let n = 1; n <= 7; n++) rig.append(reading(SOURCE_A, {}, String(n)), NOW + 1000 * n);
    await rig.open(); await rig.mount({ pageSize: 3 }); await state(page, 'partial-view'); await button(page, 'Historial (3)').click(); await expect(page.getByTestId('history-list').locator('li')).toHaveCount(3);
    await rig.lock();
    await button(page, 'Cargar más recibos').click(); await state(page, 'locked');                   // la continuación bloqueada descarta TODO lo leído
    await expect(page.getByTestId('history-list')).toHaveCount(0); await expect(root_(page)).toContainText('Plan B está bloqueado: desbloquéalo para consultar el historial local.');
    let text = await pageText(page); expect(text).not.toMatch(/Recibo \d/); expect(text).not.toContain('Hay 7 recibos');
    await button(page, 'Actualizar historial local').click(); await state(page, 'locked');
    await rig.login(); await rig.set({ identityKey: 'k2' }); await state(page, 'partial-view');     // sesión nueva = otra identidad
    await expect(root_(page)).toContainText('Hay 7 recibos locales de esta fuente; se han cargado 3.'); await expect(button(page, /^Historial \(3\)$/)).toHaveAttribute('aria-expanded', 'false');
    text = await pageText(page); noForbidden(text);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('cambio de cuenta: la fuente que fija el anfitrión manda; otra cuenta pedida a una pantalla autorizada para la primera no publica ningún recibo; el recibo de una cuenta nunca aparece en la otra', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    rig.append(reading(SOURCE_A, {}, '1'), NOW + 1000); rig.append(reading(SOURCE_A, {}, '2'), NOW + 2000); rig.append(reading(SOURCE_B, { coverage: 'partial', stoppedBy: 'record-budget' }, '7'), NOW + 3000);
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete'); await expect(root_(page)).toContainText('cuenta fixture-ui-a'); await expect(root_(page)).toContainText('2 recibos locales de esta fuente.');
    // el anfitrión pasa a la cuenta B (servidor y pantalla): solo su recibo
    rig.setSource(SOURCE_B); await rig.set({ source: SOURCE_B, identityKey: 'k2' }); await state(page, 'complete');
    await expect(root_(page)).toContainText('cuenta fixture-ui-b'); await expect(root_(page)).not.toContainText('fixture-ui-a'); await expect(root_(page)).toContainText('1 recibo local de esta fuente.');
    await button(page, 'Historial (1)').click(); await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1); await expect(page.getByTestId('history-list')).toContainText('Lectura parcial');
    // la pantalla sigue pidiendo A pero el anfitrión solo autoriza B: fuera de ámbito, sin recibos
    await rig.set({ source: SOURCE_A, identityKey: 'k3' }); await state(page, 'out-of-scope');
    await expect(root_(page)).toContainText('Esta fuente no pertenece al ámbito autorizado de esta pantalla.'); await expect(page.getByTestId('history-list')).toHaveCount(0);
    const text = await pageText(page); expect(text).not.toMatch(/Recibo \d/); expect(text).not.toMatch(/\d+ recibos? locales? de esta fuente/);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('cambio de captura: el pin viejo no recibe nada de la copia nueva (se descarta lo leído) y con el pin nuevo se vuelve a consultar', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    rig.append(reading(SOURCE_A, {}, '1'), NOW + 1000); rig.append(reading(SOURCE_A, {}, '2'), NOW + 2000);
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete'); const oldPin = rig.pin();
    rig.switchCapture(); expect(rig.pin()).not.toBe(oldPin);
    await button(page, 'Actualizar historial local').click(); await state(page, 'changed');          // la pantalla aún lleva el pin viejo
    await expect(root_(page)).toContainText('La copia o el historial cambiaron mientras se leía.'); await expect(page.getByTestId('history-summary')).toHaveCount(0);
    expect(await pageText(page)).not.toMatch(/Recibo \d/);
    await rig.set({ contextRevision: rig.pin() }); await state(page, 'complete'); await expect(root_(page)).toContainText('2 recibos locales de esta fuente.');   // el cambio de pin vuelve a consultar solo
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('respuestas tardías: lo anterior no se presenta como actual mientras se pregunta; una respuesta que llega después de cambiar la identidad, tras desmontar o con un transporte que ignora la cancelación no se publica', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    for (let n = 1; n <= 3; n++) rig.append(reading(SOURCE_A, {}, String(n)), NOW + 1000 * n);
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete'); await button(page, 'Historial (3)').click();
    // 1) retiene la respuesta del estado ANTIGUO (3 recibos)
    await rig.gate({ hold: true }); await button(page, 'Actualizar historial local').click(); await expect.poll(() => rig.waiting()).toBe(1);
    await state(page, 'loading'); await expect(root_(page)).toContainText('Consultando el historial local…'); await expect(page.getByTestId('history-list')).toHaveCount(0);   // no se muestra lo anterior como actual
    // 2) cambia el estado y la identidad: la lectura nueva (4 recibos) se publica
    await rig.gate({ hold: false }); rig.append(reading(SOURCE_A, {}, '4'), NOW + 4000); await rig.set({ identityKey: 'k2' }); await state(page, 'complete'); await expect(root_(page)).toContainText('4 recibos locales de esta fuente.');
    // 3) llega la respuesta antigua (que el transporte no canceló): no se publica
    await rig.releaseAll(); await page.waitForTimeout(400); await state(page, 'complete'); await expect(root_(page)).toContainText('4 recibos locales de esta fuente.'); await expect(root_(page)).not.toContainText('3 recibos locales de esta fuente.');
    // 4) una respuesta retenida que llega DESPUÉS de desmontar no produce errores ni efectos
    await rig.gate({ hold: true }); await button(page, 'Actualizar historial local').click(); await expect.poll(() => rig.waiting()).toBe(1);
    await page.evaluate(() => (window as unknown as { harness: { unmount: () => void } }).harness.unmount()); await expect(root_(page)).toHaveCount(0);
    await rig.gate({ hold: false }); await rig.releaseAll(); await page.waitForTimeout(300); await expect(root_(page)).toHaveCount(0);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('historial no disponible (diario ilegible): causa y recuento desconocido (no cero), sin recibos; Reintentar solo consulta lo local y recupera cuando el diario vuelve a ser legible', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    rig.append(reading(SOURCE_A, {}, '1'), NOW + 1000); const good = rig.journalRow()!; expect(good).toBeTruthy();
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete');
    rig.setJournalRow('esto no es un diario');
    await button(page, 'Actualizar historial local').click(); await state(page, 'unavailable');
    await expect(root_(page)).toContainText('No se pudo comprobar el historial local.'); await expect(root_(page)).toContainText('Se desconoce cuántos recibos hay (no es cero).');
    expect(await pageText(page)).not.toMatch(/\b0 recibos|Sin recibos locales/); await expect(page.getByTestId('history-list')).toHaveCount(0);
    await expect(button(page, 'Reintentar consulta local')).toBeVisible();
    await button(page, 'Reintentar consulta local').click(); await state(page, 'unavailable');       // sigue ilegible: no se repara ni se inventa un vacío
    expect(rig.journalRow()).toBe('esto no es un diario');
    rig.setJournalRow(good); await button(page, 'Reintentar consulta local').click(); await state(page, 'complete'); await expect(root_(page)).toContainText('1 recibo local de esta fuente.');
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('teclado y tres anchos (1440, 390, 320): se recorre con Tab y se activa con Enter y Espacio; sin desbordamiento horizontal, botones táctiles de 44 px en móvil, capturas con el historial abierto', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    for (let n = 1; n <= 8; n++) rig.append(n % 3 === 0 ? reading(SOURCE_A, { records: [], coverage: 'unavailable', stoppedBy: 'timeout', pages: 0, requests: 1, startedAt: new Date(NOW - 1000 * n).toISOString() }) : reading(SOURCE_A, n % 2 ? {} : { coverage: 'partial', stoppedBy: 'record-budget', skipped: { unknownValue: 1, malformed: 0, duplicates: 1 } }, String(n)), NOW + 1000 * n);
    await rig.open(); await rig.mount({ pageSize: 25, label: 'Zendesk de ensayo con un nombre bastante largo para comprobar el ajuste de línea en pantallas estrechas' }); await state(page, 'complete');
    // teclado: Tab llega a Historial, luego Actualizar; Enter abre y Espacio actualiza
    await page.locator('body').click({ position: { x: 1, y: 1 } }); await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Historial (8)'); await page.keyboard.press('Enter'); await expect(button(page, 'Ocultar recibos')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Actualizar historial local');
    const before = rig.requests.length; await page.keyboard.press('Space'); await expect.poll(() => rig.requests.length).toBeGreaterThan(before); await state(page, 'complete');
    await expect(page.getByTestId('history-list').locator('li')).toHaveCount(8);
    const outline = await button(page, 'Actualizar historial local').evaluate(el => { (el as HTMLElement).focus(); const s = getComputedStyle(el); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; }); expect(outline).toBe(true);
    for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, wide: [...document.querySelectorAll('[data-testid="source-history"] *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).map(el => el.tagName + ':' + (el.textContent ?? '').slice(0, 30)) }));
      expect(metrics.scroll, width + ': sin desplazamiento horizontal').toBeLessThanOrEqual(metrics.inner); expect(metrics.wide, width + ': nada fuera de la pantalla').toEqual([]);
      if (width <= 600) for (const name of ['Ocultar recibos', 'Actualizar historial local']) { const box = await button(page, name).boundingBox(); expect(box!.height, width + ' ' + name).toBeGreaterThanOrEqual(43.5); }
      fs.mkdirSync(path.join(root, 'shots'), { recursive: true }); await page.screenshot({ path: path.join(root, 'shots', 'history-' + width + '.png'), fullPage: true });
    }
    evidence.screenshots = fs.readdirSync(path.join(root, 'shots')).map(name => [name, sha(path.join(root, 'shots', name))]);
    await cleanRun(rig);
  } finally { await rig.close(); }
});

test('R2 · interrupciones y error de red: el recibo no niega que pudo llegar una respuesta (plazo o cancelación) y el fallo de red sí dice que falló antes; cero peticiones, error de la fuente y desconocido ≠ cero se conservan', async ({ page, context }) => {
  const rig = await startRig(context, page);
  try {
    const failed = (stoppedBy: SourceReading['stoppedBy'], requests: number, n: number) => reading(SOURCE_A, { records: [], coverage: 'unavailable', stoppedBy, pages: 0, requests, startedAt: new Date(NOW - 1000 * n).toISOString() });
    rig.append(failed('timeout', 1, 1), NOW + 1000); rig.append(failed('aborted', 1, 2), NOW + 2000); rig.append(failed('network', 1, 3), NOW + 3000); rig.append(failed('aborted', 0, 4), NOW + 4000); rig.append(failed('forbidden', 1, 5), NOW + 5000);
    await rig.open(); await rig.mount({ pageSize: 10 }); await state(page, 'complete'); await button(page, 'Historial (5)').click();
    const items = page.getByTestId('history-list').locator('li');
    for (const n of [0, 1]) { await expect(items.nth(n)).toHaveAttribute('data-evidence', 'interrupted'); await expect(items.nth(n)).toContainText('se interrumpió (plazo o cancelación) antes de completar una página: no se sabe si la fuente llegó a responder'); await expect(items.nth(n)).not.toContainText('no llegó respuesta'); }
    await expect(items.nth(2)).toHaveAttribute('data-evidence', 'no-response'); await expect(items.nth(2)).toContainText('falló la red antes de recibir respuesta'); await expect(items.nth(2)).not.toContainText('interrumpió');
    await expect(items.nth(3)).toHaveAttribute('data-evidence', 'not-sent'); await expect(items.nth(3)).toContainText('No salió ninguna petición'); await expect(items.nth(4)).toHaveAttribute('data-evidence', 'error-response');
    for (let n = 0; n < 5; n++) await expect(items.nth(n)).toContainText('Recuento desconocido (no es cero)');
    noForbidden(await pageText(page)); await cleanRun(rig);
  } finally { await rig.close(); }
});
