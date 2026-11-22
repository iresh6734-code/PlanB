// Verifica · fase 5: las cinco pruebas del plan. Cada caso rompe una a propósito para ver que deja de pasar.
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultScenarios, gateCleanRoom, gateEngine, gateMigration, gateOrder, gateWatch, runReadiness } from '../shared/verifica/readiness.js';
import { runCli } from '../scripts/verifica-pruebas.js';

const capture = () => { let out = '', err = ''; return { deps: { out: (t: string) => { out += t; }, err: (t: string) => { err += t; } }, get out() { return out; }, get err() { return err; } }; };

test('con la empresa ficticia pasan las pruebas del motor; la de la fase 0 queda pendiente hasta que se decida el menú', async () => {
  const pending = await runReadiness();
  assert.deepEqual(pending.gates.map(g => [g.phase, g.status]), [[0, 'pending'], [1, 'passed'], [2, 'passed'], [3, 'passed'], [4, 'passed']]);
  assert.equal(pending.ready, false, 'una prueba pendiente impide enseñarlo fuera');
  assert.ok(pending.notCovered.some(line => line.includes('ficticias')), 'siempre dice que no hay datos reales detrás');

  const decided = await runReadiness({ singleProduct: true });
  assert.ok(decided.gates.every(g => g.status === 'passed'));
  assert.equal(decided.ready, true);
});

test('cada prueba deja de pasar si se rompe lo que mide', async () => {
  const s = defaultScenarios();
  const brokenReference = { ...s.trap, expected: s.clean.expected };
  assert.equal(gateOrder(brokenReference, s.clean, true).status, 'failed', 'fase 0: una referencia que no espera las seis alarmas');

  const trapWithoutTraps = { ...s.trap, previous: s.clean.previous, latest: s.clean.latest, invoices: s.clean.invoices };
  const engine = gateEngine(trapWithoutTraps, s.clean);
  assert.equal(engine.status, 'failed', 'fase 1: datos sin trampas donde se esperan las seis');
  assert.ok(engine.details.some(d => d.startsWith('Con trampas: no salta')));
  assert.equal(gateEngine(s.trap, { ...s.clean, expected: s.trap.expected }).status, 'failed', 'fase 1: la referencia sin trampas tampoco admite alarmas de más ni de menos');

  assert.equal((await gateCleanRoom({ ...s.trap, expected: s.clean.expected })).status, 'failed', 'fase 2: el informe publicado no coincide con la referencia');

  const watch = gateWatch({ ...s.watchedClean, expected: s.watchedTrap.expected }, s.watchedClean);
  assert.equal(watch.status, 'failed', 'fase 3: sin contactos borrados no hay aviso');
  assert.ok(watch.details.includes('Con trampas: borrar contactos no da aviso.'));

  const migration = gateMigration(s.migratedTrap, { ...s.migratedClean, target: s.migratedTrap.target });
  assert.equal(migration.status, 'failed', 'fase 4: una migración con fallos no puede salir «sin diferencias»');
});

test('script de las cinco pruebas: 1 mientras falte algo, 0 cuando pasan todas, 2 con un argumento que no conoce', async () => {
  const pending = capture();
  assert.equal(await runCli([], pending.deps), 1);
  assert.match(pending.out, /PENDIENTE · Fase 0 · Ordenar/);
  assert.match(pending.out, /PASA {5} · Fase 4 · Después del cierre/);
  assert.match(pending.out, /No se enseña fuera todavía/);
  assert.match(pending.out, /ficticias/);

  const ready = capture();
  assert.equal(await runCli(['--single-product', '--json'], ready.deps), 0);
  const parsed = JSON.parse(ready.out) as { ready: boolean; gates: unknown[] };
  assert.equal(parsed.ready, true);
  assert.equal(parsed.gates.length, 5);

  const failing = capture();
  const broken = async () => ({ ...(await runReadiness({ singleProduct: true })), ready: false });
  assert.equal(await runCli(['--single-product'], { ...failing.deps, run: broken }), 1);

  const wrong = capture();
  assert.equal(await runCli(['--publicar'], wrong.deps), 2);
  assert.match(wrong.err, /Uso:/);
  assert.equal(wrong.out, '');
});
