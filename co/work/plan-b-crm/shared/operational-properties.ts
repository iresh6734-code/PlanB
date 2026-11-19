import { applySuppositions, operationalModel, type OperationalModel, type OperationalPlan, type Supposition, type TwinModel } from './operational-twin.js';
import { simulatePlan, type SimulationResult } from './operational-simulation.js';
import { planSchedule, type Objectives, type PlanResult } from './operational-planner.js';
import type { GeneratedScenario } from './operational-scenarios.js';

// COMPROBADOR DE PROPIEDADES Y MINIMIZADOR DE CONTRAEJEMPLOS (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2).
// Comprueba resultados PÚBLICOS del motor contra el modelo de entrada; no usa su estado interno. Está separado del generador (operational-scenarios.ts).
// El motor se inyecta: así se puede sembrar un motor defectuoso y ver que el comprobador lo detecta y que el contraejemplo se reduce.
//
// Alcance publicado: propiedades de traza y de conocimiento sobre modelos dentro de `operationalLimits`. Es comprobación ACOTADA sobre los casos generados y las fixtures;
// no demuestra nada para cualquier empresa o tamaño. Las propiedades de persistencia de la misión (repetir una decisión aceptada no crea un segundo efecto; reiniciar
// conserva decisiones y no ejecuta nada) dependen del almacén y del montaje y NO están aquí.

export type Engine = {
  simulate: (model: TwinModel, plan: OperationalPlan) => SimulationResult;
  plan: (model: TwinModel, objectives: Objectives, control: { nodeBudget: number }) => PlanResult;
};
export const realEngine: Engine = { simulate: (model, plan) => simulatePlan(model, plan), plan: (model, objectives, control) => planSchedule(model, objectives, control) };
export type Violation = { property: string; detail: string };

// P1 un recurso no ocupa dos trabajos a la vez · P2 material no disponible no habilita · P3 dependencia confirmada respetada · P4 trabajo solo en franja y con habilidad
// P5 lo pendiente de evidencia nunca se proyecta «en plazo» · P6 «en plazo» exige todos los trabajos terminados antes de la fecha · P7 el resultado es una proyección
export function traceViolations(model: TwinModel, result: SimulationResult): Violation[] {
  const found: Violation[] = [], fail = (property: string, detail: string) => found.push({ property, detail });
  const now = Date.parse(model.clock.now), minute = (iso: string) => (Date.parse(iso) - now) / 60_000;
  const busy = new Map<string, string | null>();
  let previous = -1;
  for (const event of result.events) {
    if (event.minute < previous) fail('trace-order', `evento ${event.seq} retrocede en el tiempo`);
    previous = event.minute;
    if (event.type === 'job-start') { if (busy.get(event.resourceId!)) fail('P1-double-booking', `${event.resourceId} empieza ${event.jobId} con ${busy.get(event.resourceId!)} en curso`); busy.set(event.resourceId!, event.jobId!); }
    if (event.type === 'job-finish') busy.set(event.resourceId!, null);
  }
  for (const item of result.jobs) {
    const source = model.jobs.find(entry => entry.id === item.jobId);
    if (!source) { fail('trace-unknown-job', item.jobId); continue; }
    if (item.startMinute === null) { if (item.status === 'finished') fail('P6-finished-without-start', item.jobId); continue; }
    const resource = model.resources.find(entry => entry.id === item.resourceId);
    for (const materialId of source.materials) {
      const fact = model.materials.find(entry => entry.id === materialId)!.availableAt;
      if (fact.state !== 'known') fail('P2-material-gating', `${item.jobId} empieza con ${materialId} sin fecha conocida`);
      else if (minute(fact.value) > item.startMinute) fail('P2-material-gating', `${item.jobId} empieza antes de tener ${materialId}`);
    }
    for (const dependency of source.dependencies) if (dependency.basis !== 'candidate') {
      const before = result.jobs.find(entry => entry.jobId === dependency.jobId);
      if (!before || before.finishMinute === null || before.finishMinute > item.startMinute) fail('P3-dependency', `${item.jobId} empieza antes de terminar ${dependency.jobId}`);
    }
    if (source.duration.state !== 'known' || source.travel.state !== 'known') fail('P5-pending-evidence', `${item.jobId} se ejecuta sin duración conocida`);
    else if (item.finishMinute !== null && item.finishMinute - item.startMinute < source.duration.value + source.travel.value) fail('P4-work', `${item.jobId} termina antes de completar su trabajo`);
    if (!resource || !resource.executesJobs || !source.skills.every(skill => resource.skills.includes(skill))) fail('P4-skills', `${item.jobId} en ${item.resourceId}`);
    else if (resource.windows.state !== 'known') fail('P5-pending-evidence', `${item.jobId} se ejecuta en ${resource.id} sin horario conocido`);
    else if (!resource.windows.value.some(value => minute(value.start) <= item.startMinute! && item.startMinute! < minute(value.end))) fail('P4-window', `${item.jobId} empieza fuera de franja`);
    if (source.earliestStart && minute(source.earliestStart) > item.startMinute) fail('P4-earliest', item.jobId);
  }
  for (const item of result.commitments) {
    if (item.projection !== 'on-time') continue;
    const jobs = model.jobs.filter(entry => entry.commitmentId === item.commitmentId), due = model.commitments.find(entry => entry.id === item.commitmentId)!;
    if (!jobs.length) fail('P5-pending-evidence', `${item.commitmentId} en plazo sin trabajos`);
    for (const job of jobs) {
      const outcome = result.jobs.find(entry => entry.jobId === job.id);
      if (outcome?.status !== 'finished' || outcome.finishMinute === null || outcome.finishMinute > minute(due.dueAt)) fail('P6-on-time', `${item.commitmentId} en plazo con ${job.id} sin terminar a tiempo`);
    }
  }
  if (result.kind !== 'projection' || /"(fulfilled|cumplido)"/.test(JSON.stringify(result))) fail('P7-projection', 'el resultado se presenta como hecho cumplido');
  if (result.hypothetical !== Boolean(model.branch)) fail('P7-hypothetical', 'la marca de hipótesis no coincide con el modelo');
  return found;
}

const lexLess = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const flat = (result: PlanResult) => [...result.key.missedByTier, result.key.penaltyMinutes];

// Propiedades de un escenario generado. Devuelve [] si no hay violaciones.
// P8 determinismo · P9 una rama no modifica el origen · P10 sin falsas alertas cuando existe plan testigo · P11 añadir restricción no mejora
// P12 planificador y simulación coinciden · P13 evidencia antigua, parcial o supuesta queda señalada · P14 una confirmación tardía resuelve lo indeterminado y solo eso
export function checkScenario(scenario: GeneratedScenario, engine: Engine = realEngine, nodeBudget = 20_000): Violation[] {
  const found: Violation[] = [], fail = (property: string, detail: string) => found.push({ property, detail });
  const { model, suppositions, witnessPlan, objectives, kind, touched } = scenario;
  const before = JSON.stringify(model), baseRun = engine.simulate(model, witnessPlan);
  const branched: TwinModel = suppositions.length ? applySuppositions(model, suppositions) : model;
  const run = engine.simulate(branched, witnessPlan);
  found.push(...traceViolations(model, baseRun), ...traceViolations(branched, run));
  if (JSON.stringify(engine.simulate(branched, witnessPlan)) !== JSON.stringify(run)) fail('P8-determinism', 'dos simulaciones de la misma entrada difieren');
  if (JSON.stringify(model) !== before || JSON.stringify(engine.simulate(model, witnessPlan)) !== JSON.stringify(baseRun)) fail('P9-branch-isolation', 'bifurcar o simular alteró el origen');

  const planned = engine.plan(branched, objectives, { nodeBudget }), basePlanned = suppositions.length ? engine.plan(model, objectives, { nodeBudget }) : planned;
  found.push(...traceViolations(branched, planned.simulation));
  if (JSON.stringify(engine.simulate(branched, planned.plan).commitments) !== JSON.stringify(planned.simulation.commitments)) fail('P12-planner-simulation', 'el plan propuesto no reproduce su propia simulación');
  if (scenario.fitsWithWitness) {
    const late = run.commitments.filter(item => item.projection !== 'on-time').map(item => item.commitmentId);
    if (late.length) fail('P10-false-alert', `con el plan testigo todo cabe, pero se proyecta fuera de plazo: ${late.join(', ')}`);
    if (planned.search.complete && planned.key.missedByTier.some(value => value > 0)) fail('P10-false-alert', 'existe un plan que cumple todo y el planificador declara incumplimientos');
  }
  if ((kind === 'material-delay' || kind === 'capacity-loss') && suppositions.length && planned.search.complete && basePlanned.search.complete && lexLess(flat(planned), flat(basePlanned))) {
    fail('P11-monotonic', 'una restricción añadida mejoró el mejor plan');
  }
  const caveats = (result: SimulationResult, code: string, subject?: string) => result.jobs.some(item => item.caveats.some(entry => entry.code === code && (!subject || entry.subject === subject)));
  const usesTouched = touched.materialId !== undefined && model.jobs.some(job => job.materials.includes(touched.materialId!) && witnessPlan.sequences.some(entry => entry.jobIds.includes(job.id)));
  if (kind === 'stale-source' && usesTouched && !caveats(run, 'stale-evidence', touched.materialId)) fail('P13-caveat', 'evidencia antigua sin señalar');
  if (kind === 'partial-source' && usesTouched && !caveats(run, 'partial-source', touched.materialId)) fail('P13-caveat', 'fuente parcial sin señalar');
  if (kind === 'ambiguous-links' && touched.jobId && !caveats(run, 'candidate-dependency', touched.jobId)) fail('P13-caveat', 'vínculo candidato sin señalar');
  if (suppositions.some(item => item.type === 'material-availability') && usesTouched && !caveats(run, 'assumed', touched.materialId)) fail('P13-caveat', 'dato supuesto sin señalar');
  if (kind === 'partial-source' && touched.jobId) {
    const owner = model.jobs.find(job => job.id === touched.jobId)!.commitmentId;
    if (run.commitments.find(item => item.commitmentId === owner)?.projection !== 'indeterminate') fail('P5-pending-evidence', 'duración no acreditada y el compromiso no queda indeterminado');
  }
  if (kind === 'late-confirmation' && touched.jobId) {
    const owner = model.jobs.find(job => job.id === touched.jobId)!.commitmentId;
    if (baseRun.commitments.find(item => item.commitmentId === owner)?.projection !== 'indeterminate') fail('P14-late-confirmation', 'antes de confirmar el material el compromiso no era indeterminado');
  }
  return found;
}

// ── Minimizador ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Reduce un escenario que viola una propiedad al caso más pequeño que sigue violándola (reducción voraz hasta punto fijo: quitar supuestos, trabajos, dependencias,
// materiales, compromisos, recursos y franjas). El resultado es un escenario válido y reproducible; `steps` cuenta las reducciones aceptadas.
export function shrinkScenario(scenario: GeneratedScenario, stillFails: (candidate: GeneratedScenario) => boolean): { scenario: GeneratedScenario; steps: number; attempts: number } {
  let current = scenario, steps = 0, attempts = 0;
  const attempt = (edit: (draft: { model: any; suppositions: Supposition[]; witnessPlan: OperationalPlan; objectives: Objectives }) => boolean | void): boolean => {
    const draft = structuredClone({ model: current.model, suppositions: current.suppositions, witnessPlan: current.witnessPlan, objectives: current.objectives });
    if (edit(draft) === false) return false;
    const parsed = operationalModel.safeParse(draft.model);
    if (!parsed.success) return false;
    const candidate: GeneratedScenario = { ...current, model: parsed.data as OperationalModel, suppositions: draft.suppositions, witnessPlan: draft.witnessPlan, objectives: draft.objectives };
    attempts += 1;
    try { if (!stillFails(candidate)) return false; } catch { return false; }
    current = candidate; steps += 1;
    return true;
  };
  const dropJob = (draft: any, id: string) => {
    draft.model.jobs = draft.model.jobs.filter((job: any) => job.id !== id);
    for (const job of draft.model.jobs) job.dependencies = job.dependencies.filter((entry: any) => entry.jobId !== id);
    for (const sequence of draft.witnessPlan.sequences) sequence.jobIds = sequence.jobIds.filter((value: string) => value !== id);
    draft.suppositions = draft.suppositions.filter((item: any) => item.jobId !== id);
  };
  for (let changed = true; changed;) {
    changed = false;
    for (let index = current.suppositions.length - 1; index >= 0; index--) changed = attempt(draft => { draft.suppositions.splice(index, 1); }) || changed;
    for (const job of [...current.model.jobs].reverse()) changed = attempt(draft => dropJob(draft, job.id)) || changed;
    for (const job of current.model.jobs) {
      for (const dependency of job.dependencies) changed = attempt(draft => { const target = draft.model.jobs.find((item: any) => item.id === job.id); target.dependencies = target.dependencies.filter((entry: any) => entry.jobId !== dependency.jobId); }) || changed;
      for (const materialId of job.materials) changed = attempt(draft => { const target = draft.model.jobs.find((item: any) => item.id === job.id); target.materials = target.materials.filter((value: string) => value !== materialId); }) || changed;
      if (job.travel.state === 'known' && job.travel.value > 0) changed = attempt(draft => { draft.model.jobs.find((item: any) => item.id === job.id).travel.value = 0; }) || changed;
    }
    for (const commitment of current.model.commitments) changed = attempt(draft => {
      if (draft.model.jobs.some((job: any) => job.commitmentId === commitment.id)) return false;
      draft.model.commitments = draft.model.commitments.filter((item: any) => item.id !== commitment.id);
      draft.objectives.tiers = draft.objectives.tiers.map((tier: string[]) => tier.filter(id => id !== commitment.id)).filter((tier: string[]) => tier.length);
      draft.suppositions = draft.suppositions.filter((item: any) => item.commitmentId !== commitment.id);
    }) || changed;
    for (const material of current.model.materials) changed = attempt(draft => {
      if (draft.model.jobs.some((job: any) => job.materials.includes(material.id))) return false;
      draft.model.materials = draft.model.materials.filter((item: any) => item.id !== material.id);
      draft.suppositions = draft.suppositions.filter((item: any) => item.materialId !== material.id && item.toMaterialId !== material.id && item.fromMaterialId !== material.id);
    }) || changed;
    for (const resource of current.model.resources) {
      changed = attempt(draft => {
        draft.model.resources = draft.model.resources.filter((item: any) => item.id !== resource.id);
        draft.witnessPlan.sequences = draft.witnessPlan.sequences.filter((entry: any) => entry.resourceId !== resource.id);
        draft.suppositions = draft.suppositions.filter((item: any) => item.resourceId !== resource.id);
      }) || changed;
      if (resource.windows.state === 'known') for (let index = resource.windows.value.length - 1; index >= 0; index--) changed = attempt(draft => {
        const target = draft.model.resources.find((item: any) => item.id === resource.id);
        if (!target || target.windows.state !== 'known' || index >= target.windows.value.length) return false;
        target.windows.value.splice(index, 1);
      }) || changed;
    }
  }
  return { scenario: current, steps, attempts };
}
