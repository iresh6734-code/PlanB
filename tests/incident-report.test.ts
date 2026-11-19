// R2 · Expediente del incidente: línea temporal por horas, recuentos por tipo, nombres de campo y huellas; ningún valor de registro.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Change } from '../shared/model.js';
import { incidentFiles, incidentHeadline, incidentReport, type IncidentInput } from '../src/app-shell/incident-report.js';

const change = (id: number, at: string, entity: string, operation: 'create' | 'update', before: Record<string, unknown> | null, after: Record<string, unknown>, recordId = 'r' + id) =>
  ({ id, at, entity, recordId, operation, before: before ? { id: recordId, entity, values: before } : null, after: { id: recordId, entity, values: after } }) as unknown as Change;
const base = (overrides: Partial<IncidentInput> = {}): IncidentInput => ({
  window: { startedAt: '2026-11-19T09:42:00.000Z', endedAt: '2026-11-19T11:05:00.000Z' },
  changes: [
    change(1, '2026-11-19T08:00:00Z', 'contacts', 'update', { email: 'antes@x.es' }, { email: 'fuera@x.es' }),
    change(2, '2026-11-19T09:50:00Z', 'contacts', 'update', { phone: '600111222', city: 'Bilbao' }, { phone: '600999888', city: 'Bilbao' }, 'c7'),
    change(3, '2026-11-19T10:10:00Z', 'tasks', 'create', null, { subject: 'Llamar a Ana Secreta', status: 'open' }),
    change(4, '2026-11-19T10:20:00Z', 'contacts', 'update', { lifecycle: 'lead' }, { lifecycle: 'customer' }, 'c7'),
    change(5, '2026-11-19T11:30:00Z', 'deals', 'update', { amount: 1 }, { amount: 2 }),
  ],
  watermark: 2,
  captures: [{ at: '2026-11-19T09:15:00Z' }, { at: '2026-11-19T08:00:00Z' }, { at: '2026-11-19T10:30:00Z' }, { at: 'roto' }],
  labels: { contacts: 'Clientes', tasks: 'Tareas' },
  version: '0.3.0', generatedAt: new Date('2026-11-19T11:06:00Z'),
  ...overrides,
});

test('solo cuenta lo hecho entre el inicio y el final, por tipo y con los campos tocados', () => {
  const report = incidentReport(base());
  assert.deepEqual(report.totals, { changes: 3, created: 1, updated: 2, returned: 1, pending: 2, records: 2 });
  assert.equal(report.duration, '1 h 23 min');
  assert.deepEqual(report.entities.map(row => [row.label, row.created, row.updated, row.returned, row.pending, row.fields]), [
    ['Clientes', 0, 2, 1, 1, ['lifecycle', 'phone']],
    ['Tareas', 1, 0, 0, 1, ['status', 'subject']],
  ]);
  assert.equal(report.returnState, 'partial');
});

test('una fila por hora de Madrid, también las horas sin actividad', () => {
  const report = incidentReport(base());
  assert.deepEqual(report.hours.map(hour => [hour.label, hour.created + hour.updated]), [['10:00', 1], ['11:00', 2], ['12:00', 0]]);
});

test('copia en uso al empezar y capturas durante la contingencia', () => {
  const report = incidentReport(base());
  assert.equal(report.copyAtStart, '2026-11-19T09:15:00.000Z');
  assert.deepEqual(report.capturesDuring, ['2026-11-19T10:30:00.000Z']);
  assert.equal(incidentReport(base({ captures: [] })).copyAtStart, null);
});

test('estado de la devolución y titular', () => {
  assert.equal(incidentReport(base({ watermark: 10 })).returnState, 'returned');
  assert.equal(incidentReport(base({ watermark: 0 })).returnState, 'pending');
  const empty = incidentReport(base({ changes: [] }));
  assert.equal(empty.returnState, 'none');
  assert.match(incidentHeadline(empty), /no se guardó ningún cambio/);
  assert.match(incidentHeadline(incidentReport(base())), /3 cambios en 2 registros, 1 devueltos y 2 pendientes/);
});

test('el expediente no lleva valores de registros y sus huellas detectan cualquier cambio', () => {
  const report = incidentReport(base());
  const files = incidentFiles(report);
  for (const secret of ['600999888', '600111222', 'Ana Secreta', 'customer', 'Bilbao', 'fuera@x.es']) {
    assert.equal(files.html.includes(secret), false, 'HTML: ' + secret);
    assert.equal(files.json.includes(secret), false, 'JSON: ' + secret);
  }
  assert.match(report.evidenceDigest, /^[0-9a-f]{64}$/);
  const parsed = JSON.parse(files.json);
  assert.equal(parsed.digest, files.digest);
  assert.ok(files.html.includes(files.digest) && files.html.includes(report.evidenceDigest));
  assert.doesNotMatch(files.html, /<script/i);
  // Misma entrada, misma huella; otra operación dentro del intervalo, otra huella.
  assert.equal(incidentFiles(incidentReport(base())).digest, files.digest);
  const more = base(); more.changes = [...more.changes, change(6, '2026-11-19T10:40:00Z', 'tasks', 'update', { status: 'open' }, { status: 'done' })];
  assert.notEqual(incidentReport(more).evidenceDigest, report.evidenceDigest);
});

test('un intervalo de varios días etiqueta las horas con el día y tiene tope', () => {
  const report = incidentReport(base({ window: { startedAt: '2026-11-19T22:30:00.000Z', endedAt: '2026-11-20T00:10:00.000Z' }, changes: [] }));
  assert.equal(report.hours.length, 3);
  assert.match(report.hours[0].label, /^19 nov.* · 23:00$/);
  const long = incidentReport(base({ window: { startedAt: '2026-11-01T00:00:00.000Z', endedAt: '2026-12-31T00:00:00.000Z' }, changes: [] }));
  assert.ok(long.hours.length <= 24 * 14);
});
