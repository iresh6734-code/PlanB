import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, unseen, WHATS_NEW, type WhatsNewEntry } from '../src/app-shell/whats-new.js';
import { PAGES } from '../src/app-shell/session.js';
import { APP_VERSION } from '../shared/version.js';

const entries: WhatsNewEntry[] = [
  { version: '0.4.0', date: '2026-01-01', items: [{ title: 'a', text: 'a' }] },
  { version: '0.6.0', date: '2026-03-01', items: [{ title: 'c', text: 'c' }] },
  { version: '0.5.2', date: '2026-02-01', items: [{ title: 'b', text: 'b' }] },
  { version: '0.7.0', date: '2026-04-01', items: [{ title: 'd', text: 'd' }] },
];

test('compareVersions ordena por números, no por texto', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.5.2', '0.6.0'), -1);
});

test('unseen devuelve lo publicado después de la versión vista, sin versiones futuras', () => {
  assert.deepEqual(unseen(entries, '0.4.0', '0.6.0').map(entry => entry.version), ['0.6.0', '0.5.2']);
  assert.deepEqual(unseen(entries, '0.6.0', '0.6.0'), []);
  assert.deepEqual(unseen(entries, '0.9.0', '0.6.0'), []);
});

test('sin versión vista legible solo se enseña la última publicada', () => {
  for (const seen of [null, '', 'hola', 42, '1.2.x']) assert.deepEqual(unseen(entries, seen, '0.6.0').map(entry => entry.version), ['0.6.0']);
});

test('la lista real tiene la versión instalada y enlaza solo a apartados que existen', () => {
  assert.ok(WHATS_NEW.some(entry => entry.version === APP_VERSION), 'falta la entrada de ' + APP_VERSION);
  for (const entry of WHATS_NEW) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const item of entry.items) if (item.page) assert.ok((PAGES as readonly string[]).includes(item.page), item.page);
  }
});
