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
