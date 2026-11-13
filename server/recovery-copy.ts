import { createHash } from 'node:crypto';
import type { ContinuityBundle } from '../shared/model.js';
import type { RecoveryCopy } from '../shared/operations.js';
import { AppError, type Store } from './store.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function bundleRevision(bundle: ContinuityBundle): string {
  const { exportedAt: _, ...content } = bundle;
  return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}
export function exportSummary(store: Store) {
  const bundle = store.bundle();
  const captureId = bundle.snapshot.id + ':' + bundle.snapshot.capturedAt;
  return { revision: bundleRevision(bundle), captureId, name: bundle.snapshot.name, capturedAt: bundle.snapshot.capturedAt,
    records: bundle.records.length, changes: bundle.changes.length, latestCaptureId: store.captures()[0]?.id ?? null,
    differsFromLatest: store.captures()[0]?.id !== captureId };
}
export function rememberExport(store: Store, bundle: ContinuityBundle, artifact: string | Buffer) {
  store.assertRecoveryIntegrity();
  store.set('recoveryCopy', { exportedAt: bundle.exportedAt, revision: bundleRevision(bundle),
    captureId: bundle.snapshot.id + ':' + bundle.snapshot.capturedAt, records: bundle.records.length, changes: bundle.changes.length,
    artifactHash: createHash('sha256').update(artifact).digest('hex') } satisfies RecoveryCopy);
}
export function recoveryCopyStatus(store: Store): RecoveryCopy | null {
  const copy = store.get<RecoveryCopy | null>('recoveryCopy', null);
  if (!copy) return null;
  const bundle = store.recoveryIntegrity().state==='invalid'?null:store.bundleOrNull();
  const current = !!copy.revision && !!bundle && store.ready && copy.revision === bundleRevision(bundle);
  const { confirmedAt, ...rest } = copy;
  return { ...rest, current, ...(current && confirmedAt ? { confirmedAt } : {}), ...(confirmedAt && !current ? { previousConfirmedAt: confirmedAt } : {}) };
}
export function confirmRecoveryCopy(store: Store, revision?: string) {
  store.assertRecoveryIntegrity();
  const copy = recoveryCopyStatus(store);
  if (!copy?.current || !copy.revision || revision && revision !== copy.revision) throw new AppError(409, 'La copia no corresponde al espacio actual. Exporta esta revisión antes de confirmar su custodia.');
  store.set('recoveryCopy', { ...copy, confirmedAt: new Date().toISOString() });
  return { confirmed: true, revision: copy.revision };
}
