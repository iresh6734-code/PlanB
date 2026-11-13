import { commitmentDemoDataset, type CommitmentDataset } from './commitments.js';

// FUENTES FICTICIAS DEL RADAR (unidad Claude B · RADAR-SOURCES). `createCommitmentDemoDataset(now)` devuelve el conjunto de ensayo que la candidata registra con `registerCommitments`: un recorrido
// ventas → entrega → soporte para una distribuidora/instaladora, con los casos que el Radar debe distinguir. Es DATOS ficticios: sin red, sin credenciales, sin proveedor real y sin identidades de cuentas
// de nadie (los proveedores terminan en «-fixture» y las cuentas empiezan por «fixture-»). Todas las fechas salen de `now` con desplazamientos fijos: el mismo `now` da exactamente el mismo conjunto.
//
// Seis compromisos (el título entre paréntesis resume la causa esperada con `now` = el del conjunto):
//   installation-north     Instalación bloqueada: venta con fecha comprometida, pedido RETENIDO (bloqueo reciente y completo) y ticket relacionado        → en riesgo · source-blocked
//   delivery-healthy       Entrega sana con PRUEBA de cumplimiento (entrega completada) y las tres fuentes recientes y completas                           → sin riesgo detectado · cierre observable
//   support-source-down    Fuente de soporte CAÍDA (indisponible, sin condición): se desconoce, no se supone sano                                          → sin confirmar · coverage-incomplete
//   project-partial        Fuente de entrega PARCIAL (primera página): una lectura parcial no basta para afirmar el estado                                  → sin confirmar · coverage-incomplete
//   installation-lookalike Mismo título que el primero y el MISMO ID remoto de pedido en DOS cuentas distintas: el vínculo queda como CANDIDATO          → sin confirmar · entrega «ambigua» (sin observación)
//   stale-evidence         Tres observaciones de hace más de 24 h                                                                                          → sin confirmar · las tres «antiguas»
// `affectedRole` solo se informa cuando hay un bloqueo observado (la entrega en el primero); la causa «coverage-incomplete» no señala un rol.
// Nada aquí acredita un proveedor real: el modo es ficción y una función de usuario solo se cierra con su recorrido en la App.
export const COMMITMENT_DEMO_FORMAT = 'planb-commitments-demo-v1' as const;
const MINUTE = 60_000, HOUR = 60 * MINUTE;
const SALES = { provider: 'hubspot-fixture', accountId: 'fixture-sales-a' } as const;
const ORDERS_A = { provider: 'orders-fixture', accountId: 'fixture-orders-a' } as const;
const ORDERS_B = { provider: 'orders-fixture', accountId: 'fixture-orders-b' } as const;
const SUPPORT = { provider: 'zendesk-fixture', accountId: 'fixture-support-a' } as const;
type Account = { provider: string; accountId: string };
type Kind = 'sale' | 'delivery' | 'support';
const ref = (account: Account, kind: Kind, remoteId: string) => ({ ...account, kind, remoteId });

/** Lo que el Radar debe derivar del conjunto ficticio (para documentación, para las pruebas de la API y para las de interfaz de quien consuma la demo). Orden = el de `commitments`. */
export const commitmentDemoExpectations = [
  { id: 'installation-north', status: 'at-risk', cause: 'source-blocked', affectedRole: 'delivery', evidence: ['observed', 'observed', 'observed'] },
  { id: 'delivery-healthy', status: 'no-risk-detected', cause: 'no-blocker-observed', affectedRole: null, evidence: ['observed', 'observed', 'observed'], canCloseObserved: true },
  { id: 'support-source-down', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'observed', 'unavailable'] },
  { id: 'project-partial', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'partial', 'observed'] },
  { id: 'installation-lookalike', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'ambiguous', 'observed'] },
  { id: 'stale-evidence', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['stale', 'stale', 'stale'] },
] as const;

/**
 * Conjunto de ensayo del Radar para el instante `now` (milisegundos). Determinista: sin aleatoriedad ni reloj interno. Se valida con el esquema compartido antes de devolverlo; un conjunto
 * que no cumpla el contrato lanza (nunca se entrega uno incoherente).
 */
export function createCommitmentDemoDataset(now: number): CommitmentDataset {
  if (!Number.isFinite(now) || !Number.isInteger(now) || now <= 0) throw new Error('La demo del Radar necesita un instante válido (milisegundos).');
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const fresh = at(-20 * MINUTE), old = at(-30 * HOUR);
  const obs = (reference: ReturnType<typeof ref>, label: string, coverage: 'complete' | 'partial' | 'unavailable', condition: 'clear' | 'blocked' | 'completed' | null, observedAt = fresh) => ({ reference, observedAt, coverage, condition, label });
  const explicit = (reference: ReturnType<typeof ref>) => ({ reference, basis: 'explicit' as const });
  const candidate = (reference: ReturnType<typeof ref>) => ({ reference, basis: 'candidate' as const });
  const sale = (id: string) => ref(SALES, 'sale', id), order = (account: Account, id: string) => ref(account, 'delivery', id), ticket = (id: string) => ref(SUPPORT, 'support', id);

  const north = { sale: sale('deal-1001'), delivery: order(ORDERS_A, 'order-4821'), support: ticket('ticket-7001') };
  const healthy = { sale: sale('deal-1003'), delivery: order(ORDERS_A, 'order-5521'), support: ticket('ticket-7003') };
  const down = { sale: sale('deal-1004'), delivery: order(ORDERS_A, 'order-5530'), support: ticket('ticket-7004') };
  const partial = { sale: sale('deal-1005'), delivery: order(ORDERS_A, 'order-5540'), support: ticket('ticket-7005') };
  const lookalike = { sale: sale('deal-1002'), deliveryA: order(ORDERS_A, 'order-4821'), deliveryB: order(ORDERS_B, 'order-4821'), support: ticket('ticket-7002') };
  const stale = { sale: sale('deal-1006'), delivery: order(ORDERS_A, 'order-5550'), support: ticket('ticket-7006') };

  const dataset: CommitmentDataset = {
    format: COMMITMENT_DEMO_FORMAT,
    commitments: [
      { id: 'installation-north', title: 'Instalación de 12 equipos en Almacén Norte', dueAt: at(2 * 24 * HOUR), links: [explicit(north.sale), explicit(north.delivery), explicit(north.support)] },
      { id: 'delivery-healthy', title: 'Entrega del pedido 5521 a Cliente Centro', dueAt: at(24 * HOUR), links: [explicit(healthy.sale), explicit(healthy.delivery), explicit(healthy.support)] },
      { id: 'support-source-down', title: 'Respuesta de soporte a Cliente Sur', dueAt: at(6 * HOUR), links: [explicit(down.sale), explicit(down.delivery), explicit(down.support)] },
      { id: 'project-partial', title: 'Hito de proyecto: puesta en marcha en Taller Este', dueAt: at(3 * 24 * HOUR), links: [explicit(partial.sale), explicit(partial.delivery), explicit(partial.support)] },
      { id: 'installation-lookalike', title: 'Instalación de 12 equipos en Almacén Norte', dueAt: at(2 * 24 * HOUR), links: [explicit(lookalike.sale), candidate(lookalike.deliveryA), candidate(lookalike.deliveryB), explicit(lookalike.support)] },
      { id: 'stale-evidence', title: 'Entrega de repuestos a Cliente Oeste', dueAt: at(24 * HOUR), links: [explicit(stale.sale), explicit(stale.delivery), explicit(stale.support)] },
    ],
    observations: [
      obs(north.sale, 'Venta con fecha de instalación comprometida', 'complete', 'clear'),
      obs(north.delivery, 'Pedido retenido por falta de stock', 'complete', 'blocked'),
      obs(north.support, 'Ticket relacionado abierto, sin bloqueo propio', 'complete', 'clear'),
      obs(healthy.sale, 'Venta confirmada', 'complete', 'clear'),
      obs(healthy.delivery, 'Entrega completada con prueba de cumplimiento', 'complete', 'completed'),
      obs(healthy.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(down.sale, 'Venta confirmada', 'complete', 'clear'),
      obs(down.delivery, 'Pedido en preparación sin incidencias', 'complete', 'clear'),
      obs(down.support, 'La fuente de soporte no responde', 'unavailable', null),
      obs(partial.sale, 'Venta confirmada', 'complete', 'clear'),
      obs(partial.delivery, 'Lectura parcial de pedidos: solo la primera página', 'partial', 'clear'),
      obs(partial.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(lookalike.sale, 'Venta con fecha comprometida (segundo registro)', 'complete', 'clear'),
      obs(lookalike.deliveryB, 'Pedido de la otra cuenta: entrega completada', 'complete', 'completed'),
      obs(lookalike.support, 'Ticket relacionado abierto', 'complete', 'clear'),
      obs(stale.sale, 'Venta confirmada (lectura antigua)', 'complete', 'clear', old),
      obs(stale.delivery, 'Pedido en preparación (lectura antigua)', 'complete', 'clear', old),
      obs(stale.support, 'Sin tickets abiertos (lectura antigua)', 'complete', 'clear', old),
    ],
  };
  return commitmentDemoDataset.parse(dataset);
}
