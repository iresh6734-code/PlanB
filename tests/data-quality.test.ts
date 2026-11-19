import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord, EntityName } from '../shared/model.js';
import { checkQuality, loadQuality } from '../src/app-shell/quality.js';
import { MAX_PAGES, PAGE_SIZE } from '../src/app-shell/related.js';

// Calidad de los datos (fase 2 del plan Faro 2): comprobaciones de forma sobre la copia, sin navegador.
const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const all = new Set<EntityName>(['contacts', 'companies', 'deals', 'tasks']);
const base = () => structuredClone(snapshot.records) as CrmRecord[];
const kinds = (records: CrmRecord[], complete = all) => checkQuality(spec, records, complete).map(issue => issue.kind + ':' + issue.record.id + ':' + issue.field).sort();

test('la copia de ensayo, tal cual, no tiene avisos', () => {
  assert.deepEqual(kinds(base()), []);
});

test('detecta obligatorio vacío, correo mal formado y referencia a un registro inexistente', () => {
  const records = base();
  const contact = records.find(record => record.entity === 'contacts')!;
  contact.values.email = 'sin-arroba';
  const task = records.find(record => record.entity === 'tasks')!;
  task.values.subject = '  ';
  task.values.contact_id = 'contact-que-no-existe';
  assert.deepEqual(kinds(records), ['dangling:' + task.id + ':contact_id', 'email:' + contact.id + ':email', 'required:' + task.id + ':subject'].sort());
});

test('una referencia a un tipo no revisado entero no se da por rota', () => {
  const records = base();
  const task = records.find(record => record.entity === 'tasks')!;
  task.values.contact_id = 'contact-que-no-existe';
  assert.deepEqual(kinds(records, new Set<EntityName>(['companies', 'deals', 'tasks'])), []);
});

test('duplicados: por correo y por nombre completo de cliente (sin acentos ni mayúsculas); no por asunto de tarea', () => {
  const records = base();
  const [first, second, third] = records.filter(record => record.entity === 'contacts');
  second.values.firstname = String(first.values.firstname).toUpperCase(); second.values.lastname = first.values.lastname;
  third.values.email = String(first.values.email).toUpperCase();
  const tasks = records.filter(record => record.entity === 'tasks');
  tasks[1].values.subject = tasks[0].values.subject;
  const issues = checkQuality(spec, records, all);
  assert.deepEqual(issues.map(issue => issue.kind + ':' + issue.record.id).sort(), ['duplicate:' + second.id, 'duplicate:' + third.id].sort());
  assert.match(issues[0].text, /^Posible duplicado de «/);
});

test('loadQuality: dice cuánto revisó y no afirma referencias rotas fuera de lo revisado', async () => {
  const records = base();
  const many = Array.from({ length: PAGE_SIZE * MAX_PAGES + 10 }, (_, index) => ({ entity: 'tasks', id: 't' + index, values: { subject: 'Tarea ' + index, due_date: '2026-11-20', status: 'pending', contact_id: null, deal_id: null } })) as CrmRecord[];
  const report = await loadQuality(spec, async (entity, offset, limit) => { const list = entity === 'tasks' ? many : records.filter(record => record.entity === entity); return { records: list.slice(offset, offset + limit), total: list.length }; });
  assert.equal(report.complete, false);
  assert.equal(report.total - report.scanned, 10);
  assert.deepEqual(report.issues, []);
});

test('una página repetida no completa otra página ni convierte una relación en rota', async () => {
  const records = base().filter(record => record.entity !== 'contacts');
  const task = records.find(record => record.entity === 'tasks')!;
  task.values.contact_id = 'contact-101';
  const contacts: CrmRecord[] = Array.from({length:100},(_, i) => ({
    entity:'contacts', id:'contact-' + (i+1), values:{firstname:'Cliente ' + i,email:'cliente-' + i + '@example.invalid'},
  }));
  const report = await loadQuality(spec, async (entity, offset) => entity === 'contacts'
    ? {records:offset ? [contacts[0]] : contacts,total:101}
    : {records:records.filter(record=>record.entity===entity),total:records.filter(record=>record.entity===entity).length});
  assert.equal(report.scanned, records.length + 100);
  assert.equal(report.complete, false);
  assert.equal(report.unstable, true);
  assert.equal(report.issues.some(issue=>issue.kind==='dangling' || issue.kind==='duplicate'), false);
});

test('una reducción del total durante el recorrido no declara completa la lectura', async () => {
  const onlyContacts = {...spec,entities:spec.entities.filter(entity=>entity.id==='contacts')};
  const contacts: CrmRecord[] = Array.from({length:120},(_, i) => ({
    entity:'contacts', id:'contact-' + (i+1), values:{firstname:'Cliente ' + i,email:'cliente-' + i + '@example.invalid'},
  }));
  const report = await loadQuality(onlyContacts, async (_entity, offset, limit) => ({
    records:contacts.slice(offset,offset+limit),total:offset ? 120 : 200,
  }));
  assert.equal(report.complete,false);
  assert.equal(report.unstable,true);
  assert.equal(report.scanned,120);
});

test('una respuesta tardía no abre otra página tras cancelar la revisión', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const review = loadQuality(spec, async (entity, offset) => {
    calls.push(entity + '@' + offset);
    controller.abort();
    return {records:base().filter(record=>record.entity===entity),total:220};
  }, controller.signal);
  await assert.rejects(review, {name:'AbortError'});
  assert.deepEqual(calls,['contacts@0']);
});
