import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { RescueRoom } from '../../server/rescue-room.js';
import { RescueError } from '../../shared/rescue-room.js';
// Arnés de pruebas de Modo Rescate: salas reales (Store SQLite + Recovery + CRM simulado) en carpetas nuevas bajo tests/.tmp/rescue106-*.
// Reloj fijo para que el fixture y la cola sean reproducibles. No hay mocks de persistencia: cada sala escribe y reabre su carpeta.
export const NOW = Date.parse('2026-11-02T07:00:00.000Z');
export const clock = () => NOW;
export const TMP = resolve('tests', '.tmp');
// Cada sala que crea una prueba se registra y, al terminar el proceso de pruebas, se cierra y se elimina SIN borrado recursivo: solo los ficheros
// conocidos de una sala (marcador, SQLite, clave, simulador, bloqueo) y la carpeta si queda vacía. Una carpeta con algo más se conserva.
const rooms = new Set<RescueRoom>(), roots = new Set<string>(), KNOWN = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'planb.sqlite-journal', 'rescue-room.marker.json'];
export function disposeRoomFiles(root: string) {
  if (!existsSync(root)) return;
  for (const name of KNOWN) { try { unlinkSync(resolve(root, name)); } catch { /* ausente o en uso: se conserva */ } }
  try { if (!readdirSync(root).length) rmdirSync(root); } catch { /* no vacía: se conserva */ }
}
export const track = (room: RescueRoom) => { rooms.add(room); roots.add(room.root); return room; };
process.on('exit', () => { for (const room of rooms) { try { room.close(); } catch { /* ya cerrada */ } } for (const root of roots) disposeRoomFiles(root); });
export const newRoom = (now: () => number = clock) => { mkdirSync(TMP, { recursive: true }); return track(RescueRoom.create(TMP, { clock: now })); };
export const reopen = (room: RescueRoom, now: () => number = clock) => { const root = room.root; room.close(); return track(RescueRoom.open(root, { clock: now })); };
export type View = Exclude<ReturnType<RescueRoom['view']>, { blocked: true }>;
export const viewOf = (room: RescueRoom): View => { const v = room.view(); if (v.blocked) throw new Error('Sala bloqueada: ' + JSON.stringify(v.integrity)); return v as View; };
export const envelope = (room: RescueRoom, key = 'k-' + randomUUID()) => { const v = viewOf(room); return { idempotencyKey: key, expectedVersion: v.version, context: v.context }; };
export async function rejects(promise: Promise<unknown>, code: string) {
  try { await promise; } catch (error) { if (error instanceof RescueError && error.code === code) return error; throw error; }
  throw new Error('Se esperaba el rechazo ' + code);
}
export const days = (n: number) => { const d = new Date(Date.parse('2026-11-02T00:00:00Z') + n * 86_400_000); return d.toISOString().slice(0, 10); };
/** Recorrido guionado hasta el trabajo local: plan de 60 min, estimaciones del guion y tres cambios locales. */
export async function workLocally(room: RescueRoom) {
  await room.choosePlan({ ...envelope(room), budgetMinutes: 60 });
  await room.loadScriptEstimates(envelope(room));
  await room.editTask({ ...envelope(room), taskId: 'task-4', values: { status: 'completed' } });
  await room.editTask({ ...envelope(room), taskId: 'task-5', values: { due_date: days(4) } });
  const created = await room.createTask({ ...envelope(room), values: { subject: 'Confirmar entrega con el cliente', due_date: days(2), status: 'pending' } });
  return created.result as { recordId: string };
}
