import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport } from '../shared/csv-import.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { normalizeEmail, normalizeKind, normalizePhone, normalizeText, normalizeWebsite, proposeNormalization } from '../shared/normalize.js';

test('teléfonos: prefijo español y grupos legibles; lo ambiguo se deja como está', () => {
  assert.equal(normalizePhone('600123123'), '+34 600 123 123');
  assert.equal(normalizePhone('0034 600-12-31-23'), '+34 600 123 123');
  assert.equal(normalizePhone('+34 (91) 123 45 67'), '+34 911 234 567');
  assert.equal(normalizePhone('0044 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('  912  345 678 ext. 21 '), '912 345 678 ext. 21', 'con letras solo se limpian los espacios');
  assert.equal(normalizePhone('12345'), '12345');
  assert.equal(normalizePhone('5551234567'), '5551234567', 'diez dígitos sin prefijo: no se adivina el país');
});

test('correos, webs y textos', () => {
  assert.equal(normalizeEmail(' mailto:Ana.Ruiz@ACME.es '), 'ana.ruiz@acme.es');
  assert.equal(normalizeEmail('<ana@acme.es>'), 'ana@acme.es');
  assert.equal(normalizeWebsite('HTTPS://www.Acme.ES/'), 'www.acme.es');
  assert.equal(normalizeWebsite('http://Acme.es/Contacto?x=1'), 'acme.es/Contacto?x=1', 'la ruta conserva sus mayúsculas');
  assert.equal(normalizeText('  Acme\u00A0  Ibérica\u200B  S.L. '), 'Acme Ibérica S.L.');
});

test('la ficha propone solo los campos que cambian y nunca los de solo lectura ni los que no son texto', () => {
  const fields = [
    { key: 'firstname', label: 'Nombre', type: 'text' }, { key: 'email', label: 'Correo', type: 'email' },
    { key: 'phone', label: 'Teléfono', type: 'text' }, { key: 'domain', label: 'Sitio web', type: 'text' },
    { key: 'hs_id', label: 'Teléfono interno', type: 'text', readOnly: true }, { key: 'amount', label: 'Importe', type: 'number' },
  ];
  assert.equal(normalizeKind(fields[3]!), 'web');
  const out = proposeNormalization(fields, { firstname: 'Ana', email: 'ANA@acme.es', phone: '600 123 123', domain: 'https://acme.es', hs_id: ' 1 ', amount: 5 });
  assert.deepEqual(out.map(item => [item.key, item.after]), [['email', 'ana@acme.es'], ['phone', '+34 600 123 123'], ['domain', 'acme.es']]);
});

test('importar: los ajustes se proponen siempre y solo se aplican si se piden', () => {
  const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
  const csv = 'Nombre;Correo;Teléfono\nAna  María;ANA.NUEVA@acme.es;600123123\nLuis;luis.nuevo@acme.es;+34 600 123 124\n';
  const plain = planImport(spec, 'contacts', csv, snapshot.records);
  assert.deepEqual(plain.adjustments.map(a => [a.line, a.field, a.after]), [[2, 'firstname', 'Ana María'], [2, 'phone', '+34 600 123 123']], 'el correo en mayúsculas ya se guardaba en minúsculas: no cuenta como ajuste');
  assert.equal(plain.normalized, false);
  assert.equal(plain.rows[0]!.values.phone, '600123123');
  const tidy = planImport(spec, 'contacts', csv, snapshot.records, undefined, { normalize: true });
  assert.equal(tidy.normalized, true);
  assert.deepEqual([tidy.rows[0]!.values.firstname, tidy.rows[0]!.values.phone, tidy.rows[0]!.values.email], ['Ana María', '+34 600 123 123', 'ana.nueva@acme.es']);
  assert.equal(tidy.rows[0]!.cells['Teléfono'], '600123123', 'la vista previa sigue enseñando lo que venía en el archivo');
});
