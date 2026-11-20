import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { CrmRecord } from '../shared/model.js';
import { agendaItems, agendaRange, agendaText, agendaTitle, buildAgenda, canMoveClose, closeFieldFor, itemOnDay, stepAnchor, weekStart } from '../src/app-shell/agenda-grid.js';
import { euros } from '../src/app-shell/deal-insights.js';
import { pathOf, placeOf } from '../src/app-shell/routes.js';
import { groupOfPage, navigationGroups } from '../src/app-shell/navigation.js';

// F3 · Agenda: semana o mes con tareas con fecha y cierres previstos. 20/11/2026 es viernes.
const spec = makeDemoSpec(makeFixture('agency'));
const today = '2026-11-20';
const task = (id: string, due: string | null, status = 'pending'): CrmRecord => ({ id, entity: 'tasks', values: { subject: 'Tarea ' + id, due_date: due, status, contact_id: null, deal_id: null, notes: '' } });
const deal = (id: string, stage: string, close: string | null, amount: number | null = 1000): CrmRecord => ({ id, entity: 'deals', values: { dealname: 'Op ' + id, amount, dealstage: stage, company_id: null, contact_id: null, service: 'web', closedate: close } });
const nameOf = (record: CrmRecord) => String(record.values.subject ?? record.values.dealname);

test('F3 · la semana va de lunes a domingo y el mes se pinta en semanas enteras', () => {
  assert.equal(weekStart('2026-11-20'), '2026-11-16');
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(weekStart('2026-11-22'), '2026-11-16', 'el domingo cierra la semana europea');
  assert.deepEqual(agendaRange('week', today), { from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(agendaRange('month', today), { from: '2026-10-26', to: '2026-12-06' });
  assert.deepEqual(agendaRange('month', '2027-02-14'), { from: '2027-02-01', to: '2027-02-28' }, 'febrero de 2027 empieza en lunes y acaba en domingo');
  assert.equal(stepAnchor('month', '2027-01-31', 1), '2027-02-01', 'el mes siguiente no se salta febrero');
  assert.equal(stepAnchor('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(stepAnchor('week', today, -1), '2026-11-13');
  assert.equal(agendaTitle('week', today), 'Del 16 al 22 de noviembre');
  assert.equal(agendaTitle('week', '2026-11-30'), 'Del 30 de noviembre al 6 de diciembre');
  assert.equal(agendaTitle('month', today), 'Noviembre de 2026');
});

test('F3 · entran tareas pendientes con fecha y cierres de oportunidades abiertas; nada inventado', () => {
  const { items, undated } = agendaItems({
    spec, today, nameOf,
    tasks: [task('a', '2026-11-18'), task('b', '2026-11-20T09:00:00Z'), task('c', null), task('d', '2026-11-19', 'completed'), task('e', '2026-13-40')],
    deals: [deal('x', 'proposal', '2026-11-27', 4000), deal('y', 'won', '2026-11-21'), deal('z', 'negotiation', null)],
  });
  assert.deepEqual(items.map(item => item.key), ['tasks:a', 'tasks:b', 'deals:x']);
  assert.equal(undated, 2, 'sin fecha o con una fecha imposible: se cuenta aparte');
  assert.deepEqual(items.map(item => item.tone), ['late', 'today', 'soon']);
  const close = items.find(item => item.kind === 'close')!;
  assert.equal(close.amount, 4000);
  assert.equal(close.stage, spec.stages.find(stage => stage.id === 'proposal')?.label, 'lleva la etiqueta de su etapa');
});

test('F3 · la rejilla reparte por día, suma el periodo y separa lo vencido (también de antes)', () => {
  const { items } = agendaItems({
    spec, today, nameOf,
    tasks: [task('old', '2026-11-02'), task('a', '2026-11-18'), task('b', '2026-11-18'), task('c', '2026-11-21'), task('next', '2026-11-25')],
    deals: [deal('x', 'proposal', '2026-11-18', 2500), deal('w', 'contact', '2026-11-22', null)],
  });
  const week = buildAgenda({ view: 'week', anchor: today, today, items });
  assert.equal(week.days.length, 7);
  assert.ok(week.days.every(day => day.inPeriod));
  const wednesday = week.days.find(day => day.day === '2026-11-18')!;
  assert.deepEqual(wednesday.items.map(item => item.key), ['deals:x', 'tasks:a', 'tasks:b'], 'el cierre primero');
  assert.equal(week.days.find(day => day.today)?.day, today);
  assert.ok(week.days.find(day => day.day === '2026-11-21')!.weekend);
  assert.deepEqual(week.totals, { tasks: 3, closes: 2, amount: 2500, late: 3 });
  assert.deepEqual(week.busiest, { day: '2026-11-18', count: 3 });
  assert.deepEqual(week.overdue.map(item => item.key), ['tasks:old', 'deals:x', 'tasks:a', 'tasks:b'], 'lo vencido incluye lo anterior a la semana');

  const month = buildAgenda({ view: 'month', anchor: today, today, items });
  assert.equal(month.days.length, 42);
  assert.equal(month.days.filter(day => day.inPeriod).length, 30);
  assert.equal(month.totals.tasks, 5);
  const empty = buildAgenda({ view: 'week', anchor: '2027-03-10', today, items });
  assert.equal(empty.busiest, null);
  assert.deepEqual(empty.totals, { tasks: 0, closes: 0, amount: 0, late: 0 });
});

test('F3 · solo se mueve el cierre de una oportunidad, a otro día válido, si el campo es editable', () => {
  const close = closeFieldFor(spec);
  assert.deepEqual(close, { key: 'closedate', label: 'Fecha prevista de cierre', editable: true });
  assert.equal(closeFieldFor(makeDemoSpec(makeFixture('distribution')))?.key, 'delivery_date', 'en distribución, la fecha de entrega');
  assert.equal(canMoveClose({ kind: 'close', day: '2026-11-18' }, '2026-11-25', true), true);
  assert.equal(canMoveClose({ kind: 'task', day: '2026-11-18' }, '2026-11-25', true), false, 'las tareas no se arrastran');
  assert.equal(canMoveClose({ kind: 'close', day: '2026-11-18' }, '2026-11-18', true), false);
  assert.equal(canMoveClose({ kind: 'close', day: '2026-11-18' }, '2026-02-30', true), false);
  assert.equal(canMoveClose({ kind: 'close', day: '2026-11-18' }, '2026-11-25', false), false);
  const { items } = agendaItems({ spec, today, nameOf, tasks: [], deals: [deal('x', 'proposal', '2026-11-18')] });
  const moved = itemOnDay(items[0], '2026-11-26', today);
  assert.equal(moved.day, '2026-11-26');
  assert.equal(moved.tone, 'soon', 'al moverlo deja de estar vencido');
});

test('B2 · «Copiar» deja el periodo en texto plano, agrupado por día y solo con los días que tienen algo', () => {
  const { items } = agendaItems({
    spec, today, nameOf,
    tasks: [task('a', '2026-11-18'), task('b', '2026-11-20')],
    deals: [deal('x', 'proposal', '2026-11-18', 2500)],
  });
  const text = agendaText(buildAgenda({ view: 'week', anchor: today, today, items }));
  assert.equal(text, [
    'Agenda · Del 16 al 22 de noviembre',
    '2 tareas · 1 cierre (' + euros(2500) + ') · 2 vencidas',
    '',
    'Miércoles, 18 de noviembre',
    '– Cierre: Op x · ' + euros(2500) + ' (vencida)',
    '– Tarea: Tarea a (vencida)',
    '',
    'Viernes, 20 de noviembre (hoy)',
    '– Tarea: Tarea b',
  ].join('\n') + '\n');
  assert.equal(agendaText(buildAgenda({ view: 'month', anchor: '2027-03-10', today, items })), 'Agenda · Marzo de 2027\n0 tareas\n\nNada previsto este mes.\n');
});

test('F3 · la Agenda tiene dirección, vive en el grupo Hoy y se carga bajo demanda', () => {
  assert.equal(pathOf({ page: 'agenda' }), '/hoy/agenda');
  assert.deepEqual(placeOf('/hoy/agenda'), { page: 'agenda' });
  assert.equal(groupOfPage('agenda'), 'today');
  const today = navigationGroups({ runtime: false, testData: false, ready: true }).find(group => group.id === 'today')!;
  assert.ok(today.items.some(item => item.id === 'agenda'));
  const lazy = readFileSync('src/app-shell/lazy-pages.tsx', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  assert.match(lazy, /export const Agenda = deferred\(\(\) => import\('\.\/Agenda\.js'\)/);
  assert.match(app, /page==='agenda'&&state\.ready&&spec\?<Agenda /);
  const view = readFileSync('src/app-shell/Agenda.tsx', 'utf8');
  assert.match(view, /import '\.\/agenda\.css'/, 'su CSS va en su propio chunk');
  assert.match(view, /item\.kind === 'close' && editable && busy === null \? \{\s*draggable: true/, 'solo los cierres se arrastran');
});
