import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './store.js';
import type { registerSecurity } from './security.js';
import { createRelayExecutor, type RelayExecutor, type SweepReport } from './relay-rehearsal-executor.js';
import { registerRelayRehearsalApi, storeRelayRecord, type RelayRehearsalHandle } from './relay-rehearsal-api.js';

// REGISTRO DEL ENSAYO DE RELEVO EN EL ARRANQUE PRINCIPAL (unidad 254), análogo a `mountHubspotReadCheck`: una sola llamada desde `main`, tras `createBaseApp`.
//  · Fuente de verdad del Kit: un PAQUETE (`kit/`, construido por `scripts/build-relay-kit.mjs`) junto al servidor compilado, verificado por manifiesto (hash de cada archivo de código, plataforma y resumen de node_modules).
//    Si falta, está alterado o es de otra plataforma NO se registra nada: la ruta responde 404 y la interfaz muestra la fuente como no disponible de verdad (fallo cerrado, nunca un Kit «a medias»).
//  · Raíz de datos: la carpeta de datos de la instalación (la de la base activa); el ejecutor 224 crea `relay-rehearsals/run-<uuid>` dentro, con cuota y retención propias, y barre al arrancar solo las carpetas propias vencidas.
//  · La autorización es la ORIGINAL de `createBaseApp` (`security.captureAuthorization`); Host, Origin y bloqueo por sesión de `/api/*` los hereda `createBaseApp`; el único dato que se persiste es el registro estricto del ensayo.
//  · Se registra UNA vez por servidor; una segunda llamada devuelve el resultado anterior sin volver a registrar.
export const KIT_MANIFEST_FILE = 'kit-manifest.json';
export const KIT_FORMAT = 'planb-relay-kit-v2';
const KIT_FORMAT_PREVIOUS = ['planb-relay-kit-v1'];
const REQUIRED_SCRIPTS = ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs'] as const;
const ALLOWED_TOP = new Set(['server', 'shared', 'scripts', 'node_modules', 'package.json', 'tsconfig.json', KIT_MANIFEST_FILE]), TOP_DIRS = ['server', 'shared', 'scripts', 'node_modules'] as const;
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const Manifest = z.object({
  format: z.literal(KIT_FORMAT), platform: z.string(), arch: z.string(), node: z.string(), rootPackages: z.array(z.string()),
  code: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)), packages: z.array(z.string()), optionalMissing: z.array(z.string()),
  nodeModules: z.object({ files: z.number().int().min(0), bytes: z.number().int().min(0), digest: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
}).strict();
export type KitManifest = z.infer<typeof Manifest>;
export type KitProblem = 'no-kit' | 'kit-invalid' | 'platform-mismatch';
export type KitCheck = { ok: true; manifest: KitManifest } | { ok: false; reason: KitProblem; detail: string };

/** Archivos REGULARES bajo `dir`: cualquier enlace, unión u otro tipo de entrada lanza (nunca se sigue ni se acepta). */
function walkFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name), kind = lstatSync(full);
    if (kind.isSymbolicLink()) throw new Error('enlace-en-el-paquete');
    if (kind.isDirectory()) return walkFiles(full, base);
    if (!kind.isFile()) throw new Error('entrada-no-regular');
    return [full.slice(base.length + 1).split(/[\\/]/).join('/')];
  });
}
/**
 * Verifica el paquete contra su manifiesto v2: la propia raíz y cada entrada de primer nivel son directorios o archivos REALES (sin uniones ni otros tipos), el conjunto de entradas es exactamente el esperado,
 * el código coincide archivo a archivo, `node_modules` coincide por ruta, tamaño y SHA-256 del CONTENIDO, y los scripts de entrada y el cargador están completos. Cualquier alteración falla cerrada.
 */
export function verifyRelayKit(kitRoot: string): KitCheck {
  const fail = (reason: KitProblem, detail: string): KitCheck => ({ ok: false, reason, detail });
  try {
    if (!existsSync(kitRoot)) return fail('no-kit', 'No hay paquete del Kit en la instalación.');
    const rootKind = lstatSync(kitRoot); if (rootKind.isSymbolicLink() || !rootKind.isDirectory()) return fail('kit-invalid', 'La raíz del paquete no es una carpeta real (unión o alias).');
    if (!existsSync(join(kitRoot, KIT_MANIFEST_FILE))) return fail('no-kit', 'No hay paquete del Kit en la instalación.');
    const manifestKind = lstatSync(join(kitRoot, KIT_MANIFEST_FILE)); if (!manifestKind.isFile()) return fail('kit-invalid', 'El manifiesto del paquete no es un archivo regular.');
    const raw = JSON.parse(readFileSync(join(kitRoot, KIT_MANIFEST_FILE), 'utf8')) as { format?: unknown };
    if (typeof raw.format === 'string' && KIT_FORMAT_PREVIOUS.includes(raw.format)) return fail('kit-invalid', 'El manifiesto es de una versión anterior (' + raw.format.replace('planb-relay-kit-', '') + '): reconstruye el paquete con scripts/build-relay-kit.mjs.');
    const parsed = Manifest.safeParse(raw); if (!parsed.success) return fail('kit-invalid', 'El manifiesto del paquete no es válido.');
    const manifest = parsed.data;
    if (manifest.platform !== process.platform || manifest.arch !== process.arch || manifest.node.split('.')[0] !== process.versions.node.split('.')[0]) return fail('platform-mismatch', 'El paquete se construyó para otra plataforma o versión de Node.');
    // Primer nivel: el conjunto exacto y cada entrada real (se comprueba ANTES de recorrer lo que hay dentro).
    for (const name of readdirSync(kitRoot)) {
      if (!ALLOWED_TOP.has(name)) return fail('kit-invalid', 'El paquete contiene una entrada no esperada: ' + name);
      const kind = lstatSync(join(kitRoot, name));
      if (kind.isSymbolicLink()) return fail('kit-invalid', 'El paquete contiene una unión o enlace en el primer nivel: ' + name);
      if ((TOP_DIRS as readonly string[]).includes(name) ? !kind.isDirectory() : !kind.isFile()) return fail('kit-invalid', 'El tipo de la entrada ' + name + ' no es el esperado.');
    }
    for (const required of [...TOP_DIRS, 'package.json']) if (!existsSync(join(kitRoot, required))) return fail('kit-invalid', 'Falta una entrada obligatoria del paquete: ' + required);
    const actual: Record<string, string> = {};
    for (const dir of ['server', 'shared', 'scripts']) for (const file of walkFiles(join(kitRoot, dir))) actual[dir + '/' + file] = sha(readFileSync(join(kitRoot, dir, file)));
    for (const file of ['package.json', 'tsconfig.json']) if (existsSync(join(kitRoot, file))) actual[file] = sha(readFileSync(join(kitRoot, file)));
    const expected = Object.keys(manifest.code).sort(), found = Object.keys(actual).sort();
    if (expected.length !== found.length || expected.some((file, index) => file !== found[index] || manifest.code[file] !== actual[file])) return fail('kit-invalid', 'El código del paquete no coincide con su manifiesto.');
    for (const script of REQUIRED_SCRIPTS) if (!(('scripts/' + script) in actual)) return fail('kit-invalid', 'Falta un script de entrada del Kit: ' + script);
    const modules = join(kitRoot, 'node_modules'); let bytes = 0;
    const lines = walkFiles(modules).sort().map(file => { const content = readFileSync(join(modules, ...file.split('/'))); bytes += content.length; return file + ':' + content.length + ':' + sha(content); });
    if (lines.length !== manifest.nodeModules.files || bytes !== manifest.nodeModules.bytes || sha(lines.join('\n')) !== manifest.nodeModules.digest) return fail('kit-invalid', 'Las dependencias del paquete no coinciden con su manifiesto (rutas, tamaños o contenido).');
    if (!lines.some(line => line.startsWith('tsx/package.json:')) || !lines.some(line => line.startsWith('tsx/dist/'))) return fail('kit-invalid', 'El cargador del Kit está incompleto.');
    if (!manifest.packages.includes('tsx')) return fail('kit-invalid', 'El manifiesto no declara el cargador del Kit.');
    return { ok: true, manifest };
  } catch (error) { return fail('kit-invalid', 'No se pudo comprobar el paquete: ' + (error instanceof Error ? error.message : 'error')); }
}

export interface RelayMountOptions {
  /** Raíz del paquete. Por defecto `PLANB_KIT_ROOT` o `kit/` junto a la carpeta del servidor compilado (`<instalación>/build/server.mjs` → `<instalación>/kit`). */
  kitRoot?: string;
  /** Carpeta de datos de la instalación. Por defecto la de la base de datos activa. */
  installRoot?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}
export type RelayMountResult =
  | { mounted: true; kitRoot: string; executor: RelayExecutor; handle: RelayRehearsalHandle; sweep: SweepReport; manifest: KitManifest }
  | { mounted: false; reason: KitProblem | 'setup-failed'; detail: string };
const mounted = new WeakMap<FastifyInstance, RelayMountResult>();

export function mountRelayRehearsal(app: FastifyInstance, store: Store, security: ReturnType<typeof registerSecurity>, options: RelayMountOptions = {}): RelayMountResult {
  const previous = mounted.get(app); if (previous) return previous;
  const env = options.env ?? process.env, log = options.log ?? ((message: string) => console.warn(message));
  const finish = (result: RelayMountResult) => { mounted.set(app, result); if (!result.mounted) log('Ensayo de relevo no disponible: ' + result.detail); return result; };
  const configured = options.kitRoot ?? env.PLANB_KIT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'kit');
  if (!isAbsolute(configured)) return finish({ mounted: false, reason: 'setup-failed', detail: 'La raíz del paquete debe ser absoluta.' });
  const kitRoot = resolve(configured), check = verifyRelayKit(kitRoot);
  if (!check.ok) return finish({ mounted: false, reason: check.reason, detail: check.detail });
  let executor: RelayExecutor;
  try { executor = createRelayExecutor({ installRoot: resolve(options.installRoot ?? dirname(store.filename)), appRoot: kitRoot }); }
  catch (error) { return finish({ mounted: false, reason: 'setup-failed', detail: 'No se pudo preparar el ejecutor: ' + (error instanceof Error ? error.message : 'error') }); }
  let sweep: SweepReport = { removed: 0, kept: 0, skipped: 0 };
  try { sweep = executor.sweep(); } catch { /* el barrido se repite en cada ejecución */ }
  // `run` es OBLIGATORIO y respeta la señal; la autorización es la original de createBaseApp (se captura al entrar en POST).
  const handle = registerRelayRehearsalApi(app, { captureAuthorization: security.captureAuthorization, store: storeRelayRecord(store), run: executor.run, timeoutMs: options.timeoutMs ?? 180_000 });
  return finish({ mounted: true, kitRoot, executor, handle, sweep, manifest: check.manifest });
}
