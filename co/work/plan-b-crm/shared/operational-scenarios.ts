import { operationalModel, operationalTwinFormat, type OperationalModel, type OperationalPlan, type SourceRef, type Supposition } from './operational-twin.js';
import type { Objectives } from './operational-planner.js';

// GENERADOR DE ESCENARIOS SINTÉTICOS con semilla fija (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2). Todo es ficción generada; no lee ni imita datos reales.
// No importa el motor: construye por su cuenta un plan testigo colocando trabajos uno tras otro, y de ahí saca fechas comprometidas alcanzables.
// No decide si un resultado es correcto: eso lo hace operational-properties.ts (comprobador) y, en casos pequeños, tests/operational-oracle.ts.
//
// Clases:
//   healthy            cabe con el plan testigo: sirve para detectar falsas alertas
//   material-delay     el ensayo retrasa un material que alguien necesita
//   capacity-loss      el ensayo quita una jornada a un recurso
//   stale-source       parte de la evidencia se observó hace días (sigue cabiendo; debe quedar señalada)
//   partial-source     una fuente de cobertura parcial y una duración que esa fuente no acredita
//   ambiguous-links    vínculos candidatos que, de tomarse por confirmados, romperían el orden; e IDs remotos repetidos entre cuentas
//   late-confirmation  un material sin fecha conocida que el ensayo confirma después

export const scenarioKinds = ['healthy', 'material-delay', 'capacity-loss', 'stale-source', 'partial-source', 'ambiguous-links', 'late-confirmation'] as const;
export type ScenarioKind = typeof scenarioKinds[number];
export type GeneratedScenario = {
  seed: number; kind: ScenarioKind; model: OperationalModel; suppositions: Supposition[]; objectives: Objectives;
  // Plan con el que el generador construyó el caso. En las clases «fitsWithWitness» todo llega a tiempo con él (tras aplicar los supuestos, si los hay).
  witnessPlan: OperationalPlan; fitsWithWitness: boolean;
  // Lo que el generador alteró a propósito, para que el comprobador sepa dónde mirar sin conocer el resultado.
  touched: { materialId?: string; jobId?: string; resourceId?: string };
};

export function scenarioRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const NOW = Date.parse('2026-11-09T07:00:00Z'), DAY = 1440, SHIFT = 480;
const at = (minute: number) => new Date(NOW + minute * 60_000).toISOString().replace('.000Z', 'Z');

export function generateScenario(seed: number, kind: ScenarioKind, size: 'small' | 'medium' = 'small'): GeneratedScenario {
  const next = scenarioRandom(seed * 7919 + scenarioKinds.indexOf(kind)), int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1)), pick = <T>(list: T[]) => list[int(0, list.length - 1)];
  const days = size === 'small' ? 3 : 5, resourceCount = size === 'small' ? 2 : 3, jobCount = size === 'small' ? int(3, 6) : int(12, 18);
  const account = (name: string, kindName: string, remoteId: string): SourceRef => ({ provider: 'generated-fixture', accountId: `fixture-${name}`, kind: kindName, remoteId });
  const declared = { basis: 'declared' as const, by: 'Generador de escenarios', declaredAt: at(-30) };
  const observed = (source: SourceRef, age = 30) => ({ basis: 'observed' as const, source, observedAt: at(-age), coverage: 'complete' as const });
  const skillSets = [['a', 'b'], ['b', 'c'], ['a', 'c']];
  const resources = Array.from({ length: resourceCount }, (_, r) => ({
    id: `r${r}`, title: `Recurso ${r}`, kind: 'technician', source: account('rota', 'shift', `r${r}`), executesJobs: true, skills: skillSets[r % 3],
    windows: { state: 'known' as const, value: Array.from({ length: days }, (_, d) => ({ start: at(d * DAY), end: at(d * DAY + SHIFT) })), provenance: observed(account('rota', 'shift', `r${r}`)) },
  }));
  const materialCount = size === 'small' ? 2 : 3;
  const materialAt = new Array<number>(materialCount).fill(-60), materialUsed = new Array<boolean>(materialCount).fill(false);
  const cursor = resources.map(() => 0), queues: string[][] = resources.map(() => []);
  type Draft = { id: string; r: number; start: number; finish: number; duration: number; travel: number; skill: string; materials: string[]; dependencies: { jobId: string; basis: 'confirmed' | 'explicit' | 'candidate' }[]; commitment: number };
  const drafts: Draft[] = [];
  const commitmentCount = Math.max(2, Math.ceil(jobCount / 2));
  for (let j = 0; j < jobCount; j++) {
    const r = int(0, resourceCount - 1), duration = int(3, 18) * 10, travel = pick([0, 10, 20, 30]), work = duration + travel;
    const earlier = drafts.filter(() => next() < 0.25).slice(0, 2);
    let start = Math.max(cursor[r], ...earlier.map(item => item.finish));
    // Sin partir jornadas: si no cabe en lo que queda del día, empieza al día siguiente.
    const dayStart = Math.floor(start / DAY) * DAY;
    if (start - dayStart >= SHIFT || start + work > dayStart + SHIFT) start = dayStart + DAY;
    if (start + work > (days - 1) * DAY + SHIFT) continue; // no cabe en el horizonte: se omite
    const material = next() < 0.4 ? int(0, materialCount - 1) : -1;
    if (material >= 0) { materialUsed[material] = true; }
    drafts.push({
      id: `j${drafts.length}`, r, start, finish: start + work, duration, travel, skill: pick(resources[r].skills), materials: material >= 0 ? [`m${material}`] : [],
      dependencies: earlier.map(item => ({ jobId: item.id, basis: pick(['confirmed', 'explicit'] as const) })), commitment: int(0, commitmentCount - 1),
    });
    cursor[r] = start + work; queues[r].push(drafts[drafts.length - 1].id);
  }
  // Cada material llega antes del primer trabajo que lo usa.
  for (let m = 0; m < materialCount; m++) {
    const first = Math.min(...drafts.filter(item => item.materials.includes(`m${m}`)).map(item => item.start), days * DAY);
    materialAt[m] = first === days * DAY ? -60 : Math.max(-60, first - int(0, 6) * 30);
  }
  const used = [...new Set(drafts.map(item => item.commitment))].sort((a, b) => a - b);
  const model: OperationalModel = operationalModel.parse({
    format: operationalTwinFormat, clock: { now: at(0), timeZone: 'Europe/Madrid', horizonEnd: at(days * DAY) }, rules: { staleAfterMinutes: DAY },
    resources,
    materials: Array.from({ length: materialCount }, (_, m) => ({
      id: `m${m}`, title: `Material ${m}`, source: account(m % 2 ? 'orders-b' : 'orders-a', 'order-line', `ol-${m}`), warehouseId: null,
      availableAt: { state: 'known', value: at(materialAt[m]), provenance: observed(account(m % 2 ? 'orders-b' : 'orders-a', 'order-line', `ol-${m}`)) },
    })),
    commitments: used.map(c => ({
      id: `c${c}`, revision: 'c'.repeat(64), title: `Compromiso ${c}`,
      dueAt: at(Math.max(...drafts.filter(item => item.commitment === c).map(item => item.finish)) + int(0, 4) * 30),
    })),
    jobs: drafts.map((item, index) => ({
      id: item.id, title: `Trabajo ${index}`, kind: 'job', source: account(index % 2 ? 'orders-b' : 'orders-a', 'order', String(1000 + index)), commitmentId: `c${item.commitment}`,
      duration: { state: 'known', value: item.duration, provenance: index % 3 ? declared : observed(account(index % 2 ? 'orders-b' : 'orders-a', 'order', String(1000 + index))) },
      travel: { state: 'known', value: item.travel, provenance: declared }, skills: [item.skill], materials: item.materials, earliestStart: null, dependencies: item.dependencies,
    })),
    currentPlan: null,
  });
  const witnessPlan: OperationalPlan = { sequences: queues.flatMap((jobIds, r) => jobIds.length ? [{ resourceId: `r${r}`, jobIds }] : []) };
  const base: GeneratedScenario = { seed, kind, model, suppositions: [], objectives: { tiers: next() < 0.5 && used.length ? [[`c${used[0]}`]] : [] }, witnessPlan, fitsWithWitness: true, touched: {} };
  const withMaterial = drafts.filter(item => item.materials.length);
  const job = (id: string) => model.jobs.find(item => item.id === id)!;

  switch (kind) {
    case 'healthy': return base;
    case 'material-delay': {
      if (!withMaterial.length) return base;
      const target = pick(withMaterial), materialId = target.materials[0];
      return { ...base, fitsWithWitness: false, touched: { materialId, jobId: target.id }, suppositions: [{ id: 'p-delay', type: 'material-availability', materialId, availableAt: at(target.start + int(4, 30) * 60) }] };
    }
    case 'capacity-loss': {
      if (!drafts.length) return base;
      const target = pick(drafts), dayStart = Math.floor(target.start / DAY) * DAY;
      return { ...base, fitsWithWitness: false, touched: { resourceId: `r${target.r}`, jobId: target.id }, suppositions: [{ id: 'p-absence', type: 'resource-absence', resourceId: `r${target.r}`, start: at(dayStart), end: at(dayStart + SHIFT) }] };
    }
    case 'stale-source': {
      const material = model.materials.find(item => drafts.some(entry => entry.materials.includes(item.id))) ?? model.materials[0];
      if (material.availableAt.state === 'known' && material.availableAt.provenance.basis === 'observed') material.availableAt.provenance.observedAt = at(-int(2, 5) * DAY);
      return { ...base, touched: { materialId: material.id } };
    }
    case 'partial-source': {
      if (!drafts.length) return base;
      const target = job(pick(drafts).id), material = model.materials[0];
      target.duration = { state: 'unknown', reason: 'source-partial' };
      if (material.availableAt.state === 'known' && material.availableAt.provenance.basis === 'observed') material.availableAt.provenance.coverage = 'partial';
      return { ...base, fitsWithWitness: false, touched: { jobId: target.id, materialId: material.id } };
    }
    case 'ambiguous-links': {
      // Un vínculo candidato hacia un trabajo POSTERIOR: si se tomara por confirmado, el plan testigo dejaría de valer. Y dos trabajos con el mismo ID remoto en cuentas distintas.
      const touched: GeneratedScenario['touched'] = {};
      for (let index = 0; index + 1 < drafts.length; index++) {
        const later = drafts.slice(index + 1).find(item => item.start >= drafts[index].start && !item.dependencies.some(entry => entry.jobId === drafts[index].id));
        if (!later) continue;
        job(drafts[index].id).dependencies.push({ jobId: later.id, basis: 'candidate' });
        touched.jobId = drafts[index].id;
        break;
      }
      if (model.jobs.length >= 2) model.jobs[1].source = { ...model.jobs[0].source!, accountId: 'fixture-orders-b' };
      return { ...base, model: operationalModel.parse(model), touched };
    }
    case 'late-confirmation': {
      if (!withMaterial.length) return base;
      const target = pick(withMaterial), materialId = target.materials[0], material = model.materials.find(item => item.id === materialId)!;
      const value = material.availableAt.state === 'known' ? material.availableAt.value : at(0);
      material.availableAt = { state: 'unknown', reason: 'not-provided' };
      return { ...base, touched: { materialId, jobId: target.id }, suppositions: [{ id: 'p-confirm', type: 'material-availability', materialId, availableAt: value }] };
    }
  }
}
