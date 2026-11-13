import { z } from 'zod';

export const commitmentPath = '/api/v7/commitments';
export const commitmentRoles = ['sale', 'delivery', 'support'] as const;
export const commitmentId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const commitmentRevision = z.string().regex(/^[a-f0-9]{64}$/);
const dateTime = z.iso.datetime();
const label = z.string().trim().min(1).max(160);
const note = z.string().trim().min(1).max(400);
const role = z.enum(commitmentRoles);

const reference = z.object({
  provider: commitmentId,
  accountId: label,
  kind: role,
  remoteId: label,
}).strict();

export const sourceObservation = z.object({
  reference,
  observedAt: dateTime,
  coverage: z.enum(['complete', 'partial', 'unavailable']),
  condition: z.enum(['clear', 'blocked', 'completed']).nullable(),
  label,
}).strict().refine(source => (source.coverage === 'unavailable') === (source.condition === null));

const link = z.object({ reference, basis: z.enum(['explicit', 'confirmed', 'candidate']) }).strict();
const definition = z.object({
  id: commitmentId,
  title: label,
  dueAt: dateTime,
  links: z.array(link).max(12),
}).strict().refine(value => {
  const confirmed = value.links.filter(entry => entry.basis !== 'candidate');
  return new Set(value.links.map(entry => referenceKey(entry.reference))).size === value.links.length
    && new Set(confirmed.map(entry => entry.reference.kind)).size === confirmed.length;
});

export const commitmentDemoDataset = z.object({
  format: z.literal('planb-commitments-demo-v1'),
  commitments: z.array(definition).max(24),
  observations: z.array(sourceObservation).max(120),
}).strict().refine(value => new Set(value.commitments.map(item => item.id)).size === value.commitments.length
  && new Set(value.observations.map(source => referenceKey(source.reference))).size === value.observations.length);

export const commitmentDecision = z.discriminatedUnion('type', [
  z.object({ type: z.literal('assign'), owner: label, nextStep: note, dueAt: dateTime }).strict(),
  z.object({ type: z.literal('close'), basis: z.enum(['observed', 'manual']), note }).strict(),
]);

export const commitmentDecisionRequest = z.object({
  contextRevision: commitmentRevision,
  expectedRevision: commitmentRevision,
  operationId: z.uuid(),
  decision: commitmentDecision,
}).strict();

const action = z.object({ owner: label, nextStep: note, dueAt: dateTime }).strict();
const closure = z.object({ basis: z.enum(['observed', 'manual']), note }).strict();
export const commitmentEvent = z.object({
  operationId: z.uuid(),
  recordedAt: dateTime,
  actor: z.literal('local-operator'),
  revisionBefore: commitmentRevision,
  decision: commitmentDecision,
  evidence: z.array(sourceObservation).max(3),
}).strict();

const evidence = z.object({
  role,
  state: z.enum(['observed', 'partial', 'stale', 'unavailable', 'missing', 'ambiguous']),
  linked: z.object({ reference, basis: z.enum(['explicit', 'confirmed']) }).strict().nullable(),
  observation: sourceObservation.nullable(),
  candidates: z.array(reference).max(12),
}).strict();

export const commitmentSummary = z.object({
  id: commitmentId,
  title: label,
  dueAt: dateTime,
  revision: commitmentRevision,
  status: z.enum(['at-risk', 'unconfirmed', 'no-risk-detected', 'resolved']),
  cause: z.enum(['source-blocked', 'deadline-passed', 'coverage-incomplete', 'no-blocker-observed', 'closed-observed', 'closed-manual']),
  affectedRole: role.nullable(),
  action: action.nullable(),
  closure: closure.nullable(),
}).strict();

const responseContext = { mode: z.literal('fiction'), contextRevision: commitmentRevision };
export const commitmentListResponse = z.object({
  format: z.literal('planb-commitments-list-v1'), ...responseContext,
  items: z.array(commitmentSummary).max(24),
}).strict();
export const commitmentDetailResponse = z.object({
  format: z.literal('planb-commitments-detail-v1'), ...responseContext,
  item: commitmentSummary,
  evidence: z.array(evidence).length(3),
  events: z.array(commitmentEvent).max(100),
  canCloseObserved: z.boolean(),
}).strict();
export const commitmentDecisionResponse = z.object({
  format: z.literal('planb-commitments-decision-v1'), ...responseContext,
  commitmentId,
  revision: commitmentRevision,
  event: commitmentEvent,
}).strict();

export type CommitmentDataset = z.infer<typeof commitmentDemoDataset>;
export type CommitmentDefinition = z.infer<typeof definition>;
export type CommitmentEvidence = z.infer<typeof evidence>;
export type CommitmentObservation = z.infer<typeof sourceObservation>;
export type CommitmentEvent = z.infer<typeof commitmentEvent>;
export type CommitmentDetail = z.infer<typeof commitmentDetailResponse>;
export type CommitmentSummary = z.infer<typeof commitmentSummary>;

function referenceKey(value: z.infer<typeof reference>) {
  return JSON.stringify([value.provider, value.accountId, value.kind, value.remoteId]);
}

const maxObservationAgeMs = 24 * 60 * 60_000;

export function projectCommitmentEvidence(item: CommitmentDefinition, observations: CommitmentObservation[], now: number): CommitmentEvidence[] {
  return commitmentRoles.map(role => {
    const links = item.links.filter(entry => entry.reference.kind === role);
    const candidates = links.filter(entry => entry.basis === 'candidate').map(entry => entry.reference);
    const match = links.find(entry => entry.basis !== 'candidate');
    const linked = match && match.basis !== 'candidate' ? { reference: match.reference, basis: match.basis } : null;
    const observation = linked ? observations.find(source => referenceKey(source.reference) === referenceKey(linked.reference)) ?? null : null;
    if (!observation) return { role, candidates, linked, state: !linked && candidates.length ? 'ambiguous' : 'missing', observation };
    const age = now - Date.parse(observation.observedAt);
    const state = observation.coverage === 'unavailable' ? 'unavailable'
      : age < 0 || age > maxObservationAgeMs ? 'stale'
      : observation.coverage === 'partial' ? 'partial' : 'observed';
    return { role, candidates, linked, state, observation };
  });
}
