import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// CLAUDE-UX-034 · ficha de cliente: operaciones, bloqueo y recolocación del foco.
// Ejecuta el componente real con ranuras de hooks controladas, transporte ficticio y promesas diferidas.
// No es React DOM ni un navegador: aquí se comprueba el estado, los props y la DECISIÓN de recolocar el foco
// (con un `document` simulado). El foco real (`document.activeElement`) lo demuestra tests/e2e/customer-dossier-focus.spec.ts.
// PLANB_UI_SRC permite apuntar a otra copia de src/ (se usó para reproducir los fallos con el código anterior).
const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
const settle = async (times = 3) => { for (let i = 0; i < times; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
type VNode = { type: any; props: Record<string, any> };

function makeLoader(mocks: Record<string, any>) {
  const cache = new Map<string, any>();
  let hooks: any;
  const resolveFile = (spec: string) => { const base = path.resolve(SRC, spec.replace(/\.js$/, '')); return ['.tsx', '.ts'].map(ext => base + ext).find(file => fs.existsSync(file)); };
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
  return { load: (file: string) => requireFrom('./' + file.replace(/\.tsx?$/, '')), useHooks: (value: any) => { hooks = value; } };
}

function mount(file: string, exportName: string, mocks: Record<string, any>, initial: Record<string, any>) {
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
  const render = () => { cursor = 0; tree = Component(props); const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; };
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(child => walk(child)) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : [];
  const nodes = () => walk(tree);
  const flat = (node: any): string => Array.isArray(node) ? node.map(child => flat(child)).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const text = (...node: any[]) => flat(node.length ? node[0] : tree);
  const byTag = (tag: string, test: (n: VNode) => boolean = () => true) => nodes().filter(n => n.type === tag && test(n));
  const one = (label: string, found: VNode[]) => { assert.equal(found.length, 1, label + ': ' + found.length + ' coincidencias'); return found[0]; };
  return {
    render, nodes, text, byTag, writes: () => writes,
    button: (label: string | RegExp) => one('botón ' + label, byTag('button', n => (typeof label === 'string' ? text(n) === label : label.test(text(n))))),
    named: (name: string) => nodes().filter(n => typeof n.type === 'function' && n.type.name === name),
    labelled: (label: string) => one('control «' + label + '»', byTag('button', n => n.props['aria-label'] === label)),
    title: () => one('campo de título', byTag('input', n => n.props.maxLength === 200)),
    due: () => one('campo de fecha', byTag('input', n => n.props.type === 'datetime-local')),
    form: () => one('formulario', byTag('form')),
    heading: () => one('encabezado de acciones', byTag('h3', n => text(n) === 'Próxima acción')),
    status: () => byTag('p', n => n.props.role === 'status').map(n => text(n)).join('|'),
    alert: () => byTag('p', n => n.props.role === 'alert').map(n => text(n)).join('|'),
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const deferred = <T = unknown>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

// ---------- Datos y servidor ficticios ----------
const action = (id: string, title: string, status: 'open' | 'completed', version = 1) => ({ id, title, status, due_at: '2099-01-01T10:00:00Z', version, created_at: '2026-10-29T10:00:00Z' });
const dossier = (actions = [action('a1', 'Llamar', 'open')], over: Record<string, any> = {}) => ({ source: { key: 'k', origin: 'hubspot', isTestData: false, capturedAt: '2026-10-28T10:00:00Z', canPrepare: true }, contact: { name: 'Ana', email: 'a@x.es', phone: null }, companies: [], owner: { name: null, id: null }, opportunities: [], actions, capturedTasks: [], ...over });
type Handler = (path: string, body?: any) => unknown | Promise<unknown>;
function fakeServer(handler: Handler) {
  const log: { path: string; body?: any }[] = [];
  const call = async (p: string, body?: any) => { log.push({ path: p, body }); const result = await handler(p, body); if (result instanceof Error) throw result; return result; };
  return { call, log, gets: () => log.filter(r => r.body === undefined), posts: (part = '') => log.filter(r => r.body !== undefined && r.path.includes(part)) };
}
const noop = function () { return null; };
const mocks = { components: { Modal: function Modal() { return null; }, Spinner: noop }, CustomerFiles: { CustomerFiles: function CustomerFiles() { return null; } } };
function open(handler: Handler, props: Record<string, any> = {}) {
  const server = fakeServer(handler);
  const h = mount('CustomerDossier.tsx', 'CustomerDossier', mocks, { tenant: 'T1', contact: 'c1', local: false, canWrite: true, canConnect: true, call: server.call, close() {}, onPrepared() {}, ...props });
  return { h, server, ready: async () => { h.render(); h.render(); await settle(); h.render(); } };
}
const isGet = (body?: unknown) => body === undefined;
const fill = (h: ReturnType<typeof mount>, title = 'Revisar alcance', due = '2099-10-30T11:00') => { h.title().props.onChange({ target: { value: title } }); h.render(); h.due().props.onChange({ target: { value: due } }); h.render(); };
const submit = (h: ReturnType<typeof mount>) => h.form().props.onSubmit({ preventDefault() {} });

// ---------- Doble activación y peticiones en paralelo ----------
test('UX-034 dos activaciones de «Completar» antes del siguiente render envían una sola petición', async () => {
  const gate = deferred();
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise);
  await ready();
  const complete = h.labelled('Completar Llamar');
  complete.props.onClick(); complete.props.onClick();
  await settle(); gate.resolve({});
  await settle(); h.render();
  assert.equal(server.posts('/actions/a1').length, 1, 'una sola mutación pese a la doble activación');
});

test('UX-034 enviar dos veces «Guardar próxima acción» antes del siguiente render crea una sola acción', async () => {
  const gate = deferred();
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([]) : gate.promise);
  await ready(); fill(h);
  submit(h); submit(h);
  await settle();
  assert.equal(server.posts('/actions').length, 1);
  gate.resolve({}); await settle(); h.render();
  assert.equal(server.posts('/actions').length, 1);
});

test('UX-034 mientras una operación está pendiente, ninguna otra petición sale (ni cambiar estado, ni actualizar, ni preparar)', async () => {
  const gate = deferred();
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([action('a1', 'Llamar', 'open'), action('a2', 'Escribir', 'open')]) : _p.includes('/v6/proposals') ? { id: 'P1' } : gate.promise);
  await ready();
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  const before = server.log.length;
  h.labelled('Completar Escribir').props.onClick();
  h.button('Actualizar datos guardados').props.onClick();
  h.button('Preparar seguimiento').props.onClick();
  await settle();
  assert.equal(server.log.length, before, 'sin peticiones adicionales mientras hay una operación en curso');
  gate.resolve({}); await settle(); h.render();
  h.labelled('Completar Escribir').props.onClick(); await settle();
  assert.equal(server.posts('/actions/a2').length, 1, 'terminada la operación vuelve a estar disponible');
});

test('UX-034 durante la operación los controles se bloquean con aria-disabled y en el handler, sin usar disabled (que quita el foco)', async () => {
  const gate = deferred();
  const { h, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise);
  await ready(); fill(h);
  submit(h); await settle(); h.render();
  for (const [name, node] of [['Guardar', h.button('Guardar próxima acción')], ['Completar', h.labelled('Completar Llamar')], ['Actualizar', h.button('Actualizar datos guardados')]] as const) {
    assert.equal(node.props['aria-disabled'], true, name + ' anuncia que está bloqueado');
    assert.notEqual(node.props.disabled, true, name + ' no se deshabilita de verdad: perdería el foco');
  }
  assert.equal(h.title().props.readOnly, true); assert.equal(h.due().props.readOnly, true);
  assert.notEqual(h.title().props.disabled, true, 'el campo no se deshabilita: perdería el foco');
  assert.match(h.status(), /Guardando la próxima acción/);
  h.title().props.onChange({ target: { value: 'Otro texto' } }); h.render();
  assert.equal(h.title().props.value, 'Revisar alcance', 'no se edita mientras se guarda');
  gate.resolve({}); await settle(); h.render();
  assert.equal(h.button('Actualizar datos guardados').props['aria-disabled'], undefined, 'se libera al terminar');
});

// ---------- Permisos y entradas inválidas ----------
test('UX-034 solo lectura: los controles están deshabilitados de verdad y llamar a sus handlers no envía nada', async () => {
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([action('a1', 'Llamar', 'open'), action('a2', 'Escribir', 'completed')]) : {}, { canWrite: false });
  await ready();
  const complete = h.labelled('Completar Llamar'), reopen = h.button('Reabrir');
  assert.equal(complete.props.disabled, true); assert.equal(reopen.props.disabled, true);
  complete.props.onClick(); reopen.props.onClick(); await settle();
  assert.equal(server.posts().length, 0);
  assert.equal(h.byTag('form').length, 0, 'sin permiso de escritura no hay formulario');
});

test('UX-034 entradas inválidas: el botón está deshabilitado y enviar el formulario no envía nada', async () => {
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([]) : {});
  await ready();
  assert.equal(h.button('Guardar próxima acción').props.disabled, true);
  submit(h); await settle(); assert.equal(server.posts().length, 0, 'vacío');
  h.title().props.onChange({ target: { value: '   ' } }); h.render(); h.due().props.onChange({ target: { value: '2099-10-30T11:00' } }); h.render();
  assert.equal(h.button('Guardar próxima acción').props.disabled, true, 'título solo con espacios');
  submit(h); await settle(); assert.equal(server.posts().length, 0);
});

// ---------- Fallos: acción fallida / correcta / correcta con recarga fallida ----------
test('UX-034 una acción fallida conserva el formulario, no dice que se realizó y el reintento usa el mismo id', async () => {
  let attempts = 0;
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([]) : ++attempts === 1 ? new Error('Servidor ocupado') : {});
  await ready(); fill(h);
  submit(h); await settle(); h.render();
  assert.match(h.alert(), /No se pudo guardar la próxima acción: Servidor ocupado/); assert.doesNotMatch(h.alert(), /se realizó/);
  assert.match(h.alert(), /no se duplicará/);
  assert.equal(h.title().props.value, 'Revisar alcance'); assert.equal(h.due().props.value, '2099-10-30T11:00');
  assert.equal(h.button('Guardar próxima acción').props['aria-disabled'], undefined, 'se puede reintentar');
  submit(h); await settle(); h.render();
  const [first, second] = server.posts('/actions').map(r => r.body);
  assert.equal(first.id, second.id, 'misma clave: el servidor no duplica'); assert.equal(first.sourceKey, 'k'); assert.equal(first.title, 'Revisar alcance');
  assert.equal(h.alert(), ''); assert.match(h.status(), /Próxima acción guardada solo en Plan B/); assert.equal(h.title().props.value, '');
});

test('UX-034 tras guardar con éxito se renueva el id y el siguiente guardado no reutiliza el anterior', async () => {
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([]) : {});
  await ready(); fill(h, 'Primera');
  submit(h); await settle(); h.render();
  fill(h, 'Segunda'); submit(h); await settle(); h.render();
  const [a, b] = server.posts('/actions').map(r => r.body);
  assert.notEqual(a.id, b.id); assert.equal(b.title, 'Segunda');
});

test('UX-034 acción correcta con recarga fallida: se informa, se bloquean los cambios de estado y reintentar la recarga no repite la acción', async () => {
  let reads = 0, reload: 'fail' | 'ok' = 'fail';
  const { h, server, ready } = open((_p, body) => {
    if (!isGet(body)) return {};
    if (++reads === 1) return dossier();
    return reload === 'fail' ? new Error('sin red') : dossier([action('a1', 'Llamar', 'completed', 2)]);
  });
  await ready();
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  assert.match(h.status(), /Acción completada en Plan B/); assert.match(h.alert(), /La acción se realizó, pero no se pudo actualizar la ficha: sin red/);
  assert.match(h.alert(), /No la repitas/);
  const stale = h.labelled('Completar Llamar');
  assert.equal(stale.props['aria-disabled'], true, 'la fila vieja no invita a repetir lo ya hecho'); assert.ok(stale.props['aria-describedby'], 'apunta a la explicación');
  stale.props.onClick(); await settle();
  assert.equal(server.posts('/actions/a1').length, 1, 'con la ficha desactualizada no se envía otra mutación');
  reload = 'ok';
  h.button('Actualizar datos guardados').props.onClick(); await settle(); h.render();
  assert.equal(server.posts('/actions/a1').length, 1, 'reintentar la recarga NO repite la mutación');
  assert.equal(h.alert(), ''); assert.equal(h.button('Reabrir').props['aria-disabled'], undefined, 'recargada la ficha vuelve a estar disponible');
  h.button('Reabrir').props.onClick(); await settle();
  assert.deepEqual(server.posts('/actions/a1').map(r => [r.body.status, r.body.version]), [['completed', 1], ['open', 2]], 'usa la versión nueva');
});

test('UX-034 fallar «Actualizar» no afirma que una acción se realizó, salvo que antes sí se hubiera realizado una', async () => {
  let fail = false;
  const { h, ready } = open((_p, body) => isGet(body) ? (fail ? new Error('sin red') : dossier()) : {});
  await ready();
  fail = true; h.button('Actualizar datos guardados').props.onClick(); await settle(); h.render();
  assert.match(h.alert(), /^No se pudo actualizar la ficha: sin red/); assert.doesNotMatch(h.alert(), /se realizó/);
  assert.equal(h.labelled('Completar Llamar').props['aria-disabled'], undefined, 'una lectura fallida sin acción previa no bloquea la ficha');
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  assert.match(h.alert(), /La acción se realizó, pero no se pudo actualizar/, 'precondición: la acción se hizo y la recarga posterior falló');
  h.button('Actualizar datos guardados').props.onClick(); await settle(); h.render();
  assert.match(h.alert(), /^Sigue sin poder actualizarse la ficha: sin red.*ya se realizó; no la repitas/);
});

test('UX-034 un cambio de estado fallido nombra la acción y no la presenta como hecha', async () => {
  const { h, ready } = open((_p, body) => isGet(body) ? dossier() : new Error('La acción cambió. Actualiza la ficha antes de editar.'));
  await ready();
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  assert.match(h.alert(), /No se pudo completar la acción «Llamar»: La acción cambió/); assert.doesNotMatch(h.alert(), /se realizó/);
  assert.equal(h.status(), '', 'sin aviso de éxito'); assert.equal(h.labelled('Completar Llamar').props['aria-disabled'], undefined);
});

// ---------- Cierre durante una operación pendiente y desmontaje ----------
test('UX-034 cerrar con una operación pendiente avisa de que no se verá el resultado; sin operación conserva el aviso de borrador', async () => {
  const gate = deferred(); const asked: string[] = []; (globalThis as any).confirm = (message: string) => { asked.push(message); return false; };
  const { h, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise);
  await ready();
  const modal = () => h.named('Modal')[0];
  assert.equal(modal().props.confirmClose(), true, 'sin nada que perder cierra sin preguntar'); assert.deepEqual(asked, []);
  fill(h);
  assert.equal(modal().props.confirmClose(), false); assert.match(asked.at(-1)!, /texto o archivos sin guardar/);
  submit(h); await settle(); h.render();
  assert.equal(modal().props.confirmClose(), false); assert.match(asked.at(-1)!, /operación en curso/);
  (globalThis as any).confirm = () => true; assert.equal(modal().props.confirmClose(), true, 'si la persona lo confirma, se cierra');
  gate.resolve({}); await settle(); h.render();
});

test('UX-034 durante una simple recarga no hay nada que perder: cerrar no pregunta por la operación', async () => {
  const gate = deferred(); let reads = 0; const asked: string[] = []; (globalThis as any).confirm = (m: string) => { asked.push(m); return true; };
  const { h, ready } = open((_p, body) => isGet(body) ? (++reads === 1 ? dossier() : gate.promise) : {});
  await ready(); h.button('Actualizar datos guardados').props.onClick(); await settle(); h.render();
  assert.equal(h.named('Modal')[0].props.confirmClose(), true); assert.deepEqual(asked, []);
  gate.resolve(dossier()); await settle();
});

test('UX-034 si la ficha se cierra con la operación pendiente, al terminar no recarga, no cambia estado ni pide el foco', async () => {
  const gate = deferred();
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise);
  await ready();
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  const writes = h.writes(), reads = server.gets().length;
  h.unmount();
  gate.resolve({}); await settle(5);
  assert.equal(server.gets().length, reads, 'no se recarga una ficha cerrada'); assert.equal(h.writes(), writes, 'no se escribe estado tras desmontar');
});

// ---------- Decisión de recolocar el foco (document simulado; el foco real se comprueba en E2E) ----------
async function withDocument<T>(fn: (doc: { activeElement: any; body: any }) => Promise<T>) {
  const previous = (globalThis as any).document, body = { tag: 'body', isConnected: true };
  const doc = { activeElement: body as any, body };
  (globalThis as any).document = doc;
  return fn(doc).finally(() => { (globalThis as any).document = previous; });
}
const spyRef = (node: VNode) => { const calls: string[] = []; node.props.ref.current = { focus: () => calls.push('focus') }; return calls; };

test('UX-034 completar: si el foco se perdió al desaparecer la fila, pasa al encabezado «Próxima acción»', () => withDocument(async () => {
  const { h, ready } = open((_p, body) => isGet(body) ? dossier() : {});
  await ready(); const focused = spyRef(h.heading());
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render(); h.render();
  assert.deepEqual(focused, ['focus']);
}));

test('UX-034 completar: si la persona movió el foco a otro control mientras tanto, no se le quita', () => withDocument(async doc => {
  const gate = deferred(); const { h, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise);
  await ready(); const focused = spyRef(h.heading());
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  doc.activeElement = { tag: 'input', isConnected: true, disabled: false };
  gate.resolve({}); await settle(); h.render(); h.render();
  assert.deepEqual(focused, []);
}));

test('UX-034 completar fallido: no se mueve el foco (el control sigue donde estaba)', () => withDocument(async () => {
  const { h, ready } = open((_p, body) => isGet(body) ? dossier() : new Error('fallo')); await ready(); const focused = spyRef(h.heading());
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render(); h.render();
  assert.deepEqual(focused, []);
}));

test('UX-034 reabrir lleva el foco al mismo destino estable cuando la fila desaparece de la actividad', () => withDocument(async () => {
  const { h, ready } = open((_p, body) => isGet(body) ? dossier([action('a1', 'Llamar', 'completed')]) : {}); await ready(); const focused = spyRef(h.heading());
  h.button('Reabrir').props.onClick(); await settle(); h.render(); h.render();
  assert.deepEqual(focused, ['focus']);
}));

test('UX-034 guardar con éxito vacía el formulario y devuelve el foco al campo «Qué hay que hacer» si se perdió o quedó en el botón ya inválido', () => withDocument(async doc => {
  const { h, ready } = open((_p, body) => isGet(body) ? dossier([]) : {}); await ready(); fill(h); const focused = spyRef(h.title());
  const saveButton = { tag: 'button', isConnected: true, disabled: true }; doc.activeElement = saveButton;
  submit(h); await settle(); h.render(); h.render();
  assert.deepEqual(focused, ['focus'], 'el botón quedó deshabilitado: el foco vuelve al formulario');
}));

test('UX-034 guardar con éxito no roba el foco si la persona lo dejó en otro control habilitado', () => withDocument(async doc => {
  const gate = deferred(); const { h, ready } = open((_p, body) => isGet(body) ? dossier([]) : gate.promise); await ready(); fill(h); const focused = spyRef(h.title());
  submit(h); await settle(); h.render();
  doc.activeElement = { tag: 'button', isConnected: true, disabled: false };
  gate.resolve({}); await settle(); h.render(); h.render();
  assert.deepEqual(focused, []);
}));

test('UX-034 no se recoloca el foco si la ficha se cerró antes de terminar', () => withDocument(async () => {
  const gate = deferred(); const { h, ready } = open((_p, body) => isGet(body) ? dossier() : gate.promise); await ready(); const focused = spyRef(h.heading());
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  h.unmount(); gate.resolve({}); await settle(5);
  assert.deepEqual(focused, []);
}));

// ---------- Se conservan los contratos existentes ----------
test('UX-034 se conservan sourceKey, versión, id de preparar y los textos de éxito', async () => {
  const prepared: string[] = [];
  const { h, server, ready } = open((_p, body) => isGet(body) ? dossier([action('a1', 'Llamar', 'open', 7)]) : _p.includes('/v6/proposals') ? { id: 'P1' } : {}, { onPrepared: (id: string) => prepared.push(id) });
  await ready();
  h.labelled('Completar Llamar').props.onClick(); await settle(); h.render();
  assert.deepEqual(server.posts('/actions/a1')[0].body, { sourceKey: 'k', version: 7, status: 'completed' }); assert.match(h.status(), /Acción completada en Plan B/);
  h.button('Preparar seguimiento').props.onClick(); await settle(); h.render();
  assert.deepEqual(server.posts('/v6/proposals')[0].body.intent, { sourceKey: 'k', internalOnly: true }); assert.deepEqual(prepared, ['P1']);
});
