import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { createBaseApp } from '../../server/app.js';
import { registerVerificaEngagements } from '../../server/verifica/engagements.js';
import { defaultHubspotReaderLimits } from '../../server/verifica/hubspot-reader.js';
import { sha256Hex } from '../../shared/sha256.js';
import { ENGAGEMENT_LIMITS, type EngagementView, type ReadJob, type StoredSource } from '../../shared/verifica/engagement.js';
import { buildTrapCompany } from '../../shared/verifica/empresa-con-trampas.js';
import type { VerificaCapture } from '../../shared/verifica/model.js';
import { FAKE_PORTAL, fakeHubspot } from '../../tests/helpers/fake-hubspot.js';

type Scenario = 'pyme' | 'limite' | 'exceso';
const MIB = 1024 * 1024;
const ROOT_API = '/api/verifica/engagements';
const AT = '2026-11-24T10:00:00.000Z';

function fixture(scenario: Scenario): VerificaCapture {
  const capture = buildTrapCompany({ traps: false }).latest;
  if (scenario === 'pyme') return capture;
  const companies = 9_000, contacts = 15_000;
  const nearLimit = 99_000;
  const totalRecords = scenario === 'limite' ? nearLimit : defaultHubspotReaderLimits.maxRecords + 100;
  const deals = totalRecords - capture.owners.length - companies - contacts;
  const base = capture.deals[0]!;
  return {
    ...capture,
    companies: Array.from({ length: companies }, (_, i) => ({ id: `c-${i}`, name: `Compañía ficticia número ${i}`, customer: true })),
    contacts: Array.from({ length: contacts }, (_, i) => ({ id: `p-${i}`, name: `Contacto ficticio número ${i}`, email: `contacto${i}@example.test`, companyId: `c-${i % companies}` })),
    deals: Array.from({ length: deals }, (_, i) => ({ ...base, id: `d-${i}`, name: `Oportunidad ficticia número ${i}`, companyId: `c-${i % companies}` })),
  };
}

async function waitForRead(app: Awaited<ReturnType<typeof createBaseApp>>['app'], route: string): Promise<ReadJob> {
  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    const response = await app.inject({ method: 'GET', url: `${route}/read` });
    assert.equal(response.statusCode, 200);
    const { job } = response.json<{ job: ReadJob }>();
    if (job.state !== 'running') return job;
    await delay(25);
  }
  throw new Error('La lectura simulada no terminó en 120 s.');
}

async function run(scenario: Scenario) {
  const capture = fixture(scenario);
  const counts = { owners: capture.owners.length, companies: capture.companies.length, contacts: capture.contacts.length, deals: capture.deals.length };
  const fake = fakeHubspot(capture, { accountType: 'STANDARD' });
  const root = mkdtempSync(join(tmpdir(), 'planb-verifica-scale-'));
  const dbPath = join(root, 'verifica.sqlite');
  const signature = Buffer.from('%PDF-1.4 Acta ficticia para el ensayo local');
  const authorization = JSON.stringify({
    kind: 'verifica-read-authorization', version: 1, portalId: FAKE_PORTAL, engagement: 'VF-ESCALA-FICTICIA',
    authorizedBy: { name: 'Operadora de prueba', role: 'Operadora', company: 'Empresa ficticia' },
    signedOn: '2026-11-24', validUntil: '2026-11-25',
    scope: ['owners', 'companies', 'contacts', 'deals_with_history'], signedDocumentSha256: sha256Hex(signature),
  });
  const open = () => createBaseApp({ dbPath, root, staticDir: root });
  const { app, store } = await open();
  let id = '';
  let fingerprint = '';
  let verification:
    | { state: 'failed'; reason: string; storedSourcesAndRecords: number }
    | { state: 'done'; sourceBytes: number; encryptedRowBytes: number; databaseBytes: number; firstViewMs: number; storageMs: number; upload: { status: number; error?: string } };
  let elapsedMs = 0;
  let storageMs = 0;
  const transaction = store.transaction.bind(store);
  store.transaction = callback => {
    const started = performance.now();
    try { return transaction(callback); } finally { storageMs += performance.now() - started; }
  };

  try {
    registerVerificaEngagements(app, store, { hubspotFetch: fake.fetcher, hubspotNow: () => new Date(AT), now: () => AT });
    const created = await app.inject({ method: 'POST', url: ROOT_API, payload: { name: `Ensayo ficticio ${scenario}` } });
    assert.equal(created.statusCode, 201);
    id = created.json<EngagementView>().engagement.id;
    const route = `${ROOT_API}/${id}`;
    const started = performance.now();
    const read = await app.inject({ method: 'POST', url: `${route}/read`, payload: {
      mode: 'client', portalId: FAKE_PORTAL, target: 'latest', token: 'pat-simulador-ficticio', authorization, documentBase64: signature.toString('base64'),
    } });
    assert.equal(read.statusCode, 202);
    const job = await waitForRead(app, route);
    elapsedMs = performance.now() - started;

    if (scenario === 'exceso') {
      assert.equal(job.state, 'failed');
      assert.match(job.error ?? '', /máximo de registros/);
      const facts = store.db.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'verifica:source:%' OR key LIKE 'verifica:record%'").get() as { n: number };
      assert.equal(facts.n, 0);
      verification = { state: 'failed', reason: job.error!, storedSourcesAndRecords: facts.n };
    } else {
      assert.equal(job.state, 'done', job.error);
      assert.deepEqual(job.result?.counts, counts);
      const sourceKey = `verifica:source:${id}:latest`;
      const row = store.db.prepare('SELECT value FROM meta WHERE key = ?').get(sourceKey) as { value: string };
      assert.match(row.value, /^enc1:/);
      const source = store.get<StoredSource | null>(sourceKey, null);
      assert.ok(source);
      const firstViewStart = performance.now();
      const first = await app.inject({ method: 'GET', url: route });
      assert.equal(first.statusCode, 200);
      const latest = first.json<EngagementView>().sources.latest;
      const firstViewMs = performance.now() - firstViewStart;
      assert.equal(latest.status, 'ok');
      fingerprint = latest.fingerprint;
      const sourceBytes = Buffer.byteLength(source.text);
      const databaseBytes = statSync(dbPath).size;
      const upload = await app.inject({ method: 'PUT', url: `${route}/sources/latest`, payload: { text: source.text, fileName: 'captura.json' } });
      assert.ok([200, 413, 422].includes(upload.statusCode));
      if (source.text.length > ENGAGEMENT_LIMITS.sourceBytes) assert.notEqual(upload.statusCode, 200);
      verification = {
        state: 'done', sourceBytes, encryptedRowBytes: Buffer.byteLength(row.value), databaseBytes,
        firstViewMs: Math.round(firstViewMs), storageMs: Math.round(storageMs),
        upload: { status: upload.statusCode, ...(upload.statusCode === 200 ? {} : { error: upload.json<{ error: string }>().error }) },
      };
    }
  } finally {
    await app.close();
  }

  let reopenMs: number | null = null;
  if (verification.state === 'done') {
    const started = performance.now();
    const reopened = await open();
    try {
      registerVerificaEngagements(reopened.app, reopened.store);
      const route = `${ROOT_API}/${id}`;
      const response = await reopened.app.inject({ method: 'GET', url: route });
      assert.equal(response.statusCode, 200);
      const latest = response.json<EngagementView>().sources.latest;
      assert.equal(latest.status, 'ok');
      assert.equal(latest.fingerprint, fingerprint);
      const records = await reopened.app.inject({ method: 'GET', url: `${route}/records` });
      assert.equal(records.statusCode, 200);
      assert.equal(records.json<{ records: unknown[] }>().records.length, 1);
      reopenMs = Math.round(performance.now() - started);
    } finally {
      await reopened.app.close();
    }
  }
  console.log(JSON.stringify({
    scenario, root, counts, total: Object.values(counts).reduce((a, b) => a + b, 0), requests: fake.log.length,
    readerLimits: defaultHubspotReaderLimits, sourceLimit: ENGAGEMENT_LIMITS.sourceBytes,
    elapsedMs: Math.round(elapsedMs), reopenMs, peakRssMiB: Math.round(process.resourceUsage().maxRSS / (MIB / 1024)), verification,
  }, null, 2));
}

const selected = process.argv[2];
if (process.env.NODE_ENV !== 'test' || (selected !== 'pyme' && selected !== 'limite' && selected !== 'exceso')) {
  throw new Error('Ejecuta en NODE_ENV=test con uno de estos escenarios: pyme, limite, exceso.');
}
await run(selected);
