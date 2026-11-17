import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateContinuityScenario, type ContinuityLabInput } from '../shared/continuity-lab.js';
import {
  ContinuityLab, SIMULATION_BANNER, buildSyntheticCases, formatDuration, nextCaptureId, replaceSyntheticCapture, DEMO_EVALUATED_AT,
} from '../src/ContinuityLab.js';

// CLAUDE-LAB-036: pruebas del componente sobre el motor real (render de servidor, sin navegador ni red). El recorrido
// interactivo y el diseño responsive los cubre tests/e2e/continuity-lab.spec.ts.
const MINUTE = 60_000;
const cases = buildSyntheticCases();
const byId = (id: string) => structuredClone(cases.find(c => c.id === id)!.input);
const html = (input: ContinuityLabInput | null) => renderToStaticMarkup(createElement(ContinuityLab, { input, onInputChange() {}, cases, activeCaseId: null }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const status = (markup: string) => /data-state="result" data-status="([a-z-]+)"/.exec(markup)?.[1] ?? null;
const testid = (markup: string, id: string) => new RegExp('data-testid="' + id + '">([^<]*)<').exec(markup)?.[1] ?? null;

test('el banner de simulación aparece con resultado, sin datos y ante entradas rechazadas', () => {
  const broken = byId('crm-local'); broken.workload!.tasks[1].id = broken.workload!.tasks[0].id;
  for (const markup of [html(byId('crm-local')), html(null), html(broken)]) assert.ok(text(markup).includes(SIMULATION_BANNER));
  assert.equal(SIMULATION_BANNER, 'Simulación · datos ficticios · no ejecuta recuperación');
});

test('cada caso muestra exactamente el estado que devuelve el motor, y es el esperado', () => {
  const expected: Record<string, string> = { 'crm-local': 'ready', 'device-no-restore': 'unproven', 'device-restored': 'ready', 'old-capture': 'at-risk', 'drill-failed': 'blocked', 'no-evidence': 'unproven' };
  assert.deepEqual(cases.map(c => c.id), Object.keys(expected));
  for (const c of cases) {
    assert.equal(evaluateContinuityScenario(c.input).status, expected[c.id], c.id);
    assert.equal(status(html(structuredClone(c.input))), expected[c.id], c.id);
  }
});

test('pérdida del equipo sin restauración no está preparada, aunque el simulacro local haya salido bien', () => {
  const input = byId('device-no-restore');
  assert.equal(input.localDrill!.outcome, 'passed');
  const markup = html(input), plain = text(markup);
  assert.equal(status(markup), 'unproven');
  assert.notEqual(testid(markup, 'status-label'), 'Preparado según estas entradas');
  assert.match(markup, /data-scenario="device-loss"[^>]*>(?:(?!<\/div>).)*Sin comprobar/);
  assert.match(plain, /Por qué Restauración en otro equipo: Falta un ensayo vigente/);
  assert.match(plain, /Siguiente paso Ensayar restauración en otro equipo/);
  assert.equal(testid(markup, 'status-label'), 'Sin comprobar');
});

test('un dato ausente se muestra como no medido y nunca como cero', () => {
  const markup = html(byId('no-evidence')), plain = text(markup);
  assert.equal(status(markup), 'unproven');
  assert.equal((markup.match(/data-state="missing"/g) ?? []).length >= 3, true);
  assert.match(plain, /No medida: falta una captura verificada/);
  assert.match(plain, /No medido: no hay un ensayo correcto/);
  assert.ok(markup.includes('data-testid="exposure-missing"'));
  for (const id of ['overdue', 'during', 'undated', 'open']) assert.equal(testid(markup, id), null, id);
  assert.ok(!/>\s*0 min\s*</.test(markup), 'sin «0 min» inventado');
});

test('un cero medido sí se muestra como cero, distinto de la ausencia de dato', () => {
  const input = byId('crm-local'); input.localDrill!.completedAt = input.localDrill!.startedAt;
  const markup = html(input);
  assert.match(markup, /data-measure="recovery" data-state="measured"[^>]*><span class="clab-m-label">Tiempo de recuperación medido<\/span><span class="clab-m-value">0 min</);
  input.workload!.tasks = [];
  const empty = html(input);
  assert.equal(testid(empty, 'open'), '0');
  assert.ok(text(empty).includes('Aquí 0 es un dato declarado'));
});

test('cambiar la duración mueve las tareas en los límites exactos y el resultado sale del motor', () => {
  const input = byId('crm-local'), due = input.workload!.tasks[1].dueAt!;
  assert.equal(due - input.evaluatedAt, 60 * MINUTE);
  for (const [minutes, during] of [[59, '0'], [60, '1'], [61, '1']] as const) {
    input.outageDurationMs = minutes * MINUTE;
    const markup = html(input), engine = evaluateContinuityScenario(input);
    assert.equal(testid(markup, 'during'), during, minutes + ' min');
    assert.equal(String(engine.exposure!.tasksDueDuringOutage), during);
    assert.equal(testid(markup, 'overdue'), '1'); assert.equal(testid(markup, 'undated'), '1'); assert.equal(testid(markup, 'open'), '3');
  }
});

test('el detalle del motor se muestra con unidades legibles, no en milisegundos', () => {
  const plain = text(html(byId('crm-local')));
  assert.match(plain, /es 45 min; no mide cambios perdidos/);
  assert.match(plain, /Tiempo medido en el ensayo: 5 min/);
  assert.ok(!/\d{4,} ms/.test(plain), 'sin milisegundos crudos');
  assert.match(plain, /Objetivo: como máximo 1 h/);
  assert.match(plain, /Caída simulada 8 h/);
});

test('fuera de objetivo y bloqueado dan causa y siguiente paso concretos', () => {
  const old = text(html(byId('old-capture')));
  assert.match(old, /Fuera de objetivo/); assert.match(old, /Por qué Antigüedad de la captura/); assert.match(old, /Siguiente paso Obtener y verificar una captura más reciente/);
  assert.match(old, /Fuera del objetivo/);
  const failed = text(html(byId('drill-failed')));
  assert.match(failed, /Bloqueado/); assert.match(failed, /Por qué Simulacro local: El ensayo aplicable terminó con fallo/); assert.match(failed, /Siguiente paso Resolver el fallo y repetir el ensayo/);
});

test('la comparación indica qué pruebas añade el otro escenario', () => {
  const plain = text(html(byId('crm-local')));
  assert.match(plain, /Pasar a «Pérdida del equipo» añade estas pruebas pendientes: [^.]*Restauración en otro equipo/);
  assert.match(plain, /Seleccionado/);
  const restored = byId('device-restored'); restored.localDrill = null;
  const reverse = text(html(restored));
  assert.match(reverse, /Pasar a «Caída del CRM» añade estas pruebas pendientes: Simulacro local/);
});

test('editar la captura crea otra generación y deja sin validar la copia, los ensayos y las tareas', () => {
  const original = byId('device-restored');
  assert.equal(evaluateContinuityScenario(original).status, 'ready');
  const frozen = structuredClone(original);
  const edited = replaceSyntheticCapture(original, 40 * MINUTE);
  assert.deepEqual(original, frozen, 'no muta la entrada');
  assert.equal(edited.scope.captureId, 'demo-capture-r2'); assert.equal(edited.snapshot!.scope.captureId, 'demo-capture-r2');
  // Los registros anteriores conservan su identificador: no se reetiquetan.
  for (const record of [edited.backup!, edited.restoreDrill!, edited.localDrill!, edited.workload!]) assert.equal(record.scope.captureId, 'demo-capture');
  const result = evaluateContinuityScenario(edited);
  assert.equal(result.status, 'unproven'); assert.equal(result.measuredRecoveryMs, null); assert.equal(result.exposure, null);
  assert.equal(result.snapshotAgeMs, 40 * MINUTE);
  const markup = html(edited), plain = text(markup);
  assert.equal(status(markup), 'unproven');
  assert.match(plain, /Evidencia de otra captura, no cuenta: Copia \(demo-capture\), Simulacro local \(demo-capture\), Restauración en otro equipo \(demo-capture\), Inventario de tareas \(demo-capture\)/);
  assert.match(plain, /Descartar este registro/);
  for (const group of ['localDrill', 'restoreDrill']) {
    const block = markup.split('data-group="' + group + '"')[1].split('</fieldset>')[0];
    assert.ok(block.includes('Descartar este registro'), group); assert.ok(!block.includes('Resultado del ensayo'), group + ' no ofrece edición del registro ajeno');
  }
  assert.equal(nextCaptureId('demo-capture-r2'), 'demo-capture-r3'); assert.equal(nextCaptureId('x'), 'x-r2');
});

test('una entrada rechazada por el motor se ve como error accesible y no como resultado', () => {
  for (const [mutate, message] of [
    [(i: ContinuityLabInput) => { i.workload!.tasks[1].id = i.workload!.tasks[0].id; }, 'ID de tarea vacío o duplicado'],
    [(i: ContinuityLabInput) => { i.scenario = 'otro' as never; }, 'Escenario inválido'],
    [(i: ContinuityLabInput) => { i.scope.spaceId = ' '; }, 'espacio, fuente y captura explícitos'],
  ] as const) {
    const input = byId('crm-local'); mutate(input);
    assert.throws(() => evaluateContinuityScenario(input));
    const markup = html(input);
    assert.match(markup, /data-state="engine-error"/); assert.match(markup, /role="alert"/); assert.ok(text(markup).includes(message), message);
    assert.equal(status(markup), null); assert.equal(testid(markup, 'status-label'), null);
    assert.ok(!text(markup).includes('Preparado según estas entradas'));
  }
});

test('sin entrada el componente muestra un estado vacío y no calcula ni declara nada', () => {
  const markup = html(null), plain = text(markup);
  assert.match(plain, /Sin simulación cargada/); assert.equal(status(markup), null);
  assert.ok(!plain.includes('Preparado') && !markup.includes('data-status='));
  assert.equal((markup.match(/<option/g) ?? []).length, cases.length + 1);
});

test('el fixture es sintético: identificadores demo, fechas fijas y sin datos de instalaciones', () => {
  for (const c of cases) {
    const raw = JSON.stringify(c.input);
    assert.match(c.input.scope.spaceId, /^demo-/); assert.match(c.input.scope.sourceKey, /^demo-/); assert.match(c.input.scope.captureId, /^demo-/);
    assert.equal(c.input.evaluatedAt, DEMO_EVALUATED_AT);
    assert.ok(!/@|https?:|planb-local|hubspot|token|secret/i.test(raw), c.id);
  }
  const a = html(byId('crm-local')), b = html(byId('crm-local'));
  assert.equal(a, b, 'determinista');
});

test('formatDuration usa unidades legibles y conserva el cero medido', () => {
  assert.equal(formatDuration(0), '0 min'); assert.equal(formatDuration(45 * MINUTE), '45 min'); assert.equal(formatDuration(8 * 60 * MINUTE), '8 h');
  assert.equal(formatDuration(26 * 60 * MINUTE + 5 * MINUTE), '1 d 2 h 5 min'); assert.equal(formatDuration(30_000), '30 s'); assert.equal(formatDuration(-MINUTE), '−1 min');
});

test('ningún control ejecuta o simula una recuperación, y el componente no usa red ni almacenamiento', () => {
  const source = fs.readFileSync(new URL('../src/ContinuityLab.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/continuity-lab.css', import.meta.url), 'utf8');
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.', 'document.cookie', 'window.open', 'location.']) assert.ok(!source.includes(forbidden), forbidden);
  assert.ok(!/https?:\/\//.test(source.replace(/xmlns='http:\/\/www\.w3\.org[^']*'/g, '')), 'sin URL externas en el componente');
  assert.ok(!/from '\.\.\/server|from '\.\/api|<a[\s>]/.test(source), 'sin servidor, API ni enlaces');
  assert.ok(!/@import|url\(\s*['"]?https?:/.test(css), 'sin recursos remotos en la hoja');
  const buttons = [...renderToStaticMarkup(createElement(ContinuityLab, { input: byId('crm-local'), onInputChange() {} })).matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(m => text(m[1]).trim());
  assert.ok(buttons.length >= 3);
  for (const label of buttons) assert.ok(!/ejecut|recuper|restaur|simular|iniciar|probar|conectar|enviar/i.test(label), label);
});

test('el componente no repite el cálculo del motor en la presentación', () => {
  const source = fs.readFileSync(new URL('../src/ContinuityLab.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('evaluateContinuityScenario('));
  assert.ok(!/dueAt\s*[<>]=?\s*(input\.|d\.)?evaluatedAt/.test(source), 'sin clasificar tareas en JSX');
});
