import assert from 'node:assert/strict';
import test from 'node:test';
import { diffBar, diffDigest, previousCapture } from '../src/app-shell/copy-diff.js';

const zero = { added: 0, absent: 0, changed: 0, unchanged: 0 };

test('diffDigest calcula antes/después por objeto y marca la pérdida de más del 15 %', () => {
  const digest = diffDigest({
    contacts: { added: 2, absent: 30, changed: 5, unchanged: 65 },
    deals: { added: 1, absent: 1, changed: 0, unchanged: 18 },
    tasks: { ...zero },
  });
  const contacts = digest.rows.find(row => row.entity === 'contacts')!;
  assert.equal(contacts.before, 100);
  assert.equal(contacts.after, 72);
  assert.equal(contacts.net, -28);
  assert.equal(contacts.alert, true);
  const deals = digest.rows.find(row => row.entity === 'deals')!;
  assert.equal(deals.alert, false);
  assert.equal(digest.rows.find(row => row.entity === 'tasks')!.ratio, null);
  assert.equal(digest.alert, true);
  assert.match(digest.headline, /^Faltan 30 clientes de 100 \(30 %\)/);
  assert.deepEqual([digest.totals.before, digest.totals.after, digest.totals.net], [119, 91, -28]);
});

test('diffDigest resume sin alarma cuando no hay pérdidas relevantes o no hay diferencias', () => {
  assert.equal(diffDigest({ contacts: { ...zero, unchanged: 4 } }).headline, 'Las dos capturas tienen los mismos registros con los mismos valores.');
  const mixed = diffDigest({ contacts: { added: 1, absent: 1, changed: 3, unchanged: 20 } });
  assert.equal(mixed.alert, false);
  assert.equal(mixed.headline, '1 alta, 3 cambios, 1 ausencia entre las dos capturas.');
});

test('previousCapture devuelve la captura anterior en el tiempo y diffBar escala con el mayor objeto', () => {
  const captures = [{ id: 'b', at: '2026-11-19T10:00:00Z' }, { id: 'c', at: '2026-11-19T11:00:00Z' }, { id: 'a', at: '2026-11-19T09:00:00Z' }];
  assert.equal(previousCapture(captures, 'c')?.id, 'b');
  assert.equal(previousCapture(captures, 'a'), null);
  assert.equal(previousCapture(captures, 'x'), null);
  const [row] = diffDigest({ deals: { added: 10, absent: 10, changed: 20, unchanged: 60 } }).rows;
  assert.deepEqual(diffBar(row, 200), { unchanged: 30, changed: 10, added: 5, absent: 5 });
});
