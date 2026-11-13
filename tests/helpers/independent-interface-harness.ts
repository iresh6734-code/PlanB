import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// QA073 · Arnés propio, solo para los bancos independent-interface-*. No reutiliza el de ningún otro autor.
// Qué ES: un reconciliador mínimo que ejecuta los componentes REALES de src/ con hooks genuinos (useState con setters funcionales,
// useRef, useEffect/useLayoutEffect con deps y cleanups en el orden de React, useMemo, useCallback, useId), expansión recursiva de
// componentes hijo, temporizadores virtuales y un `fetch` ficticio con respuestas diferidas que puede IGNORAR la señal de cancelación.
// Qué NO es: React DOM, un navegador, CSS, foco real, layout ni lector de pantalla. Un fallo adverso observado aquí puede ser del
// arnés: cada banco que lo usa debe reproducirlo o explicarlo, y los recorridos importantes se repiten en el navegador real (E2E).

export type HostNode = { tag: string; props: Record<string, any>; children: Child[] };
export type Child = HostNode | string;
type VNode = { type: any; props: Record<string, any>; key: any };
type Selector = { tag?: string; role?: string; label?: string; id?: string; type?: string; text?: RegExp | string; className?: RegExp | string; where?: (n: HostNode) => boolean };

const FRAGMENT = Symbol.for('qa073.fragment');
const jsx = (type: any, props: Record<string, any>, key?: any): VNode => ({ type, props: props ?? {}, key: key ?? props?.key ?? null });

// ───────────────────────── Transporte ficticio ─────────────────────────
export interface Call { method: string; path: string; body: any; signal: AbortSignal | null; settled: boolean; abortedAtCall: boolean; resolve(status: number, json: unknown): void; reject(error: Error): void }
export class Transport {
  calls: Call[] = [];
  /** true = como un navegador (rechaza al abortar); false (por defecto) = transporte que IGNORA la señal. */
  honorAbort = false;
  private auto: { match: RegExp; method?: string; answer: (call: Call) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }> | 'hold' }[] = [];
  fetch = (input: any, init: any = {}): Promise<Response> => {
    const url = String(input), pathOnly = url.replace(/^\/api/, '');
    let body: any = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    return new Promise<Response>((resolve, reject) => {
      const call: Call = {
        method: (init.method ?? 'GET').toUpperCase(), path: pathOnly, body, signal: init.signal ?? null, settled: false, abortedAtCall: !!init.signal?.aborted,
        resolve: (status, json) => { if (call.settled) return; call.settled = true; resolve(new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })); },
        reject: error => { if (call.settled) return; call.settled = true; reject(error); },
      };
      this.calls.push(call);
      if (this.honorAbort && init.signal) init.signal.addEventListener('abort', () => call.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      const rule = this.auto.find(r => r.match.test(pathOnly) && (!r.method || r.method === call.method));
      if (rule) Promise.resolve(rule.answer(call)).then(out => { if (out !== 'hold') call.resolve(out.status ?? 200, out.json); });
    });
  };
  /** Responde automáticamente a las rutas que coinciden; devolver 'hold' deja la llamada abierta para liberarla a mano. */
  on(match: RegExp, answer: (call: Call) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }> | 'hold', method?: string) { this.auto.push({ match, method, answer }); return this; }
  where(match: RegExp, method?: string) { return this.calls.filter(c => match.test(c.path) && (!method || c.method === method)); }
  pending(match?: RegExp) { return this.calls.filter(c => !c.settled && (!match || match.test(c.path))); }
  posts() { return this.calls.filter(c => c.method !== 'GET'); }
}

// ───────────────────────── Cargador de módulos reales ─────────────────────────
export class Runtime {
  private cache = new Map<string, any>();
  readonly requireReal: ReturnType<typeof createRequire>;
  constructor(readonly root: string, private mocks: Record<string, any> = {}) { this.requireReal = createRequire(path.join(root, 'package.json')); }
  hooks!: Record<string, any>;
  private resolveFile(from: string, spec: string) {
    const base = path.resolve(path.dirname(from), spec.replace(/\.js$/, ''));
    return ['.tsx', '.ts'].map(ext => base + ext).find(file => fs.existsSync(file));
  }
  private req = (from: string) => (spec: string): any => {
    if (spec === 'react') return new Proxy({}, { get: (_t, name) => (this.hooks as any)[name] });
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: FRAGMENT };
    if (spec === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (spec.endsWith('.css')) return {};
    if (!spec.startsWith('.')) return this.requireReal(spec);
    const name = path.basename(spec).replace(/\.js$/, '');
    if (name in this.mocks) return this.mocks[name];
    const file = this.resolveFile(from, spec);
    if (!file) throw new Error('Dependencia no resuelta en el arnés: ' + spec + ' desde ' + from);
    if (this.cache.has(file)) return this.cache.get(file);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: file }).outputText;
    const mod = { exports: {} as any }; this.cache.set(file, mod.exports);
    new Function('require', 'exports', 'module', code)(this.req(file), mod.exports, mod); this.cache.set(file, mod.exports);
    return mod.exports;
  };
  load(relative: string) { const file = path.join(this.root, relative); return this.req(file)('./' + path.basename(file).replace(/\.tsx?$/, '')); }
}

// ───────────────────────── Reconciliador mínimo ─────────────────────────
interface Effect { run: () => void | (() => void); cleanup?: void | (() => void); deps?: unknown[] }
interface Instance { slots: any[]; cursor: number; queued: { index: number; run: () => void | (() => void); deps?: unknown[] }[]; mounted: boolean; dead: boolean; name: string }

export class View {
  root: Child[] = [];
  renders = 0; setAfterUnmount = 0; log: string[] = [];
  private instances = new Map<string, Instance>();
  private dirty = false; private flushing = false; private batching = 0; private scheduled = false; private unmounted = false; private idSeq = 0;
  private timers: { at: number; id: number; fn: () => void }[] = []; private clock = 0; private timerSeq = 0;
  private current: Instance | null = null;
  private hooks: Record<string, any>;
  private props: Record<string, any>;
  constructor(private rt: Runtime, private Component: any, props: Record<string, any>) {
    this.props = props;
    this.hooks = this.makeHooks();
    this.renderAll();
  }

  // ── hooks ──
  private makeHooks() {
    const slot = (): [any[], number] => { const inst = this.current!; return [inst.slots, inst.cursor++]; };
    const view = this;
    const effect = () => (run: () => void | (() => void), deps?: unknown[]) => {
      const inst = this.current!, [slots, i] = slot(); const prior: Effect | undefined = slots[i];
      if (!prior || !deps || deps.length !== prior.deps?.length || deps.some((d, n) => !Object.is(d, prior.deps![n]))) inst.queued.push({ index: i, run, deps });
    };
    return {
      useState: (init: any) => {
        const inst = this.current!, [slots, i] = slot();
        if (!(i in slots)) slots[i] = { value: typeof init === 'function' ? init() : init };
        const cell = slots[i];
        const set = (next: any) => {
          if (inst.dead || view.unmounted) { view.setAfterUnmount++; return; }
          const value = typeof next === 'function' ? next(cell.value) : next;
          if (Object.is(value, cell.value)) return; cell.value = value; view.schedule();
        };
        return [cell.value, set];
      },
      useRef: (init: any) => { const [slots, i] = slot(); return slots[i] ?? (slots[i] = { current: init }); },
      useId: () => { const [slots, i] = slot(); return slots[i] ?? (slots[i] = ':r' + view.idSeq++ + ':'); },
      useMemo: (fn: () => any, deps: unknown[]) => { const [slots, i] = slot(); const prior = slots[i]; if (prior && deps.length === prior.deps.length && deps.every((d, n) => Object.is(d, prior.deps[n]))) return prior.value; const value = fn(); slots[i] = { value, deps }; return value; },
      useCallback: (fn: any, deps: unknown[]) => { const [slots, i] = slot(); const prior = slots[i]; if (prior && deps.every((d, n) => Object.is(d, prior.deps[n]))) return prior.fn; slots[i] = { fn, deps }; return fn; },
      useEffect: effect(), useLayoutEffect: effect(),
    };
  }

  // ── render ──
  private flatten(node: any, path: string, out: Child[], visited: Set<string>) {
    if (node === null || node === undefined || typeof node === 'boolean') return;
    if (Array.isArray(node)) { node.forEach((n, i) => this.flatten(n, path + '[' + (n && typeof n === 'object' && n.key != null ? n.key : i) + ']', out, visited)); return; }
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    const v = node as VNode;
    if (v.type === FRAGMENT) { this.flatten(v.props.children, path, out, visited); return; }
    if (typeof v.type === 'string') {
      const { children, ...props } = v.props; const kids: Child[] = [];
      this.flatten(children, path + '/' + v.type, kids, visited);
      out.push({ tag: v.type, props, children: kids }); return;
    }
    if (typeof v.type === 'function') {
      const id = path + '/' + (v.type.name || 'C') + (v.key != null ? '#' + v.key : ''); visited.add(id);
      let inst = this.instances.get(id);
      if (!inst) { inst = { slots: [], cursor: 0, queued: [], mounted: false, dead: false, name: v.type.name }; this.instances.set(id, inst); }
      const previous = this.current; this.current = inst; inst.cursor = 0; inst.queued = [];
      const rendered = this.withClock(() => v.type(v.props));
      this.current = previous;
      const kids: Child[] = []; this.flatten(rendered, id, kids, visited); out.push(...kids);
      this.commitList.push(inst);
      return;
    }
    throw new Error('Nodo no soportado por el arnés: ' + String(v.type));
  }
  private commitList: Instance[] = [];
  private renderAll() {
    this.rt.hooks = this.hooks; this.renders++; this.commitList = [];
    const visited = new Set<string>(), out: Child[] = [];
    const rootId = '$';
    this.flatten({ type: this.Component, props: this.props, key: null }, rootId, out, visited);
    this.root = out;
    // desmontaje de instancias que ya no aparecen (cleanups de todos sus efectos)
    for (const [id, inst] of [...this.instances]) if (!visited.has(id)) {
      for (const slot of inst.slots) if (slot && typeof slot === 'object' && 'cleanup' in slot && typeof slot.cleanup === 'function') this.withClock(slot.cleanup);
      this.instances.delete(id); inst.mounted = false; inst.dead = true;
    }
    // commit: primero todos los cleanups de efectos cambiados, después los cuerpos (hijos antes que padres)
    const effects: { inst: Instance; index: number; run: () => void | (() => void); deps?: unknown[] }[] = [];
    for (const inst of this.commitList) for (const q of inst.queued) effects.push({ inst, ...q });
    for (const e of effects) { const prior: Effect | undefined = e.inst.slots[e.index]; if (prior && typeof prior.cleanup === 'function') this.withClock(prior.cleanup); }
    for (const e of effects) { e.inst.slots[e.index] = { deps: e.deps, cleanup: undefined } as Effect; const cleanup = this.withClock(e.run); (e.inst.slots[e.index] as Effect).cleanup = cleanup as any; }
    for (const inst of this.commitList) inst.mounted = true;
  }
  private schedule() {
    this.dirty = true;
    if (this.batching || this.flushing || this.scheduled) return;
    this.scheduled = true; queueMicrotask(() => { this.scheduled = false; this.flush(); });
  }
  flush() {
    if (this.flushing || this.unmounted) return;
    this.flushing = true;
    try { for (let n = 0; this.dirty; n++) { if (n > 60) throw new Error('Bucle de renderizado en el arnés'); this.dirty = false; this.renderAll(); } }
    finally { this.flushing = false; }
  }
  /** Ejecuta un manejador como un evento de React: los setters se agrupan y se pinta al terminar de forma síncrona. */
  fire(handler: ((e: any) => any) | undefined, event: any = {}): any {
    if (!handler) return undefined;
    this.batching++; let result: any;
    try { result = this.withClock(() => handler({ preventDefault() {}, stopPropagation() {}, persist() {}, ...event })); }
    finally { this.batching--; }
    if (!this.batching) this.flush();
    return result;
  }
  // ── tiempo virtual ──
  private withClock<T>(fn: () => T): T {
    const st = globalThis.setTimeout, ct = globalThis.clearTimeout;
    (globalThis as any).setTimeout = (cb: () => void, ms = 0) => { const id = ++this.timerSeq; this.timers.push({ at: this.clock + ms, id, fn: cb }); return id; };
    (globalThis as any).clearTimeout = (id: number) => { this.timers = this.timers.filter(t => t.id !== id); };
    try { return fn(); } finally { globalThis.setTimeout = st; globalThis.clearTimeout = ct; }
  }
  advance(ms: number) {
    const end = this.clock + ms;
    for (;;) {
      const due = this.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break; this.timers = this.timers.filter(t => t !== due); this.clock = due.at;
      this.batching++; try { this.withClock(due.fn); } finally { this.batching--; }
    }
    this.clock = end; this.flush();
  }
  /** Deja correr microtareas y E/S pendientes (respuestas diferidas) y repinta. */
  async settle(rounds = 4) { for (let i = 0; i < rounds; i++) { await new Promise<void>(r => setImmediate(r)); this.flush(); } }
  update(next: Record<string, any>) { this.props = { ...this.props, ...next }; this.dirty = false; this.renderAll(); this.flush(); }
  unmount() {
    if (this.unmounted) return;
    for (const inst of this.instances.values()) for (const slot of inst.slots) if (slot && typeof slot === 'object' && typeof slot.cleanup === 'function') this.withClock(slot.cleanup);
    this.unmounted = true; for (const inst of this.instances.values()) inst.dead = true; this.instances.clear(); this.root = [];
  }

  /** Valores de todos los useState vivos (para comprobar que un dato sensible ya no está en el estado del componente). */
  states(): unknown[] { const out: unknown[] = []; for (const inst of this.instances.values()) for (const slot of inst.slots) if (slot && typeof slot === 'object' && 'value' in slot && !('deps' in slot)) out.push(slot.value); return out; }

  // ── consulta ──
  private walk(nodes: Child[], visit: (n: HostNode) => void) { for (const n of nodes) if (typeof n !== 'string') { visit(n); this.walk(n.children, visit); } }
  textOf = (n: Child): string => typeof n === 'string' ? n : n.children.map(this.textOf).join('');
  all(sel: Selector = {}): HostNode[] {
    const out: HostNode[] = [];
    this.walk(this.root, n => {
      const p = n.props, text = this.textOf(n);
      const okText = (t: RegExp | string | undefined, value: string) => t === undefined || (typeof t === 'string' ? value === t : t.test(value));
      if ((!sel.tag || n.tag === sel.tag) && (!sel.role || p.role === sel.role) && (!sel.label || p['aria-label'] === sel.label) && (!sel.id || p.id === sel.id) && (!sel.type || p.type === sel.type)
        && okText(sel.text, text) && okText(sel.className, String(p.className ?? '')) && (!sel.where || sel.where(n))) out.push(n);
    });
    return out;
  }
  find(sel: Selector): HostNode { const hits = this.all(sel); if (hits.length !== 1) throw new Error('Se esperaba 1 elemento para ' + JSON.stringify({ ...sel, where: undefined, text: String(sel.text ?? '') }) + ' y hay ' + hits.length); return hits[0]; }
  maybe(sel: Selector): HostNode | null { return this.all(sel)[0] ?? null; }
  text(): string { return this.root.map(this.textOf).join(' ').replace(/\s+/g, ' ').trim(); }
  /** Un elemento está deshabilitado si él o un <fieldset> ancestro lo está (como en HTML). */
  disabled(target: HostNode): boolean {
    let found = false;
    const walk = (nodes: Child[], inherited: boolean): boolean => { for (const n of nodes) { if (typeof n === 'string') continue; const here = inherited || (n.tag === 'fieldset' && !!n.props.disabled); if (n === target) { found = here || !!n.props.disabled; return true; } if (walk(n.children, here)) return true; } return false; };
    walk(this.root, false); return found;
  }

  // ── interacción (respeta disabled como un navegador; las llamadas directas a handlers capturados no) ──
  click(target: HostNode) { if (this.disabled(target)) return false; this.fire(target.props.onClick, { target, currentTarget: target }); return true; }
  type(target: HostNode, value: string) { if (this.disabled(target) || target.props.readOnly) return false; this.fire(target.props.onChange, { target: { value, checked: false }, currentTarget: { value } }); return true; }
  check(target: HostNode, checked: boolean) { if (this.disabled(target)) return false; this.fire(target.props.onChange, { target: { value: '', checked }, currentTarget: { checked } }); return true; }
  submit(form: HostNode) { this.fire(form.props.onSubmit, { target: form, currentTarget: form }); }
}

export function setupGlobals() {
  const g = globalThis as any;
  const previous = { window: g.window, document: g.document };
  g.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  g.document = { activeElement: null, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  return () => { g.window = previous.window; g.document = previous.document; };
}
export function withTransport<T>(transport: Transport, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as any, previous = g.fetch; g.fetch = transport.fetch;
  return fn().finally(() => { g.fetch = previous; });
}
export const flushPromises = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise<void>(r => setImmediate(r)); };
