// Plan B Verifica · comparar dos emisiones del mismo encargo (Mega Plan 3, fase 3). Dice qué cifra cambió, qué fuente nueva
// lo explica y qué sigue sin comprobar. Solo trabaja con informes ya emitidos: no recalcula nada ni lee el CRM.
import type { ReportSource, VerificaReport } from './report.js';
import type { VerificaBasis, VerificaRuleId } from './model.js';

export const COMPARISON_FORMAT = 'verifica-comparacion-v1';

export interface FigureChange { key: string; before: number | null; after: number | null }
export interface FindingChange {
  rule: VerificaRuleId;
  title: string;
  before: { alarm: boolean; basis: VerificaBasis } | null;
  after: { alarm: boolean; basis: VerificaBasis } | null;
  figures: FigureChange[];
  /** Fuentes que cambiaron entre las dos emisiones y de las que sale la cifra nueva. */
  explainedBy: ReportSource['role'][];
}
export interface SourceChange { role: ReportSource['role']; before: string | null; after: string | null; changed: boolean }
export interface ReportComparison {
  format: typeof COMPARISON_FORMAT;
  from: { fingerprint: string; asOf: string };
  to: { fingerprint: string; asOf: string };
  sources: SourceChange[];
  /** Solo los hallazgos que cambiaron (alarma, base o alguna cifra). */
  findings: FindingChange[];
  unchanged: number;
  notVerified: { added: string[]; removed: string[]; still: string[] };
}

const ROLES: ReportSource['role'][] = ['previous', 'latest', 'invoices'];

export function compareReports(before: VerificaReport, after: VerificaReport): ReportComparison {
  const source = (report: VerificaReport, role: ReportSource['role']) => report.sources.find(s => s.role === role)?.fingerprint ?? null;
  const sources: SourceChange[] = ROLES.map(role => {
    const a = source(before, role), b = source(after, role);
    return { role, before: a, after: b, changed: a !== b };
  }).filter(s => s.before !== null || s.after !== null);
  const changedRoles = sources.filter(s => s.changed);
  const rules = [...new Set([...before.findings.map(f => f.rule), ...after.findings.map(f => f.rule)])];
  const findings: FindingChange[] = [];
  let unchanged = 0;
  for (const rule of rules) {
    const a = before.findings.find(f => f.rule === rule) ?? null, b = after.findings.find(f => f.rule === rule) ?? null;
    const keys = [...new Set([...Object.keys(a?.figures ?? {}), ...Object.keys(b?.figures ?? {})])].sort();
    const figures = keys.flatMap(key => {
      const x = a?.figures[key] ?? null, y = b?.figures[key] ?? null;
      return x === y ? [] : [{ key, before: x, after: y }];
    });
    const sameState = !!a && !!b && a.alarm === b.alarm && a.basis === b.basis;
    if (sameState && figures.length === 0) { unchanged++; continue; }
    const captures = new Set(b?.captures ?? []);
    const explainedBy = changedRoles.filter(s => (s.after !== null && captures.has(s.after)) || (s.role === 'invoices' && rule === 'won-without-invoice')).map(s => s.role);
    findings.push({
      rule, title: (b ?? a)!.title,
      before: a ? { alarm: a.alarm, basis: a.basis } : null,
      after: b ? { alarm: b.alarm, basis: b.basis } : null,
      figures, explainedBy,
    });
  }
  const topics = (report: VerificaReport) => new Set(report.notVerified.map(n => n.topic));
  const was = topics(before), now = topics(after);
  return {
    format: COMPARISON_FORMAT,
    from: { fingerprint: before.fingerprint, asOf: before.asOf },
    to: { fingerprint: after.fingerprint, asOf: after.asOf },
    sources, findings, unchanged,
    notVerified: {
      added: [...now].filter(t => !was.has(t)),
      removed: [...was].filter(t => !now.has(t)),
      still: [...now].filter(t => was.has(t)),
    },
  };
}
