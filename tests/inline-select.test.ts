import assert from 'node:assert/strict';
import test from 'node:test';
import { selectKeyIntent } from '../src/app-shell/InlineSelect.js';

test('selectKeyIntent: las flechas y las letras solo recorren; Intro confirma y Escape revierte', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'g', 'G']) assert.equal(selectKeyIntent(key), 'browse', key);
  assert.equal(selectKeyIntent('Enter'), 'commit');
  assert.equal(selectKeyIntent('Escape'), 'revert');
  for (const key of ['Tab', ' ', 'Shift', 'F5']) assert.equal(selectKeyIntent(key), 'none', key);
});
