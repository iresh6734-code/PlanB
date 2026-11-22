import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describeCapture } from '../../src/app-shell/workspace-copy.js';

export const authParentFixtureState = {
  snapshot: null,
  spec: null,
  generation: null,
  reconciliation: null,
  disconnected: false,
  runtime: true,
  ready: false,
  changes: 0,
  aiConfigured: false,
  hubspotConfigured: false,
  usage: { usedUsd: 0, reservedUsd: 0, limitUsd: 0, requests: 0 },
  lastError: null,
};

type Request = {
  path: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  settled: boolean;
};

// Ejecuta App real con hijos y hooks simulados. Cada petición se resuelve desde la prueba.
function mount(appFile: string) {
  const slots: any[] = [];
  const effects: (() => void)[] = [];
  const requests: Request[] = [];
  const listeners = new Map<string, Set<() => void>>();
  let cursor = 0;
  let tree: any;
  let dirty = true;

  function Protection() {}
  function Stub() { return null; }

  const hooks = {
    useState(init: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof init === 'function' ? init() : init;
      return [slots[index], (update: any) => {
        const next = typeof update === 'function' ? update(slots[index]) : update;
        if (!Object.is(next, slots[index])) {
          slots[index] = next;
          dirty = true;
        }
      }];
    },
    useRef(init: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: init };
      return slots[index];
    },
    useCallback(fn: any, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps.every((value, at) => Object.is(value, previous.deps[at]))) return previous.fn;
      slots[index] = { fn, deps };
      return fn;
    },
    useEffect(run: () => void | (() => void), deps?: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || deps.some((value, at) => !Object.is(value, previous.deps?.[at]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: run() };
        });
      }
    },
  };

  const jsx = (type: any, props: any, key?: string) => ({ type, props, key });
  const transport = (url: string) => new Promise<unknown>((resolve, reject) => {
    requests.push({ path: url, resolve, reject, settled: false });
  });
  const dispatch = (name: string) => listeners.get(name)?.forEach(fn => fn());

  (globalThis as any).window = {
    addEventListener(name: string, listener: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: () => void) => listeners.get(name)?.delete(listener),
    dispatchEvent: (event: { type: string }) => dispatch(event.type),
  };
  (globalThis as any).document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null };

  function realShellModule(file: string) {
    const shellModule = { exports: {} as any };
    const shellCode = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'exports', 'module', shellCode)(imports, shellModule.exports, shellModule);
    return shellModule.exports;
  }
  function imports(name: string) {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: Symbol.for('fragment') };
    if (name === 'lucide-react' || name.endsWith('.css')) return new Proxy({}, { get: () => Stub });
    if (name.endsWith('api.js')) return { api: transport, post: transport };
    if (name.endsWith('Protection.js')) return { Protection };
    if (name.endsWith('workspace-copy.js')) return { describeCapture };
    // Ganchos de app-shell cuyo resultado App desestructura o usa (lista de registros, continuidad T2, avisos T2, recientes F5):
    // los módulos reales, con los mismos React y transporte simulados de este arnés. Un Stub devolvería null y App fallaría
    // al montar, antes de llegar a lo que estas pruebas comprueban (el bloqueo y la autorización del padre).
    for (const shell of ['useRecordList', 'useContinuityState', 'useNotices', 'useRecordShortcuts', 'recents']) {
      if (name.endsWith('/' + shell + '.js')) return realShellModule('src/app-shell/' + shell + '.ts');
    }
    if (name.endsWith('version.js')) return { APP_VERSION: 'test' };
    if (name.endsWith('components.js')) {
      return new Proxy({}, { get: (_, key) => key === 'displayValue' || key === 'recordName' ? () => '' : Stub });
    }
    if (name.endsWith('.js')) return new Proxy({}, { get: () => Stub });
    throw new Error('Import inesperado: ' + name);
  }
  const mod = { exports: {} as any };
  const code = ts.transpileModule(fs.readFileSync(appFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', 'module', code)(imports, mod.exports, mod);

  async function flush() {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (dirty || effects.length) {
        cursor = 0;
        dirty = false;
        tree = mod.exports.default();
        effects.splice(0).forEach(run => run());
      }
      await new Promise<void>(resolve => setImmediate(resolve));
      if (!dirty && !effects.length) return;
    }
  }

  function take(url: string) {
    const request = requests.find(item => item.path === url && !item.settled);
    const observed = requests.map(item => item.path + (item.settled ? '✓' : '…')).join(', ');
    assert.ok(request, 'petición pendiente ' + url + ' (hay: ' + observed + ')');
    request.settled = true;
    return request;
  }

  return {
    flush,
    requests,
    signalLock: () => dispatch('planb:locked'),
    protection: () => tree?.type === Protection ? tree : null,
    openedApp: () => !!tree && tree.type !== Protection && tree.props?.className !== 'loading-page',
    respond: (url: string, value: unknown) => take(url).resolve(value),
    fail: (url: string, error: Error) => take(url).reject(error),
    fail401(url: string) {
      // Igual que el cliente: un 401 local avisa al padre antes de rechazar la lectura.
      const request = take(url);
      dispatch('planb:locked');
      request.reject(Object.assign(new Error('Desbloquea tu copia local para continuar.'), { status: 401 }));
    },
    count: (url: string) => requests.filter(item => item.path === url).length,
  };
}

export async function mountLockedAuthParent(appFile = path.resolve(process.env.PLANB_APP_SRC ?? 'src/App.tsx')) {
  const app = mount(appFile);
  await app.flush();
  app.respond('/v2/auth/status', { configured: true, authenticated: false });
  await app.flush();
  assert.ok(app.protection(), 'la copia arranca bloqueada y muestra Protection');
  return app;
}
