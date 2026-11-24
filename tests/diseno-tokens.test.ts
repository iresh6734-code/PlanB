// Plan B · plan de diseño «una sola app», corte 1: un solo sistema de diseño. Los colores viven en src/design/tokens.css y
// las demás hojas que ya han pasado al sistema común solo usan tokens. La lista crece con cada sección que se pasa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATED = ['src/design/base.css', 'src/design/components.css', 'src/verifica/verifica.css'];
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
