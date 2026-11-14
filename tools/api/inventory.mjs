#!/usr/bin/env node
// Inventario de la API de Plan B (CLAUDE-API-INVENTORY).
//
//   node tools/api/inventory.mjs            regenera docs/api.md
//   node tools/api/inventory.mjs --check    falla (código 1) si docs/api.md no coincide con los servidores
//   node tools/api/inventory.mjs --json     imprime el inventario completo (con número de línea)
//   Opciones: --entries main,runtime,team   --out <archivo>   --doc <archivo a comprobar>
//
// Cada entrada se arranca en una carpeta temporal nueva, con datos vacíos, NODE_ENV=test, la red exterior
// bloqueada (scripts/block-external.cjs) y Fastify sustituido por fastify-capture.mjs, que termina el proceso
// al llamar a listen. No abre puertos, no lee .env.local (el directorio de trabajo es la carpeta temporal) ni
// datos del usuario, y no escribe en el repositorio salvo el documento que se le pide.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DOC = join(REPO, 'docs', 'api.md');

/** Entradas inventariadas. `files`: archivos que la entrada exige para arrancar; `env`: variables propias. */
export const ENTRIES = {
  main: { label: 'main', title: 'App local completa', entry: 'server/main.ts', env: () => ({}), files: {} },
  runtime: { label: 'runtime', title: 'App independiente (paquete portátil)', entry: 'server/runtime.ts', env: () => ({}),
    // Solo se comprueba que exista: con él la entrada arranca sin restaurar ninguna copia.
    files: { 'continuity.encrypted.json': '{}' } },
  team: { label: 'equipo', title: 'Servicio de equipo en modo demo', entry: 'server/team/main.ts',
    env: work => ({ PLANB_TEAM_DEMO: '1', PLANB_TEAM_DATA_DIR: join(work, 'team'), PLANB_TEAM_PORT: '1' }), files: {} },
};

const KEEP_ENV = ['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir', 'lang', 'tz'];

/**
 * Entorno del proceso hijo: solo lo imprescindible para que Node funcione, más las variables propias del inventario.
 * Nada de PLANB_*, HUBSPOT_*, GOOGLE_*, NODE_OPTIONS, HOME o USERPROFILE del entorno de quien lo lanza.
 */
export function childEnvironment(parent, id, work, out) {
  const env = Object.fromEntries(Object.entries(parent).filter(([key]) => KEEP_ENV.includes(key.toLowerCase())));
  return Object.assign(env, { NODE_ENV: 'test', PLANB_DATA_DIR: join(work, 'data'), PLANB_PORT: '1', PLANB_API_CAPTURE_OUT: out }, ENTRIES[id].env(work));
}

/** Arranca una entrada con Fastify interceptado y devuelve sus rutas declaradas. */
export function captureEntry(id, { repo = REPO, timeoutMs = 300_000 } = {}) {
  const spec = ENTRIES[id];
  if (!spec) throw new Error('Entrada desconocida: ' + id);
  const work = mkdtempSync(join(tmpdir(), 'planb-api-' + id + '-'));
  try {
    mkdirSync(join(work, 'data'));
    for (const [name, content] of Object.entries(spec.files)) writeFileSync(join(work, name), content);
    const out = join(work, 'routes.json');
    const env = childEnvironment(process.env, id, work, out);
    const run = spawnSync(process.execPath, [
      '--require', join(repo, 'scripts', 'block-external.cjs'),
      '--import', pathToFileURL(join(repo, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href,
      '--import', new URL('./capture-register.mjs', import.meta.url).href,
      join(repo, spec.entry),
    ], { cwd: work, env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
    if (!existsSync(out)) {
      const detail = (run.error?.message ?? '') + '\n' + (run.stderr ?? '').slice(-3000) + (run.stdout ?? '').slice(-1000);
      throw new Error('La entrada ' + id + ' no llegó a escuchar (código ' + run.status + ').\n' + detail.trim());
    }
    const captured = JSON.parse(readFileSync(out, 'utf8'));
    if (captured.listening !== false) throw new Error('La entrada ' + id + ' llegó a escuchar en un puerto: el envoltorio no sustituyó listen.');
    return { routes: captured.routes, endpointWritten: existsSync(join(work, 'data', '.endpoint.json')) };
  } finally {
    // Un fallo al limpiar la carpeta temporal no debe ocultar el error de la captura.
    try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error('Aviso: no se pudo borrar ' + work + ': ' + (error instanceof Error ? error.message : error)); }
  }
}

/** Grupo de una ruta para el documento. */
export function groupOf(url) {
  const version = /^\/api\/(v\d+)\//.exec(url);
  if (version) return version[1];
  if (url.startsWith('/api/team/') || url === '/api/team') return 'team';
  if (url.startsWith('/api/')) return 'sin versión';
  return 'fuera de /api';
}

const GROUP_ORDER = ['v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'sin versión', 'team', 'fuera de /api'];
const rank = group => { const i = GROUP_ORDER.indexOf(group); return i < 0 ? GROUP_ORDER.length : i; };

/** Une las rutas de varias entradas: una fila por método y ruta, con las entradas que la sirven y su origen. */
export function mergeInventory(byEntry) {
  const rows = new Map();
  for (const [entry, routes] of Object.entries(byEntry)) for (const route of routes) {
    const key = route.method + ' ' + route.url;
    const row = rows.get(key) ?? { method: route.method, url: route.url, group: groupOf(route.url), entries: [], origins: [] };
    if (!row.entries.includes(entry)) row.entries.push(entry);
    const origin = route.file ? route.file + (route.line ? ':' + route.line : '') : null;
    if (!row.origins.some(o => o.entry === entry && o.origin === origin)) row.origins.push({ entry, origin, file: route.file ?? null });
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group)
    || a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
}

/**
 * Documento Markdown. Muestra el archivo de origen sin número de línea, para que mover código dentro de un
 * archivo no deje el documento desactualizado; --json conserva la línea.
 */
export function renderMarkdown(rows, entryIds) {
  const labels = entryIds.map(id => ENTRIES[id].label);
  const files = row => [...new Set(row.origins.map(o => o.file ?? 'desconocido'))].join(', ');
  const lines = [
    '# API de Plan B · inventario generado',
    '',
    'Generado por `node tools/api/inventory.mjs` a partir de los servidores reales: cada entrada se arranca en una carpeta temporal con datos vacíos, sin red exterior ni puertos, y se anotan las rutas que declara. **No editar a mano**: regenerar con el mismo comando y comprobar con `--check`.',
    '',
    '**Entradas:** ' + entryIds.map(id => '`' + ENTRIES[id].label + '` = ' + ENTRIES[id].title + ' (`' + ENTRIES[id].entry + '`)').join(' · '),
    '',
    '**Límites:** solo aparecen las rutas que cada entrada declara con su configuración por defecto. El servicio de equipo se inventaría en modo demo: faltan las rutas del piloto local (`PLANB_TEAM_LOCAL_PILOT`), las del modo gestionado (por ejemplo `/internal/dispatch`) y las que dependen de credenciales (OAuth de HubSpot, Google, Copilot o identidad gestionada). Tampoco están los servidores propios de la sala y la cápsula de rescate (`server/rescue-room-api.ts`, `server/rescue-capsule-api.ts`), que solo arrancan desde sus scripts de demostración. `HEAD` se omite porque Fastify lo añade a cada `GET`. Tampoco aparece la ruta de archivos estáticos (`/*`), que solo se registra cuando existe `dist/`. La comprobación de permisos de cada ruta no forma parte de este inventario.',
    '',
    '## Resumen',
    '',
    '| Grupo | Rutas | ' + labels.join(' | ') + ' |',
    '| --- | --- | ' + labels.map(() => '---').join(' | ') + ' |',
  ];
  const groups = [...new Set(rows.map(r => r.group))];
  for (const group of groups) {
    const inGroup = rows.filter(r => r.group === group);
    lines.push('| ' + group + ' | ' + inGroup.length + ' | ' + entryIds.map(id => inGroup.filter(r => r.entries.includes(id)).length).join(' | ') + ' |');
  }
  lines.push('| **Total** | **' + rows.length + '** | ' + entryIds.map(id => '**' + rows.filter(r => r.entries.includes(id)).length + '**').join(' | ') + ' |');
  for (const group of groups) {
    lines.push('', '## ' + group, '', '| Método | Ruta | ' + labels.join(' | ') + ' | Declarada en |', '| --- | --- | ' + labels.map(() => ':---:').join(' | ') + ' | --- |');
    for (const row of rows.filter(r => r.group === group)) {
      lines.push('| ' + row.method + ' | `' + row.url.replace(/\|/g, '\\|') + '` | ' + entryIds.map(id => row.entries.includes(id) ? '●' : '').join(' | ') + ' | `' + files(row) + '` |');
    }
  }
  return lines.join('\n') + '\n';
}

/** Diferencias de rutas entre dos documentos generados, para un mensaje de --check legible. */
export function routeDiff(expected, actual) {
  const keys = text => new Set([...text.matchAll(/^\| ([A-Z]+) \| `([^`]+)` \|/gm)].map(m => m[1] + ' ' + m[2]));
  const a = keys(expected), b = keys(actual);
  return { added: [...b].filter(k => !a.has(k)), removed: [...a].filter(k => !b.has(k)) };
}

function main(argv) {
  const flag = name => argv.includes(name);
  const value = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const entryIds = (value('--entries') ?? Object.keys(ENTRIES).join(',')).split(',').filter(Boolean);
  const byEntry = {};
  for (const id of entryIds) {
    const { routes, endpointWritten } = captureEntry(id);
    if (endpointWritten) throw new Error('La entrada ' + id + ' publicó su dirección: el envoltorio no detuvo listen.');
    const orphan = routes.filter(r => !r.file);
    if (orphan.length) throw new Error('Rutas sin archivo de origen en ' + id + ': ' + orphan.map(r => r.method + ' ' + r.url).join(', '));
    byEntry[id] = routes;
  }
  const rows = mergeInventory(byEntry);
  if (flag('--json')) { process.stdout.write(JSON.stringify({ entries: entryIds, routes: rows }, null, 2) + '\n'); return 0; }
  const doc = renderMarkdown(rows, entryIds);
  if (flag('--check')) {
    const target = resolve(value('--doc') ?? DOC);
    const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current === doc) { console.log('docs/api.md al día: ' + rows.length + ' rutas.'); return 0; }
    const { added, removed } = routeDiff(current, doc);
    console.error('El inventario no coincide con ' + target + '. Regenera con: node tools/api/inventory.mjs');
    if (added.length) console.error('Rutas nuevas: ' + added.join(', '));
    if (removed.length) console.error('Rutas retiradas: ' + removed.join(', '));
    if (!added.length && !removed.length) console.error('Cambian entradas, orígenes o el texto del documento.');
    return 1;
  }
  const out = resolve(value('--out') ?? DOC);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, doc);
  console.log('Escrito ' + out + ': ' + rows.length + ' rutas en ' + entryIds.length + ' entradas.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; }
}
