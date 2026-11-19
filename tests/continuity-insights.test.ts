import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../shared/operations.js';
import { captureLedger, continuityReadiness, copyVitals, drillCalendar, formatAge, formatBytes, hourlyCaptures, jobStats, outageForecast, readinessFor, readinessSignal, type InsightContext, type InsightSource } from '../src/app-shell/continuity-insights.js';

const NOW = new Date(2026, 10, 19, 12, 30);
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const summary = { id: 'c1', name: 'Copia', source: 'hubspot' as const, accountId: '1', capturedAt: at(0.5), counts: { contacts: 120, companies: 30, deals: 45, tasks: 60 }, records: 255, relations: 80, pipelines: 1, fields: 40 };
function source(over: Partial<InsightSource> = {}): InsightSource {
  return { captures: [{ id: 'c1', at: at(0.5), bytes: 200_000 }], reports: [], jobs: [], stale: false, ageMinutes: 30, session: null, connected: true, protected: true, pendingChanges: 0, latestCapture: summary,
    recoveryCopy: { exportedAt: at(2), confirmedAt: at(1.5), current: true, revision: 'r1' }, connection: { accountId: '1', mode: 'production_readonly', accountType: 'STANDARD', verifiedAt: null, selectedFields: {} }, ...over } as InsightSource;
}
const done: InsightContext = { hubspotConfigured: true, drill: 'passed' };

test('preparación: sin captura propone preparar; todo hecho y al día queda «listo» sin acción', () => {
  const empty = continuityReadiness(source({ captures: [], latestCapture: null, ageMinutes: null }), { hubspotConfigured: false, drill: 'empty' }, NOW);
  assert.equal(empty.level, 'start'); assert.equal(empty.next.id, 'prepare');
  const ready = continuityReadiness(source(), done, NOW);
  assert.equal(ready.level, 'ready'); assert.equal(ready.done, 5); assert.equal(ready.next.id, 'none');
});

test('preparación: el orden del siguiente paso sigue el riesgo (prueba fallida, copia vieja, servicios en pausa, sesión abierta)', () => {
  const failed = continuityReadiness(source({ stale: true, ageMinutes: 300 }), { ...done, drill: 'failed' }, NOW);
  assert.equal(failed.level, 'risk'); assert.equal(failed.next.id, 'drill'); assert.equal(failed.next.label, 'Repetir la prueba');
  assert.equal(continuityReadiness(source({ stale: true, ageMinutes: 300 }), done, NOW).next.id, 'refresh');
  assert.equal(continuityReadiness(source({ stale: true, ageMinutes: 300, connected: false }), done, NOW).next.id, 'resume');
  const session = continuityReadiness(source({ stale: true, ageMinutes: 300, session: { id: 's', captureId: 'c1', startedAt: at(1) } }), done, NOW);
  assert.equal(session.next.id, 'none', 'durante una sesión la copia envejece a propósito: no se propone capturar');
  assert.equal(continuityReadiness(source({ stale: true, ageMinutes: 26 * 60 }), done, NOW).level, 'risk');
});

test('A4 veredicto resumido: tono por nivel, pasos y siguiente acción; Inicio y el menú usan el simulacro de la última captura', () => {
  const ready = readinessSignal(continuityReadiness(source(), done, NOW));
  assert.deepEqual([ready.tone, ready.progress, ready.next], ['ok', '5 de 5 pasos', 'Nada pendiente']); assert.deepEqual(ready.steps, [true, true, true, true, true]);
  const untested = readinessSignal(continuityReadiness(source(), { ...done, drill: 'untested' }, NOW));
  assert.deepEqual([untested.tone, untested.title, untested.next], ['warn', 'Tu Plan B está casi listo', 'Siguiente: probar esta copia']);
  assert.equal(readinessSignal(continuityReadiness(source(), { ...done, drill: 'failed' }, NOW)).tone, 'danger');
  assert.equal(readinessSignal(continuityReadiness(source({ captures: [], latestCapture: null, ageMinutes: null }), done, NOW)).tone, 'neutral');

  const state = { snapshot: null, ready: false, hubspotConfigured: true, runtime: undefined } as any;
  const status = (readiness: any) => ({ ...source(), readiness }) as any;
  assert.equal(readinessFor(state, status({ captureId: 'c1', status: 'passed', reportId: 'r' }), NOW)!.level, 'ready');
  assert.equal(readinessFor(state, status({ captureId: 'otra', status: 'passed', reportId: 'r' }), NOW)!.level, 'almost', 'una prueba de otra captura no acredita la última');
  assert.equal(readinessFor({ ...state, hubspotConfigured: false }, status({ captureId: 'c1', status: 'passed' }), NOW)!.progress, '4 de 5 pasos');
  assert.equal(readinessFor(state, null, NOW), null, 'sin estado leído no hay veredicto');
  assert.equal(readinessFor({ ...state, runtime: { id: 'x' } }, status(null), NOW), null, 'en una copia restaurada no se muestra');
});

test('preparación: exportada pero sin confirmar pide confirmar; de otra revisión pide exportar', () => {
  assert.equal(continuityReadiness(source({ recoveryCopy: { exportedAt: at(2), current: true, revision: 'r1' } }), done, NOW).next.id, 'confirm');
  const old = continuityReadiness(source({ recoveryCopy: { exportedAt: at(2), confirmedAt: at(2), current: false } }), done, NOW);
  assert.equal(old.next.id, 'export'); assert.equal(old.steps.find(step => step.id === 'recovery')!.done, false);
});

test('«Si HubSpot cae ahora»: verde con todo acreditado, lacre sin captura y aviso por cambios sin devolver', () => {
  const ok = outageForecast(source(), done, NOW);
  assert.equal(ok.tone, 'ok'); assert.match(ok.lines.find(line => line.id === 'records')!.text, /^120 clientes, 30 empresas, 45 oportunidades y 60 tareas/);
  const none = outageForecast(source({ captures: [], latestCapture: null, ageMinutes: null }), { hubspotConfigured: false, drill: 'empty' }, NOW);
  assert.equal(none.tone, 'danger'); assert.equal(none.lines[0].text, 'No tendrías datos: todavía no hay ninguna captura.');
  const pending = outageForecast(source({ pendingChanges: 1 }), done, NOW);
  assert.equal(pending.tone, 'warn'); assert.ok(pending.lines.some(line => line.text === '1 cambio local sigue sin devolver a HubSpot.'));
});

test('constantes: antigüedad, cobertura semanal y última prueba con sus tonos', () => {
  const report = { id: 'r', captureId: 'c1', startedAt: at(3), completedAt: at(2.9), passed: true, isolated: true, checks: [{ label: 'a', passed: true, detail: '' }, { label: 'b', passed: true, detail: '' }], durationMs: 4200, dataSource: 'x', limitations: [] };
  const captures = [0.5, 25, 49, 200].map((hours, index) => ({ id: 'c' + index, at: at(hours), bytes: 1024 * 1024 }));
  const vitals = Object.fromEntries(copyVitals(source({ captures, reports: [report] }), { ...done, reportId: 'r' }, NOW).map(vital => [vital.id, vital]));
  assert.equal(vitals.age.value, '30 min'); assert.equal(vitals.age.tone, 'ok');
  assert.equal(vitals.week.value, '3/7'); assert.equal(vitals.drill.value, '2/2'); assert.equal(vitals.drill.tone, 'ok');
  assert.equal(vitals.kept.note, '4 MB en disco');
  assert.equal(Object.fromEntries(copyVitals(source({ ageMinutes: 30 * 60, stale: true }), done, NOW).map(vital => [vital.id, vital])).age.tone, 'danger');
});

test('regla de 24 horas: 24 casillas, la última es la hora en curso y cuenta las capturas de cada hora', () => {
  const ruler = hourlyCaptures([{ id: 'a', at: at(0.1), bytes: 1 }, { id: 'b', at: at(0.2), bytes: 1 }, { id: 'c', at: at(5), bytes: 1 }, { id: 'old', at: at(30), bytes: 1 }], NOW);
  assert.equal(ruler.slots.length, 24); assert.equal(ruler.slots[23].current, true); assert.equal(ruler.slots[23].count, 2);
  assert.equal(ruler.covered, 2);
});

test('libro de capturas: agrupa por día, calcula la variación y marca las que encogen más del 15 %', () => {
  const captures = [{ id: 'n', at: at(1), bytes: 700 }, { id: 'm', at: at(2), bytes: 1000 }, { id: 'y', at: at(24), bytes: 950 }, { id: 'bad', at: 'no-date', bytes: 5 }];
  const ledger = captureLedger(captures, NOW);
  assert.deepEqual(ledger.days.map(day => day.label), ['Hoy', 'Ayer']);
  assert.equal(ledger.total, 3); assert.equal(ledger.shrinks, 1);
  const [newest, middle] = ledger.days[0].entries;
  assert.equal(newest.delta, -300); assert.equal(newest.shrink, true); assert.equal(middle.delta, 50); assert.equal(middle.shrink, false);
  assert.equal(ledger.days[1].entries[0].delta, null, 'la más antigua no tiene con qué compararse');
  assert.deepEqual(captureLedger(captures, NOW, 'shrink').days.flatMap(day => day.entries.map(entry => entry.id)), ['n']);
  assert.equal(captureLedger(captures, NOW, 'today').shown, 2);
});

test('fiabilidad: los cancelados no cuentan, los interrumpidos sí y se guarda el último fallo', () => {
  const job = (id: string, kind: Job['kind'], status: Job['status'], hoursAgo: number, message = ''): Job => ({ id, kind, status, createdAt: at(hoursAgo), updatedAt: at(hoursAgo), message, progress: 100 });
  const stats = jobStats([job('1', 'capture', 'succeeded', 1), job('2', 'capture', 'failed', 3, 'Sin red'), job('3', 'capture', 'interrupted', 2, 'Reinicio'), job('4', 'capture', 'cancelled', 4), job('5', 'drill', 'succeeded', 5), job('6', 'drill', 'running', 0)]);
  const capture = stats.kinds.find(kind => kind.kind === 'capture')!;
  assert.equal(capture.succeeded, 1); assert.equal(capture.failed, 2); assert.equal(capture.lastFailure!.message, 'Reinicio');
  assert.equal(stats.rate, 50); assert.equal(stats.running, 1); assert.equal(stats.kinds.some(kind => kind.kind === 'return'), false);
  assert.equal(jobStats([]).rate, null);
});

test('formatos: edad y tamaño legibles sin inventar valores', () => {
  assert.equal(formatAge(null), 'sin dato'); assert.equal(formatAge(0.2), 'menos de 1 min'); assert.equal(formatAge(150), '3 h'); assert.equal(formatAge(3 * 1440), '3 d');
  assert.equal(formatBytes(0), '0 KB'); assert.equal(formatBytes(2048), '2 KB'); assert.equal(formatBytes(1.5 * 1024 * 1024), '1,5 MB');
});

const drill = (daysAgo: number, captureId = 'c1', passed = true) => ({ id: 'r' + daysAgo, captureId, startedAt: at(daysAgo * 24), completedAt: at(daysAgo * 24), passed, isolated: true, checks: [], durationMs: 1, dataSource: 'demo', limitations: [] });
test('calendario de simulacros: sin ninguno superado, al día, pronto y vencido', () => {
  const never = drillCalendar({ captures: [{ id: 'c1', at: at(1), bytes: 100 }], reports: [drill(3, 'c1', false)] }, NOW);
  assert.equal(never.state, 'never'); assert.equal(never.title, 'Ningún simulacro superado todavía'); assert.equal(never.daysLeft, null);
  const ok = drillCalendar({ captures: [{ id: 'c1', at: at(1), bytes: 100 }], reports: [drill(5), drill(40)] }, NOW);
  assert.equal(ok.state, 'ok'); assert.equal(ok.daysLeft, 25); assert.ok(Math.abs(ok.elapsed - 5 / 30) < 1e-9);
  const soon = drillCalendar({ captures: [{ id: 'c1', at: at(1), bytes: 100 }], reports: [drill(29)] }, NOW);
  assert.equal(soon.state, 'soon'); assert.equal(soon.title, 'Próximo simulacro en 1 día');
  const due = drillCalendar({ captures: [{ id: 'c1', at: at(1), bytes: 100 }], reports: [drill(33)] }, NOW);
  assert.equal(due.state, 'due'); assert.equal(due.tone, 'danger'); assert.equal(due.daysLeft, -3); assert.equal(due.elapsed, 1); assert.match(due.detail, /hace 3 días/);
});

test('calendario de simulacros: la copia cambió mucho desde la probada, salvo que la probada ya no exista', () => {
  const grown = drillCalendar({ captures: [{ id: 'c2', at: at(1), bytes: 130 }, { id: 'c1', at: at(200), bytes: 100 }], reports: [drill(10)] }, NOW);
  assert.equal(grown.state, 'changed'); assert.match(grown.detail, /crecido un 30 %/);
  const shrunk = drillCalendar({ captures: [{ id: 'c2', at: at(1), bytes: 80 }, { id: 'c1', at: at(200), bytes: 100 }], reports: [drill(10)] }, NOW);
  assert.match(shrunk.detail, /encogido un 20 %/);
  assert.equal(drillCalendar({ captures: [{ id: 'c2', at: at(1), bytes: 110 }, { id: 'c1', at: at(200), bytes: 100 }], reports: [drill(10)] }, NOW).state, 'ok');
  const pruned = drillCalendar({ captures: [{ id: 'c2', at: at(1), bytes: 900 }], reports: [drill(10)] }, NOW);
  assert.equal(pruned.state, 'ok'); assert.equal(pruned.growth, null);
  assert.equal(drillCalendar({ captures: [{ id: 'c2', at: at(1), bytes: 900 }, { id: 'c1', at: at(800), bytes: 100 }], reports: [drill(31)] }, NOW).state, 'due', 'vencido manda sobre cambiado');
});
