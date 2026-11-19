import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createBaseApp } from '../server/app.js';
import { decodePortable } from '../server/crypto.js';
import { bundleRevision } from '../server/recovery-copy.js';
import { makeFixture, makeDemoSpec } from '../shared/fixtures.js';
import * as version from '../shared/version.js';
import type { ContinuityBundle } from '../shared/model.js';

// CLAUDE-QA-060 · B (exportación revisada y custodia honesta). Datos ficticios, en memoria; contraseñas ficticias.
// Parte 1: API real (Fastify.inject) con descifrado del archivo y oráculo independiente (el fixture original y la edición conocida).
// Parte 2: el componente real PortableExport con ranuras de hooks controladas (NO es React DOM ni navegador) y transporte ficticio con promesas diferidas
//          que IGNORAN la señal de cancelación, para que una respuesta tardía válida llegue de verdad.
// PLANB_UI_SRC permite apuntar a una copia de src/ (usada para la copia mutada que demuestra que las pruebas fallan por la causa correcta).

const headers = { host: '127.0.0.1:4393', origin: 'http://127.0.0.1:4393' };
const PASSWORD = 'qa060-contraseña-ficticia-12';
async function workspace() {
  const result = await createBaseApp({ root: path.resolve('tests/.tmp/qa060/no-workers'), staticDir: path.resolve('tests/.tmp/qa060/no-assets'), dbPath: ':memory:', runtime: true });
  const snapshot = makeFixture(), original = structuredClone(snapshot);   // oráculo: copia del snapshot importado (makeFixture() usa la hora actual)
  result.store.importSnapshot(snapshot);
  result.store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false });
  result.store.activate();
  return { ...result, original };
}
type W = Awaited<ReturnType<typeof workspace>>;
const get = (w: W, url: string) => w.app.inject({ url, headers });
const post = (w: W, url: string, payload: unknown) => w.app.inject({ method: 'POST', url, headers, payload: payload as never });
const summary = async (w: W) => (await get(w, '/api/v4/export-summary')).json() as { revision: string; captureId: string; records: number; changes: number };
const custody = async (w: W) => (await get(w, '/api/v2/continuity')).json().recoveryCopy as null | { current: boolean; revision?: string; confirmedAt?: string; previousConfirmedAt?: string };
const rows = (w: W, table: string) => JSON.stringify(w.store.db.prepare('SELECT * FROM ' + table).all());

// ---------------------------------------------------------------- B · API
test('B1 la descarga cifrada se descifra y coincide con un oráculo independiente: captura, registros, historial y revisión', async () => {
  const w = await workspace();
  try {
    w.store.saveRecord('contacts', { phone: 'solo-qa060-b1' }, 'contact-1');
    const s = await summary(w), response = await post(w, '/api/v2/export/encrypted', { password: PASSWORD, revision: s.revision });
    assert.equal(response.statusCode, 200); assert.match(String(response.headers['content-disposition']), /attachment; filename="plan-b-copia-cifrada\.json"/);
    const envelope = JSON.parse(response.body); assert.equal(envelope.format, 'planb-encrypted-v2'); assert.equal(JSON.stringify(envelope).includes('solo-qa060-b1'), false, 'el sobre no deja datos en claro');
    const bundle = decodePortable(response.body, PASSWORD) as ContinuityBundle;
    // Oráculo: el fixture original (no leído de la base) con la única edición conocida.
    const expectedRecords = w.original.records.map(r => r.id === 'contact-1' ? { ...r, values: { ...r.values, phone: 'solo-qa060-b1' } } : r);
    const sortKey = (r: { entity: string; id: string }) => r.entity + '|' + r.id;
    assert.deepEqual([...bundle.records].sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1), [...expectedRecords].sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1), 'valores idénticos al fixture + edición conocida');
    const change = bundle.changes[0], originalPhone = w.original.records.find(r => r.id === 'contact-1')!.values.phone;
    assert.equal(bundle.changes.length, 1); assert.equal(change.operation, 'update'); assert.equal(change.recordId, 'contact-1');
    assert.equal(change.before!.values.phone, originalPhone, 'el historial conserva el valor anterior del fixture'); assert.equal(change.after.values.phone, 'solo-qa060-b1');
    assert.equal(bundle.snapshot.id, w.original.id); assert.equal(bundle.snapshot.capturedAt, w.original.capturedAt); assert.equal(bundle.snapshot.source.isTestData, true);
    assert.equal(s.captureId, w.original.id + ':' + w.original.capturedAt); assert.equal(s.records, w.original.records.length); assert.equal(s.changes, 1);
    assert.equal(bundleRevision(bundle), s.revision, 'la revisión mostrada es la del contenido descargado');
  } finally { await w.app.close(); }
});

test('B2 contraseña errónea, archivo manipulado, truncado o de otro formato fallan sin tocar el origen', async () => {
  const w = await workspace();
  try {
    const s = await summary(w), file = (await post(w, '/api/v2/export/encrypted', { password: PASSWORD, revision: s.revision })).body, before = [rows(w, 'records'), rows(w, 'changes'), rows(w, 'meta')].join('|');
    assert.throws(() => decodePortable(file, 'otra-contraseña-ficticia'), /contraseña es incorrecta|dañado/);
    const envelope = JSON.parse(file), flip = (data: string) => data.slice(0, -4) + (data.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    assert.throws(() => decodePortable(JSON.stringify({ ...envelope, data: flip(envelope.data) }), PASSWORD), /dañado|incorrecta/, 'ciphertext alterado');
    assert.throws(() => decodePortable(JSON.stringify({ ...envelope, data: envelope.data.slice(0, 60) }), PASSWORD), /dañado|incorrecta|no válido/, 'truncado');
    assert.throws(() => decodePortable(JSON.stringify({ ...envelope, salt: Buffer.alloc(16, 1).toString('base64') }), PASSWORD), /dañado|incorrecta/, 'sal cambiada');
    assert.throws(() => decodePortable(JSON.stringify({ ...envelope, format: 'otro' }), PASSWORD), /compatible/);
    assert.equal([rows(w, 'records'), rows(w, 'changes'), rows(w, 'meta')].join('|'), before, 'intentos fallidos no modifican el origen');
  } finally { await w.app.close(); }
});

test('B3 una edición entre la revisión y la descarga da 409 y no registra custodia; sin revisión la API conserva su compatibilidad documentada', async () => {
  const w = await workspace();
  try {
    const s = await summary(w); w.store.saveRecord('contacts', { phone: 'cambiado-b3' }, 'contact-2');
    for (const kind of ['encrypted', 'package']) {
      const r = await post(w, '/api/v2/export/' + kind, { password: PASSWORD, revision: s.revision });
      assert.equal(r.statusCode, 409, kind); assert.match(r.json().error, /espacio cambió/);
    }
    assert.equal(await custody(w), null, 'un 409 no deja registrada ninguna exportación');
    const fresh = await summary(w); assert.notEqual(fresh.revision, s.revision); assert.equal(fresh.changes, 1);
    const compat = await post(w, '/api/v2/export/encrypted', { password: PASSWORD }); assert.equal(compat.statusCode, 200, 'llamada directa sin revisión: compatibilidad documentada');
    assert.equal(((decodePortable(compat.body, PASSWORD) as ContinuityBundle).records.find(r => r.id === 'contact-2')!.values.phone), 'cambiado-b3', 'incluye el contenido ACTUAL, no el revisado');
  } finally { await w.app.close(); }
});

test('B4 política de contraseña y forma de la petición: 11/201 caracteres, campos extra o ausentes se rechazan', async () => {
  const w = await workspace();
  try {
    const s = await summary(w);
    for (const payload of [{ password: 'x'.repeat(11), revision: s.revision }, { password: 'x'.repeat(201), revision: s.revision }, { revision: s.revision }, { password: PASSWORD, revision: s.revision, extra: 1 }, { password: PASSWORD, revision: 5 }])
      assert.equal((await post(w, '/api/v2/export/encrypted', payload)).statusCode, 422, JSON.stringify(payload).slice(0, 60));
    assert.equal((await post(w, '/api/v2/export/encrypted', { password: 'x'.repeat(12), revision: s.revision })).statusCode, 200, '12 caracteres es el mínimo admitido');
    assert.equal((await post(w, '/api/v2/export/encrypted', { password: 'x'.repeat(200), revision: s.revision })).statusCode, 200, '200 es el máximo');
  } finally { await w.app.close(); }
});

test('B5 exportar no modifica registros ni historial', async () => {
  const w = await workspace();
  try {
    w.store.saveRecord('deals', { dealname: 'Editado b5' }, 'deal-1');
    const before = [rows(w, 'records'), rows(w, 'changes')].join('|'), s = await summary(w);
    assert.equal((await post(w, '/api/v2/export/encrypted', { password: PASSWORD, revision: s.revision })).statusCode, 200);
    assert.equal([rows(w, 'records'), rows(w, 'changes')].join('|'), before);
  } finally { await w.app.close(); }
});

test('B6 custodia: ausente → exportada de esta revisión → declaración humana → una edición la deja como historia, no como prueba actual', async () => {
  const w = await workspace();
  try {
    assert.equal(await custody(w), null, 'ausente');
    const s1 = await summary(w); await post(w, '/api/v2/export/encrypted', { password: PASSWORD, revision: s1.revision });
    let c = await custody(w); assert.deepEqual([c!.current, c!.revision, c!.confirmedAt], [true, s1.revision, undefined], 'exportación registrada, sin declaración');
    assert.equal((await post(w, '/api/v3/recovery-copy/confirm', { storedSeparately: true, revision: 'f'.repeat(64) })).statusCode, 409, 'confirmar otra revisión');
    assert.equal((await post(w, '/api/v3/recovery-copy/confirm', { storedSeparately: false })).statusCode, 422, 'la declaración debe ser explícita');
    assert.equal((await post(w, '/api/v3/recovery-copy/confirm', { storedSeparately: true, revision: s1.revision })).statusCode, 200);
    c = await custody(w); assert.equal(c!.current, true); assert.ok(c!.confirmedAt, 'declaración vigente'); assert.equal(c!.previousConfirmedAt, undefined);
    w.store.saveRecord('contacts', { phone: 'tras-confirmar' }, 'contact-3');
    c = await custody(w); assert.equal(c!.current, false); assert.equal(c!.confirmedAt, undefined, 'tras editar, la confirmación ya no es vigente'); assert.ok(c!.previousConfirmedAt, 'pero se conserva como confirmación histórica');
    assert.equal((await post(w, '/api/v3/recovery-copy/confirm', { storedSeparately: true, revision: s1.revision })).statusCode, 409, 'no se puede confirmar una revisión que ya no es la actual');
    const s2 = await summary(w); await post(w, '/api/v2/export/encrypted', { password: PASSWORD, revision: s2.revision });
    c = await custody(w); assert.deepEqual([c!.current, c!.revision, c!.confirmedAt, c!.previousConfirmedAt], [true, s2.revision, undefined, undefined], 'nueva exportación: vigente, sin heredar la declaración anterior');
  } finally { await w.app.close(); }
});

// ---------------------------------------------------------------- B · componente (arnés de hooks, no DOM)
const SRC = process.env.PLANB_UI_SRC ? path.resolve(process.env.PLANB_UI_SRC) : fileURLToPath(new URL('../src/', import.meta.url));
const settle = async (times = 4) => { for (let i = 0; i < times; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
type VNode = { type: any; props: Record<string, any> };
function mountComponent(file: string, exportName: string, mocks: Record<string, any>, initial: Record<string, any> = {}) {
  const cache = new Map<string, any>(); let hooks: any;
  const resolveFile = (spec: string) => { const base = path.resolve(SRC, spec.replace(/\.js$/, '')); return ['.tsx', '.ts'].map(ext => base + ext).find(f => fs.existsSync(f)); };
  const jsx = (type: any, props: Record<string, any>) => ({ type, props });
  const requireFrom = (spec: string): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => (hooks as any)[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (spec === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (spec.endsWith('.css')) return {};
    const key = path.basename(spec).replace(/\.js$/, ''); if (key in mocks) return mocks[key];
    const f = resolveFile(spec); if (!f) throw new Error('Dependencia no resuelta: ' + spec); if (cache.has(f)) return cache.get(f);
    const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const mod: { exports: any } = { exports: {} }; cache.set(f, mod.exports); new Function('require', 'exports', 'module', code)(requireFrom, mod.exports, mod); cache.set(f, mod.exports); return mod.exports;
  };
  const slots: any[] = []; let cursor = 0, tree: any, effects: (() => void)[] = [], writes = 0;
  hooks = {
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], (v: any) => { writes++; slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); },
    useCallback(fn: any, deps: unknown[]) { const i = cursor++, prior = slots[i]; if (prior && deps.every((d, n) => Object.is(d, prior.deps[n]))) return prior.fn; slots[i] = { fn, deps }; return fn; },
    useEffect(run: () => void | (() => void), deps?: unknown[]) { const i = cursor++, prior = slots[i]; if (!prior || !deps || deps.some((d, n) => !Object.is(d, prior.deps?.[n]))) effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const Component = requireFrom('./' + file.replace(/\.tsx?$/, ''))[exportName];
  const render = () => { cursor = 0; tree = Component(initial); const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; };
  const walk = (node: any): VNode[] => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' && node.props ? [node, ...walk(node.props.children)] : [];
  const flat = (node: any): string => Array.isArray(node) ? node.map(flat).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? flat(node.props.children) : '';
  const nodes = () => walk(tree), text = (node?: any) => flat(node === undefined ? tree : node);
  const only = (label: string, found: VNode[]) => { assert.equal(found.length, 1, label + ': ' + found.length + ' coincidencias'); return found[0]; };
  return {
    render, nodes, text, writes: () => writes, unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
    button: (label: string) => only('botón ' + label, nodes().filter(n => n.type === 'button' && text(n) === label)),
    buttons: () => nodes().filter(n => n.type === 'button' && /Descargar aplicación|Solo copia cifrada/.test(text(n))),
    checkbox: () => nodes().filter(n => n.type === 'input' && n.props.type === 'checkbox'),
    passwords: () => nodes().filter(n => n.type === 'input' && n.props.type === 'password'),
    tag: (tag: string, role: string) => nodes().filter(n => n.type === tag && n.props.role === role).map(n => text(n)).join('|'),
    custody: () => text(only('custodia', nodes().filter(n => n.type === 'section' && n.props.className === 'export-custody'))),
  };
}
class FakeApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const deferred = <T = unknown>() => { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const sum = (revision: string, over: Record<string, unknown> = {}) => ({ revision, captureId: 'cap-' + revision.slice(0, 4), name: 'Espacio ' + revision.slice(0, 4), capturedAt: '2026-10-28T10:00:00Z', records: 62, changes: 1, differsFromLatest: false, ...over });
const R = (c: string) => c.repeat(64), A = R('a'), B = R('b');

function exportHarness() {
  const log: { path: string; init?: any }[] = [], downloads: { path: string; name: string; body: any }[] = [], events: string[] = [];
  const queues = new Map<string, (() => unknown)[]>(); let downloadImpl: (() => Promise<void>) | null = null;
  const on = (p: string, ...handlers: (() => unknown)[]) => queues.set(p, [...(queues.get(p) ?? []), ...handlers]);
  // El transporte IGNORA la señal de cancelación a propósito.
  const api = async (p: string, init?: unknown) => { log.push({ path: p, init }); const next = queues.get(p)?.shift(); if (!next) throw new Error('Sin respuesta preparada: ' + p); return next(); };
  const download = async (p: string, name: string, body: unknown) => { downloads.push({ path: p, name, body }); if (downloadImpl) return downloadImpl(); };
  (globalThis as any).window = { dispatchEvent: (event: { type: string }) => { events.push(event.type); return true; } };
  const h = mountComponent('PortableExport.tsx', 'PortableExport', { api: { api, ApiError: FakeApiError, download }, version, components: { Spinner: function Spinner() { return null; } } });
  return { h, log, downloads, events, on, setDownload: (fn: () => Promise<void>) => { downloadImpl = fn; }, count: (p: string) => log.filter(r => r.path === p).length };
}
const SUMMARY = '/v4/export-summary', CONTINUITY = '/v2/continuity';
async function ready(x: ReturnType<typeof exportHarness>, s = sum(A), saved: unknown = { recoveryCopy: null }) {
  x.on(SUMMARY, () => s); x.on(CONTINUITY, () => saved);
  x.h.render(); await settle(); x.h.render();
}
const review = (x: ReturnType<typeof exportHarness>, checked = true) => { x.h.checkbox()[0].props.onChange({ target: { checked } }); x.h.render(); };
const type = (x: ReturnType<typeof exportHarness>, password: string, confirm = password) => { x.h.passwords()[0].props.onChange({ target: { value: password } }); x.h.render(); x.h.passwords()[1].props.onChange({ target: { value: confirm } }); x.h.render(); };

test('B7 sin resumen válido (404 de servicio antiguo o 503) no se puede preparar descarga y el handler tampoco descarga', async () => {
  for (const failure of [new FakeApiError(404, 'no existe'), new FakeApiError(503, 'no disponible')]) {
    const x = exportHarness(); x.on(SUMMARY, () => { throw failure; }); x.on(CONTINUITY, () => ({ recoveryCopy: null }));
    x.h.render(); await settle(); x.h.render();
    assert.deepEqual(x.h.buttons().map(b => b.props.disabled), [true, true]); assert.equal(x.h.checkbox().length, 0, 'no hay casilla que revisar');
    assert.match(x.h.tag('p', 'alert'), failure.status === 404 ? /no permite revisar el contenido/ : /no disponible/);
    type(x, PASSWORD); for (const b of x.h.buttons()) await b.props.onClick(); x.h.render(); assert.equal(x.downloads.length, 0, 'ni siquiera forzando el handler');
    assert.match(x.h.tag('p', 'alert'), /Revisa el contenido de esta revisión/);
  }
});

test('B8 matriz de habilitación: revisión explícita + contraseñas coincidentes de 12 a 200; cambiar una contraseña tras revisar vuelve a bloquear', async () => {
  const x = exportHarness(); await ready(x);
  const enabled = () => x.h.buttons().map(b => !b.props.disabled);
  assert.deepEqual(enabled(), [false, false], 'sin revisar'); type(x, PASSWORD); assert.deepEqual(enabled(), [false, false], 'contraseñas válidas pero sin revisión');
  review(x); assert.deepEqual(enabled(), [true, true]);
  type(x, PASSWORD, PASSWORD + 'x'); assert.deepEqual(enabled(), [false, false], 'no coinciden'); type(x, 'x'.repeat(11)); assert.deepEqual(enabled(), [false, false], '11'); type(x, 'x'.repeat(201)); assert.deepEqual(enabled(), [false, false], '201');
  type(x, 'x'.repeat(12)); assert.deepEqual(enabled(), [true, true], '12'); type(x, 'x'.repeat(200)); assert.deepEqual(enabled(), [true, true], '200');
  for (const bad of [['x'.repeat(11), 'x'.repeat(11)], [PASSWORD, 'otra']] as const) { type(x, bad[0], bad[1]); await x.h.buttons()[1].props.onClick(); x.h.render(); assert.equal(x.downloads.length, 0); assert.match(x.h.tag('p', 'alert'), /entre 12 y 200 caracteres/); }
  review(x, false); type(x, PASSWORD); await x.h.buttons()[0].props.onClick(); x.h.render(); assert.equal(x.downloads.length, 0, 'sin revisión explícita el handler no descarga'); assert.match(x.h.tag('p', 'alert'), /Revisa el contenido de esta revisión/);
});

test('B9 descarga correcta: una sola petición con la revisión revisada, retira contraseñas y casilla, y no afirma custodia ni restauración', async () => {
  const x = exportHarness(); await ready(x); review(x); type(x, PASSWORD);
  const gate = deferred<void>(); x.setDownload(() => gate.promise);
  x.on(CONTINUITY, () => ({ recoveryCopy: { current: true, revision: A, exportedAt: 'x', captureId: 'c', records: 62, changes: 1, artifactHash: 'h' } }));
  const first = x.h.buttons()[1].props.onClick(), second = x.h.buttons()[1].props.onClick();   // doble activación antes del siguiente render
  await settle(); gate.resolve(); await first; await second; await settle(); x.h.render();
  assert.equal(x.downloads.length, 1, 'doble activación = una descarga'); assert.deepEqual(x.downloads[0], { path: '/v2/export/encrypted', name: 'plan-b-copia-cifrada.json', body: { password: PASSWORD, revision: A } });
  assert.deepEqual(x.h.passwords().map(p => p.props.value), ['', ''], 'contraseñas retiradas'); assert.equal(x.h.checkbox()[0].props.checked, false, 'casilla retirada');
  assert.match(x.h.tag('p', 'status'), /Copia cifrada preparado para descargar/); assert.match(x.h.tag('p', 'status'), /No se ha verificado una restauración/); assert.doesNotMatch(x.h.tag('p', 'status'), /guardad[oa] correctamente|restaurad[oa] con éxito/);
  assert.deepEqual(x.h.buttons().map(b => b.props.disabled), [true, true], 'otra descarga exige nueva revisión y contraseña');
  assert.match(x.h.custody(), /Consta una exportación de esta revisión\. Falta confirmar/, 'exportada, no confirmada');
  assert.equal(x.count(SUMMARY), 1, 'no se vuelve a pedir ni se descarga otra vez por su cuenta');
});

test('B10 409 al descargar: un único intento, se muestra el contenido actualizado y se exige una revisión nueva (sin descarga automática)', async () => {
  const x = exportHarness(); await ready(x, sum(A, { changes: 1 })); review(x); type(x, PASSWORD);
  x.setDownload(async () => { throw new FakeApiError(409, 'El espacio cambió. Revisa de nuevo el contenido de la exportación.'); });
  x.on(SUMMARY, () => sum(B, { changes: 2 })); x.on(CONTINUITY, () => ({ recoveryCopy: null }));
  await x.h.buttons()[1].props.onClick(); await settle(); x.h.render();
  assert.equal(x.downloads.length, 1, 'un único intento'); assert.match(x.h.tag('p', 'alert'), /El espacio cambió/);
  assert.match(x.h.text(), /2 cambios locales incluidos/, 'muestra el contenido actualizado'); assert.match(x.h.text(), new RegExp(B.slice(0, 12)));
  assert.equal(x.h.checkbox()[0].props.checked, false, 'la revisión anterior no vale'); assert.deepEqual(x.h.buttons().map(b => b.props.disabled), [true, true]);
  review(x); assert.deepEqual(x.h.buttons().map(b => b.props.disabled), [false, false], 'tras revisar la nueva revisión se puede preparar');
  assert.equal(x.downloads.length, 1, 'no hubo descarga automática de la revisión posterior');
});

test('B11 un 401 al descargar bloquea la pantalla sin mostrar un error propio ni recargar', async () => {
  const x = exportHarness(); await ready(x); review(x); type(x, PASSWORD);
  x.setDownload(async () => { throw new FakeApiError(401, 'La sesión caducó.'); });
  await x.h.buttons()[0].props.onClick(); await settle(); x.h.render();
  assert.deepEqual(x.events, ['planb:locked']); assert.equal(x.count(SUMMARY), 1, 'no recarga con la sesión caducada'); assert.equal(x.h.tag('p', 'alert'), '');
});

test('B12 custodia: los cinco estados se expresan con su propia frase y una confirmación histórica no se presenta como vigente', async () => {
  const copy = (over: Record<string, unknown>) => ({ recoveryCopy: { exportedAt: 'e', captureId: 'c', records: 1, changes: 0, artifactHash: 'h', ...over } });
  const states: [string, unknown, RegExp, RegExp][] = [
    ['ausente', { recoveryCopy: null }, /No consta una exportación de esta revisión/, /Confirmaste|Consta una exportación/],
    ['exportada sin declarar', copy({ current: true, revision: A }), /Consta una exportación de esta revisión\. Falta confirmar/, /Confirmaste/],
    ['declarada y vigente', copy({ current: true, revision: A, confirmedAt: '2026-10-29T10:00:00Z' }), /Confirmaste que guardaste esta revisión por separado.*declaración tuya; no demuestra/, /otra revisión/],
    ['otra revisión con historia', copy({ current: false, revision: B, previousConfirmedAt: '2026-10-29T10:00:00Z' }), /corresponde a otra revisión.*confirmación histórica, que no se presenta como vigente/, /Confirmaste que guardaste esta revisión/],
    ['vigente pero de otra revisión que la mostrada', copy({ current: true, revision: B, confirmedAt: '2026-10-29T10:00:00Z' }), /corresponde a otra revisión/, /Confirmaste que guardaste esta revisión/],
  ];
  for (const [name, saved, expected, forbidden] of states) { const x = exportHarness(); await ready(x, sum(A), saved); assert.match(x.h.custody(), expected, name); assert.doesNotMatch(x.h.custody(), forbidden, name + ' (no debe afirmar otra cosa)'); }
  const x = exportHarness(); x.on(SUMMARY, () => sum(A)); x.on(CONTINUITY, () => { throw new FakeApiError(503, 'x'); }); x.h.render(); await settle(); x.h.render();
  assert.match(x.h.custody(), /No se pudo consultar la custodia\. No se ha supuesto que exista una copia/, 'error de consulta ≠ ausente'); assert.doesNotMatch(x.h.custody(), /No consta una exportación/);
});

test('B13 respuesta tardía: tras cerrar la pantalla, un éxito o un error válidos que llegan después no escriben estado', async () => {
  for (const outcome of ['success', 'error'] as const) {
    const x = exportHarness(), late = deferred<unknown>(); x.on(SUMMARY, () => late.promise); x.on(CONTINUITY, () => ({ recoveryCopy: null }));
    x.h.render(); await settle(); const writes = x.h.writes(); x.h.unmount();
    outcome === 'success' ? late.resolve(sum(A)) : late.reject(new FakeApiError(503, 'tarde')); await settle(5);
    assert.equal(x.h.writes(), writes, outcome + ' tardío tras cerrar no escribe estado');
  }
});

test('B14 guarda defensiva: si dos lecturas se solapan, una respuesta válida tardía de la primera no repone contenido, casilla ni error de la segunda (transporte que ignora la cancelación)', async () => {
  // Los botones se deshabilitan durante la carga, así que esta secuencia no es alcanzable con la UI normal: se fuerza el handler para ejercitar la guarda de secuencia.
  const x = exportHarness(), first = deferred<unknown>(); x.on(SUMMARY, () => first.promise); x.on(CONTINUITY, () => ({ recoveryCopy: null }));
  x.h.render(); await settle(); x.h.render();
  assert.equal(x.h.button('Actualizar contenido').props.disabled, true, 'la UI normal no permite solapar lecturas');
  x.on(SUMMARY, () => sum(B)); x.on(CONTINUITY, () => ({ recoveryCopy: null }));
  x.h.button('Actualizar contenido').props.onClick(); await settle(); x.h.render();
  assert.match(x.h.text(), new RegExp(B.slice(0, 12)), 'muestra la segunda lectura'); review(x);
  first.resolve(sum(A, { name: 'Espacio ANTIGUO' })); await settle(); x.h.render();
  assert.doesNotMatch(x.h.text(), /ANTIGUO/, 'la respuesta tardía no repone contenido'); assert.match(x.h.text(), new RegExp(B.slice(0, 12))); assert.equal(x.h.checkbox()[0].props.checked, true, 'ni resetea la casilla de la segunda lectura');
  const third = deferred<unknown>(), fourth = deferred<unknown>();
  const y = exportHarness(); y.on(SUMMARY, () => third.promise); y.on(CONTINUITY, () => ({ recoveryCopy: null })); y.h.render(); await settle();
  y.on(SUMMARY, () => fourth.promise); y.on(CONTINUITY, () => ({ recoveryCopy: null })); y.h.button('Actualizar contenido').props.onClick(); await settle();
  fourth.resolve(sum(B)); await settle(); y.h.render(); third.reject(new FakeApiError(503, 'ERROR-ANTIGUO')); await settle(); y.h.render();
  assert.doesNotMatch(y.h.tag('p', 'alert'), /ERROR-ANTIGUO/, 'un error tardío de la primera lectura no sustituye a la segunda');
});
