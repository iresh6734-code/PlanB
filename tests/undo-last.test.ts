// CLAUDE-UNDO-LAST (R2, CODEX-UNDO-REVIEW-392) · Deshacer exactamente el guardado anunciado, sin pisar cambios posteriores,
// sin segundo inverso al repetir y sin hueco entre comprobación y escritura.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { z } from 'zod';
import { AppError, Store } from '../server/store.js';
import { planUndo, registerUndo } from '../server/undo.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { Change, CrmRecord } from '../shared/model.js';

const TMP = path.resolve('tests/.tmp');
function seeded(t: test.TestContext) {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, 'undo-last-')), file = path.join(dir, 'planb.sqlite'), store = new Store(file);
  const snapshot = makeFixture();
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
  store.activate();
  const app = Fastify();
  // Mismo tratamiento que server/app.ts: AppError con su estado, zod como 422.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.message, details: error.details ?? null });
    if (error instanceof z.ZodError) return reply.code(422).send({ error: 'Revisa los datos enviados.', details: error.flatten() });
    return reply.code(500).send({ error: 'fallo' });
  });
  registerUndo(app, store);
  const extra: Store[] = [];
  t.after(async () => { await app.close(); for (const s of extra) s.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const other = () => { const s = new Store(file); extra.push(s); return s; };
  return { store, app, other };
}
/** Guarda como la ruta real y devuelve la identidad del cambio, igual que la que recibe el aviso. */
function save(store: Store, record: CrmRecord, values: CrmRecord['values']) {
  let change = null as { id: number; at: string } | null;
  store.saveRecord(record.entity, { ...record.values, ...values }, record.id, { onChange: value => { change = value; } });
  assert.ok(change); return { changeId: change!.id, at: change!.at };
}
const undo = (app: ReturnType<typeof Fastify>, identity: unknown) => app.inject({ method: 'POST', url: '/api/v2/changes/undo-last', payload: identity as object });
const codeOf = (body: string) => JSON.parse(body).details?.code;

const rec = (values: CrmRecord['values']): CrmRecord => ({ entity: 'contacts', id: 'c1', values });
const change = (over: Partial<Change>): Change => ({ id: 1, at: '2026-11-17T10:00:00.000Z', entity: 'contacts', recordId: 'c1', operation: 'update', before: rec({ phone: '1' }), after: rec({ phone: '2' }), ...over });
const id1 = { changeId: 1, at: '2026-11-17T10:00:00.000Z' };

test('planUndo: solo el cambio identificado, si es el último y el registro sigue como lo dejó', () => {
  assert.equal(planUndo([], null, id1).ok, false);
  assert.deepEqual(planUndo([change({})], rec({ phone: '2' }), id1), { ok: true, change: change({}), values: { phone: '1' } });
  const code = (p: ReturnType<typeof planUndo>) => (p.ok ? 'ok' : p.code);
  assert.equal(code(planUndo([change({})], rec({ phone: '3' }), id1)), 'RECORD_CHANGED');
  assert.equal(code(planUndo([change({ operation: 'create', before: null })], rec({ phone: '2' }), id1)), 'NOT_AN_UPDATE');
  assert.equal(code(planUndo([change({})], rec({ phone: '2' }), { changeId: 2, at: id1.at })), 'NOT_LATEST');
  assert.equal(code(planUndo([change({})], rec({ phone: '2' }), { changeId: 1, at: '2026-11-17T09:00:00.000Z' })), 'NOT_LATEST', 'mismo id con otra fecha (otra copia restaurada) no vale');
  assert.equal(code(planUndo([change({})], null, id1)), 'RECORD_MISSING');
  const added = planUndo([change({ after: rec({ phone: '2', email: 'nuevo@example.com' }) })], rec({ phone: '2', email: 'nuevo@example.com' }), id1);
  assert.deepEqual(added.ok && added.values, { phone: '1', email: null }, 'un campo que la edición añadió vuelve a quedar vacío');
});

test('deshacer el guardado anunciado restaura, añade un inverso y no borra historial', async t => {
  const { store, app } = seeded(t);
  const target = store.records('contacts')[0], original = target.values.phone;
  const identity = save(store, target, { phone: '600 000 999' });
  const before = store.changesCount;
  const ok = await undo(app, identity);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(store.record('contacts', target.id)?.values.phone, original);
  assert.equal(store.changesCount, before + 1);
  const body = JSON.parse(ok.body);
  assert.equal(body.undone, identity.changeId); assert.equal(body.change.id, store.latestChange()!.id, 'devuelve la identidad del inverso');
});

test('dos guardados del mismo registro: el aviso del primero no revierte el segundo', async t => {
  const { store, app } = seeded(t);
  const target = store.records('contacts')[0];
  const first = save(store, target, { phone: '600 000 101' });
  save(store, store.record('contacts', target.id)!, { phone: '600 000 102' });
  const response = await undo(app, first);
  assert.equal(response.statusCode, 409); assert.equal(codeOf(response.body), 'NOT_LATEST');
  assert.equal(store.record('contacts', target.id)?.values.phone, '600 000 102', 'el segundo guardado se conserva');
});

test('repetir la misma petición tras un éxito no crea un segundo inverso', async t => {
  const { store, app } = seeded(t);
  const target = store.records('contacts')[0], original = target.values.phone;
  const identity = save(store, target, { phone: '600 000 201' });
  assert.equal((await undo(app, identity)).statusCode, 200);
  const count = store.changesCount;
  const again = await undo(app, identity);
  assert.equal(again.statusCode, 409); assert.equal(codeOf(again.body), 'NOT_LATEST');
  assert.equal(store.changesCount, count, 'sin cambio nuevo');
  assert.equal(store.record('contacts', target.id)?.values.phone, original);
});

test('otra conexión que guarda entre la lectura y la escritura: la guarda en la transacción lo rechaza', async t => {
  const { store, app, other } = seeded(t);
  const target = store.records('contacts')[0];
  const identity = save(store, target, { phone: '600 000 301' });
  // Instrumentación del hueco exacto: la ruta lee el registro (aún sin cambios) y, ANTES de abrir su transacción, otra conexión
  // guarda. La comprobación previa pasa con lo leído; solo la guarda dentro de la transacción puede detenerlo.
  const second = other(), originalRecord = store.record.bind(store);
  let injected = false;
  store.record = (entity, id) => { const value = originalRecord(entity, id); if (!injected) { injected = true; second.saveRecord('contacts', { ...second.record('contacts', target.id)!.values, phone: '600 000 302' }, target.id); } return value; };
  const response = await undo(app, identity);
  assert.ok(injected);
  assert.equal(response.statusCode, 409, response.body); assert.equal(codeOf(response.body), 'NOT_LATEST');
  assert.equal(store.record('contacts', target.id)?.values.phone, '600 000 302', 'la escritura de la otra conexión se conserva');
});

test('una alta no se deshace y una escritura fuera del historial bloquea el deshacer', async t => {
  const { store, app } = seeded(t);
  let created = null as { id: number; at: string } | null;
  const record = store.saveRecord('contacts', { firstname: 'Alta', email: 'alta@example.com' }, undefined, { onChange: value => { created = value; } });
  const response = await undo(app, { changeId: created!.id, at: created!.at });
  assert.equal(response.statusCode, 409); assert.equal(codeOf(response.body), 'NOT_AN_UPDATE');
  assert.ok(store.record('contacts', record.id));
  const target = store.records('contacts')[0];
  const identity = save(store, target, { phone: '600 000 401' });
  store.insertRecord({ ...target, values: { ...target.values, phone: '600 000 402' } });
  const changed = await undo(app, identity);
  assert.equal(changed.statusCode, 409); assert.equal(codeOf(changed.body), 'RECORD_CHANGED');
  assert.equal(store.record('contacts', target.id)?.values.phone, '600 000 402');
});

test('la petición mal formada se rechaza sin tocar nada', async t => {
  const { store, app } = seeded(t);
  const count = store.changesCount;
  for (const payload of [{}, { changeId: 1 }, { changeId: 0, at: 'x' }, { changeId: 1.5, at: 'x' }, { changeId: 1, at: 'x', extra: 1 }, { entity: 'contacts', id: 'x' }]) {
    const r = await undo(app, payload);
    assert.ok(r.statusCode >= 400 && r.statusCode < 500, JSON.stringify(payload) + ' → ' + r.statusCode);
  }
  assert.equal(store.changesCount, count);
});
