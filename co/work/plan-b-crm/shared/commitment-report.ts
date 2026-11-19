import { commitmentDetailResponse, type CommitmentDetail, type CommitmentEvent, type CommitmentEvidence, type CommitmentObservation } from './commitments.js';

export const commitmentReportFormat = 'planb-commitment-report-v1';

export type CommitmentTimelineEntry =
  | { at: string; type: 'observation'; role: CommitmentEvidence['role']; observation: CommitmentObservation }
  | { at: string; type: 'decision'; event: CommitmentEvent };

type Reference = CommitmentObservation['reference'];

const typeRank = { observation: 0, decision: 1 } as const;
const roleText = { sale: 'Venta', delivery: 'Entrega', support: 'Soporte' } as const;
const actorText = { 'local-operator': 'Operador local' } as const;
const stateText = { observed: 'Observada', partial: 'Parcial', stale: 'Desactualizada', unavailable: 'No disponible', missing: 'Sin vínculo', ambiguous: 'Ambigua: solo candidatos sin confirmar' } as const;
const coverageText = { complete: 'completa', partial: 'parcial', unavailable: 'no disponible' } as const;
const conditionText = { clear: 'sin bloqueo', blocked: 'bloqueada', completed: 'completada' } as const;
const basisText = { explicit: 'Vínculo explícito', confirmed: 'Vínculo confirmado' } as const;
const statusText = { 'at-risk': 'En riesgo', unconfirmed: 'Sin confirmar', 'no-risk-detected': 'Sin riesgo detectado', resolved: 'Resuelto' } as const;
const causeText = {
  'source-blocked': 'Fuente bloqueada', 'deadline-passed': 'Plazo vencido', 'coverage-incomplete': 'Cobertura incompleta',
  'no-blocker-observed': 'Sin bloqueo observado', 'closed-observed': 'Cerrado con entrega observada', 'closed-manual': 'Cerrado manualmente',
} as const;

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const refText = (ref: Reference) => `${ref.provider} / cuenta ${ref.accountId} / ID ${ref.remoteId}`;
const obsText = (source: CommitmentObservation) =>
  `${source.label} (${refText(source.reference)}; cobertura ${coverageText[source.coverage]}; ${source.condition ? conditionText[source.condition] : 'sin condición'}; observada ${source.observedAt})`;
const closureText = (basis: 'observed' | 'manual') => basis === 'manual'
  ? 'Cierre manual registrado como decisión humana del Operador local.'
  : 'Cierre por entrega observada, registrado por el Operador local.';

export function buildCommitmentTimeline(detail: CommitmentDetail): CommitmentTimelineEntry[] {
  const observations = new Map<string, CommitmentObservation>();
  for (const source of [...detail.evidence.flatMap(entry => entry.observation ? [entry.observation] : []), ...detail.events.flatMap(event => event.evidence)]) {
    const key = JSON.stringify([source.reference, source.observedAt, source.coverage, source.condition, source.label]);
    observations.set(key, source);
  }
  const entries: CommitmentTimelineEntry[] = [
    ...[...observations.values()].map(observation => ({ at: observation.observedAt, type: 'observation' as const, role: observation.reference.kind, observation })),
    ...detail.events.map(event => ({ at: event.recordedAt, type: 'decision' as const, event })),
  ];
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at) || typeRank[a.entry.type] - typeRank[b.entry.type] || a.index - b.index)
    .map(({ entry }) => entry);
}

function entryText(entry: CommitmentTimelineEntry) {
  if (entry.type === 'observation') return `Observación de ${roleText[entry.role]}: ${obsText(entry.observation)}`;
  const { decision, evidence, revisionBefore } = entry.event;
  const text = decision.type === 'assign'
    ? `Decisión de ${actorText[entry.event.actor]}: asigna a ${decision.owner} el siguiente paso «${decision.nextStep}» con vencimiento ${decision.dueAt}.`
    : `Decisión: ${closureText(decision.basis)} Nota: ${decision.note}`;
  const attached = evidence.length ? ` Evidencia registrada junto a la decisión: ${evidence.map(obsText).join('; ')}.` : ' Sin evidencia adjunta.';
  return `${text}${attached} Revisión previa: ${revisionBefore}.`;
}

const evidenceColumns = ['Estado', 'Vínculo y base', 'Observación y cobertura', 'Candidatos sin confirmar'];
const row = (head: string, cells: string[], labels?: string[]) =>
  `<tr${labels ? " role='row'" : ''}><th scope='row'${labels ? " role='rowheader'" : ''}>${esc(head)}</th>${cells.map((cell, index) =>
    `<td${labels ? " role='cell'" : ''}>${labels ? `<span class='report-cell-label' aria-hidden='true'>${esc(labels[index])}</span>` : ''}${esc(cell)}</td>`).join('')}</tr>`;

function evidenceRow(entry: CommitmentEvidence) {
  return row(roleText[entry.role], [
    stateText[entry.state],
    entry.linked ? `${basisText[entry.linked.basis]}: ${refText(entry.linked.reference)}` : 'Sin vínculo confirmado',
    entry.observation ? obsText(entry.observation) : 'Sin observación',
    entry.candidates.length ? entry.candidates.map(refText).join('; ') : 'Ninguno',
  ], evidenceColumns);
}

function renderHtml(detail: CommitmentDetail, timeline: CommitmentTimelineEntry[]) {
  const { item } = detail;
  const delivered = detail.evidence
    .filter(entry => entry.role === 'delivery' && entry.state === 'observed' && entry.observation?.condition === 'completed')
    .map(entry => roleText[entry.role]);
  const facts: [string, string][] = [
    ['ID del compromiso', item.id], ['Vencimiento', item.dueAt], ['Estado', statusText[item.status]], ['Causa', causeText[item.cause]],
    ['Rol afectado', item.affectedRole ? roleText[item.affectedRole] : 'Ninguno'],
    ['Revisión', item.revision], ['Revisión de contexto', detail.contextRevision],
  ];
  return [
    '<!doctype html>', `<html lang='es'>`, `<head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>`,
    `<title>Película del incidente: ${esc(item.title)}</title>`,
    `<style>
body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.5;color:#111;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{border:1px solid #666;padding:.4rem;text-align:left;vertical-align:top}
.aviso{border:2px solid #8a5a00;padding:.5rem}
.report-cell-label{display:none}
@media screen and (max-width:42rem){
  .evidence-table,.evidence-table tbody{display:block}
  .evidence-table thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  .evidence-table tbody tr{display:block;margin-bottom:1rem;border:1px solid #666}
  .evidence-table tbody th,.evidence-table tbody td{display:block;border:0;padding:.6rem}
  .evidence-table tbody th{background:#eee;border-bottom:1px solid #666}
  .evidence-table tbody td+td{border-top:1px solid #ddd}
  .report-cell-label{display:block;font-weight:600;margin-bottom:.2rem}
}
</style>`,
    '</head><body><main>',
    `<h1>Película del incidente: ${esc(item.title)}</h1>`,
    `<p class='aviso' role='note'><strong>Datos ficticios de demostración.</strong> No corresponden a clientes ni operaciones reales.</p>`,
    `<section aria-labelledby='resumen'><h2 id='resumen'>Resumen</h2><table aria-label='Resumen'>`,
    ...facts.map(([head, value]) => row(head, [value])),
    '</table></section>',
    `<section aria-labelledby='evidencia'><h2 id='evidencia'>Evidencia por rol</h2><table class='evidence-table' aria-label='Evidencia por rol' role='table'><thead role='rowgroup'><tr role='row'>`,
    ['Rol', ...evidenceColumns].map(head => `<th scope='col' role='columnheader'>${head}</th>`).join(''),
    '</tr></thead><tbody role=\'rowgroup\'>', ...detail.evidence.map(evidenceRow), '</tbody></table></section>',
    `<section aria-labelledby='acciones'><h2 id='acciones'>Acción vigente</h2>`,
    item.action
      ? `<p>Responsable: ${esc(item.action.owner)}. Siguiente paso: ${esc(item.action.nextStep)}. Vence: ${esc(item.action.dueAt)}.</p>`
      : '<p>Sin acción asignada.</p>',
    `</section><section aria-labelledby='cronologia'><h2 id='cronologia'>Cronología</h2>`,
    '<p>Orden por fecha y tipo. La cercanía temporal no implica causalidad.</p>',
    timeline.length
      ? `<ol>${timeline.map(entry => `<li><time datetime='${esc(entry.at)}'>${esc(entry.at)}</time> — ${esc(entryText(entry))}</li>`).join('')}</ol>`
      : '<p>Sin eventos registrados.</p>',
    `</section><section aria-labelledby='cierre'><h2 id='cierre'>Cierre</h2>`,
    item.closure ? `<p>${esc(closureText(item.closure.basis))}</p><p>Razón: ${esc(item.closure.note)}</p>` : '<p>Sin cierre registrado.</p>',
    `<p>Entrega observada en fuentes: ${esc(delivered.length ? delivered.join(', ') : 'ninguna')}.</p>`,
    '</section></main></body></html>',
  ].join('\n');
}

export function createCommitmentReport(detail: CommitmentDetail): { json: string; html: string } {
  const parsed = commitmentDetailResponse.parse(detail);
  const timeline = buildCommitmentTimeline(parsed);
  return {
    json: JSON.stringify({ format: commitmentReportFormat, detail: parsed, timeline }, null, 2),
    html: renderHtml(parsed, timeline),
  };
}
