import { z } from 'zod';
import type { CaptureSummary, DrillReport } from './operations.js';

/** Labels emitted by the technical worker, including legacy reports. They are
 * check identities in the existing wire format, not proof of who ran a drill. */
export const TECHNICAL_DRILL_CHECKS = [
  'Red externa bloqueada',
  'Buscar y editar un cliente',
  'Avanzar una oportunidad',
  'Crear y completar una tarea',
  'Persistencia después de reiniciar',
] as const;

const ReportSchema = z.object({
  id: z.string().min(1), captureId: z.string().min(1),
  startedAt: z.string().datetime(), completedAt: z.string().datetime(),
  durationMs: z.number().finite().nonnegative(),
  passed: z.boolean(), isolated: z.boolean(),
  checks: z.array(z.object({ label: z.string(), passed: z.boolean(), detail: z.string() })),
  dataSource: z.string(), limitations: z.array(z.string()),
  environment: z.enum(['test', 'production']).optional(),
});

/** Only structurally readable metadata can be displayed or marked as passed. */
export type DrillEvidence =
  | { report: null; passed: false; issues: string[] }
  | { report: DrillReport; passed: boolean; issues: string[] };

/** Validates a historical technical result. Freshness is assessed separately.
 * Does not establish recovery time, authenticity, current remote availability,
 * or the content/revision of a capture merely because its ID matches. */
export function inspectDrillEvidence(
  value: unknown,
  capture?: Pick<CaptureSummary, 'id' | 'environment'>,
): DrillEvidence {
  const parsed = ReportSchema.safeParse(value);
  if (!parsed.success) return { report: null, passed: false, issues: ['El informe de simulacro tiene un formato no válido. Repite la comprobación.'] };
  const report = parsed.data, issues: string[] = [];
  if (capture && report.captureId !== capture.id) issues.push('El informe corresponde a otra captura.');
  if (capture?.environment !== undefined && report.environment !== undefined && capture.environment !== report.environment)
    issues.push('El entorno del informe no coincide con el de esta captura.');
  if (Date.parse(report.startedAt) > Date.parse(report.completedAt)) issues.push('La fecha de finalización es anterior al inicio del simulacro.');
  const expected = new Set<string>(TECHNICAL_DRILL_CHECKS), labels = report.checks.map(check => check.label);
  if (labels.length !== expected.size || new Set(labels).size !== expected.size || labels.some(label => !expected.has(label)))
    issues.push('El informe no contiene las cinco comprobaciones distintas del simulacro técnico.');
  if (!report.isolated) issues.push('El informe no confirma una ejecución aislada.');
  if (!report.passed && report.checks.every(check => check.passed)) issues.push('La ejecución no declaró superado el simulacro.');
  issues.push(...report.checks.filter(check => !check.passed).map(check => check.detail || 'Una comprobación del simulacro no se superó.'));
  return { report, passed: issues.length === 0, issues: [...new Set(issues)] };
}
