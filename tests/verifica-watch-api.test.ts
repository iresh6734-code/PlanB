import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createBaseApp } from '../server/app.js';
import { registerVerificaEngagements } from '../server/verifica/engagements.js';
import { sha256Hex } from '../shared/sha256.js';
import type { ReadJob, StoredSource } from '../shared/verifica/engagement.js';
import { buildWatchedCompany } from '../shared/verifica/empresa-vigilada.js';
import { buildMigratedCompany } from '../shared/verifica/empresa-migrada.js';
import { equivalenceToJson, verifyEquivalenceReport } from '../shared/verifica/equivalence.js';
import { parseCaptureText } from '../shared/verifica/inputs.js';
import { equivalenceWorkList, prepareEquivalenceFiles, releaseEquivalence } from '../shared/verifica/migration.js';
import { READ_SCOPE, verifyReadRecord, type ReadAuthorization, type ReadRecord } from '../shared/verifica/read-authorization.js';
import { watchMigrationUrl, watchUrl, type WatchMigrationResult, type WatchReportResult, type WatchView } from '../shared/verifica/watch-contract.js';
import { verifyWatchReport, watchReportToJson } from '../shared/verifica/watch.js';
import { FAKE_PORTAL, fakeHubspot } from './helpers/fake-hubspot.js';

process.env.NODE_ENV = 'test';
const token = 'pat-ficticia-vigilancia-api';
const document = Buffer.from('%PDF-1.4 · autorización ficticia de las lecturas semanales');
const dossier: ReadAuthorization = { kind: 'verifica-read-authorization', version: 1, portalId: FAKE_PORTAL, engagement: 'VF-API',
  authorizedBy: { name: 'Ficticia Cedente', role: 'Dirección', company: 'Ficticia S.L.' }, signedOn: '2000-01-01', validUntil: '2099-12-31',
  scope: [...READ_SCOPE], signedDocumentSha256: sha256Hex(document) };
const grant = { authorization: JSON.stringify(dossier), documentBase64: document.toString('base64'), token };

test('la ruta del encargo vigila desde la captura firmada, detecta un retraso y permite revisar y pausar', async () => {
  const company = buildWatchedCompany({ traps: true });
  const root = mkdtempSync(join(tmpdir(), 'planb-watch-api-'));
  const { app, store } = await createBaseApp({ root, dbPath: join(root, 'planb.sqlite'), staticDir: root });
  const signingTransport = fakeHubspot(company.signing, { accountType: 'STANDARD' });
  const weeklyTransport = fakeHubspot(company.captures[1]!, { accountType: 'STANDARD' });
  let fake = signingTransport;
  let now = new Date(company.signing.capturedAt);
  const timer = registerVerificaEngagements(app, store, { hubspotNow: () => now, hubspotFetch: (...args) => fake.fetcher(...args) });
  async function create(name: string) {
    const res = await app.inject({ method: 'POST', url: '/api/verifica/engagements', payload: { name } });
    assert.equal(res.statusCode, 201);
    return res.json<{ engagement: { id: string } }>().engagement.id;
  }
  try {
    const id = await create('Vigilancia de ensayo');
    const other = await create('Otro encargo');
    const base = '/api/verifica/engagements/' + id;
    const url = watchUrl(id);
    const view = async () => {
      const res = await app.inject(url);
      assert.equal(res.statusCode, 200, res.body);
      return res.json<WatchView>();
    };
    const post = (payload: object) => app.inject({ method: 'POST', url, payload });
    const report = async () => {
      const res = await app.inject(url + '/artifacts/report');
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.doesNotMatch(res.body, /Ficticia Cedente|pat-ficticia-vigilancia-api|captureText/);
      const { report } = res.json<WatchReportResult>();
      assert.equal(verifyWatchReport(report), true);
      return report;
    };
    assert.deepEqual(await view(), { name: 'Vigilancia de ensayo', schedule: null, choices: [] });
    assert.equal((await app.inject(url + '/artifacts/salt')).statusCode, 404);
    assert.equal((await app.inject({ url, headers: { origin: 'http://127.0.0.1:4999' } })).statusCode, 403);

    const started = await app.inject({ method: 'POST', url: base + '/read', payload: { ...grant, mode: 'client', portalId: FAKE_PORTAL, target: 'latest' } });
    assert.equal(started.statusCode, 202, started.body);
    let job: ReadJob | null = null;
    for (let i = 0; i < 100; i++) {
      ({ job } = (await app.inject(base + '/read')).json<{ job: ReadJob }>());
      if (job.state !== 'running') break;
      await delay(10);
    }
    assert.equal(job?.state, 'done', job?.error);
    const source = store.get<StoredSource | null>('verifica:source:' + id + ':latest', null);
    assert.ok(source);
    const upload = await app.inject({ method: 'PUT', url: '/api/verifica/engagements/' + other + '/sources/latest', payload: { text: source.text, fileName: source.fileName } });
    assert.equal(upload.statusCode, 200, upload.body);
    assert.deepEqual((await app.inject(watchUrl(other))).json<WatchView>().choices, []);

    const available = await view();
    const choice = available.choices?.[0];
    assert.ok(choice && choice.role === 'latest');
    assert.equal((await post({ action: 'set-signing', role: 'latest', fingerprint: 'f'.repeat(64) })).statusCode, 409);
    const fixed = await post({ action: 'set-signing', role: 'latest', fingerprint: choice.fingerprint, salt: company.salt });
    assert.equal(fixed.statusCode, 200, fixed.body);
    assert.doesNotMatch(fixed.body, /captureText|\bsalt\b/);
    assert.equal(fixed.json<WatchView>().schedule?.signing.fingerprint, choice.fingerprint);
    assert.equal((await app.inject(url + '/artifacts/salt')).body, company.salt + '\n');

    now = new Date(company.captures[1]!.capturedAt);
    fake = weeklyTransport;
    assert.equal((await view()).schedule?.late, true);
    assert.equal((await report()).overdue?.kind, 'capture-missing');
    assert.equal((await post({ action: 'resume', ...grant, confirmRecurring: false })).statusCode, 422);
    assert.equal((await post({ action: 'resume', ...grant, confirmRecurring: true, authorization: JSON.stringify({ ...dossier, engagement: 'Otro contrato' }) })).statusCode, 422);
    assert.equal(weeklyTransport.log.length, 0);
    assert.equal((await post({ action: 'resume', ...grant, confirmRecurring: true })).json<WatchView>().schedule?.active, true);
    await timer.poll();
    const after = await view();
    assert.equal(after.schedule?.weeklyCount, 1);
    assert.equal(after.schedule?.late, false);
    const week = (await report()).entries[1]!;
    assert.equal(week.status, 'retained');
    assert.ok(week.alerts.some(alert => alert.kind === 'capture-missing'));
    const observed = store.get<{ record: ReadRecord; captureText: string } | null>('verifica:watch-capture:' + id + ':' + week.fingerprint, null);
    assert.ok(observed && verifyReadRecord(observed.record, observed.captureText));
    assert.equal((await post({ action: 'accept', fingerprint: week.fingerprint, confirmed: false })).statusCode, 422);
    const migrationUrl = watchMigrationUrl(id);
    const migrated = buildMigratedCompany({ traps: false });
    const closingCapture = parseCaptureText(observed.captureText, 'La captura');
    const asOf = '2099-01-01';
    const map = { ...migrated.map, sourceProvider: closingCapture.source, sourceAccountId: closingCapture.id };
    const migration = { target: JSON.stringify(migrated.target), map: JSON.stringify(map), asOf };
    const blocked = await app.inject({ method: 'POST', url: migrationUrl, payload: migration });
    assert.equal(blocked.statusCode, 409, blocked.body);
    assert.match(blocked.body, /retenida/);
    assert.equal((await app.inject({ method: 'POST', url: watchMigrationUrl(other), payload: migration })).statusCode, 404);
    assert.equal((await post({ action: 'accept', fingerprint: week.fingerprint, confirmed: true })).statusCode, 200);
    assert.equal((await report()).entries[1]!.status, 'accepted');

    assert.equal((await app.inject({ method: 'POST', url: migrationUrl, payload: { ...migration, map: '{' } })).statusCode, 422);
    assert.equal((await app.inject({ method: 'POST', url: migrationUrl, payload: { ...migration, asOf: '2099-02-31' } })).statusCode, 422);
    const compared = await app.inject({ method: 'POST', url: migrationUrl, payload: migration });
    assert.equal(compared.statusCode, 200, compared.body);
    assert.equal(compared.headers['cache-control'], 'no-store');
    const result = compared.json<WatchMigrationResult>();
    assert.equal(verifyEquivalenceReport(result.report), true);
    assert.equal(result.report.closing.fingerprint, week.fingerprint);
    // Mismo resultado que subir a mano la captura de cierre, el parte y la sal descargados para esa fecha.
    const manual = releaseEquivalence(prepareEquivalenceFiles({ closing: observed.captureText, target: migration.target, map: migration.map,
      watch: watchReportToJson(timer.report(id, new Date(asOf).toISOString())), salt: company.salt + '\n', asOf }).input);
    assert.equal(equivalenceToJson(result.report), equivalenceToJson(manual.report));
    assert.equal(result.workList, equivalenceWorkList(manual.comparison));

    assert.equal((await post({ action: 'pause' })).json<WatchView>().schedule?.active, false);
    now = new Date(company.captures[2]!.capturedAt);
    const previousRequests = weeklyTransport.log.length;
    await timer.poll();
    assert.equal(weeklyTransport.log.length, previousRequests);

    const protect = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', payload: { password: 'clave-ficticia-solo-pruebas-2026' } });
    assert.equal(protect.statusCode, 200, protect.body);
    assert.equal((await app.inject(url + '/artifacts/salt')).statusCode, 401);
  } finally {
    await app.close();
  }
});
