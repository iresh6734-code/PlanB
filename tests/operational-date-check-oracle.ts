// ORÁCULO INDEPENDIENTE de Comprobar una fecha (unidad CLAUDE-OPUS-DATE-CHECK-CORE). No importa nada del motor ni de shared/: trabaja en minutos enteros desde el reloj.
//
// Qué hace distinto del motor, a propósito:
//  · El motor asigna el material ANTES de planificar y busca con ramificación y poda. El oráculo enumera TODAS las colas posibles (asignación + orden) y simula cada una con
//    su propio bucle de eventos.
//  · El material se decide DURANTE la simulación: un trabajo solo empieza en t si, con los consumos que ya ocurrieron, su propio consumo en t y las retenciones de mayor
//    prioridad todavía pendientes (en su instante de necesidad), el saldo no queda negativo en ningún instante. Prioridad: reservas protegidas > solicitud > parte cedida.
//  · La primera fecha sustentada se obtiene como el mínimo directo sobre todas las colas, sin bisección.
// Semántica compartida (la del gemelo): cada recurso recorre su cola en orden y espera al de cabeza; un trabajo trabaja solo dentro de franjas y se reanuda al abrir.

export type OracleInstance = {
  horizon: number;
  resources: { id: string; windows: [number, number][]; skills: string[] }[];
  jobs: { id: string; commitment: string; work: number; earliest: number; skills: string[]; current: string; demand: { quantity: number; reserved: boolean } | null }[];
  commitments: { id: string; due: number; protected: boolean }[];
  supplies: { at: number; quantity: number }[];
  request: { id: string; work: number; windowStart: number; due: number; skills: string[]; quantity: number };
  released: number; // unidades cedidas de la reserva (se aplican a la primera reserva por ID)
};

export type OracleAnswer = { floor: number; meets: boolean; earliest: number | null; minWithRequest: number };

type Job = { id: string; commitment: string; work: number; earliest: number; skills: string[]; quantity: number; held: number; cls: 0 | 1 };

function capable(resource: OracleInstance['resources'][number], job: { skills: string[] }) { return job.skills.every(skill => resource.skills.includes(skill)); }

// Todas las formas de repartir trabajos en colas ordenadas, respetando capacidades.
function* queuesOf(jobs: Job[], resources: OracleInstance['resources']): Generator<string[][]> {
  const queues: string[][] = resources.map(() => []);
  function* place(index: number): Generator<string[][]> {
    if (index === jobs.length) { yield queues.map(queue => [...queue]); return; }
    const job = jobs[index];
    for (let r = 0; r < resources.length; r++) {
      if (!capable(resources[r], job)) continue;
      for (let at = 0; at <= queues[r].length; at++) {
        queues[r].splice(at, 0, job.id);
        yield* place(index + 1);
        queues[r].splice(at, 1);
      }
    }
  }
  yield* place(0);
}

// Simulación propia. Devuelve el minuto de fin de cada trabajo (o null si no termina en el horizonte).
function simulate(instance: OracleInstance, jobs: Job[], queues: string[][], requestId: string): Map<string, number | null> {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const finish = new Map<string, number | null>(jobs.map(job => [job.id, null]));
  const position = queues.map(() => 0), freeAt = queues.map(() => 0);
  const consumed: { at: number; quantity: number }[] = [];
  const started = new Set<string>();
  // Definición del oráculo: consumir en `now` está permitido si el saldo no queda negativo en ningún instante y no RETRASA ninguna demanda de mayor prioridad que
  // todavía no ha empezado. Para comprobarlo se colocan primero esas demandas, una a una en orden de prioridad, en el primer instante (≥ su necesidad y ≥ ahora) en que
  // caben sin consumo nuevo; después se añade el consumo propuesto y se exige saldo no negativo en todos los instantes.
  const nonNegative = (outflows: { at: number; quantity: number }[]) => {
    const marks = [...new Set([...instance.supplies.map(item => item.at), ...outflows.map(item => item.at)])].sort((a, b) => a - b);
    for (const mark of marks) {
      const inflow = instance.supplies.reduce((sum, item) => sum + (item.at <= mark ? item.quantity : 0), 0);
      const outflow = outflows.reduce((sum, item) => sum + (item.at <= mark ? item.quantity : 0), 0);
      if (inflow - outflow < 0) return false;
    }
    return true;
  };
  type Pending = { owner: string; cls: 0 | 1 | 2; need: number; quantity: number };
  const order = (a: Pending, b: Pending) => a.cls - b.cls || a.need - b.need || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0);
  const balanceOk = (now: number, job: Job) => {
    if (job.quantity === 0) return true;
    const pending: Pending[] = [];
    for (const other of jobs) {
      if (started.has(other.id) || other.quantity === 0) continue;
      if (other.id === requestId) pending.push({ owner: other.id, cls: 1, need: other.earliest, quantity: other.quantity });
      else {
        if (other.held > 0) pending.push({ owner: other.id, cls: 0, need: other.earliest, quantity: other.held });
        if (other.quantity > other.held) pending.push({ owner: other.id, cls: 2, need: other.earliest, quantity: other.quantity - other.held });
      }
    }
    // La parte de menor prioridad de este trabajo decide frente a quién compite; su parte protegida, si la tiene, se coloca como una más.
    const mine = pending.filter(item => item.owner === job.id).sort(order);
    const lowest = mine[mine.length - 1];
    const higher = pending.filter(item => (item.owner !== job.id && order(item, lowest) < 0) || (item.owner === job.id && item !== lowest)).sort(order);
    const placed: { at: number; quantity: number; owner: string }[] = [];
    for (const claim of higher) {
      const from = Math.max(claim.need, now);
      const options = [from, ...instance.supplies.map(item => item.at).filter(value => value > from)].sort((a, b) => a - b);
      const spot = options.find(value => value <= instance.horizon && nonNegative([...consumed, ...placed, { at: value, quantity: claim.quantity }]));
      if (spot !== undefined) placed.push({ at: spot, quantity: claim.quantity, owner: claim.owner });
    }
    return nonNegative([...consumed, ...placed.filter(item => item.owner !== job.id), { at: now, quantity: job.quantity }]);
  };
  // Avanza un trabajo desde `from` por las franjas de su recurso; devuelve el minuto de fin o null.
  const run = (r: number, from: number, work: number): number | null => {
    let left = work;
    for (const [open, close] of instance.resources[r].windows) {
      if (close <= from) continue;
      const start = Math.max(open, from);
      if (start >= instance.horizon) return null;
      const end = Math.min(close, instance.horizon);
      if (left <= end - start) return start + left;
      left -= end - start;
    }
    return null;
  };
  // Instantes donde algo puede cambiar.
  const points = new Set<number>([0]);
  for (const resource of instance.resources) for (const [open] of resource.windows) points.add(open);
  for (const item of instance.supplies) points.add(item.at);
  for (const job of jobs) points.add(job.earliest);
  const blockedForever = new Set<number>();
  for (let guard = 0; guard < 10_000; guard++) {
    const now = [...points].filter(point => point <= instance.horizon).sort((a, b) => a - b).find(point => point >= 0);
    if (now === undefined) break;
    points.delete(now);
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let r = 0; r < queues.length; r++) {
        if (blockedForever.has(r)) continue;
        const jobId = queues[r][position[r]];
        if (jobId === undefined || freeAt[r] > now) continue;
        const job = byId.get(jobId)!;
        if (job.earliest > now) continue;
        const inWindow = instance.resources[r].windows.some(([open, close]) => open <= now && now < close);
        if (!inWindow) continue;
        if (!balanceOk(now, job)) continue;
        const end = run(r, now, job.work);
        started.add(job.id);
        if (job.quantity > 0) consumed.push({ at: now, quantity: job.quantity });
        if (end === null) { blockedForever.add(r); continue; }
        finish.set(job.id, end); freeAt[r] = end; position[r] += 1; points.add(end);
        progressed = true;
      }
    }
  }
  return finish;
}

function evaluate(instance: OracleInstance, withRequest: boolean, protectedDue: Map<string, number>): { protectedMissed: number; request: number | null }[] {
  const reserved = instance.jobs.filter(job => job.demand?.reserved).sort((a, b) => (a.id < b.id ? -1 : 1));
  const releaseTarget = reserved[0]?.id;
  const jobs: Job[] = instance.jobs.map(job => {
    const quantity = job.demand?.quantity ?? 0;
    const held = job.demand?.reserved ? Math.max(0, quantity - (job.id === releaseTarget ? instance.released : 0)) : 0;
    return { id: job.id, commitment: job.commitment, work: job.work, earliest: job.earliest, skills: job.skills, quantity, held, cls: 0 };
  });
  if (withRequest) jobs.push({ id: instance.request.id, commitment: instance.request.id, work: instance.request.work, earliest: instance.request.windowStart, skills: instance.request.skills, quantity: instance.request.quantity, held: 0, cls: 1 });
  const results: { protectedMissed: number; request: number | null }[] = [];
  for (const queues of queuesOf(jobs, instance.resources)) {
    const finish = simulate(instance, jobs, queues, instance.request.id);
    let protectedMissed = 0;
    for (const commitment of instance.commitments) {
      const due = protectedDue.get(commitment.id);
      if (due === undefined) continue;
      const parts = instance.jobs.filter(job => job.commitment === commitment.id).map(job => finish.get(job.id) ?? null);
      const done = parts.every(value => value !== null) ? Math.max(...(parts as number[])) : null;
      if (done === null || done > due) protectedMissed += 1;
    }
    results.push({ protectedMissed, request: withRequest ? finish.get(instance.request.id) ?? null : null });
  }
  return results;
}

// Proteger lo que ya llega tarde = no empeorar su fecha proyectada con el plan actual. Lo que no termina con el plan actual no se protege con una fecha.
function protectedDues(instance: OracleInstance): Map<string, number> {
  const jobs: Job[] = instance.jobs.map(job => ({ id: job.id, commitment: job.commitment, work: job.work, earliest: job.earliest, skills: job.skills, quantity: job.demand?.quantity ?? 0, held: job.demand?.reserved ? job.demand.quantity : 0, cls: 0 }));
  const queues = instance.resources.map(resource => instance.jobs.filter(job => job.current === resource.id).map(job => job.id));
  const finish = simulate(instance, jobs, queues, '__none__');
  const dues = new Map<string, number>();
  for (const commitment of instance.commitments) {
    if (!commitment.protected) continue;
    const parts = instance.jobs.filter(job => job.commitment === commitment.id).map(job => finish.get(job.id) ?? null);
    if (parts.some(value => value === null)) continue;
    const done = Math.max(...(parts as number[]));
    dues.set(commitment.id, done > commitment.due ? done : commitment.due);
  }
  return dues;
}

export function oracle(instance: OracleInstance): OracleAnswer {
  const dues = protectedDues(instance);
  const floor = Math.min(...evaluate(instance, false, dues).map(item => item.protectedMissed));
  const withRequest = evaluate(instance, true, dues);
  const minWithRequest = Math.min(...withRequest.map(item => item.protectedMissed));
  const feasible = withRequest.filter(item => item.protectedMissed <= floor && item.request !== null).map(item => item.request!);
  const earliest = feasible.length ? Math.min(...feasible) : null;
  return { floor, meets: earliest !== null && earliest <= instance.request.due, earliest, minWithRequest };
}

// Generador con semilla de instancias pequeñas (≤ 3 trabajos + solicitud, ≤ 2 técnicos, un pool).
export function randomInstance(seed: number): OracleInstance {
  let state = seed >>> 0 || 1;
  const next = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 2 ** 32; };
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  const day = 1440, horizon = 3 * day;
  const shift = (offset: number): [number, number][] => [0, 1, 2].map(d => [d * day + offset, d * day + offset + 480] as [number, number]);
  const resources = Array.from({ length: int(1, 2) }, (_, index) => ({ id: `tech-${index + 1}`, windows: shift(int(0, 2) * 60), skills: ['vrf', ...(next() < 0.5 ? ['solar'] : [])] }));
  const count = int(1, 3);
  const jobs: OracleInstance['jobs'] = Array.from({ length: count }, (_, index) => {
    const needsSolar = next() < 0.3 && resources.some(resource => resource.skills.includes('solar'));
    const reserved = index === 0 && next() < 0.7;
    return {
      id: `j${index + 1}`, commitment: `c${index + 1}`, work: int(2, 9) * 30, earliest: next() < 0.4 ? int(0, 2) * day + int(0, 4) * 60 : 0,
      skills: needsSolar ? ['solar'] : ['vrf'], current: '', demand: reserved ? { quantity: int(2, 8), reserved: true } : null,
    };
  });
  for (const job of jobs) job.current = resources.filter(resource => capable(resource, job))[int(0, resources.filter(resource => capable(resource, job)).length - 1)].id;
  const commitments = jobs.map(job => ({ id: job.commitment, due: int(0, 2) * day + 480 + int(0, 2) * 60, protected: next() < 0.6 }));
  const supplies = [{ at: 0, quantity: int(4, 14) }, ...(next() < 0.6 ? [{ at: int(1, 2) * day + int(0, 3) * 60, quantity: int(2, 10) }] : [])];
  const reservedQuantity = jobs[0].demand?.quantity ?? 0;
  return {
    horizon, resources, jobs, commitments, supplies,
    request: { id: 'req', work: int(2, 8) * 30, windowStart: int(0, 1) * day, due: int(0, 2) * day + 480 + int(0, 2) * 60, skills: ['vrf'], quantity: int(1, 10) },
    released: reservedQuantity > 0 && next() < 0.4 ? int(1, reservedQuantity) : 0,
  };
}
