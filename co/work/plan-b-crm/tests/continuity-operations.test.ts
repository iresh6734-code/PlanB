import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Ejecuta ContinuityOperations.tsx real con ranuras de hooks controladas y un transporte ficticio con respuestas diferidas.
// No es React DOM ni un navegador: comprueba qué se pide, qué se descarta y qué entrega el árbol; el DOM real lo cubre el E2E.
const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
type VNode = { type: any; props: Record<string, any> };
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

type Call = { path: string; init: any; resolve: (value: unknown) => void; reject: (error: unknown) => void; settled: boolean };
function transport(ignoreAbort = false) {
  const calls: Call[] = [];
  const api = (p: string, init?: any) => new Promise((resolve, reject) => {
    const call: Call = { path: p, init, settled: false, resolve: v => { call.settled = true; resolve(v); }, reject: e => { call.settled = true; reject(e); } };
    calls.push(call);
    if (!ignoreAbort) init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
  });
  return { calls, api };
}
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

function mount(exportName: string, props: Record<string, any>, ignoreAbort = false) {
  const t = transport(ignoreAbort), slots: any[] = []; let cursor = 0, tree: any, effects: (() => void)[] = [], current = props, writes = 0;
  const hooks = {
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v: any) => { writes++; slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); },
    useEffect(run: () => void | (() => void), deps?: unknown[]) { const i = cursor++, prior = slots[i]; if (!prior || !deps || deps.some((d, n) => !Object.is(d, prior.deps?.[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const cache = new Map<string, any>();
  const jsx = (type: any, props: Record<string, any>) => ({ type, props });
  const mocks: Record<string, any> = {
    api: { api: t.api }, components: { Spinner: ({ text }: any) => ({ type: 'span', props: { children: text } }) },
    TabList: { TabList: () => null, tabPanelProps: () => ({}) }, WorkspaceUI: { StatusTag: ({ children }: any) => ({ type: 'span', props: { className: 'status-tag', children } }) },
  };
  const requireFrom = (spec: string): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => (hooks as any)[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec.endsWith('.css')) return {};
    const key = path.basename(spec).replace(/\.js$/, '');
    if (key in mocks) return mocks[key];
    const base = path.resolve(SRC, spec.replace(/\.js$/, '').replace(/^\.\//, '')), file = ['.tsx', '.ts'].map(ext => base + ext).find(f => fs.existsSync(f));
    if (!file) throw new Error('Dependencia no resuelta: ' + spec);
    if (cache.has(file)) return cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} }; cache.set(file, mod.exports);
    new Function('require', 'exports', 'module', 'window', code)(requireFrom, mod.exports, mod, { addEventListener() {}, removeEventListener() {} }); cache.set(file, mod.exports); return mod.exports;
  };
  const Component = requireFrom('./ContinuityOperations')[exportName];
  const render = (next: Record<string, any> = {}) => { current = { ...current, ...next }; cursor = 0; tree = Component(current); const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; };
  // Expande los componentes puros (sin hooks) para leer el árbol completo, como lo vería el usuario.
  const expand = (node: any): any => Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' && node.props
    ? (typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } }) : node;
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : [];
  const flat = (node: any): string => Array.isArray(node) ? node.map(flat).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const api = {
    calls: t.calls, writes: () => writes, render,
    nodes: () => walk(expand(tree)), text: (n?: any) => flat(n === undefined ? expand(tree) : n),
    button: (label: string | RegExp) => api.nodes().find(n => n.type === 'button' && (typeof label === 'string' ? flat(n) === label : label.test(flat(n)))),
    select: (label: string) => api.nodes().find(n => n.type === 'label' && flat(n.props.children[0]) === label)!.props.children[1],
    pick: (label: string, value: string) => { api.select(label).props.onChange({ target: { value } }); render(); },
    press: (label: string | RegExp) => { const b = api.button(label); assert.ok(b, 'No hay botón ' + label); assert.ok(!b!.props.disabled, 'Botón desactivado: ' + label); b!.props.onClick(); render(); },
    flush: async () => { await settle(); render(); await settle(); render(); },
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
  render(); render(); return api;
}

const CAP = 'snap-a:2026-10-29T10:00:00.000Z';
const radar = (over: Record<string, any> = {}, captureId = CAP) => ({
  source: { view: 'active-local-records', captureId, snapshotId: 'snap-a', accountId: 'acc-1', capturedAt: '2026-10-29T10:00:00.000Z', isTestData: true, revision: 'abcdef0123456789ffff' },
  evaluatedAt: '2026-10-30T09:00:00.000Z', horizonEndsAt: '2026-10-31T09:00:00.000Z', timeZone: 'Europe/Madrid',
  summary: { totalTasks: 9, completedTasks: 3, knownOpenTasks: 5, unknownStatusTasks: 1, buckets: { overdue: 1, 'due-in-window': 2, 'needs-review': 1, later: 2 }, totalQueued: 6, returned: 2, truncated: true },
  items: [
    { id: 't1', label: 'Llamar a Ana', bucket: 'overdue', status: 'open', due: { kind: 'date', value: '2026-10-28', at: null, localDate: '2026-10-28' }, reasons: [{ code: 'overdue', detail: 'El día de vencimiento es anterior a hoy en Madrid.' }], references: [{ field: 'contact', entity: 'contacts', id: 'c9', label: null, available: false }], nextAction: 'Comprobar los registros relacionados antes de trabajar esta tarea.' },
    { id: 't2', label: 'Enviar oferta', bucket: 'needs-review', status: 'unknown', due: { kind: 'missing', value: null, at: null, localDate: null }, reasons: [{ code: 'unknown-status', detail: 'El estado no permite confirmar si esta tarea sigue abierta; no se ha descartado.' }], references: [], nextAction: 'Revisar estado y vencimiento antes de decidir la prioridad.' },
  ],
  limitations: ['Prioridad determinista.'], ...over,
});
const text = (value: unknown) => ({ present: true, value, truncated: false });
const compareBody = (over: Record<string, any> = {}, offset = 0, from = 'a:1', to = 'b:2') => ({
  from: { captureId: from, name: 'Primera', accountId: 'acc-1', capturedAt: '2026-10-28T10:00:00.000Z', isTestData: true, contentHash: 'h1' },
  to: { captureId: to, name: 'Segunda', accountId: 'acc-1', capturedAt: '2026-10-29T10:00:00.000Z', isTestData: true, contentHash: 'h2' },
  chronological: true,
  records: { counts: { contacts: { added: 1, absent: 1, changed: 1, unchanged: 7 }, companies: { added: 0, absent: 0, changed: 0, unchanged: 2 }, deals: { added: 0, absent: 0, changed: 0, unchanged: 0 }, tasks: { added: 0, absent: 0, changed: 0, unchanged: 0 } }, totalDifferences: 60, offset, limit: 25, truncated: offset + 2 < 60,
    items: [
      { entity: 'contacts', id: 'c1', kind: 'changed', beforeLabel: 'Ana', afterLabel: 'Ana', totalFieldChanges: 25, fieldsTruncated: true, fields: [
        { key: 'phone', before: { present: false, value: null, truncated: false }, after: text('600') },
        { key: 'notes', before: text(null), after: text('') },
        { key: 'vip', before: text(false), after: text(true) },
        { key: 'score', before: text(0), after: text(7) },
        { key: 'bio', before: text('x'.repeat(500)), after: { present: true, value: 'y'.repeat(500), truncated: true } }] },
      { entity: 'contacts', id: 'c2', kind: 'absent', beforeLabel: 'Luis', afterLabel: null, totalFieldChanges: 0, fieldsTruncated: false, fields: [] }] },
  schema: { totalFieldChanges: 60, truncated: true, fields: [{ entity: 'contacts', key: 'phone', kind: 'added', aspects: [] }], configurationSections: ['pipelines'] },
  relations: { added: 2, absent: 1, unchanged: 5, changedGroups: 30, truncated: true, items: [{ kind: 'added', count: 2, link: { fromEntity: 'contacts', fromId: 'c1', toEntity: 'companies', toId: 'k1', label: 'trabaja en' } }] },
  limitations: ['Ausente significa que no figura en la segunda captura.'], ...over,
});
const OPTIONS = [{ id: 'b:2', at: '2026-10-29T10:00:00.000Z', bytes: 2048 }, { id: 'a:1', at: '2026-10-28T10:00:00.000Z', bytes: 2048 }];
const FROM = 'Primera captura', TO = 'Segunda captura';

test('radar: consulta la API real con horizonte y límite, y muestra procedencia, recuentos y nulos sin inventar ceros', async () => {
  const m = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => {} });
  assert.equal(m.calls.length, 1); assert.equal(m.calls[0].path, '/v2/continuity/response-queue?horizonHours=24&limit=50');
  assert.match(m.text(), /Calculando el radar/);
  m.calls[0].resolve(radar({ summary: { ...radar().summary, completedTasks: null } })); await m.flush();
  const out = m.text();
  assert.match(out, /Copia activa/); assert.match(out, /cuenta acc-1/); assert.match(out, /abcdef012345/, 'revisión abreviada'); assert.match(out, /Calculado por el servidor el/);
  assert.match(out, /Mostrando 2 de 6 tareas/); assert.match(out, /fuera del límite visible/);
  assert.match(out, /Completadas—/, 'un recuento nulo se muestra como dato ausente, no como 0');
  assert.match(out, /Estado desconocido/); assert.match(out, /Día 2026-10-28 \(sin hora\)/); assert.match(out, /Sin fecha de vencimiento/);
  assert.match(out, /ID c9 \(no disponible\)/, 'asociación ausente visible'); assert.match(out, /Sin asociaciones registradas/);
  assert.doesNotMatch(out, /pérdida|puntuación|€/i);
  m.pick('Horizonte', '72'); await m.flush();
  assert.equal(m.calls.at(-1)!.path, '/v2/continuity/response-queue?horizonHours=72&limit=50');
});

test('radar: una respuesta vieja que llega tarde, tras cambiar horizonte o captura, o al desmontar, no repone datos', async () => {
  const m = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => {} });
  m.pick('Horizonte', '8'); await settle(); m.render();
  assert.equal(m.calls.length, 2); assert.equal(m.calls[0].init.signal.aborted, true, 'cambiar el horizonte aborta la anterior');
  m.calls[1].resolve(radar({ summary: { ...radar().summary, totalQueued: 4, returned: 2 } })); await m.flush();
  m.calls[0].resolve(radar({ summary: { ...radar().summary, totalQueued: 99 } })); await m.flush();
  assert.match(m.text(), /de 4 tareas/); assert.doesNotMatch(m.text(), /de 99 tareas/);
  const NEW = 'snap-b:2026-10-30T08:00:00.000Z';
  m.render({ activeCaptureId: NEW }); await settle(); m.render();
  assert.doesNotMatch(m.text(), /de 4 tareas/, 'al cambiar la captura se retira el resultado de la anterior');
  const stale = m.calls[1]; stale.resolve(radar()); await m.flush();
  assert.doesNotMatch(m.text(), /Llamar a Ana/);
  m.calls.at(-1)!.resolve(radar({}, NEW)); await m.flush(); assert.match(m.text(), /Llamar a Ana/);
  const before = m.writes(); m.pick('Horizonte', '24'); const last = m.calls.at(-1)!; m.unmount(); const afterUnmount = m.writes();
  last.resolve(radar()); await settle(); assert.equal(m.writes(), afterUnmount, 'tras desmontar no entra ninguna respuesta'); assert.ok(afterUnmount >= before);
  assert.equal(last.init.signal.aborted, true);
});

test('radar: con otra captura activa en la respuesta no se mezclan filas y se ofrece actualizar el contexto', async () => {
  let refreshed = 0; const m = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => { refreshed++; } });
  m.calls[0].resolve(radar({}, 'otra:2026-01-01T00:00:00.000Z')); await m.flush();
  assert.doesNotMatch(m.text(), /Llamar a Ana/); assert.match(m.text(), /otra captura activa/);
  m.press('Actualizar contexto'); await m.flush(); assert.equal(refreshed, 1); assert.equal(m.calls.length, 2, 'tras actualizar vuelve a consultar');
});

test('radar: sin copia activa no consulta; 404 de servidor antiguo y 401 no fingen éxito; reintentar vuelve a consultar', async () => {
  const none = mount('RadarPanel', { activeCaptureId: null, refreshContext: async () => {} });
  assert.equal(none.calls.length, 0); assert.match(none.text(), /No hay una copia activa/); assert.match(none.text(), /Continuar trabajando/);
  const old = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => {} });
  old.calls[0].reject(httpError(404, 'Operación no disponible en esta aplicación.')); await old.flush();
  assert.match(old.text(), /no incluye esta consulta/); assert.match(old.text(), /Actualiza Plan B/); assert.doesNotMatch(old.text(), /Llamar a Ana|Mostrando/);
  old.press('Reintentar consulta'); await old.flush(); assert.equal(old.calls.length, 2);
  const locked = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => {} });
  locked.calls[0].reject(httpError(401, 'Desbloquea tu copia local para continuar.')); await locked.flush();
  assert.match(locked.text(), /Desbloquea tu copia local/); assert.equal(locked.button('Reintentar consulta'), undefined, '401 no ofrece reintentar como si fuera recuperable'); assert.doesNotMatch(locked.text(), /Mostrando|Copia activa/);
});

test('comparador: pide los IDs exactos codificados y distingue ausente, null, vacío, booleano y número, avisos y grupos', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS });
  assert.equal(m.calls.length, 0, 'no consulta hasta una acción explícita');
  assert.equal(m.button('Comparar capturas')!.props.disabled, true);
  m.pick(FROM, 'a:1'); m.pick(TO, 'b:2'); m.press('Comparar capturas'); await settle(); m.render();
  assert.equal(m.calls[0].path, '/v2/captures/compare?from=a%3A1&to=b%3A2&offset=0&limit=25');
  m.calls[0].resolve(compareBody()); await m.flush();
  const out = m.text();
  assert.match(out, /Propiedad ausente/); assert.match(out, /null/); assert.match(out, /valor nulo/); assert.match(out, /Texto vacío/);
  assert.match(out, /booleano/); assert.match(out, /número/); assert.match(out, /Vista previa recortada a 500 caracteres/);
  assert.match(out, /Se muestran 5 de 25 campos distintos/);
  assert.match(out, /Ausente en la segunda captura/); assert.match(out, /no prueba que se borrara en HubSpot/);
  assert.match(out, /Primera captura/); assert.match(out, /Segunda captura/); assert.match(out, /cuenta acc-1/);
  assert.match(out, /Muestra de 1 de 60 cambios de campos/); assert.match(out, /Configuración distinta en: pipelines/);
  assert.match(out, /Muestra de 1 de 30 grupos de relaciones/); assert.match(out, /trabaja en/);
  assert.match(out, /Registros 1–2 de 60/);
  assert.match(out, /Registros distintos 60/, 'total real, no solo la página');
});

test('comparador: paginar conserva el par; cambiar una captura retira el resultado; el orden elegido no se invierte', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS });
  m.pick(FROM, 'b:2'); m.pick(TO, 'a:1'); m.press('Comparar capturas'); await settle(); m.render();
  assert.match(m.calls[0].path, /from=b%3A2&to=a%3A1&offset=0/, 'no invierte el orden');
  m.calls[0].resolve(compareBody({ chronological: false }, 0, 'b:2', 'a:1')); await m.flush();
  assert.match(m.text(), /comparación inversa/);
  m.press('Siguiente'); await settle(); m.render(); assert.equal(m.calls[1].path, '/v2/captures/compare?from=b%3A2&to=a%3A1&offset=25&limit=25');
  assert.doesNotMatch(m.text(), /Registros 1–2/, 'mientras carga la otra página no se muestra la anterior');
  m.calls[1].resolve(compareBody({ chronological: false }, 25, 'b:2', 'a:1')); await m.flush(); assert.match(m.text(), /Registros 26–27 de 60/);
  m.pick(TO, 'b:2'); await settle(); m.render();
  assert.doesNotMatch(m.text(), /Registros distintos/, 'cambiar una captura retira el resultado'); assert.equal(m.calls.length, 2, 'sin consulta nueva hasta pulsar Comparar');
  assert.equal(m.button('Comparar capturas')!.props.disabled, true, 'dos capturas iguales no se comparan');
  m.pick(TO, 'a:1'); m.press('Comparar capturas'); await settle(); m.render();
  assert.match(m.calls[2].path, /offset=0/, 'volver al inicio'); const stale = m.calls[1]; stale.resolve(compareBody({}, 25, 'b:2', 'a:1')); await m.flush();
  assert.doesNotMatch(m.text(), /Registros 26/, 'una página antigua tardía no se repone');
});

test('comparador: 404, 409 y 422 dan mensajes claros, no cambian la selección y reintentar repite el mismo par', async () => {
  const cases: [number, string, RegExp][] = [[404, 'No se encontró la captura.', /ya no existe en el historial/], [409, 'Compara capturas del mismo portal, origen y entorno explícito.', /mismo portal/], [422, 'Las dos capturas deben tener formato válido y estar conciliadas.', /formato válido/]];
  for (const [status, message, expected] of cases) {
    const m = mount('ComparePanel', { captures: OPTIONS });
    m.pick(FROM, 'a:1'); m.pick(TO, 'b:2'); m.press('Comparar capturas'); await settle(); m.render();
    m.calls[0].reject(httpError(status, message)); await m.flush();
    assert.match(m.text(), expected); assert.equal(m.select(FROM).props.value, 'a:1'); assert.equal(m.select(TO).props.value, 'b:2');
    m.press('Reintentar consulta'); await settle(); m.render();
    assert.equal(m.calls.length, 2); assert.equal(m.calls[1].path, m.calls[0].path, 'mismo par, sin sustituir');
  }
  const old = mount('ComparePanel', { captures: OPTIONS });
  old.pick(FROM, 'a:1'); old.pick(TO, 'b:2'); old.press('Comparar capturas'); await settle(); old.render();
  old.calls[0].reject(httpError(404, 'Operación no disponible en esta aplicación.')); await old.flush();
  assert.match(old.text(), /no incluye esta consulta/, '404 de ruta no es «captura no encontrada»');
});

test('comparador: menos de dos capturas da un estado vacío; una captura elegida que desaparece no se sustituye', async () => {
  const one = mount('ComparePanel', { captures: [OPTIONS[0]] });
  assert.match(one.text(), /al menos dos capturas/); assert.equal(one.select(FROM).props.disabled, true);
  const m = mount('ComparePanel', { captures: OPTIONS });
  m.pick(FROM, 'a:1'); m.pick(TO, 'b:2'); m.render({ captures: [{ id: 'c:3', at: '2026-10-30T10:00:00.000Z', bytes: 1024 }, OPTIONS[0]] });
  assert.equal(m.select(FROM).props.value, 'a:1', 'no elige la captura recién llegada'); assert.match(m.text(), /ya no está en el historial/); assert.equal(m.button('Comparar capturas')!.props.disabled, true);
  assert.equal(m.calls.length, 0);
});

const GONE = [{ id: 'c:3', at: '2026-10-30T10:00:00.000Z', bytes: 1024 }, OPTIONS[1]];
const compareNow = async (m: ReturnType<typeof mount>) => { m.pick(FROM, 'a:1'); m.pick(TO, 'b:2'); m.press('Comparar capturas'); await settle(); m.render(); };

test('comparador: retirar una captura del par con la petición pendiente la aborta y una respuesta tardía no repone resultado ni paginación', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS }); await compareNow(m);
  assert.equal(m.calls.length, 1); assert.match(m.text(), /Comparando capturas/);
  m.render({ captures: GONE }); await settle(); m.render();
  assert.equal(m.calls[0].init.signal.aborted, true, 'la consulta del par que ya no existe se aborta');
  assert.doesNotMatch(m.text(), /Comparando capturas/, 'se retira el indicador de carga');
  m.calls[0].resolve(compareBody()); await m.flush();
  assert.doesNotMatch(m.text(), /Resultado de la comparación|Registros/); assert.equal(m.button('Siguiente'), undefined, 'sin paginación');
  assert.equal(m.select(FROM).props.value, 'a:1', 'la selección explícita se conserva'); assert.equal(m.select(TO).props.value, 'b:2');
  assert.match(m.text(), /ya no está en el historial/); assert.equal(m.button('Comparar capturas')!.props.disabled, true);
  assert.equal(m.calls.length, 1, 'no elige otra captura ni consulta sola');
});

test('comparador: retirar una captura del par tras recibir resultados retira resultado, paginación y error', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS }); await compareNow(m);
  m.calls[0].resolve(compareBody()); await m.flush(); assert.match(m.text(), /Resultado de la comparación/); assert.ok(m.button('Siguiente'));
  m.render({ captures: GONE }); await settle(); m.render();
  assert.doesNotMatch(m.text(), /Resultado de la comparación|Registros/); assert.equal(m.button('Siguiente'), undefined); assert.match(m.text(), /ya no está en el historial/);
  assert.equal(m.select(FROM).props.value, 'a:1'); assert.equal(m.calls.length, 1);
  const failed = mount('ComparePanel', { captures: OPTIONS }); await compareNow(failed);
  failed.calls[0].reject(httpError(422, 'Las dos capturas deben tener formato válido y estar conciliadas.')); await failed.flush(); assert.match(failed.text(), /formato válido/);
  failed.render({ captures: GONE }); await settle(); failed.render();
  assert.doesNotMatch(failed.text(), /formato válido/, 'un error del par retirado tampoco queda'); assert.equal(failed.button('Reintentar consulta'), undefined);
});

test('comparador: una respuesta tardía de un transporte que ignora la cancelación se descarta', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS }, true); await compareNow(m);
  m.render({ captures: GONE }); await settle(); m.render();
  assert.equal(m.calls[0].init.signal.aborted, true); assert.equal(m.calls[0].settled, false, 'el transporte sigue pendiente: ignora abort');
  m.calls[0].resolve(compareBody()); await m.flush();
  assert.doesNotMatch(m.text(), /Resultado de la comparación|Registros/); assert.equal(m.button('Siguiente'), undefined);
  const late = mount('ComparePanel', { captures: OPTIONS }, true); await compareNow(late);
  late.render({ captures: GONE }); await settle(); late.render(); late.calls[0].reject(httpError(422, 'Tarde.')); await late.flush();
  assert.doesNotMatch(late.text(), /Tarde/, 'un error tardío tampoco reaparece');
});

test('comparador: volver a un par válido exige elegirlo y comparar, y empieza en offset 0 sin reutilizar lo retirado', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS }); await compareNow(m);
  m.calls[0].resolve(compareBody()); await m.flush(); m.press('Siguiente'); await settle(); m.render();
  m.calls[1].resolve(compareBody({}, 25)); await m.flush(); assert.match(m.text(), /Registros 26–27 de 60/);
  m.render({ captures: GONE }); await settle(); m.render();
  m.render({ captures: OPTIONS }); await settle(); m.render();
  assert.equal(m.calls.length, 2, 'al reaparecer la captura no se repite sola la petición antigua');
  assert.doesNotMatch(m.text(), /Resultado de la comparación|Registros/, 'ni se muestra el resultado antiguo');
  assert.equal(m.select(FROM).props.value, 'a:1'); assert.equal(m.button('Comparar capturas')!.props.disabled, false);
  m.press('Comparar capturas'); await settle(); m.render();
  assert.equal(m.calls.length, 3); assert.match(m.calls[2].path, /from=a%3A1&to=b%3A2&offset=0&limit=25/);
  m.calls[2].resolve(compareBody()); await m.flush(); assert.match(m.text(), /Registros 1–2 de 60/);
});

test('solo lectura: ninguna consulta de este bloque usa un método distinto de GET', async () => {
  const radarView = mount('RadarPanel', { activeCaptureId: CAP, refreshContext: async () => {} });
  const compare = mount('ComparePanel', { captures: OPTIONS });
  compare.pick(FROM, 'a:1'); compare.pick(TO, 'b:2'); compare.press('Comparar capturas'); await settle(); compare.render(); radarView.pick('Horizonte', '168'); await settle();
  for (const call of [...radarView.calls, ...compare.calls]) assert.ok(!call.init?.method || call.init.method === 'GET', call.path);
  assert.ok(radarView.calls.length >= 2 && compare.calls.length === 1);
  const source = fs.readFileSync(path.join(SRC, 'ContinuityOperations.tsx'), 'utf8');
  assert.doesNotMatch(source, /\bpost\b|method\s*:|'POST'|'PATCH'|'DELETE'|setInterval/, 'sin escrituras ni sondeo propio');
});

test('comparador: pulsar Comparar de nuevo tras un error repite la consulta del mismo par', async () => {
  const m = mount('ComparePanel', { captures: OPTIONS });
  m.pick(FROM, 'a:1'); m.pick(TO, 'b:2'); m.press('Comparar capturas'); await settle(); m.render();
  m.calls[0].reject(httpError(422, 'Las dos capturas deben tener formato válido y estar conciliadas.')); await m.flush();
  m.press('Comparar capturas'); await settle(); m.render();
  assert.equal(m.calls.length, 2); assert.equal(m.calls[1].path, m.calls[0].path);
});
