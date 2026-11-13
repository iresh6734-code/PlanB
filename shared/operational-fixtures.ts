import { operationalModel, operationalTwinFormat, sha256Hex, type OperationalModel, type Provenance, type SourceRef, type Supposition } from './operational-twin.js';
import type { Objectives } from './operational-planner.js';

// FICCIÓN de este equipo (unidad CLAUDE-FABLE-OPERATIONAL-CORE-1): «la instalación del viernes». Ningún dato procede de una empresa, proveedor o cuenta real;
// los proveedores terminan en «-fixture» y las cuentas empiezan por «fixture-». Es la fixture PEQUEÑA de la primera puerta, no la empresa 12/3/2/20/8 de la misión.
//
// Reloj: lunes 9/11/2026 08:00 Europe/Madrid (07:00Z). Jornadas de 08:00 a 16:00 (07:00Z–15:00Z).
//   Ana  (clima, eléctrica)   lunes a viernes y lunes 16
//   Cruz (clima, carretilla)  solo jueves, viernes y lunes 16 (declarado: formación de lunes a miércoles)
//   Beto (eléctrica)          lunes a viernes
// Variante «infeasible»: la instalación Norte debe terminar el viernes, su bomba está retenida hasta el jueves, comparte técnico con la instalación Urgente (el cliente solo
// da acceso desde el jueves) y un ticket impide darla por resuelta. Con el pedido Sur, que solo Cruz puede mover el jueves, los tres compromisos no caben a la vez.
// Variante «healthy»: la Urgente puede empezar el lunes y todo cabe con el plan actual.

const NOW = '2026-11-09T07:00:00Z';
const day = (date: number, hour: number, minute = 0) => `2026-11-${String(date).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
const shift = (date: number) => ({ start: day(date, 7), end: day(date, 15) });
const declared = (by: string): Provenance & { basis: 'declared' } => ({ basis: 'declared', by, declaredAt: '2026-11-09T06:45:00Z' });
const observed = (source: SourceRef): Provenance & { basis: 'observed' } => ({ basis: 'observed', source, observedAt: '2026-11-09T06:30:00Z', coverage: 'complete' });
const known = <T>(value: T, provenance: (Provenance & { basis: 'declared' }) | (Provenance & { basis: 'observed' })) => ({ state: 'known' as const, value, provenance });
const ordersA = (kind: string, remoteId: string): SourceRef => ({ provider: 'orders-fixture', accountId: 'fixture-orders-a', kind, remoteId });
const ordersB = (kind: string, remoteId: string): SourceRef => ({ provider: 'orders-fixture', accountId: 'fixture-orders-b', kind, remoteId });
const support = (remoteId: string): SourceRef => ({ provider: 'support-fixture', accountId: 'fixture-support', kind: 'ticket', remoteId });
const staff = (remoteId: string): SourceRef => ({ provider: 'rota-fixture', accountId: 'fixture-rota', kind: 'technician', remoteId });
const coordination = declared('Coordinación (ficción)');

export function fridayCase(variant: 'infeasible' | 'healthy' = 'infeasible'): OperationalModel {
  const commitment = (id: string, title: string, dueAt: string) => ({ id, revision: sha256Hex(`fixture:${id}`), title, dueAt });
  return operationalModel.parse({
    format: operationalTwinFormat,
    clock: { now: NOW, timeZone: 'Europe/Madrid', horizonEnd: day(17, 7) },
    rules: { staleAfterMinutes: 24 * 60 },
    resources: [
      { id: 'tech-ana', title: 'Ana', kind: 'technician', source: staff('ana'), executesJobs: true, skills: ['clima', 'electrica'], windows: known([9, 10, 11, 12, 13, 16].map(shift), observed(staff('ana'))) },
      { id: 'tech-cruz', title: 'Cruz', kind: 'technician', source: staff('cruz'), executesJobs: true, skills: ['clima', 'carretilla'], windows: known([12, 13, 16].map(shift), coordination) },
      { id: 'tech-beto', title: 'Beto', kind: 'technician', source: staff('beto'), executesJobs: true, skills: ['electrica'], windows: known([9, 10, 11, 12, 13].map(shift), observed(staff('beto'))) },
      { id: 'almacen-norte', title: 'Almacén Norte', kind: 'warehouse', source: null, executesJobs: false, skills: [], windows: known([], coordination) },
      { id: 'almacen-sur', title: 'Almacén Sur', kind: 'warehouse', source: null, executesJobs: false, skills: [], windows: known([], coordination) },
    ],
    materials: [
      { id: 'mat-bomba', title: 'Bomba de calor (retenida)', source: ordersA('order-line', 'ol-1001'), warehouseId: 'almacen-norte', availableAt: known(day(12, 7), observed(ordersA('order-line', 'ol-1001'))) },
      { id: 'mat-bomba-alt', title: 'Bomba equivalente', source: null, warehouseId: 'almacen-sur', availableAt: known(day(10, 7), declared('Jefa de almacén (ficción)')) },
      { id: 'mat-cuadro', title: 'Cuadro eléctrico', source: ordersB('order-line', 'ol-1001'), warehouseId: 'almacen-sur', availableAt: known('2026-11-06T10:00:00Z', observed(ordersB('order-line', 'ol-1001'))) },
    ],
    commitments: [
      commitment('c-inst-norte', 'Instalación Norte terminada el viernes', day(13, 15)),
      commitment('c-inst-urgente', 'Instalación Urgente', day(13, 15)),
      commitment('c-pedido-sur', 'Pedido Sur entregado el jueves', day(12, 15)),
      commitment('c-cuadro-este', 'Cuadro Este montado', day(11, 15)),
    ],
    jobs: [
      { id: 'inst-norte', title: 'Instalar bomba Norte', kind: 'installation', source: null, commitmentId: 'c-inst-norte', duration: known(600, coordination), travel: known(60, coordination),
        skills: ['clima'], materials: ['mat-bomba'], earliestStart: null, dependencies: [] },
      { id: 'ticket-norte', title: 'Ticket: fuga pendiente en Norte', kind: 'ticket', source: support('t-88'), commitmentId: 'c-inst-norte', duration: known(60, coordination), travel: known(0, coordination),
        skills: ['clima'], materials: [], earliestStart: null, dependencies: [{ jobId: 'inst-norte', basis: 'explicit' }] },
      { id: 'inst-urgente', title: 'Instalación Urgente', kind: 'installation', source: null, commitmentId: 'c-inst-urgente', duration: known(480, coordination), travel: known(30, coordination),
        skills: ['clima'], materials: [], earliestStart: variant === 'infeasible' ? day(12, 7) : null, dependencies: [] },
      // Mismo ID remoto «1001» en dos cuentas distintas: son dos pedidos diferentes y nunca se fusionan.
      { id: 'pedido-sur', title: 'Mover y entregar pedido Sur', kind: 'order', source: ordersA('order', '1001'), commitmentId: 'c-pedido-sur', duration: known(480, observed(ordersA('order', '1001'))), travel: known(0, coordination),
        skills: ['carretilla'], materials: [], earliestStart: null, dependencies: [] },
      { id: 'cuadro-este', title: 'Montar cuadro Este', kind: 'order', source: ordersB('order', '1001'), commitmentId: 'c-cuadro-este', duration: known(300, observed(ordersB('order', '1001'))), travel: known(45, coordination),
        skills: ['electrica'], materials: ['mat-cuadro'], earliestStart: null, dependencies: [] },
    ],
    currentPlan: {
      provenance: coordination,
      plan: { sequences: [
        { resourceId: 'tech-ana', jobIds: ['inst-urgente', 'inst-norte', 'ticket-norte'] },
        { resourceId: 'tech-cruz', jobIds: ['pedido-sur'] },
        { resourceId: 'tech-beto', jobIds: ['cuadro-este'] },
      ] },
    },
  });
}

// Respuestas que la persona DECLARA como posibles. Que estén aquí no las autoriza ni confirma su disponibilidad.
export const fridayOptions: Supposition[] = [
  { id: 'o-extra-cruz', type: 'add-capacity', resourceId: 'tech-cruz', start: day(12, 15), end: day(12, 16) },
  { id: 'o-bomba-alt', type: 'use-alternative-material', jobId: 'inst-norte', fromMaterialId: 'mat-bomba', toMaterialId: 'mat-bomba-alt' },
  { id: 'o-mover-norte', type: 'move-due', commitmentId: 'c-inst-norte', dueAt: day(16, 15) },
  { id: 'o-dividir-norte', type: 'split-job', jobId: 'inst-norte', parts: [300, 300] },
];
// Perturbaciones de ensayo.
export const fridayPerturbations = {
  materialDelay: { id: 'p-bomba-tarde', type: 'material-availability', materialId: 'mat-bomba', availableAt: day(13, 7) },
  technicianOut: { id: 'p-ana-baja', type: 'resource-absence', resourceId: 'tech-ana', start: day(12, 7), end: day(12, 15) },
  sourceDown: { id: 'p-pedidos-a-caida', type: 'source-outage', provider: 'orders-fixture', accountId: 'fixture-orders-a' },
  reopen: { id: 'p-reabre', type: 'job-reopen', jobId: 'cuadro-este', at: day(10, 7), extraMinutes: 90 },
} satisfies Record<string, Supposition>;
// Prioridad elegida por la persona en la demostración: primero la instalación Norte. «Prioridad nueva de un cliente» = otra lista de niveles.
export const fridayObjectives: Objectives = { tiers: [['c-inst-norte']] };
