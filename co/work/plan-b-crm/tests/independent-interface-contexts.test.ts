import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authParentFixtureState, mountLockedAuthParent } from './helpers/auth-parent-harness.js';
import { Runtime, View, Transport, setupGlobals } from './helpers/independent-interface-harness.js';

// QA073 · Contextos de cliente (relaciones062/063, conexión065, comprobación manual067, acceso070, réplica069, activación066).
// Se ejecutan los componentes REALES de src/ con el arnés propio de hooks: NO es React DOM, ni navegador, ni CSS, ni foco real.
// Cada carrera usa una respuesta VÁLIDA retenida del contexto anterior y un transporte que IGNORA la señal de cancelación; se
// comprueba además el estado actual positivo, no solo la ausencia de texto viejo. Los mismos recorridos se repiten en el navegador
// real en tests/e2e/independent-interface-flows.spec.ts. Fuentes bajo prueba = QA073_ROOT (corte propio, por defecto este checkout).
// QA079: los cuatro TODO de QA073 (E2b/E7b = M1, D6 = D1) se retiraron tras comprobar (1) que pasan con las fuentes corregidas y (2) que FALLAN con el corte baseline075 por su causa; se añadieron E2c, E7c–E7g, D6b y D6c.
// M1 se describe como política explícita de IDs numéricos canónicos (cadenas, sin Number), NO como prueba de comportamiento de HubSpot real. D1 es una corrección de intención de la interfaz: el servidor ya devolvía 409.
const OVERRIDE = process.env.QA073_ROOT;
const ROOT = OVERRIDE ? path.resolve(OVERRIDE) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));

type Ctx = { rt: Runtime; t: Transport; mount: (C: any, props: Record<string, any>) => View; load: (file: string) => any };
async function session(fn: (c: Ctx) => Promise<void>) {
  const restore = setupGlobals(), t = new Transport(), rt = new Runtime(ROOT), views: View[] = [], g = globalThis as any, previousFetch = g.fetch;
  g.fetch = t.fetch;
  try { await fn({ rt, t, load: file => rt.load(file), mount: (C, props) => { const v = new View(rt, C, props); views.push(v); return v; } }); }
  finally { views.forEach(v => v.unmount()); g.fetch = previousFetch; restore(); }
}
const agency = (rt: Runtime) => { const { makeFixture, makeDemoSpec } = rt.load('shared/fixtures.ts'); const snap = makeFixture('agency'); return { snap, spec: makeDemoSpec(snap) }; };
const company = (id: string, name: string) => ({ entity: 'companies', id, values: { name } });
const contactRec = (id: string, firstname: string) => ({ entity: 'contacts', id, values: { firstname, lastname: 'X', email: id + '@example.invalid' } });
const many = (n: number, prefix = 'co') => Array.from({ length: n }, (_, i) => company(prefix + '-' + String(i + 1).padStart(3, '0'), 'Empresa ' + (i + 1)));
const optionValues = (v: View) => v.all({ tag: 'option' }).map(o => o.props.value);

// ═══════════════ A · ReferenceSelect (relaciones062 / nombre063) ═══════════════
const refProps = (spec: any, extra: Record<string, any> = {}) => ({ id: 'record-company_id', value: '', entity: 'companies', spec, disabled: false, onChange: () => {}, label: 'Empresa vinculada', ...extra });
const lookupPath = (id: string) => new RegExp('/v2/records/companies/' + encodeURIComponent(id) + '$');
const listPath = /\/v2\/records\/companies\?limit=50/;
const settleAll = async (v: View) => { v.advance(200); await v.settle(); };

test('A1 un ID elegido fuera de los primeros 50 sigue visible; homónimos e IDs iguales no se confunden; el límite de 50 es explícito', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx');
  const picked: (string | null)[] = [];
  t.on(listPath, () => ({ json: { records: [...many(48), company('hom-1', 'Norte'), company('hom-2', 'Norte')], total: 120 } }));
  t.on(lookupPath('co-777'), () => ({ json: { record: company('co-777', 'Elegida fuera de la lista') } }));
  const v = mount(ReferenceSelect, refProps(spec, { value: 'co-777', onChange: (x: string | null) => picked.push(x) }));
  await settleAll(v);
  const values = optionValues(v);
  assert.equal(values.length, 1 + 1 + 50, 'placeholder + elegida fija + 50 de la lista');
  assert.equal(values[1], 'co-777', 'la elegida va fija aunque no esté en los primeros 50');
  const select = v.find({ tag: 'select' }); assert.equal(select.props.value, 'co-777');
  assert.match(v.text(), /Elegida fuera de la lista/);
  assert.match(v.text(), /Se muestran 50 de 120 resultados\. Escribe para afinar la búsqueda\./, 'límite de 50 explícito');
  assert.match(v.text(), /La relación elegida se conserva aparte de estos resultados\./);
  // Homónimos: dos opciones con el mismo nombre, valores (IDs) distintos.
  const homonyms = v.all({ tag: 'option' }).filter(o => /^Norte/.test(v.textOf(o)));
  assert.deepEqual(homonyms.map(o => o.props.value), ['hom-1', 'hom-2']); assert.deepEqual(homonyms.map(o => v.textOf(o)), ['Norte · ID hom-1', 'Norte · ID hom-2']);
  v.fire(select.props.onChange, { target: { value: 'hom-2' } }); assert.deepEqual(picked, ['hom-2'], 'se informa el ID, no la etiqueta');
  v.fire(select.props.onChange, { target: { value: 'no-existe' } }); assert.deepEqual(picked, ['hom-2'], 'un ID que no es una opción vigente no se acepta');
  v.fire(select.props.onChange, { target: { value: '' } }); assert.deepEqual(picked, ['hom-2', null], 'borrar la relación devuelve null');
  assert.equal(select.props['aria-label'], 'Empresa vinculada', 'el nombre accesible conserva field.label exactamente');
  assert.equal(v.find({ tag: 'input', type: 'search' }).props.maxLength, 200);
}));

test('A2 ficha elegida y lista fallan por separado; los reintentos no limpian la selección; 404 no es una ficha vacía válida', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx');
  // a) falla la lista, la ficha elegida se resuelve
  let listCalls = 0;
  t.on(listPath, () => ++listCalls === 1 ? { status: 500, json: { error: 'Fallo ficticio' } } : { json: { records: many(3), total: 3 } });
  t.on(lookupPath('co-9'), () => ({ json: { record: company('co-9', 'Nueve') } }));
  const v = mount(ReferenceSelect, refProps(spec, { value: 'co-9' })); await settleAll(v);
  assert.match(v.textOf(v.find({ role: 'alert' })), /No se pudieron buscar registros\. La relación elegida se conserva\./);
  assert.deepEqual(optionValues(v), ['', 'co-9'], 'la elegida sigue disponible aunque la lista falló');
  assert.equal(v.find({ tag: 'select' }).props.value, 'co-9');
  const retry = v.find({ tag: 'button', text: 'Reintentar búsqueda' }); v.click(retry); await settleAll(v);
  assert.equal(listCalls, 2); assert.equal(v.maybe({ role: 'alert' }), null);
  assert.deepEqual(optionValues(v), ['', 'co-9', 'co-001', 'co-002', 'co-003']); assert.equal(v.find({ tag: 'select' }).props.value, 'co-9');
  assert.equal(t.where(lookupPath('co-9')).length, 1, 'reintentar la lista no repite la ficha elegida');
  // b) falla la ficha (404) y la lista va bien
  const t2 = new Transport(); (globalThis as any).fetch = t2.fetch;
  t2.on(listPath, () => ({ json: { records: many(2), total: 2 } })); let lookups = 0;
  t2.on(lookupPath('co-404'), () => ++lookups === 1 ? { status: 404, json: { error: 'No existe' } } : { json: { record: company('co-404', 'Ya existe') } });
  const picked: any[] = []; const w = mount(ReferenceSelect, refProps(spec, { value: 'co-404', onChange: (x: any) => picked.push(x) })); await settleAll(w);
  assert.match(w.textOf(w.find({ role: 'alert' })), /No se pudo verificar la relación elegida\. Se conserva su ID; no se ha sustituido por otro registro\./);
  const orphan = w.all({ tag: 'option' }).find(o => o.props.value === 'co-404')!;
  assert.ok(orphan && orphan.props.disabled === true && /Relación sin verificar · ID co-404/.test(w.textOf(orphan)), 'ID conservado como opción no elegible');
  assert.equal(w.find({ tag: 'select' }).props.value, 'co-404'); assert.deepEqual(picked, []);
  w.click(w.find({ tag: 'button', text: 'Reintentar relación' })); await settleAll(w);
  assert.equal(lookups, 2); assert.equal(w.maybe({ role: 'alert' }), null); assert.match(w.text(), /Ya existe/);
  assert.equal(t2.where(listPath).length, 1, 'reintentar la ficha no repite la lista');
}));

test('A3 respuestas fuera de contrato no se convierten en opciones elegibles', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx');
  const bad: [string, any, RegExp][] = [
    ['lista con ficha de otra entidad', { records: [company('co-1', 'Ok'), contactRec('ct-1', 'Intrusa')], total: 2 }, /No se pudieron buscar/],
    ['IDs duplicados', { records: [company('co-1', 'A'), company('co-1', 'B')], total: 2 }, /No se pudieron buscar/],
    ['más de 50 registros', { records: many(51), total: 51 }, /No se pudieron buscar/], ['más de 50 registros sin total', { records: many(51) }, /No se pudieron buscar/],
    ['ficha incompleta', { records: [{ entity: 'companies', id: 'co-1' }], total: 1 }, /No se pudieron buscar/],
    ['total incoherente con los registros', { records: many(10), total: 80 }, /No se pudieron buscar/],
    ['records no es una lista', { records: { 0: company('co-1', 'A') }, total: 1 }, /No se pudieron buscar/],
    ['sin records', { total: 0 }, /No se pudieron buscar/],
  ];
  for (const [label, body, expected] of bad) {
    const tx = new Transport(); (globalThis as any).fetch = tx.fetch; tx.on(listPath, () => ({ json: body }));
    const v = mount(ReferenceSelect, refProps(spec)); await settleAll(v);
    assert.match(v.textOf(v.find({ role: 'alert' })), expected, label); assert.deepEqual(optionValues(v), [''], label + ': ninguna opción elegible');
  }
  // La misma ruta con una respuesta válida SÍ produce opciones (control positivo).
  const ok = new Transport(); (globalThis as any).fetch = ok.fetch; ok.on(listPath, () => ({ json: { records: many(3), total: 3 } }));
  const good = mount(ReferenceSelect, refProps(spec)); await settleAll(good); assert.deepEqual(optionValues(good), ['', 'co-001', 'co-002', 'co-003']);
  // Ficha elegida: ID distinto, entidad distinta, sin record.
  for (const [label, body] of [['ID distinto', { record: company('co-OTRO', 'Otra') }], ['entidad distinta', { record: contactRec('co-5', 'Persona') }], ['sin record', {}]] as const) {
    const tx = new Transport(); (globalThis as any).fetch = tx.fetch; tx.on(listPath, () => ({ json: { records: many(2), total: 2 } })); tx.on(lookupPath('co-5'), () => ({ json: body }));
    const v = mount(ReferenceSelect, refProps(spec, { value: 'co-5' })); await settleAll(v);
    assert.match(v.textOf(v.find({ role: 'alert' })), /No se pudo verificar la relación elegida/, label); assert.doesNotMatch(v.text(), /Persona|Otra/, label + ': no se muestra la ficha ajena');
    assert.equal(v.find({ tag: 'select' }).props.value, 'co-5', label + ': se conserva el ID');
  }
}));

test('A4 éxito y error VÁLIDOS tardíos de otro valor o consulta se descartan aunque el transporte ignore la señal', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx');
  t.on(listPath, () => ({ json: { records: many(2), total: 2 } })); t.on(lookupPath('A'), () => 'hold'); t.on(lookupPath('B'), () => ({ json: { record: company('B', 'Empresa B') } }));
  const v = mount(ReferenceSelect, refProps(spec, { value: 'A' })); await settleAll(v);
  const heldA = t.where(lookupPath('A'))[0]; assert.equal(heldA.settled, false); assert.match(v.text(), /Comprobando la relación elegida · ID A/);
  assert.equal(v.find({ tag: 'select' }).props['aria-busy'], true);
  v.update({ value: 'B' }); await settleAll(v);
  assert.match(v.text(), /Empresa B/); assert.equal(v.find({ tag: 'select' }).props['aria-busy'], false, 'spinner del estado actual resuelto');
  assert.equal(heldA.signal!.aborted, true, 'la petición anterior fue cancelada, pero este transporte la ignora');
  const rendersBefore = v.renders;
  heldA.resolve(200, { record: company('A', 'Empresa A tardía válida') }); await v.settle();
  assert.doesNotMatch(v.text(), /tardía/); assert.match(v.text(), /Empresa B/); assert.equal(v.find({ tag: 'select' }).props.value, 'B'); assert.equal(v.maybe({ role: 'alert' }), null);
  assert.equal(v.renders, rendersBefore, 'la respuesta tardía no provoca ningún repintado'); assert.equal(v.setAfterUnmount, 0);
  // Error tardío válido (HTTP 500) del valor anterior.
  const t2 = new Transport(); (globalThis as any).fetch = t2.fetch; t2.on(listPath, () => ({ json: { records: many(2), total: 2 } })); t2.on(lookupPath('A'), () => 'hold'); t2.on(lookupPath('B'), () => ({ json: { record: company('B', 'Empresa B') } }));
  const w = mount(ReferenceSelect, refProps(spec, { value: 'A' })); await settleAll(w); const heldA2 = t2.where(lookupPath('A'))[0];
  w.update({ value: 'B' }); await settleAll(w); heldA2.resolve(500, { error: 'Fallo tardío' }); await w.settle();
  assert.equal(w.maybe({ role: 'alert' }), null, 'un error tardío del contexto anterior no aparece'); assert.match(w.text(), /Empresa B/);
  // Consulta: la respuesta retenida de la consulta vieja no pisa la nueva.
  const t3 = new Transport(); (globalThis as any).fetch = t3.fetch; const q1: any[] = [];
  t3.on(/q=$/, c => { q1.push(c); return 'hold'; }); t3.on(/q=zeta$/, () => ({ json: { records: [company('co-z', 'Zeta')], total: 1 } }));
  const x = mount(ReferenceSelect, refProps(spec)); x.advance(200); await x.settle();
  x.type(x.find({ tag: 'input', type: 'search' }), 'zeta'); x.advance(200); await x.settle();
  assert.deepEqual(optionValues(x), ['', 'co-z']);
  q1[0].resolve(200, { records: many(3), total: 3 }); await x.settle();
  assert.deepEqual(optionValues(x), ['', 'co-z'], 'la lista de la consulta anterior, válida y tardía, no sustituye la actual');
  // Desmontar y recibir éxito/error tardíos no escribe estado.
  const t4 = new Transport(); (globalThis as any).fetch = t4.fetch; t4.on(listPath, () => 'hold'); t4.on(lookupPath('A'), () => 'hold');
  const y = mount(ReferenceSelect, refProps(spec, { value: 'A' })); y.advance(200); await y.settle();
  const [heldList, heldLookup] = [t4.where(listPath)[0], t4.where(lookupPath('A'))[0]]; y.unmount();
  heldList.resolve(200, { records: many(2), total: 2 }); heldLookup.reject(new Error('red caída')); await y.settle();
  assert.equal(y.setAfterUnmount, 0, 'ningún setState tras desmontar');
  // Reapertura: una instancia nueva solo muestra sus propios datos.
  const t5 = new Transport(); (globalThis as any).fetch = t5.fetch; t5.on(listPath, () => ({ json: { records: [company('co-n', 'Nueva')], total: 1 } })); t5.on(lookupPath('A'), () => ({ json: { record: company('A', 'A reabierta') } }));
  const z = mount(ReferenceSelect, refProps(spec, { value: 'A' })); await settleAll(z); assert.match(z.text(), /A reabierta/); assert.deepEqual(optionValues(z), ['', 'A', 'co-n']);
}));

test('A5 A→B→A: la entrada de A vuelve a pedirse y un cambio remoto posterior sustituye al dato antiguo', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx');
  let version = 0; t.on(listPath, () => ({ json: { records: many(2), total: 2 } }));
  t.on(lookupPath('A'), () => ({ json: { record: company('A', 'A versión ' + (++version)) } })); t.on(lookupPath('B'), () => 'hold');
  const v = mount(ReferenceSelect, refProps(spec, { value: 'A' })); await settleAll(v); assert.match(v.text(), /A versión 1/);
  v.update({ value: 'B' }); await settleAll(v);       // B queda pendiente
  v.update({ value: 'A' }); await settleAll(v);
  assert.equal(t.where(lookupPath('A')).length, 2, 'volver a A repite la comprobación de la ficha, no confía en el resultado antiguo');
  assert.match(v.text(), /A versión 2/); assert.doesNotMatch(v.text(), /versión 1/);
  const first = t.where(lookupPath('B'))[0]; first.resolve(200, { record: company('B', 'B tardía') }); await v.settle();
  assert.doesNotMatch(v.text(), /B tardía/); assert.equal(v.find({ tag: 'select' }).props.value, 'A');
}));

test('A6 manejadores capturados antes del último render no actúan sobre un contexto retirado', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx'); const picked: any[] = [];
  t.on(listPath, () => ({ json: { records: many(3), total: 3 } })); t.on(lookupPath('A'), () => ({ json: { record: company('A', 'Empresa A') } })); t.on(lookupPath('B'), () => ({ json: { record: company('B', 'Empresa B') } }));
  const v = mount(ReferenceSelect, refProps(spec, { value: 'A', onChange: (x: any) => picked.push(['viejo', x]) })); await settleAll(v);
  const oldSelect = v.find({ tag: 'select' }).props.onChange, oldSearch = v.find({ tag: 'input', type: 'search' }).props.onChange;
  v.fire(oldSelect, { target: { value: 'co-001' } }); assert.deepEqual(picked, [['viejo', 'co-001']], 'control positivo: el manejador vigente sí actúa');
  picked.length = 0;
  v.update({ value: 'B', onChange: (x: any) => picked.push(['nuevo', x]) }); await settleAll(v);
  v.fire(oldSelect, { target: { value: 'co-002' } }); assert.deepEqual(picked, [], 'el manejador del render anterior no puede elegir una ficha del contexto retirado');
  // Cambiar el valor elegido no cambia el contexto de la LISTA (misma entidad, consulta y estado): su manejador sigue siendo legítimo.
  v.fire(oldSearch, { target: { value: 'legítimo' } }); assert.equal(v.find({ tag: 'input', type: 'search' }).props.value, 'legítimo');
  v.advance(180); await v.settle(); v.fire(v.find({ tag: 'input', type: 'search' }).props.onChange, { target: { value: 'vigente' } });
  v.fire(oldSearch, { target: { value: 'intruso' } }); assert.equal(v.find({ tag: 'input', type: 'search' }).props.value, 'vigente', 'un manejador de búsqueda de una consulta anterior no la pisa');
  v.advance(180); await v.settle();
  v.fire(v.find({ tag: 'select' }).props.onChange, { target: { value: 'co-002' } }); assert.deepEqual(picked, [['nuevo', 'co-002']], 'el vigente sí');
  // Al deshabilitar (guardando) ningún manejador anterior ni botón actúa.
  const live = v.find({ tag: 'select' }).props.onChange; picked.length = 0; const listBefore = t.where(listPath).length; v.update({ disabled: true }); await settleAll(v);
  v.fire(live, { target: { value: 'co-001' } }); assert.deepEqual(picked, [], 'deshabilitado: el manejador capturado no actúa');
  assert.equal(v.find({ tag: 'select' }).props.disabled, true); assert.equal(v.find({ tag: 'input', type: 'search' }).props.disabled, true);
  assert.equal(t.where(listPath).length, listBefore, 'con disabled no se lanza otra búsqueda');
}));

test('A7 la consulta se espera 180 ms: tres pulsaciones seguidas lanzan una sola búsqueda con la última', () => session(async ({ rt, t, mount, load }) => {
  const { spec } = agency(rt); const { ReferenceSelect } = load('src/ReferenceSelect.tsx'); t.on(listPath, () => ({ json: { records: many(1), total: 1 } }));
  const v = mount(ReferenceSelect, refProps(spec)); v.advance(180); await v.settle(); const base = t.where(listPath).length;
  const input = () => v.find({ tag: 'input', type: 'search' });
  v.type(input(), 'a'); v.advance(100); v.type(input(), 'ab'); v.advance(100); v.type(input(), 'abc'); assert.equal(t.where(listPath).length, base, 'aún no hay petición');
  v.advance(180); await v.settle(); const calls = t.where(listPath).slice(base); assert.equal(calls.length, 1); assert.match(calls[0].path, /q=abc$/);
  v.type(input(), 'ñandú & co'); v.advance(180); await v.settle(); assert.match(t.where(listPath).at(-1)!.path, /q=%C3%B1and%C3%BA%20%26%20co$/, 'la consulta va codificada');
}));

// ═══════════════ C · ConnectionDialog (conexión065) ═══════════════
const TOKEN = 'token-ficticio-qa073-0123456789';
const fieldList = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: prefix + String(i + 1).padStart(3, '0'), label: 'Campo ' + prefix + (i + 1) }));
const inspected = (over: Record<string, any> = {}) => ({ accountId: '12345', accountType: 'DEVELOPER_TEST', mode: 'test', fields: { contacts: fieldList('c', 3), companies: fieldList('o', 2), deals: [], tasks: [] }, ...over });
const useFetch = (t: Transport) => { (globalThis as any).fetch = t.fetch; return t; };
const dialogProps = (extra: Record<string, any> = {}) => { const log = { closed: 0, done: 0 }; return { log, props: { close: () => { log.closed++; }, done: async () => { log.done++; }, ...extra } }; };
const portal = (v: View) => v.find({ tag: 'input', where: n => n.props.pattern === '[0-9]+' });
const secret = (v: View) => v.find({ tag: 'input', type: 'password' });
const fillBase = (v: View, mode: 'test' | 'production_readonly' = 'test') => {
  if (mode !== 'test') v.fire(v.find({ tag: 'select' }).props.onChange, { target: { value: mode } });
  v.type(portal(v), '12345'); v.type(secret(v), TOKEN); v.check(v.find({ tag: 'input', type: 'checkbox' }), true);
};
const submitForm = (v: View) => v.submit(v.find({ tag: 'form' }));
async function toVerified(v: View, t: Transport, response: any = inspected()) {
  fillBase(v); submitForm(v); await v.settle(); const call = t.where(/connection\/inspect$/).at(-1)!; call.resolve(200, response); await v.settle(); return call;
}

test('C1 doble envío antes del render: una petición por acción; credenciales, modo y cuenta congelados mientras la operación está activa', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ConnectionDialog } = load('src/ConnectionDialog.tsx'); const { log, props } = dialogProps();
  t.on(/connection\/inspect$/, () => 'hold'); t.on(/\/v2\/connection$/, () => 'hold');
  const v = mount(ConnectionDialog, props); fillBase(v);
  const onSubmit = v.find({ tag: 'form' }).props.onSubmit, oldToken = secret(v).props.onChange, oldPortal = portal(v).props.onChange, oldMode = v.find({ tag: 'select' }).props.onChange;
  onSubmit({ preventDefault() {} }); onSubmit({ preventDefault() {} }); onSubmit({ preventDefault() {} });   // tres envíos sin repintar entre ellos
  await v.settle(); assert.equal(t.where(/connection\/inspect$/).length, 1, 'una sola inspección'); assert.deepEqual(t.posts().map(c => c.path), ['/v2/connection/inspect']);
  assert.deepEqual(t.posts()[0].body.selectedFields, {}, 'la inspección no envía campos elegidos');
  assert.equal(v.find({ tag: 'fieldset' }).props.disabled, true); assert.equal(v.find({ tag: 'fieldset' }).props['aria-busy'], true);
  assert.equal(v.disabled(secret(v)), true);
  // Manejadores capturados antes del último render: no pueden editar el contexto congelado.
  oldToken({ target: { value: 'otra-credencial-intrusa' } }); oldPortal({ target: { value: '99999' } }); oldMode({ target: { value: 'production_readonly' } }); await v.settle();
  assert.equal(secret(v).props.value, TOKEN); assert.equal(portal(v).props.value, '12345'); assert.equal(v.find({ tag: 'select' }).props.value, 'test');
  t.calls[0].resolve(200, inspected()); await v.settle();
  assert.match(v.text(), /Portal 12345 · DEVELOPER_TEST · Ensayo/); assert.equal(log.closed, 0);
  // Guardado: otra vez tres envíos sin repintar → una sola petición de guardado.
  const submit2 = v.find({ tag: 'form' }).props.onSubmit; submit2({ preventDefault() {} }); submit2({ preventDefault() {} }); await v.settle();
  assert.equal(t.where(/\/v2\/connection$/).length, 1, 'un solo guardado'); assert.equal(t.where(/\/v2\/connection$/)[0].body.token, TOKEN);
}));

test('C2 la inspección solo habilita el guardado si corresponde al portal, modo, tipo y esquema solicitados', () => session(async ({ mount, load }) => {
  const { ConnectionDialog } = load('src/ConnectionDialog.tsx');
  const cases: [string, any, 'test' | 'production_readonly', RegExp][] = [
    ['portal distinto', inspected({ accountId: '99999' }), 'test', /no corresponde al portal, modo o esquema/], ['modo distinto', inspected({ mode: 'production_readonly', accountType: 'STANDARD' }), 'test', /no corresponde/],
    ['STANDARD en modo ensayo', inspected({ accountType: 'STANDARD' }), 'test', /no corresponde/], ['DEVELOPER_TEST en producción', inspected({ mode: 'production_readonly' }), 'production_readonly', /no corresponde/],
    ['claves duplicadas', inspected({ fields: { contacts: [{ key: 'dup', label: 'A' }, { key: 'dup', label: 'B' }], companies: [], deals: [], tasks: [] } }), 'test', /no corresponde/],
    ['estructura incompleta', inspected({ fields: { contacts: [], companies: [], deals: [] } }), 'test', /comprobación incompleta o incompatible/], ['clave inválida', inspected({ fields: { contacts: [{ key: '1mala', label: 'X' }], companies: [], deals: [], tasks: [] } }), 'test', /incompleta o incompatible/],
    ['etiqueta vacía', inspected({ fields: { contacts: [{ key: 'ok', label: '' }], companies: [], deals: [], tasks: [] } }), 'test', /incompleta o incompatible/], ['portal no numérico', inspected({ accountId: 'abc' }), 'test', /incompleta o incompatible/],
    ['modo desconocido', inspected({ mode: 'write' }), 'test', /incompleta o incompatible/], ['respuesta vacía', {}, 'test', /incompleta o incompatible/], ['respuesta nula', null, 'test', /incompleta o incompatible/],
  ];
  for (const [label, response, mode, expected] of cases) {
    const tx = useFetch(new Transport()); const v = mount(ConnectionDialog, dialogProps().props); fillBase(v, mode); submitForm(v); await v.settle();
    tx.calls[0].resolve(200, response); await v.settle();
    assert.match(v.textOf(v.find({ role: 'alert' })), expected, label); assert.equal(v.maybe({ tag: 'button', text: 'Guardar conexión' }), null, label + ': sin guardado'); assert.doesNotMatch(v.text(), /Revisa los campos que conservarás/, label);
    assert.equal(tx.posts().length, 1, label + ': solo la inspección');
  }
  // Controles positivos (no se rebajan): ensayo con SANDBOX y DEVELOPER_TEST; producción con STANDARD.
  for (const [label, response, mode] of [['SANDBOX', inspected({ accountType: 'SANDBOX' }), 'test'], ['DEVELOPER_TEST', inspected(), 'test'], ['STANDARD producción', inspected({ mode: 'production_readonly', accountType: 'STANDARD' }), 'production_readonly']] as const) {
    const tx = useFetch(new Transport()); const v = mount(ConnectionDialog, dialogProps().props); fillBase(v, mode); submitForm(v); await v.settle(); tx.calls[0].resolve(200, response); await v.settle();
    assert.ok(v.maybe({ tag: 'button', text: 'Guardar conexión' }), label + ': el esquema válido habilita el guardado'); assert.equal(v.all({ tag: 'input', type: 'checkbox' }).length, 5, label + ': 3 + 2 campos de ejemplo');
  }
}));

test('C3 volver a revisar retira campos y autorización; el máximo de 60 por entidad resiste a un manejador capturado antes del límite', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ConnectionDialog } = load('src/ConnectionDialog.tsx'); const { props } = dialogProps();
  t.on(/\/v2\/connection$/, () => 'hold');
  const v = mount(ConnectionDialog, props); await toVerified(v, t, inspected({ fields: { contacts: fieldList('c', 70), companies: fieldList('o', 2), deals: [], tasks: [] } }));
  const boxes = () => v.all({ tag: 'input', type: 'checkbox' }); assert.equal(boxes().length, 72);
  for (let i = 0; i < 59; i++) v.check(boxes()[i], true);
  assert.match(v.text(), /59 de 60 seleccionados · 70 disponibles/);
  const h60 = boxes()[59].props.onChange, h61 = boxes()[60].props.onChange;   // ambos capturados con 59 elegidos y casillas habilitadas
  assert.equal(v.disabled(boxes()[60]), false, 'precondición: aún hay hueco');
  h60({ target: { checked: true } }); h61({ target: { checked: true } }); await v.settle();   // ambos antes de repintar
  assert.match(v.text(), /60 de 60 seleccionados · 70 disponibles/, 'el 61.º no entra aunque su manejador se capturó antes del límite');
  assert.equal(v.disabled(boxes()[65]), true, 'las demás casillas quedan deshabilitadas');
  v.check(boxes()[71], true); // un campo de otra entidad (companies) sigue permitido
  submitForm(v); await v.settle(); const save = t.where(/\/v2\/connection$/)[0];
  const sent = save.body.selectedFields; assert.equal(sent.contacts.length, 60); assert.equal(new Set(sent.contacts).size, 60);
  const allowed = new Set(fieldList('c', 70).map(f => f.key)); assert.ok(sent.contacts.every((k: string) => allowed.has(k)), 'solo campos de la inspección');
  assert.ok(!sent.contacts.includes(fieldList('c', 70)[60].key), 'el campo 61 no se envía'); assert.deepEqual(Object.keys(sent).sort(), ['companies', 'contacts']);
  save.resolve(200, { saved: true }); await v.settle();
  // Nueva sesión: volver a revisar retira lo elegido y la autorización.
  const t2 = useFetch(new Transport()); const w = mount(ConnectionDialog, dialogProps().props); await toVerified(w, t2);
  w.check(w.all({ tag: 'input', type: 'checkbox' })[0], true); assert.match(w.text(), /1 de 60 seleccionados/);
  w.click(w.find({ tag: 'button', text: 'Revisar conexión' }));
  assert.equal(w.maybe({ tag: 'button', text: 'Guardar conexión' }), null, 'la autorización anterior se retira'); assert.equal(w.all({ tag: 'input', type: 'checkbox' }).length, 1, 'solo vuelve la casilla de confirmación');
  w.check(w.find({ tag: 'input', type: 'checkbox' }), true);
  submitForm(w); await w.settle(); const again = t2.where(/connection\/inspect$/).at(-1)!; assert.equal(t2.where(/connection\/inspect$/).length, 2);
  assert.deepEqual(again.body.selectedFields, {}, 'la nueva inspección no arrastra campos');
}));

test('C4 cerrar o desmontar y recibir una inspección o un error válidos antiguos no reabre ni contamina un diálogo nuevo', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ConnectionDialog } = load('src/ConnectionDialog.tsx'); const first = dialogProps();
  t.on(/connection\/inspect$/, () => 'hold');
  const old = mount(ConnectionDialog, first.props); fillBase(old); submitForm(old); await old.settle(); const heldOk = t.calls[0];
  old.click(old.find({ tag: 'button', label: 'Cerrar' })); assert.equal(first.log.closed, 1, 'cerrar llama a close una vez'); assert.equal(heldOk.signal!.aborted, true);
  old.unmount(); heldOk.resolve(200, inspected()); await old.settle();
  assert.equal(first.log.closed, 1); assert.equal(first.log.done, 0); assert.equal(old.setAfterUnmount, 0);
  const second = dialogProps(); const fresh = mount(ConnectionDialog, second.props); await fresh.settle();
  assert.equal(secret(fresh).props.value, ''); assert.equal(fresh.maybe({ role: 'alert' }), null); assert.doesNotMatch(fresh.text(), /Portal 12345|Revisa los campos/);
  // Error tardío válido (HTTP 422) de la instancia vieja: tampoco aparece en la nueva.
  const t2 = useFetch(new Transport()); t2.on(/connection\/inspect$/, () => 'hold'); const gone = mount(ConnectionDialog, dialogProps().props); fillBase(gone); submitForm(gone); await gone.settle(); const heldErr = t2.calls[0];
  gone.unmount(); const next = mount(ConnectionDialog, dialogProps().props); heldErr.resolve(422, { error: 'Error antiguo válido' }); await next.settle(); await gone.settle();
  assert.equal(next.maybe({ role: 'alert' }), null); assert.doesNotMatch(next.text(), /Error antiguo/);
}));

test('C5 saved:true + lectura posterior fallida informa «guardada», retira la credencial y reintenta solo la lectura; saved:false o ausente no es éxito', () => session(async ({ mount, load }) => {
  const { ConnectionDialog } = load('src/ConnectionDialog.tsx');
  const strings = (v: View) => { const hits: string[] = []; const walk = (nodes: any[]) => { for (const n of nodes) if (typeof n !== 'string') { for (const value of Object.values(n.props)) if (typeof value === 'string') hits.push(value); walk(n.children); } }; walk(v.root); return hits; };
  let refreshes = 0; const failingDone = async () => { refreshes++; if (refreshes === 1) throw new Error('lectura local caída'); };
  const tx = useFetch(new Transport()); const log = { closed: 0 }; tx.on(/\/v2\/connection$/, () => ({ json: { saved: true } }));
  const v = mount(ConnectionDialog, { close: () => { log.closed++; }, done: failingDone }); await toVerified(v, tx); submitForm(v); await v.settle();
  assert.match(v.text(), /Conexión guardada/); assert.match(v.text(), /La credencial se retiró del formulario/);
  assert.ok(!strings(v).some(s => s.includes(TOKEN)), 'la credencial no queda en ninguna propiedad visible'); assert.equal(v.all({ tag: 'input' }).length, 0);
  assert.match(v.textOf(v.find({ role: 'alert' })), /La conexión se guardó, pero no se pudo actualizar la pantalla\./); assert.equal(log.closed, 0);
  v.click(v.find({ tag: 'button', text: 'Reintentar actualización' })); await v.settle();
  assert.equal(refreshes, 2); assert.equal(log.closed, 1); assert.equal(tx.posts().filter(c => c.path === '/v2/connection').length, 1, 'el reintento no repite el POST de guardado');
  // Acuses que NO confirman el guardado.
  for (const [label, body] of [['saved:false', { saved: false }], ['sin saved', {}], ['saved como texto', { saved: 'true' }], ['otro campo', { ok: true }], ['nulo', null]] as const) {
    const t2 = useFetch(new Transport()); t2.on(/\/v2\/connection$/, () => ({ json: body })); const state = { done: 0 }; const w = mount(ConnectionDialog, { close: () => {}, done: async () => { state.done++; } });
    await toVerified(w, t2); submitForm(w); await w.settle();
    assert.match(w.textOf(w.find({ role: 'alert' })), /El servidor no confirmó el guardado\. No se da la conexión por guardada\./, label); assert.doesNotMatch(w.text(), /Conexión guardada/, label); assert.equal(state.done, 0, label + ': no se refresca como si estuviera guardada');
  }
}));

// ═══════════════ E · ManualRecovery (devolución manual067) ═══════════════
// La rama de producción es contrafactual aquí: el componente recibe los cambios por props y el transporte es ficticio; no hay portal real.
const mk = (id: number, entity: string, recordId: string, operation: 'create' | 'update') => ({ id, at: '2026-10-30T10:00:00.000Z', entity, recordId, operation, before: operation === 'create' ? null : { entity, id: recordId, values: { phone: '0' } }, after: { entity, id: recordId, values: { phone: '1' } } });
const CH_A = [mk(101, 'contacts', 'local-1', 'create'), mk(102, 'contacts', 'local-2', 'create'), mk(103, 'companies', 'co-1', 'update')];
const idKey = (c: { entity: string; recordId?: string; localId?: string }) => JSON.stringify([c.entity, c.recordId ?? c.localId]);
const okResult = (changes: any[], revision: string, over: Record<string, any> = {}) => {
  const ids = [...new Set(changes.map(idKey))]; const checks = ids.map(k => { const [entity, localId] = JSON.parse(k); return { entity, localId, passed: true, reason: 'Valores y relaciones confirmados por lectura.' }; });
  return { passed: true, checks, report: { id: 'rep-1', method: 'manual_verified', revision, sessionId: 'ses-1', captureId: 'cap-1', watermark: Math.max(...changes.map((c: any) => c.id)), verifiedAt: '2026-10-30T10:05:00.000Z', records: ids.length }, ...over };
};
const manualProps = (extra: Record<string, any> = {}) => { const log = { refresh: 0, failRefresh: false }; return { log, props: { changes: CH_A, revision: 'r1', pending: 3, refresh: async () => { log.refresh++; if (log.failRefresh) throw new Error('lectura local caída'); }, ...extra } }; };
const remoteBoxes = (v: View) => v.all({ tag: 'input', where: n => n.props.inputMode === 'numeric' });
const approval = (v: View) => v.find({ tag: 'input', type: 'checkbox' });
const verifyButton = (v: View) => v.find({ tag: 'button', text: /Comprobar resultado en HubSpot|Comprobando por lectura/ });
const fillIds = (v: View, a = '501', b = '502') => { v.type(remoteBoxes(v)[0], a); if (remoteBoxes(v)[1]) v.type(remoteBoxes(v)[1], b); };
const verifyPath = /manual-recovery\/verify$/;

test('E1 cambiar revisión, operaciones o IDs retira la confirmación (también A→B→A) y los mapeos antiguos no se envían', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx'); const { props } = manualProps(); t.on(verifyPath, () => 'hold');
  const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true); assert.equal(approval(v).props.checked, true, 'precondición: confirmada');
  v.update({ revision: 'r2' }); assert.equal(approval(v).props.checked, false, 'otra revisión'); v.update({ revision: 'r1' }); assert.equal(approval(v).props.checked, false, 'A→B→A no resucita la confirmación');
  v.check(approval(v), true); v.type(remoteBoxes(v)[0], '503'); assert.equal(approval(v).props.checked, false, 'editar un ID retira la confirmación');
  v.check(approval(v), true); v.update({ pending: 4 }); assert.equal(approval(v).props.checked, false, 'cambia el recuento de operaciones'); v.update({ pending: 3 }); assert.equal(approval(v).props.checked, false);
  v.check(approval(v), true); v.update({ changes: [...CH_A, mk(104, 'contacts', 'local-3', 'create')], pending: 4 }); assert.equal(approval(v).props.checked, false, 'nueva alta');
  assert.match(v.text(), /Indica un ID remoto numérico para cada alta/, 'la alta nueva exige su ID'); assert.equal(v.disabled(approval(v)), true);
  // La alta local-2 desaparece: su ID tecleado ya no pertenece a ninguna alta pendiente y no se envía.
  v.update({ changes: [CH_A[0], CH_A[2]], pending: 2 }); assert.equal(remoteBoxes(v).length, 1); v.type(remoteBoxes(v)[0], '501'); v.check(approval(v), true);
  v.click(verifyButton(v)); await v.settle(); const post = t.where(verifyPath)[0];
  assert.deepEqual(post.body.mapping, [{ entity: 'contacts', localId: 'local-1', remoteId: '501' }], 'solo las altas pendientes actuales'); assert.equal(post.body.revision, 'r1'); assert.equal(post.body.reviewed, true);
}));

test('E2 cada alta exige un ID numérico; duplicados dentro de una entidad se rechazan; el mismo ID en entidades distintas es válido', () => session(async ({ mount, load }) => {
  const { ManualRecovery } = load('src/ManualRecovery.tsx');
  const run = (a: string, b: string, changes = CH_A) => { const v = mount(ManualRecovery, manualProps({ changes }).props); fillIds(v, a, b); return v; };
  for (const [label, a, b, expected] of [['vacío', '', '502', /Indica un ID remoto numérico/], ['texto', 'abc', '502', /Indica un ID remoto numérico/], ['con signo', '-5', '502', /Indica un ID remoto numérico/], ['con espacio', '5 0', '502', /Indica un ID remoto numérico/], ['101 dígitos', '1'.repeat(101), '502', /Indica un ID remoto numérico/], ['duplicado', '501', '501', /Dos altas de la misma entidad no pueden compartir el ID remoto/]] as const) {
    const v = run(a, b); assert.match(v.text(), expected, label); assert.equal(v.disabled(approval(v)), true, label + ': sin confirmación posible'); assert.equal(v.disabled(verifyButton(v)), true, label);
  }
  const ok = run('1'.repeat(100), '502'); assert.doesNotMatch(ok.text(), /Indica un ID|Dos altas/, '100 dígitos es el máximo válido'); assert.equal(ok.disabled(approval(ok)), false);
  const cross = run('501', '501', [mk(101, 'contacts', 'local-1', 'create'), mk(102, 'companies', 'local-9', 'create'), mk(103, 'companies', 'co-1', 'update')]);
  assert.doesNotMatch(cross.text(), /Dos altas/, 'el mismo ID en entidades distintas es válido'); assert.equal(cross.disabled(approval(cross)), false);
}));

// E2b · M1 (QA079). Política explícita de IDs numéricos canónicos en la interfaz. ALCANCE: no se comprueba contra HubSpot real; la reproducción de QA073 era un remoto simulado que normaliza ceros iniciales.
test('E2b M1 (UI, QA079): 0501/000/00/007 son inválidos como ID nuevo («sin ceros iniciales»); no hay confirmación ni comprobación posible y no sale ninguna petición', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx');
  for (const bad of ['0501', '000', '00', '007', '00000000000000000501']) for (const [where, a, b] of [['primero', bad, '502'], ['segundo', '501', bad]] as const) {
    const v = mount(ManualRecovery, manualProps().props); fillIds(v, a, b); const label = '«' + bad + '» en el ' + where;
    assert.match(v.text(), /Indica un ID remoto numérico para cada alta \(hasta 100 dígitos, sin ceros iniciales\)\./, label); assert.equal(v.disabled(approval(v)), true, label + ': sin confirmación'); assert.equal(v.disabled(verifyButton(v)), true, label + ': sin comprobación');
    v.check(approval(v), true); assert.equal(approval(v).props.checked, false, label + ': forzar la casilla no la marca'); v.click(verifyButton(v));
    assert.deepEqual([remoteBoxes(v)[0].props.value, remoteBoxes(v)[1].props.value], [a, b], label + ': el texto tecleado no se convierte a otro ID');
  }
  await Promise.resolve(); assert.equal(t.calls.length, 0, 'ninguna petición (ni lectura ni comprobación) por un ID no canónico');
  // Control de causa: es la forma del ID, no el recuento. Los mismos campos con IDs canónicos habilitan la confirmación.
  for (const [a, b] of [['501', '502'], ['0', '1'], ['10', '1000000']] as const) { const ok = mount(ManualRecovery, manualProps().props); fillIds(ok, a, b); assert.doesNotMatch(ok.text(), /Indica un ID remoto|Dos altas/, a + '/' + b); assert.equal(ok.disabled(approval(ok)), false, a + '/' + b); }
}));

test('E2c M1 (UI): IDs grandes distintos son válidos y viajan como texto exacto (sin Number/parseInt); el duplicado literal sigue rechazado; el mismo ID en otra entidad es válido', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx'); t.on(verifyPath, () => ({ json: okResult(CH_A, 'r1') }));
  const A = '9007199254740992', B = '9007199254740993', v = mount(ManualRecovery, manualProps().props); fillIds(v, A, B);
  assert.equal(String(Number(B)), A, 'precondición: Number() colapsaría los dos IDs'); assert.doesNotMatch(v.text(), /Indica un ID remoto|Dos altas/, 'distintos: sin error'); assert.equal(v.disabled(approval(v)), false);
  v.check(approval(v), true); v.click(verifyButton(v)); await v.settle();
  const post = t.where(verifyPath)[0]; assert.deepEqual(post.body.mapping, [{ entity: 'contacts', localId: 'local-1', remoteId: A }, { entity: 'contacts', localId: 'local-2', remoteId: B }], 'IDs exactos, como cadenas'); assert.ok(post.body.mapping.every((m: { remoteId: unknown }) => typeof m.remoteId === 'string'));
  const dup = mount(ManualRecovery, manualProps().props); fillIds(dup, B, B); assert.match(dup.text(), /Dos altas de la misma entidad no pueden compartir el ID remoto/); assert.equal(dup.disabled(approval(dup)), true);
  const cross = mount(ManualRecovery, manualProps({ changes: [mk(101, 'contacts', 'local-1', 'create'), mk(102, 'companies', 'local-9', 'create'), mk(103, 'companies', 'co-1', 'update')] }).props); fillIds(cross, B, B);
  assert.doesNotMatch(cross.text(), /Dos altas/, 'el mismo ID en entidades distintas es válido'); assert.equal(cross.disabled(approval(cross)), false);
}));

test('E3 el resultado debe cubrir exactamente las fichas pendientes, con informe coherente; un array vacío no es «todo correcto»', () => session(async ({ mount, load }) => {
  const { ManualRecovery } = load('src/ManualRecovery.tsx'); const good = okResult(CH_A, 'r1');
  const mutated = (fn: (r: any) => void) => { const r = structuredClone(good); fn(r); return r; };
  const bad: [string, any][] = [
    ['falta una ficha', mutated(r => { r.checks.pop(); r.report.records = 2; })], ['sin comprobaciones', mutated(r => { r.checks = []; })], ['ficha duplicada', mutated(r => { r.checks[1] = { ...r.checks[0] }; })],
    ['ficha ajena', mutated(r => { r.checks[2] = { entity: 'contacts', localId: 'ajena', passed: true, reason: 'x' }; })], ['passed true con una comprobación fallida', mutated(r => { r.checks[0].passed = false; })],
    ['passed false con todo correcto', mutated(r => { r.passed = false; r.report = null; })], ['passed true sin informe', mutated(r => { r.report = null; })], ['informe de simulación', mutated(r => { r.report.method = 'simulation'; })],
    ['informe de otra revisión', mutated(r => { r.report.revision = 'antigua'; })], ['marca final distinta', mutated(r => { r.report.watermark = 999; })], ['recuento distinto', mutated(r => { r.report.records = 2; })],
    ['fecha inválida', mutated(r => { r.report.verifiedAt = 'no-es-fecha'; })], ['id de informe vacío', mutated(r => { r.report.id = ''; })], ['sesión vacía', mutated(r => { r.report.sessionId = ''; })], ['captura vacía', mutated(r => { r.report.captureId = ''; })],
    ['passed false con informe', mutated(r => { r.passed = false; r.checks[0].passed = false; })], ['campo de comprobación mal tipado', mutated(r => { r.checks[0].passed = 'sí'; })], ['lista en lugar de objeto', [good]], ['texto', 'ok'], ['nulo', null],
  ];
  for (const [label, response] of bad) {
    const tx = useFetch(new Transport()); tx.on(verifyPath, () => ({ json: response })); const { log, props } = manualProps(); const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true); v.click(verifyButton(v)); await v.settle();
    assert.match(v.textOf(v.find({ role: 'alert' })), /La respuesta no identifica todos los registros o no corresponde a esta revisión/, label); assert.equal(v.maybe({ role: 'status' }), null, label + ': nada se presenta como confirmado');
    assert.equal(approval(v).props.checked, false, label + ': hay que volver a confirmar'); assert.equal(log.refresh, 0, label + ': no se refresca como si hubiera acabado');
  }
  // Control positivo: el mismo flujo con la respuesta íntegra.
  const tx = useFetch(new Transport()); tx.on(verifyPath, () => ({ json: good })); const { log, props } = manualProps(); const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true); v.click(verifyButton(v)); await v.settle();
  assert.match(v.textOf(v.find({ role: 'status' })), /El servidor confirmó la comprobación de esta revisión\./); assert.equal(log.refresh, 1); assert.equal(v.maybe({ role: 'alert' }), null);
}));

test('E4 doble clic, cambio de revisión o desmontaje durante la petición: sin resultado ni error obsoletos, sin repetir y sin conservar la autorización', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx'); const { log, props } = manualProps(); t.on(verifyPath, () => 'hold');
  const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true);
  const click = verifyButton(v).props.onClick; click(); click(); click(); await v.settle(); assert.equal(t.where(verifyPath).length, 1, 'tres clics sin repintar = una petición');
  assert.equal(approval(v).props.checked, false, 'la autorización se consume al enviar'); assert.equal(t.where(verifyPath)[0].body.reviewed, true);
  v.update({ revision: 'r2' }); t.where(verifyPath)[0].resolve(200, okResult(CH_A, 'r1')); await v.settle();
  assert.equal(v.maybe({ role: 'status' }), null, 'un resultado válido de la revisión anterior no se presenta'); assert.equal(log.refresh, 0); assert.equal(v.maybe({ role: 'alert' }), null);
  fillIds(v); v.check(approval(v), true); assert.equal(approval(v).props.checked, true, 'con la revisión nueva se puede volver a confirmar'); v.click(verifyButton(v)); await v.settle(); assert.equal(t.where(verifyPath).length, 2, 'la primera no quedó registrada como acuse de la segunda');
  // Error tardío del contexto anterior y desmontaje.
  t.where(verifyPath)[1].resolve(200, okResult(CH_A, 'r2')); await v.settle(); assert.match(v.text(), /confirmó la comprobación/);
  const t2 = useFetch(new Transport()); t2.on(verifyPath, () => 'hold'); const w = mount(ManualRecovery, manualProps().props); fillIds(w); w.check(approval(w), true); w.click(verifyButton(w)); await w.settle();
  const held = t2.where(verifyPath)[0]; w.unmount(); held.resolve(409, { error: 'Los cambios locales variaron.' }); await w.settle(); assert.equal(w.setAfterUnmount, 0);
  const t3 = useFetch(new Transport()); t3.on(verifyPath, () => 'hold'); const y = mount(ManualRecovery, manualProps().props); fillIds(y); y.check(approval(y), true); y.click(verifyButton(y)); await y.settle();
  y.update({ revision: 'r9' }); t3.where(verifyPath)[0].resolve(500, { error: 'Fallo tardío' }); await y.settle(); assert.equal(y.maybe({ role: 'alert' }), null, 'el error tardío del contexto anterior no aparece');
}));

test('E5 comprobación confirmada seguida de lectura local fallida: se conserva el acuse y solo se reintenta la lectura', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx'); const { log, props } = manualProps(); log.failRefresh = true; t.on(verifyPath, () => ({ json: okResult(CH_A, 'r1') }));
  const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true); const staleVerify = verifyButton(v).props.onClick; v.click(verifyButton(v)); await v.settle();
  assert.match(v.text(), /El servidor confirmó la comprobación/); assert.match(v.textOf(v.find({ role: 'alert' })), /La comprobación se confirmó, pero no se pudo actualizar el estado local\. Reintenta la actualización; no se repetirá la comprobación remota\./);
  assert.equal(log.refresh, 1); log.failRefresh = false; v.click(v.find({ tag: 'button', text: 'Reintentar actualización local' })); await v.settle();
  assert.equal(log.refresh, 2); assert.equal(t.where(verifyPath).length, 1, 'el reintento no repite la comprobación remota'); assert.equal(v.maybe({ role: 'alert' }), null);
  staleVerify(); await v.settle(); assert.equal(t.where(verifyPath).length, 1, 'un manejador antiguo no repite una comprobación ya confirmada');
}));

test('E6 409 retira la autorización aunque la lectura posterior también falle; un resultado negativo conserva las pendientes y exige nueva revisión humana', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { ManualRecovery } = load('src/ManualRecovery.tsx'); const { log, props } = manualProps(); log.failRefresh = true; t.on(verifyPath, () => ({ status: 409, json: { error: 'Los cambios locales variaron. Revisa la lista actual.' } }));
  const v = mount(ManualRecovery, props); fillIds(v); v.check(approval(v), true); v.click(verifyButton(v)); await v.settle();
  const messages = v.all({ role: 'alert' }).map(a => v.textOf(a)).join(' | '); assert.match(messages, /Los cambios locales variaron/); assert.match(messages, /No se pudo actualizar el estado local\./);
  assert.equal(approval(v).props.checked, false); assert.equal(log.refresh, 1); assert.equal(v.disabled(verifyButton(v)), true, 'sin nueva confirmación humana no se puede repetir');
  // Resultado negativo.
  const negative = { passed: false, checks: CH_A.map((c, i) => ({ entity: c.entity, localId: c.recordId, passed: i !== 1, reason: i !== 1 ? 'ok' : 'Hay valores distintos.' })).filter((c, i, all) => all.findIndex(x => idKey(x) === idKey(c)) === i), report: null };
  const tx = useFetch(new Transport()); tx.on(verifyPath, () => ({ json: negative })); const second = manualProps(); const w = mount(ManualRecovery, second.props); fillIds(w); w.check(approval(w), true); w.click(verifyButton(w)); await w.settle();
  assert.match(w.textOf(w.find({ role: 'status' })), /Hay diferencias\. Los cambios siguen pendientes/); assert.match(w.text(), /Por revisar: Hay valores distintos\./);
  assert.equal(approval(w).props.checked, false); assert.equal(w.disabled(verifyButton(w)), true, 'exige una revisión humana nueva'); assert.match(w.text(), /3 operaciones pendientes/); assert.doesNotMatch(w.text(), /Sin cambios pendientes/);
}));

// ═══════════════ G · Protection (acceso070 / límite parental072) ═══════════════
const PW = 'contrasena-ficticia-qa073';
const pwFields = (v: View) => v.all({ tag: 'input', type: 'password' });
const protectionProps = (setup: boolean, extra: Record<string, any> = {}) => { const log = { done: 0, cancel: 0, failDone: 0 }; return { log, props: { setup, done: async () => { log.done++; if (log.failDone > 0) { log.failDone--; throw new Error('apertura fallida'); } }, ...extra } }; };
const fillPw = (v: View, setup: boolean, password = PW, confirm = password) => { const [a, b] = pwFields(v); v.type(a, password); if (setup && b) v.type(b, confirm); };

test('G1 setup y login tienen un solo envío incluso antes del render; campos congelados; validación también ante envío programático', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { Protection } = load('src/Protection.tsx'); t.on(/auth\/setup$/, () => 'hold'); t.on(/auth\/login$/, () => 'hold');
  const { props } = protectionProps(true); const v = mount(Protection, props); fillPw(v, true);
  const submit = v.find({ tag: 'form' }).props.onSubmit, oldPw = pwFields(v)[0].props.onChange, oldConfirm = pwFields(v)[1].props.onChange;
  submit({ preventDefault() {} }); submit({ preventDefault() {} }); submit({ preventDefault() {} }); await v.settle();
  assert.equal(t.where(/auth\/setup$/).length, 1); assert.deepEqual(t.where(/auth\/setup$/)[0].body, { password: PW }, 'el cuerpo solo lleva la contraseña');
  assert.equal(v.disabled(pwFields(v)[0]), true); assert.equal(v.find({ tag: 'form' }).props['aria-busy'], true);
  oldPw({ target: { value: 'cambiada-durante-el-vuelo' } }); oldConfirm({ target: { value: 'otra' } }); await v.settle(); assert.equal(pwFields(v)[0].props.value, PW, 'campos congelados frente a manejadores antiguos');
  // Validación con envío programático (se salta minLength/required de HTML).
  const cases: [string, boolean, string, string, RegExp][] = [['setup corta (11)', true, 'a'.repeat(11), 'a'.repeat(11), /entre 12 y 200 caracteres/], ['setup larga (201)', true, 'a'.repeat(201), 'a'.repeat(201), /entre 12 y 200 caracteres/], ['setup sin coincidir', true, PW, PW + 'x', /no coinciden/], ['login vacío', false, '', '', /Introduce tu contraseña local/], ['login largo (201)', false, 'a'.repeat(201), 'a'.repeat(201), /hasta 200 caracteres/]];
  for (const [label, setup, p, c, expected] of cases) {
    const tx = useFetch(new Transport()); const w = mount(Protection, protectionProps(setup).props); fillPw(w, setup, p, c);
    w.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await w.settle();
    assert.match(w.textOf(w.find({ role: 'alert' })), expected, label); assert.equal(tx.calls.length, 0, label + ': ninguna petición');
  }
  const loginT = useFetch(new Transport()); loginT.on(/auth\/login$/, () => 'hold'); const l = mount(Protection, protectionProps(false).props); fillPw(l, false);
  const ls = l.find({ tag: 'form' }).props.onSubmit; ls({ preventDefault() {} }); ls({ preventDefault() {} }); await l.settle(); assert.equal(loginT.where(/auth\/login$/).length, 1, 'el login también tiene un solo envío');
}));

test('G2 configured:true confirma setup y authenticated:true confirma login; otro campo, false o ausencia no abren; 401/429 son visibles y reintentables', () => session(async ({ mount, load }) => {
  const { Protection } = load('src/Protection.tsx');
  const rejected = async (setup: boolean, body: unknown, label: string) => {
    const tx = useFetch(new Transport()); tx.on(setup ? /auth\/setup$/ : /auth\/login$/, () => ({ json: body })); const { log, props } = protectionProps(setup); const v = mount(Protection, props); fillPw(v, setup); v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle();
    assert.match(v.textOf(v.find({ role: 'alert' })), setup ? /El servidor no confirmó la creación de la protección\./ : /El servidor no confirmó el desbloqueo de la copia\./, label); assert.equal(log.done, 0, label + ': no se abre la copia'); assert.doesNotMatch(v.text(), /Protección creada|Copia desbloqueada/, label);
    assert.equal(pwFields(v)[0].props.value, PW, label + ': la contraseña sigue para reintentar');
  };
  for (const body of [{ authenticated: true }, { configured: false }, { configured: 'true' }, {}, null, [], 'ok']) await rejected(true, body, 'setup ' + JSON.stringify(body));
  for (const body of [{ configured: true }, { authenticated: false }, { authenticated: 1 }, {}, null, 'ok']) await rejected(false, body, 'login ' + JSON.stringify(body));
  for (const [setup, body] of [[true, { configured: true }], [false, { authenticated: true }]] as const) {
    const tx = useFetch(new Transport()); tx.on(setup ? /auth\/setup$/ : /auth\/login$/, () => ({ json: body })); const { log, props } = protectionProps(setup); const v = mount(Protection, props); fillPw(v, setup); v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle();
    assert.equal(log.done, 1, 'control positivo'); assert.match(v.find({ tag: 'h1' }).props.children ?? v.textOf(v.find({ tag: 'h1' })), /Protección creada|Copia desbloqueada/);
  }
  // 401 y 429: visibles y con reintento real (segunda petición).
  for (const [status, message] of [[401, 'Contraseña incorrecta.'], [429, 'Demasiados intentos. Espera un minuto.']] as const) {
    const tx = useFetch(new Transport()); let n = 0; tx.on(/auth\/login$/, () => ++n === 1 ? { status, json: { error: message } } : { json: { authenticated: true } }); const { log, props } = protectionProps(false); const v = mount(Protection, props); fillPw(v, false);
    v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle(); assert.equal(v.textOf(v.find({ role: 'alert' })), message); assert.equal(log.done, 0);
    v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle(); assert.equal(tx.where(/auth\/login$/).length, 2, 'reintento posible'); assert.equal(log.done, 1); assert.equal(v.maybe({ role: 'alert' }), null);
  }
}));

test('G3 la credencial se retira del estado visible al acuse válido', () => session(async ({ mount, load }) => {
  const { Protection } = load('src/Protection.tsx'); const tx = useFetch(new Transport()); tx.on(/auth\/setup$/, () => ({ json: { configured: true } }));
  const v = mount(Protection, protectionProps(true).props); fillPw(v, true); v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle();
  const strings: string[] = []; const walk = (nodes: any[]) => { for (const n of nodes) if (typeof n !== 'string') { for (const value of Object.values(n.props)) if (typeof value === 'string') strings.push(value); walk(n.children); } }; walk(v.root);
  assert.ok(!strings.some(s => s.includes(PW)), 'la contraseña no queda en ninguna propiedad'); assert.equal(v.all({ tag: 'input' }).length, 0); assert.ok(v.maybe({ tag: 'button', text: 'Reintentar apertura' }));
  assert.ok(!JSON.stringify(v.states()).includes(PW), 'la contraseña tampoco queda en el estado del componente (credenciales retiradas al acuse válido)');
}));

test('G4 cancelar, desmontar o pasar setup→login→setup descarta respuestas y errores válidos antiguos (transporte sin cancelación)', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { Protection } = load('src/Protection.tsx'); t.on(/auth\/(setup|login)$/, () => 'hold'); const { log, props } = protectionProps(true);
  const v = mount(Protection, props); fillPw(v, true); v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle(); const held = t.calls[0];
  v.update({ setup: false }); v.update({ setup: true }); await v.settle();
  assert.equal(held.signal!.aborted, true); assert.equal(pwFields(v)[0].props.value, '', 'al volver a setup los campos están vacíos'); held.resolve(200, { configured: true }); await v.settle();
  assert.equal(log.done, 0, 'la respuesta válida de la instancia anterior no abre la copia'); assert.doesNotMatch(v.text(), /Protección creada/);
  // Error tardío válido.
  const t2 = useFetch(new Transport()); t2.on(/auth\/(setup|login)$/, () => 'hold'); const w = mount(Protection, protectionProps(true).props); fillPw(w, true); w.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await w.settle();
  const late = t2.calls[0]; w.update({ setup: false }); late.resolve(429, { error: 'Demasiados intentos. Espera un minuto.' }); await w.settle(); assert.equal(w.maybe({ role: 'alert' }), null, 'el error del modo anterior no aparece en el actual');
  // Desmontaje.
  const t3 = useFetch(new Transport()); t3.on(/auth\/login$/, () => 'hold'); const z = protectionProps(false); const y = mount(Protection, z.props); fillPw(y, false); y.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await y.settle();
  const gone = t3.calls[0]; y.unmount(); gone.resolve(200, { authenticated: true }); await y.settle(); assert.equal(z.log.done, 0); assert.equal(y.setAfterUnmount, 0);
  // Cancelar.
  const t4 = useFetch(new Transport()); const cancelled = { n: 0 }; const c = protectionProps(true, { cancel: () => { cancelled.n++; } }); const x = mount(Protection, c.props); x.click(x.find({ tag: 'button', text: 'Volver a la aplicación' })); assert.equal(cancelled.n, 1); void t4;
}));

test('G5 con done asíncrono que falla tras el acuse, la UI conserva el acuse y reintenta solo done sin otro POST', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { Protection } = load('src/Protection.tsx'); t.on(/auth\/login$/, () => ({ json: { authenticated: true } })); const { log, props } = protectionProps(false); log.failDone = 1;
  const v = mount(Protection, props); fillPw(v, false); v.find({ tag: 'form' }).props.onSubmit({ preventDefault() {} }); await v.settle();
  assert.match(v.textOf(v.find({ role: 'alert' })), /El servidor confirmó el acceso, pero no se pudo terminar de abrir la copia\. Reintenta la apertura; no se enviará otra petición de autenticación\./); assert.equal(log.done, 1); assert.match(v.textOf(v.find({ tag: 'h1' })), /Copia desbloqueada/);
  v.click(v.find({ tag: 'button', text: 'Reintentar apertura' })); await v.settle(); assert.equal(log.done, 2); assert.equal(t.where(/auth\/login$/).length, 1, 'ninguna segunda autenticación'); assert.equal(v.maybe({ role: 'alert' }), null);
}));

// G6 · AUTH_PARENT072: un estado válido de un desbloqueo anterior puede llegar mientras se comprueba otro bloqueo.
test('G6 · una lectura válida anterior al bloqueo no abre la copia mientras se confirma el acceso', async () => {
  const restore = setupGlobals();
  try {
    const app = await mountLockedAuthParent(path.join(ROOT, 'src/App.tsx'));
    const oldKey = app.protection().key;
    const opening = app.protection().props.done();
    assert.equal(typeof opening?.then, 'function', 'Protection recibe la promesa de apertura');
    const stale = assert.rejects(opening);
    await app.flush();
    assert.ok(app.protection(), 'la copia sigue protegida con la lectura pendiente');

    app.signalLock();
    await app.flush();
    assert.equal(app.count('/v2/auth/status'), 2);
    assert.notEqual(app.protection().key, oldKey, 'el bloqueo crea una pantalla de acceso nueva');
    app.respond('/v2/state', authParentFixtureState);
    await stale;
    await app.flush();
    assert.equal(app.openedApp(), false, 'la respuesta antigua no abre la copia ni antes de confirmarse el bloqueo');

    app.respond('/v2/auth/status', { configured: true, authenticated: false });
    await app.flush();
    const current = app.protection().props.done();
    app.respond('/v2/state', authParentFixtureState);
    await current;
    await app.flush();
    assert.equal(app.openedApp(), true, 'la lectura vigente permite abrir la copia');
  } finally {
    restore();
  }
});

// ═══════════════ F · TeamSync (réplica069) ═══════════════
// UI real con transporte ficticio. El backend real en memoria (TeamSyncClient) se ejercita en independent-replica-contracts.test.ts.
const T_ORIGIN = 'https://equipo.example.invalid', T_TENANT = '3f1c2b7e-8d4a-4b6e-9a1c-5d2e7f9a0b13', T_TOKEN = 'ab'.repeat(32);
const rev = (n: number) => n.toString(16).padStart(64, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');
const tRow = (n: number, values: Record<string, unknown> = {}, version = 1) => ({ entity: 'contacts', id: 'c-' + pad3(n), version, value: { entity: 'contacts', id: 'c-' + pad3(n), values: { firstname: 'Nombre' + n, lastname: 'Apellido' + n, email: 'c' + n + '@example.invalid', phone: '600 100 ' + pad3(n), ...values } } });
const tCompany = (n: number) => ({ entity: 'companies', id: 'co-' + pad3(n), version: 1, value: { entity: 'companies', id: 'co-' + pad3(n), values: { name: 'Empresa ' + n } } });
const teamView = (records: any[], over: Record<string, unknown> = {}) => ({ linked: true, configured: true, origin: T_ORIGIN, url: T_ORIGIN, tenantId: T_TENANT, records, pending: 0, conflicts: [], lastSync: null, error: null, revision: rev(1), totalRecords: records.length, recordsComplete: true, ...over });
const teamPath = /\/v5\/team-sync$/;
const refreshButton = (v: View) => v.find({ tag: 'button', text: /Actualizar copia local|Leyendo copia…/ });
const editButton = (v: View, id: string) => v.find({ tag: 'button', label: 'Editar teléfono de ' + id });
const modalPhone = (v: View) => v.find({ tag: 'input', where: n => n.props.maxLength === 10000 });
const saveButton = (v: View) => v.find({ tag: 'button', text: 'Guardar en la copia' });

test('F1 una lectura válida tardía (éxito o error) de un contexto retirado no sustituye a la actual aunque el transporte ignore la señal', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { TeamSync } = load('src/TeamSync.tsx'); let n = 0;
  t.on(teamPath, () => ++n === 1 ? 'hold' : { json: teamView([tRow(2, { firstname: 'Beatriz' })], { revision: rev(2) }) });
  const v = mount(TeamSync, {}); await v.settle(); assert.match(v.text(), /Leyendo copia…/); const heldA = t.where(teamPath)[0];
  v.click(refreshButton(v)); await v.settle(); assert.match(v.text(), /Beatriz Apellido2/); assert.equal(heldA.signal!.aborted, true);
  heldA.resolve(200, teamView([tRow(1, { firstname: 'Alicia' })], { revision: rev(9) })); await v.settle();
  assert.doesNotMatch(v.text(), /Alicia/); assert.match(v.text(), /Beatriz Apellido2/); assert.equal(v.setAfterUnmount, 0);
  // Error tardío válido.
  const t2 = useFetch(new Transport()); let m = 0; t2.on(teamPath, () => ++m === 1 ? 'hold' : { json: teamView([tRow(2)], { revision: rev(2) }) });
  const w = mount(TeamSync, {}); await w.settle(); const held = t2.where(teamPath)[0]; w.click(refreshButton(w)); await w.settle(); held.resolve(503, { error: 'Servicio caído tardío' }); await w.settle();
  assert.equal(w.maybe({ role: 'alert' }), null, 'el error tardío no aparece'); assert.match(w.text(), /Nombre2 Apellido2/);
  // Desmontaje con lectura abierta.
  const t3 = useFetch(new Transport()); t3.on(teamPath, () => 'hold'); const y = mount(TeamSync, {}); await y.settle(); const open = t3.where(teamPath)[0]; y.unmount(); open.resolve(200, teamView([tRow(1)])); await y.settle(); assert.equal(y.setAfterUnmount, 0);
}));

test('F2 acuses de vinculación o guardado de otra empresa/destino no se muestran como éxito; acuse correcto + lectura fallida reintenta solo el GET', () => session(async ({ mount, load }) => {
  const { TeamSync } = load('src/TeamSync.tsx');
  const unlinked = { linked: false, configured: true, origin: T_ORIGIN, records: [], pending: 0, conflicts: [], lastSync: null, error: null };
  const fillLink = (v: View) => { const [, tenant, token] = v.all({ tag: 'input' }); v.type(tenant, T_TENANT); v.type(v.all({ tag: 'input' })[2], T_TOKEN); void token; };
  const attempt = async (response: any) => {
    const tx = useFetch(new Transport()); tx.on(teamPath, () => ({ json: unlinked })); tx.on(/team-sync\/link$/, () => ({ json: response })); const v = mount(TeamSync, {}); await v.settle(); fillLink(v);
    assert.equal(v.disabled(v.find({ tag: 'button', text: 'Vincular copia protegida' })), false, 'precondición: formulario válido'); v.submit(v.find({ tag: 'form' })); await v.settle(); return { v, tx };
  };
  for (const [label, response] of [['otra empresa', teamView([tRow(1)], { tenantId: '9a1c2b7e-8d4a-4b6e-9a1c-5d2e7f9a0b99' })], ['otro destino', teamView([tRow(1)], { url: 'https://otro.example.invalid' })], ['no vinculada', unlinked], ['forma inválida', { ok: true }], ['sin identidad', teamView([tRow(1)], { tenantId: undefined })]] as const) {
    const { v, tx } = await attempt(response);
    assert.match(v.textOf(v.find({ role: 'alert' })), /El servidor no confirmó el intercambio con la empresa y el destino solicitados/, label); assert.doesNotMatch(v.text(), /La vinculación quedó guardada/, label);
    assert.match(v.text(), /Actualiza la lectura local antes de hacer otro intercambio/, label); assert.equal(tx.posts().length, 1, label);
    v.click(refreshButton(v)); await v.settle(); assert.equal(tx.posts().length, 1, label + ': actualizar la lectura no repite la vinculación');
  }
  // Acuse correcto + lectura posterior fallida.
  const tx = useFetch(new Transport()); let reads = 0; tx.on(teamPath, () => ++reads === 1 ? { json: unlinked } : reads === 2 ? { status: 503, json: { error: 'Lectura caída' } } : { json: teamView([tRow(1)]) });
  tx.on(/team-sync\/link$/, () => ({ json: teamView([tRow(1)]) })); const v = mount(TeamSync, {}); await v.settle(); fillLink(v); v.submit(v.find({ tag: 'form' })); await v.settle();
  assert.match(v.text(), /La vinculación quedó guardada en esta copia\./); assert.match(v.textOf(v.find({ role: 'alert' })), /Lectura caída/); assert.match(v.text(), /Actualiza la lectura local antes de hacer otro intercambio/);
  v.click(refreshButton(v)); await v.settle(); assert.equal(tx.where(/team-sync\/link$/).length, 1, 'el reintento hace solo GET'); assert.equal(reads, 3); assert.equal(v.maybe({ role: 'alert' }), null); assert.match(v.text(), /Nombre1 Apellido1/);
}));

test('F3 guardar el teléfono: acuse exacto (queued:true y pending 1..100); 409 conserva el borrador, permite refrescar dentro del modal y exige revisar antes de reintentar', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { TeamSync } = load('src/TeamSync.tsx'); let view = teamView([tRow(1), tRow(2)], { revision: rev(1) });
  t.on(teamPath, () => ({ json: view })); t.on(/team-sync\/edit$/, () => ({ status: 409, json: { error: 'La réplica cambió desde que abriste la ficha.' } }));
  const v = mount(TeamSync, {}); await v.settle(); v.click(editButton(v, 'c-001')); assert.equal(modalPhone(v).props.value, '600 100 001');
  v.type(modalPhone(v), '911 222 333'); v.submit(v.find({ tag: 'form', className: /team-sync-edit/ })); await v.settle();
  assert.deepEqual(t.where(/team-sync\/edit$/)[0].body, { entity: 'contacts', id: 'c-001', values: { phone: '911 222 333' }, revision: rev(1) }, 'el POST lleva la revisión exacta de apertura');
  assert.match(v.text(), /La réplica cambió desde que abriste la ficha\./); assert.equal(modalPhone(v).props.value, '911 222 333', 'el borrador se conserva'); assert.match(v.text(), /Actualiza la copia sin cerrar este formulario/);
  assert.equal(v.disabled(saveButton(v)), true, 'no se puede reintentar sin revisar'); assert.equal(t.where(/team-sync\/edit$/).length, 1);
  // Refrescar dentro del modal: la réplica cambió (otra revisión y otro teléfono).
  view = teamView([tRow(1, { phone: '700 000 001' }, 2), tRow(2)], { revision: rev(2) });
  v.click(v.find({ tag: 'button', text: 'Actualizar copia sin perder borrador' })); await v.settle();
  assert.match(v.text(), /La réplica cambió\. Se conserva tu borrador\. Teléfono actual recibido: 700 000 001\./); assert.equal(modalPhone(v).props.value, '911 222 333'); assert.equal(v.disabled(saveButton(v)), true, 'sigue sin poder guardarse hasta revisar');
  v.click(v.find({ tag: 'button', text: 'Revisar versión actual' })); assert.equal(v.maybe({ text: /Se conserva tu borrador/ }), null); assert.equal(v.disabled(saveButton(v)), false);
  t.where(/team-sync\/edit$/); (t as any).auto = []; t.on(teamPath, () => ({ json: view })); t.on(/team-sync\/edit$/, () => ({ json: { queued: true, pending: 1 } }));
  v.submit(v.find({ tag: 'form', className: /team-sync-edit/ })); await v.settle();
  assert.deepEqual(t.where(/team-sync\/edit$/).at(-1)!.body.revision, rev(2), 'tras revisar, el guardado usa la revisión nueva'); assert.match(v.text(), /El teléfono se guardó en la cola local\. Todavía no se ha sincronizado con el equipo\./); assert.equal(v.maybe({ tag: 'form', className: /team-sync-edit/ }), null);
  // Acuses que no confirman la cola.
  for (const [label, ack] of [['queued:false', { queued: false, pending: 1 }], ['sin pending', { queued: true }], ['pending 0', { queued: true, pending: 0 }], ['pending 101', { queued: true, pending: 101 }], ['pending decimal', { queued: true, pending: 1.5 }], ['nulo', null]] as const) {
    const tx = useFetch(new Transport()); tx.on(teamPath, () => ({ json: teamView([tRow(1)]) })); tx.on(/team-sync\/edit$/, () => ({ json: ack })); const w = mount(TeamSync, {}); await w.settle(); w.click(editButton(w, 'c-001')); w.submit(w.find({ tag: 'form', className: /team-sync-edit/ })); await w.settle();
    assert.match(w.textOf(w.find({ role: 'alert' })), /El servidor no confirmó que el cambio quedara pendiente/, label); assert.doesNotMatch(w.text(), /se guardó en la cola local/, label); assert.equal(w.disabled(saveButton(w)), true, label + ': hay que revisar antes de repetir');
  }
}));

test('F4 si la ficha desaparece de la réplica no se elige otra automáticamente; el guardado con ruta v6 inexistente (404) no cae a la ruta antigua', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { TeamSync } = load('src/TeamSync.tsx'); let view = teamView([tRow(1), tRow(2)], { revision: rev(1) }); t.on(teamPath, () => ({ json: view }));
  const v = mount(TeamSync, {}); await v.settle(); v.click(editButton(v, 'c-001')); view = teamView([tRow(2)], { revision: rev(2) });
  v.click(v.find({ tag: 'button', text: 'Actualizar copia sin perder borrador' })); await v.settle();
  assert.match(v.text(), /Teléfono actual recibido: Ficha ausente de la copia recibida\./); assert.equal(v.disabled(v.find({ tag: 'button', text: 'Revisar versión actual' })), true); assert.equal(v.disabled(saveButton(v)), true);
  assert.match(v.textOf(v.find({ tag: 'form', className: /team-sync-edit/ })), /ID c-001/, 'el formulario sigue siendo de la ficha elegida, no de c-002');
  // 404 de la ruta v6.
  const t2 = useFetch(new Transport()); t2.on(teamPath, () => ({ json: teamView([tRow(1)]) })); t2.on(/team-sync\/edit$/, () => ({ status: 404, json: { error: 'Not found' } }));
  const w = mount(TeamSync, {}); await w.settle(); w.click(editButton(w, 'c-001')); w.submit(w.find({ tag: 'form', className: /team-sync-edit/ })); await w.settle();
  assert.match(w.textOf(w.find({ role: 'alert' })), /Este servidor no admite guardar contra una revisión exacta\. Actualiza Plan B; no se enviará por la ruta antigua\./);
  assert.deepEqual(t2.posts().map(c => c.path), ['/v6/team-sync/edit'], 'solo la ruta con revisión; nunca /v5/team-sync/edit');
}));

test('F5 un manejador de guardado capturado antes del cierre no repite el guardado; doble envío antes del render = una petición', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { TeamSync } = load('src/TeamSync.tsx'); t.on(teamPath, () => ({ json: teamView([tRow(1)]) })); t.on(/team-sync\/edit$/, () => 'hold');
  const v = mount(TeamSync, {}); await v.settle(); v.click(editButton(v, 'c-001')); v.type(modalPhone(v), '911 000 111');
  const submit = v.find({ tag: 'form', className: /team-sync-edit/ }).props.onSubmit; submit({ preventDefault() {} }); submit({ preventDefault() {} }); submit({ preventDefault() {} }); await v.settle();
  assert.equal(t.where(/team-sync\/edit$/).length, 1, 'una sola petición de guardado'); assert.equal(v.disabled(modalPhone(v)), true, 'el campo queda congelado');
  t.where(/team-sync\/edit$/)[0].resolve(200, { queued: true, pending: 1 }); await v.settle();
  submit({ preventDefault() {} }); await v.settle(); assert.equal(t.where(/team-sync\/edit$/).length, 1, 'un manejador antiguo no repite el guardado tras cerrar');
  // Cancelar/cerrar y luego llamar al manejador capturado.
  const t2 = useFetch(new Transport()); t2.on(teamPath, () => ({ json: teamView([tRow(1)]) })); const w = mount(TeamSync, {}); await w.settle(); w.click(editButton(w, 'c-001'));
  const old = w.find({ tag: 'form', className: /team-sync-edit/ }).props.onSubmit; w.click(w.find({ tag: 'button', text: 'Cancelar' })); old({ preventDefault() {} }); await w.settle(); assert.equal(t2.posts().length, 0);
}));

test('F6 la réplica completa se recorre por páginas de 20; sin metadata se avisa sin ocultar lo recibido ni habilitar la edición', () => session(async ({ t, mount, load }) => {
  useFetch(t); const { TeamSync } = load('src/TeamSync.tsx'); const rows = [...Array.from({ length: 130 }, (_, i) => tCompany(i + 1)), ...Array.from({ length: 225 }, (_, i) => tRow(i + 1))];
  t.on(teamPath, () => ({ json: teamView(rows) })); const v = mount(TeamSync, {}); await v.settle();
  assert.match(v.text(), /355 registros recibidos · 225 contactos en la réplica completa/); assert.match(v.text(), /1–20 de 225 contactos recibidos/); assert.equal(v.all({ tag: 'li' }).length, 20);
  for (let i = 0; i < 11; i++) v.click(v.find({ tag: 'button', text: 'Siguiente' }));
  assert.match(v.text(), /221–225 de 225 contactos recibidos/); assert.match(v.text(), /Página 12 de 12/); assert.equal(v.all({ tag: 'li' }).length, 5); assert.match(v.text(), /ID c-225/); assert.equal(v.disabled(v.find({ tag: 'button', text: 'Siguiente' })), true);
  v.type(v.find({ tag: 'input', type: 'search' }), 'c-225'); assert.match(v.text(), /1–1 de 1 contactos recibidos · 225 contactos recibidos en total/);
  v.type(v.find({ tag: 'input', type: 'search' }), 'zzz'); assert.match(v.text(), /No hay contactos que coincidan\./);
  // Servidor antiguo: sin revisión ni metadata de completitud.
  const t2 = useFetch(new Transport()); t2.on(teamPath, () => ({ json: teamView([tRow(1), tRow(2)], { revision: undefined, totalRecords: undefined, recordsComplete: undefined }) })); const old = mount(TeamSync, {}); await old.settle();
  assert.match(old.text(), /No se ha podido comprobar que estén todos los registros\. Recibidos: 2\./); assert.match(old.text(), /Este servidor no identifica la revisión de la réplica/);
  assert.match(old.text(), /Nombre1 Apellido1/, 'lo recibido sigue visible'); assert.equal(old.disabled(editButton(old, 'c-001')), true, 'sin revisión no se edita');
  // Metadata discordante.
  const t3 = useFetch(new Transport()); t3.on(teamPath, () => ({ json: teamView([tRow(1)], { totalRecords: 5 }) })); const odd = mount(TeamSync, {}); await odd.settle();
  assert.match(odd.text(), /Recibidos: 1 de 5 indicados/);
}));

// ═══════════════ D · Preparation (activación066) ═══════════════
// La UI se ejercita con revisiones controladas; el contrato del servidor (409/422/atomicidad) está en independent-activation-contracts.test.ts.
async function preparedState(_ctx: Ctx, candidateTitle = 'Distribuidora Atlas') {
  const { createBaseApp } = await import(pathToFileURL(path.join(ROOT, 'server/app.ts')).href); const { makeFixture, makeDemoSpec } = await import(pathToFileURL(path.join(ROOT, 'shared/fixtures.ts')).href);
  const h = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' }); const gen = (p: string) => ({ provider: 'demo', model: null, generatedAt: '2026-10-30T00:00:00.000Z', prompt: p, approved: false });
  const a = makeFixture('agency'); h.store.importSnapshot(a); h.store.saveGeneration(makeDemoSpec(a), gen('')); h.store.activate();
  const b = makeFixture('distribution'); h.store.importSnapshot(b); const spec = makeDemoSpec(b); spec.title = candidateTitle; h.store.saveGeneration(spec, gen('candidata'));
  const state = (await h.app.inject({ url: '/api/state' })).json(); await h.app.close(); return state;
}
const reviewFor = (state: any, revision: string, over: Record<string, any> = {}) => ({ revision, kind: 'candidate', target: { snapshot: { ...state.candidate.snapshot, records: [], links: [] }, spec: state.candidate.spec, generation: state.candidate.generation, reconciliation: state.candidate.reconciliation, error: null }, records: state.candidate.snapshot.records.length, localChanges: 0, replacesRecords: true, replacementConfirmed: false, canActivate: true, reasons: [], ...over });
const prepProps = (state: any, extra: Record<string, any> = {}) => { const log = { steps: [] as number[], opened: 0, errors: [] as string[], refreshes: 0, failRefresh: false }; return { log, props: { state, step: 2, setStep: (n: number) => log.steps.push(n), refresh: async () => { log.refreshes++; if (log.failRefresh) throw new Error('lectura caída'); return state; }, openWorkspace: () => { log.opened++; }, configure: () => {}, onConnect: () => {}, onError: (e: string) => log.errors.push(e), ...extra } }; };
const reviewPath = /\/v4\/activation-review$/, activatePath = /\/v4\/activate-reviewed$/;
const approvalBox = (v: View) => v.find({ tag: 'input', type: 'checkbox', where: n => n.props.checked !== undefined && !!n.props.onChange });
const activateButton = (v: View) => v.find({ tag: 'button', text: /Activar y abrir aplicación/ });

test('D1 la activación exige la revisión cargada y la casilla; envía exactamente la revisión mostrada y solo abre tras confirmación idéntica', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const state = await preparedState(ctx); const { Preparation } = load('src/Preparation.tsx'); const R = 'a'.repeat(64);
  t.on(reviewPath, () => ({ json: reviewFor(state, R) })); t.on(activatePath, () => ({ json: { ready: true, reviewedRevision: R } }));
  const { log, props } = prepProps(state); const v = mount(Preparation, props); assert.match(v.text(), /Leyendo la versión que se activará…/); await v.settle();
  assert.match(v.text(), /Versión candidata · todavía no sustituye la copia activa · Distribuidora Atlas/); assert.match(v.text(), /Revisión aaaaaaaaaaaa/);
  assert.equal(approvalBox(v).props.checked, false); assert.equal(v.disabled(activateButton(v)), true); v.click(activateButton(v)); assert.equal(t.where(activatePath).length, 0, 'sin casilla no hay petición');
  v.check(approvalBox(v), true); assert.equal(v.disabled(activateButton(v)), false); v.click(activateButton(v)); await v.settle();
  assert.deepEqual(t.where(activatePath)[0].body, { reviewed: true, revision: R }); assert.equal(log.opened, 1); assert.equal(log.refreshes, 1); assert.deepEqual(log.errors.filter(Boolean), []);
  // Acuse con otra revisión: no se abre; la casilla se retira y se vuelve a leer la revisión.
  const t2 = useFetch(new Transport()); t2.on(reviewPath, () => ({ json: reviewFor(state, R) })); t2.on(activatePath, () => ({ json: { ready: true, reviewedRevision: 'b'.repeat(64) } }));
  const a = prepProps(state); const w = mount(Preparation, a.props); await w.settle(); w.check(approvalBox(w), true); w.click(activateButton(w)); await w.settle();
  assert.equal(a.log.opened, 0); assert.match(a.log.errors.join('|'), /El servidor no confirmó la revisión activada/); assert.equal(approvalBox(w).props.checked, false); assert.equal(t2.where(reviewPath).length, 2, 'se vuelve a pedir la revisión');
  const t3 = useFetch(new Transport()); t3.on(reviewPath, () => ({ json: reviewFor(state, R) })); t3.on(activatePath, () => ({ json: { ready: false, reviewedRevision: R } })); const b = prepProps(state); const x = mount(Preparation, b.props); await x.settle(); x.check(approvalBox(x), true); x.click(activateButton(x)); await x.settle(); assert.equal(b.log.opened, 0, 'ready:false no abre');
}));

test('D2 409 retira la casilla y recarga; error de activación + error de refresco se atiende sin abrir el espacio ni avanzar pasos en falso', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const state = await preparedState(ctx); const { Preparation } = load('src/Preparation.tsx'); let n = 0;
  t.on(reviewPath, () => ({ json: reviewFor(state, String(++n).repeat(64).slice(0, 64)) })); t.on(activatePath, () => ({ status: 409, json: { error: 'La preparación cambió después de revisarla. Actualiza el contenido y confirma de nuevo.' } }));
  const { log, props } = prepProps(state); log.failRefresh = true; const v = mount(Preparation, props); await v.settle(); v.check(approvalBox(v), true); v.click(activateButton(v)); await v.settle();
  assert.equal(log.opened, 0); assert.deepEqual(log.steps, [], 'ningún paso avanza'); assert.equal(approvalBox(v).props.checked, false, 'la casilla se retira');
  assert.match(log.errors.join('|'), /La preparación cambió después de revisarla/); assert.match(log.errors.join('|'), /No se pudo completar o actualizar la preparación\. Vuelve a consultar su estado antes de continuar\./);
  assert.equal(t.where(reviewPath).length, 2, 'la revisión se recarga'); assert.match(v.text(), /Revisión 222222222222/, 'la revisión mostrada es la nueva'); assert.equal(v.disabled(activateButton(v)), true);
}));

test('D3 «Actualizar revisión» retira la autorización y la casilla no pasa a una revisión posterior', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const state = await preparedState(ctx); const { Preparation } = load('src/Preparation.tsx'); let n = 0;
  t.on(reviewPath, () => ({ json: reviewFor(state, String(++n).repeat(64).slice(0, 64)) })); const v = mount(Preparation, prepProps(state).props); await v.settle();
  v.check(approvalBox(v), true); assert.equal(approvalBox(v).props.checked, true); v.click(v.find({ tag: 'button', text: 'Actualizar revisión' })); await v.settle();
  assert.equal(t.where(reviewPath).length, 2); assert.match(v.text(), /Revisión 222222222222/); assert.equal(approvalBox(v).props.checked, false, 'la revisión nueva no hereda la autorización'); assert.equal(v.disabled(activateButton(v)), true);
}));

test('D4 404 de la revisión no cae al endpoint legado; la activación queda bloqueada con un mensaje accionable', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const state = await preparedState(ctx); const { Preparation } = load('src/Preparation.tsx'); t.on(reviewPath, () => ({ status: 404, json: { error: 'Not found' } }));
  const v = mount(Preparation, prepProps(state).props); await v.settle();
  assert.match(v.textOf(v.find({ role: 'alert' })), /Esta versión del servidor no permite activar una revisión exacta\. Actualiza Plan B antes de continuar\./);
  assert.deepEqual(t.calls.map(c => c.method + ' ' + c.path), ['GET /v4/activation-review'], 'ni /activate ni ninguna otra ruta'); assert.equal(v.maybe({ tag: 'button', text: /Activar y abrir aplicación/ }), null);
}));

test('D5 una revisión VÁLIDA tardía del contexto anterior no sustituye a la actual; un manejador de activar capturado antes del cambio no envía nada', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const A = await preparedState(ctx, 'Versión A'), B = await preparedState(ctx, 'Versión B'); const { Preparation } = load('src/Preparation.tsx');
  const RA = 'a'.repeat(64), RB = 'b'.repeat(64); let n = 0;
  t.on(reviewPath, () => ++n === 1 ? 'hold' : { json: reviewFor(B, RB) }); t.on(activatePath, () => ({ json: { ready: true, reviewedRevision: RB } }));
  const v = mount(Preparation, prepProps(A).props); await v.settle(); const heldA = t.where(reviewPath)[0]; v.update({ state: B }); await v.settle();
  assert.match(v.text(), /Revisión bbbbbbbbbbbb/); heldA.resolve(200, reviewFor(A, RA)); await v.settle(); assert.match(v.text(), /Revisión bbbbbbbbbbbb/); assert.doesNotMatch(v.text(), /Revisión aaaaaaaaaaaa/); assert.equal(v.setAfterUnmount, 0);
  // Manejador capturado con la casilla marcada y luego cambia el contexto.
  const t2 = useFetch(new Transport()); t2.on(reviewPath, () => ({ json: reviewFor(A, RA) })); t2.on(activatePath, () => ({ json: { ready: true, reviewedRevision: RA } }));
  const w = mount(Preparation, prepProps(A).props); await w.settle(); w.check(approvalBox(w), true); const old = activateButton(w).props.onClick; w.update({ state: B }); await w.settle(); old(); await w.settle();
  assert.equal(t2.where(activatePath).length, 0, 'el manejador del contexto retirado no activa');
}));

// D6 · D1 de QA073 (corregido en QA079). La lectura nueva de A tras A→B→A no debe heredar la respuesta ni la aprobación de la lectura anterior de A.
// ALCANCE HONESTO: es una corrección de INTENCIÓN en la interfaz. El servidor ya neutralizaba una revisión obsoleta con 409 (ver independent-activation-contracts.test.ts); esto NO cierra ningún bypass de permisos.
const reviewMarker = (rev: string) => 'Revisión ' + rev.slice(0, 12);
const noApprovalOffered = (v: View, label: string) => {
  assert.equal(v.maybe({ tag: 'input', type: 'checkbox', where: n => n.props.checked === true }), null, label + ': ninguna casilla marcada');
  const button = v.maybe({ tag: 'button', text: /Activar y abrir aplicación/ }); assert.ok(button === null || v.disabled(button), label + ': el botón de activar no está habilitado');
};

test('D6 QA073-D1: A→B→A con la lectura nueva de A pendiente no muestra casilla marcada ni botón habilitado por la respuesta antigua; tras cargar exige otra revisión humana y envía la revisión NUEVA', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const A = await preparedState(ctx, 'Versión A'), B = await preparedState(ctx, 'Versión B'); const { Preparation } = load('src/Preparation.tsx');
  const RA1 = 'a'.repeat(64), RB = 'b'.repeat(64), RA2 = 'c'.repeat(64); let n = 0;
  t.on(reviewPath, () => ++n === 1 ? { json: reviewFor(A, RA1) } : 'hold'); t.on(activatePath, call => ({ json: { ready: true, reviewedRevision: call.body.revision } }));
  const { log, props } = prepProps(A); const v = mount(Preparation, props); await v.settle();
  v.check(approvalBox(v), true); assert.equal(approvalBox(v).props.checked, true, 'precondición: A aprobada'); assert.equal(v.disabled(activateButton(v)), false, 'precondición: activar habilitado'); const oldActivate = activateButton(v).props.onClick;
  v.update({ state: B }); await v.settle(); v.update({ state: A }); await v.settle();     // B y la nueva lectura de A quedan pendientes (llamadas 2 y 3)
  assert.equal(t.where(reviewPath).length, 3); noApprovalOffered(v, 'A→B→A con la lectura pendiente'); assert.match(v.text(), /Leyendo la versión que se activará…/); assert.doesNotMatch(v.text(), new RegExp(reviewMarker(RA1)), 'la respuesta antigua de A no se muestra');
  oldActivate(); await v.settle(); assert.equal(t.where(activatePath).length, 0, 'un manejador de «Activar» capturado con la aprobación antigua no envía nada');
  // Éxito tardío de la lectura de B: no repone la respuesta ni los permisos del contexto actual.
  t.where(reviewPath)[1].resolve(200, reviewFor(B, RB)); await v.settle(); noApprovalOffered(v, 'tras el éxito tardío de B'); assert.doesNotMatch(v.text(), new RegExp(reviewMarker(RB)), 'la lectura de B no se muestra en A'); assert.match(v.text(), /Leyendo la versión que se activará…/, 'A sigue pendiente');
  // Llega la lectura nueva de A: se muestra, pero SIN aprobación heredada.
  t.where(reviewPath)[2].resolve(200, reviewFor(A, RA2)); await v.settle();
  assert.match(v.text(), new RegExp(reviewMarker(RA2))); assert.doesNotMatch(v.text(), new RegExp(reviewMarker(RA1))); assert.equal(approvalBox(v).props.checked, false, 'otra revisión humana: la casilla vuelve sin marcar'); assert.equal(v.disabled(activateButton(v)), true);
  oldActivate(); await v.settle(); assert.equal(t.where(activatePath).length, 0, 'el manejador antiguo sigue sin poder activar');
  v.check(approvalBox(v), true); assert.equal(v.disabled(activateButton(v)), false); v.click(activateButton(v)); await v.settle();
  assert.deepEqual(t.where(activatePath).map(c => c.body), [{ reviewed: true, revision: RA2 }], 'se envía exactamente la revisión NUEVA, nunca la retirada'); assert.equal(log.opened, 1); assert.equal(v.setAfterUnmount, 0);
}));

test('D6b D1: un error tardío de la lectura de B tras volver a A no pinta un fallo ajeno ni repone permisos; la lectura nueva de A puede seguir su curso', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const A = await preparedState(ctx, 'Versión A'), B = await preparedState(ctx, 'Versión B'); const { Preparation } = load('src/Preparation.tsx'); let n = 0;
  t.on(reviewPath, () => ++n === 1 ? { json: reviewFor(A, 'a'.repeat(64)) } : 'hold');
  const v = mount(Preparation, prepProps(A).props); await v.settle(); v.check(approvalBox(v), true);
  v.update({ state: B }); await v.settle(); v.update({ state: A }); await v.settle();
  t.where(reviewPath)[1].resolve(500, { error: 'Fallo ajeno de la lectura de B' }); await v.settle();
  assert.equal(v.maybe({ role: 'alert' }), null, 'el error de B no se muestra en el contexto A'); assert.doesNotMatch(v.text(), /Fallo ajeno de la lectura de B/); noApprovalOffered(v, 'tras el error tardío de B');
  t.where(reviewPath)[2].resolve(200, reviewFor(A, 'd'.repeat(64))); await v.settle(); assert.match(v.text(), new RegExp(reviewMarker('d'.repeat(64)))); assert.equal(approvalBox(v).props.checked, false);
}));

test('D6c D1: si la lectura nueva de A falla por red, no queda una pantalla vacía sin salida: se avisa, «Actualizar revisión» reintenta y la aprobación sigue sin heredarse', () => session(async (ctx) => {
  const { t, mount, load } = ctx; useFetch(t); const A = await preparedState(ctx, 'Versión A'), B = await preparedState(ctx, 'Versión B'); const { Preparation } = load('src/Preparation.tsx'); let n = 0;
  t.on(reviewPath, () => ++n === 1 ? { json: reviewFor(A, 'a'.repeat(64)) } : 'hold');
  const v = mount(Preparation, prepProps(A).props); await v.settle(); v.check(approvalBox(v), true);
  v.update({ state: B }); await v.settle(); v.update({ state: A }); await v.settle();
  t.where(reviewPath)[2].reject(new TypeError('Failed to fetch')); await v.settle();
  assert.ok(v.textOf(v.find({ role: 'alert' })).length > 0, 'se muestra el fallo'); noApprovalOffered(v, 'tras el fallo de red');
  const retry = v.find({ tag: 'button', text: 'Actualizar revisión' }); assert.equal(v.disabled(retry), false, 'hay salida: el reintento está habilitado');
  v.click(retry); await v.settle(); assert.equal(t.where(reviewPath).length, 4, 'el reintento pide la revisión otra vez'); t.where(reviewPath)[3].resolve(200, reviewFor(A, 'e'.repeat(64))); await v.settle();
  assert.match(v.text(), new RegExp(reviewMarker('e'.repeat(64)))); assert.equal(v.maybe({ role: 'alert' }), null, 'el fallo anterior se retiró'); assert.equal(approvalBox(v).props.checked, false, 'sigue exigiendo una aprobación humana nueva'); assert.equal(v.disabled(activateButton(v)), true);
}));

// ═══════════════ E · servidor de la comprobación manual (evidencia complementaria de la UI de devolución manual067) ═══════════════
// El backend ya comprobaba revisión al inicio y al final y solo leía; estas pruebas NO atribuyen a la UI nueva ninguna corrección de escritura.
async function productionStore(mutate?: (snapshot: any) => void) {
  const { Store } = await import(pathToFileURL(path.join(ROOT, 'server/store.ts')).href); const { makeFixture, makeDemoSpec } = await import(pathToFileURL(path.join(ROOT, 'shared/fixtures.ts')).href);
  const { Recovery } = await import(pathToFileURL(path.join(ROOT, 'server/recovery.ts')).href); const { verifyManualRecovery } = await import(pathToFileURL(path.join(ROOT, 'server/manual-recovery.ts')).href);
  const store = new Store(':memory:'), snapshot: any = makeFixture('agency'); snapshot.version = 3; Object.assign(snapshot.source, { kind: 'hubspot', isTestData: false, environment: 'production', accountType: 'STANDARD', accountId: '12345' }); mutate?.(snapshot);
  store.importSnapshot(snapshot); const spec: any = makeDemoSpec(snapshot); spec.version = 3;
  store.saveGeneration(spec, { provider: 'demo', model: null, generatedAt: '2026-10-30T00:00:00.000Z', prompt: '', approved: false }); store.activate();
  const values = { firstname: 'Duplicada', email: 'dup@example.invalid' } as any;
  const a = store.saveRecord('contacts', values), b = store.saveRecord('contacts', values);
  const calls: string[] = [];
  /** Remoto ficticio de solo lectura que imita a HubSpot: el ID es numérico, de modo que 0501 y 501 son el mismo objeto. */
  const remote = new Proxy({ source: 'hubspot', readOnly: true, accountId: '12345', verify: async () => { calls.push('verify'); }, read: async (entity: string, id: string) => { calls.push('read ' + id); return [501, 502].includes(Number(id)) ? { entity, id: String(Number(id)), values: { ...values } } : null; }, hasRelation: async () => true } as any, { get: (target: any, name: string) => { if (name in target) return target[name]; throw new Error('el comprobador intentó usar ' + String(name) + ' (solo se permiten lecturas)'); } });
  return { store, a, b, remote, calls, revision: () => new Recovery(store).revision() as string, verify: verifyManualRecovery as (s: any, r: any, i: any) => Promise<any> };
}

test('E7 servidor: la comprobación manual solo lee, valida identidades y no avanza la marca si algo falla', async () => {
  const p = await productionStore(); const watermark = () => p.store.get('returnWatermark:hubspot', 0);
  const mapping = [{ entity: 'contacts', localId: p.a.id, remoteId: '501' }, { entity: 'contacts', localId: p.b.id, remoteId: '502' }];
  // Rechazos previos a cualquier lectura remota.
  for (const [label, input, status] of [['ID repetido literal', { revision: p.revision(), mapping: [mapping[0], { ...mapping[1], remoteId: '501' }] }, 422], ['ID no numérico', { revision: p.revision(), mapping: [mapping[0], { ...mapping[1], remoteId: '50x' }] }, 422], ['alta repetida', { revision: p.revision(), mapping: [mapping[0], mapping[0]] }, 422], ['revisión antigua', { revision: '0'.repeat(64), mapping }, 409]] as const) {
    await assert.rejects(p.verify(p.store, p.remote, input), (e: any) => e.status === status, label);
  }
  assert.equal(p.calls.filter(c => c.startsWith('read')).length, 0, 'ningún rechazo previo llega a leer el remoto'); assert.equal(watermark(), 0);
  // Falta el ID de una alta: no pasa, no hay informe y la marca no avanza.
  const partial = await p.verify(p.store, p.remote, { revision: p.revision(), mapping: [mapping[0]] }); assert.equal(partial.passed, false); assert.equal(partial.report, null); assert.equal(watermark(), 0); assert.equal(p.store.get('manualRecoveryReport', null), null);
  // Éxito: informe coherente con las operaciones locales y marca final exacta.
  const ok = await p.verify(p.store, p.remote, { revision: p.revision(), mapping }); const last = Math.max(...p.store.changes().map((c: any) => c.id));
  assert.equal(ok.passed, true); assert.equal(ok.checks.length, 2); assert.equal(ok.report.method, 'manual_verified'); assert.equal(ok.report.watermark, last); assert.equal(ok.report.records, 2); assert.equal(watermark(), last);
  assert.ok(p.calls.every(c => c === 'verify' || c.startsWith('read')), 'solo lecturas: ' + p.calls.join(','));
});

// ───────── M1 · política explícita de IDs numéricos canónicos (QA079) ─────────
// ALCANCE HONESTO: la reproducción de QA073 usaba un REMOTO SIMULADO de lectura que normaliza ceros iniciales (Number(id)); NO es una llamada a HubSpot y no está acreditado que la API real
// resuelva 0501 y 501 como el mismo objeto. La corrección se describe como una POLÍTICA TEXTUAL de IDs canónicos (^(0|[1-9]\d*)$): 0501/000/00 se rechazan como entrada nueva ANTES de leer o
// verificar el remoto, sin convertirlos a otro ID, y los IDs se comparan y envían como cadenas (nunca Number/parseInt). Este modelo adverso se conserva como contraste del baseline075.
/** Remoto ficticio de solo lectura que busca por clave EXACTA entidad+ID (cadena). Cualquier método distinto de verify/read/hasRelation lanza. */
function exactRemote(byKey: Record<string, Record<string, unknown>>, calls: string[]) {
  return new Proxy({ source: 'hubspot', readOnly: true, accountId: '12345', verify: async () => { calls.push('verify'); }, read: async (entity: string, id: string) => { calls.push('read ' + entity + ':' + id); const found = byKey[entity + ':' + id]; return found ? { entity, id, values: { ...found } } : null; }, hasRelation: async () => true } as any,
    { get: (target: any, name: string) => { if (name in target) return target[name]; throw new Error('el comprobador intentó usar ' + String(name) + ' (solo se permiten lecturas)'); } });
}
const mappingOf = (p: { store: any }) => JSON.stringify(p.store.get('remoteMapping:hubspot', {})), reportOf = (p: { store: any }) => JSON.stringify(p.store.get('manualRecoveryReport', null)), markOf = (p: { store: any }) => p.store.get('returnWatermark:hubspot', 0);
const untouched = (p: { store: any; calls: string[] }, snap: { mapping: string; report: string; mark: number; changes: number }, label: string) => {
  assert.equal(mappingOf(p), snap.mapping, label + ': el mapeo no cambia'); assert.equal(reportOf(p), snap.report, label + ': el informe no cambia'); assert.equal(markOf(p), snap.mark, label + ': la marca no avanza');
  assert.equal(p.store.changes().length, snap.changes, label + ': el historial local no cambia'); assert.deepEqual(p.calls, [], label + ': el remoto no recibe ninguna lectura ni verificación de ese intento');
};
const snapOf = (p: { store: any }) => ({ mapping: mappingOf(p), report: reportOf(p), mark: markOf(p), changes: p.store.changes().length });

test('E7b M1 (servidor, QA079): 0501/000/00/0000 como ID nuevo se rechazan con 422 ANTES de leer o verificar el remoto; mapeo, informe y marca intactos; nada se convierte a otro ID', async () => {
  const p = await productionStore(), snap = snapOf(p);
  for (const bad of ['0501', '000', '00', '0000', '00000000000000000501']) {
    for (const [label, pair] of [['primero', [bad, '502']], ['segundo', ['501', bad]]] as const) {
      const input = { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: pair[0] }, { entity: 'contacts', localId: p.b.id, remoteId: pair[1] }] };
      await assert.rejects(p.verify(p.store, p.remote, input), (e: any) => e.status === 422, 'ID «' + bad + '» en el ' + label + ' debe dar 422'); untouched(p, snap, '«' + bad + '» (' + label + ')');
    }
  }
  // Causa correcta: es la forma del ID (ceros iniciales), no un fallo de otra validación. Con IDs canónicos el mismo montaje verifica (control positivo con lectura de valores).
  const ok = await p.verify(p.store, p.remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: '501' }, { entity: 'contacts', localId: p.b.id, remoteId: '502' }] });
  assert.equal(ok.passed, true); assert.equal(ok.report.records, 2); assert.deepEqual(p.calls.filter(c => c.startsWith('read')), ['read 501', 'read 502'], 'los IDs canónicos se leen tal cual (cadenas)');
  assert.deepEqual(JSON.parse(mappingOf(p)), { ['contacts:' + p.a.id]: '501', ['contacts:' + p.b.id]: '502' });
});

test('E7c M1: «0» es canónico (no se inventa que exista un registro 0 en HubSpot); 501 y 0501 NO se tratan como la misma alta; un ID en blanco o con signo se rechaza sin leer', async () => {
  const p = await productionStore(), snap = snapOf(p);
  for (const bad of ['', ' 501', '501 ', '+501', '-5', '5.0', '0x1F', '٥٠١', '5e2']) await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: bad }, { entity: 'contacts', localId: p.b.id, remoteId: '502' }] }), (e: any) => e.status === 422, JSON.stringify(bad));
  untouched(p, snap, 'formas no numéricas');
  const remote = exactRemote({ 'contacts:0': { firstname: 'Duplicada', email: 'dup@example.invalid' }, 'contacts:502': { firstname: 'Duplicada', email: 'dup@example.invalid' } }, p.calls);
  const zero = await p.verify(p.store, remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: '0' }, { entity: 'contacts', localId: p.b.id, remoteId: '502' }] });
  assert.equal(zero.passed, true, '«0» es una forma canónica: el contrato vigente la admite y se lee tal cual'); assert.deepEqual(p.calls.filter(c => c.startsWith('read')), ['read contacts:0', 'read contacts:502']);
});

test('E7d M1: IDs grandes se conservan como cadenas exactas (9007199254740992 ≠ 9007199254740993) sin Number/parseInt: se leen, se mapean y se informan con su valor exacto', async () => {
  const p = await productionStore(), big = ['9007199254740992', '9007199254740993'];
  assert.equal(String(Number(big[1])), big[0], 'precondición: Number() SÍ colapsaría los dos IDs (por eso importa conservarlos como texto)');
  const remote = exactRemote({ ['contacts:' + big[0]]: { firstname: 'Duplicada', email: 'dup@example.invalid' }, ['contacts:' + big[1]]: { firstname: 'Duplicada', email: 'dup@example.invalid' } }, p.calls);
  const ok = await p.verify(p.store, remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: big[0] }, { entity: 'contacts', localId: p.b.id, remoteId: big[1] }] });
  assert.equal(ok.passed, true, 'las dos altas se confirman como registros distintos'); assert.equal(ok.report.records, 2);
  assert.deepEqual(p.calls.filter(c => c.startsWith('read')), ['read contacts:' + big[0], 'read contacts:' + big[1]], 'cada lectura recibe el ID exacto');
  assert.deepEqual(JSON.parse(mappingOf(p)), { ['contacts:' + p.a.id]: big[0], ['contacts:' + p.b.id]: big[1] }, 'el mapeo guardado conserva las cadenas exactas');
  // Un ID de 100 dígitos es el máximo admitido por la interfaz; el servidor no lo trunca ni lo redondea.
  const q = await productionStore(), huge = '1' + '0'.repeat(99), remote2 = exactRemote({ ['contacts:' + huge]: { firstname: 'Duplicada', email: 'dup@example.invalid' }, 'contacts:7': { firstname: 'Duplicada', email: 'dup@example.invalid' } }, q.calls);
  assert.equal((await q.verify(q.store, remote2, { revision: q.revision(), mapping: [{ entity: 'contacts', localId: q.a.id, remoteId: huge }, { entity: 'contacts', localId: q.b.id, remoteId: '7' }] })).passed, true); assert.ok(q.calls.includes('read contacts:' + huge));
});

test('E7e M1: mismo ID en entidades distintas es válido; duplicado en la misma entidad no confirma dos altas; una colisión con un registro capturado se rechaza sin tocar nada', async () => {
  const p = await productionStore(snapshot => { snapshot.records.push({ entity: 'contacts', id: '700', values: { firstname: 'Capturada', email: 'cap@example.invalid' } }); for (const entity of snapshot.entities) snapshot.manifest.expectedCounts[entity.id] = snapshot.records.filter((r: any) => r.entity === entity.id).length; });
  const company = p.store.saveRecord('companies', { name: 'Empresa nueva 079' }), snap = snapOf(p);
  const row = (entity: string, localId: string, remoteId: string) => ({ entity, localId, remoteId });
  // Duplicado literal en la misma entidad y duplicado tras eliminar ceros (este último ya cae por la forma).
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [row('contacts', p.a.id, '501'), row('contacts', p.b.id, '501'), row('companies', company.id, '9')] }), (e: any) => e.status === 422); untouched(p, snap, 'duplicado en la misma entidad');
  // Colisión con un ID de un registro capturado de la MISMA entidad (700 ya es un contacto de la captura): una alta nueva no puede reclamarlo.
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [row('contacts', p.a.id, '700'), row('contacts', p.b.id, '502'), row('companies', company.id, '9')] }), (e: any) => e.status === 422); untouched(p, snap, 'colisión con un registro capturado');
  // Mismo ID en otra entidad: la empresa nueva SÍ puede tener el 700, y 501 puede repetirse entre contacto y empresa.
  const remote = exactRemote({ 'contacts:501': { firstname: 'Duplicada', email: 'dup@example.invalid' }, 'contacts:502': { firstname: 'Duplicada', email: 'dup@example.invalid' }, 'companies:501': { name: 'Empresa nueva 079' } }, p.calls);
  const ok = await p.verify(p.store, remote, { revision: p.revision(), mapping: [row('contacts', p.a.id, '501'), row('contacts', p.b.id, '502'), row('companies', company.id, '501')] });
  assert.equal(ok.passed, true, 'el mismo ID 501 identifica a un contacto y a una empresa'); assert.equal(ok.report.records, 3);
  assert.deepEqual(p.calls.filter(c => c.startsWith('read')).sort(), ['read companies:501', 'read contacts:501', 'read contacts:502']);
});

test('E7f M1: un mapeo heredado con ceros iniciales no se reasigna a otro registro, no se migra ni se reescribe, y no hay lecturas remotas', async () => {
  const p = await productionStore();
  p.store.set('remoteMapping:hubspot', { ['contacts:' + p.a.id]: '0501' });   // mapeo anterior a la política: se conserva como evidencia, no se corrige en silencio
  const snap = snapOf(p), legacy = mappingOf(p);
  // (1) Otra alta intenta reclamar el mismo objeto con la forma canónica: colisión tras normalizar por cadena (sin Number), 422.
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.b.id, remoteId: '501' }] }), (e: any) => e.status === 422); untouched(p, snap, 'reasignar 0501 → 501 a otra alta');
  // (2) La misma alta intenta «arreglar» su mapeo con otro texto: 409, no se reescribe.
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.a.id, remoteId: '501' }, { entity: 'contacts', localId: p.b.id, remoteId: '502' }] }), (e: any) => e.status === 409); untouched(p, snap, 'reescribir el mapeo heredado');
  // (3) Sin entradas nuevas, el mapeo heredado no canónico impide comprobar: 422 y nada que leer.
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [{ entity: 'contacts', localId: p.b.id, remoteId: '502' }] }), (e: any) => e.status === 422); untouched(p, snap, 'comprobar con un mapeo heredado no canónico');
  assert.equal(mappingOf(p), legacy, 'el mapeo heredado sigue literalmente igual');
});

// El contraste del baseline075 (verify que aceptaba 0501) se ejecuta con el banco completo contra la copia inmutable; ver coordination/reviews/CLAUDE-QA-079.md.

test('E7g M1: la colisión se detecta contra IDs guardados de altas ya no pendientes y contra registros capturados, aunque estén escritos con ceros iniciales (comparación textual, sin Number), sin tocar el remoto', async () => {
  const p = await productionStore(snapshot => { snapshot.records.push({ entity: 'contacts', id: '0777', values: { firstname: 'Capturada con ceros', email: 'cap0777@example.invalid' } }); for (const entity of snapshot.entities) snapshot.manifest.expectedCounts[entity.id] = snapshot.records.filter((r: any) => r.entity === entity.id).length; });
  // Un mapeo heredado de una alta que YA NO está pendiente (no pasa por la guarda de mapeos del propio lote): solo la comprobación de colisión protege el ID.
  p.store.set('remoteMapping:hubspot', { 'contacts:alta-antigua-fuera-del-lote': '0501' });
  const snap = snapOf(p), row = (localId: string, remoteId: string) => ({ entity: 'contacts', localId, remoteId });
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [row(p.a.id, '501'), row(p.b.id, '502')] }), (e: any) => e.status === 422, '501 colisiona con el mapeo heredado 0501 de otra alta'); untouched(p, snap, 'colisión con un mapeo heredado');
  await assert.rejects(p.verify(p.store, p.remote, { revision: p.revision(), mapping: [row(p.a.id, '777'), row(p.b.id, '502')] }), (e: any) => e.status === 422, '777 colisiona con el contacto capturado 0777'); untouched(p, snap, 'colisión con un registro capturado con ceros');
  // Control positivo de causa: sin colisión (503/504) el mismo montaje verifica y no reescribe el mapeo heredado.
  const remote = exactRemote({ 'contacts:503': { firstname: 'Duplicada', email: 'dup@example.invalid' }, 'contacts:504': { firstname: 'Duplicada', email: 'dup@example.invalid' } }, p.calls);
  const ok = await p.verify(p.store, remote, { revision: p.revision(), mapping: [row(p.a.id, '503'), row(p.b.id, '504')] }); assert.equal(ok.passed, true);
  assert.equal(JSON.parse(mappingOf(p))['contacts:alta-antigua-fuera-del-lote'], '0501', 'el mapeo heredado no se migra ni se reescribe');
});
