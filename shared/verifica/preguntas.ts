// Plan B Verifica · preguntas al vendedor (Mega Plan 3, fase 3). Solo los hallazgos que se salen de lo normal proponen
// preguntas, y son fijas por regla: sin IA y sin texto libre del lado de Verifica. Citan los registros por su seudónimo, nunca
// por su nombre. La respuesta del vendedor queda como «declarado»: no cambia lo observado ni el informe; viaja aparte, atada a
// la huella del informe al que contesta.
import type { VerificaRuleId } from './model.js';
import { fingerprintOf, type VerificaReport } from './report.js';

export const ANSWERS_FORMAT = 'verifica-respuestas-v1';
export const ANSWER_LIMITS = Object.freeze({ chars: 4000, refs: 50 });

/** Una pregunta por regla, en palabras para el vendedor. */
export const QUESTION_TEXT: Record<VerificaRuleId, string> = {
  'window-inflation': '¿Qué operaciones explican la cartera creada o subida en la ventana de venta, y qué documentos las respaldan (propuestas firmadas, pedidos)?',
  'close-date-pushed': '¿Cuál es la situación real de las oportunidades cuya fecha de cierre se ha ido retrasando, y qué fecha de cierre esperáis para cada una?',
  'won-without-invoice': '¿Las oportunidades ganadas sin factura se facturaron con otra referencia, están pendientes de facturar o se anularon?',
  'owner-concentration': '¿El comercial del que depende la mayor parte de la cartera sigue en la empresa después de la venta, y quién la cubre si se va?',
  'bulk-deletion': '¿Por qué se borraron registros en bloque entre las dos capturas, y se conserva copia de lo borrado?',
  'declared-renewal': '¿Cómo se calculó la renovación declarada y con qué datos, si no coincide con lo observado?',
};

export interface SellerQuestion { id: VerificaRuleId; rule: VerificaRuleId; finding: string; text: string; refs: string[] }

/** Las preguntas de un informe emitido: una por cada hallazgo en alarma. */
export function questionsFor(report: VerificaReport): SellerQuestion[] {
  return report.findings.filter(f => f.alarm).map(f => ({
    id: f.rule, rule: f.rule, finding: f.title, text: QUESTION_TEXT[f.rule],
    refs: f.items.slice(0, ANSWER_LIMITS.refs).map(item => item.ref),
  }));
}

export interface SellerAnswer { question: VerificaRuleId; text: string; answeredAt: string }
export interface AnswersDocument {
  format: typeof ANSWERS_FORMAT;
  /** El informe al que contestan. */
  report: string;
  basis: 'declared';
  answers: SellerAnswer[];
  fingerprint: string;
}

export class AnswerInputError extends Error { constructor(message: string) { super(message); this.name = 'AnswerInputError'; } }

export function answerProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'La respuesta está vacía.';
  if (trimmed.length > ANSWER_LIMITS.chars) return 'La respuesta pasa de ' + ANSWER_LIMITS.chars + ' caracteres.';
  return null;
}

export function answersFingerprint(doc: Omit<AnswersDocument, 'fingerprint'> | AnswersDocument): string {
  const { fingerprint: _ignored, ...body } = doc as AnswersDocument;
  return fingerprintOf(body);
}

/** El documento de respuestas de un informe, con las respuestas en el orden de las preguntas. */
export function buildAnswers(report: VerificaReport, answers: readonly SellerAnswer[]): AnswersDocument {
  const order = questionsFor(report).map(q => q.id);
  const valid = answers.filter(a => order.includes(a.question)).sort((x, y) => order.indexOf(x.question) - order.indexOf(y.question));
  const body: Omit<AnswersDocument, 'fingerprint'> = { format: ANSWERS_FORMAT, report: report.fingerprint, basis: 'declared',
    answers: valid.map(a => ({ question: a.question, text: a.text.trim(), answeredAt: new Date(a.answeredAt).toISOString() })) };
  return { ...body, fingerprint: answersFingerprint(body) };
}

export const verifyAnswers = (doc: AnswersDocument): boolean => doc?.format === ANSWERS_FORMAT && doc.basis === 'declared' && answersFingerprint(doc) === doc.fingerprint;
