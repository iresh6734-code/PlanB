import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPassport, passportFingerprint, passportTally, passportToHtml, passportToJson, type RelayRehearsalRecord, type SourceInput } from '../shared/continuity-passport.js';
import { sha256Hex } from '../shared/sha256.js';

const none = <V,>(): SourceInput<V> => ({ status: 'not-provided', at: null, value: null });

test('sha256Hex coincide con los vectores FIPS y con node:crypto en bloques frontera y texto no ASCII', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'b'.repeat(1000), 'Pasaporte · añadido ✓ 日本']) {
    assert.equal(sha256Hex(text), createHash('sha256').update(text, 'utf8').digest('hex'), 'longitud ' + text.length);
  }
});

test('el HTML del pasaporte resume la evidencia, firma la huella del JSON y deja hueco para la revisión', () => {
  const relay: SourceInput<RelayRehearsalRecord> = { status: 'read', at: '2026-11-18T09:00:00Z', value: { rehearsedAt: '2026-11-18T09:00:00Z', captureId: null, outcome: 'completed', destinationOpened: true, wrongIdRejected: true, reconciledOnce: true, included: ['tareas locales'], notInherited: ['aprobaciones ejecutables'] } };
  const passport = buildPassport({ now: Date.parse('2026-11-19T10:00:00Z'), installId: null, copy: none(), hubspot: none(), work: none(), relay });
  const tally = passportTally(passport), claims = passport.sections.flatMap(s => s.claims);
  assert.equal(tally.total, claims.length);
  assert.equal(tally.observed + tally.declared + tally.unverified + tally.notApplicable, tally.total);
  assert.ok(tally.unverified > 0, 'sin copia ni lectura hay afirmaciones sin comprobar');
  const html = passportToHtml(passport), print = passportFingerprint(passport);
  assert.equal(print, createHash('sha256').update(passportToJson(passport), 'utf8').digest('hex'));
  assert.ok(html.includes(print.replace(/(.{8})/g, '$1 ').trim()), 'la huella aparece agrupada');
  assert.match(html, /Resumen para auditoría/);
  assert.match(html, new RegExp('<b>' + tally.unverified + '</b>sin comprobar'));
  assert.equal(html.match(/<tr><th scope="row">/g)?.length, passport.sections.length, 'una fila por pregunta');
  assert.match(html, /Revisado por/); assert.match(html, /Firma/); assert.match(html, /@page/);
  assert.doesNotMatch(html, /border-left/, 'sin franjas laterales de color');
  assert.equal(passportToHtml(passport), html, 'determinista');
});
