import { OperationalInputError, applySuppositions, operationalEngineVersion, type OperationalModel, type Supposition, type TwinModel } from './operational-twin.js';
import type { Projection } from './operational-simulation.js';
import { drain, type Objectives, type PlanKey } from './operational-planner.js';
import { planLargeSteps, type LargeControl } from './operational-large.js';

// «¿QUÉ CONVIENE COMPROBAR ANTES DE DECIDIR?» (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2).
// La persona declara, para cada dato ausente o dudoso, los valores que cree posibles. Para cada valor se replanifica cada alternativa considerada y se mira qué cambia:
// si cambia cuál es la mejor alternativa y si cambia que los compromisos prioritarios lleguen. El dato que más cambia eso es el que más conviene comprobar.
// No hay probabilidades ni valor esperado: no se sabe cuál de los valores es más verosímil, y aquí no se inventa. Se varía UN dato cada vez; los demás quedan como están.
// Los valores declarados entran como supuestos: todo lo que sale de aquí es hipotético.

export type Hypothesis =
  | { id: string; question: string; target: { type: 'material-availability'; materialId: string }; values: string[] }
  | { id: string; question: string; target: { type: 'job-duration'; jobId: string }; values: number[] };
export type ConsideredAlternative = { id: string; suppositions: Supposition[] };
export type SensitivityCell = { alternativeId: string; applicable: boolean; key: PlanKey | null; priority: Record<string, Projection>; proven: boolean };
export type SensitivityRow = {
  hypothesisId: string; question: string; target: Hypothesis['target'];
  decisionChanges: boolean; // la mejor alternativa no es la misma para todos los valores
  viabilityFlips: number;   // pares (alternativa, compromiso prioritario) cuya llegada depende del valor
  byValue: { value: string | number; best: string[]; cells: SensitivityCell[] }[];
};
export type SensitivityResult = {
  format: 'planb-operational-sensitivity-v1'; kind: 'proposal'; hypothetical: true; engineVersion: typeof operationalEngineVersion;
  method: 'one-at-a-time'; probabilities: 'none';
  priorityCommitments: string[]; ranking: SensitivityRow[]; mostDecisive: string | null; optimality: 'proven-within-model' | 'best-found';
};
type Steps<T> = Generator<void, T, void>;

const lexLess = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const flat = (key: PlanKey) => [...key.missedByTier, key.penaltyMinutes];

function withValue(base: OperationalModel, suppositions: Supposition[], hypothesis: Hypothesis, value: string | number): TwinModel | null {
  const id = `h-${hypothesis.id}`.slice(0, 64);
  if (hypothesis.target.type === 'material-availability') return applySuppositions(base, [...suppositions, { id, type: 'material-availability', materialId: hypothesis.target.materialId, availableAt: String(value) }]);
  // El contrato v1 no tiene un supuesto de duración: se aplica aquí sobre la rama recién creada, con procedencia de supuesto. Extensión pedida a Codex en el informe.
  const { jobId } = hypothesis.target, model = applySuppositions(base, suppositions), job = model.jobs.find(item => item.id === jobId);
  if (!job) return null; // p. ej. la alternativa dividió ese trabajo
  if (!Number.isInteger(value) || Number(value) < 1) throw new OperationalInputError('hypothesis', 'Una duración posible debe ser un número entero de minutos.');
  job.duration = { state: 'known', value: Number(value), provenance: { basis: 'assumed', suppositionId: id } };
  job.assumedBy = [...job.assumedBy ?? [], id];
  return model;
}

export function* whatToCheckFirstSteps(base: OperationalModel, scenario: Supposition[], alternatives: ConsideredAlternative[], objectives: Objectives, hypotheses: Hypothesis[], control: LargeControl = {}): Steps<SensitivityResult> {
  if (!alternatives.length || alternatives.length > 8 || hypotheses.length > 8 || hypotheses.some(item => item.values.length < 2 || item.values.length > 4)) {
    throw new OperationalInputError('limit', 'Se admiten de 1 a 8 alternativas, hasta 8 datos y de 2 a 4 valores posibles por dato.');
  }
  if (new Set(alternatives.map(item => item.id)).size !== alternatives.length || new Set(hypotheses.map(item => item.id)).size !== hypotheses.length) throw new OperationalInputError('duplicate', 'IDs repetidos.');
  const priorityCommitments = objectives.tiers[0]?.length ? [...objectives.tiers[0]] : base.commitments.map(item => item.id);
  let proven = true;
  const ranking: SensitivityRow[] = [];
  for (const hypothesis of hypotheses) {
    const byValue: SensitivityRow['byValue'] = [];
    for (const value of hypothesis.values) {
      const cells: SensitivityCell[] = [];
      for (const alternative of alternatives) {
        let model: TwinModel | null, explored = true;
        try { model = withValue(base, [...scenario, ...alternative.suppositions], hypothesis, value); }
        catch (error) {
          if (!(error instanceof OperationalInputError) || error.code === 'hypothesis') throw error;
          // Superar el máximo de supuestos de una rama NO es «no aplica»: no se exploró, y sin explorarlo no hay prueba de sensibilidad (330).
          model = null; explored = error.code !== 'limit';
        }
        if (!model) { if (!explored) proven = false; cells.push({ alternativeId: alternative.id, applicable: false, key: null, priority: {}, proven: explored }); continue; }
        const result = yield* planLargeSteps(model, objectives, control);
        if (!result.search.complete) proven = false;
        cells.push({
          alternativeId: alternative.id, applicable: true, key: result.key, proven: result.search.complete,
          priority: Object.fromEntries(result.simulation.commitments.filter(item => priorityCommitments.includes(item.commitmentId)).map(item => [item.commitmentId, item.projection])),
        });
      }
      const usable = cells.filter(cell => cell.key), top = usable.reduce<number[] | null>((best, cell) => !best || lexLess(flat(cell.key!), best) ? flat(cell.key!) : best, null);
      byValue.push({ value, cells, best: usable.filter(cell => !lexLess(top!, flat(cell.key!))).map(cell => cell.alternativeId) });
    }
    const decisionChanges = new Set(byValue.map(entry => entry.best.join('|'))).size > 1;
    let viabilityFlips = 0;
    for (const alternative of alternatives) for (const commitmentId of priorityCommitments) {
      const seen = new Set(byValue.map(entry => entry.cells.find(cell => cell.alternativeId === alternative.id)?.priority[commitmentId] === 'on-time'));
      if (seen.size > 1) viabilityFlips += 1;
    }
    ranking.push({ hypothesisId: hypothesis.id, question: hypothesis.question, target: hypothesis.target, decisionChanges, viabilityFlips, byValue });
  }
  ranking.sort((a, b) => Number(b.decisionChanges) - Number(a.decisionChanges) || b.viabilityFlips - a.viabilityFlips || (a.hypothesisId < b.hypothesisId ? -1 : 1));
  const first = ranking[0];
  return {
    format: 'planb-operational-sensitivity-v1', kind: 'proposal', hypothetical: true, engineVersion: operationalEngineVersion, method: 'one-at-a-time', probabilities: 'none',
    priorityCommitments, ranking, mostDecisive: first && (first.decisionChanges || first.viabilityFlips > 0) ? first.hypothesisId : null, optimality: proven ? 'proven-within-model' : 'best-found',
  };
}
export const whatToCheckFirst = (base: OperationalModel, scenario: Supposition[], alternatives: ConsideredAlternative[], objectives: Objectives, hypotheses: Hypothesis[], control: LargeControl = {}) =>
  drain(whatToCheckFirstSteps(base, scenario, alternatives, objectives, hypotheses, control));
