import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const moduleUrl = (file: string) => JSON.stringify(pathToFileURL(path.join(repo, file)).href);
const taskPath = '/api/v7/task-revision/task-2';
const intentPath = '/api/v7/task-intents/attempts';

test('329 · la ficha confirma un acuse compacto y vuelve a editar solo después de una lectura actual', async ({ page }, info) => {
  const root = info.outputPath('fixture');
  fs.mkdirSync(root, { recursive: true });
  const serverFile = path.join(root, 'server.mts');
  const entry = path.join(root, 'entry.tsx');
  const out = path.join(root, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="es"><meta charset="utf-8"><title>Ficha de ensayo</title><link rel="stylesheet" href="/entry.css"><div id="root"></div><script defer src="/entry.js"></script>');
  fs.writeFileSync(serverFile, `
    import { createBaseApp } from ${moduleUrl('server/app.ts')};
    import { registerTaskIntents } from ${moduleUrl('server/task-intents-api.ts')};
    import { writeTaskRevision } from ${moduleUrl('server/task-revision.ts')};
    import { makeDemoSpec, makeFixture } from ${moduleUrl('shared/fixtures.ts')};
    const { app, store } = await createBaseApp({ root: '.', dbPath: ':memory:', staticDir: ${JSON.stringify(out)}, taskRevisions: true });
    const at = '2026-11-10T10:00:00.000Z';
    const snapshot = makeFixture('agency');
    const tasks = snapshot.entities.find(entity => entity.id === 'tasks');
    const record = snapshot.records.find(row => row.entity === 'tasks' && row.id === 'task-2');
    const notes = tasks.fields.find(field => field.key === 'notes');
    for (let i = 0; i < 50; i++) {
      tasks.fields.push({ ...notes, key: 'large_' + i, label: 'Campo ficticio ' + i });
      record.values['large_' + i] = '漢'.repeat(4000);
    }
    store.importSnapshot(snapshot);
    store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: at, prompt: '', approved: false });
    store.activate();
    let writers = 0;
    registerTaskIntents(app, store, {
      now: () => at,
      writer: (...args) => { writers++; return writeTaskRevision(...args); }
    });
    app.post('/__fixture/replace-copy', () => {
      const replacement = structuredClone(snapshot);
      replacement.records.find(row => row.entity === 'tasks' && row.id === 'task-2').values.notes = 'Notas de otra copia ficticia';
      store.importSnapshot(replacement, true);
      store.saveGeneration(makeDemoSpec(replacement), { provider: 'demo', model: null, generatedAt: at, prompt: '', approved: false });
      store.activate();
      return { replaced: true };
    });
    app.get('/__fixture/effects', () => ({ writers, history: store.changesCount, notes: store.record('tasks', 'task-2').values.notes }));
    await app.listen({ host: '127.0.0.1', port: 0 });
    console.log('LISTEN ' + app.server.address().port);
  `);
  // The test strategy only maps the real compact server response. The product
  // strategy and App host have separate integration work.
  fs.writeFileSync(entry, `
    import { createRoot } from 'react-dom/client';
    import { LocalTaskFocus } from ${JSON.stringify(path.join(repo, 'src/LocalTaskFocus.tsx'))};
    import { createTaskSaveOutcomes } from ${JSON.stringify(path.join(repo, 'src/task-save-outcome.ts'))};
    import { TaskIntentExecution } from ${JSON.stringify(path.join(repo, 'shared/task-intents.ts'))};
    import ${JSON.stringify(path.join(repo, 'src/styles.css'))};
    const outcomes = createTaskSaveOutcomes({
      strategy: {
        async save(request, hooks) {
          const { instanceId, snapshotId, capturedAt, captureStartedAt, accountId, generatedAt, contextRevision } = request.context;
          hooks.onDispatch();
          const response = await fetch(${JSON.stringify(intentPath)}, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identity: { instanceId, snapshotId, capturedAt, captureStartedAt, accountId, generatedAt },
              contextRevision,
              attemptId: request.attemptId, taskId: request.taskId,
              expectedRevision: request.revision, values: request.patch
            }),
          });
          if (!response.ok) throw new Error('El servidor de prueba devolvió ' + response.status);
          const result = TaskIntentExecution.parse(await response.json());
          if (result.operation.provenance !== 'server-ack' || result.writeResult !== null || result.writeResultOmitted !== 'response-too-large') {
            throw new Error('La prueba exige un acuse compacto del servidor real');
          }
          return {
            kind: 'compact-ack',
            receipt: {
              source: 'server-ack', acknowledgement: result.operation.acknowledgement,
              replayed: result.replayed, writeResultOmitted: result.writeResultOmitted
            }
          };
        },
        async verify() { throw new Error('Un acuse no exige verificar'); }
      }
    });
    createRoot(document.getElementById('root')).render(<LocalTaskFocus
      taskId="task-2" revised outcomes={outcomes} onClose={() => {}} onPrepare={() => {}}
      onSaved={async () => { throw new Error('La ficha delega la recarga en el gestor'); }}
    />);
  `);
  await build({
    entryPoints: [entry], bundle: true, format: 'iife', jsx: 'automatic', outdir: out, logLevel: 'error',
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' },
  });
  const child = spawn(process.execPath, ['--require', path.join(repo, 'scripts/block-external.cjs'), '--import', 'tsx', serverFile], {
    cwd: repo, env: { ...process.env, NODE_ENV: 'test' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stopped = new Promise(resolve => child.once('close', resolve));
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    const origin = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No arrancó el servidor ficticio. ' + output)), 40_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', () => { clearTimeout(timer); reject(new Error('Terminó el servidor ficticio. ' + output)); });
      child.stdout.on('data', chunk => {
        const port = /LISTEN (\d+)/.exec(String(chunk))?.[1];
        if (port) { clearTimeout(timer); resolve('http://127.0.0.1:' + port); }
      });
    });
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== origin) await route.abort();
      else await route.fallback();
    });
    let readCount = 0;
    let currentRevision: string | undefined;
    await page.route('**' + taskPath, async route => {
      readCount++;
      if (readCount === 2) return route.fulfill({ status: 503, json: { error: 'Lectura ficticia no disponible' } });
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      currentRevision = (await response.json()).revision;
      await route.fulfill({ response });
    });
    const requests: { attemptId: string; expectedRevision: string }[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && request.url() === origin + intentPath) requests.push(request.postDataJSON());
    });
    await page.goto(origin);
    const dialog = page.getByRole('dialog');
    const field = dialog.locator('#ltf-f-notes');
    await expect(field).toBeVisible();
    await expect(dialog.getByText('Datos de prueba', { exact: true })).toBeVisible();
    const originalRevision = currentRevision;
    expect(originalRevision).toMatch(/^[a-f0-9]{64}$/);
    await field.fill('Guardado confirmado por el servidor ficticio');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    const confirmation = dialog.getByRole('heading', { name: /Guardado confirmado/ });
    await expect(confirmation).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    expect(requests).toHaveLength(1);
    const effects = async () => (await page.request.get(origin + '/__fixture/effects')).json();
    expect(await effects()).toEqual({ writers: 1, history: 1, notes: 'Guardado confirmado por el servidor ficticio' });

    const read = dialog.getByRole('button', { name: 'Leer tarea actual' });
    await read.click();
    await expect(dialog.getByRole('alert')).toContainText('El guardado sigue confirmado');
    await expect(confirmation).toBeVisible();
    expect(requests).toHaveLength(1);
    await read.click();
    await expect(field).toHaveValue('Guardado confirmado por el servidor ficticio');
    expect(readCount).toBe(3);
    expect(currentRevision).not.toBe(originalRevision);
    expect(requests).toHaveLength(1);

    await field.fill('Edición explícita tras volver a leer');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(confirmation).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.attemptId).not.toBe(requests[0]!.attemptId);
    expect(requests[1]!.expectedRevision).toBe(currentRevision);
    expect(await effects()).toEqual({ writers: 2, history: 2, notes: 'Edición explícita tras volver a leer' });
    await page.screenshot({ path: info.outputPath('acuse-compacto.png') });

    const state = async () => (await page.request.get(origin + '/api/v2/state')).json();
    const before = await state();
    expect((await page.request.post(origin + '/__fixture/replace-copy')).ok()).toBe(true);
    const after = await state();
    const { contextRevision: oldPin, ...identity } = before.workspaceSearchContext;
    const { contextRevision: newPin, ...sameIdentity } = after.workspaceSearchContext;
    expect(sameIdentity).toEqual(identity);
    expect(after.snapshot.captureStartedAt).toBe(before.snapshot.captureStartedAt);
    expect(after.generation.generatedAt).toBe(before.generation.generatedAt);
    expect(newPin).not.toBe(oldPin);
    await read.click();
    await expect(dialog.getByRole('alert')).toContainText('La copia activa cambió');
    await expect(confirmation).toBeVisible();
    await expect(field).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect((await effects()).writers).toBe(2);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await stopped;
  }
});
