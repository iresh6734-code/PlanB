import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  dateCheckAnalyzeRequest, dateCheckApiPath, dateCheckCatalog, dateCheckConfirmRequest, dateCheckList, dateCheckRecordView, dateCheckRevisionRequest, dateCheckSaveRequest, dateCheckView,
  type DateCheckAlternativeView, type DateCheckDecision, type DateCheckEvidence, type DateCheckRecordView, type DateCheckView,
} from '../shared/date-check-api.js';
import { DEMO, DemoFormError, dateCheckDemoState, dateCheckForm, dateCheckMaterials, dateCheckSkills, demoInput, initialDemoState, type DateCheckDemoState, type DateCheckForm } from '../shared/date-check-demo.js';
import { commitmentRevision } from '../shared/commitments.js';
import { checkDateSteps, dateCheckRevision, type AlternativeResult, type DateCheckInput, type DateCheckResult } from '../shared/operational-date-check.js';
import { runCancellable } from '../shared/operational-planner.js';
import { OperationalInputError, type SourceRef } from '../shared/operational-twin.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

// MONTAJE DE «COMPROBAR UNA FECHA» (unidad CLAUDE-OPUS-DATE-CHECK-FLOW). Composición explícita: nadie lo registra en main ni en runtime todavía (guion en
// coordination/plans/DATE-CHECK-MOUNT-HANDOFF.md). Solo ficción: exige copia de ensayo activa y su pin en cada petición.
//   Comparar y reabrir NO escriben.
//   Guardar una comprobación escribe un registro local identificado por UUID (idempotente por ID).
//   Confirmar escribe UN siguiente paso local por comprobación, ligado a la revisión exacta comparada y a una clave de operación. La revisión se vuelve a calcular DENTRO
//   de la transacción de escritura: si la cartera, las reservas o los cambios declarados cambiaron, se rechaza y hay que recalcular. Repetir la misma clave con los mismos
//   valores devuelve lo que ya se guardó; la misma clave con otros valores, o una segunda decisión, se rechazan.
//   La «revisión posterior» de la demostración (retirar la franja del jueves) es un estado de ficción con revisión propia.
// Ninguna ruta llama a un proveedor ni a la red.

const registrations = new WeakMap<FastifyInstance, Store>();
const pinQuery = z.object({ contextRevision: commitmentRevision }).strict();
const idParams = z.object({ id: z.uuid() }).strict();
const emptyQuery = z.object({}).strict();
const MAX_SAVED = 30;
const fail = (status: number, code: string, message: string) => new AppError(status, message, { code });
const changed = () => fail(409, 'DATE_CHECK_CONTEXT_CHANGED', 'La copia de ensayo cambió. Actualiza antes de continuar.');

const storedRecord = z.object({
  format: z.literal('planb-date-check-stored-v1'), id: z.uuid(), createdAt: z.iso.datetime(), form: dateCheckForm, inputRevision: z.string().regex(/^[a-f0-9]{64}$/),
  view: z.unknown(), decision: z.unknown().nullable(),
}).strict();
type StoredRecord = z.infer<typeof storedRecord>;

// Recuentos separados para las pruebas: simulaciones (comparar), registros guardados, decisiones escritas y reintentos que devolvieron lo ya guardado.
export type DateCheckStats = { analyses: number; saves: number; decisions: number; replays: number };

export function mountDateCheck(app: FastifyInstance, store: Store, options: { clock?: () => number } = {}) {
  const prior = registrations.get(app);
  if (prior) { if (prior !== store) throw new Error('Date check already registered with another Store'); return { stats: () => ({ analyses: 0, saves: 0, decisions: 0, replays: 0 }) }; }
  registrations.set(app, store);
  const capture = getLocalAuthorizationCapture(app), clock = options.clock ?? Date.now;
  const stats: DateCheckStats = { analyses: 0, saves: 0, decisions: 0, replays: 0 };

  function requireContext(expected: string, check: () => boolean) {
    const authorized = () => { if (!check()) throw new AppError(401, 'Desbloquea tu copia local para continuar.'); };
    authorized();
    let ready = false, identity: ReturnType<typeof workspaceSearchIdentity> = null;
    try { ready = store.ready; identity = workspaceSearchIdentity(store); } catch { authorized(); throw fail(503, 'DATE_CHECK_STORAGE', 'No se pudo comprobar la copia local.'); }
    authorized();
    if (!ready || !identity?.isTestData || identity.contextRevision !== expected) throw changed();
  }

  const stateKey = (pin: string) => `date-check:${pin}:state`;
  const indexKey = (pin: string) => `date-check:${pin}:index`;
  const recordKey = (pin: string, id: string) => `date-check:${pin}:check:${id}`;
  const readState = (pin: string): DateCheckDemoState => {
    const parsed = dateCheckDemoState.safeParse(store.get<unknown>(stateKey(pin), null) ?? initialDemoState());
    if (!parsed.success) throw fail(503, 'DATE_CHECK_STORAGE', 'El estado de la demostración no se pudo leer.');
    return parsed.data;
  };
  const readIndex = (pin: string): string[] => {
    const parsed = z.array(z.uuid()).max(MAX_SAVED).safeParse(store.get<unknown>(indexKey(pin), []));
    if (!parsed.success) throw fail(503, 'DATE_CHECK_STORAGE', 'El índice de comprobaciones no se pudo leer.');
    return parsed.data;
  };
  const readRecord = (pin: string, id: string): StoredRecord => {
    const raw = store.get<unknown>(recordKey(pin, id), null);
    if (raw === null) throw fail(404, 'DATE_CHECK_NOT_FOUND', 'Esa comprobación no está guardada en esta copia.');
    const parsed = storedRecord.safeParse(raw);
    if (!parsed.success) throw fail(503, 'DATE_CHECK_STORAGE', 'La comprobación guardada no se pudo leer.');
    return parsed.data;
  };
  const inputFor = (form: DateCheckForm, state: DateCheckDemoState): DateCheckInput => {
    try { return demoInput(form, state); }
    catch (error) {
      if (error instanceof DemoFormError) throw fail(422, 'DATE_CHECK_INVALID', error.message);
      if (error instanceof z.ZodError || error instanceof OperationalInputError) throw fail(422, 'DATE_CHECK_INVALID', 'La solicitud no es válida para esta semana de ensayo.');
      throw error;
    }
  };

  // Calcula cediendo el bucle de eventos entre búsquedas; se corta si el cliente cerró la conexión.
  async function compute(request: FastifyRequest, pin: string, check: () => boolean, input: DateCheckInput): Promise<DateCheckResult> {
    const gone = () => request.raw.socket?.destroyed === true;
    try {
      const result = await runCancellable(checkDateSteps(input, { shouldStop: gone }), () => new Promise(resolve => setImmediate(resolve)));
      if (gone()) throw fail(409, 'DATE_CHECK_CANCELLED', 'Comprobación cancelada.');
      requireContext(pin, check);
      return result;
    } catch (error) {
      if (error instanceof OperationalInputError) throw fail(422, 'DATE_CHECK_INVALID', error.message);
      throw error;
    }
  }

  // ── Vista legible: nombres, evidencia y textos de condición derivados del cálculo ──
  function viewOf(pin: string, input: DateCheckInput, result: DateCheckResult, state: DateCheckDemoState): DateCheckView {
    const names = new Map<string, string>();
    for (const item of [...input.base.jobs, ...input.base.resources, ...input.base.commitments, ...input.base.materials]) names.set(item.id, item.title);
    for (const item of input.inventory.skus) names.set(item.id, item.title);
    for (const item of input.inventory.inbound) names.set(item.id, item.title);
    for (const item of input.inventory.lots) names.set(item.id, `Existencias de ${names.get(item.sku) ?? item.sku} en ${names.get(item.warehouseId) ?? item.warehouseId}`);
    for (const item of input.offers) names.set(item.id, item.label);
    names.set(input.request.id, input.request.title);
    const name = (value: string | null | undefined) => (value ? names.get(value) ?? value : null);
    const poolLabel = (pool: string) => { const [warehouse, sku] = pool.split('/'); return `${name(sku)} · ${name(warehouse)}`; };
    const nowMs = Date.parse(input.base.clock.now), staleMs = input.base.rules.staleAfterMinutes * 60_000;
    const sourceText = (source: SourceRef, sourceRevision?: string) => `${source.provider} · ${source.accountId} · ${source.kind} ${source.remoteId}${sourceRevision ? ` · revisión ${sourceRevision}` : ''}`;
    type AnyProvenance = { basis: string; source?: SourceRef; sourceRevision?: string; observedAt?: string; coverage?: 'complete' | 'partial'; by?: string } | null;
    const evidenceOf = (label: string, value: string, provenance: AnyProvenance): DateCheckEvidence => {
      if (!provenance) return { label, value, basis: 'unknown', source: null, observedAt: null, coverage: null, stale: false };
      if (provenance.basis === 'observed' && provenance.source) {
        const age = nowMs - Date.parse(provenance.observedAt!);
        return { label, value, basis: 'observed', source: sourceText(provenance.source, provenance.sourceRevision), observedAt: provenance.observedAt!, coverage: provenance.coverage ?? 'complete', stale: age < 0 || age > staleMs };
      }
      if (provenance.basis === 'declared') return { label, value, basis: 'declared', source: provenance.by ?? null, observedAt: null, coverage: null, stale: false };
      return { label, value, basis: 'assumed', source: null, observedAt: null, coverage: null, stale: false };
    };
    const factEvidence = <T>(label: string, fact: { state: string; value?: T; provenance?: unknown; reason?: string }, show: (value: T) => string) =>
      fact.state === 'known' ? evidenceOf(label, show(fact.value as T), fact.provenance as AnyProvenance) : evidenceOf(label, fact.state === 'unknown' ? 'Desconocido' : 'Contradictorio', null);
    const minutes = (value: number) => `${value} min`;
    const commitmentEvidence = (commitmentId: string): DateCheckEvidence[] => {
      const list: DateCheckEvidence[] = [];
      for (const job of input.base.jobs.filter(item => item.commitmentId === commitmentId)) {
        list.push(factEvidence(`Duración · ${job.title}`, job.duration, minutes));
        if (job.source) list.push(evidenceOf(`Origen · ${job.title}`, job.kind, { basis: 'observed', source: job.source, observedAt: input.base.clock.now, coverage: 'complete' }));
        for (const demand of input.inventory.demands.filter(item => item.jobId === job.id)) {
          const quantity = demand.quantity.state === 'known' ? `${demand.quantity.value} uds de ${name(demand.sku)}` : 'Cantidad desconocida';
          list.push(evidenceOf(demand.reservation ? `Reserva ${demand.reservation.source?.remoteId ?? demand.reservation.id}` : `Demanda ${demand.id}`, quantity, (demand.reservation?.provenance ?? null) as AnyProvenance));
        }
      }
      return list.slice(0, 24);
    };
    const materialEvidence = (pools: string[]): DateCheckEvidence[] => {
      const list: DateCheckEvidence[] = [];
      for (const lot of input.inventory.lots) if (pools.includes(`${lot.warehouseId}/${lot.sku}`)) list.push(factEvidence(name(lot.id)!, lot.quantity, value => `${value} uds`));
      for (const entry of input.inventory.inbound) if (pools.includes(`${entry.warehouseId}/${entry.sku}`)) {
        list.push(factEvidence(`${entry.title} · cantidad`, entry.quantity, value => `${value} uds`));
        list.push(factEvidence(`${entry.title} · llegada`, entry.arrival, value => value));
      }
      for (const demand of input.inventory.demands) if (pools.includes(`${demand.warehouseId}/${demand.sku}`) && demand.reservation) {
        list.push(evidenceOf(`Reserva ${demand.reservation.source?.remoteId ?? demand.reservation.id} (${name(input.base.jobs.find(job => job.id === demand.jobId)?.commitmentId)})`,
          demand.quantity.state === 'known' ? `${demand.quantity.value} uds` : 'Cantidad desconocida', demand.reservation.provenance as AnyProvenance));
      }
      return list.slice(0, 24);
    };
    const conditionText = (item: AlternativeResult['conditions'][number]): { code: string; label: string } => {
      switch (item.code) {
        case 'offer': return { code: item.code, label: `Confirmar: ${name(item.offerId)}` };
        case 'unknown-duration': return { code: item.code, label: 'Falta la duración del trabajo.' };
        case 'unknown-travel': return { code: item.code, label: 'Falta el tiempo de viaje.' };
        case 'unknown-material': return { code: item.code, label: item.pendingInbound.length ? `Falta la fecha de llegada: ${item.pendingInbound.map(entry => name(entry)).join(', ')}.` : `Falta material de ${poolLabel(item.pool)}.` };
        case 'stale-evidence': return { code: item.code, label: `Dato antiguo en lo que sostiene la fecha (${item.subject.startsWith('inv-') ? 'existencias o llegadas' : name(item.subject)}).` };
        case 'partial-source': return { code: item.code, label: `Fuente parcial en lo que sostiene la fecha (${item.subject.startsWith('inv-') ? 'existencias o llegadas' : name(item.subject)}).` };
        case 'unknown-work-on-resource': return { code: item.code, label: `Trabajo sin duración en la agenda de ${name(item.resourceId)}: ${name(item.jobId)}.` };
      }
    };
    const rank = new Map(result.ranking.map((value, index) => [value, index + 1]));
    const alternatives: DateCheckAlternativeView[] = result.alternatives.map(item => {
      // En el orden en que se declararon los cambios, que es como los lee la persona.
      const offers = input.offers.filter(offer => item.offerIds.includes(offer.id)).map(offer => ({ id: offer.id, label: offer.label, type: offer.type }));
      const demand = item.material.demands[0];
      return {
        id: item.id, label: offers.length ? offers.map(offer => offer.label).join(' + ') : 'Mantener reservas y turnos', offerIds: item.offerIds, offers,
        rank: rank.get(item.id) ?? null, available: item.available,
        requested: { outcome: item.requested.outcome, classification: item.requested.classification },
        supported: item.supported,
        material: { ok: item.material.ok, state: demand?.state ?? null, availableAt: demand?.availableAt ?? null, enabledBy: name(demand?.enabledBy ?? null), evidence: materialEvidence(item.material.demands.map(entry => entry.pool)) },
        staffing: item.staffing,
        candidate: { resource: name(item.candidate?.resourceId ?? null), startAt: item.candidate?.startAt ?? null, finishAt: item.candidate?.finishAt ?? null },
        blockers: item.blockers.map(blocker => {
          if (blocker.code === 'material') return { code: 'material' as const, label: poolLabel(blocker.pool), quantity: blocker.quantity, neededBy: blocker.neededBy, availableAt: blocker.availableAt, enabledBy: name(blocker.enabledBy), shortAtNeed: blocker.shortAtNeed, pending: blocker.pendingInbound.map(entry => name(entry)!) };
          if (blocker.code === 'staffing') return { code: 'staffing' as const, resources: blocker.resourceIds.map(entry => name(entry)!), windowStart: blocker.windowStart, neededMinutes: blocker.neededMinutes, freeMinutes: blocker.freeMinutes, occupiedBy: blocker.occupiedBy.map(entry => ({ title: name(entry.commitmentId) ?? name(entry.jobId)!, protected: entry.protected, minutes: entry.minutes })) };
          if (blocker.code === 'protection') return { code: 'protection' as const, title: name(blocker.commitmentId)!, protectedAt: blocker.protectedAt, projectedAt: blocker.projectedAt, projection: blocker.projection };
          return blocker;
        }),
        conditions: item.conditions.map(conditionText),
        protections: item.protections.map(entry => ({ title: name(entry.commitmentId)!, protectedAt: entry.protectedAt, basis: entry.basis, kept: entry.kept })),
        affected: item.affected.map(entry => ({
          commitmentId: entry.commitmentId, title: entry.title, protected: entry.protected, before: entry.before, after: entry.after, effect: entry.effect, deltaMinutes: entry.deltaMinutes,
          reassigned: entry.reassigned.map(move => ({ job: name(move.jobId)!, from: name(move.from), to: name(move.to) })), evidence: commitmentEvidence(entry.commitmentId),
        })),
        reservations: item.reservationsConsumed.map(entry => ({ title: name(entry.commitmentId) ?? entry.reservationId, quantity: entry.quantity, shortUntil: entry.shortUntil, state: entry.state })),
        extraMinutes: item.extraMinutes,
      };
    });
    const best = result.ranking.find(value => { const item = result.alternatives.find(entry => entry.id === value)!; return item.requested.outcome === 'meets' && item.protections.every(entry => entry.kept !== false); }) ?? null;
    const material = input.request.materials[0];
    return dateCheckView.parse({
      format: 'planb-date-check-view-v1', mode: 'fiction', contextRevision: pin, inputRevision: result.inputRevision, demoRevision: state.revision, evaluatedAt: result.evaluatedAt, engineVersion: result.engineVersion,
      request: {
        title: input.request.title, requestedAt: input.request.requestedAt, windowStart: result.request.windowStart,
        durationMinutes: input.request.duration.state === 'known' ? input.request.duration.value : null, travelMinutes: input.request.travel.state === 'known' ? input.request.travel.value : 0,
        skill: dateCheckSkills.find(item => item.id === input.request.skills[0])?.label ?? input.request.skills[0],
        material: material ? { label: `${name(material.sku)} · ${name(material.warehouseId)}`, quantity: material.quantity.state === 'known' ? material.quantity.value : 0 } : null,
      },
      slice: { movable: result.slice.movableJobs.length, frozen: result.slice.frozenJobs, frozenBefore: result.slice.frozenBefore, resources: result.slice.resources.map(entry => name(entry)!) },
      alternatives, best, keepId: 'alt-mantener',
      scenarios: input.scenarios.map(scenario => ({ id: scenario.id, label: scenario.label, cells: result.scenarios.filter(cell => cell.scenarioId === scenario.id).map(cell => ({ alternativeId: cell.alternativeId, outcome: cell.outcome, protectionsKept: cell.protectionsKept })) })),
      checkFirst: result.checkFirst.map(item => {
        if (item.kind === 'inbound-arrival') return { kind: item.kind, label: `Que ${name(item.inboundId)} llegue a tiempo`, neededBy: item.neededBy, maxMinutes: null, dependents: item.dependents.length };
        if (item.kind === 'duration') return { kind: item.kind, label: 'Estimar la duración del trabajo', neededBy: null, maxMinutes: item.maxMinutes, dependents: 0 };
        return { kind: item.kind, label: `Confirmar: ${name(item.offerId)}`, neededBy: null, maxMinutes: null, dependents: item.dependents.length };
      }),
      search: { complete: result.search.complete, runs: result.search.runs },
    });
  }

  const recordView = (pin: string, record: StoredRecord, state: DateCheckDemoState): DateCheckRecordView => {
    const current = dateCheckRevision(inputFor(record.form, state));
    return dateCheckRecordView.parse({
      format: 'planb-date-check-record-v1', mode: 'fiction', contextRevision: pin, id: record.id, createdAt: record.createdAt, form: record.form,
      state: current === record.inputRevision ? 'current' : 'historical', currentInputRevision: current,
      view: { ...(record.view as DateCheckView), contextRevision: pin }, decision: record.decision,
    });
  };
  const catalog = (pin: string, state: DateCheckDemoState) => dateCheckCatalog.parse({
    format: 'planb-date-check-catalog-v1', mode: 'fiction', contextRevision: pin,
    demo: { revision: state.revision, slotWithdrawn: state.slotWithdrawn, changedAt: state.changedAt },
    week: { start: new Date(DEMO.week.start).toISOString(), end: new Date(DEMO.week.end).toISOString(), now: new Date(inputFor(DEMO.defaults(), state).base.clock.now).toISOString() },
    defaults: DEMO.defaults(), skills: dateCheckSkills.map(item => ({ ...item })), materials: dateCheckMaterials.map(item => ({ key: item.key, label: item.label })),
  });

  // ── Rutas ──
  app.get(dateCheckApiPath + '/catalog', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = pinQuery.parse(request.query);
    requireContext(pin, check);
    return catalog(pin, readState(pin));
  });

  app.post(dateCheckApiPath + '/analyze', { bodyLimit: 4096 }, async request => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, form } = dateCheckAnalyzeRequest.parse(request.body);
    requireContext(pin, check);
    const state = readState(pin), input = inputFor(form, state);
    const result = await compute(request, pin, check, input);
    stats.analyses += 1;
    return viewOf(pin, input, result, state);
  });

  app.get(dateCheckApiPath + '/checks', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = pinQuery.parse(request.query);
    requireContext(pin, check);
    const state = readState(pin);
    return dateCheckList.parse({
      format: 'planb-date-check-list-v1', contextRevision: pin,
      items: readIndex(pin).map(id => {
        const record = readRecord(pin, id), current = dateCheckRevision(inputFor(record.form, state));
        return { id, title: record.form.title, createdAt: record.createdAt, requestedAt: record.form.requestedAt, state: current === record.inputRevision ? 'current' : 'historical', decided: record.decision !== null };
      }),
    });
  });

  app.post(dateCheckApiPath + '/checks', { bodyLimit: 4096 }, async (request, reply) => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, id, form, inputRevision } = dateCheckSaveRequest.parse(request.body);
    requireContext(pin, check);
    const state = readState(pin), input = inputFor(form, state);
    if (dateCheckRevision(input) !== inputRevision) throw fail(409, 'DATE_CHECK_STALE', 'La cartera o los cambios declarados cambiaron desde que comparaste. Comprueba de nuevo.');
    // Se recalcula en el servidor: el registro guarda lo que calculó el motor, no lo que envió el navegador.
    const result = await compute(request, pin, check, input), view = viewOf(pin, input, result, state);
    const outcome = store.transaction(() => {
      requireContext(pin, check);
      const fresh = readState(pin);
      if (dateCheckRevision(inputFor(form, fresh)) !== inputRevision) throw fail(409, 'DATE_CHECK_STALE', 'La cartera o los cambios declarados cambiaron mientras se guardaba. Comprueba de nuevo.');
      const existing = store.get<unknown>(recordKey(pin, id), null);
      if (existing !== null) {
        const stored = readRecord(pin, id);
        if (stored.inputRevision !== inputRevision || JSON.stringify(stored.form) !== JSON.stringify(dateCheckForm.parse(form))) throw fail(409, 'DATE_CHECK_ID_REUSED', 'Esa clave pertenece a otra comprobación.');
        return { created: false, record: stored, state: fresh };
      }
      const index = readIndex(pin);
      if (index.length >= MAX_SAVED) throw fail(409, 'DATE_CHECK_STORAGE', `Esta copia ya guarda ${MAX_SAVED} comprobaciones.`);
      const record: StoredRecord = { format: 'planb-date-check-stored-v1', id, createdAt: new Date(clock()).toISOString(), form: dateCheckForm.parse(form), inputRevision, view, decision: null };
      store.set(recordKey(pin, id), record); store.set(indexKey(pin), [id, ...index]);
      return { created: true, record, state: fresh };
    });
    if (outcome.created) stats.saves += 1;
    requireContext(pin, check);
    return reply.code(outcome.created ? 201 : 200).send(recordView(pin, outcome.record, outcome.state));
  });

  app.get(dateCheckApiPath + '/checks/:id', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = pinQuery.parse(request.query), { id } = idParams.parse(request.params);
    requireContext(pin, check);
    return recordView(pin, readRecord(pin, id), readState(pin));
  });

  app.post(dateCheckApiPath + '/checks/:id/confirm', { bodyLimit: 4096 }, async (request, reply) => {
    const check = capture(request.headers.cookie), { id } = idParams.parse(request.params);
    emptyQuery.parse(request.query);
    const body = dateCheckConfirmRequest.parse(request.body), pin = body.contextRevision;
    requireContext(pin, check);
    const outcome = store.transaction(() => {
      requireContext(pin, check);
      const record = readRecord(pin, id), state = readState(pin);
      const prior = record.decision as DateCheckDecision | null;
      // Reintento: la misma clave con los mismos valores devuelve lo guardado, aunque la cartera haya cambiado después (la decisión ya se tomó sobre su revisión).
      if (prior) {
        const same = prior.operationId === body.operationId && prior.alternativeId === body.alternativeId && prior.owner === body.owner && prior.nextStep === body.nextStep
          && Date.parse(prior.dueAt) === Date.parse(body.dueAt) && prior.inputRevision === body.inputRevision;
        if (same) return { created: false, record, state };
        if (prior.operationId === body.operationId) throw fail(409, 'DATE_CHECK_OPERATION_REUSED', 'Esa clave ya se usó con otros valores.');
        throw fail(409, 'DATE_CHECK_ALREADY_DECIDED', 'Esta comprobación ya tiene un siguiente paso registrado.');
      }
      // Frontera de escritura: la revisión que vio la persona, la guardada y la vigente tienen que coincidir.
      const current = dateCheckRevision(inputFor(record.form, state));
      if (body.inputRevision !== record.inputRevision || current !== record.inputRevision) throw fail(409, 'DATE_CHECK_STALE', 'La cartera, las reservas o los cambios declarados cambiaron. Comprueba de nuevo antes de confirmar.');
      const view = record.view as DateCheckView, alternative = view.alternatives.find(item => item.id === body.alternativeId);
      if (!alternative || !alternative.available) throw fail(422, 'DATE_CHECK_NOT_CONFIRMABLE', 'Esa alternativa no existe en esta comprobación.');
      const decision: DateCheckDecision = {
        operationId: body.operationId, alternativeId: alternative.id, alternativeLabel: alternative.label, inputRevision: record.inputRevision,
        owner: body.owner, nextStep: body.nextStep, dueAt: new Date(body.dueAt).toISOString(), confirmedAt: new Date(clock()).toISOString(),
        promised: { requestedAt: view.request.requestedAt, outcome: alternative.requested.outcome, supportedAt: alternative.supported.at, conditions: alternative.conditions.map(item => item.label).slice(0, 8) },
      };
      const updated: StoredRecord = { ...record, decision };
      store.set(recordKey(pin, id), updated);
      return { created: true, record: updated, state };
    });
    if (outcome.created) stats.decisions += 1; else stats.replays += 1;
    requireContext(pin, check);
    return reply.code(outcome.created ? 201 : 200).send(recordView(pin, outcome.record, outcome.state));
  });

  app.post(dateCheckApiPath + '/demo/revision', { bodyLimit: 1024 }, async request => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, change } = dateCheckRevisionRequest.parse(request.body);
    requireContext(pin, check);
    const next = store.transaction(() => {
      requireContext(pin, check);
      const state = readState(pin), slotWithdrawn = change === 'withdraw-slot';
      if (state.slotWithdrawn === slotWithdrawn) return state;
      const updated: DateCheckDemoState = { ...state, revision: state.revision + 1, slotWithdrawn, changedAt: new Date(clock()).toISOString() };
      store.set(stateKey(pin), updated);
      return updated;
    });
    return catalog(pin, next);
  });

  // No se sustituye el manejador de errores de la App: AppError y ZodError ya salen como 4xx con su código.
  return { stats: () => ({ ...stats }) };
}
