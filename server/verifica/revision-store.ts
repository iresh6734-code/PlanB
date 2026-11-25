import { REVIEW_FORMAT, type FindingDecision, type ReviewDecision, type ReviewFinding } from '../../shared/verifica/revision.js';
import { fingerprintOf } from '../../shared/verifica/report.js';
import type { VerificaRuleId } from '../../shared/verifica/model.js';
import type { Store } from '../store.js';

interface ReviewIndex { sequence: number; head: string | null; latest: Partial<Record<VerificaRuleId, FindingDecision>> }
const indexKey = (id: string) => `verifica:review-index:${id}`;
const entryKey = (id: string, sequence: number) => `verifica:review-entry:${id}:${sequence}`;

export const reviewIndex = (store: Store, id: string) => store.get<ReviewIndex>(indexKey(id), { sequence: 0, head: null, latest: {} });

/** Presenta una ventana breve. Las decisiones anteriores se conservan en filas independientes del encargo. */
export function recentReviewDecisions(store: Store, id: string, sequence: number): FindingDecision[] {
  return Array.from({ length: Math.min(sequence, 8) }, (_, offset) => store.get<FindingDecision | null>(entryKey(id, sequence - offset), null))
    .filter((entry): entry is FindingDecision => entry !== null);
}

export function appendReviewDecision(store: Store, id: string, at: string, index: ReviewIndex, report: string, finding: ReviewFinding, decision: ReviewDecision) {
  if (!store.db.isTransaction) throw new Error('La decisión requiere una transacción.');
  const body: Omit<FindingDecision, 'fingerprint'> = { format: REVIEW_FORMAT, engagement: id, sequence: index.sequence + 1, at, rule: finding.rule,
    report, evidence: finding.evidence, decision, statement: decision === 'reviewed-declaration' ? finding.statement : null, previous: index.head };
  const entry: FindingDecision = { ...body, fingerprint: fingerprintOf(body) };
  const key = entryKey(id, entry.sequence);
  if (store.db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) throw new Error('La secuencia de revisión ya existe.');
  store.set(key, entry);
  store.set(indexKey(id), { sequence: entry.sequence, head: entry.fingerprint, latest: { ...index.latest, [entry.rule]: entry } } satisfies ReviewIndex);
  return entry;
}
