import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {rehearsalWorkspace} from './helpers/rehearsal-workspace.js';
const workspace=rehearsalWorkspace('unit');
const {rehearsePortableRecovery,MAX_REHEARSAL_BYTES}=await import(pathToFileURL(path.join(workspace,'server/recovery-rehearsal.ts')).href) as typeof import('../server/recovery-rehearsal.js');
import { Store } from '../server/store.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { encodePortable } from '../server/crypto.js';
import { bundleRevision } from '../server/recovery-copy.js';
import { Recovery, simulatedRemote } from '../server/recovery.js';

const parent = path.join(workspace,'tests/.tmp/recovery-rehearsals');
const directories = () => fs.existsSync(parent) ? fs.readdirSync(parent).sort() : [];
function prepare() {
  const store = new Store(':memory:'), snapshot = makeFixture();
  store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: '2026-10-30T10:00:00Z', prompt: '', approved: false }); store.activate();
  store.saveRecord('contacts', { phone: 'private-canary-050', email: 'canary050@example.invalid' }, 'contact-1');
  return store;
}
function artifact() { const store = prepare(); try { return store.bundle(); } finally { store.close(); } }

test('encrypted portable copy restores through protected API and survives a different process with four persisted operations', () => {
  const store = prepare(), password = 'fiction-rehearsal-password-050';
  try {
    const bundle = store.bundle(), raw = encodePortable(bundle, password), before = JSON.stringify(store.records()), history = store.changesCount;
    const report = rehearsePortableRecovery({ raw, password });
    assert.equal(report.status, 'passed', JSON.stringify(report)); assert.equal(report.issue, null);
    assert.equal(report.artifactHash, createHash('sha256').update(raw).digest('hex')); assert.equal(report.inputRevision, bundleRevision(bundle));
    assert.equal(report.restoredRevision, report.inputRevision); assert.equal(report.stages.length, 2);
    const [first, second] = report.stages; assert.notEqual(first.pid, second.pid); assert.ok(first.pid > 0 && second.pid > 0);
    assert.ok(report.stages.every(stage => stage.success && stage.checks.every(check => check.passed)));
    assert.deepEqual(second.state, first.state); assert.equal(second.state!.records, bundle.records.length + 1);
    assert.equal(second.state!.changes, history + 4); assert.equal(second.state!.pending, history + 4);
    assert.notEqual(second.state!.revision, report.restoredRevision);
    for (const code of ['RESTORE_THROUGH_PROTECTED_API', 'RESTORED_REVISION_MATCHES', 'CONTACT_READ_AND_EDIT', 'DEAL_ADVANCED', 'TASK_COMPLETED', 'HOST_AND_ORIGIN_GUARDS']) assert.ok(first.checks.some(c => c.code === code && c.passed), code);
    for (const code of ['LOGIN_AFTER_PROCESS_RESTART', 'PERSISTENCE_AFTER_PROCESS_RESTART', 'API_RECORDS_AFTER_RESTART', 'UNAUTHENTICATED_ACCESS_DENIED', 'EXPLICIT_LOCK_DENIES_SESSION']) assert.ok(second.checks.some(c => c.code === code && c.passed), code);
    assert.ok(report.elapsedMs > 0); assert.ok(Date.parse(report.completedAt) >= Date.parse(report.startedAt));
    const output = JSON.stringify(report);
    for (const value of [password, 'private-canary-050', 'canary050@example.invalid', 'contact-1', 'planb_session=', 'enc1:']) assert.ok(!output.includes(value), value);
    const folder = path.dirname(path.resolve(workspace,report.evidenceFile!)); assert.equal(path.dirname(folder), parent);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(workspace,report.evidenceFile!), 'utf8')), report);
    assert.ok(fs.existsSync(path.join(folder, 'data/planb.sqlite')));
    assert.ok(fs.existsSync(path.join(folder, 'data/.planb-key')));
    assert.deepEqual(fs.readdirSync(folder).sort(), ['data', 'report.json']);
    assert.equal(JSON.stringify(store.records()), before); assert.equal(store.changesCount, history);
  } finally { store.close(); }
});

test('malformed, oversized, corrupted and incorrectly decrypted artifacts are refused before any new folder exists', () => {
  const data = artifact(), password = 'fiction-password-050', raw = encodePortable(data, password);
  const corrupt = structuredClone(data); corrupt.records[0].values.firstname = 'unlogged-050';
  const before = directories();
  for (const input of [{ raw: 'not-json' }, { raw: '{}' }, { raw: 'x'.repeat(MAX_REHEARSAL_BYTES + 1) }, { raw }, { raw, password: 'wrong-fixture-password' }, { raw: JSON.stringify(corrupt) }, { raw: JSON.stringify(data), password: 'x'.repeat(201) }]) {
    const result = rehearsePortableRecovery(input); assert.equal(result.status, 'refused'); assert.equal(result.issue, 'INVALID_ARTIFACT');
    assert.equal(result.runId, null); assert.equal(result.evidenceFile, null); assert.deepEqual(result.stages, []);
    assert.ok(!JSON.stringify(result).includes('wrong-fixture-password'));
  }
  assert.deepEqual(directories(), before);
});

test('provider/test accounts and fictitious production metadata are outside this rehearsal scope', () => {
  const data = artifact(), before = directories();
  for (const production of [false, true]) {
    const copy = structuredClone(data); copy.snapshot.source.kind = 'hubspot';
    if (production) {
      copy.format = 'planb-continuity-v3'; copy.snapshot.version = 3; copy.spec.version = 3;
      Object.assign(copy.snapshot.source, { isTestData: false, environment: 'production', accountType: 'STANDARD' });
    }
    const result = rehearsePortableRecovery({ raw: JSON.stringify(copy) });
    assert.equal(result.status, 'refused'); assert.equal(result.issue, 'FIXTURE_ONLY'); assert.equal(result.runId, null);
  }
  assert.deepEqual(directories(), before);
});

test('approved return plan is normalized before expected restored revision; no inherited approval survives', async () => {
  const store = prepare();
  try {
    const engine = new Recovery(store), plan = await engine.preview({ ...simulatedRemote(store), source: 'hubspot' }); engine.approve(plan.id);
    const bundle = store.bundle(); assert.equal(bundle.returnState!.plan!.status, 'approved');
    const result = rehearsePortableRecovery({ raw: JSON.stringify(bundle) });
    assert.equal(result.status, 'passed', JSON.stringify(result)); assert.notEqual(result.inputRevision, result.restoredRevision);
    assert.ok(result.stages[0].checks.some(c => c.code === 'RESTORED_REVISION_MATCHES' && c.passed));
    assert.equal(store.get<any>('recoveryPlan', null).status, 'approved', 'source store remains untouched');
  } finally { store.close(); }
});

test('an uncertain remote operation blocks the local workflow instead of producing a false successful rehearsal', async () => {
  const store = prepare();
  try {
    const engine = new Recovery(store); await engine.preview({ ...simulatedRemote(store), source: 'hubspot' });
    const data = store.bundle(); data.returnState!.plan!.status = 'applying'; data.returnState!.plan!.operations[0].status = 'sending';
    const result = rehearsePortableRecovery({ raw: JSON.stringify(data) });
    assert.equal(result.status, 'failed', JSON.stringify(result)); assert.equal(result.issue, 'REHEARSAL_NOT_PASSED');
    assert.equal(result.stages.length, 1); assert.ok(result.stages[0].checks.some(c => !c.passed));
    assert.ok(result.evidenceFile && fs.existsSync(path.resolve(workspace,result.evidenceFile)));
    assert.ok(!JSON.stringify(result).includes('private-canary-050'));
  } finally { store.close(); }
});

test('worker refuses arbitrary or existing installation paths before opening a database and does not reflect them', () => {
  const worker = path.join(workspace,'server/recovery-rehearsal-worker.ts'), forbidden = path.join(workspace,'tests/.tmp/DO-NOT-CREATE-050');
  assert.equal(fs.existsSync(forbidden), false);
  const result = spawnSync(process.execPath, ['--require', path.join(workspace,'scripts/block-external.cjs'), '--import', 'tsx', worker], {
    cwd:workspace,windowsHide: true, encoding: 'utf8', timeout: 15_000,
    input: JSON.stringify({ phase: 'restore', folder: forbidden, localPassword: 'fiction-local-password-050', expectedRevision: '0'.repeat(64), raw: '{}' }),
  });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).success, false);
  assert.equal(fs.existsSync(forbidden), false); assert.ok(!result.stdout.includes(forbidden));
});

test('direct worker entry also rejects provider-scoped artifacts before creating a database or key', () => {
  const data = artifact(); data.snapshot.source.kind = 'hubspot';
  fs.mkdirSync(parent, { recursive: true }); const folder = path.join(parent, 'run-' + randomUUID()); fs.mkdirSync(folder);
  const result = spawnSync(process.execPath, ['--require', path.join(workspace,'scripts/block-external.cjs'), '--import', 'tsx', path.join(workspace,'server/recovery-rehearsal-worker.ts')], {
    cwd:workspace,encoding: 'utf8', windowsHide: true, timeout: 15_000,
    input: JSON.stringify({ phase: 'restore', folder, raw: JSON.stringify(data), localPassword: 'fiction-local-050', expectedRevision: '0'.repeat(64) }),
  });
  assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
  assert.equal(report.success, false); assert.ok(report.checks.some((c: { code: string; passed: boolean }) => c.code === 'FIXTURE_SCOPE_VALIDATED' && !c.passed));
  assert.deepEqual(fs.readdirSync(folder), []); assert.ok(!result.stdout.includes('private-canary-050'));
});
