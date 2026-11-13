import {
  OperationalInputError, applySuppositions, operationalEngineVersion, operationalModel,
  type BranchCosts, type OperationalModel, type OperationalPlan, type Supposition, type TwinModel,
} from './operational-twin.js';
import { comparePlans, compileModel, simulatePlan, type Cause, type Compiled, type PlanDelta, type SimulationResult } from './operational-simulation.js';
import { drain, explainConflictSteps, planScheduleSteps, type ConflictResult, type Objectives, type PlanResult } from './operational-planner.js';

// TAMAÑO REAL (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2). Con decenas de trabajos la búsqueda exacta de operational-planner agota su presupuesto.
// Este módulo no promete óptimos: mejora un plan por búsqueda local reproducible y, para explicar, PROYECTA el problema a pocos compromisos, donde sí hay prueba.
// Garantía que se conserva: un conflicto verificado en una proyección vale para la empresa entera, porque los trabajos omitidos solo pueden quitar capacidad, nunca darla.
// Lo que NO se garantiza: que el plan devuelto sea el mejor, ni que no exista un conflicto mayor que el tamaño examinado. Todo va rotulado «best-found».

type Steps<T> = Generator<void, T, void>;
export type LargeControl = { nodeBudget?: number; evaluations?: number; seed?: number; shouldStop?: () => boolean };

const lexLess = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const branch = (base: OperationalModel, list: Supposition[]): TwinModel => list.length ? applySuppositions(base, list) : base;
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function tiersOf(c: Compiled, objectives: Objectives): number[] {
  const listed = objectives.tiers.flat();
  if (new Set(listed).size !== listed.length || listed.some(id => !c.commitments.some(item => item.id === id))) throw new OperationalInputError('objectives', 'Los niveles de prioridad citan compromisos inexistentes o repetidos.');
  return c.commitments.map(item => { const level = objectives.tiers.findIndex(tier => tier.includes(item.id)); return level < 0 ? objectives.tiers.length : level; });
}
function keyOf(c: Compiled, simulation: SimulationResult, tierOf: number[], tiers: number): number[] {
  const key = new Array<number>(tiers + 1).fill(0);
  simulation.commitments.forEach((item, at) => {
    if (item.projection === 'on-time') return;
    key[tierOf[at]] += 1;
    key[tiers] += Math.max(0, (item.completionMinute ?? c.horizon) - c.commitments[at].due);
  });
  return key;
}

// Deja en el modelo solo los compromisos indicados y los trabajos que necesitan (cierre por dependencias confirmadas). Recursos y materiales se conservan todos.
export function projectModel(base: OperationalModel, commitmentIds: string[]): OperationalModel {
  const wanted = new Set(commitmentIds);
  if (commitmentIds.some(id => !base.commitments.some(item => item.id === id))) throw new OperationalInputError('unknown-target', 'La proyección cita un compromiso inexistente.');
  const keep = new Set<string>(), stack = base.jobs.filter(job => job.commitmentId && wanted.has(job.commitmentId)).map(job => job.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    for (const entry of base.jobs.find(job => job.id === id)!.dependencies) if (entry.basis !== 'candidate') stack.push(entry.jobId);
  }
  return operationalModel.parse({
    ...structuredClone(base),
    commitments: base.commitments.filter(item => wanted.has(item.id)),
    jobs: structuredClone(base.jobs.filter(job => keep.has(job.id))).map(job => ({
      ...job, commitmentId: job.commitmentId && wanted.has(job.commitmentId) ? job.commitmentId : null, dependencies: job.dependencies.filter(entry => keep.has(entry.jobId)),
    })),
    currentPlan: base.currentPlan && {
      provenance: base.currentPlan.provenance,
      plan: { sequences: base.currentPlan.plan.sequences.map(entry => ({ resourceId: entry.resourceId, jobIds: entry.jobIds.filter(id => keep.has(id)) })) },
    },
  });
}
// Supuestos que siguen teniendo sentido en una proyección (los que citan algo omitido no afectan a lo proyectado).
export function suppositionsFor(model: OperationalModel, list: Supposition[]): Supposition[] {
  const jobs = new Set(model.jobs.map(item => item.id)), commitments = new Set(model.commitments.map(item => item.id));
  return list.filter(item => item.type === 'job-reopen' || item.type === 'use-alternative-material' || item.type === 'split-job' ? jobs.has(item.jobId) : item.type === 'move-due' ? commitments.has(item.commitmentId) : true);
}

// Adapta un plan a otro modelo de la misma familia: quita lo que no existe, sustituye un trabajo dividido por sus partes y coloca lo que falta en su primer recurso capaz.
function adaptPlan(c: Compiled, plan: OperationalPlan): string[][] {
  const queues: string[][] = c.resources.map(() => []), placed = new Set<string>();
  const parts = new Map<string, string[]>();
  for (const job of c.model.jobs) if (job.splitOf) parts.set(job.splitOf, [...parts.get(job.splitOf) ?? [], job.id]);
  for (const sequence of plan.sequences) {
    const r = c.resources.findIndex(item => item.id === sequence.resourceId);
    if (r < 0) continue;
    for (const id of sequence.jobIds.flatMap(value => parts.get(value) ?? [value])) if (c.jobs.some(job => job.id === id) && !placed.has(id)) { queues[r].push(id); placed.add(id); }
  }
  for (const job of c.jobs) if (!placed.has(job.id) && job.capable.length) queues[job.capable.find(r => c.resources[r].windows) ?? job.capable[0]].push(job.id);
  return queues;
}
const toPlan = (c: Compiled, queues: string[][]): OperationalPlan => ({ sequences: queues.flatMap((jobIds, r) => jobIds.length ? [{ resourceId: c.resources[r].id, jobIds: [...jobIds] }] : []) });

// Evaluador rápido de colas para la búsqueda local: misma semántica que `simulatePlan` (cada recurso espera a su trabajo de cabeza), sin traza.
// El plan final SIEMPRE se vuelve a simular con el motor; si las dos cuentas difieren se lanza un error en vez de devolver un resultado dudoso.
function fastKey(c: Compiled, queues: string[][], tierOf: number[], tiers: number, index: Map<string, number>): { key: number[]; critical: number[] } {
  const finish = new Array<number>(c.jobs.length).fill(-1), order: number[][] = queues.map((list, r) => list.map(id => index.get(id)!).filter(j => !c.jobs[j].fault && c.jobs[j].capable.includes(r) && c.resources[r].windows));
  const position = order.map(() => 0), free = order.map(() => 0), stuck = order.map(() => false);
  for (let progress = true; progress;) {
    progress = false;
    for (let r = 0; r < order.length; r++) {
      while (!stuck[r] && position[r] < order[r].length) {
        const job = c.jobs[order[r][position[r]]];
        let ready = Math.max(free[r], job.ready), open = true;
        for (const dep of job.deps) { if (finish[dep] < 0) { open = false; break; } if (finish[dep] > ready) ready = finish[dep]; }
        if (!open) break;
        let left = job.work, end = -1;
        for (const [from, close] of c.resources[r].windows!) {
          if (close <= ready) continue;
          const start = Math.max(from, ready);
          if (left <= close - start) { end = start + left; break; }
          left -= close - start;
        }
        if (end < 0) { stuck[r] = true; break; }
        finish[order[r][position[r]]] = end; free[r] = end; position[r] += 1; progress = true;
      }
    }
  }
  const key = new Array<number>(tiers + 1).fill(0), critical = new Set<number>();
  c.commitments.forEach((item, at) => {
    const done = item.jobs.length > 0 && item.jobs.every(j => finish[j] >= 0), completion = done ? Math.max(...item.jobs.map(j => finish[j])) : null;
    if (completion !== null && completion <= item.due) return;
    key[tierOf[at]] += 1; key[tiers] += Math.max(0, (completion ?? c.horizon) - item.due);
    // Candidatos a mover: los trabajos de lo que no llega y los que tienen delante en su cola.
    for (const j of item.jobs) { critical.add(j); for (const dep of c.jobs[j].deps) critical.add(dep); order.forEach(list => { const spot = list.indexOf(j); if (spot > 0) for (const ahead of list.slice(Math.max(0, spot - 3), spot)) critical.add(ahead); }); }
  });
  return { key, critical: [...critical] };
}

// Búsqueda local reproducible: recoloca un trabajo (preferentemente de lo que no llega o de lo que tiene delante) y acepta el cambio si el objetivo de la persona no empeora.
// Nunca devuelve un plan peor que el de partida. No demuestra nada: `optimality` es siempre «best-found».
export function* improvePlanSteps(model: TwinModel, objectives: Objectives, start: OperationalPlan, control: LargeControl = {}): Steps<PlanResult> {
  const c = compileModel(model), tierOf = tiersOf(c, objectives), tiers = objectives.tiers.length + 1, index = new Map(c.jobs.map((job, j) => [job.id, j]));
  const budget = Math.max(0, Math.min(control.evaluations ?? 6000, 50_000)), seed = control.seed ?? 1, next = random(seed);
  let queues = adaptPlan(c, start), state = fastKey(c, queues, tierOf, tiers, index);
  const movable = c.jobs.flatMap((job, j) => !job.fault && job.capable.some(r => c.resources[r].windows) ? [j] : []);
  let evaluations = 0, cancelled = false;
  while (evaluations < budget && movable.length && state.key.some(value => value > 0)) {
    if (evaluations % 256 === 0) { yield; if (control.shouldStop?.()) { cancelled = true; break; } }
    const critical = state.critical.filter(j => movable.includes(j));
    const pool = critical.length && next() < 0.65 ? critical : movable, j = pool[Math.floor(next() * pool.length)], id = c.jobs[j].id;
    const targets = c.jobs[j].capable.filter(r => c.resources[r].windows), r = targets[Math.floor(next() * targets.length)];
    const candidate = queues.map(list => list.filter(value => value !== id));
    candidate[r].splice(Math.floor(next() * (candidate[r].length + 1)), 0, id);
    evaluations += 1;
    const trial = fastKey(c, candidate, tierOf, tiers, index);
    if (!lexLess(state.key, trial.key)) { queues = candidate; state = trial; }
  }
  const simulation = simulatePlan(c, toPlan(c, queues)), key = keyOf(c, simulation, tierOf, tiers);
  if (key.some((value, at) => value !== state.key[at])) throw new Error('Inconsistencia interna entre la mejora local y la simulación.');
  return {
    format: 'planb-operational-plan-v1', kind: 'proposal', engineVersion: operationalEngineVersion, modelRevision: c.revision, baseRevision: c.model.branch?.baseRevision ?? c.revision,
    hypothetical: c.hypothetical, requiresConfirmation: true, objectives, key: { missedByTier: key.slice(0, tiers), penaltyMinutes: key[tiers] }, plan: simulation.plan, simulation,
    search: { nodes: evaluations, complete: false, stoppedBy: cancelled ? 'cancelled' : evaluations >= budget ? 'node-budget' : null, optimality: 'best-found', seed },
  };
}
export const improvePlan = (model: TwinModel, objectives: Objectives, start: OperationalPlan, control: LargeControl = {}) => drain(improvePlanSteps(model, objectives, start, control));

const flat = (result: PlanResult) => [...result.key.missedByTier, result.key.penaltyMinutes];
// Plan para tamaño real: búsqueda exacta con presupuesto corto; si no termina, mejora local desde lo encontrado (y desde `warmStart`, si se da) y se queda con lo mejor.
export function* planLargeSteps(model: TwinModel, objectives: Objectives, control: LargeControl & { warmStart?: OperationalPlan } = {}): Steps<PlanResult> {
  const exact = yield* planScheduleSteps(model, objectives, { nodeBudget: control.nodeBudget ?? 20_000, seed: control.seed, shouldStop: control.shouldStop });
  if (exact.search.complete || exact.search.stoppedBy === 'cancelled') return exact;
  let best = yield* improvePlanSteps(model, objectives, exact.plan, control);
  if (control.warmStart) { const other = yield* improvePlanSteps(model, objectives, control.warmStart, control); if (lexLess(flat(other), flat(best))) best = other; }
  best.search = { ...best.search, nodes: best.search.nodes + exact.search.nodes };
  return best;
}
export const planLarge = (model: TwinModel, objectives: Objectives, control: LargeControl & { warmStart?: OperationalPlan } = {}) => drain(planLargeSteps(model, objectives, control));

// ── Comparar opciones en tamaño real ─────────────────────────────────────────────────────────────────────────────────────────────────
// Solo opciones INDIVIDUALES (no combinaciones) y con planes «best-found»: sirve para ver intercambios, no para afirmar que una opción es la mejor posible.
export type LargeAlternative = { id: string; suppositionIds: string[]; costs: BranchCosts; authorization: 'unconfirmed'; result: PlanResult; versusBaseline: PlanDelta[] };
export type LargeOptionsResult = {
  format: 'planb-operational-options-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion; baseRevision: string; combinations: 'singles-only';
  scenario: Supposition[]; baseline: PlanResult; alternatives: LargeAlternative[]; // «no-better-plan-found»: con planes sin prueba, que una opción no mejore puede deberse a la búsqueda; no se afirma que esté dominada.
  // «not-explored»: añadirla supera el máximo de supuestos de una rama; no se comprobó y la comparación no queda probada (330).
  discarded: { suppositionIds: string[]; reason: 'dominated' | 'no-better-plan-found' | 'incompatible' | 'not-explored' }[];
  optimality: 'proven-within-model' | 'best-found';
};
export function* compareOptionsLargeSteps(base: OperationalModel, scenario: Supposition[], options: Supposition[], objectives: Objectives, control: LargeControl = {}): Steps<LargeOptionsResult> {
  const baseline = yield* planLargeSteps(branch(base, scenario), objectives, control);
  const zero: BranchCosts = { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 0, splits: 0 };
  const evaluated: LargeAlternative[] = [{ id: 'alt-sin-cambios', suppositionIds: [], costs: zero, authorization: 'unconfirmed', result: baseline, versusBaseline: comparePlans(baseline.simulation, baseline.simulation) }];
  const discarded: LargeOptionsResult['discarded'] = [];
  let unexplored = false;
  for (const option of options) {
    let model: TwinModel;
    try { model = applySuppositions(base, [...scenario, option]); }
    catch (error) {
      if (error instanceof OperationalInputError) {
        if (error.code === 'limit') unexplored = true;
        discarded.push({ suppositionIds: [option.id], reason: error.code === 'limit' ? 'not-explored' : 'incompatible' });
        continue;
      }
      throw error;
    }
    const result = yield* planLargeSteps(model, objectives, { ...control, warmStart: baseline.plan });
    evaluated.push({ id: `alt-${option.id}`, suppositionIds: [option.id], costs: applySuppositions(base, [option]).branch!.costs, authorization: 'unconfirmed', result, versusBaseline: comparePlans(baseline.simulation, result.simulation) });
  }
  const costs = (item: LargeAlternative) => [item.costs.extraCapacityMinutes, item.costs.renegotiatedDates, item.costs.alternativeMaterials, item.costs.splits];
  const worse = (a: number[], b: number[]) => a.some((value, at) => value > b[at]);
  const alternatives = evaluated.filter(item => {
    const dominated = evaluated.some(other => other !== item && !lexLess(flat(item.result), flat(other.result)) && !worse(costs(other), costs(item))
      && (lexLess(flat(other.result), flat(item.result)) || worse(costs(item), costs(other))));
    if (dominated) discarded.push({ suppositionIds: item.suppositionIds, reason: evaluated.every(entry => entry.result.search.complete) ? 'dominated' : 'no-better-plan-found' });
    return !dominated;
  });
  return {
    format: 'planb-operational-options-v1', kind: 'proposal', engineVersion: operationalEngineVersion, baseRevision: baseline.baseRevision, combinations: 'singles-only',
    scenario, baseline, alternatives, discarded, optimality: !unexplored && evaluated.every(item => item.result.search.complete) ? 'proven-within-model' : 'best-found',
  };
}
export const compareOptionsLarge = (base: OperationalModel, scenario: Supposition[], options: Supposition[], objectives: Objectives, control: LargeControl = {}) =>
  drain(compareOptionsLargeSteps(base, scenario, options, objectives, control));

// ── Conflicto enfocado en un compromiso ──────────────────────────────────────────────────────────────────────────────────────────────
// Parte del compromiso que la persona abrió y añade, de uno en uno, los compromisos que compiten con él (primero los que no llegan cuando él tiene prioridad, luego los que
// comparten recursos, por cercanía de fecha). En cada paso examina la PROYECCIÓN con el planificador exacto. Se detiene en el primer conflicto verificado.
export type FocusResult = {
  format: 'planb-operational-focus-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion; commitmentId: string; hypothetical: boolean;
  verdict: 'conflict' | 'fits-with-everything' | 'no-small-conflict' | 'indeterminate';
  // Las relajaciones de `conflict` resuelven el conflicto EXAMINADO; no acreditan que el resto de la empresa siga cabiendo. Para eso está `compareOptionsLarge`.
  examined: string[]; maxCommitments: number; relaxationScope: 'examined-commitments-only'; conflict: ConflictResult | null; includesFocus: boolean; missingData: Cause[]; plan: PlanResult;
};
export function* focusConflictSteps(base: OperationalModel, scenario: Supposition[], commitmentId: string, options: Supposition[], control: LargeControl & { maxCommitments?: number } = {}): Steps<FocusResult> {
  const model = branch(base, scenario), c = compileModel(model), focus = c.commitments.findIndex(item => item.id === commitmentId);
  if (focus < 0) throw new OperationalInputError('unknown-target', `No existe el compromiso ${commitmentId}.`);
  const maxCommitments = Math.max(2, Math.min(control.maxCommitments ?? 6, 8));
  const plan = yield* planLargeSteps(model, { tiers: [[commitmentId]] }, control);
  const outcomes = plan.simulation.commitments, own = outcomes[focus];
  const done = (verdict: FocusResult['verdict'], examined: string[], conflict: ConflictResult | null, missingData: Cause[] = []): FocusResult => ({
    format: 'planb-operational-focus-v1', kind: 'proposal', engineVersion: operationalEngineVersion, commitmentId, hypothetical: c.hypothetical, verdict, examined, maxCommitments, relaxationScope: 'examined-commitments-only',
    conflict, includesFocus: Boolean(conflict?.conflict?.commitmentIds.includes(commitmentId)), missingData, plan,
  });
  if (own.projection === 'indeterminate') return done('indeterminate', [commitmentId], null, own.causes);
  if (outcomes.every(item => item.projection === 'on-time')) return done('fits-with-everything', [commitmentId], null);
  // Otro compromiso sin datos impide afirmar que todo encaja (330): si nada llega tarde, el resultado es indeterminado y dice qué falta.
  if (outcomes.every(item => item.projection === 'on-time' || item.projection === 'indeterminate')) {
    return done('indeterminate', [commitmentId], null, outcomes.filter(item => item.projection === 'indeterminate').flatMap(item => item.causes));
  }
  // El propio compromiso puede no caber aunque no tenga rivales (330): se comprueba solo antes de añadir competidores.
  if (own.projection === 'late' || own.projection === 'not-completed') {
    const alone = projectModel(base, [commitmentId]);
    const result = yield* explainConflictSteps(alone, suppositionsFor(alone, scenario), suppositionsFor(alone, options), { nodeBudget: control.nodeBudget ?? 60_000, shouldStop: control.shouldStop });
    if (result.feasible === 'no') return done('conflict', [commitmentId], result);
  }

  const reach = (at: number) => { const seen = new Set<number>(), stack = [...c.commitments[at].jobs]; while (stack.length) { const j = stack.pop()!; if (!seen.has(j)) { seen.add(j); stack.push(...c.jobs[j].deps); } } return seen; };
  const resourcesOf = (at: number) => new Set([...reach(at)].flatMap(j => c.jobs[j].capable));
  const mine = resourcesOf(focus);
  const rivals = c.commitments.map((item, at) => ({ at, id: item.id, shares: [...resourcesOf(at)].some(r => mine.has(r)), late: outcomes[at].projection === 'late' || outcomes[at].projection === 'not-completed', gap: Math.abs(item.due - c.commitments[focus].due) }))
    .filter(item => item.at !== focus && item.shares && outcomes[item.at].projection !== 'indeterminate')
    .sort((a, b) => Number(b.late) - Number(a.late) || a.gap - b.gap || (a.id < b.id ? -1 : 1));
  const examined = [commitmentId];
  for (const rival of rivals) {
    if (examined.length >= maxCommitments) break;
    const projected = projectModel(base, [...examined, rival.id]);
    const result = yield* explainConflictSteps(projected, suppositionsFor(projected, scenario), suppositionsFor(projected, options), { nodeBudget: control.nodeBudget ?? 60_000, shouldStop: control.shouldStop });
    if (result.feasible === 'no') return done('conflict', [...examined, rival.id], result);
    if (result.feasible === 'yes') examined.push(rival.id);
    if (control.shouldStop?.()) break;
  }
  return done('no-small-conflict', examined, null);
}
export const focusConflict = (base: OperationalModel, scenario: Supposition[], commitmentId: string, options: Supposition[], control: LargeControl & { maxCommitments?: number } = {}) =>
  drain(focusConflictSteps(base, scenario, commitmentId, options, control));
