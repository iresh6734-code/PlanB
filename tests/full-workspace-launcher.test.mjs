import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { workspacePaths, cleanEnvironment, matchesExisting, CRM_ORIGIN, PILOT_ORIGIN } = require('../scripts/start-full-workspace.cjs');

test('el arranque reutiliza la base CRM propia y separa su carpeta de ejecución', () => {
  const root = path.resolve('checkout-fixture'), paths = workspacePaths(root);
  assert.equal(paths.data, path.join(root, 'planb-local-ux-2026-10-27', 'data', 'local'));
  assert.equal(paths.runtime, path.join(root, 'planb-local-crm-completo-2026-10-29', 'runtime'));
  assert.notEqual(paths.data, paths.runtime);
  assert.equal(CRM_ORIGIN, 'http://127.0.0.1:4331');
  assert.equal(PILOT_ORIGIN, 'http://localhost:4334');
});
test('no hereda secretos, proveedores o configuración de otras instancias', () => {
  const env = { PATH: 'node-path', SystemRoot: 'system', TEMP: 'temp', PLANB_DATA_DIR: 'other', PLANB_TEAM_DEMO: '1', NODE_OPTIONS: '--require other', NODE_ENV: 'test', HUBSPOT_CLIENT_ID: 'private', GOOGLE_CLOUD_PROJECT: 'other', OPENAI_BASE_URL: 'other', ANTHROPIC_API_KEY: 'private', AWS_ACCESS_KEY_ID: 'private', DATABASE_URL: 'private', AUTH_TOKEN: 'private', AZURE_TENANT_ID: 'other' };
  assert.deepEqual(cleanEnvironment(env), { PATH: 'node-path', SystemRoot: 'system', TEMP: 'temp' });
  assert.equal(env.PLANB_TEAM_DEMO, '1');
});
test('no reutiliza un servicio ajeno, sin identidad o en otro origen', () => {
  const state = { ok: true, instanceId: 'crm-current' }, endpoint = { instanceId: 'crm-current', url: CRM_ORIGIN };
  assert(matchesExisting(state, endpoint));
  for (const [health, expected] of [[null, endpoint], [{ ok: false, instanceId: 'crm-current' }, endpoint], [{ ok: true }, endpoint], [state, null], [state, { ...endpoint, instanceId: 'other' }], [state, { ...endpoint, url: 'https://example.invalid' }], [{ ok: true, instanceId: '' }, { ...endpoint, instanceId: '' }]]) assert.equal(matchesExisting(health, expected), false);
});
