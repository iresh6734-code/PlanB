import { EQUIVALENCE_FORMAT, type EquivalenceReport } from '../../shared/verifica/equivalence.js';
import type { Store } from '../store.js';
import { appendLedger } from './expediente-store.js';

const key = (id: string) => `verifica:equivalence:${id}`;

/** El último informe guardado. 0b5e3f0 (25/11/2026) lo guardó un tiempo como { report, json }: se sigue leyendo. */
export function latestEquivalence(store: Store, id: string): EquivalenceReport | null {
  const stored = store.get<EquivalenceReport | { report: string; json: string } | null>(key(id), null);
  if (stored && 'json' in stored && typeof stored.json === 'string') return JSON.parse(stored.json) as EquivalenceReport;
  return stored as EquivalenceReport | null;
}

/** Conserva el informe de salida. Los archivos del destino y la lista privada quedan fuera. */
export function rememberEquivalence(store: Store, id: string, at: string, report: EquivalenceReport) {
  store.transaction(() => {
    if (latestEquivalence(store, id)?.fingerprint === report.fingerprint) return;
    store.set(key(id), report);
    appendLedger(store, id, at, [{ event: 'report-issued', refs: [
      { kind: 'equivalence', method: EQUIVALENCE_FORMAT, fingerprint: report.fingerprint },
      ...(report.closing.watch ? [{ kind: 'watch-report', method: 'planb-verifica-watch-v1', fingerprint: report.closing.watch } as const] : []),
    ] }]);
  });
}
