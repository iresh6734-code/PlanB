import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppSpec, Change, CrmRecord } from '../shared/model.js';
import { buildReturnPackage, csvCell, pendingByRecord } from '../shared/return-package.js';

// Especificación mínima: clientes con nombre, correo, teléfono, nota de solo lectura y relación con empresa; empresas con nombre.
const spec = {
  entities: [
    { id: 'contacts', label: 'Clientes', singular: 'cliente', displayField: 'firstname', columns: ['firstname'], fields: [
      { key: 'firstname', label: 'Nombre', type: 'text', required: true, readOnly: false, options: [], referenceEntity: null },
      { key: 'email', label: 'Correo', type: 'email', required: false, readOnly: false, options: [], referenceEntity: null },
      { key: 'phone', label: 'Teléfono', type: 'text', required: false, readOnly: false, options: [], referenceEntity: null },
      { key: 'score', label: 'Puntuación', type: 'number', required: false, readOnly: true, options: [], referenceEntity: null },
      { key: 'company', label: 'Empresa', type: 'reference', required: false, readOnly: false, options: [], referenceEntity: 'companies' },
    ] },
    { id: 'companies', label: 'Empresas', singular: 'empresa', displayField: 'name', columns: ['name'], fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, readOnly: false, options: [], referenceEntity: null },
    ] },
  ],
} as unknown as AppSpec;
const rec = (entity: 'contacts' | 'companies', id: string, values: CrmRecord['values']): CrmRecord => ({ id, entity, values });
let seq = 0;
const change = (before: CrmRecord | null, after: CrmRecord): Change => ({ id: ++seq, at: '2026-11-21T10:00:00.000Z', entity: after.entity, recordId: after.id, operation: before ? 'update' : 'create', before, after });
const base = { spec, accountId: '149623339', captureId: 'cap-1:2026-11-21T09:00:00.000Z', revision: 'a'.repeat(64), generatedAt: '2026-11-21T12:00:00.000Z', mapping: {} as Record<string, string> };

test('actualizaciones: Record ID + solo los campos cambiados, varias ediciones del mismo registro en una fila, orden estable', () => {
  seq = 0;
  const ana0 = rec('contacts', '101', { firstname: 'Ana', email: 'ana@a.es', phone: '600' });
  const ana1 = rec('contacts', '101', { firstname: 'Ana', email: 'ana@nuevo.es', phone: '600' });
  const ana2 = rec('contacts', '101', { firstname: 'Ana', email: 'ana@nuevo.es', phone: '+34 600 000 001' });
  const bea0 = rec('contacts', '102', { firstname: 'Bea', email: 'b@a.es' }), bea1 = rec('contacts', '102', { firstname: 'Bea', email: 'bea@a.es' });
  const pkg = buildReturnPackage({ ...base, watermark: 0, changes: [change(ana0, ana1), change(bea0, bea1), change(ana1, ana2)] });
  assert.equal(pkg.files.length, 1);
  const file = pkg.files[0];
  assert.deepEqual([file.entity, file.kind, file.name, file.rows], ['contacts', 'update', 'plan-b-vuelta-contactos-actualizar.csv', 2]);
  assert.deepEqual(file.columns, ['Record ID', 'email', 'phone']);
  assert.equal(file.csv, 'Record ID,email,phone\r\n101,ana@nuevo.es,+34 600 000 001\r\n102,bea@a.es,\r\n', 'el teléfono con prefijo internacional no se toca');
  assert.deepEqual([pkg.identity.fromChange, pkg.identity.toChange, pkg.identity.remoteChecked], [1, 3, false]);
  assert.match(pkg.summary.join(' '), /Sin leer HubSpot: no se han podido detectar conflictos/);
});

test('la marca de devolución deja fuera lo ya devuelto y la identidad viaja congelada', () => {
  seq = 0;
  const c0 = rec('companies', '7', { name: 'Arce' }), c1 = rec('companies', '7', { name: 'Arce SL' }), c2 = rec('companies', '7', { name: 'Arce SLU' });
  const changes = [change(c0, c1), change(c1, c2)];
  assert.equal(pendingByRecord(changes, 1).get('companies:7')!.before!.values.name, 'Arce SL', 'el «antes» es el del primer cambio pendiente');
  const pkg = buildReturnPackage({ ...base, watermark: 1, changes });
  assert.equal(pkg.files[0].csv, 'Record ID,name\r\n7,Arce SLU\r\n');
  assert.deepEqual(pkg.identity, { accountId: '149623339', captureId: base.captureId, revision: base.revision, fromChange: 2, toChange: 2, generatedAt: base.generatedAt, remoteChecked: false });
  assert.deepEqual(buildReturnPackage({ ...base, watermark: 2, changes }).files, [], 'nada pendiente, nada que importar');
});

test('con lo leído de HubSpot: conflicto fuera con sus tres valores, lo ya igual no se importa y lo ausente no se recrea', () => {
  seq = 0;
  const a0 = rec('contacts', '201', { firstname: 'Ana', email: 'a@x.es', phone: '1' }), a1 = rec('contacts', '201', { firstname: 'Ana', email: 'a@y.es', phone: '2' });
  const b0 = rec('contacts', '202', { firstname: 'Bea', email: 'b@x.es' }), b1 = rec('contacts', '202', { firstname: 'Bea', email: 'b@y.es' });
  const c0 = rec('contacts', '203', { firstname: 'Ciro' }), c1 = rec('contacts', '203', { firstname: 'Ciro A.' });
  const remote = new Map<string, CrmRecord | null>([
    ['contacts:201', rec('contacts', '201', { firstname: 'Ana', email: 'a@hubspot.es', phone: '1' })], // correo cambió también allí; teléfono no
    ['contacts:202', rec('contacts', '202', { firstname: 'Bea', email: 'b@y.es' })], // ya igual
    ['contacts:203', null], // archivada
  ]);
  const pkg = buildReturnPackage({ ...base, watermark: 0, remote, changes: [change(a0, a1), change(b0, b1), change(c0, c1)] });
  assert.equal(pkg.files.length, 1);
  assert.equal(pkg.files[0].csv, 'Record ID,phone\r\n201,2\r\n', 'solo el teléfono de Ana, sin el correo en conflicto');
  const conflict = pkg.skipped.find(item => item.reason === 'conflict')!;
  assert.deepEqual([conflict.localId, conflict.field, conflict.values], ['201', 'email', { base: 'a@x.es', local: 'a@y.es', remote: 'a@hubspot.es' }]);
  assert.equal(pkg.alreadyThere, 1);
  assert.ok(pkg.skipped.some(item => item.localId === '202' && item.reason === 'no-fields'));
  assert.ok(pkg.skipped.some(item => item.localId === '203' && item.reason === 'missing-remote'));
  assert.equal(pkg.identity.remoteChecked, true);
  assert.match(pkg.summary.join(' '), /1 conflicto queda fuera: decide a mano/);
});

test('vaciar un campo, cambiar una relación o un ID remoto no numérico quedan fuera y explicados; solo lectura nunca se devuelve', () => {
  seq = 0;
  const a0 = rec('contacts', '301', { firstname: 'Ana', email: 'a@x.es', score: 1, company: '7' }), a1 = rec('contacts', '301', { firstname: 'Ana', email: '', score: 9, company: '8' });
  const b0 = rec('contacts', 'local-b', { firstname: 'Bea', phone: '1' }), b1 = rec('contacts', 'local-b', { firstname: 'Bea', phone: '2' });
  const pkg = buildReturnPackage({ ...base, watermark: 0, changes: [change(a0, a1), change(b0, b1)] });
  assert.deepEqual(pkg.files, []);
  const reasons = pkg.skipped.map(item => item.localId + ':' + (item.field ?? '-') + ':' + item.reason).sort();
  assert.deepEqual(reasons, ['301:company:relation', '301:email:clear', 'local-b:-:bad-id']);
  assert.ok(!pkg.skipped.some(item => item.field === 'score'), 'el campo de solo lectura no se ofrece ni como pendiente');
});

test('altas: archivo de creación sin Record ID, sin vacíos ni relaciones; una alta ya mapeada no se vuelve a crear', () => {
  seq = 0;
  const n = rec('contacts', 'local-1', { firstname: 'Nora', email: 'nora@x.es', phone: '', company: '7' });
  const m = rec('contacts', 'local-2', { firstname: 'Marta' });
  const pkg = buildReturnPackage({ ...base, watermark: 0, mapping: { 'contacts:local-2': '9001' }, changes: [change(null, n), change(null, m)] });
  assert.equal(pkg.files.length, 1);
  assert.deepEqual([pkg.files[0].kind, pkg.files[0].name], ['create', 'plan-b-vuelta-contactos-crear.csv']);
  assert.equal(pkg.files[0].csv, 'firstname,email\r\nNora,nora@x.es\r\n');
  assert.ok(pkg.skipped.some(item => item.localId === 'local-1' && item.reason === 'relation'));
  assert.ok(pkg.skipped.some(item => item.localId === 'local-2' && item.reason === 'already-created' && /9001/.test(item.detail)));
});

test('CSV: comillas, comas y saltos escapados; fórmulas con apóstrofo y listadas; números y teléfonos intactos', () => {
  assert.deepEqual(csvCell('Arce, "SL"'), { text: '"Arce, ""SL"""', guarded: false });
  assert.deepEqual(csvCell('línea 1\nlínea 2'), { text: '"línea 1\nlínea 2"', guarded: false });
  assert.deepEqual(csvCell(' espacio'), { text: '" espacio"', guarded: false });
  for (const risky of ['=HYPERLINK("http://x")', '@SUM(A1)', '-2+3+cmd|calc', '+A1', '\tfoo']) assert.equal(csvCell(risky).guarded, true, risky);
  for (const safe of ['+34 600 000 001', '+34 (600) 000-001', '-1200.5', '-', 'normal', 'a=b']) assert.equal(csvCell(safe).guarded, false, safe);
  assert.equal(csvCell(-3).text, '-3'); assert.equal(csvCell(true).text, 'true'); assert.equal(csvCell(null).text, '');
  seq = 0;
  const a0 = rec('companies', '5', { name: 'Uno' }), a1 = rec('companies', '5', { name: '=1+1' });
  const pkg = buildReturnPackage({ ...base, watermark: 0, changes: [change(a0, a1)] });
  assert.equal(pkg.files[0].csv, "Record ID,name\r\n5,'=1+1\r\n");
  assert.deepEqual(pkg.guarded, [{ entity: 'companies', localId: '5', field: 'name' }]);
  assert.match(pkg.summary.join(' '), /1 celda lleva un apóstrofo/);
});

test('importar no acredita nada: el resumen siempre manda a comprobar por relectura', () => {
  const pkg = buildReturnPackage({ ...base, watermark: 0, changes: [] });
  assert.deepEqual(pkg.files, []);
  assert.equal(pkg.summary[0], 'No hay nada que importar.');
  assert.match(pkg.summary.at(-1)!, /Importar no acredita nada: al terminar, comprueba la vuelta desde Cambios/);
});
