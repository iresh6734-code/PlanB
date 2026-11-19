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

// R2 · Revisión 407 de Codex: un transporte que ignora la cancelación y entrega tarde no debe cambiar la lista.
import { loadRecordPage } from '../src/app-shell/useRecordList.js';
const sink = () => {
  const calls: string[] = [], errors: string[] = [];
  return { calls, errors, list: { setRows: () => calls.push('rows'), setRecords: () => calls.push('records'), setTotal: () => calls.push('total'), setError: () => calls.push('error'), setLoading: () => calls.push('loading') } as never, onError: (m: string) => errors.push(m) };
};
const late = <T>() => { let release!: (value: T) => void, fail!: (error: Error) => void; const promise = new Promise<T>((ok, ko) => { release = ok; fail = ko; }); return { promise, release, fail }; };
const page = (n: number) => ({ records: Array.from({ length: n }, (_, i) => ({ entity: 'contacts' as const, id: 'c' + i, values: {} })), related: [], total: n });

test('R2 · una respuesta correcta que llega después de cancelar su consulta no sustituye filas ni total', async () => {
  const s = sink(), held = late<ReturnType<typeof page>>(), controller = new AbortController();
  const done = loadRecordPage(() => held.promise, controller.signal, s.list, s.onError); // el transporte ignora la señal
  controller.abort(); held.release(page(24)); await done;
  assert.deepEqual(s.calls, [], 'nada se escribe'); assert.deepEqual(s.errors, []);
});

test('R2 · un 503 que llega después de cancelar no muestra error ni avisa al padre', async () => {
  const s = sink(), held = late<never>(), controller = new AbortController();
  const done = loadRecordPage(() => held.promise, controller.signal, s.list, s.onError);
  controller.abort(); held.fail(new Error('No se pudieron cargar los registros')); await done;
  assert.deepEqual(s.calls, []); assert.deepEqual(s.errors, []);
});

test('R2 · la consulta vigente sigue aplicando su resultado y su error', async () => {
  const ok = sink();
  await loadRecordPage(async () => page(2), new AbortController().signal, ok.list, ok.onError);
  assert.deepEqual(ok.calls, ['rows', 'records', 'total', 'loading']);
  const ko = sink();
  await loadRecordPage(async () => { throw new Error('Servicio no disponible'); }, new AbortController().signal, ko.list, ko.onError);
  assert.deepEqual(ko.calls, ['error', 'loading']); assert.deepEqual(ko.errors, ['Servicio no disponible']);
});
