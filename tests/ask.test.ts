// R4 · «Pregunta a tu copia»: frases en español → consulta, sin IA. Lo que no entiende se dice, no se inventa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askMatches, askPath, describeAsk, isQuestion, parseAsk, runAsk, answerHint, type AskQuery } from '../src/app-shell/ask.js';
import { orderRecords, parseRecordSort, recordLabel } from '../shared/record-order.js';
import type { CrmRecord, EntityName } from '../shared/model.js';

const f = (key: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({ key, label, type, required: false, readOnly: false, options: [], referenceEntity: null, ...extra });
const opts = (...labels: [string, string][]) => labels.map(([id, label]) => ({ id, label }));
const stages = opts(['appointment', 'Cita programada'], ['negotiation', 'Negociación'], ['closedwon', 'Ganada'], ['closedlost', 'Perdida']);
const spec = {
  stages: stages.map(stage => ({ ...stage, color: '#336699' })),
  roles: { stage: 'dealstage', amount: 'amount', pipeline: null, dueDate: 'due_date', taskStatus: 'status' },
  entities: [
    { id: 'contacts', label: 'Contactos', singular: 'contacto', displayField: 'firstname', columns: ['firstname'], fields: [f('firstname', 'Nombre', 'text'), f('lastname', 'Apellidos', 'text'), f('email', 'Correo', 'email'), f('phone', 'Teléfono', 'text'), f('company_id', 'Empresa', 'reference', { referenceEntity: 'companies' })] },
    { id: 'companies', label: 'Empresas', singular: 'empresa', displayField: 'name', columns: ['name'], fields: [f('name', 'Nombre', 'text'), f('city', 'Ciudad', 'text'), f('industry', 'Sector', 'enum', { options: opts(['ind', 'Industria'], ['srv', 'Servicios']) }), f('phone', 'Teléfono', 'text'), f('createdate', 'Fecha de alta', 'date')] },
    { id: 'deals', label: 'Oportunidades', singular: 'oportunidad', displayField: 'dealname', columns: ['dealname'], fields: [f('dealname', 'Nombre', 'text'), f('amount', 'Importe', 'number'), f('dealstage', 'Etapa', 'enum', { options: stages }), f('closedate', 'Fecha de cierre', 'date'), f('company_id', 'Empresa', 'reference', { referenceEntity: 'companies' }), f('priority', 'Prioridad', 'enum', { options: opts(['high', 'Alta'], ['low', 'Baja']) })] },
    { id: 'tasks', label: 'Tareas', singular: 'tarea', displayField: 'subject', columns: ['subject'], fields: [f('subject', 'Asunto', 'text'), f('due_date', 'Fecha límite', 'date'), f('status', 'Estado', 'enum', { options: opts(['open', 'Pendiente'], ['done', 'Completada']) }), f('planb_deal_id', 'Oportunidad', 'reference', { referenceEntity: 'deals' }), f('company_id', 'Empresa', 'reference', { referenceEntity: 'companies' })] },
  ],
} as never;
const TODAY = '2026-11-19'; // jueves
const ask = (text: string) => parseAsk(text, spec, TODAY);
const said = (text: string) => { const query = ask(text); assert.ok(query, text); return describeAsk(query); };

test('treinta y tantas frases: lo que se entiende, tal como se resume', () => {
  const cases: [string, string][] = [
    ['oportunidades abiertas que cierran este mes de más de 5.000 ordenadas por importe', 'Oportunidades · importe > 5.000 · abiertas · fecha de cierre: este mes · orden importe ↓'],
    ['empresas de Madrid sin tareas', 'Empresas · sin tareas · ciudad: Madrid'],
    ['oportunidades de Acme que cierran en diciembre', 'Oportunidades · fecha de cierre: en diciembre · «Acme»'],
    ['tareas vencidas', 'Tareas · sin cerrar · fecha límite pasada'],
    ['tareas para mañana', 'Tareas · fecha límite: mañana'],
    ['contactos sin correo', 'Contactos · sin correo'],
    ['contactos con correo y sin teléfono', 'Contactos · con correo · sin teléfono'],
    ['las 5 oportunidades más grandes', 'Oportunidades · orden importe ↓ · las 5 primeras'],
    ['top 10 oportunidades por importe', 'Oportunidades · orden importe ↓ · las 10 primeras'],
    ['oportunidades entre 1.000 y 3.000', 'Oportunidades · importe entre 1.000 y 3.000'],
    ['oportunidades con importe inferior a 2k', 'Oportunidades · importe < 2.000'],
    ['oportunidades > 5000 €', 'Oportunidades · importe > 5.000'],
    ['oportunidades de 2,5 millones o más', 'Oportunidades · importe ≥ 2.500.000'],
    ['oportunidades ganadas este año', 'Oportunidades · ganadas · fecha de cierre: este año'],
    ['oportunidades perdidas el mes pasado', 'Oportunidades · perdidas · fecha de cierre: el mes pasado'],
    ['oportunidades en negociación', 'Oportunidades · etapa: Negociación'],
    ['oportunidades sin fecha de cierre', 'Oportunidades · sin fecha de cierre'],
    ['oportunidades sin próximo paso', 'Oportunidades · sin próximo paso'],
    ['tareas pendientes de esta semana', 'Tareas · pendientes · fecha límite: esta semana'],
    ['tareas hechas', 'Tareas · hechas'],
    ['empresas creadas en los últimos 30 días', 'Empresas · fecha de alta: en los últimos 30 días'],
    ['empresas del sector Industria', 'Empresas · sector: Industria'],
    ['oportunidades con prioridad alta', 'Oportunidades · prioridad: Alta'],
    ['oportunidades ordenadas por fecha de cierre', 'Oportunidades · orden fecha de cierre ↑'],
    ['contactos ordenados por nombre', 'Contactos · orden nombre ↑'],
    ['oportunidades de más de 3.000 € que vencen la semana que viene', 'Oportunidades · importe > 3.000 · fecha de cierre: la semana que viene'],
    ['oportunidades que cierran en enero', 'Oportunidades · fecha de cierre: en enero de 2027'],
    ['tareas que vencen hoy', 'Tareas · fecha límite: hoy'],
    ['oportunidades llamadas «Renovación anual»', 'Oportunidades · «Renovación anual»'],
    ['oportunidades abiertas sin importe', 'Oportunidades · abiertas · sin importe'],
    ['oportunidades con cierre pasado', 'Oportunidades · fecha de cierre: ya pasada · abiertas'],
    ['¿Qué oportunidades cierran en los próximos 7 días?', 'Oportunidades · fecha de cierre: en los próximos 7 días'],
    ['tareas de Acme pendientes', 'Tareas · pendientes · «Acme»'],
    ['oportunidades ganadas o perdidas', 'Oportunidades · ganadas · perdidas'],
    ['Empresas de servicios', 'Empresas · sector: Servicios'],
    ['oportunidades ordenadas por importe de menor a mayor', 'Oportunidades · orden importe ↑'],
  ];
  assert.ok(cases.length >= 30);
  for (const [text, summary] of cases) assert.equal(said(text), summary, text);
});

test('fechas: periodos concretos a partir de hoy, también en mes siguiente y semanas de lunes a domingo', () => {
  const date = (text: string) => ask(text)!.conditions.find(condition => condition.kind === 'date') as Extract<AskQuery['conditions'][number], { kind: 'date' }>;
  assert.deepEqual([date('oportunidades que cierran este mes').from, date('oportunidades que cierran este mes').to], ['2026-11-01', '2026-11-30']);
  assert.deepEqual([date('tareas de esta semana').from, date('tareas de esta semana').to], ['2026-11-16', '2026-11-22']);
  assert.deepEqual([date('tareas para la semana que viene').from, date('tareas para la semana que viene').to], ['2026-11-23', '2026-11-29']);
  assert.deepEqual([date('oportunidades que cierran el mes que viene').from, date('oportunidades que cierran el mes que viene').to], ['2026-12-01', '2026-12-31']);
  assert.deepEqual([date('oportunidades que cierran en enero').from, date('oportunidades que cierran en enero').to], ['2027-01-01', '2027-01-31']);
  assert.deepEqual([date('oportunidades que cierran en febrero de 2026').from], ['2026-02-01']);
  assert.deepEqual([date('tareas vencidas').from, date('tareas vencidas').to], [null, '2026-11-18']);
  assert.deepEqual([date('oportunidades que cierran este trimestre').from, date('oportunidades que cierran este trimestre').to], ['2026-10-01', '2026-12-31']);
});

test('lo que no entiende lo dice, y lo que esta copia no tiene se explica en vez de inventarlo', () => {
  assert.deepEqual(ask('empresas xyzzy de Madrid')!.unknown, ['xyzzy']);
  assert.deepEqual(ask('oportunidades abiertas con sabor a fresa')!.unknown, ['sabor', 'fresa']);
  assert.deepEqual(ask('oportunidades de más de 30 días')!.unknown, ['más', '30 días']);
  const companies = ask('empresas con importe > 1000')!;
  assert.deepEqual(companies.conditions, []);
  assert.deepEqual(companies.notes, ['Tus empresas no tienen importe.']);
  assert.equal(isQuestion(companies), true, 'se responde para poder explicar por qué no hay filtro');
  assert.deepEqual(ask('contactos sin tareas')!.notes, ['Las tareas de tu copia no se enlazan con contactos.']);
  assert.deepEqual(ask('contactos vencidos')!.notes, ['Tus contactos no tienen fecha límite.']);
});

test('no es una pregunta: un nombre suelto o solo el tipo de registro (eso ya es «Ir a…»)', () => {
  assert.equal(ask('Acme'), null);
  assert.equal(ask(''), null);
  assert.equal(isQuestion(ask('empresas')), false);
  assert.equal(isQuestion(ask('empresas Acme')), false);
  assert.equal(isQuestion(ask('empresas de Madrid')), true);
});

test('el servidor recibe lo que sabe filtrar (V1): opción, texto y orden; lo demás se filtra al leer', () => {
  const path = askPath(ask('oportunidades de Acme en negociación de más de 5000 ordenadas por importe')!, 200);
  assert.match(path, /^\/v2\/records\/deals\?q=Acme&offset=200&limit=100&pipeline=&sort=amount%3Adesc&f\.dealstage=negotiation$/);
  assert.doesNotMatch(askPath(ask('oportunidades ganadas o perdidas')!, 0), /f\./);
  assert.doesNotMatch(askPath(ask('oportunidades en negociación o ganadas cita programada')!, 0), /f\.dealstage/, 'dos opciones del mismo campo se suman en el cliente');
});

const rec = (entity: EntityName, id: string, values: Record<string, unknown>) => ({ id, entity, values }) as CrmRecord;
const DATA: CrmRecord[] = [
  rec('companies', 'c1', { name: 'Acme', city: 'Madrid', industry: 'ind' }),
  rec('companies', 'c2', { name: 'Borax', city: 'Sevilla', industry: 'srv' }),
  rec('companies', 'c3', { name: 'Cobre', city: 'Madrid', industry: 'srv' }),
  rec('deals', 'd1', { dealname: 'Renovación', amount: 8000, dealstage: 'negotiation', closedate: '2026-11-25', company_id: 'c1' }),
  rec('deals', 'd2', { dealname: 'Ampliación', amount: 4000, dealstage: 'negotiation', closedate: '2026-11-28', company_id: 'c1' }),
  rec('deals', 'd3', { dealname: 'Licencias', amount: 12000, dealstage: 'closedwon', closedate: '2026-11-10', company_id: 'c2' }),
  rec('deals', 'd4', { dealname: 'Soporte', amount: 6000, dealstage: 'appointment', closedate: '2026-12-15', company_id: 'c2' }),
  rec('deals', 'd5', { dealname: 'Piloto', amount: 9500, dealstage: 'appointment', closedate: '2026-11-03', company_id: 'c3' }),
  rec('tasks', 't1', { subject: 'Llamar', due_date: '2026-11-18', status: 'open', planb_deal_id: 'd1', company_id: 'c1' }),
  rec('tasks', 't2', { subject: 'Enviar', due_date: '2026-11-20', status: 'done', planb_deal_id: 'd4', company_id: 'c2' }),
];
/** Lector falso con la misma lógica que el servidor: q en valores y nombres enlazados, f. exacto, orden y páginas. */
function reader(pageCap = Infinity) {
  const calls: string[] = [];
  const entities = (spec as { entities: { id: EntityName }[] }).entities as never[];
  const read = async (path: string) => {
    calls.push(path);
    const url = new URL('http://x' + path), entity = url.pathname.split('/').pop() as EntityName, q = (url.searchParams.get('q') ?? '').toLowerCase();
    const def = (spec as { entities: { id: string }[] }).entities.find(item => item.id === entity) as never;
    const filters = Object.fromEntries([...url.searchParams].filter(([key]) => key.startsWith('f.')).map(([key, value]) => [key.slice(2), value]));
    const nameOf = (target: EntityName, id: string) => { const hit = DATA.find(item => item.entity === target && item.id === id); return hit ? recordLabel(hit, (entities as { id: string }[]).find(item => item.id === target) as never) : undefined; };
    const searched = DATA.filter(item => item.entity === entity && (!q || (Object.values(item.values).join(' ') + ' ' + (nameOf('companies', String(item.values.company_id ?? '')) ?? '')).toLowerCase().includes(q)));
    const all = orderRecords(searched, def, filters, parseRecordSort(url.searchParams.get('sort') ?? ''), nameOf);
    const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
    const records = offset >= pageCap ? [] : all.slice(offset, offset + limit);
    return { records, related: DATA.filter(item => item.entity === 'companies'), total: all.length };
  };
  return { calls, read };
}
const answer = async (text: string, pageCap?: number) => { const { read, calls } = reader(pageCap); const result = await runAsk(ask(text)!, spec, TODAY, read, new AbortController().signal); return { ...result, ids: result.records.map(item => item.id), calls }; };

test('responde leyendo la copia: rango, fecha, estado, orden y límite', async () => {
  assert.deepEqual((await answer('oportunidades abiertas que cierran este mes de más de 5.000 ordenadas por importe')).ids, ['d5', 'd1']);
  assert.deepEqual((await answer('las 2 oportunidades más grandes')).ids, ['d3', 'd5']);
  const top = await answer('las 2 oportunidades más grandes');
  assert.equal(top.matched, 5, 'cuenta todas antes del límite');
  assert.deepEqual((await answer('oportunidades ganadas o perdidas')).ids, ['d3']);
  assert.deepEqual((await answer('oportunidades con cierre pasado')).ids, ['d5'], 'la ganada no cuenta como atrasada');
});

test('responde con texto en lo enlazado y con las tareas de cada registro', async () => {
  assert.deepEqual((await answer('oportunidades de Acme')).ids.sort(), ['d1', 'd2']);
  assert.deepEqual((await answer('empresas de Madrid sin tareas')).ids, ['c3']);
  assert.deepEqual((await answer('oportunidades sin próximo paso')).ids.sort(), ['d2', 'd3', 'd4', 'd5'], 'd4 solo tiene una tarea ya hecha');
  const tasks = await answer('oportunidades sin tareas');
  assert.deepEqual(tasks.ids.sort(), ['d2', 'd3', 'd5']);
  assert.ok(tasks.calls.some(call => call.startsWith('/v2/records/tasks')), 'las tareas se leen solo si la pregunta las nombra');
  assert.ok(!(await answer('oportunidades de Acme')).calls.some(call => call.startsWith('/v2/records/tasks')));
});

test('si la lectura se corta, la respuesta lo dice (complete = false)', async () => {
  const partial = await answer('oportunidades de más de 1000', 0);
  assert.equal(partial.complete, false);
  assert.equal((await answer('oportunidades de más de 1000')).complete, true);
});

test('cada resultado explica por qué sale: los valores de la pregunta', () => {
  const query = ask('oportunidades que cierran este mes de más de 5000 ordenadas por importe')!;
  assert.equal(answerHint(DATA[3], query, spec), '8.000 · 25 nov');
  assert.equal(askMatches(DATA[3], query, { today: TODAY, spec, nameOf: () => undefined }), true);
  assert.equal(askMatches(DATA[4], query, { today: TODAY, spec, nameOf: () => undefined }), false);
});
