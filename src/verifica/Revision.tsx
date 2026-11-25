// Plan B Verifica · el mega plan 4 en la pantalla (cortes 5 a 7): el siguiente paso del encargo y la revisión de los hallazgos.
// Las dos partes solo pintan lo que devuelve GET /expediente (workflow); las decisiones las guarda PUT /review/:rule. La
// revisión es interna: no cambia el informe y solo viaja al comprador como huella, ligada al paquete.
import React, { useState } from 'react';
import type { VerificaRuleId } from '../../shared/verifica/model.js';
import type { EngagementWorkflow, FindingDecision, ReviewDecision, ReviewFinding, ReviewView } from '../../shared/verifica/revision.js';
import { day, short } from './documents.js';
import { decideFinding, EngagementApiError } from './engagement-client.js';

const NEXT: Record<EngagementWorkflow['next'], string> = {
  'check-expediente': 'Revisa el expediente: su comprobación falla y no se puede preparar una entrega.',
  'complete-sources': 'Completa las fuentes para poder emitir el informe.',
  'issue-report': 'Emite el informe en la sala limpia.',
  'refresh-report': 'Vuelve a emitir el informe: las fuentes cambiaron desde la última emisión.',
  'review-findings': 'Revisa los hallazgos que se salen de lo normal o no se pudieron comprobar.',
  'prepare-package': 'Prepara la entrega revisada para el comprador.',
  'reviewed-package-issued': 'La entrega revisada está al día.',
};
const DELIVERY: Record<NonNullable<EngagementWorkflow['delivery']>['state'], string> = {
  current: 'sigue al día',
  'sources-changed': 'quedó atrás: cambiaron las fuentes',
  'report-changed': 'quedó atrás: hay otra emisión del informe',
  'review-changed': 'quedó atrás: cambió una decisión de la revisión',
};
export const DECISION: Record<ReviewDecision, string> = {
  reviewed: 'Revisado',
  'request-information': 'Pide información',
  'reviewed-declaration': 'Revisada la respuesta del vendedor',
};
const STATE: Record<ReviewFinding['state'], string> = { pending: 'Por revisar', reopened: 'Reabierto', ...DECISION };
const BASIS: Record<ReviewFinding['basis'], string> = { observed: 'Observado', declared: 'Declarado por el vendedor', unverified: 'Sin comprobar' };
// Para las últimas decisiones de una regla que ya no está entre los hallazgos a revisar (el informe la titula con sus cifras).
const RULE_TITLE: Record<VerificaRuleId, string> = {
  'window-inflation': 'Cartera creada o inflada en la ventana de venta', 'close-date-pushed': 'Fechas de cierre aplazadas',
  'won-without-invoice': 'Oportunidades ganadas sin factura', 'owner-concentration': 'Concentración por comercial',
  'bulk-deletion': 'Registros que desaparecen entre capturas', 'declared-renewal': 'Renovación y clientes activos declarados',
};
const done = (finding: ReviewFinding) => finding.state === 'reviewed' || finding.state === 'reviewed-declaration';

/** La línea que dice qué toca ahora, arriba de Fuentes. */
export function NextStep({ workflow }: { workflow: EngagementWorkflow | undefined }) {
  if (!workflow) return null;
  const pending = workflow.review ? workflow.review.findings.filter(f => !done(f)).length : 0;
  const { delivery } = workflow;
  return (
    <section className="pb-card vf-next" aria-labelledby="vf-next" data-next={workflow.next}>
      <p className="vf-eyebrow" id="vf-next">Siguiente paso</p>
      <p className="vf-next-text">{NEXT[workflow.next]}{workflow.next === 'review-findings' && pending ? ' Quedan ' + pending + '.' : ''}</p>
      {workflow.missing.length > 0 && <ul className="vf-next-list">{workflow.missing.map(item => <li key={item}>{item}</li>)}</ul>}
      {delivery && (
        <p className="pb-trace">
          Última entrega revisada, del {day(delivery.at)} (paquete <code title={delivery.fingerprint}>{short(delivery.fingerprint)}</code>): {DELIVERY[delivery.state]}
          {delivery.state === 'report-changed' ? (delivery.changedRules === null ? '. No se conserva la emisión anterior para decir qué cambió.' : delivery.changedRules.length ? '. Cambian ' + delivery.changedRules.length + (delivery.changedRules.length === 1 ? ' hallazgo.' : ' hallazgos.') : '. Ningún hallazgo cambia.') : '.'}
        </p>
      )}
    </section>
  );
}

export interface ReviewControls { busy: VerificaRuleId | null; errors: Partial<Record<VerificaRuleId, string>>; onDecide: (finding: ReviewFinding, decision: ReviewDecision) => void }

/** La revisión de los hallazgos de la emisión vigente: una decisión por hallazgo, y las últimas decisiones al volver. */
export function ReviewContent({ review, recent, controls }: { review: ReviewView | null; recent: FindingDecision[]; controls: ReviewControls }) {
  if (!review) return null;
  const titles = new Map(review.findings.map(f => [f.rule, f.title] as const));
  const reviewed = review.findings.filter(done).length;
  return (
    <section className="vf-section" aria-labelledby="vf-review">
      <div className="pb-section-head"><h2 id="vf-review">Revisión de hallazgos</h2><p>{review.findings.length === 0 ? 'Nada que revisar en esta emisión' : reviewed + ' de ' + review.findings.length + ' revisados'}</p></div>
      {review.findings.length === 0
        ? <p className="pb-empty">Ningún hallazgo de esta emisión se sale de lo normal ni quedó sin comprobar.</p>
        : (
          <ol className="vf-questions">
            {review.findings.map(finding => (
              <li key={finding.rule} className="vf-question vf-review" data-state={finding.state}>
                <h3>{finding.title}</h3>
                <p className="vf-status">
                  <span className="pb-state" data-state={finding.state}>{STATE[finding.state]}</span>
                  <span className="pb-basis" data-basis={finding.basis}>{BASIS[finding.basis]}</span>
                  {finding.statement && <span className="pb-trace">El vendedor ha respondido en «Preguntas al vendedor»</span>}
                </p>
                {finding.state === 'reopened' && <p className="pb-held">Ya tenía una decisión, pero cambió su evidencia o la respuesta del vendedor: hay que revisarlo de nuevo.</p>}
                <div className="vf-issue-actions" role="group" aria-label={'Decisión sobre «' + finding.title + '»'}>
                  {(['reviewed', 'request-information', ...(finding.statement ? ['reviewed-declaration' as const] : [])] as ReviewDecision[]).map(decision => (
                    <button key={decision} type="button" className="pb-secondary" aria-pressed={finding.state === decision} disabled={controls.busy !== null}
                      onClick={() => controls.onDecide(finding, decision)}>{controls.busy === finding.rule && finding.state !== decision ? 'Guardando…' : DECISION[decision]}</button>
                  ))}
                </div>
                {controls.errors[finding.rule] && <p className="pb-error" role="alert">{controls.errors[finding.rule]}</p>}
              </li>
            ))}
          </ol>
        )}
      {recent.length > 0 && (
        <details className="vf-recent">
          <summary>Últimas decisiones ({recent.length})</summary>
          <ul className="vf-next-list">
            {recent.map(entry => <li key={entry.fingerprint}>{day(entry.at)} · {titles.get(entry.rule) ?? RULE_TITLE[entry.rule]} · {DECISION[entry.decision]}</li>)}
          </ul>
        </details>
      )}
      <p className="pb-note">La revisión es de uso interno: no cambia el informe. La entrega revisada lleva su huella para poder comprobar después con qué decisiones salió.</p>
    </section>
  );
}

/** La revisión con su llamada: cada decisión se guarda y el expediente se vuelve a leer (el estado y la entrega cambian). */
export function ReviewSection({ engagementId, review, recent, onChanged }: {
  engagementId: string; review: ReviewView | null; recent: FindingDecision[]; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<VerificaRuleId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<VerificaRuleId, string>>>({});
  const controls: ReviewControls = {
    busy, errors,
    onDecide: (finding, decision) => {
      if (!review) return;
      setBusy(finding.rule); setErrors(previous => ({ ...previous, [finding.rule]: undefined }));
      decideFinding(engagementId, finding.rule, { report: review.report, evidence: finding.evidence, previousDecision: finding.previousDecision,
        statement: decision === 'reviewed-declaration' ? finding.statement : null, decision })
        .then(() => onChanged(), error => {
          setErrors(previous => ({ ...previous, [finding.rule]: error instanceof EngagementApiError ? error.message : 'No se pudo guardar la decisión.' }));
          // Otra pantalla decidió antes o cambió la emisión: se relee para enseñar el estado de verdad.
          if (error instanceof EngagementApiError && error.status === 409) onChanged();
        })
        .finally(() => setBusy(null));
    },
  };
  return <ReviewContent review={review} recent={recent} controls={controls} />;
}
