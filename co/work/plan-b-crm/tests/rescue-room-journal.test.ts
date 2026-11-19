import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmdirSync, symlinkSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RescueRoom, assertOwnRoot, buildRescueFixture, captureRevision } from '../server/rescue-room.js';
import { parseArgs } from '../scripts/demo-rescue-room.js';
import { RescueError } from '../shared/rescue-room.js';
import { TMP, clock, days, disposeRoomFiles, envelope, newRoom, reopen, rejects, track, viewOf, workLocally } from './helpers/rescue-room-harness.js';
// Diario, versión esperada, idempotencia, aislamiento y corrupción sobre salas reales (Store SQLite). Sin mocks de persistencia.
const events = (room: RescueRoom) => (viewOf(room).journal.events as { kind: string }[]).map(e => e.kind);

test('misma clave y mismo contenido repite el acuse sin volver a aplicar; el diario recibe un solo hecho', async () => {
  const room = newRoom(), env = envelope(room, 'k-misma-clave-1');
  const first = await room.choosePlan({ ...env, budgetMinutes: 60 }), v1 = viewOf(room).version;
  const again = await room.choosePlan({ ...env, budgetMinutes: 60 });
  assert.equal(first.replayed, false); assert.equal(again.replayed, true); assert.equal(viewOf(room).version, v1, 'la repetición no sube la versión');
  assert.equal(events(room).filter(k => k === 'plan-chosen').length, 1); room.close();
});

test('misma clave con contenido distinto se rechaza y no cambia nada', async () => {
  const room = newRoom(), env = envelope(room, 'k-contenido-1');
  await room.choosePlan({ ...env, budgetMinutes: 60 }); const v = viewOf(room).version;
  await rejects(room.choosePlan({ ...env, budgetMinutes: 30 }), 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(viewOf(room).budgetMinutes, 60); assert.equal(viewOf(room).version, v); room.close();
});

test('doble solicitud simultánea con la misma clave: una aplica y la otra repite', async () => {
  const room = newRoom(), env = envelope(room, 'k-simultanea-1');
  const [a, b] = await Promise.all([room.choosePlan({ ...env, budgetMinutes: 30 }), room.choosePlan({ ...env, budgetMinutes: 30 })]);
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]); assert.equal(events(room).filter(k => k === 'plan-chosen').length, 1); room.close();
});

test('versión esperada antigua (otra pestaña): conflicto explicado y nada aplicado', async () => {
  const room = newRoom(), stale = envelope(room);
  await room.choosePlan({ ...envelope(room), budgetMinutes: 60 });
  const error = await rejects(room.setEstimate({ ...stale, taskId: 'task-2', minutes: 20 }), 'VERSION_CONFLICT');
  assert.equal((error.details as { currentVersion: number }).currentVersion, viewOf(room).version);
  assert.equal(viewOf(room).queue.items.find(i => i.id === 'task-2')!.estimate, null); room.close();
});

test('contexto: el sobre de otro espacio o de otra captura se rechaza aunque los IDs de filas coincidan', async () => {
  const a = newRoom(), b = newRoom();
  assert.equal(viewOf(a).queue.items[0].id, viewOf(b).queue.items[0].id, 'mismos IDs de fila en dos espacios');
  assert.notEqual(viewOf(a).context.workspaceId, viewOf(b).context.workspaceId);
  await a.choosePlan({ ...envelope(a), budgetMinutes: 60 });
  assert.equal(viewOf(b).budgetMinutes, null, 'la decisión de A no se hereda en B');
  await rejects(b.choosePlan({ ...envelope(a), budgetMinutes: 30 }), 'CONTEXT_MISMATCH');
  const other = { ...envelope(b), context: { ...viewOf(b).context, captureRevision: 'f'.repeat(64) } };
  await rejects(b.choosePlan({ ...other, budgetMinutes: 30 }), 'CONTEXT_MISMATCH');
  a.close(); b.close();
});

test('captura con el mismo ID y fecha pero distinto contenido tiene otra revisión', () => {
  const { snapshot } = buildRescueFixture(Date.parse('2026-11-02T07:00:00Z')), changed = structuredClone(snapshot);
  changed.records[0].values = { ...changed.records[0].values, name: 'Otro nombre' };
  assert.equal(changed.id, snapshot.id); assert.equal(changed.capturedAt, snapshot.capturedAt);
  assert.notEqual(captureRevision(changed), captureRevision(snapshot)); assert.equal(captureRevision(structuredClone(snapshot)), captureRevision(snapshot));
});

test('reapertura: selección, estimaciones, notas y bloqueos persisten; no se vuelve a sembrar ni se heredan en otra sala', async () => {
  let room = newRoom();
  await room.choosePlan({ ...envelope(room), budgetMinutes: 120 }); await room.setEstimate({ ...envelope(room), taskId: 'task-9', minutes: 45 });
  await room.saveNote({ ...envelope(room), taskId: 'task-9', text: 'Esperar el presupuesto' }); await room.declareBlocker({ ...envelope(room), taskId: 'task-9', reason: 'Falta la firma' });
  await room.select({ ...envelope(room), taskId: 'task-9' }); const before = viewOf(room);
  room = reopen(room); const after = viewOf(room);
  assert.equal(after.version, before.version); assert.equal(after.budgetMinutes, 120); assert.equal(after.selected!.record.id, 'task-9');
  const item = after.queue.items.find(i => i.id === 'task-9')!; assert.deepEqual([item.estimate, item.note, item.blocked], [45, 'Esperar el presupuesto', 'Falta la firma']);
  assert.equal(after.journal.total, before.journal.total, 'el diario no se duplica ni se resiembra');
  assert.throws(() => room.ledger.init({ ...(room.ledger.inspect().state!) }, { actor: 'system', kind: 'incident-opened', summary: 'x', data: {} }), /ya contiene un incidente/);
  const other = newRoom(); assert.equal(viewOf(other).budgetMinutes, null); room.close(); other.close();
});

test('una escritura interrumpida (intención iniciada, efecto ya aplicado) se reanuda con la misma clave sin duplicar el cambio', async () => {
  const room = newRoom(), env = envelope(room, 'k-reanuda-0001'), payload = { taskId: 'task-3', values: { status: 'completed' } };
  const base = Number((room.store.db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM changes').get() as { n: number }).n);
  const { hashPayload } = await import('../server/rescue-room-journal.js');
  room.store.saveRecord('tasks', payload.values, payload.taskId); // el efecto llegó a la copia antes de caerse el proceso
  room.store.set('rescue:idem:k-reanuda-0001', { hash: hashPayload({ route: 'edit', payload }), route: 'edit', status: 'started', baseVersion: viewOf(room).version, baseChangeId: base, startedAt: new Date().toISOString() });
  const result = await room.editTask({ ...env, ...payload });
  assert.equal((result.result as { recovered: boolean }).recovered, true); assert.equal(room.store.changes().filter(c => c.recordId === 'task-3').length, 1, 'un único cambio local');
  assert.equal(events(room).filter(k => k === 'local-edit').length, 1); room.close();
});

test('una validación fallida no deja rastro: no se aplica, no hay hecho en el diario ni versión nueva; texto inválido no es éxito', async () => {
  const room = newRoom(), v = viewOf(room).version, k = events(room).length;
  await assert.rejects(room.editTask({ ...envelope(room), taskId: 'task-2', values: { due_date: '2026-02-30' } }), /campos/i);
  await rejects(room.editTask({ ...envelope(room), taskId: 'task-2', values: { contact_id: 'contact-1' } }), 'FIELD_NOT_EDITABLE');
  await rejects(room.createTask({ ...envelope(room), values: { subject: 'x', due_date: days(3), contact_id: 'contact-1' } }), 'FIELD_NOT_CREATABLE');
  await rejects(room.editTask({ ...envelope(room), taskId: 'no-existe', values: { status: 'completed' } }), 'TASK_NOT_FOUND');
  assert.equal(viewOf(room).version, v); assert.equal(events(room).length, k); assert.equal(room.localChanges().length, 0); room.close();
});

test('lecturas, previsualización e informe no cambian el estado', async () => {
  const room = newRoom(); await workLocally(room); const v = viewOf(room), changes = room.localChanges().length, kinds = events(room).length;
  room.view(); room.report(); room.reportHtml(); room.reportJson(); room.previewEdit('task-9', { status: 'completed' }); room.queue();
  assert.equal(viewOf(room).version, v.version); assert.equal(events(room).length, kinds); assert.equal(room.localChanges().length, changes); room.close();
});

test('transiciones: no se salta etapa, no se edita ni planifica tras cerrar y cerrar no recupera el negocio', async () => {
  const room = newRoom();
  await rejects(room.crmReturn(envelope(room)), 'STAGE_BLOCKED'); await rejects(room.prepareReturn(envelope(room)), 'STAGE_BLOCKED');
  await room.closeIncident({ ...envelope(room), note: 'cerrado sin retorno' });
  await rejects(room.choosePlan({ ...envelope(room), budgetMinutes: 60 }), 'STAGE_BLOCKED'); await rejects(room.closeIncident({ ...envelope(room), note: '' }), 'STAGE_TRANSITION');
  assert.match(room.reportHtml(), /no significa que el negocio|«ensayo cerrado» solo indica/i); room.close();
});

test('diario corrupto: bytes conservados, flujo bloqueado, informe denegado y nada se sustituye por un incidente vacío', async () => {
  const room = newRoom(); await room.choosePlan({ ...envelope(room), budgetMinutes: 60 }); const env = envelope(room), root = room.root;
  const raw = (key: string) => room.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string };
  room.store.db.prepare("UPDATE meta SET value=? WHERE key='rescue:journal'").run('enc1:esto-no-se-puede-descifrar');
  const garbage = raw('rescue:journal').value;
  assert.equal(room.ledger.inspect().integrity.status, 'corrupt'); assert.equal(room.view().blocked, true);
  await rejects(room.setEstimate({ ...env, taskId: 'task-2', minutes: 20 }), 'RESCUE_CORRUPT'); assert.throws(() => room.report(), /ilegible/);
  assert.equal(raw('rescue:journal').value, garbage, 'los bytes corruptos no se tocan');
  const reopened = reopen(room); assert.equal(reopened.view().blocked, true); assert.throws(() => reopened.ledger.init({} as never, { actor: 'system', kind: 'incident-opened', summary: 'x', data: {} }), RescueError, 'una carpeta con diario ilegible no se vuelve a sembrar');
  assert.ok(root.length > 0 && readFileSync(join(root, 'rescue-room.marker.json'), 'utf8').includes('rescue106'));
  reopened.close();
});

test('diario incoherente con el estado (hueco de secuencia o espacio ajeno) se trata como corrupto', async () => {
  const room = newRoom(); await room.choosePlan({ ...envelope(room), budgetMinutes: 60 });
  const journal = room.store.get<{ seq: number }[]>('rescue:journal', []); journal[1] = { ...journal[1], seq: 7 }; room.store.set('rescue:journal', journal);
  assert.equal(room.ledger.inspect().integrity.status, 'corrupt'); room.close();
});

test('raíz reanudable: solo carpetas creadas por este lanzador bajo tests/.tmp/rescue106-*, sin enlaces y con marcador válido', (t) => {
  const room = newRoom(); const root = room.root; room.close();
  assert.equal(assertOwnRoot(root).roomId, viewOfName(root));
  const otra = mkdtempSync(join(TMP, 'otra-')); assert.throws(() => assertOwnRoot(otra), /bajo tests\/.tmp\/rescue106/); rmdirSync(otra);
  const noMarker = join(TMP, 'rescue106-sin-marcador'); if (!existsSync(noMarker)) mkdirSync(noMarker); assert.throws(() => assertOwnRoot(noMarker), /marcador/); rmdirSync(noMarker);
  const forged = join(TMP, 'rescue106-falsa'); mkdirSync(forged, { recursive: true }); writeFileSync(join(forged, 'rescue-room.marker.json'), JSON.stringify({ format: 'planb-rescue-marker-v1', kind: 'rescue106', roomId: 'otra' })); assert.throws(() => assertOwnRoot(forged), /no corresponde/); disposeRoomFiles(forged);
  assert.throws(() => assertOwnRoot(resolve('server')), RescueError); assert.throws(() => assertOwnRoot(join(TMP, 'no-existe-nunca')), /no existe/);
  const link = join(TMP, 'rescue106-enlace-' + Date.now());
  try { symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes((e as NodeJS.ErrnoException).code ?? '')) { t.diagnostic('enlace no creable: ' + (e as NodeJS.ErrnoException).code); return; } throw e; }
  try { assert.throws(() => assertOwnRoot(link), /enlace/i); } finally { rmdirSync(link); }
});
const viewOfName = (root: string) => root.slice(root.lastIndexOf('rescue106-') + 'rescue106-'.length);

test('el lanzador valida argumentos y no arranca nada al importarse', () => {
  assert.deepEqual(parseArgs(['--port', '4530']), { port: 4530, dist: null, resume: null, now: null });
  for (const bad of [['--port', '80'], ['--port', 'abc'], ['--now', 'no'], ['--otro'], ['--resume']]) assert.throws(() => parseArgs(bad), RescueError, bad.join(' '));
  assert.equal(parseArgs(['--now', '2026-11-02T07:00:00Z']).now, Date.parse('2026-11-02T07:00:00Z'));
});

test('el relojero es inyectable: el diario usa el reloj de la sala', async () => {
  const room = track(RescueRoom.create(TMP, { clock: () => clock() })); assert.equal(viewOf(room).incident.openedAt, new Date(clock()).toISOString());
  assert.equal((viewOf(room).journal.events as { at: string }[])[0].at, new Date(clock()).toISOString()); room.close();
});

// ---------------------------------------------------------------- R2 (dictamen 113): F1 contexto antes del replay, F2 atribución de efectos, F3 capacidad del diario
import { randomUUID } from 'node:crypto';
import { hashPayload } from '../server/rescue-room-journal.js';
const idemKey = (key: string) => 'rescue:idem:' + key;
const baseMarker = (room: ReturnType<typeof newRoom>) => Number((room.store.db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM changes').get() as { n: number }).n);
const intent = (room: ReturnType<typeof newRoom>, key: string, route: string, payload: unknown) => room.store.set(idemKey(key), { contextKey: [viewOf(room).context.workspaceId, viewOf(room).context.accountId, viewOf(room).context.captureId, viewOf(room).context.captureRevision].join(':'), hash: hashPayload({ route, payload }), route, status: 'started', baseVersion: viewOf(room).version, baseChangeId: baseMarker(room), startedAt: new Date().toISOString() });
const subjectRecords = (room: ReturnType<typeof newRoom>, subject: string) => room.store.records('tasks').filter(r => r.values.subject === subject);

test('F1 · un acuse terminado NO se devuelve bajo un sobre de otro contexto (cada campo), pero el reintento legítimo con versión antigua sí', async () => {
  const room = newRoom(), env = envelope(room, 'k-f1-0000001'), first = await room.choosePlan({ ...env, budgetMinutes: 60 }); const v = viewOf(room).version, events = viewOf(room).journal.total;
  for (const field of ['workspaceId', 'accountId', 'captureId', 'captureRevision'] as const) {
    const other = { ...env, context: { ...env.context, [field]: field === 'captureRevision' ? 'e'.repeat(64) : env.context[field] + '-otro' } };
    await rejects(room.choosePlan({ ...other, budgetMinutes: 60 }), 'CONTEXT_MISMATCH');
  }
  assert.equal(viewOf(room).version, v); assert.equal(viewOf(room).journal.total, events, 'los rechazos no escriben nada');
  await room.setEstimate({ ...envelope(room), taskId: 'task-2', minutes: 20 }); // la versión avanza: el sobre original ya es antiguo
  const again = await room.choosePlan({ ...env, budgetMinutes: 60 }); assert.equal(again.replayed, true); assert.equal(again.version, first.version); room.close();
});

test('F1 · la intención queda ligada a su contexto de forma duradera: un registro con otro contexto guardado no se repite', async () => {
  const room = newRoom(), env = envelope(room, 'k-f1-duradera1'); await room.choosePlan({ ...env, budgetMinutes: 60 });
  const rec = room.store.get<Record<string, unknown>>(idemKey('k-f1-duradera1'), null as never); assert.ok(typeof rec.contextKey === 'string' && rec.contextKey.includes(env.context.captureRevision));
  room.store.set(idemKey('k-f1-duradera1'), { ...rec, contextKey: 'otro:otro:otro:' + 'a'.repeat(64) }); await rejects(room.choosePlan({ ...env, budgetMinutes: 60 }), 'CONTEXT_MISMATCH'); room.close();
});

test('F2 · una intención A SIN efecto no adopta la tarea de contenido idéntico de otra intención B: aplica la suya y quedan dos', async () => {
  const room = newRoom(), payload = { values: { subject: 'Confirmar entrega con el cliente', due_date: days(2), status: 'pending' } };
  intent(room, 'k-f2-A-000001', 'create', payload); await room.createTask({ ...envelope(room, 'k-f2-B-000001'), ...payload });
  const retry = await room.createTask({ ...envelope(room, 'k-f2-A-000001'), ...payload });
  assert.equal((retry.result as { recovered: boolean }).recovered, false); assert.equal(subjectRecords(room, payload.values.subject).length, 2, 'cada intención deja su propio efecto');
  assert.notEqual((retry.result as { recordId: string }).recordId, (room.store.get(idemKey('k-f2-B-000001'), null as never) as { result: { recordId: string } }).result.recordId, 'A no se apropia del registro de B'); room.close();
});

test('F2 · una intención CON efecto propio y sin otra idéntica se recupera: un solo registro y un solo hecho', async () => {
  const room = newRoom(), payload = { values: { subject: 'Tarea propia recuperada', due_date: days(3), status: 'pending' } };
  intent(room, 'k-f2-prop-0001', 'create', payload); const saved = room.store.saveRecord('tasks', payload.values);
  const retry = await room.createTask({ ...envelope(room, 'k-f2-prop-0001'), ...payload }); assert.equal((retry.result as { recovered: boolean; recordId: string }).recovered, true); assert.equal((retry.result as { recordId: string }).recordId, saved.id);
  assert.equal(subjectRecords(room, payload.values.subject).length, 1); assert.equal(viewOf(room).journal.events.filter((e: { kind: string }) => e.kind === 'local-create').length, 1); room.close();
});

test('F2 · si dos intenciones iniciadas tienen el mismo contenido y hay un efecto, es AMBIGUO: no se adopta ni se repite y la intención se conserva', async () => {
  const room = newRoom(), payload = { values: { subject: 'Tarea ambigua', due_date: days(4), status: 'pending' } };
  intent(room, 'k-f2-amb-A0001', 'create', payload); intent(room, 'k-f2-amb-B0001', 'create', payload); room.store.saveRecord('tasks', payload.values);
  await rejects(room.createTask({ ...envelope(room, 'k-f2-amb-A0001'), ...payload }), 'AMBIGUOUS_RECOVERY');
  assert.equal(subjectRecords(room, payload.values.subject).length, 1, 'no se creó otro ni se confirmó éxito'); assert.equal(room.store.get<{ status: string }>(idemKey('k-f2-amb-A0001'), null as never).status, 'started', 'la intención sigue pendiente de decisión humana'); room.close();
});

test('F2 · el mismo patrón en edición: una edición idéntica ya atribuida a otra intención terminada no se adopta', async () => {
  const room = newRoom(), payload = { taskId: 'task-3', values: { status: 'completed' } };
  intent(room, 'k-f2-edA-00001', 'edit', payload); await room.editTask({ ...envelope(room, 'k-f2-edB-00001'), ...payload });
  const retry = await room.editTask({ ...envelope(room, 'k-f2-edA-00001'), ...payload }); assert.equal((retry.result as { recovered: boolean }).recovered, false); assert.equal(room.store.changes().filter(c => c.recordId === 'task-3').length, 2); room.close();
});

const fillJournal = (room: ReturnType<typeof newRoom>, count: number) => {
  const state = room.ledger.inspect().state!, journal = room.store.get<Record<string, unknown>[]>('rescue:journal', []), first = journal[0];
  const events = Array.from({ length: count }, (_, i) => i < journal.length ? journal[i] : { ...first, seq: i + 1, id: randomUUID(), stateVersion: 1, kind: 'note-saved', summary: 'relleno ' + i });
  room.store.set('rescue:journal', events); void state;
};
test('F3 · capacidad del diario: al llegar al límite se RECHAZA antes de producir efectos, sin dejar una sala ilegible ni un efecto sin recibo', async () => {
  const room = newRoom(); await room.choosePlan({ ...envelope(room), budgetMinutes: 60 }); const done = envelope(room, 'k-f3-confirm01'); await room.setEstimate({ ...done, taskId: 'task-2', minutes: 20 });
  fillJournal(room, 5000); assert.equal(room.ledger.inspect().integrity.status, 'ok', 'el diario de 5000 hechos es válido'); const before = room.store.get('rescue:journal', []) as unknown[], changes = room.localChanges().length;
  await rejects(room.editTask({ ...envelope(room), taskId: 'task-4', values: { status: 'completed' } }), 'JOURNAL_FULL'); await rejects(room.saveNote({ ...envelope(room), taskId: 'task-2', text: 'x' }), 'JOURNAL_FULL');
  assert.equal(room.localChanges().length, changes, 'ningún efecto local sin recibo'); assert.equal((room.store.get('rescue:journal', []) as unknown[]).length, before.length); assert.equal(room.ledger.inspect().integrity.status, 'ok', 'la sala sigue legible y se puede informar');
  assert.ok(room.report().sections.length > 0); const replay = await room.setEstimate({ ...done, taskId: 'task-2', minutes: 20 }); assert.equal(replay.replayed, true, 'el replay de una operación ya confirmada no se bloquea'); room.close();
});

test('F3 · con margen para el recibo la operación se aplica y el diario nuevo se valida antes de publicarse', async () => {
  const room = newRoom(); fillJournal(room, 4998); await room.saveNote({ ...envelope(room), taskId: 'task-2', text: 'cabe' }); assert.equal(room.ledger.inspect().integrity.status, 'ok'); assert.equal(viewOf(room).journal.total, 4999);
  // Política: se reserva margen para el recibo de la próxima operación (MAX_EVENTS_PER_RUN = 2), así que la capacidad efectiva para operaciones nuevas es 4999 hechos.
  await rejects(room.saveNote({ ...envelope(room), taskId: 'task-2', text: 'sin margen' }), 'JOURNAL_FULL'); assert.equal(viewOf(room).journal.total, 4999); assert.equal(room.ledger.inspect().integrity.status, 'ok'); room.close();
});
