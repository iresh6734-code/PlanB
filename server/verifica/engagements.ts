// Plan B Verifica · encargos en el servidor local (fase D del mega plan 2; corte 1 el 24/11/2026, corte 2 el mismo día).
// Corte 1: crear un encargo y guardarle sus fuentes (dos capturas, el libro de facturas y las cifras declaradas) desde la
// pantalla. Corte 2: la sala limpia con un botón, que emite el informe, la copia custodiada y su llave con el mismo motor
// y la misma entrada que scripts/verifica-sala-limpia.ts. Todo se guarda cifrado en el almacén que ya existe, en su tabla
// meta, sin tocar el esquema. Una fuente que no sirve no se guarda. Las respuestas describen cada fuente (estado, huella,
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
import { AppError, type Store } from '../store.js';

export const VERIFICA_API = '/api/verifica';
const LIST_KEY = 'verifica:engagements';
const sourceKey = (id: string, role: EngagementRole) => 'verifica:source:' + id + ':' + role;
const issueKey = (id: string) => 'verifica:issue:' + id;

/** Lo que se guarda de una emisión: el informe y la copia tal como se descargan, y las huellas de las fuentes de las
 *  que salieron (para saber si quedó desfasada). Nunca la llave. */
interface StoredIssue { issuedAt: string; reportJson: string; custodyJson: string; reportFingerprint: string; custodyFingerprint: string; findings: number; alarms: number; sources: Partial<Record<EngagementRole, string>> }

const idParam = z.object({ id: z.uuid() }).strict();
const roleParam = z.object({ id: z.uuid(), role: z.enum(ENGAGEMENT_ROLES) }).strict();
const fileParam = z.object({ id: z.uuid(), file: z.enum(['report', 'custody']) }).strict();
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
}

export function registerVerificaEngagements(app: FastifyInstance, store: Store, options: VerificaEngagementOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
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
      findings: report.findings.length, alarms: report.findings.filter(f => f.alarm).length, sources: fingerprints(read),
    };
    store.set(issueKey(id), stored);
    touch(id);
    return { ...summary(stored, read), key };
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
