import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapsuleServer } from '../server/rescue-capsule-api.js';
import { PASSWORD, OTHER_PASSWORD, TMP, newKit, newRoom, trackFolder, viewOf } from './helpers/rescue-capsule-harness.js';
import { join } from 'node:path';
// Kit de Relevo · API propia (Fastify.inject sobre una sala real y una carpeta de kit nueva): seguridad local, contratos estrictos, contraseña solo en el cuerpo, informe escapado.
async function kitApi() {
  const kit = newKit(), origin = newRoom(), { app, stop } = await createCapsuleServer(origin, kit, {}), host = { host: '127.0.0.1:4540' };
  const post = (path: string, body: unknown, headers: Record<string, string> = host) => app.inject({ method: 'POST', url: '/api/capsule/' + path, payload: body as object, headers });
  const get = (path: string, headers: Record<string, string> = host) => app.inject({ method: 'GET', url: '/api/capsule/' + path, headers });
  return { kit, origin, app, stop, post, get, host };
}
const json = (r: { body: string }) => JSON.parse(r.body);

test('seguridad local: host ajeno y origen cruzado se rechazan sin tocar nada; cabeceras seguras', async () => {
  const k = await kitApi(), s = await k.get('state'); assert.equal(s.statusCode, 200); assert.equal(s.headers['cache-control'], 'no-store'); assert.match(String(s.headers['content-security-policy']), /default-src 'self'/);
  assert.equal((await k.post('export', { password: PASSWORD }, { host: 'ejemplo.com' })).statusCode, 403); assert.equal((await k.post('export', { password: PASSWORD }, { host: '127.0.0.1:4540', origin: 'http://evil.example' })).statusCode, 403);
  assert.equal(json(await k.get('state')).capsules.length, 0, 'nada se exportó'); await k.stop(); k.origin.close();
});

test('entradas inválidas: campos extra, nombres peligrosos, hashes mal formados y cuerpos enormes se rechazan sin efectos', async () => {
  const k = await kitApi();
  for (const [route, body] of [['export', { password: PASSWORD, extra: 1 }], ['export', {}], ['inspect', { name: '../x.capsule', password: PASSWORD }], ['inspect', { name: 'a.capsule', password: PASSWORD }], ['import', { name: 'relevo-0000001.capsule', password: PASSWORD, expectedSha256: 'xyz', expectedRevision: 'f'.repeat(64) }], ['open', { folder: '../../x' }], ['seed-origin', { x: 1 }]] as const) {
    const r = await k.post(route, body); assert.equal(r.statusCode, 422, route + ' ' + JSON.stringify(body).slice(0, 50)); assert.ok(!r.body.includes(PASSWORD), 'el error no devuelve la contraseña');
  }
  assert.equal((await k.post('export', { password: 'x'.repeat(150_000) })).statusCode, 413); await k.stop(); k.origin.close();
});

test('flujo completo por la API: sembrar origen, exportar, inspeccionar, importar (una vez) y abrir el destino en un proceso nuevo; la contraseña no se devuelve nunca', async () => {
  const k = await kitApi(); assert.equal((await k.post('seed-origin', {})).statusCode, 200); assert.equal(json(await k.post('seed-origin', {})).code, 'ORIGIN_NOT_FRESH', 'el guion solo parte de una sala recién abierta');
  const st = json(await k.get('state')); assert.equal(st.origin.stageKey, 'return-partial'); assert.equal(st.origin.uncertain, 1); assert.match(st.banner, /datos ficticios · mismo equipo, carpeta nueva/);
  const exp = await k.post('export', { password: PASSWORD }); assert.equal(exp.statusCode, 200); const e = json(exp); assert.equal(e.ok, true);
  const wrong = await k.post('inspect', { name: e.name, password: OTHER_PASSWORD }); assert.equal(wrong.statusCode, 422); assert.equal(json(wrong).code, 'DECRYPT_FAILED');
  const insp = json(await k.post('inspect', { name: e.name, password: PASSWORD })); assert.equal(insp.summary.uncertainOps.length, 1); assert.equal(insp.sha256, e.sha256);
  const imp = await k.post('import', { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); assert.equal(imp.statusCode, 200); const i = json(imp); trackFolder(join(TMP, i.destination.folder));
  const again = await k.post('import', { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }); assert.equal(again.statusCode, 409); assert.equal(json(again).code, 'ALREADY_IMPORTED');
  const opened = json(await k.post('open', { folder: i.destination.folder })); assert.equal(opened.ok, true); const dest = await (await fetch(opened.url + 'api/rescue/state')).json() as { stage: string; crm: { stats: { calls: { create: number } } } }; assert.equal(dest.stage, 'return-partial'); assert.equal(dest.crm.stats.calls.create, 1);
  assert.equal(json(await k.post('open', { folder: i.destination.folder })).reused, true);
  for (const body of [exp.body, imp.body, JSON.stringify(insp)]) assert.ok(!body.includes(PASSWORD)); await k.stop(); k.origin.close();
});

test('dos exportaciones simultáneas se serializan: publican dos cápsulas distintas y válidas de la MISMA versión del origen y este no cambia', async () => {
  const k = await kitApi(), before = k.origin.logicalDigest(), [a, b] = await Promise.all([k.post('export', { password: PASSWORD }), k.post('export', { password: PASSWORD })]);
  assert.deepEqual([a.statusCode, b.statusCode], [200, 200]); const na = json(a), nb = json(b); assert.notEqual(na.name, nb.name); assert.equal(json(await k.get('state')).capsules.length, 2);
  const ia = json(await k.post('inspect', { name: na.name, password: PASSWORD })), ib = json(await k.post('inspect', { name: nb.name, password: PASSWORD })); assert.equal(ia.summary.origin.version, ib.summary.origin.version); assert.equal(k.origin.logicalDigest(), before); await k.stop(); k.origin.close();
});

test('informe comparativo: HTML escapado y autocontenido, JSON legible, sin la contraseña ni rutas privadas; exige una exportación de esta sesión', async () => {
  const k = await kitApi(); assert.equal((await k.get('report.json?name=relevo-000000001.capsule')).statusCode, 404);
  await k.post('seed-origin', {}); const e = json(await k.post('export', { password: PASSWORD })), html = (await k.get('report.html?name=' + e.name)).body, rep = json(await k.get('report.json?name=' + e.name));
  assert.ok(!/<(script|img|a|iframe|link)\b/i.test(html) && !/(href|src)="/i.test(html), 'sin elementos activos ni recursos remotos'); assert.match(html, /Content-Security-Policy/); assert.equal(rep.format, 'planb-rescue-capsule-report-v1'); assert.match(rep.banner, /mismo equipo/); assert.ok(rep.notProven.length >= 4);
  for (const text of [html, JSON.stringify(rep)]) { assert.ok(!text.includes(PASSWORD)); assert.ok(!text.includes(k.kit.dir) && !text.includes(k.origin.root), 'sin rutas privadas'); }
  assert.match(String((await k.get('report.html?name=' + e.name)).headers['content-disposition']), /attachment/); assert.equal(viewOf(k.origin).stage, 'return-partial'); await k.stop(); k.origin.close();
});

test('recuperación de un reclamo en curso o abandonado: la API devuelve 409 CLAIM_RECOVERY_BUSY con un mensaje de dominio (no INTERNAL), sin contraseña ni rutas, y no cambia reclamo ni exclusión', async () => {
  const { spawn } = await import('node:child_process'), { writeFileSync, readFileSync } = await import('node:fs');
  const k = await kitApi(); await k.post('seed-origin', {}); const e = json(await k.post('export', { password: PASSWORD })), insp = json(await k.post('inspect', { name: e.name, password: PASSWORD }));
  const p = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore', windowsHide: true }); await new Promise(r => p.once('exit', r));
  const claim = join(k.kit.capsules, e.name + '.import-claim'), stale = JSON.stringify({ status: 'importing', destination: '90909090-9090-4909-8909-909090909090', pid: p.pid, owner: 'otra-instancia', at: 'x' }), lock = JSON.stringify({ pid: p.pid, owner: 'otra-instancia', token: 't', at: '2026-11-04T08:00:00.000Z' });
  writeFileSync(claim, stale); writeFileSync(claim + '.takeover', lock);
  const r = await k.post('import', { name: e.name, password: PASSWORD, expectedSha256: insp.sha256, expectedRevision: insp.revision }), b = json(r);
  assert.equal(r.statusCode, 409); assert.equal(b.code, 'CLAIM_RECOVERY_BUSY'); assert.match(b.error, /recuperación del reclamo/); assert.deepEqual({ pid: b.details.holderPid, alive: b.details.holderAlive }, { pid: p.pid, alive: false });
  assert.ok(!r.body.includes(PASSWORD) && !r.body.includes(k.kit.dir), 'sin contraseña ni rutas'); assert.equal(readFileSync(claim, 'utf8'), stale); assert.equal(readFileSync(claim + '.takeover', 'utf8'), lock);
  assert.equal(json(await k.get('state')).capsules.find((c: { name: string }) => c.name === e.name).imported, false, 'el estado no presenta la cápsula como importada'); await k.stop(); k.origin.close();
});
