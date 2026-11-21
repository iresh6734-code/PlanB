// CLAUDE-TEAM-AUDIT · Lógica pura de la auditoría del espacio de equipo: gravedad, agrupación, recuento y contraste.
// La medida dentro de la página se comprueba aparte con `node tools/team-audit/run.mjs --self-test` (abre Chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { SEVERITIES, aggregate, contrastRatio, findingKey, severityOf, tally } from '../tools/team-audit/checks.mjs';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { SECTIONS, WIDTHS } from '../tools/team-audit/run.mjs';

const source = { file: 'src/faro.css', selector: '.team-shell .nav-item', prop: 'min-height', value: '30px' };

test('la gravedad sigue el criterio del informe', () => {
  for (const kind of ['name', 'label', 'overflow', 'h1', 'focus', 'error', 'img-alt', 'offscreen']) assert.equal(severityOf({ kind }), 'grave', kind);
  assert.equal(severityOf({ kind: 'contrast', ratio: 2.99 }), 'grave');
  assert.equal(severityOf({ kind: 'contrast', ratio: 3 }), 'media');
  assert.equal(severityOf({ kind: 'contrast', ratio: 4.49 }), 'media');
  assert.equal(severityOf({ kind: 'target', width: 23, height: 60 }), 'media', 'por debajo de 24 px en un lado incumple AA');
  assert.equal(severityOf({ kind: 'target', width: 40, height: 30 }), 'leve', 'entre 24 y 44 px solo incumple la recomendación móvil');
  assert.deepEqual(SEVERITIES, ['grave', 'media', 'leve']);
});

test('el mismo problema en varias vistas se agrupa una vez, con todos sus contextos', () => {
  const target = { kind: 'target', width: 30, height: 30, min: 44, detail: 'objetivo 30×30 < 44 px «Empresa»', element: 'button.nav-item', source };
  const overflowA = { kind: 'overflow', detail: 'desplazamiento lateral: 400 px > 390 px (table)', element: 'table', source: null };
  const overflowB = { ...overflowA, detail: 'desplazamiento lateral: 410 px > 390 px (table)' };
  const results = [
    { section: 'Empresa', profile: 'Administración', width: 390, findings: [target, overflowA] },
    { section: 'Contactos', profile: 'Solo lectura', width: 320, findings: [target, overflowB] },
    { section: 'Equipo', profile: 'Administración', width: 1366, findings: [] },
  ];
  const groups = aggregate(results);
  assert.equal(groups.length, 2, 'el desplazamiento con distinta anchura cuenta como el mismo problema');
  assert.equal(groups[0].severity, 'grave');
  assert.equal(groups[0].kind, 'overflow');
  assert.deepEqual(groups[0].widths, [390, 320]);
  assert.equal(groups[1].views, 2);
  assert.deepEqual(groups[1].sections, ['Empresa', 'Contactos']);
  assert.deepEqual(groups[1].profiles, ['Administración', 'Solo lectura']);
  assert.deepEqual(groups[1].contexts, ['Empresa · Administración · 390', 'Contactos · Solo lectura · 320']);
  assert.deepEqual(groups[1].source, source);
});

test('el orden es por gravedad y después por número de vistas afectadas', () => {
  const finding = (kind: string, extra: object, element: string) => ({ kind, element, detail: kind + element, source: null, ...extra });
  const results = [
    { section: 'A', profile: 'P', width: 390, findings: [finding('target', { width: 30, height: 30 }, 'x'), finding('contrast', { ratio: 3.5 }, 'y'), finding('contrast', { ratio: 3.5 }, 'z')] },
    { section: 'B', profile: 'P', width: 390, findings: [finding('contrast', { ratio: 3.5 }, 'z'), finding('label', {}, 'w')] },
  ];
  const groups = aggregate(results);
  assert.deepEqual(groups.map((g: { severity: string; element: string }) => g.severity + ':' + g.element), ['grave:w', 'media:z', 'media:y', 'leve:x']);
  assert.deepEqual(tally(groups), { problems: 4, bySeverity: { grave: 1, media: 2, leve: 1 }, byKind: { label: 1, contrast: 2, target: 1 } });
});

test('un grupo toma la gravedad más alta de sus apariciones', () => {
  const base = { kind: 'target', element: 'button.x', detail: 'objetivo', source: null };
  const groups = aggregate([
    { section: 'A', profile: 'P', width: 390, findings: [{ ...base, width: 30, height: 30 }] },
    { section: 'B', profile: 'P', width: 390, findings: [{ ...base, width: 20, height: 30 }] },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, 'media');
});

test('la clave distingue elemento y regla de origen', () => {
  const a = { kind: 'contrast', element: 'span.a', detail: 'contraste 3.10 < 4.5 «x»', source };
  assert.notEqual(findingKey(a), findingKey({ ...a, element: 'span.b' }));
  assert.notEqual(findingKey(a), findingKey({ ...a, source: { ...source, selector: '.otra' } }));
  assert.equal(findingKey({ kind: 'h1', count: 0, element: 'main', detail: 'h1 en main: 0' }), findingKey({ kind: 'h1', count: 0, element: 'main', detail: 'otro texto' }));
});

test('la relación de contraste reproduce los valores de referencia de WCAG', () => {
  const black = { r: 0, g: 0, b: 0 }, white = { r: 255, g: 255, b: 255 };
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21);
  assert.equal(contrastRatio(white, white), 1);
  assert.equal(Math.round(contrastRatio({ r: 118, g: 118, b: 118 }, white) * 100) / 100, 4.54, '#767676 sobre blanco es el gris mínimo AA');
  assert.equal(contrastRatio(black, white), contrastRatio(white, black));
});

test('el recorrido cubre las 8 secciones y las tres anchuras pedidas', () => {
  assert.deepEqual(SECTIONS, ['Empresa', 'Contactos', 'Trabajos', 'Dispositivos', 'Equipo', 'Integraciones', 'Agente', 'Comercial']);
  assert.deepEqual(WIDTHS, [1366, 390, 320]);
});
