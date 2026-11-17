// CLAUDE-RECORD-LIST · La lista de registros pide exactamente la misma página que antes de extraerla de App.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RECORD_PAGE_SIZE, recordListPath, searchDelay } from '../src/app-shell/useRecordList.js';

test('la consulta conserva el formato de la API y codifica búsqueda y embudo', () => {
  assert.equal(recordListPath('contacts', '', 0, ''), '/v2/records/contacts?q=&offset=0&limit=50&pipeline=');
  assert.equal(recordListPath('deals', 'Ana & Cía', 50, 'canal/b'), '/v2/records/deals?q=Ana%20%26%20C%C3%ADa&offset=50&limit=50&pipeline=canal%2Fb');
  assert.equal(RECORD_PAGE_SIZE, 50);
});

test('la búsqueda espera un poco mientras se escribe y nada sin texto', () => {
  assert.equal(searchDelay(''), 0);
  assert.equal(searchDelay('a'), 180);
});

test('App.tsx ya no lleva el estado ni la carga de la lista', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  for (const gone of ["useState<CrmRecord[]>([])", "setRecordsLoading(", "'/v2/records/'+entityName", 'setRows(']) assert.ok(!app.includes(gone), 'sin ' + gone);
  assert.ok(app.includes('useRecordListState()') && app.includes('useRecordListLoader(list'));
});
