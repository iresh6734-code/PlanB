import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openKit, openDestination, type Kit, type Opened } from '../../server/rescue-capsule.js';
import type { RescueRoom } from '../../server/rescue-room.js';
import { envelope, viewOf, workLocally, newRoom, TMP, days } from './rescue-room-harness.js';
// Arnés del Kit de Relevo (116). Reutiliza el arnés de Rescate 106: salas reales (Store SQLite + Recovery + CRM simulado) y procesos reales para el destino.
// Todo en carpetas nuevas bajo tests/.tmp/rescue116-* y rescue106-*; limpieza NO recursiva (ficheros conocidos + carpeta vacía) al terminar el proceso.
export * from './rescue-room-harness.js';
export const PASSWORD = 'contraseña-de-ensayo-116', OTHER_PASSWORD = 'otra-contraseña-de-ensayo';
const kits = new Set<string>(), made = new Set<string>(), KNOWN = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'planb.sqlite-journal', 'rescue-room.marker.json'];
function dropFiles(dir: string, names: string[]) { if (!existsSync(dir)) return; for (const n of names) { try { unlinkSync(join(dir, n)); } catch { /* ausente */ } } try { if (!readdirSync(dir).length) rmdirSync(dir); } catch { /* conservada */ } }
export function trackFolder(root: string) { made.add(root); return root; }
export function trackKit(dir: string) { kits.add(dir); return dir; }
process.on('exit', () => {
  for (const dir of made) dropFiles(dir, KNOWN);
  for (const dir of kits) { const caps = join(dir, 'capsules'); if (existsSync(caps)) { for (const n of readdirSync(caps)) { try { unlinkSync(join(caps, n)); } catch { /* en uso */ } } try { rmdirSync(caps); } catch { /* conservada */ } } try { rmdirSync(dir); } catch { /* conservada */ } }
});
export function newKit(): Kit { mkdirSync(TMP, { recursive: true }); const kit = openKit(join(TMP, 'rescue116-' + randomUUID())); kits.add(kit.dir); return kit; }
export function capsuleFiles(kit: Kit) { return readdirSync(kit.capsules); }
/** Origen en el estado de interés: trabajo local, CRM vuelve con conflicto, decisión, acuse perdido, aprobar y aplicar ⇒ create INCIERTO. */
export async function originUncertain(room: RescueRoom) {
  await workLocally(room); await room.crmReturn(envelope(room)); const planId = ((await room.prepareReturn(envelope(room))).result as { planId: string }).planId;
  const op = viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] });
  await room.armLostAck({ ...envelope(room), armed: true }); await room.approve({ ...envelope(room), planId }); await room.apply({ ...envelope(room), planId });
  return planId;
}
export async function originAt(stage: 'preparation' | 'local-work' | 'return-review' | 'approved' | 'return-partial' | 'return-verified' | 'closed') {
  const room = newRoom();
  if (stage === 'preparation') return room;
  if (stage === 'local-work') { await workLocally(room); return room; }
  if (stage === 'return-partial') { await originUncertain(room); return room; }
  await workLocally(room); await room.crmReturn(envelope(room)); const planId = ((await room.prepareReturn(envelope(room))).result as { planId: string }).planId;
  if (stage === 'return-review') return room;
  const op = viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] }); await room.approve({ ...envelope(room), planId });
  if (stage === 'approved') return room;
  await room.apply({ ...envelope(room), planId }); if (stage === 'return-verified') return room;
  await room.closeIncident({ ...envelope(room), note: 'cierre' }); return room;
}
export const freePort = async () => { const { createServer } = await import('node:net'); return new Promise<number>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); }); };
const openedProcs = new Set<Opened>();
process.on('exit', () => { for (const p of openedProcs) { try { process.kill(p.pid); } catch { /* ya terminó */ } } });
export async function openDest(folder: string): Promise<Opened & { get: (path: string) => Promise<any>; post: (route: string, body: Record<string, unknown>) => Promise<{ status: number; body: any }> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const port = await freePort(), opened = await openDestination(folder, { port, now: '2026-11-02T07:00:00.000Z' }); openedProcs.add(opened); trackFolder(join(TMP, folder));
  const get = async (path: string) => (await fetch(opened.url.replace(/\/$/, '') + path)).json();
  const post = async (route: string, body: Record<string, unknown>) => { const state = await get('/api/rescue/state'); const r = await fetch(opened.url.replace(/\/$/, '') + '/api/rescue/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'k-' + randomUUID(), expectedVersion: state.version, context: state.context, ...body }) }); return { status: r.status, body: await r.json() }; };
  return Object.assign(opened, { get, post });
}
export { days, resolve };
