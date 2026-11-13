import { z } from 'zod';
import { commitmentId, commitmentRevision } from './commitments.js';

// GEMELO OPERATIVO · contrato PROPUESTO (unidad CLAUDE-FABLE-OPERATIONAL-CORE-1). No está congelado: Codex debe acordarlo antes de que otro módulo lo consuma.
// Describe recursos, capacidad, trabajos, dependencias, materiales y compromisos de UNA revisión de entrada con reloj explícito. Es puro: no lee fuentes, no guarda y no escribe en proveedores.
//
// Cuatro clases de conocimiento, nunca mezcladas:
//   observed   hecho leído de una fuente identificada por (provider, accountId, kind, remoteId) con su instante y cobertura
//   declared   declaración de una persona, con autor e instante
//   assumed    supuesto de un ensayo; SOLO aparece en modelos bifurcados (`applySuppositions`), nunca en la entrada
//   conclusión calculada: vive en los resultados del motor (operational-simulation / operational-planner), no en este modelo
// Un dato desconocido o contradictorio conserva ese estado. Duración ausente no vale cero y un recurso sin horario conocido no tiene disponibilidad ilimitada.

export const operationalTwinFormat = 'planb-operational-twin-v1' as const;
export const operationalBranchFormat = 'planb-operational-branch-v1' as const;
export const operationalEngineVersion = 'planb-operational-engine-0.1.0' as const;

// Límites publicados. La entrada que los supera se rechaza; el motor que agota eventos o nodos devuelve exploración incompleta.
export const operationalLimits = Object.freeze({
  jobs: 64, resources: 12, materials: 64, commitments: 64, windowsPerResource: 40, dependenciesPerJob: 8, skillsPerJob: 8,
  suppositions: 16, options: 6, horizonMinutes: 21 * 24 * 60, simulationEvents: 20_000, searchNodes: 200_000,
});

export class OperationalInputError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'OperationalInputError'; }
}

const id = commitmentId;
const label = z.string().trim().min(1).max(160);
const instant = z.iso.datetime();

export const sourceRef = z.object({ provider: id, accountId: label, kind: id, remoteId: label }).strict();
export type SourceRef = z.infer<typeof sourceRef>;
// Identidad completa: dos IDs remotos iguales de cuentas o proveedores distintos son objetos distintos.
export const sourceRefKey = (ref: SourceRef) => JSON.stringify([ref.provider, ref.accountId, ref.kind, ref.remoteId]);

const observed = z.object({ basis: z.literal('observed'), source: sourceRef, observedAt: instant, coverage: z.enum(['complete', 'partial']) }).strict();
const declared = z.object({ basis: z.literal('declared'), by: label, declaredAt: instant }).strict();
const inputProvenance = z.discriminatedUnion('basis', [observed, declared]);
export type Provenance = z.infer<typeof inputProvenance> | { basis: 'assumed'; suppositionId: string };
export type UnknownReason = 'not-provided' | 'source-unavailable' | 'source-partial';
export type Fact<T> =
  | { state: 'known'; value: T; provenance: Provenance }
  | { state: 'unknown'; reason: UnknownReason }
  | { state: 'contradictory'; claims: { value: T; provenance: Provenance }[] };

function fact<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('known'), value, provenance: inputProvenance }).strict(),
    z.object({ state: z.literal('unknown'), reason: z.enum(['not-provided', 'source-unavailable', 'source-partial']) }).strict(),
    z.object({ state: z.literal('contradictory'), claims: z.array(z.object({ value, provenance: inputProvenance }).strict()).min(2).max(4) }).strict(),
  ]);
}

const interval = z.object({ start: instant, end: instant }).strict().refine(value => Date.parse(value.start) < Date.parse(value.end), 'Intervalo vacío o invertido.');
const resource = z.object({
  id, title: label, kind: id, source: sourceRef.nullable(),
  executesJobs: z.boolean(), // un almacén es un recurso que no ejecuta trabajos
  skills: z.array(id).max(16),
  windows: fact(z.array(interval).max(operationalLimits.windowsPerResource)),
}).strict();
const material = z.object({ id, title: label, source: sourceRef.nullable(), warehouseId: id.nullable(), availableAt: fact(instant) }).strict();
const commitment = z.object({ id, revision: commitmentRevision, title: label, dueAt: instant }).strict();
const dependency = z.object({ jobId: id, basis: z.enum(['explicit', 'confirmed', 'candidate']) }).strict();
const job = z.object({
  id, title: label, kind: id, source: sourceRef.nullable(), commitmentId: id.nullable(),
  duration: fact(z.number().int().min(1).max(operationalLimits.horizonMinutes)),
  travel: fact(z.number().int().min(0).max(operationalLimits.horizonMinutes)),
  skills: z.array(id).max(operationalLimits.skillsPerJob),
  materials: z.array(id).max(8),
  earliestStart: instant.nullable(),
  dependencies: z.array(dependency).max(operationalLimits.dependenciesPerJob),
}).strict();

export const operationalPlan = z.object({
  sequences: z.array(z.object({ resourceId: id, jobIds: z.array(id).max(operationalLimits.jobs) }).strict()).max(operationalLimits.resources),
}).strict();
export type OperationalPlan = z.infer<typeof operationalPlan>;

const unique = (values: string[]) => new Set(values).size === values.length;

export const operationalModel = z.object({
  format: z.literal(operationalTwinFormat),
  clock: z.object({ now: instant, timeZone: z.string().min(1).max(64), horizonEnd: instant }).strict(),
  rules: z.object({ staleAfterMinutes: z.number().int().min(1).max(60 * 24 * 30) }).strict(),
  resources: z.array(resource).max(operationalLimits.resources),
  materials: z.array(material).max(operationalLimits.materials),
  commitments: z.array(commitment).max(operationalLimits.commitments),
  jobs: z.array(job).max(operationalLimits.jobs),
  currentPlan: z.object({ plan: operationalPlan, provenance: inputProvenance }).strict().nullable(),
}).strict().superRefine((model, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const span = Date.parse(model.clock.horizonEnd) - Date.parse(model.clock.now);
  // El motor trabaja en minutos completos: un horizonte de menos de un minuto no es simulable y se rechaza aquí, no más tarde.
  if (!(Math.floor(span / 60_000) >= 1) || span > operationalLimits.horizonMinutes * 60_000) fail('El horizonte debe abarcar al menos un minuto completo tras el reloj y caber en el límite publicado.');
  const groups: [string, { id: string; source: SourceRef | null }[]][] = [['recursos', model.resources], ['materiales', model.materials], ['trabajos', model.jobs]];
  for (const [name, items] of groups) {
    if (!unique(items.map(item => item.id))) fail(`IDs repetidos en ${name}.`);
    if (!unique(items.flatMap(item => item.source ? [sourceRefKey(item.source)] : []))) fail(`Una misma identidad de fuente aparece dos veces en ${name}.`);
  }
  if (!unique(model.commitments.map(item => item.id))) fail('IDs repetidos en compromisos.');
  const resources = new Set(model.resources.map(item => item.id)), materials = new Set(model.materials.map(item => item.id));
  const commitments = new Set(model.commitments.map(item => item.id)), jobs = new Set(model.jobs.map(item => item.id));
  for (const item of model.materials) if (item.warehouseId && !resources.has(item.warehouseId)) fail(`El material ${item.id} cita un almacén inexistente.`);
  for (const item of model.jobs) {
    if (item.commitmentId && !commitments.has(item.commitmentId)) fail(`El trabajo ${item.id} cita un compromiso inexistente.`);
    if (!unique(item.materials) || item.materials.some(entry => !materials.has(entry))) fail(`El trabajo ${item.id} cita materiales inexistentes o repetidos.`);
    if (!unique(item.dependencies.map(entry => entry.jobId))) fail(`El trabajo ${item.id} repite una dependencia.`);
    if (item.dependencies.some(entry => entry.jobId === item.id || !jobs.has(entry.jobId))) fail(`El trabajo ${item.id} depende de sí mismo o de un trabajo inexistente.`);
  }
  if (model.currentPlan) for (const message of planProblems(model.currentPlan.plan, resources, jobs)) fail(message);
});
export type OperationalModel = z.infer<typeof operationalModel>;

export function planProblems(plan: OperationalPlan, resources: Set<string>, jobs: Set<string>): string[] {
  const problems: string[] = [], placed = plan.sequences.flatMap(entry => entry.jobIds);
  if (!unique(plan.sequences.map(entry => entry.resourceId))) problems.push('El plan repite un recurso.');
  if (!unique(placed)) problems.push('El plan coloca un trabajo más de una vez.');
  if (plan.sequences.some(entry => !resources.has(entry.resourceId))) problems.push('El plan cita un recurso inexistente.');
  if (placed.some(entry => !jobs.has(entry))) problems.push('El plan cita un trabajo inexistente.');
  return problems;
}

// ── Supuestos de ensayo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Los cuatro primeros son perturbaciones («¿y si…?»); los cuatro últimos son opciones de respuesta. Ninguno está autorizado ni confirmado por existir aquí.
export const supposition = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('material-availability'), materialId: id, availableAt: instant }).strict(),
  z.object({ id, type: z.literal('resource-absence'), resourceId: id, start: instant, end: instant }).strict(),
  z.object({ id, type: z.literal('source-outage'), provider: id, accountId: label }).strict(),
  z.object({ id, type: z.literal('job-reopen'), jobId: id, at: instant, extraMinutes: z.number().int().min(1).max(operationalLimits.horizonMinutes) }).strict(),
  z.object({ id, type: z.literal('add-capacity'), resourceId: id, start: instant, end: instant }).strict(),
  z.object({ id, type: z.literal('use-alternative-material'), jobId: id, fromMaterialId: id, toMaterialId: id }).strict(),
  z.object({ id, type: z.literal('move-due'), commitmentId: id, dueAt: instant }).strict(),
  z.object({ id, type: z.literal('split-job'), jobId: id, parts: z.tuple([z.number().int().min(1), z.number().int().min(1)]) }).strict(),
]);
export type Supposition = z.infer<typeof supposition>;

export type BranchCosts = { extraCapacityMinutes: number; renegotiatedDates: number; alternativeMaterials: number; splits: number };
export type BranchInfo = {
  format: typeof operationalBranchFormat;
  hypothetical: true; // una rama nunca deja de ser hipotética, tampoco al exportarla o reabrirla
  baseRevision: string;
  engineVersion: typeof operationalEngineVersion;
  suppositions: Supposition[];
  costs: BranchCosts;
};
type Interval = { start: string; end: string };
export type TwinResource = { id: string; title: string; kind: string; source: SourceRef | null; executesJobs: boolean; skills: string[]; windows: Fact<Interval[]> };
export type TwinMaterial = { id: string; title: string; source: SourceRef | null; warehouseId: string | null; availableAt: Fact<string> };
export type TwinCommitment = { id: string; revision: string; title: string; dueAt: string; originalDueAt?: string; assumedBy?: string[] };
export type TwinJob = {
  id: string; title: string; kind: string; source: SourceRef | null; commitmentId: string | null;
  duration: Fact<number>; travel: Fact<number>; skills: string[]; materials: string[]; earliestStart: string | null;
  dependencies: { jobId: string; basis: 'explicit' | 'confirmed' | 'candidate' }[];
  assumedBy?: string[]; reopens?: string; splitOf?: string;
};
// Modelo que consume el motor: la entrada validada (sin `branch`) o una rama derivada de ella.
export type TwinModel = {
  format: typeof operationalTwinFormat;
  clock: { now: string; timeZone: string; horizonEnd: string };
  rules: { staleAfterMinutes: number };
  resources: TwinResource[]; materials: TwinMaterial[]; commitments: TwinCommitment[]; jobs: TwinJob[];
  currentPlan: { plan: OperationalPlan; provenance: Provenance } | null;
  branch?: BranchInfo;
};

const iso = (ms: number) => new Date(ms).toISOString();
function mergeIntervals(list: [number, number][]): Interval[] {
  const sorted = list.filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0] || a[1] - b[1]), merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return merged.map(([start, end]) => ({ start: iso(start), end: iso(end) }));
}

// Bifurca una entrada observada. Devuelve un modelo NUEVO; `base` no se modifica. Los supuestos se aplican en el orden dado y cada dato alterado queda con procedencia `assumed`.
// Reglas deliberadas: añadir o quitar franjas a un recurso de horario desconocido lo deja desconocido; una caída de fuente convierte en desconocido lo que esa fuente acreditaba.
export function applySuppositions(base: OperationalModel, suppositions: Supposition[]): TwinModel {
  const input = operationalModel.parse(base);
  if (suppositions.length > operationalLimits.suppositions) throw new OperationalInputError('limit', `Una rama admite como máximo ${operationalLimits.suppositions} supuestos.`);
  const list = z.array(supposition).parse(suppositions);
  if (!unique(list.map(entry => entry.id))) throw new OperationalInputError('duplicate-supposition', 'Dos supuestos comparten ID.');
  const model: TwinModel = structuredClone(input);
  const costs: BranchCosts = { extraCapacityMinutes: 0, renegotiatedDates: 0, alternativeMaterials: 0, splits: 0 };
  const must = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new OperationalInputError('unknown-target', `El supuesto cita ${what} inexistente.`);
    return value;
  };
  const mark = (target: { assumedBy?: string[] }, suppositionId: string) => { target.assumedBy = [...target.assumedBy ?? [], suppositionId]; };
  const freshJob = (jobId: string) => {
    if (jobId.length > 64 || model.jobs.some(entry => entry.id === jobId)) throw new OperationalInputError('derived-id', `No se puede derivar el trabajo ${jobId}.`);
    if (model.jobs.length >= operationalLimits.jobs) throw new OperationalInputError('limit', 'El supuesto supera el límite de trabajos.');
    return jobId;
  };
  for (const entry of list) {
    const assumed: Provenance = { basis: 'assumed', suppositionId: entry.id };
    switch (entry.type) {
      case 'material-availability': {
        must(model.materials.find(item => item.id === entry.materialId), 'un material').availableAt = { state: 'known', value: entry.availableAt, provenance: assumed };
        break;
      }
      case 'resource-absence':
      case 'add-capacity': {
        const target = must(model.resources.find(item => item.id === entry.resourceId), 'un recurso');
        const start = Date.parse(entry.start), end = Date.parse(entry.end);
        if (start >= end) throw new OperationalInputError('empty-interval', 'El supuesto tiene un intervalo vacío.');
        if (entry.type === 'add-capacity') costs.extraCapacityMinutes += Math.round((end - start) / 60_000);
        if (target.windows.state !== 'known') break;
        const current = target.windows.value.map(value => [Date.parse(value.start), Date.parse(value.end)] as [number, number]);
        const next = entry.type === 'add-capacity' ? [...current, [start, end] as [number, number]]
          : current.flatMap(([from, to]) => [[from, Math.min(to, start)], [Math.max(from, end), to]] as [number, number][]);
        target.windows = { state: 'known', value: mergeIntervals(next), provenance: assumed };
        break;
      }
      case 'source-outage': {
        const lost = (provenance: Provenance) => provenance.basis === 'observed' && provenance.source.provider === entry.provider && provenance.source.accountId === entry.accountId;
        const drop = <T>(value: Fact<T>): Fact<T> => value.state === 'known' && lost(value.provenance) ? { state: 'unknown', reason: 'source-unavailable' } : value;
        for (const item of model.resources) item.windows = drop(item.windows);
        for (const item of model.materials) item.availableAt = drop(item.availableAt);
        for (const item of model.jobs) { item.duration = drop(item.duration); item.travel = drop(item.travel); }
        break;
      }
      case 'job-reopen': {
        const origin = must(model.jobs.find(item => item.id === entry.jobId), 'un trabajo');
        model.jobs.push({
          id: freshJob(`${origin.id}--${entry.id}`.slice(0, 64)), title: `Reapertura de ${origin.title}`.slice(0, 160), kind: 'reopen', source: null, commitmentId: origin.commitmentId,
          duration: { state: 'known', value: entry.extraMinutes, provenance: assumed }, travel: structuredClone(origin.travel), skills: [...origin.skills], materials: [],
          earliestStart: entry.at, dependencies: [{ jobId: origin.id, basis: 'confirmed' }], assumedBy: [entry.id], reopens: origin.id,
        });
        break;
      }
      case 'use-alternative-material': {
        const target = must(model.jobs.find(item => item.id === entry.jobId), 'un trabajo');
        must(model.materials.find(item => item.id === entry.toMaterialId), 'un material alternativo');
        if (!target.materials.includes(entry.fromMaterialId) || target.materials.includes(entry.toMaterialId)) throw new OperationalInputError('material-mismatch', 'El trabajo no usa el material que se quiere sustituir, o ya usa el alternativo.');
        target.materials = target.materials.map(value => value === entry.fromMaterialId ? entry.toMaterialId : value);
        mark(target, entry.id); costs.alternativeMaterials += 1;
        break;
      }
      case 'move-due': {
        const target = must(model.commitments.find(item => item.id === entry.commitmentId), 'un compromiso');
        target.originalDueAt ??= target.dueAt; target.dueAt = entry.dueAt;
        mark(target, entry.id); costs.renegotiatedDates += 1;
        break;
      }
      case 'split-job': {
        const index = model.jobs.findIndex(item => item.id === entry.jobId), origin = must(model.jobs[index], 'un trabajo');
        if (origin.splitOf || origin.reopens) throw new OperationalInputError('split-derived', 'No se divide un trabajo ya derivado de otro supuesto.');
        const parts = entry.parts.map((value, part): TwinJob => ({
          ...structuredClone(origin), id: `${origin.id}--p${part + 1}`, title: `${origin.title} (parte ${part + 1})`.slice(0, 160), source: null,
          duration: { state: 'known', value, provenance: assumed }, assumedBy: [...origin.assumedBy ?? [], entry.id], splitOf: origin.id,
        }));
        model.jobs.splice(index, 1);
        for (const part of parts) { freshJob(part.id); model.jobs.push(part); }
        for (const item of model.jobs) item.dependencies = item.dependencies.flatMap(value => value.jobId === origin.id ? parts.map(part => ({ jobId: part.id, basis: value.basis })) : [value]);
        if (model.currentPlan) for (const sequence of model.currentPlan.plan.sequences) sequence.jobIds = sequence.jobIds.flatMap(value => value === origin.id ? parts.map(part => part.id) : [value]);
        costs.splits += 1;
        break;
      }
    }
  }
  model.branch = { format: operationalBranchFormat, hypothetical: true, baseRevision: operationalRevision(input), engineVersion: operationalEngineVersion, suppositions: list, costs };
  return model;
}

// ── Revisión exacta de entrada ───────────────────────────────────────────────────────────────────────────────────────────────────────
// JSON canónico (claves ordenadas) + SHA-256 puro, para que navegador y servidor calculen la misma revisión sin dependencias.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const K = new Uint32Array(64);
{
  let count = 0;
  for (let candidate = 2; count < 64; candidate++) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor++) if (candidate % divisor === 0) { prime = false; break; }
    if (prime) K[count++] = Math.floor((Math.cbrt(candidate) % 1) * 2 ** 32);
  }
}
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text), bits = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32)); view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const rotr = (value: number, shift: number) => (value >>> shift) | (value << (32 - shift));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map(value => value.toString(16).padStart(8, '0')).join('');
}

// Revisión del modelo tal como entra al motor. Una rama tiene su propia revisión y además conserva `branch.baseRevision`.
export const operationalRevision = (model: TwinModel) => sha256Hex(canonicalJson(model));
