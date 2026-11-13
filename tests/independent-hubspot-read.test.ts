import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../scripts/hubspot-read-check.js';
import { LIVE_MAX_BODY_BYTES } from '../server/hubspot-read-check-transport.js';

// Revisión178: datos sintéticos; el fetch se sustituye por completo y nunca sale a la red.
// Las regresiones expresan el contrato solicitado; fallan en la entrega173 mientras acepte un prefijo JSON truncado.
const IDENTITY = '/account-info/2026-09/details';
const CONTACTS = '/crm/objects/2026-09/contacts';
const TOKEN = 'fictional-review178-token';
const identity = { portalId: 12345, accountType: 'DEVELOPER_TEST' };
async function cli(overrides: Record<string, string> = {}) {
  const requests: string[] = []; let output = '', errors = '';
  const fake = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
    const url = new URL(String(input)); assert.equal(url.origin, 'https://api.hubapi.com');
    requests.push(url.pathname);
    return new Response(overrides[url.pathname] ?? JSON.stringify(url.pathname === IDENTITY ? identity : { results: [] }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const code = await runCli(['--portal', '12345', '--authorized-reads', '5', '--json'], {
    stdin: { async *[Symbol.asyncIterator]() { yield TOKEN + '\n'; } },
    out: value => { output += value; }, err: value => { errors += value; }, fetch: fake,
    now: () => Date.parse('2026-11-04T16:00:00Z'),
  });
  assert.equal(errors, ''); assert.ok(!output.includes(TOKEN));
  return { code, result: JSON.parse(output), requests };
}
function incompleteWithValidPrefix(value: object) {
  // El prefijo tiene un objeto JSON completo seguido de espacios. El documento completo NO es JSON.
  return JSON.stringify(value).padEnd(LIVE_MAX_BODY_BYTES, ' ') + 'INVALID_TRAILING_BYTES';
}

test('178: control negativo, cinco documentos completos dan acceso comprobado sin truncamiento', async () => {
  const r = await cli(); assert.equal(r.code, 0); assert.equal(r.result.resultado, 'confirmado');
  assert.equal(r.requests.length, 5); assert.equal(r.result.respuestasTruncadas, 0);
});

test('178: identidad truncada con prefijo JSON válido no autoriza las cuatro lecturas de objetos', async () => {
  const r = await cli({ [IDENTITY]: incompleteWithValidPrefix(identity) });
  assert.equal(r.result.respuestasTruncadas, 1);
  assert.equal(r.code, 1, 'Una identidad truncada no debe convertirse en acceso confirmado');
  assert.notEqual(r.result.resultado, 'confirmado');
  assert.deepEqual(r.requests, [IDENTITY], 'No leer objetos sin identidad completa validada');
});

test('178: un objeto truncado con prefijo JSON válido no cuenta como lectura confirmada', async () => {
  const r = await cli({ [CONTACTS]: incompleteWithValidPrefix({ results: [] }) });
  assert.equal(r.result.respuestasTruncadas, 1);
  assert.equal(r.code, 1, 'No confirmar los cuatro objetos si uno fue truncado');
  assert.notEqual(r.result.resultado, 'confirmado');
  assert.notEqual(r.result.objetos.find((o: { objeto: string }) => o.objeto === 'contacts').resultado, 'readable');
  assert.equal(r.requests.length, 5);
});
