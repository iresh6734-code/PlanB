import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceSearchContext } from '../../shared/workspace-search.js';
import { HoyHarness, ficha, openTask, openToday } from './hoy-recuperable-harness';

const notesInNewCopy = 'Nota exclusiva de la nueva captura ficticia';

class Harness extends HoyHarness {
  override async prepare() {
    await super.prepare();
    const script = path.join(this.root, 'server.mts');
    const source = fs.readFileSync(script, 'utf8');
    const anchor = 'await app.listen(';
    if (source.split(anchor).length !== 2) throw new Error('El punto de extensión del arnés cambió.');
    const endpoint = `
      app.post('/__h/replace-same-copy-identity', () => {
        const replacement = structuredClone(store.snapshot);
        const record = replacement.records.find(row => row.entity === 'tasks' && row.id === 'task-2');
        record.values.notes = ${JSON.stringify(notesInNewCopy)};
        store.importSnapshot(replacement, true);
        gen(replacement);
        store.activate();
        return { ok: true };
      });
    `;
    fs.writeFileSync(script, source.replace(anchor, endpoint + anchor));
  }
}

const harness = new Harness();
const revisionPath = '/api/v7/task-revision/task-2';

test.setTimeout(120_000);
test.beforeAll(() => harness.prepare());
test.beforeEach(() => harness.reset());
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
  await harness.stop();
});

test('335 · Hoy conserva el borrador de un 409 sin combinar dos copias con la misma identidad visible', async ({ page }, info) => {
  await harness.start(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openToday(page, harness.origin);
  await openTask(page, 'task-2');
  const panel = ficha(page);
  const notes = panel.getByRole('textbox', { name: 'Notas' });
  const save = panel.getByRole('button', { name: 'Guardar cambios' });
  const draft = 'Borrador escrito en la copia anterior';
  await expect(notes).toHaveValue('Nota inicial');
  await notes.fill(draft);

  const readState = async () => {
    const response = await page.request.get(harness.origin + '/api/v2/state');
    expect(response.ok()).toBe(true);
    return await response.json() as {
      workspaceSearchContext: WorkspaceSearchContext;
      snapshot: { id: string; captureStartedAt?: string };
      generation: { generatedAt: string };
    };
  };
  const before = await readState();
  let replaced = false;
  await page.route('**' + revisionPath, async route => {
    if (route.request().method() === 'PATCH' && !replaced) {
      const result = await page.request.post(harness.origin + '/__h/replace-same-copy-identity');
      expect(result.ok()).toBe(true);
      replaced = true;
    }
    await route.fallback();
  });
  const reply = page.waitForResponse(response => response.url().endsWith(revisionPath) && response.request().method() === 'PATCH');
  await save.click();
  expect((await reply).status()).toBe(409);
  const after = await readState();
  const { contextRevision: oldPin, ...beforeIdentity } = before.workspaceSearchContext;
  const { contextRevision: newPin, ...afterIdentity } = after.workspaceSearchContext;
  expect(afterIdentity).toEqual(beforeIdentity);
  expect(after.snapshot.id).toBe(before.snapshot.id);
  expect(after.snapshot.captureStartedAt).toBe(before.snapshot.captureStartedAt);
  expect(after.generation.generatedAt).toBe(before.generation.generatedAt);
  expect(newPin).not.toBe(oldPin);
  expect(harness.counts()).toMatchObject({ conditionedPatches: 1, conflicts409: 1, legacyPatches: 0 });
  const current = await harness.state();
  expect(current.changes).toBe(0);
  expect(current.task2?.notes).toBe(notesInNewCopy);

  const rejected = panel.getByRole('region', { name: 'No se puede combinar esta tarea' });
  await expect(rejected.getByRole('heading', { name: 'No se puede combinar esta tarea' })).toBeFocused();
  await expect(rejected).toContainText(draft);
  await expect(rejected).not.toContainText(notesInNewCopy);
  await expect(rejected.getByRole('radio')).toHaveCount(0);
  await expect(rejected.getByRole('button', { name: 'Preparar el nuevo guardado' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('conflicto-cambio-copia.png') });
  await rejected.getByRole('button', { name: 'Volver al formulario' }).click();
  await expect(notes).toHaveValue(draft);
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(panel.locator('#ltf-banner')).toBeFocused();
  expect(harness.counts()).toMatchObject({ conditionedPatches: 1, conflicts409: 1, legacyPatches: 0 });
  expect((await harness.state()).changes).toBe(0);

  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Descartar y volver a Hoy' }).click();
  await openTask(page, 'task-2');
  await expect(notes).toHaveValue(notesInNewCopy);
  const deliberateEdit = 'Edición explícita de la nueva copia';
  await notes.fill(deliberateEdit);
  await save.click();
  await expect(panel.locator('#ltf-ack')).toContainText('Cambios guardados');
  expect(harness.counts()).toMatchObject({ conditionedPatches: 2, conflicts409: 1, legacyPatches: 0 });
  const application = await harness.assertApplied({
    taskId: 'task-2',
    expected: { notes: deliberateEdit },
    homonymId: 'task-3',
    homonymBefore: current.task3!,
  });
  expect(application.historyTotal).toBe(1);
  expect(errors).toEqual([]);
});
