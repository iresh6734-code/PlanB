import test from 'node:test';
import assert from 'node:assert/strict';
import { drillPlan } from '../shared/drill-schedule.js';
import { Store } from '../server/store.js';
import { Continuity } from '../server/continuity.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

const NOW = Date.parse('2026-11-22T12:00:00.000Z'), H = 3_600_000, D = 24 * H;
const iso = (t: number) => new Date(t).toISOString();

test('A3 · toca cada 30 días desde el último informe y, sin informe, enseguida; sin captura, nunca', () => {
  assert.deepEqual(drillPlan(NOW, { hasCapture: false, lastReportAt: null, lastAttemptAt: null }), { due: false, nextAt: null });
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: null, lastAttemptAt: null }).due, true);
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 29 * D), lastAttemptAt: null }).due, false);
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 29 * D), lastAttemptAt: null }).nextAt, iso(NOW + D));
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 31 * D), lastAttemptAt: null }).due, true);
});

test('A3 · un intento sin informe frena 6 horas; uno que ya dejó informe no frena', () => {
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 40 * D), lastAttemptAt: iso(NOW - 2 * H) }).due, false, 'falló hace 2 h');
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 40 * D), lastAttemptAt: iso(NOW - 2 * H) }).nextAt, iso(NOW + 4 * H));
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 40 * D), lastAttemptAt: iso(NOW - 7 * H) }).due, true, 'pasadas 6 h se reintenta');
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: iso(NOW - 31 * D), lastAttemptAt: iso(NOW - 31 * D - H) }).due, true, 'el intento anterior al informe no cuenta');
  assert.equal(drillPlan(NOW, { hasCapture: true, lastReportAt: 'no es fecha', lastAttemptAt: null }).due, true, 'una fecha ilegible no bloquea');
});

test('A3 · tick() guarda el intento y no lanza otro simulacro en la vuelta siguiente aunque no haya informe', async () => {
  const store = new Store(':memory:');
  const snapshot = makeFixture();
  store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
  store.addCapture(snapshot);
  const continuity = new Continuity(store, process.cwd(), false, async () => snapshot);
  continuity.connection = () => ({ token: 'fake-test-token', accountId: snapshot.source.accountId, mode: 'test' }) as any;
  store.set('disconnected', false); continuity.configureSchedule(true);
  store.set('schedule', { ...store.get<Record<string, unknown>>('schedule', {}), lastAttempt: new Date().toISOString() }); // captura ya hecha: toca el simulacro
  let started = 0;
  continuity.drill = (() => { started++; throw new Error('el proceso aislado no arranca'); }) as typeof continuity.drill;
  continuity.tick();
  assert.equal(started, 1);
  assert.ok(store.get('drillLastAttempt', null), 'el intento queda guardado en la copia');
  assert.match(String(store.get<{ message?: string }>('operationError', {}).message), /simulacro programado/);
  continuity.tick(); continuity.tick();
  assert.equal(started, 1, 'sin informe no se reintenta en cada vuelta: espera 6 horas');
  assert.equal(continuity.status().drillSchedule?.enabled, true);
  assert.ok(Date.parse(continuity.status().drillSchedule!.nextAt!) > Date.now() + 5 * H);
  await continuity.jobs.stop(); store.close();
});
