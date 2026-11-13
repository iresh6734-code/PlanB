import { z } from 'zod';
import { commitmentId } from './commitments.js';
import { OperationalInputError, canonicalJson, sha256Hex, sourceRef, sourceRefKey, type SourceRef } from './operational-twin.js';

// INVENTARIO CON CANTIDADES · extensión PROPUESTA del gemelo operativo (unidad CLAUDE-OPUS-DATE-CHECK-CORE). No sustituye ni modifica planb-operational-twin-v1:
// es un sobre aparte, versionado, que acompaña a un modelo del gemelo. Los ensayos ya guardados con el formato anterior siguen siendo válidos tal cual.
//
// Qué describe, por almacén y SKU:
//   lots        existencias en el instante del reloj (cantidad conocida, desconocida o contradictoria)
//   inbound     llegadas previstas (cantidad y fecha, cada una con su propio estado)
//   demands     consumo de un trabajo del gemelo; si lleva `reservation`, es una reserva ya hecha en la fuente
//   compatibility  sustituciones permitidas. Solo existen las declaradas: dos SKU con nombre parecido no son intercambiables.
// Cada dato observado lleva cuenta, fuente, revisión de la fuente e instante de observación. Una fuente parcial o antigua conserva ese estado.
//
// LIBRO DE SALDOS. Las existencias y llegadas son entradas; las demandas consumen en el instante en que su trabajo EMPIEZA. Dentro de un mismo instante entran primero las
// llegadas y después los consumos. Un plan es válido para el inventario solo si el saldo de cada (almacén, SKU) no es negativo en ningún instante.
// ASIGNACIÓN ANTES DE PLANIFICAR. Para que el planificador pueda tratar el material como una fecha, cada demanda recibe el primer instante t ≥ su necesidad en el que puede
// reservar su cantidad sin dejar al descubierto ninguna reserva anterior en el orden de prioridad: min_{t' ≥ t}(entradas(t') − reservado(t')) ≥ cantidad.
// Orden: primero las reservas protegidas (por instante de necesidad e ID), después las demandas del posible compromiso y por último las partes de reserva que la persona
// haya decidido ceder. Consumir más tarde que el instante asignado nunca deja el saldo negativo, porque las entradas solo crecen.

export const inventoryFormat = 'planb-operational-inventory-v1' as const;
export const inventoryLimits = Object.freeze({ skus: 64, lots: 128, inbound: 128, demands: 128, compatibility: 64, quantity: 1_000_000 });

const id = commitmentId;
const label = z.string().trim().min(1).max(160);
const instant = z.iso.datetime();
const revision = z.string().trim().min(1).max(128);

// Procedencia con revisión de fuente: la misma lectura de la misma cuenta en dos revisiones distintas son dos observaciones.
const observed = z.object({ basis: z.literal('observed'), source: sourceRef, sourceRevision: revision, observedAt: instant, coverage: z.enum(['complete', 'partial']) }).strict();
const declared = z.object({ basis: z.literal('declared'), by: label, declaredAt: instant }).strict();
const provenance = z.discriminatedUnion('basis', [observed, declared]);
export type InventoryProvenance = z.infer<typeof provenance> | { basis: 'assumed'; offerId: string };

export const inventoryProvenance = provenance;
export function fact<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('known'), value, provenance }).strict(),
    z.object({ state: z.literal('unknown'), reason: z.enum(['not-provided', 'source-unavailable', 'source-partial']) }).strict(),
    z.object({ state: z.literal('contradictory'), claims: z.array(z.object({ value, provenance }).strict()).min(2).max(4) }).strict(),
  ]);
}
export type InventoryFact<T> =
  | { state: 'known'; value: T; provenance: InventoryProvenance }
  | { state: 'unknown'; reason: 'not-provided' | 'source-unavailable' | 'source-partial' }
  | { state: 'contradictory'; claims: { value: T; provenance: InventoryProvenance }[] };

const quantity = z.number().int().min(0).max(inventoryLimits.quantity);
const positive = z.number().int().min(1).max(inventoryLimits.quantity);

export const inventory = z.object({
  format: z.literal(inventoryFormat),
  skus: z.array(z.object({ id, title: label }).strict()).max(inventoryLimits.skus),
  compatibility: z.array(z.object({ sku: id, substitute: id, provenance }).strict()).max(inventoryLimits.compatibility),
  lots: z.array(z.object({ id, sku: id, warehouseId: id, source: sourceRef.nullable(), quantity: fact(quantity) }).strict()).max(inventoryLimits.lots),
  inbound: z.array(z.object({ id, title: label, sku: id, warehouseId: id, source: sourceRef.nullable(), quantity: fact(positive), arrival: fact(instant) }).strict()).max(inventoryLimits.inbound),
  demands: z.array(z.object({
    id, jobId: id, sku: id, warehouseId: id, quantity: fact(positive),
    reservation: z.object({ id, source: sourceRef.nullable(), provenance }).strict().nullable(),
  }).strict()).max(inventoryLimits.demands),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: string[]) => new Set(values).size === values.length;
  const skus = new Set(value.skus.map(item => item.id));
  if (!unique(value.skus.map(item => item.id))) fail('SKU repetidos.');
  for (const [name, items] of [['lotes', value.lots], ['llegadas', value.inbound], ['demandas', value.demands]] as const) {
    if (!unique(items.map(item => item.id))) fail(`IDs repetidos en ${name}.`);
    if (items.some(item => !skus.has(item.sku))) fail(`Hay ${name} con un SKU inexistente.`);
  }
  // Identidad completa de fuente: el mismo ID remoto en otra cuenta es otro objeto; la misma identidad dos veces es un duplicado.
  const sourced = [...value.lots, ...value.inbound].flatMap(item => item.source ? [sourceRefKey(item.source)] : []);
  if (!unique(sourced)) fail('Una misma identidad de fuente aparece dos veces en existencias o llegadas.');
  const reservations = value.demands.flatMap(item => item.reservation ? [item.reservation.id] : []);
  if (!unique(reservations)) fail('IDs de reserva repetidos.');
  for (const entry of value.compatibility) {
    if (!skus.has(entry.sku) || !skus.has(entry.substitute) || entry.sku === entry.substitute) fail('Compatibilidad con SKU inexistente o consigo mismo.');
  }
  if (!unique(value.compatibility.map(item => `${item.sku}>${item.substitute}`))) fail('Compatibilidad repetida.');
});
export type Inventory = z.infer<typeof inventory>;
export type InventoryDemand = Inventory['demands'][number];
export type InventoryInbound = Inventory['inbound'][number];

export const inventoryRevision = (value: Inventory) => sha256Hex(canonicalJson(value));
export const poolKey = (warehouseId: string, sku: string) => `${warehouseId}/${sku}`;
export const isCompatible = (value: Inventory, sku: string, substitute: string) => sku === substitute || value.compatibility.some(item => item.sku === sku && item.substitute === substitute);

// ── Asignación ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Entrada del asignador: demandas ya resueltas a (pool, cantidad conocida, necesidad en minutos) y su clase de prioridad.
export type ClaimClass = 'protected' | 'request' | 'released';
export type Claim = { key: string; demandId: string; pool: string; quantity: number; need: number; cls: ClaimClass };
export type Supply = { id: string; pool: string; at: number; quantity: number; kind: 'lot' | 'inbound' };
// Entradas que existen pero cuya fecha o cantidad se desconoce: no cuentan como disponibles, pero sí como posibilidad que cambiaría el resultado.
export type PotentialSupply = { id: string; pool: string; quantity: number | null; at: number | null };

export type Allocation = {
  key: string; demandId: string; pool: string; quantity: number; need: number; cls: ClaimClass;
  // allocated: cabe con lo conocido en `at` · short: con lo conocido no cabe en el horizonte, pero alguna entrada desconocida podría cubrirlo · impossible: ni contando
  // todas las entradas desconocidas de cantidad conocida alcanza, y no hay ninguna de cantidad desconocida.
  state: 'allocated' | 'short' | 'impossible';
  at: number | null;
  // La entrada cuya llegada hizo posible la asignación (null si bastaba lo que ya había en `need`).
  enabledBy: string | null;
  // Unidades que faltan en `need` con lo conocido (0 si cabe en `need`).
  shortAtNeed: number;
};

const CLASS_ORDER: Record<ClaimClass, number> = { protected: 0, request: 1, released: 2 };

// Asigna en orden de prioridad. `horizon` es el último minuto que cuenta. Pura y determinista: el orden de entrada de los arrays no cambia el resultado.
export function allocate(claims: Claim[], supplies: Supply[], potential: PotentialSupply[], horizon: number): Allocation[] {
  const ordered = [...claims].sort((a, b) => CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls] || a.need - b.need || cmp(a.key, b.key));
  const byPool = new Map<string, { at: number; quantity: number; id: string }[]>();
  for (const item of supplies) {
    if (item.quantity <= 0 || item.at > horizon) continue;
    const list = byPool.get(item.pool) ?? [];
    list.push({ at: item.at, quantity: item.quantity, id: item.id });
    byPool.set(item.pool, list);
  }
  for (const list of byPool.values()) list.sort((a, b) => a.at - b.at || cmp(a.id, b.id));
  const placed = new Map<string, { at: number; quantity: number }[]>();
  const result: Allocation[] = [];
  for (const claim of ordered) {
    const entries = byPool.get(claim.pool) ?? [], taken = placed.get(claim.pool) ?? [];
    // Puntos donde el saldo libre puede cambiar: la necesidad y cada llegada posterior.
    const candidates = [claim.need, ...entries.filter(item => item.at > claim.need).map(item => item.at)];
    const marks = [...new Set([...entries.map(item => item.at), ...taken.map(item => item.at), ...candidates])].sort((a, b) => a - b);
    const free = (from: number) => {
      let lowest = Number.POSITIVE_INFINITY;
      for (const mark of marks) {
        if (mark < from) continue;
        const inflow = entries.reduce((sum, item) => sum + (item.at <= mark ? item.quantity : 0), 0);
        const outflow = taken.reduce((sum, item) => sum + (item.at <= mark ? item.quantity : 0), 0);
        lowest = Math.min(lowest, inflow - outflow);
      }
      // Lo ya reservado con anterioridad a `from` también cuenta en `from`.
      const inflowAt = entries.reduce((sum, item) => sum + (item.at <= from ? item.quantity : 0), 0);
      const outflowAt = taken.reduce((sum, item) => sum + (item.at <= from ? item.quantity : 0), 0);
      return Math.min(lowest, inflowAt - outflowAt);
    };
    const shortAtNeed = Math.max(0, claim.quantity - free(claim.need));
    let at: number | null = null, enabledBy: string | null = null;
    for (const candidate of candidates) {
      if (candidate > horizon) break;
      if (free(candidate) >= claim.quantity) {
        at = candidate;
        enabledBy = candidate === claim.need ? null : entries.find(item => item.at === candidate)?.id ?? null;
        break;
      }
    }
    if (at !== null) {
      taken.push({ at, quantity: claim.quantity });
      placed.set(claim.pool, taken);
      result.push({ ...claim, state: 'allocated', at, enabledBy, shortAtNeed });
      continue;
    }
    const maybe = potential.filter(item => item.pool === claim.pool && (item.at === null || item.at <= horizon));
    const unbounded = maybe.some(item => item.quantity === null);
    const reachable = entries.reduce((sum, item) => sum + item.quantity, 0) - taken.reduce((sum, item) => sum + item.quantity, 0)
      + maybe.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
    result.push({ ...claim, state: unbounded || reachable >= claim.quantity ? 'short' : 'impossible', at: null, enabledBy: null, shortAtNeed });
  }
  return result.sort((a, b) => cmp(a.key, b.key));
}

// ── Comprobación de saldos con los consumos reales de un plan ───────────────────────────────────────────────────────────────────────
export type Consumption = { demandId: string; pool: string; quantity: number; at: number };
export type BalanceViolation = { pool: string; at: number; balance: number };
export function checkBalances(supplies: Supply[], consumptions: Consumption[]): BalanceViolation[] {
  const pools = [...new Set([...supplies.map(item => item.pool), ...consumptions.map(item => item.pool)])].sort(cmp);
  const violations: BalanceViolation[] = [];
  for (const pool of pools) {
    const events = [
      ...supplies.filter(item => item.pool === pool).map(item => ({ at: item.at, delta: item.quantity, order: 0 })),
      ...consumptions.filter(item => item.pool === pool).map(item => ({ at: item.at, delta: -item.quantity, order: 1 })),
    ].sort((a, b) => a.at - b.at || a.order - b.order);
    let balance = 0;
    for (const event of events) {
      balance += event.delta;
      if (balance < 0) { violations.push({ pool, at: event.at, balance }); break; }
    }
  }
  return violations;
}

// ── Resolución del sobre a entradas del asignador ───────────────────────────────────────────────────────────────────────────────────
export type ResolvedInventory = {
  supplies: Supply[]; potential: PotentialSupply[];
  // Estado de cada dato que alimenta un pool, para explicar y para rotular evidencia antigua o parcial.
  evidence: { subject: string; field: 'quantity' | 'arrival'; pool: string; provenance: InventoryProvenance | null; state: 'known' | 'unknown' | 'contradictory'; stale: boolean; partial: boolean }[];
};

export function resolveInventory(value: Inventory, nowMs: number, staleAfterMinutes: number, toMinute: (iso: string) => number): ResolvedInventory {
  const supplies: Supply[] = [], potential: PotentialSupply[] = [], evidence: ResolvedInventory['evidence'] = [];
  const flags = (item: InventoryProvenance | null) => {
    if (!item || item.basis !== 'observed') return { stale: false, partial: false };
    const age = nowMs - Date.parse(item.observedAt);
    return { stale: age < 0 || age > staleAfterMinutes * 60_000, partial: item.coverage === 'partial' };
  };
  const note = <T>(subject: string, field: 'quantity' | 'arrival', pool: string, entry: InventoryFact<T>) => {
    const known = entry.state === 'known' ? entry.provenance : null;
    evidence.push({ subject, field, pool, provenance: known, state: entry.state, ...flags(known) });
  };
  for (const lot of value.lots) {
    const pool = poolKey(lot.warehouseId, lot.sku);
    note(lot.id, 'quantity', pool, lot.quantity);
    // Existencias desconocidas o contradictorias: no se cuentan como cero ni como ilimitadas. Quedan como posibilidad de cantidad desconocida.
    if (lot.quantity.state === 'known') supplies.push({ id: lot.id, pool, at: 0, quantity: lot.quantity.value, kind: 'lot' });
    else potential.push({ id: lot.id, pool, quantity: null, at: 0 });
  }
  for (const entry of value.inbound) {
    const pool = poolKey(entry.warehouseId, entry.sku);
    note(entry.id, 'quantity', pool, entry.quantity); note(entry.id, 'arrival', pool, entry.arrival);
    const qty = entry.quantity.state === 'known' ? entry.quantity.value : null;
    const at = entry.arrival.state === 'known' ? Math.max(0, toMinute(entry.arrival.value)) : null;
    if (qty !== null && at !== null) supplies.push({ id: entry.id, pool, at, quantity: qty, kind: 'inbound' });
    else potential.push({ id: entry.id, pool, quantity: qty, at });
  }
  return { supplies, potential, evidence };
}

export function assertSourceIdentity(refs: (SourceRef | null)[]) {
  const keys = refs.flatMap(item => item ? [sourceRefKey(item)] : []);
  if (new Set(keys).size !== keys.length) throw new OperationalInputError('duplicate-source', 'Una misma identidad de fuente aparece dos veces.');
}

function cmp(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
