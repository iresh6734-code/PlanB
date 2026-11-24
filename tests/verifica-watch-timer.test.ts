import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { readWithRecord } from '../server/verifica/hubspot-read.js';
import { createWatchTimer } from '../server/verifica/watch-timer.js';
import { sha256Hex } from '../shared/sha256.js';
import { buildWatchedCompany } from '../shared/verifica/empresa-vigilada.js';
import { READ_SCOPE, verifyReadRecord, type ReadAuthorization, type ReadRecord } from '../shared/verifica/read-authorization.js';
import { watchReportToJson } from '../shared/verifica/watch.js';
import { runCli } from '../scripts/verifica-vigilancia.js';
import { fakeHubspot, FAKE_PORTAL } from './helpers/fake-hubspot.js';

process.env.NODE_ENV = 'test';
const token = 'pat-ficticia-vigilancia-nunca-persistida';
const signedDocument = new TextEncoder().encode('%PDF documento ficticio de vigilancia semanal');
const signed: ReadAuthorization = {
  kind: 'verifica-read-authorization', version: 1, portalId: FAKE_PORTAL, engagement: 'VF-vigilancia',
  authorizedBy: { name: 'Persona Ficticia', role: 'Dirección', company: 'Prueba Ficticia S.L.' },
  signedOn: '2000-01-01', validUntil: '2099-12-31', scope: [...READ_SCOPE], signedDocumentSha256: sha256Hex(signedDocument),
};
const grant = { token, authorization: signed, signedDocument, confirmRecurring: true };
const company = buildWatchedCompany({ traps: true });

async function signing() {
  const read = await readWithRecord({ token, portalId: FAKE_PORTAL, mode: 'client', authorization: signed,
    now: () => new Date(company.signing.capturedAt), fetch: fakeHubspot(company.signing, { accountType: 'STANDARD' }).fetcher });
  assert.ok(read.record);
  return { captureText: read.captureText, record: read.record };
}

test('el temporizador programa una captura, retiene la caída y genera el mismo parte que el script al reabrir', async () => {
  const filename = join(mkdtempSync(join(tmpdir(), 'planb-watch-')), 'planb.sqlite');
  const original = await signing();
  const first = company.captures[0]!, shrink = company.captures[1]!;
  const fake = fakeHubspot(shrink, { accountType: 'STANDARD' });
  let now = new Date(company.signing.capturedAt);
  let store = new Store(filename);
  let timer = createWatchTimer(store, { now: () => now, fetcher: fake.fetcher, intervalMs: 10 });
  try {
    timer.setSigning('uno', original, company.salt);
    assert.throws(() => timer.resume('uno', { ...grant, confirmRecurring: false }), /documento firmado/);
    assert.throws(() => timer.resume('uno', { ...grant, signedDocument: new Uint8Array() }), /huella/);
    timer.resume('uno', grant);
    assert.equal(timer.status('uno').nextDue, first.capturedAt);
    await timer.poll();
    assert.equal(fake.log.length, 0);
    now = new Date(shrink.capturedAt);
    assert.equal(timer.status('uno').late, true);
    assert.equal(timer.report('uno').overdue?.kind, 'capture-missing');
    // El reloj está adelantado. La lectura la arranca el intervalo real, sin invocar poll.
    for (let i = 0; timer.status('uno').late && i < 100; i++) await delay(10);
    assert.ok(fake.log.length > 0);
    const report = timer.report('uno');
    const weekly = report.entries[1]!;
    assert.equal(report.entries.length, 2);
    assert.equal(weekly.status, 'retained');
    assert.ok(weekly.alerts.some(a => a.kind === 'capture-missing'));
    const saved = store.get<{ captureText: string; record: ReadRecord } | null>('verifica:watch-capture:uno:' + weekly.fingerprint, null);
    assert.ok(saved && verifyReadRecord(saved.record, saved.captureText));
    for (const { key } of store.db.prepare('SELECT key FROM meta').all()) assert.ok(!JSON.stringify(store.get(String(key), null)).includes(token));

    await timer.close();
    store.close();
    store = new Store(filename);
    timer = createWatchTimer(store, { now: () => now, fetcher: fake.fetcher });
    assert.equal(timer.status('uno').active, false);
    assert.equal(timer.report('uno').fingerprint, report.fingerprint);
    const files = new Map([['firma.json', original.captureText], ['semana.json', saved.captureText], ['sal.txt', company.salt]]);
    const code = await runCli(['--signing', 'firma.json', '--capture', 'semana.json', '--salt', 'sal.txt', '--report', 'parte.json', '--as-of', now.toISOString()], {
      out: () => {}, err: text => assert.fail(text), readText: async file => files.get(file)!, writeNew: async (file, text) => { files.set(file, text); },
    });
    assert.equal(code, 0);
    assert.equal(files.get('parte.json'), watchReportToJson(report));
    timer.accept('uno', weekly.fingerprint);
    assert.equal(timer.report('uno').entries[1]!.status, 'accepted');
  } finally {
    await timer.close();
    store.close();
  }
});

test('caducar o pausar evita otra lectura y descarta una captura aún en vuelo', async () => {
  const original = await signing();
  const store = new Store(':memory:');
  const weekly = company.captures[0]!;
  const fake = fakeHubspot(weekly, { accountType: 'STANDARD' });
  let now = new Date(company.signing.capturedAt);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = 0;
  const timer = createWatchTimer(store, { now: () => now, fetcher: async (input, init) => {
    started++;
    await gate;
    return fake.fetcher(input, init);
  } });
  try {
    timer.setSigning('uno', original, company.salt);
    timer.resume('uno', { ...grant, authorization: { ...signed, validUntil: company.signing.capturedAt.slice(0, 10) } });
    now = new Date(weekly.capturedAt);
    await timer.poll();
    assert.equal(started, 0);
    assert.equal(timer.status('uno').active, false);
    timer.resume('uno', grant);
    const pending = timer.poll();
    assert.equal(timer.poll(), pending);
    assert.equal(started, 1);
    timer.pause('uno');
    release();
    await pending;
    assert.equal(timer.report('uno').entries.length, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM meta WHERE key LIKE 'verifica:watch-capture:uno:%'").get()?.count, 1);
  } finally {
    release();
    await timer.close();
    store.close();
  }
});

test('un fallo al actualizar la agenda revierte la captura semanal y permite reintentar', async () => {
  const original = await signing();
  const store = new Store(':memory:');
  const weekly = company.captures[0]!;
  const fake = fakeHubspot(weekly, { accountType: 'STANDARD' });
  let now = new Date(company.signing.capturedAt);
  const timer = createWatchTimer(store, { now: () => now, fetcher: fake.fetcher });
  try {
    timer.setSigning('uno', original, company.salt);
    timer.resume('uno', grant);
    now = new Date(weekly.capturedAt);
    store.db.exec(`CREATE TEMP TRIGGER refuse_week BEFORE UPDATE ON meta
      WHEN old.key = 'verifica:watch:uno' AND (SELECT COUNT(*) FROM meta WHERE key LIKE 'verifica:watch-capture:uno:%') > 1
      BEGIN SELECT RAISE(ABORT, 'fallo de ensayo'); END;`);
    const count = () => store.db.prepare("SELECT COUNT(*) AS count FROM meta WHERE key LIKE 'verifica:watch-capture:uno:%'").get()?.count;
    await timer.poll();
    assert.equal(count(), 1);
    assert.equal(timer.report('uno').entries.length, 1);
    const retry = timer.status('uno').retriesAfter;
    assert.equal(Date.parse(retry!), now.getTime() + 3_600_000);
    const attempts = fake.log.length;
    await timer.poll();
    assert.equal(fake.log.length, attempts);
    store.db.exec('DROP TRIGGER refuse_week');
    now = new Date(retry!);
    await timer.poll();
    assert.equal(count(), 2);
    assert.equal(timer.report('uno').entries.length, 2);
    assert.equal(timer.status('uno').retriesAfter, null);
  } finally {
    await timer.close();
    store.close();
  }
});
