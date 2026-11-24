// Plan B Verifica · el expediente de un encargo en la pantalla (Mega Plan 3, fases 1 y 3). Lee y verifica la cadena privada,
// guarda las versiones de cada emisión para compararlas, recoge las respuestas del vendedor (declaradas, sin tocar lo
// observado), arma el paquete del comprador solo con lo compartible y cierra el encargo borrando sus datos con un acta.
// Cada escritura va en la misma transacción que su entrada del expediente.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leaksIn } from '../../shared/verifica/clean-room.js';
import { compareReports, type ReportComparison } from '../../shared/verifica/comparacion.js';
import { CLOSURE_FORMAT, CLOSURE_OUTSIDE, verifyLedger, type ClosureRecord, type ExpedienteView, type IssueVersion } from '../../shared/verifica/expediente.js';
export type { ClosureRecord, ExpedienteView, IssueVersion } from '../../shared/verifica/expediente.js';
import { buildPackage, packageToJson, type PackageDocument } from '../../shared/verifica/paquete.js';
import { answerProblem, buildAnswers, questionsFor, type AnswersDocument, type SellerAnswer, type SellerQuestion } from '../../shared/verifica/preguntas.js';
import { fingerprintOf, parseReport, type VerificaReport } from '../../shared/verifica/report.js';
import { RULE_IDS } from '../../shared/verifica/model.js';
import { watchReportToJson } from '../../shared/verifica/watch.js';
import { sha256Hex } from '../../shared/sha256.js';
import type { Engagement, EngagementInputs } from '../../shared/verifica/engagement.js';
import { AppError, type Store } from '../store.js';
import { appendLedger, engagementLedger } from './expediente-store.js';
import type { createWatchTimer } from './watch-timer.js';

const API = '/api/verifica';
const MAX_VERSIONS = 20;
export const issuesKey = (id: string) => 'verifica:issues:' + id;
const answersKey = (id: string) => 'verifica:answers:' + id;
const CLOSURES_KEY = 'verifica:closures';


const idParam = z.object({ id: z.uuid() }).strict();
const answerParams = z.object({ id: z.uuid(), rule: z.enum(RULE_IDS) }).strict();
const answerBody = z.object({ text: z.string().max(8000) }).strict();
const packageBody = z.object({ watch: z.boolean().optional(), answers: z.boolean().optional() }).strict();
const closeBody = z.object({ confirmName: z.string().max(400) }).strict();

type Timer = ReturnType<typeof createWatchTimer>;

/** Guarda una versión más de la emisión (se llama dentro de la transacción de la sala limpia). */
export function rememberIssue(store: Store, id: string, version: IssueVersion) {
  store.set(issuesKey(id), [...store.get<IssueVersion[]>(issuesKey(id), []), version].slice(-MAX_VERSIONS));
}

export function registerExpedienteApi(app: FastifyInstance, store: Store, deps: {
  now: () => string;
  find: (id: string) => Engagement;
  remove: (id: string) => void;
  inputs: (id: string) => EngagementInputs;
  readRunning: (id: string) => boolean;
  timer: Timer;
}) {
  const versions = (id: string) => store.get<IssueVersion[]>(issuesKey(id), []);
  const latestReport = (id: string): VerificaReport | null => {
    // Una emisión anterior a las versiones sigue valiendo: se lee la vigente.
    const json = versions(id).at(-1)?.reportJson ?? store.get<{ reportJson: string } | null>('verifica:issue:' + id, null)?.reportJson;
    return json ? parseReport(JSON.parse(json)) : null;
  };
  const answersOf = (id: string, report: VerificaReport | null): AnswersDocument | null => {
    if (!report) return null;
    const stored = store.get<{ report: string; answers: SellerAnswer[] } | null>(answersKey(id), null);
    if (!stored || stored.report !== report.fingerprint || !stored.answers.length) return null;
    return buildAnswers(report, stored.answers);
  };

  function expediente(id: string): ExpedienteView {
    const entries = engagementLedger(store, id);
    const verification = verifyLedger(entries, { engagement: id });
    // Cada emisión guardó la cabeza de entonces: si alguien recorta o rehace la cadena, deja de coincidir.
    const anchors = versions(id).flatMap(v => v.ledgerHead ? [{ sequence: v.ledgerHead.sequence, ok: entries.find(e => e.sequence === v.ledgerHead!.sequence)?.fingerprint === v.ledgerHead.fingerprint }] : []);
    return { entries, verification, anchors };
  }

  app.get(API + '/engagements/:id/expediente', async request => {
    const { id } = idParam.parse(request.params);
    deps.find(id);
    return expediente(id);
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
    deps.find(id);
    const report = latestReport(id);
    if (!report) throw new AppError(409, 'El paquete necesita un informe emitido.');
    const documents: PackageDocument[] = [{ kind: 'report', fingerprint: report.fingerprint, content: report }];
    if (body.watch) {
      if (!deps.timer.configured(id)) throw new AppError(409, 'Este encargo no tiene vigilancia: no hay parte que incluir.');
      const watch = JSON.parse(watchReportToJson(deps.timer.report(id)));
      documents.push({ kind: 'watch', fingerprint: watch.fingerprint, content: watch });
    }
    if (body.answers) {
      const answers = answersOf(id, report);
      if (!answers) throw new AppError(409, 'No hay respuestas del vendedor a este informe.');
      documents.push({ kind: 'answers', fingerprint: answers.fingerprint, content: answers });
    }
    const json = store.transaction(() => {
      const head = engagementLedger(store, id).at(-1) ?? null;
      const pkg = buildPackage({ engagement: id, createdAt: deps.now(), ledgerHead: head ? { sequence: head.sequence, fingerprint: head.fingerprint } : null, documents });
      appendLedger(store, id, deps.now(), [{ event: 'package-issued', refs: [{ kind: 'package', method: 'verifica-paquete-comprador-v1', fingerprint: pkg.fingerprint },
        ...documents.map(d => ({ kind: d.kind === 'answers' ? 'answer' as const : d.kind === 'watch' ? 'watch-report' as const : 'report' as const,
          method: d.kind === 'answers' ? 'sha256-bytes-v1' as const : d.kind === 'watch' ? 'planb-verifica-watch-v1' as const : 'planb-verifica-report-v1' as const,
          fingerprint: d.kind === 'answers' ? sha256Hex(JSON.stringify(d.content)) : d.fingerprint }))] }]);
      return packageToJson(pkg);
    });
    reply.type('application/json; charset=utf-8').header('cache-control', 'no-store');
    return json;
  });

  // Cerrar el encargo: se borra todo lo suyo del almacén y queda un acta mínima, sin datos del CRM, con lo que se borró.
  app.post(API + '/engagements/:id/close', async request => {
    const { id } = idParam.parse(request.params);
    const { confirmName } = closeBody.parse(request.body);
    const engagement = deps.find(id);
    if (confirmName.trim() !== engagement.name) throw new AppError(422, 'Escribe el nombre exacto del encargo para confirmar el cierre.');
    if (deps.readRunning(id)) throw new AppError(409, 'Hay una lectura en marcha. Espera a que termine antes de cerrar el encargo.');
    deps.timer.pause(id);
    return store.transaction(() => {
      const view = expediente(id);
      const keys = (store.db.prepare("SELECT key FROM meta WHERE key LIKE 'verifica:%' AND (key LIKE ? OR key LIKE ?)").all('%:' + id, '%:' + id + ':%') as { key: string }[]).map(r => r.key);
      const byKind: Record<string, number> = {};
      for (const key of keys) { const kind = key.split(':')[1] ?? 'otro'; byKind[kind] = (byKind[kind] ?? 0) + 1; }
      const remove = store.db.prepare('DELETE FROM meta WHERE key=?');
      let rows = 0;
      for (const key of keys) rows += Number(remove.run(key).changes);
      deps.remove(id);
      const head = view.entries.at(-1) ?? null;
      const body: Omit<ClosureRecord, 'fingerprint'> = {
        format: CLOSURE_FORMAT, engagement: id, closedAt: deps.now(),
        ledgerHead: head ? { sequence: head.sequence, fingerprint: head.fingerprint } : null,
        ledgerIntact: view.verification.intact && view.anchors.every(a => a.ok),
        deleted: { rows, byKind }, outside: CLOSURE_OUTSIDE,
      };
      const record: ClosureRecord = { ...body, fingerprint: fingerprintOf(body) };
      store.set(CLOSURES_KEY, [...store.get<ClosureRecord[]>(CLOSURES_KEY, []), record]);
      return { closure: record };
    });
  });

  app.get(API + '/closures', async () => ({ closures: store.get<ClosureRecord[]>(CLOSURES_KEY, []) }));
}
