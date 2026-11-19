import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RescueRoom, assertOwnRoot } from '../server/rescue-room.js';
import { createRescueServer, listenRescue } from '../server/rescue-room-api.js';
import { lockInstance } from '../server/instance.js';
import { RescueError } from '../shared/rescue-room.js';
// Demo de la Sala de rescate (CLAUDE-RESCUE-106). Servidor propio en loopback; datos ficticios; sin red externa ni proveedores.
//   Ensayo nuevo:  npx tsx scripts/demo-rescue-room.ts --port 4511 --dist tests/.tmp/<carpeta-con-la-interfaz-compilada>
//   Reanudar:      npx tsx scripts/demo-rescue-room.ts --port 4511 --dist <igual> --resume tests/.tmp/rescue106-<id>
// --now <ISO> fija el reloj (fixture y cola reproducibles). Importar este módulo no arranca nada.
export interface DemoArgs { port: number; dist: string | null; resume: string | null; now: number | null }
export function parseArgs(argv: string[]): DemoArgs {
  const out: DemoArgs = { port: 4511, dist: null, resume: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], next = argv[i + 1];
    if (flag === '--port' && next) { const n = Number(next); if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new RescueError(400, 'ARGS', 'Puerto inválido.'); out.port = n; i++; }
    else if (flag === '--dist' && next) { out.dist = next; i++; }
    else if (flag === '--resume' && next) { out.resume = next; i++; }
    else if (flag === '--now' && next) { const t = Date.parse(next); if (!Number.isFinite(t)) throw new RescueError(400, 'ARGS', '--now requiere una fecha ISO válida.'); out.now = t; i++; }
    else throw new RescueError(400, 'ARGS', 'Argumento no admitido: ' + flag);
  }
  return out;
}
export async function startDemo(args: DemoArgs) {
  const clock = args.now === null ? undefined : () => args.now!;
  let room: RescueRoom | null = null, release: (() => void) | null = null;
  try {
    // Un solo escritor: el bloqueo se adquiere ANTES de abrir Store/Recovery (abrirlos ya escribe: normaliza operaciones `sending` y recalcula claves).
    if (args.resume) { const { real } = assertOwnRoot(args.resume); release = lockInstance(real); room = RescueRoom.open(real, { clock }); }
    else { room = RescueRoom.create(resolve('tests', '.tmp'), { clock }); release = lockInstance(room.root); }
    const app = await createRescueServer(room, { staticDir: args.dist ? resolve(args.dist) : undefined });
    try { await listenRescue(app, args.port); } catch (error) { await app.close(); throw error; }
    const owned = room, free = release;
    const stop = async () => { await app.close(); owned.close(); free(); };
    return { room, app, stop, url: 'http://127.0.0.1:' + args.port + '/' };
  } catch (error) {
    // Si algo falla se cierra solo lo ya creado por este arranque y se libera exclusivamente el bloqueo adquirido aquí.
    try { room?.close(); } catch { /* ya cerrada */ }
    release?.(); throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const demo = await startDemo(parseArgs(process.argv.slice(2)));
    console.log('Sala de rescate (ensayo, datos ficticios): ' + demo.url + '\nCarpeta del ensayo: ' + demo.room.root + '\nPara reanudar: npx tsx scripts/demo-rescue-room.ts --port <puerto> --resume ' + demo.room.root);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void demo.stop().then(() => process.exit(0)); });
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
