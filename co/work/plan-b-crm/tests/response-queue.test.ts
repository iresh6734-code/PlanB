import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import type { CrmRecord } from '../shared/model.js';

const now = Date.parse('2026-10-29T12:00:00Z');
function fixture(datetime = false) {
  const snapshot = makeFixture(), spec = makeDemoSpec(snapshot);
  const entity = spec.entities.find(e => e.id === 'tasks')!;
  if (datetime) entity.fields.find(f => f.key === 'due_date')!.type = 'datetime';
  return { spec, records: [] as CrmRecord[], evaluatedAt: now };
}
const task = (id: string, due: string | null, status = 'pending'): CrmRecord => ({ id, entity: 'tasks', values: { subject: 'Tarea ' + id, due_date: due, status } });

test('queue prioritizes overdue, within horizon, review and later; completed tasks are excluded', () => {
  const f = fixture(); f.records = [task('later', '2026-11-02'), task('review', null), task('done', '2026-10-20', 'completed'), task('now', '2026-10-29'), task('old', '2026-10-28')];
  const result = buildResponseQueue({ ...f, horizonHours: 8 });
  assert.deepEqual(result.items.map(t => t.id), ['old', 'now', 'review', 'later']);
  assert.deepEqual(result.summary.buckets, { overdue: 1, 'due-in-window': 1, 'needs-review': 1, later: 1 });
  assert.equal(result.summary.completedTasks, 1); assert.equal(result.summary.knownOpenTasks, 4);
  assert.ok(result.items.every(t => t.reasons.length && t.nextAction));
});

test('instant deadlines include both horizon boundaries and distinguish one millisecond outside', () => {
  const f = fixture(true), end = now + 3_600_000;
  f.records = [task('over', new Date(now - 1).toISOString()), task('start', new Date(now).toISOString()), task('end', new Date(end).toISOString()), task('later', new Date(end + 1).toISOString())];
  const items = buildResponseQueue({ ...f, horizonHours: 1 }).items;
  assert.deepEqual(items.map(t => [t.id, t.bucket]), [['over', 'overdue'], ['start', 'due-in-window'], ['end', 'due-in-window'], ['later', 'later']]);
});

test('a date without time remains due today, even late in the local day; horizon includes intersecting calendar days', () => {
  const f = fixture(); f.evaluatedAt = Date.parse('2026-10-29T22:30:00Z');
  f.records = [task('today', '2026-10-29'), task('tomorrow', '2026-10-30')];
  const result = buildResponseQueue({ ...f, horizonHours: 1 });
  assert.deepEqual(result.items.map(t => t.bucket), ['due-in-window', 'due-in-window']);
  assert.equal(result.items[0].due.at, null); assert.match(result.items[1].reasons[0].detail, /no consta una hora exacta/);
});

test('Madrid civil day differs from UTC day and handles spring/fall daylight changes', () => {
  for (const [at, yesterday, today] of [
    ['2026-06-01T22:30:00Z', '2026-06-01', '2026-06-02'],
    ['2026-03-29T01:30:00Z', '2026-03-28', '2026-03-29'],
    ['2026-10-25T01:30:00Z', '2026-10-24', '2026-10-25'],
  ]) {
    const f = fixture(); f.evaluatedAt = Date.parse(at); f.records = [task('old', yesterday), task('today', today)];
    assert.deepEqual(buildResponseQueue(f).items.map(t => t.bucket), ['overdue', 'due-in-window']);
  }
});

test('offset timestamps order by actual instant even during repeated autumn hour', () => {
  const f = fixture(true); f.evaluatedAt = Date.parse('2026-10-25T01:00:00Z');
  f.records = [task('second', '2026-10-25T02:30:00+01:00'), task('first', '2026-10-25T02:30:00+02:00')];
  const result = buildResponseQueue(f);
  assert.deepEqual(result.items.map(t => [t.id, t.bucket]), [['first', 'overdue'], ['second', 'due-in-window']]);
});

test('impossible dates, timezone-free datetime, leap errors and ambiguous numeric values need review', () => {
  for (const value of ['2026-02-30', '2026-02-29', '0000-01-01', '2026-13-01', '29/10/2026']) {
    const f = fixture(); f.records = [task('bad', value)]; assert.equal(buildResponseQueue(f).items[0].due.kind, 'invalid', value);
  }
  for (const value of ['2026-10-29T13:00:00', '2026-02-30T12:00:00Z', '2026-10-29T24:00:00Z', '2026-10-29T12:00:60Z']) {
    const f = fixture(true); f.records = [task('bad', value)]; assert.equal(buildResponseQueue(f).items[0].bucket, 'needs-review', value);
  }
  const f = fixture(true); const record = task('bad', null); record.values.due_date = now; f.records = [record]; assert.equal(buildResponseQueue(f).items[0].due.kind, 'invalid');
});

test('valid leap day is kept as a civil date and malformed date strings do not silently disappear', () => {
  const f = fixture(); f.records = [task('leap', '2024-02-29')];
  assert.equal(buildResponseQueue(f).items[0].due.kind, 'date'); assert.equal(buildResponseQueue(f).items[0].bucket, 'overdue');
});

test('unknown and conflicting statuses remain visible; option labels support custom IDs conservatively', () => {
  const f = fixture(), field = f.spec.entities.find(e => e.id === 'tasks')!.fields.find(x => x.key === 'status')!;
  field.options.push({ id: 's1', label: 'Pendiente' }, { id: 's2', label: 'Completada' }, { id: 'custom', label: 'Especial' }, { id: 'done', label: 'Pendiente' });
  f.records = [task('custom-open', '2026-10-28', 's1'), task('custom-done', null, 's2'), task('ambiguous', '2026-10-28', 'done'), task('unknown', '2026-10-28', 'custom'), task('undeclared', '2026-10-28', 'finished')];
  const result = buildResponseQueue(f);
  assert.equal(result.summary.completedTasks, 1); assert.equal(result.summary.unknownStatusTasks, 3);
  assert.equal(result.items.find(t => t.id === 'ambiguous')!.status, 'unknown');
  assert.equal(result.items.find(t => t.id === 'undeclared')!.bucket, 'needs-review');
});

test('custom configured due/status roles override defaults and never fall back to a different field', () => {
  const f = fixture(), entity = f.spec.entities.find(e => e.id === 'tasks')!;
  entity.fields.find(x => x.key === 'due_date')!.key = 'deadline'; entity.fields.find(x => x.key === 'status')!.key = 'state';
  f.spec.roles = { stage: 'dealstage', amount: 'amount', pipeline: null, dueDate: 'deadline', taskStatus: 'state' };
  const record = task('custom', '2026-10-20', 'completed'); record.values.deadline = '2026-10-29'; record.values.state = 'pending'; f.records = [record];
  assert.equal(buildResponseQueue(f).items[0].bucket, 'due-in-window');
  delete record.values.deadline; assert.equal(buildResponseQueue(f).items[0].due.kind, 'missing');
});

test('explicit references are entity scoped; a missing target is reported without inventing a dependency', () => {
  const f = fixture(), row = task('one', '2026-10-29'); row.values.contact_id = 'same'; row.values.deal_id = 'missing';
  f.records = [row, { id: 'same', entity: 'companies', values: { name: 'Empresa' } }, { id: 'same', entity: 'contacts', values: { firstname: 'Contacto correcto' } }];
  const item = buildResponseQueue(f).items[0];
  assert.equal(item.references[0].label, 'Contacto correcto'); assert.equal(item.references[1].available, false);
  assert.equal(item.references[1].label, null); assert.ok(item.reasons.some(r => r.code === 'missing-reference'));
  assert.equal(item.bucket, 'due-in-window'); assert.match(item.nextAction, /registros relacionados/);
});

test('counts cover all tasks before slicing; sorting is independent of input order with stable ID ties', () => {
  const f = fixture(); f.records = [task('z', '2026-10-29'), task('a', '2026-10-29'), task('b', null)];
  const forward = buildResponseQueue({ ...f, limit: 1 }); f.records.reverse(); const reverse = buildResponseQueue({ ...f, limit: 1 });
  assert.deepEqual(reverse, forward); assert.equal(forward.items[0].id, 'a'); assert.equal(forward.summary.buckets['needs-review'], 1);
  assert.equal(forward.summary.totalQueued, 3); assert.equal(forward.summary.returned, 1); assert.equal(forward.summary.truncated, true);
});

test('empty queue is explicit and inputs including values remain unchanged', () => {
  const f = fixture(); assert.deepEqual(buildResponseQueue(f).items, []); assert.equal(buildResponseQueue(f).summary.truncated, false);
  f.records = [task('one', '2026-10-29')]; const before = structuredClone(f); Object.freeze(f.records[0].values); Object.freeze(f.records[0]); Object.freeze(f.records);
  buildResponseQueue(f); assert.deepEqual(f, before);
});

test('record cap includes all four entities; duplicate IDs are forbidden only within an entity', () => {
  const f = fixture(); f.records = Array.from({ length: 10_000 }, (_, n) => task(String(n), '2026-10-29'));
  const result = buildResponseQueue(f); assert.equal(result.summary.totalTasks, 10_000); assert.equal(result.items.length, 50);
  f.records.push({ id: 'extra', entity: 'contacts', values: {} }); assert.throws(() => buildResponseQueue(f), /10.000/);
  f.records = [task('one', null), task('one', null)]; assert.throws(() => buildResponseQueue(f), /duplicado/);
});

test('invalid time, horizon and limits are rejected at the pure module boundary', () => {
  const f = fixture();
  for (const evaluatedAt of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => buildResponseQueue({ ...f, evaluatedAt }), RangeError);
  for (const horizonHours of [0, 721, 1.5]) assert.throws(() => buildResponseQueue({ ...f, horizonHours }), RangeError);
  for (const limit of [0, 201, 1.5]) assert.throws(() => buildResponseQueue({ ...f, limit }), RangeError);
});

test('labels, fallback IDs and invalid-date previews preserve supplementary characters at clipping boundaries', () => {
  const f = fixture(true), row = task('unicode', null);
  row.values.subject = 'a'.repeat(179) + '💥'; row.values.due_date = 'b'.repeat(99) + '💥'; f.records = [row];
  const item = buildResponseQueue(f).items[0];
  assert.equal(item.label, 'a'.repeat(179)); assert.equal(item.label.length, 179);
  assert.equal(item.due.value, 'b'.repeat(99)); assert.equal(item.due.value!.length, 99);
  row.values.subject = null; row.id = 'c'.repeat(179) + '💥';
  assert.equal(buildResponseQueue(f).items[0].label, 'c'.repeat(179));
  row.values.subject = 'a'.repeat(178) + '💥'; assert.equal(buildResponseQueue(f).items[0].label, row.values.subject);
});
