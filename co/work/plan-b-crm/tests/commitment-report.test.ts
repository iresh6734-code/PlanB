import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCommitmentReport } from '../shared/commitment-report.js';
import type { CommitmentDetail, CommitmentEvent, CommitmentObservation } from '../shared/commitments.js';

type Role = 'sale' | 'delivery' | 'support';
const rev = (char: string) => char.repeat(64);
const esc = (value: string) => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const ref = (kind: Role, remoteId = `${kind}-1`, accountId = 'acme-demo') => ({ provider: 'hubspot', accountId, kind, remoteId });
const obs = (kind: Role, observedAt: string, extra: Partial<CommitmentObservation> = {}): CommitmentObservation =>
  ({ reference: ref(kind), observedAt, coverage: 'complete', condition: 'clear', label: `Fuente ${kind}`, ...extra });
const event = (n: number, recordedAt: string, decision: CommitmentEvent['decision'], evidence: CommitmentObservation[] = []): CommitmentEvent =>
  ({ operationId: `00000000-0000-4000-8000-00000000000${n}`, recordedAt, actor: 'local-operator', revisionBefore: rev('b'), decision, evidence });
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

function base(): CommitmentDetail {
  return {
    format: 'planb-commitments-detail-v1', mode: 'fiction', contextRevision: rev('c'),
    item: { id: 'pedido-42', title: 'Entregar pedido 42', dueAt: '2026-11-05T12:00:00Z', revision: rev('a'), status: 'at-risk', cause: 'source-blocked', affectedRole: 'delivery', action: null, closure: null },
    evidence: [
      { role: 'sale', state: 'observed', linked: { reference: ref('sale'), basis: 'explicit' }, observation: obs('sale', '2026-11-04T09:00:00Z'), candidates: [] },
      { role: 'delivery', state: 'partial', linked: { reference: ref('delivery'), basis: 'confirmed' }, observation: obs('delivery', '2026-11-04T11:00:00Z', { coverage: 'partial', condition: 'blocked' }), candidates: [] },
      { role: 'support', state: 'ambiguous', linked: null, observation: null, candidates: [ref('support', 'ticket-1'), ref('support', 'ticket-2')] },
    ],
    events: [], canCloseObserved: false,
  };
}

test('escapa en HTML todos los textos de origen y conserva los originales en JSON', () => {
  const x = (k: string) => `<i data-k='${k}'>"&`;
  const d = base();
  d.item = { ...d.item, title: x('title'), status: 'resolved', cause: 'closed-manual',
    action: { owner: x('owner'), nextStep: x('step'), dueAt: '2026-11-06T09:00:00Z' }, closure: { basis: 'manual', note: x('closure') } };
  d.evidence[0] = { ...d.evidence[0], linked: { reference: ref('sale', x('remote'), x('account')), basis: 'explicit' },
    observation: obs('sale', '2026-11-04T09:00:00Z', { label: x('label') }) };
  d.evidence[2] = { ...d.evidence[2], candidates: [ref('support', x('candidate'))] };
  d.events = [
    event(1, '2026-11-04T12:00:00Z', { type: 'assign', owner: x('ev-owner'), nextStep: x('ev-step'), dueAt: '2026-11-06T09:00:00Z' }),
    event(2, '2026-11-04T13:00:00Z', { type: 'close', basis: 'manual', note: x('ev-note') }, [obs('delivery', '2026-11-04T11:00:00Z', { label: x('ev-label') })]),
  ];
  const { html, json } = createCommitmentReport(d);
  for (const k of ['title', 'owner', 'step', 'closure', 'remote', 'account', 'label', 'candidate', 'ev-owner', 'ev-step', 'ev-note', 'ev-label']) {
    assert.ok(!html.includes(x(k)), `sin escapar: ${k}`);
    assert.ok(html.includes(esc(x(k))), `ausente: ${k}`);
  }
  assert.doesNotMatch(html, /<(script|img|iframe|link|object|embed|i )|https?:/i);
  const parsed = JSON.parse(json);
  assert.equal(parsed.detail.item.title, x('title'));
  assert.deepEqual(parsed.detail, d);
});

test('ordena por fecha y tipo de forma estable sin vincular causalmente eventos y observaciones', () => {
  const d = base();
  d.events = [
    event(1, '2026-11-04T11:00:00Z', { type: 'assign', owner: 'Ana', nextStep: 'Llamar', dueAt: '2026-11-05T09:00:00Z' }),
    event(2, '2026-11-04T10:00:00Z', { type: 'assign', owner: 'Luis', nextStep: 'Revisar', dueAt: '2026-11-05T09:00:00Z' }),
    event(3, '2026-11-04T10:00:00Z', { type: 'assign', owner: 'Eva', nextStep: 'Escalar', dueAt: '2026-11-05T09:00:00Z' }),
  ];
  const { json, html } = createCommitmentReport(d);
  const timeline = JSON.parse(json).timeline;
  assert.deepEqual(timeline.map((e: any) => e.type === 'observation' ? e.role : e.event.operationId.slice(-1)), ['sale', '2', '3', 'delivery', '1']);
  for (const entry of timeline) {
    assert.deepEqual(Object.keys(entry).sort(), entry.type === 'observation' ? ['at', 'observation', 'role', 'type'] : ['at', 'event', 'type']);
  }
  assert.ok(html.indexOf('Luis') < html.indexOf('Eva') && html.indexOf('Eva') < html.indexOf('Observación de Entrega'));
  assert.ok(html.indexOf('Observación de Entrega') < html.indexOf('Ana'));
  assert.ok(html.includes('La cercanía temporal no implica causalidad.'));
});

test('incluye aviso ficticio, contexto, revisión, cuenta, proveedor e ID', () => {
  const d = base();
  const { json, html } = createCommitmentReport(d);
  assert.equal(JSON.parse(json).format, 'planb-commitment-report-v1');
  for (const text of [`lang='es'`, 'Datos ficticios', rev('a'), rev('c'), 'pedido-42', '2026-11-05T12:00:00Z', 'hubspot / cuenta acme-demo / ID delivery-1', 'Vínculo confirmado', 'cobertura parcial']) {
    assert.ok(html.includes(text), text);
  }
});

test('separa cierre manual de entrega observada', () => {
  const manual = base();
  manual.item = { ...manual.item, status: 'resolved', cause: 'closed-manual', closure: { basis: 'manual', note: 'Cliente confirma por teléfono' } };
  manual.events = [event(1, '2026-11-04T12:00:00Z', { type: 'close', basis: 'manual', note: 'Cliente confirma por teléfono' })];
  const m = createCommitmentReport(manual);
  assert.ok(m.html.includes('decisión humana del Operador local'));
  assert.ok(m.html.includes('Entrega observada en fuentes: ninguna.'));
  assert.ok(!m.html.includes('Cierre por entrega observada') && !m.html.includes('local-operator'));
  assert.equal(JSON.parse(m.json).timeline.at(-1).event.actor, 'local-operator');

  const observed = base();
  const done = obs('delivery', '2026-11-04T11:00:00Z', { condition: 'completed' });
  observed.evidence[1] = { ...observed.evidence[1], state: 'observed', observation: done };
  observed.item = { ...observed.item, status: 'resolved', cause: 'closed-observed', closure: { basis: 'observed', note: 'Entrega completada' } };
  observed.events = [event(1, '2026-11-04T12:00:00Z', { type: 'close', basis: 'observed', note: 'Entrega completada' }, [done])];
  const o = createCommitmentReport(observed);
  assert.ok(o.html.includes('Cierre por entrega observada') && o.html.includes('Entrega observada en fuentes: Entrega.'));
  assert.ok(!o.html.includes('decisión humana'));
});

test('muestra evidencia parcial y ambigua con candidatos sin confirmar', () => {
  const { html } = createCommitmentReport(base());
  for (const text of ['Parcial', 'Ambigua: solo candidatos sin confirmar', 'ID ticket-1', 'ID ticket-2', 'Sin vínculo confirmado', 'Sin acción asignada.', 'Sin cierre registrado.']) {
    assert.ok(html.includes(text), text);
  }
});

test('valida entrada, no muta y es determinista', () => {
  const d = freeze(base());
  const snapshot = structuredClone(d);
  assert.deepEqual(createCommitmentReport(d), createCommitmentReport(d));
  assert.deepEqual(d, snapshot);
  assert.throws(() => createCommitmentReport({ ...base(), mode: 'real' } as never));
  assert.throws(() => createCommitmentReport({ ...base(), evidence: base().evidence.slice(0, 2) }));
});

test('completar una venta no acredita una entrega', () => {
  const d = base();
  d.evidence[0].observation!.condition = 'completed';
  assert.match(createCommitmentReport(d).html, /Entrega observada en fuentes: ninguna\./);
});

test('la cronología recupera la observación histórica conservada en un cierre', () => {
  const d = base();
  const historical = obs('delivery', '2026-11-03T11:00:00Z', { condition: 'completed', label: 'Evidencia anterior' });
  d.events = [event(1, '2026-11-04T12:00:00Z', { type: 'close', basis: 'observed', note: 'Cierre de ensayo' }, [historical])];
  const timeline = JSON.parse(createCommitmentReport(d).json).timeline;
  assert.equal(timeline[0].observation.label, 'Evidencia anterior');
  assert.equal(timeline[0].at, historical.observedAt);
  assert.equal(timeline.filter((entry: { type: string }) => entry.type === 'decision').length, 1);
});
