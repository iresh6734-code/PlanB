import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Ejecuta los componentes reales con ranuras de hooks controladas y transporte ficticio.
// No es React DOM, ni un navegador, ni una prueba visual o de accesibilidad con lector de pantalla:
// comprueba el comportamiento de estado y los props que cada componente entrega a sus hijos.
const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
type VNode = { type: any; props: Record<string, any> };

function makeLoader(mocks: Record<string, any> = {}) {
  const cache = new Map<string, any>();
  let hooks: any;
  const useHooks = (value: any) => { hooks = value; };
  const resolveFile = (spec: string) => {
    const base = path.resolve(SRC, spec.replace(/\.js$/, ''));
    return ['.tsx', '.ts'].map(ext => base + ext).find(file => fs.existsSync(file));
  };
  const jsx = (type: any, props: Record<string, any>) => ({ type, props });
  const requireFrom = (spec: string): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => (hooks as any)[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (spec.endsWith('.css')) return {};
    const key = path.basename(spec).replace(/\.js$/, '');
    if (key in mocks) return mocks[key];
    const file = resolveFile(spec);
    if (!file) throw new Error('Dependencia no resuelta en la prueba: ' + spec);
    if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} };
    cache.set(file, mod.exports);
    new Function('require', 'exports', 'module', code)(requireFrom, mod.exports, mod);
    cache.set(file, mod.exports);
    return mod.exports;
  };
  return { load: (file: string) => requireFrom('./' + file.replace(/\.tsx?$/, '')), useHooks };
}

function mount(file: string, exportName: string, mocks: Record<string, any> = {}, initial: Record<string, any> = {}) {
  const loader = makeLoader(mocks);
  const slots: any[] = [];
  let cursor = 0, tree: any, effects: (() => void)[] = [], props = initial, writes = 0, ids = 0;
  loader.useHooks({
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v: any) => { writes++; slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); },
    useId() { const i = cursor++; return slots[i] ?? (slots[i] = ':r' + ids++ + ':'); },
    useEffect(run: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++, prior = slots[i];
      if (!prior || !deps || deps.some((d, n) => !Object.is(d, prior.deps?.[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; });
    },
  });
  const Component = loader.load(file)[exportName];
  const render = (next: Record<string, any> = {}) => {
    props = { ...props, ...next }; cursor = 0; tree = Component(props);
    const pending = effects; effects = []; pending.forEach(effect => effect());
    return tree;
  };
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(child => walk(child)) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : [];
  const nodes = () => walk(tree);
  const flat = (node: any): string => Array.isArray(node) ? node.map(child => flat(child)).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const text = (...node: any[]) => flat(node.length ? node[0] : tree);
  const named = (name: string) => nodes().filter(n => typeof n.type === 'function' && n.type.name === name);
  const byTag = (tag: string, test: (n: VNode) => boolean = () => true) => nodes().filter(n => n.type === tag && test(n));
  const button = (label: string | RegExp) => {
    const found = nodes().find(n => n.type === 'button' && (typeof label === 'string' ? text(n) === label : label.test(text(n))));
    assert.ok(found, 'No hay botón: ' + label);
    return found!;
  };
  const unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  return { render, nodes, text, named, byTag, button, unmount, writes: () => writes };
}

/** `call` ficticio: cada ruta se resuelve por sufijo; un Error la rechaza. Guarda el registro de peticiones. */
function fakeServer(routes: Record<string, (body?: any) => any>) {
  const log: { path: string; body?: any }[] = [];
  const call = async (p: string, body?: any) => {
    log.push({ path: p, body });
    const key = Object.keys(routes).filter(k => p.endsWith(k) || p.includes(k)).sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error('Ruta no prevista en la prueba: ' + p);
    const result = typeof routes[key] === 'function' ? routes[key](body) : routes[key];
    if (result instanceof Error) throw result;
    return result;
  };
  return { call, log };
}
/** Módulo ficticio `{ Nombre }` cuyo componente conserva el nombre para localizarlo en el árbol. */
const stub = (name: string) => ({ [name]: { [name]: { [name]: function () { return null; } }[name] } });
Object.assign(globalThis, { location: { search: '' }, sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
const setConfirm = (answer: boolean | (() => boolean)) => { (globalThis as any).confirm = typeof answer === 'function' ? answer : () => answer; };

// ---------- Datos de prueba ----------
const content = (id: string, over: Record<string, any> = {}) => ({ recipient: 'me@x.es', subject: 'Asunto ' + id, body: 'Cuerpo ' + id, meeting: false, email: true, document: false, spreadsheet: false, ...over });
const proposal = (id: string, over: Record<string, any> = {}) => ({ id, contact_id: 'c-' + id, revision: '2026-10-29T10:00:00Z', content: content(id), content_hash: 'h-' + id, status: 'draft', evidence: [], error: null, created_at: '2026-10-29', ...over });
const overview = (proposals: any[], over: Record<string, any> = {}) => ({ demo: false, configured: true, connection: { account: 'me@x.es', revision: '1' }, integrations: [], contacts: [], proposals, links: [], tasks: [], ...over });
const contact = (id: string, firstname: string, lastname: string, email: string) => ({ entity: 'contacts', id, values: { firstname, lastname, email } });

const commercialMocks = () => ({
  ...stub('CommercialEditor'), ...stub('CommercialEmailPreview'), ...stub('HubspotContext'), ...stub('IntegrationLogo'), ...stub('IntegrationEvidence'), ...stub('CustomerFiles'),
  ...{ WorkspaceUI: { InlineEmpty: function InlineEmpty() { return null; } } }, ...{ components: { Spinner: function Spinner() { return null; } } },
});
function commercial(server: ReturnType<typeof fakeServer>, state: { current: any }, extra: Record<string, any> = {}) {
  const dirtyCalls: number[] = [];
  const h = mount('CommercialWorkspace.tsx', 'CommercialWorkspace', commercialMocks(), { tenant: 'T1', records: [], canWrite: true, canConnect: true, call: server.call, refreshRecords: async () => undefined, onDirtyChange: (n: number) => dirtyCalls.push(n), ...extra });
  return { h, dirtyCalls, editor: (id: string) => h.named('CommercialEditor').find(n => n.props.proposal.id === id)!, settleRender: async () => { await settle(); h.render(); } };
}
async function boot(state: { current: any }, routes: Record<string, (b?: any) => any> = {}, extra: Record<string, any> = {}) {
  const server = fakeServer({ '/commercial': () => state.current, ...routes });
  const c = commercial(server, state, extra);
  c.h.render(); c.h.render(); await c.settleRender(); await c.settleRender();
  return { server, ...c };
}

// ---------- Funciones puras ----------
import { contactLabel, decisionBlockers, filterContacts, openDraftFor, prepareBlockers, reconcileDrafts } from '../src/commercial-drafts.js';
const asProposals = (items: any[]) => items as any;

test('R-02 reconcileDrafts: conserva la edición si el servidor no cambió, la descarta si cambió o desapareció', () => {
  const a = proposal('A'), b = proposal('B'), edited = { ...b, content: { ...b.content, body: 'EDITADO' }, status: 'draft' };
  const kept = reconcileDrafts(asProposals([a, edited]), asProposals([a, b]), ['B']);
  assert.equal((kept.proposals[1] as any).content.body, 'EDITADO'); assert.deepEqual(kept.dirty, ['B']); assert.deepEqual(kept.dropped, []);
  const changed = reconcileDrafts(asProposals([a, edited]), asProposals([a, { ...b, content_hash: 'otro', content: { ...b.content, body: 'SERVIDOR' } }]), ['B']);
  assert.equal((changed.proposals[1] as any).content.body, 'SERVIDOR'); assert.deepEqual(changed.dirty, []); assert.deepEqual(changed.dropped, ['B']);
  const gone = reconcileDrafts(asProposals([a, edited]), asProposals([a]), ['B']);
  assert.deepEqual(gone.dropped, ['B']);
  const none = reconcileDrafts(asProposals([a, b]), asProposals([a, b]), []);
  assert.deepEqual(none.dirty, []); assert.equal(none.proposals[0], a);
});
test('R-03/R-04/R-07 decisionBlockers: motivos para aprobar y ejecutar sin relajar condiciones', () => {
  const ok = { busy: false, canWrite: true, dirty: false, reviewed: true, blockedRecipient: false, connected: true, status: 'draft' as const };
  assert.deepEqual(decisionBlockers(ok), []);
  assert.match(decisionBlockers({ ...ok, reviewed: false }).join(' '), /revisado el destinatario/);
  assert.match(decisionBlockers({ ...ok, reviewed: false, status: 'approved' }).join(' '), /Confirma que quieres ejecutar/);
  assert.match(decisionBlockers({ ...ok, status: 'approved', connected: false }).join(' '), /Google no está conectado/);
  assert.deepEqual(decisionBlockers({ ...ok, status: 'draft', connected: false }), [], 'aprobar no exige conexión Google');
  assert.match(decisionBlockers({ ...ok, dirty: true }).join(' '), /Guarda los cambios/);
  assert.match(decisionBlockers({ ...ok, blockedRecipient: true }).join(' '), /propia cuenta Google/);
  assert.match(decisionBlockers({ ...ok, canWrite: false }).join(' '), /solo lectura/);
  assert.match(decisionBlockers({ ...ok, busy: true }).join(' '), /operación en curso/);
});
test('R-07 prepareBlockers y R-05 openDraftFor', () => {
  assert.deepEqual(prepareBlockers({ busy: false, canWrite: true, contact: 'c' }), []);
  assert.equal(prepareBlockers({ busy: true, canWrite: false, contact: '' }).length, 3);
  const open = proposal('A', { contact_id: 'c1' }), done = proposal('B', { contact_id: 'c2', status: 'verified' });
  assert.equal(openDraftFor(asProposals([open, done]), 'c1'), open); assert.equal(openDraftFor(asProposals([open, done]), 'c2'), undefined); assert.equal(openDraftFor(asProposals([open]), ''), undefined);
});
test('R-12 contactLabel distingue homónimos y filterContacts busca sin acentos con tope', () => {
  const list = [contact('1', 'Ana', 'García', 'ana@a.es'), contact('2', 'Ana', 'García', 'ana@b.es'), contact('3', 'José', 'Pérez', ''), contact('4', '', '', 'x@y.es')];
  assert.notEqual(contactLabel(list[0]), contactLabel(list[1])); assert.match(contactLabel(list[2]), /sin correo/); assert.match(contactLabel(list[3]), /Contacto sin nombre/);
  assert.deepEqual(filterContacts(list, 'garcia').items.map(c => c.id), ['1', '2']); assert.deepEqual(filterContacts(list, 'jose').items.map(c => c.id), ['3']); assert.deepEqual(filterContacts(list, 'b.es').items.map(c => c.id), ['2']);
  const many = Array.from({ length: 250 }, (_, i) => contact(String(i), 'N' + i, '', 'n' + i + '@x.es'));
  const page = filterContacts(many, '', 100); assert.equal(page.items.length, 100); assert.equal(page.total, 250);
});

// ---------- CommercialWorkspace ----------
test('R-02 editar B y guardar A no pisa la edición de B; B sigue pendiente', async () => {
  const state = { current: overview([proposal('A'), proposal('B')]) };
  const { editor, dirtyCalls, settleRender, server } = await boot(state, { '/proposals/A/edit': (body: any) => { state.current = overview([proposal('A', { content: body, content_hash: 'h-A2' }), proposal('B')]); return {}; } });
  editor('B').props.onChange('body', 'EDITADO'); await settleRender();
  assert.equal(editor('B').props.dirty, true); assert.equal(editor('B').props.proposal.content.body, 'EDITADO');
  editor('A').props.onSave(); await settleRender(); await settleRender();
  assert.ok(server.log.some(r => r.path.endsWith('/proposals/A/edit')));
  assert.equal(editor('B').props.proposal.content.body, 'EDITADO', 'la edición de B sobrevive a la recarga'); assert.equal(editor('B').props.dirty, true); assert.equal(editor('A').props.dirty, false);
  assert.deepEqual(dirtyCalls, [0, 1], 'el padre sabe que queda 1 borrador pendiente');
});
test('R-02 si el servidor cambió B, se descarta su edición y se avisa', async () => {
  const state = { current: overview([proposal('A'), proposal('B')]) };
  const { editor, h, settleRender } = await boot(state, { '/proposals/A/edit': () => { state.current = overview([proposal('A', { content_hash: 'h-A2' }), proposal('B', { content_hash: 'h-B-nuevo', content: content('B', { body: 'SERVIDOR' }) })]); return {}; } });
  editor('B').props.onChange('body', 'EDITADO'); await settleRender();
  editor('A').props.onSave(); await settleRender(); await settleRender();
  assert.equal(editor('B').props.proposal.content.body, 'SERVIDOR'); assert.equal(editor('B').props.dirty, false);
  assert.match(h.text(), /se ha descartado tu edición sin guardar/);
});
test('R-03 tras aprobar se exige una confirmación nueva antes de ejecutar', async () => {
  const state = { current: overview([proposal('A')]) };
  const { editor, settleRender, server } = await boot(state, { '/proposals/A/approve': () => { state.current = overview([proposal('A', { status: 'approved' })]); return {}; } });
  editor('A').props.onReview(true); await settleRender(); assert.equal(editor('A').props.reviewed, true);
  editor('A').props.onApprove(); await settleRender(); await settleRender();
  assert.equal(editor('A').props.proposal.status, 'approved'); assert.equal(editor('A').props.reviewed, false, 'la revisión previa no autoriza la ejecución');
  assert.ok(!server.log.some(r => r.path.endsWith('/execute')), 'no se ha ejecutado nada');
});
test('R-03 ejecutar limpia la revisión aunque falle y no se repite sin nueva confirmación', async () => {
  const state = { current: overview([proposal('A', { status: 'approved' })]) };
  const { editor, settleRender, h } = await boot(state, { '/proposals/A/execute': () => new Error('Google rechazó la petición') });
  editor('A').props.onReview(true); await settleRender();
  editor('A').props.onExecute(); await settleRender(); await settleRender();
  assert.match(h.text(), /Google rechazó la petición/); assert.equal(editor('A').props.reviewed, false);
});
test('R-04 el editor sabe si Google está conectado', async () => {
  const off = await boot({ current: overview([proposal('A', { status: 'approved' })], { connection: null }) });
  assert.equal(off.editor('A').props.connected, false);
  const on = await boot({ current: overview([proposal('A', { status: 'approved' })]) });
  assert.equal(on.editor('A').props.connected, true);
});
test('R-13 una recarga fallida tras una acción correcta no se presenta como fallo de la acción', async () => {
  const state = { current: overview([proposal('A')]) };
  let reads = 0;
  const server = fakeServer({ '/commercial': () => (++reads === 1 ? state.current : new Error('sin red')), '/proposals/A/approve': () => ({}) });
  const c = commercial(server, state); c.h.render(); c.h.render(); await c.settleRender(); await c.settleRender();
  c.editor('A').props.onReview(true); await c.settleRender();
  c.editor('A').props.onApprove(); await c.settleRender(); await c.settleRender();
  assert.match(c.h.text(), /Propuesta aprobada/); assert.match(c.h.text(), /La acción se realizó, pero no se pudo actualizar la lista: sin red/);
  assert.equal(c.h.byTag('button').filter(b => /Preparar seguimiento/.test(c.h.text(b))).length, 1, 'la pantalla sigue operativa');
});
test('R-06 un fallo en la primera carga ofrece Reintentar en lugar de un spinner eterno', async () => {
  let reads = 0;
  const state = { current: overview([proposal('A')]) };
  const server = fakeServer({ '/commercial': () => (++reads === 1 ? new Error('500 inicial') : state.current) });
  const c = commercial(server, state); c.h.render(); c.h.render(); await c.settleRender();
  const failure = c.h.named('LoadError'); assert.equal(failure.length, 1); assert.equal(failure[0].props.message, '500 inicial');
  failure[0].props.onRetry(); c.h.render(); await c.settleRender(); await c.settleRender();
  assert.equal(c.h.named('LoadError').length, 0); assert.ok(c.editor('A'));
});
test('R-05 preparar con un borrador abierto para el mismo cliente pide confirmación', async () => {
  const state = { current: overview([proposal('A', { contact_id: 'c1', content: content('A', { subject: 'Seguimiento abierto' }) })], { contacts: [contact('c1', 'Ana', 'García', 'ana@a.es')] }) };
  const { h, server, settleRender } = await boot(state, { '/v6/proposals': () => ({ id: 'NEW' }) });
  h.named('ContactSelect')[0].props.onChange('c1'); await settleRender();
  setConfirm(false); h.button(/Preparar seguimiento/).props.onClick(); await settleRender();
  assert.ok(!server.log.some(r => r.path.endsWith('/v6/proposals') && r.body));
  setConfirm(true); h.button(/Preparar seguimiento/).props.onClick(); await settleRender(); await settleRender();
  assert.equal(server.log.filter(r => r.path.endsWith('/v6/proposals') && r.body?.contactId === 'c1').length, 1);
});
test('R-05 sin borrador abierto no pregunta; R-07 el botón explica por qué está bloqueado', async () => {
  setConfirm(() => { throw new Error('No debía preguntar'); });
  const state = { current: overview([], { contacts: [contact('c1', 'Ana', 'García', 'ana@a.es')] }) };
  const { h, server, settleRender } = await boot(state, { '/v6/proposals': () => ({ id: 'NEW' }) });
  const prepare = () => h.button(/Preparar seguimiento/);
  assert.equal(prepare().props.disabled, true); const reason = h.nodes().find(n => n.props.id === prepare().props['aria-describedby']); assert.ok(reason, 'el motivo existe como elemento'); assert.match(h.text(reason), /Selecciona un cliente/);
  h.named('ContactSelect')[0].props.onChange('c1'); await settleRender();
  assert.equal(prepare().props.disabled, false); assert.equal(prepare().props['aria-describedby'], undefined);
  prepare().props.onClick(); await settleRender(); await settleRender();
  assert.equal(server.log.filter(r => r.path.endsWith('/v6/proposals') && r.body).length, 1);
});
test('R-14 un lector ve una nota de solo lectura y el botón explica el motivo', async () => {
  const { h } = await boot({ current: overview([]) }, {}, { canWrite: false });
  assert.match(h.text(), /Solo lectura/); assert.match(h.text(), /Tu acceso es de solo lectura/);
});
test('R-11 cambiar la cuenta o el consentimiento retira el enlace de autorización anterior', async () => {
  const state = { current: overview([], { connection: null, configured: true }) };
  const { h, settleRender } = await boot(state, { '/google/begin': () => ({ url: 'https://accounts.example/auth', state: 's1' }) });
  const email = () => h.byTag('input', n => n.props.type === 'email')[0], consent = () => h.byTag('input', n => n.props.type === 'checkbox')[0];
  email().props.onChange({ target: { value: 'a@b.es' } }); await settleRender(); consent().props.onChange({ target: { checked: true } }); await settleRender();
  h.button('Preparar autorización Google').props.onClick(); await settleRender(); await settleRender();
  const link = () => h.byTag('a', n => n.props.href === 'https://accounts.example/auth');
  assert.equal(link().length, 1);
  email().props.onChange({ target: { value: 'otra@b.es' } }); await settleRender(); assert.equal(link().length, 0, 'cuenta cambiada');
  h.button('Preparar autorización Google').props.onClick(); await settleRender(); await settleRender(); assert.equal(link().length, 1);
  consent().props.onChange({ target: { checked: false } }); await settleRender(); assert.equal(link().length, 0, 'consentimiento retirado');
});
test('R-01 el padre recibe el número de borradores sin guardar y se pone a cero al desmontar', async () => {
  const state = { current: overview([proposal('A'), proposal('B')]) };
  const { editor, dirtyCalls, settleRender, h } = await boot(state);
  editor('A').props.onChange('subject', 'x'); editor('B').props.onChange('subject', 'y'); await settleRender();
  assert.equal(dirtyCalls.at(-1), 2); h.unmount(); assert.equal(dirtyCalls.at(-1), 0);
});
test('R-19 cambiar de pestaña limpia avisos y errores anteriores', async () => {
  const state = { current: overview([proposal('A')]) };
  const { editor, h, settleRender } = await boot(state, { '/proposals/A/approve': () => ({}) });
  editor('A').props.onReview(true); await settleRender(); editor('A').props.onApprove(); await settleRender(); await settleRender();
  assert.match(h.text(), /Propuesta aprobada/);
  h.named('TabList')[0].props.onChange('import'); await settleRender(); assert.ok(!h.text().includes('Propuesta aprobada'));
});

// ---------- TabList ----------
test('R-15 TabList: flechas, Inicio y Fin, tabIndex móvil y panel enlazado', () => {
  const tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
  const picked: string[] = [];
  const h = mount('TabList.tsx', 'TabList', {}, { label: 'x', prefix: 'p', tabs, value: 'b', onChange: (id: string) => picked.push(id) });
  h.render(); h.render();
  const buttons = () => h.byTag('button'), press = (i: number, key: string) => buttons()[i].props.onKeyDown({ key, preventDefault() {} });
  assert.deepEqual(buttons().map(b => b.props.tabIndex), [-1, 0, -1]); assert.equal(buttons()[1].props['aria-controls'], 'p-panel-b'); assert.equal(buttons()[1].props.role, 'tab');
  press(1, 'ArrowRight'); press(2, 'ArrowRight'); press(0, 'ArrowLeft'); press(1, 'Home'); press(1, 'End'); press(1, 'x');
  assert.deepEqual(picked, ['c', 'a', 'c', 'a', 'c']);
});

// ---------- Modal ----------
function fakeDocument() {
  const listeners: { type: string; fn: (e: any) => void }[] = []; let added = 0;
  Object.assign(globalThis, { document: { activeElement: null, addEventListener: (type: string, fn: any) => { added++; listeners.push({ type, fn }); }, removeEventListener: (type: string, fn: any) => { const i = listeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); }, querySelector: () => null, querySelectorAll: () => [] } });
  return { registrations: () => added, keydown: () => listeners.filter(l => l.type === 'keydown'), press: (key: string) => listeners.filter(l => l.type === 'keydown').forEach(l => l.fn({ key, shiftKey: false, preventDefault() {} })) };
}
const modalMocks = { api: { api: async () => ({}), ApiError: class extends Error {} }, ReferenceSelect: { ReferenceSelect: () => null }, model: { validateRecord: () => ({}) } };
test('R-10 Modal: Escape, fondo y botón Cerrar pasan por la guarda de cierre', () => {
  const doc = fakeDocument(); let closed = 0, allow = false;
  const h = mount('components.tsx', 'Modal', modalMocks, { title: 'Ficha', children: null, close: () => closed++, confirmClose: () => allow });
  h.render();
  doc.press('Escape'); assert.equal(closed, 0, 'Escape no cierra con texto sin guardar');
  const root = h.nodes()[0]; root.props.onMouseDown({ target: 1, currentTarget: 1 }); assert.equal(closed, 0, 'clic en el fondo tampoco');
  h.byTag('button').find(b => b.props['aria-label'] === 'Cerrar')!.props.onClick(); assert.equal(closed, 0);
  allow = true; doc.press('Escape'); assert.equal(closed, 1);
  h.byTag('button').find(b => b.props['aria-label'] === 'Cerrar')!.props.onClick(); assert.equal(closed, 2);
  h.unmount();
});
test('R-19 Modal: un close nuevo en cada pintado no reinicia el efecto ni roba el foco, y se usa el último', () => {
  const doc = fakeDocument(); const calls: string[] = [];
  const h = mount('components.tsx', 'Modal', modalMocks, { title: 'Ficha', children: null, close: () => calls.push('viejo') });
  h.render(); const registered = doc.registrations(), before = doc.keydown().length;
  h.render({ close: () => calls.push('nuevo') }); h.render({ close: () => calls.push('nuevo') });
  assert.equal(doc.registrations(), registered, 'el efecto no se reinicia (si lo hiciera, devolvería el foco a la página y luego al botón Cerrar)');
  assert.equal(doc.keydown().length, before, 'sin listeners duplicados');
  doc.press('Escape'); assert.deepEqual(calls, ['nuevo']);
  h.unmount();
});

// ---------- TeamContacts ----------
const records = (n: number) => Array.from({ length: n }, (_, i) => ({ entity: 'contacts', id: 'c' + i, version: 1, value: contact('c' + i, i === 0 ? 'Ana' : 'Persona' + i, i === 0 ? 'García' : 'N', 'p' + i + '@x.es') }));
const contactsMocks = { components: { Spinner: function Spinner() { return null; } }, ...stub('CustomerDossier') };
async function contactsHarness(routes: Record<string, any>, props: Record<string, any> = {}) {
  const server = fakeServer(routes);
  const h = mount('TeamContacts.tsx', 'TeamContacts', contactsMocks, { tenant: 'T1', records: records(3), canWrite: true, canConnect: true, busy: false, call: server.call, onRefresh() {}, onEdit() {}, onPrepared() {}, ...props });
  h.render(); h.render(); await settle(); h.render();
  return { h, server };
}
test('R-06 TeamContacts: ofrece Reintentar y el error se limpia cuando una lectura posterior funciona', async () => {
  let reads = 0;
  const { h } = await contactsHarness({ '/commercial': () => (++reads === 1 ? new Error('fallo inicial') : { source: { origin: 'local' } }) });
  assert.equal(h.named('LoadError')[0].props.message, 'fallo inicial');
  h.named('LoadError')[0].props.onRetry(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError').length, 0); assert.match(h.text(), /3 contactos/);
});
test('R-06 TeamContacts: un fallo posterior mantiene la tabla y el siguiente éxito limpia el aviso', async () => {
  let reads = 0;
  const { h } = await contactsHarness({ '/commercial': () => { reads++; return reads === 2 ? new Error('fallo transitorio') : { source: { origin: 'local' } }; } });
  h.render({ records: records(3) }); await settle(); h.render();
  assert.equal(h.named('LoadError')[0].props.message, 'fallo transitorio'); assert.match(h.text(), /3 contactos/, 'la tabla sigue visible');
  h.render({ records: records(4) }); await settle(); h.render();
  assert.equal(h.named('LoadError').length, 0); assert.match(h.text(), /4 contactos/);
});
test('R-12 TeamContacts: búsqueda sin acentos y paginación', async () => {
  const { h } = await contactsHarness({ '/commercial': { source: { origin: 'local' } } }, { records: records(250) });
  const names = () => h.byTag('button', n => n.props.className === 'customer-name-button').length;
  assert.equal(names(), 100); assert.match(h.text(), /Mostrar 100 más \(100 de 250\)/);
  h.byTag('button').find(b => /Mostrar 100 más/.test(h.text(b)))!.props.onClick(); h.render(); assert.equal(names(), 200);
  h.byTag('input', n => n.props.type === 'search')[0].props.onChange({ target: { value: 'garcia' } }); h.render(); h.render();
  assert.equal(names(), 1); assert.match(h.text(), /1 coinciden/);
  h.byTag('input', n => n.props.type === 'search')[0].props.onChange({ target: { value: 'zzz' } }); h.render(); h.render();
  assert.match(h.text(), /Ningún contacto coincide/);
});
test('R-19 TeamContacts: el nombre accesible no incluye "undefined" ni un ID', async () => {
  const noName = [{ entity: 'contacts', id: 'uuid-123', version: 1, value: { entity: 'contacts', id: 'uuid-123', values: { email: 'x@y.es' } } }];
  const { h } = await contactsHarness({ '/commercial': { source: { origin: 'local' } } }, { records: noName });
  const edit = h.byTag('button', n => String(n.props['aria-label'] ?? '').startsWith('Editar teléfono de'))[0];
  assert.equal(edit.props['aria-label'], 'Editar teléfono de x@y.es'); assert.ok(!h.text().includes('uuid-123')); assert.match(h.text(), /Contacto sin nombre/);
});

// ---------- TeamAgentWorkspace ----------
const agentData = (over: Record<string, any> = {}) => ({ configured: false, connected: false, account: null, monthlyLimit: 50, localAI: undefined, source: { origin: 'hubspot', isTestData: false }, priorities: [{ id: 'o1', label: 'Oportunidad uno', reason: 'Sin acción', stage: 'Propuesta', contactId: 'c1' }], runs: [], ...over });
const preview = { contactId: 'c1', sourceKey: 'k', opportunityId: 'o1', revision: 'r1', context: [{ label: 'Cliente', value: 'Ana' }], draft: { subject: 'Hola', body: 'Texto' } };
const agentMocks = { components: { Spinner: function Spinner() { return null; } } };
test('R-09 el agente entrega a Comercial el id de la propuesta que acaba de preparar', async () => {
  const opened: (string | undefined)[] = [];
  const server = fakeServer({ '/copilot': () => agentData(), '/preview/o1': () => preview, '/v6/proposals': () => ({ id: 'NUEVA' }) });
  const h = mount('TeamAgentWorkspace.tsx', 'TeamAgentWorkspace', agentMocks, { tenant: 'T1', call: server.call, canWrite: true, canConnect: true, onProposal: (id?: string) => opened.push(id) });
  h.render(); h.render(); await settle(); h.render();
  h.button('Revisar contexto').props.onClick(); await settle(); await settle(); h.render();
  h.button('Preparar borrador con las reglas de Plan B').props.onClick(); await settle(); await settle(); h.render();
  assert.deepEqual(opened, ['NUEVA']);
});
test('R-09 aplicar un análisis guardado abre ese borrador', async () => {
  const opened: (string | undefined)[] = [];
  const run = { id: 'run1', status: 'succeeded', provider: 'ollama', model: 'm', created_at: '2026-10-29T10:00:00Z', result: { subject: 'S', body: 'B' }, proposal_id: null, error: null };
  const server = fakeServer({ '/copilot': () => agentData({ runs: [run] }), '/runs/run1/apply': () => ({ id: 'P-APLICADA' }) });
  const h = mount('TeamAgentWorkspace.tsx', 'TeamAgentWorkspace', agentMocks, { tenant: 'T1', call: server.call, canWrite: true, canConnect: true, onProposal: (id?: string) => opened.push(id) });
  h.render(); h.render(); await settle(); h.render();
  h.button('Guardar como propuesta para revisar').props.onClick(); await settle(); await settle();
  assert.deepEqual(opened, ['P-APLICADA']);
});
test('R-06/R-13 el agente ofrece Reintentar y no convierte una recarga fallida en fallo de la acción', async () => {
  let reads = 0;
  const server = fakeServer({ '/copilot': () => (++reads === 1 ? new Error('caída inicial') : reads === 3 ? new Error('sin red') : agentData()), '/preview/o1': () => preview });
  const h = mount('TeamAgentWorkspace.tsx', 'TeamAgentWorkspace', agentMocks, { tenant: 'T1', call: server.call, canWrite: true, canConnect: true, onProposal() {} });
  h.render(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError')[0].props.message, 'caída inicial'); h.named('LoadError')[0].props.onRetry(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError').length, 0);
  h.button('Revisar contexto').props.onClick(); await settle(); await settle(); h.render();
  assert.match(h.text(), /La acción se realizó, pero no se pudo actualizar el panel: sin red/); assert.match(h.text(), /Contexto y borrador propuesto/, 'el contexto leído sigue visible');
});
test('R-07 "Analizar y mejorar" explica por qué está deshabilitado', async () => {
  const server = fakeServer({ '/copilot': () => agentData({ configured: true, connected: false, account: null }), '/preview/o1': () => preview });
  const h = mount('TeamAgentWorkspace.tsx', 'TeamAgentWorkspace', agentMocks, { tenant: 'T1', call: server.call, canWrite: true, canConnect: true, onProposal() {} });
  h.render(); h.render(); await settle(); h.render(); h.button('Revisar contexto').props.onClick(); await settle(); await settle(); h.render();
  const analyze = h.button('Analizar y mejorar borrador');
  assert.equal(analyze.props.disabled, true); const why = h.nodes().find(n => n.props.id === analyze.props['aria-describedby']); assert.ok(why, 'el motivo existe como elemento'); assert.match(h.text(why), /Marca que has revisado el contexto/); assert.match(h.text(), /Microsoft no está autorizado/);
});

// ---------- CustomerDossier ----------
const dossier = (over: Record<string, any> = {}) => ({ source: { key: 'k', origin: 'hubspot', isTestData: false, capturedAt: '2026-10-28T10:00:00Z', canPrepare: true }, contact: { name: 'Ana', email: 'a@x.es', phone: null }, companies: [], owner: { name: null, id: null }, opportunities: [], actions: [{ id: 'a1', title: 'Llamar', status: 'open', due_at: '2099-01-01T10:00:00Z', version: 1 }], capturedTasks: [], ...over });
const dossierMocks = { components: { Modal: function Modal() { return null; }, Spinner: function Spinner() { return null; } }, ...stub('CustomerFiles') };
function dossierHarness(routes: Record<string, any>, props: Record<string, any> = {}) {
  const server = fakeServer(routes);
  const h = mount('CustomerDossier.tsx', 'CustomerDossier', dossierMocks, { tenant: 'T1', contact: 'c1', local: false, canWrite: true, canConnect: true, call: server.call, close() {}, onPrepared() {}, ...props });
  return { h, server };
}
test('R-06 la ficha ofrece Reintentar si falla la primera lectura', async () => {
  let reads = 0;
  const { h } = dossierHarness({ '/customers/c1': () => (++reads === 1 ? new Error('404 ficha') : dossier()) });
  h.render(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError')[0].props.message, '404 ficha'); h.named('LoadError')[0].props.onRetry(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError').length, 0); assert.match(h.text(), /Ficha comercial|Oportunidades/);
});
test('R-10 la ficha pide confirmación al cerrar solo si hay texto o archivos sin guardar', async () => {
  const { h } = dossierHarness({ '/customers/c1': () => dossier() });
  h.render(); h.render(); await settle(); h.render();
  const modal = () => h.named('Modal')[0]; setConfirm(() => { throw new Error('No debía preguntar'); });
  assert.equal(modal().props.confirmClose(), true);
  h.byTag('input', n => n.props.maxLength === 200)[0].props.onChange({ target: { value: 'Llamar mañana' } }); h.render();
  setConfirm(false); assert.equal(modal().props.confirmClose(), false); setConfirm(true); assert.equal(modal().props.confirmClose(), true);
  h.named('CustomerFiles')[0].props.onPendingChange(2); h.render(); setConfirm(false); assert.equal(modal().props.confirmClose(), false);
});
test('R-10 archivos seleccionados sin vincular también cuentan como pendientes', async () => {
  const { h } = dossierHarness({ '/customers/c1': () => dossier() });
  h.render(); h.render(); await settle(); h.render();
  h.named('CustomerFiles')[0].props.onPendingChange(2); h.render(); setConfirm(false); assert.equal(h.named('Modal')[0].props.confirmClose(), false);
  h.named('CustomerFiles')[0].props.onPendingChange(0); h.render(); assert.equal(h.named('Modal')[0].props.confirmClose(), true);
});
test('R-13 completar una acción: si la recarga falla se informa sin presentar la acción como fallida', async () => {
  let reads = 0;
  const { h, server } = dossierHarness({ '/customers/c1?': () => (++reads === 1 ? dossier() : new Error('sin red')), '/actions/a1': () => ({}) });
  h.render(); h.render(); await settle(); h.render();
  h.byTag('button', n => n.props['aria-label'] === 'Completar Llamar')[0].props.onClick(); await settle(); await settle(); h.render();
  assert.ok(server.log.some(r => r.path.includes('/actions/a1') && r.body?.status === 'completed'));
  assert.match(h.text(), /Acción completada en Plan B/); assert.match(h.text(), /La acción se realizó, pero no se pudo actualizar la ficha: sin red/);
});
test('R-14 un lector no lee "Puedes guardar una aquí"', async () => {
  const { h } = dossierHarness({ '/customers/c1': () => dossier({ actions: [] }) }, { canWrite: false });
  h.render(); h.render(); await settle(); h.render();
  assert.ok(!h.text().includes('Puedes guardar una aquí')); assert.match(h.text(), /solo lectura; una persona con permiso de edición/);
});

// ---------- CustomerFiles ----------
const filesMocks = { components: { Spinner: function Spinner() { return null; } } };
test('R-06/R-13 documentos: Reintentar tras un fallo inicial y recarga fallida tras desvincular', async () => {
  let reads = 0;
  const library = { links: [{ id: 'l1', contact_id: 'c1', file_id: 'f1', name: 'Propuesta', mime_type: 'application/vnd.google-apps.document', url: 'https://docs.google.com/x' }], sourceKey: 'k', account: 'me@x.es', connected: true, pickerConfigured: false, legacyCount: 0, connectionRevision: 'r1' };
  const server = fakeServer({ '/file-links?': () => (++reads === 1 ? new Error('fallo biblioteca') : reads === 3 ? new Error('sin red') : library), '/file-links/l1/detach': () => ({}) });
  const h = mount('CustomerFiles.tsx', 'CustomerFiles', filesMocks, { tenant: 'T1', contact: 'c1', canWrite: true, canConnect: true, call: server.call });
  h.render(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError')[0].props.message, 'fallo biblioteca'); h.named('LoadError')[0].props.onRetry(); h.render(); await settle(); h.render();
  assert.equal(h.named('LoadError').length, 0); assert.match(h.text(), /Propuesta/);
  h.button('Quitar vínculo').props.onClick(); h.render(); h.button('Confirmar retirada').props.onClick(); await settle(); await settle(); h.render();
  assert.match(h.text(), /Vínculo retirado/); assert.match(h.text(), /La acción se realizó, pero no se pudo actualizar los vínculos: sin red/);
});

// ---------- Recarga fallida con datos ya cargados: debe existir el control que el aviso cita ----------
test('R-13 Comercial: tras una recarga fallida aparece «Actualizar lista» y la vista se puede refrescar', async () => {
  const state = { current: overview([proposal('A')]) };
  let reads = 0;
  const server = fakeServer({ '/commercial': () => (++reads === 2 ? new Error('sin red') : state.current), '/proposals/A/approve': () => { state.current = overview([proposal('A', { status: 'approved' })]); return {}; } });
  const c = commercial(server, state); c.h.render(); c.h.render(); await c.settleRender(); await c.settleRender();
  c.editor('A').props.onReview(true); await c.settleRender(); c.editor('A').props.onApprove(); await c.settleRender(); await c.settleRender();
  assert.match(c.h.text(), /Usa «Actualizar lista»/); assert.equal(c.editor('A').props.proposal.status, 'draft', 'la vista sigue obsoleta hasta refrescar');
  c.h.button('Actualizar lista').props.onClick(); await c.settleRender(); await c.settleRender();
  assert.equal(c.editor('A').props.proposal.status, 'approved'); assert.equal(c.h.byTag('button').filter(b => c.h.text(b) === 'Actualizar lista').length, 0, 'el control desaparece al refrescar');
});
test('R-13 agente: tras una recarga fallida aparece «Actualizar panel»', async () => {
  let reads = 0;
  const server = fakeServer({ '/copilot': () => (++reads === 2 ? new Error('sin red') : agentData()), '/preview/o1': () => preview });
  const h = mount('TeamAgentWorkspace.tsx', 'TeamAgentWorkspace', agentMocks, { tenant: 'T1', call: server.call, canWrite: true, canConnect: true, onProposal() {} });
  h.render(); h.render(); await settle(); h.render();
  h.button('Revisar contexto').props.onClick(); await settle(); await settle(); h.render();
  assert.match(h.text(), /Usa «Actualizar panel»/); h.button('Actualizar panel').props.onClick(); await settle(); await settle(); h.render();
  assert.ok(!h.text().includes('Actualizar panel')); assert.ok(!h.text().includes('no se pudo actualizar'));
});

// ---------- CommercialEditor real (sin sustituir): enlace entre decisionBlockers y los botones ----------
const editorProps = (over: Record<string, any> = {}) => ({ proposal: proposal('A'), busy: false, canWrite: true, connected: true, dirty: false, reviewed: true, demo: false, blockedRecipient: false, onChange() {}, onReview() {}, onSave() {}, onApprove() {}, onExecute() {}, ...over });
function realEditor(over: Record<string, any> = {}) {
  const h = mount('CommercialEditor.tsx', 'CommercialEditor', { CommercialEmailPreview: { CommercialEmailPreview: function CommercialEmailPreview() { return null; } } }, editorProps(over));
  h.render(); h.render();
  const primary = () => h.button(/^(Aprobar seguimiento|Ejecutar acciones aprobadas|Ejecutar ensayo aprobado)$/);
  const reason = () => { const id = primary().props['aria-describedby']; return id ? h.text(h.nodes().find(n => n.props.id === id)) : ''; };
  return { h, primary, reason };
}
test('Editor real: Aprobar se habilita solo con todas las condiciones y cada bloqueo se explica', () => {
  const ok = realEditor(); assert.equal(ok.primary().props.disabled, false); assert.equal(ok.primary().props['aria-describedby'], undefined); assert.equal(ok.primary().props.onClick, ok.h.nodes()[0] && ok.primary().props.onClick);
  for (const [over, expected] of [[{ reviewed: false }, /revisado el destinatario/], [{ dirty: true }, /Guarda los cambios/], [{ blockedRecipient: true }, /propia cuenta Google/], [{ canWrite: false }, /solo lectura/], [{ busy: true }, /operación en curso/]] as [Record<string, any>, RegExp][]) {
    const e = realEditor(over); assert.equal(e.primary().props.disabled, true, JSON.stringify(over)); assert.match(e.reason(), expected);
  }
});
test('Editor real: Ejecutar exige confirmación nueva y conexión Google (salvo ensayo)', () => {
  const approved = proposal('A', { status: 'approved' });
  const unconfirmed = realEditor({ proposal: approved, reviewed: false }); assert.equal(unconfirmed.primary().props.disabled, true); assert.match(unconfirmed.reason(), /Confirma que quieres ejecutar/); assert.match(unconfirmed.h.text(), /Confirmo que quiero ejecutar ahora/);
  const offline = realEditor({ proposal: approved, connected: false }); assert.equal(offline.primary().props.disabled, true); assert.match(offline.reason(), /Google no está conectado/);
  const demo = realEditor({ proposal: approved, connected: false, demo: true }); assert.equal(demo.primary().props.disabled, false); assert.equal(demo.h.button('Ejecutar ensayo aprobado').props.disabled, false);
  const live = realEditor({ proposal: approved }); assert.equal(live.primary().props.disabled, false);
});
test('Editor real: aprobar no llama a ejecutar y el botón de ejecutar no llama a aprobar', () => {
  const calls: string[] = [];
  const draft = realEditor({ onApprove: () => calls.push('aprobar'), onExecute: () => calls.push('ejecutar') }); draft.primary().props.onClick();
  const approved = realEditor({ proposal: proposal('A', { status: 'approved' }), onApprove: () => calls.push('aprobar'), onExecute: () => calls.push('ejecutar') }); approved.primary().props.onClick();
  assert.deepEqual(calls, ['aprobar', 'ejecutar']);
});
