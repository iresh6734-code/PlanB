import type { ContinuityEvidenceApiResponse } from './continuity-evidence-api.js';
import type { ReadCheckApiState } from './hubspot-read-check-api.js';
import type { ResponseQueue } from './response-queue.js';
import type { CaptureComparison } from './capture-comparison.js';
import type { EntityName } from './model.js';
import { contextLabel, readWindow, safeText, when, type Basis, type Currency, type PassportAction, type PassportWorkSummary, type RelayRehearsalRecord, type SourceInput } from './continuity-passport.js';

// MAPA DE IMPACTO Y RESUMEN DE TURNO (unidad 215). Modelo puro y de SOLO LECTURA: convierte entradas explícitas en «qué podría impedir que sigamos trabajando».
// No consulta, no captura, no envía. Principios: una referencia a un registro que la captura no contiene es «sin comprobar», NUNCA «se borró del CRM»; cero observado ≠ desconocido;
// evidencia de otra copia no se mezcla; cada fila abre una superficie existente o explica qué acción falta; el resumen solo usa palabras y cifras que los contratos acreditan.
export const IMPACT_FORMAT = 'planb-impact-map-v1';
export type RowStatus = 'blocked' | 'attention' | 'unknown' | 'ok';
export type RowArea = 'copy' | 'coverage' | 'references' | 'age' | 'work' | 'access' | 'recovery' | 'changes';
export interface ContextualSource<T> extends SourceInput<T> {
  /** Identidad del contexto de captura a la que pertenece esta lectura (misma notación que `expectedContext`). Distinta ⇒ otra copia: no se usa. */
  context: string | null;
}
export interface InventoryInput { capturedAt: string | null; counts: Record<EntityName, number> }
export interface ComparisonInput { fromAt: string | null; toAt: string | null; chronological: boolean; counts: CaptureComparison['records']['counts']; totalDifferences: number; truncated: boolean }
export interface QueueInput { evaluatedAt: string; summary: ResponseQueue['summary']; unavailableReferences: { entity: EntityName; tasks: number }[]; sampleTruncated: boolean }
export interface ImpactInputs {
  now: number;
  /** Contexto de captura de la copia ACTIVA (misma notación que `context` de cada fuente). */
  expectedContext: string | null;
  copy: ContextualSource<ContinuityEvidenceApiResponse>;
  inventory: ContextualSource<InventoryInput>;
  comparison: ContextualSource<ComparisonInput>;
  queue: ContextualSource<QueueInput>;
  work: ContextualSource<PassportWorkSummary>;
  hubspot: SourceInput<ReadCheckApiState>;
  relay: ContextualSource<RelayRehearsalRecord>;
  /** Enlace LOCAL y RELATIVO a la evidencia (p. ej. «#/continuidad»). Solo se conserva si es una ruta relativa simple; nunca una URL ni una ruta del equipo. */
  evidenceLink?: string | null;
}
export interface ImpactRow {
  id: string; area: RowArea; title: string; status: RowStatus; detail: string;
  basis: Basis; currency: Currency; at: string | null; context: string | null;
  /** Superficie existente que lo resuelve; `null` si no hay acción disponible desde aquí. */
  action: PassportAction | null;
  /** Si no hay acción: qué falta. Nunca queda una fila problemática sin acción ni explicación. */
  missing: string | null;
  limits: string[];
}
export interface ShiftSummary {
  lead: string;
  lines: { text: string; status: RowStatus }[];
  firstDecision: { title: string; action: PassportAction; detail: string } | null;
  handoffPlan: string[];
  evidenceLink: string | null;
}
export interface ImpactMap { format: typeof IMPACT_FORMAT; generatedAt: string; context: string | null; rows: ImpactRow[]; summary: ShiftSummary; provenance: { source: string; status: SourceInput<unknown>['status']; at: string | null; usable: boolean }[] }

const ENTITY_LABEL: Record<EntityName, string> = { contacts: 'clientes', companies: 'empresas', deals: 'oportunidades', tasks: 'tareas' };
const ENTITIES: EntityName[] = ['contacts', 'companies', 'deals', 'tasks'];
const RANK: Record<RowStatus, number> = { blocked: 0, attention: 1, unknown: 2, ok: 3 };
/** Orden de urgencia DENTRO de cada estado: sin copia, antigüedad, guardados por comprobar (riesgo de perder trabajo), borradores, vencidas, referencias, acceso, recuperación, cobertura y cambios. */
const PRIORITY = ['copy', 'other-context', 'age:copy', 'work:uncertain', 'work:drafts', 'work:unreadable', 'work', 'queue:overdue', 'queue:review', 'queue', 'references:', 'access:', 'recovery:export', 'recovery:rehearsal', 'recovery:practice', 'coverage:', 'changes:'];
const priority = (id: string): number => { const i = PRIORITY.findIndex(p => id === p || (p.endsWith(':') && id.startsWith(p))); return i === -1 ? PRIORITY.length : i; };
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const stamp = (at: string | null) => at === null || !Number.isFinite(Date.parse(at)) ? null : at;
const ago = (fromIso: string | null, now: number): string => {
  const t = fromIso ? Date.parse(fromIso) : NaN; if (!Number.isFinite(t) || !Number.isFinite(now)) return 'hace un tiempo desconocido';
  const minutes = Math.max(0, Math.round((now - t) / 60_000)); return minutes < 90 ? 'hace ' + plural(minutes, 'minuto', 'minutos') : minutes < 48 * 60 ? 'hace ' + plural(Math.round(minutes / 60), 'hora', 'horas') : 'hace ' + plural(Math.round(minutes / 1440), 'día', 'días');
};
/** Solo una ruta relativa simple (p. ej. `#/continuidad`): nunca una URL, una unidad de disco ni una ruta del equipo. */
export const safeLocalLink = (value: unknown): string | null => typeof value === 'string' && /^[#/][A-Za-z0-9_\-./?=&#]{0,119}$/.test(value) && !value.includes('//') && !value.includes('..') ? value : null;

export type RelayKind = 'none' | 'unavailable' | 'other-copy' | 'unknown-scope' | 'fiction' | 'bound';
/** Dictamen ÚNICO del ensayo de relevo. `fiction`: práctica con datos ficticios, alcance propio (no se liga a ninguna captura ni acredita la copia activa). `bound`: ligado a la captura exacta de la copia activa.
 *  `unknown-scope`: sin captura ni procedencia ficticia declarada. `other-copy`: otra captura identificada. La antigüedad usa el reloj del mapa: fecha o reloj no válidos = vigencia desconocida, nunca vigente. */
export interface RelayEvaluation { kind: RelayKind; record: RelayRehearsalRecord | null; currency: Currency; status: RowStatus; action: PassportAction | null }
const relayOutcome = (r: RelayRehearsalRecord) => r.outcome === 'completed' ? 'completado' : r.outcome === 'failed' ? 'falló' : 'interrumpido';
function evaluateRelay(input: ImpactInputs, maxEvidenceMinutes: number): RelayEvaluation {
  const src = input.relay, none = (kind: 'none' | 'unavailable'): RelayEvaluation => ({ kind, record: null, currency: 'unknown', status: 'unknown', action: null });
  if (src.status === 'unavailable') return none('unavailable');
  const r = src.status === 'read' ? src.value : null; if (!r) return none('none');
  const expected = input.expectedContext, fiction = r.scope === 'fiction';
  if (!fiction && (expected === null || src.context !== expected || (r.captureId !== null && r.captureId !== expected))) return { kind: 'other-copy', record: r, currency: 'unknown', status: 'unknown', action: null };
  const minutes = (input.now - Date.parse(r.rehearsedAt)) / 60_000, valid = Number.isFinite(minutes);
  const currency: Currency = !valid ? 'unknown' : minutes > maxEvidenceMinutes ? 'expired' : 'current', done = r.outcome === 'completed', retry: PassportAction = expected !== null ? 'start-rehearsal' : 'open-preparation';
  if (fiction) return { kind: 'fiction', record: r, currency, status: done ? 'ok' : 'attention', action: done ? null : retry };
  if (r.captureId === null) return { kind: 'unknown-scope', record: r, currency: 'unknown', status: 'unknown', action: retry };
  return { kind: 'bound', record: r, currency, status: !done || currency === 'expired' ? 'attention' : currency === 'unknown' ? 'unknown' : 'ok', action: !done || currency === 'expired' ? retry : null };
}

export function buildImpactMap(input: ImpactInputs): ImpactMap {
  const rows: ImpactRow[] = [], provenance: ImpactMap['provenance'] = [];
  const row = (r: Omit<ImpactRow, 'limits' | 'missing'> & { limits?: string[]; missing?: string | null }) => rows.push({ limits: [], missing: r.action === null && r.status !== 'ok' ? 'No hay una acción disponible desde aquí para resolver esto.' : null, ...r });
  const nowIso = Number.isFinite(input.now) ? new Date(input.now).toISOString() : '';
  // Una fuente solo se usa si se pudo leer Y es del contexto activo; si no, se declara aparte y no se mezcla.
  const usable = <T,>(name: string, source: ContextualSource<T>, label: string): T | null => {
    const sameContext = input.expectedContext !== null && source.context === input.expectedContext;
    const ok = source.status === 'read' && !!source.value && sameContext;
    provenance.push({ source: name, status: source.status, at: stamp(source.at), usable: ok });
    if (source.status === 'read' && source.value && !sameContext) row({ id: 'other-context:' + name, area: 'copy', title: label + ': datos de otra copia', status: 'unknown', detail: 'Esta lectura pertenece a otra captura (' + (contextLabel(source.context) ?? 'sin identificar') + ') y no se mezcla con la copia activa' + (input.expectedContext ? ' (' + contextLabel(input.expectedContext) + ')' : '') + '. No se usa para este mapa.', basis: 'unverified', currency: 'unknown', at: stamp(source.at), context: source.context, action: null, missing: 'Volver a leer esta fuente con la copia activa.' });
    return ok ? source.value : null;
  };
  const copy = usable('copy', input.copy, 'Evidencia de la copia'), inventory = usable('inventory', input.inventory, 'Cobertura'), comparison = usable('comparison', input.comparison, 'Comparación de capturas'),
    queue = usable('queue', input.queue, 'Cola de respuesta'), work = usable('work', input.work, 'Trabajo local');
  const maxEvidence = copy && copy.available ? copy.parameters.maxEvidenceAgeMinutes : 1440, relay = evaluateRelay(input, maxEvidence);
  provenance.push({ source: 'relay', status: input.relay.status, at: stamp(input.relay.at), usable: relay.kind === 'fiction' || relay.kind === 'bound' || relay.kind === 'unknown-scope' });
  if (relay.kind === 'other-copy') row({ id: 'other-context:relay', area: 'copy', title: 'Ensayo de relevo: datos de otra copia', status: 'unknown', detail: 'Esta lectura pertenece a otra captura (' + (contextLabel(relay.record!.captureId ?? input.relay.context) ?? 'sin identificar') + ') y no se mezcla con la copia activa' + (input.expectedContext ? ' (' + contextLabel(input.expectedContext) + ')' : '') + '. No se usa para este mapa.', basis: 'unverified', currency: 'unknown', at: stamp(input.relay.at), context: relay.record!.captureId ?? input.relay.context, action: null, missing: 'Volver a leer esta fuente con la copia activa.' });
  provenance.push({ source: 'hubspot', status: input.hubspot.status, at: stamp(input.hubspot.at), usable: input.hubspot.status === 'read' && !!input.hubspot.value });
  const ctx = input.expectedContext, copyOk = !!copy && copy.available, facts = copy && copy.available ? copy.facts : null;

  // ── Copia activa ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (input.copy.status === 'read' && input.copy.value && !input.copy.value.available) row({ id: 'copy', area: 'copy', title: 'No hay una copia local utilizable', status: 'blocked', detail: input.copy.value.error, basis: 'observed', currency: 'current', at: stamp(input.copy.at), context: ctx, action: 'open-preparation' });
  else if (!copy) row({ id: 'copy', area: 'copy', title: 'No se ha leído la evidencia de la copia', status: 'unknown', detail: input.copy.status === 'unavailable' ? 'No se pudo leer: se desconoce el estado de la copia.' : 'Todavía no se ha pedido: se desconoce el estado de la copia.', basis: 'unverified', currency: 'unknown', at: stamp(input.copy.at), context: ctx, action: 'open-continuity' });
  else if (facts) {
    const max = copy!.available ? copy!.parameters.maxDataAgeMinutes : 60, age = Math.round((input.now - Date.parse(facts.snapshot.capturedAt)) / 60_000);
    row({ id: 'age:copy', area: 'age', title: 'Antigüedad de la copia', status: Number.isFinite(age) && age > max ? 'attention' : 'ok', detail: 'Captura ' + ago(facts.snapshot.capturedAt, input.now) + ' (' + when(facts.snapshot.capturedAt) + '); objetivo de antigüedad: ' + max + ' min.' + (Number.isFinite(age) && age > max ? ' La copia es anterior a ese objetivo: puede faltar lo que cambió después en el CRM.' : ''), basis: 'observed', currency: 'current', at: facts.snapshot.capturedAt, context: ctx, action: Number.isFinite(age) && age > max ? 'open-preparation' : null, limits: ['Compara la fecha de captura con el objetivo; no consulta el CRM.'] });
  }

  // ── Cobertura por entidad ──────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const entity of ENTITIES) {
    const label = ENTITY_LABEL[entity];
    if (!inventory) { row({ id: 'coverage:' + entity, area: 'coverage', title: 'Cobertura de ' + label, status: 'unknown', detail: 'No se conoce cuántos registros de ' + label + ' hay en la copia activa (no es cero).', basis: 'unverified', currency: 'unknown', at: null, context: ctx, action: copyOk ? 'open-continuity' : 'open-preparation' }); continue; }
    const n = inventory.counts[entity];
    row({ id: 'coverage:' + entity, area: 'coverage', title: 'Cobertura de ' + label, status: n > 0 ? 'ok' : 'attention', detail: n > 0 ? plural(n, 'registro', 'registros') + ' de ' + label + ' en la copia: se puede trabajar con ellos en local.' : 'La captura no trae registros de ' + label + ' (pudo no capturarse o no existir): no se puede trabajar con ellos en local.',
      basis: 'observed', currency: 'current', at: stamp(inventory.capturedAt), context: ctx, action: n > 0 ? null : 'open-preparation', limits: ['Es lo que contiene la captura, no el estado actual del CRM.'] });
  }

  // ── Referencias que la captura no puede comprobar ─────────────────────────────────────────────────────────────────────────────────
  if (queue) {
    for (const gap of queue.unavailableReferences.filter(g => g.tasks > 0)) row({ id: 'references:' + gap.entity, area: 'references', title: 'Referencias a ' + ENTITY_LABEL[gap.entity] + ' sin comprobar', status: 'unknown',
      detail: plural(gap.tasks, 'tarea menciona', 'tareas mencionan') + ' ' + ENTITY_LABEL[gap.entity] + ' que la copia no contiene: no se puede comprobar el dato relacionado. No significa que se haya borrado del CRM' + (queue.sampleTruncated ? '. Se revisó solo la parte de la cola devuelta.' : '.'),
      basis: 'observed', currency: 'current', at: stamp(queue.evaluatedAt), context: ctx, action: 'open-today', limits: ['La captura no incluye esos registros; no se ha consultado el CRM.'] });
  }

  // ── Cola y trabajo que requiere intervención ──────────────────────────────────────────────────────────────────────────────────────
  if (queue) {
    const s = queue.summary, at = stamp(queue.evaluatedAt);
    row({ id: 'queue:overdue', area: 'work', title: 'Tareas vencidas', status: s.buckets.overdue > 0 ? 'attention' : 'ok', detail: s.buckets.overdue > 0 ? plural(s.buckets.overdue, 'tarea vencida', 'tareas vencidas') + ' en la copia a ' + when(queue.evaluatedAt) + '.' : 'Ninguna tarea vencida en la copia a ' + when(queue.evaluatedAt) + '.', basis: 'observed', currency: 'current', at, context: ctx, action: s.buckets.overdue > 0 ? 'open-today' : null });
    if (s.buckets['needs-review'] > 0 || s.unknownStatusTasks > 0) row({ id: 'queue:review', area: 'work', title: 'Tareas con datos por revisar', status: 'unknown', detail: plural(s.buckets['needs-review'], 'tarea necesita revisión', 'tareas necesitan revisión') + ' de datos' + (s.unknownStatusTasks ? ' y ' + plural(s.unknownStatusTasks, 'tarea con estado que no se reconoce', 'tareas con estado que no se reconoce') : '') + '.', basis: 'observed', currency: 'current', at, context: ctx, action: 'open-today' });
  } else row({ id: 'queue', area: 'work', title: 'Cola de respuesta', status: 'unknown', detail: 'No se ha leído la cola de esta copia: se desconoce cuántas tareas hay vencidas o por revisar.', basis: 'unverified', currency: 'unknown', at: stamp(input.queue.at), context: ctx, action: copyOk ? 'open-today' : 'open-preparation' });
  if (!work) row({ id: 'work', area: 'work', title: 'Trabajo local por comprobar', status: 'unknown', detail: 'No se pudo leer el trabajo local pendiente: se desconoce cuánto hay (no es cero).', basis: 'unverified', currency: 'unknown', at: stamp(input.work.at), context: ctx, action: 'open-today' });
  else if (work.status === 'read' && work.coverage === 'none') row({ id: 'work', area: 'work', title: 'Trabajo local sin cobertura', status: 'unknown', detail: 'El cuaderno no cubre esta copia: se desconoce cuánto trabajo local hay (no es cero).', basis: 'unverified', currency: 'unknown', at: stamp(work.at), context: ctx, action: 'open-today' });
  else if (work.status === 'unavailable' || !work.counts) row({ id: 'work', area: 'work', title: 'Trabajo local por comprobar', status: 'unknown', detail: 'El cuaderno de trabajo local no se pudo leer: se desconoce cuánto hay (no es cero).', basis: 'unverified', currency: 'unknown', at: stamp(work.at), context: ctx, action: 'open-today' });
  else {
    const c = work.counts;
    row({ id: 'work:uncertain', area: 'work', title: 'Guardados por comprobar', status: c.unknownOutcome > 0 ? 'attention' : 'ok', detail: c.unknownOutcome > 0 ? plural(c.unknownOutcome, 'guardado salió y no se sabe si se aplicó', 'guardados salieron y no se sabe si se aplicaron') + '. Comprobarlo es una lectura; no se reenvía nada.' : 'Ningún guardado por comprobar en el momento de la lectura.', basis: 'observed', currency: 'current', at: stamp(work.at), context: ctx, action: c.unknownOutcome > 0 ? 'open-today' : null, limits: ['Solo recuento; el seguimiento en memoria no viaja en una cápsula.'] });
    if (c.drafts > 0) row({ id: 'work:drafts', area: 'work', title: 'Borradores sin enviar', status: 'attention', detail: plural(c.drafts, 'borrador recuperable sin enviar', 'borradores recuperables sin enviar') + '.', basis: 'observed', currency: 'current', at: stamp(work.at), context: ctx, action: 'open-today' });
    if (c.unreadable > 0) row({ id: 'work:unreadable', area: 'work', title: 'Entradas del cuaderno ilegibles', status: 'unknown', detail: plural(c.unreadable, 'entrada ilegible o en cuarentena', 'entradas ilegibles o en cuarentena') + ': se desconoce qué contenían.', basis: 'observed', currency: 'current', at: stamp(work.at), context: ctx, action: null, missing: 'Falta una superficie para revisar las entradas en cuarentena.' });
  }

  // ── Acceso al CRM ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // La vigencia se deriva SIEMPRE de las fechas de la observación y del reloj del mapa (`readWindow`, la misma regla del pasaporte 214), no del booleano `view.fresh` del instante en que llegó la respuesta.
  // Fila, acción, resumen y exportación leen esta misma evaluación; regenerar con otro reloj no pide ninguna lectura al proveedor.
  const hs = input.hubspot.status === 'read' ? input.hubspot.value : null;
  if (!hs) row({ id: 'access:hubspot', area: 'access', title: 'Lectura de HubSpot', status: 'unknown', detail: input.hubspot.status === 'unavailable' ? 'No se pudo consultar el estado de la lectura de HubSpot.' : 'No se ha consultado el estado de la lectura de HubSpot.', basis: 'unverified', currency: 'unknown', at: stamp(input.hubspot.at), context: null, action: 'open-integrations' });
  else if (!hs.configured) row({ id: 'access:hubspot', area: 'access', title: 'Lectura de HubSpot', status: 'ok', detail: 'No hay credencial de HubSpot guardada: no hay acceso que depender de comprobar.', basis: 'not-applicable', currency: 'not-applicable', at: stamp(input.hubspot.at), context: null, action: null });
  else if (!hs.evidence) {
    const checking = readWindow(hs, input.now).checking;
    row({ id: 'access:hubspot', area: 'access', title: 'Lectura de HubSpot', status: 'unknown', detail: checking ? 'Hay una comprobación de la lectura en curso' + (hs.running ? ' desde el ' + when(hs.running.since) : '') + ' y su resultado todavía no consta: no es una caducidad.' : 'Hay una credencial guardada para el portal ' + hs.portal!.id + ' y la lectura no se ha comprobado: guardada no prueba que dé acceso hoy.', basis: checking ? 'observed' : 'declared', currency: 'unknown', at: checking && hs.running ? stamp(hs.running.since) : null, context: null, action: checking || hs.consent.allowed ? 'open-integrations' : null, missing: checking || hs.consent.allowed ? null : 'Esta comprobación solo está autorizada para cuentas de ensayo.' });
  } else {
    const ev = hs.evidence, win = readWindow(hs, input.now), currency: Currency = win.currency ?? 'unknown', verified = ev.state === 'read_verified', ok = verified && currency === 'current';
    const status: RowStatus = ok ? 'ok' : win.checking || (verified && currency === 'unknown') ? 'unknown' : 'attention';
    const action: PassportAction | null = ok ? null : win.checking || hs.consent.allowed ? 'open-integrations' : null;
    row({ id: 'access:hubspot', area: 'access', title: 'Lectura de HubSpot', status, detail: (verified ? 'Lectura comprobada' : ev.state === 'partial' ? 'Lectura parcial' : 'La lectura no se pudo comprobar') + ' el ' + when(ev.checkedAt) + ' en el portal ' + (ev.portalId ?? hs.portal!.id)
        + (currency === 'current' ? '.' : currency === 'expired' ? '. Esta comprobación caducó: ya no acredita el acceso actual.' : '. No se puede determinar si sigue vigente (reloj o ventana de vigencia no válidos): no acredita el acceso actual.')
        + (win.checking ? ' Hay una comprobación en curso' + (hs.running ? ' desde el ' + when(hs.running.since) : '') + ' y su resultado todavía no consta: no es una caducidad.' : ''),
      basis: 'observed', currency, at: stamp(ev.checkedAt), context: null, action, missing: !ok && action === null ? 'Esta comprobación solo está autorizada para cuentas de ensayo.' : null, limits: ['Una lectura comprobada no significa que la copia esté al día.'] });
  }

  // ── Recuperación ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (facts) {
    const exp = facts.export;
    row({ id: 'recovery:export', area: 'recovery', title: 'Exportación de la copia', status: !exp.present || exp.matchesActiveRevision === false ? 'attention' : 'ok', detail: !exp.present ? 'No consta una exportación de esta copia.' : exp.matchesActiveRevision === false ? 'Hay un registro de exportación que NO coincide con la revisión activa.' : 'Hay un registro de exportación' + (exp.matchesActiveRevision ? ' que coincide con la revisión activa' : '') + '; su custodia es declarada y no se han examinado los bytes.', basis: exp.present ? 'declared' : 'unverified', currency: 'unknown', at: null, context: ctx, action: !exp.present || exp.matchesActiveRevision === false ? 'open-export' : null });
  }
  // Un único dictamen del ensayo (`evaluateRelay`) alimenta fila, resumen y exportación. El ensayo FICTICIO tiene alcance propio: practica el recorrido y no acredita la copia activa.
  if (relay.kind === 'fiction') {
    const r = relay.record!;
    row({ id: 'recovery:practice', area: 'recovery', title: 'Práctica de relevo con datos ficticios', status: relay.status, detail: 'Práctica del ' + when(r.rehearsedAt) + ' (' + relayOutcome(r) + ', mismo equipo, datos ficticios).' + (r.included.length ? ' Viajó: ' + r.included.slice(0, 8).map(item => safeText(item, 80)).join('; ') + '.' : '') + (relay.currency === 'expired' ? ' Es anterior a ' + Math.round(maxEvidence / 60) + ' h.' : '') + ' Practica el recorrido: no acredita la recuperación de la copia activa ni otro equipo.', basis: 'observed', currency: relay.currency, at: stamp(r.rehearsedAt), context: null, action: relay.action, limits: ['Alcance propio: datos ficticios en el mismo equipo.', 'No está ligada a la captura de esta copia.'] });
  } else if (relay.kind === 'bound' || relay.kind === 'unknown-scope') {
    const r = relay.record!;
    row({ id: 'recovery:rehearsal', area: 'recovery', title: 'Ensayo de relevo', status: relay.status, detail: 'Ensayo del ' + when(r.rehearsedAt) + ' (' + relayOutcome(r) + ', mismo equipo, datos ficticios).' + (r.included.length ? ' Viajó: ' + r.included.slice(0, 8).map(item => safeText(item, 80)).join('; ') + '.' : '')
      + (relay.kind === 'unknown-scope' ? ' No identifica con qué copia se ensayó: no acredita esta copia.' : relay.currency === 'expired' ? ' La evidencia es más antigua que ' + Math.round(maxEvidence / 60) + ' h.' : relay.currency === 'unknown' ? ' No se puede determinar su antigüedad (fecha o reloj no válidos).' : '') + ' No demuestra otro equipo.',
      basis: 'observed', currency: relay.currency, at: stamp(r.rehearsedAt), context: relay.kind === 'bound' ? ctx : null, action: relay.action, limits: ['Mismo equipo; no mide tiempos de recuperación.'] });
  } else row({ id: 'recovery:rehearsal', area: 'recovery', title: 'Ensayo de relevo', status: 'unknown', detail: relay.kind === 'unavailable' ? 'No se pudo leer el último ensayo de relevo: se desconoce si se ensayó.' : relay.kind === 'other-copy' ? 'Ensayo de otra copia: no acredita esta.' : 'No se ha ensayado un relevo con esta copia.', basis: 'unverified', currency: 'unknown', at: stamp(input.relay.at), context: ctx, action: copyOk ? 'start-rehearsal' : 'open-preparation' });

  // ── Cambios entre capturas ────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (comparison) {
    const total = comparison.totalDifferences;
    row({ id: 'changes:comparison', area: 'changes', title: 'Cambios desde la captura anterior', status: !comparison.chronological ? 'attention' : 'ok', detail: !comparison.chronological ? 'Las dos capturas no están en orden cronológico: la comparación no indica qué cambió después.' : total === 0 ? 'Entre ' + when(comparison.fromAt) + ' y ' + when(comparison.toAt) + ' no hay diferencias de registros.' : plural(total, 'registro distinto', 'registros distintos') + ' entre ' + when(comparison.fromAt) + ' y ' + when(comparison.toAt) + (comparison.truncated ? ' (lista acotada: pueden ser más)' : '') + ': ' + ENTITIES.map(e => { const c = comparison.counts[e]; return ENTITY_LABEL[e] + ' ' + (c.added + c.absent + c.changed); }).join(', ') + '.', basis: 'observed', currency: 'current', at: stamp(comparison.toAt), context: ctx, action: null, limits: ['Compara dos capturas; no consulta el CRM.'] });
  }

  rows.sort((a, b) => RANK[a.status] - RANK[b.status] || priority(a.id) - priority(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { format: IMPACT_FORMAT, generatedAt: nowIso, context: ctx, rows, summary: summarize(rows, { input, copy, facts, inventory, queue, work, relay, hs }), provenance };
}

function summarize(rows: ImpactRow[], c: { input: ImpactInputs; copy: ContinuityEvidenceApiResponse | null; facts: Extract<ContinuityEvidenceApiResponse, { available: true }>['facts'] | null; inventory: InventoryInput | null; queue: QueueInput | null; work: PassportWorkSummary | null; relay: RelayEvaluation; hs: ReadCheckApiState | null }): ShiftSummary {
  const lines: ShiftSummary['lines'] = [], now = c.input.now;
  if (c.facts) lines.push({ text: 'Tenemos una copia capturada el ' + when(c.facts.snapshot.capturedAt) + ' (' + ago(c.facts.snapshot.capturedAt, now) + ').', status: rows.find(r => r.id === 'age:copy')?.status ?? 'ok' });
  else lines.push({ text: c.copy && !c.copy.available ? 'No hay una copia local utilizable.' : 'Se desconoce el estado de la copia local.', status: c.copy && !c.copy.available ? 'blocked' : 'unknown' });
  if (c.inventory) { const withData = ENTITIES.filter(e => c.inventory!.counts[e] > 0), empty = ENTITIES.filter(e => c.inventory!.counts[e] === 0); lines.push({ text: withData.length === 0 ? 'La copia no trae registros de ninguna área.' : plural(withData.length, 'área admite', 'áreas admiten') + ' trabajo local (' + withData.map(e => ENTITY_LABEL[e]).join(', ') + ')' + (empty.length ? '; sin registros en la captura: ' + empty.map(e => ENTITY_LABEL[e]).join(', ') : '') + '.', status: empty.length ? 'attention' : 'ok' }); }
  else lines.push({ text: 'Se desconoce qué áreas tienen registros en la copia.', status: 'unknown' });
  if (c.work && c.work.counts) { const n = c.work.counts.unknownOutcome; lines.push({ text: n > 0 ? 'Queda ' + plural(n, 'operación por comprobar', 'operaciones por comprobar') + '.' : 'No consta ninguna operación por comprobar.', status: n > 0 ? 'attention' : 'ok' }); }
  else lines.push({ text: 'Se desconoce si hay operaciones por comprobar.', status: 'unknown' });
  if (c.queue) { const s = c.queue.summary; lines.push({ text: s.buckets.overdue > 0 ? plural(s.buckets.overdue, 'tarea vencida', 'tareas vencidas') + (s.buckets['needs-review'] ? ' y ' + plural(s.buckets['needs-review'], 'por revisar', 'por revisar') : '') + '.' : 'Ninguna tarea vencida' + (s.buckets['needs-review'] ? '; ' + s.buckets['needs-review'] + ' por revisar' : '') + '.', status: s.buckets.overdue > 0 ? 'attention' : 'ok' }); }
  for (const gap of (c.queue?.unavailableReferences ?? []).filter(g => g.tasks > 0)) lines.push({ text: plural(gap.tasks, 'tarea menciona', 'tareas mencionan') + ' ' + ENTITY_LABEL[gap.entity] + ' que la copia no contiene: referencia sin comprobar.', status: 'unknown' });
  const access = rows.find(r => r.id === 'access:hubspot'), inProgress = !!access && access.detail.includes('comprobación en curso');
  if (c.hs && c.hs.configured) lines.push({ text: c.hs.evidence ? 'La lectura de HubSpot se comprobó el ' + when(c.hs.evidence.checkedAt) + (access?.currency === 'expired' ? ' y caducó.' : access?.currency === 'unknown' ? '; no se puede determinar si sigue vigente.' : '.') + (inProgress ? ' Hay otra comprobación en curso.' : '') : inProgress ? 'Hay una comprobación de la lectura de HubSpot en curso: su resultado todavía no consta.' : 'La lectura de HubSpot guardada no se ha comprobado.', status: access?.status ?? 'unknown' });
  const rr = c.relay, rrRow = rows.find(r => r.id === 'recovery:rehearsal' || r.id === 'recovery:practice');
  if (rr.kind === 'fiction') lines.push({ text: 'El último ensayo de relevo (' + when(rr.record!.rehearsedAt) + ') se practicó con datos ficticios en el mismo equipo (' + relayOutcome(rr.record!) + ')' + (rr.currency === 'expired' ? ', hace más tiempo del vigente' : '') + ': demuestra el recorrido, no la recuperación de la copia activa.', status: rrRow?.status ?? rr.status });
  else if (rr.kind === 'bound') lines.push({ text: 'El último ensayo de relevo (' + when(rr.record!.rehearsedAt) + ') ' + (rr.record!.outcome === 'completed' ? 'recuperó' : 'no llegó a recuperar') + ' este alcance en el mismo equipo con datos ficticios' + (rr.currency === 'expired' ? ' y caducó' : rr.currency === 'unknown' ? '; no se puede determinar su antigüedad' : '') + (rr.record!.included.length ? ': ' + rr.record!.included.slice(0, 6).map(item => safeText(item, 60)).join('; ') : '') + '.', status: rrRow?.status ?? rr.status });
  else if (rr.kind === 'unknown-scope') lines.push({ text: 'Hay un ensayo de relevo (' + when(rr.record!.rehearsedAt) + ') sin copia identificada: no acredita esta copia.', status: 'unknown' });
  else if (rr.kind === 'unavailable') lines.push({ text: 'No se pudo leer el último ensayo de relevo.', status: 'unknown' });
  else lines.push({ text: 'No consta un ensayo de relevo con esta copia.', status: 'unknown' });
  lines.push({ text: 'No está demostrado: ' + (rr.kind === 'bound' && rr.record!.outcome === 'completed' ? '' : 'recuperación de la copia activa con sus datos, ') + 'recuperación en otro equipo, tiempos de recuperación ni autoría.', status: 'unknown' });
  const actionable = rows.filter(r => r.status !== 'ok' && r.action !== null);
  const first = actionable.find(r => r.status === 'blocked') ?? actionable.find(r => r.status === 'attention') ?? actionable[0] ?? null;
  const worst = rows.some(r => r.status === 'blocked') ? 'Hay un bloqueo para seguir trabajando en local.' : rows.some(r => r.status === 'attention') ? 'Se puede seguir, con ' + plural(rows.filter(r => r.status === 'attention').length, 'punto que requiere atención', 'puntos que requieren atención') + '.' : rows.some(r => r.status === 'unknown') ? 'No hay incidencias conocidas, pero ' + plural(rows.filter(r => r.status === 'unknown').length, 'punto sigue sin comprobar', 'puntos siguen sin comprobar') + '.' : 'Sin incidencias conocidas en lo que se ha podido comprobar.';
  return { lead: worst, lines, firstDecision: first && first.action ? { title: first.title, action: first.action, detail: first.detail } : null, handoffPlan: actionable.map(r => r.title + ': ' + (r.status === 'blocked' ? 'bloquea' : r.status === 'attention' ? 'requiere atención' : 'sin comprobar')), evidenceLink: safeLocalLink(c.input.evidenceLink ?? null) };
}

// ── Adaptadores desde contratos aceptados (solo lectura) ─────────────────────────────────────────────────────────────────────────────────
export function queueInput(queue: ResponseQueue): QueueInput {
  const byEntity = new Map<EntityName, number>();
  for (const item of queue.items) { const entities = new Set(item.references.filter(ref => !ref.available).map(ref => ref.entity)); for (const entity of entities) byEntity.set(entity, (byEntity.get(entity) ?? 0) + 1); }
  return { evaluatedAt: queue.evaluatedAt, summary: queue.summary, unavailableReferences: [...byEntity].map(([entity, tasks]) => ({ entity, tasks })), sampleTruncated: queue.summary.truncated };
}
export function comparisonInput(comparison: CaptureComparison, meta: { fromAt: string | null; toAt: string | null }): ComparisonInput {
  return { fromAt: meta.fromAt, toAt: meta.toAt, chronological: comparison.chronological, counts: comparison.records.counts, totalDifferences: comparison.records.totalDifferences, truncated: comparison.records.truncated };
}

// ── Exportación breve por LISTA BLANCA ─────────────────────────────────────────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<RowStatus, string> = { blocked: 'Bloquea', attention: 'Atención', unknown: 'Sin comprobar', ok: 'Sin incidencia' };
export { STATUS_LABEL };
export function impactExport(map: ImpactMap) {
  return {
    format: map.format, generatedAt: map.generatedAt, context: contextLabel(map.context),
    notice: 'Resumen de turno generado a partir de observaciones; no es una copia ni una verificación de recuperación.',
    summary: { lead: map.summary.lead, lines: map.summary.lines.map(l => ({ text: l.text, status: l.status })), firstDecision: map.summary.firstDecision ? { title: map.summary.firstDecision.title, action: map.summary.firstDecision.action } : null, handoffPlan: [...map.summary.handoffPlan], evidenceLink: map.summary.evidenceLink },
    rows: map.rows.map(r => ({ id: r.id, area: r.area, title: r.title, status: r.status, detail: r.detail, basis: r.basis, currency: r.currency, at: r.at, context: contextLabel(r.context), action: r.action, missing: r.missing, limits: [...r.limits] })),
    provenance: map.provenance.map(p => ({ source: p.source, status: p.status, at: p.at, usable: p.usable })),
  };
}
export const impactToJson = (map: ImpactMap): string => JSON.stringify(impactExport(map), null, 2) + '\n';
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function impactToHtml(map: ImpactMap): string {
  const e = impactExport(map);
  const css = 'body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:1.5rem auto;padding:0 1rem;color:#0f1a2b}h1{font-size:1.4rem}h2{font-size:1.05rem;margin:1.2rem 0 .4rem}ul{padding-left:1.1rem}li{margin:.3rem 0;overflow-wrap:anywhere}.n{background:#e8eefd;padding:.6rem;border-radius:6px}.s{font-weight:600}small{color:#394659}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen de turno</title><style>' + css + '</style></head><body>'
    + '<h1>Resumen de turno</h1><p><small>' + esc(e.notice) + ' · ' + esc(e.format) + ' · generado ' + esc(when(e.generatedAt)) + (e.context ? ' · ' + esc(e.context) : '') + '</small></p><p class="n">' + esc(e.summary.lead) + '</p>'
    + (e.summary.firstDecision ? '<p><strong>Primera decisión:</strong> ' + esc(e.summary.firstDecision.title) + '</p>' : '')
    + '<h2>Estado</h2><ul>' + e.summary.lines.map(l => '<li><span class="s">' + esc(STATUS_LABEL[l.status]) + '</span> ' + esc(l.text) + '</li>').join('') + '</ul>'
    + (e.summary.handoffPlan.length ? '<h2>Plan de relevo</h2><ol>' + e.summary.handoffPlan.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>' : '')
    + '<h2>Detalle</h2><ul>' + e.rows.map(r => '<li><span class="s">' + esc(STATUS_LABEL[r.status]) + '</span> ' + esc(r.title) + '. ' + esc(r.detail) + (r.missing ? ' <em>' + esc(r.missing) + '</em>' : '') + '</li>').join('') + '</ul>'
    + (e.summary.evidenceLink ? '<p><small>Evidencia local: ' + esc(e.summary.evidenceLink) + '</small></p>' : '') + '</body></html>';
}
