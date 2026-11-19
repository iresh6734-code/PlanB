import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { activitySubject, activityTask, canLogActivity, describeActivity, parseActivity } from '../src/app-shell/quick-activity.js';

const spec = makeDemoSpec(makeFixture('agency'));
const today = '2026-11-20'; // viernes
const parse = (text: string) => { const parsed = parseActivity(text, today); assert.ok(parsed, text); return parsed; };
const deal: CrmRecord = { id: 'd1', entity: 'deals', values: { dealname: 'Web Acme', amount: 1000, dealstage: 'proposal', company_id: 'co1', contact_id: 'c1', service: 'web', closedate: '2026-12-01' } };

test('actividad: fechas, horas y tipo salen de una sola línea y el asunto queda limpio', () => {
  assert.deepEqual(parse('llamar mañana 10:00 sobre la propuesta'), { kind: 'call', subject: 'Llamar sobre la propuesta', day: '2026-11-21', time: '10:00', done: false, dated: true });
  assert.deepEqual(parse('Reunión el lunes a las 9'), { kind: 'meeting', subject: 'Reunión', day: '2026-11-23', time: '09:00', done: false, dated: true });
  assert.equal(parse('enviar presupuesto en 2 semanas').day, '2026-12-04');
  assert.equal(parse('enviar presupuesto en 2 semanas').kind, 'email');
  assert.equal(parse('pasado mañana revisar contrato').day, '2026-11-22');
  assert.equal(parse('viernes cerrar acuerdo').day, '2026-11-27', 'el mismo día de la semana es la semana que viene');
  assert.deepEqual([parse('revisar contrato 3/1').day, parse('revisar contrato 3/1').subject], ['2027-01-03', 'Revisar contrato'], 'un día ya pasado sin año es del año siguiente');
  assert.deepEqual([parse('15 de diciembre: preparar demo').day, parse('15 de diciembre: preparar demo').subject], ['2026-12-15', 'Preparar demo']);
  assert.equal(parse('llamar 10h30').time, '10:30');
  const morning = parse('llamar por la mañana');
  assert.deepEqual([morning.dated, morning.day, morning.subject], [false, today, 'Llamar por la mañana'], '«por la mañana» no es mañana');
  const invalid = parse('revisar 31/02');
  assert.deepEqual([invalid.dated, invalid.subject], [false, 'Revisar 31/02'], 'una fecha imposible no se inventa');
  assert.equal(parseActivity('   ', today), null);
});

test('actividad: lo ya hecho y las notas quedan registrados hoy como hechos', () => {
  const called = parse('Llamé, le interesa el plan');
  assert.deepEqual([called.kind, called.done, called.day, called.subject], ['call', true, today, 'Llamé, le interesa el plan']);
  const sent = parse('hecho: enviar contrato');
  assert.deepEqual([sent.kind, sent.done, sent.subject], ['email', true, 'Enviar contrato']);
  const note = parse('Nota: prefiere hablar por la tarde');
  assert.deepEqual([note.kind, note.done, note.subject], ['note', true, 'Prefiere hablar por la tarde']);
  assert.equal(parse('hecho: llamar mañana').done, false, 'con fecha futura sigue pendiente');
});

test('actividad: la tarea queda enlazada a la ficha con su estado, fecha y nota', () => {
  assert.equal(canLogActivity(spec, deal), true);
  assert.equal(canLogActivity(spec, { id: 't1', entity: 'tasks', values: {} }), false);
  const call = activityTask(spec, deal, parse('llamar mañana 10:00 sobre la propuesta'), 'Web Acme');
  assert.ok(call);
  assert.deepEqual([call.subject, call.due_date, call.status, call.deal_id, call.contact_id], ['Llamar sobre la propuesta · 10:00', '2026-11-21', 'pending', 'd1', 'c1']);
  const note = activityTask(spec, deal, parse('nota: prefiere factura trimestral'), 'Web Acme');
  assert.ok(note);
  assert.deepEqual([note.subject, note.status, note.notes, note.due_date], ['Nota: Prefiere factura trimestral', 'completed', 'Prefiere factura trimestral', today]);
  assert.equal(activitySubject(parse('mañana 10:00'), 'Web Acme'), 'Tarea con Web Acme · 10:00');
  assert.equal(activitySubject(parse('llamar ' + 'x'.repeat(200)), '').length, 120);
});

test('actividad: la vista previa dice tipo, día, hora y estado', () => {
  const text = describeActivity(parse('llamar mañana 10:00'), today);
  assert.match(text, /^Llamada · mañana, \S+ 21 nov · 10:00 · pendiente$/);
  assert.match(describeActivity(parse('llamé'), today), /^Llamada · hoy, .+ · queda como hecha$/);
});
