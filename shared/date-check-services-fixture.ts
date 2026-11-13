import { dateCheckInput, dateCheckInputFormat, type DateCheckInput } from './operational-date-check.js';
import { inventoryFormat } from './operational-inventory.js';
import { servicesWeek } from './operational-services.js';
import { operationalModel, type SourceRef } from './operational-twin.js';

// SEGUNDO CASO DE NEGOCIO para Comprobar una fecha (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW): el estudio de servicios y proyectos de operational-services.ts.
// Mismo motor, mismo recorrido (comprobar → decidir → revisar), otro vocabulario:
//   capacidad    horas de las personas del equipo (Inés es la única con «análisis»)
//   aprobación   una entrada de cantidad 1 en el buzón de aprobaciones del CRM: hasta que llega, el trabajo no puede empezar. Su fecha viene de la fuente o es desconocida.
// Único ajuste al caso de Fable: se añade el buzón de aprobaciones como recurso que no ejecuta trabajos (el contrato de inventario exige un «almacén»). No cambia ningún plan.
//
// Solicitud: informe de arquitectura para el cliente E, entregado el miércoles 18 a las 17:00 (Madrid), 20 h de análisis, desde el lunes 16. Necesita que el cliente
// apruebe el alcance (fecha desconocida). Inés tiene 16 h entre el martes 09:00 y el miércoles 17:00.
// Cambios declarados: el cliente aprueba el martes 17 a las 09:00; Inés hace 4 h extra el martes de 17:00 a 21:00.

const ref = (provider: string, kind: string, remoteId: string): SourceRef => ({ provider, accountId: `fixture-${provider.replace('-fixture', '')}`, kind, remoteId });
const declared = (by: string) => ({ basis: 'declared' as const, by, declaredAt: '2026-11-09T07:45:00Z' });
export const SERVICES_CASE = {
  requestId: 'req-informe-e', approvalInbound: 'in-aprobacion-alcance-e',
  offers: { approval: 'o-aprobacion-martes', overtime: 'o-horas-ines-martes' },
  requested: '2026-11-18T16:00:00.000Z',
} as const;

export function servicesDateCheck(): DateCheckInput {
  const base = servicesWeek();
  const model = operationalModel.parse({
    ...base,
    resources: [...base.resources, { id: 'buzon-aprobaciones', title: 'Buzón de aprobaciones del CRM', kind: 'warehouse', source: null, executesJobs: false, skills: [],
      windows: { state: 'known', value: [{ start: base.clock.now, end: base.clock.horizonEnd }], provenance: declared('Dirección de proyectos (ficción)') } }],
  });
  const approval = ref('crm-fixture', 'approval', 'ap-57');
  return dateCheckInput.parse({
    format: dateCheckInputFormat, base: model,
    inventory: {
      format: inventoryFormat,
      skus: [{ id: 'aprobacion-alcance-e', title: 'Aprobación del alcance · cliente E' }], compatibility: [], lots: [], demands: [],
      inbound: [{ id: SERVICES_CASE.approvalInbound, title: 'Aprobación del alcance del cliente E', sku: 'aprobacion-alcance-e', warehouseId: 'buzon-aprobaciones', source: approval,
        quantity: { state: 'known', value: 1, provenance: { basis: 'observed', source: approval, sourceRevision: 'crm-r40', observedAt: '2026-11-09T07:30:00Z', coverage: 'complete' } },
        arrival: { state: 'unknown', reason: 'not-provided' } }],
    },
    request: {
      id: SERVICES_CASE.requestId, title: 'Informe de arquitectura · cliente E (ficción)', source: ref('crm-fixture', 'deal', 'deal-e-arq'),
      requestedAt: SERVICES_CASE.requested, window: { start: '2026-11-16T08:00:00.000Z', end: null },
      duration: { state: 'known', value: 1200, provenance: declared('Inés (ficción)') }, travel: { state: 'known', value: 0, provenance: declared('Inés (ficción)') },
      skills: ['analisis'], materials: [{ sku: 'aprobacion-alcance-e', warehouseId: 'buzon-aprobaciones', quantity: { state: 'known', value: 1, provenance: declared('Inés (ficción)') } }],
      requestedBy: declared('Dirección de proyectos (ficción)'),
    },
    policy: { protected: ['h-informe-b'], tiers: [] },
    offers: [
      { id: SERVICES_CASE.offers.approval, type: 'confirm-arrival', label: 'El cliente E aprueba el alcance el martes 17 a las 09:00', inboundId: SERVICES_CASE.approvalInbound, arrivalAt: '2026-11-17T08:00:00.000Z' },
      { id: SERVICES_CASE.offers.overtime, type: 'add-slot', label: 'Inés hace 4 h extra el martes 17 de 17:00 a 21:00', resourceId: 'ines', start: '2026-11-17T16:00:00.000Z', end: '2026-11-17T20:00:00.000Z', provenance: declared('Inés (ficción)') },
    ],
    scenarios: [],
  });
}
