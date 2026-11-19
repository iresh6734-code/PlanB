import assert from 'node:assert/strict';
import test from 'node:test';
import { pollWhileVisible } from '../src/app-shell/poll.js';

test('pollWhileVisible: no lee con la pestaña oculta y lee al volver a ella', async () => {
  let hidden = false, listener: (() => void) | null = null, ticks = 0;
  const doc = { get hidden() { return hidden; }, addEventListener: (_: string, fn: () => void) => { listener = fn; }, removeEventListener: () => { listener = null; } } as never;
  const stop = pollWhileVisible(() => { ticks++; }, 5, doc);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(ticks > 0);
  hidden = true; const before = ticks;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(ticks, before);
  hidden = false; listener!();
  assert.equal(ticks, before + 1);
  stop();
  assert.equal(listener, null);
  const after = ticks; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ticks, after);
});
