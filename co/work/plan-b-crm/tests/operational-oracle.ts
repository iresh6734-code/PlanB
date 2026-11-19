// ORÁCULO EXHAUSTIVO INDEPENDIENTE del gemelo operativo (unidad CLAUDE-FABLE-OPERATIONAL-CORE-1).
// No importa nada de shared/operational-*: lee el JSON del modelo y evalúa con su propia técnica (una línea de tiempo de minutos trabajables por recurso), distinta de la del motor.
// Enumera TODAS las asignaciones trabajo→recurso capaz y TODAS las permutaciones de cada cola. Solo sirve para modelos pequeños con todos los datos conocidos.
// El generador de casos vive en las pruebas, separado de este archivo.

type Known<T> = { state: string; value?: T };
type OracleModel = {
  clock: { now: string; horizonEnd: string };
  resources: { id: string; executesJobs: boolean; skills: string[]; windows: Known<{ start: string; end: string }[]> }[];
  materials: { id: string; availableAt: Known<string> }[];
  commitments: { id: string; dueAt: string }[];
  jobs: { id: string; commitmentId: string | null; duration: Known<number>; travel: Known<number>; skills: string[]; materials: string[]; earliestStart: string | null; dependencies: { jobId: string; basis: string }[] }[];
};

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, at) => permutations([...items.slice(0, at), ...items.slice(at + 1)]).map(rest => [item, ...rest]));
}

// Clave que minimiza la persona: [incumplidos del nivel 1, …, incumplidos del último nivel implícito, minutos de penalización].
export function oracleBestKey(model: OracleModel, tiers: string[][]): { key: number[]; evaluated: number } {
  const now = Date.parse(model.clock.now), horizon = Math.floor((Date.parse(model.clock.horizonEnd) - now) / 60_000);
  const minuteUp = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
  const need = <T>(fact: Known<T>): T => { if (fact.state !== 'known') throw new Error('El oráculo solo admite datos conocidos.'); return fact.value as T; };
  const timeline = model.resources.map(resource => {
    const minutes: number[] = [];
    if (!resource.executesJobs) return minutes;
    const windows = need(resource.windows).map(value => [Date.parse(value.start), Date.parse(value.end)]);
    for (let minute = 0; minute < horizon; minute++) {
      const from = now + minute * 60_000;
      if (windows.some(([start, end]) => start <= from && from + 60_000 <= end)) minutes.push(minute);
    }
    return minutes;
  });
  const jobs = model.jobs.map(job => ({
    work: need(job.duration) + need(job.travel),
    ready: Math.max(job.earliestStart ? minuteUp(job.earliestStart) : 0, ...job.materials.map(id => minuteUp(need(model.materials.find(item => item.id === id)!.availableAt)))),
    deps: job.dependencies.filter(entry => entry.basis !== 'candidate').map(entry => model.jobs.findIndex(item => item.id === entry.jobId)),
    capable: model.resources.flatMap((resource, r) => resource.executesJobs && job.skills.every(skill => resource.skills.includes(skill)) ? [r] : []),
  }));
  const tierOf = model.commitments.map(item => { const level = tiers.findIndex(tier => tier.includes(item.id)); return level < 0 ? tiers.length : level; });
  const owned = model.commitments.map(item => model.jobs.flatMap((job, j) => job.commitmentId === item.id ? [j] : []));
  const due = model.commitments.map(item => Math.floor((Date.parse(item.dueAt) - now) / 60_000));

  const evaluate = (queues: number[][]): number[] => {
    const finish = jobs.map(() => -1), position = queues.map(() => 0), free = queues.map(() => 0), stuck = queues.map(() => false);
    for (let progress = true; progress;) {
      progress = false;
      queues.forEach((queue, r) => {
        while (!stuck[r] && position[r] < queue.length) {
          const j = queue[position[r]], job = jobs[j];
          if (job.deps.some(dep => finish[dep] < 0)) return;
          const ready = Math.max(free[r], job.ready, ...job.deps.map(dep => finish[dep]));
          const first = timeline[r].findIndex(minute => minute >= ready);
          if (first < 0 || first + job.work - 1 >= timeline[r].length) { stuck[r] = true; return; }
          finish[j] = timeline[r][first + job.work - 1] + 1; free[r] = finish[j]; position[r] += 1; progress = true;
        }
      });
    }
    const key = new Array<number>(tiers.length + 2).fill(0);
    model.commitments.forEach((_, at) => {
      const done = owned[at].length > 0 && owned[at].every(j => finish[j] >= 0), completion = done ? Math.max(...owned[at].map(j => finish[j])) : null;
      if (completion !== null && completion <= due[at]) return;
      key[tierOf[at]] += 1;
      key[tiers.length + 1] += Math.max(0, (completion ?? horizon) - due[at]);
    });
    return key;
  };
  const less = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

  let best: number[] | null = null, evaluated = 0;
  const assign = (j: number, groups: number[][]) => {
    if (j === jobs.length) {
      const options = groups.map(permutations);
      const walk = (r: number, queues: number[][]) => {
        if (r === options.length) { const key = evaluate(queues); evaluated += 1; if (!best || less(key, best)) best = key; return; }
        for (const order of options[r]) walk(r + 1, [...queues, order]);
      };
      walk(0, []);
      return;
    }
    if (!jobs[j].capable.length) { assign(j + 1, groups); return; }
    for (const r of jobs[j].capable) assign(j + 1, groups.map((group, at) => at === r ? [...group, j] : group));
  };
  assign(0, model.resources.map(() => []));
  return { key: best!, evaluated };
}
