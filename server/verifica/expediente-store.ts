// Plan B Verifica · el expediente de cada encargo en el almacén local (Mega Plan 3, fase 1). Se escribe siempre dentro de la
// misma transacción que los documentos del evento: si algo falla, quedan la cabeza y los documentos anteriores. La secuencia
// se asigna al confirmar, leyendo la cabeza vigente.
import { sha256Hex } from '../../shared/sha256.js';
import type { EngagementRole } from '../../shared/verifica/engagement.js';
import { nextLedgerEntry, type LedgerEntry, type LedgerEventInput, type LedgerRef, type LedgerRefKind } from '../../shared/verifica/expediente.js';
import { parseCaptureText } from '../../shared/verifica/inputs.js';
import type { ReadRecord } from '../../shared/verifica/read-authorization.js';
import { fingerprintOf } from '../../shared/verifica/report.js';
import type { Store } from '../store.js';

const ledgerKey = (id: string) => 'verifica:ledger:' + id;

export function engagementLedger(store: Store, id: string): LedgerEntry[] {
  return store.get<LedgerEntry[]>(ledgerKey(id), []);
}

export function appendLedger(store: Store, id: string, recordedAt: string, events: LedgerEventInput[]): LedgerEntry[] {
  if (!store.db.isTransaction) throw new Error('El expediente se escribe en la misma transacción que sus documentos.');
  if (!events.length) return [];
  const entries = engagementLedger(store, id);
  const added: LedgerEntry[] = [];
  for (const event of events) added.push(nextLedgerEntry(added.at(-1) ?? entries.at(-1) ?? null, id, recordedAt, event));
  store.set(ledgerKey(id), [...entries, ...added]);
  return added;
}

export const ROLE_KIND: Record<EngagementRole, LedgerRefKind> = { previous: 'capture', latest: 'capture', invoices: 'invoices', declarations: 'declarations' };

/** El archivo tal como se guardó y, si la fuente sirve, la huella con la que la cita el informe. */
export function sourceRefs(role: EngagementRole, text: string, inputFingerprint: string | null): LedgerRef[] {
  const kind = ROLE_KIND[role];
  return [
    { kind, role, method: 'sha256-bytes-v1', fingerprint: sha256Hex(text) },
    ...(inputFingerprint ? [{ kind, role, method: 'verifica-input-v1', fingerprint: inputFingerprint } satisfies LedgerRef] : []),
  ];
}

export const replacedRef = (role: EngagementRole, text: string): LedgerRef => ({ kind: ROLE_KIND[role], role, method: 'sha256-bytes-v1', fingerprint: sha256Hex(text), replaced: true });

/** La huella con la que el informe citaría esta captura, o null si no sirve. */
export function captureInputFingerprint(text: string): string | null {
  try { return fingerprintOf(parseCaptureText(text, 'La captura')); }
  catch { return null; }
}

/** El acta de lectura y el documento firmado que la autorizó. */
export function recordRefs(record: ReadRecord): LedgerRef[] {
  return [
    { kind: 'read-record', method: 'verifica-read-record-v1', fingerprint: record.fingerprint },
    { kind: 'authorization-document', method: 'sha256-bytes-v1', fingerprint: record.signedDocumentSha256.toLowerCase() },
  ];
}
