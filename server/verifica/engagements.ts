// Plan B Verifica · encargos en el servidor local (fase D del mega plan 2; cortes 1, 2 y 3 el 24/11/2026).
// Corte 1: crear un encargo y guardarle sus fuentes (dos capturas, el libro de facturas y las cifras declaradas) desde la
// pantalla. Corte 2: la sala limpia con un botón, que emite el informe, la copia custodiada y su llave con el mismo motor
// y la misma entrada que scripts/verifica-sala-limpia.ts. Todo se guarda cifrado en el almacén que ya existe, en su tabla
// meta, sin tocar el esquema. Corte 3: leer HubSpot desde la pantalla con la misma pieza que scripts/verifica-hubspot.ts
// (server/verifica/hubspot-read.ts), en segundo plano; la captura entra como fuente y, en modo cliente, su acta se
// guarda aparte. La credencial solo vive en memoria mientras dura la lectura. Una fuente que no sirve no se guarda. Las respuestas describen cada fuente (estado, huella,
// resumen) y nunca devuelven su texto. La llave de la copia solo viaja una vez, en la respuesta de emitir, y no se guarda:
// así siempre va aparte del informe y de la copia. Hereda las guardas del servidor local (sesión, host y origen).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CleanRoomError, runCleanRoom } from '../../shared/verifica/clean-room.js';
import { custodyFingerprint } from '../../shared/verifica/custody.js';
import { ENGAGEMENT_LIMITS, ENGAGEMENT_ROLES, engagementView, inputProblem, readEngagement, type Engagement, type EngagementRole, type EngagementView, type IssueResult, type IssueSummary, type StoredSource, type StoredSources } from '../../shared/verifica/engagement.js';
import { cleanRoomInput, parseCaptureText, parseDeclarationsText } from '../../shared/verifica/inputs.js';
import { reportToJson } from '../../shared/verifica/report.js';
import { sha256Hex } from '../../shared/sha256.js';
import { VerificaReadError } from '../../shared/verifica/hubspot.js';
import { checkReadAuthorization, madridDay, parseReadAuthorization, ReadAuthorizationError, type ReadAuthorization, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { credentialProblem, readWithRecord, recordToText } from './hubspot-read.js';
import { registerWatchApi } from './watch-api.js';
import { READ_LIMITS, type ReadJob, type RecordSummary } from '../../shared/verifica/engagement.js';
export type { ReadJob, RecordSummary } from '../../shared/verifica/engagement.js';
import { AppError, type Store } from '../store.js';

export const VERIFICA_API = '/api/verifica';
const LIST_KEY = 'verifica:engagements';
const sourceKey = (id: string, role: EngagementRole) => 'verifica:source:' + id + ':' + role;
const issueKey = (id: string) => 'verifica:issue:' + id;
const recordsKey = (id: string) => 'verifica:records:' + id;
const recordKey = (id: string, captureId: string) => 'verifica:record:' + id + ':' + captureId;

/** Lo que se guarda de una emisión: el informe y la copia tal como se descargan, y las huellas de las fuentes de las
 *  que salieron (para saber si quedó desfasada). Nunca la llave. */
interface StoredIssue { issuedAt: string; reportJson: string; custodyJson: string; reportFingerprint: string; custodyFingerprint: string; findings: number; alarms: number; sources: Partial<Record<EngagementRole, string>> }

const idParam = z.object({ id: z.uuid() }).strict();
const roleParam = z.object({ id: z.uuid(), role: z.enum(ENGAGEMENT_ROLES) }).strict();
const fileParam = z.object({ id: z.uuid(), file: z.enum(['report', 'custody']) }).strict();
const recordParam = z.object({ id: z.uuid(), captureId: z.string().min(1).max(200) }).strict();
const readBody = z.object({
  mode: z.enum(['client', 'test']),
  portalId: z.string().regex(/^\d{1,20}$/),
  token: z.string().min(1).max(4096),
  /** Dónde entra la captura: anterior, más reciente o más reciente pasando la actual a anterior. */
  target: z.enum(['previous', 'latest', 'rotate']),
  authorization: z.string().max(READ_LIMITS.authorizationChars).optional(),
  documentBase64: z.string().max(Math.ceil(READ_LIMITS.documentBytes / 3) * 4).optional(),
  confirmFullRead: z.boolean().optional(),
}).strict();

const createBody = z.object({ name: z.string().trim().min(1).max(ENGAGEMENT_LIMITS.nameChars) }).strict();
const sourceBody = z.object({
  text: z.string().min(1).max(ENGAGEMENT_LIMITS.sourceBytes),
  fileName: z.string().trim().min(1).max(ENGAGEMENT_LIMITS.fileNameChars),
}).strict();

const fingerprints = (view: EngagementView): Partial<Record<EngagementRole, string>> =>
  Object.fromEntries(ENGAGEMENT_ROLES.flatMap(role => { const s = view.sources[role]; return s.status === 'ok' ? [[role, s.fingerprint]] : []; }));
const sameSources = (a: Partial<Record<EngagementRole, string>>, b: Partial<Record<EngagementRole, string>>) => ENGAGEMENT_ROLES.every(role => a[role] === b[role]);

export interface VerificaEngagementOptions {
  now?: () => string;
  /** Solo para pruebas: sal y llave fijas, para comparar byte a byte con el script. */
  cleanRoom?: { salt?: string; key?: string };
  /** Transporte hacia HubSpot (por defecto, fetch). Las pruebas pasan un HubSpot simulado. */
  hubspotFetch?: typeof fetch;
  /** Reloj de la lectura (fecha de la captura y del acta). Por defecto, ahora. */
  hubspotNow?: () => Date;
  /** Solo para pruebas del temporizador de vigilancia. */
  watchIntervalMs?: number;
}

export function registerVerificaEngagements(app: FastifyInstance, store: Store, options: VerificaEngagementOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const jobs = new Map<string, ReadJob>();
  const list = () => store.get<Engagement[]>(LIST_KEY, []);
  const find = (id: string) => {
    const engagement = list().find(item => item.id === id);
    if (!engagement) throw new AppError(404, 'No existe ese encargo.');
    return engagement;
  };
  const sources = (id: string): StoredSources => Object.fromEntries(ENGAGEMENT_ROLES.flatMap(role => {
    const stored = store.get<StoredSource | null>(sourceKey(id, role), null);
    return stored ? [[role, stored]] : [];
  }));
  const touch = (id: string) => store.set(LIST_KEY, list().map(item => item.id === id ? { ...item, updatedAt: now() } : item));
  const summary = (stored: StoredIssue, view: EngagementView): IssueSummary => ({
    issuedAt: stored.issuedAt, reportFingerprint: stored.reportFingerprint, custodyFingerprint: stored.custodyFingerprint,
    findings: stored.findings, alarms: stored.alarms, stale: !sameSources(stored.sources, fingerprints(view)),
  });
  /** La vista pública de un encargo, con su última emisión si la hay. */
  const viewOf = (engagement: Engagement): EngagementView => {
    const view = engagementView(engagement, sources(engagement.id));
    const stored = store.get<StoredIssue | null>(issueKey(engagement.id), null);
    return { ...view, issue: stored ? summary(stored, view) : null };
  };

  // La página de Verifica pregunta esto para saber si la sirve el servidor local y puede ofrecer los pasos del encargo.
  app.get(VERIFICA_API + '/health', async () => ({ ok: true, engagements: true }));

  app.get(VERIFICA_API + '/engagements', async () => ({
    engagements: list().map(engagement => {
      const view = viewOf(engagement);
      return { ...engagement, ready: view.missing.length === 0, stored: ENGAGEMENT_ROLES.filter(role => view.sources[role].status !== 'missing').length, issued: !!view.issue && !view.issue.stale };
    }),
  }));

  app.post(VERIFICA_API + '/engagements', async (request, reply) => {
    const { name } = createBody.parse(request.body);
    const current = list();
    if (current.length >= ENGAGEMENT_LIMITS.engagements) throw new AppError(409, 'Hay demasiados encargos en este equipo.');
    const at = now(), engagement: Engagement = { id: randomUUID(), name, createdAt: at, updatedAt: at };
    store.set(LIST_KEY, [...current, engagement]);
    reply.code(201);
    return viewOf(engagement);
  });

  app.get(VERIFICA_API + '/engagements/:id', async request => {
    const { id } = idParam.parse(request.params);
    return viewOf(find(id));
  });

  app.put(VERIFICA_API + '/engagements/:id/sources/:role', async request => {
    const { id, role } = roleParam.parse(request.params);
    const { text, fileName } = sourceBody.parse(request.body);
    const engagement = find(id);
    // Antes de guardar se comprueba que el texto tiene la forma de su fuente. Las facturas se terminan de leer con la
    // captura más reciente (se asignan a sus empresas): eso lo dice la vista, no impide guardarlas.
    try {
      if (role === 'previous' || role === 'latest') parseCaptureText(text, 'El archivo');
      if (role === 'declarations') parseDeclarationsText(text, 'El archivo');
      if (role === 'invoices' && !/[;,\t]/.test(text.split(/\r?\n/, 1)[0] ?? '')) throw new SyntaxError('csv');
    } catch (error) {
      const reason = role === 'invoices' && error instanceof SyntaxError ? 'El archivo no parece un CSV con cabecera.' : inputProblem(error);
      throw new AppError(422, reason);
    }
    store.set(sourceKey(id, role), { text, fileName, storedAt: now() } satisfies StoredSource);
    touch(id);
    return viewOf(engagement);
  });

  app.delete(VERIFICA_API + '/engagements/:id/sources/:role', async request => {
    const { id, role } = roleParam.parse(request.params);
    const engagement = find(id);
    store.db.prepare('DELETE FROM meta WHERE key=?').run(sourceKey(id, role));
    touch(id);
    return viewOf(engagement);
  });

  // Corte 2 · la sala limpia: misma entrada y mismo motor que el script. Si la barrera encuentra un texto del CRM en el
  // informe, no se emite nada y no se dice qué texto era (el script lo enseña solo en el equipo, con --show-leaks).
  app.post(VERIFICA_API + '/engagements/:id/clean-room', async (request): Promise<IssueResult> => {
    const { id } = idParam.parse(request.params);
    const engagement = find(id);
    const read = readEngagement(engagement, sources(id));
    if (read.missing.length || !read.inputs.latest) throw new AppError(409, 'Faltan fuentes para la sala limpia: ' + read.missing.map(item => item.replace(/\.$/, '').toLowerCase()).join('; ') + '.');
    const input = cleanRoomInput({ previous: read.inputs.previous, latest: read.inputs.latest, invoices: read.inputs.invoices, declarations: read.inputs.declarations });
    const issuedSources = fingerprints(read);
    let result;
    try {
      result = await runCleanRoom(input, options.cleanRoom);
    } catch (error) {
      if (error instanceof CleanRoomError) throw new AppError(422, error.message);
      throw error;
    }
    const { report, custody, key } = result;
    const stored: StoredIssue = {
      issuedAt: now(), reportJson: reportToJson(report), custodyJson: JSON.stringify(custody) + '\n',
      reportFingerprint: report.fingerprint, custodyFingerprint: custodyFingerprint(custody),
      findings: report.findings.length, alarms: report.findings.filter(f => f.alarm).length, sources: issuedSources,
    };
    return store.transaction(() => {
      const current = engagementView(find(id), sources(id));
      if (current.missing.length || !sameSources(issuedSources, fingerprints(current))) {
        throw new AppError(409, 'Las fuentes cambiaron mientras se emitía el informe. Revisa las fuentes y vuelve a emitirlo.');
      }
      store.set(issueKey(id), stored);
      touch(id);
      return { ...summary(stored, current), key };
    });
  });

  // El informe (para el comprador) y la copia custodiada (para quien la guarda), tal como se emitieron. La llave no.
  app.get(VERIFICA_API + '/engagements/:id/issue/:file', async (request, reply) => {
    const { id, file } = fileParam.parse(request.params);
    find(id);
    const stored = store.get<StoredIssue | null>(issueKey(id), null);
    if (!stored) throw new AppError(404, 'Este encargo todavía no tiene informe emitido.');
    reply.type('application/json; charset=utf-8').header('cache-control', 'no-store');
    return file === 'report' ? stored.reportJson : stored.custodyJson;
  });

  // Corte 3 · leer HubSpot. Todo lo que puede parar la lectura se comprueba antes de la primera petición: la forma de la
  // credencial, la confirmación del modo de pruebas y, en modo cliente, la autorización firmada (portal, fechas de Madrid,
  // alcance y huella del documento). La lectura sigue en segundo plano y la pantalla pregunta por su estado.
  app.post(VERIFICA_API + '/engagements/:id/read', async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const body = readBody.parse(request.body);
    find(id);
    if (jobs.get(id)?.state === 'running') throw new AppError(409, 'Ya hay una lectura en marcha para este encargo.');
    const problem = credentialProblem(body.token);
    if (problem) throw new AppError(422, problem);
    let authorization: ReadAuthorization | null = null;
    if (body.mode === 'test') {
      if (body.confirmFullRead !== true) throw new AppError(422, 'Confirma que autorizas leer el portal de pruebas entero: oportunidades con historial, empresas, contactos y comerciales.');
    } else {
      if (!body.authorization || !body.documentBase64) throw new AppError(422, 'El modo cliente necesita la autorización (autorizacion.json) y el documento firmado.');
      try {
        authorization = parseReadAuthorization(JSON.parse(body.authorization));
        const today = madridDay(options.hubspotNow?.() ?? new Date());
        checkReadAuthorization(authorization, { portalId: body.portalId, today, documentSha256: sha256Hex(Buffer.from(body.documentBase64, 'base64')) });
      } catch (error) {
        if (error instanceof ReadAuthorizationError) throw new AppError(422, 'Autorización: ' + error.message + ' No se ha hecho ninguna petición.');
        if (error instanceof SyntaxError) throw new AppError(422, 'La autorización no es JSON válido. No se ha hecho ninguna petición.');
        throw error;
      }
    }
    const job: ReadJob = { state: 'running', mode: body.mode, startedAt: now(), progress: [] };
    jobs.set(id, job);
    const token = body.token;
    void readWithRecord({
      token, portalId: body.portalId, mode: body.mode, authorization, fetch: options.hubspotFetch ?? fetch, now: options.hubspotNow,
      progress: message => { job.progress.push(message); },
    }).then(({ reading, captureText, record }) => {
      const role: 'previous' | 'latest' = body.target === 'previous' ? 'previous' : 'latest';
      const label = (body.mode === 'client' ? 'HubSpot ' : 'HubSpot de pruebas ') + reading.account.portalId + ' · ' + reading.capture.capturedAt.slice(0, 10) + '.json';
      try {
        store.transaction(() => {
          if (body.target === 'rotate') {
            const current = store.get<StoredSource | null>(sourceKey(id, 'latest'), null);
            if (current) store.set(sourceKey(id, 'previous'), current);
          }
          store.set(sourceKey(id, role), { text: captureText, fileName: label, storedAt: now() } satisfies StoredSource);
          if (record) {
            store.set(recordKey(id, record.captureId), recordToText(record));
            const summaryRow: RecordSummary = { captureId: record.captureId, fingerprint: record.fingerprint, finishedAt: record.finishedAt, portalId: record.portalId, engagement: record.engagement };
            store.set(recordsKey(id), [...store.get<RecordSummary[]>(recordsKey(id), []).filter(r => r.captureId !== record.captureId), summaryRow]);
          }
          touch(id);
        });
      } catch {
        Object.assign(job, { state: 'failed', finishedAt: now(), error: 'No se pudo guardar la lectura completa. Vuelve a intentarlo.' } satisfies Partial<ReadJob>);
        return;
      }
      const { capture } = reading;
      Object.assign(job, {
        state: 'done', finishedAt: now(),
        result: { captureId: capture.id, role, counts: { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length }, historyAvailable: capture.historyAvailable, requests: reading.requests, recordFingerprint: record?.fingerprint ?? null },
      } satisfies Partial<ReadJob>);
    }, error => {
      Object.assign(job, { state: 'failed', finishedAt: now(), error: error instanceof VerificaReadError ? 'Lectura detenida: ' + error.message : 'La lectura terminó con un error inesperado; no se muestra el detalle por si contuviera datos de la petición.' } satisfies Partial<ReadJob>);
    });
    reply.code(202);
    return job;
  });

  app.get(VERIFICA_API + '/engagements/:id/read', async request => {
    const { id } = idParam.parse(request.params);
    find(id);
    return { job: jobs.get(id) ?? null };
  });

  app.get(VERIFICA_API + '/engagements/:id/records', async request => {
    const { id } = idParam.parse(request.params);
    find(id);
    return { records: store.get<RecordSummary[]>(recordsKey(id), []) };
  });

  app.get(VERIFICA_API + '/engagements/:id/records/:captureId', async (request, reply) => {
    const { id, captureId } = recordParam.parse(request.params);
    find(id);
    const text = store.get<string | null>(recordKey(id, captureId), null);
    if (!text) throw new AppError(404, 'No hay acta de esa captura.');
    reply.type('application/json; charset=utf-8').header('cache-control', 'no-store');
    return text;
  });

  return registerWatchApi(app, store, {
    name: id => find(id).name,
    signing: (id, role) => {
      const source = store.get<StoredSource | null>(sourceKey(id, role), null);
      if (!source) return null;
      const capture = parseCaptureText(source.text, 'La captura');
      const rawRecord = store.get<string | null>(recordKey(id, capture.id), null);
      return rawRecord ? { captureText: source.text, record: JSON.parse(rawRecord) as ReadRecord } : null;
    },
  }, { now: options.hubspotNow, fetcher: options.hubspotFetch, intervalMs: options.watchIntervalMs });
}

/** Lo que entra en la sala limpia para un encargo. No se publica por HTTP. */
export function engagementInputs(store: Store, id: string) {
  const engagement = store.get<Engagement[]>(LIST_KEY, []).find(item => item.id === id);
  if (!engagement) throw new AppError(404, 'No existe ese encargo.');
  const stored: StoredSources = Object.fromEntries(ENGAGEMENT_ROLES.flatMap(role => {
    const value = store.get<StoredSource | null>(sourceKey(id, role), null);
    return value ? [[role, value]] : [];
  }));
  return readEngagement(engagement, stored);
}
