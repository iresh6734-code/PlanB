import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createBaseApp } from '../server/app.js';

const headers = { host: '127.0.0.1:4318' };
const crm = '<!doctype html><title>CRM de ensayo</title>';
const verifica = '<!doctype html><title>Verifica de ensayo</title>';

for (const { runtime, hasVerifica } of [
  { runtime: false, hasVerifica: true },
  { runtime: false, hasVerifica: false },
  { runtime: true, hasVerifica: true },
]) {
  test(`Verifica · entrada directa con portátil=${runtime} y HTML de Verifica=${hasVerifica}`, async t => {
    const temp = resolve(tmpdir());
    const root = mkdtempSync(join(temp, 'planb-verifica-entry-'));
    t.after(() => {
      assert.equal(dirname(root), temp);
      assert.match(basename(root), /^planb-verifica-entry-/);
      rmSync(root, { recursive: true, force: true });
    });
    writeFileSync(join(root, 'index.html'), crm);
    if (hasVerifica) writeFileSync(join(root, 'verifica.html'), verifica);
    const { app } = await createBaseApp({ root, staticDir: root, dbPath: ':memory:', runtime });
    try {
      for (const url of ['/verifica?tab=fuentes', '/verifica/encargos/x/fuentes?origen=historial']) {
        const response = await app.inject({ url, headers });
        assert.equal(response.statusCode, 200);
        assert.match(response.headers['content-type']!, /^text\/html/);
        assert.equal(response.body, !runtime && hasVerifica ? verifica : crm);
      }
      for (const url of ['/inicio', '/verificacion']) {
        const response = await app.inject({ url, headers });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, crm);
      }
      const missing = await app.inject({ url: '/api/verifica/inexistente', headers });
      assert.equal(missing.statusCode, 404);
      assert.deepEqual(missing.json(), { error: 'Operación no disponible en esta aplicación.' });
    } finally {
      await app.close();
    }
  });
}
