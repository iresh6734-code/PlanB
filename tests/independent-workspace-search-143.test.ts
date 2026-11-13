import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseApp } from '../server/app.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';

test('search revision identifies installation and source account and rejects a selection from another instance', async () => {
  const a = await createBaseApp({ root: '.', staticDir: 'none', dbPath: ':memory:', runtime: true });
  const b = await createBaseApp({ root: '.', staticDir: 'none', dbPath: ':memory:', runtime: true });
  try {
    const first = makeFixture('agency'), second = structuredClone(first);
    first.source.accountId = 'fiction-portal-a'; second.source.accountId = 'fiction-portal-b';
    for (const [fixture, item] of [[first, a], [second, b]] as const) {
      item.store.importSnapshot(fixture);
      item.store.saveGeneration(makeDemoSpec(fixture), { provider: 'demo', model: null, generatedAt: '2026-11-02T09:00:00Z', prompt: '', approved: false });
      item.store.activate();
    }
    assert.notEqual(a.store.get('instanceId', null), b.store.get('instanceId', null));
    const r1 = await a.app.inject({ url: '/api/v2/search?q=contact-1' });
    const r2 = await b.app.inject({ url: '/api/v2/search?q=contact-1' });
    assert.equal(r1.statusCode, 200); assert.equal(r2.statusCode, 200);
    const firstResult = r1.json(), secondResult = r2.json();
    assert.notEqual(firstResult.source.accountId, secondResult.source.accountId);
    assert.equal(firstResult.source.captureId, secondResult.source.captureId);
    assert.notEqual(firstResult.source.revision, secondResult.source.revision, 'different account and instance must not share the same revision');
    const url = '/api/v2/search-record?entity=contacts&id=contact-1&captureId=' + encodeURIComponent(firstResult.source.captureId) + '&revision=' + firstResult.source.revision;
    const opened = await b.app.inject({ url });
    assert.equal(opened.statusCode, 409, 'the first installation token must not open a record in the second');
  } finally { await a.app.close(); await b.app.close(); }
});
