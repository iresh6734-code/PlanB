import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityNameSchema } from '../shared/model.js';
import { AppError, type Store } from './store.js';

// T5 «Vistas guardadas en la copia»: solo nombres y filtros (búsqueda, filtro rápido, orden y vista inteligente), nunca datos
// de registros. Viajan con la copia (copias de seguridad, restauraciones y el otro navegador) en lugar de quedarse en uno.
const LIBRARY_KEY = 'savedViews';
export const SAVED_VIEWS_LIMIT = 8;
const ViewSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(40),
  query: z.string().max(160),
  pick: z.string().min(1).max(100).nullable(),
  sort: z.object({ key: z.string().min(1).max(100), dir: z.union([z.literal(1), z.literal(-1)]) }).strict().nullable(),
  smart: z.string().min(1).max(40).nullable(),
}).strict();
const ListSchema = z.array(ViewSchema).max(SAVED_VIEWS_LIMIT);
type View = z.infer<typeof ViewSchema>;
const params = z.object({ entity: EntityNameSchema }).strict();
const body = z.object({ views: ListSchema }).strict();

function readLibrary(store: Store): Record<string, unknown> {
  const raw = store.get<unknown>(LIBRARY_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
/** `stored: false` si esta copia aún no guardó vistas de ese tipo (o lo guardado no es legible): el navegador puede traer las suyas. */
function readViews(store: Store, entity: string): { views: View[]; stored: boolean } {
  const library = readLibrary(store);
  if (!Object.hasOwn(library, entity)) return { views: [], stored: false };
  const parsed = ListSchema.safeParse(library[entity]);
  return parsed.success ? { views: parsed.data, stored: true } : { views: [], stored: false };
}
function repeated(views: View[]) {
  const ids = new Set(views.map(view => view.id)), names = new Set(views.map(view => view.name.toLocaleLowerCase('es')));
  return ids.size !== views.length || names.size !== views.length;
}

export function registerSavedViews(app: FastifyInstance, store: Store) {
  app.get('/api/v2/views/:entity', async request => readViews(store, params.parse(request.params).entity));
  app.post('/api/v2/views/:entity', async request => {
    const { entity } = params.parse(request.params), { views } = body.parse(request.body);
    if (repeated(views)) throw new AppError(422, 'Dos vistas no pueden tener el mismo nombre.');
    const clean = views.map(view => ({ ...view, query: view.query.trim() }));
    store.transaction(() => { store.set(LIBRARY_KEY, { ...readLibrary(store), [entity]: clean }); });
    return { views: clean, stored: true };
  });
}
