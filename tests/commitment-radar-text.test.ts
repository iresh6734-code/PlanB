import test from 'node:test';
import assert from 'node:assert/strict';
import { causeText, dirty, emptyDraft, providerLabel, toLocalInput } from '../src/commitment-radar-text.js';

test('la causa nombra el rol afectado en minúsculas solo cuando lo hay', () => {
  assert.equal(causeText({ cause: 'source-blocked', affectedRole: 'delivery' }), 'Una fuente observó un bloqueo (entrega)');
  assert.equal(causeText({ cause: 'closed-manual', affectedRole: null }), 'Cerrado manualmente por una persona');
});

test('un borrador solo cuenta como escrito si tiene texto de verdad o una fecha', () => {
  assert.equal(dirty(emptyDraft()), false);
  assert.equal(dirty({ ...emptyDraft(), owner: '   ', note: '\n' }), false);
  assert.equal(dirty({ ...emptyDraft(), due: '2026-11-20T10:00' }), true);
  assert.equal(dirty({ ...emptyDraft(), nextStep: 'Llamar' }), true);
  assert.notEqual(emptyDraft(), emptyDraft(), 'cada borrador vacío es un objeto nuevo');
});

test('la procedencia de un proveedor de ensayo nunca dice «conectado» y uno desconocido no se rotula', () => {
  assert.equal(providerLabel('hubspot-fixture'), 'HubSpot · datos de ensayo · no conectado');
  assert.equal(providerLabel('hubspot'), null);
});

test('la fecha para el campo datetime-local sale en hora local y con ceros', () => {
  const local = new Date(2026, 0, 5, 7, 3);
  assert.equal(toLocalInput(local.toISOString()), '2026-01-05T07:03');
});
