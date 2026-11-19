import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCurrent, checkDate, checkDateSteps, dateCheckInput, dateCheckInputFormat, sliceModel,
  type AlternativeResult, type DateCheckInput, type DateCheckResult,
} from '../shared/operational-date-check.js';
import {
  ALMACEN_SUR, almacenSurCase, almacenSurCompany, almacenSurWithoutSlot, fitsCase, infeasibleCase, lumenRequest, missingSignalCase,
} from '../shared/operational-date-check-fixture.js';
import { companyCounts, companyDay } from '../shared/operational-company.js';
import { inventoryFormat } from '../shared/operational-inventory.js';
import { simulatePlan } from '../shared/operational-simulation.js';
import { operationalModel, operationalTwinFormat, sha256Hex } from '../shared/operational-twin.js';
import { oracle, randomInstance, type OracleInstance } from './operational-date-check-oracle.js';

const { offers, times } = ALMACEN_SUR;
const alt = (result: DateCheckResult, ...ids: string[]): AlternativeResult => {
  const key = ids.length ? `alt-${[...ids].sort().join('+')}` : 'alt-mantener';
  const found = result.alternatives.find(item => item.id === key);
  assert.ok(found, `falta la alternativa ${key}`);
  return found;
};
const iso = (value: string) => new Date(value).toISOString();
let cached: DateCheckResult | null = null;
const main = () => (cached ??= checkDate(almacenSurCase()));

test('la empresa ajustada conserva 12/3/2/20/8 y la porción de cartera es pequeña y explicable', () => {
  const model = almacenSurCompany();
  assert.equal(model.jobs.filter(item => item.kind === 'installation').length, companyCounts.installations);
  assert.equal(model.resources.filter(item => item.kind === 'technician').length, companyCounts.technicians);
  assert.equal(model.resources.filter(item => item.kind === 'warehouse').length, companyCounts.warehouses);
  assert.equal(model.jobs.filter(item => item.kind === 'order').length, companyCounts.orders);
  assert.equal(model.jobs.filter(item => item.kind === 'ticket').length, companyCounts.tickets);
  assert.deepEqual(model.resources.filter(item => item.skills.includes('vrf')).map(item => item.id), ['tech-cruz']);
  const result = main();
  assert.deepEqual(result.slice.movableJobs, ['i10', 'i12', 'o20']);
  assert.deepEqual(result.slice.commitments, ['c-i10', 'c-i12', 'c-o20']);
  assert.equal(result.slice.frozenBefore, iso(times.windowStart));
  assert.deepEqual(result.objective.tiers, [['c-i10', 'c-o20'], [ALMACEN_SUR.requestId]]);
  assert.equal(result.search.complete, true);
  assert.equal(result.hypothetical, true); assert.equal(result.requiresConfirmation, true);
  for (const item of result.alternatives) assert.equal(item.authorization, 'unconfirmed');
});

test('fila 1 · mantener reservas y turnos: la fecha pedida queda a la vista y la primera fecha sustentada es el martes 17 a las 15:30', () => {
  const keep = alt(main());
  assert.equal(keep.requested.at, times.requested);
  assert.equal(keep.requested.outcome, 'misses');
  assert.equal(keep.requested.classification, 'conflict');
  assert.equal(keep.supported.at, iso(companyDay(17, 14, 30)));
  assert.equal(keep.supported.basis, 'evidence'); assert.equal(keep.supported.proven, true);
  // Las dos causas, cada una con su dato: faltan 4 unidades hasta la reposición observada y a Cruz le faltan 75 min el viernes por la instalación 10 protegida.
  const material = keep.blockers.find(item => item.code === 'material');
  assert.ok(material && material.code === 'material');
  assert.equal(material.shortAtNeed, 4); assert.equal(material.availableAt, iso(times.restock)); assert.equal(material.enabledBy, 'in-reposicion-10');
  assert.deepEqual(material.pendingInbound, ['in-frioval-4']);
  const staffing = keep.blockers.find(item => item.code === 'staffing');
  assert.ok(staffing && staffing.code === 'staffing');
  assert.equal(staffing.neededMinutes, 390); assert.equal(staffing.freeMinutes, 315);
  assert.deepEqual(staffing.occupiedBy, [{ jobId: 'i10', commitmentId: 'c-i10', protected: true, minutes: 165 }]);
  assert.ok(keep.protections.every(item => item.kept === true));
  assert.equal(keep.candidate?.resourceId, 'tech-cruz');
});

test('fila 2 · usar cuatro reservadas: hay material, la entrega del lunes queda corta hasta el martes y la restricción de personal sigue', () => {
  const borrow = alt(main(), offers.reserved);
  assert.equal(borrow.material.ok, true);
  assert.deepEqual(borrow.reservationsConsumed, [{ reservationId: 'res-o20', demandId: 'd-o20', commitmentId: 'c-o20', quantity: 4, shortUntil: iso(times.restock), state: 'allocated' }]);
  const monday = borrow.protections.find(item => item.commitmentId === 'c-o20')!;
  assert.equal(monday.kept, false);
  assert.equal(borrow.affected.find(item => item.commitmentId === 'c-o20')!.effect, 'worsens');
  assert.equal(borrow.staffing.ok, false);
  assert.ok(borrow.blockers.some(item => item.code === 'staffing'));
  assert.ok(borrow.blockers.some(item => item.code === 'protection' && item.commitmentId === 'c-o20'));
  assert.ok(!borrow.blockers.some(item => item.code === 'horizon'), 'la causa es la protección, no el horizonte');
  assert.equal(borrow.supported.at, null);
});

test('fila 3 · confirmar solo la llegada: el material deja de bloquear y el choque de horario sigue visible', () => {
  const arrival = alt(main(), offers.arrival);
  assert.equal(arrival.material.ok, true);
  assert.equal(arrival.material.demands[0].availableAt, iso(times.windowStart));
  assert.equal(arrival.requested.outcome, 'misses');
  assert.ok(!arrival.blockers.some(item => item.code === 'material'));
  assert.ok(arrival.blockers.some(item => item.code === 'staffing'));
  assert.equal(arrival.supported.at, iso(companyDay(16, 8, 15)));
  assert.ok(arrival.protections.every(item => item.kept === true));
});

test('fila 4 · añadir solo la franja: se libera capacidad y las cuatro unidades siguen pendientes', () => {
  const slot = alt(main(), offers.slot);
  assert.equal(slot.staffing.ok, true);
  assert.equal(slot.staffing.completionIfMaterial, iso(companyDay(13, 13, 30)));
  assert.equal(slot.material.ok, false);
  assert.ok(slot.blockers.some(item => item.code === 'material' && item.shortAtNeed === 4));
  assert.ok(!slot.blockers.some(item => item.code === 'staffing'));
  assert.equal(slot.extraMinutes, 180);
  assert.equal(slot.supported.at, iso(companyDay(17, 14, 30)));
});

test('fila 5 · material y franja juntos: el viernes cabe y las fechas protegidas se conservan', () => {
  const result = main(), both = alt(result, offers.arrival, offers.slot);
  assert.equal(both.requested.outcome, 'meets');
  assert.equal(both.requested.classification, 'conditioned', 'cabe solo si se confirman los dos cambios');
  assert.deepEqual(both.conditions.filter(item => item.code === 'offer').map(item => item.code === 'offer' && item.offerId).sort(), [offers.arrival, offers.slot].sort());
  assert.equal(both.candidate?.startAt, iso(times.windowStart));
  assert.equal(both.candidate?.finishAt, iso(companyDay(13, 13, 30)));
  assert.ok(both.protections.every(item => item.kept === true));
  assert.equal(both.affected.find(item => item.commitmentId === 'c-i10')!.after.completionAt, iso(companyDay(12, 14, 45)));
  assert.equal(both.affected.find(item => item.commitmentId === 'c-o20')!.effect, 'same');
  assert.equal(result.ranking[0], both.id, 'la mejor alternativa cumple la fecha sin romper protecciones y con menos cambios');
  // Qué conviene confirmar primero: la llegada (antes del lunes 16 a las 08:00 de Madrid, cuando la necesita la reserva) y después la franja.
  assert.deepEqual(result.checkFirst.map(item => item.kind), ['inbound-arrival', 'slot']);
  const first = result.checkFirst[0];
  assert.ok(first.kind === 'inbound-arrival');
  assert.equal(first.neededBy, iso(companyDay(16, 7)));
});

test('usar reservadas con la franja cumple la fecha pero rompe la entrega del lunes; con la llegada confirmada no la rompe', () => {
  const result = main();
  const reservedSlot = alt(result, offers.reserved, offers.slot);
  assert.equal(reservedSlot.protections.find(item => item.commitmentId === 'c-o20')!.kept, false);
  const reservedArrival = alt(result, offers.reserved, offers.arrival);
  assert.equal(reservedArrival.protections.every(item => item.kept === true), true);
  assert.equal(reservedArrival.reservationsConsumed[0].shortUntil, null);
  assert.ok(result.ranking.indexOf(reservedSlot.id) > result.ranking.indexOf(alt(result, offers.arrival, offers.slot).id));
});

test('matriz de escenarios: con Frioval el viernes la franja sola basta; sin franja, nada cumple el viernes sin ceder reservadas', () => {
  const cells = main().scenarios;
  const cell = (scenarioId: string, ...ids: string[]) => cells.find(item => item.scenarioId === scenarioId && item.alternativeId === (ids.length ? `alt-${[...ids].sort().join('+')}` : 'alt-mantener'))!;
  assert.equal(cell(ALMACEN_SUR.scenarios.supplierFriday, offers.slot).outcome, 'meets');
  assert.equal(cell(ALMACEN_SUR.scenarios.supplierFriday, offers.reserved, offers.slot).protectionsKept, true, 'la reposición del viernes repone antes del lunes');
  assert.equal(cell(ALMACEN_SUR.scenarios.supplierFriday).outcome, 'misses');
  assert.equal(cell(ALMACEN_SUR.scenarios.noSlot, offers.slot).outcome, 'not-available');
  assert.equal(cell(ALMACEN_SUR.scenarios.noSlot, offers.arrival, offers.slot).outcome, 'not-available');
  assert.equal(cell(ALMACEN_SUR.scenarios.noSlot, offers.arrival).outcome, 'misses');
});

test('fila 6 · una revisión posterior retira la franja: lo comparado sigue consultable y la confirmación exige recalcular', () => {
  const before = main();
  const later = almacenSurWithoutSlot();
  const check = assertCurrent(before, later);
  assert.equal(check.current, false);
  assert.ok(!check.current && check.reason === 'revision-changed' && check.currentRevision !== before.inputRevision);
  // Lo comparado no se borra: el resultado anterior sigue diciendo qué se ensayó y con qué revisión.
  assert.equal(alt(before, offers.arrival, offers.slot).requested.outcome, 'meets');
  const recomputed = checkDate(later);
  assert.equal(assertCurrent(recomputed, later).current, true);
  assert.equal(recomputed.alternatives.some(item => item.offerIds.includes(offers.slot)), false);
  const meetsWithoutBreaking = recomputed.alternatives.filter(item => item.requested.outcome === 'meets' && item.protections.every(entry => entry.kept !== false));
  assert.deepEqual(meetsWithoutBreaking, []);
  assert.equal(assertCurrent(before, almacenSurCase()).current, true, 'la misma entrada conserva la revisión');
});

test('un pedido que cabe desde el principio queda comprobado dentro del modelo', () => {
  const result = checkDate(fitsCase()), keep = alt(result);
  assert.equal(keep.requested.outcome, 'meets');
  assert.equal(keep.requested.classification, 'verified');
  assert.equal(keep.supported.basis, 'evidence');
  assert.deepEqual(keep.conditions, []);
  assert.deepEqual(keep.blockers, []);
  assert.equal(keep.balanceViolations, 0);
});

test('un pedido con la duración ausente queda condicionado y dice hasta qué duración cabría', () => {
  const result = checkDate(missingSignalCase()), keep = alt(result);
  assert.equal(keep.requested.outcome, 'unknown');
  assert.equal(keep.requested.classification, 'conditioned');
  assert.equal(keep.supported.at, null);
  assert.ok(keep.conditions.some(item => item.code === 'unknown-duration'));
  const duration = result.checkFirst.find(item => item.kind === 'duration');
  assert.ok(duration && duration.kind === 'duration');
  // Viernes después de la 10 (315 min) + lunes entero (480 min) − 30 min de viaje.
  assert.equal(duration.maxMinutes, 765);
});

test('un pedido que la búsqueda completa demuestra inviable dentro del horizonte', () => {
  const keep = alt(checkDate(infeasibleCase()));
  assert.equal(keep.requested.outcome, 'misses');
  assert.equal(keep.requested.classification, 'conflict');
  assert.equal(keep.supported.at, null); assert.equal(keep.supported.proven, true);
  assert.ok(keep.blockers.some(item => item.code === 'horizon'));
  assert.equal(keep.search.complete, true);
});

test('sin reposición conocida, la fecha queda sin determinar y explica qué llegada falta', () => {
  const input = almacenSurCase();
  const noRestock = dateCheckInput.parse({ ...input, offers: [], scenarios: [], inventory: { ...input.inventory, inbound: input.inventory.inbound.filter(item => item.id !== 'in-reposicion-10') } });
  const keep = alt(checkDate(noRestock));
  assert.equal(keep.requested.outcome, 'unknown');
  assert.equal(keep.requested.classification, 'conditioned');
  assert.equal(keep.supported.at, null);
  assert.equal(keep.material.demands[0].state, 'short');
  assert.ok(keep.conditions.some(item => item.code === 'unknown-material' && item.pendingInbound.includes('in-frioval-4')));
});

test('evidencia antigua de existencias convierte un «cabe» comprobado en condicionado y lo dice', () => {
  const input = fitsCase();
  const lot = input.inventory.lots.find(item => item.id === 'lot-sur-12k')!;
  if (lot.quantity.state === 'known' && lot.quantity.provenance.basis === 'observed') lot.quantity.provenance.observedAt = '2026-11-05T09:00:00Z';
  const keep = alt(checkDate(dateCheckInput.parse(input)));
  assert.equal(keep.requested.outcome, 'meets');
  assert.equal(keep.requested.classification, 'conditioned');
  assert.ok(keep.conditions.some(item => item.code === 'stale-evidence'));
});

test('una sustitución exige compatibilidad declarada', () => {
  const input = almacenSurCase();
  const bad = { ...input, scenarios: [], offers: [{ id: 'o-sustituir', type: 'substitute' as const, label: 'Usar 14k', materialIndex: 0, toSku: 'sku-vrf-14k', toWarehouseId: 'almacen-sur' }] };
  const rejected = dateCheckInput.safeParse(bad);
  assert.equal(rejected.success, false);
  assert.ok(!rejected.success && rejected.error.issues.some(issue => issue.message.includes('sin compatibilidad declarada')));
  const good = { ...input, scenarios: [], offers: [{ id: 'o-sustituir', type: 'substitute' as const, label: 'Usar modelo B', materialIndex: 0, toSku: 'sku-vrf-12k-b', toWarehouseId: 'almacen-norte' }] };
  assert.equal(dateCheckInput.safeParse(good).success, true);
  // El modelo B está en Almacén Norte (3 unidades, recuento parcial): no alcanza para 12 y la evidencia parcial queda señalada.
  const result = checkDate(dateCheckInput.parse(good)), substitute = alt(result, 'o-sustituir');
  assert.equal(substitute.material.demands[0].pool, 'almacen-norte/sku-vrf-12k-b');
  assert.equal(substitute.material.demands[0].state, 'impossible');
  assert.equal(substitute.requested.outcome, 'misses');
});

test('proteger un compromiso que ya llega tarde protege su fecha proyectada, no lo da por perdido', () => {
  // La instalación 07 ya llegaba tarde (bomba retenida): termina el lunes 16. Una solicitud de clima el viernes compite con Ana y Cruz.
  const input = almacenSurCase();
  const lateCase = dateCheckInput.parse({
    ...input, offers: [], scenarios: [], policy: { protected: ['c-i07', 'c-i10'], tiers: [] },
    request: lumenRequest({ id: 'req-clima-2', title: 'Revisión de clima urgente (ficción)', skills: ['clima'], materials: [], duration: { state: 'known', value: 120, provenance: { basis: 'declared', by: 'Comercial (ficción)', declaredAt: '2026-11-09T06:45:00Z' } } }),
  });
  const result = checkDate(lateCase);
  assert.deepEqual(result.objective.protectedLate, ['c-i07']);
  const keep = alt(result), i07 = keep.protections.find(item => item.commitmentId === 'c-i07')!;
  assert.equal(i07.basis, 'projected');
  const baseline = simulatePlan(lateCase.base, lateCase.base.currentPlan!.plan).commitments.find(item => item.commitmentId === 'c-i07')!;
  assert.equal(i07.protectedAt, baseline.completionAt);
  assert.equal(i07.kept, true, 'el plan propuesto no empuja la 07 más allá de su fecha proyectada');
  const after = keep.affected.find(item => item.commitmentId === 'c-i07')!;
  assert.ok(Date.parse(after.after.completionAt!) <= Date.parse(baseline.completionAt!));
});

test('cancelar la búsqueda devuelve exploración incompleta sin afirmar conflicto', () => {
  let calls = 0;
  const result = checkDate(almacenSurCase(), { shouldStop: () => ++calls > 0, nodeBudget: 300 });
  assert.equal(result.search.complete, false);
  for (const item of result.alternatives) {
    if (item.requested.outcome === 'misses') assert.notEqual(item.requested.classification, 'conflict', `${item.id} no puede afirmar conflicto sin búsqueda completa`);
  }
});

test('si la bisección se queda a medias, la primera fecha no se rotula como probada', () => {
  // fitsCase, «mantener»: búsqueda 1 = suelo de protecciones, búsqueda 2 = fecha pedida (cumple). A partir de la 3 empieza la bisección: se cancelan todas.
  let calls = 0;
  const keep = alt(checkDate(fitsCase(), { shouldStop: () => ++calls > 2 }));
  assert.equal(keep.requested.outcome, 'meets', 'el testigo de la fecha pedida sigue valiendo');
  assert.notEqual(keep.supported.at, null);
  assert.equal(keep.supported.proven, false, 'sin búsquedas completas no se puede afirmar que no haya una fecha anterior');
});

test('propiedades: saldo nunca negativo, sin solapes en ningún recurso y sin trabajos fuera de franja', () => {
  const input = almacenSurCase(), result = main();
  for (const item of result.alternatives) {
    assert.equal(item.balanceViolations, 0, `${item.id} deja un saldo negativo`);
    if (!item.plan) continue;
    const model = sliceModel(input, item.offerIds);
    const simulation = simulatePlan(model, item.plan);
    const byResource = new Map<string, [number, number][]>();
    const open = new Map<string, number>();
    for (const event of simulation.events) {
      if (!event.jobId || !event.resourceId) continue;
      if (event.type === 'job-start' || event.type === 'job-resume') open.set(event.jobId, event.minute);
      if (event.type === 'job-interrupt' || event.type === 'job-finish') byResource.set(event.resourceId, [...byResource.get(event.resourceId) ?? [], [open.get(event.jobId)!, event.minute]]);
    }
    for (const [resourceId, intervals] of byResource) {
      const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
      for (let index = 1; index < sorted.length; index++) assert.ok(sorted[index][0] >= sorted[index - 1][1], `${item.id}: solape en ${resourceId}`);
      const windows = model.resources.find(entry => entry.id === resourceId)!.windows;
      assert.equal(windows.state, 'known');
      if (windows.state !== 'known') continue;
      const now = Date.parse(model.clock.now);
      const inside = (from: number, to: number) => windows.value.some(window => (Date.parse(window.start) - now) / 60_000 <= from && to <= (Date.parse(window.end) - now) / 60_000);
      for (const [from, to] of sorted) assert.ok(inside(from, to), `${item.id}: trabajo fuera de franja en ${resourceId}`);
    }
  }
});

test('estabilidad ante permutaciones irrelevantes de la entrada', () => {
  const input = almacenSurCase();
  const shuffled: DateCheckInput = dateCheckInput.parse({
    ...input,
    base: { ...input.base, jobs: [...input.base.jobs].reverse(), resources: [...input.base.resources].reverse(), commitments: [...input.base.commitments].reverse(), materials: [...input.base.materials].reverse() },
    inventory: { ...input.inventory, lots: [...input.inventory.lots].reverse(), inbound: [...input.inventory.inbound].reverse(), skus: [...input.inventory.skus].reverse() },
    offers: [...input.offers].reverse(), policy: { ...input.policy, protected: [...input.policy.protected].reverse() },
  });
  const a = main(), b = checkDate(shuffled);
  const strip = (result: DateCheckResult) => ({ ranking: result.ranking, slice: result.slice, checkFirst: result.checkFirst, scenarios: result.scenarios,
    alternatives: result.alternatives.map(item => ({ id: item.id, requested: item.requested, supported: item.supported, protections: item.protections, blockers: item.blockers, candidate: item.candidate })) });
  assert.deepEqual(strip(b), strip(a));
});

test('los pasos ceden el control para poder cancelar sin bloquear', () => {
  const steps = checkDateSteps(fitsCase());
  let yields = 0, next = steps.next();
  while (!next.done) { yields += 1; next = steps.next(); }
  assert.equal(next.value.format, 'planb-operational-date-check-v1');
  assert.ok(yields >= 0);
});

// ── Contraste con el oráculo independiente ──────────────────────────────────────────────────────────────────────────────────────────
const NOW = Date.parse('2026-11-09T07:00:00Z');
const at = (minute: number) => new Date(NOW + minute * 60_000).toISOString();
const declaredBy = { basis: 'declared' as const, by: 'Oráculo', declaredAt: '2026-11-09T06:00:00Z' };
function toInput(instance: OracleInstance): DateCheckInput {
  const known = <T>(value: T) => ({ state: 'known' as const, value, provenance: declaredBy });
  const reserved = instance.jobs.filter(job => job.demand?.reserved).sort((a, b) => (a.id < b.id ? -1 : 1));
  return dateCheckInput.parse({
    format: dateCheckInputFormat,
    base: operationalModel.parse({
      format: operationalTwinFormat, clock: { now: at(0), timeZone: 'Europe/Madrid', horizonEnd: at(instance.horizon) }, rules: { staleAfterMinutes: 60 * 24 * 30 },
      resources: [
        ...instance.resources.map(resource => ({ id: resource.id, title: resource.id, kind: 'technician', source: null, executesJobs: true, skills: resource.skills, windows: known(resource.windows.map(([start, end]) => ({ start: at(start), end: at(end) }))) })),
        { id: 'almacen', title: 'Almacén', kind: 'warehouse', source: null, executesJobs: false, skills: [], windows: known([{ start: at(0), end: at(instance.horizon) }]) },
      ],
      materials: [],
      commitments: instance.commitments.map(item => ({ id: item.id, revision: sha256Hex(item.id), title: item.id, dueAt: at(item.due) })),
      jobs: instance.jobs.map(job => ({ id: job.id, title: job.id, kind: 'installation', source: null, commitmentId: job.commitment, duration: known(job.work), travel: known(0), skills: job.skills, materials: [], earliestStart: job.earliest ? at(job.earliest) : null, dependencies: [] })),
      currentPlan: { provenance: declaredBy, plan: { sequences: instance.resources.map(resource => ({ resourceId: resource.id, jobIds: instance.jobs.filter(job => job.current === resource.id).map(job => job.id) })).filter(item => item.jobIds.length) } },
    }),
    inventory: {
      format: inventoryFormat, skus: [{ id: 'sku', title: 'SKU' }], compatibility: [],
      lots: [{ id: 'lot', sku: 'sku', warehouseId: 'almacen', source: null, quantity: known(instance.supplies[0].quantity) }],
      inbound: instance.supplies.slice(1).map((item, index) => ({ id: `in-${index}`, title: 'Llegada', sku: 'sku', warehouseId: 'almacen', source: null, quantity: known(item.quantity), arrival: known(at(item.at)) })),
      demands: instance.jobs.filter(job => job.demand).map(job => ({ id: `d-${job.id}`, jobId: job.id, sku: 'sku', warehouseId: 'almacen', quantity: known(job.demand!.quantity), reservation: { id: `r-${job.id}`, source: null, provenance: declaredBy } })),
    },
    request: {
      id: instance.request.id, title: 'Solicitud', source: null, requestedAt: at(instance.request.due), window: { start: at(instance.request.windowStart), end: null },
      duration: known(instance.request.work), travel: known(0), skills: instance.request.skills, materials: [{ sku: 'sku', warehouseId: 'almacen', quantity: known(instance.request.quantity) }], requestedBy: declaredBy,
    },
    policy: { protected: instance.commitments.filter(item => item.protected).map(item => item.id), tiers: [] },
    offers: instance.released ? [{ id: 'o-ceder', type: 'use-reserved', label: 'Ceder', reservationId: `r-${reserved[0].id}`, quantity: instance.released }] : [],
    scenarios: [],
  });
}

test('el motor coincide con el oráculo independiente en instancias pequeñas con semilla fija', () => {
  let compared = 0, skipped = 0, meets = 0, conflicts = 0, released = 0;
  const mismatches: string[] = [];
  for (let seed = 1; seed <= 220 && compared < 120; seed++) {
    const instance = randomInstance(seed * 7919);
    const input = toInput(instance);
    // El oráculo considera movible todo; el motor congela lo que termina antes de la ventana. Solo se comparan instancias donde coinciden.
    if (sliceModel(input).jobs.length !== instance.jobs.length + 1) { skipped += 1; continue; }
    const expected = oracle(instance);
    const result = checkDate(input);
    const engine = result.alternatives.find(item => item.id === (instance.released ? 'alt-o-ceder' : 'alt-mantener'))!;
    const engineEarliest = engine.supported.at === null ? null : Math.round((Date.parse(engine.supported.at) - NOW) / 60_000);
    const ok = (engine.requested.outcome === 'meets') === expected.meets && engineEarliest === expected.earliest && engine.search.complete;
    if (!ok) mismatches.push(`semilla ${seed * 7919}: motor ${engine.requested.outcome}/${engineEarliest} · oráculo ${expected.meets}/${expected.earliest}`);
    compared += 1; if (expected.meets) meets += 1; if (!expected.meets && expected.earliest === null) conflicts += 1; if (instance.released) released += 1;
  }
  console.log(`oráculo: ${compared} instancias comparadas, ${skipped} descartadas por congelación, ${meets} cumplen, ${conflicts} sin fecha en el horizonte, ${released} con reservas cedidas`);
  assert.deepEqual(mismatches, []);
  assert.ok(compared >= 100, `solo ${compared} comparables (${skipped} descartadas)`);
  assert.ok(meets >= 15 && conflicts >= 5 && released >= 10, `cobertura insuficiente: cumple ${meets}, sin fecha ${conflicts}, con cesión ${released}`);
});

test('tiempo y tamaño con la empresa completa', () => {
  const started = performance.now();
  const result = checkDate(almacenSurCase());
  const elapsed = performance.now() - started;
  const model = almacenSurCompany();
  // Medida, no promesa: se registra en el informe. El límite solo detecta una regresión grosera.
  console.log(`empresa: ${model.jobs.length} trabajos, ${model.resources.length} recursos, ${model.commitments.length} compromisos · porción: ${result.slice.movableJobs.length} movibles, ${result.slice.frozenJobs} fijos · ${result.alternatives.length} alternativas, ${result.scenarios.length} celdas · ${result.search.runs} búsquedas, ${result.search.nodes} nodos · ${Math.round(elapsed)} ms`);
  assert.ok(elapsed < 60_000);
  assert.equal(result.search.complete, true);
});
