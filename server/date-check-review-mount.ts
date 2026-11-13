import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { commitmentRevision } from '../shared/commitments.js';
import { dateCheckApiPath, dateCheckList, dateCheckRecordView, type DateCheckRecordView } from '../shared/date-check-api.js';
import { demoInput, initialDemoState } from '../shared/date-check-demo.js';
import { fictionEnding, fictionEndings, type FictionEnding, type Observation } from '../shared/date-check-outcome.js';
import { decisionReview, reviewApiPath, reviewList, reviewObservation, reviewRecordRequest, reviewView, type DecisionReviewView, type ReviewView } from '../shared/date-check-review-api.js';
import { dateCheckRevision, type DateCheckInput } from '../shared/operational-date-check.js';
import { getLocalAuthorizationCapture } from './security.js';
import { AppError, type Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

// MONTAJE DE «REVISAR UNA DECISIÓN» (unidad CLAUDE-OPUS-DATE-CHECK-REVIEW). Composición explícita: nadie lo registra todavía (guion en DATE-CHECK-REVIEW-HANDOFF.md).
// Necesita «Comprobar una fecha» montado en la misma app: lee la comprobación y su decisión por su ruta PÚBLICA, con la misma sesión, y no toca sus claves.
// Ver una revisión no escribe ni recalcula: devuelve lo que se guardó al registrar el desenlace (proyección contrafactual y desenlace observado, por separado).
// Registrar un desenlace de ficción escribe UNO por decisión en claves propias, idempotente por clave de operación. Ninguna ruta llama a un proveedor.

const registrations = new WeakMap<FastifyInstance, Store>();
const pinQuery = z.object({ contextRevision: commitmentRevision }).strict();
const idParams = z.object({ id: z.uuid() }).strict();
const emptyQuery = z.object({}).strict();
const fail = (status: number, code: string, message: string) => new AppError(status, message, { code });
const changed = () => fail(409, 'REVIEW_CONTEXT_CHANGED', 'La copia de ensayo cambió. Actualiza antes de continuar.');
const stored = z.object({
  format: z.literal('planb-date-check-outcome-v1'), checkId: z.uuid(), operationId: z.uuid(), ending: z.enum(['met', 'supplier-late']), recordedAt: z.iso.datetime(),
  inputRevision: z.string().regex(/^[a-f0-9]{64}$/), observations: z.array(reviewObservation).max(12), review: decisionReview,
}).strict();
type Stored = z.infer<typeof stored>;
export type ReviewStats = { recorded: number; replays: number };

export function mountDateCheckReview(app: FastifyInstance, store: Store, options: { clock?: () => number } = {}) {
  const prior = registrations.get(app);
  if (prior) { if (prior !== store) throw new Error('Date check review already registered with another Store'); return { stats: () => ({ recorded: 0, replays: 0 }) }; }
  registrations.set(app, store);
  const capture = getLocalAuthorizationCapture(app), clock = options.clock ?? Date.now;
  const stats: ReviewStats = { recorded: 0, replays: 0 };

  function requireContext(expected: string, check: () => boolean) {
    const authorized = () => { if (!check()) throw new AppError(401, 'Desbloquea tu copia local para continuar.'); };
    authorized();
    let ready = false, identity: ReturnType<typeof workspaceSearchIdentity> = null;
    try { ready = store.ready; identity = workspaceSearchIdentity(store); } catch { authorized(); throw fail(503, 'REVIEW_STORAGE', 'No se pudo comprobar la copia local.'); }
    authorized();
    if (!ready || !identity?.isTestData || identity.contextRevision !== expected) throw changed();
  }
  const key = (pin: string, checkId: string) => `date-check-review:${pin}:${checkId}`;
  const readStored = (pin: string, checkId: string): Stored | null => {
    const raw = store.get<unknown>(key(pin, checkId), null);
    if (raw === null) return null;
    const parsed = stored.safeParse(raw);
    if (!parsed.success) throw fail(503, 'REVIEW_STORAGE', 'El desenlace guardado no se pudo leer.');
    return parsed.data;
  };

  // Lee por la ruta pública de Comprobar una fecha con la misma sesión: la revisión es exactamente la que esa ruta devuelve.
  async function readCheck(request: FastifyRequest, pin: string, check: () => boolean, suffix: string) {
    const headers: Record<string, string> = { host: request.headers.host ?? '127.0.0.1' };
    if (request.headers.cookie) headers.cookie = request.headers.cookie;
    const response = await app.inject({ method: 'GET', url: `${dateCheckApiPath}${suffix}${suffix.includes('?') ? '&' : '?'}contextRevision=${pin}`, headers });
    requireContext(pin, check);
    if (response.statusCode === 404) throw fail(404, 'REVIEW_NOT_FOUND', 'Esa comprobación no está guardada en esta copia.');
    if (response.statusCode === 409) throw changed();
    if (response.statusCode !== 200) throw fail(503, 'REVIEW_SOURCE', 'No se pudo leer la comprobación.');
    return JSON.parse(response.body) as unknown;
  }
  const decided = (record: DateCheckRecordView) => {
    if (!record.decision) throw fail(409, 'REVIEW_NO_DECISION', 'Esta comprobación todavía no tiene un siguiente paso registrado.');
    return record.decision;
  };
  // Entrada exacta de la decisión: el formulario guardado con el estado de ficción cuya revisión coincide. Si ninguno coincide, no se revisa con otra entrada.
  const inputOf = (record: DateCheckRecordView, inputRevision: string): DateCheckInput => {
    for (const slotWithdrawn of [false, true]) {
      const input = demoInput(record.form, { ...initialDemoState(), slotWithdrawn });
      if (dateCheckRevision(input) === inputRevision) return input;
    }
    throw fail(409, 'REVIEW_INPUT_UNAVAILABLE', 'No se puede reconstruir la entrada exacta de esta decisión.');
  };

  const view = (pin: string, record: DateCheckRecordView, outcome: Stored | null): ReviewView => {
    const decision = decided(record);
    const offers = record.view.alternatives.find(item => item.id === decision.alternativeId)?.offers ?? [];
    const hasArrival = offers.some(item => item.type === 'confirm-arrival');
    return reviewView.parse({
      format: 'planb-date-check-review-view-v1', mode: 'fiction', contextRevision: pin, checkId: record.id, title: record.form.title,
      decision: { alternativeId: decision.alternativeId, alternativeLabel: decision.alternativeLabel, owner: decision.owner, nextStep: decision.nextStep, dueAt: decision.dueAt, confirmedAt: decision.confirmedAt, inputRevision: decision.inputRevision, promised: decision.promised },
      state: outcome ? 'recorded' : 'pending', recordedAt: outcome?.recordedAt ?? null, ending: outcome?.ending ?? null,
      endings: fictionEndings.map(item => ({ ...item, available: !outcome && (item.id === 'met' || hasArrival) })),
      observations: outcome?.observations ?? [], review: outcome?.review ?? null,
    });
  };

  app.get(reviewApiPath + '/decisions', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = pinQuery.parse(request.query);
    requireContext(pin, check);
    const list = dateCheckList.parse(await readCheck(request, pin, check, '/checks'));
    return reviewList.parse({
      format: 'planb-date-check-review-list-v1', contextRevision: pin,
      items: list.items.filter(item => item.decided).map(item => { const outcome = readStored(pin, item.id); return { checkId: item.id, title: item.title, requestedAt: item.requestedAt, recorded: !!outcome, verdict: outcome?.review.verdict ?? null }; }),
    });
  });

  app.get(reviewApiPath + '/decisions/:id', { exposeHeadRoute: false }, async request => {
    const check = capture(request.headers.cookie), { contextRevision: pin } = pinQuery.parse(request.query), { id } = idParams.parse(request.params);
    requireContext(pin, check);
    const record = dateCheckRecordView.parse(await readCheck(request, pin, check, `/checks/${id}`));
    return view(pin, record, readStored(pin, id));
  });

  app.post(reviewApiPath + '/decisions/:id/outcome', { bodyLimit: 1024 }, async (request, reply) => {
    const check = capture(request.headers.cookie), { id } = idParams.parse(request.params);
    emptyQuery.parse(request.query);
    const { contextRevision: pin, ending, operationId } = reviewRecordRequest.parse(request.body);
    requireContext(pin, check);
    const record = dateCheckRecordView.parse(await readCheck(request, pin, check, `/checks/${id}`)), decision = decided(record);
    const replay = (existing: Stored) => {
      if (existing.operationId === operationId && existing.ending === ending) return existing;
      throw fail(409, 'REVIEW_ALREADY_RECORDED', 'Esta decisión ya tiene un desenlace registrado.');
    };
    const existing = readStored(pin, id);
    if (existing) { stats.replays += 1; return reply.code(200).send(view(pin, record, replay(existing))); }
    const offerIds = record.view.alternatives.find(item => item.id === decision.alternativeId)?.offerIds ?? [];
    let built: { observations: Observation[]; review: DecisionReviewView };
    try {
      built = fictionEnding(inputOf(record, decision.inputRevision), { alternativeId: decision.alternativeId, offerIds, inputRevision: decision.inputRevision }, ending as FictionEnding, new Date(clock()).toISOString());
    } catch (error) {
      if (error instanceof RangeError) throw fail(422, 'REVIEW_ENDING_NOT_APPLICABLE', error.message);
      throw error;
    }
    const outcome = store.transaction(() => {
      requireContext(pin, check);
      const raced = readStored(pin, id);
      if (raced) return { created: false, value: replay(raced) };
      const value: Stored = { format: 'planb-date-check-outcome-v1', checkId: id, operationId, ending, recordedAt: new Date(clock()).toISOString(), inputRevision: decision.inputRevision, observations: built.observations, review: built.review };
      store.set(key(pin, id), stored.parse(value));
      return { created: true, value };
    });
    if (outcome.created) stats.recorded += 1; else stats.replays += 1;
    requireContext(pin, check);
    return reply.code(outcome.created ? 201 : 200).send(view(pin, record, outcome.value));
  });

  return { stats: () => ({ ...stats }) };
}
