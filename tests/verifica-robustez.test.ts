// Plan B Verifica · Mega Plan 3, fase 2 (robustez): la ficha de las fuentes se guarda al escribir y no se rehace en cada
// vista, y una lectura cortada por un reinicio deja constancia en vez de desaparecer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements } from '../server/verifica/engagements.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { engagementView, type ReadJob, type StoredSource } from '../shared/verifica/engagement.js';
import { exampleFiles } from '../scripts/verifica-ejemplo.js';
import { fakeHubspot, FAKE_PORTAL } from './helpers/fake-hubspot.js';

process.env.NODE_ENV = 'test';
const files = exampleFiles(true);

test('Verifica · la ficha de las fuentes se guarda al escribir y coincide con la que saldría de releerlas', async () => {
  const root = mkdtempSync(join(tmpdir(), 'planb-verifica-ficha-'));
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root, staticDir: root });
  registerVerificaEngagements(app, store);
  const id = (await app.inject({ method: 'POST', url: '/api/verifica/engagements', payload: { name: 'Ficha guardada' } })).json<{ engagement: { id: string } }>().engagement.id;
  for (const [role, file] of [['previous', 'antes.json'], ['latest', 'ahora.json'], ['invoices', 'facturas.csv']] as const) {
    assert.equal((await app.inject({ method: 'PUT', url: `/api/verifica/engagements/${id}/sources/${role}`, payload: { text: files.get(file)!, fileName: file } })).statusCode, 200);
  }
  const shown = (await app.inject({ method: 'GET', url: `/api/verifica/engagements/${id}` })).json<{ sources: unknown; missing: string[] }>();
  const stored = Object.fromEntries((['previous', 'latest', 'invoices', 'declarations'] as const).flatMap(role => {
    const s = store.get<StoredSource | null>(`verifica:source:${id}:${role}`, null); return s ? [[role, s]] : [];
  }));
  const fresh = engagementView({ id, name: 'Ficha guardada', createdAt: '', updatedAt: '' }, stored);
  assert.deepEqual(shown.sources, fresh.sources, 'la ficha guardada es la misma que la recalculada');
  assert.deepEqual(shown.missing, fresh.missing);
  assert.ok(store.get(`verifica:view:${id}`, null), 'la ficha está guardada');
  // Quitar una fuente rehace la ficha en la misma transacción.
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/verifica/engagements/${id}/sources/invoices` })).statusCode, 200);
  const after = (await app.inject({ method: 'GET', url: `/api/verifica/engagements/${id}` })).json<{ sources: Record<string, { status: string }> }>();
  assert.equal(after.sources.invoices.status, 'missing');
  // Un encargo de antes de este cambio, sin ficha guardada, la calcula la primera vez.
  store.db.prepare('DELETE FROM meta WHERE key=?').run(`verifica:view:${id}`);
  const rebuilt = (await app.inject({ method: 'GET', url: `/api/verifica/engagements/${id}` })).json<{ sources: Record<string, { status: string }> }>();
  assert.equal(rebuilt.sources.latest.status, 'ok');
  assert.ok(store.get(`verifica:view:${id}`, null));
});

test('Verifica · una lectura cortada por un reinicio queda como interrumpida, sin guardar nada, y se puede repetir', async () => {
  const root = mkdtempSync(join(tmpdir(), 'planb-verifica-corte-'));
  const capture = buildTrapCompany({ traps: true }).latest;
  const fake = fakeHubspot(capture);
  const never = (async () => new Promise<Response>(() => {})) as typeof fetch;
  const open = async (hubspotFetch: typeof fetch) => {
    const opened = await createBaseApp({ dbPath: join(root, 'verifica.sqlite'), root, staticDir: root });
    registerVerificaEngagements(opened.app, opened.store, { hubspotFetch, hubspotNow: () => new Date(capture.capturedAt) });
    return opened;
  };
  const first = await open(never);
  const url = '/api/verifica/engagements/' + (await first.app.inject({ method: 'POST', url: '/api/verifica/engagements', payload: { name: 'Corte' } })).json<{ engagement: { id: string } }>().engagement.id;
  const body = { mode: 'test', portalId: FAKE_PORTAL, token: 'pat-eu1-prueba-falsa-0000', target: 'latest', confirmFullRead: true };
  assert.equal((await first.app.inject({ method: 'POST', url: url + '/read', payload: body })).statusCode, 202);
  // Plan B se cierra con la lectura a medias.
  await first.app.close();
  const second = await open(fake.fetcher);
  const job = (await second.app.inject({ method: 'GET', url: url + '/read' })).json<{ job: ReadJob }>().job;
  assert.equal(job.state, 'failed');
  assert.match(job.error ?? '', /se cortó porque Plan B se cerró/);
  assert.ok(!JSON.stringify(job).includes('pat-eu1'), 'la credencial no se guardó con el estado');
  const view = (await second.app.inject({ method: 'GET', url })).json<{ sources: Record<string, { status: string }> }>();
  assert.equal(view.sources.latest.status, 'missing', 'no se guardó nada de la lectura cortada');
  // Se puede repetir.
  assert.equal((await second.app.inject({ method: 'POST', url: url + '/read', payload: body })).statusCode, 202);
  for (let i = 0; i < 200; i++) {
    const again = (await second.app.inject({ method: 'GET', url: url + '/read' })).json<{ job: ReadJob }>().job;
    if (again.state !== 'running') { assert.equal(again.state, 'done', again.error); break; }
    await new Promise(r => setTimeout(r, 10));
  }
  await second.app.close();
});

test('Verifica · la migración acepta un destino dentro de su presupuesto aunque pase del límite global de 20 MB', async () => {
  const root = mkdtempSync(join(tmpdir(), 'planb-verifica-migracion-'));
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root, staticDir: root });
  registerVerificaEngagements(app, store);
  const id = (await app.inject({ method: 'POST', url: '/api/verifica/engagements', payload: { name: 'Migración grande' } })).json<{ engagement: { id: string } }>().engagement.id;
  const target = 'x'.repeat(21 * 1024 * 1024);
  const res = await app.inject({ method: 'POST', url: `/api/verifica/engagements/${id}/watch/migration`, payload: { target, map: '{}', asOf: '2026-11-24' } });
  assert.notEqual(res.statusCode, 413, 'el cuerpo pasa: decide la ruta, no el límite global');
  assert.equal(res.statusCode, 404, 'sin vigilancia configurada, la ruta lo dice');
  await app.close();
});
