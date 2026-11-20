import { z } from 'zod';
import { commitmentId } from './commitments.js';
import {
  OperationalInputError, canonicalJson, operationalModel, operationalRevision, sha256Hex, sourceRef,
  type Fact, type OperationalModel, type OperationalPlan, type Provenance, type TwinJob, type TwinModel, type TwinResource,
} from './operational-twin.js';
import { compileModel, simulatePlan, type Cause, type Projection, type SimulationResult } from './operational-simulation.js';
import { drain, planScheduleSteps, type Objectives, type PlanResult } from './operational-planner.js';
import {
  allocate, checkBalances, fact as inventoryFact, inventory, inventoryProvenance, inventoryRevision, isCompatible, poolKey, resolveInventory,
  type Allocation, type Claim, type Inventory, type InventoryProvenance, type Supply,
} from './operational-inventory.js';

// COMPROBAR UNA FECHA · motor PROPUESTO (unidad CLAUDE-OPUS-DATE-CHECK-CORE). Puro: no guarda, no lee fuentes y no escribe en proveedores. Todo lo que devuelve es un ensayo.
//
// Pregunta: ¿se puede prometer la fecha pedida para un trabajo nuevo sin mover las fechas que la persona protege? Si no, ¿cuál es la primera fecha que sostiene la evidencia,
// qué cambio declarado la haría posible y qué dato conviene confirmar primero?
//
// Diseño, para que cada conclusión se pueda explicar con sus restricciones y datos:
//  1. MATERIAL. El sobre de inventario (operational-inventory) asigna cantidades en orden de prioridad: reservas protegidas, la solicitud y las reservas cedidas. El resultado
//     de cada demanda es una FECHA de material (o desconocida, o imposible) que entra al gemelo como un material más. Después se comprueba el saldo con los consumos reales.
//  2. PORCIÓN DE CARTERA. Se simula el plan actual completo. Se pueden mover: los trabajos de los recursos capaces de hacer la solicitud que terminan después del inicio de su
//     ventana, los que consumen del mismo almacén y SKU, y su cierre por dependencias y compromiso. TODO lo demás conserva su horario actual y ocupa la agenda como tiempo
//     bloqueado. Es una restricción declarada del modelo: «no se reorganiza lo que ya termina antes de la ventana ni lo que no comparte recurso o material».
//  3. PLANIFICADOR. El planificador del gemelo (operational-planner) busca sobre la porción con niveles [protegidos][solicitud][resto]. Proteger un compromiso que ya llegaba
//     tarde significa no empeorar su fecha proyectada actual, no darlo por perdido. La primera fecha sustentada se obtiene por bisección sobre el plazo de la solicitud:
//     cada «cabe» tiene un plan testigo simulado; cada «no cabe» exige búsqueda completa. Si alguna búsqueda se agota, el resultado lo dice.
//  4. ALTERNATIVAS. Cada subconjunto de cambios declarados (ceder reservadas, confirmar una llegada, añadir una franja, sustituir por un SKU compatible) se evalúa entero.
//     Ninguno está autorizado por aparecer aquí.

export const dateCheckInputFormat = 'planb-operational-date-check-input-v1' as const;
export const dateCheckFormat = 'planb-operational-date-check-v1' as const;
export const dateCheckEngineVersion = 'planb-operational-date-check-0.1.0' as const;
export const dateCheckLimits = Object.freeze({ offers: 4, scenarios: 4, protected: 32, requestMaterials: 4, nodeBudget: 40_000, movableJobs: 16 });

const id = commitmentId;
const label = z.string().trim().min(1).max(160);
const instant = z.iso.datetime();
const minutes = z.number().int().min(1).max(21 * 24 * 60);

const requestSchema = z.object({
  id, title: label, source: sourceRef.nullable(),
  requestedAt: instant,
  window: z.object({ start: instant, end: instant.nullable() }).strict(),
  duration: inventoryFact(minutes), travel: inventoryFact(z.number().int().min(0).max(21 * 24 * 60)),
  skills: z.array(id).min(1).max(8),
  materials: z.array(z.object({ sku: id, warehouseId: id, quantity: inventoryFact(z.number().int().min(1).max(1_000_000)) }).strict()).max(dateCheckLimits.requestMaterials),
  requestedBy: inventoryProvenance,
}).strict();
export type DateCheckRequest = z.infer<typeof requestSchema>;

const offerSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('use-reserved'), label, reservationId: id, quantity: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ id, type: z.literal('confirm-arrival'), label, inboundId: id, arrivalAt: instant }).strict(),
  z.object({ id, type: z.literal('add-slot'), label, resourceId: id, start: instant, end: instant, provenance: inventoryProvenance }).strict(),
  z.object({ id, type: z.literal('substitute'), label, materialIndex: z.number().int().min(0).max(3), toSku: id, toWarehouseId: id }).strict(),
]);
export type DateCheckOffer = z.infer<typeof offerSchema>;

const scenarioSchema = z.object({
  id, label,
  changes: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('arrival'), inboundId: id, arrivalAt: instant }).strict(),
    z.object({ type: z.literal('withdraw-offer'), offerId: id }).strict(),
    z.object({ type: z.literal('resource-absence'), resourceId: id, start: instant, end: instant }).strict(),
  ])).min(1).max(8),
}).strict();
export type DateCheckScenario = z.infer<typeof scenarioSchema>;

export const dateCheckInput = z.object({
  format: z.literal(dateCheckInputFormat),
  base: operationalModel,
  inventory,
  request: requestSchema,
  // La política es de la persona: qué fechas protege y, opcionalmente, en qué orden le importan las demás. El motor no asigna importancia comercial.
  policy: z.object({ protected: z.array(id).max(dateCheckLimits.protected), tiers: z.array(z.array(id).max(32)).max(8) }).strict(),
  offers: z.array(offerSchema).max(dateCheckLimits.offers),
  scenarios: z.array(scenarioSchema).max(dateCheckLimits.scenarios),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const base = value.base, jobs = new Set(base.jobs.map(item => item.id)), commitments = new Set(base.commitments.map(item => item.id));
  const resources = new Map(base.resources.map(item => [item.id, item]));
  if (!base.currentPlan) fail('Comprobar una fecha necesita el plan actual de la cartera.');
  if (jobs.has(value.request.id) || commitments.has(value.request.id)) fail('La solicitud reutiliza el ID de un trabajo o compromiso existente.');
  if (Date.parse(value.request.window.start) < Date.parse(base.clock.now)) fail('La ventana de la solicitud empieza antes del reloj.');
  if (value.request.window.end && Date.parse(value.request.window.end) <= Date.parse(value.request.window.start)) fail('La ventana de la solicitud está vacía.');
  const skus = new Set(value.inventory.skus.map(item => item.id));
  for (const item of value.inventory.demands) if (!jobs.has(item.jobId)) fail(`La demanda ${item.id} cita un trabajo inexistente.`);
  for (const item of [...value.inventory.lots, ...value.inventory.inbound, ...value.inventory.demands, ...value.request.materials]) {
    if (!resources.has(item.warehouseId) || resources.get(item.warehouseId)!.kind !== 'warehouse') fail(`El almacén ${item.warehouseId} no existe.`);
  }
  for (const item of value.request.materials) if (!skus.has(item.sku)) fail(`La solicitud pide el SKU inexistente ${item.sku}.`);
  if (value.policy.protected.some(item => !commitments.has(item)) || new Set(value.policy.protected).size !== value.policy.protected.length) fail('Las protecciones citan compromisos inexistentes o repetidos.');
  const listed = value.policy.tiers.flat();
  if (new Set(listed).size !== listed.length || listed.some(item => !commitments.has(item) || value.policy.protected.includes(item))) fail('Los niveles de prioridad citan compromisos inexistentes, repetidos o protegidos.');
  const offerIds = new Set<string>();
  const reservations = new Map(value.inventory.demands.flatMap(item => item.reservation ? [[item.reservation.id, item] as const] : []));
  const inbound = new Set(value.inventory.inbound.map(item => item.id));
  for (const offer of value.offers) {
    if (offerIds.has(offer.id)) fail('Dos cambios declarados comparten ID.');
    offerIds.add(offer.id);
    if (offer.type === 'use-reserved') {
      const demand = reservations.get(offer.reservationId);
      if (!demand) fail(`El cambio ${offer.id} cita una reserva inexistente.`);
      else if (demand.quantity.state === 'known' && offer.quantity > demand.quantity.value) fail(`El cambio ${offer.id} cede más unidades de las reservadas.`);
    }
    if (offer.type === 'confirm-arrival' && !inbound.has(offer.inboundId)) fail(`El cambio ${offer.id} cita una llegada inexistente.`);
    if (offer.type === 'add-slot') {
      const target = resources.get(offer.resourceId);
      if (!target || !target.executesJobs) fail(`El cambio ${offer.id} cita un recurso inexistente.`);
      if (Date.parse(offer.start) >= Date.parse(offer.end)) fail(`El cambio ${offer.id} tiene una franja vacía.`);
    }
    if (offer.type === 'substitute') {
      const material = value.request.materials[offer.materialIndex];
      if (!material) fail(`El cambio ${offer.id} cita un material inexistente de la solicitud.`);
      else if (!isCompatible(value.inventory, material.sku, offer.toSku)) fail(`El cambio ${offer.id} sustituye por un SKU sin compatibilidad declarada.`);
      if (!resources.has(offer.toWarehouseId)) fail(`El cambio ${offer.id} cita un almacén inexistente.`);
    }
  }
  if (new Set(value.scenarios.map(item => item.id)).size !== value.scenarios.length) fail('Escenarios con ID repetido.');
  for (const scenario of value.scenarios) for (const change of scenario.changes) {
    if (change.type === 'arrival' && !inbound.has(change.inboundId)) fail(`El escenario ${scenario.id} cita una llegada inexistente.`);
    if (change.type === 'withdraw-offer' && !offerIds.has(change.offerId)) fail(`El escenario ${scenario.id} retira un cambio inexistente.`);
    if (change.type === 'resource-absence' && !resources.has(change.resourceId)) fail(`El escenario ${scenario.id} cita un recurso inexistente.`);
  }
});
export type DateCheckInput = z.infer<typeof dateCheckInput>;

// Revisión exacta de lo que se ensayó. Cualquier cambio de cartera, recursos, reservas, cambios declarados o escenarios la cambia.
export const dateCheckRevision = (input: DateCheckInput) => sha256Hex(canonicalJson(input));

// ── Resultado ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Clase del resultado para la FECHA PEDIDA:
//   verified     comprobado dentro del modelo: hay un plan testigo, sin cambios declarados, sin datos desconocidos ni evidencia antigua o parcial en lo que lo sostiene
//   conditioned  cabe solo si se confirman los cambios declarados, o depende de un dato desconocido, antiguo o parcial
//   conflict     conflicto verificado: la búsqueda completa demuestra que, con estos datos, no cabe sin romper una protección
//   incomplete   la búsqueda se agotó o se canceló antes de poder afirmar nada
export type DateCheckClass = 'verified' | 'conditioned' | 'conflict' | 'incomplete';
export type DateCheckControl = { nodeBudget?: number; shouldStop?: () => boolean };

export type Condition =
  | { code: 'offer'; offerId: string; offerType: DateCheckOffer['type'] }
  | { code: 'unknown-duration' | 'unknown-travel'; subject: string }
  | { code: 'unknown-material'; demandId: string; pool: string; pendingInbound: string[] }
  | { code: 'stale-evidence' | 'partial-source'; subject: string; field: string }
  | { code: 'unknown-work-on-resource'; resourceId: string; jobId: string };

export type Blocker =
  | { code: 'material'; demandId: string; pool: string; quantity: number; neededBy: string; availableAt: string | null; enabledBy: string | null; shortAtNeed: number; pendingInbound: string[] }
  | { code: 'staffing'; resourceIds: string[]; windowStart: string; requestedAt: string; neededMinutes: number; freeMinutes: number; occupiedBy: { jobId: string; commitmentId: string | null; protected: boolean; minutes: number }[] }
  | { code: 'protection'; commitmentId: string; protectedAt: string; projectedAt: string | null; projection: Projection; causes: Cause[] }
  | { code: 'horizon'; horizonEnd: string }
  | { code: 'window'; windowEnd: string };

export type AffectedCommitment = {
  commitmentId: string; title: string; protected: boolean;
  before: { projection: Projection; completionAt: string | null };
  after: { projection: Projection; completionAt: string | null };
  // improves/worsens: cambia la proyección o el retraso. later/earlier: sigue en plazo, pero termina más tarde o más pronto.
  effect: 'improves' | 'worsens' | 'later' | 'earlier' | 'same' | 'unknown'; deltaMinutes: number | null;
  // Trabajos del compromiso que el plan propuesto cambia de recurso. Es parte de la propuesta: nada se reasigna sin confirmación.
  reassigned: { jobId: string; from: string | null; to: string | null }[];
};

export type AlternativeResult = {
  id: string; offerIds: string[]; authorization: 'unconfirmed';
  available: boolean; superseded: string[];
  requested: { at: string; outcome: 'meets' | 'misses' | 'unknown'; classification: DateCheckClass };
  supported: { at: string | null; basis: 'evidence' | 'conditioned' | 'none'; proven: boolean };
  protections: { commitmentId: string; protectedAt: string; basis: 'due' | 'projected'; kept: boolean | null; brokenByChangeAlone: boolean }[];
  material: { ok: boolean; demands: { demandId: string; pool: string; quantity: number; state: Allocation['state'] | 'unknown-quantity'; availableAt: string | null; enabledBy: string | null }[] };
  staffing: { ok: boolean | null; completionIfMaterial: string | null };
  blockers: Blocker[];
  conditions: Condition[];
  affected: AffectedCommitment[];
  reservationsConsumed: { reservationId: string; demandId: string; commitmentId: string | null; quantity: number; shortUntil: string | null; state: Allocation['state'] }[];
  extraMinutes: number;
  plan: OperationalPlan | null;
  candidate: { resourceId: string | null; startAt: string | null; finishAt: string | null } | null;
  balanceViolations: number;
  search: { runs: number; nodes: number; complete: boolean; stoppedBy: 'node-budget' | 'cancelled' | null };
};

export type ScenarioCell = { scenarioId: string; alternativeId: string; outcome: 'meets' | 'misses' | 'unknown' | 'not-available'; protectionsKept: boolean | null; supportedAt: string | null };
export type CheckFirst =
  | { kind: 'inbound-arrival'; inboundId: string; alternativeId: string; neededBy: string | null; dependents: string[] }
  | { kind: 'slot'; offerId: string; alternativeId: string; dependents: string[] }
  | { kind: 'reservation'; offerId: string; alternativeId: string; dependents: string[] }
  | { kind: 'duration'; subject: string; maxMinutes: number | null }
  | { kind: 'substitute'; offerId: string; alternativeId: string; dependents: string[] };

export type SliceInfo = {
  movableJobs: string[]; frozenJobs: number; resources: string[]; commitments: string[];
  frozenBefore: string; caveats: { code: 'unknown-frozen-work' | 'unplanned-work'; resourceId: string; jobId: string }[];
};

export type DateCheckResult = {
  format: typeof dateCheckFormat; kind: 'rehearsal'; hypothetical: true; requiresConfirmation: true; engineVersion: typeof dateCheckEngineVersion;
  inputRevision: string; baseRevision: string; inventoryRevision: string; evaluatedAt: string;
  request: { id: string; title: string; requestedAt: string; windowStart: string };
  objective: { tiers: string[][]; explanation: 'protected-then-request-then-rest'; protectedLate: string[] };
  slice: SliceInfo;
  alternatives: AlternativeResult[];
  ranking: string[];
  scenarios: ScenarioCell[];
  checkFirst: CheckFirst[];
  search: { runs: number; nodes: number; complete: boolean; stoppedBy: 'node-budget' | 'cancelled' | null };
};

type Steps<T> = Generator<void, T, void>;

// ── Mundo de una alternativa ────────────────────────────────────────────────────────────────────────────────────────────────────────
type Prepared = {
  input: DateCheckInput; nowMs: number; horizon: number; windowStart: number; windowEnd: number; requestedMinute: number;
  /** Cierre de la ventana de la solicitud en minutos (sin recortar al horizonte); null si la ventana no se cierra. */ windowLimit: number | null;
  toMinute: (iso: string) => number; at: (minute: number) => string;
  capable: string[];
};
type World = {
  model: TwinModel; slice: SliceInfo; allocations: Allocation[]; supplies: Supply[];
  demandJob: Map<string, string>; materialOf: Map<string, string>; candidatePools: string[];
  before: Map<string, { projection: Projection; completionMinute: number | null }>;
  protectedDue: Map<string, { due: number; basis: 'due' | 'projected' }>;
  protectedLate: string[]; superseded: string[]; available: boolean; extraMinutes: number;
  conditions: Condition[]; pendingInbound: Map<string, string[]>; resourceBefore: Map<string, string>;
};

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const twinProvenance = (value: InventoryProvenance): Provenance => value.basis === 'observed'
  ? { basis: 'observed', source: value.source, observedAt: value.observedAt, coverage: value.coverage }
  : value.basis === 'declared' ? value : { basis: 'assumed', suppositionId: value.offerId };
const twinFact = <T>(value: { state: 'known'; value: T; provenance: InventoryProvenance } | { state: 'unknown'; reason: 'not-provided' | 'source-unavailable' | 'source-partial' } | { state: 'contradictory'; claims: { value: T; provenance: InventoryProvenance }[] }): Fact<T> =>
  value.state === 'known' ? { state: 'known', value: value.value, provenance: twinProvenance(value.provenance) }
    : value.state === 'unknown' ? value : { state: 'contradictory', claims: value.claims.map(item => ({ value: item.value, provenance: twinProvenance(item.provenance) })) };

function prepare(raw: DateCheckInput): Prepared {
  const input = dateCheckInput.parse(raw);
  const nowMs = Date.parse(input.base.clock.now), horizon = Math.floor((Date.parse(input.base.clock.horizonEnd) - nowMs) / 60_000);
  const toMinute = (iso: string) => Math.ceil((Date.parse(iso) - nowMs) / 60_000);
  const at = (minute: number) => new Date(nowMs + minute * 60_000).toISOString();
  const windowStart = Math.max(0, toMinute(input.request.window.start));
  const windowLimit = input.request.window.end ? Math.floor((Date.parse(input.request.window.end) - nowMs) / 60_000) : null;
  const windowEnd = windowLimit !== null ? Math.min(horizon, windowLimit) : horizon;
  const requestedMinute = Math.floor((Date.parse(input.request.requestedAt) - nowMs) / 60_000);
  const capable = input.base.resources.filter(item => item.executesJobs && input.request.skills.every(skill => item.skills.includes(skill))).map(item => item.id).sort(byId);
  return { input, nowMs, horizon, windowStart, windowEnd, windowLimit, requestedMinute, toMinute, at, capable };
}

type Interval = [number, number];
function subtract(windows: Interval[], busy: Interval[]): Interval[] {
  let result = windows.map(item => [...item] as Interval);
  for (const [from, to] of busy) result = result.flatMap(([start, end]) => [[start, Math.min(end, from)], [Math.max(start, to), end]] as Interval[]).filter(([start, end]) => start < end);
  return result;
}
function union(windows: Interval[]): Interval[] {
  const sorted = windows.filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0] || a[1] - b[1]), merged: Interval[] = [];
  for (const [start, end] of sorted) { const last = merged[merged.length - 1]; if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]); }
  return merged;
}

// Aplica un escenario a la entrada (sin cambios declarados). Devuelve modelo base modificado, inventario y cambios disponibles.
function applyScenario(p: Prepared, scenario: DateCheckScenario | null) {
  const base: TwinModel = structuredClone(p.input.base), stock: Inventory = structuredClone(p.input.inventory);
  const withdrawn = new Set<string>(), fixedArrivals = new Set<string>();
  for (const change of scenario?.changes ?? []) {
    const assumed: InventoryProvenance = { basis: 'assumed', offerId: `scenario-${scenario!.id}`.slice(0, 64) };
    if (change.type === 'withdraw-offer') withdrawn.add(change.offerId);
    if (change.type === 'arrival') {
      const target = stock.inbound.find(item => item.id === change.inboundId)!;
      target.arrival = { state: 'known', value: change.arrivalAt, provenance: assumed as never };
      fixedArrivals.add(change.inboundId);
    }
    if (change.type === 'resource-absence') {
      const target = base.resources.find(item => item.id === change.resourceId)!;
      if (target.windows.state === 'known') {
        const cut: Interval = [Date.parse(change.start), Date.parse(change.end)];
        const next = subtract(target.windows.value.map(item => [Date.parse(item.start), Date.parse(item.end)] as Interval), [cut]);
        target.windows = { state: 'known', value: next.map(([start, end]) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })), provenance: twinProvenance(assumed) };
      }
    }
  }
  return { base, stock, withdrawn, fixedArrivals };
}

// Ocupación de cada trabajo según la traza de la simulación del plan actual.
function busyIntervals(simulation: SimulationResult, horizon: number): Map<string, Interval[]> {
  const open = new Map<string, number>(), result = new Map<string, Interval[]>();
  for (const event of simulation.events) {
    if (!event.jobId) continue;
    if (event.type === 'job-start' || event.type === 'job-resume') open.set(event.jobId, event.minute);
    if (event.type === 'job-interrupt' || event.type === 'job-finish') {
      const from = open.get(event.jobId);
      if (from !== undefined) { result.set(event.jobId, [...result.get(event.jobId) ?? [], [from, event.minute]]); open.delete(event.jobId); }
    }
  }
  for (const [jobId, from] of open) result.set(jobId, [...result.get(jobId) ?? [], [from, horizon]]);
  return result;
}

type Variant = { relaxMaterial?: boolean; durationOverride?: number; arrivalOverride?: { inboundId: string; arrivalAt: string } };

// Modelo completo con una fecha de material por demanda existente (reservas protegidas primero; las demandas sin reserva, después). Sin solicitud ni cambios declarados.
function withBaseMaterials(p: Prepared, base: TwinModel, stock: Inventory): TwinModel {
  if (!stock.demands.length) return base;
  const resolved = resolveInventory(stock, p.nowMs, base.rules.staleAfterMinutes, p.toMinute);
  const jobs = new Map(base.jobs.map(item => [item.id, item]));
  const claims: Claim[] = [], unknown = new Set<string>();
  for (const demand of stock.demands) {
    if (demand.quantity.state !== 'known') { unknown.add(demand.id); continue; }
    const job = jobs.get(demand.jobId)!, need = job.earliestStart ? Math.max(0, p.toMinute(job.earliestStart)) : 0;
    claims.push({ key: demand.id, demandId: demand.id, pool: poolKey(demand.warehouseId, demand.sku), quantity: demand.quantity.value, need, cls: demand.reservation ? 'protected' : 'released' });
  }
  const allocations = new Map(allocate(claims, resolved.supplies, resolved.potential, p.horizon).map(item => [item.demandId, item]));
  const never = p.at(p.horizon + 1), declaredNow: Provenance = { basis: 'declared', by: 'Plan B (ensayo)', declaredAt: base.clock.now };
  const model: TwinModel = { ...base, materials: [...base.materials], jobs: base.jobs.map(item => ({ ...item, materials: [...item.materials] })) };
  for (const demand of stock.demands) {
    const materialId = `inv-${demand.id}`.slice(0, 64), allocation = allocations.get(demand.id);
    const availableAt: Fact<string> = unknown.has(demand.id) || allocation?.state === 'short' ? { state: 'unknown', reason: 'not-provided' }
      : { state: 'known', value: allocation?.state === 'allocated' ? p.at(allocation.at!) : never, provenance: declaredNow };
    model.materials.push({ id: materialId, title: `Material de ${demand.id}`.slice(0, 160), source: null, warehouseId: demand.warehouseId, availableAt });
    model.jobs.find(item => item.id === demand.jobId)!.materials.push(materialId);
  }
  return model;
}

// Línea base sin escenario: fija qué se protege y a qué fecha. Un escenario (p. ej., una baja) no puede rebajar la vara: si deja tarde algo protegido, eso es incumplirlo.
const references = new WeakMap<Prepared, SimulationResult>();
function referenceBaseline(p: Prepared): SimulationResult {
  let found = references.get(p);
  if (!found) {
    const { base, stock } = applyScenario(p, null);
    found = simulatePlan(withBaseMaterials(p, base, stock), base.currentPlan!.plan);
    references.set(p, found);
  }
  return found;
}

function buildWorld(p: Prepared, offerIds: string[], scenario: DateCheckScenario | null, withCandidate: boolean, variant: Variant = {}): World {
  const { base, stock, withdrawn, fixedArrivals } = applyScenario(p, scenario);
  const offers = p.input.offers.filter(item => offerIds.includes(item.id));
  const available = offers.every(item => !withdrawn.has(item.id));
  const superseded: string[] = [];
  const conditions: Condition[] = [];
  // Línea base del escenario: plan actual completo, sin cambios declarados ni solicitud, CON el material de las demandas existentes. Fija qué se puede mover, qué ocupa la
  // agenda, las fechas de antes y lo que ya llegaba tarde por falta de material.
  const baseline = simulatePlan(withBaseMaterials(p, base, stock), base.currentPlan!.plan);
  const reference = scenario === null ? baseline : referenceBaseline(p);
  const busy = busyIntervals(baseline, p.horizon);
  const outcome = new Map(baseline.jobs.map(item => [item.jobId, item]));
  const resourceOf = new Map(base.currentPlan!.plan.sequences.flatMap(seq => seq.jobIds.map(jobId => [jobId, seq.resourceId] as const)));

  // ── Cambios declarados sobre el inventario y la capacidad ──
  let extraMinutes = 0;
  const released = new Map<string, number>();
  const requestMaterials = structuredClone(p.input.request.materials);
  const slots = new Map<string, { interval: Interval; offerId: string }[]>();
  for (const offer of offers) {
    if (withdrawn.has(offer.id)) continue;
    if (offer.type === 'use-reserved') released.set(offer.reservationId, (released.get(offer.reservationId) ?? 0) + offer.quantity);
    if (offer.type === 'confirm-arrival') {
      if (fixedArrivals.has(offer.inboundId)) { superseded.push(offer.id); continue; }
      const target = stock.inbound.find(item => item.id === offer.inboundId)!;
      target.arrival = { state: 'known', value: offer.arrivalAt, provenance: { basis: 'assumed', offerId: offer.id } as never };
    }
    if (offer.type === 'add-slot') {
      const start = Math.max(0, p.toMinute(offer.start)), end = Math.min(p.horizon, Math.floor((Date.parse(offer.end) - p.nowMs) / 60_000));
      if (start < end) { slots.set(offer.resourceId, [...slots.get(offer.resourceId) ?? [], { interval: [start, end], offerId: offer.id }]); extraMinutes += end - start; }
    }
    if (offer.type === 'substitute') { requestMaterials[offer.materialIndex].sku = offer.toSku; requestMaterials[offer.materialIndex].warehouseId = offer.toWarehouseId; }
  }
  if (variant.arrivalOverride) {
    const target = stock.inbound.find(item => item.id === variant.arrivalOverride!.inboundId)!;
    target.arrival = { state: 'known', value: variant.arrivalOverride.arrivalAt, provenance: { basis: 'assumed', offerId: 'check-arrival' } as never };
  }

  // ── Material: asignación en orden de prioridad ──
  const resolved = resolveInventory(stock, p.nowMs, base.rules.staleAfterMinutes, p.toMinute);
  const jobs = new Map(base.jobs.map(item => [item.id, item]));
  const claims: Claim[] = [], unknownQuantity: { demandId: string; pool: string }[] = [], demandJob = new Map<string, string>();
  for (const demand of stock.demands) {
    const pool = poolKey(demand.warehouseId, demand.sku), job = jobs.get(demand.jobId)!;
    demandJob.set(demand.id, demand.jobId);
    if (demand.quantity.state !== 'known') { unknownQuantity.push({ demandId: demand.id, pool }); continue; }
    const need = job.earliestStart ? Math.max(0, p.toMinute(job.earliestStart)) : 0;
    const give = demand.reservation ? Math.min(demand.quantity.value, released.get(demand.reservation.id) ?? 0) : 0;
    // Una demanda existente sin reserva no tiene prioridad sobre la solicitud: puede quedarse sin stock y aparecerá como afectada.
    const cls = demand.reservation ? 'protected' : 'released';
    if (demand.quantity.value - give > 0) claims.push({ key: demand.id, demandId: demand.id, pool, quantity: demand.quantity.value - give, need, cls });
    if (give > 0) claims.push({ key: `${demand.id}#cedida`, demandId: demand.id, pool, quantity: give, need, cls: 'released' });
  }
  const candidatePools: string[] = [];
  if (withCandidate) requestMaterials.forEach((item, index) => {
    const demandId = `${p.input.request.id}-m${index}`.slice(0, 64), pool = poolKey(item.warehouseId, item.sku);
    candidatePools.push(pool); demandJob.set(demandId, p.input.request.id);
    if (variant.relaxMaterial) return;
    if (item.quantity.state !== 'known') { unknownQuantity.push({ demandId, pool }); return; }
    claims.push({ key: demandId, demandId, pool, quantity: item.quantity.value, need: p.windowStart, cls: 'request' });
  });
  const allocations = allocate(claims, resolved.supplies, resolved.potential, p.horizon);
  const pendingInbound = new Map<string, string[]>();
  for (const item of resolved.potential) pendingInbound.set(item.pool, [...pendingInbound.get(item.pool) ?? [], item.id].sort(byId));

  // Materiales sintéticos del gemelo: uno por demanda. Fecha conocida = la asignación; desconocida si depende de una entrada sin fecha o cantidad; fuera del horizonte si es imposible.
  // Procedencia de una fecha de material: la asignación se apoya en TODAS las entradas del pool llegadas hasta ese instante. Si alguna es antigua o parcial, esa es la que
  // se cita, para que la advertencia llegue al trabajo; si no, la entrada que hizo posible la asignación o el primer lote.
  const supplyProvenance = (supplyId: string | null, pool: string, until: number | null): Provenance => {
    const relied = resolved.supplies.filter(item => item.pool === pool && (until === null || item.at <= until)).map(item => item.id);
    const evidence = resolved.evidence.filter(item => relied.includes(item.subject) && item.provenance).sort((a, b) => byId(a.subject, b.subject) || byId(a.field, b.field));
    const chosen = evidence.find(item => item.stale || item.partial)
      ?? (supplyId ? evidence.find(item => item.subject === supplyId && item.field === 'arrival') ?? evidence.find(item => item.subject === supplyId) : undefined)
      ?? evidence.find(item => resolved.supplies.some(entry => entry.id === item.subject && entry.kind === 'lot'))
      ?? evidence[0];
    return chosen?.provenance ? twinProvenance(chosen.provenance) : { basis: 'declared', by: 'Plan B (ensayo)', declaredAt: p.input.base.clock.now };
  };
  const materials: TwinModel['materials'] = [], materialOf = new Map<string, string>();
  const byDemand = new Map<string, Allocation[]>();
  for (const item of allocations) byDemand.set(item.demandId, [...byDemand.get(item.demandId) ?? [], item]);
  const never = new Date(p.nowMs + (p.horizon + 1) * 60_000).toISOString();
  for (const [demandId, parts] of byDemand) {
    const materialId = `inv-${demandId}`.slice(0, 64);
    materialOf.set(demandId, materialId);
    let availableAt: Fact<string>;
    if (parts.some(item => item.state === 'impossible')) availableAt = { state: 'known', value: never, provenance: supplyProvenance(null, parts[0].pool, null) };
    else if (parts.some(item => item.state === 'short')) availableAt = { state: 'unknown', reason: 'not-provided' };
    else {
      const last = [...parts].sort((a, b) => b.at! - a.at!)[0];
      availableAt = { state: 'known', value: p.at(last.at!), provenance: supplyProvenance(last.enabledBy, last.pool, last.at) };
    }
    materials.push({ id: materialId, title: `Material de ${demandId}`.slice(0, 160), source: null, warehouseId: parts[0].pool.split('/')[0], availableAt });
  }
  for (const item of unknownQuantity) {
    const materialId = `inv-${item.demandId}`.slice(0, 64);
    materialOf.set(item.demandId, materialId);
    materials.push({ id: materialId, title: `Material de ${item.demandId}`.slice(0, 160), source: null, warehouseId: item.pool.split('/')[0], availableAt: { state: 'unknown', reason: 'not-provided' } });
  }

  // ── Porción de cartera ──
  const capable = p.capable;
  const finishedBefore = (jobId: string) => { const item = outcome.get(jobId); return item?.finishMinute !== null && item?.finishMinute !== undefined && item.finishMinute <= p.windowStart; };
  const movable = new Set<string>();
  for (const seq of base.currentPlan!.plan.sequences) if (capable.includes(seq.resourceId)) for (const jobId of seq.jobIds) if (!finishedBefore(jobId)) movable.add(jobId);
  const sharedPools = new Set(withCandidate ? candidatePools : requestMaterials.map(item => poolKey(item.warehouseId, item.sku)));
  for (const offer of p.input.offers) if (offer.type === 'substitute') sharedPools.add(poolKey(offer.toWarehouseId, offer.toSku));
  for (const demand of stock.demands) if (sharedPools.has(poolKey(demand.warehouseId, demand.sku)) && !finishedBefore(demand.jobId)) movable.add(demand.jobId);
  for (let changed = true; changed;) {
    changed = false;
    const add = (jobId: string) => { if (!movable.has(jobId)) { movable.add(jobId); changed = true; } };
    for (const job of base.jobs) {
      if (movable.has(job.id)) {
        for (const dep of job.dependencies) if (dep.basis !== 'candidate' && !finishedBefore(dep.jobId)) add(dep.jobId);
        if (job.commitmentId) for (const sibling of base.jobs) if (sibling.commitmentId === job.commitmentId && !finishedBefore(sibling.id)) add(sibling.id);
      } else if (job.dependencies.some(dep => dep.basis !== 'candidate' && movable.has(dep.jobId))) add(job.id);
    }
  }
  if (movable.size > dateCheckLimits.movableJobs) throw new OperationalInputError('limit', `La porción de cartera supera ${dateCheckLimits.movableJobs} trabajos movibles.`);
  const sliceResources = new Set<string>(capable);
  for (const jobId of movable) {
    const job = jobs.get(jobId)!, current = resourceOf.get(jobId);
    if (current) sliceResources.add(current);
    for (const resource of base.resources) if (resource.executesJobs && job.skills.every(skill => resource.skills.includes(skill))) sliceResources.add(resource.id);
  }
  const caveats: SliceInfo['caveats'] = [];
  let frozenCount = 0;
  const resources: TwinResource[] = base.resources.filter(item => sliceResources.has(item.id)).map(resource => {
    const frozen = (base.currentPlan!.plan.sequences.find(seq => seq.resourceId === resource.id)?.jobIds ?? []).filter(jobId => !movable.has(jobId));
    frozenCount += frozen.length;
    const blocked: Interval[] = [];
    for (const jobId of frozen) {
      const intervals = busy.get(jobId) ?? [];
      const state = outcome.get(jobId);
      if (state?.status !== 'finished') {
        // Trabajo fijo sin horario conocido: no se usa el tiempo del recurso a partir de donde podría empezar. Conservador, y queda señalado.
        caveats.push({ code: 'unknown-frozen-work', resourceId: resource.id, jobId });
        const queue = base.currentPlan!.plan.sequences.find(seq => seq.resourceId === resource.id)!.jobIds;
        const prior = queue.slice(0, queue.indexOf(jobId)).map(item => outcome.get(item)?.finishMinute ?? 0);
        blocked.push([Math.max(0, ...prior), p.horizon]);
      }
      blocked.push(...intervals);
    }
    for (const job of base.jobs) if (!resourceOf.has(job.id) && !movable.has(job.id) && resource.executesJobs && job.skills.every(skill => resource.skills.includes(skill)) && job.skills.length) {
      if (!caveats.some(item => item.jobId === job.id && item.resourceId === resource.id)) caveats.push({ code: 'unplanned-work', resourceId: resource.id, jobId: job.id });
    }
    const extra = slots.get(resource.id) ?? [];
    if (resource.windows.state !== 'known') return { ...structuredClone(resource) };
    const own = resource.windows.value.map(item => [Math.max(0, p.toMinute(item.start)), Math.min(p.horizon, Math.floor((Date.parse(item.end) - p.nowMs) / 60_000))] as Interval);
    const windows = subtract(union([...own, ...extra.map(item => item.interval)]), union(blocked));
    const provenance: Provenance = extra.length ? { basis: 'assumed', suppositionId: extra[0].offerId } : resource.windows.provenance;
    return { ...structuredClone(resource), windows: { state: 'known', value: windows.map(([start, end]) => ({ start: p.at(start), end: p.at(end) })), provenance } };
  });
  for (const resource of resources) for (const job of base.jobs) {
    if (!movable.has(job.id) || resourceOf.get(job.id) !== resource.id) continue;
    if (outcome.get(job.id)?.status === 'indeterminate' && capable.includes(resource.id)) caveats.push({ code: 'unknown-frozen-work', resourceId: resource.id, jobId: job.id });
  }

  const sliceJobs: TwinJob[] = base.jobs.filter(item => movable.has(item.id)).map(job => {
    const copy: TwinJob = structuredClone(job);
    let earliest = copy.earliestStart ? Date.parse(copy.earliestStart) : Number.NEGATIVE_INFINITY;
    copy.dependencies = copy.dependencies.filter(dep => {
      if (dep.basis === 'candidate' || movable.has(dep.jobId)) return true;
      const finish = outcome.get(dep.jobId)?.finishMinute;
      if (finish !== null && finish !== undefined) earliest = Math.max(earliest, p.nowMs + finish * 60_000);
      return false;
    }).map(dep => dep.basis === 'candidate' && !movable.has(dep.jobId) ? null : dep).filter((dep): dep is NonNullable<typeof dep> => dep !== null);
    if (Number.isFinite(earliest)) copy.earliestStart = new Date(earliest).toISOString();
    const own = stock.demands.filter(item => item.jobId === job.id).map(item => materialOf.get(item.id)!).filter(Boolean);
    copy.materials = [...copy.materials, ...own].sort(byId);
    return copy;
  });
  if (withCandidate) {
    const request = p.input.request;
    const duration: Fact<number> = variant.durationOverride !== undefined ? { state: 'known', value: variant.durationOverride, provenance: { basis: 'assumed', suppositionId: 'check-duration' } } : twinFact(request.duration);
    sliceJobs.push({
      id: request.id, title: request.title, kind: 'request', source: request.source, commitmentId: request.id,
      duration, travel: twinFact(request.travel), skills: [...request.skills],
      materials: variant.relaxMaterial ? [] : requestMaterials.map((_, index) => `inv-${request.id}-m${index}`.slice(0, 64)).sort(byId),
      earliestStart: p.at(p.windowStart), dependencies: [],
    });
    if (request.duration.state !== 'known' && variant.durationOverride === undefined) conditions.push({ code: request.duration.state === 'unknown' ? 'unknown-duration' : 'unknown-duration', subject: request.id });
    if (request.travel.state !== 'known') conditions.push({ code: 'unknown-travel', subject: request.id });
  }
  const usedMaterials = new Set(sliceJobs.flatMap(item => item.materials));
  const commitmentIds = new Set(sliceJobs.flatMap(item => item.commitmentId && item.commitmentId !== p.input.request.id ? [item.commitmentId] : []));

  // Fechas de antes, de la simulación completa del plan actual (los compromisos fijos no cambian por construcción).
  const before = new Map(baseline.commitments.map(item => [item.commitmentId, { projection: item.projection, completionMinute: item.completionMinute }]));
  const guardBefore = reference === baseline ? before : new Map(reference.commitments.map(item => [item.commitmentId, { projection: item.projection, completionMinute: item.completionMinute }]));
  const protectedDue = new Map<string, { due: number; basis: 'due' | 'projected' }>(), protectedLate: string[] = [];
  const commitments: TwinModel['commitments'] = base.commitments.filter(item => commitmentIds.has(item.id)).map(item => {
    const copy = structuredClone(item);
    if (p.input.policy.protected.includes(item.id)) {
      const prior = guardBefore.get(item.id)!, due = Math.floor((Date.parse(item.dueAt) - p.nowMs) / 60_000);
      // Proteger lo que ya llega tarde = no empeorar su fecha proyectada. Lo indeterminado no se puede proteger con una fecha: queda sin nivel y se informa.
      if (prior.projection === 'late' && prior.completionMinute !== null) {
        protectedDue.set(item.id, { due: prior.completionMinute, basis: 'projected' }); protectedLate.push(item.id); copy.dueAt = p.at(prior.completionMinute);
      } else if (prior.projection === 'on-time') protectedDue.set(item.id, { due, basis: 'due' });
    }
    return copy;
  });
  if (withCandidate) commitments.push({ id: p.input.request.id, revision: sha256Hex(`date-check-request:${p.input.request.id}`), title: p.input.request.title, dueAt: p.input.request.requestedAt });

  const model: TwinModel = {
    format: base.format, clock: structuredClone(base.clock), rules: structuredClone(base.rules),
    resources: resources.sort((a, b) => byId(a.id, b.id)),
    materials: [...base.materials.filter(item => usedMaterials.has(item.id)), ...materials.filter(item => usedMaterials.has(item.id))].sort((a, b) => byId(a.id, b.id)),
    commitments: commitments.sort((a, b) => byId(a.id, b.id)),
    jobs: sliceJobs.sort((a, b) => byId(a.id, b.id)),
    currentPlan: null,
  };
  if (offers.length) for (const offer of offers) if (!withdrawn.has(offer.id) && !superseded.includes(offer.id)) conditions.push({ code: 'offer', offerId: offer.id, offerType: offer.type });
  return {
    model, allocations, supplies: resolved.supplies, demandJob, materialOf, candidatePools,
    slice: { movableJobs: [...movable].sort(byId), frozenJobs: frozenCount, resources: [...sliceResources].sort(byId), commitments: [...commitmentIds].sort(byId), frozenBefore: p.at(p.windowStart), caveats },
    before, protectedDue, protectedLate, superseded, available, extraMinutes, conditions, pendingInbound, resourceBefore: new Map(resourceOf),
  };
}

// ── Búsquedas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Tally = { runs: number; nodes: number; complete: boolean; stoppedBy: 'node-budget' | 'cancelled' | null };
const withDue = (model: TwinModel, commitment: string, minute: number, at: (m: number) => string): TwinModel => ({
  ...model, commitments: model.commitments.map(item => item.id === commitment ? { ...item, dueAt: at(minute) } : item),
});

function tiersFor(world: World, requestId: string | null, policy: DateCheckInput['policy']): Objectives {
  const present = new Set(world.model.commitments.map(item => item.id));
  const guarded = [...world.protectedDue.keys()].filter(item => present.has(item)).sort(byId);
  const rest = policy.tiers.map(tier => tier.filter(item => present.has(item) && !guarded.includes(item))).filter(tier => tier.length);
  return { tiers: [guarded, ...(requestId ? [[requestId]] : []), ...rest].filter(tier => tier.length) };
}

// Cada búsqueda cede el control antes de empezar, para que la interfaz pueda pausar o cancelar entre búsquedas pequeñas (el planificador solo cede cada 256 nodos).
// Cancelada antes de empezar: se hace la búsqueda mínima (un nodo), que nunca afirma completitud; cualquier plan que devuelva sigue siendo un testigo válido si cumple.
function* run(model: TwinModel, objectives: Objectives, control: DateCheckControl, tally: Tally): Steps<PlanResult> {
  yield;
  const cancelled = control.shouldStop?.() ?? false;
  const result = yield* planScheduleSteps(model, objectives, { nodeBudget: cancelled ? 1 : control.nodeBudget ?? dateCheckLimits.nodeBudget, shouldStop: control.shouldStop });
  tally.runs += 1; tally.nodes += result.search.nodes;
  if (cancelled) { result.search = { ...result.search, complete: false, stoppedBy: 'cancelled', optimality: 'best-found' }; }
  if (!result.search.complete) { tally.complete = false; tally.stoppedBy = result.search.stoppedBy; }
  return result;
}

type Verdict = { meets: boolean; complete: boolean; result: PlanResult; protectedMissed: number };
// El trabajo tiene que terminar dentro de su ventana: si la ventana se cierra antes, ese cierre es el plazo real aunque la fecha pedida sea posterior.
const deadlineOf = (p: Prepared, minute: number) => p.windowLimit === null ? minute : Math.min(minute, p.windowLimit);
function* tryDue(p: Prepared, world: World, minute: number, protectedFloor: number, control: DateCheckControl, tally: Tally): Steps<Verdict> {
  const model = withDue(world.model, p.input.request.id, deadlineOf(p, minute), p.at);
  const objectives = tiersFor(world, p.input.request.id, p.input.policy);
  const result = yield* run(model, objectives, control, tally);
  const guarded = world.protectedDue.size ? 1 : 0;
  const protectedMissed = guarded ? result.key.missedByTier[0] : 0;
  const candidate = result.simulation.commitments.find(item => item.commitmentId === p.input.request.id)!;
  return { meets: protectedMissed <= protectedFloor && candidate.projection === 'on-time', complete: result.search.complete, result, protectedMissed };
}

// ── Una alternativa ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function* evaluateAlternative(p: Prepared, offerIds: string[], scenario: DateCheckScenario | null, control: DateCheckControl, full: boolean): Steps<AlternativeResult> {
  const tally: Tally = { runs: 0, nodes: 0, complete: true, stoppedBy: null };
  const altId = offerIds.length ? `alt-${offerIds.join('+')}` : 'alt-mantener';
  const world = buildWorld(p, offerIds, scenario, true);
  const empty = (): AlternativeResult => ({
    id: altId, offerIds, authorization: 'unconfirmed', available: false, superseded: world.superseded,
    requested: { at: p.input.request.requestedAt, outcome: 'unknown', classification: 'incomplete' }, supported: { at: null, basis: 'none', proven: false },
    protections: [], material: { ok: false, demands: [] }, staffing: { ok: null, completionIfMaterial: null }, blockers: [], conditions: [], affected: [], reservationsConsumed: [],
    extraMinutes: world.extraMinutes, plan: null, candidate: null, balanceViolations: 0, search: tally,
  });
  if (!world.available) return empty();

  // Suelo de protecciones: lo que ya se incumple con este cambio aunque no exista la solicitud (p. ej., ceder reservadas deja corta una entrega).
  const without = buildWorld(p, offerIds, scenario, false);
  const floorRun = yield* run(without.model, tiersFor(without, null, p.input.policy), control, tally);
  const guardedPresent = [...without.protectedDue.keys()].filter(item => without.model.commitments.some(entry => entry.id === item));
  // Un suelo de una búsqueda incompleta solo es una cota superior: se usa 0, que es conservador (nunca da por buena una alternativa que rompe una protección evitable).
  const floorComplete = floorRun.search.complete;
  const protectedFloor = guardedPresent.length && floorComplete ? floorRun.key.missedByTier[0] : 0;
  const brokenAlone = new Set(floorRun.simulation.commitments.filter(item => without.protectedDue.has(item.commitmentId) && item.projection !== 'on-time').map(item => item.commitmentId));

  const requested = yield* tryDue(p, world, p.requestedMinute, protectedFloor, control, tally);
  const candidateOutcome = requested.result.simulation.commitments.find(item => item.commitmentId === p.input.request.id)!;
  const indeterminate = candidateOutcome.projection === 'indeterminate';

  // Primera fecha sustentada: bisección sobre el plazo de la solicitud. «Cabe» = no se incumplen más protecciones que el suelo y la solicitud llega a tiempo.
  let supportedMinute: number | null = null, supportedProven = true, finalRun = requested.result, protectionBound = false;
  if (!indeterminate) {
    const work = (() => { const job = world.model.jobs.find(item => item.id === p.input.request.id)!; return job.duration.state === 'known' && job.travel.state === 'known' ? job.duration.value + job.travel.value : 1; })();
    // Cota inferior: no antes de la ventana más el trabajo, ni antes de que llegue su material. Cota superior: el horizonte, o la terminación tardía del plan de la fecha
    // pedida si ese plan ya respeta las protecciones (es un testigo de que esa fecha cabe).
    const materialAt = Math.max(0, ...world.allocations.filter(item => world.demandJob.get(item.demandId) === p.input.request.id && item.at !== null).map(item => item.at!));
    let lo = Math.max(p.windowStart + work, materialAt + work, 1), hi = p.windowEnd;
    const late = requested.result.simulation.commitments.find(item => item.commitmentId === p.input.request.id)!;
    const witness = !requested.meets && requested.protectedMissed <= protectedFloor && late.completionMinute !== null && late.completionMinute <= hi ? late.completionMinute : null;
    if (witness !== null) hi = witness;
    const top = requested.meets ? requested : hi >= lo ? yield* tryDue(p, world, hi, protectedFloor, control, tally) : null;
    if (top && !top.meets && top.protectedMissed > protectedFloor) protectionBound = true;
    if (top?.meets) {
      if (requested.meets) hi = Math.min(hi, p.requestedMinute);
      let best = top;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2), probe = yield* tryDue(p, world, mid, protectedFloor, control, tally);
        if (probe.meets) { hi = mid; best = probe; } else { if (!probe.complete) supportedProven = false; lo = mid + 1; }
      }
      // El plan testigo da la fecha exacta de terminación; el plazo encontrado por bisección es una cota que coincide con ella cuando la búsqueda es completa.
      const witness = best.result.simulation.commitments.find(item => item.commitmentId === p.input.request.id)!;
      supportedMinute = witness.completionMinute ?? hi;
      finalRun = requested.meets ? requested.result : best.result;
    } else if (top && !top.complete) supportedProven = false;
  }
  if (requested.meets) finalRun = requested.result;

  // Personal: misma pregunta sin restricción de material. Material: ¿llega a tiempo para empezar y terminar en la fecha pedida?
  let staffingOk: boolean | null = null, completionIfMaterial: string | null = null, staffingRun: PlanResult | null = null;
  if (full && !indeterminate) {
    const relaxed = buildWorld(p, offerIds, scenario, true, { relaxMaterial: true });
    const probe = yield* tryDue(p, relaxed, p.requestedMinute, protectedFloor, control, tally);
    staffingRun = probe.result;
    staffingOk = probe.meets ? true : probe.complete ? false : null;
    const outcome = probe.result.simulation.commitments.find(item => item.commitmentId === p.input.request.id)!;
    completionIfMaterial = outcome.completionAt;
  }
  const work = (() => { const job = world.model.jobs.find(item => item.id === p.input.request.id)!; return job.duration.state === 'known' && job.travel.state === 'known' ? job.duration.value + job.travel.value : null; })();
  const requestAllocations = world.allocations.filter(item => world.demandJob.get(item.demandId) === p.input.request.id);
  const latestStart = work === null ? null : deadlineOf(p, p.requestedMinute) - work;
  const demands: AlternativeResult['material']['demands'] = p.input.request.materials.map((item, index) => {
    const demandId = `${p.input.request.id}-m${index}`.slice(0, 64), parts = requestAllocations.filter(entry => entry.demandId === demandId);
    const pool = parts[0]?.pool ?? poolKey(item.warehouseId, item.sku);
    if (!parts.length) return { demandId, pool, quantity: item.quantity.state === 'known' ? item.quantity.value : 0, state: 'unknown-quantity' as const, availableAt: null, enabledBy: null };
    const part = parts[0];
    return { demandId, pool, quantity: part.quantity, state: part.state, availableAt: part.at === null ? null : p.at(part.at), enabledBy: part.enabledBy };
  });
  const materialOk = demands.every(item => item.state === 'allocated' && item.availableAt !== null && latestStart !== null && p.toMinute(item.availableAt) <= latestStart);

  // ── Explicación a partir del plan y de las restricciones ──
  const simulation = finalRun.simulation;
  const protections: AlternativeResult['protections'] = [...world.protectedDue.entries()].sort((a, b) => byId(a[0], b[0])).map(([commitmentId, entry]) => {
    const outcome = simulation.commitments.find(item => item.commitmentId === commitmentId);
    return { commitmentId, protectedAt: p.at(entry.due), basis: entry.basis, kept: outcome ? outcome.projection === 'on-time' : null, brokenByChangeAlone: brokenAlone.has(commitmentId) };
  });
  const blockers: Blocker[] = [];
  if (!requested.meets) {
    for (const item of demands) {
      if (item.state === 'allocated' && item.availableAt !== null && latestStart !== null && p.toMinute(item.availableAt) <= latestStart) continue;
      const part = requestAllocations.find(entry => entry.demandId === item.demandId);
      blockers.push({ code: 'material', demandId: item.demandId, pool: item.pool, quantity: item.quantity, neededBy: p.at(latestStart ?? p.requestedMinute), availableAt: item.availableAt, enabledBy: item.enabledBy, shortAtNeed: part?.shortAtNeed ?? item.quantity, pendingInbound: world.pendingInbound.get(item.pool) ?? [] });
    }
    if (staffingOk === false && staffingRun && work !== null) {
      // Capacidad de los recursos habilitados entre el inicio de la ventana y la fecha pedida, y quién la ocupa en el mejor plan sin restricción de material.
      const span: Interval = [p.windowStart, deadlineOf(p, p.requestedMinute)];
      let freeMinutes = 0;
      const occupied = new Map<string, number>();
      for (const resourceId of p.capable) {
        const resource = world.model.resources.find(item => item.id === resourceId);
        if (!resource || resource.windows.state !== 'known') continue;
        const windows = resource.windows.value.map(item => [p.toMinute(item.start), Math.floor((Date.parse(item.end) - p.nowMs) / 60_000)] as Interval);
        freeMinutes += windows.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, span[1]) - Math.max(start, span[0])), 0);
        for (const [jobId, intervals] of busyIntervals(staffingRun.simulation, p.horizon)) {
          if (jobId === p.input.request.id) continue;
          const job = staffingRun.simulation.jobs.find(item => item.jobId === jobId);
          if (job?.resourceId !== resourceId) continue;
          const used = intervals.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, span[1]) - Math.max(start, span[0])), 0);
          if (used > 0) occupied.set(jobId, (occupied.get(jobId) ?? 0) + used);
        }
      }
      const occupiedBy = [...occupied.entries()].sort((a, b) => byId(a[0], b[0])).map(([jobId, minutes]) => {
        const commitment = world.model.jobs.find(item => item.id === jobId)?.commitmentId ?? null;
        return { jobId, commitmentId: commitment, protected: commitment !== null && world.protectedDue.has(commitment), minutes };
      });
      blockers.push({ code: 'staffing', resourceIds: p.capable, windowStart: p.at(p.windowStart), requestedAt: p.input.request.requestedAt, neededMinutes: work, freeMinutes: freeMinutes - occupiedBy.reduce((sum, item) => sum + item.minutes, 0), occupiedBy });
    }
    // Sin fecha sustentada: si el plan con el horizonte como plazo ya rompía una protección, la causa es la protección (se lista abajo), no el horizonte.
    // Si la ventana de la solicitud se cierra antes que el horizonte, el límite que no se alcanza es la ventana.
    if (supportedMinute === null && !indeterminate && supportedProven && !protectionBound) {
      blockers.push(p.windowLimit !== null && p.windowLimit < p.horizon ? { code: 'window', windowEnd: p.at(p.windowLimit) } : { code: 'horizon', horizonEnd: p.input.base.clock.horizonEnd });
    }
  }
  for (const protection of protections) if (protection.kept === false) {
    const outcome = simulation.commitments.find(item => item.commitmentId === protection.commitmentId)!;
    blockers.push({ code: 'protection', commitmentId: protection.commitmentId, protectedAt: protection.protectedAt, projectedAt: outcome.completionAt, projection: outcome.projection, causes: outcome.causes });
  }

  const conditions: Condition[] = [...world.conditions];
  for (const item of demands) if (item.state === 'short' || item.state === 'unknown-quantity') conditions.push({ code: 'unknown-material', demandId: item.demandId, pool: item.pool, pendingInbound: world.pendingInbound.get(item.pool) ?? [] });
  const candidateJob = simulation.jobs.find(item => item.jobId === p.input.request.id)!;
  const seen = new Set<string>();
  for (const caveat of [...candidateJob.caveats]) {
    if (caveat.code !== 'stale-evidence' && caveat.code !== 'partial-source') continue;
    const key = `${caveat.code}:${caveat.subject}:${caveat.field}`;
    if (!seen.has(key)) { seen.add(key); conditions.push({ code: caveat.code, subject: caveat.subject, field: caveat.field }); }
  }
  for (const caveat of world.slice.caveats) {
    if (caveat.code === 'unknown-frozen-work' && candidateJob.resourceId === caveat.resourceId) conditions.push({ code: 'unknown-work-on-resource', resourceId: caveat.resourceId, jobId: caveat.jobId });
  }

  const titles = new Map(p.input.base.commitments.map(item => [item.id, item.title]));
  const affected: AffectedCommitment[] = simulation.commitments.filter(item => item.commitmentId !== p.input.request.id).map(item => {
    const prior = world.before.get(item.commitmentId)!;
    const delta = prior.completionMinute !== null && item.completionMinute !== null ? item.completionMinute - prior.completionMinute : null;
    const rank: Record<Projection, number> = { 'on-time': 0, late: 1, 'not-completed': 2, indeterminate: -1 };
    let effect: AffectedCommitment['effect'] = 'same';
    // Para lo que ya llegaba tarde y está protegido, la referencia es su fecha proyectada: el plazo del modelo se movió a ella.
    const originalDue = Math.floor((Date.parse(p.input.base.commitments.find(entry => entry.id === item.commitmentId)!.dueAt) - p.nowMs) / 60_000);
    const projection: Projection = item.projection === 'on-time' && item.completionMinute !== null && item.completionMinute > originalDue ? 'late' : item.projection;
    if (prior.projection === 'indeterminate' || projection === 'indeterminate') effect = prior.projection === projection ? 'same' : 'unknown';
    else if (rank[projection] !== rank[prior.projection]) effect = rank[projection] < rank[prior.projection] ? 'improves' : 'worsens';
    else if (projection === 'late' && delta) effect = delta < 0 ? 'improves' : 'worsens';
    else if (delta) effect = delta > 0 ? 'later' : 'earlier';
    const reassigned = world.model.jobs.filter(job => job.commitmentId === item.commitmentId).flatMap(job => {
      const from = world.resourceBefore.get(job.id) ?? null, to = simulation.jobs.find(entry => entry.jobId === job.id)?.resourceId ?? null;
      return from !== to ? [{ jobId: job.id, from, to }] : [];
    });
    return {
      commitmentId: item.commitmentId, title: titles.get(item.commitmentId) ?? item.commitmentId, protected: p.input.policy.protected.includes(item.commitmentId),
      before: { projection: prior.projection, completionAt: prior.completionMinute === null ? null : p.at(prior.completionMinute) },
      after: { projection, completionAt: item.completionAt }, effect, deltaMinutes: delta, reassigned,
    };
  }).sort((a, b) => byId(a.commitmentId, b.commitmentId));

  const reservationsConsumed: AlternativeResult['reservationsConsumed'] = [];
  for (const offer of p.input.offers.filter(item => offerIds.includes(item.id) && item.type === 'use-reserved')) {
    if (offer.type !== 'use-reserved') continue;
    const demand = p.input.inventory.demands.find(item => item.reservation?.id === offer.reservationId)!;
    const part = world.allocations.find(item => item.key === `${demand.id}#cedida`);
    const job = p.input.base.jobs.find(item => item.id === demand.jobId);
    reservationsConsumed.push({
      reservationId: offer.reservationId, demandId: demand.id, commitmentId: job?.commitmentId ?? null, quantity: part?.quantity ?? offer.quantity,
      shortUntil: part?.state === 'allocated' && part.at !== null && part.at > part.need ? p.at(part.at) : null, state: part?.state ?? 'allocated',
    });
  }

  // Saldo con los consumos reales del plan elegido: ningún pool puede quedar negativo.
  const consumptions = world.allocations.flatMap(item => {
    const jobId = world.demandJob.get(item.demandId);
    const start = simulation.jobs.find(entry => entry.jobId === jobId)?.startMinute;
    return start === null || start === undefined ? [] : [{ demandId: item.key, pool: item.pool, quantity: item.quantity, at: start }];
  });
  const balanceViolations = checkBalances(world.supplies, consumptions).length;

  const offerConditions = conditions.filter(item => item.code === 'offer').length;
  const otherConditions = conditions.length - offerConditions;
  let classification: DateCheckClass;
  if (indeterminate) classification = 'conditioned';
  else if (requested.meets) classification = offerConditions || otherConditions ? 'conditioned' : 'verified';
  else if (!requested.complete || !floorComplete) classification = 'incomplete';
  else classification = 'conflict';
  const outcome: AlternativeResult['requested']['outcome'] = indeterminate ? 'unknown' : requested.meets ? 'meets' : 'misses';
  const supportedBasis: AlternativeResult['supported']['basis'] = supportedMinute === null ? 'none' : offerConditions || otherConditions ? 'conditioned' : 'evidence';
  const candidate = { resourceId: candidateJob.resourceId, startAt: candidateJob.startAt, finishAt: candidateJob.finishAt };

  return {
    id: altId, offerIds, authorization: 'unconfirmed', available: true, superseded: world.superseded,
    requested: { at: p.input.request.requestedAt, outcome, classification },
    supported: { at: supportedMinute === null ? null : p.at(supportedMinute), basis: supportedBasis, proven: supportedProven },
    protections, material: { ok: materialOk, demands }, staffing: { ok: staffingOk, completionIfMaterial }, blockers, conditions, affected, reservationsConsumed,
    extraMinutes: world.extraMinutes, plan: finalRun.plan, candidate, balanceViolations, search: tally,
  };
}

// ── Punto de entrada ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const outcomeRank = { meets: 0, unknown: 1, misses: 2 } as const;
function rank(list: AlternativeResult[]): string[] {
  const broken = (item: AlternativeResult) => item.protections.filter(entry => entry.kept === false).length;
  const worsened = (item: AlternativeResult) => item.affected.filter(entry => entry.effect === 'worsens').length;
  const reserved = (item: AlternativeResult) => item.reservationsConsumed.reduce((sum, entry) => sum + entry.quantity, 0);
  return list.filter(item => item.available).sort((a, b) =>
    broken(a) - broken(b)
    || outcomeRank[a.requested.outcome] - outcomeRank[b.requested.outcome]
    || (a.supported.at === null ? Infinity : Date.parse(a.supported.at)) - (b.supported.at === null ? Infinity : Date.parse(b.supported.at))
    || worsened(a) - worsened(b)
    || a.offerIds.length - b.offerIds.length
    || a.extraMinutes - b.extraMinutes
    || reserved(a) - reserved(b)
    || byId(a.id, b.id)).map(item => item.id);
}

function subsets(ids: string[]): string[][] {
  const all: string[][] = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) all.push(ids.filter((_, index) => mask & (1 << index)));
  return all.sort((a, b) => a.length - b.length || byId(a.join('+'), b.join('+')));
}

export function* checkDateSteps(raw: DateCheckInput, control: DateCheckControl = {}): Steps<DateCheckResult> {
  const p = prepare(raw);
  const offerIds = p.input.offers.map(item => item.id).sort(byId);
  const alternatives: AlternativeResult[] = [];
  for (const subset of subsets(offerIds)) alternatives.push(yield* evaluateAlternative(p, subset, null, control, true));
  const ranking = rank(alternatives);

  // Matriz por escenarios declarados: solo la fecha pedida y las protecciones. Sus búsquedas (y las de «qué confirmar primero») cuentan en el total: si se cancelan,
  // el resultado no se puede certificar como completo.
  const extra: Tally = { runs: 0, nodes: 0, complete: true, stoppedBy: null };
  const fold = (search: Tally) => {
    extra.runs += search.runs; extra.nodes += search.nodes;
    if (!search.complete) { extra.complete = false; if (extra.stoppedBy === null) extra.stoppedBy = search.stoppedBy; }
  };
  const scenarios: ScenarioCell[] = [];
  for (const scenario of p.input.scenarios) for (const subset of subsets(offerIds)) {
    const result = yield* evaluateAlternative(p, subset, scenario, control, false);
    fold(result.search);
    // Un «no llega» o una protección rota de una búsqueda incompleta no está demostrado: se informa como desconocido.
    const broken = result.protections.some(item => item.kept === false), incomplete = !result.search.complete;
    scenarios.push({
      scenarioId: scenario.id, alternativeId: result.id,
      outcome: !result.available ? 'not-available' : incomplete && result.requested.outcome === 'misses' ? 'unknown' : result.requested.outcome,
      protectionsKept: !result.available ? null : !broken ? true : incomplete ? null : false, supportedAt: result.supported.at,
    });
  }

  // Qué conviene confirmar primero. Para la mejor alternativa que cumple la fecha sin romper protecciones: cada condición, cuántas alternativas que cumplen dependen de ella y,
  // para una llegada, la última fecha que todavía sirve. Para un dato ausente de la solicitud: el valor máximo que todavía cumple.
  const checkFirst: CheckFirst[] = [];
  const meeting = alternatives.filter(item => item.available && item.requested.outcome === 'meets' && item.protections.every(entry => entry.kept !== false));
  const best = ranking.map(entryId => alternatives.find(item => item.id === entryId)!).find(item => meeting.includes(item));
  if (best) {
    const entries: (CheckFirst & { weight: number })[] = [];
    for (const offerId of best.offerIds) {
      const offer = p.input.offers.find(item => item.id === offerId)!;
      const dependents = meeting.filter(item => item.offerIds.includes(offerId)).map(item => item.id);
      if (offer.type === 'confirm-arrival') {
        // Hasta el horizonte: la llegada puede servir aunque sea posterior a la fecha pedida si repone antes de que la necesite una reserva protegida.
        let lo = 0, hi = p.horizon, found: number | null = null;
        const others = best.offerIds.filter(item => item !== offerId);
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const world = buildWorld(p, others, null, true, { arrivalOverride: { inboundId: offer.inboundId, arrivalAt: p.at(mid) } });
          const floor = (yield* run(buildWorld(p, others, null, false).model, tiersFor(world, null, p.input.policy), control, extra)).key.missedByTier[0] ?? 0;
          const probe = yield* tryDue(p, world, p.requestedMinute, world.protectedDue.size ? floor : 0, control, extra);
          if (probe.meets) { found = mid; lo = mid + 1; } else hi = mid - 1;
        }
        entries.push({ kind: 'inbound-arrival', inboundId: offer.inboundId, alternativeId: best.id, neededBy: found === null ? null : p.at(found), dependents, weight: dependents.length * 2 + 1 });
      } else if (offer.type === 'add-slot') entries.push({ kind: 'slot', offerId, alternativeId: best.id, dependents, weight: dependents.length * 2 });
      else if (offer.type === 'use-reserved') entries.push({ kind: 'reservation', offerId, alternativeId: best.id, dependents, weight: dependents.length * 2 });
      else entries.push({ kind: 'substitute', offerId, alternativeId: best.id, dependents, weight: dependents.length * 2 });
    }
    // Primero lo que más alternativas sostiene; a igualdad, la llegada de un proveedor (dato externo ausente) antes que un cambio interno.
    entries.sort((a, b) => b.weight - a.weight);
    checkFirst.push(...entries.map(({ weight: _weight, ...rest }) => rest as CheckFirst));
  }
  if (p.input.request.duration.state !== 'known') {
    let lo = 1, hi = Math.max(1, p.requestedMinute - p.windowStart), found: number | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const world = buildWorld(p, [], null, true, { durationOverride: mid });
      const floorWorld = buildWorld(p, [], null, false);
      const floor = (yield* run(floorWorld.model, tiersFor(floorWorld, null, p.input.policy), control, extra)).key.missedByTier[0] ?? 0;
      const probe = yield* tryDue(p, world, p.requestedMinute, world.protectedDue.size ? floor : 0, control, extra);
      if (probe.meets) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    checkFirst.push({ kind: 'duration', subject: p.input.request.id, maxMinutes: found });
  }

  const tally = [...alternatives.map(item => item.search), extra].reduce((sum, item) => ({
    runs: sum.runs + item.runs, nodes: sum.nodes + item.nodes, complete: sum.complete && item.complete, stoppedBy: sum.stoppedBy ?? item.stoppedBy,
  }), { runs: 0, nodes: 0, complete: true, stoppedBy: null as Tally['stoppedBy'] });
  const reference = buildWorld(p, [], null, true);
  return {
    format: dateCheckFormat, kind: 'rehearsal', hypothetical: true, requiresConfirmation: true, engineVersion: dateCheckEngineVersion,
    inputRevision: dateCheckRevision(p.input), baseRevision: operationalRevision(p.input.base), inventoryRevision: inventoryRevision(p.input.inventory),
    evaluatedAt: p.input.base.clock.now,
    request: { id: p.input.request.id, title: p.input.request.title, requestedAt: p.input.request.requestedAt, windowStart: p.at(p.windowStart) },
    objective: { tiers: tiersFor(reference, p.input.request.id, p.input.policy).tiers, explanation: 'protected-then-request-then-rest', protectedLate: reference.protectedLate },
    slice: reference.slice, alternatives, ranking, scenarios, checkFirst, search: tally,
  };
}
export const checkDate = (input: DateCheckInput, control: DateCheckControl = {}) => drain(checkDateSteps(input, control));

// Una confirmación solo vale para la revisión exacta que se ensayó. Un cambio de cartera, recursos, reservas o cambios declarados la invalida.
export function assertCurrent(result: Pick<DateCheckResult, 'inputRevision'>, current: DateCheckInput): { current: true } | { current: false; reason: 'revision-changed'; currentRevision: string } {
  const revision = dateCheckRevision(dateCheckInput.parse(current));
  return revision === result.inputRevision ? { current: true } : { current: false, reason: 'revision-changed', currentRevision: revision };
}

// Comprobación de compilación del modelo de una alternativa, útil para pruebas: el modelo de la porción es un modelo válido del gemelo.
export function sliceModel(input: DateCheckInput, offerIds: string[] = [], scenarioId: string | null = null): TwinModel {
  const p = prepare(input);
  const scenario = scenarioId ? p.input.scenarios.find(item => item.id === scenarioId) ?? null : null;
  const world = buildWorld(p, offerIds, scenario, true);
  compileModel(world.model);
  return world.model;
}
export type { OperationalModel };
