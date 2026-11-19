// CLAUDE-TEAM-AUDIT-R · Lógica pura de la segunda ronda (modo oscuro y ventanas): gravedad, agrupación por tema y recuento.
// Las comprobaciones de teclado de las ventanas se prueban con `node tools/team-audit/run-r.mjs --self-test` (abre Chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { DIALOG_KINDS, aggregateR, severityR, tallyR } from '../tools/team-audit/dialogs.mjs';
// @ts-expect-error módulo JavaScript de herramientas sin declaraciones de tipos
import { SECTIONS, THEMES, WIDTHS } from '../tools/team-audit/run-r.mjs';

test('todo fallo de ventana es grave; el resto conserva la gravedad de la primera ronda', () => {
  assert.deepEqual(DIALOG_KINDS, ['dialog-open', 'dialog-name', 'dialog-modal', 'dialog-initial-focus', 'dialog-trap', 'dialog-focus-visible', 'dialog-escape', 'dialog-return']);
  for (const kind of DIALOG_KINDS) assert.equal(severityR({ kind }), 'grave', kind);
  assert.equal(severityR({ kind: 'contrast', ratio: 3.6 }), 'media');
  assert.equal(severityR({ kind: 'contrast', ratio: 2.1 }), 'grave');
  assert.equal(severityR({ kind: 'target', width: 30, height: 30 }), 'leve');
  assert.equal(severityR({ kind: 'name' }), 'grave');
});

test('el mismo problema en claro y oscuro se agrupa una vez y recuerda en qué temas aparece', () => {
  const contrast = { kind: 'contrast', ratio: 3.2, element: 'select', detail: 'contraste 3.20 < 4.5 «Administración»', source: { file: 'src/design-system.css', selector: '.team-shell .history-list select', prop: 'color', value: '#354e6f' } };
  const results = [
    { theme: 'dark', section: 'Equipo', profile: 'Administración', width: 1366, findings: [contrast] },
    { theme: 'dark', section: 'Equipo', profile: 'Responsable comercial', width: 390, findings: [contrast] },
    { theme: 'light', section: 'Equipo', profile: 'Administración', width: 1366, findings: [] },
  ];
  const [group] = aggregateR(results);
  assert.equal(group.views, 2);
  assert.deepEqual(group.themes, ['dark']);
  assert.deepEqual(group.widths, [1366, 390]);
  assert.deepEqual(group.contexts, ['dark · Equipo · Administración · 1366', 'dark · Equipo · Responsable comercial · 390']);
  assert.equal(group.severity, 'media');
  assert.deepEqual(group.source, contrast.source);
});

test('los fallos de ventana se ordenan delante y el recuento separa tema y tipo', () => {
  const results = [
    { theme: 'light', section: 'Ventana · Nuevo espacio', profile: 'ensayo', width: 390, findings: [{ kind: 'dialog-return', element: 'button', detail: 'al cerrar, el foco no vuelve', source: null }] },
    { theme: 'dark', section: 'Contactos', profile: 'Comercial', width: 390, findings: [{ kind: 'target', width: 40, height: 30, element: 'a', detail: 'objetivo 40×30', source: null }, { kind: 'contrast', ratio: 3.5, element: 'p', detail: 'contraste 3.50', source: null }] },
    { theme: 'light', section: 'Contactos', profile: 'Comercial', width: 390, findings: [{ kind: 'contrast', ratio: 3.5, element: 'p', detail: 'contraste 3.50', source: null }] },
  ];
  const groups = aggregateR(results);
  assert.deepEqual(groups.map((g: { kind: string }) => g.kind), ['dialog-return', 'contrast', 'target']);
  assert.deepEqual(groups[1].themes, ['dark', 'light']);
  assert.deepEqual(tallyR(groups), { problems: 3, bySeverity: { grave: 1, media: 1, leve: 1 }, byKind: { 'dialog-return': 1, contrast: 1, target: 1 }, byTheme: { light: 2, dark: 2 } });
  assert.deepEqual(tallyR([]), { problems: 0, bySeverity: { grave: 0, media: 0, leve: 0 }, byKind: {}, byTheme: {} });
});

test('la segunda ronda cubre los dos temas, las tres anchuras y las 8 secciones', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.deepEqual(WIDTHS, [1366, 390, 320]);
  assert.deepEqual(SECTIONS, ['Empresa', 'Contactos', 'Trabajos', 'Dispositivos', 'Equipo', 'Integraciones', 'Agente', 'Comercial']);
});
