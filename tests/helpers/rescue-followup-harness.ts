import { createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import type { RescueRoom } from '../../server/rescue-room.js';
import { disposeRoomFiles } from './rescue-room-harness.js';
// Arnés de CLAUDE-RESCUE-QA-115 (ampliación de QA de Rescate106 por su misma autora; no es revisión independiente).
// Reutiliza el arnés de 106 para crear/limpiar salas y añade procesos reales, lectura cruda de la base y un digest canónico de una sala.
export * from './rescue-room-harness.js';
export const REPO = resolve('.');
export const freePort = () => new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
export interface Demo { port: number; root: string; proc: ChildProcess; output: () => string; stop: (keepFiles?: boolean) => Promise<void>; exited: Promise<number | null> }
/** Lanza el servidor de la demo como PROCESO real (cwd = esta proyección/repo). Falla si no llega a escuchar; no mata ajenos. */
export async function startDemo(options: { resume?: string; port?: number; now?: string } = {}): Promise<Demo> {
  const port = options.port ?? await freePort();
  const proc = spawn(process.execPath, ['--require', join(REPO, 'scripts', 'block-external.cjs'), '--import', 'tsx', 'scripts/demo-rescue-room.ts', '--port', String(port), '--now', options.now ?? '2026-11-02T07:00:00.000Z', ...(options.resume ? ['--resume', options.resume] : [])], { cwd: REPO, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout!.on('data', d => { out += d; }); proc.stderr!.on('data', d => { out += d; });
  const exited = new Promise<number | null>(r => proc.once('exit', code => r(code)));
  const deadline = Date.now() + 40_000;
  for (;;) {
    const m = /Carpeta del ensayo: (.+)/.exec(out);
    if (m) { try { if ((await fetch('http://127.0.0.1:' + port + '/api/rescue/health')).ok) return { port, root: m[1].trim(), proc, output: () => out, exited, stop: async (keepFiles = false) => { proc.kill(); await exited; if (!keepFiles) disposeRoomFiles(m[1].trim()); } }; } catch { /* aún no escucha */ } }
    if (proc.exitCode !== null) throw Object.assign(new Error('La demo terminó antes de escuchar: ' + out.slice(-500)), { output: out, exitCode: proc.exitCode });
    if (Date.now() > deadline) { proc.kill(); throw new Error('La demo no arrancó: ' + out.slice(-500)); }
    await new Promise(r => setTimeout(r, 200));
  }
}
/** Filas crudas de la tabla meta (valores cifrados tal cual están en disco) leídas con una conexión de solo lectura. */
export function rawMeta(root: string): Record<string, string> {
  const db = new DatabaseSync(join(root, 'planb.sqlite'), { readOnly: true });
  try { return Object.fromEntries((db.prepare('SELECT key,value FROM meta ORDER BY key').all() as { key: string; value: string }[]).map(r => [r.key, r.value])); } finally { db.close(); }
}
const stable = (v: unknown): string => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v ?? null);
/** Digest canónico del contenido lógico de una sala (registros, cambios, estado, diario, idempotencia y CRM simulado). Un hash acredita igualdad de ESTE contenido, no autenticidad. */
export function digestRoom(room: RescueRoom): string {
  const l = room.ledger.inspect(), idem = Object.fromEntries((room.store.db.prepare("SELECT key FROM meta WHERE key LIKE 'rescue:idem:%' ORDER BY key").all() as { key: string }[]).map(r => [r.key, room.store.get(r.key, null)]));
  const sim = JSON.parse(readFileSync(join(room.root, 'crm-sim.json'), 'utf8'));
  return createHash('sha256').update(stable({ records: room.store.records(), changes: room.store.changes(), state: l.state, journal: l.journal.map(e => ({ seq: e.seq, id: e.id, kind: e.kind, stateVersion: e.stateVersion })), idem, plan: room.store.recoveryState().plan, sim })).digest('hex');
}
/** Abre la sala en un PROCESO nuevo de Node y devuelve su digest. Prueba reapertura real, no la misma instancia. */
export function digestInNewProcess(root: string): { digest: string; status: number | null; stderr: string } {
  const code = "import { RescueRoom } from './server/rescue-room.js'; import { digestRoom } from './tests/helpers/rescue-followup-harness.js'; const r = RescueRoom.open(process.argv[1], { clock: () => Date.parse('2026-11-02T07:00:00.000Z') }); process.stdout.write('DIGEST:' + digestRoom(r)); r.close();";
  const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, root], { cwd: REPO, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  return { digest: /DIGEST:([0-9a-f]{64})/.exec(run.stdout)?.[1] ?? '', status: run.status, stderr: run.stderr.replace(/\(node:\d+\) ExperimentalWarning[^\n]*\n?/g, '').slice(0, 400) };
}
export const exists = existsSync;
