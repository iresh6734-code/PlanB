import assert from 'node:assert/strict';
import test from 'node:test';

type CssUnused = {
  report(): Array<{ file: string; dead: Array<{ selector: string; missing: string[] }> }>;
  overriddenReport(): Array<{ sheet: string; selector: string; prop: string }>;
  decisiveClasses(selector: string): string[];
  makeIsUsed(corpus: string): (cls: string) => boolean;
  dedupe(sheets: Array<{ name: string; css: string }>): Array<{ name: string; css: string; removed: number }>;
};
// Ruta en variable para que tsc no intente tipar el .mjs.
const toolPath: string = '../tools/css-unused.mjs';
const load = async () => await import(toolPath) as CssUnused;

// K1 · Una sola hoja de estilos real: ni selectores cuyas clases no usa nadie, ni declaraciones que otra posterior pisa siempre.
test('ninguna hoja de src/ tiene selectores con clases que el código no usa', async () => {
  const { report } = await load();
  const dead = report().map(entry => entry.file + ': ' + entry.dead.slice(0, 3).map(item => item.selector + ' (' + item.missing.join(', ') + ')').join(' · '));
  assert.deepEqual(dead, [], 'Selectores muertos: node tools/css-unused.mjs --write los poda');
});

test('ninguna declaración queda pisada siempre por otra del mismo selector', async () => {
  const { overriddenReport } = await load();
  const doomed = overriddenReport().slice(0, 8).map(item => item.sheet + ' · ' + item.selector + ' { ' + item.prop + ' }');
  assert.deepEqual(doomed, [], 'Declaraciones pisadas: node tools/css-unused.mjs --dedupe --write las quita');
});

test('el detector respeta clases compuestas y lo que hay dentro de :not() o :is()', async () => {
  const { decisiveClasses, makeIsUsed } = await load();
  assert.deepEqual(decisiveClasses('html body .a:not(.b) > .c:is(.d, .e)::before'), ['a', 'c']);
  assert.deepEqual(decisiveClasses('[class~="x"] .f'), ['f']);
  const isUsed = makeIsUsed("className={'tone-' + tone} `${base}-on` className=\"card is-open\"");
  assert.equal(isUsed('tone-ok'), true);
  assert.equal(isUsed('pill-on'), true);
  assert.equal(isUsed('card'), true);
  assert.equal(isUsed('ghost'), false);
});

test('una declaración solo se quita si otra siempre gana: html body, o misma especificidad y más abajo', async () => {
  const { dedupe } = await load();
  const [early, late] = dedupe([
    { name: 'a.css', css: '.x{color:red;margin:0}.y{color:red}@media (max-width:600px){.z{color:red}}.w{height:100vh}' },
    { name: 'b.css', css: 'html body .x{color:blue}.y:hover{color:blue}.z{color:blue}.w{height:100dvh}.v{color:red!important}.v{color:blue}' },
  ]);
  assert.equal(early.css, '.x{margin:0}.y{color:red}.w{height:100vh}');
  assert.equal(early.removed, 2);
  assert.equal(late.removed, 0, 'ni !important pisado por uno normal ni valores que el navegador podría no entender');
});
