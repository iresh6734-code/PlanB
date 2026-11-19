import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepared, deadPid, claimPath, flagFor, runChild, waitFor, readClaim, destState, trackFolder, roomDir, importCapsule } from './helpers/rescue-capsule-followup-harness.js';

async function absent(pid: number) { for (let n = 0; n < 500; n++) { try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; return true; } await new Promise(r => setTimeout(r, 20)); } return false; }
function evidence(name: string, body: unknown) { const dir = process.env.PLANB175_EVIDENCE; if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(body, null, 2)); } }

test('175: a paused orphan recoverer and a fresh importer publish once without a claim gap', { timeout: 120_000 }, async () => {
  const p = await prepared('local-work'), dead = await deadPid(), stale = randomUUID(), file = claimPath(p.kit, p.input.name), claim = JSON.stringify({ status: 'importing', destination: stale, pid: dead, owner: 'orphan175', at: 'fiction' }); fs.writeFileSync(file, claim);
  const sentinel = path.join(p.kit.capsules, 'foreign175.txt'), sent = 'Other capsule content175'; fs.writeFileSync(sentinel, sent);
  const job = { kitDir: p.kit.dir, name: p.input.name, password: p.input.password, sha: p.input.expectedSha256, rev: p.input.expectedRevision, action: 'import' as const }, flag = flagFor(p.kit, 'independent175'), step = process.env.PLANB175_PAUSE_STEP ?? 'import:recovery-verified', recovering = runChild({ ...job, mode: 'block', step, flag });
  let arriving: ReturnType<typeof runChild> | undefined;
  try {
    await waitFor(flag + '.reached'); const atBarrier = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    arriving = runChild(job); const next = await arriving.done;
    fs.writeFileSync(flag + '.go', '1'); const previous = await recovering.done;
    assert.equal(previous.code, 0, previous.err); assert.equal(next.code, 0, next.err);
    const final = readClaim(p.kit, p.input.name), candidates = new Set([stale, previous.result?.destination, next.result?.destination].filter((x): x is string => typeof x === 'string'));
    for (const id of candidates) trackFolder(roomDir(id)); const published = [...candidates].filter(id => destState(id).published);
    const observed = { step, atBarrierHasClaim: atBarrier !== null, recovering: previous.result?.ok ? 'ok' : previous.result?.code, arriving: next.result?.ok ? 'ok' : next.result?.code, published: published.length, matchingClaim: final?.destination === previous.result?.destination, finalStatus: final?.status, pids: [recovering.pid, arriving.pid], absent: await absent(recovering.pid) && await absent(arriving.pid) }; evidence('race175', observed);
    assert.equal(observed.recovering, 'ok'); assert.equal(observed.arriving, 'CLAIM_RECOVERY_BUSY'); assert.equal(observed.atBarrierHasClaim, true); assert.equal(observed.published, 1); assert.equal(observed.matchingClaim, true); assert.equal(final?.status, 'imported'); assert.equal(observed.absent, true);
    assert.equal(fs.existsSync(file + '.takeover'), false); assert.equal(fs.readFileSync(sentinel, 'utf8'), sent); assert.equal(fs.readdirSync(p.kit.capsules).some(n => n.endsWith('.recover.tmp')), false);
    const retry = await runChild(job).done; assert.equal(retry.result?.ok, false); assert.equal(retry.result?.code, 'ALREADY_IMPORTED'); assert.equal(fs.readFileSync(sentinel, 'utf8'), sent);
  } finally { fs.writeFileSync(flag + '.go', '1'); await recovering.done; if (arriving) await arriving.done; p.origin.close(); }
});

test('175: a replacement claim from a living unrelated owner survives the recovery recheck', async () => {
  const p = await prepared('local-work'), dead = await deadPid(), file = claimPath(p.kit, p.input.name), stale = randomUUID(), foreign = JSON.stringify({ status: 'importing', destination: randomUUID(), pid: process.pid, owner: 'unrelated-instance175', at: 'fiction' });
  fs.writeFileSync(file, JSON.stringify({ status: 'importing', destination: stale, pid: dead, owner: 'dead175' }));
  p.kit.onStep = step => { if (step === 'import:recovery-verified') fs.writeFileSync(file, foreign); };
  try {
    await assert.rejects(importCapsule(p.kit, p.input), (error: unknown) => (error as { code?: string }).code === 'ALREADY_IMPORTED');
    assert.equal(fs.readFileSync(file, 'utf8'), foreign); assert.equal(fs.existsSync(file + '.takeover'), false); assert.equal(destState(stale).published, false); assert.equal(fs.readdirSync(p.kit.capsules).some(n => n.endsWith('.recover.tmp')), false);
    evidence('foreign175', { claimPreserved: true, ownTakeoverRemoved: true, noTemporary: true });
  } finally { p.origin.close(); }
});

test('175: a published own marker consolidates a stale claim without importing again', async () => {
  const p = await prepared('local-work');
  try {
    const first = await importCapsule(p.kit, p.input), file = claimPath(p.kit, p.input.name), id = first.destination.roomId; trackFolder(roomDir(id));
    const dead = await deadPid(); fs.writeFileSync(file, JSON.stringify({ status: 'importing', destination: id, pid: dead, owner: 'dead175', revision: p.input.expectedRevision }));
    await assert.rejects(importCapsule(p.kit, p.input), (error: unknown) => (error as { code?: string }).code === 'ALREADY_IMPORTED');
    const final = readClaim(p.kit, p.input.name); assert.equal(final?.status, 'imported'); assert.equal(final?.destination, id); assert.equal(destState(id).published, true); assert.equal(fs.existsSync(file + '.takeover'), false);
  } finally { p.origin.close(); }
});
