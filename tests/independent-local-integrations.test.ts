import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBaseApp } from '../server/app.js';
import { registerTeamSync } from '../server/team-sync.js';
import { makeFixture } from '../shared/fixtures.js';
import { parseContinuity, parseCatalog, parseWorkspace, projectIntegrations, validateTeamOrigin, type SourceState } from '../shared/local-integrations.js';

const ok = <T>(data: T): SourceState<T> => ({ data, loading: false, failed: false });
test('119 independent: actual public local endpoints project an imported fixture without inventing connections', async () => {
  const root = path.resolve('tests/.tmp/integrations122-' + randomUUID()); mkdirSync(root, { recursive: true });
  const { app, store } = await createBaseApp({ root, dbPath: ':memory:', staticDir: path.join(root, 'absent-static') });
  registerTeamSync(app, store, undefined, false); store.importSnapshot(makeFixture('agency'));
  try {
    const raw = await Promise.all(['/api/v2/continuity', '/api/v4/integrations', '/api/v6/workspace'].map(async url => {
      const result = await app.inject({ url, headers: { host: '127.0.0.1' } }); assert.equal(result.statusCode, 200); return result.json();
    }));
    const continuity = parseContinuity(raw[0]), catalog = parseCatalog(raw[1]), workspace = parseWorkspace(raw[2]);
    assert.ok(continuity); assert.ok(catalog); assert.ok(workspace);
    const result = projectIntegrations({ continuity: ok(continuity), catalog: ok(catalog), workspace: ok(workspace) });
    assert.equal(result.hubspot.state, 'not_connected'); assert.equal(result.hubspot.action?.kind, 'callback');
    assert.ok(result.team.every(row => row.state === 'not_configured' && row.action === null));
    assert.equal(result.rehearsal.entries.find(entry => entry.id === 'gmail')?.mode, 'simulation');
    assert.equal(store.changesCount, 0); assert.equal(store.ready, false);
  } finally { await app.close(); }
});
test('119 independent: runtime data and a configured team origin never offer unavailable connectors', () => {
  const c = parseContinuity({ runtime: true, protected: true, connected: true, realDataEnabled: false }); assert.ok(c);
  const value = projectIntegrations({ continuity: ok(c), catalog: ok([]), workspace: ok({ origin: 'https://team.example.org' }) });
  assert.equal(value.hubspot.action, null); assert.ok(value.team.every(row => row.state === 'unavailable' && row.action === null));
});
test('119 independent: failed refresh preserves prior provenance and carries a visible stale warning', () => {
  const c = parseContinuity({ runtime: false, protected: true, connected: true, connection: { accountId: 'portal-ficticio', mode: 'test', verifiedAt: '2026-11-02T08:00:00Z' } }); assert.ok(c);
  const value = projectIntegrations({ continuity: { ...ok(c), failed: true }, catalog: ok([]), workspace: { ...ok({ origin: 'https://team.example.org' }), failed: true } });
  assert.equal(value.hubspot.stateLabel, 'Lectura configurada'); assert.equal(value.stale.length, 2);
  assert.ok(value.team.every(row => row.stateLabel === 'Sin comprobar aquí'));
  assert.ok(value.hubspot.facts.some(text => text.includes('no se comprueba')));
});
test('119 independent: origin normalization cannot smuggle a path, credentials or another protocol into links', () => {
  for (const raw of ['https://user:secret@team.example.org', 'https://team.example.org/%2f%2fevil.example.org', 'https://team.example.org\\@evil.example.org', 'https://team.example.org\u0000.evil.org', '//team.example.org', 'javascript:alert(1)']) assert.equal(validateTeamOrigin(raw).ok, false);
  for (const raw of ['http://127.0.0.1:4599', 'https://TEAM.EXAMPLE.ORG/']) {
    const result = validateTeamOrigin(raw); assert.ok(result.ok); if (result.ok) assert.equal(result.origin, new URL(raw).origin);
  }
});
