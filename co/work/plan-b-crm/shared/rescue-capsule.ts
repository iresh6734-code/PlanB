import { z } from 'zod';
import { BundleSchema, RecordSchema, RecoveryPlanSchema, type CrmRecord } from './model.js';
import { ContextSchema, EventSchema, MAX_JOURNAL_EVENTS, StateSchema, STAGE_LABEL, stages, type RescueEvent, type RescueStage, type RescueState } from './rescue-room.js';
import { escapeHtml } from './rescue-report.js';
// Kit de Relevo (CLAUDE-RESCUE-KIT-116): contrato de la cápsula, coherencia entre sus componentes, política por estado e informe comparativo. Puro: sin red ni disco.
// ENSAYO con datos ficticios: una cápsula acredita un traslado a una CARPETA y un PROCESO nuevos de ESTE equipo; no otro ordenador, HubSpot real ni RTO.
export const CAPSULE_FORMAT = 'planb-rescue-capsule-v1';
export const MAX_CAPSULE_BYTES = 64 * 1024 * 1024, MAX_IDEM_RECORDS = 20_000, MAX_SIM_RECORDS = 12_000, MAX_STRING = 2_000_000;
export const BANNER = 'Ensayo · datos ficticios · mismo equipo, carpeta nueva';
export const NOT_PROVEN = [
  'Traslado a otro ordenador: la cápsula se abre en una carpeta y un proceso nuevos de ESTE equipo.',
  'Comportamiento con HubSpot real, permisos o límites de API: el simulador no observa relaciones.',
  'RTO/RPO o recuperación del negocio; el tiempo técnico medido no es un RTO.',
  'Autenticidad o anonimización: un hash acredita igualdad de contenido, no autoría; el cifrado protege con la contraseña del ensayo.',
  'Exclusión entre dos ordenadores desconectados: solo hay un escritor local por carpeta (bloqueo de proceso).',
];
const idemRecord = z.object({ contextKey: z.string().optional(), hash: z.string(), route: z.string(), status: z.enum(['started', 'done']), baseVersion: z.number().int(), baseChangeId: z.number().int(), startedAt: z.string(), result: z.unknown().optional(), outcome: z.enum(['not-applied', 'saved', 'uncertain']).optional(), version: z.number().int().optional() }).strict();
export const SimSchema = z.object({
  format: z.literal('planb-rescue-sim-v1'), online: z.boolean(), counter: z.number().int().min(0), records: z.array(RecordSchema).max(MAX_SIM_RECORDS),
  calls: z.object({ read: z.number().int().min(0), create: z.number().int().min(0), update: z.number().int().min(0), relate: z.number().int().min(0) }).strict(),
  creates: z.array(z.object({ operationId: z.string(), remoteId: z.string(), subject: z.string() }).strict()).max(MAX_SIM_RECORDS), lostAckArmed: z.boolean(), driftApplied: z.boolean(),
}).strict();
export type SimData = z.infer<typeof SimSchema>;
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
export const CapsuleSchema = z.object({
  format: z.literal(CAPSULE_FORMAT), createdAt: z.string(),
  origin: z.object({ roomId: z.string().min(8).max(80), incidentId: z.string(), context: ContextSchema, stage: z.enum(stages), version: z.number().int().min(1), label: z.string().max(200) }).strict(),
  capture: z.object({ stateVersion: z.number().int().min(1), journalEvents: z.number().int().min(1).max(MAX_JOURNAL_EVENTS), idemRecords: z.number().int().min(0).max(MAX_IDEM_RECORDS), changeMaxId: z.number().int().min(0), changeCount: z.number().int().min(0), recordCount: z.number().int().min(0), simCalls: z.number().int().min(0), simRecords: z.number().int().min(0), uncertainOps: z.number().int().min(0), approvedPlan: z.boolean(), attempts: z.number().int().min(1).max(5) }).strict(),
  components: z.object({
    bundle: BundleSchema,
    rescue: z.object({ state: StateSchema, journal: z.array(EventSchema).max(MAX_JOURNAL_EVENTS), idem: z.record(z.string().max(120), idemRecord) }).strict(),
    recovery: z.object({ plan: RecoveryPlanSchema.nullable(), watermark: z.number().int().min(0), mapping: z.record(z.string(), z.string().min(1)) }).strict(),
    sim: SimSchema,
  }).strict(),
  digests: z.object({ bundle: hex64, rescue: hex64, recovery: hex64, sim: hex64, set: hex64 }).strict(),
  limits: z.array(z.string().max(300)).max(20), notProven: z.array(z.string().max(300)).max(20),
}).strict();
export type Capsule = z.infer<typeof CapsuleSchema>;
export type Components = Capsule['components'];

/** Política por estado del origen: qué se conserva y qué se retira al abrir el destino. */
export const STAGE_POLICY: Record<RescueStage, { exportable: true; onImport: string }> = {
  preparation: { exportable: true, onImport: 'Se conserva la preparación; no hay trabajo local ni retorno.' },
  'local-work': { exportable: true, onImport: 'Se conservan plan, estimaciones, notas y cambios locales; el CRM simulado conserva su estado.' },
  'return-review': { exportable: true, onImport: 'Se conserva el plan de devolución EN REVISIÓN; una aprobación del origen se retira y exige revisar y aprobar de nuevo.' },
  'return-partial': { exportable: true, onImport: 'Se conservan las operaciones inciertas o fallidas tal cual (no pasan a pendientes); una aprobación se retira; no se reenvía nada automáticamente.' },
  'return-verified': { exportable: true, onImport: 'Se conserva la devolución simulada verificada; no queda nada por enviar.' },
  closed: { exportable: true, onImport: 'Se importa CERRADO y de consulta: el ensayo ya terminó; cerrar no significa negocio recuperado.' },
};
export class CapsuleError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); this.name = 'CapsuleError'; } }

/** Coherencia entre componentes capturados «a la vez». Un hash de cada componente no demuestra que sean del MISMO instante: se contrastan hechos cruzados. */
export function coherenceProblems(c: Capsule): string[] {
  const p: string[] = [], { bundle, rescue, recovery, sim } = c.components, state = rescue.state, journal = rescue.journal;
  if (state.context.workspaceId !== c.origin.context.workspaceId || state.context.captureRevision !== c.origin.context.captureRevision || state.stage !== c.origin.stage || state.version !== c.origin.version) p.push('El estado del incidente no corresponde a la procedencia declarada.');
  if (c.capture.stateVersion !== state.version) p.push('La versión capturada no coincide con la del estado (' + c.capture.stateVersion + ' ≠ ' + state.version + ').');
  if (c.capture.journalEvents !== journal.length) p.push('El número de hechos capturados no coincide con el diario.');
  if (c.capture.idemRecords !== Object.keys(rescue.idem).length) p.push('El número de registros de idempotencia no coincide.');
  const maxChange = bundle.changes.reduce((m, ch) => Math.max(m, ch.id), 0);
  if (c.capture.changeMaxId !== maxChange || c.capture.changeCount !== bundle.changes.length || c.capture.recordCount !== bundle.records.length) p.push('Los cambios o registros de la copia son de otro instante que el resto de la cápsula.');
  const calls = sim.calls.read + sim.calls.create + sim.calls.update + sim.calls.relate;
  if (c.capture.simCalls !== calls || c.capture.simRecords !== sim.records.length) p.push('El estado del CRM simulado es de otro instante que el resto de la cápsula.');
  const known = new Set([state.context.workspaceId, ...(state.lineage?.origins ?? [])]);
  journal.forEach((e: RescueEvent, i: number) => { if (e.seq !== i + 1) p.push('Secuencia del diario rota en el hecho ' + (i + 1) + '.'); if (!known.has(e.workspaceId)) p.push('El hecho ' + e.seq + ' pertenece a otro espacio.'); if (e.stateVersion > state.version) p.push('El hecho ' + e.seq + ' es posterior al estado.'); });
  const changeIds = new Set(bundle.changes.map(ch => ch.id)), recordIds = new Set(bundle.records.map(r => r.entity + ':' + r.id));
  for (const e of journal) {
    if (e.kind === 'local-edit' && typeof e.data.changeId === 'number' && !changeIds.has(e.data.changeId) && !state.lineage) p.push('El hecho ' + e.seq + ' cita un cambio local que la copia no contiene.');
    if (e.kind === 'local-create' && typeof e.data.recordId === 'string' && !recordIds.has('tasks:' + e.data.recordId) && !state.lineage) p.push('El hecho ' + e.seq + ' cita una tarea que la copia no contiene.');
  }
  const simIds = new Set(sim.records.map(r => r.entity + ':' + r.id));
  for (const cr of sim.creates) if (!simIds.has('tasks:' + cr.remoteId)) p.push('El CRM simulado registra un create sin su registro (' + cr.remoteId + ').');
  if (sim.creates.length !== sim.calls.create && sim.calls.create >= sim.creates.length) { /* llamadas fallidas previas al efecto no existen en este simulador: create siempre persiste */ }
  if (sim.creates.length > sim.calls.create) p.push('Hay más creates registrados que llamadas create.');
  const plan = recovery.plan;
  if (['return-review', 'return-partial', 'return-verified'].includes(state.stage) && !plan) p.push('El estado exige un plan de devolución y la cápsula no lo contiene.');
  if (plan) {
    if (plan.source !== 'simulation') p.push('El plan de devolución no es del simulador.');
    if (state.returnPlanId && state.returnPlanId !== plan.id) p.push('El plan de devolución no es el del estado.');
    for (const op of plan.operations) { if (op.remoteId && op.status !== 'pending' && !simIds.has(op.entity + ':' + op.remoteId) && op.status === 'applied') p.push('La operación verificada ' + op.id.slice(0, 8) + ' apunta a un registro que el simulador no tiene.'); }
  }
  if (c.capture.uncertainOps !== (plan?.operations.filter(o => o.status === 'uncertain' || o.status === 'sending').length ?? 0)) p.push('El recuento de operaciones inciertas no coincide con el plan.');
  if (c.capture.approvedPlan !== (plan?.status === 'approved')) p.push('El estado de aprobación declarado no coincide con el plan.');
  return p;
}

export interface CapsuleSummary {
  origin: Capsule['origin']; createdAt: string; revision: string; records: number; changes: number; journalEvents: number; idemRecords: number; simRecords: number; simCreates: number;
  uncertainOps: { id: string; label: string; error: string | null }[]; approvedPlan: boolean; stageLabel: string; policy: string; warnings: string[]; limits: string[];
}
export function summarize(c: Capsule, revision: string): CapsuleSummary {
  const plan = c.components.recovery.plan, warnings: string[] = [];
  if (plan?.status === 'approved') warnings.push('El plan está aprobado en el origen: al abrir el destino la aprobación se RETIRA y habrá que revisar de nuevo.');
  const uncertain = (plan?.operations ?? []).filter(o => o.status === 'uncertain' || o.status === 'sending');
  if (uncertain.length) warnings.push(uncertain.length + ' operación(es) incierta(s): se conservan como inciertas; no se recrean ni se envían automáticamente.');
  if (c.components.sim.lostAckArmed) warnings.push('Hay un fallo de acuse perdido armado en el simulador: el destino lo desarma.');
  if (c.components.rescue.journal.length > MAX_JOURNAL_EVENTS - 50) warnings.push('El diario está cerca de su capacidad (' + c.components.rescue.journal.length + ' de ' + MAX_JOURNAL_EVENTS + ').');
  return { origin: c.origin, createdAt: c.createdAt, revision, records: c.components.bundle.records.length, changes: c.components.bundle.changes.length, journalEvents: c.components.rescue.journal.length, idemRecords: Object.keys(c.components.rescue.idem).length,
    simRecords: c.components.sim.records.length, simCreates: c.components.sim.creates.length, uncertainOps: uncertain.map(o => ({ id: o.id, label: o.label, error: o.error })), approvedPlan: plan?.status === 'approved', stageLabel: STAGE_LABEL[c.origin.stage], policy: STAGE_POLICY[c.origin.stage].onImport, warnings, limits: c.limits };
}

// ---------------------------------------------------------------- informe comparativo origen/destino
export interface CompareSide { roomId: string; stage: string; version: number; revision: string; records: number; changes: number; journalEvents: number; simRecords: number; simCreates: number; simCreateCalls: number; uncertain: number; approvedPlan: boolean }
export interface CompareInput { generatedAt: string; capsule: { sha256: string; bytes: number; revision: string; createdAt: string }; origin: CompareSide; destination: CompareSide | null; retired: string[]; preserved: string[]; estimatedPlanScope: string; timings: { technical: { label: string; ms: number }[] }; notes: string[] }
export interface CompareReport { format: 'planb-rescue-capsule-report-v1'; banner: string; generatedAt: string; sections: { title: string; rows: [string, string][] }[]; notProven: string[]; timing: { technical: { label: string; ms: number }[]; note: string } }
export function buildComparison(i: CompareInput): CompareReport {
  const side = (s: CompareSide | null): [string, string][] => s ? [['Sala', s.roomId], ['Estado', s.stage + ' (versión ' + s.version + ')'], ['Revisión de captura', s.revision.slice(0, 16) + '…'], ['Registros / cambios', s.records + ' / ' + s.changes], ['Hechos del diario', String(s.journalEvents)], ['CRM simulado', s.simRecords + ' registros, ' + s.simCreates + ' creates registrados, ' + s.simCreateCalls + ' llamadas create'], ['Operaciones inciertas', String(s.uncertain)], ['Plan aprobado', s.approvedPlan ? 'sí' : 'no']] : [['Destino', 'Todavía no se ha abierto']];
  return { format: 'planb-rescue-capsule-report-v1', banner: BANNER, generatedAt: i.generatedAt, sections: [
    { title: 'Cápsula', rows: [['SHA-256 del archivo', i.capsule.sha256], ['Tamaño', i.capsule.bytes + ' bytes'], ['Revisión del conjunto', i.capsule.revision], ['Creada', i.capsule.createdAt]] },
    { title: 'Origen', rows: side(i.origin) }, { title: 'Destino (carpeta y proceso nuevos)', rows: side(i.destination) },
    { title: 'Conservado', rows: i.preserved.map((p, n): [string, string] => [String(n + 1), p]) }, { title: 'Retirado o desarmado', rows: i.retired.length ? i.retired.map((p, n): [string, string] => [String(n + 1), p]) : [['—', 'Nada']] },
    { title: 'Alcance del plan', rows: [['Plan', i.estimatedPlanScope]] }, { title: 'Notas', rows: i.notes.map((n, k): [string, string] => [String(k + 1), n]) },
  ], notProven: NOT_PROVEN, timing: { technical: i.timings.technical, note: 'Tiempos técnicos de servidor; no son un RTO ni un tiempo de usuario y no se suman a ninguno.' } };
}
export function renderComparisonHtml(r: CompareReport): string {
  const rows = (s: CompareReport['sections'][number]) => '<h2>' + escapeHtml(s.title) + '</h2><table><tbody>' + s.rows.map(([a, b]) => '<tr><th scope="row">' + escapeHtml(a) + '</th><td>' + escapeHtml(b) + '</td></tr>').join('') + '</tbody></table>';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Plan B · Informe comparativo del relevo</title>' +
    '<style>body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#19314f;background:#f2f4f7;margin:0;padding:24px}main{max-width:900px;margin:0 auto;background:#fffefd;border:1px solid #d9e1eb;border-radius:8px;padding:24px;overflow-wrap:anywhere}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.banner{background:#fff7e8;color:#835c1c;border:1px solid #e6cf92;border-radius:4px;padding:8px 12px;font-weight:600}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-top:1px solid #d9e1eb;padding:6px 8px;vertical-align:top}th{width:34%}</style></head><body><main><h1>Informe comparativo del relevo</h1><p class="banner">' + escapeHtml(r.banner) + '</p><p>Generado ' + escapeHtml(r.generatedAt) + '</p>' +
    r.sections.map(rows).join('') + '<h2>Tiempos técnicos</h2><p>' + escapeHtml(r.timing.technical.map(t => t.label + ' ' + t.ms + ' ms').join('; ') || 'sin datos') + '</p><p>' + escapeHtml(r.timing.note) + '</p><h2>Lo que este ensayo no demuestra</h2><ul>' + r.notProven.map(n => '<li>' + escapeHtml(n) + '</li>').join('') + '</ul></main></body></html>\n';
}
export type { CrmRecord, RescueState };
