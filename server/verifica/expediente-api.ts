// Plan B Verifica · el expediente de un encargo en la pantalla (Mega Plan 3, fases 1 y 3). Lee y verifica la cadena privada,
// guarda las versiones de cada emisión para compararlas, recoge las respuestas del vendedor (declaradas, sin tocar lo
// observado), arma el paquete del comprador solo con lo compartible y cierra el encargo borrando sus datos con un acta.
// Cada escritura va en la misma transacción que su entrada del expediente.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leaksIn } from '../../shared/verifica/clean-room.js';
import { compareReports, type ReportComparison } from '../../shared/verifica/comparacion.js';
import { buildClosureRecord, CLOSURE_FORMAT, CLOSURE_OUTSIDE, verifyLedger, type ClosureRecord, type ExpedienteView, type IssueVersion, type LedgerEntry, type LedgerRef } from '../../shared/verifica/expediente.js';
export type { ClosureRecord, ExpedienteView, IssueVersion } from '../../shared/verifica/expediente.js';
import { EQUIVALENCE_FORMAT, verifyEquivalenceReport } from '../../shared/verifica/equivalence.js';
import { buildPackage, packageToJson, type PackageDocument } from '../../shared/verifica/paquete.js';
import { answerProblem, buildAnswers, questionsFor, type AnswersDocument, type SellerAnswer, type SellerQuestion } from '../../shared/verifica/preguntas.js';
import { fingerprintOf, parseReport, verifyReport, type VerificaReport } from '../../shared/verifica/report.js';
import { REVIEW_DECISIONS, REVIEW_FORMAT, reviewView, type EngagementWorkflow, type ReviewCommand } from '../../shared/verifica/revision.js';
import { RULE_IDS } from '../../shared/verifica/model.js';
import { sha256Hex } from '../../shared/sha256.js';
import type { Engagement, EngagementInputs, EngagementView } from '../../shared/verifica/engagement.js';
import { AppError, type Store } from '../store.js';
import { appendLedger, engagementLedger } from './expediente-store.js';
import { latestEquivalence } from './equivalence-store.js';
import { appendReviewDecision, recentReviewDecisions, reviewIndex } from './revision-store.js';
import type { createWatchTimer } from './watch-timer.js';

const API = '/api/verifica';
const MAX_VERSIONS = 20;
export const issuesKey = (id: string) => 'verifica:issues:' + id;
const answersKey = (id: string) => 'verifica:answers:' + id;
const CLOSURES_KEY = 'verifica:closures';


const idParam = z.object({ id: z.uuid() }).strict();
const answerParams = z.object({ id: z.uuid(), rule: z.enum(RULE_IDS) }).strict();
const answerBody = z.object({ text: z.string().max(8000) }).strict();
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const reviewBody = z.object({ report: hex, evidence: hex, previousDecision: hex.nullable(), statement: hex.nullable(), decision: z.enum(REVIEW_DECISIONS) }).strict() satisfies z.ZodType<ReviewCommand>;
const packageBody = z.object({ watch: z.boolean().optional(), answers: z.boolean().optional(),
  equivalence: z.union([z.boolean(), z.object({ fingerprint: hex, reviewed: z.literal(true) }).strict()]).optional(), reviewFingerprint: hex.optional() }).strict();
const closeBody = z.object({ confirmName: z.string().max(400), scopeFingerprint: hex.optional() }).strict();

type Timer = ReturnType<typeof createWatchTimer>;

/** Guarda una versión más de la emisión (se llama dentro de la transacción de la sala limpia). */
export function rememberIssue(store: Store, id: string, version: IssueVersion) {
  store.set(issuesKey(id), [...store.get<IssueVersion[]>(issuesKey(id), []), version].slice(-MAX_VERSIONS));
}

export function registerExpedienteApi(app: FastifyInstance, store: Store, deps: {
  now: () => string;
  find: (id: string) => Engagement;
  remove: (id: string) => void;
  forgetRead: (id: string) => void;
  inputs: (id: string) => EngagementInputs;
  status: (engagement: Engagement) => Pick<EngagementView, 'issue' | 'missing'>;
  readRunning: (id: string) => boolean;
  timer: Timer;
}) {
  const versions = (id: string) => store.get<IssueVersion[]>(issuesKey(id), []);
  const latestReport = (id: string, history = versions(id)): VerificaReport | null => {
    // Una emisión anterior a las versiones sigue valiendo: se lee la vigente.
    const json = history.at(-1)?.reportJson ?? store.get<{ reportJson: string } | null>('verifica:issue:' + id, null)?.reportJson;
    return json ? parseReport(JSON.parse(json)) : null;
  };
  const answersOf = (id: string, report: VerificaReport | null): AnswersDocument | null => {
    if (!report) return null;
    const stored = store.get<{ report: string; answers: SellerAnswer[] } | null>(answersKey(id), null);
    if (!stored || stored.report !== report.fingerprint || !stored.answers.length) return null;
    return buildAnswers(report, stored.answers);
  };

  function workflow(engagement: Engagement, dossier: ExpedienteView, history: IssueVersion[]): EngagementWorkflow {
    const { id } = engagement;
    const { issue, missing } = deps.status(engagement);
    const index = reviewIndex(store, id);
    const recentDecisions = recentReviewDecisions(store, id, index.sequence);
    const report = !missing.length && issue && !issue.stale ? latestReport(id, history) : null;
    const review = report && report.fingerprint === issue?.reportFingerprint && verifyReport(report)
      ? reviewView(report, index.latest, answersOf(id, report)?.answers ?? []) : null;
    const intact = dossier.verification.intact && dossier.anchors.every(anchor => anchor.ok);
    const lastDelivery = intact ? dossier.entries.findLast(entry => entry.event === 'package-issued' && entry.refs.some(ref => ref.kind === 'review')) : undefined;
    const packageRef = lastDelivery?.refs.find(ref => ref.kind === 'package');
    const reportRef = lastDelivery?.refs.find(ref => ref.kind === 'report');
    const reviewRef = lastDelivery?.refs.find(ref => ref.kind === 'review');
    let delivery: EngagementWorkflow['delivery'] = null;
    if (lastDelivery && packageRef && reportRef && reviewRef) {
      const state = !report ? 'sources-changed' : report.fingerprint !== reportRef.fingerprint ? 'report-changed'
        : review?.fingerprint !== reviewRef.fingerprint ? 'review-changed' : 'current';
      const original = state === 'report-changed' ? history.find(version => version.reportFingerprint === reportRef.fingerprint) : undefined;
      const changedRules = original && report ? compareReports(parseReport(JSON.parse(original.reportJson)), report).findings.map(change => change.rule) : null;
      delivery = { fingerprint: packageRef.fingerprint, at: lastDelivery.recordedAt, report: reportRef.fingerprint, state, changedRules };
    }
    const reviewedPackage = delivery?.state === 'current' ? { fingerprint: delivery.fingerprint, at: delivery.at } : null;
    const next = !intact ? 'check-expediente' : missing.length ? 'complete-sources' : !issue ? 'issue-report' : !review ? 'refresh-report'
      : !review.ready ? 'review-findings' : reviewedPackage ? 'reviewed-package-issued' : 'prepare-package';
    return { next, missing, review, recentDecisions, reviewedPackage, delivery };
  }

  function closureKeys(id: string) {
    // El propietario está inmediatamente después del módulo. Un identificador dentro de un sufijo no cambia el encargo.
    const rows = store.db.prepare(`WITH scoped AS (
      SELECT key, substr(key, length('verifica:') + 1) AS rest FROM meta WHERE key GLOB 'verifica:*:*'
    ), owned AS (
      SELECT key, substr(rest, instr(rest, ':') + 1) AS owner FROM scoped
    ) SELECT key FROM owned WHERE owner = ? OR owner GLOB ? ORDER BY key`).all(id, `${id}:*`) as { key: string }[];
    return rows.map(row => row.key);
  }

  function closureInventory(id: string, head: LedgerEntry | null) {
    const keys = closureKeys(id);
    const byKind: Record<string, number> = {};
    for (const key of keys) {
      const kind = key.split(':')[1] ?? 'otro';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    return { keys, scope: { fingerprint: fingerprintOf({ id, keys, head: head?.fingerprint ?? null }), rows: keys.length, byKind, outside: CLOSURE_OUTSIDE } };
  }

  function expediente(id: string, history = versions(id)): ExpedienteView {
    const entries = engagementLedger(store, id);
    const verification = verifyLedger(entries, { engagement: id });
    // Cada emisión guardó la cabeza de entonces: si alguien recorta o rehace la cadena, deja de coincidir.
    const anchors = history.flatMap(v => v.ledgerHead ? [{ sequence: v.ledgerHead.sequence, ok: entries.find(e => e.sequence === v.ledgerHead!.sequence)?.fingerprint === v.ledgerHead.fingerprint }] : []);
    return { entries, verification, anchors };
  }

  app.get(API + '/engagements/:id/expediente', async request => {
    const { id } = idParam.parse(request.params);
    const engagement = deps.find(id);
    const history = versions(id);
    const view = expediente(id, history);
    const report = latestEquivalence(store, id);
    const equivalence = report && deps.timer.configured(id) && deps.timer.status(id).latest.fingerprint === report.closing.fingerprint ? report : null;
    return { ...view, workflow: workflow(engagement, view, history), closureScope: closureInventory(id, view.entries.at(-1) ?? null).scope,
      latestEquivalence: equivalence ? { fingerprint: equivalence.fingerprint, asOf: equivalence.asOf, confirmedBy: equivalence.map.confirmedBy } : null };
  });

  app.put(API + '/engagements/:id/review/:rule', async request => {
    const { id, rule } = answerParams.parse(request.params);
    const command = reviewBody.parse(request.body);
    const engagement = deps.find(id);
    return store.transaction(() => {
      const status = deps.status(engagement);
      const report = status.issue && !status.issue.stale && !status.missing.length ? latestReport(id) : null;
      if (!report || report.fingerprint !== command.report || report.fingerprint !== status.issue?.reportFingerprint || !verifyReport(report)) {
        throw new AppError(409, 'El informe vigente cambió. Actualiza los hallazgos antes de revisarlos.');
      }
      const index = reviewIndex(store, id);
      const answers = answersOf(id, report)?.answers ?? [];
      const current = reviewView(report, index.latest, answers);
      const finding = current.findings.find(item => item.rule === rule);
      if (!finding || finding.evidence !== command.evidence) throw new AppError(409, 'La evidencia del hallazgo cambió. Vuelve a abrirlo antes de revisarlo.');
      if (command.decision === 'reviewed-declaration' && !finding.statement) throw new AppError(409, 'Hace falta una respuesta del vendedor para revisar su declaración.');
      if (command.decision === 'reviewed-declaration' && command.statement !== finding.statement) throw new AppError(409, 'La respuesta del vendedor cambió. Léela de nuevo antes de confirmarla.');
      const previous = index.latest[rule];
      if (previous?.report === command.report && finding.state === command.decision) return current;
      if (finding.previousDecision !== command.previousDecision) throw new AppError(409, 'Ya se registró otra decisión sobre este hallazgo. Actualiza su estado.');
      const entry = appendReviewDecision(store, id, deps.now(), index, report.fingerprint, finding, command.decision);
      return reviewView(report, { ...index.latest, [rule]: entry }, answers);
    });
  });

  app.get(API + '/engagements/:id/issues', async request => {
    const { id } = idParam.parse(request.params);
    deps.find(id);
    const list = versions(id);
    let comparison: ReportComparison | null = null;
    if (list.length >= 2) comparison = compareReports(parseReport(JSON.parse(list.at(-2)!.reportJson)), parseReport(JSON.parse(list.at(-1)!.reportJson)));
    return { versions: list.map(({ reportJson: _omit, ...rest }) => rest), comparison };
  });

  app.get(API + '/engagements/:id/questions', async (request): Promise<{ report: string | null; questions: SellerQuestion[]; answers: AnswersDocument | null }> => {
    const { id } = idParam.parse(request.params);
    deps.find(id);
    const report = latestReport(id);
    return { report: report?.fingerprint ?? null, questions: report ? questionsFor(report) : [], answers: answersOf(id, report) };
  });

  app.put(API + '/engagements/:id/answers/:rule', async request => {
    const { id, rule } = answerParams.parse(request.params);
    const { text } = answerBody.parse(request.body);
    deps.find(id);
    const report = latestReport(id);
    if (!report) throw new AppError(409, 'Primero hay que emitir el informe: las preguntas salen de sus hallazgos.');
    if (!questionsFor(report).some(q => q.id === rule)) throw new AppError(409, 'Ese hallazgo no tiene pregunta en el informe vigente.');
    const problem = answerProblem(text);
    if (problem) throw new AppError(422, problem);
    // La misma barrera que la sala limpia: una respuesta con un nombre, un correo, un NIF o un ID del CRM no se guarda.
    const inputs = deps.inputs(id);
    const captures = [inputs.previous, inputs.latest].filter((c): c is NonNullable<typeof c> => !!c);
    if (leaksIn(JSON.stringify(text.trim()), captures, inputs.invoices).length) {
      throw new AppError(422, 'La respuesta contiene un nombre, un correo, un NIF o un ID del CRM. Escríbela con los seudónimos del informe.');
    }
    return store.transaction(() => {
      const at = deps.now();
      const stored = store.get<{ report: string; answers: SellerAnswer[] } | null>(answersKey(id), null);
      const kept = stored && stored.report === report.fingerprint ? stored.answers.filter(a => a.question !== rule) : [];
      const answers = [...kept, { question: rule, text: text.trim(), answeredAt: at }];
      store.set(answersKey(id), { report: report.fingerprint, answers });
      appendLedger(store, id, at, [{ event: 'answer-declared', refs: [
        { kind: 'report', method: 'planb-verifica-report-v1', fingerprint: report.fingerprint },
        { kind: 'answer', method: 'sha256-bytes-v1', fingerprint: sha256Hex(text.trim()) },
      ] }]);
      return { answers: buildAnswers(report, answers) };
    });
  });

  app.post(API + '/engagements/:id/package', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const body = packageBody.parse(request.body ?? {});
    const engagement = deps.find(id);
    const report = latestReport(id);
    if (!report) throw new AppError(409, 'El paquete necesita un informe emitido.');
    if (body.equivalence === true) {
      throw new AppError(409, 'Vuelve a abrir el expediente y confirma la huella del informe de equivalencia antes de incluirlo.');
    }
    const documents: PackageDocument[] = [{ kind: 'report', fingerprint: report.fingerprint, content: report }];
    const refs: LedgerRef[] = [{ kind: 'report', method: 'planb-verifica-report-v1', fingerprint: report.fingerprint }];
    const equivalence = body.equivalence ? latestEquivalence(store, id) : null;
    if (body.equivalence && (!equivalence || equivalence.fingerprint !== body.equivalence.fingerprint || !verifyEquivalenceReport(equivalence)
      || !deps.timer.configured(id) || deps.timer.status(id).latest.fingerprint !== equivalence.closing.fingerprint)) {
      throw new AppError(409, 'La equivalencia ya no corresponde a la captura de cierre. Actualiza la comparación y vuelve a seleccionarla.');
    }
    if (body.watch) {
      if (!deps.timer.configured(id)) throw new AppError(409, 'Este encargo no tiene vigilancia: no hay parte que incluir.');
      const watch = deps.timer.report(id, equivalence?.asOf);
      if (equivalence && equivalence.closing.watch !== watch.fingerprint) throw new AppError(409, 'El parte de vigilancia cambió. Repite la comparación antes de incluir los dos documentos.');
      documents.push({ kind: 'watch', fingerprint: watch.fingerprint, content: watch });
      refs.push({ kind: 'watch-report', method: 'planb-verifica-watch-v1', fingerprint: watch.fingerprint });
    }
    if (equivalence) {
      documents.push({ kind: 'equivalence', fingerprint: equivalence.fingerprint, content: equivalence });
      refs.push({ kind: 'equivalence', method: EQUIVALENCE_FORMAT, fingerprint: equivalence.fingerprint });
    }
    if (body.answers) {
      const answers = answersOf(id, report);
      if (!answers) throw new AppError(409, 'No hay respuestas del vendedor a este informe.');
      documents.push({ kind: 'answers', fingerprint: answers.fingerprint, content: answers });
      refs.push({ kind: 'answer', method: 'sha256-bytes-v1', fingerprint: sha256Hex(JSON.stringify(answers)) });
    }
    const json = store.transaction(() => {
      if (body.reviewFingerprint) {
        const { issue, missing } = deps.status(engagement);
        const review = reviewView(report, reviewIndex(store, id).latest, answersOf(id, report)?.answers ?? []);
        if (!issue || issue.stale || missing.length || issue.reportFingerprint !== report.fingerprint || !verifyReport(report)
          || !review.ready || review.fingerprint !== body.reviewFingerprint) {
          throw new AppError(409, 'La revisión cambió o quedan hallazgos pendientes. Revisa el encargo antes de preparar el paquete.');
        }
        const dossier = expediente(id);
        if (!dossier.verification.intact || dossier.anchors.some(anchor => !anchor.ok)) {
          throw new AppError(409, 'El expediente no coincide con sus huellas. Comprueba su integridad antes de preparar el paquete.');
        }
        refs.push({ kind: 'review', method: REVIEW_FORMAT, fingerprint: review.fingerprint });
      }
      const head = engagementLedger(store, id).at(-1) ?? null;
      const pkg = buildPackage({ engagement: id, createdAt: deps.now(), ledgerHead: head ? { sequence: head.sequence, fingerprint: head.fingerprint } : null, documents });
      appendLedger(store, id, deps.now(), [{ event: 'package-issued', refs: [{ kind: 'package', method: 'verifica-paquete-comprador-v1', fingerprint: pkg.fingerprint },
        ...refs] }]);
      return packageToJson(pkg);
    });
    reply.type('application/json; charset=utf-8').header('cache-control', 'no-store');
    return json;
  });

  // Cerrar el encargo: se borra todo lo suyo del almacén y queda un acta mínima, sin datos del CRM, con lo que se borró.
  app.post(API + '/engagements/:id/close', async request => {
    const { id } = idParam.parse(request.params);
    const { confirmName, scopeFingerprint } = closeBody.parse(request.body);
    const engagement = deps.find(id);
    if (confirmName.trim() !== engagement.name) throw new AppError(422, 'Escribe el nombre exacto del encargo para confirmar el cierre.');
    if (deps.readRunning(id)) throw new AppError(409, 'Hay una lectura en marcha. Espera a que termine antes de cerrar el encargo.');
    const closure = store.transaction(() => {
      const view = expediente(id);
      const head = view.entries.at(-1) ?? null;
      const { keys, scope } = closureInventory(id, head);
      if (scopeFingerprint && scopeFingerprint !== scope.fingerprint) throw new AppError(409, 'El alcance del borrado cambió. Vuelve a revisarlo antes de cerrar el encargo.');
      const remove = store.db.prepare('DELETE FROM meta WHERE key=?');
      let rows = 0;
      for (const key of keys) rows += Number(remove.run(key).changes);
      if (rows !== keys.length || closureKeys(id).length) throw new Error('El borrado del encargo no coincide con su alcance.');
      deps.remove(id);
      const record = buildClosureRecord({
        format: CLOSURE_FORMAT, engagement: id, closedAt: deps.now(),
        ledgerHead: head ? { sequence: head.sequence, fingerprint: head.fingerprint } : null,
        ledgerIntact: view.verification.intact && view.anchors.every(a => a.ok),
        deleted: { rows, byKind: scope.byKind }, outside: scope.outside, scopeFingerprint: scope.fingerprint,
      });
      store.set(CLOSURES_KEY, [...store.get<ClosureRecord[]>(CLOSURES_KEY, []), record]);
      return record;
    });
    deps.timer.pause(id);
    deps.forgetRead(id);
    return { closure };
  });

  app.get(API + '/closures', async () => ({ closures: store.get<ClosureRecord[]>(CLOSURES_KEY, []) }));
}
