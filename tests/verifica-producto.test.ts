import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { selectWorkspaceHome } = require('../scripts/select-full-workspace-home.cjs') as {
  selectWorkspaceHome: (fetcher: typeof fetch) => Promise<string>;
};
const root = 'http://127.0.0.1:4331';
const capability = () => Response.json({ ok: true, engagements: true });
const html = (title: string) => new Response('<!doctype html><title>' + title + '</title>', { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('la instalación completa abre Verifica cuando incluye la página y sus encargos', async () => {
  const urls: string[] = [];
  const transport: typeof fetch = async input => {
    urls.push(String(input));
    return urls.length === 1 ? capability() : html('Plan B Verifica · Informe de verificación');
  };
  assert.equal(await selectWorkspaceHome(transport), root + '/verifica.html');
  assert.deepEqual(urls, [root + '/api/verifica/health', root + '/verifica.html']);
});

test('una instalación anterior o bloqueada conserva la entrada de la copia de trabajo', async () => {
  for (const status of [401, 404]) {
    const transport: typeof fetch = async input => {
      assert.equal(String(input), root + '/api/verifica/health');
      return Response.json({ error: 'No disponible' }, { status });
    };
    assert.equal(await selectWorkspaceHome(transport), root + '/');
  }
});

test('la portada de sustitución del CRM no se confunde con la página de Verifica', async () => {
  const transport: typeof fetch = async input => String(input).endsWith('/health') ? capability() : html('Plan B CRM');
  assert.equal(await selectWorkspaceHome(transport), root + '/');
});
