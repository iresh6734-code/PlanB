import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanDowntime, coveredHours, dealsClosing, DOWNTIME_LIMITS, downtimeCost, formatEuros, formatHours } from '../shared/downtime-cost.js';

// N3 · Coste de una caída: cifras orientativas que escribe la persona y horas cubiertas por una copia al día.
test('N3 · comerciales × horas × coste por hora, más lo que está en juego', () => {
  assert.deepEqual(downtimeCost({ sellers: 5, hours: 4, hourlyCost: 35, deals: 2, dealAmount: 3000 }), { teamHours: 20, teamCost: 700, deals: 2, atStake: 6000 });
  assert.deepEqual(downtimeCost({ sellers: 3, hours: 1.5, hourlyCost: 40 }), { teamHours: 4.5, teamCost: 180, deals: DOWNTIME_LIMITS.deals.initial, atStake: DOWNTIME_LIMITS.deals.initial * DOWNTIME_LIMITS.dealAmount.initial });
  assert.match(formatEuros(6000.4), /^6\.?000\s€$/);
  assert.match(formatEuros(1234567), /^1\.234\.567\s€$/);
  assert.equal(formatHours(1), '1 hora');
  assert.equal(formatHours(4.5), '4,5 horas');
});

test('N3 · lo que escribe el visitante se recorta y lo ilegible vuelve al valor inicial', () => {
  assert.deepEqual(cleanDowntime({ sellers: '0', hours: 999, hourlyCost: -5, deals: 2.6, dealAmount: 'mucho' }),
    { sellers: 1, hours: 72, hourlyCost: 0, deals: 3, dealAmount: DOWNTIME_LIMITS.dealAmount.initial });
  assert.equal(cleanDowntime({ hourlyCost: '37,5' }).hourlyCost, 37.5, 'admite la coma decimal');
  assert.equal(cleanDowntime({ sellers: Number.NaN }).sellers, DOWNTIME_LIMITS.sellers.initial);
  assert.equal(cleanDowntime({ hours: Infinity }).hours, DOWNTIME_LIMITS.hours.initial);
});

test('N3 · oportunidades abiertas que cierran en la ventana, con su importe', () => {
  const deals = [
    { close: '2026-11-20', open: true, amount: 1000 }, { close: '2026-11-21T10:00:00Z', open: true, amount: 500 },
    { close: '2026-11-20', open: false, amount: 9000 }, { close: '2026-11-22', open: true, amount: 7 },
    { close: null, open: true, amount: 4 }, { close: '2026-11-20', open: true, amount: null }, { close: 'mañana', open: true, amount: 3 },
  ];
  assert.deepEqual(dealsClosing(deals, '2026-11-20', '2026-11-21'), { count: 3, amount: 1500 });
  assert.deepEqual(dealsClosing([], '2026-11-20', '2026-11-20'), { count: 0, amount: 0 });
});

test('N3 · horas del periodo con una copia de menos de 75 minutos, sin contar dos veces los solapes', () => {
  const from = new Date('2026-11-20T08:00:00Z'), to = new Date('2026-11-20T12:00:00Z');
  const at = (time: string) => ({ at: '2026-11-20T' + time + ':00Z' });
  assert.deepEqual(coveredHours([], from, to), { hours: 0, total: 4, ratio: 0 });
  const hourly = coveredHours([at('08:00'), at('09:00'), at('10:00'), at('11:00')], from, to);
  assert.equal(hourly.hours, 4, 'una captura por hora cubre el periodo entero');
  assert.equal(hourly.ratio, 1);
  const gap = coveredHours([at('08:00'), at('10:30')], from, to);
  assert.equal(gap.hours, 2.5, '75 min + 75 min, sin solape');
  const before = coveredHours([{ at: '2026-11-20T07:30:00Z' }, { at: 'roto' }], from, to);
  assert.equal(before.hours, 0.8, 'una captura anterior al periodo cubre solo lo que le queda de vigencia (45 min)');
  assert.equal(coveredHours([at('11:30')], from, to).hours, 0.5, 'se recorta al final del periodo');
});
