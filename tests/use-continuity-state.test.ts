import test from 'node:test';
import assert from 'node:assert/strict';
import { copySignalOf, keepAlerts } from '../src/app-shell/useContinuityState.js';
import type { ContinuityAlert } from '../src/app-shell/continuity-alerts.js';

const alert = (id: string, tone: ContinuityAlert['tone']): ContinuityAlert => ({ id, tone, title: 'Aviso ' + id, detail: '', action: { label: 'Ver', target: 'estado' } });

test('the menu signal sums the alerts, takes the gravest tone and stays empty without alerts', () => {
  assert.equal(copySignalOf(null), null);
  assert.equal(copySignalOf([]), null);
  assert.deepEqual(copySignalOf([alert('a', 'warn')]), { count: 1, tone: 'warn', titles: ['Aviso a'] });
  assert.deepEqual(copySignalOf([alert('a', 'warn'), alert('b', 'danger')]), { count: 2, tone: 'danger', titles: ['Aviso a', 'Aviso b'] });
});

test('an identical reading keeps the previous alert list so the menu does not repaint', () => {
  const current = [alert('a', 'warn')];
  assert.equal(keepAlerts(current, [alert('a', 'warn')]), current);
  const changed = [alert('a', 'danger')];
  assert.equal(keepAlerts(current, changed), changed);
  assert.equal(keepAlerts(null, changed), changed);
});
