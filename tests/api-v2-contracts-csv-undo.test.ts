// CLAUDE-API-CONTRACTS-R2 · E2: contratos de la importación CSV y de deshacer el último guardado.
// Comprueban códigos HTTP y forma de las respuestas con zod (esquemas de shared/), no huellas de archivos.
// App real (createBaseApp) con base en memoria y datos ficticios. La importación CSV se monta igual que en server/main.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createBaseApp } from '../server/app.js';
import { registerCsvImport } from '../server/csv-import.js';
import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { CSV_LIMITS } from '../shared/csv-import.js';
import { EntityNameSchema, RecordSchema } from '../shared/model.js';

type App = Awaited<ReturnType<typeof createBaseApp>>;

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const Value = RecordSchema.shape.values.valueType;
const ErrorSchema = z.object({ error: z.string().min(1), details: z.unknown().optional() }).strict();
const CodedError = (code: string) => z.object({ error: z.string().min(1), details: z.object({ code: z.literal(code) }).loose() }).strict();
const PreviewSchema = z.object({
  entity: EntityNameSchema, headers: z.array(z.string()), mapping: z.record(z.string(), z.string().nullable()),
  ignoredColumns: z.array(z.string()), total: z.number().int().nonnegative(), valid: z.number().int().nonnegative(), invalid: z.number().int().nonnegative(),
  preview: z.array(z.object({
    line: z.number().int().min(2), values: z.record(z.string(), Value), errors: z.record(z.string(), z.string()), cells: z.record(z.string(), z.string())
  }).strict()).max(50),
  errors: z.array(z.object({ line: z.number().int().min(2), errors: z.record(z.string(), z.string().min(1)) }).strict()),
  duplicates: z.number().int().nonnegative(), warnings: z.array(z.object({ line: z.number().int().min(2), text: z.string().min(1) }).strict()).max(200),
  // Super plan D1: ajustes de formato propuestos (siempre) y si se aplicaron (solo con «normalize: true»).
  adjusted: z.number().int().nonnegative(), normalized: z.boolean(),
  adjustments: z.array(z.object({ line: z.number().int().min(2), field: z.string().min(1), before: z.string(), after: z.string() }).strict()).max(50),
  token: Sha256
}).strict();
const ApplySchema = z.object({
  created: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), duplicatesSkipped: z.number().int().nonnegative(),
  failed: z.array(z.object({ line: z.number().int(), error: z.string() }).strict()), ids: z.array(z.string().min(1))
}).strict();
const ChangeIdentity = z.object({ id: z.number().int().positive(), at: z.iso.datetime(), copy: z.string().min(1).max(64) }).strict();
const SavedSchema = z.object({ record: RecordSchema, change: ChangeIdentity }).strict();
const UndoSchema = z.object({ undone: z.number().int().positive(), record: RecordSchema, change: ChangeIdentity }).strict();

async function app(t: test.TestContext, seed = true): Promise<App> {
  fs.mkdirSync(path.resolve('tests/.tmp'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('tests/.tmp/contract-r2-'));
  const created = await createBaseApp({ dbPath: ':memory:', root, staticDir: 'none' });
  registerCsvImport(created.app, created.store); // Como server/main.ts.
  t.after(async () => { await created.app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  if (seed) {
    const snapshot = makeFixture('agency');
    created.store.importSnapshot(snapshot);
    created.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: snapshot.capturedAt, prompt: '', approved: false });
    created.store.activate();
  }
  return created;
}

function parse<T>(schema: z.ZodType<T>, response: { statusCode: number; body: string }, status = 200): T {
  assert.equal(response.statusCode, status, response.body.slice(0, 300));
  const result = schema.safeParse(JSON.parse(response.body));
  assert.ok(result.success, 'contrato: ' + (result.success ? '' : JSON.stringify(result.error.issues.slice(0, 3))));
  return result.data;
}

const COMPANIES = 'Nombre,Sitio web,Teléfono,Columna desconocida\n'
  + 'Empresa Ficticia Uno,https://uno.example.com,900 100 001,x\n'
  + ',https://sin-nombre.example.com,900 100 002,y\n'
  + 'Empresa Ficticia Dos,https://dos.example.com,900 100 003,z\n';
const preview = (server: App['app'], payload: unknown) => server.inject({ method: 'POST', url: '/api/v2/import/csv/preview', payload: payload as object });
const apply = (server: App['app'], payload: unknown) => server.inject({ method: 'POST', url: '/api/v2/import/csv/apply', payload: payload as object });
const undo = (server: App['app'], payload: unknown) => server.inject({ method: 'POST', url: '/api/v2/changes/undo-last', payload: payload as object });

test('POST /api/v2/import/csv/preview: contrato cerrado, filas válidas e inválidas y sin escribir nada', async t => {
  const { app: server, store } = await app(t);
  const before = { records: store.records().length, changes: store.changesCount };
  const body = parse(PreviewSchema, await preview(server, { entity: 'companies', csv: COMPANIES }));
  assert.equal(body.entity, 'companies');
  assert.deepEqual(body.headers, ['Nombre', 'Sitio web', 'Teléfono', 'Columna desconocida']);
  assert.equal(body.total, 3);
  assert.equal(body.valid + body.invalid, body.total);
  assert.equal(body.invalid, 1, 'la fila sin nombre no es válida');
  assert.deepEqual(body.errors.map(row => row.line), [3]);
  assert.ok(body.ignoredColumns.includes('Columna desconocida'));
  assert.equal(body.mapping['Columna desconocida'] ?? null, null);
  assert.equal(body.preview[0].values.name, 'Empresa Ficticia Uno');
  assert.deepEqual({ records: store.records().length, changes: store.changesCount }, before, 'la vista previa no escribe');
  // Misma petición, misma marca; otro mapeo, otra marca.
  assert.equal(parse(PreviewSchema, await preview(server, { entity: 'companies', csv: COMPANIES })).token, body.token);
  const remapped = parse(PreviewSchema, await preview(server, { entity: 'companies', csv: COMPANIES, mapping: { ...body.mapping, 'Teléfono': null } }));
  assert.notEqual(remapped.token, body.token);
  assert.ok(remapped.ignoredColumns.includes('Teléfono'));
});

test('POST /api/v2/import/csv/preview: errores 409, 413 y 422 con el sobre de error', async t => {
  const { app: empty } = await app(t, false);
  parse(ErrorSchema, await preview(empty, { entity: 'companies', csv: COMPANIES }), 409);
  const { app: server } = await app(t);
  const rows = 'Nombre\n' + Array.from({ length: CSV_LIMITS.rows + 1 }, (_, i) => 'Empresa Ficticia ' + i).join('\n');
  parse(ErrorSchema, await preview(server, { entity: 'companies', csv: rows }), 413);
  for (const payload of [{}, { entity: 'companies', csv: '' }, { entity: 'notes', csv: COMPANIES }, { entity: 'companies', csv: COMPANIES, extra: 1 },
    { entity: 'companies', csv: COMPANIES, mapping: { Nombre: 3 } }, { entity: 'companies', csv: 'x'.repeat(CSV_LIMITS.bytes + 1) }])
    parse(ErrorSchema, await preview(server, payload), 422);
});

test('POST /api/v2/import/csv/apply: alta de las válidas con la marca; marca antigua o falsa rechazada', async t => {
  const { app: server, store } = await app(t);
  const reviewed = parse(PreviewSchema, await preview(server, { entity: 'companies', csv: COMPANIES }));
  const before = store.records('companies').length;
  const result = parse(ApplySchema, await apply(server, { entity: 'companies', csv: COMPANIES, token: reviewed.token }));
  assert.equal(result.created, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.failed, []);
  assert.equal(store.records('companies').length, before + 2);
  for (const id of result.ids) assert.ok(store.record('companies', id), 'alta guardada ' + id);
  // La copia cambió: la misma marca ya no vale.
  parse(CodedError('STALE_PREVIEW'), await apply(server, { entity: 'companies', csv: COMPANIES, token: reviewed.token }), 409);
  parse(CodedError('STALE_PREVIEW'), await apply(server, { entity: 'companies', csv: COMPANIES, token: 'f'.repeat(64) }), 409);
  for (const payload of [{ entity: 'companies', csv: COMPANIES }, { entity: 'companies', csv: COMPANIES, token: 'corta' }])
    parse(ErrorSchema, await apply(server, payload), 422);
});

test('POST /api/v2/changes/undo-last: deshace exactamente el último guardado y no crea un segundo inverso', async t => {
  const { app: server, store } = await app(t);
  const original = store.record('contacts', 'contact-1')!;
  const saved = parse(SavedSchema, await server.inject({ method: 'PATCH', url: '/api/records/contacts/contact-1', payload: { values: { phone: '655 000 001' } } }));
  const identity = { changeId: saved.change.id, at: saved.change.at, copy: saved.change.copy };
  const undone = parse(UndoSchema, await undo(server, identity));
  assert.equal(undone.undone, saved.change.id);
  assert.deepEqual(undone.record, store.record('contacts', 'contact-1'));
  assert.equal(undone.record.values.phone, original.values.phone);
  assert.ok(undone.change.id > saved.change.id);
  assert.equal(undone.change.copy, saved.change.copy);
  parse(CodedError('NOT_LATEST'), await undo(server, identity), 409);

  // Un campo que la edición añadió (antes no existía) vuelve a quedar vacío.
  const created = parse(SavedSchema, await server.inject({ method: 'POST', url: '/api/records/contacts',
    payload: { values: { firstname: 'Cliente Ficticio', email: 'cliente.ficticio.undo@example.com' } } }));
  assert.equal(created.record.values.phone ?? null, null);
  const added = parse(SavedSchema, await server.inject({ method: 'PATCH', url: '/api/records/contacts/' + created.record.id, payload: { values: { phone: '655 000 009' } } }));
  const cleared = parse(UndoSchema, await undo(server, { changeId: added.change.id, at: added.change.at, copy: added.change.copy }));
  assert.equal(cleared.record.values.phone ?? null, null);
});

test('POST /api/v2/changes/undo-last: rechazos con su código (404, 409) y cuerpo inválido (422)', async t => {
  const { app: server, store } = await app(t);
  const copy = store.copyEpoch();
  parse(CodedError('NO_CHANGES'), await undo(server, { changeId: 1, at: '2026-11-18T10:00:00.000Z', copy }), 404);
  const created = parse(SavedSchema, await server.inject({ method: 'POST', url: '/api/records/companies', payload: { values: { name: 'Empresa Ficticia Alta' } } }));
  parse(CodedError('NOT_AN_UPDATE'), await undo(server, { changeId: created.change.id, at: created.change.at, copy: created.change.copy }), 409);
  const saved = parse(SavedSchema, await server.inject({ method: 'PATCH', url: '/api/records/contacts/contact-2', payload: { values: { phone: '655 000 002' } } }));
  const identity = { changeId: saved.change.id, at: saved.change.at, copy: saved.change.copy };
  parse(CodedError('OTHER_COPY'), await undo(server, { ...identity, copy: 'otra-copia' }), 409);
  // El registro cambia sin pasar por el historial: no se deshace a ciegas.
  const current = store.record('contacts', 'contact-2')!;
  store.insertRecord({ ...current, values: { ...current.values, phone: '699 999 999' } });
  parse(CodedError('RECORD_CHANGED'), await undo(server, identity), 409);
  for (const payload of [{}, { ...identity, changeId: 0 }, { ...identity, extra: true }, { ...identity, copy: '' }, { ...identity, at: 'x'.repeat(41) }])
    parse(ErrorSchema, await undo(server, payload), 422);
});
