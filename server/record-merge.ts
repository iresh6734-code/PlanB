import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EntityNameSchema, RecordSchema, type AppSpec, type CrmRecord, type EntityName, type FieldValue } from '../shared/model.js';
import { MERGE_TAKE_LIMIT, fingerprint, mergeFields, planMerge, recordLabel } from '../shared/merge-plan.js';
import { AppError, type Store } from './store.js';

// F8 «Fusionar duplicados». La principal toma los valores elegidos del duplicado con un guardado normal (que vuelve a HubSpot
// solo por la devolución revisada). El duplicado NO se borra ni se modifica: queda «apartado» en un registro propio, para
// fusionarlo a mano en HubSpot. Se deshace mientras la principal conserve lo que trajo la fusión.
const LEDGER_KEY = 'mergeLedger';
export const MERGE_LEDGER_LIMIT = 200;
const valuesSchema = RecordSchema.shape.values;
const EntrySchema = z.object({
  id: z.string().min(1).max(64), at: z.string().min(1).max(40), copy: z.string().min(1).max(64), entity: EntityNameSchema,
  keeperId: z.string().min(1).max(400), duplicateId: z.string().min(1).max(400), before: valuesSchema, after: valuesSchema,
}).strict();
type Entry = z.infer<typeof EntrySchema>;

const previewQuery = z.object({ entity: EntityNameSchema, keeper: z.string().min(1).max(400), duplicate: z.string().min(1).max(400) }).strict();
const mergeBody = z.object({
  entity: EntityNameSchema, keeperId: z.string().min(1).max(400), duplicateId: z.string().min(1).max(400),
  take: z.array(z.string().min(1).max(100)).max(MERGE_TAKE_LIMIT),
  seen: z.object({ keeper: z.string().min(1).max(40), duplicate: z.string().min(1).max(40) }).strict(),
}).strict();
const entryParams = z.object({ id: z.string().min(1).max(64) }).strict();
const STALE = 'Alguna de las dos fichas cambió mientras elegías. Vuelve a abrir la fusión.';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function readLedger(store: Store): Entry[] {
  const parsed = z.array(EntrySchema).safeParse(store.get<unknown>(LEDGER_KEY, []));
  return parsed.success ? parsed.data : [];
}
/** Entradas que siguen valiendo: de esta copia (misma época) y con las dos fichas presentes. Una importación sin el duplicado las cierra solas. */
function liveLedger(store: Store): Entry[] {
  const copy = store.copyEpoch();
  return readLedger(store).filter(entry => entry.copy === copy && store.record(entry.entity, entry.keeperId) && store.record(entry.entity, entry.duplicateId));
}
const isSetAside = (ledger: Entry[], entity: string, id: string) => ledger.some(entry => entry.entity === entity && entry.duplicateId === id);

function pair(store: Store, entity: CrmRecord['entity'], keeperId: string, duplicateId: string) {
  if (!store.ready || !store.spec) throw new AppError(409, 'Revisa y activa primero la aplicación.');
  if (keeperId === duplicateId) throw new AppError(422, 'Elige dos fichas distintas.');
  const keeper = store.record(entity, keeperId), duplicate = store.record(entity, duplicateId);
  if (!keeper || !duplicate) throw new AppError(404, 'No se encontró alguna de las dos fichas.');
  const ledger = liveLedger(store);
  if (isSetAside(ledger, entity, keeperId) || isSetAside(ledger, entity, duplicateId)) throw new AppError(409, 'Una de las dos fichas ya está apartada como duplicado.', { code: 'ALREADY_SET_ASIDE' });
  return { spec: store.spec, keeper, duplicate, ledger };
}

function view(store: Store, entry: Entry) {
  const spec = store.spec, keeper = store.record(entry.entity, entry.keeperId), duplicate = store.record(entry.entity, entry.duplicateId);
  const fields = spec?.entities.find(item => item.id === entry.entity)?.fields ?? [];
  return {
    id: entry.id, at: entry.at, entity: entry.entity, keeperId: entry.keeperId, duplicateId: entry.duplicateId,
    keeperLabel: spec && keeper ? recordLabel(spec, keeper) : entry.keeperId,
    duplicateLabel: spec && duplicate ? recordLabel(spec, duplicate) : entry.duplicateId,
    fields: Object.keys(entry.after).map(key => fields.find(field => field.key === key)?.label ?? key),
  };
}

/** Texto legible de un valor: etiqueta de la opción, nombre de la ficha relacionada, Sí/No. */
function display(store: Store, spec: AppSpec, entity: EntityName, key: string, value: FieldValue): string {
  if (value === null || value === '') return '';
  const field = spec.entities.find(item => item.id === entity)?.fields.find(item => item.key === key);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (field?.type === 'enum') return field.options.find(option => option.id === value)?.label ?? String(value);
  if (field?.type === 'multiselect') return String(value).split(';').map(id => field.options.find(option => option.id === id)?.label ?? id).join(', ');
  if (field?.type === 'reference' && field.referenceEntity) { const target = store.record(field.referenceEntity, String(value)); return target ? recordLabel(spec, target) : String(value); }
  return String(value);
}

export function registerRecordMerge(app: FastifyInstance, store: Store) {
  app.get('/api/v2/records/merge-preview', async request => {
    const query = previewQuery.parse(request.query);
    const { spec, keeper, duplicate } = pair(store, query.entity, query.keeper, query.duplicate);
    return {
      entity: query.entity,
      keeper: { id: keeper.id, label: recordLabel(spec, keeper) }, duplicate: { id: duplicate.id, label: recordLabel(spec, duplicate) },
      fields: mergeFields(spec, keeper, duplicate).map(choice => ({
        ...choice, keeperText: display(store, spec, query.entity, choice.key, choice.keeper), duplicateText: display(store, spec, query.entity, choice.key, choice.duplicate),
      })),
      seen: { keeper: fingerprint(keeper.values), duplicate: fingerprint(duplicate.values) },
    };
  });

  app.get('/api/v2/records/merges', async () => ({ merges: liveLedger(store).map(entry => view(store, entry)) }));

  app.post('/api/v2/records/merge', async request => {
    const body = mergeBody.parse(request.body ?? {});
    const { spec, keeper, duplicate, ledger } = pair(store, body.entity, body.keeperId, body.duplicateId);
    if (fingerprint(keeper.values) !== body.seen.keeper || fingerprint(duplicate.values) !== body.seen.duplicate) throw new AppError(409, STALE, { code: 'STALE' });
    const plan = planMerge(spec, keeper, duplicate, body.take);
    if (!plan.ok) throw new AppError(422, plan.reason, plan.field ? { [plan.field]: plan.reason } : undefined);
    if (ledger.length >= MERGE_LEDGER_LIMIT) throw new AppError(409, 'Hay demasiados duplicados apartados. Fusiónalos en HubSpot y vuelve a importar antes de seguir.');
    const entry: Entry = { id: randomUUID(), at: new Date().toISOString(), copy: store.copyEpoch(), entity: body.entity, keeperId: keeper.id, duplicateId: duplicate.id, before: plan.before, after: plan.values };
    // Todo dentro de la misma transacción que escribe: las fichas siguen como se vieron y el duplicado no se apartó entretanto.
    const commit = () => {
      const nowKeeper = store.record(body.entity, keeper.id), nowDuplicate = store.record(body.entity, duplicate.id);
      if (!nowKeeper || !nowDuplicate || fingerprint(nowKeeper.values) !== body.seen.keeper || fingerprint(nowDuplicate.values) !== body.seen.duplicate) throw new AppError(409, STALE, { code: 'STALE' });
      const live = liveLedger(store);
      if (isSetAside(live, body.entity, keeper.id) || isSetAside(live, body.entity, duplicate.id)) throw new AppError(409, 'Una de las dos fichas ya está apartada como duplicado.', { code: 'ALREADY_SET_ASIDE' });
      store.set(LEDGER_KEY, [...live, entry]);
    };
    let change: { id: number; at: string; copy: string } | null = null;
    const record = Object.keys(plan.values).length
      ? store.saveRecord(body.entity, plan.values, keeper.id, { guard: commit, onChange: value => { change = value; } })
      : (store.transaction(commit), keeper);
    return { merge: view(store, entry), record, change };
  });

  app.post('/api/v2/records/merges/:id/undo', async request => {
    const { id } = entryParams.parse(request.params);
    const entry = liveLedger(store).find(item => item.id === id);
    if (!entry) throw new AppError(404, 'Esa fusión ya no está en la lista.');
    const current = store.record(entry.entity, entry.keeperId);
    const intact = (record: CrmRecord | null) => !!record && Object.entries(entry.after).every(([key, value]) => same(record.values[key] ?? null, value));
    if (!intact(current)) throw new AppError(409, 'La ficha principal cambió después de fusionar; revísala a mano o deja de apartar el duplicado.', { code: 'RECORD_CHANGED' });
    const release = () => {
      const live = liveLedger(store);
      if (!live.some(item => item.id === id)) throw new AppError(404, 'Esa fusión ya no está en la lista.');
      if (!intact(store.record(entry.entity, entry.keeperId))) throw new AppError(409, 'La ficha principal cambió después de fusionar; revísala a mano o deja de apartar el duplicado.', { code: 'RECORD_CHANGED' });
      store.set(LEDGER_KEY, live.filter(item => item.id !== id));
    };
    if (!Object.keys(entry.before).length) { store.transaction(release); return { undone: id, record: current, change: null }; }
    let change: { id: number; at: string; copy: string } | null = null;
    try {
      const record = store.saveRecord(entry.entity, entry.before, entry.keeperId, { guard: release, onChange: value => { change = value; } });
      return { undone: id, record, change };
    } catch (failure) {
      if (failure instanceof AppError && failure.status === 422) throw new AppError(409, 'Al deshacer, la ficha quedaría con datos obligatorios vacíos. Corrígela a mano.', { code: 'INVALID_AFTER_UNDO' });
      throw failure;
    }
  });

  // «Dejar de apartar»: quita la marca sin tocar ninguna ficha. El aviso de duplicado vuelve a aparecer.
  app.post('/api/v2/records/merges/:id/release', async request => {
    const { id } = entryParams.parse(request.params);
    store.transaction(() => {
      const live = liveLedger(store);
      if (!live.some(item => item.id === id)) throw new AppError(404, 'Esa fusión ya no está en la lista.');
      store.set(LEDGER_KEY, live.filter(item => item.id !== id));
    });
    return { released: id };
  });
}
