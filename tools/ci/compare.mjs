// Lógica pura de la CI local (CLAUDE-CI-LOCAL): leer la salida de node:test y compararla con los fallos conocidos.

const DURATION = /\s\((?:\d+(?:\.\d+)?)ms\)$/;
const normalizeFile = file => file.replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * Lee la salida «spec» de node:test (la que imprime `node --test` / `tsx --test`).
 * Usa la sección final «✖ failing tests:», donde cada fallo va precedido de «test at <archivo>:<línea>:<col>».
 * Devuelve el resumen numérico y la lista de fallos {file, name}, sin duplicados.
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
 * - resolved: fallos conocidos estables que ya pasan → la CI falla hasta retirarlos de la lista; si no, una
 *   regresión posterior de esa misma prueba pasaría inadvertida.
 * - flakyPassed: fallos conocidos marcados como inestables que esta vez pasaron (informativo).
 * Un fallo sin archivo (salida inesperada) nunca coincide con un conocido.
 */
export function compareFailures(observed, knownEntries) {
  const key = f => (f.file ?? '') + '::' + f.name;
  const knownByKey = new Map(knownEntries.map(entry => [key(entry), entry]));
  const observedKeys = new Set(observed.map(key));
  const unexpected = observed.filter(f => !f.file || !knownByKey.has(key(f)));
  const expected = observed.filter(f => f.file && knownByKey.has(key(f))).map(f => ({ ...f, ...knownByKey.get(key(f)) }));
  const notFailing = knownEntries.filter(entry => !observedKeys.has(key(entry)));
  return {
    unexpected,
    expected,
    resolved: notFailing.filter(entry => !entry.flaky),
    flakyPassed: notFailing.filter(entry => entry.flaky),
    ok: unexpected.length === 0 && notFailing.every(entry => entry.flaky),
  };
}
