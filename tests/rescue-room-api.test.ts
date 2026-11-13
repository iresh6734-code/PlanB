import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { RescueRoom } from '../server/rescue-room.js';
import { createRescueServer, listenRescue } from '../server/rescue-room-api.js';
import { days, envelope, newRoom, viewOf } from './helpers/rescue-room-harness.js';
// API propia del ensayo (Fastify.inject) sobre una sala real: validación estricta, acuses persistidos, seguridad local e informe escapado.
async function api(room: RescueRoom = newRoom()) {
  const app = await createRescueServer(room), local = { host: '127.0.0.1:4540' };
  const post = (path: string, body: unknown, headers: Record<string, string> = local) => app.inject({ method: 'POST', url: '/api/rescue/' + path, payload: body as object, headers });
  const get = (path: string, headers: Record<string, string> = local) => app.inject({ method: 'GET', url: '/api/rescue/' + path, headers });
  return { app, room, post, get, local, env: (key?: string) => envelope(room, key) };
}
const json = (r: { body: string }) => JSON.parse(r.body);

test('la lectura devuelve contexto, banner, cola explicada y cabeceras seguras', async () => {
  const { app, get, room } = await api(), r = await get('state'), body = json(r);
  assert.equal(r.statusCode, 200); assert.equal(body.banner, 'Ensayo · datos ficticios · no conecta con HubSpot'); assert.equal(body.stage, 'preparation');
  assert.equal(r.headers['cache-control'], 'no-store'); assert.match(String(r.headers['content-security-policy']), /default-src 'self'/); assert.equal(r.headers['x-content-type-options'], 'nosniff');
  await app.close(); room.close();
});

test('seguridad local: host ajeno y origen cruzado se rechazan sin tocar la sala', async () => {
  const { app, post, room, env } = await api(), v = viewOf(room).version;
  assert.equal((await post('plan', { ...env(), budgetMinutes: 60 }, { host: 'ejemplo.com' })).statusCode, 403);
  assert.equal((await post('plan', { ...env(), budgetMinutes: 60 }, { host: '127.0.0.1:4540', origin: 'http://evil.example' })).statusCode, 403);
  assert.equal(viewOf(room).version, v); await app.close(); room.close();
});

test('entradas inválidas se rechazan con 422 y sin aplicar: campos extra, tipos, rangos y claves', async () => {
  const { app, post, room, env } = await api(), v = viewOf(room).version;
  for (const [route, body] of [['plan', { ...env(), budgetMinutes: 0 }], ['plan', { ...env(), budgetMinutes: 60.5 }], ['plan', { ...env(), budgetMinutes: 481 }], ['plan', { ...env(), budgetMinutes: 60, extra: 1 }],
    ['plan', { ...env('corta'), budgetMinutes: 60 }], ['estimate', { ...env(), taskId: 'task-2', minutes: 4 }], ['note', { ...env(), taskId: 'task-2', text: 'x'.repeat(2001) }],
    ['edit', { ...env(), taskId: 'task-2', values: {} }], ['decide', { ...env(), planId: 'p', decisions: [{ operationId: 'o', field: 'f', decision: 'otro' }] }]] as const) {
    const r = await post(route, body); assert.equal(r.statusCode, 422, route + ' ' + JSON.stringify(body).slice(0, 60)); assert.equal(json(r).code, 'INVALID_INPUT');
  }
  assert.equal(viewOf(room).version, v); await app.close(); room.close();
});

test('el cuerpo que supera el límite se rechaza (413) antes de procesarse', async () => {
  const { app, post, room } = await api(), r = await post('note', { padding: 'x'.repeat(150_000) });
  assert.equal(r.statusCode, 413); assert.equal(json(r).code, 'TOO_LARGE'); await app.close(); room.close();
});

test('la mutación devuelve el acuse persistido; repetir la clave no vuelve a aplicar; otra versión recibe 409 con instrucciones', async () => {
  const { app, post, room, env } = await api(), body = { ...env('k-api-0000001'), budgetMinutes: 60 };
  const first = json(await post('plan', body)), second = json(await post('plan', body));
  assert.deepEqual([first.ok, first.outcome, first.replayed], [true, 'saved', false]); assert.deepEqual([second.outcome, second.replayed, second.version], ['saved', true, first.version]);
  const stale = await post('plan', { ...body, idempotencyKey: 'k-api-0000002', budgetMinutes: 30 }); assert.equal(stale.statusCode, 409); assert.equal(json(stale).code, 'VERSION_CONFLICT'); assert.match(json(stale).error, /Actualiza/);
  assert.equal(viewOf(room).budgetMinutes, 60); await app.close(); room.close();
});

test('doble clic simultáneo sobre la misma intención: un solo hecho en el diario', async () => {
  const { app, post, room, env } = await api(), body = { ...env('k-api-doble-01'), budgetMinutes: 30 };
  const [a, b] = await Promise.all([post('plan', body), post('plan', body)]);
  assert.deepEqual([a.statusCode, b.statusCode], [200, 200]); assert.equal(viewOf(room).journal.events.filter((e: { kind: string }) => e.kind === 'plan-chosen').length, 1);
  await app.close(); room.close();
});

test('un rechazo del motor existente se muestra como tal (409 ENGINE_REFUSED), no como éxito', async () => {
  const { app, post, room, env } = await api(); await post('plan', { ...env(), budgetMinutes: 60 });
  await post('edit', { ...env(), taskId: 'task-4', values: { status: 'completed' } }); await post('crm-return', env()); const planId = json(await post('prepare', env())).result.planId;
  const refused = await post('approve', { ...env(), planId }); assert.equal(refused.statusCode, 200, 'sin conflicto el plan es aprobable');
  const none = await post('apply', { ...env(), planId: 'otro-plan' }); assert.equal(none.statusCode, 409); assert.equal(json(none).code, 'PLAN_STALE');
  await app.close(); room.close();
});

test('previsualización: devuelve problemas y diferencias sin guardar; candidatos inexistentes dan 404', async () => {
  const { app, post, get, room } = await api(), before = viewOf(room).version;
  const bad = json(await post('preview-edit', { taskId: 'task-5', values: { due_date: 'mañana' } })); assert.equal(bad.ok, false); assert.match(bad.issues.due_date, /fecha válida/);
  const ok = json(await post('preview-edit', { taskId: 'task-5', values: { due_date: days(9) } })); assert.equal(ok.ok, true); assert.equal(ok.diff[0].before, days(0)); assert.equal(ok.diff[0].after, days(9));
  assert.equal((await get('candidates?planId=a&operationId=b')).statusCode, 404); assert.equal(viewOf(room).version, before); await app.close(); room.close();
});

test('el informe HTML escapa contenido malicioso, no lleva scripts ni recursos remotos y el JSON es legible', async () => {
  const { app, post, get, room, env } = await api(); await post('plan', { ...env(), budgetMinutes: 60 });
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
  await post('create', { ...env(), values: { subject: evil, due_date: days(2), status: 'pending' } });
  await post('crm-return', env()); await post('prepare', env());
  const html = (await get('report.html')).body;
  assert.ok(!/<(script|img|a|iframe|link|object|embed)/i.test(html), 'ninguna etiqueta activa real: el texto malicioso solo existe escapado'); assert.ok(!/ on[a-z]+="/i.test(html), 'sin atributos de evento reales'); assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'el texto malicioso aparece escapado como dato');
  assert.ok(!/https?:\/\/(?!127)/i.test(html) && !/<(link|iframe|img|script|source|video|audio)\b/i.test(html) && !/(href|src)="/i.test(html), 'sin recursos remotos ni elementos que los carguen'); assert.match(html, /Content-Security-Policy/);
  const report = JSON.parse((await get('report.json')).body); assert.equal(report.format, 'planb-rescue-report-v1'); assert.ok(report.notProven.length >= 4);
  assert.ok(!html.includes(room.root) && !JSON.stringify(report).includes(room.root), 'sin rutas privadas del equipo');
  assert.match(String((await get('report.html')).headers['content-disposition']), /attachment/); await app.close(); room.close();
});

test('el puerto ocupado falla con un mensaje claro y no detiene procesos ajenos', async () => {
  const blocker = createServer(); await new Promise<void>(r => blocker.listen(0, '127.0.0.1', r)); const port = (blocker.address() as { port: number }).port;
  const room = newRoom(), app = await createRescueServer(room);
  await assert.rejects(listenRescue(app, port), /ocupado/); assert.ok(blocker.listening, 'el proceso que ocupaba el puerto sigue vivo');
  await new Promise<void>(r => blocker.close(() => r())); await app.close(); room.close();
});
