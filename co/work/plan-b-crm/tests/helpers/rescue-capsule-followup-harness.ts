import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Arnés de QA-136 sobre el Kit de Relevo (116). Aislamiento: ESTE proceso trabaja en una raíz temporal PROPIA (<base>/rescue136-<uuid>/tests/.tmp) y hace chdir a ella ANTES de cargar el código
// de 116, que resuelve sus carpetas con resolve('tests', '.tmp'). Ninguna prueba lista ni cuenta carpetas ajenas: cada destino, staging y reclamo se identifica por el RECLAMO de su propia
// cápsula (que registra el identificador de destino antes de publicar) y por los pasos que emite el servicio. Limpieza solo dentro de la raíz propia y solo de lo reconocible.
const BASE = resolve(process.env.PLANB_QA136_BASE ?? join('tests', '.tmp'));
export const ROOT = join(BASE, 'rescue136-' + randomUUID());
mkdirSync(join(ROOT, 'tests', '.tmp'), { recursive: true });
process.chdir(ROOT);
const H = await import('../../tests/helpers/rescue-capsule-harness.js');
const S = await import('../../server/rescue-capsule.js');
const R = await import('../../server/rescue-room.js');
export const { PASSWORD, OTHER_PASSWORD, TMP, clock, envelope, newKit, newRoom, originAt, originUncertain, trackFolder, trackKit, viewOf, track, rejects } = H as typeof H & { OTHER_PASSWORD: string };
export const { exportCapsule, importCapsule, inspectCapsule, loadCapsule, sweepStaging, openKit, describeClaim } = S;
export const { RescueRoom, assertOwnRoot } = R;
export type Kit = import('../../server/rescue-capsule.js').Kit;
export const REAL_REPO = resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const CHILD = fileURLToPath(new URL('./rescue-capsule-followup-child.ts', import.meta.url));
export const TSX = import.meta.resolve('tsx');
export const KNOWN = ['.instance', '.planb-key', 'crm-sim.json', 'crm-sim.json.tmp', 'planb.sqlite', 'planb.sqlite-wal', 'planb.sqlite-shm', 'planb.sqlite-journal', 'rescue-room.marker.json'];

export const claimPath = (kit: Kit, name: string) => join(kit.capsules, name + '.import-claim');
export const readClaim = (kit: Kit, name: string): { status?: string; destination?: string; pid?: number; owner?: string; recovered?: boolean } | null => { try { return JSON.parse(readFileSync(claimPath(kit, name), 'utf8')); } catch { return null; } };
export const roomDir = (id: string) => join(TMP, 'rescue106-' + id);
export const stagingDir = (id: string) => join(TMP, 'rescue116-staging-' + id);
/** Estado de UN destino identificado por su id: publicado (con marcador), staging y carpeta de fallo (si existiera). */
export function destState(id: string) { return { published: existsSync(join(roomDir(id), 'rescue-room.marker.json')), staging: existsSync(stagingDir(id)), dir: existsSync(roomDir(id)) }; }
/** Registra los identificadores de destino que el servicio anuncia en el RECLAMO de esta cápsula a lo largo de los pasos (es la única fuente de «mis» destinos). */
export function watch(kit: Kit, name: string, extra?: (step: string) => void) {
  const ids = new Set<string>(), steps: string[] = [], prev = kit.onStep;
  // El servicio llama a onStep SIN esperarlo (`void`): lo que deba ocurrir ANTES del siguiente paso del servicio ha de ejecutarse en la parte síncrona del gancho.
  kit.onStep = (step: string) => { steps.push(step); const c = readClaim(kit, name); if (c?.destination) ids.add(c.destination); extra?.(step); return prev?.(step); };
  return { ids, steps, published: () => [...ids].filter(id => destState(id).published), trackAll: () => { for (const id of ids) trackFolder(roomDir(id)); } };
}
/** Origen incierto exportado e inspeccionado en una carpeta de kit nueva (todo dentro de la raíz propia). */
export async function prepared(stage: Parameters<typeof originAt>[0] = 'return-partial') {
  const kit = newKit(), origin = await originAt(stage), e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD);
  return { kit, origin, e, insp, input: { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision } };
}
export const bytesOf = (path: string) => readFileSync(path);
/** Huella de un árbol de ficheros (ruta relativa → tamaño:sha256; enlaces y carpetas marcados), para comprobar que una operación rechazada no tocó nada. `null` si la carpeta no existe. */
export function treeDigest(dir: string): Record<string, string> | null {
  if (!existsSync(dir)) return null; const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n), r = rel ? rel + '/' + n : n, st = lstatSync(p); if (st.isSymbolicLink()) out[r] = 'enlace'; else if (st.isDirectory()) { out[r + '/'] = 'carpeta'; walk(p, r); } else out[r] = st.size + ':' + createHash('sha256').update(readFileSync(p)).digest('hex'); } };
  walk(dir, ''); return out;
}
/** Un PID que ya no existe: se lanza un proceso real, se espera a que termine y se devuelve su PID (la comprobación `process.kill(pid, 0)` lo ve ausente). */
export async function deadPid(): Promise<number> { const p = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore', windowsHide: true }); await new Promise(r => p.once('exit', r)); return p.pid!; }
/** Un proceso real, vivo y AJENO a la importación: su PID existe pero no tiene relación con ella. */
export function livePid(): { pid: number; stop: () => void } { const p = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true }); stops.add(p); return { pid: p.pid!, stop: () => { try { p.kill(); } catch { /* ya terminó */ } } }; }
const stops = new Set<ReturnType<typeof spawn>>(); process.on('exit', () => { for (const p of stops) { try { p.kill(); } catch { /* ya terminó */ } } });

export interface ChildJob { kitDir: string; name: string; password: string; sha: string; rev: string; action: 'import' | 'sweep'; mode?: 'none' | 'crash' | 'block'; step?: string; flag?: string; startAt?: number }
export interface ChildResult { code: number | null; out: string; err: string; result: any }
/** Ejecuta un trabajo en un PROCESO nuevo con la misma raíz propia como directorio de trabajo. */
export function runChild(job: ChildJob): { done: Promise<ChildResult>; pid: number; kill: () => void } {
  const p = spawn(process.execPath, ['--import', TSX, CHILD, JSON.stringify(job)], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); stops.add(p);
  let out = '', err = ''; p.stdout!.on('data', d => { out += d; }); p.stderr!.on('data', d => { err += d; });
  const done = new Promise<ChildResult>(ok => p.once('exit', code => { const m = /^RESULT (.+)$/m.exec(out); ok({ code, out, err, result: m ? JSON.parse(m[1]) : null }); }));
  return { done, pid: p.pid!, kill: () => { try { p.kill(); } catch { /* ya terminó */ } } };
}
export async function waitFor(path: string, ms = 60_000) { const end = Date.now() + ms; while (!existsSync(path)) { if (Date.now() > end) throw new Error('espera agotada: ' + path); await new Promise(r => setTimeout(r, 25)); } }

/** Ficheros de control (barreras) que ESTE arnés crea: se retiran al terminar. Nada más se borra por patrón. */
const FLAGS = new Set<string>();
export const flagFor = (kit: Kit, tag: string) => { const base = join(kit.dir, 'flag-' + tag); FLAGS.add(base + '.reached'); FLAGS.add(base + '.go'); return base; };
/** Retira SOLO directorios VACÍOS de la raíz propia (de abajo arriba): nunca borra ficheros ni carpetas con contenido; lo que quede (p. ej. señuelos ajenos) se devuelve para informarlo. */
export function tidy(dir = ROOT, depth = 0): string[] {
  const left: string[] = []; if (dir !== ROOT && !dir.startsWith(ROOT + sep)) return left;
  let names: string[]; try { names = readdirSync(dir); } catch { return left; }
  for (const n of names) { const p = join(dir, n); let st; try { st = lstatSync(p); } catch { continue; } if (st.isSymbolicLink()) { left.push(p); continue; } if (st.isDirectory()) { if (depth < 6) left.push(...tidy(p, depth + 1)); try { rmdirSync(p); } catch { /* con contenido: no es mío o sigue en uso */ } } else left.push(p); }
  return left;
}
process.on('exit', () => { for (const f of FLAGS) { try { unlinkSync(f); } catch { /* ausente */ } } try { tidy(); rmdirSync(join(ROOT, 'tests', '.tmp')); rmdirSync(join(ROOT, 'tests')); rmdirSync(ROOT); } catch { /* se conserva si no está vacía */ } });
export { existsSync, writeFileSync, mkdirSync, readFileSync, join, resolve };
