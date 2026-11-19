import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { DEFAULT_TEMPLATES } from '../src/app-shell/templates.js';
import { addWorkingDays, DEFAULT_SEQUENCES, MAX_SEQUENCES, parseSequences, parseSteps, sequenceContext, sequencePlan, sequenceTasks, serializeSequences, stepsText, upsertSequence } from '../src/app-shell/sequences.js';

// F4 · Secuencias: 20/11/2026 es viernes; 21 y 22 son fin de semana.
const spec = makeDemoSpec(makeFixture('agency'));
const contact: CrmRecord = { id: 'contact-7', entity: 'contacts', values: { firstname: 'Lucía', lastname: 'Prado', email: 'lucia@ejemplo.test', phone: '600 000 000', company_id: null } };
const deal: CrmRecord = { id: 'deal-3', entity: 'deals', values: { dealname: 'Web nueva', amount: 1000, dealstage: 'proposal', company_id: 'company-1', contact_id: 'contact-7', service: 'web', closedate: null } };
const company: CrmRecord = { id: 'company-1', entity: 'companies', values: { name: 'Ejemplo SL' } };
const [primer] = DEFAULT_SEQUENCES;

test('F4 · los días cuentan solo de lunes a viernes', () => {
  assert.equal(addWorkingDays('2026-11-20', 0), '2026-11-20');
  assert.equal(addWorkingDays('2026-11-20', 1), '2026-11-23', 'del viernes salta al lunes');
  assert.equal(addWorkingDays('2026-11-20', 3), '2026-11-25');
  assert.equal(addWorkingDays('2026-11-20', 7), '2026-12-01');
  assert.equal(addWorkingDays('2026-11-21', 0), '2026-11-23', 'empezar en sábado es empezar el lunes');
  assert.equal(addWorkingDays('2026-11-22', 2), '2026-11-25');
  assert.equal(addWorkingDays('2026-12-31', 1), '2027-01-01', 'cruza de año sin desfase');
  assert.deepEqual(sequencePlan(primer, '2026-11-20').map(item => item.day), ['2026-11-20', '2026-11-25', '2026-12-01']);
});

test('F4 · crea las tareas abiertas, enlazadas a la ficha y con el texto de la plantilla en las notas', () => {
  const tasks = sequenceTasks({ spec, record: deal, name: 'Web nueva', sequence: primer, start: '2026-11-20', templates: DEFAULT_TEMPLATES, context: sequenceContext(spec, contact, '2026-11-20') });
  assert.ok(tasks);
  assert.equal(tasks.length, 3);
  for (const values of tasks) {
    assert.equal(values.deal_id, 'deal-3');
    assert.equal(values.contact_id, 'contact-7', 'hereda el cliente de la oportunidad');
    assert.equal(values.status, 'pending');
  }
  assert.deepEqual(tasks.map(values => values.due_date), ['2026-11-20', '2026-11-25', '2026-12-01']);
  assert.equal(tasks[0].subject, 'Llamar: Web nueva');
  assert.match(String(tasks[1].notes), /^Secuencia «Primer contacto» · paso 2 de 3 · Correo\n\n/);
  assert.match(String(tasks[1].notes), /Lucía/, 'la plantilla se rellena con los datos de la ficha');
  const plain = sequenceTasks({ spec, record: contact, name: 'Lucía Prado', sequence: primer, start: '2026-11-20' });
  assert.equal(plain?.[0].contact_id, 'contact-7');
  assert.equal(plain?.[0].notes, 'Secuencia «Primer contacto» · paso 1 de 3 · Llamada', 'sin plantillas, solo la referencia del paso');
});

test('F4 · no crea nada si no puede enlazar con seguridad', () => {
  assert.equal(sequenceTasks({ spec, record: company, name: 'Ejemplo SL', sequence: primer, start: '2026-11-20' }), null, 'las tareas no enlazan con empresas');
  assert.equal(sequenceTasks({ spec, record: { id: 'task-1', entity: 'tasks', values: {} }, name: 'x', sequence: primer, start: '2026-11-20' }), null);
  assert.equal(sequenceTasks({ spec, record: contact, name: 'x', sequence: { ...primer, steps: [] }, start: '2026-11-20' }), null);
  assert.equal(sequenceTasks({ spec, record: contact, name: 'x', sequence: primer, start: '20/11/2026' }), null);
});

test('F4 · las cadencias se escriben a mano, se validan y se guardan sin datos de clientes', () => {
  assert.deepEqual(parseSteps('7 llamada\n0 Llamada Presentarme\n3 correo'), { steps: [
    { offset: 0, kind: 'call', title: 'Presentarme' }, { offset: 3, kind: 'email', title: 'Escribir' }, { offset: 7, kind: 'call', title: 'Llamar' }] });
  assert.match(parseSteps('3 fax').error ?? '', /Línea 1/);
  assert.match(parseSteps('99 correo').error ?? '', /60 días/);
  assert.match(parseSteps('').error ?? '', /al menos un paso/);
  assert.deepEqual(parseSteps(stepsText(primer.steps)).steps, primer.steps, 'editar y guardar sin cambios deja la cadencia igual');
  const added = upsertSequence(DEFAULT_SEQUENCES, { name: ' Mía ', text: '0 reunión Visita' }, () => 'nueva');
  assert.equal(added.id, 'nueva');
  assert.deepEqual(added.list.at(-1), { id: 'nueva', name: 'Mía', steps: [{ offset: 0, kind: 'meeting', title: 'Visita' }] });
  assert.equal(upsertSequence(added.list, { id: 'nueva', name: 'Mía', text: '1 tarea' }, () => 'otra').list.length, added.list.length, 'editar sustituye');
  assert.match(upsertSequence(DEFAULT_SEQUENCES, { name: '', text: '0 llamada' }, () => 'x').error ?? '', /nombre/);
  assert.deepEqual(parseSequences(serializeSequences(added.list)), added.list);
  assert.deepEqual(parseSequences('[]'), [], 'una lista vacía guardada se respeta');
  assert.deepEqual(parseSequences('{roto'), DEFAULT_SEQUENCES, 'si está dañada vuelven las de ejemplo');
  assert.deepEqual(parseSequences(JSON.stringify([{ id: 'a', name: 'A', steps: [{ offset: -1, kind: 'call', title: 'x' }, { offset: 2, kind: 'spam', title: 'y' }] }])), [], 'descarta pasos fuera de rango o de tipo desconocido');
  const many = Array.from({ length: MAX_SEQUENCES }, (_, index) => ({ id: 's' + index, name: 'S' + index, steps: [{ offset: 0, kind: 'call' as const, title: 'Llamar' }] }));
  assert.match(upsertSequence(many, { name: 'Otra', text: '0 llamada' }, () => 'x').error ?? '', /borra alguna/);
});
