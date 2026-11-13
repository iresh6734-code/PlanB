import { contextKey } from './local-task-focus.js';
import type { DayCandidate } from './continuity-day.js';
import type { LocalWorkQueue, WorkTask } from './local-operations.js';

// Adaptador de la COLA ESTRUCTURADA de Hoy (unidad 230 R3) a la Jornada de continuidad (205). Modelo PURO: no lee red, almacenamiento ni reloj y no muta su entrada.
//
// Principios:
//  · estado, referencias y vencimiento salen de la cola del servidor; aquí solo se TRADUCEN a lo que la Jornada necesita. Los motivos son textos de la interfaz derivados de
//    `reasonCodes` y `due.kind`, idénticos a los detalles de `buildResponseQueue` (excepto «falta una asociación», que no puede nombrar la etiqueta del campo: la cola no la envía).
//  · UNA LISTA PARCIAL NUNCA ACREDITA EL TOTAL: `notConsidered` es `counts.notReturned` y `coverage` separa lo recortado por el límite de tareas, por el presupuesto de bytes y las filas que SOLAS
//    no caben. Ninguna de ellas se interpreta como completada, cerrada ni «fuera de la lista».
//  · `missing` se cuenta con `referenceCoverage` (la lista `references` puede estar recortada); `not-captured` NO es «falta»: es «no comprobable».
//  · la clave de aislamiento es `contextKey` de la identidad COMPLETA (instalación, captura, fecha y inicio de captura, cuenta y generación): el mismo ID de tarea en otra captura u otra
//    generación es OTRA clave. Una copia vacía no tiene clave (`null`).
//  · los IDs largos viajan íntegros en los datos; solo la PRESENTACIÓN los recorta y conserva su longitud real.

const ID_SHOWN = 48;
/** Recorte de presentación de un ID (sin partir un par sustituto) con su longitud real. Los datos nunca se recortan. */
export function shortId(id: string): string {
  if (id.length <= ID_SHOWN) return id;
  let end = ID_SHOWN; const code = id.charCodeAt(end - 1); if (code >= 0xd800 && code <= 0xdbff) end--;
  return id.slice(0, end) + '… (' + id.length + ' caracteres)';
}
const REASON_TEXT = (code: string, task: WorkTask): string | null => {
  switch (code) {
    case 'unknown-status': return 'El estado no permite confirmar si esta tarea sigue abierta; no se ha descartado.';
    case 'overdue': return task.due.kind === 'date' ? 'El día de vencimiento es anterior a hoy en Madrid.' : 'El instante de vencimiento ya ha pasado.';
    case 'due-in-window': return task.due.kind === 'date' ? 'El día de vencimiento coincide con un día del horizonte; no consta una hora exacta.' : 'El vencimiento está dentro del horizonte seleccionado, incluidos sus extremos.';
    case 'later': return 'El vencimiento queda después del horizonte seleccionado.';
    case 'missing-due': return 'No consta fecha de vencimiento; no se interpreta como una tarea sin urgencia.';
    case 'invalid-due': return 'La fecha no cumple el formato configurado o le falta zona horaria; hay que revisarla.';
    case 'missing-reference': return 'No está disponible algún registro relacionado; comprueba la asociación.';
    default: return null;   // un código que la interfaz no conoce no se inventa: se omite el texto, el recuento sigue en la cobertura
  }
};

export interface WorkCoverage {
  phase: LocalWorkQueue['phase'];
  /** Tareas en la cola completa (abiertas o de estado desconocido). `null` = copia sin captura. */
  queued: number | null; returned: number; notReturned: number;
  omittedByLimit: number; omittedByBytes: number;
  /** Subconjunto de `omittedByBytes`: filas que, SOLAS, no caben (p. ej. un ID enorme). */
  omittedOversize: number;
  /** La lista que recibe la Jornada NO es toda la cola. */
  partial: boolean;
  /** Frase lista para mostrar; `null` si la lista es completa. */
  notice: string | null;
}
export interface WorkDayInput {
  /** Clave de aislamiento de las decisiones de la Jornada. `null` = copia sin captura (no hay Jornada que aislar). */
  key: string | null;
  phase: LocalWorkQueue['phase'];
  candidates: DayCandidate[];
  /** Cuántas tareas de la cola no están en `candidates`. Es un dato de cobertura, no una decisión de presupuesto. */
  notConsidered: number;
  coverage: WorkCoverage;
  /**
   * Por candidato: asociaciones que la copia no puede comprobar y asociaciones que la página no muestra (para explicarlo con un enlace o un texto, no para ocultarlo).
   * Diccionario SIN PROTOTIPO: un ID de tarea es un texto cualquiera (`__proto__`, `constructor`, `toString`…) y con `{}` el primero cambiaría el prototipo en vez de crear una entrada.
   * Léelo con `referenceNoteOf` (o `Object.hasOwn`), nunca con `notes[id]` sobre un objeto ajeno: al deserializar JSON vuelve a ser un objeto normal.
   */
  referenceNotes: Record<string, { unverifiable: number; notShown: number; missing: number }>;
}

/** Clave de aislamiento de la Jornada (la misma identidad que usa la ficha). */
export function workIdentityKey(identity: NonNullable<LocalWorkQueue['identity']>): string {
  return contextKey({ instanceId: identity.instanceId, snapshotId: identity.snapshotId, capturedAt: identity.capturedAt, captureStartedAt: identity.captureStartedAt, accountId: identity.accountId, generatedAt: identity.generatedAt });
}
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** Nota de asociaciones de un candidato por ID EXACTO (entrada propia): un ID como `constructor` o `toString` nunca devuelve algo heredado. */
export function referenceNoteOf(notes: WorkDayInput['referenceNotes'], id: string) { return Object.hasOwn(notes, id) ? notes[id] : null; }

export function dayInputFromWorkQueue(work: LocalWorkQueue): WorkDayInput {
  const { counts, page } = work, notReturned = counts?.notReturned ?? 0;
  const parts = [
    page.omittedByLimit ? plural(page.omittedByLimit, 'tarea fuera del límite de ' + page.taskLimit + ' por página', 'tareas fuera del límite de ' + page.taskLimit + ' por página') : '',
    page.omittedByBytes - page.omittedOversize > 0 ? plural(page.omittedByBytes - page.omittedOversize, 'tarea que no cupo en el tamaño de la respuesta', 'tareas que no cupieron en el tamaño de la respuesta') : '',
    page.omittedOversize ? plural(page.omittedOversize, 'tarea demasiado grande para mostrarse aquí', 'tareas demasiado grandes para mostrarse aquí') : '',
  ].filter(Boolean);
  const coverage: WorkCoverage = {
    phase: work.phase, queued: counts ? counts.queued : null, returned: counts?.returned ?? 0, notReturned, omittedByLimit: page.omittedByLimit, omittedByBytes: page.omittedByBytes, omittedOversize: page.omittedOversize,
    partial: notReturned > 0,
    notice: notReturned > 0 ? 'Esta lista no incluye ' + plural(notReturned, 'tarea', 'tareas') + ' de tu cola (' + parts.join('; ') + '). La jornada solo organiza las que ves: no significa que las demás estén cerradas ni que no existan.' : null,
  };
  const referenceNotes: WorkDayInput['referenceNotes'] = Object.create(null);
  const candidates = work.tasks.map<DayCandidate>(task => {
    const cov = task.referenceCoverage, missing = task.references.filter(reference => reference.state === 'missing');
    // Las ausentes viajan siempre primero (230); `omitted` solo puede dejar fuera encontradas. Aun así se cuenta por cobertura y se declara lo que no se muestra.
    const shown = missing.slice(0, 3).map(reference => reference.entity + ' · ' + shortId(reference.id)), more = cov.missing - shown.length;
    const missingReferences = more > 0 ? [...shown, 'y ' + more + ' más'] : shown;
    const reasons = task.reasonCodes.map(code => REASON_TEXT(code, task)).filter((text): text is string => text !== null);
    if (cov.notCaptured > 0) reasons.push(plural(cov.notCaptured, 'asociación no se puede comprobar', 'asociaciones no se pueden comprobar') + ' porque esta copia no captura esa entidad.');
    if (cov.omitted > 0) reasons.push(plural(cov.omitted, 'asociación no se muestra', 'asociaciones no se muestran') + ' (la lista se acota a ' + work.page.referenceLimit + ' por tarea).');
    referenceNotes[task.id] = { unverifiable: cov.notCaptured, notShown: cov.omitted, missing: cov.missing };
    return { id: task.id, label: task.label, bucket: task.bucket, statusKnown: task.status === 'open', dueText: task.due.localDate ?? task.due.value, reasons, missingReferences };
  });
  return { key: work.identity ? workIdentityKey(work.identity) : null, phase: work.phase, candidates, notConsidered: notReturned, coverage, referenceNotes };
}
