import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Ejecuta el componente real con ranuras de hooks controladas. No es React DOM ni un navegador: comprueba el estado
// y los atributos ARIA que el componente entrega; el comportamiento real con teclado y ratón lo cubre el recorrido de navegador.
const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
type VNode = { type: any; props: Record<string, any> };
function load(file: string, hooks: any, cache = new Map<string, any>()): any {
  const resolveFile = (spec: string) => { const base = path.resolve(SRC, spec.replace(/\.js$/, '')); return ['.tsx', '.ts'].map(ext => base + ext).find(candidate => fs.existsSync(candidate)); };
  const jsx = (type: any, props: Record<string, any>) => ({ type, props });
  const requireFrom = (spec: string): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => hooks[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec === 'lucide-react') return new Proxy({}, { get: (_t, name) => function Icon() { return null; } });
    if (spec.endsWith('.css')) return {};
    const resolved = resolveFile(spec); if (!resolved) throw new Error('Dependencia no resuelta: ' + spec);
    if (cache.has(resolved)) return cache.get(resolved);
    const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} }; cache.set(resolved, mod.exports);
    new Function('require', 'exports', 'module', code)(requireFrom, mod.exports, mod); cache.set(resolved, mod.exports); return mod.exports;
  };
  return requireFrom('./' + file.replace(/\.tsx?$/, ''));
}

const contact = (id: string, firstname: string, lastname: string, email: string, phone = '') => ({ entity: 'contacts', id, values: { firstname, lastname, email, phone } });
const base = [contact('c1', 'Ana', 'García', 'ana@a.es'), contact('c2', 'José', 'Pérez', 'jose@b.es', '600111222'), contact('c3', 'Luis', 'Martín', 'luis@c.es')];

function mount(props: Record<string, any>) {
  const slots: any[] = []; let cursor = 0, ids = 0, tree: any, effects: (() => void)[] = [], current = props;
  const hooks = {
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); },
    useId() { const i = cursor++; return slots[i] ?? (slots[i] = ':c' + ids++ + ':'); },
    useEffect(run: () => void | (() => void), deps?: unknown[]) { const i = cursor++, prior = slots[i]; if (!prior || !deps || deps.some((d, n) => !Object.is(d, prior.deps?.[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const Component = load('CustomerCombobox.tsx', hooks).CustomerCombobox;
  const render = (next: Record<string, any> = {}) => { current = { ...current, ...next }; cursor = 0; tree = Component(current); const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; };
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(child => walk(child)) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : [];
  const flat = (node: any): string => Array.isArray(node) ? node.map(child => flat(child)).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const api = {
    render, nodes: () => walk(tree), text: (node?: any) => flat(node === undefined ? tree : node),
    input: () => walk(tree).find(n => n.type === 'input')!,
    list: () => walk(tree).find(n => n.type === 'ul'),
    options: () => walk(tree).filter(n => n.type === 'li' && n.props.role === 'option'),
    notes: () => walk(tree).filter(n => n.type === 'li' && n.props.role === 'presentation').map(n => flat(n)),
    clear: () => walk(tree).find(n => n.type === 'button'),
    alert: () => walk(tree).find(n => n.props?.role === 'alert'),
    type: (value: string) => { api.input().props.onChange({ target: { value } }); render(); },
    key: (key: string) => { const log = { prevented: false, stopped: false }; api.input().props.onKeyDown({ key, preventDefault() { log.prevented = true; }, stopPropagation() { log.stopped = true; } }); render(); return log; },
    click: () => { api.input().props.onClick(); render(); },
  };
  render(); render();
  return api;
}
const spy = () => { const calls: string[] = []; return { calls, onChange: (id: string) => calls.push(id) }; };
const names = (c: ReturnType<typeof mount>) => c.options().map(o => c.text(o));

test('atributos ARIA: etiqueta, combobox, expanded, controls y activedescendant coherentes', () => {
  const s = spy(), c = mount({ label: 'Cliente del seguimiento', contacts: base, value: 'c2', onChange: s.onChange });
  const input = c.input(), label = c.nodes().find(n => n.type === 'label')!;
  assert.equal(input.props.role, 'combobox'); assert.equal(label.props.htmlFor, input.props.id, 'la etiqueta apunta al campo'); assert.match(c.text(label), /Cliente del seguimiento/);
  assert.equal(input.props['aria-expanded'], false); assert.equal(input.props['aria-controls'], undefined); assert.equal(input.props['aria-activedescendant'], undefined); assert.equal(c.list(), undefined);
  assert.equal(input.props.value, 'José Pérez · jose@b.es', 'cerrado, muestra el cliente elegido');
  c.click(); const open = c.input(), list = c.list()!, options = c.options();
  assert.equal(open.props['aria-expanded'], true); assert.equal(open.props['aria-controls'], list.props.id); assert.equal(list.props.role, 'listbox');
  assert.equal(options.length, 3); assert.equal(open.props['aria-activedescendant'], options[1].props.id, 'la opción elegida arranca activa');
  assert.deepEqual(options.map(o => o.props['aria-selected']), [false, true, false]); assert.equal(s.calls.length, 0, 'abrir no selecciona');
});

test('escribir solo filtra: no cambia la selección y funciona sin acentos ni mayúsculas', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: '', onChange: s.onChange });
  c.type('garcia'); assert.deepEqual(names(c), ['Ana García · ana@a.es']); assert.equal(s.calls.length, 0, 'escribir no llama a onChange');
  c.type('JOSE'); assert.deepEqual(names(c), ['José Pérez · jose@b.es']); c.type('600111'); assert.deepEqual(names(c), ['José Pérez · jose@b.es'], 'también por teléfono');
  c.type('c.es'); assert.deepEqual(names(c), ['Luis Martín · luis@c.es'], 'y por correo'); assert.equal(s.calls.length, 0);
  assert.equal(c.input().props.value, 'c.es', 'mientras se escribe se ve el texto escrito');
});

test('Enter elige la opción activa por ID; las flechas se mueven con tope y abren la lista', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: '', onChange: s.onChange });
  assert.equal(c.key('ArrowDown').prevented, true); assert.equal(c.input().props['aria-expanded'], true);
  const active = () => c.options().findIndex(o => o.props['data-active'] === 'true');
  assert.equal(active(), 0); c.key('ArrowDown'); c.key('ArrowDown'); c.key('ArrowDown'); assert.equal(active(), 2, 'no pasa del último');
  c.key('ArrowUp'); assert.equal(active(), 1); c.key('ArrowUp'); c.key('ArrowUp'); assert.equal(active(), 0, 'no pasa del primero');
  assert.equal(c.input().props['aria-activedescendant'], c.options()[0].props.id);
  c.key('ArrowDown'); const enter = c.key('Enter'); assert.equal(enter.prevented, true); assert.deepEqual(s.calls, ['c2'], 'Enter elige la activa por su ID');
  assert.equal(c.list(), undefined, 'al elegir se cierra');
});

test('Enter sin lista abierta o sin resultados no elige nada', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: '', onChange: s.onChange });
  c.key('Enter'); assert.deepEqual(s.calls, []); c.type('zzzz'); c.key('Enter'); assert.deepEqual(s.calls, [], 'sin coincidencias no se elige otro cliente');
});

test('Escape cierra y restaura el texto sin elegir; sin lista, limpia lo escrito', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: 'c1', onChange: s.onChange });
  c.type('luis'); assert.equal(c.input().props.value, 'luis');
  const first = c.key('Escape'); assert.equal(first.prevented && first.stopped, true, 'no se propaga a un modal que lo contenga');
  assert.equal(c.list(), undefined); assert.equal(c.input().props.value, 'Ana García · ana@a.es', 'vuelve al cliente elegido'); assert.deepEqual(s.calls, []);
  const closed = c.key('Escape'); assert.equal(closed.stopped, false, 'sin nada que cerrar no intercepta Escape');
});

test('Tab y perder el foco cierran sin elegir ni cambiar la selección', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: 'c3', onChange: s.onChange });
  c.type('ana'); const tab = c.key('Tab'); assert.equal(tab.prevented, false, 'Tab no se bloquea'); assert.equal(c.list(), undefined);
  assert.equal(c.input().props.value, 'Luis Martín · luis@c.es'); c.type('jose'); c.input().props.onBlur(); c.render(); assert.equal(c.list(), undefined); assert.deepEqual(s.calls, []);
});

test('un clic elige por ID y los homónimos se distinguen por su ID', () => {
  const twins = [contact('x-1', 'Ana', 'García', 'ana@a.es'), contact('x-2', 'Ana', 'García', 'ana@a.es'), contact('y-9', 'Bea', 'Sanz', 'bea@a.es')];
  const s = spy(), c = mount({ label: 'Cliente', contacts: twins, value: '', onChange: s.onChange });
  c.click(); assert.deepEqual(names(c), ['Ana García · ana@a.es · ID x-1', 'Ana García · ana@a.es · ID x-2', 'Bea Sanz · bea@a.es'], 'solo los repetidos llevan ID');
  const second = c.options()[1]; assert.equal(second.props['data-contact-id'], 'x-2'); second.props.onMouseDown({ preventDefault() {} }); second.props.onClick(); c.render();
  assert.deepEqual(s.calls, ['x-2']); assert.equal(c.input().props.value.endsWith('ID x-2'), false, 'sin selección controlada no cambia el texto hasta que el padre da el valor');
  c.render({ value: 'x-2' }); assert.equal(c.input().props.value, 'Ana García · ana@a.es · ID x-2');
});

test('estados vacíos: sin clientes, sin coincidencias y límite visible', () => {
  const none = mount({ label: 'Cliente', contacts: [], value: '', onChange() {} }); none.click();
  assert.deepEqual(none.notes(), ['No hay clientes disponibles en esta fuente.']); assert.equal(none.options().length, 0);
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: '', onChange: s.onChange }); c.type('nadie');
  assert.deepEqual(c.notes(), ['Ningún cliente coincide con «nadie». Prueba con otro nombre, correo o teléfono.']); assert.equal(c.options().length, 0);
  const many = Array.from({ length: 1200 }, (_, i) => contact('id' + i, 'Cliente' + i, '', 'c' + i + '@x.es')), big = mount({ label: 'Cliente', contacts: many, value: '', onChange() {}, limit: 25 });
  big.click(); assert.equal(big.options().length, 25); assert.deepEqual(big.notes(), ['Se muestran 25 de 1200 coincidencias. Escribe para afinar la búsqueda.']);
  big.type('cliente77'); assert.ok(big.options().length < 25); assert.deepEqual(big.notes(), [], 'afinar quita el aviso de límite');
});

test('quitar el cliente llama a onChange con vacío y solo se ofrece con una selección', () => {
  const s = spy(), c = mount({ label: 'Cliente del seguimiento', contacts: base, value: 'c1', onChange: s.onChange });
  const clear = c.clear()!; assert.match(clear.props['aria-label'], /Quitar el cliente/); clear.props.onMouseDown({ preventDefault() {} }); clear.props.onClick(); assert.deepEqual(s.calls, ['']);
  assert.equal(mount({ label: 'Cliente', contacts: base, value: '', onChange() {} }).clear(), undefined, 'sin selección no hay botón');
});

test('una selección que ya no existe se avisa y no se sustituye por otro cliente', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: 'fantasma', onChange: s.onChange });
  assert.equal(c.input().props.value, '', 'no muestra a otro cliente'); assert.equal(c.input().props['aria-invalid'], true);
  assert.match(c.text(c.alert()), /ya no está disponible en esta fuente. No se ha sustituido por otro/); assert.deepEqual(s.calls, [], 'no llama a onChange por su cuenta');
  c.click(); assert.deepEqual(c.options().map(o => o.props['aria-selected']), [false, false, false], 'ninguna opción figura como elegida');
  c.render({ value: 'c2' }); assert.equal(c.alert(), undefined); assert.equal(c.input().props['aria-invalid'], undefined);
});

test('deshabilitado: no se puede escribir ni quitar', () => {
  const c = mount({ label: 'Cliente', contacts: base, value: 'c1', onChange() {}, disabled: true });
  assert.equal(c.input().props.disabled, true); assert.equal(c.clear(), undefined);
});

test('los resultados se anuncian en una región viva (sin role=status, para no duplicar los mensajes de estado de la pantalla) sin repetir el listado', () => {
  const c = mount({ label: 'Cliente', contacts: base, value: '', onChange() {} });
  const status = () => c.nodes().find(n => n.props?.['aria-live'] === 'polite' && n.type === 'span')!;
  assert.equal(c.text(status()), ''); c.click(); assert.match(c.text(status()), /3 clientes\. Usa las flechas y Intro para elegir\./);
  c.type('ana'); assert.match(c.text(status()), /1 cliente\./); c.type('qqq'); assert.match(c.text(status()), /Ningún cliente coincide\./);
});

test('al deshabilitarse con la lista abierta se cierra, no elige ni quita y al habilitar no reaparece (revisión UX-032)', () => {
  const s = spy(), c = mount({ label: 'Cliente', contacts: base, value: 'c1', onChange: s.onChange });
  c.click(); assert.equal(c.options().length, 3, 'precondición: la lista está abierta con las tres opciones'); assert.equal(c.input().props['aria-expanded'], true);
  c.render({ disabled: true }); c.render();
  assert.equal(c.list(), undefined, 'deshabilitado oculta la lista'); assert.equal(c.input().props['aria-expanded'], false); assert.equal(c.input().props.disabled, true); assert.equal(c.clear(), undefined);
  assert.equal(c.options().length, 0, 'no queda ninguna opción que clicar'); assert.deepEqual(s.calls, [], 'deshabilitar no elige nada');
  c.render({ disabled: false }); c.render();
  assert.equal(c.list(), undefined, 'al habilitar de nuevo no resucita la lista antigua'); assert.equal(c.input().props['aria-expanded'], false);
  c.click(); assert.equal(c.options().length, 3, 'una apertura nueva funciona'); c.options()[1].props.onClick(); assert.deepEqual(s.calls, ['c2']);
});
