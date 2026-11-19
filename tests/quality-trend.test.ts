import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { completeness } from '../src/app-shell/quality.js';
import { addPoint, parseHistory, serializeHistory, sparkPoints, trendOf, type QualityPoint } from '../src/app-shell/quality-trend.js';

const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const base = () => structuredClone(snapshot.records) as CrmRecord[];

test('completitud: cuenta columnas visibles y obligatorios, y señala el campo que más falta', () => {
  const records = base();
  const entity = spec.entities.find(item => item.id === 'contacts')!;
  const counted = entity.fields.filter(field => !field.readOnly && field.type !== 'boolean' && (field.required || entity.columns.includes(field.key)));
  const contacts = records.filter(record => record.entity === 'contacts');
  for (const record of contacts) for (const field of counted) record.values[field.key] ||= 'x';
  assert.equal(completeness(spec, records).find(row => row.entity === 'contacts')!.pct, 100);
  const column = counted.find(field => !field.required)!;
  for (const record of contacts.slice(0, 2)) record.values[column.key] = '  ';
  const after = completeness(spec, records).find(row => row.entity === 'contacts')!;
  assert.equal(after.total, contacts.length);
  assert.equal(after.complete, contacts.length - 2);
  assert.deepEqual(after.gap, { field: column.key, label: column.label, missing: 2 });
  assert.equal(after.pct, Math.round((contacts.length - 2) / contacts.length * 100));
});

test('completitud: un tipo sin registros no aparece', () => {
  const rows = completeness(spec, base().filter(record => record.entity !== 'deals'));
  assert.equal(rows.some(row => row.entity === 'deals'), false);
});

test('tendencia: un punto por día, ordenada, con tope, y delta del primero al último', () => {
  let history: QualityPoint[] = [];
  history = addPoint(history, { day: '2026-05-03', values: { contacts: 60 } });
  history = addPoint(history, { day: '2026-05-01', values: { contacts: 50 } });
  assert.equal(trendOf(history, 'companies'), null);
  history = addPoint(history, { day: '2026-05-03', values: { contacts: 70 } });
  assert.deepEqual(history.map(point => point.day), ['2026-05-01', '2026-05-03']);
  assert.deepEqual(trendOf(history, 'contacts'), { from: 50, to: 70, delta: 20, since: '2026-05-01', series: [50, 70] });
  const capped = Array.from({ length: 20 }, (_, i) => ({ day: '2026-06-' + String(i + 1).padStart(2, '0'), values: { contacts: i } }))
    .reduce<QualityPoint[]>((list, point) => addPoint(list, point, 5), []);
  assert.deepEqual(capped.map(point => point.values.contacts), [15, 16, 17, 18, 19]);
});

test('historial guardado: por espacio, descarta lo mal formado y no pisa otros espacios', () => {
  const raw = JSON.stringify({ A: [{ day: '2026-05-01', values: { contacts: 40 } }, { day: 'ayer', values: {} }, { day: '2026-05-02', values: { contacts: 140 } }], B: [] });
  assert.deepEqual(parseHistory(raw, 'A'), [{ day: '2026-05-01', values: { contacts: 40 } }]);
  assert.deepEqual(parseHistory('{roto', 'A'), []);
  const next = JSON.parse(serializeHistory(raw, 'B', [{ day: '2026-05-04', values: { tasks: 90 } }]));
  assert.equal(next.A.length, 3);
  assert.deepEqual(next.B, [{ day: '2026-05-04', values: { tasks: 90 } }]);
  assert.equal(sparkPoints([0, 100], 48, 16), '0.0,16.0 48.0,0.0');
  assert.equal(sparkPoints([50], 48, 16), '');
});
