import type { VerificaFinding, VerificaRuleId } from './model.js';
import type { SellerAnswer } from './preguntas.js';
import { fingerprintOf, stableJson, type VerificaReport } from './report.js';

export const REVIEW_FORMAT = 'verifica-revision-v1';
export const REVIEW_DECISIONS = ['reviewed', 'request-information', 'reviewed-declaration'] as const;
export type ReviewDecision = typeof REVIEW_DECISIONS[number];

export interface FindingDecision {
  format: typeof REVIEW_FORMAT;
  engagement: string;
  sequence: number;
  at: string;
  rule: VerificaRuleId;
  report: string;
  evidence: string;
  decision: ReviewDecision;
  statement: string | null;
  previous: string | null;
  fingerprint: string;
}

export interface ReviewFinding {
  rule: VerificaRuleId;
  title: string;
  basis: VerificaFinding['basis'];
  alarm: boolean;
  evidence: string;
  /** Última decisión de la regla, incluso cuando la evidencia ya cambió. */
  previousDecision: string | null;
  state: 'pending' | 'reopened' | ReviewDecision;
  statement: string | null;
}

export interface ReviewView {
  report: string;
  findings: ReviewFinding[];
  ready: boolean;
  fingerprint: string;
}

export interface ReviewCommand {
  report: string;
  evidence: string;
  previousDecision: string | null;
  statement: string | null;
  decision: ReviewDecision;
}

export interface EngagementWorkflow {
  next: 'check-expediente' | 'complete-sources' | 'issue-report' | 'refresh-report' | 'review-findings' | 'prepare-package' | 'reviewed-package-issued';
  missing: string[];
  review: ReviewView | null;
  recentDecisions: FindingDecision[];
  reviewedPackage: { fingerprint: string; at: string } | null;
  delivery: {
    fingerprint: string;
    at: string;
    report: string;
    state: 'current' | 'sources-changed' | 'report-changed' | 'review-changed';
    /** null si ya no se dispone del informe anterior para compararlo. */
    changedRules: VerificaRuleId[] | null;
  } | null;
}

function evidenceOf(report: VerificaReport, finding: VerificaFinding) {
  // Una emisión nueva cambia los seudónimos. Las huellas de las fuentes sí vinculan el hallazgo a los registros originales.
  const details = finding.items.map(({ amount, note }) => stableJson({ amount, note })).sort();
  const gaps = report.notVerified.filter(item => item.rule === finding.rule);
  return fingerprintOf({ format: REVIEW_FORMAT, rule: finding.rule, alarm: finding.alarm, basis: finding.basis, summary: finding.summary,
    figures: finding.figures, captures: finding.captures, details, gaps });
}

export function reviewView(report: VerificaReport, latest: Partial<Record<VerificaRuleId, FindingDecision>>, answers: readonly SellerAnswer[]): ReviewView {
  const statements = new Map(answers.map(answer => [answer.question, fingerprintOf(answer)]));
  const gaps = new Set(report.notVerified.map(item => item.rule));
  const findings = report.findings.filter(finding => finding.alarm || finding.basis === 'unverified' || gaps.has(finding.rule)).map((finding): ReviewFinding => {
    const evidence = evidenceOf(report, finding);
    const previous = latest[finding.rule];
    const statement = statements.get(finding.rule) ?? null;
    const current = previous && previous.evidence === evidence && (previous.decision !== 'reviewed-declaration' || previous.statement === statement);
    return { rule: finding.rule, title: finding.title, basis: finding.basis, alarm: finding.alarm, evidence, previousDecision: previous?.fingerprint ?? null,
      state: current ? previous.decision : previous ? 'reopened' : 'pending', statement };
  });
  const ready = findings.every(finding => finding.state === 'reviewed' || finding.state === 'reviewed-declaration');
  const fingerprint = fingerprintOf({ format: REVIEW_FORMAT, report: report.fingerprint, findings });
  return { report: report.fingerprint, findings, ready, fingerprint };
}
