// Plan B Verifica · encargos en el servidor local (fase D, corte 1 del mega plan 2, 24/11/2026).
// Crear un encargo y guardarle sus fuentes (dos capturas, el libro de facturas y las cifras declaradas) desde la pantalla,
// en vez de pasarlas a los scripts. Se guardan cifradas en el almacén que ya existe, en su tabla meta, sin tocar el
// esquema. Una fuente que no sirve no se guarda. Las respuestas solo describen cada fuente (estado, huella, resumen):
// nunca devuelven su texto. Hereda las guardas del servidor local (sesión, host y origen).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ENGAGEMENT_LIMITS, ENGAGEMENT_ROLES, engagementView, inputProblem, readEngagement, type Engagement, type EngagementRole, type StoredSource, type StoredSources } from '../../shared/verifica/engagement.js';
import { parseCaptureText, parseDeclarationsText } from '../../shared/verifica/inputs.js';
import { AppError, type Store } from '../store.js';

export const VERIFICA_API = '/api/verifica';
const LIST_KEY = 'verifica:engagements';
const sourceKey = (id: string, role: EngagementRole) => 'verifica:source:' + id + ':' + role;

const idParam = z.object({ id: z.uuid() }).strict();
const roleParam = z.object({ id: z.uuid(), role: z.enum(ENGAGEMENT_ROLES) }).strict();
const createBody = z.object({ name: z.string().trim().min(1).max(ENGAGEMENT_LIMITS.nameChars) }).strict();
const sourceBody = z.object({
  text: z.string().min(1).max(ENGAGEMENT_LIMITS.sourceBytes),
  fileName: z.string().trim().min(1).max(ENGAGEMENT_LIMITS.fileNameChars),
}).strict();

export function registerVerificaEngagements(app: FastifyInstance, store: Store, options: { now?: () => string } = {}) {
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

  // La página de Verifica pregunta esto para saber si la sirve el servidor local y puede ofrecer los pasos 1 a 3.
  app.get(VERIFICA_API + '/health', async () => ({ ok: true, engagements: true }));

  app.get(VERIFICA_API + '/engagements', async () => ({
    engagements: list().map(engagement => {
      const view = engagementView(engagement, sources(engagement.id));
      return { ...engagement, ready: view.missing.length === 0, stored: ENGAGEMENT_ROLES.filter(role => view.sources[role].status !== 'missing').length };
    }),
  }));

  app.post(VERIFICA_API + '/engagements', async (request, reply) => {
    const { name } = createBody.parse(request.body);
    const current = list();
    if (current.length >= ENGAGEMENT_LIMITS.engagements) throw new AppError(409, 'Hay demasiados encargos en este equipo.');
    const at = now(), engagement: Engagement = { id: randomUUID(), name, createdAt: at, updatedAt: at };
    store.set(LIST_KEY, [...current, engagement]);
    reply.code(201);
    return engagementView(engagement, {});
  });

  app.get(VERIFICA_API + '/engagements/:id', async request => {
    const { id } = idParam.parse(request.params);
    return engagementView(find(id), sources(id));
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
    return engagementView(engagement, sources(id));
  });

  app.delete(VERIFICA_API + '/engagements/:id/sources/:role', async request => {
    const { id, role } = roleParam.parse(request.params);
    const engagement = find(id);
    store.db.prepare('DELETE FROM meta WHERE key=?').run(sourceKey(id, role));
    touch(id);
    return engagementView(engagement, sources(id));
  });
}

/** Lo que entra en la sala limpia para un encargo (corte 2). No se publica por HTTP. */
export function engagementInputs(store: Store, id: string) {
  const engagement = store.get<Engagement[]>(LIST_KEY, []).find(item => item.id === id);
  if (!engagement) throw new AppError(404, 'No existe ese encargo.');
  const stored: StoredSources = Object.fromEntries(ENGAGEMENT_ROLES.flatMap(role => {
    const value = store.get<StoredSource | null>(sourceKey(id, role), null);
    return value ? [[role, value]] : [];
  }));
  return readEngagement(engagement, stored);
}
