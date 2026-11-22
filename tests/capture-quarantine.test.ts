import test from 'node:test';
import assert from 'node:assert/strict';
import { assessShrink, shrinkText, snapshotCounts } from '../shared/capture-quarantine.js';

const AT = '2026-11-22T10:00:00.000Z';

test('cuarentena: un objeto que pierde más del 20 % o desaparece entero retiene la captura, por objeto y no por total', () => {
  const entry = assessShrink({ contacts: 120, companies: 30, deals: 45, tasks: 60 }, { contacts: 60, companies: 30, deals: 45, tasks: 60 }, AT)!;
  assert.deepEqual(entry.reasons, [{ entity: 'contacts', before: 120, after: 60 }]);
  assert.deepEqual(entry.total, { before: 255, after: 195 });
  assert.equal(shrinkText(entry), 'Clientes 120 → 60');
  const gone = assessShrink({ contacts: 100, companies: 3, deals: 10, tasks: 5 }, { contacts: 100, companies: 0, deals: 10, tasks: 5 }, AT)!;
  assert.deepEqual(gone.reasons, [{ entity: 'companies', before: 3, after: 0 }], 'desaparecer entero cuenta aunque fueran pocos');
});

test('cuarentena: pérdidas pequeñas, crecimiento y objetos pequeños no la disparan', () => {
  assert.equal(assessShrink({ contacts: 120, tasks: 60 }, { contacts: 100, tasks: 70 }, AT), null, '−17 % se acepta');
  assert.equal(assessShrink({ contacts: 8 }, { contacts: 3 }, AT), null, 'con menos de 10 previos solo cuenta llegar a cero');
  assert.equal(assessShrink({ contacts: 10 }, { contacts: 7 }, AT)?.reasons.length, 1, '10 → 7 es −30 %');
});

test('primera captura: solo se retiene si viene vacía', () => {
  assert.equal(assessShrink(null, { contacts: 5 }, AT), null);
  const empty = assessShrink(null, {}, AT)!;
  assert.deepEqual(empty.reasons, []);
  assert.equal(shrinkText(empty), 'La captura no trae ningún registro');
});

test('recuentos por objeto desde los registros de una captura', () => {
  assert.deepEqual(snapshotCounts({ records: [{ id: '1', entity: 'contacts', values: {} }, { id: '2', entity: 'contacts', values: {} }, { id: '3', entity: 'tasks', values: {} }] } as any), { contacts: 2, tasks: 1 });
});
