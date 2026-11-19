import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// K6 · Guardia de color en toda la app (amplía la de A1 en team-dark-mode). Sin navegador: se leen los .css y .tsx de src/
// y se cuentan los colores escritos a mano. Las definiciones de tokens (`--x: #hex`) y los valores de reserva de var() no cuentan.
// Los literales que ya existían están en color-guard-baseline.json: esa lista solo puede encoger.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const BASELINE = new URL('./color-guard-baseline.json', import.meta.url);

export function literalColours(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<=^|[\s{;'"`])--[a-z0-9-]+\s*:[^;{}]*(;|(?=}))/gim, '')
    .replace(/var\(--[a-z0-9-]+\s*,[^()]*(\([^()]*\))?[^()]*\)/gi, 'var()')
    .match(/#[0-9a-f]{3,8}\b(?![-\w])|rgba?\(\s*\d[^)]*\)|hsla?\(\s*\d[^)]*\)/gi) ?? [];
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(css|tsx)$/.test(entry.name) ? [path] : [];
  });
}
export function colourCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of sources(SRC).sort()) {
    const found = literalColours(readFileSync(file, 'utf8')).length;
    if (found) counts[relative(SRC, file).split(sep).join('/')] = found;
  }
  return counts;
}

test('ningún archivo de src/ añade colores fijos: solo tokens, y la lista de los antiguos solo encoge', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, number>;
  const counts = colourCounts();
  const grew = Object.entries(counts).filter(([file, count]) => count > (baseline[file] ?? 0)).map(([file, count]) => file + ': ' + count + ' (antes ' + (baseline[file] ?? 0) + ')');
  assert.deepEqual(grew, [], 'Colores fijos nuevos: usa los tokens de faro.css (cambian solos en modo oscuro)');
  const shrank = Object.entries(baseline).filter(([file, count]) => (counts[file] ?? 0) < count).map(([file, count]) => file + ': ' + (counts[file] ?? 0) + ' (lista ' + count + ')');
  assert.deepEqual(shrank, [], 'Hay menos colores fijos que en la lista: bájala en tests/color-guard-baseline.json para que no vuelvan');
});

test('el detector cuenta literales, pero no definiciones de tokens ni reservas de var()', () => {
  assert.deepEqual(literalColours(':root{--ink:#123456;--shade: rgba(0,0,0,.2)}a{color:var(--muted,#52627a);background:#fff;box-shadow:0 1px rgba(0,0,0,.2)}'), ['#fff', 'rgba(0,0,0,.2)']);
  assert.deepEqual(literalColours("<a href=\"#main\" style={{ color: '#c0ffee' }} />"), ['#c0ffee']);
  assert.deepEqual(literalColours('/* #abcdef */ .x { color: hsl(10 20% 30%); } a[href="#add-task"]{}'), ['hsl(10 20% 30%)']);
});
