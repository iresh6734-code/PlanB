import { randomUUID } from 'node:crypto';
import { contextKey } from '../shared/local-task-focus.js';
import { createIntentJournal, KEY_PREFIX, type Current } from '../shared/task-intent-journal.js';
import { storeIntentStorage } from '../server/task-intent-storage.js';
import type { Store } from '../server/store.js';

// FIXTURES DEL LECTOR DEL RESUMEN DE TRABAJO (unidad Claude B · CLAUDE-WORK-SUMMARY-QA). Siembran el cuaderno de intenciones (208) de una Store ficticia con las situaciones que el LECTOR (283) debe clasificar:
// borrador, guardado por comprobar (incierto), resuelto, intento de otra copia y entrada ilegible en cuarentena. Se escriben con el diario REAL (no con filas a mano, salvo la ilegible) y sobre una Store
// de ensayo con su clave de prueba.
//
// QUÉ DEMUESTRAN Y QUÉ NO: estas filas prueban que el lector clasifica y que la tarjeta, el pasaporte y la exportación muestran lo que el lector devuelve. NO prueban cobertura del escritor de la App (A4): en la App
// normal `main` declara `covers: () => false` y el resultado correcto es «sin cobertura» con recuentos nulos. Los escenarios con cobertura necesitan una variante de prueba de `main` con `covers: () => true`
// y se rotulan siempre como fixtures del lector.
export const QA_CANARY = 'CanarioPrivadoQA: texto de borrador que jamás debe salir';
export const QA_TASK_IDS = ['qa-task-secreta-1', 'qa-task-secreta-2', 'qa-task-secreta-3'] as const;

export type ReaderScenario = 'mixed' | 'empty-covered' | 'resolved-only' | 'other-copy-only' | 'quarantine-only' | 'drafts-only' | 'uncertain-only';
export interface ExpectedCounts { drafts: number; unknownOutcome: number; settled: number; otherContext: number; unreadable: number }
export const READER_EXPECTATIONS: Record<ReaderScenario, ExpectedCounts & { situation: 'empty' | 'pending' | 'unreadable'; coverage: 'complete' | 'partial' }> = {
  mixed: { drafts: 2, unknownOutcome: 1, settled: 1, otherContext: 2, unreadable: 1, situation: 'pending', coverage: 'partial' },
  'empty-covered': { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0, situation: 'empty', coverage: 'complete' },
  'resolved-only': { drafts: 0, unknownOutcome: 0, settled: 2, otherContext: 0, unreadable: 0, situation: 'empty', coverage: 'complete' },
  'other-copy-only': { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 2, unreadable: 0, situation: 'empty', coverage: 'complete' },
  'quarantine-only': { drafts: 0, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 2, situation: 'unreadable', coverage: 'partial' },
  'drafts-only': { drafts: 3, unknownOutcome: 0, settled: 0, otherContext: 0, unreadable: 0, situation: 'pending', coverage: 'complete' },
  'uncertain-only': { drafts: 0, unknownOutcome: 2, settled: 0, otherContext: 0, unreadable: 0, situation: 'pending', coverage: 'complete' },
};

/** El ámbito de trabajo de la copia activa de la Store, igual que lo calcula el lector (instalación + contexto de la captura y su generación). */
export function readerCurrent(store: Store): Current {
  // La App crea el identificador de la instalación al arrancar (`createBaseApp`); una Store recién sembrada todavía no lo tiene. Se crea igual que ella para que el ámbito coincida cuando el servidor arranque.
  if (!store.get('instanceId', null)) store.set('instanceId', randomUUID());
  const instanceId = String(store.get('instanceId', null)), snapshot = store.snapshot, generation = store.generation;
  if (!snapshot || !generation) throw new Error('La Store de ensayo necesita una copia activa antes de sembrar el cuaderno.');
  return { installId: instanceId, contextKey: contextKey({ instanceId, snapshotId: snapshot.id, capturedAt: snapshot.capturedAt, captureStartedAt: snapshot.captureStartedAt ?? null, accountId: snapshot.source.accountId ?? null, generatedAt: generation.generatedAt }) };
}

/** Siembra un escenario en el cuaderno de la Store. Devuelve lo que el lector debe contar. Cada fila con texto sensible lleva el canario para comprobar que nunca sale. */
export async function seedReaderScenario(store: Store, scenario: ReaderScenario, now = '2026-11-08T10:00:00.000Z'): Promise<ExpectedCounts> {
  if (!(scenario in READER_EXPECTATIONS)) throw new Error('Escenario desconocido: ' + scenario);
  let n = 0;
  const journal = createIntentJournal({ storage: storeIntentStorage(store), now: () => now, newId: () => 'qa-case-' + scenario + '-' + ++n });
  const current = readerCurrent(store);
  const input = (scope: Current, taskId: string) => ({ current: scope, taskId, patch: { notes: QA_CANARY }, baseline: { notes: 'base ficticia ' + QA_CANARY } });
  const draft = async (scope: Current, taskId: string) => { const saved = await journal.saveDraft(input(scope, taskId)); if (!saved.ok) throw new Error('No se pudo sembrar un borrador: ' + saved.reason); };
  const attempt = async (scope: Current, taskId: string, kind: 'unknown' | 'ack') => { const sent = await journal.attempt(input(scope, taskId), async () => ({ kind })); if (!sent.journaled) throw new Error('No se pudo sembrar un intento'); };
  const otherGeneration = { ...current, contextKey: 'otra-generacion-qa' }, otherInstall = { ...current, installId: 'otra-instalacion-qa' };
  const quarantine = (count: number) => { for (let i = 0; i < count; i++) store.set(KEY_PREFIX + 'qa-ilegible-' + i, QA_CANARY + ' no es JSON ' + i); };
  switch (scenario) {
    case 'mixed':
      await draft(current, QA_TASK_IDS[0]); await draft(current, QA_TASK_IDS[1]);
      await attempt(current, QA_TASK_IDS[2], 'unknown');
      await attempt(current, 'qa-task-resuelta', 'ack');
      await draft(otherGeneration, 'qa-task-otra-generacion'); await draft(otherInstall, 'qa-task-otra-instalacion');
      quarantine(1); break;
    case 'empty-covered': break;
    case 'resolved-only': await attempt(current, 'qa-task-r1', 'ack'); await attempt(current, 'qa-task-r2', 'ack'); break;
    case 'other-copy-only': await draft(otherGeneration, 'qa-task-o1'); await draft(otherInstall, 'qa-task-o2'); break;
    case 'quarantine-only': quarantine(2); break;
    case 'drafts-only': await draft(current, 'qa-task-d1'); await draft(current, 'qa-task-d2'); await draft(current, 'qa-task-d3'); break;
    case 'uncertain-only': await attempt(current, 'qa-task-u1', 'unknown'); await attempt(current, 'qa-task-u2', 'unknown'); break;
  }
  const { situation: _situation, coverage: _coverage, ...counts } = READER_EXPECTATIONS[scenario]; void _situation; void _coverage;
  return counts;
}

/** Textos que JAMÁS pueden aparecer en una respuesta pública, una exportación, un error o la interfaz del resumen. */
export const FORBIDDEN_PUBLIC = [QA_CANARY, ...QA_TASK_IDS, 'qa-task-', 'qa-case-', 'otra-generacion-qa', 'otra-instalacion-qa', 'baseline', 'contextKey', 'installId', 'planb.sqlite', '.planb-key', 'task-intent:'] as const;
