import assert from 'node:assert/strict';
import test from 'node:test';
import { allocate, checkBalances, inventory, inventoryFormat, isCompatible, resolveInventory, type Claim, type Supply } from '../shared/operational-inventory.js';
import { almacenSurInventory } from '../shared/operational-date-check-fixture.js';

const supplies: Supply[] = [
  { id: 'lot', pool: 'sur/a', at: 0, quantity: 16, kind: 'lot' },
  { id: 'tue', pool: 'sur/a', at: 100, quantity: 10, kind: 'inbound' },
];

test('las reservas protegidas se asignan antes que la solicitud y protegen su cantidad en su instante de necesidad', () => {
  const claims: Claim[] = [
    { key: 'req', demandId: 'req', pool: 'sur/a', quantity: 12, need: 10, cls: 'request' },
    { key: 'res', demandId: 'res', pool: 'sur/a', quantity: 8, need: 50, cls: 'protected' },
  ];
  const result = allocate(claims, supplies, [], 500);
  const res = result.find(item => item.key === 'res')!, req = result.find(item => item.key === 'req')!;
  assert.equal(res.at, 50);
  // 16 − 8 reservadas el minuto 50 dejan 8 libres: la solicitud de 12 espera a la reposición del minuto 100.
  assert.equal(req.at, 100); assert.equal(req.enabledBy, 'tue'); assert.equal(req.shortAtNeed, 4);
});

test('una reposición conocida antes de la necesidad de la reserva permite usar unidades reservadas sin dejarla corta', () => {
  const claims: Claim[] = [
    { key: 'req', demandId: 'req', pool: 'sur/a', quantity: 12, need: 10, cls: 'request' },
    { key: 'res', demandId: 'res', pool: 'sur/a', quantity: 8, need: 150, cls: 'protected' },
  ];
  const req = allocate(claims, supplies, [], 500).find(item => item.key === 'req')!;
  assert.equal(req.at, 10, 'la reposición del minuto 100 llega antes del minuto 150 de la reserva');
  assert.deepEqual(checkBalances(supplies, [{ demandId: 'req', pool: 'sur/a', quantity: 12, at: 10 }, { demandId: 'res', pool: 'sur/a', quantity: 8, at: 150 }]), []);
});

test('la parte cedida de una reserva va por detrás de la solicitud y su espera queda a la vista', () => {
  const claims: Claim[] = [
    { key: 'res', demandId: 'res', pool: 'sur/a', quantity: 4, need: 50, cls: 'protected' },
    { key: 'res#cedida', demandId: 'res', pool: 'sur/a', quantity: 4, need: 50, cls: 'released' },
    { key: 'req', demandId: 'req', pool: 'sur/a', quantity: 12, need: 10, cls: 'request' },
  ];
  const result = allocate(claims, supplies, [], 500);
  assert.equal(result.find(item => item.key === 'req')!.at, 10);
  const ceded = result.find(item => item.key === 'res#cedida')!;
  assert.equal(ceded.at, 100); assert.equal(ceded.enabledBy, 'tue');
});

test('sin fecha conocida que alcance, una entrada desconocida deja la demanda «short»; sin ninguna posible es «impossible»', () => {
  const claims: Claim[] = [{ key: 'req', demandId: 'req', pool: 'sur/a', quantity: 30, need: 0, cls: 'request' }];
  assert.equal(allocate(claims, supplies, [{ id: 'frioval', pool: 'sur/a', quantity: 4, at: null }], 500)[0].state, 'short');
  assert.equal(allocate(claims, supplies, [{ id: 'frioval', pool: 'sur/a', quantity: 2, at: null }], 500)[0].state, 'impossible');
  assert.equal(allocate(claims, supplies, [{ id: 'sin-cantidad', pool: 'sur/a', quantity: null, at: 20 }], 500)[0].state, 'short');
  // Una llegada conocida pero fuera del horizonte no cuenta.
  assert.equal(allocate([{ key: 'r', demandId: 'r', pool: 'sur/a', quantity: 20, need: 0, cls: 'request' }], supplies, [], 99)[0].state, 'impossible');
});

test('el orden de entrada de los arrays no cambia la asignación', () => {
  const claims: Claim[] = [
    { key: 'a', demandId: 'a', pool: 'sur/a', quantity: 5, need: 0, cls: 'protected' },
    { key: 'b', demandId: 'b', pool: 'sur/a', quantity: 9, need: 0, cls: 'protected' },
    { key: 'c', demandId: 'c', pool: 'sur/a', quantity: 9, need: 5, cls: 'request' },
  ];
  const once = allocate(claims, supplies, [], 500), again = allocate([...claims].reverse(), [...supplies].reverse(), [], 500);
  assert.deepEqual(again, once);
});

test('el saldo detecta un consumo doble y un consumo antes de la llegada', () => {
  assert.equal(checkBalances(supplies, [{ demandId: 'x', pool: 'sur/a', quantity: 16, at: 0 }, { demandId: 'y', pool: 'sur/a', quantity: 1, at: 5 }]).length, 1);
  assert.equal(checkBalances(supplies, [{ demandId: 'x', pool: 'sur/a', quantity: 20, at: 99 }]).length, 1);
  // En el mismo instante entran antes las llegadas que los consumos.
  assert.deepEqual(checkBalances(supplies, [{ demandId: 'x', pool: 'sur/a', quantity: 26, at: 100 }]), []);
});

test('la identidad de fuente incluye la cuenta: mismo ID remoto en otra cuenta son dos lotes; la misma identidad dos veces se rechaza', () => {
  const base = almacenSurInventory();
  const twin = structuredClone(base.lots[0]);
  twin.id = 'lot-sur-12k-cuenta-b'; twin.source = { ...twin.source!, accountId: 'fixture-erp-sur-b' };
  if (twin.quantity.state === 'known') twin.quantity = { ...twin.quantity, value: 2 };
  const both = inventory.parse({ ...base, lots: [...base.lots, twin] });
  const resolved = resolveInventory(both, Date.parse('2026-11-09T07:00:00Z'), 1440, iso => Math.ceil((Date.parse(iso) - Date.parse('2026-11-09T07:00:00Z')) / 60_000));
  assert.equal(resolved.supplies.filter(item => item.pool === 'almacen-sur/sku-vrf-12k' && item.kind === 'lot').reduce((sum, item) => sum + item.quantity, 0), 18);
  const duplicate = structuredClone(twin); duplicate.id = 'otro'; duplicate.source = base.lots[0].source;
  assert.equal(inventory.safeParse({ ...base, lots: [...base.lots, duplicate] }).success, false);
});

test('la compatibilidad es solo la declarada y es dirigida', () => {
  const value = almacenSurInventory();
  assert.equal(isCompatible(value, 'sku-vrf-12k', 'sku-vrf-12k-b'), true);
  assert.equal(isCompatible(value, 'sku-vrf-12k', 'sku-vrf-14k'), false, 'nombre parecido no es compatibilidad');
  assert.equal(isCompatible(value, 'sku-vrf-12k-b', 'sku-vrf-12k'), false, 'la compatibilidad declarada no es simétrica');
  assert.equal(inventory.safeParse({ ...value, compatibility: [...value.compatibility, { sku: 'sku-vrf-12k', substitute: 'sku-inexistente', provenance: value.compatibility[0].provenance }] }).success, false);
});

test('existencias desconocidas no valen cero ni infinito, y la evidencia parcial o antigua conserva su estado', () => {
  const value = almacenSurInventory();
  value.lots[0].quantity = { state: 'unknown', reason: 'source-unavailable' };
  const now = Date.parse('2026-11-09T07:00:00Z');
  const resolved = resolveInventory(inventory.parse(value), now, 60, iso => Math.ceil((Date.parse(iso) - now) / 60_000));
  assert.equal(resolved.supplies.some(item => item.id === 'lot-sur-12k'), false);
  assert.deepEqual(resolved.potential.find(item => item.id === 'lot-sur-12k'), { id: 'lot-sur-12k', pool: 'almacen-sur/sku-vrf-12k', quantity: null, at: 0 });
  const partial = resolved.evidence.find(item => item.subject === 'lot-norte-12k-b')!;
  assert.equal(partial.partial, true);
  // Observado hace 30 min con umbral de 60: no es antiguo. Con umbral de 10, sí.
  assert.equal(resolved.evidence.find(item => item.subject === 'lot-sur-14k')!.stale, false);
  const strict = resolveInventory(inventory.parse(value), now, 10, iso => Math.ceil((Date.parse(iso) - now) / 60_000));
  assert.equal(strict.evidence.find(item => item.subject === 'lot-sur-14k')!.stale, true);
  assert.equal(inventory.safeParse({ ...value, format: inventoryFormat }).success, true);
});
