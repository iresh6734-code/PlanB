import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ fileBytes: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, files: 512, metadataBytes: 2 * 1024 * 1024 });
export class ReleaseError extends Error {
  constructor(code, message) { super(message); this.name = 'ReleaseError'; this.code = code; }
}
const fail = (code, message) => { throw new ReleaseError(code, message); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\\\u0000-\u001f<>:"|?*%]/.test(value) || value.startsWith('/')) fail('UNSAFE_PATH', 'La ruta debe ser relativa, exacta y sin codificaciones.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail('UNSAFE_PATH', 'Ruta ambigua o fuera del artefacto.');
  if (parts.some(part => /^(\.git|\.env.*|\.claude|\.codex|data|node_modules|runtime-assets|\.planb.*|\.google.*)$/i.test(part) || /\.(sqlite|db|enc|log)$/i.test(part))) fail('PRIVATE_PATH', 'La selección contiene una ruta privada o de ejecución.');
  return value;
}

export function artifactComponent(value) {
  safeRelative(value);
  const name = value.startsWith('dist/') ? value.slice(5) : value;
  if (name === 'index.html' || name === 'favicon.svg' || /^(assets|integrations)\/[A-Za-z0-9_./-]+\.(js|css|svg|png|jpe?g|webp|ico|woff2?|json)$/i.test(name)) return 'frontend';
  if (/^(server|team|runtime|drill|copilot-worker|pilot-alias)\.mjs$/.test(value) || /^(block-external|launch)\.cjs$/.test(value)) return 'backend';
  fail('UNSUPPORTED_ARTIFACT_PATH', 'Archivo fuera de la lista de código y activos admitidos.');
}

export function sourcePath(value) {
  safeRelative(value);
  if (!/^(src|server|shared|scripts|tools)\/.+\.(tsx?|[cm]?js|css|html)$/.test(value) && value !== 'package.json') fail('UNSUPPORTED_SOURCE_PATH', 'Solo se admiten fuentes de código explícitas.');
  return value;
}

export function canonicalRoot(root) {
  if (typeof root !== 'string' || !root) fail('INVALID_ROOT', 'Falta una carpeta de lectura.');
  try {
    const resolved = path.resolve(root), real = fs.realpathSync(resolved);
    const compare = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (compare(resolved) !== compare(real) || !fs.lstatSync(resolved).isDirectory()) fail('UNSAFE_ROOT', 'La carpeta no puede atravesar enlaces o junctions.');
    return real;
  } catch (error) { if (error instanceof ReleaseError) throw error; fail('INVALID_ROOT', 'No se puede abrir la carpeta seleccionada.'); }
}

function checkedPath(root, relative) {
  safeRelative(relative);
  canonicalRoot(root);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('LINK_REJECTED', 'No se siguen enlaces o junctions en los archivos seleccionados.');
  }
  return cursor;
}
const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');

/** Best effort against concurrent edits, not a filesystem lock or an OS security boundary. */
export function readStable(root, relative, maxBytes = LIMITS.fileBytes) {
  let fd;
  try {
    const full = checkedPath(root, relative);
    const beforePath = fs.lstatSync(full, { bigint: true });
    if (!beforePath.isFile() || beforePath.size > BigInt(maxBytes)) fail('FILE_LIMIT', 'La selección no es un archivo regular del tamaño permitido.');
    fd = fs.openSync(full, 'r');
    const before = fs.fstatSync(fd, { bigint: true });
    if (stamp(before) !== stamp(beforePath)) fail('UNSTABLE_FILE', 'El archivo cambió al abrirse.');
    // Bounded read even if a writer grows the file after stat.
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!n) break;
      length += n;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    const afterPath = fs.lstatSync(checkedPath(root, relative), { bigint: true });
    if (length !== Number(before.size) || stamp(before) !== stamp(after) || stamp(after) !== stamp(afterPath)) fail('UNSTABLE_FILE', 'El archivo cambió durante la lectura.');
    return buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    if (error?.code === 'ENOENT') fail('MISSING_FILE', 'Falta un archivo seleccionado.');
    fail('READ_FAILED', 'No se pudo comprobar el archivo seleccionado.');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function discover(root) {
  const files = [];
  function visit(relative = '') {
    const full = relative ? checkedPath(root, relative) : root;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      const directory = ['assets', 'integrations', 'dist', 'dist/assets', 'dist/integrations'].includes(name);
      if (directory) {
        checkedPath(root, name);
        if (!entry.isDirectory()) fail('UNSAFE_DIRECTORY', 'Un directorio de activos no es regular.');
        visit(name);
      } else if (relative === 'assets' || relative === 'integrations' || relative === 'dist/assets' || relative === 'dist/integrations' || /^(assets|integrations|dist\/assets|dist\/integrations)\//.test(relative)) {
        // Nested public asset folders are allowed, but never links.
        checkedPath(root, name);
        if (entry.isDirectory()) visit(name); else { artifactComponent(name); files.push(name); }
      } else {
        try { artifactComponent(name); } catch (error) {
          if (error instanceof ReleaseError) continue;
          throw error;
        }
        checkedPath(root, name);
        if (entry.isDirectory()) fail('FILE_LIMIT', 'Se esperaba un archivo de código.');
        files.push(name);
      }
      if (files.length > LIMITS.files) fail('FILE_COUNT_LIMIT', 'Demasiados archivos en el artefacto.');
    }
  }
  visit();
  return files.sort();
}

/** Bounded HTML subset, not a browser parser. Ambiguous syntax is unverifiable, never complete. */
function entryTags(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 256 * 1024) fail('INDEX_LIMIT', 'Índice ausente o superior al límite permitido.');
  const tags = [], space = c => c !== undefined && /[\t\n\f\r ]/.test(c);
  const unsupported = () => fail('UNSUPPORTED_INDEX_HTML', 'La sintaxis del índice no permite verificar sus referencias con seguridad.');
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf('<', i); if (start < 0) break; i = start + 1;
    if (html.startsWith('!--', i)) {
      const end = html.indexOf('-->', i + 3); if (end < 0) unsupported();
      const comment = html.slice(i + 3, end);
      // HTML also has abruptly closed comments; do not hide real tags behind one of those forms.
      if (comment.startsWith('>') || comment.startsWith('->') || comment.includes('--')) unsupported();
      i = end + 3; continue;
    }
    if (html[i] === '!') {
      const declaration = /^!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/i.exec(html.slice(i));
      if (!declaration) unsupported(); i += declaration[0].length; continue;
    }
    if (html[i] === '/') {
      const end = /^\/[a-z][a-z\d:-]*[\t\n\f\r ]*>/i.exec(html.slice(i));
      if (!end) unsupported(); i += end[0].length; continue;
    }
    if (!/[a-z]/i.test(html[i] ?? '')) { if (html[i] === '?') unsupported(); continue; }
    const name = /^[a-z][a-z\d:-]*/i.exec(html.slice(i))[0].toLowerCase(); i += name.length;
    if (i < html.length && !space(html[i]) && html[i] !== '>' && html[i] !== '/') unsupported();
    const attributes = new Map(); let ended = false;
    while (i < html.length) {
      while (space(html[i])) i++;
      if (html[i] === '>') { i++; ended = true; break; }
      if (html[i] === '/' && html[i + 1] === '>') { i += 2; ended = true; break; }
      const attribute = /^[a-z_:][a-z\d_:.-]*/i.exec(html.slice(i));
      if (!attribute) unsupported();
      const key = attribute[0].toLowerCase(); i += attribute[0].length;
      if (attributes.has(key)) unsupported();
      while (space(html[i])) i++;
      let value = '';
      if (html[i] === '=') {
        i++; while (space(html[i])) i++;
        if (html[i] === '"' || html[i] === "'") {
          const quote = html[i++], end = html.indexOf(quote, i); if (end < 0) unsupported();
          value = html.slice(i, end); i = end + 1;
          if (i < html.length && !space(html[i]) && html[i] !== '>' && html[i] !== '/') unsupported();
        } else {
          const from = i; while (i < html.length && !space(html[i]) && html[i] !== '>') i++;
          value = html.slice(from, i); if (!value || /["'`<=\u0000]/.test(value)) unsupported();
        }
      } else if (i < html.length && html[i] !== '>' && html[i] !== '/' && !space(html[i])) {
        // The whitespace above may already have positioned us at the following boolean/name attribute.
        if (!/^[a-z_:]/i.test(html[i])) unsupported();
      }
      if (value.includes('\u0000')) unsupported();
      attributes.set(key, value);
    }
    if (!ended) unsupported();
    if (['svg', 'math', 'template', 'noscript'].includes(name) || name === 'base' && attributes.has('href')) unsupported();
    if (name === 'script' || name === 'link') tags.push({ name, attributes });
    if (name === 'plaintext') break;
    if (['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'].includes(name)) {
      const closing = new RegExp('</' + name + '(?=[\\t\\n\\f\\r />])', 'ig'); closing.lastIndex = i;
      const end = closing.exec(html); if (!end) unsupported();
      if (name === 'script' && html.slice(i, end.index).includes('<!--')) unsupported();
      i = end.index;
    }
  }
  return tags;
}

export function entryAssetPaths(html, prefix = '') {
  const paths = new Set();
  for (const tag of entryTags(html)) {
    const key = tag.name === 'script' ? 'src' : 'href';
    if (!tag.attributes.has(key)) continue;
    let ref = tag.attributes.get(key);
    if (tag.name === 'link' && /^data:image\//i.test(ref) && tag.attributes.get('rel')?.toLowerCase().split(/\s+/).includes('icon')) continue;
    if (!ref || ref.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(ref) || /[\s&#?%\\]/.test(ref)) fail('UNSUPPORTED_ASSET_REFERENCE', 'El índice contiene referencias externas o ambiguas.');
    if (ref.startsWith('/')) ref = ref.slice(1);
    if (ref.startsWith('./')) ref = ref.slice(2);
    artifactComponent(prefix + ref);
    if (artifactComponent(prefix + ref) !== 'frontend') fail('UNSUPPORTED_ASSET_REFERENCE', 'El índice no puede referenciar código de servidor.');
    paths.add(prefix + ref);
  }
  return [...paths].sort();
}

function checkEntries(manifest, html) {
  const prefix = manifest.layout === 'runtime' ? 'dist/' : '';
  const names = new Set(manifest.files.map(file => file.path));
  for (const ref of entryAssetPaths(html, prefix)) if (!names.has(ref)) fail('INCOMPLETE_MANIFEST', 'Faltan activos referenciados por el índice.');
}

export function validateManifest(value) {
  if (!ownKeys(value, ['format', 'algorithm', 'complete', 'layout', 'files', 'sources']) || value.format !== 1 || value.algorithm !== 'sha256' || value.complete !== true || !['dist', 'runtime'].includes(value.layout)) fail('INVALID_MANIFEST', 'Manifiesto incompleto o formato no admitido.');
  let total = 0;
  for (const [field, extra] of [['files', true], ['sources', false]]) {
    if (!Array.isArray(value[field]) || value[field].length > LIMITS.files || field === 'files' && !value[field].length) fail('INVALID_MANIFEST', 'Lista de archivos no válida.');
    const names = new Set();
    for (const record of value[field]) {
      if (!ownKeys(record, extra ? ['path', 'bytes', 'sha256', 'component'] : ['path', 'bytes', 'sha256'])) fail('INVALID_MANIFEST', 'Registro de archivo no válido.');
      const normalized = extra ? (artifactComponent(record.path), record.path) : sourcePath(record.path);
      if (names.has(normalized.toLowerCase())) fail('INVALID_MANIFEST', 'Rutas de archivo repetidas.');
      names.add(normalized.toLowerCase());
      if (!Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > LIMITS.fileBytes || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256) || extra && record.component !== artifactComponent(record.path)) fail('INVALID_MANIFEST', 'Tamaño, componente o hash no válido.');
      if (extra && (value.layout === 'dist' && record.component !== 'frontend' || value.layout === 'runtime' && record.component === 'frontend' && !record.path.startsWith('dist/'))) fail('AMBIGUOUS_LAYOUT', 'No se mezclan rutas de dos formatos de artefacto.');
      total += record.bytes;
    }
    if (total > LIMITS.totalBytes) fail('TOTAL_LIMIT', 'El conjunto supera el límite de lectura.');
  }
  const index = value.layout === 'runtime' ? 'dist/index.html' : 'index.html';
  if (!value.files.some(file => file.path === index && file.bytes > 0) || value.files.some(file => file.path === (value.layout === 'runtime' ? 'index.html' : 'dist/index.html')) || value.layout === 'runtime' && !value.files.some(file => ['server.mjs', 'team.mjs'].includes(file.path))) fail('INCOMPLETE_MANIFEST', 'Falta un índice o servidor del formato declarado.');
  return value;
}

export function createManifest({ artifactRoot, sourceRoot, sourcePaths = [] }) {
  const root = canonicalRoot(artifactRoot), names = discover(root);
  if (names.includes('index.html') && names.includes('dist/index.html')) fail('AMBIGUOUS_LAYOUT', 'No se mezclan dos índices en un artefacto.');
  const layout = names.includes('dist/index.html') ? 'runtime' : 'dist';
  const files = [], sources = [];
  let total = 0;
  for (const name of names) {
    const bytes = readStable(root, name);
    total += bytes.length;
    if (total > LIMITS.totalBytes) fail('TOTAL_LIMIT', 'El artefacto supera el límite de lectura.');
    files.push({ path: name, component: artifactComponent(name), bytes: bytes.length, sha256: sha256(bytes) });
  }
  if (!Array.isArray(sourcePaths) || sourcePaths.length > LIMITS.files || new Set(sourcePaths.map(p => sourcePath(p).toLowerCase())).size !== sourcePaths.length) fail('INVALID_SOURCES', 'Fuentes explícitas inválidas o duplicadas.');
  const source = sourcePaths.length ? canonicalRoot(sourceRoot) : null;
  for (const name of [...sourcePaths].sort()) {
    const bytes = readStable(source, name);
    total += bytes.length;
    if (total > LIMITS.totalBytes) fail('TOTAL_LIMIT', 'Las fuentes superan el límite de lectura.');
    sources.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = validateManifest({ format: 1, algorithm: 'sha256', complete: true, layout, files, sources });
  // Reject edits between the first and last reads, not just changes within one read.
  for (const [folder, records] of [[root, files], [source, sources]]) for (const record of records) {
    if (sha256(readStable(folder, record.path)) !== record.sha256) fail('UNSTABLE_SNAPSHOT', 'El conjunto cambió durante la preparación.');
  }
  if (JSON.stringify(names) !== JSON.stringify(discover(root))) fail('UNSTABLE_SNAPSHOT', 'La lista de activos cambió durante la preparación.');
  checkEntries(manifest, readStable(root, layout === 'runtime' ? 'dist/index.html' : 'index.html', 256 * 1024).toString('utf8'));
  return manifest;
}

/** The board is a coordination record, not authentication or approval by this tool. */
export function sourceCoordination(relative, hash, board) {
  if (!board) return { state: 'not_checked', tasks: [] };
  if (board.format !== 1 || !Array.isArray(board.tasks) || board.tasks.length > 5000) fail('INVALID_BOARD', 'Registro de coordinación no válido.');
  if (board.tasks.some(task => !task || typeof task !== 'object' || !Array.isArray(task.files))) fail('INVALID_BOARD', 'Registro de tareas incompleto.');
  const tasks = board.tasks.filter(task => Array.isArray(task.files) && task.files.some(file => typeof file === 'string' && file.toLowerCase() === relative.toLowerCase()));
  if (tasks.some(task => typeof task.id !== 'string' || !/^[A-Z0-9-]{1,60}$/.test(task.id) || !['ready', 'working', 'review', 'blocked', 'done'].includes(task.status))) fail('INVALID_BOARD', 'Tarea de coordinación no válida.');
  const reserved = tasks.filter(task => task.reserved);
  if (reserved.length) return { state: 'reserved', tasks: reserved.map(task => ({ id: task.id, status: task.status })) };
  const done = tasks.filter(task => task.status === 'done').at(-1);
  if (!done) return { state: 'unrecorded', tasks: [] };
  const submitted = Object.entries(done.submitted ?? {}).find(([file]) => file.toLowerCase() === relative.toLowerCase())?.[1];
  return { state: submitted === hash ? 'last_done_hash_matches' : 'differs_from_last_done', tasks: [{ id: done.id, status: 'done' }] };
}

export function verifyManifest({ manifest: input, artifactRoot, sourceRoot, board }) {
  const manifest = validateManifest(input), root = canonicalRoot(artifactRoot);
  const source = sourceRoot ? canonicalRoot(sourceRoot) : null;
  let different = false;
  function compare(folder, records, includeCoordination) {
    return records.map(record => {
      try {
        const bytes = readStable(folder, record.path);
        const hash = sha256(bytes), state = bytes.length === record.bytes && hash === record.sha256 ? 'match' : 'changed';
        if (state !== 'match') different = true;
        return { path: record.path, ...(record.component ? { component: record.component } : {}), state, ...(includeCoordination ? { coordination: sourceCoordination(record.path, hash, board) } : {}) };
      } catch (error) {
        if (!(error instanceof ReleaseError)) throw error;
        different = true;
        return { path: record.path, ...(record.component ? { component: record.component } : {}), state: error.code === 'MISSING_FILE' ? 'missing' : 'unverifiable', code: error.code };
      }
    });
  }
  const files = compare(root, manifest.files, false);
  const sources = source ? compare(source, manifest.sources, true) : 'not_checked';
  const index = manifest.layout === 'runtime' ? 'dist/index.html' : 'index.html';
  if (files.find(file => file.path === index)?.state === 'match') checkEntries(manifest, readStable(root, index, 256 * 1024).toString('utf8'));
  for (const [folder, records, results] of [[root, manifest.files, files], ...(source ? [[source, manifest.sources, sources]] : [])]) for (const record of records) {
    const result = results.find(item => item.path === record.path);
    if (result.state !== 'match') continue;
    try {
      if (sha256(readStable(folder, record.path)) !== record.sha256) { result.state = 'unverifiable'; result.code = 'UNSTABLE_SNAPSHOT'; different = true; }
    } catch (error) {
      result.state = 'unverifiable'; result.code = error instanceof ReleaseError ? error.code : 'READ_FAILED'; different = true;
    }
  }
  return { status: different ? 'different' : 'match', files, sources, review: 'not_approved_by_this_tool' };
}
