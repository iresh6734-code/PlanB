import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBaseApp } from '../server/app.js';
import { registerContinuityEvidenceApi } from '../server/continuity-evidence-api.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { compareCaptures } from '../shared/capture-comparison.js';
import { buildResponseQueue } from '../shared/response-queue.js';
import type { ContinuityEvidenceApiResponse } from '../shared/continuity-evidence-api.js';
import type { ReadCheckApiState } from '../shared/hubspot-read-check-api.js';
import type { PassportWorkSummary, RelayRehearsalRecord } from '../shared/continuity-passport.js';
import { buildImpactMap, comparisonInput, impactExport, impactToHtml, impactToJson, queueInput, safeLocalLink, type ContextualSource, type ImpactInputs, type ImpactMap } from '../shared/impact-map.js';

// Unidad 215. Modelo y presentación del mapa de impacto con ENTRADAS EXPLÍCITAS. Evidencia de copia = servicio REAL de continuidad; cola y comparación = contratos REALES
// (`buildResponseQueue`, `compareCaptures`) sobre una ficción; las demás, contratos construidos a mano. Nada llama a un proveedor.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { ImpactMap: ImpactMapView } = await import('../src/ImpactMap.js');
const NOW = Date.parse('2026-11-05T12:00:00.000Z'), T = (m: number) => new Date(NOW - m * 60_000).toISOString(), CTX = 'cap:agency:' + T(45), OTHER = 'cap:distribution:' + T(500);

async function evidence(captureMinutesAgo = 45): Promise<ContinuityEvidenceApiResponse> {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: '.', staticDir: 'none' });
  try {
    const snapshot = makeFixture('agency'); snapshot.capturedAt = T(captureMinutesAgo);
    store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: T(44), prompt: '', approved: false }); store.activate();
    registerContinuityEvidenceApi(app, store, () => NOW); await app.ready();
    return (await app.inject({ url: '/api/v7/continuity/evidence', headers: { host: '127.0.0.1:4513', origin: 'http://127.0.0.1:4513' } })).json() as ContinuityEvidenceApiResponse;
  } finally { await app.close(); }
}
const src = <V,>(value: V | null, status: 'read' | 'unavailable' | 'not-provided' = 'read', context: string | null = CTX, at: string | null = T(1)): ContextualSource<V> => ({ status: value === null && status === 'read' ? 'not-provided' : status, at, value, context });
function realQueue(dropContacts = false) {
  const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
  const records = dropContacts ? snapshot.records.filter(r => r.entity !== 'contacts') : snapshot.records;   // las tareas de la ficción referencian clientes y oportunidades
  return buildResponseQueue({ spec, records, evaluatedAt: NOW, horizonHours: 24, limit: 200 });
}
const counts = { contacts: 12, companies: 6, deals: 5, tasks: 18 };
const work = (c: PassportWorkSummary['counts']): PassportWorkSummary => ({ status: c ? 'read' : 'unavailable', at: T(2), counts: c });
const relay = (over: Partial<RelayRehearsalRecord> = {}): RelayRehearsalRecord => ({ rehearsedAt: T(30), captureId: CTX, outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: ['tareas locales', 'historial'], notInherited: ['aprobaciones ejecutables'], ...over });
const hubspot = (evidence: ReadCheckApiState['evidence'] = null, over: Partial<ReadCheckApiState> = {}): ReadCheckApiState => ({ format: 'planb-hubspot-read-check-api-v1', configured: true, portal: { id: '12345', mode: 'rehearsal' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: true, reason: null }, running: null,
  view: { state: evidence ? evidence.state : 'saved_unchecked', fresh: !!evidence && Date.parse(evidence.freshUntil) > NOW, label: 'x', detail: 'y', environment: 'rehearsal', checkedAt: evidence?.checkedAt ?? null }, evidence, invalidated: null, issue: null, message: null, ...over });
const verified = (minutesAgo: number): NonNullable<ReadCheckApiState['evidence']> => ({ checkedAt: T(minutesAgo), freshUntil: new Date(NOW - minutesAgo * 60_000 + 900_000).toISOString(), state: 'read_verified', environment: 'rehearsal', accountType: 'SANDBOX', portalId: '12345', objects: ['contacts', 'companies', 'deals', 'tasks'].map(entity => ({ entity: entity as 'contacts', outcome: 'readable' as const, httpStatus: 200 })), retryAfterSeconds: null, requests: 5, truncated: 0, blocked: 0, durationMs: 700, message: 'ok' });
async function inputs(over: Partial<ImpactInputs> = {}): Promise<ImpactInputs> {
  const snapshotA = makeFixture('agency'), snapshotB = structuredClone(snapshotA); snapshotB.capturedAt = T(5); snapshotA.capturedAt = T(45);
  const cmp = compareCaptures(snapshotA, snapshotB);
  return { now: NOW, expectedContext: CTX, copy: src(await evidence()), inventory: src({ capturedAt: T(45), counts }), comparison: src(comparisonInput(cmp, { fromAt: T(45), toAt: T(5) })), queue: src(queueInput(realQueue())), work: src(work({ drafts: 0, unknownOutcome: 0, settled: 2, otherContext: 0, unreadable: 0 })),
    hubspot: { status: 'read', at: T(1), value: hubspot(verified(3)) }, relay: src(relay()), evidenceLink: '#/continuidad', ...over };
}
const row = (m: ImpactMap, id: string) => m.rows.find(r => r.id === id)!;

test('con contratos REALES (evidencia, cola y comparación): cobertura por entidad observada, antigüedad, cola y recuperación con su base, y un resumen fiel', async () => {
  const m = buildImpactMap(await inputs());
  for (const e of ['contacts', 'companies', 'deals', 'tasks']) { const r = row(m, 'coverage:' + e); assert.equal(r.status, 'ok'); assert.equal(r.basis, 'observed'); assert.match(r.detail, /registros? de/); assert.match(r.limits.join(' '), /no el estado actual del CRM/); }
  assert.equal(row(m, 'age:copy').status, 'ok'); assert.match(row(m, 'age:copy').detail, /hace 45 minutos/);
  assert.ok(row(m, 'changes:comparison')); assert.match(row(m, 'changes:comparison').detail, /no hay diferencias|registros? distintos?/);
  assert.equal(row(m, 'recovery:rehearsal').status, 'ok'); assert.match(row(m, 'recovery:rehearsal').detail, /No demuestra otro equipo/); assert.equal(row(m, 'recovery:export').basis, 'unverified', 'sin registro de exportación en la evidencia real');
  assert.equal(m.rows.every(r => r.action !== null || r.status === 'ok' || r.missing !== null), true, 'nunca una fila problemática sin acción ni explicación');
  assert.match(m.summary.lines[0]!.text, /Tenemos una copia capturada el/); assert.ok(m.summary.lines.at(-1)!.text.startsWith('No está demostrado')); assert.equal(m.summary.evidenceLink, '#/continuidad');
  assert.deepEqual(m.provenance.map(p => p.source), ['copy', 'inventory', 'comparison', 'queue', 'work', 'relay', 'hubspot']);
});

test('DATOS AUSENTES: cobertura, cola y trabajo son «desconocidos» (no cero); sin copia leída no se inventa ninguna cifra', async () => {
  const none = <V,>() => src<V>(null, 'not-provided', null, null);
  const m = buildImpactMap({ now: NOW, expectedContext: CTX, copy: none(), inventory: none(), comparison: none(), queue: none(), work: none(), hubspot: { status: 'not-provided', at: null, value: null }, relay: none() });
  for (const e of ['contacts', 'companies', 'deals', 'tasks']) { const r = row(m, 'coverage:' + e); assert.equal(r.status, 'unknown'); assert.match(r.detail, /no es cero/); }
  assert.equal(row(m, 'queue').status, 'unknown'); assert.equal(row(m, 'work').status, 'unknown'); assert.match(row(m, 'work').detail, /no es cero/); assert.equal(row(m, 'copy').status, 'unknown');
  assert.ok(!m.rows.some(r => /\b0 (registros|tareas)/.test(r.detail)), 'ningún cero inventado'); assert.match(m.summary.lead, /sin comprobar/); assert.equal(m.summary.firstDecision!.action, 'open-continuity');
  assert.ok(m.summary.lines.some(l => /Se desconoce si hay operaciones por comprobar/.test(l.text)));
});

test('CERO OBSERVADO ≠ DESCONOCIDO: un área sin registros en la captura pide atención; sin inventario es desconocido', async () => {
  const m = buildImpactMap(await inputs({ inventory: src({ capturedAt: T(45), counts: { ...counts, companies: 0 } }) }));
  assert.equal(row(m, 'coverage:companies').status, 'attention'); assert.match(row(m, 'coverage:companies').detail, /no trae registros de empresas \(pudo no capturarse o no existir\)/); assert.equal(row(m, 'coverage:contacts').status, 'ok');
  assert.match(m.summary.lines.find(l => /admiten trabajo local/.test(l.text))!.text, /3 áreas admiten trabajo local \(clientes, oportunidades, tareas\); sin registros en la captura: empresas/);
});

test('REFERENCIAS SIN COMPROBAR (cola real): una tarea que menciona clientes que la copia no contiene se muestra como referencia sin comprobar y NUNCA como borrada del CRM', async () => {
  const q = queueInput(realQueue(true)); assert.ok(q.unavailableReferences.some(g => g.entity === 'contacts' && g.tasks > 0), 'la cola real marca referencias no disponibles');
  const m = buildImpactMap(await inputs({ queue: src(q) })), r = row(m, 'references:contacts');
  assert.equal(r.status, 'unknown'); assert.match(r.detail, /clientes que la copia no contiene/); assert.match(r.detail, /No significa que se haya borrado del CRM/); assert.equal(r.action, 'open-today'); assert.match(r.limits.join(' '), /no se ha consultado el CRM/);
  assert.ok(!/(se borró|fue borrad|eliminad)/i.test(JSON.stringify(m.rows)), 'jamás concluye que se borró');
  assert.ok(m.summary.lines.some(l => /referencia sin comprobar/.test(l.text)));
  assert.equal(queueInput(realQueue(false)).unavailableReferences.length, 0); assert.ok(!buildImpactMap(await inputs({ queue: src(queueInput(realQueue(false))) })).rows.some(x => x.area === 'references'), 'con la copia completa no hay filas de referencias');
});

test('SIN COPIA UTILIZABLE: bloquea y la primera decisión es prepararla; copia antigua = atención con su objetivo', async () => {
  const blocked = buildImpactMap(await inputs({ copy: src({ format: 'planb-continuity-evidence-api-v1', available: false, issue: 'NO_ACTIVE_COPY', error: 'Activa una copia conciliada antes de revisar su evidencia.', context: null, parameters: null, evaluation: null, facts: null, limitations: [] } as ContinuityEvidenceApiResponse) }));
  assert.equal(row(blocked, 'copy').status, 'blocked'); assert.equal(blocked.rows[0]!.status, 'blocked'); assert.equal(blocked.summary.firstDecision!.action, 'open-preparation'); assert.match(blocked.summary.lead, /bloqueo/);
  const old = buildImpactMap(await inputs({ copy: src(await evidence(300)) })); assert.equal(row(old, 'age:copy').status, 'attention'); assert.match(row(old, 'age:copy').detail, /objetivo de antigüedad: 60 min/); assert.match(row(old, 'age:copy').detail, /puede faltar lo que cambió/);
});

test('OTRA COPIA no se mezcla: inventario, cola o ensayo de otro contexto se excluyen, se declaran y no alimentan cobertura ni resumen', async () => {
  const m = buildImpactMap(await inputs({ inventory: src({ capturedAt: T(500), counts: { contacts: 99, companies: 99, deals: 99, tasks: 99 } }, 'read', OTHER), relay: src(relay(), 'read', OTHER) }));
  assert.ok(row(m, 'other-context:inventory')); assert.match(row(m, 'other-context:inventory').detail, /otra captura/); assert.ok(row(m, 'other-context:relay'));
  for (const e of ['contacts', 'companies', 'deals', 'tasks']) assert.equal(row(m, 'coverage:' + e).status, 'unknown', 'sin inventario del contexto activo, la cobertura se desconoce');
  assert.ok(!JSON.stringify(m).includes('99 registros')); assert.equal(m.provenance.find(p => p.source === 'inventory')!.usable, false); assert.ok(m.summary.lines.some(l => /No consta un ensayo de relevo con esta copia/.test(l.text)));
  const none = buildImpactMap(await inputs({ expectedContext: null })); assert.ok(none.provenance.filter(p => p.source !== 'hubspot').every(p => !p.usable), 'sin contexto activo no se acepta ninguna fuente contextual');
});

test('TRABAJO QUE REQUIERE INTERVENCIÓN: guardados por comprobar y borradores piden Hoy; cuaderno ilegible es desconocido y dice qué falta; el resumen cuenta lo acreditado', async () => {
  const m = buildImpactMap(await inputs({ work: src(work({ drafts: 2, unknownOutcome: 3, settled: 5, otherContext: 1, unreadable: 1 })), queue: src(queueInput(realQueue())) }));
  assert.equal(row(m, 'work:uncertain').status, 'attention'); assert.match(row(m, 'work:uncertain').detail, /3 guardados salieron y no se sabe si se aplicaron/); assert.equal(row(m, 'work:uncertain').action, 'open-today');
  assert.equal(row(m, 'work:drafts').status, 'attention'); assert.equal(row(m, 'work:unreadable').status, 'unknown'); assert.equal(row(m, 'work:unreadable').action, null); assert.match(row(m, 'work:unreadable').missing!, /Falta una superficie/);
  assert.ok(m.summary.lines.some(l => /Queda 3 operaciones por comprobar/.test(l.text))); assert.equal(m.summary.firstDecision!.action, 'open-today');
  const unreadable = buildImpactMap(await inputs({ work: src(work(null)) })); assert.equal(row(unreadable, 'work').status, 'unknown'); assert.ok(unreadable.summary.lines.some(l => /Se desconoce si hay operaciones por comprobar/.test(l.text)));
  assert.ok(!/task-|Llamar a|completed/.test(JSON.stringify(impactExport(m))), 'sin IDs de tarea ni valores');
});

test('ACCESO AL CRM y RECUPERACIÓN: lectura caducada conserva fecha; producción no autorizada no ofrece acción pero explica; ensayo antiguo o fallido pide repetirlo', async () => {
  const stale = buildImpactMap(await inputs({ hubspot: { status: 'read', at: T(1), value: hubspot(verified(40)) } })), a = row(stale, 'access:hubspot');
  assert.equal(a.currency, 'expired'); assert.equal(a.status, 'attention'); assert.match(a.detail, /caducó/); assert.equal(a.at, T(40)); assert.equal(a.action, 'open-integrations');
  const prod = buildImpactMap(await inputs({ hubspot: { status: 'read', at: T(1), value: hubspot(null, { portal: { id: '12345', mode: 'production' }, consent: { reads: 5, writes: 0, freshnessMinutes: 15, allowed: false, reason: 'solo ensayo' } }) } })), p = row(prod, 'access:hubspot');
  assert.equal(p.action, null); assert.match(p.missing!, /solo está autorizada para cuentas de ensayo/); assert.equal(p.basis, 'declared');
  assert.equal(row(buildImpactMap(await inputs({ hubspot: { status: 'read', at: T(1), value: hubspot(null, { configured: false, portal: null }) } })), 'access:hubspot').status, 'ok');
  const old = buildImpactMap(await inputs({ relay: src(relay({ rehearsedAt: T(3000) })) })); assert.equal(row(old, 'recovery:rehearsal').status, 'attention'); assert.equal(row(old, 'recovery:rehearsal').currency, 'expired'); assert.equal(row(old, 'recovery:rehearsal').action, 'start-rehearsal');
  const failed = buildImpactMap(await inputs({ relay: src(relay({ outcome: 'failed' })) })); assert.equal(row(failed, 'recovery:rehearsal').status, 'attention'); assert.match(row(failed, 'recovery:rehearsal').detail, /falló/);
});

test('RESUMEN DE TURNO: la decisión urgente va primero, las filas ordenan bloquea > atención > sin comprobar > sin incidencia y el plan de relevo lista solo lo accionable', async () => {
  const m = buildImpactMap(await inputs({ work: src(work({ drafts: 0, unknownOutcome: 1, settled: 0, otherContext: 0, unreadable: 0 })), relay: src<RelayRehearsalRecord>(null, 'not-provided') }));
  const ranks = m.rows.map(r => ({ blocked: 0, attention: 1, unknown: 2, ok: 3 }[r.status])); assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'orden estable por urgencia');
  assert.equal(m.summary.firstDecision!.title, 'Guardados por comprobar'); assert.match(m.summary.lead, /Se puede seguir, con \d+ puntos? que requiere/);
  assert.ok(m.summary.handoffPlan[0]!.startsWith('Guardados por comprobar')); assert.ok(m.summary.handoffPlan.every(p => /bloquea|requiere atención|sin comprobar/.test(p)));
  assert.deepEqual(buildImpactMap(await inputs()).rows.map(r => r.id), buildImpactMap(await inputs()).rows.map(r => r.id), 'determinista');
  const clean = buildImpactMap(await inputs({ copy: src(await evidence()), relay: src(relay()) })); assert.notEqual(clean.summary.lead, '');
});

test('EXPORTACIÓN por lista blanca: claves exactas, plan de relevo y enlace local relativo; texto hostil, rutas y enlaces externos no salen', async () => {
  const evil = ['C:\\Users\\iresh\\AppData\\secreto.txt', '<script>alert(1)</script>', 'pat-' + 'A'.repeat(60), 'x'.repeat(4000)];
  const m = buildImpactMap(await inputs({ relay: src(relay({ included: evil })), evidenceLink: 'https://evil.example/x' })), json = impactToJson(m), parsed = JSON.parse(json);
  assert.equal(parsed.format, 'planb-impact-map-v1'); assert.deepEqual(Object.keys(parsed).sort(), ['context', 'format', 'generatedAt', 'notice', 'provenance', 'rows', 'summary']); assert.equal(parsed.summary.evidenceLink, null, 'una URL no es un enlace local');
  for (const r of parsed.rows) assert.deepEqual(Object.keys(r).sort(), ['action', 'area', 'at', 'basis', 'context', 'currency', 'detail', 'id', 'limits', 'missing', 'status', 'title']);
  for (const secret of ['iresh', 'AppData', 'secreto', 'pat-AAAA']) assert.ok(!json.includes(secret), secret);
  assert.deepEqual([safeLocalLink('#/continuidad'), safeLocalLink('/continuidad?x=1'), safeLocalLink('https://a.b'), safeLocalLink('C:\\x'), safeLocalLink('../x'), safeLocalLink('//x'), safeLocalLink(5)], ['#/continuidad', '/continuidad?x=1', null, null, null, null, null]);
  const html = impactToHtml(m); assert.doesNotMatch(html, /<script|<img|<link|<iframe|<form|https?:\/\//i); assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/); assert.match(html, /Plan de relevo|Estado/);
  assert.equal(impactToJson(m), json, 'determinista');
});

test('FILA SIN ACCIÓN: una comparación fuera de orden pide atención y, al no haber superficie que la resuelva, dice qué falta (nunca queda un problema mudo)', async () => {
  const base = await inputs(), cmp = base.comparison.value!;
  const m = buildImpactMap({ ...base, comparison: src({ ...cmp, chronological: false }) }), r = row(m, 'changes:comparison');
  assert.equal(r.status, 'attention'); assert.equal(r.action, null); assert.match(r.missing!, /No hay una acción disponible desde aquí/); assert.match(r.detail, /no están en orden cronológico/);
});

test('ADAPTADORES: la cola real y la comparación real se resumen sin filtrar tareas ni valores', () => {
  const q = queueInput(realQueue(true)); assert.deepEqual(Object.keys(q).sort(), ['evaluatedAt', 'sampleTruncated', 'summary', 'unavailableReferences']);
  const a = makeFixture('agency'), b = structuredClone(a); b.records.find(r => r.entity === 'tasks')!.values.notes = 'cambiado-xyz';
  const c = comparisonInput(compareCaptures(a, b), { fromAt: T(60), toAt: T(5) }); assert.equal(c.totalDifferences, 1); assert.equal(c.counts.tasks.changed, 1); assert.ok(!JSON.stringify(c).includes('cambiado-xyz'));
});

test('PRESENTACIÓN (render de servidor): resumen de turno primero, atención visible, resto plegado, botón solo si hay acción y exportación manual', async () => {
  const m = buildImpactMap(await inputs({ work: src(work({ drafts: 1, unknownOutcome: 2, settled: 0, otherContext: 0, unreadable: 1 })) }));
  const withAction = renderToStaticMarkup(createElement(ImpactMapView, { map: m, onAction: () => undefined })), without = renderToStaticMarkup(createElement(ImpactMapView, { map: m }));
  assert.ok(withAction.indexOf('Resumen de turno') < withAction.indexOf('Qué requiere atención ahora')); assert.match(withAction, /Primera decisión:/); assert.match(withAction, /<button[^>]*>Abrir Hoy<\/button>/); assert.doesNotMatch(without, /<button[^>]*>Abrir Hoy/); assert.match(without, /Desde el menú: abrir hoy/);
  assert.match(withAction, /<details class="imp-more">/); assert.match(withAction, /Falta: Falta una superficie/); assert.match(withAction, /Descargar HTML/); assert.doesNotMatch(withAction, /<script|dangerouslySetInnerHTML/);
});

// ── R2 (dictamen independiente 229): vigencia efectiva compartida con el pasaporte 214 y ensayo ficticio con alcance propio ──────────────────────────────────────────
const fiction = (over: Partial<RelayRehearsalRecord> = {}): RelayRehearsalRecord => relay({ captureId: null, scope: 'fiction', ...over });
const freshUntilOf = (state: ReadCheckApiState) => Date.parse(state.evidence!.freshUntil);
const exportedRow = (m: ImpactMap, id: string) => (JSON.parse(impactToJson(m)).rows as { id: string; status: string; currency: string; action: string | null; context: string | null }[]).find(r => r.id === id)!;

test('R2·1 VIGENCIA EFECTIVA: la misma lectura pasa de vigente a caducada solo por el reloj; fila, acción, resumen y exportación coinciden y no hay otra petición', async () => {
  const base = await inputs(), state = hubspot(verified(3)), edge = freshUntilOf(state), before = JSON.stringify(state);
  const at = (now: number) => buildImpactMap({ ...base, now, hubspot: { status: 'read', at: T(1), value: state } });
  const onEdge = at(edge), after = at(edge + 1);
  assert.deepEqual([row(onEdge, 'access:hubspot').currency, row(onEdge, 'access:hubspot').status, row(onEdge, 'access:hubspot').action], ['current', 'ok', null], 'en el límite exacto aún vale (misma regla que el pasaporte)');
  const expired = row(after, 'access:hubspot');
  assert.deepEqual([expired.currency, expired.status, expired.action, expired.at], ['expired', 'attention', 'open-integrations', state.evidence!.checkedAt], 'un milisegundo después caduca y conserva la fecha de la lectura');
  const line = after.summary.lines.find(l => /lectura de HubSpot/.test(l.text))!;
  assert.match(line.text, /caducó/); assert.equal(line.status, 'attention', 'el resumen no sale en verde con la fila en atención');
  assert.deepEqual([exportedRow(after, 'access:hubspot').currency, exportedRow(after, 'access:hubspot').status, exportedRow(after, 'access:hubspot').action], ['expired', 'attention', 'open-integrations'], 'la exportación lleva la misma evaluación');
  assert.equal(JSON.stringify(state), before, 'la respuesta recibida no se modifica: caducar no la reescribe ni pide otra lectura');
});
test('R2·1 VIGENCIA: reloj o ventana inválidos = desconocida (nunca vigente); una comprobación en curso no es caducidad; un resultado antiguo conserva fecha y alcance', async () => {
  const base = await inputs(), state = hubspot(verified(3));
  const badClock = row(buildImpactMap({ ...base, now: Number.NaN, hubspot: { status: 'read', at: T(1), value: state } }), 'access:hubspot');
  assert.deepEqual([badClock.currency, badClock.status], ['unknown', 'unknown']); assert.match(badClock.detail, /no se puede determinar/i); assert.equal(badClock.action, 'open-integrations');
  const inverted = { ...state, evidence: { ...state.evidence!, freshUntil: T(60) } };   // freshUntil anterior a checkedAt
  const badWindow = row(buildImpactMap({ ...base, hubspot: { status: 'read', at: T(1), value: inverted } }), 'access:hubspot'); assert.equal(badWindow.currency, 'unknown'); assert.notEqual(badWindow.status, 'ok');
  const running = hubspot(verified(40), { running: { since: T(1) } });
  running.view = { ...running.view, state: 'checking', fresh: false };
  const checking = row(buildImpactMap({ ...base, hubspot: { status: 'read', at: T(1), value: running } }), 'access:hubspot');
  assert.match(checking.detail, /comprobación en curso/); assert.equal(checking.status, 'unknown', 'a la espera del resultado: ni verde ni atención'); assert.equal(checking.action, 'open-integrations'); assert.equal(checking.at, T(40), 'conserva la fecha de la lectura anterior');
  const firstRun = row(buildImpactMap({ ...base, hubspot: { status: 'read', at: T(1), value: hubspot(null, { running: { since: T(1) } }) } }), 'access:hubspot'); assert.equal(firstRun.status, 'unknown'); assert.match(firstRun.detail, /en curso/);
});
test('R2·2 ENSAYO ANTIGUO: fila, resumen y exportación dan el mismo dictamen a ambos lados del umbral; fecha o reloj inválidos = desconocido', async () => {
  const base = await inputs(), max = base.copy.value && base.copy.value.available ? base.copy.value.parameters.maxEvidenceAgeMinutes : 1440;
  const run = (minutesAgo: number, now = NOW, over: Partial<RelayRehearsalRecord> = {}) => buildImpactMap({ ...base, now, relay: src(relay({ rehearsedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), ...over })) });
  const line = (m: ImpactMap) => m.summary.lines.find(l => /^El último ensayo de relevo/.test(l.text))!;
  const onEdge = run(max), over = run(max + 1);
  assert.deepEqual([row(onEdge, 'recovery:rehearsal').currency, row(onEdge, 'recovery:rehearsal').status, line(onEdge).status], ['current', 'ok', 'ok'], 'justo en el umbral sigue vigente');
  assert.deepEqual([row(over, 'recovery:rehearsal').currency, row(over, 'recovery:rehearsal').status, line(over).status, row(over, 'recovery:rehearsal').action], ['expired', 'attention', 'attention', 'start-rehearsal']);
  assert.match(line(over).text, /caducó|antigu/i, 'el resumen explica la vigencia');
  assert.deepEqual([exportedRow(over, 'recovery:rehearsal').status, exportedRow(over, 'recovery:rehearsal').currency], ['attention', 'expired']);
  const badClock = run(10, Number.NaN), invalidDate = run(10, NOW, { rehearsedAt: 'no-es-fecha' });
  for (const m of [badClock, invalidDate]) { assert.equal(row(m, 'recovery:rehearsal').currency, 'unknown'); assert.notEqual(row(m, 'recovery:rehearsal').status, 'ok'); assert.notEqual(line(m).status, 'ok'); }
  const recent = run(10); assert.deepEqual([row(recent, 'recovery:rehearsal').status, line(recent).status], ['ok', 'ok']);
  assert.equal(row(run(max + 5, NOW, { outcome: 'failed' }), 'recovery:rehearsal').status, 'attention');
});
test('R2·3 ENSAYO FICTICIO: alcance propio, sin ligarlo a ninguna captura ni acreditar la copia activa; alcance desconocido y otra copia siguen aparte', async () => {
  const base = await inputs();
  const fic = buildImpactMap({ ...base, relay: { status: 'read', at: T(1), context: null, value: fiction() } });
  assert.equal(fic.rows.some(r => r.id === 'other-context:relay'), false, 'sin captura no es «otra copia»');
  const practice = row(fic, 'recovery:practice'); assert.equal(practice.status, 'ok'); assert.equal(practice.context, null, 'no se rellena con la captura activa'); assert.equal(practice.action, null, 'no se recomienda repetirla');
  assert.match(practice.detail, /ficticios/); assert.match(practice.detail, /no acredita/i); assert.ok(practice.limits.length > 0);
  assert.equal(fic.rows.some(r => r.id === 'recovery:rehearsal'), false, 'la práctica no se hace pasar por un ensayo de la copia');
  const line = fic.summary.lines.find(l => /último ensayo de relevo.*datos ficticios/.test(l.text))!; assert.ok(line); assert.doesNotMatch(line.text, /recuperó/); assert.match(fic.summary.lines.at(-1)!.text, /copia activa/);
  assert.equal(fic.provenance.find(p => p.source === 'relay')!.usable, true); assert.equal(exportedRow(fic, 'recovery:practice').context, null);
  assert.equal(row(buildImpactMap({ ...base, relay: src(fiction()) }), 'recovery:practice').context, null, 'aunque la fuente traiga contexto, la ficción no lo hereda');
  const failedFiction = row(buildImpactMap({ ...base, relay: { status: 'read', at: T(1), context: null, value: fiction({ outcome: 'failed' }) } }), 'recovery:practice'); assert.deepEqual([failedFiction.status, failedFiction.action], ['attention', 'start-rehearsal']);
  const unknownScope = row(buildImpactMap({ ...base, relay: src(relay({ captureId: null })) }), 'recovery:rehearsal'); assert.equal(unknownScope.status, 'unknown'); assert.match(unknownScope.detail, /no identifica/i); assert.notEqual(unknownScope.currency, 'current');
  const otherMap = buildImpactMap({ ...base, relay: src(relay({ captureId: OTHER })) }); assert.match(row(otherMap, 'other-context:relay').detail, /otra captura/i); assert.notEqual(row(otherMap, 'recovery:rehearsal').status, 'ok');
});
