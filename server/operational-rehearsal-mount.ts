import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { commitmentDecisionRequest, commitmentDetailResponse, commitmentId, commitmentPath, commitmentRevision, type CommitmentDetail } from '../shared/commitments.js';
import { companyCounts } from '../shared/operational-company.js';
import { compareOptionsLargeSteps, focusConflictSteps } from '../shared/operational-large.js';
import { runCancellable } from '../shared/operational-planner.js';
import {
  chooseAlternative, createRehearsal, decisionDraft, linkDecision, rehearsalRecord, reopenRehearsal, type RehearsalRecord,
} from '../shared/operational-rehearsal.js';
import {
  rehearsalAnalysis, rehearsalAnalyzeRequest, rehearsalApiPath, rehearsalCheckFirst, rehearsalChooseRequest, rehearsalDecisionDraft, rehearsalDraftRequest, rehearsalLinkRequest,
  rehearsalOverview, rehearsalSaveRequest, rehearsalView, type RehearsalAnalysis, type RehearsalDiagnosis, type RehearsalOverview, type RehearsalView,
} from '../shared/operational-rehearsal-api.js';
import { REHEARSAL_RADAR_COMMITMENT, buildRehearsalDemo, type RehearsalDemo } from '../shared/operational-rehearsal-demo.js';
import { whatToCheckFirstSteps } from '../shared/operational-sensitivity.js';
import { simulatePlan, type Bound, type Cause, type SimulationResult } from '../shared/operational-simulation.js';
import { OperationalInputError, applySuppositions, operationalEngineVersion, operationalRevision, type Provenance, type Supposition, type TwinModel } from '../shared/operational-twin.js';
import { readCommitmentScenarioSeed } from './commitment-scenario-seed.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

// MONTAJE DE «ENSAYAR MI SEMANA» (unidad CLAUDE-FABLE-OPERATIONAL-MOUNT). Composición explícita: nadie lo registra en main ni en runtime todavía.
// Requiere que el Radar esté montado en la misma app (usa su semilla y lee el compromiso por su ruta pública); sin él responde «radar-not-ready».
// Solo ficción: exige copia de ensayo activa y el pin de la copia en cada petición. Ensayar, comparar, reabrir y preparar una decisión NO escriben nada.
// Lo único que se guarda es el registro de ensayo, en claves meta propias ligadas al pin. La decisión la escribe la ruta existente de compromisos, no este módulo.
// Ninguna ruta llama a un proveedor ni a la red: el modelo es la empresa de ficción de shared/operational-rehearsal-demo.ts.

const registrations = new WeakMap<FastifyInstance, Store>();
const overviewQuery = z.object({ contextRevision: commitmentRevision, commitmentId }).strict();
const viewQuery = z.object({ contextRevision: commitmentRevision }).strict();
const idParams = z.object({ id: z.uuid() }).strict();
const emptyQuery = z.object({}).strict();
const MAX_SAVED = 30;
const fail = (status: number, code: string, message: string) => new AppError(status, message, { code });
const changed = () => fail(409, 'REHEARSAL_CONTEXT_CHANGED', 'La copia de ensayo cambió. Actualiza antes de continuar.');
const BASELINE = { label: 'Replanificar con lo que hay', detail: 'No pide nada a nadie: reordena y reasigna dentro de la capacidad actual.' };

type Linked = { status: 'available'; demo: RehearsalDemo; detail: CommitmentDetail } | { status: 'radar-not-ready' | 'commitment-not-linked' };

export function mountOperationalRehearsal(app: FastifyInstance, store: Store, options: { clock?: () => number } = {}) {
  const prior = registrations.get(app);
  if (prior) { if (prior !== store) throw new Error('Rehearsal already registered with another Store'); return; }
  const capture = getLocalAuthorizationCapture(app), clock = options.clock ?? Date.now;

  function requireContext(expected: string, check: () => boolean) {
    const authorized = () => { if (!check()) throw new AppError(401, 'Desbloquea tu copia local para continuar.'); };
    authorized();
    let ready = false, identity: ReturnType<typeof workspaceSearchIdentity> = null;
    try { ready = store.ready; identity = workspaceSearchIdentity(store); } catch { authorized(); throw fail(503, 'REHEARSAL_STORAGE', 'No se pudo comprobar la copia local.'); }
    authorized();
    if (!ready || !identity?.isTestData || identity.contextRevision !== expected) throw changed();
  }

  // Lee el compromiso por la ruta pública del Radar, con la misma sesión: así la revisión es exactamente la que el Radar exigirá al confirmar.
  async function link(request: FastifyRequest, pin: string, commitment: string, check: () => boolean): Promise<Linked> {
    if (commitment !== REHEARSAL_RADAR_COMMITMENT) return { status: 'commitment-not-linked' };
    if (readCommitmentScenarioSeed(store).status !== 'ready') return { status: 'radar-not-ready' };
    const headers: Record<string, string> = { host: request.headers.host ?? '127.0.0.1' };
    if (request.headers.cookie) headers.cookie = request.headers.cookie;
    const response = await app.inject({ method: 'GET', url: `${commitmentPath}/${commitment}?contextRevision=${pin}`, headers });
    requireContext(pin, check);
    if (response.statusCode === 404) return { status: 'radar-not-ready' };
    if (response.statusCode === 409) throw changed();
    if (response.statusCode !== 200) throw fail(503, 'REHEARSAL_RADAR_REQUIRED', 'No se pudo leer el compromiso en el Radar.');
    const detail = commitmentDetailResponse.parse(JSON.parse(response.body));
    return { status: 'available', detail, demo: buildRehearsalDemo({ commitmentId: commitment, revision: detail.item.revision, title: detail.item.title, dueAt: detail.item.dueAt }, detail.evidence) };
  }
  async function linked(request: FastifyRequest, pin: string, commitment: string, check: () => boolean) {
    const result = await link(request, pin, commitment, check);
    if (result.status === 'commitment-not-linked') throw fail(409, 'REHEARSAL_COMMITMENT_NOT_LINKED', 'Ese compromiso no tiene semana de ensayo.');
    if (result.status !== 'available') throw fail(409, 'REHEARSAL_RADAR_REQUIRED', 'Activa el escenario de ensayo del Radar antes de ensayar la semana.');
    return result;
  }

  // ── Vistas ──
  const names = (model: TwinModel) => {
    const all = new Map<string, string>();
    for (const item of [...model.jobs, ...model.resources, ...model.materials, ...model.commitments]) all.set(item.id, item.title);
    return (value: string | undefined | null) => value ? all.get(value) ?? value : null;
  };
  const origin = (provenance: Provenance) => provenance.basis === 'observed' ? `${provenance.source.provider} · ${provenance.source.accountId}` : provenance.basis === 'declared' ? provenance.by : 'Supuesto de este ensayo';
  const heldBy = (name: ReturnType<typeof names>, items: (Bound | Cause)[]) => items.map(item => ({
    code: item.code, name: name(item.jobId ?? item.materialId ?? ('resourceId' in item ? item.resourceId : undefined) ?? null),
  }));
  function diagnose(model: TwinModel, simulation: SimulationResult, focusId: string): RehearsalDiagnosis {
    const name = names(model), outcome = simulation.commitments.find(item => item.commitmentId === focusId)!;
    const jobs = outcome.chain.map(step => simulation.jobs.find(item => item.jobId === step.jobId)!);
    const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map(item => [key(item), item])).values()];
    return {
      projection: outcome.projection, dueAt: outcome.dueAt, completionAt: outcome.completionAt, latenessMinutes: outcome.latenessMinutes,
      steps: outcome.chain.map(step => ({
        jobId: step.jobId, title: name(step.jobId)!, resource: name(step.resourceId), status: step.status, startAt: step.startAt, finishAt: step.finishAt,
        waitedForCapacity: step.waitedForCapacity, held: heldBy(name, [...step.boundBy, ...step.causes]).slice(0, 12),
      })),
      evidence: unique(jobs.flatMap(job => job.evidence), item => `${item.subject}/${item.field}`).slice(0, 40)
        .map(item => ({ subject: name(item.subject)!, field: item.field, basis: item.provenance.basis, origin: origin(item.provenance) })),
      caveats: unique(outcome.caveats, item => `${item.code}/${item.subject}`).slice(0, 40).map(item => ({ code: item.code, subject: name(item.subject)! })),
      offTime: simulation.commitments.filter(item => item.projection !== 'on-time').map(item => ({ commitmentId: item.commitmentId, title: name(item.commitmentId)!, projection: item.projection })),
    };
  }
  // Las fuentes del Radar leídas hace más de un día (o solo en parte) quedan como reserva del diagnóstico, con el nombre de la fuente.
  const SOURCE = { sale: 'Fuente de venta del Radar', delivery: 'Fuente de entrega del Radar', support: 'Fuente de soporte del Radar' } as const;
  const withSources = (diagnosis: RehearsalDiagnosis, demo: RehearsalDemo): RehearsalDiagnosis => ({
    ...diagnosis,
    caveats: [...diagnosis.caveats, ...demo.sources.flatMap(item => item.state === 'stale' ? [{ code: 'stale-evidence', subject: SOURCE[item.role] }] : item.state === 'partial' ? [{ code: 'partial-source', subject: SOURCE[item.role] }] : [])].slice(0, 40),
  });
  function scenarioOf(demo: RehearsalDemo, perturbationIds: string[]): Supposition[] {
    if (new Set(perturbationIds).size !== perturbationIds.length) throw fail(422, 'REHEARSAL_INVALID', 'Perturbaciones repetidas.');
    return perturbationIds.map(value => {
      const found = demo.perturbations.find(item => item.id === value);
      if (!found) throw fail(422, 'REHEARSAL_INVALID', 'Esa perturbación no existe en este ensayo.');
      return found.supposition;
    });
  }
  const optionLabel = (demo: RehearsalDemo, optionIds: string[]) => optionIds.length ? optionIds.map(value => demo.options.find(item => item.id === value)?.label ?? value).join(' + ') : BASELINE.label;

  // Ejecuta una búsqueda cediendo el bucle de eventos entre tramos; se corta si el cliente cerró la conexión.
  async function run<T>(request: FastifyRequest, pin: string, check: () => boolean, steps: (shouldStop: () => boolean) => Generator<void, T, void>): Promise<T> {
    const gone = () => request.raw.socket?.destroyed === true;
    try {
      const result = await runCancellable(steps(gone), () => new Promise(resolve => setImmediate(resolve)));
      if (gone()) throw fail(409, 'REHEARSAL_CANCELLED', 'Ensayo cancelado.');
      requireContext(pin, check);
      return result;
    } catch (error) {
      if (error instanceof OperationalInputError) throw fail(422, 'REHEARSAL_INVALID', error.message);
      throw error;
    }
  }

  async function compare(request: FastifyRequest, pin: string, check: () => boolean, demo: RehearsalDemo, scenario: Supposition[], priority: 'focus' | 'rival') {
    return run(request, pin, check, shouldStop => compareOptionsLargeSteps(demo.model, scenario, demo.options.map(item => item.supposition), demo.objectives[priority], { seed: 1, shouldStop }));
  }

  // ── Registro de ensayos ──
  const recordKey = (pin: string, id: string) => `operational-rehearsal:v1:${pin}:${id}`, indexKey = (pin: string) => `operational-rehearsal:v1:${pin}:index`;
  function readRecord(pin: string, id: string): RehearsalRecord {
    let raw: unknown;
    try { raw = store.get<unknown>(recordKey(pin, id), null); } catch { throw fail(503, 'REHEARSAL_STORAGE', 'No se pudo leer el ensayo guardado.'); }
    if (raw === null) throw fail(404, 'REHEARSAL_NOT_FOUND', 'Ese ensayo no está en esta copia.');
    const parsed = rehearsalRecord.safeParse(raw);
    if (!parsed.success) throw fail(503, 'REHEARSAL_STORAGE', 'El ensayo guardado no se puede leer.');
    return parsed.data;
  }
  // PREPARACIONES: cada decisión preparada desde un ensayo queda guardada con su alternativa, su clave y la petición exacta. Es la prueba que permite atribuir después
  // una decisión del Radar a este ensayo y a esa alternativa. No es una decisión: nada se envía al Radar ni cambia el CRM al guardarla.
  const preparedKey = (pin: string, id: string) => recordKey(pin, id) + ':prepared';
  const preparedList = z.array(z.object({ operationId: z.uuid(), alternativeId: z.string().min(1).max(240), suppositionIds: z.array(commitmentId).max(6), request: commitmentDecisionRequest }).strict()).max(8);
  const readPrepared = (pin: string, id: string) => {
    const parsed = preparedList.safeParse(store.get<unknown>(preparedKey(pin, id), []));
    if (!parsed.success) throw fail(503, 'REHEARSAL_STORAGE', 'La preparación guardada de este ensayo no se puede leer.');
    return parsed.data;
  };
  const readIndex = (pin: string) => z.array(z.uuid()).max(MAX_SAVED).catch([]).parse(store.get<unknown>(indexKey(pin), []));
  function view(pin: string, record: RehearsalRecord, demo: RehearsalDemo): RehearsalView {
    const current = reopenRehearsal(record, demo.model), prepared = readPrepared(pin, record.id), accepted = record.decision ? prepared.find(item => item.operationId === record.decision!.operationId) ?? null : null;
    return rehearsalView.parse({
      format: 'planb-operational-rehearsal-view-v1', mode: 'fiction', contextRevision: pin, ...current,
      labels: Object.fromEntries(record.compared.map(item => [item.alternativeId, optionLabel(demo, item.suppositionIds)])),
      pending: record.decision ? [] : prepared.map(item => ({ operationId: item.operationId, alternativeId: item.alternativeId, label: optionLabel(demo, item.suppositionIds) })),
      decisionDetail: accepted && accepted.request.decision.type === 'assign' ? { alternativeId: accepted.alternativeId, label: optionLabel(demo, accepted.suppositionIds), owner: accepted.request.decision.owner, nextStep: accepted.request.decision.nextStep, dueAt: accepted.request.decision.dueAt } : null,
    });
  }
  const mapped = <T>(action: () => T): T => {
    try { return action(); } catch (error) {
      if (!(error instanceof OperationalInputError)) throw error;
      if (error.code === 'stale-rehearsal') throw fail(409, 'REHEARSAL_STALE', 'El compromiso o la semana cambiaron: este ensayo queda como borrador histórico. Ensaya de nuevo antes de confirmar.');
      if (error.code === 'not-confirmable' || error.code === 'decision-recorded') throw fail(409, 'REHEARSAL_NOT_CONFIRMABLE', error.message);
      throw fail(422, 'REHEARSAL_INVALID', error.message);
    }
  };

  app.addHook('onSend', async (request, reply, payload) => {
    const route = request.url.split('?')[0];
    if (route === rehearsalApiPath || route.startsWith(rehearsalApiPath + '/')) {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      const vary = String(reply.getHeader('Vary') ?? '').split(',').map(part => part.trim()).filter(Boolean);
      if (!vary.some(part => part.toLowerCase() === 'cookie')) vary.push('Cookie');
      reply.header('Vary', vary.join(', '));
    }
    return payload;
  });

  app.get(rehearsalApiPath, { exposeHeadRoute: false }, async (request): Promise<RehearsalOverview> => {
    const check = capture(request.headers.cookie), { contextRevision: pin, commitmentId: commitment } = overviewQuery.parse(request.query);
    requireContext(pin, check);
    const result = await link(request, pin, commitment, check);
    const base = { format: 'planb-operational-rehearsal-overview-v1' as const, mode: 'fiction' as const, contextRevision: pin };
    if (result.status !== 'available') {
      return { ...base, status: result.status, modelRevision: null, week: null, counts: null, focus: null, rival: null, diagnosis: null, sources: [], perturbations: [], options: [], hypotheses: [], rehearsals: [] };
    }
    const { demo, detail } = result, model = demo.model, name = names(model);
    const saved = readIndex(pin).flatMap(value => {
      try { const record = readRecord(pin, value); return record.focus.commitmentId === commitment ? [record] : []; } catch { return []; }
    });
    const overview = rehearsalOverview.parse({
      ...base, status: 'available', modelRevision: operationalRevision(model), week: model.clock, counts: companyCounts,
      focus: { commitmentId: commitment, title: detail.item.title, dueAt: detail.item.dueAt, commitmentRevision: detail.item.revision, closed: Boolean(detail.item.closure) },
      rival: { commitmentId: demo.rivalId, title: name(demo.rivalId)! },
      diagnosis: withSources(diagnose(model, simulatePlan(model, model.currentPlan!.plan), commitment), demo),
      sources: demo.sources,
      perturbations: demo.perturbations.map(({ id, label, detail: text }) => ({ id, label, detail: text })),
      options: demo.options.map(({ id, label, detail: text }) => ({ id, label, detail: text })),
      hypotheses: demo.hypotheses.map(({ id, question, values }) => ({ id, question, values })),
      rehearsals: saved.map(record => {
        const current = reopenRehearsal(record, model);
        return { id: record.id, createdAt: record.createdAt, state: current.state, status: current.status, chosen: record.chosen ? optionLabel(demo, record.chosen.suppositionIds) : null };
      }),
    });
    requireContext(pin, check);
    return overview;
  });

  app.post(rehearsalApiPath + '/analyze', { bodyLimit: 4096 }, async (request): Promise<RehearsalAnalysis> => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, commitmentId: commitment, perturbationIds, priority } = rehearsalAnalyzeRequest.parse(request.body);
    requireContext(pin, check);
    const { demo } = await linked(request, pin, commitment, check), scenario = scenarioOf(demo, perturbationIds), options = demo.options.map(item => item.supposition);
    const branched = mappedBranch(demo.model, scenario), name = names(branched);
    const focus = await run(request, pin, check, shouldStop => focusConflictSteps(demo.model, scenario, commitment, options, { seed: 1, shouldStop }));
    const compared = await compare(request, pin, check, demo, scenario, priority);
    const inner = focus.conflict?.conflict ?? null;
    return rehearsalAnalysis.parse({
      format: 'planb-operational-rehearsal-analysis-v1', mode: 'fiction', contextRevision: pin, kind: 'proposal', hypothetical: true,
      modelRevision: operationalRevision(demo.model), engineVersion: operationalEngineVersion, scenario: perturbationIds, priority,
      diagnosis: withSources(diagnose(branched, simulatePlan(branched, branched.currentPlan!.plan), commitment), demo),
      conflict: {
        verdict: focus.verdict, minimality: inner?.minimality ?? null, scope: focus.relaxationScope,
        commitments: (inner?.commitmentIds ?? []).map(value => ({
          commitmentId: value, title: name(value)!, dueAt: branched.commitments.find(item => item.id === value)!.dueAt,
          neededDueAt: focus.conflict!.dueChanges.find(item => item.commitmentId === value)?.neededDueAt ?? null,
        })),
        resources: (inner?.resources ?? []).map(value => name(value)!), materials: (inner?.materials ?? []).map(value => name(value)!),
        examined: focus.examined.map(value => name(value)!), missingData: heldBy(name, focus.missingData),
      },
      alternatives: compared.alternatives.map(item => {
        const model = item.suppositionIds.length ? mappedBranch(demo.model, [...scenario, ...options.filter(option => item.suppositionIds.includes(option.id))]) : branched, title = names(model);
        const outcome = item.result.simulation.commitments.find(entry => entry.commitmentId === commitment)!;
        const focusJobs = new Set(model.jobs.filter(job => job.commitmentId === commitment).map(job => job.id));
        return {
          id: item.id, optionIds: item.suppositionIds, label: optionLabel(demo, item.suppositionIds),
          detail: item.suppositionIds.length ? demo.options.find(option => option.id === item.suppositionIds[0])!.detail : BASELINE.detail,
          authorization: item.authorization, costs: item.costs, focus: { projection: outcome.projection, completionAt: outcome.completionAt, dueAt: outcome.dueAt },
          missed: item.result.simulation.commitments.filter(entry => entry.projection === 'late' || entry.projection === 'not-completed').length,
          indeterminate: item.result.simulation.commitments.filter(entry => entry.projection === 'indeterminate').length, optimality: item.result.search.optimality,
          deltas: item.versusBaseline.flatMap(delta => delta.effect === 'same' ? [] : [{ commitmentId: delta.commitmentId, title: title(delta.commitmentId)!, before: delta.before, after: delta.after, effect: delta.effect, deltaMinutes: delta.deltaMinutes }]),
          timeline: model.resources.filter(resource => resource.executesJobs).map(resource => ({
            resourceId: resource.id, resource: resource.title,
            jobs: item.result.simulation.jobs.filter(job => job.resourceId === resource.id && job.startAt && job.finishAt).sort((a, b) => a.startMinute! - b.startMinute!)
              .map(job => ({ jobId: job.jobId, title: title(job.jobId)!, startAt: job.startAt!, finishAt: job.finishAt!, focus: focusJobs.has(job.jobId) })),
          })),
        };
      }),
      discarded: compared.discarded.map(item => ({ label: optionLabel(demo, item.suppositionIds), reason: item.reason })),
      optimality: compared.optimality,
    });
  });
  function mappedBranch(model: RehearsalDemo['model'], list: Supposition[]): TwinModel {
    try { return list.length ? applySuppositions(model, list) : model; }
    catch (error) { if (error instanceof OperationalInputError) throw fail(422, 'REHEARSAL_INVALID', error.message); throw error; }
  }

  app.post(rehearsalApiPath + '/check-first', { bodyLimit: 4096 }, async request => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, commitmentId: commitment, perturbationIds, priority } = rehearsalAnalyzeRequest.parse(request.body);
    requireContext(pin, check);
    const { demo } = await linked(request, pin, commitment, check), scenario = scenarioOf(demo, perturbationIds);
    const considered = [{ id: 'alt-sin-cambios', suppositions: [] as Supposition[] }, ...demo.options.map(item => ({ id: `alt-${item.id}`, suppositions: [item.supposition] }))];
    const label = (value: string) => optionLabel(demo, value === 'alt-sin-cambios' ? [] : [value.slice(4)]);
    const result = await run(request, pin, check, shouldStop => whatToCheckFirstSteps(demo.model, scenario, considered, demo.objectives[priority], demo.hypotheses, { seed: 1, evaluations: 2500, shouldStop }));
    return rehearsalCheckFirst.parse({
      format: 'planb-operational-rehearsal-check-first-v1', mode: 'fiction', contextRevision: pin, kind: 'proposal', hypothetical: true, modelRevision: operationalRevision(demo.model),
      method: result.method, probabilities: result.probabilities, mostDecisive: result.mostDecisive, optimality: result.optimality,
      ranking: result.ranking.map(row => ({
        hypothesisId: row.hypothesisId, question: row.question, decisionChanges: row.decisionChanges, viabilityFlips: row.viabilityFlips,
        byValue: row.byValue.map(entry => ({ value: entry.value, best: entry.best.map(label), focus: entry.cells.map(cell => ({ label: label(cell.alternativeId), projection: cell.priority[commitment] ?? null })) })),
      })),
    });
  });

  app.post(rehearsalApiPath + '/rehearsals', { bodyLimit: 4096 }, async (request, reply) => {
    const check = capture(request.headers.cookie);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, commitmentId: commitment, perturbationIds, priority, id } = rehearsalSaveRequest.parse(request.body);
    requireContext(pin, check);
    const { demo } = await linked(request, pin, commitment, check), scenario = scenarioOf(demo, perturbationIds);
    const compared = await compare(request, pin, check, demo, scenario, priority);
    const record = createRehearsal({
      id, createdAt: new Date(clock()).toISOString(), model: demo.model, commitmentId: commitment, scenario, options: demo.options.map(item => item.supposition),
      objectives: demo.objectives[priority], alternatives: compared.alternatives,
    });
    const outcome = store.transaction(() => {
      requireContext(pin, check);
      const existing = store.get<unknown>(recordKey(pin, id), null);
      if (existing !== null) {
        const stored = readRecord(pin, id);
        const same = stored.baseRevision === record.baseRevision && JSON.stringify([stored.scenario, stored.objectives]) === JSON.stringify([record.scenario, record.objectives]);
        if (!same) throw fail(409, 'REHEARSAL_ID_REUSED', 'Esa clave pertenece a otro ensayo.');
        return { created: false, record: stored };
      }
      const index = readIndex(pin);
      if (index.length >= MAX_SAVED) throw fail(409, 'REHEARSAL_STORAGE', `Esta copia ya guarda ${MAX_SAVED} ensayos.`);
      store.set(recordKey(pin, id), record); store.set(indexKey(pin), [id, ...index]);
      return { created: true, record };
    });
    requireContext(pin, check);
    return reply.code(outcome.created ? 201 : 200).send(view(pin, outcome.record, demo));
  });

  app.get(rehearsalApiPath + '/rehearsals/:id', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = viewQuery.parse(request.query), { id } = idParams.parse(request.params);
    requireContext(pin, check);
    const record = readRecord(pin, id), { demo } = await linked(request, pin, record.focus.commitmentId, check);
    return view(pin, record, demo);
  });

  app.post(rehearsalApiPath + '/rehearsals/:id/choose', { bodyLimit: 2048 }, async request => {
    const check = capture(request.headers.cookie), { id } = idParams.parse(request.params), { contextRevision: pin, alternativeId } = rehearsalChooseRequest.parse(request.body);
    emptyQuery.parse(request.query);
    requireContext(pin, check);
    const { demo } = await linked(request, pin, readRecord(pin, id).focus.commitmentId, check);
    const next = store.transaction(() => {
      requireContext(pin, check);
      const record = readRecord(pin, id);
      if (reopenRehearsal(record, demo.model).state !== 'current') throw fail(409, 'REHEARSAL_STALE', 'Este ensayo es un borrador histórico: ya no se cambia su elección.');
      const updated = mapped(() => chooseAlternative(record, alternativeId));
      store.set(recordKey(pin, id), updated);
      return updated;
    });
    return view(pin, next, demo);
  });

  app.post(rehearsalApiPath + '/rehearsals/:id/decision-draft', { bodyLimit: 4096 }, async request => {
    const check = capture(request.headers.cookie), { id } = idParams.parse(request.params), body = rehearsalDraftRequest.parse(request.body), pin = body.contextRevision;
    emptyQuery.parse(request.query);
    requireContext(pin, check);
    const record = readRecord(pin, id), { demo } = await linked(request, pin, record.focus.commitmentId, check);
    const prepared = mapped(() => decisionDraft(record, demo.model, { contextRevision: pin, operationId: body.operationId, owner: body.owner, nextStep: body.nextStep, dueAt: body.dueAt }));
    // Se guarda la preparación ligada a la alternativa elegida EN ESTE MOMENTO. Repetir la misma preparación no reescribe; la misma clave con otros valores se rechaza.
    store.transaction(() => {
      requireContext(pin, check);
      const fresh = readRecord(pin, id), list = readPrepared(pin, id);
      if (JSON.stringify(fresh.chosen) !== JSON.stringify(record.chosen) || fresh.decision) throw fail(409, 'REHEARSAL_NOT_CONFIRMABLE', 'El ensayo cambió mientras se preparaba la decisión. Prepárala de nuevo.');
      const entry = { operationId: body.operationId, alternativeId: fresh.chosen!.alternativeId, suppositionIds: fresh.chosen!.suppositionIds, request: prepared };
      const existing = list.find(item => item.operationId === body.operationId);
      if (existing) { if (JSON.stringify(existing) !== JSON.stringify(entry)) throw fail(409, 'REHEARSAL_ID_REUSED', 'Esa clave ya se usó para preparar otra decisión.'); return; }
      store.set(preparedKey(pin, id), [...list, entry].slice(-8));
    });
    requireContext(pin, check);
    return rehearsalDecisionDraft.parse({ format: 'planb-operational-rehearsal-decision-draft-v1', mode: 'fiction', contextRevision: pin, commitmentId: record.focus.commitmentId, request: prepared });
  });

  app.post(rehearsalApiPath + '/rehearsals/:id/link', { bodyLimit: 2048 }, async request => {
    const check = capture(request.headers.cookie), { id } = idParams.parse(request.params), { contextRevision: pin, operationId } = rehearsalLinkRequest.parse(request.body);
    emptyQuery.parse(request.query);
    requireContext(pin, check);
    const { demo, detail } = await linked(request, pin, readRecord(pin, id).focus.commitmentId, check);
    const next = store.transaction(() => {
      requireContext(pin, check);
      const record = readRecord(pin, id);
      // Solo se anota una decisión que el Radar YA aceptó sobre la revisión de este ensayo: se comprueba en su historial, no se confía en el cliente.
      // Hace falta la PREPARACIÓN de este ensayo con esa clave: una decisión tomada directamente en el Radar, o preparada desde otro ensayo, no se atribuye aquí.
      const prepared = readPrepared(pin, id).find(item => item.operationId === operationId);
      if (!prepared) throw fail(409, 'REHEARSAL_DECISION_NOT_FOUND', 'Esa decisión no se preparó desde este ensayo: no se le atribuye.');
      // Y el Radar debe tener exactamente lo que se preparó: misma clave, misma revisión previa y mismos valores.
      const accepted = detail.events.find(event => event.operationId === operationId && event.revisionBefore === prepared.request.expectedRevision
        && prepared.request.expectedRevision === record.focus.commitmentRevision && JSON.stringify(event.decision) === JSON.stringify(prepared.request.decision));
      if (!accepted) throw fail(409, 'REHEARSAL_DECISION_NOT_FOUND', 'El Radar no tiene registrada la decisión que se preparó desde este ensayo.');
      if (record.decision && record.decision.operationId === operationId) return record;
      // La atribución es a la alternativa PREPARADA. Si la elección cambió después, se restituye la que originó la decisión; la prueba es la preparación guardada.
      const attributed = record.chosen?.alternativeId === prepared.alternativeId || record.decision ? record : mapped(() => chooseAlternative(record, prepared.alternativeId));
      const updated = mapped(() => linkDecision(attributed, { operationId, commitmentId: record.focus.commitmentId, expectedRevision: record.focus.commitmentRevision }));
      if (updated !== record) store.set(recordKey(pin, id), updated);
      return updated;
    });
    return view(pin, next, demo);
  });

  registrations.set(app, store);
}
