import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageStatement, notCopiedLine } from '../src/app-shell/coverage.js';

const entity = (id: string, label: string, fields: number) => ({ id, label, fields: Array.from({ length: fields }, (_, i) => ({ key: 'f' + i })) });
const spec = (unsupported: string[], supported = ['Trabajo comercial sin conexión']) => ({
  entities: [entity('contacts', 'Clientes', 6), entity('companies', 'Empresas', 3), entity('deals', 'Oportunidades', 7), entity('tasks', 'Tareas', 6)],
  coverage: { supported, unsupported },
}) as any;

test('cobertura: lo copiado sale de la especificación y de la captura; lo no copiado, de lo declarado', () => {
  const statement = coverageStatement(spec(['Campañas y envío de correos', 'Permisos multiusuario', 'Campo conservado como solo lectura: contacts.hs_score', 'Campo conservado como solo lectura: deals.hs_age', ' Permisos multiusuario ']), { contacts: 24, companies: 8, deals: 12, tasks: 18 });
  assert.deepEqual(statement.copied.map(item => [item.label, item.records, item.fields]), [['Clientes', 24, 6], ['Empresas', 8, 3], ['Oportunidades', 12, 7], ['Tareas', 18, 6]]);
  assert.deepEqual(statement.notCopied, ['Campañas y envío de correos', 'Permisos multiusuario'], 'sin duplicados ni la lista de campos de solo lectura');
  assert.equal(statement.readOnlyFields, 2);
  assert.deepEqual(statement.supported, ['Trabajo comercial sin conexión']);
});

test('cobertura: sin recuentos conocidos no se inventan cifras', () => {
  assert.deepEqual(coverageStatement(spec([]), null).copied.map(item => item.records), [null, null, null, null]);
});

test('línea de portada: enumeración en castellano y recorte con «y N más»; vacía si no hay nada declarado', () => {
  assert.equal(notCopiedLine(coverageStatement(spec(['Campañas y envío de correos']), null)), 'No se copia: campañas y envío de correos.');
  assert.equal(notCopiedLine(coverageStatement(spec(['A', 'B']), null)), 'No se copia: a y b.');
  assert.equal(notCopiedLine(coverageStatement(spec(['A', 'B', 'C', 'D', 'E', 'F']), null)), 'No se copia: a, b, c, d y 2 más.');
  assert.equal(notCopiedLine(coverageStatement(spec(['Campo conservado como solo lectura: contacts.x']), null)), '');
});
