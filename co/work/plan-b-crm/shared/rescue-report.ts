import type { RecoveryPlan } from './operations.js';
import type { RescuePlan } from './rescue-plan.js';
import { STAGE_LABEL, type RescueEvent, type RescueState } from './rescue-room.js';
// Informe del ensayo: hechos comprobados frente a estimaciones declaradas, incertidumbres pendientes y límites. Función pura.
export interface SimulatorStats { online: boolean; records: number; calls: { read: number; create: number; update: number; relate: number }; creates: { operationId: string; remoteId: string; subject: string }[]; duplicateCreates: number }
export interface ReportInput {
  generatedAt: string; state: RescueState; capture: { name: string; capturedAt: string; records: number; counts: Record<string, number> };
  queue: { totalTasks: number; completedTasks: number; knownOpenTasks: number; unknownStatusTasks: number; totalQueued: number; returned: number; truncated: boolean };
  plan: RescuePlan | null; journal: RescueEvent[]; returnPlan: RecoveryPlan | null; simulator: SimulatorStats | null;
  localChanges: { entity: string; recordId: string; operation: string; at: string; fields: string[]; completed?: boolean }[];
}
export type Evidence = 'comprobado' | 'declarado' | 'pendiente' | 'no-demostrado';
export interface ReportLine { label: string; value: string; evidence: Evidence }
export interface RescueReport {
  format: 'planb-rescue-report-v1'; generatedAt: string; banner: string; stage: string; closed: boolean;
  sections: { id: string; title: string; lines: ReportLine[] }[]; notProven: string[]; measures: { userWallClockMs: number | null; technical: { label: string; ms: number }[]; note: string };
}
const text = (value: unknown, limit = 200) => String(value ?? '').slice(0, limit);
export function buildRescueReport(input: ReportInput): RescueReport {
  const { state, plan, returnPlan, simulator, journal } = input;
  const ops = returnPlan?.operations ?? [];
  const applied = ops.filter(o => o.status === 'applied'), uncertain = ops.filter(o => o.status === 'uncertain'), failed = ops.filter(o => o.status === 'failed');
  const conflicts = ops.flatMap(o => o.fields.filter(f => f.conflict).map(f => ({ o, f })));
  const line = (label: string, value: string, evidence: Evidence): ReportLine => ({ label, value, evidence });
  const sections: RescueReport['sections'] = [
    { id: 'provenance', title: 'Procedencia', lines: [
      line('Espacio', state.context.workspaceId, 'comprobado'), line('Portal ficticio', state.context.accountId, 'comprobado'),
      line('Captura', input.capture.name + ' · ' + input.capture.capturedAt + ' · revisión ' + state.context.captureRevision.slice(0, 12), 'comprobado'),
      line('Registros en la captura', String(input.capture.records) + ' (' + Object.entries(input.capture.counts).map(([k, v]) => k + ': ' + v).join(', ') + ')', 'comprobado'),
      line('Incidente', 'Caída ficticia de ' + state.incidentHours + ' h iniciada ' + state.incidentStartedAt, 'declarado'),
    ] },
    { id: 'inventory', title: 'Inventario y cobertura', lines: [
      line('Tareas en la copia', String(input.queue.totalTasks) + ' (' + input.queue.completedTasks + ' completadas, ' + input.queue.knownOpenTasks + ' abiertas, ' + input.queue.unknownStatusTasks + ' de estado desconocido)', 'comprobado'),
      line('Cola visible', input.queue.returned + ' de ' + input.queue.totalQueued + (input.queue.truncated ? ' (truncada: el plan solo considera las visibles)' : ''), 'comprobado'),
    ] },
    { id: 'plan', title: 'Plan elegido y estimaciones', lines: plan ? [
      line('Tiempo disponible', plan.budgetMinutes + ' min', 'declarado'),
      line('Tareas que caben', plan.included.length + ' (' + plan.usedMinutes + ' min estimados de ' + plan.budgetMinutes + ')', 'declarado'),
      line('Excluidas', plan.excluded.length + ' (' + plan.excluded.filter(e => e.reason === 'no-estimate').length + ' sin estimación)', 'declarado'),
      line('Que quepan no es que se hayan hecho', 'Tareas realmente completadas en la copia local: ' + input.localChanges.filter(c => c.completed).length, 'comprobado'),
    ] : [line('Plan', 'No se eligió un tiempo disponible.', 'pendiente')] },
    { id: 'local', title: 'Trabajo local confirmado', lines: input.localChanges.length ? input.localChanges.map(c => line(c.entity + ' ' + c.recordId, c.operation + ': ' + c.fields.join(', '), 'comprobado')) : [line('Cambios locales', 'Ninguno', 'pendiente')] },
    { id: 'conflicts', title: 'Conflictos y decisiones', lines: conflicts.length ? conflicts.map(({ o, f }) => line(o.label + ' · ' + f.label, 'capturado ' + text(f.base) + ' · local ' + text(f.local) + ' · remoto ' + text(f.remote) + ' → ' + (f.decision ?? 'sin decidir'), f.decision ? 'comprobado' : 'pendiente')) : [line('Conflictos', returnPlan ? 'Ninguno en el plan actual' : 'Retorno aún no preparado', returnPlan ? 'comprobado' : 'pendiente')] },
    { id: 'sends', title: 'Envíos simulados verificados', lines: [
      line('Operaciones verificadas', applied.length + ' de ' + ops.length + ' (simulador)', ops.length ? 'comprobado' : 'pendiente'),
      ...applied.map(o => line(o.label, o.kind + ' → ' + text(o.remoteId), 'comprobado')),
      ...(returnPlan?.status === 'approved' ? [line('Aprobación', 'Plan aprobado el ' + text(returnPlan.approvedAt) + ': aprobado NO es enviado; ninguna operación cuenta como verificada hasta comprobarla en el simulador', 'declarado')] : []),
      ...ops.filter(o => o.status === 'pending').map(o => line(o.label, o.kind + ' · pendiente de enviar', 'pendiente')),
      ...(simulator ? [line('Llamadas al simulador', 'create ' + simulator.calls.create + ', update ' + simulator.calls.update + ', read ' + simulator.calls.read, 'comprobado'),
        line('Creaciones duplicadas en el simulador', String(simulator.duplicateCreates), 'comprobado')] : []),
    ] },
    { id: 'uncertain', title: 'Incertidumbres y fallos pendientes', lines: [...uncertain.map(o => line(o.label, 'Resultado incierto: ' + text(o.error, 300), 'pendiente')), ...failed.map(o => line(o.label, 'Fallido: ' + text(o.error, 300), 'pendiente'))].concat(!uncertain.length && !failed.length ? [line('Pendientes', 'Ninguno', 'comprobado')] : []) },
  ];
  const first = journal[0] ? Date.parse(journal[0].at) : NaN, last = journal.length ? Date.parse(journal[journal.length - 1].at) : NaN;
  return {
    format: 'planb-rescue-report-v1', generatedAt: input.generatedAt, banner: 'Ensayo · datos ficticios · no conecta con HubSpot', stage: STAGE_LABEL[state.stage], closed: state.stage === 'closed', sections,
    notProven: [
      'Que el negocio se haya recuperado: «ensayo cerrado» solo indica que se cerró este ensayo.',
      'Comportamiento con HubSpot real, permisos, límites de API o asociaciones: el simulador no observa relaciones.',
      'Recuperación en otro equipo, RTO o RPO de negocio; la duración de una prueba no es un RTO.',
      'Ahorro de tiempo o dinero: el importe de oportunidades no se usa como dinero perdido ni salvado.',
      'Auditoría multiusuario: el operador local no acredita identidad.',
    ],
    measures: { userWallClockMs: Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, last - first) : null,
      technical: journal.filter(e => typeof e.data.durationMs === 'number').map(e => ({ label: e.kind, ms: e.data.durationMs as number })),
      note: 'El tiempo de usuario es el transcurrido entre el primer y el último hecho del diario; los tiempos técnicos son de servidor y no se suman a él. No es una prueba de usuario ni un RTO.' },
  };
}
export const serializeReport = (report: RescueReport) => JSON.stringify(report, null, 2) + '\n';
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);
export function renderReportHtml(report: RescueReport): string {
  const rows = (lines: ReportLine[]) => lines.map(l => '<tr><th scope="row">' + escapeHtml(l.label) + '</th><td>' + escapeHtml(l.value) + '</td><td class="ev ev-' + escapeHtml(l.evidence) + '">' + escapeHtml(l.evidence) + '</td></tr>').join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Plan B · Informe del ensayo de rescate</title>' +
    '<style>body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#19314f;background:#f2f4f7;margin:0;padding:24px}main{max-width:900px;margin:0 auto;background:#fffefd;border:1px solid #d9e1eb;border-radius:8px;padding:24px}' +
    'h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.banner{background:#fff7e8;color:#835c1c;border:1px solid #e6cf92;border-radius:4px;padding:8px 12px;font-weight:600}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-top:1px solid #d9e1eb;padding:6px 8px;vertical-align:top}th{width:32%;font-weight:600}.ev{width:110px;font-size:12px}.ev-pendiente{color:#835c1c}.ev-comprobado{color:#216448}.ev-no-demostrado{color:#a2343f}</style></head><body><main>' +
    '<h1>Informe del ensayo de rescate</h1><p class="banner">' + escapeHtml(report.banner) + '</p><p>Estado: <strong>' + escapeHtml(report.stage) + '</strong> · generado ' + escapeHtml(report.generatedAt) + '</p>' +
    report.sections.map(s => '<h2>' + escapeHtml(s.title) + '</h2><table><tbody>' + rows(s.lines) + '</tbody></table>').join('') +
    '<h2>Mediciones</h2><p>Tiempo de usuario: ' + escapeHtml(report.measures.userWallClockMs === null ? 'sin datos' : Math.round(report.measures.userWallClockMs / 1000) + ' s') + '. Tiempos técnicos: ' +
    escapeHtml(report.measures.technical.map(t => t.label + ' ' + t.ms + ' ms').join('; ') || 'sin datos') + '.</p><p>' + escapeHtml(report.measures.note) + '</p>' +
    '<h2>Lo que este ensayo no demuestra</h2><ul>' + report.notProven.map(n => '<li>' + escapeHtml(n) + '</li>').join('') + '</ul></main></body></html>\n';
}
