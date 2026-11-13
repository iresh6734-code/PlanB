import { z } from 'zod';
import { companyDay } from './operational-company.js';
import { dateCheckInput, type DateCheckInput } from './operational-date-check.js';
import { ALMACEN_SUR, almacenSurCase, almacenSurWithoutSlot, lumenRequest } from './operational-date-check-fixture.js';
import { poolKey } from './operational-inventory.js';
import { dateCheckForm, dateCheckMaterials, madridDayAt, type DateCheckForm } from './date-check-api.js';

export { dateCheckForm, dateCheckMaterials, dateCheckSkills, isoToMadridLocal, madridDayAt, madridLocalToIso, type DateCheckForm } from './date-check-api.js';

// DEMOSTRACIÓN DE «COMPROBAR UNA FECHA» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). Ficción: la empresa 12/3/2/20/8 con el caso Almacén Sur (operational-date-check-fixture).
// La persona solo indica trabajo, fecha pedida, duración, habilidad y material. El resto (cartera, existencias, reservas, cambios declarados y escenarios) es del caso.
// El estado de la demostración tiene su propia revisión: «coordinación retira la franja del jueves» es una revisión POSTERIOR de la entrada, no un escenario.
// Reloj del caso: lunes 9/11/2026 08:00 (Madrid). Es fijo: reiniciar no lo mueve.

export const dateCheckDemoState = z.object({
  format: z.literal('planb-date-check-demo-state-v1'),
  revision: z.number().int().min(1).max(1000),
  slotWithdrawn: z.boolean(),
  changedAt: z.iso.datetime().nullable(),
}).strict();
export type DateCheckDemoState = z.infer<typeof dateCheckDemoState>;
export const initialDemoState = (): DateCheckDemoState => ({ format: 'planb-date-check-demo-state-v1', revision: 1, slotWithdrawn: false, changedAt: null });

export const DEMO = {
  week: { start: companyDay(9, 7), end: companyDay(20, 15) },
  // Valores por defecto del formulario: la solicitud de Oficinas Lumen.
  defaults: (): DateCheckForm => ({ title: 'Instalar 12 equipos VRF · Oficinas Lumen', requestedAt: new Date(ALMACEN_SUR.times.requested).toISOString(), durationMinutes: 360, skill: 'vrf', materialKey: poolKey('almacen-sur', 'sku-vrf-12k'), quantity: 12 }),
  requestId: 'solicitud-nueva',
  travelMinutes: 30,
} as const;

export class DemoFormError extends Error {}

// Entrada exacta del motor para un formulario y un estado. Los cambios declarados del caso solo se ofrecen si afectan a esta solicitud.
export function demoInput(form: DateCheckForm, state: DateCheckDemoState): DateCheckInput {
  const value = dateCheckForm.parse(form), base = state.slotWithdrawn ? almacenSurWithoutSlot() : almacenSurCase();
  const now = Date.parse(base.base.clock.now), horizon = Date.parse(base.base.clock.horizonEnd), requested = Date.parse(value.requestedAt);
  if (requested <= now || requested > horizon) throw new DemoFormError('La fecha pedida tiene que estar dentro de la semana de ensayo.');
  // El cliente da acceso desde las 08:00 del día pedido (o desde ahora, si es hoy).
  const windowStart = new Date(Math.max(now, Date.parse(madridDayAt(value.requestedAt, 8)))).toISOString();
  const material = dateCheckMaterials.find(item => item.key === value.materialKey);
  const declared = { basis: 'declared' as const, by: 'Comercial (ficción)', declaredAt: base.base.clock.now };
  const request = lumenRequest({
    id: DEMO.requestId, title: value.title, source: null, requestedAt: value.requestedAt, window: { start: windowStart, end: null },
    duration: value.durationMinutes === null ? { state: 'unknown', reason: 'not-provided' } : { state: 'known', value: value.durationMinutes, provenance: declared },
    travel: { state: 'known', value: DEMO.travelMinutes, provenance: { basis: 'declared', by: 'Estimación de ruta (ficción)', declaredAt: base.base.clock.now } },
    skills: [value.skill],
    materials: material && value.quantity > 0 ? [{ sku: material.sku, warehouseId: material.warehouseId, quantity: { state: 'known', value: value.quantity, provenance: declared } }] : [],
    requestedBy: declared,
  });
  const pools = new Set(request.materials.map(item => poolKey(item.warehouseId, item.sku)));
  const capable = new Set(base.base.resources.filter(item => item.executesJobs && item.skills.includes(value.skill)).map(item => item.id));
  const offers = base.offers.filter(offer => {
    if (offer.type === 'use-reserved') { const demand = base.inventory.demands.find(item => item.reservation?.id === offer.reservationId); return !!demand && pools.has(poolKey(demand.warehouseId, demand.sku)); }
    if (offer.type === 'confirm-arrival') { const entry = base.inventory.inbound.find(item => item.id === offer.inboundId); return !!entry && pools.has(poolKey(entry.warehouseId, entry.sku)); }
    if (offer.type === 'add-slot') return capable.has(offer.resourceId);
    return false;
  });
  const offerIds = new Set(offers.map(item => item.id));
  const scenarios = base.scenarios.filter(scenario => scenario.changes.every(change => change.type !== 'withdraw-offer' || offerIds.has(change.offerId))
    && scenario.changes.some(change => change.type !== 'arrival' || offers.some(offer => offer.type === 'confirm-arrival' && offer.inboundId === change.inboundId)));
  return dateCheckInput.parse({ ...base, request, offers, scenarios });
}
