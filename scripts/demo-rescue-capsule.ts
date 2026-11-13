import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { RescueRoom, assertOwnRoot } from '../server/rescue-room.js';
import { createCapsuleServer } from '../server/rescue-capsule-api.js';
import { listenRescue } from '../server/rescue-room-api.js';
import { openKit } from '../server/rescue-capsule.js';
import { lockInstance } from '../server/instance.js';
import { RescueError } from '../shared/rescue-room.js';
// Demo del Kit de Relevo (CLAUDE-RESCUE-KIT-116). Servidor propio en loopback; datos ficticios; sin red externa. Banner: «Ensayo · datos ficticios · mismo equipo, carpeta nueva».
//   Nuevo:     npx tsx scripts/demo-rescue-capsule.ts --port 4531 --dist tests/.tmp/<ui-del-kit> --dest-dist tests/.tmp/<ui-de-rescate>
//   Reanudar el origen propio: ... --resume tests/.tmp/rescue106-<id>
// Falla si el puerto está ocupado (no busca otro ni mata procesos). Importar este módulo no arranca nada. La contraseña NO se pasa por argumentos: se escribe en la interfaz.
export interface CapsuleDemoArgs { port: number; dist: string | null; destDist: string | null; resume: string | null; now: number | null }
export function parseArgs(argv: string[]): CapsuleDemoArgs {
  const out: CapsuleDemoArgs = { port: 4531, dist: null, destDist: null, resume: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], next = argv[i + 1];
    if (/^--(password|pass|clave|secret)/i.test(flag)) throw new RescueError(400, 'ARGS', 'La contraseña no se pasa por argumentos: se escribe en la interfaz.');
    if (flag === '--port' && next) { const n = Number(next); if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new RescueError(400, 'ARGS', 'Puerto inválido.'); out.port = n; i++; }
    else if (flag === '--dist' && next) { out.dist = next; i++; } else if (flag === '--dest-dist' && next) { out.destDist = next; i++; } else if (flag === '--resume' && next) { out.resume = next; i++; }
    else if (flag === '--now' && next) { const t = Date.parse(next); if (!Number.isFinite(t)) throw new RescueError(400, 'ARGS', '--now requiere una fecha ISO válida.'); out.now = t; i++; }
    else throw new RescueError(400, 'ARGS', 'Argumento no admitido: ' + flag);
  }
  return out;
}
export async function startCapsuleDemo(args: CapsuleDemoArgs) {
  const clock = args.now === null ? undefined : () => args.now!;
  let origin: RescueRoom | null = null, release: (() => void) | null = null;
  try {
    // Un solo escritor sobre el origen: el bloqueo se adquiere ANTES de abrir Store/Recovery.
    if (args.resume) { const { real } = assertOwnRoot(args.resume); release = lockInstance(real); origin = RescueRoom.open(real, { clock }); }
    else { origin = RescueRoom.create(resolve('tests', '.tmp'), { clock }); release = lockInstance(origin.root); }
    const kit = openKit(resolve('tests', '.tmp', 'rescue116-' + randomUUID())); if (clock) kit.clock = clock;
    const { app, stop } = await createCapsuleServer(origin, kit, { staticDir: args.dist ? resolve(args.dist) : undefined, destDist: args.destDist ? resolve(args.destDist) : undefined, now: args.now === null ? undefined : new Date(args.now).toISOString() });
    try { await listenRescue(app, args.port); } catch (error) { await stop(); throw error; }
    const owned = origin, free = release;
    return { origin, kit, app, url: 'http://127.0.0.1:' + args.port + '/', stop: async () => { await stop(); owned.close(); free(); } };
  } catch (error) { try { origin?.close(); } catch { /* ya cerrada */ } release?.(); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const demo = await startCapsuleDemo(parseArgs(process.argv.slice(2)));
    console.log('Kit de Relevo (ensayo, datos ficticios): ' + demo.url + '\nOrigen: ' + demo.origin.root + '\nCarpeta del kit: ' + demo.kit.dir + '\nPara reanudar el origen: npx tsx scripts/demo-rescue-capsule.ts --port <puerto> --resume ' + demo.origin.root);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void demo.stop().then(() => process.exit(0)); });
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
