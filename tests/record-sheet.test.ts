import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { isWideField, recordStamp } from '../src/app-shell/record-sheet.js';

const read = (file: string) => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
const spec = makeDemoSpec(makeFixture('agency'));
const fields = (entity: string) => spec.entities.find(item => item.id === entity)!;

test('K7 · sello de la ficha: la etapa de la oportunidad toma el tono de su cierre y la ganada va en verde', () => {
  const open = spec.stages.find(stage => stage.id === 'proposal')!;
  assert.deepEqual(recordStamp(spec, 'deals', { dealstage: 'proposal', closedate: '2026-03-01' }, '2026-03-10'),
    { label: open.label, tone: 'danger', note: 'Cierre: Venció hace 9 días · 1 mar' });
  assert.equal(recordStamp(spec, 'deals', { dealstage: 'proposal', closedate: '2026-03-12' }, '2026-03-10')?.tone, 'warn');
  assert.equal(recordStamp(spec, 'deals', { dealstage: 'proposal', closedate: '2026-05-12' }, '2026-03-10')?.tone, 'neutral');
  assert.deepEqual(recordStamp(spec, 'deals', { dealstage: 'won', closedate: '2026-01-01' }, '2026-03-10'), { label: 'Ganada', tone: 'ok', note: 'Ganada' });
  assert.equal(recordStamp(spec, 'deals', { dealstage: 'inexistente' }, '2026-03-10'), null);
});

test('K7 · sello de la ficha: una tarea completada no aparece vencida aunque su fecha pasara', () => {
  assert.deepEqual(recordStamp(spec, 'tasks', { status: 'completed', due_date: '2026-01-01' }, '2026-03-10'), { label: 'Completada', tone: 'ok', note: 'Hecha' });
  assert.equal(recordStamp(spec, 'tasks', { status: 'pending', due_date: '2026-03-09' }, '2026-03-10')?.tone, 'danger');
  assert.equal(recordStamp(spec, 'tasks', { status: 'pending', due_date: '2026-03-10' }, '2026-03-10')?.tone, 'warn');
  assert.equal(recordStamp(spec, 'tasks', { status: null, due_date: '2026-03-09' }, '2026-03-10'), null);
  assert.equal(recordStamp(spec, 'companies', { name: 'Sin fase' }, '2026-03-10'), null);
});

test('K7 · la ficha como hoja: a lo ancho van el nombre principal y las notas; el nombre de pila va junto a los apellidos', () => {
  const wide = (entity: string) => fields(entity).fields.filter(field => isWideField(field, fields(entity).displayField)).map(field => field.key);
  assert.deepEqual(wide('deals'), ['dealname']);
  assert.deepEqual(wide('tasks'), ['subject', 'notes']);
  assert.deepEqual(wide('contacts'), []);
  assert.equal(isWideField({ key: 'tags', label: 'Etiquetas', type: 'multiselect', required: false, readOnly: false, options: [], referenceEntity: null }), true);
});

test('K8 · Inicio tiene un solo botón relleno: «Tu siguiente paso»; el de la copia solo se rellena si no hay siguiente paso', () => {
  const home = read('HomeOverview.tsx').split('{report ? <Modal')[0];
  const strip = read('app-shell/FirstRun.tsx').split('export function FirstRunStrip')[1];
  const filled = (source: string) => source.match(/className="button primary"/g)?.length ?? 0;
  assert.equal(filled(home), 1);
  assert.match(home, /className=\{'button ' \+ \(first \? 'secondary' : 'primary'\)\} onClick=\{onOpenContinuity\}/);
  assert.equal(filled(strip), 0);
  assert.equal(filled(read('app-shell/PipelineCard.tsx')) + filled(read('app-shell/CoolingCard.tsx')) + filled(read('app-shell/MorningBrief.tsx')), 0);
});

test('K10 · en el móvil la ficha es una hoja inferior a todo el ancho y los controles miden 44 px', () => {
  const css = read('cuaderno.css');
  const sheet = css.slice(css.indexOf('/* K10'));
  const mobile = sheet.slice(sheet.indexOf('@media (max-width: 760px)'), sheet.indexOf('@keyframes k10-sheet-in'));
  assert.match(mobile, /\.record-drawer\[data-entity="deals"\] \{ inset: 32px 0 0 0; width: 100vw; max-width: none;/);
  assert.match(mobile, /\.drawer-footer \{ padding-bottom: calc\(10px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(read('faro.css'), /@media \(max-width: 767px\) \{\r?\n  html body :is\(button, select, \[role="tab"\][^\n]+\{ min-height: 44px; \}/);
});
