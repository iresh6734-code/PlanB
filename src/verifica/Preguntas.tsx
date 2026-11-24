// Plan B Verifica · preguntas al vendedor y comparación entre emisiones (Mega Plan 3, fase 3), dentro de Fuentes. Las
// preguntas son fijas por regla y solo salen de los hallazgos que se salen de lo normal; la respuesta queda como «declarado»
// y no toca lo observado. La comparación dice qué cifra cambió entre las dos últimas emisiones y qué fuente lo explica.
import React, { useEffect, useState } from 'react';
import type { ReportComparison } from '../../shared/verifica/comparacion.js';
import type { AnswersDocument, SellerQuestion } from '../../shared/verifica/preguntas.js';
import { ROLE_LABEL } from '../../shared/verifica/engagement.js';
import { EngagementApiError, readIssues, readQuestions, saveAnswer } from './engagement-client.js';
import { day } from './documents.js';

const message = (error: unknown) => error instanceof EngagementApiError ? error.message : 'No se pudo completar la operación.';
const ROLE: Record<string, string> = { previous: ROLE_LABEL.previous, latest: ROLE_LABEL.latest, invoices: ROLE_LABEL.invoices };
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });

export interface AnswerControls { busy: string | null; errors: Partial<Record<string, string>>; onSave: (rule: string, text: string) => void }

function QuestionRow({ question, answer, controls }: { question: SellerQuestion; answer: AnswersDocument['answers'][number] | undefined; controls: AnswerControls }) {
  const [text, setText] = useState(answer?.text ?? '');
  useEffect(() => { setText(answer?.text ?? ''); }, [answer?.text]);
  const id = 'vf-answer-' + question.id;
  return (
    <li className="vf-question">
      <h3>{question.finding}</h3>
      <p className="pb-summary">{question.text}</p>
      {question.refs.length > 0 && (
        <details className="vf-refs"><summary>{question.refs.length === 1 ? 'Ver la referencia' : 'Ver las ' + question.refs.length + ' referencias'}</summary>
          <ul>{question.refs.map(ref => <li key={ref}><code>{ref}</code></li>)}</ul></details>
      )}
      <form className="vf-answer" onSubmit={event => { event.preventDefault(); controls.onSave(question.id, text); }}>
        <label className="pb-field" htmlFor={id}><span className="pb-field-label">Respuesta del vendedor</span></label>
        <textarea id={id} className="pb-input pb-input-text pb-textarea" rows={3} maxLength={4000} value={text} disabled={controls.busy === question.id}
          placeholder="Con los seudónimos del informe, sin nombres ni correos" onChange={event => setText(event.target.value)} />
        <div className="vf-issue-actions">
          <button type="submit" className="pb-secondary" disabled={controls.busy === question.id || !text.trim() || text.trim() === answer?.text}>{controls.busy === question.id ? 'Guardando…' : answer ? 'Guardar el cambio' : 'Guardar la respuesta'}</button>
          {answer && <span className="pb-trace">Declarada el {day(answer.answeredAt)}</span>}
        </div>
        {controls.errors[question.id] && <p className="pb-error" role="alert">{controls.errors[question.id]}</p>}
      </form>
    </li>
  );
}

export function QuestionsContent({ questions, answers, comparison, loadError, controls }: {
  questions: SellerQuestion[] | null; answers: AnswersDocument | null; comparison: ReportComparison | null; loadError: string | null; controls: AnswerControls;
}) {
  return (
    <>
      {comparison && (
        <section className="pb-card" aria-labelledby="vf-compare">
          <h2 id="vf-compare">Qué cambió desde la emisión anterior</h2>
          <p className="pb-summary">Corte del {day(comparison.from.asOf)} frente al del {day(comparison.to.asOf)}. {comparison.sources.filter(s => s.changed).length === 0 ? 'Ninguna fuente cambió.' : 'Cambiaron: ' + comparison.sources.filter(s => s.changed).map(s => ROLE[s.role].toLowerCase()).join(', ') + '.'}</p>
          {comparison.findings.length === 0
            ? <p className="pb-empty">Ningún hallazgo cambió.</p>
            : (
              <ul className="vf-unverified">
                {comparison.findings.map(f => (
                  <li key={f.rule}>
                    <strong>{f.title}.</strong>{' '}
                    {f.before && f.after && f.before.alarm !== f.after.alarm ? (f.after.alarm ? 'Ahora se sale de lo normal. ' : 'Ya no se sale de lo normal. ') : ''}
                    {f.figures.map(c => c.key + ': ' + number(c.before) + ' → ' + number(c.after)).join('; ')}
                    {f.explainedBy.length > 0 && <span className="pb-trace"> · lo explica: {f.explainedBy.map(r => ROLE[r].toLowerCase()).join(', ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          {(comparison.notVerified.removed.length > 0 || comparison.notVerified.added.length > 0) && (
            <p className="pb-note">{comparison.notVerified.removed.length > 0 ? 'Ya se comprueba: ' + comparison.notVerified.removed.join('; ') + '. ' : ''}{comparison.notVerified.added.length > 0 ? 'Ahora no se puede comprobar: ' + comparison.notVerified.added.join('; ') + '.' : ''}</p>
          )}
        </section>
      )}
      {questions && questions.length > 0 && (
        <section className="vf-section" aria-labelledby="vf-questions">
          <div className="pb-section-head"><h2 id="vf-questions">Preguntas al vendedor</h2><p>Una por cada hallazgo que se sale de lo normal; la respuesta queda como «declarado»</p></div>
          <ol className="vf-questions">
            {questions.map(q => <QuestionRow key={q.id} question={q} answer={answers?.answers.find(a => a.question === q.id)} controls={controls} />)}
          </ol>
        </section>
      )}
      {loadError && <p className="pb-error" role="alert">{loadError}</p>}
    </>
  );
}

export function QuestionsSection({ engagementId, refreshKey, onAnswered }: { engagementId: string; refreshKey: string; onAnswered?: () => void }) {
  const [questions, setQuestions] = useState<SellerQuestion[] | null>(null);
  const [answers, setAnswers] = useState<AnswersDocument | null>(null);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  useEffect(() => {
    let live = true;
    readQuestions(engagementId).then(next => { if (live) { setQuestions(next.questions); setAnswers(next.answers); } }, error => { if (live) setLoadError(message(error)); });
    readIssues(engagementId).then(next => { if (live) setComparison(next.comparison); }, error => { if (live) setLoadError(message(error)); });
    return () => { live = false; };
  }, [engagementId, refreshKey]);
  const controls: AnswerControls = {
    busy, errors,
    onSave: (rule, text) => {
      setBusy(rule); setErrors(previous => ({ ...previous, [rule]: undefined }));
      saveAnswer(engagementId, rule, text).then(next => { setAnswers(next.answers); onAnswered?.(); }, error => setErrors(previous => ({ ...previous, [rule]: message(error) }))).finally(() => setBusy(null));
    },
  };
  return <QuestionsContent questions={questions} answers={answers} comparison={comparison} loadError={loadError} controls={controls} />;
}
