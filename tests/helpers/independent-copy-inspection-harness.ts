// QA081 · independent harness for the copy-inspection audit. Written without reusing COPY074's helpers or oracles.
//
// What this module is and is not:
//  - Byte/hash oracles use node:crypto on the original Buffer. They never read a digest from the endpoint under test.
//  - History oracles are computed from an explicit operation script replayed in plain JavaScript, not from the
//    comparison engine (server/backup-coverage.ts) or from bundleRevision().
//  - The UI harness is a HOOK SIMULATOR (typescript transpile + a minimal useState/useRef/useEffect runtime + a tiny
//    tree expander). It is NOT ReactDOM: no reconciler, no browser events, no layout, no real focus. Anything that needs
//    those is covered only by the Playwright spec.
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createBaseApp} from '../../server/app.js';
import type {Store} from '../../server/store.js';
import {makeFixture, makeDemoSpec} from '../../shared/fixtures.js';
import type {CrmSnapshot} from '../../shared/model.js';
import {ApiError} from '../../src/api.js';
import {CopyReferenceSchema, CopyReviewSchema, MAX_COPY_REVIEW_BYTES} from '../../shared/copy-inspection.js';

export const UI_HARNESS_KIND = 'hook-simulator: typescript transpile + minimal useState/useRef/useEffect runtime + tree expander. NOT ReactDOM (no reconciler, no DOM events, no layout, no focus).';
export const REVIEW_URL = '/api/v7/copy-review/inspect';
export const CONTEXT_URL = '/api/v7/copy-review/context';
export const HEADERS = {host: '127.0.0.1:4471', origin: 'http://127.0.0.1:4471'};
export const MIB = 1024 * 1024;
export {MAX_COPY_REVIEW_BYTES, ApiError, CopyReferenceSchema, CopyReviewSchema};

// ---------- evidence (optional: only when the runner provides an attempt folder) ----------
export function attemptDir(): string | null { return process.env.PLANB_QA081_ATTEMPT ? path.resolve(process.env.PLANB_QA081_ATTEMPT) : null; }
/** Appends one JSON line. Never writes bytes or secrets: callers pass sizes, codes and hashes only. */
export function evidence(file: string, data: Record<string, unknown>) {
  const dir = attemptDir(); if (!dir) return;
  fs.mkdirSync(dir, {recursive: true});
  fs.appendFileSync(path.join(dir, file), JSON.stringify({at: new Date().toISOString(), ...data}) + '\n');
}

// ---------- byte oracles ----------
export const sha256 = (bytes: Buffer | Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
/** A secret that must never appear in any response. Unique per process; never logged. */
export const makeSecret = () => 'QA081-SECRET-' + randomUUID();
export function padTo(valid: Buffer, total: number, filler = 0x20): Buffer {
  if (total < valid.length) throw new Error('padTo: target smaller than content');
  const out = Buffer.alloc(total, filler); valid.copy(out, 0); return out;
}

// ---------- installs ----------
export async function inspectorModule(): Promise<typeof import('../../server/copy-inspection.js')> {
  const override = process.env.PLANB_QA081_SERVER_SRC;
  return await import(override ? pathToFileURL(path.resolve(override)).href : '../../server/copy-inspection.js');
}
export function activate(store: Store, snapshot: CrmSnapshot = makeFixture()) {
  store.importSnapshot(snapshot);
  store.saveGeneration(makeDemoSpec(snapshot), {provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false});
  store.activate();
}
export interface Install { app: Awaited<ReturnType<typeof createBaseApp>>['app']; store: Store; close(): Promise<void> }
export async function install(options: {active?: boolean; snapshot?: CrmSnapshot} = {}): Promise<Install> {
  const {registerCopyInspection} = await inspectorModule();
  const {app, store} = await createBaseApp({root: path.resolve('tests/.tmp/qa081-no-workers'), staticDir: path.resolve('tests/.tmp/qa081-no-assets'), dbPath: ':memory:'});
  registerCopyInspection(app, store);
  if (options.active !== false) activate(store, options.snapshot ?? makeFixture());
  return {app, store, close: () => app.close()};
}
export const getContext = async (i: Install) => (await i.app.inject({url: CONTEXT_URL, headers: HEADERS})).json() as ReturnType<typeof CopyReferenceSchema.parse>;
export interface Answer { status: number; text: string; json: any; raw: Buffer }
export async function review(i: Install, bytes: Buffer | string, o: {password?: unknown; revision?: string | null; omitRevision?: boolean; extra?: Record<string, unknown>; encoded?: unknown} = {}): Promise<Answer> {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  const revision = o.revision === undefined ? (await getContext(i)).revision : o.revision;
  const body: Record<string, unknown> = {encoded: o.encoded !== undefined ? o.encoded : buf.toString('base64')};
  if (o.password !== undefined) body.password = o.password;
  if (!o.omitRevision) body.referenceRevision = revision;
  Object.assign(body, o.extra ?? {});
  return post(i, JSON.stringify(body));
}
export async function post(i: Install, payload: string): Promise<Answer> {
  const r = await i.app.inject({method: 'POST', url: REVIEW_URL, headers: {...HEADERS, 'content-type': 'application/json'}, payload});
  let json: any = null; try { json = JSON.parse(r.body); } catch { /* non-JSON error body is reported as null */ }
  return {status: r.statusCode, text: r.body, json, raw: r.rawPayload};
}
/** Real product bytes: the plaintext export route (test data) or the encrypted export route. */
export async function exportPlain(i: Install): Promise<Buffer> {
  const r = await i.app.inject({url: '/api/export/bundle', headers: HEADERS}); if (r.statusCode !== 200) throw new Error('export failed ' + r.statusCode); return r.rawPayload;
}
export async function exportEncrypted(i: Install, password: string): Promise<Buffer> {
  const r = await i.app.inject({method: 'POST', url: '/api/v2/export/encrypted', headers: {...HEADERS, 'content-type': 'application/json'}, payload: JSON.stringify({password})});
  if (r.statusCode !== 200) throw new Error('encrypted export failed ' + r.statusCode); return r.rawPayload;
}

// ---------- persistence oracle ----------
/** Per-table digests of every table in the Store's database (meta, records, changes, archives, captures, ...). */
export function persistentDigests(store: Store): Record<string, string> {
  const tables = (store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name: string}[]).map(t => t.name);
  return Object.fromEntries(tables.map(t => [t, sha256(JSON.stringify(store.db.prepare('SELECT * FROM "' + t + '"').all()))]));
}

// ---------- history oracle (explicit script, expected values by plain replay) ----------
export type Op = {kind: 'edit'; entity: 'contacts' | 'companies' | 'deals' | 'tasks'; id: string; field: string; value: string} | {kind: 'create'; entity: 'contacts'; alias: string; values: Record<string, string>};
export interface Replay { records: Map<string, Record<string, unknown>>; ops: number }
/** Pure replay: starts from the initial record list and applies the first n ops. Aliases of created rows are 'new:<alias>'. */
export function replay(initial: {entity: string; id: string; values: Record<string, unknown>}[], ops: Op[], n = ops.length): Replay {
  const records = new Map<string, Record<string, unknown>>(initial.map(r => [r.entity + ':' + r.id, {...r.values}]));
  ops.slice(0, n).forEach(op => {
    if (op.kind === 'edit') { const key = op.entity + ':' + op.id; records.set(key, {...records.get(key)!, [op.field]: op.value}); }
    else records.set('new:' + op.alias, {...op.values});
  });
  return {records, ops: Math.min(n, ops.length)};
}
export function expectedDifference(older: Replay, newer: Replay) {
  const missing = [...newer.records.keys()].filter(k => !older.records.has(k)).length;
  const extra = [...older.records.keys()].filter(k => !newer.records.has(k)).length;
  const changed = [...newer.records].filter(([k, v]) => older.records.has(k) && JSON.stringify(Object.entries(v).sort()) !== JSON.stringify(Object.entries(older.records.get(k)!).sort())).length;
  return {missingRecordsInBackup: missing, extraRecordsInBackup: extra, changedRecords: changed, missingLocalChanges: newer.ops - older.ops};
}
/** Applies one op through the real Store API and returns the id of a created record. */
export function applyOp(store: Store, op: Op, ids: Map<string, string>) {
  if (op.kind === 'edit') store.saveRecord(op.entity, {[op.field]: op.value}, op.id);
  else ids.set(op.alias, store.saveRecord(op.entity, op.values).id);
}

// ---------- production-labelled fictional bundle (metadata only; never a real portal) ----------
export function makeProductionLike(store: Store, accountId = '81081') {
  const source = store.bundle();
  source.format = 'planb-continuity-v3'; source.snapshot.version = 3; source.spec.version = 3;
  Object.assign(source.snapshot.source, {kind: 'hubspot', accountId, isTestData: false, environment: 'production', accountType: 'STANDARD'});
  source.returnState!.accountId = accountId;
  store.restoreBundle(source);
}

// =====================================================================================
// UI hook simulator
// =====================================================================================
export function deferred<T = void>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
}
/** Bounded drain of macrotasks. Used instead of wall-clock sleeps; absence assertions rely on it plus causal mutants. */
export const drain = async (turns = 300) => { for (let i = 0; i < turns; i++) await new Promise<void>(r => setImmediate(r)); };
export async function waitFor(cond: () => boolean, label: string, turns = 4000) {
  for (let i = 0; i < turns; i++) { if (cond()) return; await new Promise<void>(r => setImmediate(r)); }
  throw new Error('waitFor exhausted: ' + label);
}

export interface Call { n: number; method: string; path: string; body: any; signal?: AbortSignal; settled: boolean; resolve(v: unknown): void; reject(e: unknown): void }
export class Transport {
  calls: Call[] = [];
  /** true = the transport delivers a late result even after abort (worst case for the view). */
  ignoreAbort = true;
  api = (url: string, init?: RequestInit) => new Promise<unknown>((resolve, reject) => {
    const call: Call = {n: this.calls.length, method: init?.method ?? 'GET', path: url, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal ?? undefined, settled: false,
      resolve: v => { call.settled = true; resolve(v); }, reject: e => { call.settled = true; reject(e); }};
    if (!this.ignoreAbort && init?.signal) init.signal.addEventListener('abort', () => { if (!call.settled) call.reject(Object.assign(new Error('Aborted'), {name: 'AbortError'})); });
    this.calls.push(call);
  });
  gets = () => this.calls.filter(c => c.method === 'GET');
  posts = () => this.calls.filter(c => c.method === 'POST');
}

/** A File-like whose arrayBuffer() is held by an explicit gate. */
export function gatedFile(bytes: Buffer, name = 'held.json') {
  const gate = deferred<void>(); let reads = 0;
  const file = {name, size: bytes.length, type: 'application/json', arrayBuffer: async () => { reads++; await gate.promise; return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }} as unknown as File;
  return {file, release: () => gate.resolve(), fail: (e: Error) => gate.reject(e), reads: () => reads};
}
export const plainFile = (bytes: Buffer | string, name = 'copy.json') => new File([typeof bytes === 'string' ? Buffer.from(bytes) : new Uint8Array(bytes)], name, {type: 'application/json'});

type Slot = any;
export interface Host { type: string; props: Record<string, any>; children: (Host | string)[] }
export interface Mounted {
  render(): void; transport: Transport; writes: {afterUnmount: boolean; component: string}[]; mark(): number; writesSince(m: number): number; unmounted(): boolean;
  host(): Host; text(): string; all(pred: (n: Host) => boolean): Host[]; field(labelStart: string): Host; button(name: string): Host; hasButton(name: string): boolean;
  choose(file: File | null): void; type(label: string, value: string): void; submit(): void; click(name: string): void; toggleDetails(open: boolean): void;
  setProps(next: Record<string, unknown>): void; unmount(): void; instances(): number;
}
/** Mounts `exportName` from a (possibly mutated) CopyInspection.tsx inside the hook simulator. */
export function mount(opts: {exportName: 'CopyInspection' | 'CopyInspectionPanel'; props: Record<string, unknown>; source?: string; transport?: Transport}): Mounted {
  const sourcePath = path.resolve(opts.source ?? process.env.PLANB_QA081_UI_SRC ?? 'src/CopyInspection.tsx');
  const transport = opts.transport ?? new Transport();
  const writes: Mounted['writes'] = [];
  let props = {...opts.props}, unmountedFlag = false, dirty = false;
  const instances = new Map<string, {slots: Slot[]; seen: boolean; name: string}>();
  let current: {slots: Slot[]; effects: {i: number; run: () => void | (() => void); deps?: unknown[]}[]; cursor: number; name: string} | null = null;
  const hooks = {
    useState(init: unknown) {
      const c = current!, i = c.cursor++;
      if (!(i in c.slots)) c.slots[i] = {value: typeof init === 'function' ? (init as () => unknown)() : init};
      const slot = c.slots[i], name = c.name;
      return [slot.value, (v: unknown) => { writes.push({afterUnmount: unmountedFlag, component: name}); slot.value = typeof v === 'function' ? (v as (p: unknown) => unknown)(slot.value) : v; dirty = true; }];
    },
    useRef(init: unknown) { const c = current!, i = c.cursor++; return c.slots[i] ?? (c.slots[i] = {current: init}); },
    useEffect(run: () => void | (() => void), deps?: unknown[]) {
      const c = current!, i = c.cursor++, old = c.slots[i];
      if (!old || !deps || !old.deps || deps.some((d, n) => !Object.is(d, old.deps[n]))) c.effects.push({i, run, deps});
    },
  };
  const Fragment = Symbol.for('qa081.fragment');
  const jsx = (type: unknown, p: Record<string, any>, key?: string) => ({type, props: p, key});
  const requireShim = (name: string): any => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment};
    if (name.endsWith('.css')) return {};
    if (name.endsWith('copy-inspection.js')) return {CopyReferenceSchema, CopyReviewSchema, MAX_COPY_REVIEW_BYTES};
    if (name.endsWith('api.js')) return {api: transport.api, ApiError};
    throw new Error('QA081 harness: unexpected import ' + name);
  };
  const code = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  const mod = {exports: {} as Record<string, any>};
  new Function('require', 'exports', 'module', code)(requireShim, mod.exports, mod);
  const Root = mod.exports[opts.exportName] as (p: any) => unknown;
  if (typeof Root !== 'function') throw new Error('export not found: ' + opts.exportName);

  const pendingCleanups: (() => void)[] = [], pendingEffects: (() => void)[] = [];
  const expand = (node: any, path: string): (Host | string)[] => {
    if (node === null || node === undefined || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap((n, i) => expand(n, path + '.' + (n?.key ?? i)));
    if (typeof node === 'string' || typeof node === 'number') return [String(node)];
    if (node.type === Fragment) return expand(node.props.children, path);
    if (typeof node.type === 'function') {
      const id = path + '/' + (node.type.name || 'anon');
      let inst = instances.get(id);
      if (!inst) { inst = {slots: [], seen: true, name: node.type.name || 'anon'}; instances.set(id, inst); }
      inst.seen = true;
      const ctx = {slots: inst.slots, effects: [] as { i: number; run: () => void | (() => void); deps?: unknown[] }[], cursor: 0, name: inst.name};
      current = ctx; const out = node.type(node.props); current = null;
      for (const e of ctx.effects) {
        pendingEffects.push(() => { const prev = inst!.slots[e.i]; if (prev?.cleanup) prev.cleanup(); inst!.slots[e.i] = {deps: e.deps, cleanup: e.run() || undefined}; });
        const prev = inst.slots[e.i]; if (prev?.cleanup) { pendingCleanups.push(prev.cleanup); prev.cleanup = undefined; }
      }
      return expand(out, id);
    }
    const {children, ...rest} = node.props ?? {};
    return [{type: node.type, props: rest, children: expand(children, path + '/' + node.type)}];
  };
  let tree: Host = {type: 'root', props: {}, children: []};
  const renderOnce = () => {
    instances.forEach(i => { i.seen = false; });
    pendingCleanups.length = 0; pendingEffects.length = 0; dirty = false;
    tree = {type: 'root', props: {}, children: expand(jsx(Root, props), 'root')};
    for (const [id, inst] of [...instances]) if (!inst.seen) { inst.slots.forEach(s => s?.cleanup?.()); instances.delete(id); }
    pendingCleanups.splice(0).forEach(c => c());
    pendingEffects.splice(0).forEach(run => run());
  };
  const render = () => { let guard = 0; do { renderOnce(); if (++guard > 50) throw new Error('render did not settle'); } while (dirty); };
  const walk = (n: Host | string): Host[] => typeof n === 'string' ? [] : [n, ...n.children.flatMap(walk)];
  const flat = (n: Host | string): string => typeof n === 'string' ? n : n.children.map(flat).join('');
  const all = (pred: (n: Host) => boolean) => walk(tree).filter(pred);
  const field = (start: string) => {
    const label = all(n => n.type === 'label').find(n => flat(n).startsWith(start)); if (!label) throw new Error('no field ' + start);
    return walk(label).find(n => n.type === 'input')!;
  };
  const button = (name: string) => { const b = all(n => n.type === 'button').find(n => flat(n) === name); if (!b) throw new Error('no button ' + name); return b; };
  const api: Mounted = {
    render, transport, writes, mark: () => writes.length, writesSince: m => writes.length - m, unmounted: () => unmountedFlag,
    host: () => tree, text: () => flat(tree), all, field, button, hasButton: name => all(n => n.type === 'button').some(n => flat(n) === name),
    choose: file => { field('Archivo JSON').props.onChange({target: {files: file ? [file] : []}}); render(); },
    type: (label, value) => { field(label).props.onChange({target: {value}}); render(); },
    submit: () => { all(n => n.type === 'form')[0].props.onSubmit({preventDefault() { /* simulated */ }}); },
    click: name => { button(name).props.onClick(); render(); },
    toggleDetails: open => { all(n => n.type === 'details')[0].props.onToggle({currentTarget: {open}}); render(); },
    setProps: next => { props = {...props, ...next}; render(); },
    unmount: () => { unmountedFlag = true; instances.forEach(i => i.slots.forEach(s => s?.cleanup?.())); instances.clear(); },
    instances: () => instances.size,
  };
  render();
  return api;
}
