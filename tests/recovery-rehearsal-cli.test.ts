import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {rehearsalWorkspace} from './helpers/rehearsal-workspace.js';
const workspace=rehearsalWorkspace('cli');
const parent = path.join(workspace,'tests/.tmp/recovery-rehearsals');
const directories = () => fs.existsSync(parent) ? fs.readdirSync(parent).sort() : [];
function run(args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^GOOGLE_|^HUBSPOT_|^OPENAI_|^ANTHROPIC_|^AZURE_|^AWS_|NODE_OPTIONS|^PLANB_/i.test(key)));
  return spawnSync(process.execPath, ['--require', path.join(workspace,'scripts/block-external.cjs'), '--import', 'tsx', path.join(workspace,'scripts/rehearse-portable-recovery.ts'), ...args], { cwd:workspace, env, windowsHide: true, encoding: 'utf8', timeout: 90_000 });
}

test('CLI help never starts a restore and unsupported arguments do not echo paths/passwords', () => {
  const before = directories();
  for (const args of [[], ['--help']]) { const result = run(args); assert.equal(result.status, 0); assert.match(result.stdout, /Sin --run-fixture solo muestra ayuda/); }
  for (const args of [['--file', 'PRIVATE-PATH-050'], ['--password', 'PRIVATE-SECRET-050'], ['--run-fixture', '--run-fixture'], ['--unknown']]) {
    const result = run(args); assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.doesNotMatch(result.stderr, /PRIVATE-PATH-050|PRIVATE-SECRET-050/);
  }
  assert.deepEqual(directories(), before);
});

test('explicit fixture CLI completes a fresh two-process recovery and emits only a safe evidence report', () => {
  const before = directories(), result = run(['--run-fixture']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout); assert.equal(report.status, 'passed'); assert.equal(report.stages.length, 2);
  assert.notEqual(report.stages[0].pid, report.stages[1].pid);
  assert.equal(report.stages[1].state.changes, 5); assert.equal(report.stages[1].state.records, 63);
  assert.deepEqual(directories().filter(id => !before.includes(id)), [report.runId]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(workspace,report.evidenceFile), 'utf8')), report);
  assert.doesNotMatch(result.stdout, /solo-cambio-ficticio-050|planb_session=|enc1:|fiction-password/);
  assert.match(report.limitations.join(' '), /no un RTO garantizado/);
});
