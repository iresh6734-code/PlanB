import { commitmentDemoDataset, type CommitmentDataset } from './commitments.js';

// ESCENARIO MULTISISTEMA DEL RADAR (unidad Claude B · CLAUDE-MULTISYSTEM-SCENARIO). Sucede a `shared/commitment-demo.ts` (que no se toca: otros agentes lo consumen) con un recorrido que mezcla CRM,
// pedidos y soporte de proveedores distintos y conserva sus identidades. Todo es FICCIÓN: los proveedores terminan en «-fixture», las cuentas empiezan por «fixture-», los pedidos son ficticios
// (`orders-fixture`) y no se muestra ningún sistema como conectado. Que estas fuentes existan NO prueba ningún proveedor, ni Shopify, ni el escritor de la App.
//
// Ocho compromisos (el estado/causa entre paréntesis es lo que el Radar debe derivar con el MISMO `now` que el conjunto):
//   ms-installation-hubspot   Instalación comprometida (HubSpot) · pedido RETENIDO · ticket unido por referencia EXPLÍCITA          → en riesgo · source-blocked · entrega
//   ms-installation-pipedrive El MISMO tipo de compromiso nacido en Pipedrive: venta con el MISMO ID remoto que la de HubSpot      → en riesgo · source-blocked · entrega (resultado equivalente, identidades distintas)
//   ms-delivery-healthy       Entrega sana con prueba de cumplimiento                                                              → sin riesgo detectado · cierre observable
//   ms-delivery-unconfirmed   Entrega SIN CONFIRMAR: el pedido enlazado no tiene lectura                                           → sin confirmar · entrega «sin lectura»
//   ms-orders-partial         Cobertura PARCIAL de pedidos                                                                         → sin confirmar · entrega «parcial»
//   ms-same-id-two-accounts   El MISMO ID de pedido en DOS cuentas, como candidatos y sin vínculo confirmado                         → sin confirmar · entrega «ambigua»; no hereda el bloqueo de la cuenta A
//   ms-orders-account-b       El pedido de la OTRA cuenta con ese ID, enlazado explícitamente                                      → sin riesgo detectado (su resultado no se mezcla con el de la cuenta A)
//   ms-support-source-down    Fuente de soporte caída (permisos insuficientes): se desconoce, no se supone sano                    → sin confirmar · soporte «no disponible»
// Las fechas salen de `now` con desplazamientos fijos. El Radar liga las decisiones a la revisión del conjunto: cambiar `now` ES otro conjunto. El montaje central debe fijar `now` una vez y
// conservarlo entre reinicios; esta unidad lo demuestra con una prueba y no lo decide.
export const MULTISYSTEM_DEMO_FORMAT = 'planb-commitments-demo-v1' as const;
const MINUTE = 60_000, HOUR = 60 * MINUTE;
type Account = { provider: string; accountId: string };
type Kind = 'sale' | 'delivery' | 'support';
const HUBSPOT: Account = { provider: 'hubspot-fixture', accountId: 'fixture-hubspot-sales' };
const PIPEDRIVE: Account = { provider: 'pipedrive-fixture', accountId: 'fixture-pipedrive-sales' };
const ORDERS_A: Account = { provider: 'orders-fixture', accountId: 'fixture-orders-a' };
const ORDERS_B: Account = { provider: 'orders-fixture', accountId: 'fixture-orders-b' };
const SUPPORT: Account = { provider: 'zendesk-fixture', accountId: 'fixture-support-a' };
const ref = (account: Account, kind: Kind, remoteId: string) => ({ ...account, kind, remoteId });

/** Cómo se debe rotular cada proveedor del conjunto: siempre como datos de ensayo y NUNCA como conectado. */
export const multisystemProviderLabels = {
  'hubspot-fixture': { label: 'HubSpot · datos de ensayo', connected: false },
  'pipedrive-fixture': { label: 'Pipedrive · datos de ensayo', connected: false },
  'orders-fixture': { label: 'Pedidos ficticios', connected: false },
  'zendesk-fixture': { label: 'Zendesk · datos de ensayo', connected: false },
} as const;
/** Lo que la ficha no debe sugerir con este conjunto. */
export const multisystemDisclosures = [
  'Los pedidos son ficticios: no hay lectura de Shopify ni de ningún sistema de pedidos.',
  'Ningún proveedor está conectado: son datos de ensayo y no acreditan acceso a HubSpot, Pipedrive ni Zendesk.',
  'Un ID remoto igual en dos proveedores o cuentas NO es el mismo registro.',
] as const;

type Role = Kind;
type Origin = { provider: string; accountId: string; remoteId: string };
type Expectation = {
  id: string; status: 'at-risk' | 'unconfirmed' | 'no-risk-detected'; cause: 'source-blocked' | 'coverage-incomplete' | 'no-blocker-observed'; affectedRole: Role | null;
  /** Estado de evidencia por rol, en el orden venta · entrega · soporte. */
  evidence: readonly ['observed' | 'missing' | 'ambiguous' | 'partial' | 'unavailable', 'observed' | 'missing' | 'ambiguous' | 'partial' | 'unavailable', 'observed' | 'missing' | 'ambiguous' | 'partial' | 'unavailable'];
  /** De dónde viene la evidencia visible de cada rol (null si no hay observación que mostrar). La ficha debe enseñar este origen. */
  origins: Record<Role, Origin | null>;
  canCloseObserved: boolean;
  /** Qué debe poder leer la persona en la ficha para entender la causa, sin interpretar un fallo como «sin riesgo». */
  explain: string;
};
const origin = (account: Account, remoteId: string): Origin => ({ ...account, remoteId });

export const multisystemScenarioExpectations: readonly Expectation[] = [
  { id: 'ms-installation-hubspot', status: 'at-risk', cause: 'source-blocked', affectedRole: 'delivery', evidence: ['observed', 'observed', 'observed'], canCloseObserved: false,
    origins: { sale: origin(HUBSPOT, 'deal-2001'), delivery: origin(ORDERS_A, 'order-9001'), support: origin(SUPPORT, 'ticket-8001') },
    explain: 'El pedido ficticio 9001 (cuenta de pedidos A) está retenido por falta de stock; el ticket 8001 está unido por referencia explícita.' },
  { id: 'ms-installation-pipedrive', status: 'at-risk', cause: 'source-blocked', affectedRole: 'delivery', evidence: ['observed', 'observed', 'observed'], canCloseObserved: false,
    origins: { sale: origin(PIPEDRIVE, 'deal-2001'), delivery: origin(ORDERS_A, 'order-9002'), support: origin(SUPPORT, 'ticket-8002') },
    explain: 'Mismo tipo de compromiso que el de HubSpot, nacido en Pipedrive: la oportunidad tiene el mismo ID remoto que la de HubSpot pero es otro registro de otra cuenta.' },
  { id: 'ms-delivery-healthy', status: 'no-risk-detected', cause: 'no-blocker-observed', affectedRole: null, evidence: ['observed', 'observed', 'observed'], canCloseObserved: true,
    origins: { sale: origin(HUBSPOT, 'deal-2003'), delivery: origin(ORDERS_A, 'order-9003'), support: origin(SUPPORT, 'ticket-8003') },
    explain: 'Entrega completada con prueba de cumplimiento y las tres fuentes recientes y completas. «Sin riesgo detectado» no es una garantía.' },
  { id: 'ms-delivery-unconfirmed', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'missing', 'observed'], canCloseObserved: false,
    origins: { sale: origin(PIPEDRIVE, 'deal-2004'), delivery: null, support: origin(SUPPORT, 'ticket-8004') },
    explain: 'El pedido enlazado no tiene ninguna lectura: falta información de entrega, no hay ausencia de riesgo.' },
  { id: 'ms-orders-partial', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'partial', 'observed'], canCloseObserved: false,
    origins: { sale: origin(HUBSPOT, 'deal-2005'), delivery: origin(ORDERS_A, 'order-9005'), support: origin(SUPPORT, 'ticket-8005') },
    explain: 'Solo se leyó la primera página de pedidos: lo no leído no se da por sano.' },
  { id: 'ms-same-id-two-accounts', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'ambiguous', 'observed'], canCloseObserved: false,
    origins: { sale: origin(HUBSPOT, 'deal-2006'), delivery: null, support: origin(SUPPORT, 'ticket-8006') },
    explain: 'Dos pedidos con el ID order-9001 en cuentas distintas son candidatos: sin vínculo confirmado no se atribuye ninguno, ni el bloqueo de la cuenta A ni el cumplimiento de la B.' },
  { id: 'ms-orders-account-b', status: 'no-risk-detected', cause: 'no-blocker-observed', affectedRole: null, evidence: ['observed', 'observed', 'observed'], canCloseObserved: true,
    origins: { sale: origin(PIPEDRIVE, 'deal-2007'), delivery: origin(ORDERS_B, 'order-9001'), support: origin(SUPPORT, 'ticket-8007') },
    explain: 'El pedido order-9001 de la cuenta B está entregado; su resultado no se mezcla con el order-9001 retenido de la cuenta A.' },
  { id: 'ms-support-source-down', status: 'unconfirmed', cause: 'coverage-incomplete', affectedRole: null, evidence: ['observed', 'observed', 'unavailable'], canCloseObserved: false,
    origins: { sale: origin(HUBSPOT, 'deal-2008'), delivery: origin(ORDERS_A, 'order-9008'), support: origin(SUPPORT, 'ticket-8008') },
    explain: 'La fuente de soporte no está disponible (permisos insuficientes): se desconoce, no se interpreta como sin tickets.' },
];

/**
 * Conjunto multisistema para el instante `now` (milisegundos). Determinista: sin aleatoriedad ni reloj. Se valida con el esquema compartido antes de devolverlo; uno incoherente lanza.
 */
export function createMultisystemScenario(now: number): CommitmentDataset {
  if (!Number.isFinite(now) || !Number.isInteger(now) || now <= 0) throw new Error('El escenario multisistema necesita un instante válido (milisegundos).');
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const fresh = at(-20 * MINUTE);
  const obs = (reference: ReturnType<typeof ref>, label: string, coverage: 'complete' | 'partial' | 'unavailable', condition: 'clear' | 'blocked' | 'completed' | null) => ({ reference, observedAt: fresh, coverage, condition, label });
  const explicit = (reference: ReturnType<typeof ref>) => ({ reference, basis: 'explicit' as const });
  const candidate = (reference: ReturnType<typeof ref>) => ({ reference, basis: 'candidate' as const });

  const hubspotInstall = { sale: ref(HUBSPOT, 'sale', 'deal-2001'), delivery: ref(ORDERS_A, 'delivery', 'order-9001'), support: ref(SUPPORT, 'support', 'ticket-8001') };
  const pipedriveInstall = { sale: ref(PIPEDRIVE, 'sale', 'deal-2001'), delivery: ref(ORDERS_A, 'delivery', 'order-9002'), support: ref(SUPPORT, 'support', 'ticket-8002') };
  const healthy = { sale: ref(HUBSPOT, 'sale', 'deal-2003'), delivery: ref(ORDERS_A, 'delivery', 'order-9003'), support: ref(SUPPORT, 'support', 'ticket-8003') };
  const unconfirmed = { sale: ref(PIPEDRIVE, 'sale', 'deal-2004'), delivery: ref(ORDERS_A, 'delivery', 'order-9004'), support: ref(SUPPORT, 'support', 'ticket-8004') };
  const partial = { sale: ref(HUBSPOT, 'sale', 'deal-2005'), delivery: ref(ORDERS_A, 'delivery', 'order-9005'), support: ref(SUPPORT, 'support', 'ticket-8005') };
  const twin = { sale: ref(HUBSPOT, 'sale', 'deal-2006'), deliveryA: ref(ORDERS_A, 'delivery', 'order-9001'), deliveryB: ref(ORDERS_B, 'delivery', 'order-9001'), support: ref(SUPPORT, 'support', 'ticket-8006') };
  const accountB = { sale: ref(PIPEDRIVE, 'sale', 'deal-2007'), delivery: ref(ORDERS_B, 'delivery', 'order-9001'), support: ref(SUPPORT, 'support', 'ticket-8007') };
  const down = { sale: ref(HUBSPOT, 'sale', 'deal-2008'), delivery: ref(ORDERS_A, 'delivery', 'order-9008'), support: ref(SUPPORT, 'support', 'ticket-8008') };

  const dataset: CommitmentDataset = {
    format: MULTISYSTEM_DEMO_FORMAT,
    commitments: [
      { id: 'ms-installation-hubspot', title: 'Instalación de 12 equipos en Almacén Norte', dueAt: at(2 * 24 * HOUR), links: [explicit(hubspotInstall.sale), explicit(hubspotInstall.delivery), explicit(hubspotInstall.support)] },
      { id: 'ms-installation-pipedrive', title: 'Instalación de 8 equipos en Almacén Sur', dueAt: at(2 * 24 * HOUR), links: [explicit(pipedriveInstall.sale), explicit(pipedriveInstall.delivery), explicit(pipedriveInstall.support)] },
      { id: 'ms-delivery-healthy', title: 'Entrega del pedido 9003 a Cliente Centro', dueAt: at(24 * HOUR), links: [explicit(healthy.sale), explicit(healthy.delivery), explicit(healthy.support)] },
      { id: 'ms-delivery-unconfirmed', title: 'Entrega del pedido 9004 a Cliente Sur', dueAt: at(24 * HOUR), links: [explicit(unconfirmed.sale), explicit(unconfirmed.delivery), explicit(unconfirmed.support)] },
      { id: 'ms-orders-partial', title: 'Hito de proyecto: puesta en marcha en Taller Este', dueAt: at(3 * 24 * HOUR), links: [explicit(partial.sale), explicit(partial.delivery), explicit(partial.support)] },
      { id: 'ms-same-id-two-accounts', title: 'Instalación de 12 equipos en Almacén Norte', dueAt: at(2 * 24 * HOUR), links: [explicit(twin.sale), candidate(twin.deliveryA), candidate(twin.deliveryB), explicit(twin.support)] },
      { id: 'ms-orders-account-b', title: 'Entrega del pedido 9001 de la otra cuenta de pedidos', dueAt: at(24 * HOUR), links: [explicit(accountB.sale), explicit(accountB.delivery), explicit(accountB.support)] },
      { id: 'ms-support-source-down', title: 'Respuesta de soporte a Cliente Oeste', dueAt: at(6 * HOUR), links: [explicit(down.sale), explicit(down.delivery), explicit(down.support)] },
    ],
    observations: [
      obs(hubspotInstall.sale, 'Oportunidad ganada con fecha de instalación comprometida (HubSpot de ensayo)', 'complete', 'clear'),
      obs(hubspotInstall.delivery, 'Pedido ficticio 9001 retenido por falta de stock', 'complete', 'blocked'),
      obs(hubspotInstall.support, 'Ticket 8001 unido al pedido 9001 por referencia explícita, abierto', 'complete', 'clear'),
      obs(pipedriveInstall.sale, 'Oportunidad ganada con fecha de instalación comprometida (Pipedrive de ensayo)', 'complete', 'clear'),
      obs(pipedriveInstall.delivery, 'Pedido ficticio 9002 retenido por falta de stock', 'complete', 'blocked'),
      obs(pipedriveInstall.support, 'Ticket 8002 unido al pedido 9002 por referencia explícita, abierto', 'complete', 'clear'),
      obs(healthy.sale, 'Oportunidad ganada (HubSpot de ensayo)', 'complete', 'clear'),
      obs(healthy.delivery, 'Pedido ficticio 9003 entregado con prueba de cumplimiento', 'complete', 'completed'),
      obs(healthy.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(unconfirmed.sale, 'Oportunidad ganada (Pipedrive de ensayo)', 'complete', 'clear'),
      obs(unconfirmed.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(partial.sale, 'Oportunidad ganada (HubSpot de ensayo)', 'complete', 'clear'),
      obs(partial.delivery, 'Lectura parcial de pedidos ficticios: solo la primera página', 'partial', 'clear'),
      obs(partial.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(twin.sale, 'Oportunidad ganada con fecha comprometida (HubSpot de ensayo)', 'complete', 'clear'),
      obs(twin.support, 'Ticket 8006 abierto', 'complete', 'clear'),
      obs(accountB.sale, 'Oportunidad ganada (Pipedrive de ensayo)', 'complete', 'clear'),
      obs(accountB.delivery, 'Pedido ficticio 9001 de la cuenta B entregado con prueba de cumplimiento', 'complete', 'completed'),
      obs(accountB.support, 'Sin tickets abiertos', 'complete', 'clear'),
      obs(down.sale, 'Oportunidad ganada (HubSpot de ensayo)', 'complete', 'clear'),
      obs(down.delivery, 'Pedido ficticio 9008 en preparación sin incidencias', 'complete', 'clear'),
      obs(down.support, 'La fuente de soporte no está disponible: permisos insuficientes', 'unavailable', null),
    ],
  };
  return commitmentDemoDataset.parse(dataset);
}
