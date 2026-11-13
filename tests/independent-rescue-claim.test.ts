import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportCapsule, importCapsule, inspectCapsule } from '../server/rescue-capsule.js';
import { PASSWORD, newKit, originAt, trackFolder, TMP } from './helpers/rescue-capsule-harness.js';

test('a synchronous failure after publication keeps its claim and rejects a second import', async () => {
  const kit = newKit(), origin = await originAt('local-work');
  try {
    const exported = await exportCapsule(origin, PASSWORD, kit);
    const inspected = await inspectCapsule(kit, exported.name, PASSWORD);
    const input = { name: exported.name, password: PASSWORD, expectedSha256: inspected.sha256, expectedRevision: inspected.revision };
    const claim = join(kit.capsules, exported.name + '.import-claim');
    let firstDestination = '';
    kit.onStep = step => {
      if (step !== 'import:published') return;
      const info = JSON.parse(readFileSync(claim, 'utf8')) as { destination: string };
      firstDestination = join(TMP, 'rescue106-' + info.destination); trackFolder(firstDestination);
      assert.equal(existsSync(join(firstDestination, 'rescue-room.marker.json')), true);
      throw Error('injected synchronous error after publication');
    };
    await assert.rejects(importCapsule(kit, input), (error: unknown) => (error as {code?: string}).code === 'IMPORT_PUBLISHED_WITH_ERROR');
    assert.equal(existsSync(firstDestination), true, 'published destination remains');
    assert.equal(existsSync(claim), true, 'the claim still protects the published destination');
    kit.onStep = undefined;
    await assert.rejects(importCapsule(kit, input), (error: unknown) => (error as {code?: string}).code === 'ALREADY_IMPORTED');
    assert.equal(join(TMP, 'rescue106-' + JSON.parse(readFileSync(claim, 'utf8')).destination), firstDestination);
    assert.ok(existsSync(firstDestination));
  } finally { origin.close(); }
});
