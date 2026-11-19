import assert from 'node:assert/strict';
import test from 'node:test';
import { anyDrillPassed, firstRunPlan } from '../src/app-shell/first-run.js';

const base = { protectedAccess: false, hasCopy: false, drillPassed: false, passportSeen: false };

test('el primer uso empieza por proteger y estima los diez minutos', () => {
  const plan = firstRunPlan(base);
  assert.deepEqual(plan.steps.map(step => step.id), ['protect', 'copy', 'drill', 'passport']);
  assert.equal(plan.current, 'protect');
  assert.equal(plan.minutesLeft, 10);
  assert.equal(plan.progress, '0 de 4 · quedan unos 10 minutos');
  assert.equal(plan.steps.find(step => step.id === 'drill')?.ready, false);
});

test('la prueba espera a la copia y el pasaporte exige una prueba superada', () => {
  const plan = firstRunPlan({ ...base, protectedAccess: true, hasCopy: true, passportSeen: true });
  assert.equal(plan.current, 'drill');
  assert.equal(plan.done, 2);
  assert.equal(plan.percent, 50);
  const passport = plan.steps.find(step => step.id === 'passport');
  assert.equal(passport?.done, false);
  assert.equal(passport?.ready, false);
  assert.equal(plan.progress, '2 de 4 · quedan unos 5 minutos');
});

test('todo hecho cierra los primeros pasos', () => {
  const plan = firstRunPlan({ protectedAccess: true, hasCopy: true, drillPassed: true, passportSeen: true });
  assert.equal(plan.complete, true);
  assert.equal(plan.current, null);
  assert.equal(plan.minutesLeft, 0);
  assert.equal(plan.progress, 'Primeros pasos completados');
});

test('basta un simulacro superado de cualquier captura', () => {
  assert.equal(anyDrillPassed(null), false);
  assert.equal(anyDrillPassed({ reports: [] } as never), false);
  assert.equal(anyDrillPassed({ reports: [{ passed: false }, { passed: true }] } as never), true);
});
