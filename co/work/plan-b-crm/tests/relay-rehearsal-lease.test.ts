import test from 'node:test';
import assert from 'node:assert/strict';
import { RunLease, type LeaseOutcome } from '../server/relay-rehearsal-lease.js';

// Unidad 224. La ranura solo libera la capacidad cuando el ejecutor TERMINA de verdad. Los ejecutores son sintéticos y retenidos con barreras; se cuentan los ejecutores VIVOS (arrancados y sin asentar).
// Reproduce a nivel de primitiva la sonda de Codex (POST → DELETE → POST con ejecutor retenido: antes había dos vivos antes de liberar el primero).
function fleet() {
  let alive = 0, started = 0;
  const executors: { release(value?: string): void; fail(): void; signal: AbortSignal | null; settled: boolean }[] = [];
  const make = (honorAbort = false) => (context: { signal: AbortSignal }) => new Promise<string>((resolve, reject) => {
    alive++; started++;
    const entry = { settled: false, signal: context.signal as AbortSignal | null, release: (value = 'resultado') => { if (entry.settled) return; entry.settled = true; alive--; resolve(value); }, fail: () => { if (entry.settled) return; entry.settled = true; alive--; reject(new Error('fallo con ruta C:\\secreto')); } };
    executors.push(entry);
    if (honorAbort) context.signal.addEventListener('abort', () => entry.release('abortado'), { once: true });
  });
  return { make, alive: () => alive, started: () => started, executors };
}
const kind = (outcome: LeaseOutcome<unknown>) => outcome.kind + (outcome.kind === 'discarded' ? ':' + outcome.reason : '');

test('POST → DELETE → POST con ejecutor retenido: cancelar NO libera la capacidad; el segundo POST ve «drenando» y no arranca otro; al terminar el primero se admite exactamente uno', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 60_000 });
  const first = lease.start(f.make()); assert.equal(first.kind, 'started'); if (first.kind !== 'started') return;
  assert.equal(lease.snapshot().phase, 'running'); assert.equal(f.alive(), 1);
  assert.equal(lease.cancel('cancelled'), true); assert.equal(lease.cancel('cancelled'), false, 'cancelar dos veces no hace nada más');
  assert.equal(kind(await first.run.outcome), 'discarded:cancelled', 'la publicación se descarta al cancelar');
  assert.equal(first.run.signal.aborted, true);
  const snap = lease.snapshot(); assert.deepEqual([snap.phase, snap.drainingFor], ['draining', 'cancelled']);
  const second = lease.start(f.make()); assert.equal(second.kind, 'busy'); if (second.kind === 'busy') assert.equal(second.snapshot.phase, 'draining');
  assert.equal(f.alive(), 1, 'sigue habiendo UN solo ejecutor vivo'); assert.equal(f.started(), 1, 'el segundo POST no arrancó ninguno');
  f.executors[0]!.release('tarde'); await first.run.released;
  assert.equal(lease.snapshot().phase, 'idle'); assert.equal(f.alive(), 0);
  const third = lease.start(f.make()); assert.equal(third.kind, 'started'); assert.equal(f.alive(), 1); assert.equal(f.started(), 2);
  assert.equal(lease.start(f.make()).kind, 'busy', 'y de nuevo solo uno');
  f.executors[1]!.release(); if (third.kind === 'started') await third.run.released;
});

test('TIMEOUT → POST: agotar el tiempo da resultado «timeout» pero NO libera mientras el trabajo siga vivo; el resultado tardío nunca se publica', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 100 });
  const first = lease.start(f.make()); if (first.kind !== 'started') throw new Error('no arrancó');
  assert.equal(kind(await first.run.outcome), 'timeout'); assert.equal(first.run.signal.aborted, true, 'se pide detener');
  assert.deepEqual([lease.snapshot().phase, lease.snapshot().drainingFor], ['draining', 'timeout']);
  assert.equal(lease.start(f.make()).kind, 'busy'); assert.equal(f.alive(), 1); assert.equal(f.started(), 1);
  f.executors[0]!.release('resultado-tardio'); await first.run.released;
  assert.equal(lease.commit(first.run, await first.run.outcome), true, 'el vencimiento se registra una vez (como interrumpido)');
  assert.equal(lease.commit(first.run, { kind: 'finished', value: 'resultado-tardio' }), false, 'un resultado tardío tras el tiempo agotado no se publica: esa generación ya publicó');
  assert.equal(lease.start(f.make()).kind, 'started');
});

test('REVOCACIÓN → nueva sesión: revocar descarta la publicación y la ranura sigue ocupada hasta que el ejecutor termine; una sesión nueva ve «drenando»', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 60_000 });
  const run = lease.start(f.make(true)); if (run.kind !== 'started') throw new Error('no arrancó');
  assert.equal(lease.cancel('unauthorized'), true); assert.equal(kind(await run.run.outcome), 'discarded:unauthorized');
  await run.run.released; assert.equal(f.alive(), 0, 'este ejecutor sí obedece la señal y termina');
  const again = lease.start(f.make()); assert.equal(again.kind, 'started');
  if (again.kind === 'started') { lease.cancel('unauthorized'); assert.equal(lease.start(f.make()).kind, 'busy'); f.executors[1]!.release(); await again.run.released; }
});

test('un ejecutor que IGNORA la señal conserva su ranura indefinidamente (drenando) hasta que termina; nunca se libera por inactividad', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 100 });
  const run = lease.start(f.make()); if (run.kind !== 'started') throw new Error('no arrancó');
  await run.run.outcome; await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(lease.snapshot().phase, 'draining'); assert.equal(lease.start(f.make()).kind, 'busy'); assert.equal(f.alive(), 1);
  f.executors[0]!.fail(); await run.run.released; assert.equal(lease.snapshot().phase, 'idle');
});

test('un resultado antiguo no sobrescribe uno posterior; solo el más reciente se publica y una vez', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 60_000 });
  const a = lease.start(f.make(true)); if (a.kind !== 'started') throw new Error('no arrancó');
  lease.cancel('cancelled'); await a.run.released;
  const b = lease.start(f.make()); if (b.kind !== 'started') throw new Error('no arrancó');
  f.executors[1]!.release('nuevo'); const outcomeB = await b.run.outcome; await b.run.released;
  assert.equal(lease.commit(b.run, outcomeB), true, 'la ejecución nueva se publica');
  assert.equal(lease.commit(b.run, outcomeB), false, 'no se publica dos veces');
  assert.equal(lease.commit(a.run, { kind: 'finished', value: 'antiguo' }), false, 'una generación anterior no sobrescribe a la posterior');
  assert.equal(lease.commit(b.run, { kind: 'discarded', reason: 'cancelled' }), false, 'lo descartado nunca se publica');
  const c = lease.start(f.make()); if (c.kind !== 'started') throw new Error('no arrancó'); f.executors[2]!.fail(); const failedOutcome = await c.run.outcome; await c.run.released;
  assert.equal(lease.commit(c.run, failedOutcome), true, 'un fallo propio de la ejecución más reciente sí se registra (como ensayo fallido)');
});

test('FALLOS: un ejecutor que lanza o rechaza da «failed» sin detalles, libera la ranura y no deja temporizadores; terminar a tiempo no genera un timeout posterior', async () => {
  const lease = new RunLease<string>({ timeoutMs: 100 });
  const sync = lease.start(() => { throw new Error('boom C:\\ruta'); }); if (sync.kind !== 'started') throw new Error('no arrancó');
  const outcome = await sync.run.outcome; assert.deepEqual(outcome, { kind: 'failed' }); await sync.run.released; assert.equal(lease.snapshot().phase, 'idle');
  const f = fleet(), rejected = lease.start(f.make()); if (rejected.kind !== 'started') throw new Error('no arrancó');
  f.executors[0]!.fail(); assert.deepEqual(await rejected.run.outcome, { kind: 'failed' }); await rejected.run.released;
  const ok = lease.start(f.make()); if (ok.kind !== 'started') throw new Error('no arrancó');
  f.executors[1]!.release('bien'); assert.deepEqual(await ok.run.outcome, { kind: 'finished', value: 'bien' }); await ok.run.released;
  await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(lease.snapshot().phase, 'idle', 'el temporizador se limpió: no hay timeout espurio');
  assert.equal(lease.cancel(), false, 'sin ejecución en curso no hay nada que cancelar');
});

test('CIERRE del servidor: pide detener y espera a que el trabajo termine; si el ejecutor no obedece devuelve drained=false al agotar la espera (no finge haber terminado)', async () => {
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 60_000 });
  assert.deepEqual(await lease.close(50), { drained: true }, 'sin nada en curso');
  const obedient = lease.start(f.make(true)); if (obedient.kind !== 'started') throw new Error('no arrancó');
  assert.deepEqual(await lease.close(2_000), { drained: true }); assert.equal(f.alive(), 0); assert.equal(kind(await obedient.run.outcome), 'discarded:closing');
  const stubborn = lease.start(f.make()); if (stubborn.kind !== 'started') throw new Error('no arrancó');
  assert.deepEqual(await lease.close(80), { drained: false }); assert.equal(f.alive(), 1, 'sigue vivo y la ranura lo refleja'); assert.equal(lease.snapshot().phase, 'draining');
  f.executors[1]!.release(); await stubborn.run.released;
});

test('TEMPORIZADORES: terminar, cancelar o cerrar limpia el del tiempo máximo (cero pendientes); solo el tiempo agotado lo consume', async () => {
  let pending = 0; const timers = { set: (callback: () => void, ms: number) => { pending++; const timer = setTimeout(() => { pending--; callback(); }, ms); return timer; }, clear: (timer: ReturnType<typeof setTimeout>) => { if (timer) { pending--; clearTimeout(timer); } } };
  const f = fleet(), lease = new RunLease<string>({ timeoutMs: 60_000, timers });
  const a = lease.start(f.make()); if (a.kind !== 'started') throw new Error('no arrancó'); assert.equal(pending, 1);
  f.executors[0]!.release(); await a.run.released; assert.equal(pending, 0, 'terminar limpia el temporizador');
  const b = lease.start(f.make(true)); if (b.kind !== 'started') throw new Error('no arrancó'); lease.cancel('cancelled'); assert.equal(pending, 0, 'cancelar lo limpia'); await b.run.released;
  const c = lease.start(f.make(true)); if (c.kind !== 'started') throw new Error('no arrancó'); await lease.close(1_000); assert.equal(pending, 0, 'cerrar lo limpia'); await c.run.released;
});
