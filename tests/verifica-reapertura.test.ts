import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements } from '../server/verifica/engagements.js';
import { engagementLedger } from '../server/verifica/expediente-store.js';
import { sha256Hex } from '../shared/sha256.js';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import type { ReadJob, ReadRequest, RecordSummary, StoredSource } from '../shared/verifica/engagement.js';
import { verifyLedger } from '../shared/verifica/expediente.js';
import { FAKE_PORTAL, fakeHubspot } from './helpers/fake-hubspot.js';

type App = Awaited<ReturnType<typeof createBaseApp>>['app'];

async function completed(app: App, url: string, request: ReadRequest): Promise<ReadJob> {
  const started = await app.inject({ method: 'POST', url: `${url}/read`, payload: request });
  assert.equal(started.statusCode, 202, started.body);
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = await app.inject({ method: 'GET', url: `${url}/read` });
    assert.equal(status.statusCode, 200);
    const { job } = status.json<{ job: ReadJob }>();
    if (job.state !== 'running') return job;
    await delay(10);
  }
  throw new Error('La lectura simulada no terminó.');
}

test('Verifica · una transacción fallida conserva las capturas y actas al reabrir SQLite', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  const root = mkdtempSync(join(tmpdir(), 'planb-verifica-reapertura-'));
  const capture = buildTrapCompany({ traps: true }).latest;
  const fake = fakeHubspot(capture, { accountType: 'STANDARD' });
  let timestamp = Date.parse(capture.capturedAt);
  const now = () => new Date(timestamp);
  const open = async () => {
    const opened = await createBaseApp({ dbPath: join(root, 'verifica.sqlite'), root, staticDir: root });
    registerVerificaEngagements(opened.app, opened.store, { hubspotFetch: fake.fetcher, hubspotNow: now, now: () => now().toISOString() });
    return opened;
  };
  const signature = Buffer.from('Autorización de prueba para la reapertura');
  const request: ReadRequest = {
    mode: 'client', portalId: FAKE_PORTAL, token: 'pat-ficticio-reapertura', target: 'latest',
    authorization: JSON.stringify({
      kind: 'verifica-read-authorization', version: 1, portalId: FAKE_PORTAL, engagement: 'VF-REAPERTURA',
      authorizedBy: { name: 'Operadora ficticia', role: 'Dirección', company: 'Empresa ficticia' },
      signedOn: '2026-01-01', validUntil: '2027-01-01',
      scope: ['owners', 'companies', 'contacts', 'deals_with_history'], signedDocumentSha256: sha256Hex(signature),
    }),
    documentBase64: signature.toString('base64'),
  };
  // El estado de la lectura se guarda a propósito (Mega Plan 3, fase 2) y no es parte del expediente ni de sus documentos.
  const rows = (opened: Awaited<ReturnType<typeof open>>) => opened.store.db
    .prepare("SELECT key, value FROM meta WHERE key LIKE 'verifica:%' AND key NOT LIKE 'verifica:readjob:%' ORDER BY key").all();
  const records = async (app: App, url: string) => {
    const response = await app.inject({ method: 'GET', url: `${url}/records` });
    assert.equal(response.statusCode, 200);
    return response.json<{ records: RecordSummary[] }>().records;
  };

  const original = await open();
  let id: string, url: string, snapshot: ReturnType<typeof rows>, previousRecords: RecordSummary[], previousLatest: StoredSource;
  try {
    const created = await original.app.inject({ method: 'POST', url: '/api/verifica/engagements', payload: { name: 'Ensayo de reapertura' } });
    assert.equal(created.statusCode, 201);
    id = created.json<{ engagement: { id: string } }>().engagement.id;
    url = `/api/verifica/engagements/${id}`;
    assert.equal((await completed(original.app, url, { ...request, target: 'previous' })).state, 'done');
    timestamp += 1000;
    assert.equal((await completed(original.app, url, request)).state, 'done');
    const saved = original.store.get<StoredSource | null>(`verifica:source:${id}:latest`, null);
    assert.ok(saved);
    previousLatest = saved;
    snapshot = rows(original);
    assert.ok(snapshot.every(row => String(row.value).startsWith('enc1:')));
    previousRecords = await records(original.app, url);
    assert.equal(previousRecords.length, 2);
    original.store.db.exec(`CREATE TEMP TRIGGER stop_engagement_touch BEFORE UPDATE ON meta
      WHEN NEW.key = 'verifica:engagements' BEGIN SELECT RAISE(ABORT, 'fallo de guardado simulado'); END;`);
    timestamp += 1000;
    const failed = await completed(original.app, url, { ...request, target: 'rotate' });
    assert.equal(failed.state, 'failed');
    assert.match(failed.error ?? '', /no se pudo guardar/i);
  } finally {
    await original.app.close();
  }

  const reopened = await open();
  let retriedId: string;
  try {
    assert.deepEqual(rows(reopened), snapshot);
    assert.deepEqual(await records(reopened.app, url), previousRecords);
    const retry = await completed(reopened.app, url, { ...request, target: 'rotate' });
    assert.equal(retry.state, 'done', retry.error);
    assert.ok(retry.result?.captureId);
    retriedId = retry.result.captureId;
  } finally {
    await reopened.app.close();
  }

  const committed = await open();
  try {
    assert.deepEqual(committed.store.get(`verifica:source:${id}:previous`, null), previousLatest);
    assert.equal((await records(committed.app, url)).length, 3);
    const act = await committed.app.inject({ method: 'GET', url: `${url}/records/${encodeURIComponent(retriedId)}` });
    assert.equal(act.statusCode, 200);
    const latest = committed.store.get<StoredSource | null>(`verifica:source:${id}:latest`, null);
    assert.ok(latest);
    assert.equal(act.json<{ captureSha256: string }>().captureSha256, sha256Hex(latest.text));
    const ledger = engagementLedger(committed.store, id);
    assert.deepEqual(ledger.map(entry => [entry.sequence, entry.data.role, entry.data.origin]), [
      [1, 'previous', 'hubspot-read'], [2, 'latest', 'hubspot-read'], [3, 'previous', 'rotate'], [4, 'latest', 'hubspot-read'],
    ], 'la lectura fallida no dejó entrada');
    assert.equal(verifyLedger(ledger, { engagement: id }).intact, true);
    assert.ok(ledger[2].refs.some(ref => ref.method === 'sha256-bytes-v1' && ref.fingerprint === sha256Hex(previousLatest.text) && !ref.replaced));
    const actFingerprint = act.json<{ fingerprint: string }>().fingerprint;
    assert.deepEqual(ledger[3].refs.filter(ref => ref.kind !== 'capture'), [
      { kind: 'read-record', method: 'verifica-read-record-v1', fingerprint: actFingerprint },
      { kind: 'authorization-document', method: 'sha256-bytes-v1', fingerprint: sha256Hex(signature) },
    ]);
  } finally {
    await committed.app.close();
  }
});
