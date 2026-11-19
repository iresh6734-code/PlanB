import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_KEY, briefSeen, briefText, copyAge, markBriefSeen, morningBrief, shouldShowBrief } from '../src/app-shell/morning-brief.js';

const NOW = new Date('2026-11-19T07:30:00Z'); // 08:30 en Madrid
const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data }; };
const tasks = [
  { label: 'Llamar a Acme', due: '2026-11-15', bucket: 'overdue' },
  { label: 'Enviar oferta', due: '2026-11-18', bucket: 'overdue' },
  { label: 'Revisar contrato', due: '2026-11-12', bucket: 'overdue' },
  { label: 'Cerrar pedido', due: '2026-11-10', bucket: 'overdue' },
  { label: 'Preparar visita', due: '2026-11-19T15:00:00Z', bucket: 'due-in-window' },
  { label: 'Más adelante', due: '2026-11-30', bucket: 'later' },
];
const change = (at: string, entity: string, recordId: string, operation: 'create' | 'update' = 'update') => ({ at, entity, recordId, operation });

test('se abre solo la primera vez del día y guarda únicamente la fecha', () => {
  const store = memory();
  assert.equal(briefSeen(store), null);
  assert.equal(shouldShowBrief(briefSeen(store), '2026-11-19'), true);
  markBriefSeen(store, '2026-11-19');
  assert.deepEqual([...store.data], [[BRIEF_KEY, '2026-11-19']]);
  assert.equal(shouldShowBrief(briefSeen(store), '2026-11-19'), false);
  assert.equal(shouldShowBrief(briefSeen(store), '2026-11-20'), true);
  markBriefSeen(store, 'no es una fecha');
  assert.equal(briefSeen(store), '2026-11-19');
  store.data.set(BRIEF_KEY, '<script>');
  assert.equal(briefSeen(store), null, 'un valor raro cuenta como no visto');
  const broken = { getItem: () => { throw Error('bloqueado'); }, setItem: () => { throw Error('bloqueado'); } };
  assert.equal(briefSeen(broken), null);
  assert.doesNotThrow(() => markBriefSeen(broken, '2026-11-19'));
});

test('lo vencido va del más antiguo al más reciente y se limita a tres', () => {
  const brief = morningBrief({ now: NOW, tasks, changes: [], capturedAt: '2026-11-19T05:00:00Z', stale: false, steps: [] });
  assert.equal(brief.overdue?.count, 4);
  assert.deepEqual(brief.overdue?.items.map(item => [item.label, item.late]), [['Cerrar pedido', 9], ['Revisar contrato', 7], ['Llamar a Acme', 4]]);
  assert.equal(brief.soon, 1);
  assert.equal(brief.tone, 'danger');
  assert.match(brief.headline, /^4 tareas vencidas · 1 para las próximas 24 h · sin cambios desde ayer\.$/);
});

test('cambios desde el comienzo de ayer en Madrid, agrupados por entidad', () => {
  const changes = [
    change('2026-11-17T22:59:00Z', 'companies', 'a'), // 23:59 del 17 en Madrid: fuera
    change('2026-11-17T23:01:00Z', 'companies', 'a'), // 00:01 del 18: dentro
    change('2026-11-18T10:00:00Z', 'companies', 'a'),
    change('2026-11-19T07:00:00Z', 'tasks', 't1', 'create'),
    change('2026-11-19T07:10:00Z', 'tasks', 't2', 'create'),
    change('2026-11-19T07:20:00Z', 'tasks', 't2'),
    change('fecha rota', 'tasks', 't3'),
  ];
  const brief = morningBrief({ now: NOW, tasks, changes, entityLabel: entity => entity === 'tasks' ? 'Tareas' : 'Empresas', capturedAt: '2026-11-19T05:00:00Z', stale: false, steps: [] });
  assert.deepEqual(brief.changes, { count: 5, created: 2, updated: 3, records: 3, byEntity: [{ entity: 'tasks', label: 'Tareas', count: 3 }, { entity: 'companies', label: 'Empresas', count: 2 }] });
});

test('lo que no se pudo leer queda en null, nunca en cero', () => {
  const brief = morningBrief({ now: NOW, tasks: null, changes: null, capturedAt: null, stale: false, steps: [] });
  assert.equal(brief.overdue, null);
  assert.equal(brief.soon, null);
  assert.equal(brief.changes, null);
  assert.equal(brief.copy.label, 'Sin copia todavía');
  assert.equal(brief.headline, 'Leyendo tu día…');
  const text = briefText(brief);
  assert.match(text, /VENCIDO\n- No se pudo leer\./);
  assert.match(text, /CAMBIOS DESDE AYER\n- Sin leer\./);
});

test('antigüedad de la copia y aviso si se ha quedado vieja', () => {
  assert.equal(copyAge('2026-11-19T07:10:00Z', NOW).text, 'hace menos de una hora');
  assert.equal(copyAge('2026-11-19T02:00:00Z', NOW).text, 'hace 5 horas');
  assert.equal(copyAge('2026-11-17T07:00:00Z', NOW).text, 'hace 2 días');
  assert.equal(copyAge('rota', NOW).hours, null);
  const brief = morningBrief({ now: NOW, tasks: [], changes: [], capturedAt: '2026-11-17T07:00:00Z', stale: true, steps: [] });
  assert.equal(brief.copy.tone, 'warn');
  assert.equal(brief.tone, 'warn');
  assert.match(brief.copy.detail, /vieja/);
});

test('el texto copiable lleva los tres primeros pasos y nada más', () => {
  const steps = ['Uno', 'Dos', 'Tres', 'Cuatro'].map(title => ({ title, detail: 'Detalle de ' + title.toLowerCase() }));
  const brief = morningBrief({ now: NOW, tasks, changes: [change('2026-11-19T07:00:00Z', 'tasks', 't1', 'create')], entityLabel: () => 'Tareas', capturedAt: '2026-11-19T05:00:00Z', stale: false, steps });
  assert.equal(brief.steps.length, 3);
  const text = briefText(brief, 'Taller Norte');
  assert.match(text, /^Parte de la mañana · Taller Norte · jueves, 19 de noviembre/);
  assert.match(text, /- Cerrar pedido \(9 días\)\n- Revisar contrato \(7 días\)\n- Llamar a Acme \(4 días\)\n- y 1 más/);
  assert.match(text, /- 1 alta y 0 ediciones en 1 registro: Tareas 1\./);
  assert.match(text, /1\. Uno — Detalle de uno\n2\. Dos — Detalle de dos\n3\. Tres — Detalle de tres$/);
  assert.doesNotMatch(text, /Cuatro/);
});
