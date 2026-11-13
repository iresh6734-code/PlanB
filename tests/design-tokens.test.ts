import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// CLAUDE-UX-038: el sistema de diseño se verifica sobre los tokens reales de src/planb-ui.css, sin navegador.
const css = readFileSync(new URL('../src/planb-ui.css', import.meta.url), 'utf8');
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const tokens = new Map<string, string>();
for (const match of rootBlock.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
const colour = (name: string) => {
  const value = tokens.get(name);
  assert.ok(value && /^#[0-9a-f]{6}$/i.test(value), `--${name} debe ser un color #rrggbb (valor: ${value})`);
  return value;
};
const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('texto: cada nivel de texto cumple AA (4,5:1) sobre todas las superficies donde se usa', () => {
  for (const text of ['text-1', 'text-2', 'text-3'])
    for (const surface of ['bg-surface', 'bg-canvas', 'bg-subtle', 'bg-hover', 'bg-active'])
      assert.ok(contrast(colour(text), colour(surface)) >= 4.5, `--${text} sobre --${surface}: ${contrast(colour(text), colour(surface)).toFixed(2)}`);
});

test('barra lateral oscura: texto, apagado e icono activo cumplen AA sobre sus fondos', () => {
  for (const text of ['sb-text', 'sb-text-strong', 'sb-muted', 'sb-icon-active'])
    for (const surface of ['bg-sidebar', 'sb-hover', 'sb-active'])
      assert.ok(contrast(colour(text), colour(surface)) >= 4.5, `--${text} sobre --${surface}: ${contrast(colour(text), colour(surface)).toFixed(2)}`);
});

test('tonos de identificación: cada par texto/fondo de avatar y métrica cumple AA', () => {
  for (let tone = 0; tone <= 5; tone++)
    assert.ok(contrast(colour(`tone-${tone}`), colour(`tone-${tone}-bg`)) >= 4.5, `tono ${tone}: ${contrast(colour(`tone-${tone}`), colour(`tone-${tone}-bg`)).toFixed(2)}`);
  for (let tone = 0; tone <= 5; tone++)
    assert.ok(contrast(colour(`tone-${tone}`), colour('bg-surface')) >= 4.5, `tono ${tone} sobre blanco`);
});

test('acción: el azul primario y su texto cumplen AA en sus fondos', () => {
  for (const [fg, bg] of [['text-inverse', 'primary'], ['text-inverse', 'primary-hover'], ['text-inverse', 'primary-active'], ['primary-text', 'bg-surface'], ['primary-text', 'primary-subtle'], ['primary-text', 'bg-canvas'], ['primary', 'bg-active']] as const)
    assert.ok(contrast(colour(fg), colour(bg)) >= 4.5, `--${fg} sobre --${bg}: ${contrast(colour(fg), colour(bg)).toFixed(2)}`);
});

test('estado: éxito, aviso, error e información son legibles sobre su fondo', () => {
  for (const [fg, bg] of [['success', 'success-bg'], ['warning', 'warning-bg'], ['danger', 'danger-bg'], ['info', 'info-bg'], ['danger', 'bg-surface'], ['warning', 'bg-surface']] as const)
    assert.ok(contrast(colour(fg), colour(bg)) >= 4.5, `--${fg} sobre --${bg}: ${contrast(colour(fg), colour(bg)).toFixed(2)}`);
});

test('controles: el borde de campos tiene al menos 3:1 frente a la superficie (WCAG 1.4.11) y el foco se distingue', () => {
  assert.ok(contrast(colour('border-control'), colour('bg-surface')) >= 3, 'borde de control');
  assert.ok(contrast(colour('primary'), colour('bg-surface')) >= 3, 'anillo de foco sobre superficie');
  assert.ok(contrast(colour('primary'), colour('bg-canvas')) >= 3, 'anillo de foco sobre lienzo');
});

test('densidad: alturas de control y fila fijadas por tokens', () => {
  assert.equal(tokens.get('control-h'), '32px');
  assert.equal(tokens.get('control-h-sm'), '28px');
  assert.equal(tokens.get('row-h'), '44px');
  assert.match(css, /@media \(max-width: 600px\) \{ :root \{[^}]*--control-h: 40px/, 'en móvil los controles suben a 40 px');
  assert.equal(tokens.get('fs-h1'), '22px');
});

test('estilo: sin gradientes ni cristal esmerilado en la capa nueva', () => {
  assert.ok(!/gradient\(/.test(css), 'sin gradientes');
  assert.ok(!/backdrop-filter\s*:\s*(?!none)\S/.test(css), 'sin glassmorphism');
});

// 11/11/2026 · «Operaciones claras» (CLAUDE-OPUS-UI-OPERACIONES-CLARAS) va DESPUÉS de planb-ui.css: redefine sus tokens y debe ganar la cascada.
test('orden de carga: planb-ui.css, operaciones-claras.css y faro.css son las últimas hojas globales de main.tsx', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const imports = [...main.matchAll(/import '\.\/([a-z-]+\.css)'/g)].map(m => m[1]);
  assert.deepEqual(imports.slice(-3), ['planb-ui.css', 'operaciones-claras.css', 'faro.css']);
  const claras = readFileSync(new URL('../src/operaciones-claras.css', import.meta.url), 'utf8');
  const own = new Map([...(/:root\s*\{([\s\S]*?)\n\}/.exec(claras)?.[1] ?? '').matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  for (const text of ['text-1', 'text-2', 'text-3']) for (const surface of ['bg-surface', 'bg-canvas', 'bg-subtle'])
    assert.ok(contrast(own.get(text)!, own.get(surface)!) >= 4.5, 'operaciones-claras --' + text + ' sobre --' + surface);
  for (const [fg, bg] of [['danger', 'danger-bg'], ['warning', 'warning-bg'], ['success', 'success-bg'], ['oc-danger-fg', 'oc-danger-bg'], ['oc-warn-fg', 'oc-warn-bg'], ['oc-neutral-fg', 'oc-neutral-bg']])
    assert.ok(contrast(own.get(fg)!, own.get(bg)!) >= 4.5, 'operaciones-claras --' + fg + ' sobre --' + bg);
});

// Rediseño «Grafito» (11/11/2026): la capa final redefine los tokens; se verifican los valores EFECTIVOS (planb-ui + grafito).
test('grafito: la paleta efectiva cumple AA en texto, barra lateral, acción y estados, y fija la densidad de escritorio', () => {
  const grafito = readFileSync(new URL('../src/faro.css', import.meta.url), 'utf8');
  const eff = new Map(tokens);
  // La capa tiene varias secciones :root (Grafito y, después, Faro): gana la última, como en el navegador.
  for (const block of grafito.matchAll(/^:root\s*\{([\s\S]*?)\r?\n\}/gm)) for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) eff.set(m[1], m[2].trim());
  assert.equal(eff.get('primary'), '#0d6b63', 'se están comprobando los tokens de Faro');
  const c = (fg: string, bg: string) => contrast(eff.get(fg)!, eff.get(bg)!);
  for (const text of ['text-1', 'text-2', 'text-3']) for (const surface of ['bg-surface', 'bg-canvas', 'bg-subtle', 'bg-hover', 'bg-active']) assert.ok(c(text, surface) >= 4.5, text + ' sobre ' + surface + ': ' + c(text, surface).toFixed(2));
  for (const text of ['sb-text', 'sb-text-strong', 'sb-muted', 'sb-icon-active']) for (const surface of ['bg-sidebar', 'sb-hover', 'sb-active']) assert.ok(c(text, surface) >= 4.5, text + ' sobre ' + surface);
  for (const [fg, bg] of [['text-inverse', 'primary'], ['text-inverse', 'primary-hover'], ['primary-text', 'bg-surface'], ['primary-text', 'bg-canvas'], ['primary-text', 'primary-subtle'], ['success', 'success-bg'], ['warning', 'warning-bg'], ['danger', 'danger-bg'], ['info', 'info-bg'], ['tone-0', 'tone-0-bg']]) assert.ok(c(fg, bg) >= 4.5, fg + ' sobre ' + bg + ': ' + c(fg, bg).toFixed(2));
  assert.ok(c('border-control', 'bg-surface') >= 3, 'borde de control');
  assert.equal(eff.get('control-h'), '30px'); assert.equal(eff.get('row-h'), '36px'); assert.equal(eff.get('fs-h1'), '23px');
  assert.match(grafito, /@media \(max-width: 600px\) \{ :root \{[^}]*--control-h: 40px/, 'en móvil los controles suben a 40 px');
});
