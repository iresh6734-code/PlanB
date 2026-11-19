import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import type { Store } from '../server/store.js';

const route = '/api/v7/local-operations';
const headers = { host: '127.0.0.1:4585', origin: 'http://127.0.0.1:4585' };
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function rows(store: Store) {
  return Object.fromEntries(['meta', 'records', 'changes', 'captures', 'archives', 'usage'].map(table => [table,
    sha(store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())]));
}
async function fixture(active = false, name?: string) {
  const root = resolve('tests/.tmp/mount120-' + randomUUID());
  const result = await createBaseApp({ dbPath: ':memory:', root, staticDir: resolve(root, 'no-assets') });
  const snapshot = makeFixture('agency');
  if (name !== undefined) snapshot.name = name;
  result.store.importSnapshot(snapshot);
  if (active) {
    result.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, prompt: '', generatedAt: '2026-11-02T07:00:00Z', approved: false });
    result.store.activate();
  }
  return { ...result, snapshot };
}

test('mount120: imported production-shaped fiction is readable before activation and GET changes no tables', async () => {
  const { app, store, snapshot } = await fixture();
  try {
    // Only the flag of newly generated fiction changes. No real HubSpot data or account is involved.
    store.set('snapshot', { ...store.snapshot!, source: { ...store.snapshot!.source, isTestData: false } });
    const before = rows(store);
    const response = await app.inject({ method: 'GET', url: route, headers });
    assert.equal(response.statusCode, 200);
    const value = response.json();
    assert.equal(value.context.instanceId, store.get('instanceId', null));
    assert.equal(value.context.captureId, snapshot.id);
    assert.equal(value.context.phase, 'imported'); assert.equal(value.context.isTestData, false);
    assert.equal(value.counts.records, 62); assert.equal(value.counts.tasks, 18);
    assert.equal(value.counts.completed, 4); assert.equal(value.counts.open, 14);
    assert.equal(value.lastReview, null); assert.equal(store.spec, null); assert.equal(store.ready, false);
    assert.match(value.revision, /^[a-f0-9]{64}$/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(String(response.headers.vary), /Cookie/i);
    const again = await app.inject({ method: 'GET', url: route, headers });
    assert.equal(again.json().revision, value.revision);
    assert.deepEqual(rows(store), before);
  } finally { await app.close(); }
});

test('mount120: real App Host, Origin and password gates protect reads and review writes', async () => {
  const { app, store } = await fixture();
  try {
    const before = rows(store);
    assert.equal((await app.inject({ method: 'GET', url: route, headers: { host: 'untrusted.example' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: route, headers: { ...headers, origin: 'https://untrusted.example' } })).statusCode, 403);
    assert.deepEqual(rows(store), before);
    const setup = await app.inject({ method: 'POST', url: '/api/v2/auth/setup', headers, payload: { password: 'fiction-only-mount120-password' } });
    assert.equal(setup.statusCode, 200);
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const locked = rows(store);
    assert.equal((await app.inject({ method: 'GET', url: route, headers })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: { revision: 'a'.repeat(64), idempotencyKey: randomUUID() } })).statusCode, 401);
    assert.deepEqual(rows(store), locked);
    const good = await app.inject({ method: 'GET', url: route, headers: { ...headers, cookie } });
    assert.equal(good.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: route, headers: { ...headers, cookie, origin: 'https://untrusted.example' } })).statusCode, 403);
    assert.deepEqual(rows(store), locked);
  } finally { await app.close(); }
});

test('mount120: review receipts persist once, stale new requests fail and confirmed replays stay explicitly stale', async () => {
  const { app, store } = await fixture(true);
  try {
    const initial = (await app.inject({ method: 'GET', url: route, headers })).json();
    const recordsBefore = rows(store).records, changesBefore = rows(store).changes;
    const body = { revision: initial.revision, idempotencyKey: randomUUID() };
    const first = await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: body });
    assert.equal(first.statusCode, 200); assert.equal(first.json().ok, true); assert.equal(first.json().replayed, false);
    const saved = rows(store);
    const replay = await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: body });
    assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true);
    assert.equal(replay.json().review.id, first.json().review.id);
    assert.deepEqual(rows(store), saved);
    assert.equal(saved.records, recordsBefore); assert.equal(saved.changes, changesBefore);
    const read = (await app.inject({ method: 'GET', url: route, headers })).json();
    assert.equal(read.lastReview.id, first.json().review.id); assert.equal(read.lastReview.stale, false);
    store.saveRecord('tasks', { subject: 'Otro valor ficticio tras la revisión120' }, 'task-2');
    const changed = rows(store);
    const stale = await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: { ...body, idempotencyKey: randomUUID() } });
    assert.equal(stale.statusCode, 409); assert.deepEqual(rows(store), changed);
    const oldReceipt = await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: body });
    assert.equal(oldReceipt.statusCode, 200); assert.equal(oldReceipt.json().replayed, true); assert.equal(oldReceipt.json().review.stale, true);
    assert.deepEqual(rows(store), changed);
  } finally { await app.close(); }
});

test('mount120: instances stay separate and a pending candidate does not replace the active copy in operations', async () => {
  const a = await fixture(true), b = await fixture();
  try {
    const original = (await a.app.inject({ method: 'GET', url: route, headers })).json();
    a.store.importSnapshot(makeFixture('distribution'));
    assert.ok(a.store.candidate); assert.equal(a.store.snapshot!.id, a.snapshot.id);
    const after = (await a.app.inject({ method: 'GET', url: route, headers })).json();
    assert.equal(after.context.captureId, a.snapshot.id); assert.equal(after.context.phase, 'active');
    assert.equal(after.revision, original.revision);
    const other = (await b.app.inject({ method: 'GET', url: route, headers })).json();
    assert.notEqual(after.context.instanceId, other.context.instanceId); assert.notEqual(after.revision, other.revision);
    const response = await a.app.inject({ method: 'POST', url: route + '/reviews', headers, payload: { revision: other.revision, idempotencyKey: randomUUID() } });
    assert.equal(response.statusCode, 409);
    assert.equal((await a.app.inject({ method: 'GET', url: route, headers })).json().lastReview, null);
    assert.equal((await b.app.inject({ method: 'GET', url: route, headers })).json().lastReview, null);
  } finally { await a.app.close(); await b.app.close(); }
});

test('mount120: malformed history preserves readable tasks, blocks review writes and never replaces the saved history', async () => {
  const { app, store } = await fixture();
  try {
    store.set('localOperations:reviews:v1', { invalid: 'synthetic-marker-do-not-echo120' });
    const before = rows(store);
    for (const method of ['GET', 'POST'] as const) {
      const response = await app.inject({ method, url: route + (method === 'POST' ? '/reviews' : ''), headers,
        ...(method === 'POST' ? { payload: { revision: 'b'.repeat(64), idempotencyKey: randomUUID() } } : {}) });
      assert.equal(response.statusCode, method === 'GET' ? 200 : 409);
      if (method === 'GET') {
        assert.equal(response.json().reviewable, false);
        assert.equal(response.json().lastReview, null);
        assert.equal(response.json().counts.tasks, 18);
        assert.equal(response.json().tasks.length, 14);
        assert.match(response.json().unavailableReason, /historial/);
      }
      assert.doesNotMatch(response.body, /synthetic-marker-do-not-echo120/);
      assert.deepEqual(rows(store), before);
    }
  } finally { await app.close(); }
});

test('mount120: a historical receipt keeps its original counts while the live queue is evaluated on a later day', async () => {
  let now = Date.parse('2026-11-02T10:00:00Z');
  const originalNow = Date.now;
  let created: Awaited<ReturnType<typeof fixture>>;
  // Only registration captures this test clock. No endpoint exposes a selectable clock.
  try { Date.now = () => now; created = await fixture(true); }
  finally { Date.now = originalNow; }
  const { app, store } = created;
  try {
    store.saveRecord('tasks', { due_date: '2026-11-02', status: 'pending' }, 'task-2');
    const before = (await app.inject({ method: 'GET', url: route, headers })).json();
    const body = { revision: before.revision, idempotencyKey: randomUUID() };
    const saved = (await app.inject({ method: 'POST', url: route + '/reviews', headers, payload: body })).json();
    assert.equal(saved.ok, true); assert.equal(saved.review.at, before.evaluatedAt);
    const digestBefore = rows(store);
    now = Date.parse('2026-11-04T10:00:00Z');
    const after = (await app.inject({ method: 'GET', url: route, headers })).json();
    assert.equal(after.revision, before.revision, 'revision identifies data, not a promise that an old review is current');
    assert.equal(after.evaluatedAt, new Date(now).toISOString());
    assert.ok(after.counts.overdue > before.counts.overdue);
    assert.equal(after.lastReview.id, saved.review.id);
    assert.equal(after.lastReview.at, before.evaluatedAt);
    assert.equal(after.lastReview.overdue, before.counts.overdue);
    assert.equal(after.lastReview.stale, false, 'stale only identifies changed data; the receipt stays explicitly dated');
    assert.deepEqual(rows(store), digestBefore);
  } finally { await app.close(); }
});

test('mount120: valid long capture names cannot hide the imported task inventory', async () => {
  for (const name of ['N'.repeat(100), 'N'.repeat(101), 'N'.repeat(501), 'Título 😀'.repeat(100)]) {
    const { app, store } = await fixture(false, name);
    try {
      assert.equal(store.snapshot!.name, name, 'the real Store accepted and retained this valid snapshot name');
      const before = rows(store);
      const response = await app.inject({ method: 'GET', url: route, headers });
      assert.equal(response.statusCode, 200, 'captured metadata must not be revalidated as a generated AppSpec title: name length ' + name.length);
      const value = response.json();
      assert.equal(value.context.phase, 'imported'); assert.equal(value.counts.tasks, 18); assert.equal(value.tasks.length, 14);
      assert.ok(value.context.name.length <= 500, 'display metadata follows the bounded public contract');
      assert.equal(/\p{Surrogate}/u.test(value.context.name), false, 'clipping must preserve supplementary Unicode');
      assert.deepEqual(rows(store), before);
      assert.equal(store.snapshot!.name, name, 'do not rewrite the source to make the view valid');
    } finally { await app.close(); }
  }
});
