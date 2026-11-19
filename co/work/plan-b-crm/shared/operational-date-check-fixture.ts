import { companyDay, companyWeek } from './operational-company.js';
import { dateCheckInput, dateCheckInputFormat, type DateCheckInput, type DateCheckRequest } from './operational-date-check.js';
import { inventoryFormat, type Inventory } from './operational-inventory.js';
import { operationalModel, type OperationalModel, type SourceRef } from './operational-twin.js';

// CASO «ALMACÉN SUR» de Comprobar una fecha (unidad CLAUDE-OPUS-DATE-CHECK-CORE). Ficción: proveedores «-fixture», cuentas «fixture-». No se siembra en la App.
//
// Parte de la empresa 12/3/2/20/8 de operational-company.ts (reloj: lunes 9/11/2026 08:00 Madrid) con CUATRO AJUSTES documentados, necesarios para que un oráculo
// pequeño pueda comprobar cada fila de la tabla de aceptación:
//   1. Cruz es la técnica habilitada para sistemas VRF (habilidad «vrf», declarada por coordinación). Nadie más la tiene.
//   2. Beto está de vacaciones el viernes 13 (declarado). Así la instalación 10 no puede pasar a Beto y liberar a Cruz sin más.
//   3. El ticket 07, sin duración conocida, se atiende en la cola de Beto y no en la de Cruz: la agenda de la técnica habilitada no contiene trabajo sin duración.
//   4. El pedido 20 pasa a ser la entrega de 8 equipos VRF del lunes 16: se prepara el lunes desde las 08:00 (Madrid), vence el lunes a las 16:00 y tiene 8 unidades reservadas.
//
// Hechos del caso (hora de Madrid):
//   Almacén Sur tiene 16 unidades del SKU sku-vrf-12k; 8 están reservadas para el pedido 20 del lunes. También tiene 6 unidades de sku-vrf-14k, NO compatibles.
//   Almacén Norte tiene 3 unidades del modelo B compatible (recuento parcial). Hay una reposición observada de 10 unidades para el martes 17 a las 09:00.
//   El proveedor Frioval podría aportar las 4 unidades que faltan; su fecha de llegada es DESCONOCIDA.
//   Solicitud: 12 equipos VRF para Oficinas Lumen, terminados el viernes 13 a las 16:00. El cliente da acceso desde el viernes a las 08:00. 6 h de trabajo + 30 min de viaje.
//   El viernes, Cruz termina la instalación 10 (protegida, vence ese día) a las 10:45: le quedan 315 min y la solicitud pide 390.
//   Cambios declarados: ceder 4 de las reservadas del pedido 20; que Frioval confirme el jueves 12 a las 10:00; que Cruz vuelva de la formación el jueves 12 a las 13:00.

const NOW = '2026-11-09T07:00:00Z';
const ref = (provider: string, accountId: string, kind: string, remoteId: string): SourceRef => ({ provider, accountId, kind, remoteId });
const erp = (kind: string, remoteId: string) => ref('erp-fixture', 'fixture-erp-sur', kind, remoteId);
const purchasing = (remoteId: string) => ref('purchasing-fixture', 'fixture-compras', 'purchase-order', remoteId);
const observedErp = (source: SourceRef, observedAt = '2026-11-09T06:30:00Z', coverage: 'complete' | 'partial' = 'complete') =>
  ({ basis: 'observed' as const, source, sourceRevision: 'erp-r812', observedAt, coverage });
const declared = (by: string) => ({ basis: 'declared' as const, by, declaredAt: '2026-11-09T06:45:00Z' });
const coordination = declared('Coordinación (ficción)');

export const ALMACEN_SUR = {
  requestId: 'req-lumen-12', sku: 'sku-vrf-12k', warehouse: 'almacen-sur', technician: 'tech-cruz',
  protected: ['c-i10', 'c-o20'] as const,
  offers: { reserved: 'o-reservadas-4', arrival: 'o-frioval-jueves', slot: 'o-franja-cruz-jueves' } as const,
  scenarios: { supplierFriday: 's-frioval-viernes', noSlot: 's-sin-franja' } as const,
  times: {
    requested: companyDay(13, 15), windowStart: companyDay(13, 7), restock: companyDay(17, 8),
    supplierThursday: companyDay(12, 9), slotStart: companyDay(12, 12), slotEnd: companyDay(12, 15), supplierFriday: companyDay(13, 10),
  },
} as const;

// La empresa con los cuatro ajustes. Sigue teniendo 12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos y 8 tickets.
export function almacenSurCompany(): OperationalModel {
  const model = structuredClone(companyWeek());
  const cruz = model.resources.find(item => item.id === 'tech-cruz')!;
  cruz.skills = [...cruz.skills, 'vrf'];
  const beto = model.resources.find(item => item.id === 'tech-beto')!;
  if (beto.windows.state === 'known') beto.windows = { state: 'known', value: beto.windows.value.filter(item => !item.start.startsWith('2026-11-13')), provenance: coordination };
  const o20 = model.jobs.find(item => item.id === 'o20')!;
  o20.title = 'Preparar el pedido 20 · 8 equipos VRF (Climatec, ficción)';
  o20.earliestStart = companyDay(16, 7);
  const c20 = model.commitments.find(item => item.id === 'c-o20')!;
  c20.title = 'Entrega del lunes · Pedido 20 (8 equipos VRF)'; c20.dueAt = companyDay(16, 15);
  const plan = model.currentPlan!.plan.sequences;
  const seq = (resourceId: string) => plan.find(item => item.resourceId === resourceId)!;
  seq('tech-cruz').jobIds = seq('tech-cruz').jobIds.filter(item => item !== 't07');
  seq('tech-beto').jobIds = [...seq('tech-beto').jobIds, 't07'];
  seq('almacen-sur').jobIds = [...seq('almacen-sur').jobIds.filter(item => item !== 'o20'), 'o20'];
  return operationalModel.parse(model);
}

export function almacenSurInventory(): Inventory {
  return {
    format: inventoryFormat,
    skus: [
      { id: 'sku-vrf-12k', title: 'Unidad interior VRF 12 kBTU' },
      { id: 'sku-vrf-12k-b', title: 'Unidad interior VRF 12 kBTU · modelo B' },
      { id: 'sku-vrf-14k', title: 'Unidad interior VRF 14 kBTU' },
    ],
    // Solo el modelo B sustituye al 12k. El 14k tiene un nombre parecido y NO es compatible.
    compatibility: [{ sku: 'sku-vrf-12k', substitute: 'sku-vrf-12k-b', provenance: declared('Ingeniería (ficción)') }],
    lots: [
      { id: 'lot-sur-12k', sku: 'sku-vrf-12k', warehouseId: 'almacen-sur', source: erp('stock', 'SUR-VRF12K'), quantity: { state: 'known', value: 16, provenance: observedErp(erp('stock', 'SUR-VRF12K')) } },
      { id: 'lot-sur-14k', sku: 'sku-vrf-14k', warehouseId: 'almacen-sur', source: erp('stock', 'SUR-VRF14K'), quantity: { state: 'known', value: 6, provenance: observedErp(erp('stock', 'SUR-VRF14K')) } },
      { id: 'lot-norte-12k-b', sku: 'sku-vrf-12k-b', warehouseId: 'almacen-norte', source: ref('erp-fixture', 'fixture-erp-norte', 'stock', 'NOR-VRF12KB'),
        quantity: { state: 'known', value: 3, provenance: { basis: 'observed', source: ref('erp-fixture', 'fixture-erp-norte', 'stock', 'NOR-VRF12KB'), sourceRevision: 'erp-n77', observedAt: '2026-11-09T06:30:00Z', coverage: 'partial' } } },
    ],
    inbound: [
      { id: 'in-frioval-4', title: 'Frioval · 4 unidades (fecha sin confirmar)', sku: 'sku-vrf-12k', warehouseId: 'almacen-sur', source: purchasing('PO-77120'),
        quantity: { state: 'known', value: 4, provenance: { basis: 'observed', source: purchasing('PO-77120'), sourceRevision: 'po-r3', observedAt: '2026-11-09T06:40:00Z', coverage: 'complete' } },
        arrival: { state: 'unknown', reason: 'not-provided' } },
      { id: 'in-reposicion-10', title: 'Reposición semanal · 10 unidades', sku: 'sku-vrf-12k', warehouseId: 'almacen-sur', source: purchasing('PO-77098'),
        quantity: { state: 'known', value: 10, provenance: { basis: 'observed', source: purchasing('PO-77098'), sourceRevision: 'po-r9', observedAt: '2026-11-09T06:40:00Z', coverage: 'complete' } },
        arrival: { state: 'known', value: ALMACEN_SUR.times.restock, provenance: { basis: 'observed', source: purchasing('PO-77098'), sourceRevision: 'po-r9', observedAt: '2026-11-09T06:40:00Z', coverage: 'complete' } } },
    ],
    demands: [
      { id: 'd-o20', jobId: 'o20', sku: 'sku-vrf-12k', warehouseId: 'almacen-sur', quantity: { state: 'known', value: 8, provenance: observedErp(erp('reservation', 'RES-2020')) },
        reservation: { id: 'res-o20', source: erp('reservation', 'RES-2020'), provenance: observedErp(erp('reservation', 'RES-2020')) } },
    ],
  };
}

export function lumenRequest(overrides: Partial<DateCheckRequest> = {}): DateCheckRequest {
  return {
    id: ALMACEN_SUR.requestId, title: 'Instalar 12 equipos VRF · Oficinas Lumen (ficción)', source: ref('crm-fixture', 'fixture-crm', 'deal', 'deal-lumen-12'),
    requestedAt: ALMACEN_SUR.times.requested,
    window: { start: ALMACEN_SUR.times.windowStart, end: null },
    duration: { state: 'known', value: 360, provenance: declared('Comercial (ficción)') },
    travel: { state: 'known', value: 30, provenance: declared('Estimación de ruta (ficción)') },
    skills: ['vrf'],
    materials: [{ sku: ALMACEN_SUR.sku, warehouseId: ALMACEN_SUR.warehouse, quantity: { state: 'known', value: 12, provenance: declared('Comercial (ficción)') } }],
    requestedBy: declared('Comercial (ficción)'),
    ...overrides,
  };
}

export function almacenSurCase(): DateCheckInput {
  return dateCheckInput.parse({
    format: dateCheckInputFormat,
    base: almacenSurCompany(),
    inventory: almacenSurInventory(),
    request: lumenRequest(),
    policy: { protected: [...ALMACEN_SUR.protected], tiers: [] },
    offers: [
      { id: ALMACEN_SUR.offers.reserved, type: 'use-reserved', label: 'Usar 4 de las unidades reservadas para el pedido 20', reservationId: 'res-o20', quantity: 4 },
      { id: ALMACEN_SUR.offers.arrival, type: 'confirm-arrival', label: 'Frioval confirma las 4 unidades para el jueves 12 a las 10:00', inboundId: 'in-frioval-4', arrivalAt: ALMACEN_SUR.times.supplierThursday },
      { id: ALMACEN_SUR.offers.slot, type: 'add-slot', label: 'Cruz vuelve de la formación el jueves 12 a las 13:00', resourceId: 'tech-cruz', start: ALMACEN_SUR.times.slotStart, end: ALMACEN_SUR.times.slotEnd, provenance: coordination },
    ],
    scenarios: [
      { id: ALMACEN_SUR.scenarios.supplierFriday, label: 'Frioval entrega el viernes 13 a las 11:00', changes: [{ type: 'arrival', inboundId: 'in-frioval-4', arrivalAt: ALMACEN_SUR.times.supplierFriday }] },
      { id: ALMACEN_SUR.scenarios.noSlot, label: 'La formación de Cruz no se puede recortar', changes: [{ type: 'withdraw-offer', offerId: ALMACEN_SUR.offers.slot }] },
    ],
  });
}

// Revisión POSTERIOR: coordinación retira la franja del jueves (la formación no se puede recortar). Es otra revisión de entrada, no un escenario.
export function almacenSurWithoutSlot(): DateCheckInput {
  const input = almacenSurCase();
  return dateCheckInput.parse({ ...input, offers: input.offers.filter(item => item.id !== ALMACEN_SUR.offers.slot), scenarios: input.scenarios.filter(item => item.id !== ALMACEN_SUR.scenarios.noSlot) });
}

// Tres pedidos más sobre la misma empresa, sin cambios declarados.
// Cabe desde el principio: 6 equipos, acceso desde el martes 17, para el miércoles 18 a las 16:00.
export function fitsCase(): DateCheckInput {
  const input = almacenSurCase();
  return dateCheckInput.parse({
    ...input, offers: [], scenarios: [],
    request: lumenRequest({
      id: 'req-nara-6', title: 'Instalar 6 equipos VRF · Clínica Nara (ficción)', source: ref('crm-fixture', 'fixture-crm', 'deal', 'deal-nara-6'),
      requestedAt: companyDay(18, 15), window: { start: companyDay(17, 7), end: null },
      duration: { state: 'known', value: 240, provenance: declared('Comercial (ficción)') },
      materials: [{ sku: ALMACEN_SUR.sku, warehouseId: ALMACEN_SUR.warehouse, quantity: { state: 'known', value: 6, provenance: declared('Comercial (ficción)') } }],
    }),
  });
}
// Condicionado por una señal ausente: la duración depende de una visita técnica que aún no se ha hecho.
export function missingSignalCase(): DateCheckInput {
  const input = almacenSurCase();
  return dateCheckInput.parse({
    ...input, offers: [], scenarios: [],
    request: lumenRequest({
      id: 'req-faro-4', title: 'Ampliación VRF · Hotel Faro, anexo (ficción)', source: ref('crm-fixture', 'fixture-crm', 'deal', 'deal-faro-4'),
      requestedAt: companyDay(16, 15), duration: { state: 'unknown', reason: 'not-provided' },
      materials: [{ sku: ALMACEN_SUR.sku, warehouseId: ALMACEN_SUR.warehouse, quantity: { state: 'known', value: 4, provenance: declared('Comercial (ficción)') } }],
    }),
  });
}
// Inviable dentro del horizonte: 2.900 min de trabajo habilitado; Cruz, la única habilitada, tiene 2.880 min entre el viernes 13 y el final del horizonte.
export function infeasibleCase(): DateCheckInput {
  const input = almacenSurCase();
  return dateCheckInput.parse({
    ...input, offers: [], scenarios: [],
    request: lumenRequest({
      id: 'req-delta-obra', title: 'Obra VRF completa · Edificio Delta (ficción)', source: ref('crm-fixture', 'fixture-crm', 'deal', 'deal-delta'),
      requestedAt: companyDay(20, 15), duration: { state: 'known', value: 2900, provenance: declared('Comercial (ficción)') },
      materials: [{ sku: ALMACEN_SUR.sku, warehouseId: ALMACEN_SUR.warehouse, quantity: { state: 'known', value: 4, provenance: declared('Comercial (ficción)') } }],
    }),
  });
}
export const almacenSurNow = NOW;
