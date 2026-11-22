import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createBaseApp } from '../server/app.js';
import { quarantineFor, saveQuarantine } from '../server/capture-quarantine.js';
import { makeFixture } from '../shared/fixtures.js';

// Misión maestra A2: una captura que encoge se conserva, pero no se abre para trabajar sin confirmarla. Sin puertos ni red.
const headers = { host: '127.0.0.1:4399' };

test('A2 · la captura que encoge queda retenida: begin la rechaza, el estado la muestra y confirmarla por su ID la abre', async () => {
  const { app, store } = await createBaseApp({ dbPath: ':memory:', root: resolve('.'), staticDir: resolve('tests/.tmp/a2-no-static'), runtime: false });
  try {
    const first = makeFixture();
    const firstId = store.addCapture(first);
    // Una captura posterior sin clientes: frente a la guardada, los clientes desaparecen.
    const shrunk = { ...first, capturedAt: new Date(Date.parse(first.capturedAt) + 3600_000).toISOString(), records: first.records.filter(record => record.entity !== 'contacts') };
    const entry = quarantineFor(store, shrunk, '2026-11-22T10:00:00.000Z')!;
    assert.deepEqual(entry.reasons, [{ entity: 'contacts', before: 24, after: 0 }]);
    assert.equal(quarantineFor(store, first, '2026-11-22T10:00:00.000Z'), null, 'la misma captura no se compara consigo misma');
    saveQuarantine(store, firstId, entry); // se retiene una captura guardada para probar la apertura

    const status = (await app.inject({ method: 'GET', url: '/api/v2/continuity', headers })).json();
    assert.deepEqual(Object.keys(status.quarantine), [firstId]);

    const refused = await app.inject({ method: 'POST', url: '/api/v2/session/begin', headers, payload: { captureId: firstId } });
    assert.equal(refused.statusCode, 409);
    assert.match(refused.json().error, /menos registros que la anterior \(Clientes 24 → 0\)/);
    const wrong = await app.inject({ method: 'POST', url: '/api/v2/session/begin', headers, payload: { captureId: firstId, confirmQuarantine: 'otra' } });
    assert.equal(wrong.statusCode, 409, 'la confirmación va ligada a esa captura exacta');
    assert.equal(store.get('continuitySession', null), null, 'nada se abre sin confirmar');

    const opened = await app.inject({ method: 'POST', url: '/api/v2/session/begin', headers, payload: { captureId: firstId, confirmQuarantine: firstId } });
    assert.equal(opened.statusCode, 200, opened.body);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/v2/continuity', headers })).json().quarantine, {}, 'confirmada, sale de la cuarentena');
  } finally { await app.close(); }
});
