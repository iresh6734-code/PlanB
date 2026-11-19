import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReleaseError, LIMITS, sha256, canonicalRoot, readStable, createManifest, validateManifest, verifyManifest, entryAssetPaths } from './workspace-manifest.mjs';

export const SERVICES = Object.freeze({
  crm: Object.freeze({ origin: 'http://127.0.0.1:4331', health: '/api/health', index: '/' }),
  pilot: Object.freeze({ origin: 'http://localhost:4334', health: '/api/team/health', index: '/team' }),
});
const fail = (code, message) => { throw new ReleaseError(code, message); };
const cancel = body => { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Best effort; never wait on cancellation. */ } };

async function limitedGet(url, { fetcher, timeoutMs, maxBytes }) {
  const controller = new AbortController();
  let reader, timer, response;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ReleaseError('HTTP_TIMEOUT', 'La lectura pública agotó el plazo.'));
      controller.abort();
      cancel(reader ?? response?.body);
    }, timeoutMs);
  });
  const work = (async () => {
    response = await fetcher(url, { method: 'GET', redirect: 'error', credentials: 'omit', headers: { Accept: '*/*' }, signal: controller.signal });
    if (controller.signal.aborted) { cancel(response?.body); fail('HTTP_TIMEOUT', 'La lectura pública agotó el plazo.'); }
    if (!response || response.redirected || response.url && response.url !== url) { cancel(response?.body); fail('HTTP_REDIRECT', 'No se admiten redirecciones de las lecturas públicas.'); }
    if (response.status !== 200) { cancel(response.body); fail('HTTP_STATUS', 'El servicio no devolvió el recurso público esperado.'); }
    const length = response.headers?.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { cancel(response.body); fail('HTTP_BODY_LIMIT', 'La respuesta pública supera el límite.'); }
    if (!response.body?.getReader) fail('HTTP_BODY_INVALID', 'La respuesta no tiene un cuerpo legible.');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (controller.signal.aborted) fail('HTTP_TIMEOUT', 'La lectura pública agotó el plazo.');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { cancel(reader); fail('HTTP_BODY_LIMIT', 'La respuesta pública supera el límite.'); }
      chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks, size);
  })();
  try { return await Promise.race([work, timeout]); }
  catch (error) {
    controller.abort(); cancel(reader ?? response?.body);
    if (error instanceof ReleaseError) throw error;
    fail('HTTP_UNAVAILABLE', 'No se pudo comprobar el recurso público local.');
  } finally { clearTimeout(timer); try { reader?.releaseLock(); } catch { /* An ignored abort may leave a read pending. */ } }
}

/** Reads only public GETs at the two fixed loopback services. Never attests backend code via health. */
export async function inspectServed({ manifest: input, service, fetcher = globalThis.fetch, timeoutMs = 3000, overallTimeoutMs = 15000 }) {
  const manifest = validateManifest(input);
  if (!Object.hasOwn(SERVICES, service)) fail('INVALID_SERVICE', 'Selecciona crm o pilot; no se admiten URL arbitrarias.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) fail('INVALID_TIMEOUT', 'El plazo debe estar entre 1 y 5000 ms.');
  if (!Number.isInteger(overallTimeoutMs) || overallTimeoutMs < 1 || overallTimeoutMs > 15000) fail('INVALID_TIMEOUT', 'El plazo total debe estar entre 1 y 15000 ms.');
  const deadline = performance.now() + overallTimeoutMs;
  const remaining = () => {
    const ms = Math.ceil(deadline - performance.now());
    if (ms <= 0) fail('HTTP_TOTAL_TIMEOUT', 'La comprobación pública agotó el plazo total.');
    return Math.min(timeoutMs, ms);
  };
  const target = SERVICES[service], prefix = manifest.layout === 'runtime' ? 'dist/' : '';
  const expected = manifest.files.filter(file => file.component === 'frontend');
  if (expected.length > 126) fail('HTTP_REQUEST_LIMIT', 'Demasiados activos para una comprobación HTTP acotada.');
  const report = { service, status: 'unavailable', health: { state: 'not_checked' }, frontend: [], backend: 'not_verified_by_http', review: 'not_approved_by_this_tool' };
  let health;
  try { health = JSON.parse((await limitedGet(target.origin + target.health, { fetcher, timeoutMs: remaining(), maxBytes: 16 * 1024 })).toString('utf8')); }
  catch (error) { report.health = { state: 'unavailable', code: error instanceof ReleaseError ? error.code : 'INVALID_HEALTH' }; return report; }
  const version = typeof health?.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(health.version) && health.version.length <= 40 ? health.version : null;
  const kind = health?.ok === true && version && (service === 'pilot' ? health.mode === 'local-pilot' : !health.mode && typeof health.instanceId === 'string' && /^[a-f\d-]{36}$/i.test(health.instanceId));
  if (!kind) { report.status = 'different'; report.health = { state: 'wrong_service' }; return report; }
  report.health = { state: 'reachable', version };
  let different = false, total = 0;
  // Index first: a new chunk left on disk is not evidence that the current page selects it.
  const ordered = [...expected].sort((a, b) => Number(b.path === prefix + 'index.html') - Number(a.path === prefix + 'index.html') || a.path.localeCompare(b.path));
  for (const file of ordered) {
    const relative = file.path.slice(prefix.length);
    const requestPath = relative === 'index.html' ? target.index : '/' + relative;
    try {
      const bytes = await limitedGet(target.origin + requestPath, { fetcher, timeoutMs: remaining(), maxBytes: Math.min(relative === 'index.html' ? 256 * 1024 : LIMITS.fileBytes, LIMITS.totalBytes - total) });
      total += bytes.length;
      const state = bytes.length === file.bytes && sha256(bytes) === file.sha256 ? 'match' : 'changed';
      if (state !== 'match') different = true;
      if (relative === 'index.html') {
        const names = new Set(expected.map(record => record.path));
        const refs = entryAssetPaths(bytes.toString('utf8'), prefix);
        if (refs.some(ref => !names.has(ref))) { different = true; report.entrypoints = 'different_from_candidate'; }
      }
      report.frontend.push({ path: file.path, state });
    } catch (error) {
      different = true;
      report.frontend.push({ path: file.path, state: 'unverifiable', code: error instanceof ReleaseError ? error.code : 'HTTP_UNAVAILABLE' });
      // Do not continue downloading after unbounded/malformed responses or a timeout.
      if (!(error instanceof ReleaseError) || error.code !== 'HTTP_STATUS') break;
    }
  }
  if (!different) {
    try {
      const index = expected.find(file => file.path === prefix + 'index.html');
      const bytes = await limitedGet(target.origin + target.index, { fetcher, timeoutMs: remaining(), maxBytes: Math.min(256 * 1024, LIMITS.totalBytes - total) });
      if (bytes.length !== index.bytes || sha256(bytes) !== index.sha256) { different = true; report.entrypoints = 'changed_during_check'; }
    } catch (error) {
      different = true;
      report.indexRecheck = { state: 'unverifiable', code: error instanceof ReleaseError ? error.code : 'HTTP_UNAVAILABLE' };
    }
  }
  report.status = different ? 'different' : 'match';
  return report;
}

export function readManifest(file) {
  if (typeof file !== 'string' || !/(?:^manifest|[.-]manifest)(?:-[A-Za-z0-9.-]+)?\.json$/i.test(path.basename(file))) fail('INVALID_MANIFEST_FILE', 'Selecciona un archivo manifest.json o con sufijo -manifest.json.');
  const root = canonicalRoot(path.dirname(path.resolve(file)));
  try { return validateManifest(JSON.parse(readStable(root, path.basename(file), LIMITS.metadataBytes).toString('utf8'))); }
  catch (error) { if (error instanceof ReleaseError) throw error; fail('INVALID_MANIFEST', 'No se pudo interpretar el manifiesto.'); }
}

function readBoard(sourceRoot) {
  try { return JSON.parse(readStable(canonicalRoot(sourceRoot), 'coordination/board.json', LIMITS.metadataBytes).toString('utf8')); }
  catch (error) { if (error instanceof ReleaseError && error.code === 'MISSING_FILE') return null; fail('INVALID_BOARD', 'No se pudo interpretar el registro de coordinación.'); }
}

export const HELP = `Uso (solo lectura; no despliega ni reinicia):
  node tools/releases/workspace-preflight.mjs create --artifact-root RUTA [--source-root RUTA --source src/archivo.tsx ...]
  node tools/releases/workspace-preflight.mjs verify --manifest RUTA/manifest.json --artifact-root RUTA [--source-root RUTA]
  node tools/releases/workspace-preflight.mjs http --manifest RUTA/manifest.json --service crm|pilot
Sin comando se muestra esta ayuda y no se realiza red. create imprime JSON por stdout.
verify coteja archivos seleccionados e informa las reservas del tablón si se proporciona source-root.
http es explícito: solo GET públicos en CRM4331 o piloto localhost4334; health no verifica el código backend.
Un hash o estado done del tablón no constituye una aprobación de publicación por esta herramienta.`;

export async function main(argv, { output = console.log, fetcher = globalThis.fetch } = {}) {
  try {
    const [command, ...args] = argv;
    if (!command || command === '--help') { output(HELP); return 0; }
    const allowed = command === 'create' ? ['--artifact-root', '--source-root', '--source'] : command === 'verify' ? ['--manifest', '--artifact-root', '--source-root'] : command === 'http' ? ['--manifest', '--service'] : null;
    if (!allowed) fail('INVALID_COMMAND', 'Comando no admitido.');
    const flags = new Map(), sources = [];
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i], value = args[i + 1];
      if (!allowed.includes(key) || !value || value.startsWith('--') || key !== '--source' && flags.has(key)) fail('INVALID_ARGUMENTS', 'Argumentos ausentes, repetidos o no admitidos.');
      if (key === '--source') sources.push(value); else flags.set(key, value);
    }
    let result;
    if (command === 'create') {
      if (sources.length && !flags.has('--source-root')) fail('INVALID_ARGUMENTS', 'Las fuentes necesitan source-root explícito.');
      result = createManifest({ artifactRoot: flags.get('--artifact-root'), sourceRoot: flags.get('--source-root'), sourcePaths: sources });
    } else {
      const manifest = readManifest(flags.get('--manifest'));
      result = command === 'verify'
        ? verifyManifest({ manifest, artifactRoot: flags.get('--artifact-root'), sourceRoot: flags.get('--source-root'), board: flags.has('--source-root') ? readBoard(flags.get('--source-root')) : null })
        : await inspectServed({ manifest, service: flags.get('--service'), fetcher });
    }
    output(JSON.stringify(result, null, 2));
    return result.status === 'different' ? 2 : result.status === 'unavailable' ? 3 : 0;
  } catch (error) {
    const safe = error instanceof ReleaseError ? { code: error.code, message: error.message } : { code: 'CHECK_FAILED', message: 'No se pudo completar la comprobación.' };
    output(JSON.stringify({ error: safe }));
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
