// CLAUDE-CSV-IMPORT · Lectura, propuesta de columnas, conversión y validación de un CSV antes de importarlo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertValue, normalizeDomain, parseCsv, planImport, suggestMapping } from '../shared/csv-import.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import type { Field } from '../shared/model.js';

const snapshot = makeFixture('agency'), spec = makeDemoSpec(snapshot);
const contacts = spec.entities.find(e => e.id === 'contacts')!;

test('lee CSV de Excel en español: punto y coma, comillas dobladas, saltos dentro de comillas, CRLF y BOM', () => {
  const { headers, rows, delimiter } = parseCsv('﻿Nombre;Notas;Correo\r\n"Ana ""la jefa""";"línea 1\nlínea 2";ana@x.es\r\n\r\nLuis;;luis@x.es\r\n');
  assert.equal(delimiter, ';');
  assert.deepEqual(headers, ['Nombre', 'Notas', 'Correo']);
  assert.deepEqual(rows, [['Ana "la jefa"', 'línea 1\nlínea 2', 'ana@x.es'], ['Luis', '', 'luis@x.es']]);
  assert.equal(parseCsv('a,b\n1,2').delimiter, ',');
  assert.equal(parseCsv('a\tb\n1\t2').delimiter, '\t');
});

test('propone columnas por nombre o clave sin mayúsculas ni tildes, una columna por campo', () => {
  const mapping = suggestMapping(['NOMBRE', 'Correo', 'correo', 'Teléfono', 'Empresa', 'Color favorito'], contacts.fields);
  assert.equal(mapping['NOMBRE'], 'firstname'); assert.equal(mapping['Correo'], 'email');
  assert.equal(mapping['correo'], null, 'el campo ya estaba asignado');
  assert.equal(mapping['Teléfono'], 'phone'); assert.equal(mapping['Empresa'], 'company_id'); assert.equal(mapping['Color favorito'], null);
});

test('convierte cada tipo al formato de la App', () => {
  const f = (type: Field['type'], extra: Partial<Field> = {}): Field => ({ key: 'k', label: 'K', type, required: false, readOnly: false, options: [], referenceEntity: null, ...extra });
  const none = () => [] as string[];
  assert.deepEqual(convertValue(f('number'), '1.234,56', none), { value: 1234.56 });
  assert.deepEqual(convertValue(f('number'), '1234.5', none), { value: 1234.5 });
  assert.ok('error' in convertValue(f('number'), 'mil', none));
  assert.deepEqual(convertValue(f('date'), '7/3/2026', none), { value: '2026-03-07' });
  assert.deepEqual(convertValue(f('date'), '2026-03-07', none), { value: '2026-03-07' });
  assert.ok('error' in convertValue(f('date'), '31/02/2026', none), 'una fecha inexistente se rechaza');
  assert.deepEqual(convertValue(f('datetime'), '07/03/2026 9:30', none), { value: '2026-03-07T09:30:00.000Z' });
  // R4 (revisión 431): formatos aceptados y valores imposibles rechazados sin normalizar.
  assert.deepEqual(convertValue(f('datetime'), '2026-03-07T23:59:30', none), { value: '2026-03-07T23:59:30.000Z' });
  assert.deepEqual(convertValue(f('datetime'), '07/03/2026', none), { value: '2026-03-07T00:00:00.000Z' });
  for (const bad of ['07/03/2026 24:00', '07/03/2026 9:60', '07/03/2026 99:00', '31/02/2026 10:00', '07/03/2026 9h30', 'mañana']) assert.ok('error' in convertValue(f('datetime'), bad, none), bad);
  assert.deepEqual(convertValue(f('boolean'), 'Sí', none), { value: true });
  const options = [{ id: 'web', label: 'Diseño web' }, { id: 'brand', label: 'Identidad de marca' }];
  assert.deepEqual(convertValue(f('enum', { options }), 'diseño WEB', none), { value: 'web' });
  assert.deepEqual(convertValue(f('multiselect', { options }), 'web; Identidad de marca', none), { value: 'web;brand' });
  assert.ok('error' in convertValue(f('enum', { options }), 'otra', none));
  assert.deepEqual(convertValue(f('text'), '   ', none), { value: null });
  const ref = f('reference', { referenceEntity: 'companies' });
  assert.deepEqual(convertValue(ref, 'Estudio Arce', () => ['company-1']), { value: 'company-1' });
  assert.match((convertValue(ref, 'Norte', () => ['a', 'b']) as { error: string }).error, /varios/);
  assert.match((convertValue(ref, 'Nadie', none) as { error: string }).error, /No existe/);
});

test('plan completo: valida como la ficha, resuelve empresas por nombre y rechaza correos repetidos', () => {
  const csv = [
    'Nombre;Apellidos;Correo;Teléfono;Empresa;Servicio contratado;Ignorada',
    'Nora;Gil;nora@ejemplo.es;600 111 222;Estudio Arce;Diseño web;x',
    'Pablo;Duplicado;pablo.garcia@example.com;;;;x',
    ';SinNombre;sin@ejemplo.es;;;;x',
    'Olga;Ruiz;olga@ejemplo.es;;Empresa Fantasma;;x',
    'Otra;Nora;NORA@ejemplo.es;;;;x',
  ].join('\n');
  const plan = planImport(spec, 'contacts', csv, snapshot.records);
  assert.deepEqual(plan.ignoredColumns, ['Ignorada']);
  assert.equal(plan.rows.length, 5); assert.equal(plan.valid, 1); assert.equal(plan.invalid, 4);
  const [nora, pablo, sinNombre, olga, otra] = plan.rows;
  assert.deepEqual(nora.errors, {}); assert.equal(nora.values.company_id, 'company-1'); assert.equal(nora.values.service, 'web'); assert.equal(nora.line, 2);
  assert.match(pablo.errors.email, /Ya existe/, 'el correo ya está en la copia');
  assert.ok(sinNombre.errors.firstname, 'campo obligatorio vacío');
  assert.match(olga.errors.company_id, /No existe/);
  assert.match(otra.errors.email, /Ya existe/, 'repetido dentro del archivo, sin distinguir mayúsculas');
});

test('posibles duplicados: empresa con el mismo nombre o dominio, en la copia o en el archivo; avisan sin bloquear', () => {
  const csv = ['Nombre;Sitio web', 'estudio arce;', 'Nueva;www.EMPRESA-2.example.com/contacto', 'Única;unica.es', 'ÚNICA SL;', 'Única;'].join('\n');
  const plan = planImport(spec, 'companies', csv, snapshot.records);
  assert.equal(plan.valid, 5, 'un aviso no es un error');
  assert.deepEqual(plan.warnings.map(w => w.line), [2, 3, 6]);
  assert.match(plan.warnings[0].text, /«Estudio Arce», ya en la copia/);
  assert.match(plan.warnings[1].text, /Norte Digital.*mismo dominio/);
  assert.match(plan.warnings[2].text, /de la línea 4/);
  assert.equal(normalizeDomain('https://www.Acme.es/contacto?x=1'), 'acme.es');
});

test('posibles duplicados de contactos por nombre y apellidos; nunca en oportunidades ni tareas', () => {
  const contactsPlan = planImport(spec, 'contacts', 'Nombre;Apellidos;Correo\nlucia;MARTÍN;otra@ejemplo.es\nLucía;Pérez;lp@ejemplo.es', snapshot.records);
  assert.deepEqual(contactsPlan.warnings.map(w => w.line), [2]);
  const deals = planImport(spec, 'deals', 'Nombre;Importe\nMisma;10\nMisma;20', snapshot.records, { Nombre: 'dealname', Importe: 'amount' });
  assert.deepEqual(deals.warnings, []);
});

test('un mapeo elegido a mano manda sobre el propuesto y no puede escribir campos de solo lectura', () => {
  const csv = 'Col A;Col B\nZoe;zoe@ejemplo.es';
  const plan = planImport(spec, 'contacts', csv, snapshot.records, { 'Col A': 'firstname', 'Col B': 'email' });
  assert.equal(plan.valid, 1); assert.deepEqual(plan.rows[0].values, { firstname: 'Zoe', email: 'zoe@ejemplo.es' });
  const readOnly = contacts.fields.find(f => f.readOnly);
  if (readOnly) assert.equal(planImport(spec, 'contacts', 'X\n1', snapshot.records, { X: readOnly.key }).ignoredColumns[0], 'X');
});
