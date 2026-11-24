// Plan B Verifica · cadena privada del expediente (Mega Plan 3, fase 1; coordination/plans/VERIFICA-MEGA-PLAN-3-IMPLEMENTACION.md,
// «Cadena privada»). Cada entrada registra un evento del encargo con referencias tipadas a sus documentos y enlaza la huella de
// la anterior. Los documentos siguen en el almacenamiento de su módulo: la cadena solo guarda sus huellas, nunca su contenido,
// nombres de archivo ni datos del CRM. El número de entrada fija el orden; la hora solo sirve para enseñarlo.
import { ENGAGEMENT_ROLES, type EngagementRole } from './engagement.js';
import { fingerprintOf } from './report.js';

export const LEDGER_FORMAT = 'verifica-expediente-v1';
export const LEDGER_ENTRY_METHOD = 'sha256-canonical-v1';

export const LEDGER_EVENTS = ['source-stored', 'source-removed', 'report-issued', 'watch-signing', 'watch-capture', 'watch-accepted', 'answer-declared', 'package-issued', 'engagement-closed'] as const;
export type LedgerEvent = typeof LEDGER_EVENTS[number];

export const LEDGER_REF_KINDS = ['capture', 'invoices', 'declarations', 'read-record', 'authorization-document', 'report', 'custody', 'answer', 'watch-report', 'package', 'closure'] as const;
export type LedgerRefKind = typeof LEDGER_REF_KINDS[number];

/**
 * Cómo se recalcula cada huella:
 * - `sha256-bytes-v1`: sha256 del archivo o del texto UTF-8 exacto, tal como se guardó.
 * - `verifica-input-v1`: `fingerprintOf` del objeto que entra en la sala limpia, como en las fuentes del informe.
 * - los demás: la huella propia de ese formato, con sus funciones vigentes.
 */
export const LEDGER_REF_METHODS = ['sha256-bytes-v1', 'verifica-input-v1', 'verifica-read-record-v1', 'planb-verifica-report-v1', 'planb-verifica-custody-v1', 'planb-verifica-watch-v1', 'verifica-paquete-comprador-v1', 'verifica-acta-cierre-v1'] as const;
export type LedgerRefMethod = typeof LEDGER_REF_METHODS[number];

export interface LedgerRef {
  kind: LedgerRefKind;
  method: LedgerRefMethod;
  fingerprint: string;
  /** Qué fuente del encargo es, cuando el documento es una de ellas. */
  role?: EngagementRole;
  /** El documento al que esta entrada sustituye o retira, en vez del que incorpora. */
  replaced?: true;
}

export const LEDGER_ORIGINS = ['file', 'hubspot-read', 'rotate', 'watch'] as const;
export interface LedgerData { role?: EngagementRole; origin?: typeof LEDGER_ORIGINS[number] }

export interface LedgerEntry {
  format: typeof LEDGER_FORMAT;
  engagement: string;
  sequence: number;
  recordedAt: string;
  event: LedgerEvent;
  previous: string | null;
  data: LedgerData;
  refs: LedgerRef[];
  /** `sha256-canonical-v1` de la entrada sin este campo, con el encargo incluido. */
  fingerprint: string;
}

export type LedgerEventInput = { event: LedgerEvent; data?: LedgerData; refs: LedgerRef[] };

export class LedgerInputError extends Error {}

const HEX = /^[a-f0-9]{64}$/;
const has = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

export function ledgerEntryFingerprint(entry: Omit<LedgerEntry, 'fingerprint'> | LedgerEntry): string {
  const { fingerprint: _ignored, ...body } = entry as LedgerEntry;
  return fingerprintOf(body);
}

function checkRef(ref: LedgerRef) {
  if (!has(LEDGER_REF_KINDS, ref.kind) || !has(LEDGER_REF_METHODS, ref.method) || !HEX.test(ref.fingerprint) || (ref.role !== undefined && !has(ENGAGEMENT_ROLES, ref.role))) {
    throw new LedgerInputError('Referencia de documento no válida para el expediente.');
  }
}

/** La entrada siguiente a `head` (o la primera, si no hay cabeza). */
export function nextLedgerEntry(head: LedgerEntry | null, engagement: string, recordedAt: string, input: LedgerEventInput): LedgerEntry {
  if (!engagement) throw new LedgerInputError('Falta el encargo del expediente.');
  if (head && head.engagement !== engagement) throw new LedgerInputError('La cabeza del expediente es de otro encargo.');
  if (!has(LEDGER_EVENTS, input.event)) throw new LedgerInputError('Evento desconocido para el expediente.');
  if (Number.isNaN(Date.parse(recordedAt))) throw new LedgerInputError('La hora del evento no es válida.');
  if (input.data?.role !== undefined && !has(ENGAGEMENT_ROLES, input.data.role)) throw new LedgerInputError('Fuente desconocida para el expediente.');
  if (input.data?.origin !== undefined && !has(LEDGER_ORIGINS, input.data.origin)) throw new LedgerInputError('Origen desconocido para el expediente.');
  input.refs.forEach(checkRef);
  const data: LedgerData = {};
  if (input.data?.role !== undefined) data.role = input.data.role;
  if (input.data?.origin !== undefined) data.origin = input.data.origin;
  const body: Omit<LedgerEntry, 'fingerprint'> = {
    format: LEDGER_FORMAT, engagement, sequence: head ? head.sequence + 1 : 1, recordedAt: new Date(recordedAt).toISOString(),
    event: input.event, previous: head ? head.fingerprint : null, data,
    refs: input.refs.map(ref => ({ kind: ref.kind, method: ref.method, fingerprint: ref.fingerprint,
      ...(ref.role ? { role: ref.role } : {}), ...(ref.replaced ? { replaced: true as const } : {}) })),
  };
  return { ...body, fingerprint: ledgerEntryFingerprint(body) };
}

export type LedgerProblemCode = 'format' | 'engagement' | 'altered' | 'missing' | 'out-of-order' | 'link' | 'truncated' | 'head';
export interface LedgerProblem { index: number; sequence: number | null; code: LedgerProblemCode; message: string }
export interface LedgerVerification {
  intact: boolean;
  entries: number;
  head: { sequence: number; fingerprint: string } | null;
  /** El primer eslabón que falla, si lo hay. */
  first: LedgerProblem | null;
  problems: LedgerProblem[];
}

/**
 * Recalcula la cadena entera. Sin `expectedHead` se puede comprobar su coherencia interna, no si le falta la cola: para eso
 * hace falta la cabeza registrada fuera (secuencia y huella).
 */
export function verifyLedger(entries: readonly unknown[], options: { engagement: string; expectedHead?: { sequence: number; fingerprint: string } }): LedgerVerification {
  const problems: LedgerProblem[] = [];
  const report = (index: number, sequence: number | null, code: LedgerProblemCode, message: string) => problems.push({ index, sequence, code, message });
  let previous: LedgerEntry | null = null;
  entries.forEach((raw, index) => {
    const entry = raw as LedgerEntry;
    const sequence = typeof entry?.sequence === 'number' ? entry.sequence : null;
    if (!entry || typeof entry !== 'object' || entry.format !== LEDGER_FORMAT) {
      report(index, sequence, 'format', 'Entrada con un formato no soportado.');
      previous = null;
      return;
    }
    if (entry.engagement !== options.engagement) report(index, sequence, 'engagement', 'La entrada pertenece a otro encargo.');
    if (ledgerEntryFingerprint(entry) !== entry.fingerprint) report(index, sequence, 'altered', 'El contenido de la entrada no coincide con su huella.');
    const expected = previous ? previous.sequence + 1 : 1;
    const comesLater = entries.slice(index + 1).some(other => (other as LedgerEntry | null)?.sequence === expected);
    if (sequence === null || !Number.isInteger(sequence) || sequence < expected || (sequence > expected && comesLater)) report(index, sequence, 'out-of-order', 'La entrada está repetida o fuera de orden.');
    else if (sequence > expected) report(index, sequence, 'missing', `Faltan entradas antes de la ${sequence}.`);
    // Si falta el principio, ya lo dice `missing`: la primera entrada conservada enlaza con una que no está.
    const headless = index === 0 && sequence !== 1;
    if (!headless && entry.previous !== (previous ? previous.fingerprint : null)) report(index, sequence, 'link', 'La entrada no enlaza con la anterior.');
    previous = entry;
  });
  const last = entries.at(-1) as LedgerEntry | undefined;
  const head = last && last.format === LEDGER_FORMAT ? { sequence: last.sequence, fingerprint: last.fingerprint } : null;
  if (options.expectedHead) {
    const expected = options.expectedHead;
    if (!head || head.sequence < expected.sequence) report(entries.length, head?.sequence ?? null, 'truncated', 'Faltan entradas al final respecto de la cabeza registrada.');
    else if (head.sequence !== expected.sequence || head.fingerprint !== expected.fingerprint) report(entries.length - 1, head.sequence, 'head', 'La cabeza no coincide con la registrada.');
  }
  problems.sort((a, b) => a.index - b.index);
  return { intact: problems.length === 0, entries: entries.length, head, first: problems[0] ?? null, problems };
}

// Mega Plan 3 · lo que la pantalla ve del expediente, las versiones de emisión y el acta de cierre.
export const CLOSURE_FORMAT = 'verifica-acta-cierre-v1';
export interface IssueVersion { issuedAt: string; reportFingerprint: string; reportJson: string; findings: number; alarms: number; ledgerHead: { sequence: number; fingerprint: string } | null }
export interface ClosureRecord {
  format: typeof CLOSURE_FORMAT;
  engagement: string;
  closedAt: string;
  /** La última entrada del expediente antes de borrarlo. */
  ledgerHead: { sequence: number; fingerprint: string } | null;
  ledgerIntact: boolean;
  deleted: { rows: number; byKind: Record<string, number> };
  /** Lo que el borrado no alcanza porque ya no está en este equipo. */
  outside: string[];
  fingerprint: string;
}
export interface ExpedienteView { entries: LedgerEntry[]; verification: LedgerVerification; anchors: { sequence: number; ok: boolean }[] }

export const CLOSURE_OUTSIDE = [
  'La copia custodiada y su llave, en manos de quien las guarda.',
  'Los informes, partes y paquetes ya entregados al comprador.',
  'Los archivos descargados en este equipo (por ejemplo, en la carpeta de descargas).',
];
