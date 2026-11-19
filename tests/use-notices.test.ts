import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function mountNotices() {
  const slots: any[] = [], pending: (() => void)[] = [];
  let cursor = 0;
  const hooks = {
    useState(init: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = init; return [slots[i], (value: unknown) => { slots[i] = typeof value === 'function' ? (value as (old: unknown) => unknown)(slots[i]) : value; }]; },
    useEffect(run: () => void | (() => void), deps: unknown[]) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); },
  };
  const mod = { exports: {} as any }, code = ts.transpileModule(fs.readFileSync('src/app-shell/useNotices.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'module', code)((name: string) => { if (name === 'react') return hooks; throw Error(name); }, mod.exports, mod);
  let current: ReturnType<typeof import('../src/app-shell/useNotices.js').useNotices>;
  const render = () => { cursor = 0; current = mod.exports.useNotices(); pending.splice(0).forEach(effect => effect()); return current; };
  render();
  return { render, get: () => current };
}

test('the notice closes by itself, lasts longer with «Deshacer» and restarts when it changes', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const view = mountNotices();
    view.get().setNotice('Guardado en tu copia local.'); view.render();
    mock.timers.tick(4999); view.render();
    assert.equal(view.get().notice, 'Guardado en tu copia local.');
    mock.timers.tick(1); view.render();
    assert.equal(view.get().notice, '');

    view.get().setUndoable({ changeId: 7, at: '2026-11-19T10:00:00Z', copy: 'c' }); view.get().setNotice('Guardado en tu copia local.'); view.render();
    mock.timers.tick(5000); view.render();
    assert.ok(view.get().undoable, '«Deshacer» sigue a mano pasados 5 s');
    view.get().setNotice('Otro aviso'); view.render();
    mock.timers.tick(7999); view.render();
    assert.equal(view.get().notice, 'Otro aviso', 'un aviso nuevo vuelve a contar desde cero');
    mock.timers.tick(1); view.render();
    assert.deepEqual([view.get().notice, view.get().undoable], ['', null], 'al cerrarse se pierde también el «Deshacer»');
  } finally { mock.timers.reset(); }
});
