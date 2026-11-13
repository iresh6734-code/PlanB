import {
  OperationalInputError, operationalEngineVersion, operationalLimits, operationalPlan, operationalRevision, planProblems,
  type Fact, type OperationalPlan, type Provenance, type TwinModel,
} from './operational-twin.js';

// SIMULACIÓN DE EVENTOS DISCRETOS del gemelo operativo (unidad CLAUDE-FABLE-OPERATIONAL-CORE-1). Pura y determinista: no usa reloj del sistema ni azar.
// La misma entrada (modelo, reloj, plan, límite) produce la misma secuencia de eventos. Todo resultado es una PROYECCIÓN: nunca dice «cumplido», solo «en plazo según este ensayo».
//
// Semántica del plan: cada recurso recorre su cola en orden y espera al trabajo de cabeza (no adelanta al siguiente). Un trabajo empieza cuando el recurso está libre y en franja,
// sus dependencias CONFIRMADAS han terminado, sus materiales han llegado y ha pasado su inicio mínimo. Trabaja solo dentro de las franjas (se interrumpe al cerrar y se reanuda al abrir).
// Orden de eventos en un mismo minuto: fin de trabajo, interrupción, cierre de franja, llegada de material, reapertura, apertura de franja y después arranques/reanudaciones por ID de recurso.
// Empates restantes: por ID en orden de unidades de código. Los minutos son enteros desde `clock.now`; los inicios se redondean hacia arriba y los cierres hacia abajo.

export const operationalSimulationFormat = 'planb-operational-simulation-v1' as const;

export type CauseCode =
  | 'unknown-duration' | 'contradictory-duration' | 'unknown-travel' | 'contradictory-travel' | 'unknown-material' | 'contradictory-material'
  | 'dependency-cycle' | 'depends-on' | 'waiting-dependency' | 'queued-behind' | 'ordering-deadlock' | 'unknown-capacity' | 'no-capable-resource'
  | 'no-capacity-in-horizon' | 'not-ready-in-horizon' | 'not-in-plan' | 'skills-not-covered' | 'no-jobs' | 'event-limit';
export type Cause = { code: CauseCode; jobId?: string; jobIds?: string[]; materialId?: string; resourceId?: string };
export type Bound = { code: 'resource-busy' | 'dependency' | 'material' | 'earliest-start' | 'clock'; jobId?: string; materialId?: string };
export type Caveat = { code: 'stale-evidence' | 'partial-source' | 'assumed' | 'candidate-dependency'; subject: string; field: string; suppositionId?: string };
export type Evidence = { subject: string; field: string; provenance: Provenance };
export type JobStatus = 'finished' | 'not-completed' | 'blocked' | 'indeterminate' | 'unassigned' | 'invalid-assignment';
export type Projection = 'on-time' | 'late' | 'not-completed' | 'indeterminate';

export type CompiledJob = {
  id: string; commitment: number; work: number; ready: number; earliest: number; materials: number[]; deps: number[]; capable: number[];
  fault: { status: 'indeterminate' | 'blocked'; causes: Cause[] } | null; caveats: Caveat[]; evidence: Evidence[]; reopens: boolean;
};
export type Compiled = {
  model: TwinModel; revision: string; nowMs: number; horizon: number; hypothetical: boolean;
  resources: { id: string; executes: boolean; windows: [number, number][] | null; caveats: Caveat[]; evidence: Evidence[] }[];
  materials: { id: string; at: number | null }[];
  jobs: CompiledJob[];
  commitments: { id: string; due: number; jobs: number[]; caveats: Caveat[] }[];
};

export type SimulationEvent = {
  seq: number; minute: number; at: string;
  type: 'material-arrival' | 'capacity-open' | 'capacity-close' | 'job-start' | 'job-interrupt' | 'job-resume' | 'job-finish' | 'job-reopen';
  resourceId?: string; jobId?: string; materialId?: string;
};
export type JobOutcome = {
  jobId: string; status: JobStatus; resourceId: string | null;
  startMinute: number | null; finishMinute: number | null; startAt: string | null; finishAt: string | null;
  boundBy: Bound[]; waitedForCapacity: boolean; causes: Cause[]; caveats: Caveat[]; evidence: Evidence[];
};
export type ChainStep = { jobId: string; status: JobStatus; resourceId: string | null; startAt: string | null; finishAt: string | null; boundBy: Bound[]; waitedForCapacity: boolean; causes: Cause[] };
export type CommitmentOutcome = {
  commitmentId: string; projection: Projection; dueAt: string; completionMinute: number | null; completionAt: string | null; latenessMinutes: number | null;
  chain: ChainStep[]; causes: Cause[]; caveats: Caveat[];
};
export type SimulationResult = {
  format: typeof operationalSimulationFormat; kind: 'projection'; engineVersion: typeof operationalEngineVersion;
  modelRevision: string; baseRevision: string; hypothetical: boolean; evaluatedAt: string;
  complete: boolean; stoppedBy: 'event-limit' | null; eventCount: number;
  plan: OperationalPlan; events: SimulationEvent[]; jobs: JobOutcome[]; commitments: CommitmentOutcome[];
};

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function compileModel(model: TwinModel): Compiled {
  const nowMs = Date.parse(model.clock.now), horizon = Math.floor((Date.parse(model.clock.horizonEnd) - nowMs) / 60_000);
  if (!(horizon > 0) || horizon > operationalLimits.horizonMinutes) throw new OperationalInputError('horizon', 'Horizonte fuera del límite publicado.');
  if (model.jobs.length > operationalLimits.jobs || model.resources.length > operationalLimits.resources) throw new OperationalInputError('limit', 'El modelo supera los límites publicados.');
  const up = (value: string) => Math.max(0, Math.ceil((Date.parse(value) - nowMs) / 60_000));
  const down = (value: string) => Math.floor((Date.parse(value) - nowMs) / 60_000);
  const inspect = <T>(value: Fact<T>, subject: string, field: string, caveats: Caveat[], evidence: Evidence[]) => {
    if (value.state !== 'known') return;
    const provenance = value.provenance;
    evidence.push({ subject, field, provenance });
    if (provenance.basis === 'assumed') caveats.push({ code: 'assumed', subject, field, suppositionId: provenance.suppositionId });
    if (provenance.basis === 'observed') {
      const age = nowMs - Date.parse(provenance.observedAt);
      // La evidencia antigua (o fechada en el futuro) no se rejuvenece: se usa, pero queda señalada.
      if (age < 0 || age > model.rules.staleAfterMinutes * 60_000) caveats.push({ code: 'stale-evidence', subject, field });
      if (provenance.coverage === 'partial') caveats.push({ code: 'partial-source', subject, field });
    }
  };

  const resources = model.resources.map(item => {
    const caveats: Caveat[] = [], evidence: Evidence[] = [];
    inspect(item.windows, item.id, 'windows', caveats, evidence);
    let windows: [number, number][] | null = null;
    if (item.windows.state === 'known') {
      const raw = item.windows.value.map(value => [up(value.start), Math.min(horizon, down(value.end))] as [number, number]).filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0]);
      windows = [];
      for (const [start, end] of raw) {
        const last = windows[windows.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end); else windows.push([start, end]);
      }
    }
    return { id: item.id, executes: item.executesJobs, skills: new Set(item.skills), windows, caveats, evidence };
  });
  const materialIndex = new Map(model.materials.map((item, index) => [item.id, index]));
  const materials = model.materials.map(item => ({ id: item.id, at: item.availableAt.state === 'known' ? up(item.availableAt.value) : null }));
  const commitmentIndex = new Map(model.commitments.map((item, index) => [item.id, index]));
  const jobIndex = new Map(model.jobs.map((item, index) => [item.id, index]));

  const jobs: CompiledJob[] = model.jobs.map(item => {
    const caveats: Caveat[] = [], evidence: Evidence[] = [], causes: Cause[] = [];
    inspect(item.duration, item.id, 'duration', caveats, evidence);
    inspect(item.travel, item.id, 'travel', caveats, evidence);
    for (const suppositionId of item.assumedBy ?? []) caveats.push({ code: 'assumed', subject: item.id, field: 'job', suppositionId });
    if (item.duration.state !== 'known') causes.push({ code: item.duration.state === 'unknown' ? 'unknown-duration' : 'contradictory-duration' });
    if (item.travel.state !== 'known') causes.push({ code: item.travel.state === 'unknown' ? 'unknown-travel' : 'contradictory-travel' });
    const earliest = item.earliestStart ? up(item.earliestStart) : 0;
    let ready = earliest;
    const used = item.materials.map(materialId => {
      const index = materialIndex.get(materialId)!, source = model.materials[index];
      inspect(source.availableAt, materialId, 'availableAt', caveats, evidence);
      if (source.availableAt.state !== 'known') causes.push({ code: source.availableAt.state === 'unknown' ? 'unknown-material' : 'contradictory-material', materialId });
      else ready = Math.max(ready, materials[index].at!);
      return index;
    });
    // Un vínculo candidato NO crea dependencia: solo queda señalado.
    for (const entry of item.dependencies) if (entry.basis === 'candidate') caveats.push({ code: 'candidate-dependency', subject: item.id, field: entry.jobId });
    return {
      id: item.id, commitment: item.commitmentId ? commitmentIndex.get(item.commitmentId)! : -1,
      work: item.duration.state === 'known' && item.travel.state === 'known' ? item.duration.value + item.travel.value : 0,
      ready, earliest, materials: used, deps: item.dependencies.filter(entry => entry.basis !== 'candidate').map(entry => jobIndex.get(entry.jobId)!),
      capable: resources.flatMap((entry, index) => entry.executes && item.skills.every(skill => entry.skills.has(skill)) ? [index] : []),
      fault: causes.length ? { status: 'indeterminate', causes } : null, caveats, evidence, reopens: Boolean(item.reopens),
    };
  });

  // Ciclos de dependencias confirmadas: resultado explícito, no bucle. Un trabajo está en un ciclo si se alcanza a sí mismo.
  const reach = (from: number) => {
    const seen = new Set<number>(), stack = [...jobs[from].deps];
    while (stack.length) { const next = stack.pop()!; if (!seen.has(next)) { seen.add(next); stack.push(...jobs[next].deps); } }
    return seen;
  };
  jobs.forEach((item, index) => {
    const seen = reach(index);
    if (!seen.has(index)) return;
    const members = [...seen].filter(other => reach(other).has(index)).map(other => jobs[other].id).sort(byId);
    item.fault = { status: 'blocked', causes: [...item.fault?.causes ?? [], { code: 'dependency-cycle', jobIds: members }] };
  });
  // Las consecuencias se propagan por dependencias confirmadas y conservan de quién vienen.
  for (let changed = true; changed;) {
    changed = false;
    for (const item of jobs) for (const dep of item.deps) {
      const origin = jobs[dep].fault;
      if (!origin || item.fault?.causes.some(cause => cause.code === 'dependency-cycle')) continue;
      const known = item.fault?.causes.some(cause => cause.code === 'depends-on' && cause.jobId === jobs[dep].id);
      const status = origin.status === 'blocked' || item.fault?.status === 'blocked' ? 'blocked' : 'indeterminate';
      if (known && item.fault!.status === status) continue;
      item.fault = { status, causes: known ? item.fault!.causes : [...item.fault?.causes ?? [], { code: 'depends-on', jobId: jobs[dep].id }] };
      changed = true;
    }
  }

  const commitments = model.commitments.map((item, index) => ({
    id: item.id, due: down(item.dueAt), jobs: jobs.flatMap((entry, at) => entry.commitment === index ? [at] : []),
    caveats: (item.assumedBy ?? []).map((suppositionId): Caveat => ({ code: 'assumed', subject: item.id, field: 'dueAt', suppositionId })),
  }));
  return { model, revision: operationalRevision(model), nowMs, horizon, hypothetical: Boolean(model.branch), resources, materials, jobs, commitments };
}

const RANK = { 'job-finish': 0, 'job-interrupt': 1, 'capacity-close': 2, 'material-arrival': 3, 'job-reopen': 4, wake: 5, 'capacity-open': 6 } as const;
type Pending = { at: number; rank: number; tie: string; type: keyof typeof RANK; r?: number; j?: number; m?: number; end?: number };

export function simulatePlan(source: TwinModel | Compiled, plan: OperationalPlan, options: { eventLimit?: number } = {}): SimulationResult {
  const c = 'jobs' in source && 'nowMs' in source ? source : compileModel(source as TwinModel);
  const parsed = operationalPlan.parse(plan);
  const problems = planProblems(parsed, new Set(c.resources.map(item => item.id)), new Set(c.jobs.map(item => item.id)));
  if (problems.length) throw new OperationalInputError('invalid-plan', problems.join(' '));
  const limit = Math.min(options.eventLimit ?? operationalLimits.simulationEvents, operationalLimits.simulationEvents);
  const at = (minute: number) => new Date(c.nowMs + minute * 60_000).toISOString();
  const n = c.jobs.length, resourceIndex = new Map(c.resources.map((item, index) => [item.id, index]));
  const jobIndex = new Map(c.jobs.map((item, index) => [item.id, index]));

  const status: (JobStatus | null)[] = c.jobs.map(item => item.fault?.status ?? null);
  const causes: Cause[][] = c.jobs.map(item => item.fault ? [...item.fault.causes] : []);
  const assigned = new Array<number>(n).fill(-1), start = new Array<number>(n).fill(-1), finish = new Array<number>(n).fill(-1);
  const remaining = c.jobs.map(item => item.work), bound: Bound[][] = c.jobs.map(() => []), waited = new Array<boolean>(n).fill(false);
  const queues: number[][] = c.resources.map(() => []);
  for (const sequence of parsed.sequences) {
    const r = resourceIndex.get(sequence.resourceId)!;
    for (const jobId of sequence.jobIds) {
      const j = jobIndex.get(jobId)!;
      assigned[j] = r;
      if (c.jobs[j].fault) continue;
      if (!c.jobs[j].capable.includes(r)) { status[j] = 'invalid-assignment'; causes[j].push({ code: 'skills-not-covered', resourceId: sequence.resourceId }); }
      else if (!c.resources[r].windows) { status[j] = 'indeterminate'; causes[j].push({ code: 'unknown-capacity', resourceId: sequence.resourceId }); }
      else queues[r].push(j);
    }
  }
  c.jobs.forEach((item, j) => { if (assigned[j] < 0 && !item.fault) { status[j] = 'unassigned'; causes[j].push({ code: item.capable.length ? 'not-in-plan' : 'no-capable-resource' }); } });

  const pending: Pending[] = [];
  let head = 0;
  const order = (a: Pending, b: Pending) => a.at - b.at || a.rank - b.rank || byId(a.tie, b.tie);
  const push = (event: Omit<Pending, 'rank'>) => {
    const full: Pending = { ...event, rank: RANK[event.type] };
    let low = head, high = pending.length;
    while (low < high) { const mid = (low + high) >> 1; if (order(pending[mid], full) <= 0) low = mid + 1; else high = mid; }
    pending.splice(low, 0, full);
  };
  c.materials.forEach((item, m) => { if (item.at !== null && item.at > 0 && item.at <= c.horizon) push({ at: item.at, tie: item.id, type: 'material-arrival', m }); });
  // La reapertura es un hecho del escenario: se registra aunque el plan no le haya dado sitio.
  c.jobs.forEach((item, j) => { if (item.reopens && item.earliest <= c.horizon) push({ at: item.earliest, tie: item.id, type: 'job-reopen', j }); });
  queues.forEach((queue, r) => {
    if (!queue.length) return;
    for (const [open, close] of c.resources[r].windows!) {
      push({ at: open, tie: c.resources[r].id, type: 'capacity-open', r, end: close });
      push({ at: close, tie: c.resources[r].id, type: 'capacity-close', r });
    }
    for (const j of queue) {
      if (c.jobs[j].ready > 0) push({ at: c.jobs[j].ready, tie: c.jobs[j].id, type: 'wake', j });
    }
  });

  const events: SimulationEvent[] = [];
  const record = (minute: number, type: SimulationEvent['type'], extra: Partial<SimulationEvent>) => events.push({ seq: events.length, minute, at: at(minute), type, ...extra });
  const inWindow = c.resources.map(() => false), windowEnd = c.resources.map(() => 0), running = c.resources.map(() => -1), paused = c.resources.map(() => false);
  const position = c.resources.map(() => 0), free = c.resources.map(() => 0), dispatchOrder = c.resources.map((_, index) => index).sort((a, b) => byId(c.resources[a].id, c.resources[b].id));
  const schedule = (r: number, j: number, minute: number) => {
    const available = windowEnd[r] - minute;
    if (remaining[j] <= available) { push({ at: minute + remaining[j], tie: c.jobs[j].id, type: 'job-finish', r, j }); remaining[j] = 0; }
    else { remaining[j] -= available; push({ at: windowEnd[r], tie: c.jobs[j].id, type: 'job-interrupt', r, j }); }
  };
  let processed = 0, stoppedBy: SimulationResult['stoppedBy'] = null;

  loop: while (head < pending.length) {
    const minute = pending[head].at;
    if (minute > c.horizon) break;
    while (head < pending.length && pending[head].at === minute) {
      const event = pending[head++];
      if (++processed > limit) { stoppedBy = 'event-limit'; break loop; }
      const r = event.r ?? -1, j = event.j ?? -1;
      switch (event.type) {
        case 'capacity-open': inWindow[r] = true; windowEnd[r] = event.end!; record(minute, event.type, { resourceId: c.resources[r].id }); break;
        case 'capacity-close': inWindow[r] = false; record(minute, event.type, { resourceId: c.resources[r].id }); break;
        case 'job-finish': finish[j] = minute; status[j] = 'finished'; running[r] = -1; free[r] = minute; position[r] += 1; record(minute, event.type, { resourceId: c.resources[r].id, jobId: c.jobs[j].id }); break;
        case 'job-interrupt': paused[r] = true; record(minute, event.type, { resourceId: c.resources[r].id, jobId: c.jobs[j].id }); break;
        case 'material-arrival': record(minute, event.type, { materialId: c.materials[event.m!].id }); break;
        case 'job-reopen': record(minute, event.type, { jobId: c.jobs[j].id }); break;
        case 'wake': break;
      }
    }
    for (const r of dispatchOrder) {
      if (!inWindow[r] || windowEnd[r] <= minute) continue;
      if (running[r] >= 0) {
        if (!paused[r]) continue;
        paused[r] = false; record(minute, 'job-resume', { resourceId: c.resources[r].id, jobId: c.jobs[running[r]].id }); schedule(r, running[r], minute);
        continue;
      }
      const j = queues[r][position[r]];
      if (j === undefined) continue;
      const item = c.jobs[j];
      if (item.ready > minute || item.deps.some(dep => finish[dep] < 0)) continue;
      if (++processed > limit) { stoppedBy = 'event-limit'; break loop; }
      const reasons: (Bound & { when: number })[] = [];
      if (position[r] > 0) reasons.push({ code: 'resource-busy', jobId: c.jobs[queues[r][position[r] - 1]].id, when: free[r] });
      for (const dep of item.deps) reasons.push({ code: 'dependency', jobId: c.jobs[dep].id, when: finish[dep] });
      for (const m of item.materials) reasons.push({ code: 'material', materialId: c.materials[m].id, when: c.materials[m].at! });
      reasons.push({ code: 'earliest-start', when: item.earliest });
      const latest = Math.max(0, ...reasons.map(reason => reason.when));
      bound[j] = latest > 0 ? reasons.filter(reason => reason.when === latest).map(({ when: _when, ...rest }) => rest) : [{ code: 'clock' }];
      waited[j] = minute > latest;
      start[j] = minute; running[r] = j;
      record(minute, 'job-start', { resourceId: c.resources[r].id, jobId: item.id });
      schedule(r, j, minute);
    }
  }

  // Clasificación de lo que no terminó. Con el límite de eventos agotado no se concluye nada sobre lo pendiente.
  queues.forEach((queue, r) => queue.forEach((j, index) => {
    if (finish[j] >= 0) return;
    const item = c.jobs[j], headJob = queue[position[r]];
    if (stoppedBy) { status[j] = 'indeterminate'; causes[j].push({ code: 'event-limit' }); return; }
    if (start[j] >= 0) { status[j] = 'not-completed'; causes[j].push({ code: 'no-capacity-in-horizon', resourceId: c.resources[r].id }); return; }
    if (index > position[r]) { status[j] = 'not-completed'; causes[j].push({ code: 'queued-behind', jobId: c.jobs[headJob].id }); return; }
    const waiting = item.deps.filter(dep => finish[dep] < 0);
    if (waiting.length) { status[j] = 'blocked'; for (const dep of waiting) causes[j].push({ code: 'waiting-dependency', jobId: c.jobs[dep].id }); return; }
    status[j] = 'not-completed';
    causes[j].push(item.ready > c.horizon ? { code: 'not-ready-in-horizon' } : { code: 'no-capacity-in-horizon', resourceId: c.resources[r].id });
  }));
  // Una espera hereda la naturaleza de su origen: si depende de algo indeterminado es indeterminada, no «bloqueada»; un ciclo de esperas entre colas es un bloqueo de orden.
  const links = (j: number) => finish[j] >= 0 ? [] : causes[j].filter(cause => cause.code === 'waiting-dependency' || cause.code === 'queued-behind').map(cause => jobIndex.get(cause.jobId!)!);
  const loops = (j: number) => {
    const seen = new Set<number>(), stack = links(j);
    while (stack.length) {
      const next = stack.pop()!;
      if (next === j) return true;
      if (!seen.has(next)) { seen.add(next); stack.push(...links(next)); }
    }
    return false;
  };
  const resolved = new Map<number, JobStatus>();
  const resolve = (j: number): JobStatus => {
    const known = resolved.get(j);
    if (known) return known;
    const next = links(j);
    let result = status[j]!;
    if (next.length) {
      if (loops(j)) { causes[j].push({ code: 'ordering-deadlock' }); result = 'blocked'; }
      else {
        const origins = next.map(resolve);
        result = origins.includes('indeterminate') ? 'indeterminate' : origins.every(origin => origin === 'not-completed') ? 'not-completed' : 'blocked';
      }
    }
    resolved.set(j, result);
    return result;
  };
  for (let j = 0; j < n; j++) status[j] = resolve(j);

  const jobs: JobOutcome[] = c.jobs.map((item, j) => {
    const r = assigned[j], resource = r >= 0 ? c.resources[r] : null, started = start[j] >= 0, done = finish[j] >= 0;
    return {
      jobId: item.id, status: status[j]!, resourceId: resource?.id ?? null,
      startMinute: started ? start[j] : null, finishMinute: done ? finish[j] : null, startAt: started ? at(start[j]) : null, finishAt: done ? at(finish[j]) : null,
      boundBy: bound[j], waitedForCapacity: waited[j], causes: causes[j],
      caveats: [...item.caveats, ...resource?.caveats ?? []], evidence: [...item.evidence, ...resource?.evidence ?? []],
    };
  });
  const step = (j: number): ChainStep => {
    const { jobId, status: state, resourceId, startAt, finishAt, boundBy, waitedForCapacity, causes: why } = jobs[j];
    return { jobId, status: state, resourceId, startAt, finishAt, boundBy, waitedForCapacity, causes: why };
  };
  const severity: JobStatus[] = ['indeterminate', 'blocked', 'invalid-assignment', 'unassigned', 'not-completed', 'finished'];
  const commitments: CommitmentOutcome[] = c.commitments.map(item => {
    const caveats = [...item.caveats, ...item.jobs.flatMap(j => jobs[j].caveats)], dueAt = at(item.due);
    if (!item.jobs.length) return { commitmentId: item.id, projection: 'indeterminate', dueAt, completionMinute: null, completionAt: null, latenessMinutes: null, chain: [], causes: [{ code: 'no-jobs' }], caveats };
    const worst = [...item.jobs].sort((a, b) => severity.indexOf(status[a]!) - severity.indexOf(status[b]!) || finish[b] - finish[a] || byId(c.jobs[a].id, c.jobs[b].id))[0];
    // Cadena causal derivada de la traza: se sigue lo que retuvo a cada trabajo hasta llegar a un material, una fecha o el reloj.
    const chain: ChainStep[] = [], seen = new Set<number>();
    for (let j: number | undefined = worst; j !== undefined && !seen.has(j) && chain.length < 16;) {
      seen.add(j); chain.push(step(j));
      const next: string | undefined = jobs[j].boundBy.find(entry => entry.code === 'dependency')?.jobId ?? jobs[j].boundBy.find(entry => entry.code === 'resource-busy')?.jobId
        ?? jobs[j].causes.find(cause => cause.jobId)?.jobId;
      j = next === undefined ? undefined : jobIndex.get(next);
    }
    const open = status[worst] !== 'finished';
    const completion = open ? null : finish[worst];
    const projection: Projection = status[worst] === 'indeterminate' ? 'indeterminate' : open ? 'not-completed' : completion! <= item.due ? 'on-time' : 'late';
    return {
      commitmentId: item.id, projection, dueAt, completionMinute: completion, completionAt: completion === null ? null : at(completion),
      latenessMinutes: completion === null ? null : Math.max(0, completion - item.due), chain, causes: open ? jobs[worst].causes : [], caveats,
    };
  });

  return {
    format: operationalSimulationFormat, kind: 'projection', engineVersion: operationalEngineVersion,
    modelRevision: c.revision, baseRevision: c.model.branch?.baseRevision ?? c.revision, hypothetical: c.hypothetical, evaluatedAt: c.model.clock.now,
    complete: stoppedBy === null, stoppedBy, eventCount: processed, plan: parsed, events, jobs, commitments,
  };
}

export type PlanDelta = { commitmentId: string; before: Projection; after: Projection; deltaMinutes: number | null; effect: 'improves' | 'worsens' | 'same' | 'unknown' };
// Compara dos proyecciones compromiso a compromiso. Ninguna mejora es gratuita: lo que empeora aparece junto a lo que mejora.
export function comparePlans(before: SimulationResult, after: SimulationResult): PlanDelta[] {
  const rank: Record<Projection, number> = { 'on-time': 0, late: 1, 'not-completed': 2, indeterminate: -1 };
  return after.commitments.flatMap(next => {
    const prior = before.commitments.find(entry => entry.commitmentId === next.commitmentId);
    if (!prior) return [];
    const deltaMinutes = prior.completionMinute !== null && next.completionMinute !== null ? next.completionMinute - prior.completionMinute : null;
    let effect: PlanDelta['effect'] = 'same';
    if (prior.projection === 'indeterminate' || next.projection === 'indeterminate') effect = prior.projection === next.projection ? 'same' : 'unknown';
    else if (rank[next.projection] !== rank[prior.projection]) effect = rank[next.projection] < rank[prior.projection] ? 'improves' : 'worsens';
    else if (next.projection === 'late' && deltaMinutes) effect = deltaMinutes < 0 ? 'improves' : 'worsens';
    return [{ commitmentId: next.commitmentId, before: prior.projection, after: next.projection, deltaMinutes, effect }];
  });
}
