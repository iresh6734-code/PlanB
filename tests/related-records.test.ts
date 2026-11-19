import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, EntityName } from '../shared/model.js';
import { loadRelated, pointingTo, sourcesFor, PAGE_SIZE, MAX_PAGES } from '../src/app-shell/related.js';
import { matchCommands, rememberCommand, withRecent, type Command } from '../src/app-shell/commands.js';

// «Ficha 360» y paleta de órdenes (fase 2 del plan Faro 2): lógica pura, sin navegador.
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const of = (entity: EntityName) => snapshot.records.filter(record => record.entity === entity);
const pager = (calls: string[] = []) => async (entity: EntityName, offset: number, limit: number) => { calls.push(entity + '@' + offset); const all = of(entity); return { records: all.slice(offset, offset + limit), total: all.length }; };

test('sourcesFor: un cliente es apuntado por oportunidades y tareas; una empresa, por clientes y oportunidades', () => {
  assert.deepEqual(sourcesFor(spec, 'contacts').map(source => source.entity + '.' + source.fieldKey).sort(), ['deals.contact_id', 'tasks.contact_id']);
  assert.deepEqual(sourcesFor(spec, 'companies').map(source => source.entity + '.' + source.fieldKey).sort(), ['contacts.company_id', 'deals.company_id']);
  assert.deepEqual(sourcesFor(spec, 'tasks'), [], 'nada apunta a una tarea');
});

test('pointingTo: coincide por identificador exacto, no por texto parecido', () => {
  const records = [{ entity: 'tasks', id: 'a', values: { contact_id: 'contact-1' } }, { entity: 'tasks', id: 'b', values: { contact_id: 'contact-10' } }, { entity: 'tasks', id: 'c', values: { contact_id: null } }] as CrmRecord[];
  assert.deepEqual(pointingTo(records, 'contact_id', 'contact-1').map(record => record.id), ['a']);
});

test('loadRelated: devuelve exactamente los registros de la copia que apuntan a la ficha y lee cada tipo una sola vez', async () => {
  const contact = of('contacts')[0], calls: string[] = [];
  const groups = await loadRelated(spec, contact, pager(calls));
  for (const group of groups) {
    const expected = of(group.entity).filter(record => record.values[group.fieldKey] === contact.id).map(record => record.id).sort();
    assert.deepEqual(group.records.map(record => record.id).sort(), expected, group.entity);
    assert.equal(group.scanned, group.total, 'con pocos registros se revisan todos');
  }
  assert.ok(groups.some(group => group.records.length > 0), 'el ejemplo tiene algo relacionado');
  assert.equal(new Set(calls).size, calls.length, 'ningún tipo se pide dos veces');
});

test('loadRelated: con más registros de los que revisa, lo declara en scanned < total', async () => {
  const contact = of('contacts')[0];
  const many = Array.from({ length: PAGE_SIZE * MAX_PAGES + 40 }, (_, index) => ({ entity: 'tasks', id: 't' + index, values: { contact_id: index === PAGE_SIZE * MAX_PAGES + 5 ? contact.id : 'otro' } })) as CrmRecord[];
  const groups = await loadRelated(spec, contact, async (entity, offset, limit) => entity === 'tasks' ? { records: many.slice(offset, offset + limit), total: many.length } : { records: [], total: 0 });
  const tasks = groups.find(group => group.entity === 'tasks')!;
  assert.equal(tasks.scanned, PAGE_SIZE * MAX_PAGES); assert.equal(tasks.total, many.length);
  assert.equal(tasks.records.length, 0, 'lo que queda fuera de lo revisado no se inventa');
});

test('loadRelated: cancelar durante la respuesta detiene la paginación aunque el transporte la entregue', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const result = loadRelated(spec, of('contacts')[0], async (entity, offset) => {
    calls.push(entity + '@' + offset);
    const page = await pager()(entity, offset, PAGE_SIZE);
    controller.abort();
    return { ...page, total: PAGE_SIZE * 2 };
  }, controller.signal);

  await assert.rejects(result, { name: 'AbortError' });
  assert.deepEqual(calls, ['deals@0']);
});

test('loadRelated: una lectura ya cancelada no inicia ninguna petición', async () => {
  const calls: string[] = [];
  await assert.rejects(loadRelated(spec, of('contacts')[0], pager(calls), AbortSignal.abort()), { name: 'AbortError' });
  assert.deepEqual(calls, []);
});

test('matchCommands: todas las palabras, sin acentos ni mayúsculas', () => {
  const commands: Command[] = [{ id: 'a', label: 'Ir a Preparación', group: 'Ir a', run() {} }, { id: 'b', label: 'Nueva tarea', group: 'Crear', run() {} }, { id: 'c', label: 'Ir a Tareas', group: 'Ir a', run() {} }];
  assert.deepEqual(matchCommands(commands, 'PREPARACION').map(command => command.id), ['a']);
  assert.deepEqual(matchCommands(commands, 'tarea').map(command => command.id), ['b', 'c']);
  assert.deepEqual(matchCommands(commands, 'ir tarea').map(command => command.id), ['c']);
  assert.equal(matchCommands(commands, '').length, 3);
  assert.equal(matchCommands(commands, 'zzz').length, 0);
});

test('órdenes recientes: primero con buscador vacío, sin registros ni repetidos', () => {
  const commands: Command[] = [{ id: 'a', label: 'Ir a Inicio', group: 'Ir a', run() {} }, { id: 'b', label: 'Nueva tarea', group: 'Crear', run() {} }, { id: 'c', label: 'Ir a Tareas', group: 'Ir a', hint: 'G T', run() {} }];
  let recent = rememberCommand([], 'b'); recent = rememberCommand(recent, 'c'); recent = rememberCommand(recent, 'b'); recent = rememberCommand(recent, 'rec-contacts-1');
  assert.deepEqual(recent, ['b', 'c']);
  assert.deepEqual(rememberCommand(['a', 'b', 'c', 'd'], 'e'), ['e', 'a', 'b', 'c']);
  const shown = withRecent(commands, [...recent, 'gone'], '');
  assert.deepEqual(shown.map(command => command.id), ['b', 'c', 'a']);
  assert.deepEqual(shown.slice(0, 2).map(command => [command.group, command.hint]), [['Recientes', 'Crear'], ['Recientes', 'G T']]);
  assert.deepEqual(withRecent(commands, recent, 'ir').map(command => command.id), ['a', 'b', 'c']);
});
