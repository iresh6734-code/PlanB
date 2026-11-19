import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Historical characterization only: requires the exact frozen R2 source. The current
// author-owned implementation may already be changing; never patch that source.
const baseline = process.env.PLANB_RESCUE_R2_BASELINE;
const expected = '4787016b9c635070799f2b77911c831a3bb8fba6e5780ed936aa7174216a93a8';
test('R2: a new importer can acquire the claim between orphan removal and retake', { skip: !baseline && 'Set PLANB_RESCUE_R2_BASELINE to the frozen R2 projection' }, () => {
  const source = resolve(baseline!);
  const original = readFileSync(join(source, 'server/rescue-capsule.ts'), 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), expected, 'unexpected baseline; refuse to instrument it');
  const needle = 'unlinkSync(claim); take(); break;';
  assert.equal(original.split(needle).length, 2, 'instrument exactly one location');
  const root = resolve('tests/.tmp', `independent-rescue-race-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  for (const item of ['server', 'shared', 'scripts', 'tests/helpers', 'package.json', 'tsconfig.json']) {
    const dest = join(root, item);
    mkdirSync(resolve(dest, '..'), { recursive: true });
    cpSync(join(source, item), dest, { recursive: true, errorOnExist: true });
  }
  // Only a test hook is inserted between the existing two filesystem operations.
  const instrumented = original.replace(needle, "unlinkSync(claim); void kit.onStep?.('import:test-after-unlink'); take(); break;");
  writeFileSync(join(root, 'server/rescue-capsule.ts'), instrumented);
  const scenario = `
import assert from 'node:assert/strict';
import { prepared, deadPid, claimPath, writeFileSync, flagFor, runChild, waitFor, readClaim, destState, trackFolder, roomDir } from './helpers/rescue-capsule-followup-harness.js';
const p = await prepared();
const dead = await deadPid();
const stale = '44444444-4444-4444-8444-444444444444';
writeFileSync(claimPath(p.kit, p.input.name), JSON.stringify({ status:'importing', destination:stale, pid:dead, at:'x' }));
const job = { kitDir:p.kit.dir, name:p.input.name, password:p.input.password, sha:p.input.expectedSha256, rev:p.input.expectedRevision, action:'import' as const };
const flag = flagFor(p.kit, 'race');
const recovering = runChild({ ...job, mode:'block', step:'import:test-after-unlink', flag });
try {
  await waitFor(flag + '.reached');
  assert.equal(readClaim(p.kit, p.input.name), null, 'old claim removed at the barrier');
  const arriving = await runChild(job).done;
  assert.equal(arriving.code, 0, arriving.err);
  assert.equal(arriving.result?.ok, true, JSON.stringify(arriving));
  const id = arriving.result.destination;
  trackFolder(roomDir(id));
  assert.equal(destState(id).published, true);
  writeFileSync(flag + '.go', '1');
  const first = await recovering.done;
  assert.equal(first.code, 0, first.err);
  assert.equal(first.result?.ok, false);
  assert.equal(first.result?.code, 'EEXIST');
  assert.equal(readClaim(p.kit, p.input.name)?.destination, id);
  assert.equal(readClaim(p.kit, p.input.name)?.status, 'imported');
  console.log('RACE_RESULT ' + JSON.stringify({ recovering:first.result.code, arriving:'imported', matchingClaim:true, published:true }));
} finally { writeFileSync(flag + '.go', '1'); await recovering.done; p.origin.close(); }
`;
  const scenarioPath = join(root, 'tests/independent-race-scenario.ts');
  writeFileSync(scenarioPath, scenario);
  const result = spawnSync(process.execPath, ['--require', resolve('scripts/block-external.cjs'), '--import', 'tsx', scenarioPath], {
    cwd: root, encoding: 'utf8', timeout: 90_000, windowsHide: true,
    env: { ...process.env, PLANB_QA136_BASE: join(root, 'evidence') },
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /RACE_RESULT .*"recovering":"EEXIST"/);
  process.stdout.write(`# isolated evidence: ${root}\n${result.stdout}`);
});
