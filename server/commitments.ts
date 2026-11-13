import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  commitmentDecisionRequest, commitmentDemoDataset, commitmentEvent, commitmentId, commitmentPath,
  commitmentRevision, projectCommitmentEvidence, type CommitmentDataset, type CommitmentDefinition,
  type CommitmentDetail, type CommitmentEvent, type CommitmentSummary,
} from '../shared/commitments.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

const listFormat = 'planb-commitments-list-v1';
const detailFormat = 'planb-commitments-detail-v1';
const decisionFormat = 'planb-commitments-decision-v1';
const mode = 'fiction';
const eventLimit = 100;
const ledgerSchema = z.array(commitmentEvent).max(eventLimit).refine(events =>
  new Set(events.map(event => event.operationId)).size === events.length);
const querySchema = z.object({ contextRevision: commitmentRevision }).strict();
const paramsSchema = z.object({ id: commitmentId }).strict();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function conflict(code: string, message: string) { return new AppError(409, message, { code }); }

/** Synchronous local read, never a network request or an initialization callback. */
export type CommitmentDatasetProvider = () => CommitmentDataset | null;
const datasetCut = (input: unknown) => {
  const { commitments, observations } = commitmentDemoDataset.parse(input);
  return { commitments, observations, revision: hash({ commitments, observations }) };
};
type DatasetCut = ReturnType<typeof datasetCut>;

/** The installer supplies static data or a local reader. Each request owns one parsed cut. */
export function registerCommitments(app: FastifyInstance, store: Store, source: CommitmentDataset | CommitmentDatasetProvider, clock = Date.now) {
  // Preserve registration-time validation and cloning for the original static API.
  const fixed = typeof source === 'function' ? null : datasetCut(source);
  const readDataset = (expected: string, authorized: () => boolean): DatasetCut => {
    if (fixed) return fixed;
    try { return datasetCut((source as CommitmentDatasetProvider)()); }
    catch {
      requireContext(expected, authorized);
      throw new AppError(503, 'No se pudo leer el escenario local del Radar.');
    }
  };
  const captureAuthorization = getLocalAuthorizationCapture(app);

  function requireContext(expected: string, authorized: () => boolean) {
    if (!authorized()) throw new AppError(401, 'Desbloquea tu copia local para continuar.');
    const context = workspaceSearchIdentity(store);
    if (!authorized()) throw new AppError(401, 'Desbloquea tu copia local para continuar.');
    if (!context?.isTestData || context.contextRevision !== expected) {
      throw conflict('COMMITMENT_CONTEXT_CHANGED', 'Abre la copia de ensayo activa y actualiza el Radar.');
    }
    return context.contextRevision;
  }

  function getDefinition(request: FastifyRequest, cut: DatasetCut) {
    const { id } = paramsSchema.parse(request.params);
    const item = cut.commitments.find(entry => entry.id === id);
    if (!item) throw new AppError(404, 'El compromiso no está en esta copia.');
    return item;
  }

  const revisionFor = (cut: DatasetCut, context: string, id: string, count: number) => hash([context, cut.revision, id, count]);
  const ledgerKey = (cut: DatasetCut, context: string, id: string) => `commitment-demo:v1:${context}:${cut.revision}:${id}`;

  function readLedger(cut: DatasetCut, context: string, id: string) {
    try {
      const events = ledgerSchema.parse(store.get<unknown>(ledgerKey(cut, context, id), []));
      if (events.some((event, index) => event.revisionBefore !== revisionFor(cut, context, id, index))) throw new Error();
      return events;
    } catch {
      throw new AppError(503, 'No se pudo comprobar el historial local del compromiso.');
    }
  }

  function project(cut: DatasetCut, item: CommitmentDefinition, contextRevision: string, events: CommitmentEvent[], now: number): CommitmentDetail {
    const evidence = projectCommitmentEvidence(item, cut.observations, now);
    const blocker = evidence.find(source => source.state === 'observed' && source.observation?.condition === 'blocked');
    const allObserved = evidence.every(source => source.state === 'observed');
    const delivered = evidence.some(source => source.role === 'delivery' && source.state === 'observed' && source.observation?.condition === 'completed');
    const lastAssignment = events.findLast(event => event.decision.type === 'assign')?.decision;
    const lastClose = events.findLast(event => event.decision.type === 'close')?.decision;
    const canCloseObserved = allObserved && delivered && !blocker && !lastClose;
    const status: CommitmentSummary['status'] = lastClose ? 'resolved' : blocker ? 'at-risk'
      : !allObserved ? 'unconfirmed' : !delivered && Date.parse(item.dueAt) < now ? 'at-risk' : 'no-risk-detected';
    const cause: CommitmentSummary['cause'] = lastClose?.type === 'close'
      ? lastClose.basis === 'observed' ? 'closed-observed' : 'closed-manual'
      : blocker ? 'source-blocked' : status === 'unconfirmed' ? 'coverage-incomplete'
      : status === 'at-risk' ? 'deadline-passed' : 'no-blocker-observed';
    const action = lastAssignment?.type === 'assign'
      ? { owner: lastAssignment.owner, nextStep: lastAssignment.nextStep, dueAt: lastAssignment.dueAt } : null;
    const closure = lastClose?.type === 'close' ? { basis: lastClose.basis, note: lastClose.note } : null;
    return {
      format: detailFormat, mode, contextRevision, evidence, events, canCloseObserved,
      item: { id: item.id, title: item.title, dueAt: item.dueAt, revision: revisionFor(cut, contextRevision, item.id, events.length),
        status, cause, affectedRole: status === 'at-risk' ? blocker?.role ?? null : null, action, closure },
    };
  }

  app.get(commitmentPath, { exposeHeadRoute: false }, request => {
    const authorized = captureAuthorization(request.headers.cookie);
    const { contextRevision } = querySchema.parse(request.query);
    requireContext(contextRevision, authorized);
    const cut = readDataset(contextRevision, authorized);
    requireContext(contextRevision, authorized);
    const now = clock();
    const items = cut.commitments.map(item => project(cut, item, contextRevision, readLedger(cut, contextRevision, item.id), now).item);
    requireContext(contextRevision, authorized);
    return { format: listFormat, mode, contextRevision, items };
  });

  app.get(`${commitmentPath}/:id`, { exposeHeadRoute: false }, request => {
    const authorized = captureAuthorization(request.headers.cookie);
    const { contextRevision } = querySchema.parse(request.query);
    requireContext(contextRevision, authorized);
    const cut = readDataset(contextRevision, authorized);
    requireContext(contextRevision, authorized);
    const item = getDefinition(request, cut);
    const result = project(cut, item, contextRevision, readLedger(cut, contextRevision, item.id), clock());
    requireContext(contextRevision, authorized);
    return result;
  });

  app.post(`${commitmentPath}/:id/decisions`, { bodyLimit: 8192 }, request => {
    const authorized = captureAuthorization(request.headers.cookie);
    const { contextRevision, expectedRevision, operationId, decision } = commitmentDecisionRequest.parse(request.body);
    const result = store.transaction(() => {
      requireContext(contextRevision, authorized);
      const cut = readDataset(contextRevision, authorized);
      requireContext(contextRevision, authorized);
      const item = getDefinition(request, cut);
      const events = readLedger(cut, contextRevision, item.id);
      const receipt = (event: CommitmentEvent, count: number) => ({
        format: decisionFormat, mode, contextRevision, commitmentId: item.id,
        revision: revisionFor(cut, contextRevision, item.id, count), event,
      });
      const index = events.findIndex(event => event.operationId === operationId);
      if (index !== -1) {
        const event = events[index];
        if (event.revisionBefore !== expectedRevision || JSON.stringify(event.decision) !== JSON.stringify(decision)) {
          throw conflict('COMMITMENT_OPERATION_REUSED', 'La clave pertenece a una decisión distinta.');
        }
        requireContext(contextRevision, authorized);
        return receipt(event, index + 1);
      }
      const now = clock();
      const current = project(cut, item, contextRevision, events, now);
      if (current.item.revision !== expectedRevision) throw conflict('COMMITMENT_REVISION_CHANGED', 'El compromiso cambió. Lee su estado antes de confirmar.');
      if (current.item.closure) throw conflict('COMMITMENT_CLOSED', 'El compromiso está cerrado.');
      if (events.length === eventLimit) throw conflict('COMMITMENT_HISTORY_FULL', 'El historial de ensayo llegó a su límite.');
      const observedClose = decision.type === 'close' && decision.basis === 'observed';
      if (observedClose && !current.canCloseObserved) throw conflict('COMMITMENT_EVIDENCE_REQUIRED', 'Falta evidencia reciente para confirmar el desenlace.');
      const event: CommitmentEvent = {
        operationId, decision, revisionBefore: expectedRevision, actor: 'local-operator', recordedAt: new Date(now).toISOString(),
        evidence: observedClose ? current.evidence.flatMap(source => source.observation ? [source.observation] : []) : [],
      };
      requireContext(contextRevision, authorized);
      store.set(ledgerKey(cut, contextRevision, item.id), [...events, event]);
      return receipt(event, events.length + 1);
    });
    requireContext(contextRevision, authorized);
    return result;
  });
}
