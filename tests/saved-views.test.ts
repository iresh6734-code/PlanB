import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSavedView, describeView, readSavedViews, sameView, sanitizeSavedViews, smartViews, writeSavedViews, MAX_SAVED, type SavedView } from '../src/app-shell/saved-views.js';
import { loadSavedViews, storeSavedViews, type ViewsIo } from '../src/app-shell/saved-views-sync.js';

const field = (key: string, type: string, label = key) => ({ key, label, type, required: false, readOnly: false, options: [] }) as never;
const entity = (fields: unknown[]) => ({ fields, columns: [], displayField: 'name' }) as never;
const spec = { roles: { stage: 'dealstage', amount: 'amount', pipeline: null, dueDate: 'due_date', taskStatus: 'status' } } as never;
const record = (values: Record<string, unknown>) => ({ id: 'r', entity: 'tasks', values }) as never;
const context = { today: '2026-11-13', looksDone: (item: { values: Record<string, unknown> }) => item.values.status === 'done' } as never;
const pick = (views: ReturnType<typeof smartViews>, id: string) => views.find(view => view.id === id)!;

test('tareas: vencidas, para hoy, esta semana y sin fecha, sin contar las cerradas', () => {
  const views = smartViews('tasks', entity([field('due_date', 'date'), field('status', 'enum')]), spec);
  assert.deepEqual(views.map(view => view.id), ['overdue', 'today', 'week', 'no-date']);
  assert.equal(pick(views, 'week').test(record({ due_date: '2026-11-13' }), context), true);
  assert.equal(pick(views, 'week').test(record({ due_date: '2026-11-20' }), context), true);
  assert.equal(pick(views, 'week').test(record({ due_date: '2026-11-21' }), context), false);
  assert.equal(pick(views, 'week').test(record({ due_date: '2026-11-12' }), context), false, 'lo vencido no es de esta semana');
  assert.equal(pick(views, 'week').test(record({ due_date: '2026-11-15', status: 'done' }), context), false);
  assert.equal(pick(views, 'overdue').test(record({ due_date: '2026-11-10' }), context), true);
  assert.equal(pick(views, 'overdue').test(record({ due_date: '2026-11-10', status: 'done' }), context), false);
  assert.equal(pick(views, 'overdue').test(record({ due_date: '2026-11-13' }), context), false);
  assert.equal(pick(views, 'today').test(record({ due_date: '2026-11-13T09:00:00Z' }), context), true);
  assert.equal(pick(views, 'no-date').test(record({ due_date: '' }), context), true);
  assert.equal(pick(views, 'no-date').test(record({ due_date: null, status: 'done' }), context), false);
});

test('las vistas inteligentes solo existen si la especificación tiene el campo', () => {
  assert.deepEqual(smartViews('tasks', entity([field('status', 'enum')]), spec), []);
  assert.deepEqual(smartViews('deals', entity([field('amount', 'number')]), spec).map(view => view.id), ['big', 'no-amount']);
  assert.deepEqual(smartViews('contacts', entity([field('email', 'email', 'Correo'), field('phone', 'text', 'Teléfono')]), spec).map(view => view.id), ['no-email', 'no-phone']);
  assert.deepEqual(smartViews('companies', entity([field('name', 'text', 'Nombre')]), spec), []);
  const companies = smartViews('companies', entity([field('domain', 'text', 'Sitio web')]), spec);
  assert.deepEqual(companies.map(view => [view.id, view.label]), [['no-web', 'Sin sitio web']]);
  assert.equal(pick(companies, 'no-web').test(record({ domain: ' ' }), context), true);
  assert.equal(pick(companies, 'no-web').test(record({ domain: 'https://arce.example.com' }), context), false);
  const linkedContacts = smartViews('contacts', entity([{ ...(field('company_id', 'reference', 'Empresa') as object), referenceEntity: 'companies' }]), spec);
  assert.deepEqual(linkedContacts.map(view => [view.id, view.label]), [['no-company', 'Sin empresa']]);
  assert.equal(pick(linkedContacts, 'no-company').test(record({ company_id: null }), context), true);
  assert.equal(pick(linkedContacts, 'no-company').test(record({ company_id: 'company-1' }), context), false);
  const deals = smartViews('deals', entity([field('amount', 'number')]), spec);
  assert.equal(pick(deals, 'big').test(record({ amount: '3500' }), context), true);
  assert.equal(pick(deals, 'big').test(record({ amount: 3000 }), context), false);
  assert.equal(pick(deals, 'no-amount').test(record({ amount: 0 }), context), true);
});

test('oportunidades: cierre pasado, cierran esta semana y sin fecha, solo si siguen abiertas', () => {
  const dealSpec = { roles: { stage: 'dealstage', amount: 'amount', pipeline: null, dueDate: 'due_date', taskStatus: 'status' }, stages: [{ id: 'qualified', label: 'Cualificada', color: '#000000' }, { id: 'closedwon', label: 'Ganada', color: '#000000' }] } as never;
  const views = smartViews('deals', entity([field('closedate', 'date', 'Fecha de cierre'), field('dealstage', 'enum')]), dealSpec);
  assert.deepEqual(views.map(view => view.id), ['close-late', 'close-week', 'no-close', 'at-risk']);
  assert.equal(pick(views, 'close-late').test(record({ dealstage: 'qualified', closedate: '2026-11-12' }), context), true);
  assert.equal(pick(views, 'close-late').test(record({ dealstage: 'closedwon', closedate: '2026-11-12' }), context), false, 'una ganada no está atrasada');
  assert.equal(pick(views, 'close-week').test(record({ dealstage: 'qualified', closedate: '2026-11-13' }), context), true);
  assert.equal(pick(views, 'close-week').test(record({ dealstage: 'qualified', closedate: '2026-11-20' }), context), true);
  assert.equal(pick(views, 'close-week').test(record({ dealstage: 'qualified', closedate: '2026-11-21' }), context), false);
  assert.equal(pick(views, 'no-close').test(record({ dealstage: 'qualified', closedate: '' }), context), true);
  assert.equal(pick(views, 'no-close').test(record({ dealstage: 'closedwon' }), context), false);
});

test('V5 · «Sin próximo paso» y «Paradas»: solo con tareas enlazables, solo abiertas y solo con el pulso leído', () => {
  const linked = { roles: { stage: 'dealstage' }, stages: [{ id: 'qualified', label: 'Cualificada', color: '#000000' }, { id: 'closedwon', label: 'Ganada', color: '#000000' }],
    entities: [{ id: 'tasks', fields: [{ key: 'planb_deal_id', type: 'reference', referenceEntity: 'deals' }] }] } as never;
  assert.deepEqual(smartViews('deals', entity([field('dealstage', 'enum')]), linked).map(view => [view.id, view.needs]), [['no-next', 'pulse'], ['stalled', 'pulse'], ['at-risk', undefined]]);
  assert.deepEqual(smartViews('deals', entity([field('dealstage', 'enum')]), { ...(linked as object), entities: [] } as never).map(view => view.id), ['at-risk']);
  const views = smartViews('deals', entity([field('dealstage', 'enum')]), linked);
  const deal = (id: string, stage: string) => ({ id, entity: 'deals', values: { dealstage: stage } }) as never;
  const pulse = new Map([['old', { open: 1, undated: 0, next: '2026-10-01', last: '2026-10-01' }], ['busy', { open: 1, undated: 0, next: '2026-11-20', last: '2026-11-20' }]]);
  const withPulse = { today: '2026-11-13', looksDone: () => false, pulse } as never;
  assert.equal(pick(views, 'no-next').test(deal('none', 'qualified'), withPulse), true);
  assert.equal(pick(views, 'no-next').test(deal('none', 'closedwon'), withPulse), false, 'una ganada no necesita próximo paso');
  assert.equal(pick(views, 'no-next').test(deal('busy', 'qualified'), withPulse), false);
  assert.equal(pick(views, 'stalled').test(deal('old', 'qualified'), withPulse), true);
  assert.equal(pick(views, 'stalled').test(deal('busy', 'qualified'), withPulse), false);
  assert.equal(pick(views, 'no-next').test(deal('none', 'qualified'), context), false, 'sin pulso no se afirma nada');
});

test('tareas: «Vencidas» usa el día de Madrid de un instante', () => {
  const views = smartViews('tasks', entity([field('due_date', 'date')]), spec);
  // 23:30 UTC del 12 ya es el 13 en Madrid: es «para hoy», no vencida.
  assert.equal(pick(views, 'overdue').test(record({ due_date: '2026-11-12T23:30:00Z' }), context), false);
  assert.equal(pick(views, 'today').test(record({ due_date: '2026-11-12T23:30:00Z' }), context), true);
});

test('guardar: el nombre se limpia, el mismo nombre sustituye a la anterior y se guardan como mucho ocho', () => {
  const state = { query: '  norte ', pick: null, sort: { key: 'amount', dir: -1 as const }, smart: 'big' };
  let views: SavedView[] = addSavedView([], '  Grandes del norte ', state, 'a');
  assert.deepEqual(views, [{ id: 'a', name: 'Grandes del norte', query: 'norte', pick: null, sort: { key: 'amount', dir: -1 }, smart: 'big' }]);
  views = addSavedView(views, 'grandes DEL norte', { ...state, smart: null }, 'b');
  assert.equal(views.length, 1); assert.equal(views[0].id, 'b'); assert.equal(views[0].smart, null);
  assert.equal(addSavedView(views, '   ', state, 'c'), views, 'sin nombre no se guarda');
  for (let index = 0; index < 12; index++) views = addSavedView(views, 'Vista ' + index, state, 'v' + index);
  assert.equal(views.length, MAX_SAVED); assert.equal(views[0].name, 'Vista 11');
});

test('leer: descarta lo mal formado y nunca lanza', () => {
  const storage = (value: string) => ({ getItem: () => value });
  assert.deepEqual(readSavedViews('deals', storage('no es json')), []);
  assert.deepEqual(readSavedViews('deals', storage('{"a":1}')), []);
  const views = readSavedViews('deals', storage(JSON.stringify([{ id: 'x', name: 'Buena', query: 'a', sort: { key: 'k', dir: 2 }, pick: 5 }, { id: 'y', name: '  ', query: '' }, null])));
  assert.deepEqual(views, [{ id: 'x', name: 'Buena', query: 'a', pick: null, sort: null, smart: null }]);
  assert.equal(writeSavedViews('deals', views, { setItem: () => { throw new Error('lleno'); } }), false, 'sin almacenamiento no rompe');
  assert.deepEqual(readSavedViews('deals', null), []);
});

test('coincidencia y descripción de una vista', () => {
  const view = { query: 'norte', pick: 'open', sort: { key: 'due_date', dir: 1 as const }, smart: 'overdue' };
  assert.equal(sameView(view, { ...view, query: ' norte ' }), true);
  assert.equal(sameView(view, { ...view, sort: { key: 'due_date', dir: -1 } }), false);
  assert.equal(sameView(view, { ...view, smart: null }), false);
  assert.equal(describeView(view, { pick: () => 'Abiertas', sort: () => 'Fecha límite', smart: () => 'Vencidas' }), 'búsqueda «norte» · Vencidas · Abiertas · orden por fecha límite ↑');
  assert.equal(describeView({ query: '', pick: null, sort: null, smart: null }, {}), 'todos los registros');
});

test('un almacenamiento ausente o inaccesible no confirma ninguna escritura', () => {
  assert.equal(writeSavedViews('contacts', [], null), false);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('Acceso al almacenamiento bloqueado'); }
  });
  try {
    assert.deepEqual(readSavedViews('contacts'), []);
    assert.equal(writeSavedViews('contacts', []), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('sanear: sin repetidos por id ni por nombre y sin textos vacíos que la copia rechazaría', () => {
  const raw = [{ id: 'a', name: ' Norte ', query: ' x ', pick: '', smart: '' }, { id: 'b', name: 'NORTE', query: '' }, { id: 'a', name: 'Otra', query: '' }, { id: 'c', name: 'Sur', query: '', sort: { key: '', dir: 1 } }];
  assert.deepEqual(sanitizeSavedViews(raw), [{ id: 'a', name: 'Norte', query: 'x', pick: null, sort: null, smart: null }, { id: 'c', name: 'Sur', query: '', pick: null, sort: null, smart: null }]);
  assert.deepEqual(sanitizeSavedViews({ views: [] }), []);
});

function mirror(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
}
const one: SavedView = { id: 'a', name: 'Norte', query: 'norte', pick: null, sort: null, smart: null };

test('cargar: la copia manda y este navegador guarda su reflejo', async () => {
  const local = mirror({ 'planb:views:tasks': JSON.stringify([{ ...one, id: 'z', name: 'Vieja' }]) }), posted: unknown[] = [];
  const io: ViewsIo = { get: async () => ({ views: [one], stored: true }), post: async (_path, body) => { posted.push(body); return body; } };
  assert.deepEqual(await loadSavedViews('tasks', undefined, io, local), [one]);
  assert.deepEqual(JSON.parse(local.items.get('planb:views:tasks')!), [one]);
  assert.equal(posted.length, 0, 'si la copia ya tiene vistas no se sube nada');
});

test('cargar: una copia sin vistas recibe una sola vez las de este navegador', async () => {
  const local = mirror({ 'planb:views:deals': JSON.stringify([one]) }), calls: string[] = [];
  const io: ViewsIo = { get: async () => ({ views: [], stored: false }), post: async (path, body) => { calls.push(path); return { ...(body as object), stored: true }; } };
  assert.deepEqual(await loadSavedViews('deals', undefined, io, local), [one]);
  assert.deepEqual(calls, ['/v2/views/deals']);
  const empty = mirror();
  assert.deepEqual(await loadSavedViews('deals', undefined, io, empty), []);
  assert.equal(calls.length, 1, 'sin vistas locales no se escribe en la copia');
});

test('cargar y guardar: si la copia no responde o responde raro, no se inventa nada', async () => {
  const local = mirror({ 'planb:views:tasks': JSON.stringify([one]) });
  const down: ViewsIo = { get: async () => { throw new Error('sin respuesta'); }, post: async () => { throw new Error('sin respuesta'); } };
  assert.equal(await loadSavedViews('tasks', undefined, down, local), null);
  assert.equal(await storeSavedViews('tasks', [], down, local), null);
  assert.deepEqual(JSON.parse(local.items.get('planb:views:tasks')!), [one], 'el reflejo no cambia si la copia no guardó');
  const odd: ViewsIo = { get: async () => ({ views: 'no' }), post: async () => ({ views: [one] }) };
  assert.equal(await loadSavedViews('tasks', undefined, odd, local), null);
  assert.equal(await storeSavedViews('tasks', [one], odd, local), null);
  const controller = new AbortController(); controller.abort();
  const fine: ViewsIo = { get: async () => ({ views: [one], stored: true }), post: async () => ({ views: [one], stored: true }) };
  assert.equal(await loadSavedViews('tasks', controller.signal, fine, local), null, 'una lectura cancelada no pinta nada');
  assert.deepEqual(await storeSavedViews('tasks', [], { ...fine, post: async () => ({ views: [], stored: true }) }, local), []);
  assert.deepEqual(JSON.parse(local.items.get('planb:views:tasks')!), [], 'borrarlas en la copia también se refleja');
});
