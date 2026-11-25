// Plan B · plan de diseño «una sola app», corte 1: un solo sistema de diseño. Los colores viven en src/design/tokens.css y
// las demás hojas que ya han pasado al sistema común solo usan tokens. La lista crece con cada sección que se pasa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATED = ['src/design/base.css', 'src/design/components.css', 'src/verifica/verifica.css', 'src/design-system.css'];
const SEMANTIC_LAYER = ['src/faro.css'];

test('Diseño · la capa de variables de faro.css solo usa tokens --pb-* (sin hex propios)', () => {
  const css = readFileSync('src/faro.css', 'utf8');
  const blocks = [...css.matchAll(/^(:root|html\[data-theme="dark"\]) \{([\s\S]*?)^\}/gm)];
  assert.ok(blocks.length >= 2, 'faltan bloques de variables en faro.css');
  const SEMANTIC = /--(bg-|text-|border|rule|primary|success|warning|danger|info|sb-|tone-|font-(sans|display))/;
  for (const [, selector, body] of blocks) {
    const loose = body.split(/\r?\n/).filter(line => /^\s*--/.test(line) && SEMANTIC.test(line) && LOOSE_COLOR.test(line) && !/var\(--pb-/.test(line));
    assert.deepEqual(loose.map(l => l.trim()), [], 'el bloque ' + selector + ' escribe colores fuera de los tokens');
  }
  for (const name of ['--text-1', '--border', '--primary', '--font-display', '--bg-canvas']) {
    assert.ok(css.includes(name + ': var(--pb-'), name + ' no apunta a los tokens comunes');
  }
});
const LOOSE_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

test('Diseño · las hojas pasadas al sistema común no escriben colores sueltos: solo tokens', () => {
  for (const file of MIGRATED) {
    const loose = readFileSync(file, 'utf8').split(/\r?\n/).map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => !line.trim().startsWith('/*') && !line.trim().startsWith('*') && LOOSE_COLOR.test(line));
    assert.deepEqual(loose, [], file + ' tiene colores fuera de los tokens');
  }
});

test('Diseño · los tokens tienen valor claro y oscuro, y nadie usa ya los de Verifica (--vf-)', () => {
  const tokens = readFileSync('src/design/tokens.css', 'utf8');
  const [light, dark] = tokens.split(/\r?\nhtml\[data-theme="dark"\] \{/);
  const names = (block: string) => new Set([...block.matchAll(/(--pb-[\w-]+)\s*:/g)].map(m => m[1]));
  const colors = [...names(light)].filter(name => /#[0-9a-f]{6}/i.test(light.slice(light.indexOf(name + ':'), light.indexOf(';', light.indexOf(name + ':')))));
  assert.ok(colors.length > 20, 'hay tokens de color');
  for (const name of colors) assert.ok(names(dark).has(name), name + ' no tiene valor oscuro');
  for (const file of MIGRATED) assert.ok(!readFileSync(file, 'utf8').includes('--vf-'), file + ' usa tokens antiguos');
});
