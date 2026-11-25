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
import { ENGAGEMENT_LIMITS, ENGAGEMENT_ROLES, engagementView, inputProblem, readEngagement, sourceSizeProblem, type Engagement, type EngagementRole, type EngagementView, type IssueResult, type IssueSummary, type StoredSource, type StoredSources } from '../../shared/verifica/engagement.js';
import { cleanRoomInput, parseCaptureText, parseDeclarationsText } from '../../shared/verifica/inputs.js';
import { reportToJson } from '../../shared/verifica/report.js';
import { sha256Hex } from '../../shared/sha256.js';
import { VerificaReadError } from '../../shared/verifica/hubspot.js';
import { checkReadAuthorization, madridDay, parseReadAuthorization, ReadAuthorizationError, type ReadAuthorization, type ReadRecord } from '../../shared/verifica/read-authorization.js';
import { credentialProblem, readWithRecord, recordToText } from './hubspot-read.js';
import { appendLedger, captureInputFingerprint, recordRefs, replacedRef, ROLE_KIND, sourceRefs } from './expediente-store.js';
import type { LedgerEventInput } from '../../shared/verifica/expediente.js';
import { registerWatchApi } from './watch-api.js';
import { registerExpedienteApi, rememberIssue } from './expediente-api.js';
import { READ_LIMITS, type ReadJob, type RecordSummary } from '../../shared/verifica/engagement.js';
export type { ReadJob, RecordSummary } from '../../shared/verifica/engagement.js';
import { AppError, type Store } from '../store.js';

export const VERIFICA_API = '/api/verifica';
const LIST_KEY = 'verifica:engagements';
const sourceKey = (id: string, role: EngagementRole) => 'verifica:source:' + id + ':' + role;
const issueKey = (id: string) => 'verifica:issue:' + id;
/** La ficha de las fuentes (estado, huella y resumen de cada una), calculada al escribir y guardada (Mega Plan 3, fase 2). */
const viewKey = (id: string) => 'verifica:view:' + id;
/** El estado de la última lectura de HubSpot, guardado al empezar y al terminar para sobrevivir a un reinicio. */
const jobKey = (id: string) => 'verifica:readjob:' + id;
const INTERRUPTED = 'La lectura se cortó porque Plan B se cerró antes de registrar su resultado. Comprueba la última captura antes de repetirla.';
type SourcesView = Pick<EngagementView, 'sources' | 'missing'>;
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
// El tamaño del texto se mide en bytes UTF-8 después de leer el cuerpo, para dar el aviso común. El cuerpo admite el doble
// porque el JSON escapa comillas y saltos de línea; más allá, Fastify lo corta antes de leerlo.
const SOURCE_BODY_LIMIT = 2 * ENGAGEMENT_LIMITS.sourceBytes + 64 * 1024;
const sourceBody = z.object({
  text: z.string().min(1),
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
  /** Solo para pruebas: un máximo común de fuente más pequeño, sin fabricar 48 MB. */
  sourceBytes?: number;
}

export function registerVerificaEngagements(app: FastifyInstance, store: Store, options: VerificaEngagementOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const sourceBytes = options.sourceBytes ?? ENGAGEMENT_LIMITS.sourceBytes;
  const jobs = new Map<string, ReadJob>();
  /** Guarda el estado de la lectura tal como lo ve la pantalla (sin la credencial, que nunca está en `job`). */
  const persistJob = (id: string, job: ReadJob) => { try { store.set(jobKey(id), job); } catch { /* la memoria sigue mandando */ } };
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
  /** Una lectura en marcha guardará su captura al terminar: mientras, las capturas no se tocan a mano. */
  const capturesFree = (id: string, role: EngagementRole) => {
    if ((role === 'previous' || role === 'latest') && jobs.get(id)?.state === 'running') throw new AppError(409, 'Hay una lectura de HubSpot en marcha para este encargo. Espera a que termine antes de cambiar las capturas.');
  };
  // Mega Plan 3, fase 2: reinterpretar una captura de 45 MB costaba casi 5 s en cada vista, y al emitir se hacía con la base
  // bloqueada. La ficha de las fuentes se calcula una vez, en la misma transacción que cada escritura, y se guarda; las
  // vistas solo la leen. Si falta (datos de antes de este cambio), se calcula y se guarda la primera vez.
  const refreshView = (engagement: Engagement): SourcesView => {
    const { sources: states, missing } = engagementView(engagement, sources(engagement.id));
    const view: SourcesView = { sources: states, missing };
    store.set(viewKey(engagement.id), view);
    return view;
  };
  const sourcesView = (engagement: Engagement): SourcesView => store.get<SourcesView | null>(viewKey(engagement.id), null)
    ?? (store.db.isTransaction ? refreshView(engagement) : store.transaction(() => refreshView(engagement)));
  /** La vista pública de un encargo, con su última emisión si la hay. */
  const viewOf = (engagement: Engagement): EngagementView => {
    const view: EngagementView = { engagement, ...sourcesView(engagement) };
    const stored = store.get<StoredIssue | null>(issueKey(engagement.id), null);
    return { ...view, issue: stored ? summary(stored, view) : null };
  };

  // Una lectura que seguía «en marcha» al arrancar es que Plan B se cerró a mitad: queda constancia y se puede repetir.
  for (const engagement of list()) {
    const left = store.get<ReadJob | null>(jobKey(engagement.id), null);
    if (left?.state === 'running') persistJob(engagement.id, { ...left, state: 'failed', finishedAt: now(), error: INTERRUPTED });
  }

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

  app.put(VERIFICA_API + '/engagements/:id/sources/:role', { bodyLimit: SOURCE_BODY_LIMIT }, async request => {
    const { id, role } = roleParam.parse(request.params);
    const { text, fileName } = sourceBody.parse(request.body);
    const engagement = find(id);
    capturesFree(id, role);
    const tooLarge = sourceSizeProblem('«' + fileName + '»', Buffer.byteLength(text, 'utf8'), sourceBytes);
    if (tooLarge) throw new AppError(413, tooLarge);
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
    return store.transaction(() => {
      const replaced = store.get<StoredSource | null>(sourceKey(id, role), null);
      const at = now();
      store.set(sourceKey(id, role), { text, fileName, storedAt: at } satisfies StoredSource);
      touch(id);
      refreshView(engagement);
      const view = viewOf(engagement), state = view.sources[role];
      appendLedger(store, id, at, [{ event: 'source-stored', data: { role, origin: 'file' }, refs: [
        ...sourceRefs(role, text, state.status === 'ok' ? state.fingerprint : null),
        ...(replaced && replaced.text !== text ? [replacedRef(role, replaced.text)] : []),
      ] }]);
      return view;
    });
  });

  app.delete(VERIFICA_API + '/engagements/:id/sources/:role', async request => {
    const { id, role } = roleParam.parse(request.params);
    const engagement = find(id);
    capturesFree(id, role);
    return store.transaction(() => {
      const removed = store.get<StoredSource | null>(sourceKey(id, role), null);
      store.db.prepare('DELETE FROM meta WHERE key=?').run(sourceKey(id, role));
      touch(id);
      refreshView(engagement);
      if (removed) appendLedger(store, id, now(), [{ event: 'source-removed', data: { role }, refs: [replacedRef(role, removed.text)] }]);
      return viewOf(engagement);
    });
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
      // La ficha guardada se rehace en cada escritura de fuente, también en esta misma transacción: no hace falta releerlas.
      const current: EngagementView = { engagement: find(id), ...sourcesView(find(id)) };
      if (current.missing.length || !sameSources(issuedSources, fingerprints(current))) {
        throw new AppError(409, 'Las fuentes cambiaron mientras se emitía el informe. Revisa las fuentes y vuelve a emitirlo.');
      }
      store.set(issueKey(id), stored);
      touch(id);
      const added = appendLedger(store, id, stored.issuedAt, [{ event: 'report-issued', refs: [
        ...ENGAGEMENT_ROLES.flatMap(role => issuedSources[role] ? [{ kind: ROLE_KIND[role], role, method: 'verifica-input-v1' as const, fingerprint: issuedSources[role]! }] : []),
        { kind: 'report', method: 'planb-verifica-report-v1', fingerprint: stored.reportFingerprint },
        { kind: 'custody', method: 'planb-verifica-custody-v1', fingerprint: stored.custodyFingerprint },
      ] }]);
      // Mega Plan 3: cada emisión se conserva para compararla y guarda la cabeza del expediente de ese momento.
      const head = added.at(-1);
      rememberIssue(store, id, { issuedAt: stored.issuedAt, reportFingerprint: stored.reportFingerprint, reportJson: stored.reportJson,
        findings: stored.findings, alarms: stored.alarms, ledgerHead: head ? { sequence: head.sequence, fingerprint: head.fingerprint } : null });
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
    store.set(jobKey(id), job);
    jobs.set(id, job);
    const token = body.token;
    void readWithRecord({
      token, portalId: body.portalId, mode: body.mode, authorization, fetch: options.hubspotFetch ?? fetch, now: options.hubspotNow,
      maxCaptureBytes: sourceBytes, progress: message => { job.progress.push(message); },
    }).then(({ reading, captureText, record }) => {
      const role: 'previous' | 'latest' = body.target === 'previous' ? 'previous' : 'latest';
      const { capture } = reading;
      const label = (body.mode === 'client' ? 'HubSpot ' : 'HubSpot de pruebas ') + reading.account.portalId + ' · ' + capture.capturedAt.slice(0, 10) + '.json';
      const finished: ReadJob = { ...job, state: 'done', finishedAt: now(), result: { captureId: capture.id, role,
        counts: { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length },
        historyAvailable: capture.historyAvailable, requests: reading.requests, recordFingerprint: record?.fingerprint ?? null } };
      try {
        store.transaction(() => {
          const at = now(), events: LedgerEventInput[] = [];
          const replaced = store.get<StoredSource | null>(sourceKey(id, role), null);
          if (body.target === 'rotate') {
            const current = store.get<StoredSource | null>(sourceKey(id, 'latest'), null);
            if (current) {
              const old = store.get<StoredSource | null>(sourceKey(id, 'previous'), null);
              store.set(sourceKey(id, 'previous'), current);
              events.push({ event: 'source-stored', data: { role: 'previous', origin: 'rotate' }, refs: [
                ...sourceRefs('previous', current.text, captureInputFingerprint(current.text)),
                ...(old && old.text !== current.text ? [replacedRef('previous', old.text)] : []),
              ] });
            }
          }
          store.set(sourceKey(id, role), { text: captureText, fileName: label, storedAt: at } satisfies StoredSource);
          if (record) {
            store.set(recordKey(id, record.captureId), recordToText(record));
            const summaryRow: RecordSummary = { captureId: record.captureId, fingerprint: record.fingerprint, finishedAt: record.finishedAt, portalId: record.portalId, engagement: record.engagement };
            store.set(recordsKey(id), [...store.get<RecordSummary[]>(recordsKey(id), []).filter(r => r.captureId !== record.captureId), summaryRow]);
          }
          events.push({ event: 'source-stored', data: { role, origin: 'hubspot-read' }, refs: [
            ...sourceRefs(role, captureText, captureInputFingerprint(captureText)),
            ...(record ? recordRefs(record) : []),
            ...(replaced && replaced.text !== captureText ? [replacedRef(role, replaced.text)] : []),
          ] });
          appendLedger(store, id, at, events);
          touch(id);
          refreshView(find(id));
          store.set(jobKey(id), finished);
        });
      } catch {
        Object.assign(job, { state: 'failed', finishedAt: now(), error: 'No se pudo guardar la lectura completa. Vuelve a intentarlo.' } satisfies Partial<ReadJob>);
        persistJob(id, job);
        return;
      }
      jobs.set(id, finished);
    }, error => {
      Object.assign(job, { state: 'failed', finishedAt: now(), error: error instanceof VerificaReadError ? 'Lectura detenida: ' + error.message : 'La lectura terminó con un error inesperado; no se muestra el detalle por si contuviera datos de la petición.' } satisfies Partial<ReadJob>);
      persistJob(id, job);
    });
    reply.code(202);
    return job;
  });

  app.get(VERIFICA_API + '/engagements/:id/read', async request => {
    const { id } = idParam.parse(request.params);
    find(id);
    return { job: jobs.get(id) ?? store.get<ReadJob | null>(jobKey(id), null) };
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

  const timer = registerWatchApi(app, store, {
    name: id => find(id).name,
    signing: (id, role) => {
      const source = store.get<StoredSource | null>(sourceKey(id, role), null);
      if (!source) return null;
      const capture = parseCaptureText(source.text, 'La captura');
      const rawRecord = store.get<string | null>(recordKey(id, capture.id), null);
      return rawRecord ? { captureText: source.text, record: JSON.parse(rawRecord) as ReadRecord } : null;
    },
  }, { now: options.hubspotNow, fetcher: options.hubspotFetch, intervalMs: options.watchIntervalMs, maxCaptureBytes: sourceBytes });
  // Mega Plan 3: expediente, versiones y comparación, preguntas, paquete del comprador y cierre (server/verifica/expediente-api.ts).
  registerExpedienteApi(app, store, {
    now, find, timer,
    remove: id => store.set(LIST_KEY, list().filter(item => item.id !== id)),
    forgetRead: id => { jobs.delete(id); },
    inputs: id => engagementInputs(store, id).inputs,
    status: viewOf,
    readRunning: id => jobs.get(id)?.state === 'running',
  });
  return timer;
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
