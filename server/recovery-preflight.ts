import { createHash } from 'node:crypto';
import { BundleSchema, entityNames, type EntityName } from '../shared/model.js';
import type { RecoveryPlan } from '../shared/operations.js';
import { decodePortable } from './crypto.js';
import { Store } from './store.js';

export const MAX_RECOVERY_BYTES = 32 * 1024 * 1024;
export interface RecoveryTarget { accountId: string; isTestData: boolean }
export interface RecoveryPreflight {
  status: 'valid' | 'invalid' | 'incompatible';
  artifactHash: string | null;
  encrypted: boolean | null;
  targetIdentityMatches: boolean | null;
  summary: {
    format: string; exportedAt: string; captureId: string; capturedAt: string; accountId: string; isTestData: boolean;
    capturedRecords: number; activeRecords: number; counts: Record<EntityName, number>;
    changeLogEntries: number; pendingChanges: number; uncertainOperationsAfterRestore: number;
    approvalWouldBeReset: boolean;
  } | null;
  issues: { code: string; message: string }[];
  limitations: string[];
}
function canonicalBase64(value: unknown, bytes?: number) {
  if (typeof value !== 'string') return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value && (bytes === undefined || decoded.length === bytes);
}

/** Inspects supplied bytes and exercises the existing restore contract ONLY in a disposable in-memory Store. */
export function inspectRecoveryCopy(raw: string, options: { password?: string; target?: RecoveryTarget } = {}): RecoveryPreflight {
  const result: RecoveryPreflight = {
    status: 'invalid', artifactHash: null, encrypted: null, targetIdentityMatches: null, summary: null, issues: [],
    limitations: [
      'Comprueba este archivo mediante una restauración de prueba exclusivamente en memoria; no cambia la instalación ni ejecuta acciones externas.',
      'Un hash identifica los bytes examinados; no acredita autoría, custodia externa, recencia o recuperación en otro equipo.',
      'La identidad de destino es opcional y declarada por quien llama; no sustituye los controles ni la confirmación de una restauración real.',
      'No inspecciona ZIP de instalación ni claves de Windows: admite únicamente el JSON portátil de continuidad.',
    ],
  };
  const fail = (code: string, message: string) => { result.issues.push({ code, message }); return result; };
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_RECOVERY_BYTES) return fail('SIZE_LIMIT', 'El archivo supera el límite de 32 MiB o no es texto JSON.');
  const password = options.password ?? '';
  if (typeof password !== 'string' || password.length > 200) return fail('INVALID_PASSWORD_INPUT', 'La contraseña supera el límite admitido o tiene un formato inválido.');
  const target = options.target;
  if (target && (typeof target.accountId !== 'string' || !target.accountId.trim() || target.accountId.length > 200 || typeof target.isTestData !== 'boolean')) return fail('INVALID_TARGET', 'Indica un portal y una clase de datos de destino válidos.');
  result.artifactHash = createHash('sha256').update(raw, 'utf8').digest('hex');
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return fail('INVALID_JSON', 'El archivo no contiene JSON válido.'); }
  const envelope = decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
  result.encrypted = envelope?.format === 'planb-encrypted-v2';
  if (result.encrypted) {
    if (!envelope || Object.keys(envelope).sort().join(',') !== 'data,format,kdf,salt' || envelope.kdf !== 'scrypt'
      || !canonicalBase64(envelope.salt, 16) || typeof envelope.data !== 'string' || !envelope.data.startsWith('enc1:')
      || !canonicalBase64(envelope.data.slice(5)) || Buffer.from(envelope.data.slice(5), 'base64').length < 30) {
      return fail('INVALID_ENVELOPE', 'El contenedor cifrado no cumple el formato portátil admitido.');
    }
    if (!password) return fail('PASSWORD_REQUIRED', 'Esta copia necesita su contraseña de recuperación.');
    try { decoded = decodePortable(raw, password); } catch { return fail('DECRYPT_FAILED', 'Contraseña incorrecta o contenido cifrado dañado.'); }
  }
  const parsed = BundleSchema.safeParse(decoded);
  if (!parsed.success) return fail('INVALID_BUNDLE', 'El contenido no cumple el formato de copia de continuidad.');
  const bundle = parsed.data;
  if (!bundle.snapshot.source.isTestData && !result.encrypted) return fail('PRODUCTION_REQUIRES_ENCRYPTION', 'Los datos reales requieren una copia cifrada con contraseña.');
  const probe = new Store(':memory:');
  try {
    try { probe.restoreBundle(bundle); } catch { return fail('INTEGRITY_FAILED', 'La copia no supera la comprobación de datos, reglas, relaciones o historial.'); }
    const records = probe.records(), plan = probe.get<RecoveryPlan | null>('recoveryPlan', null);
    const uncertain = plan?.operations.filter(op => op.status === 'uncertain').length ?? 0;
    result.summary = {
      format: bundle.format, exportedAt: bundle.exportedAt,
      captureId: bundle.snapshot.id + ':' + bundle.snapshot.capturedAt, capturedAt: bundle.snapshot.capturedAt,
      accountId: bundle.snapshot.source.accountId, isTestData: bundle.snapshot.source.isTestData,
      capturedRecords: bundle.snapshot.records.length, activeRecords: records.length,
      counts: Object.fromEntries(entityNames.map(entity => [entity, records.filter(r => r.entity === entity).length])) as Record<EntityName, number>,
      changeLogEntries: bundle.changes.length, pendingChanges: probe.pendingChangesCount,
      uncertainOperationsAfterRestore: uncertain, approvalWouldBeReset: bundle.returnState?.plan?.status === 'approved',
    };
    result.status = 'valid';
    if (target) {
      result.targetIdentityMatches = target.accountId === bundle.snapshot.source.accountId && target.isTestData === bundle.snapshot.source.isTestData;
      if (!result.targetIdentityMatches) { result.status = 'incompatible'; result.issues.push({ code: 'TARGET_MISMATCH', message: 'La copia no pertenece al portal o clase de datos indicados como destino.' }); }
    } else result.issues.push({ code: 'TARGET_NOT_CHECKED', message: 'No se ha indicado la identidad de una instalación de destino.' });
    if (uncertain) result.issues.push({ code: 'REMOTE_RESULT_UNCERTAIN', message: 'Hay operaciones con resultado incierto; compruébalas fuera antes de repetirlas.' });
    if (result.summary.approvalWouldBeReset) result.issues.push({ code: 'APPROVAL_RESET', message: 'La restauración conserva el plan para una nueva revisión y retira su aprobación anterior.' });
    if (!bundle.snapshot.source.isTestData) result.issues.push({ code: 'REAL_DATA_POLICY', message: 'La restauración real requiere protección local configurada y conserva las restricciones de producción.' });
    return result;
  } finally { probe.close(); }
}
