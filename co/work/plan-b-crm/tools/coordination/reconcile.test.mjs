import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBoard } from './core.mjs';

test('reconcile lists changed, missing and unreadable review files without changing the board', async t => {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(parent, 'planb-reconcile-'));
  t.after(() => {
    const target = realpathSync(root);
    assert.equal(path.dirname(target), parent);
    rmSync(target, { recursive: true, force: true });
  });
  const tools = path.join(root, 'tools', 'coordination');
  mkdirSync(tools, { recursive: true });
  for (const file of ['board.mjs', 'core.mjs']) {
    copyFileSync(new URL(file, import.meta.url), path.join(tools, file));
  }

  const board = createBoard(root);
  for (const [id, agent, files] of [
    ['CLAUDE-TEST', 'claude', ['changed.md', 'missing.md', 'unverified.md']],
    ['CODEX-TEST', 'codex', ['intact.md']],
  ]) {
    await board.add({ id, agent, files, title: 'Entrega de prueba', plan: 'Preparar entrega', acceptance: 'Huellas comprobables' });
    await board.claim(id, agent);
    for (const file of files) writeFileSync(path.join(root, file), 'Presentado');
    await board.submit(id, agent, 'Copia de prueba');
  }

  const expected = board.snapshot(['changed.md'])['changed.md'];
  writeFileSync(path.join(root, 'changed.md'), 'Nueva versión');
  unlinkSync(path.join(root, 'missing.md'));
  unlinkSync(path.join(root, 'unverified.md'));
  mkdirSync(path.join(root, 'unverified.md'));

  const boardFile = path.join(root, 'coordination', 'board.json');
  const before = readFileSync(boardFile);
  const run = (...args) => spawnSync(process.execPath, [path.join(tools, 'board.mjs'), 'reconcile', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.revision, board.load().revision);
  assert.equal(audit.reviewsChecked, 2);
  assert.deepEqual(audit.differences, [
    { taskId: 'CLAUDE-TEST', agent: 'claude', file: 'changed.md', expected, actual: board.snapshot(['changed.md'])['changed.md'], state: 'changed' },
    { taskId: 'CLAUDE-TEST', agent: 'claude', file: 'missing.md', expected, actual: null, state: 'missing' },
    { taskId: 'CLAUDE-TEST', agent: 'claude', file: 'unverified.md', expected, state: 'unverified', reason: 'Solo archivos de código o documentos de hasta 2 MB.' },
  ]);
  const intact = run('CODEX-TEST');
  assert.equal(intact.status, 0, intact.stderr);
  assert.deepEqual(JSON.parse(intact.stdout), { revision: audit.revision, reviewsChecked: 1, differences: [] });
  assert.equal(run('UNKNOWN').status, 1);
  assert.equal(run('CODEX-TEST', '--reviewed').status, 1);
  assert.deepEqual(readFileSync(boardFile), before);
});
