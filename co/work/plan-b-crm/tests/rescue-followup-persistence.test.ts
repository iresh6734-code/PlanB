import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hashPayload } from '../server/rescue-room-journal.js';
import { RescueRoom } from '../server/rescue-room.js';
import { clock, days, digestInNewProcess, digestRoom, envelope, newRoom, rawMeta, startDemo, track, viewOf, workLocally } from './helpers/rescue-followup-harness.js';
// RESCUE-115 · reanudación en proceso nuevo, intención/efecto/acuse y un solo escritor. Los casos «DEFECTO ·» afirman el comportamiento CORRECTO y fallan mientras
// el defecto exista (no TODO/skip). Hipótesis de CODEX-RESCUE-REVIEW-113 sobre «creación interrumpida» contrastada con una reproducción propia.
const subject = 'Confirmar entrega con el cliente';
const createPayload = { values: { subject, due_date: days(2), status: 'pending' } };
const startedIntent = (room: ReturnType<typeof newRoom>, key: string) => room.store.set('rescue:idem:' + key, { hash: hashPayload({ route: 'create', payload: createPayload }), route: 'create', status: 'started', baseVersion: viewOf(room).version,
  baseChangeId: Number((room.store.db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM changes').get() as { n: number }).n), startedAt: new Date().toISOString() });
const subjects = (room: ReturnType<typeof newRoom>) => room.store.records('tasks').filter(r => r.values.subject === subject);

test('reanudación en un PROCESO nuevo: el digest de registros, cambios, estado, diario, idempotencia, plan y CRM simulado coincide byte a byte', async () => {
  const room = newRoom(); await workLocally(room); await room.crmReturn(envelope(room)); await room.prepareReturn(envelope(room));
  await room.armLostAck({ ...envelope(room), armed: true }); const planId = viewOf(room).returnPlan!.id;
  const op = viewOf(room).returnPlan!.operations.find(o => o.fields.some(f => f.conflict))!;
  await room.decide({ ...envelope(room), planId, decisions: [{ operationId: op.id, field: 'due_date', decision: 'local' }] }); await room.approve({ ...envelope(room), planId }); await room.apply({ ...envelope(room), planId });
  const before = digestRoom(room), root = room.root; room.close();
  const child = digestInNewProcess(root); assert.equal(child.status, 0, child.stderr); assert.equal(child.digest, before, 'otro proceso lee exactamente el mismo contenido');
  const second = digestInNewProcess(root); assert.equal(second.digest, before, 'abrir no normaliza ni reescribe nada observable');
  const back = track(RescueRoom.open(root, { clock })); assert.equal(back.crm.stats().calls.create, 1); assert.equal(viewOf(back).returnPlan!.operations.filter(o => o.status === 'uncertain').length, 1, 'la incertidumbre sobrevive y no pasa a pendiente'); back.close();
});

test('una intención iniciada CON efecto aplicado se reanuda con la misma clave sin duplicar (caso favorable)', async () => {
  const room = newRoom(); startedIntent(room, 'k-intencion-propia'); room.store.saveRecord('tasks', createPayload.values);
  const r = await room.createTask({ ...envelope(room, 'k-intencion-propia'), ...createPayload }); assert.equal((r.result as { recovered: boolean }).recovered, true); assert.equal(subjects(room).length, 1); room.close();
});

test('DEFECTO · una intención A SIN efecto no debe quedar «recuperada» por una tarea de contenido idéntico creada por OTRA intención B', async () => {
  const room = newRoom();
  startedIntent(room, 'k-intencion-A-0001');                                       // A: se anotó la intención y el proceso cayó ANTES del efecto
  await room.createTask({ ...envelope(room, 'k-intencion-B-0001'), ...createPayload }); // B: otra intención con el mismo contenido, aplicada de verdad
  assert.equal(subjects(room).length, 1);
  const retryA = await room.createTask({ ...envelope(room, 'k-intencion-A-0001'), ...createPayload });
  // A nunca tuvo efecto propio: no puede dar por «recuperado» el cambio de B. Lo correcto es aplicar el suyo (2 tareas) o rechazar por ambigüedad, no fingir éxito con 1.
  assert.equal((retryA.result as { recovered: boolean }).recovered, false, 'A no debe adoptar el efecto de B'); assert.equal(subjects(room).length, 2, 'cada intención distinta deja su propio efecto'); room.close();
});

test('control: dos edición idénticas con claves distintas son operaciones distintas y la segunda no adopta el cambio de la primera', async () => {
  const room = newRoom(); const payload = { taskId: 'task-3', values: { status: 'completed' } };
  await room.editTask({ ...envelope(room, 'k-edicion-A-0001'), ...payload }); const second = await room.editTask({ ...envelope(room, 'k-edicion-B-0001'), ...payload });
  assert.equal((second.result as { recovered: boolean }).recovered, false); room.close();
});

test('DEFECTO · abrir una raíz YA abierta por otro proceso no debe escribir en ella antes de fallar por el bloqueo (un solo escritor)', async () => {
  const a = await startDemo(); let rejected = false, out = '';
  try {
    const before = rawMeta(a.root), sizeBefore = statSync(join(a.root, 'planb.sqlite')).size;
    try { const b = await startDemo({ resume: a.root }); await b.stop(true); } catch (error) { rejected = true; out = (error as { output?: string }).output ?? ''; }
    assert.equal(rejected, true, 'el segundo escritor debe fallar'); assert.match(out, /ya está abierto|ya esta abierto/i, 'con el motivo del bloqueo: ' + out.slice(-200));
    const after = rawMeta(a.root);
    const changed = Object.keys(after).filter(k => after[k] !== before[k]);
    assert.deepEqual(changed, [], 'el intento rechazado NO debe haber reescrito filas (Store/Recovery se construyen antes de adquirir el bloqueo): ' + changed.join(', '));
    assert.equal(statSync(join(a.root, 'planb.sqlite')).size, sizeBefore);
  } finally { await a.stop(); }
});

test('el escritor único también protege el destino normal: tras parar A, una apertura nueva funciona y conserva el estado', async () => {
  const a = await startDemo(); const root = a.root; await a.stop(true); // conserva la carpeta para reanudarla
  const b = await startDemo({ resume: root }); try { const state = await (await fetch('http://127.0.0.1:' + b.port + '/api/rescue/state')).json() as { stage: string }; assert.equal(state.stage, 'preparation'); } finally { await b.stop(); }
});

test('el archivo de bloqueo no impide leer la sala con una conexión de solo lectura mientras A escribe: sin corrupción observable', async () => {
  const a = await startDemo(); try {
    const state = await (await fetch('http://127.0.0.1:' + a.port + '/api/rescue/state')).json() as { version: number; context: Record<string, string> };
    const post = await fetch('http://127.0.0.1:' + a.port + '/api/rescue/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'k-lectura-ro-0001', expectedVersion: state.version, context: state.context, budgetMinutes: 60 }) });
    assert.equal(post.status, 200); const meta = rawMeta(a.root); assert.ok(meta['rescue:state'] && meta['rescue:journal']); assert.ok(readFileSync(join(a.root, 'rescue-room.marker.json'), 'utf8').includes('rescue106'));
  } finally { await a.stop(); }
});
