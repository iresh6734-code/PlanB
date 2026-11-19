import { z } from 'zod';
import { commitmentDecisionRequest, commitmentId, commitmentRevision } from './commitments.js';
import { OperationalInputError, operationalEngineVersion, operationalLimits, operationalRevision, supposition, type OperationalModel, type Supposition } from './operational-twin.js';
import type { Objectives, PlanKey } from './operational-planner.js';

// REGISTRO LOCAL DE ENSAYO · contrato PROPUESTO (unidad CLAUDE-FABLE-OPERATIONAL-CORE-2). Puro: no guarda, no tiene rutas y no escribe en proveedores.
// Codex decide dónde vive (almacén, autorización, rutas); hasta que lo apruebe, esto es una propuesta de forma y de reglas.
//
// Tres cosas que nunca se confunden:
//   ensayo     este registro: qué se comparó, sobre qué revisión, con qué motor. Siempre `hypothetical: true`. No es evidencia.
//   decisión   una decisión local `assign` de shared/commitments.ts, confirmada por la persona sobre una revisión vigente. Vive en SU sistema; aquí solo queda la referencia.
//   observado  lo que las fuentes acrediten después. No se escribe en el ensayo: se lee de los compromisos y sus observaciones.
// Una revisión nueva del modelo o del compromiso vuelve el ensayo HISTÓRICO: conserva íntegro lo que la persona comparaba, pero ya no sirve para confirmar nada.
// Reabrir o exportar un ensayo no ejecuta ninguna simulación ni acción.

export const rehearsalFormat = 'planb-operational-rehearsal-v1' as const;
const instant = z.iso.datetime(), note = z.string().trim().min(1).max(400), label = z.string().trim().min(1).max(160);
const compared = z.object({
  alternativeId: label, suppositionIds: z.array(commitmentId).max(operationalLimits.options),
  missedByTier: z.array(z.number().int().min(0)).max(operationalLimits.commitments + 1), penaltyMinutes: z.number().int().min(0),
  optimality: z.enum(['proven-within-model', 'best-found']),
}).strict();
export const rehearsalRecord = z.object({
  format: z.literal(rehearsalFormat), kind: z.literal('rehearsal'), hypothetical: z.literal(true),
  id: z.uuid(), createdAt: instant, engineVersion: label,
  baseRevision: commitmentRevision, evaluatedAt: instant,
  focus: z.object({ commitmentId, commitmentRevision }).strict(),
  scenario: z.array(supposition).max(operationalLimits.suppositions), options: z.array(supposition).max(operationalLimits.options),
  objectives: z.object({ tiers: z.array(z.array(commitmentId).max(operationalLimits.commitments)).max(8) }).strict(),
  compared: z.array(compared).min(1).max(64),
  chosen: z.object({ alternativeId: label, suppositionIds: z.array(commitmentId).max(operationalLimits.options) }).strict().nullable(),
  // Referencia a la decisión local confirmada, si la hubo. El ensayo no es la decisión.
  decision: z.object({ operationId: z.uuid(), commitmentId, expectedRevision: commitmentRevision }).strict().nullable(),
}).strict().superRefine((record, ctx) => {
  const ids = record.compared.map(item => item.alternativeId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Alternativas repetidas.' });
  if (record.chosen && !ids.includes(record.chosen.alternativeId)) ctx.addIssue({ code: 'custom', message: 'La alternativa elegida no está entre las comparadas.' });
  if (record.decision && (!record.chosen || record.decision.commitmentId !== record.focus.commitmentId)) ctx.addIssue({ code: 'custom', message: 'Una decisión exige alternativa elegida y el mismo compromiso.' });
});
export type RehearsalRecord = z.infer<typeof rehearsalRecord>;
export type ComparedAlternative = { id: string; suppositionIds: string[]; result: { key: PlanKey; search: { optimality: 'proven-within-model' | 'best-found' } } };

// `id` y `createdAt` los aporta quien llama (el módulo no usa reloj ni azar).
export function createRehearsal(input: {
  id: string; createdAt: string; model: OperationalModel; commitmentId: string; scenario: Supposition[]; options: Supposition[]; objectives: Objectives; alternatives: ComparedAlternative[];
}): RehearsalRecord {
  const focus = input.model.commitments.find(item => item.id === input.commitmentId);
  if (!focus) throw new OperationalInputError('unknown-target', `No existe el compromiso ${input.commitmentId}.`);
  return rehearsalRecord.parse({
    format: rehearsalFormat, kind: 'rehearsal', hypothetical: true, id: input.id, createdAt: input.createdAt, engineVersion: operationalEngineVersion,
    baseRevision: operationalRevision(input.model), evaluatedAt: input.model.clock.now, focus: { commitmentId: focus.id, commitmentRevision: focus.revision },
    scenario: input.scenario, options: input.options, objectives: input.objectives,
    compared: input.alternatives.map(item => ({
      alternativeId: item.id, suppositionIds: item.suppositionIds, missedByTier: item.result.key.missedByTier, penaltyMinutes: item.result.key.penaltyMinutes, optimality: item.result.search.optimality,
    })),
    chosen: null, decision: null,
  });
}

export type RehearsalView = {
  state: 'current' | 'historical';
  reasons: ('base-revision-changed' | 'commitment-revision-changed' | 'commitment-missing' | 'engine-version-changed')[];
  canConfirm: boolean; // solo si es vigente, hay alternativa elegida y todavía no hay decisión
  status: 'simulation-only' | 'decision-recorded';
  record: RehearsalRecord;
};
// Reabre un ensayo guardado contra el modelo vigente. Valida la forma (un registro sin `hypothetical: true` no es un ensayo) y no recalcula nada.
export function reopenRehearsal(stored: unknown, current: OperationalModel): RehearsalView {
  const record = rehearsalRecord.parse(stored), reasons: RehearsalView['reasons'] = [];
  const focus = current.commitments.find(item => item.id === record.focus.commitmentId);
  if (operationalRevision(current) !== record.baseRevision) reasons.push('base-revision-changed');
  if (!focus) reasons.push('commitment-missing'); else if (focus.revision !== record.focus.commitmentRevision) reasons.push('commitment-revision-changed');
  if (record.engineVersion !== operationalEngineVersion) reasons.push('engine-version-changed');
  const state = reasons.length ? 'historical' : 'current';
  return { state, reasons, canConfirm: state === 'current' && record.chosen !== null && record.decision === null, status: record.decision ? 'decision-recorded' : 'simulation-only', record };
}

export function chooseAlternative(record: RehearsalRecord, alternativeId: string | null): RehearsalRecord {
  if (record.decision) throw new OperationalInputError('decision-recorded', 'El ensayo ya tiene una decisión registrada; no se cambia la elección.');
  const found = alternativeId === null ? null : record.compared.find(item => item.alternativeId === alternativeId);
  if (found === undefined) throw new OperationalInputError('unknown-target', 'Esa alternativa no está entre las comparadas.');
  return rehearsalRecord.parse({ ...record, chosen: found && { alternativeId: found.alternativeId, suppositionIds: found.suppositionIds } });
}

// Prepara (no envía) la petición de UNA decisión local `assign` con el contrato existente de compromisos. El siguiente paso, el responsable y la fecha los escribe la persona.
// Solo sobre un ensayo vigente: con una revisión nueva se rechaza y el ensayo queda como borrador histórico.
export function decisionDraft(record: RehearsalRecord, current: OperationalModel, input: { contextRevision: string; operationId: string; owner: string; nextStep: string; dueAt: string }) {
  const view = reopenRehearsal(record, current);
  if (view.state !== 'current') throw new OperationalInputError('stale-rehearsal', `El ensayo es histórico (${view.reasons.join(', ')}): hay que ensayar de nuevo sobre la revisión vigente.`);
  if (!view.canConfirm) throw new OperationalInputError('not-confirmable', record.decision ? 'El ensayo ya tiene una decisión registrada.' : 'Falta elegir una alternativa.');
  return commitmentDecisionRequest.parse({
    contextRevision: input.contextRevision, expectedRevision: record.focus.commitmentRevision, operationId: input.operationId,
    decision: { type: 'assign', owner: label.parse(input.owner), nextStep: note.parse(input.nextStep), dueAt: input.dueAt },
  });
}

// Anota la decisión que el sistema de compromisos ACEPTÓ. Repetir la misma anotación devuelve el mismo registro; otra distinta se rechaza: un ensayo, una decisión.
export function linkDecision(record: RehearsalRecord, accepted: { operationId: string; commitmentId: string; expectedRevision: string }): RehearsalRecord {
  if (record.decision) {
    if (record.decision.operationId === accepted.operationId && record.decision.expectedRevision === accepted.expectedRevision) return record;
    throw new OperationalInputError('decision-recorded', 'El ensayo ya tiene otra decisión registrada.');
  }
  if (!record.chosen) throw new OperationalInputError('not-confirmable', 'Falta elegir una alternativa.');
  if (accepted.commitmentId !== record.focus.commitmentId || accepted.expectedRevision !== record.focus.commitmentRevision) throw new OperationalInputError('stale-rehearsal', 'La decisión aceptada no corresponde al compromiso y revisión de este ensayo.');
  return rehearsalRecord.parse({ ...record, decision: { operationId: accepted.operationId, commitmentId: accepted.commitmentId, expectedRevision: accepted.expectedRevision } });
}

// Exportar conserva revisión, versión del motor y carácter hipotético; es el mismo registro en JSON canónico de claves estables.
export const exportRehearsal = (record: RehearsalRecord): string => JSON.stringify(rehearsalRecord.parse(record), null, 2);
