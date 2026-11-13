import { bundleRevision } from './recovery-copy.js';
import { inspectRecoveryCopy, type RecoveryPreflight } from './recovery-preflight.js';
import { decodePortable } from './crypto.js';
import { BundleSchema, type ContinuityBundle } from '../shared/model.js';

export interface CoverageInput { reference: string; backup: string; referencePassword?: string; backupPassword?: string }
export interface CoverageArtifact {
  validity: RecoveryPreflight['status']; artifactHash: string | null; revision: string | null;
  encrypted: boolean | null; exportedAt: string | null; capturedAt: string | null;
  records: number | null; historyEntries: number | null; pendingChanges: number | null; issueCodes: string[];
}
export interface BackupCoverage {
  status: 'matches-reference' | 'missing-local-changes' | 'different-revision' | 'incompatible' | 'invalid';
  reference: CoverageArtifact; backup: CoverageArtifact;
  sameSource: boolean | null; sameCapture: boolean | null; byteIdentical: boolean | null;
  missingLocalChanges: number | null;
  differences: null | {
    missingRecordsInBackup: number; extraRecordsInBackup: number; changedRecords: number;
    snapshotChanged: boolean; specChanged: boolean; generationChanged: boolean; sessionChanged: boolean; returnStateChanged: boolean;
  };
  nextAction: string; limitations: string[];
}

// Same object-key semantics as the existing revision contract; array order remains significant.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function inspect(raw: string, password?: string): { artifact: CoverageArtifact; bundle: ContinuityBundle | null } {
  const checked = inspectRecoveryCopy(raw, { password });
  const artifact: CoverageArtifact = {
    validity: checked.status, artifactHash: checked.artifactHash, revision: null, encrypted: checked.encrypted,
    exportedAt: checked.summary?.exportedAt ?? null, capturedAt: checked.summary?.capturedAt ?? null,
    records: checked.summary?.activeRecords ?? null, historyEntries: checked.summary?.changeLogEntries ?? null,
    pendingChanges: checked.summary?.pendingChanges ?? null, issueCodes: checked.issues.map(issue => issue.code),
  };
  if (checked.status !== 'valid') return { artifact, bundle: null };
  try {
    const bundle = BundleSchema.parse(checked.encrypted ? decodePortable(raw, password ?? '') : JSON.parse(raw));
    artifact.revision = bundleRevision(bundle);
    return { artifact, bundle };
  } catch {
    // Never return parser, cipher or customer content in a comparison failure.
    return { artifact: { ...artifact, validity: 'invalid', revision: null, issueCodes: ['READ_FAILED'] }, bundle: null };
  }
}

/** Two explicitly supplied artifacts, not a live Store or a proof of external custody/recovery. */
export function compareBackupCoverage(input: CoverageInput): BackupCoverage {
  const reference = inspect(input.reference, input.referencePassword), backup = inspect(input.backup, input.backupPassword);
  const result: BackupCoverage = {
    status: 'invalid', reference: reference.artifact, backup: backup.artifact,
    sameSource: null, sameCapture: null,
    byteIdentical: reference.artifact.artifactHash && backup.artifact.artifactHash ? reference.artifact.artifactHash === backup.artifact.artifactHash : null,
    missingLocalChanges: null, differences: null,
    nextAction: 'Verificar formato, integridad y contraseñas de ambos archivos explícitos.',
    limitations: [
      'La referencia es otro archivo aportado; no demuestra el estado más reciente de una instalación o del portal.',
      'Coincidir con la referencia no demuestra copia fuera del equipo, custodia de contraseña o recuperación en otro ordenador.',
      'Las fechas de exportación no determinan qué revisión es más reciente; solo un prefijo de historial con el resto del contexto idéntico permite contar cambios no cubiertos.',
      'No restaura una instalación: cada archivo se valida con una restauración de prueba solo en memoria. No se miden RPO/RTO.',
      'Los recuentos corresponden a estos archivos, sin valores, nombres de campos ni IDs de fichas en el informe.',
    ],
  };
  const ref = reference.bundle, copy = backup.bundle;
  if (!ref || !copy) return result;
  const source = (bundle: ContinuityBundle) => {
    const s = bundle.snapshot.source;
    return { kind: s.kind, accountId: s.accountId, isTestData: s.isTestData, environment: s.environment ?? null, accountType: s.accountType ?? null };
  };
  result.sameSource = equal(source(ref), source(copy));
  result.sameCapture = ref.snapshot.id === copy.snapshot.id && ref.snapshot.capturedAt === copy.snapshot.capturedAt;
  if (!result.sameSource || !result.sameCapture) {
    result.status = 'incompatible';
    result.nextAction = 'Elegir dos archivos del mismo portal, origen, entorno, clase y captura; no inferir cobertura entre capturas distintas.';
    return result;
  }
  const key = (record: ContinuityBundle['records'][number]) => record.entity + '\0' + record.id;
  const refRecords = new Map(ref.records.map(record => [key(record), record]));
  const copyRecords = new Map(copy.records.map(record => [key(record), record]));
  result.differences = {
    missingRecordsInBackup: [...refRecords.keys()].filter(id => !copyRecords.has(id)).length,
    extraRecordsInBackup: [...copyRecords.keys()].filter(id => !refRecords.has(id)).length,
    changedRecords: [...refRecords].filter(([id, record]) => copyRecords.has(id) && !equal(record, copyRecords.get(id))).length,
    snapshotChanged: !equal(ref.snapshot, copy.snapshot), specChanged: !equal(ref.spec, copy.spec), generationChanged: !equal(ref.generation, copy.generation),
    sessionChanged: ref.sessionId !== copy.sessionId, returnStateChanged: !equal(ref.returnState, copy.returnState),
  };
  if (reference.artifact.revision === backup.artifact.revision) {
    result.status = 'matches-reference'; result.missingLocalChanges = 0;
    result.nextAction = 'Conservar la copia y contraseña por separado y ensayar la recuperación; la coincidencia solo acredita estos dos archivos.';
    return result;
  }
  const context = (bundle: ContinuityBundle) => {
    const { records: _records, changes: _changes, exportedAt: _exportedAt, ...rest } = bundle;
    return rest;
  };
  const prefix = copy.changes.length < ref.changes.length && equal(context(ref), context(copy))
    && copy.changes.every((change, index) => equal(change, ref.changes[index]));
  result.status = prefix ? 'missing-local-changes' : 'different-revision';
  result.missingLocalChanges = prefix ? ref.changes.length - copy.changes.length : null;
  result.nextAction = prefix
    ? 'La copia no cubre todos los cambios de la referencia. Crear y verificar una exportación de la revisión necesaria antes de sustituir cualquier archivo.'
    : 'Las revisiones difieren y no se puede ordenar su cobertura con seguridad. Revisar el origen de ambas y conservarlas sin sobrescribir.';
  return result;
}
