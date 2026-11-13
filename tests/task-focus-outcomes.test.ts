import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createElement } from 'react';
import { registerHooks } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeFixture } from '../shared/fixtures.js';
import type { TaskContext } from '../shared/local-task-focus.js';
import type { SaveOutcome, Verification } from '../src/local-task-focus-client.js';
import { createTaskSaveOutcomes, type SaveStrategy, type SubmitInput } from '../src/task-save-outcome.js';

// Unidad U1-148. Pruebas Node de lo que la ficha PRESENTA a partir de operaciones REALES del gestor de 136 (estrategia falsa que devuelve cada
// resultado; la operación la produce el gestor, no una copia escrita a mano) y de los límites de esta unidad. El comportamiento en el DOM, contra el
// servidor real, está en tests/e2e/task-focus-outcomes.spec.ts. Un render de servidor no prueba foco, geometría ni interacción.

// La ficha importa su CSS (Vite lo resuelve en el navegador); en Node se sustituye por un módulo vacío SOLO para poder importar el componente.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { LocalTaskFocus, classifyUnapplied, verdictFromOperation } = await import('../src/LocalTaskFocus.js');

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = fs.readFileSync('src/LocalTaskFocus.tsx', 'utf8');

test('huella: U1 no toca las fuentes de 123 que reutiliza (solo LocalTaskFocus.tsx y su CSS) y fija el gestor de 136 tal como lo deja el contrato 170', () => {
  const pinned: Record<string, string> = {
    'shared/task-save-outcome.ts': 'df91db8cddf8b0b76c20ccb32c1533ee17385335992bf01b2fab7b26b3df3a5a',
    'src/task-save-outcome.ts': '05ef5e399331f0d2c68b205fb7a3c06cdbda7c1990d4c27a4b0cfb87f04f9582',
    'src/TaskSaveOutcomes.tsx': '8b9de460ecb74581ae093d67b378993fedf0d0e0286abb273425f5a1029ab3c8',
    'src/task-save-outcomes.css': '7f975c77e94759276466c44c0a229b78a54c5c6bc958a8a64c499088b748582c',
    'shared/local-task-focus.ts': 'e41df640594532587bc0fb90a28f1a538063c5bf2e598460ce892462777358d5',
    'src/local-task-focus-client.ts': '59dda342d954b659aebb750b63bc726d3c0b382142bea0ca9baf496e779ca501',
  };
  for (const [file, hash] of Object.entries(pinned)) assert.equal(sha(file), hash, file);
});

// ── Operaciones reales del gestor con una estrategia que devuelve un resultado fijo ──────────────────────────────────────────────────────
const context: TaskContext = { instanceId: 'i-1', snapshotId: 's-1', snapshotName: 'Copia', capturedAt: '2026-11-02T09:00:00Z', captureStartedAt: null, accountId: null, generatedAt: null, ready: true, isTestData: true } as unknown as TaskContext;
const snapshot = makeFixture('agency');
const baseline = snapshot.records.find(r => r.entity === 'tasks' && r.id === 'task-2')!;
const entity = { id: 'tasks', label: 'Tareas', singular: 'Tarea', displayField: 'subject', columns: ['subject'], fields: [{ key: 'notes', label: 'Notas', type: 'text', required: false, readOnly: false, options: [] }, { key: 'status', label: 'Estado', type: 'text', required: false, readOnly: false, options: [] }] } as unknown as SubmitInput['entity'];
const submitInput = (extra: Partial<SubmitInput> = {}): SubmitInput => ({ taskId: 'task-2', taskLabel: 'Llamar a Ana (task-2)', baseline, entity, patch: { notes: 'x' }, context, ...extra });
async function settle(outcome: SaveOutcome, dispatched: boolean, verification?: Verification) {
  const strategy: SaveStrategy = { save: async (_request, hooks) => { if (dispatched) hooks.onDispatch(); return outcome; }, verify: async () => verification ?? { kind: 'unknown' } };
  const manager = createTaskSaveOutcomes({ strategy });
  const submission = manager.submit(submitInput()); assert.equal(submission.kind, 'started');
  const op = await (submission as Extract<typeof submission, { kind: 'started' }>).done; await manager.whenIdle();
  return { manager, op };
}
const conflict = { key: 'notes', label: 'Notas', baseline: 'a', current: 'b' };

test('classifyUnapplied: cada resultado que NO se aplicó se presenta según lo que de verdad ocurrió (401, 404, 409, 422, previo)', async () => {
  const cases: [string, SaveOutcome, boolean, ReturnType<typeof classifyUnapplied>][] = [
    ['422 llegó', { kind: 'invalid', fields: { notes: 'demasiado largo' }, message: 'Datos no válidos' }, true, { kind: 'field-errors', fields: { notes: 'demasiado largo' }, message: 'Datos no válidos' }],
    ['409 llegó', { kind: 'rejected', status: 409, message: 'Espera a que termine la devolución revisada.' }, true, { kind: 'rejected', message: 'Espera a que termine la devolución revisada. (conflicto)' }],
    ['403 llegó', { kind: 'rejected', status: 403, message: 'No permitido' }, true, { kind: 'rejected', message: 'No permitido' }],
    ['404 tras enviar', { kind: 'missing' }, true, { kind: 'missing' }],
    ['404 antes de enviar', { kind: 'missing' }, false, { kind: 'missing' }],
    ['401 tras enviar', { kind: 'locked' }, true, { kind: 'locked' }],
    ['401 antes de enviar', { kind: 'locked' }, false, { kind: 'locked' }],
    ['conflicto previo', { kind: 'conflict', conflicts: [conflict], current: baseline }, false, { kind: 'conflict', message: 'Otra edición cambió: Notas.' }],
    ['copia cambiada', { kind: 'context-changed', message: 'La copia activa ya no es la que abriste.' }, false, { kind: 'context-changed', message: 'La copia activa ya no es la que abriste.' }],
    ['lectura previa caída', { kind: 'preflight-failed', message: 'No se pudo comprobar.' }, false, { kind: 'preflight-failed', message: 'No se pudo comprobar.' }],
  ];
  for (const [name, outcome, dispatched, expected] of cases) {
    const { op } = await settle(outcome, dispatched);
    assert.ok(op.status === 'rejected' || op.status === 'not_sent', name + ': ' + op.status);
    assert.equal(op.status, dispatched ? 'rejected' : 'not_sent', name);
    assert.deepEqual(classifyUnapplied(op), expected, name);
  }
});

test('classifyUnapplied no reclasifica lo que sí se aplicó, está en curso o es incierto', async () => {
  const saved = await settle({ kind: 'saved', record: { ...baseline, values: { ...baseline.values, notes: 'x' } } }, true);
  assert.equal(saved.op.status, 'confirmed'); assert.equal(classifyUnapplied(saved.op), null);
  const uncertain = await settle({ kind: 'uncertain', message: 'No llegó el acuse.' }, true);
  assert.equal(uncertain.op.status, 'uncertain'); assert.equal(classifyUnapplied(uncertain.op), null);
});

test('verdictFromOperation: sin evidencia o verificando = «comprobando»; con evidencia, el vocabulario de la vista; nunca inventa un acuse', async () => {
  const { manager, op } = await settle({ kind: 'uncertain', message: 'No llegó el acuse.' }, true);
  assert.equal(verdictFromOperation(op), 'checking');                                              // incierto, sin lectura todavía
  assert.equal(verdictFromOperation({ ...op, verifying: true }), 'checking');
  const cases: [Verification, unknown][] = [
    [{ kind: 'read', evidence: 'applied', record: baseline }, { kind: 'read', evidence: 'applied', record: baseline }],
    [{ kind: 'read', evidence: 'unchanged', record: baseline }, { kind: 'read', evidence: 'unchanged', record: baseline }],
    [{ kind: 'read', evidence: 'diverged', record: baseline }, { kind: 'read', evidence: 'diverged', record: baseline }],
    [{ kind: 'context-changed' }, { kind: 'context-changed' }], [{ kind: 'missing' }, { kind: 'missing' }], [{ kind: 'locked' }, { kind: 'locked' }], [{ kind: 'unknown' }, { kind: 'unknown' }],
  ];
  for (const [verification, expected] of cases) {
    const strategy: SaveStrategy = { save: async (_r, hooks) => { hooks.onDispatch(); return { kind: 'uncertain', message: 'x' }; }, verify: async () => verification };
    const m = createTaskSaveOutcomes({ strategy }); const sub = m.submit(submitInput()); assert.equal(sub.kind, 'started'); const done = await (sub as Extract<typeof sub, { kind: 'started' }>).done;
    await m.verify(done.attemptId); assert.deepEqual(verdictFromOperation(m.get(done.attemptId)!), expected, JSON.stringify(verification.kind));
  }
  void manager;
});

test('contrato de montaje: el gestor se pasa por una prop OPCIONAL, sin tocar el contrato común TaskFocusProps', () => {
  assert.match(source, /export interface LocalTaskFocusProps extends TaskFocusProps \{[\s\S]*?outcomes\?: TaskSaveOutcomes;/);
  assert.match(source, /import type \{ TaskSaveOutcomes \} from '\.\/task-save-outcome\.js'/);   // solo tipo: sin gestor, el módulo del gestor ni se carga desde la ficha
  assert.doesNotMatch(fs.readFileSync('shared/local-task-focus.ts', 'utf8'), /outcomes/);
});

test('la ficha NO duplica la lógica del gestor: la ruta con gestor no llama a saveTask, verifyAfterUncertain ni a onSaved; solo lee para presentar un conflicto', () => {
  const managed = source.slice(source.indexOf('// ── Con gestor'), source.indexOf('  async function save()'));
  assert.ok(managed.length > 500);
  assert.match(managed, /outcomes!\.submit\(/); assert.match(managed, /outcomes\.verify\(/);
  assert.doesNotMatch(managed, /saveTask\(|verifyAfterUncertain\(|\.onSaved\(|fetch\(|method: 'PATCH'/);
  assert.match(managed, /readTask\(taskId/);                                                        // única lectura propia: releer tras un conflicto previo (nada se envió)
  assert.equal([...source.matchAll(/\bsaveTask\(/g)].length, 1);                                    // la única llamada es la de la ruta sin gestor
  assert.equal([...source.matchAll(/\bverifyAfterUncertain\(/g)].length, 1);
  assert.match(source, /if \(outcomes\) \{ submitManaged\(base, entity, patch\); return; \}\r?\n/);   // la ruta con gestor sale ANTES de la de siempre
});

test('render de servidor: con y sin gestor la ficha arranca igual («Leyendo la tarea…») y el almacén vacío no rompe el render', () => {
  const manager = createTaskSaveOutcomes({ strategy: { save: async () => ({ kind: 'uncertain', message: 'x' }), verify: async () => ({ kind: 'unknown' }) } });
  const common = { taskId: 'task-2', onClose: () => undefined, onSaved: async () => undefined, onPrepare: () => undefined };
  const without = renderToStaticMarkup(createElement(LocalTaskFocus, common)), withManager = renderToStaticMarkup(createElement(LocalTaskFocus, { ...common, outcomes: manager }));
  for (const html of [without, withManager]) { assert.match(html, /Leyendo la tarea…/); assert.doesNotMatch(html, /Resultados de guardado|Guardando…/); }
});
