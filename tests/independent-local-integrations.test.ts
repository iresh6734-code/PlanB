import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { makeFixture } from '../shared/fixtures.js';
import { parseContinuity, parseCatalog, projectIntegrations, type SourceState } from '../shared/local-integrations.js';

const ok = <T>(data: T): SourceState<T> => ({ data, loading: false, failed: false });
test('119 independent: actual public local endpoints project an imported fixture without inventing connections', async () => {
  const root = path.resolve('tests/.tmp/integrations122-' + randomUUID()); mkdirSync(root, { recursive: true });
  const { app, store } = await createBaseApp({ root, dbPath: ':memory:', staticDir: path.join(root, 'absent-static') });
  store.importSnapshot(makeFixture('agency'));
  try {
    const raw = await Promise.all(['/api/v2/continuity', '/api/v4/integrations'].map(async url => {
      const result = await app.inject({ url, headers: { host: '127.0.0.1' } }); assert.equal(result.statusCode, 200); return result.json();
    }));
    const continuity = parseContinuity(raw[0]), catalog = parseCatalog(raw[1]);
    assert.ok(continuity); assert.ok(catalog);
    const result = projectIntegrations({ continuity: ok(continuity), catalog: ok(catalog) });
    assert.equal(result.hubspot.state, 'not_connected'); assert.equal(result.hubspot.action?.kind, 'callback');
    assert.equal(result.rehearsal.entries.find(entry => entry.id === 'gmail')?.mode, 'simulation');
    assert.equal(store.changesCount, 0); assert.equal(store.ready, false);
  } finally { await app.close(); }
});
test('119 independent: runtime data never offers unavailable connectors', () => {
  const c = parseContinuity({ runtime: true, protected: true, connected: true, realDataEnabled: false }); assert.ok(c);
  const value = projectIntegrations({ continuity: ok(c), catalog: ok([]) });
  assert.equal(value.hubspot.action, null); assert.equal(value.hubspot.state, 'unavailable');
});
test('119 independent: failed refresh preserves prior provenance and carries a visible stale warning', () => {
  const c = parseContinuity({ runtime: false, protected: true, connected: true, connection: { accountId: 'portal-ficticio', mode: 'test', verifiedAt: '2026-11-02T08:00:00Z' } }); assert.ok(c);
  const value = projectIntegrations({ continuity: { ...ok(c), failed: true }, catalog: ok([]) });
  assert.equal(value.hubspot.stateLabel, 'Lectura configurada'); assert.equal(value.stale.length, 1);
  assert.ok(value.hubspot.facts.some(text => text.includes('no se comprueba')));
});
