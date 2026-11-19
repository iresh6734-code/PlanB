import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Entry = { name: string; safe: boolean; reasons: string[] };
type SafeTests = {
  unsafeReasons: (source: string, readHelper?: (rel: string) => string) => string[];
  classify: () => Entry[];
  selectSafe: (entries: Entry[], filters?: string[]) => Entry[];
};

const load = async (): Promise<SafeTests> => (await import(pathToFileURL(path.resolve('tools/safe-tests.mjs')).href)) as SafeTests;
const j = (...parts: string[]) => parts.join('');

test('T1: una prueba limpia es segura y cada riesgo da su motivo', async () => {
  const { unsafeReasons } = await load();
  assert.deepEqual(unsafeReasons("import { x } from '../shared/x.ts'; assert.equal(x(1), 2);"), []);
  assert.deepEqual(unsafeReasons(j('server.lis', 'ten(0)')), ['port']);
  assert.deepEqual(unsafeReasons(j("import { sp", "awn } from 'node:child", "_process'")), ['process']);
  assert.deepEqual(unsafeReasons(j("import { chromium } from '@play", "wright/test'")), ['browser']);
  assert.deepEqual(unsafeReasons(j('Get-Cim', 'Instance Win32_Process')), ['system']);
  assert.deepEqual(unsafeReasons(j("{ kind: 'dp", "api' }")), ['keystore']);
});

test('T1: los ayudantes importados cuentan como parte de la prueba', async () => {
  const { unsafeReasons } = await load();
  const helper = (rel: string) => rel === './helpers/arranque' ? j('const child = sp', 'awn(process.execPath)') : '';
  assert.deepEqual(unsafeReasons("import { boot } from './helpers/arranque';", helper), ['process']);
  assert.deepEqual(unsafeReasons("import { boot } from './helpers/otro';", helper), []);
});

test('T1: el índice real separa las pruebas y filtra por nombre', async () => {
  const { classify, selectSafe } = await load();
  const entries = classify(), byName = new Map(entries.map(e => [e.name, e]));
  assert.equal(byName.get('safe-tests.test.ts')?.safe, true);
  assert.equal(byName.get('recovery-bootstrap.test.ts')?.safe, false);
  assert.ok(entries.filter(e => e.safe).length > entries.length / 2, 'la mayoría de pruebas son de proceso único');
  assert.deepEqual(selectSafe(entries, ['RETURN-STEPS']).map(e => e.name), ['return-steps.test.ts']);
  assert.ok(selectSafe(entries).every(e => e.safe && e.reasons.length === 0));
});
