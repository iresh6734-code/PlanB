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
  const resolveFile = (spec: string, from: string) => {
    const base = path.resolve(from, spec.replace(/\.js$/, ''));
    return ['.tsx', '.ts'].map(ext => base + ext).find(file => fs.existsSync(file));
  };
  const jsx = (type: any, props: Record<string, any>) => ({ type, props });
  const requireFrom = (spec: string, from = SRC): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => (hooks as any)[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (spec.endsWith('.css')) return {};
    const key = path.basename(spec).replace(/\.js$/, '');
    if (key in mocks) return mocks[key];
    const file = resolveFile(spec, from);
    if (!file) throw new Error('Dependencia no resuelta en la prueba: ' + spec);
    if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} };
    cache.set(file, mod.exports);
    new Function('require', 'exports', 'module', code)((next: string) => requireFrom(next, path.dirname(file)), mod.exports, mod);
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

Object.assign(globalThis, { location: { search: '' }, sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });

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

// ---------- Modal dentro de una pantalla bloqueada (sesión caducada) ----------
test('FIX-020 Modal: dentro de una pantalla oculta o inerte Escape no lo cierra; visible, sí', () => {
  const doc = fakeDocument(); let closed = 0;
  const h = mount('components.tsx', 'Modal', modalMocks, { title: 'Ficha', children: null, close: () => closed++ });
  h.render();
  const section = h.nodes().find(n => n.type === 'section')!; let hiddenAncestor: object | null = {};
  section.props.ref.current = { closest: (selector: string) => { assert.equal(selector, '[inert],[hidden]'); return hiddenAncestor; } };
  doc.press('Escape'); assert.equal(closed, 0, 'oculto o inerte: no se cierra');
  hiddenAncestor = null; doc.press('Escape'); assert.equal(closed, 1, 'visible: se cierra');
  h.unmount();
});

test('A2 Modal: con dos ventanas abiertas, Escape solo cierra la de arriba', () => {
  const doc = fakeDocument(); let closed = 0;
  const h = mount('components.tsx', 'Modal', modalMocks, { title: 'Debajo', children: null, close: () => closed++ });
  h.render();
  const panel = { closest: () => null }, other = {};
  h.nodes().find(n => n.type === 'section')!.props.ref.current = panel;
  let open: object[] = [panel, other];
  (globalThis as any).document.querySelectorAll = (selector: string) => selector === '[role="dialog"]' ? open : [];
  doc.press('Escape'); assert.equal(closed, 0, 'otra ventana está encima');
  open = [other, panel]; doc.press('Escape'); assert.equal(closed, 1, 'esta es la de arriba');
  h.unmount();
});
