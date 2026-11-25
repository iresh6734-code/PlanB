// Plan B Verifica · direcciones propias (plan de diseño «una sola app», corte 2), sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isVerificaPath, pathOf, placeOf, STEP_TITLE } from '../src/verifica/app/routes.js';

const ID = '0b8f3f3e-6a1e-4c55-9d5c-0b9a1c9f2e11';

test('Verifica · cada paso y cada encargo tienen su dirección, y la dirección devuelve el mismo sitio', () => {
  const places = [
    { doc: 'operation', engagementId: null },
    ...(['sources', 'captures', 'report', 'watch', 'migration'] as const).flatMap(doc => [{ doc, engagementId: ID }, { doc, engagementId: null }]),
  ] as const;
  for (const place of places) assert.deepEqual(placeOf(pathOf(place)), place, pathOf(place));
  assert.equal(pathOf({ doc: 'operation', engagementId: ID }), '/verifica');
  assert.equal(pathOf({ doc: 'sources', engagementId: ID }), `/verifica/encargos/${ID}/fuentes`);
  assert.equal(pathOf({ doc: 'migration', engagementId: null }), '/verifica/despues');
  assert.deepEqual(Object.keys(STEP_TITLE).sort(), ['captures', 'migration', 'operation', 'report', 'sources', 'watch']);
});

test('Verifica · una dirección de encargo sin paso abre sus fuentes, y las que no valen no abren nada', () => {
  assert.deepEqual(placeOf(`/verifica/encargos/${ID}`), { doc: 'sources', engagementId: ID });
  assert.deepEqual(placeOf(`/verifica/encargos/${ID.toUpperCase()}/capturas`), { doc: 'captures', engagementId: ID });
  assert.deepEqual(placeOf('/verifica/'), { doc: 'operation', engagementId: null });
  for (const bad of ['/verifica/encargos', '/verifica/encargos/no-es-un-id/fuentes', '/verifica/otra', `/verifica/encargos/${ID}/fuentes/mas`, '/verifica/%E0%A4%A']) assert.equal(placeOf(bad), null, bad);
  assert.equal(placeOf('/inicio'), null);
  assert.equal(isVerificaPath('/verificador'), false, 'otra ruta que empieza igual no es de Verifica');
  assert.equal(isVerificaPath('/verifica'), true);
});
