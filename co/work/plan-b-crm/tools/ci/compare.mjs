// Lógica pura de la CI local (CLAUDE-CI-LOCAL): leer la salida de node:test y compararla con los fallos conocidos.

const DURATION = /\s\((?:\d+(?:\.\d+)?)ms\)$/;
const normalizeFile = file => file.replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Lee la salida «spec» de node:test (la que imprime `node --test` / `tsx --test`).
 * - failures: de la sección final «✖ failing tests:», donde cada fallo va precedido de «test at <archivo>:<l>:<c>».
 * Las pasadas NO se leen de aquí: «spec» no dice de qué archivo es cada una. Salen del reportero estructurado
 * (resultsReporter / parseResults), que sí lo dice (CODEX-CI-R2-390).
 */
export function parseTestOutput(text) {
  const lines = text.split(/\r?\n/);
  const summary = {};
  for (const line of lines) {
    const m = /^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)$/.exec(line);
    if (m) summary[m[1]] = Number(m[2]);
  }
  const start = lines.findIndex(line => line.startsWith('✖ failing tests:'));
  const failures = [], seen = new Set();
  if (start >= 0) {
    let file = null;
    for (const line of lines.slice(start + 1)) {
      const at = /^test at (.+):\d+:\d+$/.exec(line);
      if (at) { file = normalizeFile(at[1]); continue; }
      if (!line.startsWith('✖ ')) continue;
      const name = line.slice(2).replace(DURATION, '');
      const key = (file ?? '') + '::' + name;
      // Cada fallo trae su propia línea «test at»: un fallo sin ella no hereda el archivo del anterior.
      const current = file; file = null;
      if (seen.has(key)) continue;
      seen.add(key);
      failures.push({ file: current, name });
    }
  }
  return { summary, failures };
}

/** Valida la lista de fallos conocidos: cada entrada necesita archivo, nombre exacto, causa y responsable. */
export function validateKnown(known) {
  if (!known || !Array.isArray(known.failures)) throw new Error('known-failures.json debe tener una lista «failures».');
  const keys = new Set();
  for (const [i, entry] of known.failures.entries()) {
    for (const field of ['file', 'name', 'cause', 'owner']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error('Fallo conocido nº ' + (i + 1) + ': falta «' + field + '».');
    }
    const key = normalizeFile(entry.file) + '::' + entry.name;
    if (keys.has(key)) throw new Error('Fallo conocido repetido: ' + key);
    keys.add(key);
  }
  return known.failures.map(entry => ({ ...entry, file: normalizeFile(entry.file), flaky: entry.flaky === true }));
}

/**
 * Compara los fallos observados con los conocidos (coincidencia exacta de archivo y nombre).
 * - unexpected: fallos que no están en la lista → la CI falla.
 * - expected: fallos conocidos que siguen fallando.
 * - resolved: conocidos estables que se ejecutaron y pasaron → la CI falla hasta retirarlos (si no, una
 *   regresión posterior pasaría inadvertida).
 * - flakyPassed: conocidos inestables que se ejecutaron y pasaron (informativo).
 * - noResult: conocidos que ni fallaron ni pasaron (omitidos, renombrados o retirados) → la CI falla: su
 *   ausencia en la lista de fallos no acredita nada (CODEX-CI-REVIEW-356).
 * La evidencia de «pasó» es la clave archivo::nombre en `passed`, leída del reportero estructurado (parseResults).
 * Un fallo sin archivo nunca coincide con un conocido.
 */
export function compareFailures(observed, knownEntries, passed) {
  if (!(passed instanceof Set)) throw new Error('compareFailures necesita el conjunto de pruebas que pasaron (archivo::nombre).');
  const key = f => (f.file ?? '') + '::' + f.name;
  const knownByKey = new Map(knownEntries.map(entry => [key(entry), entry]));
  const observedKeys = new Set(observed.map(key));
  const unexpected = observed.filter(f => !f.file || !knownByKey.has(key(f)));
  const expected = observed.filter(f => f.file && knownByKey.has(key(f))).map(f => ({ ...f, ...knownByKey.get(key(f)) }));
  const notFailing = knownEntries.filter(entry => !observedKeys.has(key(entry)));
  // Una pasada solo cuenta si es la de ESE archivo: un homónimo de otro archivo no acredita nada (CODEX-CI-R2-390).
  const ran = notFailing.filter(entry => passed.has(key(entry)));
  const noResult = notFailing.filter(entry => !passed.has(key(entry)));
  const resolved = ran.filter(entry => !entry.flaky);
  return {
    unexpected,
    expected,
    resolved,
    flakyPassed: ran.filter(entry => entry.flaky),
    noResult,
    ok: unexpected.length === 0 && resolved.length === 0 && noResult.length === 0,
  };
}

/**
 * Reportero estructurado de node:test (se carga con --test-reporter=<URL de este módulo>): una línea JSON por prueba
 * terminada, con su archivo y si se omitió o quedó pendiente. Conserva también el motivo de los eventos fallidos,
 * incluidos padres y cancelaciones que la sección final de «spec» no siempre enumera del mismo modo.
 */
export default async function* resultsReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data ?? {};
    const failureType = data.details?.error?.failureType;
    yield JSON.stringify({ status: event.type === 'test:pass' ? 'pass' : 'fail', name: data.name, file: data.file ?? null, skip: !!data.skip, todo: !!data.todo, nesting: data.nesting ?? 0,
      failureType: typeof failureType === 'string' ? failureType : null }) + '\n';
  }
}

/** Ruta de archivo de un evento (ruta o URL file:), relativa a la raíz del repositorio y con barras normales. */
export function eventFile(file, repoRoot) {
  let path = file.startsWith('file:') ? decodeURIComponent(new URL(file).pathname).replace(/^\/([A-Za-z]:)/, '$1') : file;
  path = normalizeFile(path);
  const root = normalizeFile(repoRoot).replace(/\/$/, '') + '/';
  return path.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length) : path;
}

/** Pasadas ejecutadas y eventos fallidos para diagnóstico. Estos últimos no sustituyen el resumen nativo ni la comparación con conocidos. */
export function parseResults(text, repoRoot) {
  const passed = new Set();
  const failedEvents = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.skip || event.todo || typeof event.name !== 'string') continue;
    if (event.status === 'pass' && typeof event.file === 'string') passed.add(eventFile(event.file, repoRoot) + '::' + event.name);
    else if (event.status === 'fail') failedEvents.push({ file: typeof event.file === 'string' ? eventFile(event.file, repoRoot) : null, name: event.name,
      nesting: Number.isSafeInteger(event.nesting) && event.nesting >= 0 ? event.nesting : null,
      failureType: typeof event.failureType === 'string' ? event.failureType : null });
  }
  return { passed, failedEvents };
}

