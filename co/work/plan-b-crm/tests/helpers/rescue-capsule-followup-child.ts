import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
// Proceso (o hilo) hijo de QA-136: ejecuta UNA acción del Kit de Relevo con la raíz propia como directorio de trabajo y, opcionalmente, una barrera en un paso del servicio.
//   mode 'crash': el proceso muere (código 86) al llegar al paso.   mode 'block': escribe <flag>.reached y espera SÍNCRONAMENTE a que exista <flag>.go (un proceso «congelado» en ese paso).
//   mode 'gate':  igual que 'block' pero ANTES de empezar (para soltar varios procesos a la vez).
// La salida útil va en una línea «RESULT {json}». No imprime contraseñas. Como hilo (worker_threads) recorre rondas sincronizadas con Atomics para abrir ventanas de carrera de microsegundos.
interface Job { kitDir: string; name: string; password: string; sha: string; rev: string; action: 'import' | 'sweep'; mode?: 'none' | 'crash' | 'block' | 'gate'; step?: string; flag?: string }
const NOW = () => Date.parse('2026-11-02T07:00:00.000Z');
const wait = new Int32Array(new SharedArrayBuffer(4));
// Si el padre falla antes de soltar la barrera, el hijo no queda colgado: tras 90 s termina con código 87.
const hold = (flag: string) => { writeFileSync(flag + '.reached', String(process.pid)); const deadline = Date.now() + 90_000; while (!existsSync(flag + '.go')) { if (Date.now() > deadline) process.exit(87); Atomics.wait(wait, 0, 0, 20); } };
// Un hilo comparte el PID del proceso padre, pero cada hilo tiene su PROPIA instancia del módulo. Para emular PROCESOS distintos ante la lógica del reclamo (que compara PIDs) un hilo puede recibir un PID ajeno VIVO (fakePid).
if (!isMainThread && (workerData as { fakePid?: number }).fakePid) Object.defineProperty(process, 'pid', { value: (workerData as { fakePid: number }).fakePid, configurable: true });
const { openKit, importCapsule, sweepStaging } = await import('../../server/rescue-capsule.js');
if (!isMainThread) {
  const { sab, kitDir, password } = workerData as { sab: SharedArrayBuffer; kitDir: string; password: string }, go = new Int32Array(sab), kit = openKit(kitDir); kit.clock = NOW;
  parentPort!.on('message', async (m: { type?: string; step?: string; flag?: string; round: number; name: string; sha: string; rev: string; jitterNs: number }) => {
    if (m.type === 'hold-import') { kit.onStep = (step: string) => { if (step === m.step) hold(m.flag!); }; try { const r = await importCapsule(kit, { name: m.name, password, expectedSha256: m.sha, expectedRevision: m.rev }); parentPort!.postMessage({ type: 'held-done', ok: true, id: r.destination.roomId }); } catch (error) { const e = error as { code?: string }; parentPort!.postMessage({ type: 'held-done', ok: false, code: e.code ?? null }); } return; }
    parentPort!.postMessage({ type: 'ready', round: m.round }); Atomics.wait(go, 0, m.round - 1);
    const until = process.hrtime.bigint() + BigInt(m.jitterNs); while (process.hrtime.bigint() < until) { /* desfase fino respecto al otro hilo */ }
    try { const r = await importCapsule(kit, { name: m.name, password, expectedSha256: m.sha, expectedRevision: m.rev }); parentPort!.postMessage({ type: 'done', round: m.round, ok: true, id: r.destination.roomId }); }
    catch (error) { const e = error as { code?: string; message?: string }; parentPort!.postMessage({ type: 'done', round: m.round, ok: false, code: e.code ?? null, message: String(e.message).slice(0, 120) }); }
  });
} else {
  const job = JSON.parse(process.argv[2]) as Job, kit = openKit(job.kitDir); kit.clock = NOW;
  if (job.mode === 'crash' || job.mode === 'block') kit.onStep = (step: string) => { if (step !== job.step) return; if (job.mode === 'crash') process.exit(86); hold(job.flag!); };
  if (job.mode === 'gate') hold(job.flag!);
  try {
    if (job.action === 'sweep') console.log('RESULT ' + JSON.stringify({ ok: true, swept: sweepStaging(resolve('tests', '.tmp')) }));
    else { const r = await importCapsule(kit, { name: job.name, password: job.password, expectedSha256: job.sha, expectedRevision: job.rev }); console.log('RESULT ' + JSON.stringify({ ok: true, destination: r.destination.roomId, folder: join('tests', '.tmp', r.destination.folder) })); }
  } catch (error) { const e = error as { code?: string; message?: string }; console.log('RESULT ' + JSON.stringify({ ok: false, code: e.code ?? null, message: String(e.message).slice(0, 200) })); }
}
