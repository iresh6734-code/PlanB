import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, monthLabel, stageProbabilities, weightedForecast } from '../src/app-shell/forecast.js';

test('la probabilidad sale del porcentaje del nombre de la etapa o, si no lo hay, de su orden', () => {
  const byOrder = stageProbabilities([{ id: 'a', label: 'Calificada' }, { id: 'b', label: 'Propuesta' }, { id: 'c', label: 'Negociación' }]);
  assert.deepEqual(byOrder.map(s => [s.probability, s.source]), [[0.25, 'position'], [0.5, 'position'], [0.75, 'position']]);
  const written = stageProbabilities([{ id: 'a', label: 'Demo (20%)' }, { id: 'b', label: 'Propuesta 62,5 %' }, { id: 'c', label: 'Raro 150%' }]);
  assert.deepEqual(written.map(s => [s.probability, s.source]), [[0.2, 'label'], [0.625, 'label'], [0.75, 'position']]);
});

test('reparte por mes de Madrid con comprometido, probable y optimista, y separa vencidas, lejanas y sin fecha', () => {
  const probabilities = stageProbabilities([{ id: 'low', label: 'Inicial 20 %' }, { id: 'high', label: 'Cierre 80 %' }]);
  const forecast = weightedForecast([
    { stageId: 'low', amount: 1000, close: '2026-11-25' },
    { stageId: 'high', amount: 500, close: '2026-11-30T23:30:00Z' },
    { stageId: 'high', amount: 2000, close: '2026-12-10' },
    { stageId: 'low', amount: null, close: '2027-01-05' },
    { stageId: 'high', amount: 300, close: '2026-11-02' },
    { stageId: 'low', amount: 400, close: '2027-03-01' },
    { stageId: 'high', amount: 900, close: '' },
    { stageId: 'won', amount: 99999, close: '2026-11-20' },
  ], probabilities, '2026-11-19');
  assert.deepEqual(forecast.months.map(m => m.month), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(forecast.months.map(m => m.label), ['Noviembre', 'Diciembre', 'Enero']);
  const [nov, dec, jan] = forecast.months;
  assert.equal(nov!.deals, 1, 'el 30/11 23:30 UTC ya es 1 de diciembre en Madrid');
  assert.deepEqual([nov!.committed, nov!.probable, nov!.optimistic], [0, 200, 1000]);
  assert.deepEqual([dec!.deals, dec!.committed, dec!.probable, dec!.optimistic], [2, 2500, 2000, 2500]);
  assert.deepEqual([jan!.deals, jan!.missingAmount, jan!.optimistic], [1, 1, 0]);
  assert.deepEqual([forecast.late.deals, forecast.late.probable], [1, 240]);
  assert.deepEqual([forecast.later.deals, forecast.undated.deals], [1, 1]);
  assert.equal(forecast.total.deals, 7, 'las etapas sin probabilidad (ganadas, perdidas) no cuentan');
  assert.equal(forecast.total.optimistic, 1000 + 500 + 2000 + 300 + 400 + 900);
});

test('los meses cruzan el año sin desbordarse', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-11', 14), '2028-01');
  assert.equal(monthLabel('2027-02'), 'Febrero');
});
