/** Offline scenario analysis. Callers supply evidence; this module does not attest it or perform recovery. */
export interface ContinuityScope { spaceId: string; sourceKey: string; captureId: string }
export interface TimedDrill {
  scope: ContinuityScope;
  /** Start of recovery and confirmation of a usable workflow, not arbitrary test-run timestamps. */
  startedAt: number;
  completedAt: number;
  outcome: 'passed' | 'failed';
}
export interface ContinuityLabInput {
  scope: ContinuityScope;
  evaluatedAt: number;
  scenario: 'crm-outage' | 'device-loss';
  outageDurationMs: number;
  objectives: { maxDataAgeMs: number; maxRecoveryMs: number; maxEvidenceAgeMs: number };
  snapshot: { scope: ContinuityScope; capturedAt: number; verifiedAt: number } | null;
  localRuntime: 'available' | 'unavailable' | 'unknown';
  recoveryKit: 'available' | 'unavailable' | 'unknown';
  backup: { scope: ContinuityScope; createdAt: number; verifiedAt: number } | null;
  localDrill: TimedDrill | null;
  restoreDrill: TimedDrill | null;
  workload: { scope: ContinuityScope; tasks: { id: string; dueAt: number | null; status: 'open' | 'done' }[] } | null;
}
export interface ContinuityCheck {
  code: string;
  category: 'blocker' | 'evidence' | 'objective';
  status: 'pass' | 'fail' | 'unknown';
  detail: string;
  nextAction: string | null;
}
export interface ContinuityLabResult {
  scope: ContinuityScope;
  evaluatedAt: number;
  scenario: ContinuityLabInput['scenario'];
  status: 'ready' | 'at-risk' | 'unproven' | 'blocked';
  snapshotAgeMs: number | null;
  measuredRecoveryMs: number | null;
  exposure: { overdueTasks: number; tasksDueDuringOutage: number; tasksWithoutDate: number; openTasks: number } | null;
  checks: ContinuityCheck[];
  nextActions: string[];
  limitations: string[];
}

const DAY = 86_400_000;
function integer(value: number, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label + ' fuera de límites.');
}
function validScope(scope: ContinuityScope) {
  if (!scope || ['spaceId', 'sourceKey', 'captureId'].some(key => {
    const value = scope[key as keyof ContinuityScope];
    return typeof value !== 'string' || !value.trim() || value.length > 200;
  })) throw new TypeError('La evidencia necesita espacio, fuente y captura explícitos.');
}
function sameScope(a: ContinuityScope, b: ContinuityScope) {
  validScope(a);
  return a.spaceId === b.spaceId && a.sourceKey === b.sourceKey && a.captureId === b.captureId;
}
function availability(value: string) {
  if (!['available', 'unavailable', 'unknown'].includes(value)) throw new TypeError('Disponibilidad inválida.');
}

export function evaluateContinuityScenario(input: ContinuityLabInput): ContinuityLabResult {
  validScope(input.scope);
  integer(input.evaluatedAt, 'Fecha de evaluación');
  integer(input.outageDurationMs, 'Duración de caída', 1, 30 * DAY);
  integer(input.evaluatedAt + input.outageDurationMs, 'Final de caída');
  integer(input.objectives.maxDataAgeMs, 'Objetivo de antigüedad', 1, 30 * DAY);
  integer(input.objectives.maxRecoveryMs, 'Objetivo de recuperación', 1, 30 * DAY);
  integer(input.objectives.maxEvidenceAgeMs, 'Vigencia de evidencia', 1, 90 * DAY);
  if (!['crm-outage', 'device-loss'].includes(input.scenario)) throw new TypeError('Escenario inválido.');
  availability(input.localRuntime); availability(input.recoveryKit);
  const checks: ContinuityCheck[] = [];
  const add = (code: string, category: ContinuityCheck['category'], status: ContinuityCheck['status'], detail: string, nextAction: string | null = null) => {
    checks.push({ code, category, status, detail, nextAction });
  };
  const matched = (scope: ContinuityScope) => sameScope(scope, input.scope);
  let snapshotAgeMs: number | null = null, measuredRecoveryMs: number | null = null;
  const snapshot = input.snapshot;
  if (snapshot) { validScope(snapshot.scope); integer(snapshot.capturedAt, 'Fecha de captura'); integer(snapshot.verifiedAt, 'Verificación de captura'); }
  const snapshotValid = !!snapshot && matched(snapshot.scope) && snapshot.capturedAt <= snapshot.verifiedAt && snapshot.verifiedAt <= input.evaluatedAt;
  if (!snapshotValid) {
    add('snapshot', 'evidence', 'unknown', 'Falta una captura verificada de este espacio, fuente y generación, con fechas coherentes.', 'Verificar una captura de la fuente y generación seleccionadas.');
  } else {
    snapshotAgeMs = input.evaluatedAt - snapshot!.capturedAt;
    add('snapshot', 'evidence', 'pass', 'Captura y verificación ligadas a la generación seleccionada.');
    const within = snapshotAgeMs <= input.objectives.maxDataAgeMs;
    add('data-age', 'objective', within ? 'pass' : 'fail', 'La antigüedad observada de la captura es ' + snapshotAgeMs + ' ms; no mide cambios perdidos.', within ? null : 'Obtener y verificar una captura más reciente antes de la caída.');
  }

  const deviceLoss = input.scenario === 'device-loss';
  const available = deviceLoss ? input.recoveryKit : input.localRuntime;
  add('availability', 'blocker', available === 'available' ? 'pass' : available === 'unavailable' ? 'fail' : 'unknown',
    deviceLoss ? 'Disponibilidad declarada de otro equipo y medios de recuperación.' : 'Disponibilidad declarada de la instalación local.',
    available === 'available' ? null : deviceLoss ? 'Preparar otro equipo y acceso autorizado a los medios de recuperación.' : 'Comprobar que la instalación local puede abrirse sin el CRM.');

  let backupValid = false;
  if (deviceLoss) {
    const backup = input.backup;
    if (backup) { validScope(backup.scope); integer(backup.createdAt, 'Fecha de copia'); integer(backup.verifiedAt, 'Verificación de copia'); }
    backupValid = !!backup && snapshotValid && matched(backup.scope) && snapshot!.capturedAt <= backup.createdAt && backup.createdAt <= backup.verifiedAt && backup.verifiedAt <= input.evaluatedAt;
    add('backup', 'evidence', backupValid ? 'pass' : 'unknown', backupValid ? 'Copia verificada ligada a esta captura.' : 'No consta una copia verificada y coherente de esta captura.', backupValid ? null : 'Crear y verificar una copia recuperable de la captura seleccionada.');
  }

  const drill = deviceLoss ? input.restoreDrill : input.localDrill;
  if (drill) {
    validScope(drill.scope); integer(drill.startedAt, 'Inicio de ensayo'); integer(drill.completedAt, 'Fin de ensayo');
    if (!['passed', 'failed'].includes(drill.outcome)) throw new TypeError('Resultado de ensayo inválido.');
  }
  const drillValid = !!drill && snapshotValid && matched(drill.scope) && drill.startedAt >= (deviceLoss ? (backupValid ? input.backup!.verifiedAt : Number.MAX_SAFE_INTEGER) : snapshot!.verifiedAt)
    && drill.startedAt <= drill.completedAt && drill.completedAt <= input.evaluatedAt
    && input.evaluatedAt - drill.completedAt <= input.objectives.maxEvidenceAgeMs;
  if (!drillValid) {
    add('drill', 'evidence', 'unknown', 'Falta un ensayo vigente, posterior a la verificación y de la misma captura.', deviceLoss ? 'Ensayar restauración en otro equipo sobre esta copia y medir el tiempo.' : 'Ejecutar un simulacro local sobre esta captura y medir el tiempo.');
  } else if (drill!.outcome === 'failed') {
    add('drill', 'blocker', 'fail', 'El ensayo aplicable terminó con fallo.', 'Resolver el fallo y repetir el ensayo antes de considerar preparada la recuperación.');
  } else {
    measuredRecoveryMs = drill!.completedAt - drill!.startedAt;
    add('drill', 'evidence', 'pass', deviceLoss ? 'Ensayo de restauración correcto sobre esta copia.' : 'Simulacro local correcto sobre esta captura.');
    const within = measuredRecoveryMs <= input.objectives.maxRecoveryMs;
    add('recovery-time', 'objective', within ? 'pass' : 'fail', 'Tiempo medido en el ensayo: ' + measuredRecoveryMs + ' ms; no garantiza una recuperación futura.', within ? null : 'Reducir el tiempo de recuperación y repetir el ensayo.');
  }

  let exposure: ContinuityLabResult['exposure'] = null;
  if (input.workload) {
    const workload = input.workload; validScope(workload.scope);
    if (!Array.isArray(workload.tasks) || workload.tasks.length > 10_000) throw new RangeError('Máximo 10.000 tareas.');
    const ids = new Set<string>();
    for (const task of workload.tasks) {
      if (typeof task.id !== 'string' || !task.id.trim() || task.id.length > 200 || ids.has(task.id)) throw new TypeError('ID de tarea vacío o duplicado.');
      ids.add(task.id);
      if (!['open', 'done'].includes(task.status)) throw new TypeError('Estado de tarea inválido.');
      if (task.dueAt !== null) integer(task.dueAt, 'Vencimiento');
    }
    if (matched(workload.scope) && snapshotValid) {
      exposure = { overdueTasks: 0, tasksDueDuringOutage: 0, tasksWithoutDate: 0, openTasks: 0 };
      for (const task of workload.tasks) {
        if (task.status === 'done') continue;
        exposure.openTasks++;
        if (task.dueAt === null) exposure.tasksWithoutDate++;
        else if (task.dueAt < input.evaluatedAt) exposure.overdueTasks++;
        else if (task.dueAt <= input.evaluatedAt + input.outageDurationMs) exposure.tasksDueDuringOutage++;
      }
    }
  }
  add('workload', 'evidence', exposure ? 'pass' : 'unknown', exposure ? 'Exposición de las tareas aportadas de esta captura, sin estimar pérdidas.' : 'No se puede calcular exposición sin tareas de la captura seleccionada.', exposure ? null : 'Aportar tareas verificadas de la misma captura; una lista vacía debe ser explícita.');
  const status = checks.some(c => c.category === 'blocker' && c.status === 'fail') ? 'blocked'
    : checks.some(c => c.status === 'unknown') ? 'unproven'
    : checks.some(c => c.status === 'fail') ? 'at-risk' : 'ready';
  return {
    scope: { ...input.scope }, evaluatedAt: input.evaluatedAt, scenario: input.scenario, status,
    snapshotAgeMs, measuredRecoveryMs, exposure, checks,
    nextActions: [...new Set(checks.flatMap(c => c.nextAction ? [c.nextAction] : []))],
    limitations: [
      'Simulación sin red ni acciones sobre el CRM; la procedencia de las entradas y la medición de recuperación debe verificarlas el adaptador.',
      'Antigüedad de captura no equivale a pérdida de datos; tareas con vencimiento durante la caída no equivalen a pérdidas comerciales.',
      'El tiempo de un ensayo no garantiza el tiempo de una recuperación real.',
      'La exposición solo cubre las tareas aportadas; no demuestra inventario completo del portal.',
    ],
  };
}
