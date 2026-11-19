import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueInstant, dueReminders, reminderKey, reminderText } from '../src/app-shell/due-reminder.js';
import type { CrmRecord } from '../shared/model.js';

const task = (id: string, due: string | null, status = 'pending'): CrmRecord => ({ entity: 'tasks', id, values: { subject: id, due_date: due, status } });
const now = Date.parse('2026-11-19T10:00:00Z'), since = Date.parse('2026-11-19T09:30:00Z');
const options = { dueKey: 'due_date', isDone: (record: CrmRecord) => record.values.status === 'completed', now, since };

test('solo avisa de tareas con hora: un día sin hora o ilegible no avisa', () => {
  assert.equal(dueInstant('2026-11-19'), null);
  assert.equal(dueInstant('2026-11-19T10:05:00Z'), Date.parse('2026-11-19T10:05:00Z'));
  assert.equal(dueInstant('2026-13-45T99:99'), null);
  assert.equal(dueInstant(null), null);
});

test('ventana: desde el inicio de la sesión hasta dentro de 15 minutos, la más próxima primero', () => {
  const tasks = [
    task('lejos', '2026-11-19T10:16:00Z'), task('pronto', '2026-11-19T10:12:00Z'), task('justo', '2026-11-19T10:15:00Z'),
    task('vencio', '2026-11-19T09:45:00Z'), task('antes-sesion', '2026-11-19T09:20:00Z'), task('dia', '2026-11-19'),
    task('hecha', '2026-11-19T10:05:00Z', 'completed'), { entity: 'deals' as const, id: 'otra', values: { due_date: '2026-11-19T10:05:00Z' } },
  ];
  assert.deepEqual(dueReminders(tasks, options).map(item => item.record.id), ['vencio', 'pronto', 'justo']);
});

test('una sesión larga deja de recordar lo vencido hace más de una hora', () => {
  const late = now + 3 * 3_600_000;
  assert.deepEqual(dueReminders([task('a', '2026-11-19T11:30:00Z'), task('b', '2026-11-19T12:10:00Z')], { ...options, now: late }).map(item => item.record.id), ['b']);
});

test('lo descartado no vuelve, salvo que la tarea cambie de hora', () => {
  const [first] = dueReminders([task('a', '2026-11-19T10:10:00Z')], options);
  const dismissed = new Set([reminderKey(first)]);
  assert.equal(dueReminders([task('a', '2026-11-19T10:10:00Z')], { ...options, dismissed }).length, 0);
  assert.equal(dueReminders([task('a', '2026-11-19T10:12:00Z')], { ...options, dismissed }).length, 1);
});

test('texto: en N min, ahora y hace N min', () => {
  assert.equal(reminderText(now + 14.2 * 60_000, now), 'vence en 15 min');
  assert.equal(reminderText(now + 20_000, now), 'vence ahora');
  assert.equal(reminderText(now - 50_000, now), 'vence ahora');
  assert.equal(reminderText(now - 5.5 * 60_000, now), 'venció hace 5 min');
});
