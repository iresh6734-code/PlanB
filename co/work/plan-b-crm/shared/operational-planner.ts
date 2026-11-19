import {
  OperationalInputError, applySuppositions, operationalEngineVersion, operationalLimits,
  type BranchCosts, type OperationalModel, type OperationalPlan, type Supposition, type TwinModel,
} from './operational-twin.js';
import { comparePlans, compileModel, simulatePlan, type Cause, type ChainStep, type Compiled, type PlanDelta, type Projection, type SimulationResult } from './operational-simulation.js';

// PLANIFICADOR BAJO RESTRICCIONES del gemelo operativo (unidad CLAUDE-FABLE-OPERATIONAL-CORE-1). Puro; no guarda ni ejecuta nada: todo lo que devuelve es una PROPUESTA.
//
// Espacio de planes: asignar cada trabajo a un recurso capaz y ordenar la cola de cada recurso (la misma semántica que `simulatePlan`). Capacidad, precedencia, franjas, habilidades y
// material condicionan cada colocación. La búsqueda es ramificación y poda en profundidad: genera las colocaciones en orden canónico de (inicio, trabajo), lo que cubre todos los planes
// de colas sin repetir intercalados, y poda con una cota inferior admisible del objetivo.
// Objetivo, elegido por la PERSONA: niveles de prioridad de compromisos. Se minimiza lexicográficamente [incumplidos del nivel 1, del nivel 2, …, minutos de penalización].
// El motor no asigna importancia comercial: lo no listado va al último nivel.
// «proven-within-model» solo se afirma cuando la exploración terminó dentro del presupuesto; si no, es «best-found» y no se llama mejor plan posible.

export type Objectives = { tiers: string[][] };
export type SearchControl = { nodeBudget?: number; seed?: number; shouldStop?: () => boolean };
export type SearchReport = { nodes: number; complete: boolean; stoppedBy: 'node-budget' | 'cancelled' | null; optimality: 'proven-within-model' | 'best-found'; seed: number | null };
// `penaltyMinutes` ordena planes, no es un retraso medido: suma el retraso proyectado de lo que termina tarde y, para lo que no termina o es indeterminado, el tiempo hasta el horizonte.
export type PlanKey = { missedByTier: number[]; penaltyMinutes: number };
export type PlanResult = {
  format: 'planb-operational-plan-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion;
  modelRevision: string; baseRevision: string; hypothetical: boolean; requiresConfirmation: true;
  objectives: Objectives; key: PlanKey; plan: OperationalPlan; simulation: SimulationResult; search: SearchReport;
};

type Ctl = { nodes: number; cancelled: boolean; seed: number | null; shouldStop?: () => boolean; budget: number };
type Raw = { key: number[]; sequences: number[][]; complete: boolean; stoppedBy: SearchReport['stoppedBy'] };
type Steps<T> = Generator<void, T, void>;

const INF = Number.POSITIVE_INFINITY;
const lexLess = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const control = (value: SearchControl): Ctl => ({
  nodes: 0, cancelled: false, seed: value.seed ?? null, shouldStop: value.shouldStop,
  budget: Math.max(1, Math.min(value.nodeBudget ?? operationalLimits.searchNodes, operationalLimits.searchNodes)),
});
const report = (ctl: Ctl, complete: boolean, stoppedBy: SearchReport['stoppedBy']): SearchReport =>
  ({ nodes: ctl.nodes, complete, stoppedBy: ctl.cancelled ? 'cancelled' : stoppedBy, optimality: complete ? 'proven-within-model' : 'best-found', seed: ctl.seed });

// Ejecuta una búsqueda hasta el final (bloqueante). Para no bloquear la interfaz usa `runCancellable` y `shouldStop`.
export function drain<T>(steps: Steps<T>): T {
  for (;;) { const next = steps.next(); if (next.done) return next.value; }
}
// Cede el control entre tramos (≈256 nodos). Cancelar = que `shouldStop` devuelva true: la búsqueda termina pronto y devuelve lo explorado como incompleto.
export async function runCancellable<T>(steps: Steps<T>, pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))): Promise<T> {
  for (;;) { const next = steps.next(); if (next.done) return next.value; await pause(); }
}

function place(windows: [number, number][], ready: number, work: number): [number, number] | null {
  let start = -1, left = work;
  for (const [open, close] of windows) {
    if (close <= ready) continue;
    const from = Math.max(open, ready);
    if (start < 0) start = from;
    if (left <= close - from) return [start, from + left];
    left -= close - from;
  }
  return null;
}

function resolveTiers(c: Compiled, objectives: Objectives) {
  const listed = objectives.tiers.flat(), index = new Map(c.commitments.map((item, at) => [item.id, at]));
  if (new Set(listed).size !== listed.length || listed.some(value => !index.has(value))) throw new OperationalInputError('objectives', 'Los niveles de prioridad citan compromisos inexistentes o repetidos.');
  const tierOf = c.commitments.map(() => objectives.tiers.length);
  objectives.tiers.forEach((tier, level) => tier.forEach(value => { tierOf[index.get(value)!] = level; }));
  return { tierOf, tiers: objectives.tiers.length + 1 };
}

function closure(c: Compiled, commitments: number[]): boolean[] {
  const include = c.jobs.map(() => false), stack = commitments.flatMap(at => c.commitments[at].jobs);
  while (stack.length) { const next = stack.pop()!; if (!include[next]) { include[next] = true; stack.push(...c.jobs[next].deps); } }
  return include;
}

// tierOf[compromiso] < 0 significa «no cuenta en este objetivo». `include` restringe los trabajos considerados (los demás no consumen capacidad: podrían ir al final de las colas).
function* search(c: Compiled, tierOf: number[], tiers: number, ctl: Ctl, budget: number, include: boolean[] | null, stopAtNoMiss: boolean): Steps<Raw> {
  const n = c.jobs.length, windows = c.resources.map(item => item.windows ?? []);
  const cap = c.jobs.map((item, j) => item.fault || (include && !include[j]) ? [] : item.capable.filter(r => c.resources[r].windows));
  const dead = cap.map(list => list.length === 0);
  for (let changed = true; changed;) { changed = false; c.jobs.forEach((item, j) => { if (!dead[j] && item.deps.some(dep => dead[dep])) { dead[j] = true; changed = true; } }); }
  const free = c.resources.map(() => 0), fin = new Array<number>(n).fill(-1), sequences: number[][] = c.resources.map(() => []);
  const counted = c.commitments.flatMap((item, at) => tierOf[at] >= 0 ? [{ at, tier: tierOf[at], due: item.due, jobs: item.jobs }] : []);
  let best: { key: number[]; sequences: number[][] } | null = null, local = 0, halt = false, stoppedBy: SearchReport['stoppedBy'] = null;

  // Cota inferior admisible: los tiempos libres solo crecen y los inicios posteriores no preceden al último inicio colocado.
  const evaluate = (lastStart: number, final: boolean) => {
    const key = new Array<number>(tiers + 1).fill(0);
    for (const item of counted) {
      let latest = item.jobs.length ? 0 : INF;
      for (const j of item.jobs) {
        let value = fin[j];
        if (value < 0) {
          value = INF;
          if (!final && !dead[j]) {
            let ready = Math.max(c.jobs[j].ready, lastStart);
            for (const dep of c.jobs[j].deps) if (fin[dep] > ready) ready = fin[dep];
            for (const r of cap[j]) { const slot = place(windows[r], Math.max(ready, free[r]), c.jobs[j].work); if (slot && slot[1] < value) value = slot[1]; }
          }
        }
        if (value > latest) latest = value;
      }
      if (latest > item.due) { key[item.tier] += 1; key[tiers] += Math.max(0, Math.min(latest, c.horizon) - item.due); }
    }
    return key;
  };
  const tie = (j: number, r: number) => {
    if (ctl.seed === null) return 0;
    let value = (ctl.seed ^ Math.imul(j + 1, 0x9e3779b1) ^ Math.imul(r + 1, 0x85ebca6b)) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) >>> 0;
    return (value ^ (value >>> 13)) >>> 0;
  };

  function* dfs(lastStart: number, lastJob: number): Steps<void> {
    if (halt) return;
    ctl.nodes += 1; local += 1;
    if (local > budget) { halt = true; stoppedBy = 'node-budget'; return; }
    if (local % 256 === 0) { yield; if (ctl.cancelled || ctl.shouldStop?.()) { ctl.cancelled = true; halt = true; stoppedBy = 'cancelled'; return; } }
    if (best && !lexLess(evaluate(lastStart, false), best.key)) return;
    const candidates: { j: number; r: number; start: number; end: number; tier: number; due: number; tie: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (fin[j] >= 0 || dead[j]) continue;
      const item = c.jobs[j];
      let ready = item.ready, open = true;
      for (const dep of item.deps) { if (fin[dep] < 0) { open = false; break; } if (fin[dep] > ready) ready = fin[dep]; }
      if (!open) continue;
      for (const r of cap[j]) {
        const slot = place(windows[r], Math.max(ready, free[r]), item.work);
        if (!slot || slot[0] < lastStart || (slot[0] === lastStart && j <= lastJob)) continue;
        const owner = item.commitment >= 0 && tierOf[item.commitment] >= 0 ? item.commitment : -1;
        candidates.push({ j, r, start: slot[0], end: slot[1], tier: owner < 0 ? tiers : tierOf[owner], due: owner < 0 ? INF : c.commitments[owner].due, tie: tie(j, r) });
      }
    }
    if (!candidates.length) {
      const key = evaluate(lastStart, true);
      if (!best || lexLess(key, best.key)) {
        best = { key, sequences: sequences.map(list => [...list]) };
        if (stopAtNoMiss && key.slice(0, tiers).every(value => value === 0)) halt = true;
      }
      return;
    }
    candidates.sort((a, b) => a.start - b.start || a.tier - b.tier || a.due - b.due || a.end - b.end || a.tie - b.tie || a.j - b.j || a.r - b.r);
    for (const next of candidates) {
      const before = free[next.r];
      free[next.r] = next.end; fin[next.j] = next.end; sequences[next.r].push(next.j);
      yield* dfs(next.start, next.j);
      sequences[next.r].pop(); fin[next.j] = -1; free[next.r] = before;
      if (halt) return;
    }
  }
  yield* dfs(0, -1);
  const found = best ?? { key: evaluate(0, true), sequences: c.resources.map(() => []) };
  return { ...found, complete: stoppedBy === null, stoppedBy };
}

function toPlan(c: Compiled, sequences: number[][]): OperationalPlan {
  const lists = sequences.map(list => list.map(j => c.jobs[j].id));
  // Un trabajo cuyo único recurso capaz tiene horario desconocido se deja asignado a él: la simulación lo declara indeterminado en vez de darlo por imposible.
  // Lo mismo vale para lo que depende de él: se deja en cola (al final, donde no retiene a nadie) para que la simulación lo declare indeterminado y no «sin sitio en el plan».
  const placed = new Set(sequences.flat()), uncertain = c.jobs.map(item => !item.fault && item.capable.length > 0 && item.capable.every(r => !c.resources[r].windows));
  for (let changed = true; changed;) {
    changed = false;
    c.jobs.forEach((item, j) => { if (!uncertain[j] && !item.fault && !placed.has(j) && item.capable.length && item.deps.some(dep => uncertain[dep])) { uncertain[j] = true; changed = true; } });
  }
  // Se encolan en orden de dependencias (cada uno después de los suyos) para que el orden de entrada no fabrique un bloqueo circular que no está en los datos (325 F4).
  const queued = new Set<number>();
  const enqueue = (j: number) => {
    if (queued.has(j) || !uncertain[j] || placed.has(j)) return;
    queued.add(j);
    for (const dep of c.jobs[j].deps) enqueue(dep);
    const item = c.jobs[j];
    lists[item.capable.find(r => c.resources[r].windows) ?? item.capable[0]].push(item.id);
  };
  c.jobs.forEach((_, j) => enqueue(j));
  return { sequences: lists.flatMap((jobIds, r) => jobIds.length ? [{ resourceId: c.resources[r].id, jobIds }] : []) };
}

function keyOf(c: Compiled, simulation: SimulationResult, tierOf: number[], tiers: number): number[] {
  const key = new Array<number>(tiers + 1).fill(0);
  simulation.commitments.forEach((item, at) => {
    if (tierOf[at] < 0 || item.projection === 'on-time') return;
    key[tierOf[at]] += 1;
    key[tiers] += Math.max(0, (item.completionMinute ?? c.horizon) - c.commitments[at].due);
  });
  return key;
}

function finish(c: Compiled, raw: Raw, tierOf: number[], tiers: number, ctl: Ctl, objectives: Objectives): PlanResult {
  const plan = toPlan(c, raw.sequences), simulation = simulatePlan(c, plan), key = keyOf(c, simulation, tierOf, tiers);
  // La explicación sale de la simulación del plan elegido; si no coincidiera con la búsqueda sería un defecto del motor, no un matiz.
  if (tierOf.every(value => value >= 0) && key.some((value, at) => value !== raw.key[at])) throw new Error('Inconsistencia interna entre planificador y simulación.');
  return {
    format: 'planb-operational-plan-v1', kind: 'proposal', engineVersion: operationalEngineVersion, modelRevision: c.revision,
    baseRevision: c.model.branch?.baseRevision ?? c.revision, hypothetical: c.hypothetical, requiresConfirmation: true, objectives,
    key: { missedByTier: key.slice(0, tiers), penaltyMinutes: key[tiers] }, plan, simulation, search: report(ctl, raw.complete, raw.stoppedBy),
  };
}

export function* planScheduleSteps(model: TwinModel, objectives: Objectives, options: SearchControl = {}): Steps<PlanResult> {
  const c = compileModel(model), { tierOf, tiers } = resolveTiers(c, objectives), ctl = control(options);
  return finish(c, yield* search(c, tierOf, tiers, ctl, ctl.budget, null, false), tierOf, tiers, ctl, objectives);
}
export const planSchedule = (model: TwinModel, objectives: Objectives, options: SearchControl = {}) => drain(planScheduleSteps(model, objectives, options));

// ── Alternativas no dominadas ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `scenario` son las perturbaciones del ensayo; `options` son respuestas DECLARADAS por la persona (capacidad extra, material alternativo, nueva fecha, dividir).
// Se evalúa cada subconjunto de opciones y se conservan las no dominadas: ninguna otra logra un resultado igual o mejor pidiendo igual o menos de cada tipo de coste.
// Los costes son recuentos de lo que se pide (minutos extra, fechas renegociadas, materiales alternativos, divisiones); no son euros ni ahorro demostrado.
export type Alternative = {
  id: string; suppositionIds: string[]; costs: BranchCosts; authorization: 'unconfirmed';
  result: PlanResult; versusBaseline: PlanDelta[];
};
export type AlternativesResult = {
  format: 'planb-operational-alternatives-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion; baseRevision: string;
  scenario: Supposition[]; options: Supposition[]; baseline: PlanResult; alternatives: Alternative[];
  // «not-explored»: cancelado, o la combinación supera el máximo de supuestos de una rama. No se afirma nada sobre ella.
  discarded: { suppositionIds: string[]; reason: 'dominated' | 'incompatible' | 'not-explored' }[];
  search: SearchReport;
};

const branch = (base: OperationalModel, list: Supposition[]): TwinModel => list.length ? applySuppositions(base, list) : base;
const costList = (costs: BranchCosts) => [costs.extraCapacityMinutes, costs.renegotiatedDates, costs.alternativeMaterials, costs.splits];
const flatKey = (key: PlanKey) => [...key.missedByTier, key.penaltyMinutes];

export function* compareAlternativesSteps(base: OperationalModel, scenario: Supposition[], options: Supposition[], objectives: Objectives, settings: SearchControl = {}): Steps<AlternativesResult> {
  if (options.length > operationalLimits.options) throw new OperationalInputError('limit', `Se comparan como máximo ${operationalLimits.options} opciones.`);
  const ctl = control(settings), total = 1 << options.length, share = Math.max(1, Math.floor(ctl.budget / total));
  const masks = Array.from({ length: total }, (_, mask) => mask).sort((a, b) => bits(a) - bits(b) || a - b);
  const evaluated: Alternative[] = [], discarded: AlternativesResult['discarded'] = [];
  let complete = true, stoppedBy: SearchReport['stoppedBy'] = null, baseline: PlanResult | null = null;
  for (const mask of masks) {
    const subset = options.filter((_, at) => mask & (1 << at)), suppositionIds = subset.map(item => item.id);
    if (ctl.cancelled) { discarded.push({ suppositionIds, reason: 'not-explored' }); continue; }
    let model: TwinModel;
    try { model = branch(base, [...scenario, ...subset]); }
    catch (error) {
      if (error instanceof OperationalInputError && mask) { if (error.code === 'limit') complete = false; discarded.push({ suppositionIds, reason: error.code === 'limit' ? 'not-explored' : 'incompatible' }); continue; }
      throw error;
    }
    const c = compileModel(model), { tierOf, tiers } = resolveTiers(c, objectives);
    const raw = yield* search(c, tierOf, tiers, ctl, share, null, false);
    if (!raw.complete) { complete = false; stoppedBy = raw.stoppedBy; }
    const result = finish(c, raw, tierOf, tiers, ctl, objectives);
    result.search = report(ctl, raw.complete, raw.stoppedBy);
    baseline ??= result;
    const zero: BranchCosts = { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 0, splits: 0 };
    evaluated.push({
      id: mask ? `alt-${suppositionIds.join('+')}` : 'alt-sin-cambios', suppositionIds, costs: mask ? applySuppositions(base, subset).branch!.costs : zero,
      authorization: 'unconfirmed', result, versusBaseline: comparePlans(baseline.simulation, result.simulation),
    });
  }
  const worse = (a: number[], b: number[]) => a.some((value, at) => value > b[at]);
  const alternatives = evaluated.filter(item => {
    const key = flatKey(item.result.key), costs = costList(item.costs);
    const dominated = evaluated.some(other => {
      if (other === item) return false;
      const otherKey = flatKey(other.result.key), otherCosts = costList(other.costs);
      return !lexLess(key, otherKey) && !worse(otherCosts, costs) && (lexLess(otherKey, key) || worse(costs, otherCosts));
    });
    if (dominated) discarded.push({ suppositionIds: item.suppositionIds, reason: 'dominated' });
    return !dominated;
  });
  return {
    format: 'planb-operational-alternatives-v1', kind: 'proposal', engineVersion: operationalEngineVersion, baseRevision: baseline!.baseRevision,
    scenario, options, baseline: baseline!, alternatives, discarded, search: report(ctl, complete && !ctl.cancelled, stoppedBy),
  };
}
export const compareAlternatives = (base: OperationalModel, scenario: Supposition[], options: Supposition[], objectives: Objectives, settings: SearchControl = {}) =>
  drain(compareAlternativesSteps(base, scenario, options, objectives, settings));
function bits(value: number) { let count = 0; for (let rest = value; rest; rest >>= 1) count += rest & 1; return count; }

// ── Por qué no cabe y qué tendría que cambiar ────────────────────────────────────────────────────────────────────────────────────────
type Verdict = 'yes' | 'no' | 'unknown';
function* feasible(c: Compiled, keep: number[], ctl: Ctl, budget: number): Steps<Verdict> {
  const tierOf = c.commitments.map((_, at) => keep.includes(at) ? 0 : -1);
  const raw = yield* search(c, tierOf, 1, ctl, budget, closure(c, keep), true);
  return raw.key[0] === 0 ? 'yes' : raw.complete ? 'no' : 'unknown';
}
// Un compromiso es indeterminado si alguno de sus trabajos depende de un dato desconocido o contradictorio, o no tiene trabajos: no entra en conflictos ni se da por viable.
// Se recorre el mismo cierre de dependencias confirmadas que usa la búsqueda: un predecesor de OTRO compromiso sin duración o sin horario conocido deja a este sin determinar.
// Horario desconocido no es lo mismo que horario conocido sin huecos: lo primero es falta de dato; lo segundo, falta real de capacidad y puede dar un conflicto.
function indeterminate(c: Compiled, at: number): Cause[] | null {
  const item = c.commitments[at];
  if (!item.jobs.length) return [{ code: 'no-jobs' }];
  const needed = closure(c, [at]);
  const causes = c.jobs.flatMap((_, j) => needed[j] ? [j] : []).flatMap(j => {
    const job = c.jobs[j];
    if (job.fault?.status === 'indeterminate') return job.fault.causes.map(cause => ({ ...cause, jobId: cause.jobId ?? job.id }));
    if (!job.fault && job.capable.length && job.capable.every(r => !c.resources[r].windows)) return [{ code: 'unknown-capacity' as const, jobId: job.id, resourceId: c.resources[job.capable[0]].id }];
    return [];
  });
  return causes.length ? causes : null;
}

export type ConflictResult = {
  format: 'planb-operational-conflict-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion; modelRevision: string; hypothetical: boolean;
  feasible: Verdict;
  // «verified-irreducible»: se comprobó exhaustivamente, dentro de este modelo, que el conjunto no cabe y que al quitar cualquiera de sus compromisos sí cabe.
  // No es necesariamente el conflicto más pequeño que existe. «explanatory»: alguna comprobación agotó el presupuesto; sirve para entender, no demuestra minimalidad.
  conflict: { commitmentIds: string[]; minimality: 'verified-irreducible' | 'explanatory'; resources: string[]; materials: string[]; chains: { commitmentId: string; projection: Projection; chain: ChainStep[] }[] } | null;
  indeterminate: { commitmentId: string; causes: Cause[] }[];
  // Fecha mínima que necesitaría cada compromiso del conflicto si los demás del conflicto conservan la suya. Renegociar no está autorizado por aparecer aquí.
  dueChanges: { commitmentId: string; neededDueAt: string | null; minutesBeyondDue: number | null; proven: boolean }[];
  // «not-explored»: añadirla superaría el máximo de supuestos de la rama; no se comprobó.
  relaxations: { supposition: Supposition; effect: 'resolves' | 'does-not-resolve' | 'unknown' | 'incompatible' | 'not-explored'; authorization: 'unconfirmed' }[];
  search: SearchReport;
};

export function* explainConflictSteps(base: OperationalModel, scenario: Supposition[], options: Supposition[], settings: SearchControl = {}): Steps<ConflictResult> {
  const c = compileModel(branch(base, scenario)), ctl = control(settings);
  const unknowns = c.commitments.flatMap((item, at) => { const causes = indeterminate(c, at); return causes ? [{ commitmentId: item.id, causes }] : []; });
  const determinate = c.commitments.flatMap((item, at) => unknowns.some(entry => entry.commitmentId === item.id) ? [] : [at]);
  const share = Math.max(1, Math.floor(ctl.budget / (2 * determinate.length + options.length + 2)));
  let exact = true;
  const done = (verdict: Verdict, conflict: ConflictResult['conflict'], dueChanges: ConflictResult['dueChanges'], relaxations: ConflictResult['relaxations']): ConflictResult => ({
    format: 'planb-operational-conflict-v1', kind: 'proposal', engineVersion: operationalEngineVersion, modelRevision: c.revision, hypothetical: c.hypothetical,
    feasible: verdict, conflict, indeterminate: unknowns, dueChanges, relaxations, search: report(ctl, exact && !ctl.cancelled, exact ? null : 'node-budget'),
  });
  const all = yield* feasible(c, determinate, ctl, share);
  if (all !== 'no') { exact = all === 'yes'; return done(all, null, [], []); }

  let keep = [...determinate];
  for (const candidate of determinate) {
    const without = keep.filter(at => at !== candidate), verdict: Verdict = without.length ? yield* feasible(c, without, ctl, share) : 'yes';
    if (verdict === 'no') keep = without;
    else if (verdict === 'unknown') exact = false;
  }
  const minimality = exact ? 'verified-irreducible' as const : 'explanatory' as const;

  const scoped = c.commitments.map((_, at) => keep.includes(at) ? 0 : -1);
  const plan = yield* search(c, scoped, 1, ctl, share, closure(c, keep), false);
  const simulation = simulatePlan(c, toPlan(c, plan.sequences));
  // Restricciones activas: lo que retuvo a CADA compromiso del conflicto en un plan óptimo para ellos (también a los que llegan, porque su holgura es la que falta al resto).
  const chains = keep.map(at => ({ commitmentId: c.commitments[at].id, projection: simulation.commitments[at].projection, chain: simulation.commitments[at].chain }));
  const steps = chains.flatMap(entry => entry.chain);
  const sorted = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

  const dueChanges: ConflictResult['dueChanges'] = [];
  for (const target of keep) {
    const tierOf = c.commitments.map((_, at) => at === target ? 1 : keep.includes(at) ? 0 : -1);
    const raw = yield* search(c, tierOf, 2, ctl, share, closure(c, keep), false);
    const outcome = simulatePlan(c, toPlan(c, raw.sequences)).commitments[target];
    const usable = raw.key[0] === 0 && outcome.completionMinute !== null;
    dueChanges.push({ commitmentId: c.commitments[target].id, neededDueAt: usable ? outcome.completionAt : null, minutesBeyondDue: usable ? outcome.latenessMinutes : null, proven: raw.complete });
  }

  const ids = keep.map(at => c.commitments[at].id), relaxations: ConflictResult['relaxations'] = [];
  for (const option of options) {
    let effect: ConflictResult['relaxations'][number]['effect'] = 'incompatible';
    try {
      const relaxed = compileModel(applySuppositions(base, [...scenario, option]));
      const verdict = yield* feasible(relaxed, ids.map(value => relaxed.commitments.findIndex(item => item.id === value)), ctl, share);
      effect = verdict === 'yes' ? 'resolves' : verdict === 'no' ? 'does-not-resolve' : 'unknown';
    } catch (error) { if (!(error instanceof OperationalInputError)) throw error; if (error.code === 'limit') { effect = 'not-explored'; exact = false; } }
    relaxations.push({ supposition: option, effect, authorization: 'unconfirmed' });
  }
  return done('no', {
    commitmentIds: ids, minimality, resources: sorted(steps.map(entry => entry.resourceId)),
    materials: sorted(steps.flatMap(entry => entry.boundBy.map(value => value.materialId))), chains,
  }, dueChanges, relaxations);
}
export const explainConflict = (base: OperationalModel, scenario: Supposition[], options: Supposition[], settings: SearchControl = {}) => drain(explainConflictSteps(base, scenario, options, settings));

// «¿Qué tendría que cambiar para que este compromiso llegara, conservando los que indique la persona?» Condiciones concretas, ninguna dada por disponible ni autorizada.
// La fecha de material se busca por bisección suponiendo que recibirlo antes nunca perjudica (cierto para el plan óptimo; con búsqueda incompleta la condición queda `proven: false`).
export type Condition =
  | { type: 'due-at-least'; commitmentId: string; dueAt: string; minutesBeyondDue: number; proven: boolean }
  | { type: 'material-by'; materialId: string; latestAt: string; currentAt: string; proven: boolean }
  | { type: 'option'; suppositionId: string; proven: boolean };
export type WhatWouldWorkResult = {
  format: 'planb-operational-conditions-v1'; kind: 'proposal'; engineVersion: typeof operationalEngineVersion; modelRevision: string; hypothetical: boolean;
  commitmentId: string; keeping: string[]; alreadyWorks: Verdict; missingData: Cause[]; conditions: Condition[];
  // Condiciones que NO se pudieron explorar porque probarlas añadiría un supuesto por encima del máximo de la rama. No se afirma que no existan.
  unexplored: { type: 'material-by' | 'option'; id: string; reason: 'supposition-limit' }[];
  search: SearchReport;
};

export function* whatWouldMakeItWorkSteps(base: OperationalModel, scenario: Supposition[], commitmentId: string, keeping: string[], options: Supposition[], settings: SearchControl = {}): Steps<WhatWouldWorkResult> {
  const c = compileModel(branch(base, scenario)), ctl = control(settings);
  const at = (model: Compiled, value: string) => {
    const found = model.commitments.findIndex(item => item.id === value);
    if (found < 0) throw new OperationalInputError('unknown-target', `No existe el compromiso ${value}.`);
    return found;
  };
  const target = at(c, commitmentId), others = [...new Set(keeping)].filter(value => value !== commitmentId), set = [target, ...others.map(value => at(c, value))];
  const include = closure(c, set), usedMaterials = [...new Set(c.jobs.flatMap((job, j) => include[j] ? job.materials : []))].filter(m => (c.materials[m].at ?? 0) > 0);
  const share = Math.max(1, Math.floor(ctl.budget / (2 + options.length + usedMaterials.length * 16)));
  let exact = true;
  const unexplored: WhatWouldWorkResult['unexplored'] = [];
  const done = (alreadyWorks: Verdict, missingData: Cause[], conditions: Condition[]): WhatWouldWorkResult => ({
    format: 'planb-operational-conditions-v1', kind: 'proposal', engineVersion: operationalEngineVersion, modelRevision: c.revision, hypothetical: c.hypothetical,
    commitmentId, keeping: others, alreadyWorks, missingData, conditions, unexplored, search: report(ctl, exact && !ctl.cancelled, exact ? null : 'node-budget'),
  });
  const missing = set.flatMap(value => indeterminate(c, value) ?? []);
  if (missing.length) return done('unknown', missing, []);
  const now = yield* feasible(c, set, ctl, share);
  if (now !== 'no') { exact = now === 'yes'; return done(now, [], []); }

  const conditions: Condition[] = [];
  const tierOf = c.commitments.map((_, index) => index === target ? 1 : set.includes(index) ? 0 : -1);
  const raw = yield* search(c, tierOf, 2, ctl, share, include, false);
  if (!raw.complete) exact = false;
  const outcome = simulatePlan(c, toPlan(c, raw.sequences)).commitments[target];
  if (raw.key[0] === 0 && outcome.completionAt && outcome.latenessMinutes) conditions.push({ type: 'due-at-least', commitmentId, dueAt: outcome.completionAt, minutesBeyondDue: outcome.latenessMinutes, proven: raw.complete });

  const tryWith = function* (extra: Supposition): Steps<Verdict | 'limit'> {
    if (scenario.length + 1 > operationalLimits.suppositions) return 'limit';
    try {
      const changed = compileModel(applySuppositions(base, [...scenario, extra]));
      return yield* feasible(changed, [commitmentId, ...others].map(value => at(changed, value)), ctl, share);
    } catch (error) { if (error instanceof OperationalInputError) return 'no'; throw error; }
  };
  const iso = (minute: number) => new Date(c.nowMs + minute * 60_000).toISOString();
  for (const m of usedMaterials) {
    const material = c.materials[m], probe = (minute: number): Supposition => ({ id: 'cond-material', type: 'material-availability', materialId: material.id, availableAt: iso(minute) });
    if (scenario.some(item => item.id === 'cond-material')) throw new OperationalInputError('duplicate-supposition', 'El ID cond-material está reservado.');
    let proven = true;
    const first = yield* tryWith(probe(0));
    if (first === 'limit') { unexplored.push({ type: 'material-by', id: material.id, reason: 'supposition-limit' }); exact = false; continue; }
    if (first !== 'yes') { if (first === 'unknown') exact = false; continue; }
    let low = 0, high = material.at!; // low funciona; high (la fecha actual) no
    while (high - low > 1) {
      const mid = (low + high) >> 1, verdict = yield* tryWith(probe(mid));
      if (verdict === 'unknown') { proven = false; exact = false; }
      if (verdict === 'yes') low = mid; else high = mid;
    }
    conditions.push({ type: 'material-by', materialId: material.id, latestAt: iso(low), currentAt: iso(material.at!), proven });
  }
  for (const option of options) {
    const verdict = yield* tryWith(option);
    if (verdict === 'limit') { unexplored.push({ type: 'option', id: option.id, reason: 'supposition-limit' }); exact = false; continue; }
    if (verdict === 'unknown') exact = false;
    if (verdict === 'yes') conditions.push({ type: 'option', suppositionId: option.id, proven: true });
  }
  return done('no', [], conditions);
}
export const whatWouldMakeItWork = (base: OperationalModel, scenario: Supposition[], commitmentId: string, keeping: string[], options: Supposition[], settings: SearchControl = {}) =>
  drain(whatWouldMakeItWorkSteps(base, scenario, commitmentId, keeping, options, settings));
