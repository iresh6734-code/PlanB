import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportCapsule, importCapsule, inspectCapsule, loadCapsule, sideOf } from '../server/rescue-capsule.js';
import { PASSWORD, capsuleFiles, newKit, openDest, originAt, originUncertain, newRoom, viewOf, envelope, TMP } from './helpers/rescue-capsule-harness.js';
// Kit de Relevo · recorrido vertical sobre salas reales y un PROCESO NUEVO: trabajo → create con acuse perdido → cápsula cifrada → inspección → destino nuevo → conciliación sin duplicado.

test('recorrido principal: cápsula cifrada, inspección sin escribir, destino nuevo en proceso nuevo, ID erróneo rechazado, ID correcto concilia y un solo create', async () => {
  const kit = newKit(), origin = newRoom(); await originUncertain(origin);
  assert.equal(viewOf(origin).stage, 'return-partial'); assert.equal(origin.crm.stats().calls.create, 1); const before = origin.logicalDigest();
  const exported = await exportCapsule(origin, PASSWORD, kit);
  assert.equal(origin.logicalDigest(), before, 'exportar NO modifica el origen'); assert.deepEqual(capsuleFiles(kit), [exported.name], 'un único archivo publicado, sin temporales');
  const raw = readFileSync(join(kit.capsules, exported.name), 'utf8');
  for (const secret of [PASSWORD, 'Confirmar entrega con el cliente', 'demo-rescue-106', '"records"']) assert.ok(!raw.includes(secret), 'el archivo no contiene en claro: ' + secret);
  const inspection = await inspectCapsule(kit, exported.name, PASSWORD);
  assert.equal(inspection.sha256, exported.sha256); assert.equal(inspection.revision, exported.revision); assert.equal(inspection.summary.uncertainOps.length, 1); assert.equal(inspection.summary.origin.stage, 'return-partial');
  assert.equal(inspection.summary.simCreates, 1); assert.equal(capsuleFiles(kit).length, 1, 'inspeccionar no escribe nada');
  const imported = await importCapsule(kit, { name: exported.name, password: PASSWORD, expectedSha256: inspection.sha256, expectedRevision: inspection.revision });
  assert.match(imported.destination.folder, /^rescue106-[0-9a-f-]{36}$/); assert.notEqual(imported.destination.roomId, viewOf(origin).context.workspaceId, 'el destino es OTRA sala');
  assert.equal(origin.logicalDigest(), before, 'importar NO modifica el origen');
  const dest = await openDest(imported.destination.folder);
  try {
    const state = await dest.get('/api/rescue/state');
    assert.equal(state.stage, 'return-partial'); assert.equal(state.context.captureRevision, viewOf(origin).context.captureRevision); assert.notEqual(state.context.workspaceId, viewOf(origin).context.workspaceId);
    assert.equal(state.crm.stats.calls.create, 1); assert.equal(state.crm.stats.records, 63, 'el simulador conserva el efecto anterior al timeout');
    const uncertain = state.returnPlan.operations.filter((o: { status: string }) => o.status === 'uncertain'); assert.equal(uncertain.length, 1, 'la incertidumbre se conserva, no pasa a pendiente');
    assert.equal(state.journal.total, viewOf(origin).journal.total + 1, 'diario del origen + el hecho de importación'); assert.equal(state.journal.events[0].kind, 'capsule-imported'); assert.equal(state.journal.events[0].actor, 'system');
    const wrong = await dest.post('resolve', { planId: state.returnPlan.id, operationId: uncertain[0].id, remoteId: 'crm-task-9999' }); assert.equal(wrong.status, 409, 'un ID incorrecto se rechaza');
    const found = await (await fetch(dest.url + 'api/rescue/candidates?planId=' + state.returnPlan.id + '&operationId=' + uncertain[0].id)).json() as { candidates: { id: string }[] }; assert.equal(found.candidates.length, 1);
    const ok = await dest.post('resolve', { planId: state.returnPlan.id, operationId: uncertain[0].id, remoteId: found.candidates[0].id }); assert.equal(ok.status, 200);
    assert.equal((await dest.post('approve', { planId: state.returnPlan.id })).status, 200, 'hay que aprobar de nuevo en el destino'); const done = await dest.post('apply', { planId: state.returnPlan.id }); assert.equal(done.body.result.status, 'complete');
    const end = await dest.get('/api/rescue/state'); assert.equal(end.crm.stats.calls.create, 1, 'un único create en total'); assert.equal(end.crm.stats.duplicateCreates, 0); assert.equal(end.crm.stats.records, 63);
  } finally { await dest.stop(); }
  assert.equal(origin.crm.stats().calls.create, 1, 'el origen sigue con su único create'); origin.close();
});

test('el destino de un origen con plan APROBADO retira la aprobación y exige revisar de nuevo (política de «aprobado»)', async () => {
  const kit = newKit(), origin = await originAt('approved'); assert.equal(viewOf(origin).returnPlan!.status, 'approved');
  const e = await exportCapsule(origin, PASSWORD, kit), insp = await inspectCapsule(kit, e.name, PASSWORD); assert.equal(insp.summary.approvedPlan, true); assert.ok(insp.summary.warnings.some(w => /aprobado/.test(w)));
  const imp = await importCapsule(kit, { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); const dest = await openDest(imp.destination.folder);
  try { const s = await dest.get('/api/rescue/state'); assert.equal(s.returnPlan.status, 'review'); assert.equal(s.returnPlan.approvedAt, null); const apply = await dest.post('apply', { planId: s.returnPlan.id }); assert.equal(apply.status, 409, 'no se envía nada sin aprobar de nuevo'); assert.equal((await dest.get('/api/rescue/state')).crm.stats.calls.update, 0);
    assert.ok(imp.retired.some(r => /Aprobación/.test(r))); } finally { await dest.stop(); }
  origin.close();
});

test('comparación origen/destino: sideOf del origen y del destino abierto en este proceso solo tras cerrar el escritor', async () => {
  const kit = newKit(), origin = await originAt('local-work'); const e = await exportCapsule(origin, PASSWORD, kit); const loaded = loadCapsule(kit, e.name, PASSWORD);
  assert.equal(sideOf(origin).stage, 'Trabajo local'); assert.equal(loaded.capsule.capture.recordCount, 63); assert.equal(loaded.capsule.capture.changeCount, 3); assert.equal(loaded.capsule.origin.version, viewOf(origin).version); assert.ok(TMP.length > 0 && envelope(origin).expectedVersion > 0); origin.close();
});
