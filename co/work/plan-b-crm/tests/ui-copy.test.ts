// CLAUDE-UI-COPY-D2 · Los términos retirados (docs/voz.md) no vuelven a los textos visibles de la interfaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Textos visibles: contenido entre etiquetas JSX y cadenas literales en sus tres formas (comillas simples, dobles y
 * plantillas, de estas solo las partes fijas). Las comillas dobles cubren también los atributos JSX como
 * aria-label="…", title="…" o placeholder="…" (R2, revisión 401 de Codex: antes solo se miraban las simples).
 * No cuentan rutas ni identificadores sueltos (nombres de clase, claves, IDs).
 */
export function visibleTexts(source: string): string[] {
  const out: string[] = [];
  const keep = (text: string) => { if (text.trim().length >= 3 && !/^(\.|\/|[\w-]+$)/.test(text.trim())) out.push(text); };
  for (const m of source.matchAll(/>([^<>{}]+)</g)) out.push(m[1]);
  for (const m of source.matchAll(/'([^'\n]*)'/g)) keep(m[1]);
  for (const m of source.matchAll(/"([^"\n]*)"/g)) keep(m[1]);
  for (const m of source.matchAll(/`([^`]*)`/g)) for (const part of m[1].split(/\$\{[^}]*\}/)) keep(part);
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

test('R2 · el detector ve las tres formas que antes se le escapaban y sigue ignorando rutas e identificadores', () => {
  const retired = (source: string) => visibleTexts(source).some(text => RETIRED.some(([pattern]) => pattern.test(text)));
  // Los seis controles de la revisión 401.
  assert.equal(retired('<p>Datos de prueba</p>'), false, 'texto con el término actual');
  assert.equal(retired('<p>Ensayo · ficción</p>'), true, 'texto directo');
  assert.equal(retired("<p>{'Ensayo · ficción'}</p>"), true, 'literal entre comillas simples');
  assert.equal(retired('<p>{"Ensayo · ficción"}</p>'), true, 'literal entre comillas dobles');
  assert.equal(retired('<p>{`Ensayo · ficción de ${nombre}`}</p>'), true, 'literal de plantilla');
  assert.equal(retired('<button aria-label="Abrir la ficción">x</button>'), true, 'nombre accesible');
  // Y lo que no debe contar.
  assert.deepEqual(visibleTexts('import y from "../ficcion.js"; const k = "gx-ficcion"; const t = `${a}`;'), [], 'rutas, clases y plantillas sin texto');
});
