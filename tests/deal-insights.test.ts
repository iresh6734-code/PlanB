import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeStatus, euros, stageKind } from '../src/app-shell/deal-insights.js';

test('tipo de etapa: ganada y perdida por nombre o identificador (también como llegan de HubSpot)', () => {
  assert.equal(stageKind({ id: 'won', label: 'Ganada' }), 'won');
  assert.equal(stageKind({ id: 'closedwon', label: 'Closed won' }), 'won');
  assert.equal(stageKind({ id: 'lost', label: 'Perdida' }), 'lost');
  assert.equal(stageKind({ id: 'closedlost', label: 'Closed lost' }), 'lost');
  assert.equal(stageKind({ id: 'proposal', label: 'Propuesta' }), 'open');
  assert.equal(stageKind(undefined), 'open');
});

test('estado del cierre: vencida, hoy, pronto, más adelante y sin fecha', () => {
  const today = '2026-11-17';
  assert.deepEqual(closeStatus('2026-11-01', today, 'open'), { label: 'Venció hace 16 días · 1 nov', tone: 'late' });
  assert.deepEqual(closeStatus('2026-11-16', today, 'open'), { label: 'Venció hace 1 día · 16 nov', tone: 'late' });
  assert.deepEqual(closeStatus('2026-11-17', today, 'open'), { label: 'Cierra hoy', tone: 'soon' });
  assert.deepEqual(closeStatus('2026-11-22', today, 'open'), { label: 'Cierra en 5 días · 22 nov', tone: 'soon' });
  assert.deepEqual(closeStatus('2026-12-20T10:00:00Z', today, 'open'), { label: 'Cierra el 20 dic', tone: 'ok' });
  assert.deepEqual(closeStatus(null, today, 'open'), { label: 'Sin fecha de cierre', tone: 'none' });
});

test('una oportunidad decidida no se marca como vencida', () => {
  assert.deepEqual(closeStatus('2026-01-01', '2026-11-17', 'won'), { label: 'Ganada', tone: 'won' });
  assert.deepEqual(closeStatus('2026-01-01', '2026-11-17', 'lost'), { label: 'Perdida', tone: 'lost' });
});

test('importes con separador de miles, como los totales', () => {
  assert.equal(euros(1200).replace(/\s/g, ' '), '1.200 €');
  assert.equal(euros('16650').replace(/\s/g, ' '), '16.650 €');
  assert.equal(euros(null).replace(/\s/g, ' '), '0 €');
});

import { dueStatus, initials } from '../src/app-shell/deal-insights.js';
test('fecha límite de una tarea: vencida, hoy, mañana, pronto, más adelante, sin fecha y hecha', () => {
  const today = '2026-11-18';
  assert.deepEqual(dueStatus('2026-11-15', today, false), { label: 'Venció hace 3 días · 15 nov', tone: 'late' });
  assert.deepEqual(dueStatus('2026-11-18', today, false), { label: 'Vence hoy', tone: 'soon' });
  assert.deepEqual(dueStatus('2026-11-19', today, false), { label: 'Vence mañana · 19 nov', tone: 'soon' });
  assert.deepEqual(dueStatus('2026-11-23', today, false), { label: 'Vence en 5 días · 23 nov', tone: 'soon' });
  assert.deepEqual(dueStatus('2026-12-30', today, false), { label: 'Vence el 30 dic', tone: 'ok' });
  assert.deepEqual(dueStatus('', today, false), { label: 'Sin fecha límite', tone: 'none' });
  assert.deepEqual(dueStatus('2026-01-01', today, true), { label: 'Hecha', tone: 'won' });
});

test('los resúmenes no muestran una fecha distinta cuando reciben un día imposible', () => {
  const today = '2026-03-01';
  for (const invalid of ['2026-02-30', '2026-99-01', '2026-03-01 texto', '2026-03-01T25:00:00Z']) {
    assert.deepEqual(closeStatus(invalid, today, 'open'), { label: 'Fecha de cierre no válida', tone: 'none' });
    assert.deepEqual(dueStatus(invalid, today, false), { label: 'Fecha límite no válida', tone: 'none' });
  }
  assert.deepEqual(dueStatus('2028-02-29', '2028-03-01', false), { label: 'Venció hace 1 día · 29 feb', tone: 'late' });
});

test('una fecha límite con hora usa el día de Madrid y una fecha sin hora conserva su día', () => {
  assert.deepEqual(dueStatus('2026-11-16T23:30:00Z', '2026-11-17', false), { label: 'Vence hoy', tone: 'soon' });
  assert.deepEqual(dueStatus('2026-11-16', '2026-11-17', false), { label: 'Venció hace 1 día · 16 nov', tone: 'late' });
  assert.deepEqual(dueStatus('2026-03-29T22:00:00Z', '2026-03-29', false), { label: 'Vence mañana · 30 mar', tone: 'soon' });
  assert.deepEqual(closeStatus('2026-11-16T23:30:00Z', '2026-11-17', 'open'), { label: 'Venció hace 1 día · 16 nov', tone: 'late' });
});
test('iniciales', () => {
  assert.equal(initials('Lucía Martín'), 'LM');
  assert.equal(initials('Forma & Fondo'), 'FF');
  assert.equal(initials('álvaro'), 'Á');
  assert.equal(initials('  '), '·');
});
