import { buildRescuePlan, validBudget, type ExclusionReason } from './rescue-plan.js';
import { MAX_ESTIMATE_MINUTES, MIN_ESTIMATE_MINUTES } from './rescue-room.js';
import type { ResponseBucket, ResponseQueue, ResponseQueueItem } from './response-queue.js';

// Jornada de continuidad (unidad 205). Modelo PURO: convierte un tiempo disponible DECLARADO en una selección editable de tareas sobre la cola existente.
// Reutiliza `buildResponseQueue` (vía candidatos) y `buildRescuePlan` (cabida voraz con estimaciones declaradas): no reinterpreta fechas ni estados.
//
// Principios:
//  · estimación ≠ trabajo elegido ≠ trabajo guardado ≠ finalización. Aquí solo hay estimaciones declaradas y elecciones; guardar y completar pasan por la ficha.
//  · las decisiones manuales (fijar, elegir, descartar, bloquear, orden) viven APARTE del cálculo: cambiar el presupuesto o el filtro no las toca.
//  · nada se descarta en silencio: lo fijado que desborda el tiempo se avisa, la duración desconocida se separa de lo que no cabe, cada exclusión tiene motivo.
//  · sin escrituras: la función no muta sus entradas y no accede a red, almacenamiento ni reloj.
// Lo que NO hace: persistir decisiones (viven en la memoria de quien lo use), deducir estimaciones, inferir dependencias entre tareas (las referencias son
// asociaciones, no dependencias), ni acreditar que una tarea se completó (si deja de estar en la cola solo se dice que «ya no aparece»).

export const BUCKET_LABEL: Record<ResponseBucket, string> = { overdue: 'Vencida', 'due-in-window': 'Vence pronto', 'needs-review': 'Revisar datos', later: 'Más adelante' };
export { MAX_ESTIMATE_MINUTES, MIN_ESTIMATE_MINUTES };

export interface DayCandidate {
  id: string; label: string; bucket: ResponseBucket;
  /** false = el estado no permite saber si sigue abierta: no se planifica sola. */
  statusKnown: boolean;
  dueText: string | null; reasons: string[];
  /** Registros relacionados que no están disponibles (asociaciones, no dependencias). */
  missingReferences: string[];
}
/** Adaptador EXACTO desde la cola existente. */
export function candidatesFromQueue(queue: ResponseQueue): DayCandidate[] {
  return queue.items.map((item: ResponseQueueItem) => ({
    id: item.id, label: item.label, bucket: item.bucket, statusKnown: item.status === 'open', dueText: item.due.localDate ?? item.due.value, reasons: item.reasons.map(reason => reason.detail),
    missingReferences: item.references.filter(reference => !reference.available).map(reference => reference.entity + ' · ' + reference.id),
  }));
}
/** Texto fijo que la cola usa cuando hay referencias que faltan (una prueba lo compara con la cola real para detectar cambios). */
export const MISSING_REFERENCE_ACTION = 'Comprobar los registros relacionados antes de trabajar esta tarea.';
/** Adaptador CONSERVADOR desde las tareas que Hoy ya recibe (no trae estado ni referencias): «Revisar datos» no se planifica sola. */
export function candidatesFromToday(tasks: ReadonlyArray<{ id: string; label: string; bucket: ResponseBucket; due: string | null; reasons: string[]; nextAction: string }>): DayCandidate[] {
  return tasks.map(task => ({ id: task.id, label: task.label, bucket: task.bucket, statusKnown: task.bucket !== 'needs-review', dueText: task.due, reasons: [...task.reasons],
    missingReferences: task.nextAction === MISSING_REFERENCE_ACTION ? ['registro relacionado no disponible'] : [] }));
}

// ── Decisiones manuales (inmutables) ────────────────────────────────────────────────────────────────────────────────────────────────
export interface ManualPick { id: string; pinned: boolean; }
export interface DayDecisions { manual: ManualPick[]; skipped: string[]; blocked: Record<string, string>; }
export const emptyDecisions = (): DayDecisions => ({ manual: [], skipped: [], blocked: {} });
const without = (list: string[], id: string) => list.filter(item => item !== id);
export const pickTask = (d: DayDecisions, id: string, pinned = false): DayDecisions => ({ ...d, skipped: without(d.skipped, id), manual: d.manual.some(pick => pick.id === id) ? d.manual.map(pick => pick.id === id ? { ...pick, pinned } : pick) : [...d.manual, { id, pinned }] });
export const unpickTask = (d: DayDecisions, id: string): DayDecisions => ({ ...d, manual: d.manual.filter(pick => pick.id !== id) });
export const setPinned = (d: DayDecisions, id: string, pinned: boolean): DayDecisions => ({ ...d, manual: d.manual.map(pick => pick.id === id ? { ...pick, pinned } : pick) });
export const skipTask = (d: DayDecisions, id: string): DayDecisions => ({ ...d, manual: d.manual.filter(pick => pick.id !== id), skipped: d.skipped.includes(id) ? d.skipped : [...d.skipped, id] });
export const unskipTask = (d: DayDecisions, id: string): DayDecisions => ({ ...d, skipped: without(d.skipped, id) });
export const blockTask = (d: DayDecisions, id: string, reason: string): DayDecisions => ({ ...d, blocked: { ...d.blocked, [id]: reason.trim() || 'Bloqueada por el operador' } });
export const unblockTask = (d: DayDecisions, id: string): DayDecisions => { const { [id]: _removed, ...rest } = d.blocked; return { ...d, blocked: rest }; };
/** Mueve una elección manual una posición dentro de su grupo (fijadas con fijadas, el resto con el resto). */
export function moveTask(d: DayDecisions, id: string, delta: -1 | 1): DayDecisions {
  const at = d.manual.findIndex(pick => pick.id === id); if (at < 0) return d;
  const group = d.manual[at].pinned; let to = at + delta;
  while (to >= 0 && to < d.manual.length && d.manual[to].pinned !== group) to += delta;
  if (to < 0 || to >= d.manual.length) return d;
  const next = [...d.manual]; [next[at], next[to]] = [next[to], next[at]]; return { ...d, manual: next };
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type DayWarningKind = 'overrun' | 'unknown-duration' | 'unknown-status' | 'missing-reference' | 'pending-save' | 'other-owner';
export interface DayWarning { kind: DayWarningKind; text: string; }
export interface DayEntry { id: string; label: string; bucket: ResponseBucket; origin: 'pinned' | 'manual' | 'auto'; minutes: number | null; startMinute: number | null; endMinute: number | null; why: string; warnings: DayWarning[];
  /** true = propuesta automática calculada con un saldo NO acreditado (hay una tarea elegida sin duración): no afirma que quepa ni cuándo empieza. */
  provisional: boolean; }
export type DayExclusionReason = ExclusionReason | 'skipped-by-person' | 'owner-filter' | 'outcome-pending';
export interface DayExclusion { id: string; label: string; bucket: ResponseBucket; reason: DayExclusionReason; detail: string; minutes: number | null; }
export type DecisionKind = 'unknown-status' | 'missing-reference' | 'no-estimate' | 'pending-save' | 'overrun';
export interface DecisionItem { id: string; label: string; kind: DecisionKind; detail: string; action: string; }
export interface OutcomeHints { [taskId: string]: 'in_flight' | 'uncertain'; }
export interface DayInput {
  candidates: readonly DayCandidate[]; budgetMinutes: number; estimates: Record<string, number>; decisions: DayDecisions;
  /** Solo si hay dato real de responsable. Sin él no hay filtro. */
  owners?: Record<string, string | null>; ownerFilter?: string | null;
  /** SOLO estado de guardados sin resolver (nunca texto). Una tarea con guardado en curso o incierto no se planifica sola. */
  hints?: OutcomeHints;
  /** De la cola: cuántas tareas no se consideraron por el tope. */
  notConsidered?: number;
}
export interface PrintLine { order: number; id: string; label: string; minutes: number | null; startMinute: number | null; }
export interface DayPlan {
  budgetMinutes: number;
  /** SUBTOTAL CONOCIDO: solo las estimaciones declaradas. No es el total si `unknownDurations > 0`. */
  usedMinutes: number;
  /** Tareas elegidas sin duración declarada. Mientras haya alguna, el saldo es indeterminado. */
  unknownDurations: number;
  /** null = indeterminado (hay tareas elegidas sin duración); con 0 sin duración es el saldo exacto. */
  remainingMinutes: number | null;
  /** Mínimo que ya se pasa del tiempo con lo estimado (cota inferior si hay duraciones desconocidas). */
  overrunMinutes: number;
  chosen: DayEntry[]; excluded: DayExclusion[]; needsDecision: DecisionItem[]; unknownDuration: { id: string; label: string }[];
  /** Elecciones manuales cuya tarea ya no está entre los candidatos (la cola cambió). */
  departed: string[];
  notConsidered: number; method: string; limitations: string[];
}
const DETAIL: Record<'skipped-by-person' | 'owner-filter' | 'outcome-pending', string> = {
  'skipped-by-person': 'La descartaste de esta jornada. Puedes volver a incluirla.',
  'owner-filter': 'Pertenece a otro responsable del filtro activo.',
  'outcome-pending': 'Su guardado está sin resolver: comprueba el resultado antes de planificarla.',
};
const validEstimate = (value: unknown): number | null => Number.isInteger(value) && (value as number) >= MIN_ESTIMATE_MINUTES && (value as number) <= MAX_ESTIMATE_MINUTES ? value as number : null;

export function buildContinuityDay(input: DayInput): DayPlan {
  const { candidates, budgetMinutes, estimates, decisions, owners, ownerFilter = null, hints = {}, notConsidered = 0 } = input;
  if (!validBudget(budgetMinutes)) throw new RangeError('El tiempo disponible admite entre 1 y ' + MAX_ESTIMATE_MINUTES + ' minutos enteros.');
  const byId = new Map<string, DayCandidate>();
  for (const candidate of candidates) { if (byId.has(candidate.id)) throw new TypeError('Tarea duplicada en los candidatos.'); byId.set(candidate.id, candidate); }
  const minutesOf = (id: string) => Object.prototype.hasOwnProperty.call(estimates, id) ? validEstimate(estimates[id]) : null;
  const skipped = new Set(decisions.skipped), pending = (id: string) => Object.prototype.hasOwnProperty.call(hints, id) ? hints[id] : undefined;
  const otherOwner = (id: string) => !!ownerFilter && !!owners && (owners[id] ?? null) !== ownerFilter;
  const warningsFor = (candidate: DayCandidate, minutes: number | null): DayWarning[] => {
    const warnings: DayWarning[] = [];
    if (minutes === null) warnings.push({ kind: 'unknown-duration', text: 'Duración desconocida: no cuenta para el tiempo hasta que la declares.' });
    if (!candidate.statusKnown) warnings.push({ kind: 'unknown-status', text: 'El estado no permite confirmar que siga abierta.' });
    if (candidate.missingReferences.length) warnings.push({ kind: 'missing-reference', text: 'Falta un registro relacionado: ' + candidate.missingReferences.join(', ') + '.' });
    if (pending(candidate.id)) warnings.push({ kind: 'pending-save', text: pending(candidate.id) === 'uncertain' ? 'Su último guardado está sin resolver: no se sabe si se aplicó.' : 'Hay un guardado en curso para esta tarea.' });
    if (otherOwner(candidate.id)) warnings.push({ kind: 'other-owner', text: 'Es de otro responsable que el del filtro activo.' });
    return warnings;
  };

  // 1) Lo que la persona eligió: fijadas primero, luego el resto, cada grupo en su orden. Se incluye aunque no quepa: se avisa del desborde, no se descarta.
  const manualOrder = [...decisions.manual.filter(pick => pick.pinned), ...decisions.manual.filter(pick => !pick.pinned)];
  const chosen: DayEntry[] = [], departed: string[] = []; let used = 0, indeterminate = false;
  for (const pick of manualOrder) {
    const candidate = byId.get(pick.id); if (!candidate) { departed.push(pick.id); continue; }
    // Tras la primera tarea sin duración las posiciones de las siguientes son INDETERMINADAS (no se supone que ocupe cero).
    const minutes = minutesOf(pick.id), start = indeterminate || minutes === null ? null : used; if (minutes !== null) used += minutes; const end = indeterminate || minutes === null ? null : used; if (minutes === null) indeterminate = true;
    const warnings = warningsFor(candidate, minutes);
    if (used > budgetMinutes && (minutes !== null)) warnings.unshift({ kind: 'overrun', text: 'Con esta tarea ' + (indeterminate ? 'lo estimado ya pasa' : 'el plan pasa') + ' de ' + budgetMinutes + ' min (' + (used - budgetMinutes) + ' min de más' + (indeterminate ? ' como mínimo' : '') + '). No se ha quitado.' });
    chosen.push({ id: candidate.id, label: candidate.label, bucket: candidate.bucket, origin: pick.pinned ? 'pinned' : 'manual', minutes, startMinute: start, endMinute: end,
      why: pick.pinned ? 'Fijada por ti como importante.' : 'Elegida por ti.', warnings, provisional: false });
  }

  // 2) El resto: la heurística voraz de buildRescuePlan sobre el tiempo restante, solo con lo elegible.
  const manualIds = new Set(manualOrder.map(pick => pick.id)), excluded: DayExclusion[] = [];
  const exclude = (candidate: DayCandidate, reason: DayExclusionReason, detail: string) => excluded.push({ id: candidate.id, label: candidate.label, bucket: candidate.bucket, reason, detail, minutes: minutesOf(candidate.id) });
  const eligible: DayCandidate[] = [];
  for (const candidate of candidates) {
    if (manualIds.has(candidate.id)) continue;
    if (skipped.has(candidate.id)) exclude(candidate, 'skipped-by-person', DETAIL['skipped-by-person']);
    else if (otherOwner(candidate.id)) exclude(candidate, 'owner-filter', DETAIL['owner-filter']);
    else if (pending(candidate.id)) exclude(candidate, 'outcome-pending', DETAIL['outcome-pending']);
    else eligible.push(candidate);
  }
  const remaining = Math.max(0, budgetMinutes - used);
  const queue = { items: eligible.map(candidate => ({ id: candidate.id, label: candidate.label, bucket: candidate.bucket, status: candidate.statusKnown ? 'open' : 'unknown' })), summary: { totalQueued: eligible.length } } as unknown as ResponseQueue;
  // Con menos de 1 minuto restante nada cabe (la estimación mínima es 5): se pide un presupuesto de 1 para obtener los motivos reales de cada exclusión.
  const plan = buildRescuePlan(queue, { budgetMinutes: Math.max(1, remaining), estimates, blocked: decisions.blocked });
  for (const entry of plan.included) {
    const candidate = byId.get(entry.id)!;
    const raw = BUCKET_LABEL[candidate.bucket] + (candidate.reasons[0] ? ': ' + candidate.reasons[0] : ''), why = /[.!?]$/.test(raw) ? raw : raw + '.';
    chosen.push({ id: entry.id, label: candidate.label, bucket: candidate.bucket, origin: 'auto', minutes: entry.minutes, startMinute: indeterminate ? null : used + entry.startMinute, endMinute: indeterminate ? null : used + entry.endMinute,
      why: indeterminate ? why + ' Propuesta provisional: cabe según lo estimado hasta ahora, pero una tarea elegida no tiene duración y puede cambiarlo.' : why + ' Cabe en el tiempo restante.', warnings: warningsFor(candidate, entry.minutes), provisional: indeterminate });
  }
  for (const item of plan.excluded) exclude(byId.get(item.id)!, item.reason, item.detail);
  const total = chosen.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);

  // 3) Qué pide una decisión humana y qué tiene duración desconocida (separado de lo que simplemente no cabe).
  const needsDecision: DecisionItem[] = [], unknownDuration: DayPlan['unknownDuration'] = [];
  for (const candidate of candidates) {
    if (skipped.has(candidate.id)) continue;
    const add = (kind: DecisionKind, detail: string, action: string) => needsDecision.push({ id: candidate.id, label: candidate.label, kind, detail, action });
    if (pending(candidate.id)) add('pending-save', pending(candidate.id) === 'uncertain' ? 'Su guardado está sin resolver: no se sabe si se aplicó.' : 'Su guardado sigue en curso.', 'Comprobar el resultado en «Resultados de guardado» antes de contar con ella.');
    if (!candidate.statusKnown) add('unknown-status', 'El estado no permite confirmar que siga abierta.', 'Abrir la tarea y revisar su estado.');
    if (candidate.missingReferences.length) add('missing-reference', 'Falta un registro relacionado: ' + candidate.missingReferences.join(', ') + '.', 'Comprobar las asociaciones antes de trabajarla.');
    if (minutesOf(candidate.id) === null) unknownDuration.push({ id: candidate.id, label: candidate.label });
    if (minutesOf(candidate.id) === null && candidate.statusKnown && !pending(candidate.id) && !Object.prototype.hasOwnProperty.call(decisions.blocked, candidate.id) && !otherOwner(candidate.id)) add('no-estimate', 'Sin duración declarada: es desconocida, no cero.', 'Declarar cuánto crees que tardarás.');
  }
  for (const entry of chosen) for (const warning of entry.warnings) if (warning.kind === 'overrun') needsDecision.push({ id: entry.id, label: entry.label, kind: 'overrun', detail: warning.text, action: 'Quitar alguna tarea, aumentar el tiempo o aceptar el desborde.' });

  return {
    budgetMinutes, usedMinutes: total, unknownDurations: chosen.filter(entry => entry.minutes === null).length,
    remainingMinutes: indeterminate ? null : Math.max(0, budgetMinutes - total), overrunMinutes: Math.max(0, total - budgetMinutes),
    chosen, excluded, needsDecision, unknownDuration, departed, notConsidered: plan.notConsidered + notConsidered,
    method: 'Primero lo que fijaste o elegiste (se incluye aunque no quepa y se avisa); después, la heurística voraz de la cola de prioridad con las estimaciones que declaraste. No es una optimización.',
    limitations: [
      ...plan.limitations,
      'Elegir una tarea aquí no la guarda ni la completa: el guardado y la finalización siguen pasando por la ficha de la tarea.',
      'Tus decisiones viven solo en esta ventana: se pierden al recargar.',
    ],
  };
}

/** Elecciones previas que ya no aparecen entre los candidatos. «Ya no aparece» no demuestra que se completaran: pudo guardarse, borrarse o salir del horizonte. */
export const departedFromQueue = (previousIds: readonly string[], candidates: readonly DayCandidate[]): string[] => { const present = new Set(candidates.map(candidate => candidate.id)); return previousIds.filter(id => !present.has(id)); };

/** Vista imprimible POR LISTA BLANCA: solo orden, ID, título, minutos y arranque. Sin motivos, referencias, fechas ni avisos. */
export interface PrintableDay { title: string; budgetMinutes: number; /** Subtotal conocido (estimaciones declaradas). */ usedMinutes: number; unknownDurations: number; lines: PrintLine[]; note: string; }
export function printableDay(plan: DayPlan): PrintableDay {
  return { title: 'Jornada de continuidad', budgetMinutes: plan.budgetMinutes, usedMinutes: plan.usedMinutes, unknownDurations: plan.unknownDurations,
    lines: plan.chosen.map((entry, index) => ({ order: index + 1, id: entry.id, label: entry.label, minutes: entry.minutes, startMinute: entry.startMinute })),
    note: 'Lista de trabajo elegida. No indica que las tareas estén guardadas ni completadas.' };
}
