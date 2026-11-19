// Constructor del PAQUETE DEL KIT de relevo (unidad 254, R2). Genera `<out>/` con todo lo que el ejecutor 224 necesita como `appRoot` SIN el árbol de fuentes del repositorio:
//   server/ (sin team), shared/, los cuatro scripts del Kit, package.json (+ tsconfig.json si existe), node_modules con la CLAUSURA mínima de dependencias de ejecución (tsx, zod, fastify, @fastify/static y sus
//   dependencias) y `kit-manifest.json` (formato v2) con el hash de cada archivo de código y un resumen de node_modules que VINCULA LOS BYTES: lista determinista «ruta:tamaño:SHA-256» de cada archivo.
// Uso:  node scripts/build-relay-kit.mjs <carpeta-de-salida>          (la carpeta debe no existir o estar vacía)
// Garantías: una dependencia OBLIGATORIA (`dependencies`) ausente o resuelta fuera de `<repo>/node_modules` impide publicar el manifiesto y no deja una carpeta a medias; una OPCIONAL (`optionalDependencies`, p. ej.
// el binario de otra plataforma) puede faltar y se registra en `optionalMissing`. El manifiesto se escribe el último. Un manifiesto de formato anterior lo rechaza el verificador de forma explícita.
// Límites: el paquete es de la plataforma y la versión de Node que lo construyen (el binario de esbuild es nativo); no incluye el servidor compilado ni la interfaz.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const KIT_FORMAT = 'planb-relay-kit-v2';
export const KIT_FORMAT_PREVIOUS = ['planb-relay-kit-v1'];
export const KIT_SCRIPTS = ['relay-rehearsal-child.ts', 'rehearse-rescue-capsule.ts', 'demo-rescue-room.ts', 'block-external.cjs'];
/** Dependencias de ejecución del Kit (importaciones no `node:` de los puntos de entrada) más el cargador. Se comprueban contra el código real con esbuild en las pruebas. */
export const KIT_ROOT_PACKAGES = ['tsx', 'zod', 'fastify', '@fastify/static'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
/** Archivos REGULARES bajo `dir`, con rutas relativas y barras. Cualquier enlace, unión u otro tipo de entrada lanza: nunca se sigue ni se acepta. */
const walkFiles = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name), kind = fs.lstatSync(full);
  if (kind.isSymbolicLink()) throw new Error('El paquete no admite enlaces ni uniones: ' + full);
  if (kind.isDirectory()) return walkFiles(full, base);
  if (!kind.isFile()) throw new Error('El paquete solo admite archivos regulares: ' + full);
  return [path.relative(base, full).split(path.sep).join('/')];
});
const resolvePackage = (name, fromDir, repo) => {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.resolve(dir) === path.resolve(repo) || path.dirname(dir) === dir) break;
  }
  return null;
};
/**
 * Clausura de dependencias a partir de los paquetes raíz. Devuelve `{ packages, optionalMissing }`:
 * `packages` = carpetas reales de cada paquete bajo `<repo>/node_modules`; `optionalMissing` = opcionales no instaladas. Lanza si una obligatoria falta o si un paquete se resuelve fuera de `<repo>/node_modules`.
 */
export function resolveClosure(repo, roots = KIT_ROOT_PACKAGES) {
  const nodeModules = fs.realpathSync(path.join(repo, 'node_modules')), seen = new Map(), optionalMissing = new Set(), queue = roots.map(name => ({ name, from: repo, optional: false, by: '(raíz)' }));
  while (queue.length) {
    const { name, from, optional, by } = queue.shift(), dir = resolvePackage(name, from, repo);
    if (!dir) { if (optional) { optionalMissing.add(name); continue; } throw new Error('Dependencia obligatoria ausente: ' + name + ' (requerida por ' + by + ').'); }
    const real = fs.realpathSync(dir), inside = path.relative(nodeModules, real);
    if (inside.startsWith('..') || path.isAbsolute(inside)) { if (optional) { optionalMissing.add(name); continue; } throw new Error('La dependencia obligatoria ' + name + ' (requerida por ' + by + ') se resuelve fuera del árbol que se copia: ' + real); }
    if (seen.has(real)) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8')); seen.set(real, manifest.name ?? name);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dependency, from: real, optional: false, by: manifest.name ?? name });
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) queue.push({ name: dependency, from: real, optional: true, by: manifest.name ?? name });
  }
  const packages = [...seen.keys()].map(real => ({ real, relative: path.relative(nodeModules, real).split(path.sep).join('/') }));
  return { packages, optionalMissing: [...optionalMissing].filter(name => !packages.some(item => item.relative === name)).sort() };
}
/** Compatibilidad: solo la lista de paquetes (lanza igual que `resolveClosure`). */
export const packageClosure = (repo, roots = KIT_ROOT_PACKAGES) => resolveClosure(repo, roots).packages;
/** Resumen comprobable de node_modules que VINCULA LOS BYTES: lista ordenada de «ruta:tamaño:SHA-256» (rutas relativas con barras) y su digest. Mismo algoritmo en el verificador del montaje. */
export function nodeModulesSummary(dir) {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0, digest: sha('') };
  let bytes = 0; const lines = walkFiles(dir).sort().map(file => { const content = fs.readFileSync(path.join(dir, ...file.split('/'))); bytes += content.length; return file + ':' + content.length + ':' + sha(content); });
  return { files: lines.length, bytes, digest: sha(lines.join('\n')) };
}
/** Hash de cada archivo de código del paquete (server, shared, scripts, package.json, tsconfig.json), con rutas relativas y barras. */
export function codeHashes(kit) {
  const files = [];
  for (const dir of ['server', 'shared', 'scripts']) if (fs.existsSync(path.join(kit, dir))) files.push(...walkFiles(path.join(kit, dir)).map(file => dir + '/' + file));
  for (const file of ['package.json', 'tsconfig.json']) if (fs.existsSync(path.join(kit, file))) files.push(file);
  return Object.fromEntries(files.sort().map(file => [file, sha(fs.readFileSync(path.join(kit, file)))]));
}

export function buildRelayKit({ repo = process.cwd(), out, roots = KIT_ROOT_PACKAGES }) {
  if (!out || !path.isAbsolute(out)) throw new Error('Indica una carpeta de salida absoluta.');
  repo = path.resolve(repo);
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw new Error('La carpeta de salida debe estar vacía: ' + out);
  // La clausura se resuelve ANTES de escribir nada: una obligatoria ausente o fuera del árbol no deja rastro.
  const closure = resolveClosure(repo, roots), created = !fs.existsSync(out);
  try {
    fs.mkdirSync(out, { recursive: true });
    for (const dir of ['server', 'shared']) fs.cpSync(path.join(repo, dir), path.join(out, dir), { recursive: true, filter: source => !/[\\/]server[\\/]team$/.test(source) && !fs.lstatSync(source).isSymbolicLink() });
    fs.mkdirSync(path.join(out, 'scripts'));
    for (const file of KIT_SCRIPTS) fs.copyFileSync(path.join(repo, 'scripts', file), path.join(out, 'scripts', file));
    for (const file of ['package.json', 'tsconfig.json']) if (fs.existsSync(path.join(repo, file))) fs.copyFileSync(path.join(repo, file), path.join(out, file));
    for (const { real, relative } of closure.packages) fs.cpSync(real, path.join(out, 'node_modules', ...relative.split('/')), { recursive: true, force: true, filter: source => !fs.lstatSync(source).isSymbolicLink() });
    const manifest = {
      format: KIT_FORMAT, platform: process.platform, arch: process.arch, node: process.versions.node, rootPackages: roots,
      code: codeHashes(out), packages: closure.packages.map(item => item.relative).sort(), optionalMissing: closure.optionalMissing, nodeModules: nodeModulesSummary(path.join(out, 'node_modules')),
    };
    fs.writeFileSync(path.join(out, 'kit-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');   // el manifiesto se publica el ÚLTIMO
    return manifest;
  } catch (error) {
    // Nada a medias: solo se retira lo que esta llamada creó (la carpeta de salida estaba vacía o no existía y el paquete no contiene enlaces).
    try { if (created) fs.rmSync(out, { recursive: true, force: true }); else for (const entry of fs.readdirSync(out)) fs.rmSync(path.join(out, entry), { recursive: true, force: true }); } catch { /* se conserva si no se pudo */ }
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const manifest = buildRelayKit({ out: path.resolve(process.argv[2] ?? '') }); console.log('Paquete del Kit (' + manifest.format + '): ' + Object.keys(manifest.code).length + ' archivos de código, ' + manifest.packages.length + ' paquetes, ' + (manifest.nodeModules.bytes / 1048576).toFixed(1) + ' MiB de dependencias' + (manifest.optionalMissing.length ? ' (opcionales ausentes: ' + manifest.optionalMissing.join(', ') + ')' : '') + '.'); }
  catch (error) { console.error(String(error instanceof Error ? error.message : error)); process.exitCode = 1; }
}
