import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as shared from '../shared/local-integrations.js';
import { parseCatalog, parseContinuity, parseWorkspace, projectIntegrations, teamLink, validateTeamOrigin, type SourceState } from '../shared/local-integrations.js';

// Contrato y proyección con respuestas sintéticas con la forma real de los tres endpoints.
// La segunda mitad ejecuta el componente con un arnés de hooks: NO es React DOM ni una prueba visual
// (eso lo cubre tests/e2e/local-integrations.spec.ts). Ninguna prueba usa cuentas ni proveedores.

const ok = <T>(data: T): SourceState<T> => ({ data, failed: false, loading: false });
const failed = <T>(): SourceState<T> => ({ data: null, failed: true, loading: false });
const loading = <T>(): SourceState<T> => ({ data: null, failed: false, loading: true });
const status = (over: Record<string, unknown> = {}) => ({
  captures: [], jobs: [], reports: [], latestCaptureAt: null, stale: false, ageMinutes: null, session: null,
  schedule: { enabled: false, intervalMinutes: 60, lastAttempt: null }, connected: true, protected: false, accountId: null, changes: 0, pendingChanges: 0,
  runtime: false, realDataEnabled: false, latestCapture: null, readiness: { status: 'empty' }, connection: null, recoveryCopy: null,
  operations: { lastAttempt: null, lastSuccess: null, error: null, paused: false }, ...over,
});
const capture = { id: 'cap-1', name: 'Captura Agencia Norte', source: 'hubspot', accountId: '65001', capturedAt: '2026-11-01T10:00:00.000Z', counts: {}, records: 42, relations: 0, pipelines: 0, fields: 0 };
const catalog = (hubspot: 'simulation' | 'readonly' | 'unavailable' = 'simulation') => ({ integrations: [
  { id: 'hubspot', label: 'HubSpot', mode: hubspot, description: 'Conexión existente.', actions: ['Lectura existente'] },
  { id: 'gmail', label: 'Gmail', mode: 'simulation', description: 'Adaptador de ensayo.', actions: ['Mensaje simulado'] },
  { id: 'calendar', label: 'Google Calendar', mode: 'simulation', description: 'Adaptador de ensayo.', actions: ['Propuesta de reunión simulada'] },
  { id: 'drive', label: 'Google Drive', mode: 'unavailable', description: 'Espacio comercial.', actions: [] },
  { id: 'docs', label: 'Google Docs', mode: 'unavailable', description: 'Espacio comercial.', actions: [] },
  { id: 'sheets', label: 'Google Sheets', mode: 'unavailable', description: 'Espacio comercial.', actions: [] },
] });
const view = (c: unknown, k: unknown, w: unknown) => projectIntegrations({
  continuity: c === 'fail' ? failed() : c === 'load' ? loading() : ok(parseContinuity(c)!),
  catalog: k === 'fail' ? failed() : k === 'load' ? loading() : ok(parseCatalog(k)!),
  workspace: w === 'fail' ? failed() : w === 'load' ? loading() : ok(parseWorkspace(w)!),
});
const everyText = (v: ReturnType<typeof view>) => JSON.stringify(v);

test('sin cuenta ni protección: HubSpot guía a proteger la instalación y el equipo no ofrece botones inertes', () => {
  const v = view(status({ latestCapture: capture, latestCaptureAt: capture.capturedAt }), catalog(), { origin: null });
  assert.equal(v.hubspot.state, 'not_connected');
  assert.deepEqual(v.hubspot.action, { kind: 'callback', label: 'Configurar protección' });
  assert.match(v.hubspot.facts.join(' '), /sin configurar|protección local/i);
  assert.match(v.hubspot.facts.join(' '), /histórica: no indica que HubSpot esté conectado ahora/);
  assert.match(v.hubspot.facts.join(' '), /no tiene una credencial guardada/);
  assert.equal(v.team.length, 5);
  for (const row of v.team) { assert.equal(row.state, 'not_configured'); assert.equal(row.action, null); assert.ok(row.next.length > 20); }
  assert.equal(v.space.status, 'ok');
  assert.equal(v.space.items.find(i => i.label === 'Protección local')?.value, 'Sin configurar');
});

test('«servicios habilitados» (connected) no equivale a una conexión HubSpot', () => {
  const v = view(status({ connected: true, protected: true }), catalog(), { origin: null });
  assert.equal(v.hubspot.state, 'not_connected');
  assert.doesNotMatch(v.hubspot.next, /sin proteger/i);
  assert.match(v.hubspot.next, /Conecta tu portal/);
  assert.deepEqual(v.hubspot.action, { kind: 'callback', label: 'Conectar HubSpot' });
});

test('solo catálogo: lo declarado no se presenta como comprobado y Continuidad se puede reintentar', () => {
  const readonly = view('fail', catalog('readonly'), { origin: null });
  assert.equal(readonly.hubspot.state, 'declared');
  assert.equal(readonly.hubspot.retry, 'continuity');
  assert.match(readonly.hubspot.facts.join(' '), /Sin comprobar el acceso actual/);
  assert.equal(readonly.space.status, 'error');
  const sim = view('fail', catalog('simulation'), { origin: null });
  assert.equal(sim.hubspot.state, 'error');
  assert.equal(sim.hubspot.retry, 'continuity');
  assert.equal(sim.hubspot.action?.kind, 'callback');
});

test('conexión local declarada: credencial guardada, sin afirmar acceso actual', () => {
  const connection = { accountId: '65001', mode: 'test', accountType: 'DEVELOPER_TEST', verifiedAt: '2026-10-30T09:00:00.000Z', selectedFields: {} };
  const v = view(status({ protected: true, connection }), catalog('readonly'), { origin: null });
  assert.equal(v.hubspot.state, 'declared');
  assert.equal(v.hubspot.stateLabel, 'Lectura configurada');
  assert.deepEqual(v.hubspot.action, { kind: 'callback', label: 'Revisar conexión' });
  const facts = v.hubspot.facts.join(' ');
  assert.match(facts, /Portal 65001 · portal de prueba/);
  assert.match(facts, /Cuenta verificada al guardar la credencial/);
  assert.match(facts, /El acceso actual no se comprueba al abrir esta lista/);
  const paused = view(status({ protected: true, connected: false, connection }), catalog('readonly'), { origin: null });
  assert.equal(paused.hubspot.state, 'paused');
  const unverified = view(status({ protected: true, connection: { ...connection, accountType: 'NOT_VERIFIED', verifiedAt: null } }), catalog('readonly'), { origin: null });
  assert.match(unverified.hubspot.facts.join(' '), /no se verificó al guardar/);
});

test('catálogo declara lectura pero Continuidad no aporta cuenta: se señala la discrepancia', () => {
  const v = view(status({ protected: true }), catalog('readonly'), { origin: null });
  assert.equal(v.hubspot.state, 'declared');
  assert.match(v.hubspot.facts.join(' '), /Continuidad no aporta los datos de la cuenta/);
});

test('un fallo de captura se muestra como hecho, no como «requiere reconectar»', () => {
  const error = { at: '2026-11-01T11:00:00.000Z', message: 'La captura no se completó; la copia anterior se conserva.', action: 'Revisa la conexión.' };
  const v = view(status({ operations: { lastAttempt: error.at, lastSuccess: null, error, paused: false } }), catalog(), { origin: null });
  assert.match(v.space.notes.join(' '), /La captura no se completó/);
  assert.match(v.space.notes.join(' '), /No demuestra por sí solo que la credencial haya caducado/);
  assert.doesNotMatch(everyText(v), /requiere reconectar/i);
});

test('paquete independiente: nada disponible y sin acciones', () => {
  const v = view(status({ runtime: true }), catalog('unavailable'), { origin: 'https://team.example.com' });
  assert.equal(v.hubspot.state, 'unavailable');
  assert.equal(v.hubspot.action, null);
  for (const row of v.team) { assert.equal(row.state, 'unavailable'); assert.equal(row.action, null); }
});

const GOOD = ['https://team.example.com', 'http://127.0.0.1:4341', 'http://localhost:3000', 'http://[::1]:4341', 'https://team.example.com/', 'HTTPS://TEAM.EXAMPLE.COM', 'http://equipo.localhost:8080'];
const BAD = [
  'javascript:alert(1)', 'data:text/html,<script>1</script>', '//evil.example', 'http://evil.example.com', 'https://user:pass@team.example.com', 'https://team.example.com@evil.example',
  'https://team.example.com/path', 'https://team.example.com/?x=1', 'https://team.example.com#x', 'https://team.example.com?', 'ftp://team.example.com', 'https://10.0.0.5', 'https://intranet',
  'http://127.0.0.1:4341\\@evil.example', 'https://team.example.com\n', ' https://team.example.com', 'https://team.example.com/%2e%2e', 'https://[2001:db8::1]', '', '   ', 'null', 'https://', 'http://team.example.com',
  'https://' + 'a'.repeat(2100) + '.com',
];
test('validación de la dirección del espacio de equipo', () => {
  for (const value of GOOD) { const r = validateTeamOrigin(value); assert.ok(r.ok, value); if (r.ok) assert.equal(r.origin, value.toLowerCase().replace(/\/$/, '')); }
  for (const value of BAD) assert.equal(validateTeamOrigin(value).ok, false, value.slice(0, 60));
  for (const value of [null, undefined, 4, {}, [], true]) assert.equal(validateTeamOrigin(value).ok, false);
});

test('origen válido: enlaces correctos por herramienta; sin afirmar cuenta ni conexión', () => {
  const v = view(status(), catalog(), { origin: 'http://127.0.0.1:4341' });
  const links = Object.fromEntries(v.team.map(row => [row.id, row.action && row.action.kind === 'link' ? row.action.href : null]));
  assert.deepEqual(links, {
    gmail: 'http://127.0.0.1:4341/team?view=commercial', calendar: 'http://127.0.0.1:4341/team?view=commercial',
    drive: 'http://127.0.0.1:4341/team?view=commercial&tool=drive', docs: 'http://127.0.0.1:4341/team?view=commercial&tool=docs', sheets: 'http://127.0.0.1:4341/team?view=commercial&tool=sheets',
  });
  for (const row of v.team) { assert.equal(row.state, 'unchecked'); assert.equal(row.stateLabel, 'Sin comprobar aquí'); }
  assert.match(v.team[0].facts.join(' '), /solo existe como ensayo/);
  assert.match(v.team[0].facts.join(' '), /no prueba su entrega/);
  assert.match(v.team[0].facts.join(' '), /No se sabe aquí si hay una cuenta de Google conectada/);
  assert.equal(teamLink('https://t.example.com', 'sheets'), 'https://t.example.com/team?view=commercial&tool=sheets');
});

test('origen malicioso o no admitido: ningún enlace, ni se reproduce el valor', () => {
  for (const origin of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'https://user:pw@evil.example.com', 'http://evil.example.com', 'https://x.example.com/<img src=x onerror=alert(1)>']) {
    const v = view(status(), catalog(), { origin });
    assert.equal(v.teamOrigin && v.teamOrigin.ok, false);
    for (const row of v.team) { assert.equal(row.state, 'invalid_config'); assert.equal(row.action, null); }
    const dump = everyText(v);
    assert.doesNotMatch(dump, /javascript:|evil\.example|onerror|data:text/);
  }
});

test('un endpoint fallido no falsea los demás ni borra datos válidos', () => {
  const noWorkspace = view(status({ protected: true }), catalog(), 'fail');
  assert.equal(noWorkspace.hubspot.state, 'not_connected');
  for (const row of noWorkspace.team) { assert.equal(row.state, 'error'); assert.equal(row.retry, 'workspace'); assert.equal(row.action, null); }
  assert.equal(noWorkspace.rehearsal.status, 'ok');
  const noCatalog = view(status({ protected: true }), 'fail', { origin: 'https://team.example.com' });
  assert.equal(noCatalog.rehearsal.status, 'error');
  assert.equal(noCatalog.hubspot.state, 'not_connected');
  assert.equal(noCatalog.team[0].state, 'unchecked');
  assert.doesNotMatch(noCatalog.team[0].facts.join(' '), /solo existe como ensayo/);
  // Reintento fallido que conserva el último dato: se avisa, el dato se mantiene.
  const stale = projectIntegrations({ continuity: { data: parseContinuity(status({ protected: true }))!, failed: true, loading: false }, catalog: ok(parseCatalog(catalog())!), workspace: ok({ origin: null }) });
  assert.equal(stale.hubspot.state, 'not_connected');
  assert.deepEqual(stale.stale.map(s => s.source), ['continuity']);
});

test('estados de carga: sin conclusiones mientras no hay respuesta', () => {
  const v = view('load', 'load', 'load');
  assert.equal(v.space.status, 'loading');
  assert.equal(v.hubspot.state, 'loading');
  assert.equal(v.rehearsal.status, 'loading');
  assert.ok(v.team.every(row => row.state === 'loading' && row.action === null));
  assert.equal(view(status(), catalog(), 'load').team[0].state, 'loading');
});

test('catálogo vacío y entradas desconocidas', () => {
  assert.equal(projectIntegrations({ continuity: ok(parseContinuity(status())!), catalog: ok(parseCatalog({ integrations: [] })!), workspace: ok({ origin: null }) }).rehearsal.status, 'empty');
  const parsed = parseCatalog({ integrations: [{ id: 'slack', label: 'x', mode: 'readonly' }, { id: 'gmail', label: 'Gmail', mode: 'weird' }, { id: 'docs', label: 'Docs', mode: 'unavailable', actions: ['a', 4] }, { id: 'docs', label: 'Dup', mode: 'unavailable' }, 7] });
  assert.deepEqual(parsed?.map(e => e.id), ['docs']);
  assert.deepEqual(parsed?.[0].actions, ['a']);
});

test('contratos incompatibles se rechazan en lugar de interpretarse', () => {
  for (const bad of [null, 'x', [], {}, { runtime: 'no', protected: true, connected: true }, { runtime: false, protected: true }]) assert.equal(parseContinuity(bad), null);
  for (const bad of [null, {}, { integrations: 'x' }]) assert.equal(parseCatalog(bad), null);
  for (const bad of [null, {}, { origin: 4 }, { origin: {} }, []]) assert.equal(parseWorkspace(bad), null);
  assert.deepEqual(parseWorkspace({ origin: null }), { origin: null });
});

test('ninguna combinación afirma «conectado», «verificado» ni herramientas conectadas', () => {
  const combos = [
    view(status(), catalog(), { origin: null }), view(status({ protected: true, connection: { accountId: '1', mode: 'test', accountType: 'X', verifiedAt: '2026-10-30T09:00:00Z' } }), catalog('readonly'), { origin: 'https://team.example.com' }),
    view('fail', 'fail', 'fail'), view(status({ runtime: true }), catalog('unavailable'), { origin: null }),
  ];
  for (const v of combos) {
    const labels = [v.hubspot, ...v.team].map(row => row.stateLabel).join('|');
    assert.doesNotMatch(labels, /Conectad|Verificad|Activ/i);
    assert.doesNotMatch(everyText(v), /herramientas conectadas|tus herramientas, conectadas/i);
  }
});

// --- Arnés de hooks del componente real (no es DOM) ---
type VNode = { type: unknown; props: Record<string, any> };
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/LocalIntegrations.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function mount() {
  const slots: any[] = [], requests: { path: string; signal?: AbortSignal; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = [];
  let cursor = 0, tree: any, writes = 0, effects: (() => void)[] = [], connects = 0;
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v: any) => { writes++; slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useCallback(fn: any, deps: unknown[]) { const i = cursor++, prior = slots[i]; if (prior && deps.every((d, n) => Object.is(d, prior.deps[n]))) return prior.fn; slots[i] = { deps, fn }; return fn; },
    useEffect(run: () => void | (() => void), deps: unknown[]) { const i = cursor++, prior = slots[i]; if (!prior || deps.some((d, n) => !Object.is(d, prior.deps[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const mod: { exports: any } = { exports: {} };
  const imports = (name: string): any => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (name === 'lucide-react') return { ArrowRight: () => null, RefreshCw: () => null };
    if (name.endsWith('api.js')) return { api: (path: string, init?: RequestInit) => new Promise((resolve, reject) => requests.push({ path, signal: init?.signal ?? undefined, resolve, reject })) };
    if (name.endsWith('IntegrationLogo.js')) return { IntegrationLogo: () => null };
    if (name.endsWith('HubspotReadCheck.js')) return { HubspotReadCheck: () => null }; // Child exercised through the App browser suite.
    if (name.endsWith('local-integrations.js')) return shared;
    if (name.endsWith('.css')) return {};
    throw Error('Unexpected import ' + name);
  };
  new Function('require', 'exports', 'module', compiled)(imports, mod.exports, mod);
  const render = () => { cursor = 0; tree = mod.exports.LocalIntegrations({ onConnectHubspot: () => { connects++; } }); const pending = effects; effects = []; pending.forEach(run => run()); };
  const expand = (node: any): any => Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' && node.props ? (typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } }) : node;
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const flat = (node: any): string => Array.isArray(node) ? node.map(flat).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const nodes = () => walk(expand(tree)), text = () => flat(expand(tree));
  const button = (label: string) => { const found = nodes().find(n => n.type === 'button' && flat(n).trim() === label); assert.ok(found, 'Falta el botón ' + label); return found; };
  render();
  const find = (path: string) => requests.filter(r => r.path === path);
  return { render, requests, find, text, nodes, button, writes: () => writes, connects: () => connects, unmount: () => slots.forEach(s => s?.cleanup?.()) };
}

test('componente: tres peticiones independientes, la de HubSpot usa el callback existente', async () => {
  const h = mount();
  assert.deepEqual(h.requests.map(r => r.path).sort(), ['/v2/continuity', '/v4/integrations', '/v6/workspace']);
  assert.ok(h.requests.every(r => r.signal && !r.signal.aborted));
  h.find('/v6/workspace')[0].reject(new Error('red'));
  h.find('/v4/integrations')[0].resolve(catalog());
  h.find('/v2/continuity')[0].resolve(status({ protected: true }));
  await settle(); h.render();
  const t = h.text();
  assert.match(t, /Sin conectar/); assert.match(t, /No se pudo consultar/); assert.match(t, /Ver capacidades de ensayo/);
  h.button('Conectar HubSpot').props.onClick();
  assert.equal(h.connects(), 1);
  const details = h.nodes().find(n => n.type === 'details')!;
  assert.equal(details.props.open, undefined, 'el detalle de ensayo nace plegado');
  // Reintento local de la fuente que falló: solo se repite /v6/workspace.
  const before = h.requests.length;
  h.nodes().find(n => n.type === 'button' && /Reintentar/.test(String(JSON.stringify(n.props.children))))!.props.onClick();
  assert.equal(h.requests.length, before + 1); assert.equal(h.requests.at(-1)!.path, '/v6/workspace');
  h.unmount();
});

test('componente: respuesta tardía tras desmontar o tras un reintento se ignora', async () => {
  const h = mount();
  const first = h.find('/v2/continuity')[0];
  h.find('/v4/integrations')[0].resolve(catalog()); h.find('/v6/workspace')[0].resolve({ origin: null });
  await settle(); h.render();
  // Reintento manual: la primera respuesta (antigua) queda cancelada y no escribe estado.
  h.button('Actualizar estado').props.onClick?.call(null);
  assert.equal(first.signal!.aborted, true);
  const second = h.find('/v2/continuity')[1];
  second.resolve(status({ protected: true })); await settle(); h.render();
  const writes = h.writes();
  first.resolve(status({ runtime: true })); await settle();
  assert.equal(h.writes(), writes, 'la respuesta antigua no escribe');
  h.render(); assert.doesNotMatch(h.text(), /No disponible en este paquete/);
  // Desmontaje: cancela las peticiones y la respuesta tardía no escribe.
  const pending = h.requests.filter(r => !r.signal!.aborted);
  h.unmount();
  assert.ok(pending.every(r => r.signal!.aborted));
  const afterUnmount = h.writes();
  for (const r of pending) r.resolve(status());
  await settle();
  assert.equal(h.writes(), afterUnmount);
});

test('componente: un reintento fallido conserva los datos válidos anteriores y avisa', async () => {
  const h = mount();
  h.find('/v2/continuity')[0].resolve(status({ protected: true })); h.find('/v4/integrations')[0].resolve(catalog()); h.find('/v6/workspace')[0].resolve({ origin: 'https://team.example.com' });
  await settle(); h.render();
  h.button('Actualizar estado').props.onClick();
  h.find('/v6/workspace')[1].reject(new Error('caído'));
  h.find('/v2/continuity')[1].resolve(status({ protected: true })); h.find('/v4/integrations')[1].resolve(catalog());
  await settle(); h.render();
  const t = h.text();
  assert.match(t, /No se pudo actualizar la dirección del espacio de equipo/);
  assert.match(t, /Abrir Gmail en el espacio comercial/);
  h.unmount();
});
