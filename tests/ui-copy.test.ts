// CLAUDE-UI-COPY-D2 · Los términos retirados (docs/voz.md) no vuelven a los textos visibles de la interfaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Textos visibles: contenido entre etiquetas JSX y cadenas literales, sin nombres de clase, rutas ni identificadores. */
function visibleTexts(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  for (const m of source.matchAll(/'([^'\n]{3,})'/g)) if (!/^(\.|\/|[\w-]+$)/.test(m[1]) && !/className|aria-|data-/.test(m[1])) out.push(m[1]);
  return out;
}
const files = fs.readdirSync('src', { recursive: true }).map(String).filter(f => f.endsWith('.tsx')).map(f => path.join('src', f));
const RETIRED: [RegExp, string][] = [[/\bficción\b/i, 'datos de prueba'], [/\bsin demostrar\b/i, 'sin comprobar'], [/\bDatos de ensayo\b/, 'Datos de prueba'], [/Local · Ensayo/, 'Datos de prueba']];

test('ningún texto visible usa los términos retirados del glosario', () => {
  const found: string[] = [];
  for (const file of files) for (const text of visibleTexts(fs.readFileSync(file, 'utf8'))) for (const [pattern, use] of RETIRED) {
    if (pattern.test(text)) found.push(file + ': «' + text.trim().slice(0, 70) + '» → usar «' + use + '»');
  }
  assert.deepEqual(found, []);
});

test('el detector ve los textos que debe ver', () => {
  assert.deepEqual(visibleTexts("<p>Ensayo · ficción</p>"), ['Ensayo · ficción']);
  assert.ok(visibleTexts("const a = 'Sin demostrar';").includes('Sin demostrar'));
  assert.deepEqual(visibleTexts("import x from './ficcion.js'; const c = 'gx-badge';"), [], 'rutas e identificadores no cuentan');
});
