import { operationalModel, operationalTwinFormat, sha256Hex, type OperationalModel, type SourceRef, type Supposition } from './operational-twin.js';
import type { Objectives } from './operational-planner.js';

// EMPRESA DE FICCIÓN COMPLETA (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2): 12 instalaciones, 3 técnicos, 2 almacenes, 20 pedidos y 8 tickets.
// Nada procede de una empresa, proveedor o cuenta real: proveedores «-fixture», cuentas «fixture-». No está sembrada en la App ni en ningún almacén.
//
// Reloj: lunes 9/11/2026 08:00 Europe/Madrid (07:00Z); horizonte de dos semanas. Técnicos de 08:00 a 16:00; almacenes de 07:00 a 15:00 (hora de Madrid).
//   Ana (clima, eléctrica) · Beto (eléctrica, solar) · Cruz (clima, solar; el jueves 12 está en formación, declarado por coordinación)
//   Almacén Norte y Almacén Sur preparan pedidos. Cada instalación depende EXPLÍCITAMENTE de su pedido preparado.
// Caso focal: la instalación 07 debe terminar el viernes 13; su bomba está retenida hasta el jueves; comparte técnico con la instalación 08, urgente y con acceso solo desde
// el jueves; el ticket 03 impide darla por resuelta.
// Huecos deliberados, como los tendría una empresa real: el ticket 07 no tiene duración; la fecha de los paneles se observó hace tres días; un vínculo pedido-instalación es
// solo candidato; los pedidos 05 y 06 comparten ID remoto en cuentas distintas.

const NOW = '2026-11-09T07:00:00Z';
export const companyDay = (date: number, hour: number, minute = 0) => `2026-11-${String(date).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
const WEEKDAYS = [9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
const two = (value: number) => String(value).padStart(2, '0');
const declared = (by: string) => ({ basis: 'declared' as const, by, declaredAt: '2026-11-09T06:45:00Z' });
const observed = (source: SourceRef, observedAt = '2026-11-09T06:30:00Z') => ({ basis: 'observed' as const, source, observedAt, coverage: 'complete' as const });
const known = <T>(value: T, provenance: ReturnType<typeof declared> | ReturnType<typeof observed>) => ({ state: 'known' as const, value, provenance });
const ref = (provider: string, accountId: string, kind: string, remoteId: string): SourceRef => ({ provider, accountId, kind, remoteId });
const ordersA = (kind: string, remoteId: string) => ref('orders-fixture', 'fixture-orders-a', kind, remoteId);
const ordersB = (kind: string, remoteId: string) => ref('orders-fixture', 'fixture-orders-b', kind, remoteId);
const crm = (remoteId: string) => ref('crm-fixture', 'fixture-crm', 'installation', remoteId);
const support = (remoteId: string) => ref('support-fixture', 'fixture-support', 'ticket', remoteId);
const rota = (remoteId: string) => ref('rota-fixture', 'fixture-rota', 'shift', remoteId);
const coordination = declared('Coordinación (ficción)');

// [n, título, habilidad, minutos, desplazamiento, día de noviembre comprometido]
const INSTALLATIONS: [number, string, string, number, number, number][] = [
  [1, 'Climatización Farmacia Olmo', 'clima', 360, 30, 10], [2, 'Cuadro Taller Rueda', 'electrica', 300, 45, 10], [3, 'Solar Nave Ribera', 'solar', 420, 60, 11],
  [4, 'Split Clínica Alba', 'clima', 240, 30, 11], [5, 'Cuadro Panadería Sol', 'electrica', 360, 30, 12], [6, 'Solar Casa Encina', 'solar', 300, 45, 12],
  [7, 'Bomba de calor Residencia Norte', 'clima', 600, 60, 13], [8, 'Climatización urgente Hotel Faro', 'clima', 480, 30, 13], [9, 'Cuadro Colegio Vega', 'electrica', 420, 45, 13],
  [10, 'Solar Granja Prado', 'solar', 360, 60, 13], [11, 'Cuadro Local Brisa', 'electrica', 240, 30, 18], [12, 'Split Oficina Cedro', 'clima', 300, 45, 19],
];
const ORDER_MINUTES = [120, 90, 150, 90, 120, 120, 180, 150, 120, 150, 90, 90, 90, 120, 90, 150, 120, 90, 120, 90];
const STANDALONE_DUE = [9, 10, 10, 11, 11, 12, 13, 13];
// [n, título, habilidad, minutos | null (sin dato), día comprometido | null (pertenece a la instalación 07)]
const TICKETS: [number, string, string, number | null, number | null][] = [
  [1, 'Diferencial que salta', 'electrica', 60, 9], [2, 'Ruido en unidad exterior', 'clima', 90, 10], [3, 'Fuga pendiente en Residencia Norte', 'clima', 60, null],
  [4, 'Inversor sin lectura', 'solar', 45, 10], [5, 'Revisión de cuadro tras tormenta', 'electrica', 120, 11], [6, 'Mando que no responde', 'clima', 60, 12],
  [7, 'Producción solar baja', 'solar', null, 12], [8, 'Etiquetado de circuitos', 'electrica', 45, 13],
];

export const companyCounts = { installations: 12, technicians: 3, warehouses: 2, orders: 20, tickets: 8 } as const;

export function companyWeek(): OperationalModel {
  const commitment = (id: string, title: string, date: number) => ({ id, revision: sha256Hex(`company-fixture:${id}`), title, dueAt: companyDay(date, 15) });
  const shifts = (dates: number[], from: number, to: number) => dates.map(date => ({ start: companyDay(date, from), end: companyDay(date, to) }));
  const account = (n: number) => (n % 2 ? ordersA : ordersB);
  const orderId = (n: number) => `o${two(n)}`, installationId = (n: number) => `i${two(n)}`, ticketId = (n: number) => `t${two(n)}`;
  // Los pedidos 05 (cuenta A) y 06 (cuenta B) comparten el ID remoto 2005.
  const orderRemote = (n: number) => String(n === 6 ? 2005 : 2000 + n);

  return operationalModel.parse({
    format: operationalTwinFormat,
    clock: { now: NOW, timeZone: 'Europe/Madrid', horizonEnd: companyDay(23, 7) },
    rules: { staleAfterMinutes: 24 * 60 },
    resources: [
      { id: 'tech-ana', title: 'Ana', kind: 'technician', source: rota('ana'), executesJobs: true, skills: ['clima', 'electrica'], windows: known(shifts(WEEKDAYS, 7, 15), observed(rota('ana'))) },
      { id: 'tech-beto', title: 'Beto', kind: 'technician', source: rota('beto'), executesJobs: true, skills: ['electrica', 'solar'], windows: known(shifts(WEEKDAYS, 7, 15), observed(rota('beto'))) },
      { id: 'tech-cruz', title: 'Cruz', kind: 'technician', source: rota('cruz'), executesJobs: true, skills: ['clima', 'solar'], windows: known(shifts(WEEKDAYS.filter(date => date !== 12), 7, 15), coordination) },
      { id: 'almacen-norte', title: 'Almacén Norte', kind: 'warehouse', source: null, executesJobs: true, skills: ['prep-norte'], windows: known(shifts(WEEKDAYS, 6, 14), coordination) },
      { id: 'almacen-sur', title: 'Almacén Sur', kind: 'warehouse', source: null, executesJobs: true, skills: ['prep-sur'], windows: known(shifts(WEEKDAYS, 6, 14), coordination) },
    ],
    materials: [
      { id: 'mat-bomba', title: 'Bomba de calor (retenida)', source: ordersA('order-line', 'ol-2007'), warehouseId: 'almacen-norte', availableAt: known(companyDay(12, 7), observed(ordersA('order-line', 'ol-2007'))) },
      { id: 'mat-bomba-alt', title: 'Bomba equivalente', source: null, warehouseId: 'almacen-sur', availableAt: known(companyDay(10, 7), declared('Jefa de almacén (ficción)')) },
      { id: 'mat-paneles', title: 'Paneles solares', source: ordersB('order-line', 'ol-2010'), warehouseId: 'almacen-sur', availableAt: known(companyDay(11, 7), observed(ordersB('order-line', 'ol-2010'), '2026-11-06T09:00:00Z')) },
      { id: 'mat-cuadros', title: 'Cuadros eléctricos', source: ordersA('order-line', 'ol-2002'), warehouseId: 'almacen-norte', availableAt: known('2026-11-06T10:00:00Z', observed(ordersA('order-line', 'ol-2002'))) },
    ],
    commitments: [
      ...INSTALLATIONS.map(([n, title, , , , date]) => commitment(`c-${installationId(n)}`, title, date)),
      ...STANDALONE_DUE.map((date, at) => commitment(`c-${orderId(13 + at)}`, `Pedido ${13 + at} entregado`, date)),
      ...TICKETS.flatMap(([n, title, , , date]) => date === null ? [] : [commitment(`c-${ticketId(n)}`, `Atención: ${title}`, date)]),
    ],
    jobs: [
      ...INSTALLATIONS.map(([n, title, skill, minutes, travel]) => ({
        id: installationId(n), title, kind: 'installation', source: crm(`inst-${n}`), commitmentId: `c-${installationId(n)}`,
        duration: known(minutes, coordination), travel: known(travel, declared('Estimación de ruta (ficción)')), skills: [skill],
        materials: n === 7 ? ['mat-bomba'] : n === 10 ? ['mat-paneles'] : n === 2 || n === 5 ? ['mat-cuadros'] : [],
        earliestStart: n === 8 ? companyDay(12, 7) : null,
        // El vínculo entre la instalación 11 y el pedido 15 es solo candidato: no crea dependencia.
        dependencies: [{ jobId: orderId(n), basis: 'explicit' as const }, ...(n === 11 ? [{ jobId: orderId(15), basis: 'candidate' as const }] : [])],
      })),
      ...ORDER_MINUTES.map((minutes, at) => {
        const n = at + 1, source = account(n)('order', orderRemote(n));
        return {
          id: orderId(n), title: `Preparar pedido ${n}`, kind: 'order', source, commitmentId: n <= 12 ? `c-${installationId(n)}` : `c-${orderId(n)}`,
          duration: known(minutes, observed(source)), travel: known(0, coordination), skills: [n % 2 ? 'prep-norte' : 'prep-sur'], materials: [], earliestStart: null, dependencies: [],
        };
      }),
      ...TICKETS.map(([n, title, skill, minutes, date]) => ({
        id: ticketId(n), title: `Ticket: ${title}`, kind: 'ticket', source: support(`t-${100 + n}`), commitmentId: date === null ? 'c-i07' : `c-${ticketId(n)}`,
        duration: minutes === null ? { state: 'unknown' as const, reason: 'not-provided' as const } : known(minutes, coordination), travel: known(0, coordination), skills: [skill], materials: [],
        earliestStart: null, dependencies: n === 3 ? [{ jobId: 'i07', basis: 'explicit' as const }] : [],
      })),
    ],
    currentPlan: {
      provenance: coordination,
      plan: { sequences: [
        { resourceId: 'tech-ana', jobIds: ['t01', 'i01', 'i04', 't06', 'i08', 'i07', 't03'] },
        { resourceId: 'tech-beto', jobIds: ['i02', 't05', 'i05', 'i09', 't08', 'i11'] },
        { resourceId: 'tech-cruz', jobIds: ['t04', 't02', 'i03', 'i06', 'i10', 't07', 'i12'] },
        { resourceId: 'almacen-norte', jobIds: [13, 1, 3, 15, 5, 17, 7, 9, 19, 11].map(orderId) },
        { resourceId: 'almacen-sur', jobIds: [2, 14, 4, 16, 6, 18, 8, 10, 20, 12].map(orderId) },
      ] },
    },
  });
}

// Respuestas declaradas como posibles por la persona. Ninguna está autorizada ni confirmada.
export const companyOptions: Supposition[] = [
  // Cruz aplaza la formación del jueves y trabaja su jornada.
  { id: 'o-extra-cruz', type: 'add-capacity', resourceId: 'tech-cruz', start: companyDay(12, 7), end: companyDay(12, 15) },
  { id: 'o-bomba-alt', type: 'use-alternative-material', jobId: 'i07', fromMaterialId: 'mat-bomba', toMaterialId: 'mat-bomba-alt' },
  { id: 'o-mover-i07', type: 'move-due', commitmentId: 'c-i07', dueAt: companyDay(16, 15) },
  { id: 'o-dividir-i07', type: 'split-job', jobId: 'i07', parts: [300, 300] },
];
export const companyPerturbations = {
  materialDelay: { id: 'p-bomba-tarde', type: 'material-availability', materialId: 'mat-bomba', availableAt: companyDay(13, 7) },
  technicianOut: { id: 'p-ana-baja', type: 'resource-absence', resourceId: 'tech-ana', start: companyDay(12, 7), end: companyDay(12, 15) },
  sourceDown: { id: 'p-pedidos-a-caida', type: 'source-outage', provider: 'orders-fixture', accountId: 'fixture-orders-a' },
  reopen: { id: 'p-reabre-i04', type: 'job-reopen', jobId: 'i04', at: companyDay(12, 7), extraMinutes: 120 },
} satisfies Record<string, Supposition>;
// «Prioridad nueva de un cliente»: otra lista de niveles; aquí, la del Hotel Faro por delante.
export const companyObjectives: Objectives = { tiers: [['c-i07']] };
export const companyNewPriority: Objectives = { tiers: [['c-i08'], ['c-i07']] };
